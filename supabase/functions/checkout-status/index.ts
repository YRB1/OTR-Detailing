// Called by booking.html when Stripe returns the customer to the site.
// Reports the outcome and, if the webhook hasn't landed yet, confirms the
// booking from the session itself (safe to run twice).
import { adminClient, confirmFromSession, corsHeaders, json, stripe } from "../_shared/otr.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let sessionId = new URL(req.url).searchParams.get("session_id") ?? "";
  if (!sessionId && req.method === "POST") {
    try {
      sessionId = String((await req.json()).session_id ?? "");
    } catch { /* ignore */ }
  }
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return json({ error: "Invalid session." }, 400);

  const db = adminClient();
  let session: Record<string, any>;
  try {
    session = await stripe(`checkout/sessions/${sessionId}`, undefined, { method: "GET" });
  } catch {
    return json({ error: "Payment session not found." }, 404);
  }

  if (session.status === "complete") await confirmFromSession(db, session);

  const { data: b } = await db
    .from("bookings")
    .select("ref, status, payment_status, service_name, price_pence, slot_date, slot_time, vehicle_make, vehicle_model, vehicle_colour, customer_name")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  return json({
    sessionStatus: session.status, // open | complete | expired
    paymentStatus: session.payment_status,
    booking: b
      ? {
          ref: b.ref,
          status: b.status,
          paymentStatus: b.payment_status,
          service: b.service_name,
          price: b.price_pence / 100,
          date: b.slot_date,
          time: b.slot_time,
          vehicle: `${b.vehicle_colour} ${b.vehicle_make} ${b.vehicle_model}`,
          firstName: String(b.customer_name).split(" ")[0],
        }
      : null,
  });
});
