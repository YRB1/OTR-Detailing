/* ==========================================================================
   OTR Detailing — admin customers view
   Aggregates the booking records into a per-customer summary.
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

  function money(n) { return "£" + Number(n).toFixed(2); }
  function fmtDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function initials(name) {
    return String(name || "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }

  function buildCustomers() {
    const bookings = OTRStore.getBookings();
    const map = new Map();
    bookings.forEach((b) => {
      const key = (b.customer.email || b.customer.phone || b.customer.name).toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          name: b.customer.name,
          email: b.customer.email,
          phone: b.customer.phone,
          vehicles: new Set(),
          bookingCount: 0,
          totalSpent: 0,
          lastDate: b.date,
        });
      }
      const c = map.get(key);
      c.vehicles.add(`${b.vehicle.make} ${b.vehicle.model}`);
      c.bookingCount += 1;
      if (b.status === "confirmed" || b.status === "completed") c.totalSpent += Number(b.price || 0);
      if (b.date > c.lastDate) c.lastDate = b.date;
    });
    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }

  function render(filterText) {
    const customers = buildCustomers();
    const q = (filterText || "").trim().toLowerCase();
    const list = q
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.email || "").toLowerCase().includes(q) ||
            (c.phone || "").toLowerCase().includes(q)
        )
      : customers;

    document.getElementById("kpi-customers").textContent = customers.length;
    document.getElementById("kpi-repeat").textContent = customers.filter((c) => c.bookingCount > 1).length;
    const totalSpendAll = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    document.getElementById("kpi-avg-spend").textContent = customers.length
      ? money(totalSpendAll / customers.length)
      : "£0";
    document.getElementById("kpi-top").textContent = customers.length ? customers[0].name : "—";

    const tbody = document.getElementById("customers-tbody");
    const emptyState = document.getElementById("empty-state");
    tbody.innerHTML = "";
    emptyState.hidden = list.length !== 0;

    list.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="Customer">
          <div style="display:flex;align-items:center;gap:12px">
            <span class="avatar" style="width:34px;height:34px;font-size:12px">${initials(c.name)}</span>
            <strong>${escapeHtml(c.name)}</strong>
          </div>
        </td>
        <td data-label="Contact"><div>${escapeHtml(c.email)}<br><span style="color:var(--text-faint);font-size:12px">${escapeHtml(c.phone)}</span></div></td>
        <td data-label="Vehicles">${escapeHtml(Array.from(c.vehicles).join(", "))}</td>
        <td data-label="Bookings">${c.bookingCount}</td>
        <td data-label="Total Spent">${money(c.totalSpent)}</td>
        <td data-label="Last Booking">${fmtDate(c.lastDate)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById("customer-search").addEventListener("input", (e) => render(e.target.value));

  render("");
})();
