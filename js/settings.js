/* ==========================================================================
   OTR Detailing — admin settings page
   ========================================================================== */

(function () {
  "use strict";

  if (!OTRStore.isAuthed()) {
    window.location.href = "login.html";
    return;
  }

  document.getElementById("logout-btn").addEventListener("click", () => {
    OTRStore.logout();
    window.location.href = "login.html";
  });

  const form = document.getElementById("settings-form");
  const fields = {
    businessName: document.getElementById("s-name"),
    email: document.getElementById("s-email"),
    phone: document.getElementById("s-phone"),
    area: document.getElementById("s-area"),
    hours: document.getElementById("s-hours"),
    priceInterior: document.getElementById("s-price-interior"),
    priceExterior: document.getElementById("s-price-exterior"),
    priceFull: document.getElementById("s-price-full"),
    cancelFee: document.getElementById("s-cancel-fee"),
  };

  function applySettings(s) {
    fields.businessName.value = s.businessName;
    fields.email.value = s.email;
    fields.phone.value = s.phone;
    fields.area.value = s.area;
    fields.hours.value = s.hours;
    fields.priceInterior.value = s.prices.interior;
    fields.priceExterior.value = s.prices.exterior;
    fields.priceFull.value = s.prices.full;
    fields.cancelFee.value = s.cancellationFee;
  }

  applySettings(OTRStore.getSettings());

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    OTRStore.saveSettings({
      businessName: fields.businessName.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      area: fields.area.value.trim(),
      hours: fields.hours.value.trim(),
      cancellationFee: Number(fields.cancelFee.value) || 0,
      prices: {
        interior: Number(fields.priceInterior.value) || 0,
        exterior: Number(fields.priceExterior.value) || 0,
        full: Number(fields.priceFull.value) || 0,
      },
    });
    window.otrToast && window.otrToast("Settings saved.");
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    localStorage.removeItem("otr_settings");
    applySettings(OTRStore.getSettings());
    window.otrToast && window.otrToast("Settings reset to defaults.");
  });
})();
