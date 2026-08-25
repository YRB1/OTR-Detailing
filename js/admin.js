/* ==========================================================================
   OTR Detailing — admin dashboard logic
   ========================================================================== */

(function () {
  "use strict";

  if (!OTRStore.isAuthed()) {
    window.location.href = "login.html";
    return;
  }

  const tbody = document.getElementById("bookings-tbody");
  const emptyState = document.getElementById("empty-state");
  const filterRow = document.getElementById("filter-row");
  let activeFilter = "all";

  document.getElementById("logout-btn").addEventListener("click", () => {
    OTRStore.logout();
    window.location.href = "login.html";
  });

  const STATUS_ORDER = ["pending", "confirmed", "completed", "cancelled"];
  const STATUS_LABEL = { pending: "Pending", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" };

  function money(n) { return "£" + Number(n).toFixed(2); }
  function fmtDate(iso, time) {
    const d = new Date(iso + "T00:00:00");
    const opts = { day: "numeric", month: "short" };
    return d.toLocaleDateString("en-GB", opts) + (time ? ` · ${time}` : "");
  }

  const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function renderChart(all) {
    const chartEl = document.getElementById("chart-bars");
    if (!chartEl) return;
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) days.push(new Date(today.getTime() - i * 86400000));
    const counts = days.map((d) => {
      const iso = d.toISOString().slice(0, 10);
      return all.filter((b) => (b.createdAt || "").slice(0, 10) === iso).length;
    });
    const max = Math.max(1, ...counts);
    chartEl.innerHTML = days
      .map(
        (d, i) => `
        <div class="chart-bar-col">
          <div class="chart-bar" data-h="${Math.round((counts[i] / max) * 100)}"><span class="val">${counts[i]}</span></div>
          <div class="day-lbl">${DOW_SHORT[d.getDay()]}</div>
        </div>`
      )
      .join("");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chartEl.querySelectorAll(".chart-bar").forEach((bar) => {
          bar.style.height = bar.getAttribute("data-h") + "%";
        });
      });
    });
  }

  function render() {
    const all = OTRStore.getBookings();
    const list = activeFilter === "all" ? all : all.filter((b) => b.status === activeFilter);

    // KPIs (always computed from the full set, not the filtered view)
    document.getElementById("kpi-total").textContent = all.length;
    document.getElementById("kpi-pending").textContent = all.filter((b) => b.status === "pending").length;
    const todayIso = new Date().toISOString().slice(0, 10);
    document.getElementById("kpi-upcoming").textContent = all.filter(
      (b) => b.date >= todayIso && b.status !== "cancelled"
    ).length;
    const revenue = all
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .reduce((sum, b) => sum + Number(b.price || 0), 0);
    document.getElementById("kpi-revenue").textContent = money(revenue);
    renderChart(all);

    tbody.innerHTML = "";
    emptyState.hidden = list.length !== 0;

    list.forEach((b) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${b.id}</strong></td>
        <td>${escapeHtml(b.customer.name)}<br><span style="color:var(--text-faint);font-size:12px">${escapeHtml(b.customer.phone)}</span></td>
        <td>${escapeHtml(b.vehicle.color)} ${escapeHtml(b.vehicle.make)} ${escapeHtml(b.vehicle.model)}</td>
        <td>${escapeHtml(b.serviceName)}</td>
        <td>${fmtDate(b.date, b.time)}</td>
        <td>${money(b.price)}</td>
        <td>
          <select class="status-select" data-id="${b.id}" style="background:var(--bg-alt);border:1px solid var(--line-strong);border-radius:8px;padding:6px 10px;font-size:12.5px;margin-top:8px">
            ${STATUS_ORDER.map((s) => `<option value="${s}" ${s === b.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}
          </select>
        </td>
        <td>
          <div class="row-actions">
            <button class="icon-btn view-btn" data-id="${b.id}" title="View details">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="icon-btn danger delete-btn" data-id="${b.id}" title="Delete booking">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>
            </button>
          </div>
        </td>
      `;
      const statusCell = tr.children[6];
      statusCell.style.whiteSpace = "nowrap";
      const badge = document.createElement("span");
      badge.className = `badge ${b.status}`;
      badge.textContent = STATUS_LABEL[b.status];
      statusCell.prepend(badge);
      const br = document.createElement("br");
      statusCell.insertBefore(br, statusCell.children[1]);
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".status-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        OTRStore.updateStatus(sel.getAttribute("data-id"), sel.value);
        render();
        window.otrToast && window.otrToast(`Booking ${sel.getAttribute("data-id")} marked ${STATUS_LABEL[sel.value]}.`);
      });
    });

    tbody.querySelectorAll(".view-btn").forEach((btn) => {
      btn.addEventListener("click", () => openDetail(btn.getAttribute("data-id")));
    });
    tbody.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => openDelete(btn.getAttribute("data-id")));
    });
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

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
    const b = OTRStore.getBookings().find((x) => x.id === id);
    if (!b) return;
    detailGrid.innerHTML = `
      <div class="drow"><span>Reference</span><span>${b.id}</span></div>
      <div class="drow"><span>Status</span><span class="badge ${b.status}">${STATUS_LABEL[b.status]}</span></div>
      <div class="drow"><span>Service</span><span>${escapeHtml(b.serviceName)}</span></div>
      <div class="drow"><span>Price</span><span>${money(b.price)}</span></div>
      <div class="drow"><span>Vehicle</span><span>${escapeHtml(b.vehicle.color)} ${escapeHtml(b.vehicle.make)} ${escapeHtml(b.vehicle.model)}</span></div>
      <div class="drow"><span>Date &amp; Time</span><span>${fmtDate(b.date, b.time)}</span></div>
      <div class="drow"><span>Customer</span><span>${escapeHtml(b.customer.name)}</span></div>
      <div class="drow"><span>Phone</span><span>${escapeHtml(b.customer.phone)}</span></div>
      <div class="drow"><span>Email</span><span>${escapeHtml(b.customer.email)}</span></div>
      <div class="drow"><span>Address</span><span>${escapeHtml(b.customer.address)}</span></div>
      ${b.notes ? `<div class="drow"><span>Notes</span><span>${escapeHtml(b.notes)}</span></div>` : ""}
      <div class="drow"><span>Booked On</span><span>${new Date(b.createdAt).toLocaleString("en-GB")}</span></div>
    `;
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
  document.getElementById("delete-confirm").addEventListener("click", () => {
    if (pendingDeleteId) {
      OTRStore.deleteBooking(pendingDeleteId);
      window.otrToast && window.otrToast(`Booking ${pendingDeleteId} deleted.`);
      pendingDeleteId = null;
      render();
    }
    deleteModal.classList.remove("open");
  });

  render();
})();
