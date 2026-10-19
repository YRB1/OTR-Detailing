/* ==========================================================================
   OTR Detailing — admin settings (business details, prices, password)
   Prices saved here are what customers are charged at checkout.
   ========================================================================== */

(async function () {
  "use strict";

  if (!(await OTRApi.requireAdmin())) return;

  const toast = (m) => window.otrToast && window.otrToast(m);
  const $ = (id) => document.getElementById(id);
  const form = $("settings-form");

  async function load() {
    try {
      const [s, services] = await Promise.all([OTRApi.getSettings(), OTRApi.getServices()]);
      $("s-name").value = s.business_name;
      $("s-email").value = s.email;
      $("s-phone").value = s.phone;
      $("s-area").value = s.area;
      $("s-hours").value = s.hours;
      $("s-cancel-fee").value = s.cancellation_fee_pence / 100;
      services.forEach((svc) => {
        const input = $("s-price-" + svc.id);
        if (input) input.value = svc.price_pence / 100;
      });
    } catch (err) {
      toast("Couldn't load settings: " + err.message);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const pence = (id) => Math.round(Number($(id).value) * 100);
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await Promise.all([
        OTRApi.saveSettings({
          business_name: $("s-name").value.trim(),
          email: $("s-email").value.trim(),
          phone: $("s-phone").value.trim(),
          area: $("s-area").value.trim(),
          hours: $("s-hours").value.trim(),
          cancellation_fee_pence: pence("s-cancel-fee"),
        }),
        OTRApi.saveServicePrice("interior", pence("s-price-interior")),
        OTRApi.saveServicePrice("exterior", pence("s-price-exterior")),
        OTRApi.saveServicePrice("full", pence("s-price-full")),
      ]);
      toast("Settings saved — new prices apply to bookings straight away.");
    } catch (err) {
      toast("Couldn't save: " + err.message);
    }
    btn.disabled = false;
  });

  $("reset-btn").addEventListener("click", load);

  $("password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = $("s-new-pass").value;
    if (pass.length < 10) return toast("Use at least 10 characters.");
    try {
      await OTRApi.updatePassword(pass);
      $("s-new-pass").value = "";
      toast("Password updated.");
    } catch (err) {
      toast("Couldn't update password: " + err.message);
    }
  });

  load();
})();
