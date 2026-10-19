// Creates a pending booking (a 30-minute hold on the slot) and a Stripe
// Embedded Checkout session for it. The price always comes from the database,
// never from the browser.
import { adminClient, corsHeaders, env, json, londonToUtc, SITE_URL, stripe } from "../_shared/otr.ts";

const HOLD_MINUTES = 31; // Stripe's minimum session expiry is 30 minutes
const MAX_ACTIVE_HOLDS = 12;
const MAX_HOLDS_PER_EMAIL = 2;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Lets the booking page know whether online payment is fully configured.
  if (req.method === "GET") return json({ ready: !!env("STRIPE_SECRET_KEY") && !!env("STRIPE_WEBHOOK_SECRET") });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const input = {
    service: str(body.service, 20),
    make: str(body.vehicle?.make, 60),
    model: str(body.vehicle?.model, 60),
    colour: str(body.vehicle?.colour, 40),
    size: str(body.vehicle?.size, 60),
    date: str(body.date, 10),
    time: str(body.time, 5),
    name: str(body.customer?.name, 100),
    phone: str(body.customer?.phone, 30),
    email: str(body.customer?.email, 200).toLowerCase(),
    address: str(body.customer?.address, 300),
    notes: str(body.notes, 1000),
  };

  const missing =
    !input.service || !input.make || !input.model || !input.colour || !input.name ||
    input.phone.replace(/\D/g, "").length < 9 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
    input.address.length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time);
  if (missing) return json({ error: "Some booking details are missing or invalid." }, 400);

  const db = adminClient();

  // Release this browser's previous hold, if it went back and changed its booking.
  if (body.previousHold?.id && body.previousHold?.token) {
    await db.from("bookings")
      .update({ status: "cancelled", hold_expires_at: null, hold_token: null })
      .eq("id", String(body.previousHold.id))
      .eq("hold_token", String(body.previousHold.token))
      .eq("status", "awaiting_payment");
  }

  const [{ data: service }, { data: settings }] = await Promise.all([
    db.from("services").select("*").eq("id", input.service).eq("active", true).maybeSingle(),
    db.from("business_settings").select("*").maybeSingle(),
  ]);
  if (!service) return json({ error: "That service isn't available." }, 400);
  if (!settings) return json({ error: "Booking is not configured yet." }, 500);

  // Slot rules: open day, listed time, enough notice, within the booking window.
  const [y, m, d] = input.date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const slotAt = londonToUtc(input.date, input.time);
  const now = Date.now();
  if (
    settings.closed_weekdays.includes(weekday) ||
    !settings.slot_times.includes(input.time) ||
    slotAt < now + settings.min_notice_hours * 3_600_000 ||
    slotAt > now + (settings.booking_window_days + 1) * 86_400_000
  ) {
    return json({ error: "That slot isn't available — please pick another time." }, 409);
  }

  // Lapsed payment holds on this slot no longer block it.
  await db.from("bookings")
    .update({ status: "cancelled", hold_expires_at: null, hold_token: null })
    .eq("slot_date", input.date).eq("slot_time", input.time)
    .eq("status", "awaiting_payment").lt("hold_expires_at", new Date().toISOString());

  // Basic abuse limits so nobody can hold every slot at once.
  const nowIso = new Date().toISOString();
  const [{ count: activeHolds }, { count: emailHolds }] = await Promise.all([
    db.from("bookings").select("id", { count: "exact", head: true })
      .eq("status", "awaiting_payment").gt("hold_expires_at", nowIso),
    db.from("bookings").select("id", { count: "exact", head: true })
      .eq("status", "awaiting_payment").gt("hold_expires_at", nowIso).eq("customer_email", input.email),
  ]);
  if ((activeHolds ?? 0) >= MAX_ACTIVE_HOLDS || (emailHolds ?? 0) >= MAX_HOLDS_PER_EMAIL) {
    return json({ error: "Too many unfinished bookings right now — please try again in a few minutes." }, 429);
  }

  const holdToken = crypto.randomUUID();
  const { data: booking, error: insertError } = await db.from("bookings").insert({
    service_id: service.id,
    service_name: service.name,
    price_pence: service.price_pence,
    vehicle_make: input.make,
    vehicle_model: input.model,
    vehicle_colour: input.colour,
    vehicle_size: input.size,
    slot_date: input.date,
    slot_time: input.time,
    customer_name: input.name,
    customer_phone: input.phone,
    customer_email: input.email,
    customer_address: input.address,
    notes: input.notes,
    status: "awaiting_payment",
    payment_status: "unpaid",
    hold_expires_at: new Date(now + HOLD_MINUTES * 60_000).toISOString(),
    hold_token: holdToken,
  }).select().single();

  if (insertError) {
    if (insertError.code === "23505") return json({ error: "Sorry — that slot was just taken. Please choose another time." }, 409);
    console.error(insertError);
    return json({ error: "Couldn't create your booking. Please try again." }, 500);
  }

  try {
    const session = await stripe("checkout/sessions", {
      mode: "payment",
      ui_mode: "embedded",
      return_url: `${SITE_URL}/booking.html?session_id={CHECKOUT_SESSION_ID}`,
      customer_email: input.email,
      client_reference_id: booking.id,
      expires_at: Math.floor(now / 1000) + 30 * 60 + 30,
      line_items: {
        0: {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: service.price_pence,
            product_data: {
              name: `${service.name} — OTR Detailing`,
              description: `${input.date} at ${input.time} · ${input.colour} ${input.make} ${input.model}`,
            },
          },
        },
      },
      metadata: { booking_id: booking.id, booking_ref: booking.ref },
      payment_intent_data: {
        description: `OTR Detailing ${booking.ref} — ${service.name}`,
        metadata: { booking_id: booking.id, booking_ref: booking.ref },
      },
    }, { idempotencyKey: `checkout-${booking.id}` });

    await db.from("bookings").update({ stripe_session_id: session.id }).eq("id", booking.id);

    return json({
      clientSecret: session.client_secret,
      ref: booking.ref,
      hold: { id: booking.id, token: holdToken },
    });
  } catch (err) {
    console.error(err);
    await db.from("bookings").update({ status: "cancelled", hold_expires_at: null, hold_token: null }).eq("id", booking.id);
    return json({ error: "Payment couldn't be started. Please try again shortly." }, 502);
  }
});
