/*
 * Content script for "warning" mode. Runs at document_start on every page,
 * bails out instantly unless the current host is on the block list AND the user
 * picked the warning mode. The banner lives in a shadow root so the host page's
 * CSS can't bleed into it (and ours can't bleed out).
 */

(function () {
  const BANNER_ID = "drittsleipt-banner-host";
  // Per-tab dismissal so "Hide" sticks until the next navigation/reload.
  const SESSION_KEY = "__drittsleipt_dismissed__";

  function alreadyDismissed() {
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function markDismissed() {
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch (_) {
      /* sessionStorage may be blocked; non-fatal. */
    }
  }

  function injectBanner(hostname) {
    if (document.getElementById(BANNER_ID)) return;

    const host = document.createElement("div");
    host.id = BANNER_ID;
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "top: 0",
      "left: 0",
      "right: 0",
      "z-index: 2147483647"
    ].join(";");

    const root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>" +
      ":host{ all: initial; }" +
      ".bar{display:flex;align-items:center;gap:14px;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "background:#dc2626;color:#fff;padding:12px 16px;" +
      "box-shadow:0 2px 10px rgba(0,0,0,.35);font-size:14px;line-height:1.4;}" +
      ".icon{font-size:20px;flex:0 0 auto;}" +
      ".msg{flex:1 1 auto;}" +
      ".msg b{font-weight:700;}" +
      ".host{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "background:rgba(0,0,0,.18);padding:1px 6px;border-radius:4px;}" +
      ".actions{display:flex;gap:8px;flex:0 0 auto;}" +
      "button{all:unset;cursor:pointer;font:inherit;font-weight:600;" +
      "padding:7px 12px;border-radius:6px;}" +
      ".back{background:#fff;color:#dc2626;}" +
      ".back:hover{background:#fde8e8;}" +
      ".hide{background:rgba(255,255,255,.18);color:#fff;}" +
      ".hide:hover{background:rgba(255,255,255,.3);}" +
      "</style>" +
      '<div class="bar" role="alert">' +
      '<span class="icon" aria-hidden="true">&#9888;</span>' +
      '<span class="msg">You chose to stop using this site. ' +
      '<b><span class="host"></span></b> is on your Drittsleipt block list.</span>' +
      '<span class="actions">' +
      '<button class="back">Take me back</button>' +
      '<button class="hide">Hide for now</button>' +
      "</span>" +
      "</div>";

    root.querySelector(".host").textContent = hostname;

    root.querySelector(".back").addEventListener("click", function () {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = "about:blank";
      }
    });

    root.querySelector(".hide").addEventListener("click", function () {
      markDismissed();
      host.remove();
    });

    (document.documentElement || document.body || document).appendChild(host);
  }

  function run() {
    if (window.top !== window.self) return; // top frame only
    if (alreadyDismissed()) return;

    getConfig()
      .then(function (config) {
        if (!config.enabled || config.mode !== "warning") return;
        if (!hostMatchesBlocklist(window.location.hostname, config.blocklist)) {
          return;
        }
        if (document.documentElement) {
          injectBanner(window.location.hostname);
        } else {
          document.addEventListener("DOMContentLoaded", function () {
            injectBanner(window.location.hostname);
          });
        }
      })
      .catch(function () {
        /* storage unavailable; do nothing. */
      });
  }

  run();
})();
