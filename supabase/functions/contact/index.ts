// Contact form: stores the enquiry and emails the owner.
import { adminClient, corsHeaders, esc, json, ownerEmail, sendEmail } from "../_shared/otr.ts";

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

  const name = String(body.name ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
  const message = String(body.message ?? "").trim().slice(0, 3000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) {
    return json({ error: "Please fill in your name, a valid email and a message." }, 400);
  }

  const db = adminClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db.from("enquiries").select("id", { count: "exact", head: true })
    .eq("email", email).gt("created_at", since);
  if ((count ?? 0) >= 3) return json({ error: "Thanks — we've already got your messages and will reply soon." }, 429);

  const { error } = await db.from("enquiries").insert({ name, email, message });
  if (error) {
    console.error(error);
    return json({ error: "Couldn't send your message. Please email us instead." }, 500);
  }

  await sendEmail(
    await ownerEmail(db),
    `New website enquiry from ${name}`,
    `<div style="font-family:Arial,sans-serif;color:#111">
      <p><strong>${esc(name)}</strong> (${esc(email)}) wrote:</p>
      <p style="white-space:pre-wrap">${esc(message)}</p>
      <p style="color:#666">Reply to this email to answer them directly.</p>
    </div>`,
    email,
  );

  return json({ ok: true });
});
