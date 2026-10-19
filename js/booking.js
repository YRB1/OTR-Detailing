/* ==========================================================================
   OTR Detailing — booking wizard
   Steps 1–4 collect the booking; step 5 places a short hold on the slot and
   mounts Stripe Embedded Checkout; Stripe returns the customer here with
   ?session_id=… and step 6 shows the confirmed booking.
   ========================================================================== */

(function () {
  "use strict";

  const form = document.getElementById("booking-form");
  if (!form) return;

  const steps = Array.from(form.querySelectorAll(".wizard-step"));
  const progressSteps = Array.from(document.querySelectorAll(".progress-step"));
  const btnNext = document.getElementById("btn-next");
  const btnBack = document.getElementById("btn-back");
  const wizardActions = document.getElementById("wizard-actions");
  const checkoutMount = document.getElementById("checkout");
  const payError = document.getElementById("pay-error");

  const TOTAL_INPUT_STEPS = 5; // step 6 is confirmation
  const HOLD_KEY = "otr_checkout_hold";
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let current = 1;
  let settings = {
    slot_times: ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30"],
    closed_weekdays: [0],
    booking_window_days: 21,
    min_notice_hours: 12,
  };
  let booked = new Set(); // "YYYY-MM-DD HH:MM"
  let checkout = null;

  const state = { service: null, price: null, serviceName: null, vehicle: {}, date: null, time: null, customer: {} };

  /* ---------- helpers ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function formatDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function getHold() {
    try { return JSON.parse(sessionStorage.getItem(HOLD_KEY)); } catch (e) { return null; }
  }
  function setHold(hold) {
    try { hold ? sessionStorage.setItem(HOLD_KEY, JSON.stringify(hold)) : sessionStorage.removeItem(HOLD_KEY); } catch (e) { /* private mode */ }
  }

  /* ---------- not connected yet: show the message-us fallback ---------- */
  function showOffline() {
    steps.forEach((s) => (s.hidden = true));
    wizardActions.style.display = "none";
    document.getElementById("progress-track").style.display = "none";
    document.getElementById("booking-offline").hidden = false;
  }
  if (!OTRApi.configured || !window.Stripe || !OTRApi.config.stripePublishableKey) {
    showOffline();
    return;
  }
  // Server-side Stripe keys may not be set yet; don't let customers fill in a form they can't pay for.
  if (!new URLSearchParams(window.location.search).get("session_id")) {
    fetch(OTRApi.config.supabaseUrl + "/functions/v1/create-checkout", {
      headers: { apikey: OTRApi.config.supabaseAnonKey, Authorization: "Bearer " + OTRApi.config.supabaseAnonKey },
    })
      .then((r) => r.json())
      .then((d) => { if (!d.ready) showOffline(); })
      .catch(() => {});
  }

  /* ---------- returning from Stripe ---------- */
  const params = new URLSearchParams(window.location.search);
  const returnedSession = params.get("session_id");
  if (returnedSession) {
    showReturn(returnedSession);
    return;
  }

  /* ---------- STEP 1: service selection ---------- */
  form.querySelectorAll(".service-pick").forEach((card) => card.addEventListener("click", () => selectService(card)));
  function selectService(card) {
    form.querySelectorAll(".service-pick").forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    state.service = card.getAttribute("data-service");
    state.price = parseFloat(card.getAttribute("data-price"));
    state.serviceName = card.getAttribute("data-name");
  }

  // Live prices from the database (the owner can change them in Settings).
  OTRApi.getServices()
    .then((services) => {
      services.forEach((s) => {
        const card = form.querySelector(`.service-pick[data-service="${s.id}"]`);
        if (!card) return;
        const pounds = s.price_pence / 100;
        card.setAttribute("data-price", pounds);
        card.setAttribute("data-name", s.name);
        card.querySelector(".p").textContent = "£" + (Number.isInteger(pounds) ? pounds : pounds.toFixed(2));
        if (state.service === s.id) state.price = pounds;
      });
    })
    .catch(() => {});

  const preselect = params.get("service");
  if (preselect) {
    const target = form.querySelector(`.service-pick[data-service="${preselect}"]`);
    if (target) selectService(target);
  }

  /* ---------- STEP 3: date + time ---------- */
  const dateGrid = document.getElementById("date-grid");
  const timeGrid = document.getElementById("time-grid");

  function slotStart(iso, time) {
    return new Date(`${iso}T${time}:00`);
  }
  function slotOpen(iso, time) {
    const earliest = Date.now() + settings.min_notice_hours * 3600000;
    return !booked.has(`${iso} ${time}`) && slotStart(iso, time).getTime() >= earliest;
  }

  function buildDateGrid() {
    dateGrid.innerHTML = "";
    const today = new Date();
    for (let i = 0; i <= settings.booking_window_days; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const iso = localIso(d);
      const closed = settings.closed_weekdays.includes(d.getDay());
      const anyFree = !closed && settings.slot_times.some((t) => slotOpen(iso, t));
      const el = document.createElement("button");
      el.type = "button";
      el.className = "date-pick" + (anyFree ? "" : " disabled");
      el.disabled = !anyFree;
      el.setAttribute("data-date", iso);
      el.setAttribute("aria-label", formatDate(iso) + (anyFree ? "" : " — unavailable"));
      el.innerHTML = `<div class="dow">${DOW[d.getDay()]}</div><div class="dnum">${d.getDate()}</div><div class="mon">${MON[d.getMonth()]}</div>`;
      el.addEventListener("click", () => {
        dateGrid.querySelectorAll(".date-pick").forEach((x) => x.classList.remove("selected"));
        el.classList.add("selected");
        state.date = iso;
        state.time = null;
        buildTimeGrid(iso);
      });
      dateGrid.appendChild(el);
    }
    if (state.date) {
      const again = dateGrid.querySelector(`[data-date="${state.date}"]:not(.disabled)`);
      if (again) { again.classList.add("selected"); buildTimeGrid(state.date); } else { state.date = null; state.time = null; timeGrid.innerHTML = ""; }
    }
  }

  function buildTimeGrid(iso) {
    timeGrid.innerHTML = "";
    settings.slot_times.forEach((t) => {
      const open = slotOpen(iso, t);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "time-pick" + (open ? "" : " taken") + (state.time === t && open ? " selected" : "");
      el.disabled = !open;
      el.textContent = t;
      el.addEventListener("click", () => {
        timeGrid.querySelectorAll(".time-pick").forEach((x) => x.classList.remove("selected"));
        el.classList.add("selected");
        state.time = t;
      });
      timeGrid.appendChild(el);
    });
  }

  async function loadAvailability() {
    try {
      const s = await OTRApi.getSettings();
      settings = Object.assign(settings, s);
      const from = localIso(new Date());
      const to = localIso(new Date(Date.now() + (settings.booking_window_days + 1) * 86400000));
      const slots = await OTRApi.getBookedSlots(from, to);
      booked = new Set(slots.map((s) => `${s.slot_date} ${s.slot_time}`));
    } catch (e) {
      console.warn("Availability unavailable", e);
    }
    buildDateGrid();
  }
  loadAvailability();

  /* ---------- validation ---------- */
  function validateStep(n) {
    let valid = true;
    if (n === 1 && !state.service) valid = false;
    if (n === 2) {
      ["v-make", "v-model", "v-color"].forEach((id) => {
        const el = document.getElementById(id);
        const ok = el.value.trim().length > 0;
        el.closest(".form-row").classList.toggle("invalid", !ok);
        if (!ok) valid = false;
      });
    }
    if (n === 3 && (!state.date || !state.time)) valid = false;
    if (n === 4) {
      [
        ["cu-name", (v) => v.trim().length > 0],
        ["cu-phone", (v) => v.replace(/\D/g, "").length >= 9],
        ["cu-email", (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())],
        ["cu-address", (v) => v.trim().length > 4],
      ].forEach(([id, test]) => {
        const el = document.getElementById(id);
        const ok = test(el.value);
        el.closest(".form-row").classList.toggle("invalid", !ok);
        if (!ok) valid = false;
      });
      const terms = document.getElementById("cu-terms");
      terms.closest(".form-row").classList.toggle("invalid", !terms.checked);
      if (!terms.checked) valid = false;
    }
    return valid;
  }

  /* ---------- summary ---------- */
  function summaryHtml(s) {
    return `
      <div class="summary-row"><span class="k">Service</span><span class="v">${escapeHtml(s.service)}</span></div>
      <div class="summary-row"><span class="k">Vehicle</span><span class="v">${escapeHtml(s.vehicle)}</span></div>
      <div class="summary-row"><span class="k">Date</span><span class="v">${formatDate(s.date)}</span></div>
      <div class="summary-row"><span class="k">Time</span><span class="v">${escapeHtml(s.time)}</span></div>
      ${s.address ? `<div class="summary-row"><span class="k">Location</span><span class="v">${escapeHtml(s.address)}</span></div>` : ""}
      <div class="summary-row total"><span class="k">${s.paid ? "Paid" : "Total"}</span><span class="v">£${Number(s.price).toFixed(2)}</span></div>`;
  }

  function collectVehicleAndCustomer() {
    state.vehicle = {
      make: document.getElementById("v-make").value.trim(),
      model: document.getElementById("v-model").value.trim(),
      colour: document.getElementById("v-color").value.trim(),
      size: document.getElementById("v-size").value,
    };
    state.customer = {
      name: document.getElementById("cu-name").value.trim(),
      phone: document.getElementById("cu-phone").value.trim(),
      email: document.getElementById("cu-email").value.trim(),
      address: document.getElementById("cu-address").value.trim(),
      notes: document.getElementById("cu-notes").value.trim(),
    };
  }

  /* ---------- navigation ---------- */
  function goToStep(n) {
    steps.forEach((s) => (s.hidden = parseInt(s.getAttribute("data-step"), 10) !== n));
    progressSteps.forEach((p) => {
      const stepNum = parseInt(p.getAttribute("data-step"), 10);
      p.classList.toggle("active", stepNum === n);
      p.classList.toggle("done", stepNum < n);
    });
    current = n;
    window.scrollTo({ top: form.offsetTop - 120, behavior: "smooth" });

    const activeEl = steps.find((s) => parseInt(s.getAttribute("data-step"), 10) === n);
    if (activeEl) {
      activeEl.classList.add("step-enter");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        activeEl.classList.add("step-enter-active");
        setTimeout(() => activeEl.classList.remove("step-enter", "step-enter-active"), 450);
      }));
    }

    if (n > TOTAL_INPUT_STEPS) {
      wizardActions.style.display = "none";
    } else {
      wizardActions.style.display = "flex";
      btnBack.style.visibility = n === 1 ? "hidden" : "visible";
      btnNext.hidden = false;
      btnNext.disabled = false;
      btnNext.textContent = n === TOTAL_INPUT_STEPS ? `Pay £${Number(state.price || 0).toFixed(2)} & Book` : "Continue";
    }

    if (n === 5) {
      collectVehicleAndCustomer();
      document.getElementById("summary-box").innerHTML = summaryHtml({
        service: state.serviceName,
        vehicle: `${state.vehicle.colour} ${state.vehicle.make} ${state.vehicle.model}`,
        date: state.date,
        time: state.time,
        address: state.customer.address,
        price: state.price,
      });
    }
  }

  function destroyCheckout() {
    if (checkout) {
      checkout.destroy();
      checkout = null;
    }
    checkoutMount.hidden = true;
    checkoutMount.innerHTML = "";
  }

  async function startPayment() {
    payError.hidden = true;
    btnNext.disabled = true;
    btnNext.textContent = "Securing your slot…";
    try {
      const result = await OTRApi.createCheckout({
        service: state.service,
        vehicle: state.vehicle,
        date: state.date,
        time: state.time,
        customer: { name: state.customer.name, phone: state.customer.phone, email: state.customer.email, address: state.customer.address },
        notes: state.customer.notes,
        previousHold: getHold(),
      });
      setHold(result.hold);
      const stripe = window.Stripe(OTRApi.config.stripePublishableKey);
      checkout = await stripe.initEmbeddedCheckout({ fetchClientSecret: async () => result.clientSecret });
      checkoutMount.hidden = false;
      checkout.mount(checkoutMount);
      btnNext.hidden = true;
      btnBack.textContent = "Change Details";
      checkoutMount.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      payError.textContent = err.message;
      payError.hidden = false;
      btnNext.disabled = false;
      btnNext.textContent = `Pay £${Number(state.price || 0).toFixed(2)} & Book`;
      if (/slot/i.test(err.message)) loadAvailability();
    }
  }

  btnNext.addEventListener("click", () => {
    if (!validateStep(current)) {
      if (current === 1) window.otrToast && window.otrToast("Please choose a service to continue.");
      if (current === 3) window.otrToast && window.otrToast("Please pick a date and a time.");
      return;
    }
    if (current === TOTAL_INPUT_STEPS) {
      startPayment();
      return;
    }
    goToStep(current + 1);
  });

  btnBack.addEventListener("click", () => {
    if (current === TOTAL_INPUT_STEPS) {
      destroyCheckout();
      btnBack.textContent = "Back";
      payError.hidden = true;
    }
    if (current > 1) goToStep(current - 1);
  });

  goToStep(current);

  /* ---------- step 6: back from Stripe ---------- */
  async function showReturn(sessionId) {
    steps.forEach((s) => (s.hidden = parseInt(s.getAttribute("data-step"), 10) !== 6));
    progressSteps.forEach((p) => p.classList.add("done"));
    wizardActions.style.display = "none";

    const title = document.getElementById("confirm-title");
    const sub = document.getElementById("confirm-sub");
    const ref = document.getElementById("confirm-ref");
    const summary = document.getElementById("confirm-summary");
    const icon = document.getElementById("confirm-icon");

    let result = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        result = await OTRApi.checkoutStatus(sessionId);
        if (result.booking && result.booking.status === "confirmed") break;
        if (result.sessionStatus !== "complete") break;
      } catch (e) {
        result = null;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    const b = result && result.booking;
    if (b && (b.status === "confirmed" || b.status === "completed")) {
      setHold(null);
      title.textContent = "Booking Confirmed!";
      sub.textContent = `Thanks ${b.firstName} — you're all booked in. A confirmation has been sent to your email.`;
      ref.textContent = b.ref;
      ref.hidden = false;
      summary.innerHTML = summaryHtml({ service: b.service, vehicle: b.vehicle, date: b.date, time: b.time, price: b.price, paid: true });
      summary.hidden = false;
      history.replaceState(null, "", "booking.html");
      launchConfetti();
    } else if (result && result.sessionStatus === "complete") {
      title.textContent = "Payment received";
      sub.textContent = "We're just finalising your booking — you'll get a confirmation email shortly. If anything looks wrong, message us on Instagram.";
    } else {
      icon.classList.add("is-warn");
      icon.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>';
      title.textContent = "Payment not completed";
      sub.textContent = "No money has been taken and your slot hasn't been booked. You can try again below.";
      document.getElementById("book-another").textContent = "Try Again";
    }
  }

  /* ---------- confetti burst on confirmation ---------- */
  function launchConfetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = document.createElement("canvas");
    canvas.className = "confetti-canvas";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const colors = ["#3d78c2", "#7fa8d9", "#1c3f6e", "#a9c3e0", "#e8eef5"];
    const particles = Array.from({ length: 130 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 260,
      y: canvas.height * 0.32,
      vx: (Math.random() - 0.5) * 11,
      vy: Math.random() * -13 - 4,
      size: Math.random() * 7 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.3,
      gravity: 0.32 + Math.random() * 0.15,
    }));
    let frame = 0;
    const maxFrames = 210;
    (function tick() {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / maxFrames);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (frame < maxFrames) requestAnimationFrame(tick);
      else canvas.remove();
    })();
  }
})();
