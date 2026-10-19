/* ==========================================================================
   OTR Detailing — admin dashboard (bookings + enquiries)
   ========================================================================== */

(async function () {
  "use strict";

  if (!(await OTRApi.requireAdmin())) return;

  const tbody = document.getElementById("bookings-tbody");
  const emptyState = document.getElementById("empty-state");
  const filterRow = document.getElementById("filter-row");
  let activeFilter = "upcoming";
  let bookings = [];
  let enquiries = [];
  let reviews = [];

  const STATUS_ORDER = ["confirmed", "completed", "cancelled"];
  const STATUS_LABEL = { awaiting_payment: "Awaiting Payment", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" };
  const PAY_LABEL = { paid: "Paid", unpaid: "Unpaid", refunded: "Refunded", pay_on_day: "Pay on day" };

  const money = (pence) => "£" + (Number(pence || 0) / 100).toFixed(2);
  const pad = (n) => String(n).padStart(2, "0");
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  function fmtDate(iso, time) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + (time ? ` · ${time}` : "");
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const toast = (m) => window.otrToast && window.otrToast(m);

  // Online checkouts that were started but never paid are just noise for the owner.
  function isAbandoned(b) {
    if (b.source !== "online" || b.payment_status === "paid") return false;
    if (b.status === "cancelled") return true;
    return b.status === "awaiting_payment" && b.hold_expires_at && new Date(b.hold_expires_at) < new Date();
  }

  async function load() {
    try {
      [bookings, enquiries, reviews] = await Promise.all([OTRApi.listBookings(), OTRApi.listEnquiries(), OTRApi.listReviews()]);
    } catch (err) {
      toast("Couldn't load data: " + err.message);
      return;
    }
    bookings = bookings.filter((b) => !isAbandoned(b));
    render();
    renderEnquiries();
    renderReviews();
  }

  /* ---------- chart: jobs per day, next 7 days ---------- */
  const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function renderChart() {
    const chartEl = document.getElementById("chart-bars");
    if (!chartEl) return;
    const days = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) days.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
    const counts = days.map((d) => {
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      return bookings.filter((b) => b.slot_date === iso && b.status === "confirmed").length;
    });
    const max = Math.max(1, ...counts);
    chartEl.innerHTML = days
      .map((d, i) => `
        <div class="chart-bar-col">
          <div class="chart-bar" data-h="${Math.round((counts[i] / max) * 100)}"><span class="val">${counts[i]}</span></div>
          <div class="day-lbl">${DOW_SHORT[d.getDay()]}</div>
        </div>`)
      .join("");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chartEl.querySelectorAll(".chart-bar").forEach((bar) => (bar.style.height = bar.getAttribute("data-h") + "%"));
    }));
  }

  function filtered() {
    const today = todayIso();
    switch (activeFilter) {
      case "upcoming":
        return bookings.filter((b) => (b.status === "confirmed" || b.status === "awaiting_payment") && b.slot_date >= today)
          .sort((a, b) => (a.slot_date + a.slot_time).localeCompare(b.slot_date + b.slot_time));
      case "all":
        return bookings;
      default:
        return bookings.filter((b) => b.status === activeFilter);
    }
  }

  function render() {
    const today = todayIso();
    const live = bookings.filter((b) => b.status !== "cancelled");
    document.getElementById("kpi-total").textContent = live.length;
    document.getElementById("kpi-pending").textContent = enquiries.filter((e) => e.status === "new").length;
    document.getElementById("kpi-upcoming").textContent = bookings.filter((b) => b.status === "confirmed" && b.slot_date >= today).length;
    document.getElementById("kpi-revenue").textContent = money(
      bookings.filter((b) => b.payment_status === "paid" && b.status !== "cancelled").reduce((s, b) => s + b.price_pence, 0)
    );
    renderChart();

    const list = filtered();
    tbody.innerHTML = "";
    emptyState.hidden = list.length !== 0;

    list.forEach((b) => {
      const tr = document.createElement("tr");
      const statusOptions = (b.status === "awaiting_payment" ? ["awaiting_payment"] : []).concat(STATUS_ORDER);
      tr.innerHTML = `
        <td data-label="Reference"><strong>${escapeHtml(b.ref)}</strong>${b.admin_notes ? '<br><span class="flag">⚠ Needs attention</span>' : ""}</td>
        <td data-label="Customer"><div>${escapeHtml(b.customer_name)}<br><span class="sub-text">${escapeHtml(b.customer_phone)}</span></div></td>
        <td data-label="Vehicle">${escapeHtml(`${b.vehicle_colour} ${b.vehicle_make} ${b.vehicle_model}`)}</td>
        <td data-label="Service">${escapeHtml(b.service_name)}</td>
        <td data-label="Date &amp; Time">${fmtDate(b.slot_date, b.slot_time)}</td>
        <td data-label="Price">${money(b.price_pence)}<br><span class="sub-text">${PAY_LABEL[b.payment_status] || ""}</span></td>
        <td data-label="Status" style="white-space:nowrap">
          <span class="badge ${b.status}">${STATUS_LABEL[b.status]}</span><br>
          <select class="status-select" data-id="${b.id}" aria-label="Change status">
            ${statusOptions.map((s) => `<option value="${s}" ${s === b.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}
          </select>
        </td>
        <td data-label="Actions">
          <div class="row-actions">
            <button class="icon-btn view-btn" data-id="${b.id}" title="View details">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="icon-btn danger delete-btn" data-id="${b.id}" title="Delete booking">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>
            </button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  tbody.addEventListener("change", async (e) => {
    const sel = e.target.closest(".status-select");
    if (!sel) return;
    const b = bookings.find((x) => x.id === sel.dataset.id);
    try {
      const updated = await OTRApi.updateBooking(b.id, { status: sel.value });
      Object.assign(b, updated);
      render();
      toast(`${b.ref} marked ${STATUS_LABEL[sel.value]}.` + (sel.value === "cancelled" && b.payment_status === "paid" ? " Refunds are done in Stripe." : ""));
    } catch (err) {
      toast("Couldn't update: " + err.message);
      render();
    }
  });
  tbody.addEventListener("click", (e) => {
    const view = e.target.closest(".view-btn");
    const del = e.target.closest(".delete-btn");
    if (view) openDetail(view.dataset.id);
    if (del) openDelete(del.dataset.id);
  });

  filterRow.addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip");
    if (!chip) return;
    filterRow.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    activeFilter = chip.getAttribute("data-filter");
    render();
  });

  /* ---------- detail modal ---------- */
  const detailModal = document.getElementById("detail-modal");
  const detailGrid = document.getElementById("detail-grid");
  function openDetail(id) {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    const mapUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(b.customer_address);
    detailGrid.innerHTML = `
      <div class="drow"><span>Reference</span><span>${escapeHtml(b.ref)}</span></div>
      <div class="drow"><span>Status</span><span class="badge ${b.status}">${STATUS_LABEL[b.status]}</span></div>
      <div class="drow"><span>Payment</span><span>${PAY_LABEL[b.payment_status]}${b.paid_at ? " · " + new Date(b.paid_at).toLocaleString("en-GB") : ""}</span></div>
      <div class="drow"><span>Service</span><span>${escapeHtml(b.service_name)} · ${money(b.price_pence)}</span></div>
      <div class="drow"><span>Vehicle</span><span>${escapeHtml(`${b.vehicle_colour} ${b.vehicle_make} ${b.vehicle_model}`)}${b.vehicle_size ? `<br><span class="sub-text">${escapeHtml(b.vehicle_size)}</span>` : ""}</span></div>
      <div class="drow"><span>Date &amp; Time</span><span>${fmtDate(b.slot_date, b.slot_time)}</span></div>
      <div class="drow"><span>Customer</span><span>${escapeHtml(b.customer_name)}</span></div>
      <div class="drow"><span>Phone</span><span><a href="tel:${escapeHtml(b.customer_phone.replace(/\s/g, ""))}">${escapeHtml(b.customer_phone)}</a></span></div>
      <div class="drow"><span>Email</span><span><a href="mailto:${escapeHtml(b.customer_email)}">${escapeHtml(b.customer_email)}</a></span></div>
      <div class="drow"><span>Address</span><span><a href="${mapUrl}" target="_blank" rel="noopener">${escapeHtml(b.customer_address)}</a></span></div>
      ${b.notes ? `<div class="drow"><span>Customer Notes</span><span>${escapeHtml(b.notes)}</span></div>` : ""}
      ${b.admin_notes ? `<div class="drow"><span>Attention</span><span class="flag">${escapeHtml(b.admin_notes)}</span></div>` : ""}
      ${b.stripe_payment_intent ? `<div class="drow"><span>Stripe</span><span><a href="https://dashboard.stripe.com/payments/${escapeHtml(b.stripe_payment_intent)}" target="_blank" rel="noopener">View payment</a></span></div>` : ""}
      <div class="drow"><span>Booked</span><span>${new Date(b.created_at).toLocaleString("en-GB")} · ${b.source === "manual" ? "Added manually" : "Online"}</span></div>`;
    detailModal.classList.add("open");
  }
  document.getElementById("detail-close").addEventListener("click", () => detailModal.classList.remove("open"));
  detailModal.addEventListener("click", (e) => { if (e.target === detailModal) detailModal.classList.remove("open"); });

  /* ---------- delete modal ---------- */
  const deleteModal = document.getElementById("delete-modal");
  let pendingDeleteId = null;
  function openDelete(id) {
    pendingDeleteId = id;
    deleteModal.classList.add("open");
  }
  document.getElementById("delete-cancel").addEventListener("click", () => { deleteModal.classList.remove("open"); pendingDeleteId = null; });
  deleteModal.addEventListener("click", (e) => { if (e.target === deleteModal) deleteModal.classList.remove("open"); });
  document.getElementById("delete-confirm").addEventListener("click", async () => {
    const b = bookings.find((x) => x.id === pendingDeleteId);
    deleteModal.classList.remove("open");
    if (!b) return;
    try {
      await OTRApi.deleteBooking(b.id);
      bookings = bookings.filter((x) => x.id !== b.id);
      render();
      toast(`Booking ${b.ref} deleted.`);
    } catch (err) {
      toast("Couldn't delete: " + err.message);
    }
    pendingDeleteId = null;
  });

  /* ---------- manual booking (e.g. booked via Instagram DM) ---------- */
  const manualModal = document.getElementById("manual-modal");
  const manualForm = document.getElementById("manual-form");
  document.getElementById("manual-open").addEventListener("click", async () => {
    try {
      const services = await OTRApi.getServices();
      document.getElementById("m-service").innerHTML = services
        .map((s) => `<option value="${s.id}" data-price="${s.price_pence}" data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)} — ${money(s.price_pence)}</option>`)
        .join("");
    } catch (e) { /* keep existing options */ }
    document.getElementById("m-date").value = todayIso();
    manualModal.classList.add("open");
  });
  document.getElementById("manual-cancel").addEventListener("click", () => manualModal.classList.remove("open"));
  manualModal.addEventListener("click", (e) => { if (e.target === manualModal) manualModal.classList.remove("open"); });
  manualForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!manualForm.reportValidity()) return;
    const v = (id) => document.getElementById(id).value.trim();
    const opt = document.getElementById("m-service").selectedOptions[0];
    const submit = manualForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const created = await OTRApi.addManualBooking({
        service_id: opt.value,
        service_name: opt.dataset.name,
        price_pence: Number(opt.dataset.price),
        vehicle_make: v("m-make"),
        vehicle_model: v("m-model"),
        vehicle_colour: v("m-colour"),
        slot_date: v("m-date"),
        slot_time: v("m-time"),
        customer_name: v("m-name"),
        customer_phone: v("m-phone"),
        customer_email: v("m-email") || "not-given@otr.local",
        customer_address: v("m-address"),
        notes: v("m-notes"),
        payment_status: document.getElementById("m-paid").checked ? "paid" : "pay_on_day",
      });
      bookings.unshift(created);
      manualModal.classList.remove("open");
      manualForm.reset();
      render();
      toast(`Booking ${created.ref} added.`);
    } catch (err) {
      toast(/duplicate|unique/i.test(err.message) ? "That slot is already booked." : "Couldn't add booking: " + err.message);
    }
    submit.disabled = false;
  });

  /* ---------- enquiries ---------- */
  function renderEnquiries() {
    const wrap = document.getElementById("enquiry-list");
    if (!wrap) return;
    const visible = enquiries.filter((q) => q.status !== "archived");
    document.getElementById("enquiry-empty").hidden = visible.length !== 0;
    wrap.innerHTML = visible
      .map((q) => `
        <div class="enquiry ${q.status}">
          <div class="enquiry-head">
            <strong>${escapeHtml(q.name)}</strong>
            <a href="mailto:${escapeHtml(q.email)}?subject=${encodeURIComponent("Re: your OTR Detailing enquiry")}">${escapeHtml(q.email)}</a>
            <span class="sub-text">${new Date(q.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            ${q.status === "new" ? '<span class="badge pending">New</span>' : '<span class="badge completed">Replied</span>'}
          </div>
          <p>${escapeHtml(q.message)}</p>
          <div class="enquiry-actions">
            ${q.status === "new" ? `<button class="btn btn-ghost btn-sm" data-enq="${q.id}" data-set="replied">Mark Replied</button>` : ""}
            <button class="btn btn-ghost btn-sm" data-enq="${q.id}" data-set="archived">Archive</button>
          </div>
        </div>`)
      .join("");
  }
  document.getElementById("enquiry-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-enq]");
    if (!btn) return;
    try {
      await OTRApi.updateEnquiry(btn.dataset.enq, { status: btn.dataset.set });
      const q = enquiries.find((x) => x.id === btn.dataset.enq);
      q.status = btn.dataset.set;
      renderEnquiries();
      render();
    } catch (err) {
      toast("Couldn't update: " + err.message);
    }
  });

  /* ---------- reviews ---------- */
  const REVIEW_BADGE = { pending: '<span class="badge pending">Waiting</span>', approved: '<span class="badge completed">Live</span>', hidden: '<span class="badge cancelled">Hidden</span>' };
  function renderReviews() {
    const wrap = document.getElementById("review-list");
    document.getElementById("review-empty").hidden = reviews.length !== 0;
    wrap.innerHTML = reviews
      .map((r) => `
        <div class="enquiry ${r.status === "pending" ? "new" : ""}">
          <div class="enquiry-head">
            <strong>${escapeHtml(r.name)}</strong>
            <span class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
            <span class="sub-text">${escapeHtml([r.vehicle, r.area].filter(Boolean).join(" · "))}${r.email ? " · " + escapeHtml(r.email) : ""}</span>
            <span class="sub-text">${new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            ${REVIEW_BADGE[r.status]}
          </div>
          <p>${escapeHtml(r.comment)}</p>
          <div class="enquiry-actions">
            ${r.status !== "approved" ? `<button class="btn btn-primary btn-sm" data-rev="${r.id}" data-set="approved">Approve</button>` : ""}
            ${r.status !== "hidden" ? `<button class="btn btn-ghost btn-sm" data-rev="${r.id}" data-set="hidden">Hide</button>` : ""}
            <button class="btn btn-ghost btn-sm" data-rev="${r.id}" data-set="delete">Delete</button>
          </div>
        </div>`)
      .join("");
  }
  document.getElementById("review-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-rev]");
    if (!btn) return;
    const id = btn.dataset.rev;
    try {
      if (btn.dataset.set === "delete") {
        if (!confirm("Delete this review permanently?")) return;
        await OTRApi.deleteReview(id);
        reviews = reviews.filter((r) => r.id !== id);
      } else {
        await OTRApi.updateReview(id, { status: btn.dataset.set });
        reviews.find((r) => r.id === id).status = btn.dataset.set;
        toast(btn.dataset.set === "approved" ? "Review is now live on the website." : "Review hidden.");
      }
      renderReviews();
    } catch (err) {
      toast("Couldn't update: " + err.message);
    }
  });
  document.getElementById("copy-review-link").addEventListener("click", async () => {
    const link = new URL("../reviews.html#leave-review", window.location.href).href;
    try {
      await navigator.clipboard.writeText(link);
      toast("Review link copied — paste it to customers on WhatsApp or Instagram.");
    } catch (e) {
      prompt("Copy this link:", link);
    }
  });

  load();
})();
