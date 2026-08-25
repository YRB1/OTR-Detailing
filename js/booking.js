/* ==========================================================================
   OTR Detailing — booking wizard logic
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

  let current = 1;
  const TOTAL_INPUT_STEPS = 5; // step 6 is confirmation

  const state = {
    service: null,
    price: null,
    serviceName: null,
    vehicle: {},
    date: null,
    time: null,
    customer: {},
  };

  /* ---------- preselect service from ?service= ---------- */
  const params = new URLSearchParams(window.location.search);
  const preselect = params.get("service");
  if (preselect) {
    const target = form.querySelector(`.service-pick[data-service="${preselect}"]`);
    if (target) selectService(target);
  }

  /* ---------- STEP 1: service selection ---------- */
  form.querySelectorAll(".service-pick").forEach((card) => {
    card.addEventListener("click", () => selectService(card));
  });
  function selectService(card) {
    form.querySelectorAll(".service-pick").forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    state.service = card.getAttribute("data-service");
    state.price = parseFloat(card.getAttribute("data-price"));
    state.serviceName = card.getAttribute("data-name");
  }

  /* ---------- STEP 3: date + time grids ---------- */
  const dateGrid = document.getElementById("date-grid");
  const timeGrid = document.getElementById("time-grid");
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const TIMES = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30"];
  // deterministic "taken" slots so the demo looks realistic but is stable per date
  function hashTaken(dateStr) {
    let h = 0;
    for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
    return h % TIMES.length;
  }

  function buildDateGrid() {
    dateGrid.innerHTML = "";
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      const el = document.createElement("div");
      el.className = "date-pick" + (i === 0 ? "" : "");
      el.setAttribute("data-date", iso);
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
  }

  function buildTimeGrid(iso) {
    const takenIdx = hashTaken(iso);
    timeGrid.innerHTML = "";
    TIMES.forEach((t, i) => {
      const el = document.createElement("div");
      el.className = "time-pick" + (i === takenIdx ? " taken" : "");
      el.textContent = t;
      el.addEventListener("click", () => {
        if (el.classList.contains("taken")) return;
        timeGrid.querySelectorAll(".time-pick").forEach((x) => x.classList.remove("selected"));
        el.classList.add("selected");
        state.time = t;
      });
      timeGrid.appendChild(el);
    });
  }

  buildDateGrid();

  /* ---------- STEP 5: payment card preview ---------- */
  const payName = document.getElementById("pay-name");
  const payNumber = document.getElementById("pay-number");
  const payExpiry = document.getElementById("pay-expiry");
  const cpNumber = document.getElementById("cp-number");
  const cpName = document.getElementById("cp-name");
  const cpExpiry = document.getElementById("cp-expiry");

  if (payName) {
    payName.addEventListener("input", () => {
      cpName.textContent = payName.value.trim() ? payName.value.toUpperCase() : "YOUR NAME";
    });
    payNumber.addEventListener("input", () => {
      let digits = payNumber.value.replace(/\D/g, "").slice(0, 16);
      let formatted = digits.replace(/(.{4})/g, "$1 ").trim();
      payNumber.value = formatted;
      let display = digits.padEnd(16, "•").replace(/(.{4})/g, "$1 ").trim();
      cpNumber.textContent = digits.length ? display : "•••• •••• •••• ••••";
    });
    payExpiry.addEventListener("input", () => {
      let v = payExpiry.value.replace(/\D/g, "").slice(0, 4);
      if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
      payExpiry.value = v;
      cpExpiry.textContent = v || "MM/YY";
    });
  }

  /* ---------- validation per step ---------- */
  function validateStep(n) {
    let valid = true;
    if (n === 1) {
      if (!state.service) valid = false;
    }
    if (n === 2) {
      ["v-make", "v-model", "v-color"].forEach((id) => {
        const el = document.getElementById(id);
        const row = el.closest(".form-row");
        const ok = el.value.trim().length > 0;
        row.classList.toggle("invalid", !ok);
        if (!ok) valid = false;
      });
    }
    if (n === 3) {
      if (!state.date || !state.time) valid = false;
    }
    if (n === 4) {
      const fields = [
        ["cu-name", (v) => v.trim().length > 0],
        ["cu-phone", (v) => v.replace(/\D/g, "").length >= 9],
        ["cu-email", (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)],
        ["cu-address", (v) => v.trim().length > 4],
      ];
      fields.forEach(([id, test]) => {
        const el = document.getElementById(id);
        const row = el.closest(".form-row");
        const ok = test(el.value);
        row.classList.toggle("invalid", !ok);
        if (!ok) valid = false;
      });
      const terms = document.getElementById("cu-terms");
      if (!terms.checked) valid = false;
    }
    if (n === 5) {
      const fields = [
        ["pay-name", (v) => v.trim().length > 1],
        ["pay-number", (v) => v.replace(/\D/g, "").length === 16],
        ["pay-expiry", (v) => /^\d{2}\/\d{2}$/.test(v)],
        ["pay-cvc", (v) => /^\d{3,4}$/.test(v)],
      ];
      fields.forEach(([id, test]) => {
        const el = document.getElementById(id);
        const row = el.closest(".form-row");
        const ok = test(el.value);
        row.classList.toggle("invalid", !ok);
        if (!ok) valid = false;
      });
    }
    return valid;
  }

  /* ---------- summary rendering ---------- */
  function renderSummary(target) {
    target.innerHTML = `
      <div class="summary-row"><span class="k">Service</span><span class="v">${state.serviceName}</span></div>
      <div class="summary-row"><span class="k">Vehicle</span><span class="v">${escapeHtml(state.vehicle.color)} ${escapeHtml(state.vehicle.make)} ${escapeHtml(state.vehicle.model)}</span></div>
      <div class="summary-row"><span class="k">Date</span><span class="v">${formatDate(state.date)}</span></div>
      <div class="summary-row"><span class="k">Time</span><span class="v">${state.time}</span></div>
      <div class="summary-row"><span class="k">Location</span><span class="v">${escapeHtml(state.customer.address)}</span></div>
      <div class="summary-row total"><span class="k">Total Due</span><span class="v">£${state.price.toFixed(2)}</span></div>
    `;
  }

  function formatDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
  }
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------- step navigation ---------- */
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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          activeEl.classList.add("step-enter-active");
          setTimeout(() => activeEl.classList.remove("step-enter", "step-enter-active"), 450);
        });
      });
    }

    if (n > TOTAL_INPUT_STEPS) {
      wizardActions.style.display = "none";
    } else {
      wizardActions.style.display = "flex";
      btnBack.style.visibility = n === 1 ? "hidden" : "visible";
      btnNext.textContent = n === TOTAL_INPUT_STEPS ? "Confirm & Book" : "Continue";
    }

    if (n === 5) {
      collectVehicleAndCustomer();
      renderSummary(document.getElementById("summary-box"));
    }

    if (n === 6) {
      launchConfetti();
    }
  }

  /* ---------- confetti burst on confirmation ---------- */
  function launchConfetti() {
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
    function tick() {
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
      if (frame < maxFrames) {
        requestAnimationFrame(tick);
      } else {
        canvas.remove();
      }
    }
    tick();
  }

  function collectVehicleAndCustomer() {
    state.vehicle = {
      make: document.getElementById("v-make").value.trim(),
      model: document.getElementById("v-model").value.trim(),
      color: document.getElementById("v-color").value.trim(),
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

  btnNext.addEventListener("click", () => {
    if (!validateStep(current)) {
      if (current === 1) window.otrToast && window.otrToast("Please choose a service to continue.");
      return;
    }
    if (current === TOTAL_INPUT_STEPS) {
      submitBooking();
      return;
    }
    goToStep(current + 1);
  });

  btnBack.addEventListener("click", () => {
    if (current > 1) goToStep(current - 1);
  });

  function submitBooking() {
    const booking = OTRStore.addBooking({
      service: state.service,
      serviceName: state.serviceName,
      price: state.price,
      vehicle: state.vehicle,
      date: state.date,
      time: state.time,
      customer: {
        name: state.customer.name,
        phone: state.customer.phone,
        email: state.customer.email,
        address: state.customer.address,
      },
      notes: state.customer.notes || "",
      status: "pending",
    });
    document.getElementById("confirm-ref").textContent = booking.id;
    renderSummary(document.getElementById("confirm-summary"));
    goToStep(6);
  }

  document.getElementById("book-another").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "booking.html";
  });

  goToStep(current);
})();
