// Stores a customer review as "pending" and lets the owner know.
// Nothing is published until the owner approves it in the admin area.
import { adminClient, corsHeaders, esc, json, ownerEmail, sendEmail, SITE_URL } from "../_shared/otr.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  // Honeypot: real visitors never fill this hidden field.
  if (typeof body.company === "string" && body.company.trim()) return json({ ok: true });

  const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const name = clip(body.name, 60);
  const email = clip(body.email, 200).toLowerCase();
  const vehicle = clip(body.vehicle, 60);
  const area = clip(body.area, 60);
  const comment = clip(body.comment, 1500);
  const rating = Number(body.rating);

  if (!name || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 10) {
    return json({ error: "Please add your name, a star rating and a few words about your detail." }, 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "That email address doesn't look right." }, 400);
  }

  const db = adminClient();
  if (email) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await db.from("reviews").select("id", { count: "exact", head: true })
      .eq("email", email).gt("created_at", since);
    if ((count ?? 0) >= 2) return json({ error: "Thanks — we've already received your review." }, 429);
  }

  const { error } = await db.from("reviews").insert({ name, email, vehicle, area, rating, comment });
  if (error) {
    console.error(error);
    return json({ error: "Couldn't send your review. Please try again." }, 500);
  }

  await sendEmail(
    await ownerEmail(db),
    `New ${rating}★ review from ${name} — waiting for approval`,
    `<div style="font-family:Arial,sans-serif;color:#111">
      <p><strong>${esc(name)}</strong>${vehicle ? ` (${esc(vehicle)})` : ""} left a ${"★".repeat(rating)} review:</p>
      <p style="white-space:pre-wrap">${esc(comment)}</p>
      <p><a href="${SITE_URL}/admin/dashboard.html#reviews">Approve it in the booking manager</a></p>
    </div>`,
    email || undefined,
  );

  return json({ ok: true });
});
