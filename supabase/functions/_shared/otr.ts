// Shared helpers for the OTR Detailing Edge Functions.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const env = (name: string, fallback = ""): string => Deno.env.get(name) ?? fallback;

export const SITE_URL = env("SITE_URL", "https://yrb1.github.io/OTR-Detailing").replace(/\/+$/, "");

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": env("ALLOWED_ORIGIN", "*"),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ---------- Stripe (REST, form-encoded) ---------- */

function flatten(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") flatten(value as Record<string, unknown>, name, out);
    else out.append(name, String(value));
  }
  return out;
}

export async function stripe(
  path: string,
  params?: Record<string, unknown>,
  opts: { method?: "GET" | "POST"; idempotencyKey?: string } = {},
): Promise<Record<string, any>> {
  const method = opts.method ?? (params ? "POST" : "GET");
  const headers: Record<string, string> = { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  let url = `https://api.stripe.com/v1/${path}`;
  let body: string | undefined;
  if (params && method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = flatten(params).toString();
  } else if (params) {
    url += `?${flatten(params).toString()}`;
  }
  const res = await fetch(url, { method, headers, body });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${data?.error?.message ?? res.status}`);
  return data;
}

/* ---------- UK time ---------- */

// Converts a wall-clock date + time in Europe/London to a UTC timestamp (ms).
export function londonToUtc(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetPart = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" })
    .formatToParts(new Date(guess))
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = offsetPart.match(/GMT([+-]\d+)?(?::(\d+))?/);
  const offsetMin = match && match[1] ? Number(match[1]) * 60 + Math.sign(Number(match[1])) * Number(match[2] ?? 0) : 0;
  return guess - offsetMin * 60_000;
}

export function prettyDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

export const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/* ---------- Email (Resend) — skipped quietly if not configured ---------- */

export async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<void> {
  const key = env("RESEND_API_KEY");
  const from = env("EMAIL_FROM");
  if (!key || !from || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, reply_to: replyTo }),
    });
    if (!res.ok) console.error("Email failed", res.status, await res.text());
  } catch (err) {
    console.error("Email error", err);
  }
}

export async function ownerEmail(db: SupabaseClient): Promise<string> {
  const fromEnv = env("OWNER_EMAIL");
  if (fromEnv) return fromEnv;
  const { data } = await db.from("business_settings").select("email").maybeSingle();
  return data?.email ?? "";
}

function bookingRows(b: Record<string, any>): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#666">${k}</td><td style="padding:6px 0"><strong>${v}</strong></td></tr>`;
  return `<table style="border-collapse:collapse;font-size:14px">
    ${row("Reference", esc(b.ref))}
    ${row("Service", esc(b.service_name))}
    ${row("Date", esc(prettyDate(b.slot_date)))}
    ${row("Time", esc(b.slot_time))}
    ${row("Vehicle", esc(`${b.vehicle_colour} ${b.vehicle_make} ${b.vehicle_model}`))}
    ${row("Address", esc(b.customer_address))}
    ${row("Paid", esc(money(b.price_pence)))}
  </table>`;
}

/* ---------- Booking confirmation (idempotent) ---------- */

// Marks a booking paid + confirmed after Stripe reports a completed, paid
// session. Only the call that actually flips the status sends emails, so the
// webhook and the return-page check can both call this safely.
export async function confirmFromSession(db: SupabaseClient, session: Record<string, any>): Promise<void> {
  if (session.payment_status !== "paid") return;
  const bookingId = session.metadata?.booking_id ?? session.client_reference_id;
  if (!bookingId) return;
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  const { data: updated, error } = await db
    .from("bookings")
    .update({
      status: "confirmed",
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent: paymentIntent ?? null,
      hold_expires_at: null,
      hold_token: null,
    })
    .eq("id", bookingId)
    .eq("status", "awaiting_payment")
    .select()
    .maybeSingle();

  if (error) {
    // Most likely the slot was re-booked after this hold lapsed (unique index).
    // Keep the payment on record and flag it so the owner can refund/rebook.
    console.error("Could not confirm booking", bookingId, error.message);
    await db.from("bookings").update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent: paymentIntent ?? null,
      admin_notes: "PAID but slot clashed with another booking — contact customer to rebook or refund.",
    }).eq("id", bookingId).neq("payment_status", "paid");
    return;
  }
  if (!updated) return; // already confirmed earlier

  const owner = await ownerEmail(db);
  await Promise.all([
    sendEmail(
      updated.customer_email,
      `Booking confirmed — ${updated.ref}`,
      `<div style="font-family:Arial,sans-serif;color:#111">
        <h2 style="margin:0 0 12px">You're booked in, ${esc(updated.customer_name.split(" ")[0])}!</h2>
        <p>Thanks for booking with OTR Detailing. Here are your details:</p>
        ${bookingRows(updated)}
        <p style="margin-top:18px">Please make sure we have access to an outdoor tap and, where needed, an electrical socket.
        Need to change anything? Reply to this email at least 24 hours before your slot.</p>
        <p>— Gideon, OTR Detailing</p>
      </div>`,
      owner || undefined,
    ),
    sendEmail(
      owner,
      `New paid booking ${updated.ref} — ${prettyDate(updated.slot_date)} ${updated.slot_time}`,
      `<div style="font-family:Arial,sans-serif;color:#111">
        <h2 style="margin:0 0 12px">New booking</h2>
        ${bookingRows(updated)}
        <p>Customer: <strong>${esc(updated.customer_name)}</strong> · ${esc(updated.customer_phone)} · ${esc(updated.customer_email)}</p>
        ${updated.notes ? `<p>Notes: ${esc(updated.notes)}</p>` : ""}
        <p><a href="${SITE_URL}/admin/dashboard.html">Open the booking manager</a></p>
      </div>`,
      updated.customer_email,
    ),
  ]);
}
