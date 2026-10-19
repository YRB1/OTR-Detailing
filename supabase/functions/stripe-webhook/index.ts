// Receives Stripe events. Confirms bookings when payment succeeds and frees
// the slot when a checkout session expires unpaid.
import { adminClient, confirmFromSession, env } from "../_shared/otr.ts";

const enc = new TextEncoder();

async function verifySignature(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string]).filter(([k]) => k === "t"),
  );
  const timestamp = parts.t;
  const signatures = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${payload}`)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");

  return signatures.some((sig) => {
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const payload = await req.text();
  const ok = await verifySignature(payload, req.headers.get("stripe-signature"), env("STRIPE_WEBHOOK_SECRET"));
  if (!ok) return new Response("Invalid signature", { status: 400 });

  const event = JSON.parse(payload);
  const db = adminClient();
  const obj = event.data?.object ?? {};

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await confirmFromSession(db, obj);
        break;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const bookingId = obj.metadata?.booking_id ?? obj.client_reference_id;
        if (bookingId) {
          await db.from("bookings")
            .update({ status: "cancelled", hold_expires_at: null, hold_token: null })
            .eq("id", bookingId).eq("status", "awaiting_payment");
        }
        break;
      }
      case "charge.refunded": {
        if (obj.payment_intent && obj.refunded) {
          await db.from("bookings").update({ payment_status: "refunded" }).eq("stripe_payment_intent", obj.payment_intent);
        }
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handling failed", event.type, err);
    return new Response("Handler error", { status: 500 }); // Stripe will retry
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
