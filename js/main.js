/* ==========================================================================
   OTR Detailing — shared front-end behaviour
   Nav, scroll reveals, counters, carousels, lightbox, contact form, toast
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Mobile nav ---------- */
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      navToggle.classList.toggle("open");
      navLinks.classList.toggle("open");
    });
    navLinks.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        navToggle.classList.remove("open");
        navLinks.classList.remove("open");
      })
    );
  }

  /* ---------- Nav scrolled state ---------- */
  const nav = document.querySelector(".nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll(".reveal, .reveal-scale, .stagger");
  if (revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            if (entry.target.classList.contains("stagger")) {
              Array.from(entry.target.children).forEach((child, i) => {
                child.style.setProperty("--i", i);
                child.classList.add("reveal");
                requestAnimationFrame(() => child.classList.add("in"));
              });
            }
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---------- Animated counters ---------- */
  const counters = document.querySelectorAll("[data-count]");
  if (counters.length) {
    const countIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const target = parseFloat(el.getAttribute("data-count"));
          const decimals = el.getAttribute("data-decimals") ? parseInt(el.getAttribute("data-decimals"), 10) : 0;
          const suffix = el.getAttribute("data-suffix") || "";
          const duration = 1600;
          const start = performance.now();
          function tick(now) {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            const val = target * eased;
            el.textContent = val.toFixed(decimals) + suffix;
            if (p < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
          countIo.unobserve(el);
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((el) => countIo.observe(el));
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Hero slideshow (crossfade) ---------- */
  const heroSlides = Array.from(document.querySelectorAll(".hero-slide"));
  if (heroSlides.length > 1 && !reduceMotion) {
    let heroIndex = 0;
    setInterval(() => {
      if (document.hidden) return;
      heroSlides[heroIndex].classList.remove("active");
      heroIndex = (heroIndex + 1) % heroSlides.length;
      const next = heroSlides[heroIndex];
      next.loading = "eager";
      next.classList.add("active");
      // warm the one after so it's ready before its turn
      heroSlides[(heroIndex + 1) % heroSlides.length].loading = "eager";
    }, 5500);
  }

  /* ---------- Reels: play while on screen, tap to pause ---------- */
  const reels = document.querySelectorAll(".reel video");
  if (reels.length) {
    const reelIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const v = entry.target;
          if (entry.isIntersecting && !reduceMotion && !v.dataset.userPaused) v.play().catch(() => {});
          else v.pause();
        });
      },
      { threshold: 0.5 }
    );
    reels.forEach((v) => {
      reelIo.observe(v);
      v.closest(".reel").addEventListener("click", () => {
        if (v.paused) { delete v.dataset.userPaused; v.play().catch(() => {}); }
        else { v.dataset.userPaused = "1"; v.pause(); }
      });
    });
  }

  /* ---------- Generic carousel factory ---------- */
  function initCarousel(root, { auto = false, interval = 4500 } = {}) {
    const track = root.querySelector(".carousel-track, .reviews-track");
    const slides = Array.from(track.children);
    const prevBtn = root.querySelector(".prev");
    const nextBtn = root.querySelector(".next");
    const dotsWrap = root.querySelector(".carousel-dots, .reviews-dots");
    let index = 0;
    let timer = null;

    if (dotsWrap) {
      dotsWrap.innerHTML = "";
      slides.forEach((_, i) => {
        const b = document.createElement("button");
        if (i === 0) b.classList.add("active");
        b.setAttribute("aria-label", "Go to slide " + (i + 1));
        b.addEventListener("click", () => goTo(i));
        dotsWrap.appendChild(b);
      });
    }

    function render() {
      track.style.transform = `translateX(-${index * 100}%)`;
      if (dotsWrap) {
        Array.from(dotsWrap.children).forEach((d, i) => d.classList.toggle("active", i === index));
      }
    }

    function goTo(i) {
      index = (i + slides.length) % slides.length;
      render();
      restart();
    }

    function next() { goTo(index + 1); }
    function prev() { goTo(index - 1); }

    function restart() {
      if (!auto) return;
      clearInterval(timer);
      timer = setInterval(next, interval);
    }

    if (nextBtn) nextBtn.addEventListener("click", next);
    if (prevBtn) prevBtn.addEventListener("click", prev);

    // touch swipe
    let startX = null;
    track.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX), { passive: true });
    track.addEventListener(
      "touchend",
      (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
        startX = null;
      },
      { passive: true }
    );

    render();
    restart();
    return { goTo, next, prev, root };
  }

  /* ---------- Car showcase (tabs + carousel) ---------- */
  const showcase = document.querySelector("[data-showcase]");
  if (showcase) {
    const tabs = Array.from(showcase.querySelectorAll(".car-tab"));
    const carouselEl = showcase.querySelector(".carousel");
    const track = carouselEl.querySelector(".carousel-track");
    let instance = initCarousel(carouselEl, { auto: true, interval: 4200 });

    function loadCar(car) {
      const data = JSON.parse(car.getAttribute("data-images"));
      // Photos are mostly portrait: show the whole shot over a blurred fill.
      track.innerHTML = data
        .map(
          (src) =>
            `<div class="carousel-slide" data-src="${src.src}">
               <img class="slide-fill" src="${src.src}" alt="" aria-hidden="true" loading="lazy">
               <img class="slide-photo" src="${src.src}" alt="${src.alt}" loading="lazy">
               <div class="slide-caption">${src.alt}</div>
             </div>`
        )
        .join("");
      instance = initCarousel(carouselEl, { auto: true, interval: 4200 });
      bindLightbox();
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        loadCar(tab);
      });
    });

    if (tabs[0]) loadCar(tabs[0]);
  } else {
    // static (non-tabbed) carousels e.g. reviews
    document.querySelectorAll(".carousel").forEach((el) => initCarousel(el, { auto: true, interval: 4600 }));
  }

  document.querySelectorAll(".reviews-wrap .carousel, [data-reviews]").forEach((el) => {
    initCarousel(el, { auto: true, interval: 5200 });
  });

  /* ---------- Lightbox (with prev/next + counter + keyboard) ---------- */
  let lightboxEl = null;
  let lbImages = [];
  let lbIndex = 0;

  function ensureLightbox() {
    if (lightboxEl) return lightboxEl;
    lightboxEl = document.createElement("div");
    lightboxEl.className = "lightbox";
    lightboxEl.innerHTML = `
      <button class="lightbox-close" aria-label="Close">${iconClose()}</button>
      <button class="lightbox-nav lb-prev" aria-label="Previous image">${iconChevron(true)}</button>
      <img alt="">
      <button class="lightbox-nav lb-next" aria-label="Next image">${iconChevron(false)}</button>
      <div class="lightbox-counter"></div>
    `;
    document.body.appendChild(lightboxEl);
    lightboxEl.addEventListener("click", (e) => {
      if (e.target === lightboxEl || e.target.closest(".lightbox-close")) closeLightbox();
      else if (e.target.closest(".lb-prev")) showLightbox(lbIndex - 1);
      else if (e.target.closest(".lb-next")) showLightbox(lbIndex + 1);
    });
    document.addEventListener("keydown", (e) => {
      if (!lightboxEl.classList.contains("open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") showLightbox(lbIndex - 1);
      if (e.key === "ArrowRight") showLightbox(lbIndex + 1);
    });
    return lightboxEl;
  }

  function showLightbox(i) {
    if (!lbImages.length) return;
    lbIndex = (i + lbImages.length) % lbImages.length;
    const data = lbImages[lbIndex];
    const lb = ensureLightbox();
    lb.querySelector("img").src = data.src;
    lb.querySelector("img").alt = data.alt || "";
    const counter = lb.querySelector(".lightbox-counter");
    const multi = lbImages.length > 1;
    counter.style.display = multi ? "block" : "none";
    counter.textContent = `${lbIndex + 1} / ${lbImages.length}`;
    lb.querySelectorAll(".lightbox-nav").forEach((b) => (b.style.display = multi ? "grid" : "none"));
  }

  function openLightbox(images, startIndex) {
    lbImages = images;
    const lb = ensureLightbox();
    showLightbox(startIndex);
    lb.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    if (!lightboxEl) return;
    lightboxEl.classList.remove("open");
    document.body.style.overflow = "";
  }
  function bindLightbox() {
    const slides = Array.from(document.querySelectorAll(".carousel-slide"));
    const images = slides.map((slide) => {
      const img = slide.querySelector("img.slide-photo") || slide.querySelector("img");
      return { src: img ? img.src : slide.getAttribute("data-src"), alt: img ? img.alt : "" };
    });
    slides.forEach((slide, i) => {
      slide.onclick = () => openLightbox(images, i);
    });
  }
  bindLightbox();

  function iconClose() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  }
  function iconChevron(left) {
    const d = left ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6";
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  }

  /* ---------- Scroll progress bar ---------- */
  const progressBar = document.createElement("div");
  progressBar.className = "scroll-progress";
  document.body.appendChild(progressBar);
  function updateProgress() {
    const h = document.documentElement;
    const scrollTop = h.scrollTop || document.body.scrollTop;
    const scrollHeight = (h.scrollHeight || document.body.scrollHeight) - h.clientHeight;
    progressBar.style.width = (scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0) + "%";
  }
  updateProgress();
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);

  /* ---------- Back to top ---------- */
  const backToTop = document.createElement("button");
  backToTop.className = "back-to-top";
  backToTop.setAttribute("aria-label", "Back to top");
  backToTop.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  document.body.appendChild(backToTop);
  backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", () => backToTop.classList.toggle("show", window.scrollY > 520), { passive: true });

  /* ---------- Sticky booking CTA (marketing pages only) ---------- */
  const isBookingPage = !!document.querySelector("#booking-form");
  const isAdminPage = !!document.querySelector(".admin-shell, .admin-login-wrap");
  if (!isBookingPage && !isAdminPage) {
    const brandImg = document.querySelector(".brand img");
    const bookLink = document.querySelector('a[href*="booking.html"]');
    const cta = document.createElement("div");
    cta.className = "sticky-cta";
    cta.innerHTML = `
      <div class="sc-left">
        <img class="sc-logo" src="${brandImg ? brandImg.getAttribute("src") : "assets/images/logo.jpg"}" alt="">
        <div class="sc-text">
          <strong>Ready when you are</strong>
          <span>Mobile detailing across Coventry</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:16px">
        <span class="sc-price">From £20</span>
        <a href="${bookLink ? bookLink.getAttribute("href").split("?")[0] : "booking.html"}" class="btn btn-primary btn-sm">Book Now</a>
      </div>
    `;
    document.body.appendChild(cta);
    backToTop.classList.add("above-cta");
    window.addEventListener(
      "scroll",
      () =>
        cta.classList.toggle(
          "show",
          window.scrollY > window.innerHeight * 0.85 && !document.querySelector(".cookie-banner.show")
        ),
      { passive: true }
    );
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll(".faq-item").forEach((item) => {
    const q = item.querySelector(".faq-q");
    const wrap = item.querySelector(".faq-a-wrap");
    if (!q || !wrap) return;
    q.addEventListener("click", () => {
      const willOpen = !item.classList.contains("open");
      document.querySelectorAll(".faq-item.open").forEach((other) => {
        if (other !== item) {
          other.classList.remove("open");
          other.querySelector(".faq-a-wrap").style.maxHeight = "";
        }
      });
      item.classList.toggle("open", willOpen);
      wrap.style.maxHeight = willOpen ? wrap.scrollHeight + "px" : "";
    });
  });

  /* ---------- Before / after compare slider ---------- */
  document.querySelectorAll(".compare-slider").forEach((slider) => {
    const beforeWrap = slider.querySelector(".compare-before-wrap");
    const handle = slider.querySelector(".compare-handle");
    const beforeImg = beforeWrap ? beforeWrap.querySelector("img") : null;
    if (!beforeWrap || !handle || !beforeImg) return;

    function syncImgWidth() {
      beforeImg.style.width = slider.offsetWidth + "px";
    }
    function setPct(pct) {
      pct = Math.max(2, Math.min(98, pct));
      beforeWrap.style.width = pct + "%";
      handle.style.left = pct + "%";
    }
    function pctFromX(clientX) {
      const rect = slider.getBoundingClientRect();
      return ((clientX - rect.left) / rect.width) * 100;
    }

    syncImgWidth();
    window.addEventListener("resize", syncImgWidth);
    setPct(50);

    let dragging = false;
    slider.addEventListener("pointerdown", (e) => {
      dragging = true;
      slider.setPointerCapture && slider.setPointerCapture(e.pointerId);
      setPct(pctFromX(e.clientX));
    });
    slider.addEventListener("pointermove", (e) => {
      if (dragging) setPct(pctFromX(e.clientX));
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((evt) =>
      slider.addEventListener(evt, () => (dragging = false))
    );
  });

  /* ---------- Toast ---------- */
  window.otrToast = function (message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.innerHTML = `<span class="ico">${iconCheck()}</span><span class="msg"></span>`;
      document.body.appendChild(toast);
    }
    toast.querySelector(".msg").textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove("show"), 3400);
  };
  function iconCheck() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  }

  /* ---------- Backend helpers (marketing pages use plain fetch, no SDK) ---------- */
  const cfg = window.OTR_CONFIG || {};
  const backendReady = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const backendHeaders = { apikey: cfg.supabaseAnonKey, Authorization: "Bearer " + cfg.supabaseAnonKey };

  /* ---------- Live prices (owner can change them in admin Settings) ---------- */
  if (backendReady && document.querySelector("[data-price-for], [data-price-num], .sticky-cta .sc-price")) {
    fetch(cfg.supabaseUrl + "/rest/v1/services?select=id,price_pence&active=eq.true", { headers: backendHeaders })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!rows.length) return;
        const fmt = (pence) => { const p = pence / 100; return Number.isInteger(p) ? String(p) : p.toFixed(2); };
        const byId = Object.fromEntries(rows.map((r) => [r.id, r.price_pence]));
        document.querySelectorAll("[data-price-for]").forEach((el) => {
          const p = byId[el.getAttribute("data-price-for")];
          if (p != null) el.textContent = "£" + fmt(p);
        });
        document.querySelectorAll("[data-price-num]").forEach((el) => {
          const p = byId[el.getAttribute("data-price-num")];
          if (p != null) el.textContent = fmt(p);
        });
        const cheapest = Math.min(...rows.map((r) => r.price_pence));
        document.querySelectorAll(".sticky-cta .sc-price").forEach((el) => (el.textContent = "From £" + fmt(cheapest)));
      })
      .catch(() => {});
  }

  /* ---------- Reviews (approved only) ---------- */
  const reviewLists = document.querySelectorAll("[data-reviews-list]");
  if (reviewLists.length && backendReady) {
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const initials = (n) => String(n).split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    fetch(cfg.supabaseUrl + "/rest/v1/rpc/get_approved_reviews", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, backendHeaders),
      body: JSON.stringify({ max_rows: 100 }),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((reviews) => {
        reviewLists.forEach((list) => {
          const shown = reviews.slice(0, Number(list.getAttribute("data-limit")) || 100);
          const isCarousel = list.getAttribute("data-variant") === "carousel";
          const card = (r) => `
                <div class="stars" aria-label="${r.rating} out of 5 stars">${"★".repeat(r.rating)}<span class="stars-off">${"★".repeat(5 - r.rating)}</span></div>
                <p class="quote">"${esc(r.comment)}"</p>
                <div class="author">
                  <span class="avatar">${esc(initials(r.name))}</span>
                  <div>
                    <div class="author-name">${esc(r.name)}</div>
                    <div class="author-meta">${esc([r.vehicle, r.area].filter(Boolean).join(" · ") || new Date(r.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" }))}</div>
                  </div>
                </div>`;
          list.innerHTML = shown
            .map((r) => isCarousel
              ? `<div class="review-slide"><article class="review-card">${card(r)}</article></div>`
              : `<article class="review-tile">${card(r)}</article>`)
            .join("");
          const carousel = list.closest("[data-reviews-carousel]");
          if (carousel && shown.length) {
            carousel.hidden = false;
            carousel.classList.toggle("single", shown.length < 2);
            const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            initCarousel(carousel, { auto: shown.length > 1 && !reduceMotion, interval: 6000 });
          }
          const empty = list.closest("section").querySelector("[data-reviews-empty]");
          if (empty) empty.hidden = shown.length > 0;
        });
        const summary = document.getElementById("review-summary");
        if (summary && reviews.length) {
          const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
          summary.innerHTML = `<span class="stars">★★★★★</span> <strong>${avg.toFixed(1)}</strong> from ${reviews.length} review${reviews.length === 1 ? "" : "s"}`;
          summary.hidden = false;
        }
      })
      .catch(() => {});
  }

  const reviewForm = document.querySelector("#review-form");
  if (reviewForm) {
    reviewForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rating = reviewForm.querySelector('input[name="rating"]:checked');
      document.getElementById("star-error").hidden = !!rating;
      let valid = !!rating;
      [["rv-name", (v) => v.trim().length > 0], ["rv-comment", (v) => v.trim().length >= 10]].forEach(([id, test]) => {
        const el = document.getElementById(id);
        const ok = test(el.value);
        el.closest(".form-row").classList.toggle("invalid", !ok);
        if (!ok) valid = false;
      });
      if (!valid) return;
      if (!backendReady) return window.otrToast("Reviews can't be sent right now — please try again later.");

      const btn = reviewForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        const f = reviewForm.elements;
        const res = await fetch(cfg.supabaseUrl + "/functions/v1/submit-review", {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, backendHeaders),
          body: JSON.stringify({
            rating: Number(rating.value), name: f.name.value, vehicle: f.vehicle.value, area: f.area.value,
            email: f.email.value, comment: f.comment.value, company: f.company.value,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't send your review. Please try again.");
        reviewForm.innerHTML = '<div class="review-thanks"><div class="confirm-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div><h3>Thank you!</h3><p>Your review has been sent and will appear once it\'s been checked.</p></div>';
      } catch (err) {
        window.otrToast(err.message);
        btn.disabled = false;
        btn.textContent = "Submit Review";
      }
    });
  }

  /* ---------- Contact form ---------- */
  const contactForm = document.querySelector("#contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      let valid = true;
      contactForm.querySelectorAll("[required]").forEach((field) => {
        const row = field.closest(".form-row");
        const ok = field.type === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim()) : field.value.trim().length > 0;
        row.classList.toggle("invalid", !ok);
        if (!ok) valid = false;
      });
      if (!valid) return;

      const fallback = `Couldn't send right now — please email ${cfg.contactEmail || "us"} or message us on Instagram.`;
      if (!backendReady) return window.otrToast(fallback);

      const btn = contactForm.querySelector('button[type="submit"]');
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        const res = await fetch(cfg.supabaseUrl + "/functions/v1/contact", {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, backendHeaders),
          body: JSON.stringify({
            name: contactForm.elements.name.value,
            email: contactForm.elements.email.value,
            message: contactForm.elements.message.value,
            company: contactForm.elements.company ? contactForm.elements.company.value : "",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || fallback);
        contactForm.reset();
        window.otrToast("Message sent — Gideon will reply within 24 hours.");
      } catch (err) {
        window.otrToast(err.message || fallback);
      }
      btn.disabled = false;
      btn.textContent = label;
    });
  }

  /* ---------- Active nav link highlight ---------- */
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a[href]").forEach((a) => {
    const href = a.getAttribute("href").split("/").pop();
    if (href === path) a.classList.add("active");
  });

  /* ---------- Admin session idle timeout ----------
     Signs the owner out after a period of inactivity on admin pages, so a
     dashboard left open on a shared device doesn't stay logged in. */
  if (document.querySelector(".admin-shell") && typeof OTRApi !== "undefined") {
    let idleTimer;
    function resetIdleTimer() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(async () => {
        await OTRApi.signOut();
        window.location.href = "login.html?expired=1";
      }, OTRApi.IDLE_TIMEOUT_MS);
    }
    ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach((evt) =>
      document.addEventListener(evt, resetIdleTimer, { passive: true })
    );
    resetIdleTimer();
  }

  /* ---------- Cookie consent banner ---------- */
  if (!localStorage.getItem("otr_cookie_consent")) {
    const banner = document.createElement("div");
    banner.className = "cookie-banner";
    const onAdminPage = !!document.querySelector(".admin-shell, .admin-login-wrap");
    const prefix = onAdminPage ? "../" : "";
    banner.innerHTML = `
      <p>We only use essential storage — to keep the owner signed in and to take payments securely through Stripe. No advertising or tracking cookies. See our <a href="${prefix}cookies.html">Cookie Policy</a>.</p>
      <div class="cookie-actions">
        <a href="${prefix}cookies.html" class="btn btn-ghost btn-sm">Learn More</a>
        <button type="button" class="btn btn-primary btn-sm" id="cookie-accept">Got It</button>
      </div>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add("show"));
    document.getElementById("cookie-accept").addEventListener("click", () => {
      localStorage.setItem("otr_cookie_consent", "1");
      banner.classList.remove("show");
      setTimeout(() => banner.remove(), 400);
    });
  }
})();
