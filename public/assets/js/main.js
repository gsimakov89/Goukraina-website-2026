(function () {
  "use strict";

  var nav = document.getElementById("primary-nav");
  var moreToolbar = document.getElementById("more-toolbar");
  var backdrop = document.getElementById("nav-backdrop");

  function setNavOpen(open) {
    document.body.classList.toggle("nav-open", open);
    if (backdrop) {
      backdrop.hidden = !open;
      backdrop.setAttribute("aria-hidden", open ? "false" : "true");
    }
    document.body.style.overflow = open ? "hidden" : "";
    document.querySelectorAll(".mb-menu-toggle").forEach(function (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    if (moreToolbar) {
      moreToolbar.setAttribute("aria-hidden", open ? "false" : "true");
    }
  }

  document.querySelectorAll(".mb-menu-toggle").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      setNavOpen(!document.body.classList.contains("nav-open"));
    });
  });

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setNavOpen(false);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.body.classList.contains("nav-open")) {
      setNavOpen(false);
      var t = document.querySelector(".mb-menu-toggle");
      if (t) {
        t.focus();
      }
    }
  });

  function wireCloseOnNavigate(root) {
    if (!root) {
      return;
    }
    root.querySelectorAll('a[href]').forEach(function (link) {
      link.addEventListener("click", function () {
        setNavOpen(false);
      });
    });
  }

  wireCloseOnNavigate(nav);
  wireCloseOnNavigate(moreToolbar);

  window.addEventListener("resize", function () {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setNavOpen(false);
    }
  });

  setNavOpen(false);

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var els = document.querySelectorAll(".reveal");
    if (els.length && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              e.target.classList.add("is-visible");
              io.unobserve(e.target);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
      );
      els.forEach(function (el) {
        io.observe(el);
      });
    } else {
      els.forEach(function (el) {
        el.classList.add("is-visible");
      });
    }
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  function buildNotchPaths(w, svgH) {
    var root = document.getElementById("mobile-bottom-nav");
    if (!root) {
      return;
    }
    /* Notch + FAB locked to center column: Donate is the primary CTA. */
    var totalR = 29;
    var ramp = 14;
    var cx = w * 0.5;
    var edge = totalR + ramp + 4;
    if (w > edge * 2) {
      cx = Math.max(edge, Math.min(w - edge, cx));
    }
    var t = totalR * 0.38;
    var x1 = cx - totalR - ramp;
    var x2 = cx - totalR;
    var x3 = cx + totalR;
    var x4 = cx + totalR + ramp;

    var d =
      "M0,0 L" +
      x1 +
      ",0 C" +
      (cx - totalR - 2) +
      ",0 " +
      x2 +
      ",4 " +
      x2 +
      "," +
      t +
      " A" +
      totalR +
      "," +
      totalR +
      " 0 0 1 " +
      x3 +
      "," +
      t +
      " C" +
      x3 +
      ",4 " +
      (cx + totalR + 2) +
      ",0 " +
      x4 +
      ",0 L" +
      w +
      ",0 L" +
      w +
      "," +
      svgH +
      " L0," +
      svgH +
      " Z";

    var db =
      "M" +
      x1 +
      ",0 C" +
      (cx - totalR - 2) +
      ",0 " +
      x2 +
      ",4 " +
      x2 +
      "," +
      t +
      " A" +
      totalR +
      "," +
      totalR +
      " 0 0 1 " +
      x3 +
      "," +
      t +
      " C" +
      x3 +
      ",4 " +
      (cx + totalR + 2) +
      ",0 " +
      x4 +
      ",0";

    var pathFill = root.querySelector(".mobile-bottom-nav__path");
    var pathBorder = root.querySelector(".mobile-bottom-nav__path-border");
    var svg = root.querySelector(".mobile-bottom-nav__svg");
    if (pathFill) {
      pathFill.setAttribute("d", d);
    }
    if (pathBorder) {
      pathBorder.setAttribute("d", db);
    }
    if (svg) {
      svg.setAttribute("viewBox", "0 0 " + w + " " + svgH);
      svg.setAttribute("width", w);
    }
  }

  function updateMobileBottomNav() {
    var root = document.getElementById("mobile-bottom-nav");
    if (!root) {
      return;
    }
    var fab = root.querySelector(".mobile-bottom-nav__fab");
    if (!window.matchMedia("(max-width: 1023px)").matches) {
      return;
    }
    var w = root.clientWidth || 400;
    buildNotchPaths(w, 56);
  }

  var resizeTick;
  function scheduleMbnLayout() {
    if (resizeTick) {
      cancelAnimationFrame(resizeTick);
    }
    resizeTick = requestAnimationFrame(function () {
      resizeTick = null;
      updateMobileBottomNav();
    });
  }

  var mbn = document.getElementById("mobile-bottom-nav");
  if (mbn && "ResizeObserver" in window) {
    var ro = new ResizeObserver(function () {
      scheduleMbnLayout();
    });
    ro.observe(mbn);
    scheduleMbnLayout();
    window.addEventListener("resize", scheduleMbnLayout);
    window.addEventListener("orientationchange", function () {
      setTimeout(scheduleMbnLayout, 250);
    });
    window.addEventListener("load", scheduleMbnLayout);
  } else if (mbn) {
    updateMobileBottomNav();
    window.addEventListener("resize", updateMobileBottomNav);
  }

  var summitNotify = document.getElementById("summit-notify-form");
  if (summitNotify) {
    summitNotify.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = summitNotify.querySelector("[name=email]");
      var em = email ? email.value : "";
      window.location.href =
        "mailto:info@goukraina.com?subject=" +
        encodeURIComponent("Ukraine Reconstruction Summit 2026: notification list") +
        "&body=" +
        encodeURIComponent("Please add this email to the 2026 summit mailing list:\n" + em);
    });
  }

  var contactMainForm = document.getElementById("contact-main-form");
  if (contactMainForm) {
    contactMainForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(contactMainForm);
      var first = String(fd.get("first") || "").trim();
      var last = String(fd.get("last") || "").trim();
      var email = String(fd.get("email") || "").trim();
      var phone = String(fd.get("phone") || "").trim();
      var topic = String(fd.get("topic") || "").trim();
      var message = String(fd.get("message") || "").trim();
      var name = [first, last].filter(Boolean).join(" ");
      if (!name) {
        name = "Contact form";
      }
      var body =
        "Name: " +
        name +
        "\n" +
        "Email: " +
        email +
        "\n" +
        (phone ? "Phone: " + phone + "\n" : "") +
        "Topic: " +
        topic +
        "\n\n" +
        message;
      var subject = "Go Ukraina contact — " + topic;
      window.location.href =
        "mailto:info@goukraina.com?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(body);
    });
  }

  function showShareToast(root, on) {
    var toast = root.querySelector("[data-share-toast]");
    if (!toast) {
      return;
    }
    toast.hidden = !on;
    if (on) {
      window.clearTimeout(toast._tid);
      toast._tid = window.setTimeout(function () {
        toast.hidden = true;
      }, 2200);
    }
  }

  document.querySelectorAll(".blog-share").forEach(function (root) {
    var url = root.getAttribute("data-share-url") || window.location.href;
    var title = root.getAttribute("data-share-title") || document.title;
    var nativeBtn = root.querySelector("[data-share-native]");
    if (nativeBtn && navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener("click", function () {
        navigator
          .share({ title: title, url: url, text: title })
          .catch(function () {});
      });
    }
    var copyBtn = root.querySelector("[data-share-copy]");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        function ok() {
          showShareToast(root, true);
        }
        function fail() {
          window.prompt("Copy this link:", url);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(ok).catch(fail);
        } else {
          fail();
        }
      });
    }
  });
})();
