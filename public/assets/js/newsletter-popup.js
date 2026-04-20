/**
 * Go Ukraina Newsletter Popup
 * Loads settings from /api/admin/settings?key=newsletter_popup
 * Submits to /api/newsletter/subscribe
 * Shows once per session (sessionStorage) unless dismissed within 24h (localStorage)
 */
(function () {
  "use strict";

  const DISMISS_KEY = "gu_nl_dismissed";
  const DISMISS_TTL = 24 * 60 * 60 * 1000; // 24 hours

  function isDismissed() {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      const ts = parseInt(raw, 10);
      return Date.now() - ts < DISMISS_TTL;
    } catch {
      return false;
    }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .gu-nl-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(8,13,24,.75);backdrop-filter:blur(4px);animation:gu-nl-fade .25s ease}
      .gu-nl-overlay.gu-nl-hidden{display:none}
      .gu-nl-card{position:relative;width:100%;max-width:440px;background:linear-gradient(135deg,#0d1425 0%,#121b2e 100%);border:1px solid rgba(212,168,75,.28);border-radius:1rem;padding:2.25rem 2rem 2rem;box-shadow:0 24px 64px rgba(0,0,0,.5);animation:gu-nl-up .3s cubic-bezier(.22,1,.36,1)}
      .gu-nl-flag{display:flex;gap:.5rem;align-items:center;margin-bottom:1.25rem}
      .gu-nl-flag-stripe{height:4px;border-radius:2px}
      .gu-nl-flag-stripe:first-child{background:#1565c0;width:2rem}
      .gu-nl-flag-stripe:last-child{background:#d4a84b;width:2rem}
      .gu-nl-card h2{margin:0 0 .5rem;font-size:1.35rem;font-weight:700;color:#e8ecf4;line-height:1.25;font-family:system-ui,sans-serif}
      .gu-nl-card p{margin:0 0 1.25rem;color:#9aa4ba;font-size:.92rem;line-height:1.55;font-family:system-ui,sans-serif}
      .gu-nl-form{display:flex;flex-direction:column;gap:.625rem}
      .gu-nl-input{border:1px solid rgba(212,168,75,.25);border-radius:.5rem;padding:.625rem .875rem;font-size:.92rem;background:#080d18;color:#e8ecf4;outline:none;font-family:system-ui,sans-serif;transition:border-color .15s}
      .gu-nl-input:focus{border-color:rgba(212,168,75,.6)}
      .gu-nl-btn{border:none;border-radius:.5rem;padding:.75rem 1rem;font-size:.95rem;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#d4a84b,#c49535);color:#141820;font-family:system-ui,sans-serif;transition:opacity .15s,transform .1s}
      .gu-nl-btn:hover{opacity:.9}
      .gu-nl-btn:active{transform:scale(.98)}
      .gu-nl-btn:disabled{opacity:.55;cursor:not-allowed}
      .gu-nl-note{font-size:.75rem;color:#6b7585;text-align:center;margin:0;font-family:system-ui,sans-serif}
      .gu-nl-success{text-align:center;padding:1rem 0}
      .gu-nl-success p{color:#22c55e;font-weight:600;font-size:1rem;margin:0}
      .gu-nl-success small{color:#9aa4ba;font-size:.82rem;margin-top:.375rem;display:block}
      .gu-nl-close{position:absolute;top:.875rem;right:.875rem;border:none;background:none;color:#6b7585;font-size:1.2rem;cursor:pointer;padding:.25rem;line-height:1;border-radius:.25rem;transition:color .15s}
      .gu-nl-close:hover{color:#e8ecf4}
      .gu-nl-error{font-size:.8rem;color:#f87171;margin:.25rem 0 0;font-family:system-ui,sans-serif}
      @keyframes gu-nl-fade{from{opacity:0}to{opacity:1}}
      @keyframes gu-nl-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    `;
    document.head.appendChild(style);
  }

  function buildPopup(settings) {
    const heading = settings.heading || "Stay close to Ukraine";
    const body = settings.body_text || "Get field reports and updates from Go Ukraina delivered to your inbox. No spam — just real stories from the ground.";
    const btnText = settings.button_text || "Send me updates";

    const overlay = document.createElement("div");
    overlay.className = "gu-nl-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "gu-nl-heading");
    overlay.innerHTML = `
      <div class="gu-nl-card">
        <button class="gu-nl-close" aria-label="Close newsletter popup">&#10005;</button>
        <div class="gu-nl-flag" aria-hidden="true">
          <div class="gu-nl-flag-stripe"></div>
          <div class="gu-nl-flag-stripe"></div>
        </div>
        <h2 id="gu-nl-heading">${escHtml(heading)}</h2>
        <p>${escHtml(body)}</p>
        <div id="gu-nl-form-wrap">
          <form class="gu-nl-form" id="gu-nl-form" novalidate>
            <input class="gu-nl-input" type="email" name="email" placeholder="Your email address" required autocomplete="email" />
            <div class="gu-nl-error" id="gu-nl-error" aria-live="polite" hidden></div>
            <button class="gu-nl-btn" type="submit">${escHtml(btnText)}</button>
          </form>
          <p class="gu-nl-note">No spam. Unsubscribe anytime.</p>
        </div>
        <div class="gu-nl-success" id="gu-nl-success" hidden>
          <p>&#10003; Thank you!</p>
          <small>${escHtml(settings.success_text || "You're on the list. We'll be in touch.")}</small>
        </div>
      </div>
    `;

    overlay.querySelector(".gu-nl-close").addEventListener("click", () => close(overlay));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(overlay); });

    overlay.querySelector("#gu-nl-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = overlay.querySelector(".gu-nl-btn");
      const errEl = overlay.querySelector("#gu-nl-error");
      const emailEl = overlay.querySelector("[name=email]");
      const email = emailEl.value.trim();

      errEl.hidden = true;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = "Please enter a valid email address.";
        errEl.hidden = false;
        emailEl.focus();
        return;
      }

      btn.disabled = true;
      btn.textContent = "Sending…";

      try {
        const r = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, source: "website_popup" }),
        });
        const json = await r.json();
        if (json.ok) {
          overlay.querySelector("#gu-nl-form-wrap").hidden = true;
          overlay.querySelector("#gu-nl-success").hidden = false;
          dismiss();
          setTimeout(() => close(overlay), 3500);
        } else {
          errEl.textContent = json.error || "Something went wrong. Please try again.";
          errEl.hidden = false;
          btn.disabled = false;
          btn.textContent = btnText;
        }
      } catch {
        errEl.textContent = "Network error. Please try again.";
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = btnText;
      }
    });

    document.addEventListener("keydown", function handleEsc(e) {
      if (e.key === "Escape") { close(overlay); document.removeEventListener("keydown", handleEsc); }
    });

    return overlay;
  }

  function close(overlay) {
    dismiss();
    overlay.classList.add("gu-nl-hidden");
    setTimeout(() => overlay.remove(), 300);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function init() {
    if (isDismissed()) return;
    if (window.location.pathname.startsWith("/admin")) return;

    try {
      const r = await fetch("/api/admin/settings?key=newsletter_popup");
      if (!r.ok) return;
      const data = await r.json();
      const settings = data.value;
      if (!settings || !settings.enabled) return;

      const delay = Math.max(0, parseInt(settings.delay_seconds || "5", 10)) * 1000;

      injectStyles();
      setTimeout(() => {
        const popup = buildPopup(settings);
        document.body.appendChild(popup);
      }, delay);
    } catch {
      // Silently fail — popup is enhancement only
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
