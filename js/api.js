/* ==========================================================================
   OTR Detailing — data layer (Supabase)
   Shared by the public booking/contact pages and the owner's admin area.
   Requires js/config.js and the supabase-js UMD bundle loaded first.
   ========================================================================== */

const OTRApi = (function () {
  "use strict";

  const cfg = window.OTR_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const client = configured
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: "otr_admin_session" },
      })
    : null;

  function need() {
    if (!client) throw new Error("Online booking isn't switched on yet.");
    return client;
  }

  async function call(fn, body) {
    const { data, error } = await need().functions.invoke(fn, { body });
    if (error) {
      let message = "Something went wrong. Please try again.";
      try {
        const payload = await error.context.json();
        if (payload && payload.error) message = payload.error;
      } catch (e) { /* keep the generic message */ }
      throw new Error(message);
    }
    return data;
  }

  function unwrap({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
  }

  /* ---------- public ---------- */
  async function getServices() {
    return unwrap(await need().from("services").select("*").eq("active", true).order("sort"));
  }
  async function getSettings() {
    return unwrap(await need().from("business_settings").select("*").single());
  }
  async function getBookedSlots(fromIso, toIso) {
    return unwrap(await need().rpc("get_booked_slots", { from_date: fromIso, to_date: toIso }));
  }
  const createCheckout = (payload) => call("create-checkout", payload);
  const checkoutStatus = (sessionId) => call("checkout-status", { session_id: sessionId });
  const sendEnquiry = (payload) => call("contact", payload);

  /* ---------- owner ---------- */
  async function signIn(email, password) {
    const { error } = await need().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message);
    if (!(await isAdmin())) {
      await need().auth.signOut();
      throw new Error("This account doesn't have owner access.");
    }
  }
  async function signOut() {
    if (client) await client.auth.signOut();
  }
  async function isAdmin() {
    if (!client) return false;
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return false;
    const { data, error } = await client.rpc("is_admin");
    return !error && data === true;
  }
  async function sendPasswordReset(email, redirectTo) {
    unwrap(await need().auth.resetPasswordForEmail(email, { redirectTo }));
  }
  async function updatePassword(password) {
    unwrap(await need().auth.updateUser({ password }));
  }
  function onAuthChange(cb) {
    if (client) client.auth.onAuthStateChange(cb);
  }

  async function listBookings() {
    return unwrap(await need().from("bookings").select("*").order("slot_date", { ascending: false }).order("slot_time", { ascending: false }));
  }
  async function updateBooking(id, fields) {
    return unwrap(await need().from("bookings").update(fields).eq("id", id).select().single());
  }
  async function deleteBooking(id) {
    unwrap(await need().from("bookings").delete().eq("id", id));
  }
  async function addManualBooking(fields) {
    return unwrap(await need().from("bookings").insert(Object.assign({ source: "manual", status: "confirmed" }, fields)).select().single());
  }
  async function listEnquiries() {
    return unwrap(await need().from("enquiries").select("*").order("created_at", { ascending: false }).limit(100));
  }
  async function updateEnquiry(id, fields) {
    unwrap(await need().from("enquiries").update(fields).eq("id", id));
  }
  async function listReviews() {
    return unwrap(await need().from("reviews").select("*").order("created_at", { ascending: false }).limit(200));
  }
  async function updateReview(id, fields) {
    unwrap(await need().from("reviews").update(fields).eq("id", id));
  }
  async function deleteReview(id) {
    unwrap(await need().from("reviews").delete().eq("id", id));
  }
  async function saveSettings(fields) {
    return unwrap(await need().from("business_settings").update(fields).eq("id", true).select().single());
  }
  async function saveServicePrice(id, pricePence) {
    unwrap(await need().from("services").update({ price_pence: pricePence }).eq("id", id));
  }

  // Admin pages: keep content hidden until the owner session is verified.
  async function requireAdmin() {
    document.documentElement.classList.add("admin-checking");
    if (!(await isAdmin())) {
      window.location.replace("login.html");
      return false;
    }
    document.documentElement.classList.remove("admin-checking");
    const out = document.getElementById("logout-btn");
    if (out) out.addEventListener("click", async () => { await signOut(); window.location.href = "login.html"; });
    return true;
  }

  return {
    configured,
    requireAdmin,
    config: cfg,
    getServices,
    getSettings,
    getBookedSlots,
    createCheckout,
    checkoutStatus,
    sendEnquiry,
    signIn,
    signOut,
    isAdmin,
    sendPasswordReset,
    updatePassword,
    onAuthChange,
    listBookings,
    updateBooking,
    deleteBooking,
    addManualBooking,
    listEnquiries,
    updateEnquiry,
    listReviews,
    updateReview,
    deleteReview,
    saveSettings,
    saveServicePrice,
    IDLE_TIMEOUT_MS: 30 * 60 * 1000,
  };
})();
