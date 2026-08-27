/* ==========================================================================
   OTR Detailing — local "database" layer (localStorage)
   Shared between booking.html and the admin dashboard.
   This is a front-end mockup: no server, no real payments.
   ========================================================================== */

const OTRStore = (function () {
  "use strict";

  const BOOKINGS_KEY = "otr_bookings";
  const AUTH_KEY = "otr_admin_auth";
  const REMEMBER_KEY = "otr_admin_remember_user";
  const SETTINGS_KEY = "otr_settings";

  const DEFAULT_SETTINGS = {
    businessName: "OTR Detailing",
    email: "otr.detailinguk@gmail.com",
    phone: "",
    area: "Coventry & surrounding areas",
    hours: "Mon – Sat, 8am – 6pm",
    cancellationFee: 15,
    prices: { interior: 30, exterior: 20, full: 40 },
  };

  function getSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : Object.assign({}, DEFAULT_SETTINGS);
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  const SERVICES = {
    interior: { id: "interior", name: "Interior Clean", price: 30 },
    exterior: { id: "exterior", name: "Exterior Clean", price: 20 },
    full: { id: "full", name: "Full Interior & Exterior", price: 40 },
  };

  function readAll() {
    try {
      const raw = localStorage.getItem(BOOKINGS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeAll(list) {
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(list));
  }

  function makeRef() {
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    const t = Date.now().toString(36).slice(-3).toUpperCase();
    return `OTR-${t}${rnd}`;
  }

  function seedIfEmpty() {
    const existing = readAll();
    if (existing !== null) return;
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const demo = [
      {
        id: makeRef(),
        service: "full",
        serviceName: SERVICES.full.name,
        price: SERVICES.full.price,
        vehicle: { make: "Skoda", model: "Fabia", color: "Blue" },
        date: iso(new Date(today.getTime() + 1000 * 60 * 60 * 24 * 2)),
        time: "10:00",
        customer: { name: "Amelia Clarke", phone: "07700 900123", email: "amelia.clarke@example.com", address: "14 Holbrook Lane, Coventry" },
        notes: "Front garden, hose is round the side.",
        status: "confirmed",
        createdAt: new Date(today.getTime() - 1000 * 60 * 60 * 20).toISOString(),
      },
      {
        id: makeRef(),
        service: "exterior",
        serviceName: SERVICES.exterior.name,
        price: SERVICES.exterior.price,
        vehicle: { make: "Mercedes-Benz", model: "C220d Coupe", color: "White" },
        date: iso(new Date(today.getTime() + 1000 * 60 * 60 * 24 * 4)),
        time: "13:30",
        customer: { name: "Daniel Osei", phone: "07700 900456", email: "d.osei@example.com", address: "22 Cheylesmore Grange, Coventry" },
        notes: "",
        status: "pending",
        createdAt: new Date(today.getTime() - 1000 * 60 * 60 * 5).toISOString(),
      },
      {
        id: makeRef(),
        service: "interior",
        serviceName: SERVICES.interior.name,
        price: SERVICES.interior.price,
        vehicle: { make: "Seat", model: "Ibiza FR", color: "Grey" },
        date: iso(new Date(today.getTime() - 1000 * 60 * 60 * 24 * 3)),
        time: "11:00",
        customer: { name: "Priya Shah", phone: "07700 900789", email: "priya.shah@example.com", address: "5 Binley Road, Coventry" },
        notes: "Dog hair on rear seats.",
        status: "completed",
        createdAt: new Date(today.getTime() - 1000 * 60 * 60 * 24 * 5).toISOString(),
      },
      {
        id: makeRef(),
        service: "full",
        serviceName: SERVICES.full.name,
        price: SERVICES.full.price,
        vehicle: { make: "Ford", model: "Fiesta", color: "Cream" },
        date: iso(new Date(today.getTime() - 1000 * 60 * 60 * 24 * 1)),
        time: "09:00",
        customer: { name: "Jack Wheeler", phone: "07700 900321", email: "jack.w@example.com", address: "9 Stoke Green, Coventry" },
        notes: "",
        status: "cancelled",
        createdAt: new Date(today.getTime() - 1000 * 60 * 60 * 24 * 6).toISOString(),
      },
      {
        id: makeRef(),
        service: "exterior",
        serviceName: SERVICES.exterior.name,
        price: SERVICES.exterior.price,
        vehicle: { make: "Ford", model: "Fiesta", color: "Black" },
        date: iso(new Date(today.getTime() + 1000 * 60 * 60 * 24 * 3)),
        time: "14:00",
        customer: { name: "Kamran Patrick Dha", phone: "07700 900654", email: "kamran.dha@example.com", address: "31 Radford Road, Coventry" },
        notes: "",
        status: "pending",
        createdAt: new Date(today.getTime() - 1000 * 60 * 60 * 2).toISOString(),
      },
    ];
    writeAll(demo);
  }

  function getBookings() {
    seedIfEmpty();
    return (readAll() || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function addBooking(data) {
    const list = readAll() || [];
    const booking = Object.assign(
      {
        id: makeRef(),
        status: "pending",
        createdAt: new Date().toISOString(),
      },
      data
    );
    list.push(booking);
    writeAll(list);
    return booking;
  }

  function updateStatus(id, status) {
    const list = readAll() || [];
    const idx = list.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    list[idx].status = status;
    writeAll(list);
    return list[idx];
  }

  function deleteBooking(id) {
    const list = (readAll() || []).filter((b) => b.id !== id);
    writeAll(list);
  }

  /* ---------- auth ----------
     This is a static front-end mockup with no server, so this cannot be
     real authentication — the "password" ships in this readable JS file
     no matter how it's obscured. What's implemented here (attempt lockout,
     idle timeout) is realistic *client-side UX* for those features, not
     a substitute for server-side auth, hashed credentials over HTTPS, and
     rate limiting that a real backend would need. */
  const DEMO_USER = "gideon";
  const DEMO_PASS = "otr2026";
  const ATTEMPTS_KEY = "otr_admin_attempts";
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 60 * 1000;
  const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

  function getAttemptState() {
    try {
      return Object.assign({ count: 0, lockedUntil: 0 }, JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY)));
    } catch (e) {
      return { count: 0, lockedUntil: 0 };
    }
  }
  function setAttemptState(state) {
    sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(state));
  }
  function isLockedOut() {
    return getAttemptState().lockedUntil > Date.now();
  }
  function getLockoutSecondsLeft() {
    return Math.max(0, Math.ceil((getAttemptState().lockedUntil - Date.now()) / 1000));
  }
  function getAttemptsLeft() {
    return Math.max(0, MAX_ATTEMPTS - getAttemptState().count);
  }
  function recordFailedAttempt() {
    const state = getAttemptState();
    state.count += 1;
    if (state.count >= MAX_ATTEMPTS) {
      state.lockedUntil = Date.now() + LOCKOUT_MS;
      state.count = 0;
    }
    setAttemptState(state);
  }
  function clearAttempts() {
    sessionStorage.removeItem(ATTEMPTS_KEY);
  }

  function login(user, pass, remember) {
    if (isLockedOut()) return false;
    if (user.trim().toLowerCase() === DEMO_USER && pass === DEMO_PASS) {
      clearAttempts();
      if (remember) {
        localStorage.setItem(AUTH_KEY, "1");
        localStorage.setItem(REMEMBER_KEY, user.trim());
        sessionStorage.removeItem(AUTH_KEY);
      } else {
        sessionStorage.setItem(AUTH_KEY, "1");
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(REMEMBER_KEY);
      }
      return true;
    }
    recordFailedAttempt();
    return false;
  }

  function isAuthed() {
    return localStorage.getItem(AUTH_KEY) === "1" || sessionStorage.getItem(AUTH_KEY) === "1";
  }

  function logout() {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
  }

  function getRememberedUser() {
    return localStorage.getItem(REMEMBER_KEY) || "";
  }

  return {
    SERVICES,
    getBookings,
    addBooking,
    updateStatus,
    deleteBooking,
    login,
    isAuthed,
    logout,
    getRememberedUser,
    getSettings,
    saveSettings,
    isLockedOut,
    getLockoutSecondsLeft,
    getAttemptsLeft,
    IDLE_TIMEOUT_MS,
  };
})();
