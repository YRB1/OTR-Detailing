/* ==========================================================================
   OTR Detailing — admin customers view
   Aggregates booking records into a per-customer summary.
   ========================================================================== */

(async function () {
  "use strict";

  if (!(await OTRApi.requireAdmin())) return;

  const money = (pence) => "£" + (pence / 100).toFixed(2);
  function fmtDate(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function initials(name) {
    return String(name || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  }

  let customers = [];

  function buildCustomers(bookings) {
    const map = new Map();
    bookings
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .forEach((b) => {
        const key = (b.customer_email && !b.customer_email.endsWith("@otr.local") ? b.customer_email : b.customer_phone).toLowerCase();
        if (!map.has(key)) {
          map.set(key, { name: b.customer_name, email: b.customer_email.endsWith("@otr.local") ? "" : b.customer_email, phone: b.customer_phone, vehicles: new Set(), bookingCount: 0, totalSpent: 0, lastDate: b.slot_date });
        }
        const c = map.get(key);
        c.vehicles.add(`${b.vehicle_make} ${b.vehicle_model}`);
        c.bookingCount += 1;
        if (b.payment_status === "paid" || b.status === "completed") c.totalSpent += b.price_pence;
        if (b.slot_date > c.lastDate) c.lastDate = b.slot_date;
      });
    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }

  function render(filterText) {
    const q = (filterText || "").trim().toLowerCase();
    const list = q
      ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q))
      : customers;

    document.getElementById("kpi-customers").textContent = customers.length;
    document.getElementById("kpi-repeat").textContent = customers.filter((c) => c.bookingCount > 1).length;
    const total = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    document.getElementById("kpi-avg-spend").textContent = customers.length ? money(total / customers.length) : "£0.00";
    document.getElementById("kpi-top").textContent = customers.length ? customers[0].name : "—";

    const tbody = document.getElementById("customers-tbody");
    document.getElementById("empty-state").hidden = list.length !== 0;
    tbody.innerHTML = list
      .map((c) => `
        <tr>
          <td data-label="Customer">
            <div style="display:flex;align-items:center;gap:12px">
              <span class="avatar" style="width:34px;height:34px;font-size:12px">${escapeHtml(initials(c.name))}</span>
              <strong>${escapeHtml(c.name)}</strong>
            </div>
          </td>
          <td data-label="Contact"><div>${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : "—"}<br><span class="sub-text">${escapeHtml(c.phone)}</span></div></td>
          <td data-label="Vehicles">${escapeHtml(Array.from(c.vehicles).join(", "))}</td>
          <td data-label="Bookings">${c.bookingCount}</td>
          <td data-label="Total Spent">${money(c.totalSpent)}</td>
          <td data-label="Last Booking">${fmtDate(c.lastDate)}</td>
        </tr>`)
      .join("");
  }

  document.getElementById("customer-search").addEventListener("input", (e) => render(e.target.value));

  try {
    customers = buildCustomers(await OTRApi.listBookings());
  } catch (err) {
    window.otrToast && window.otrToast("Couldn't load customers: " + err.message);
  }
  render("");
})();
