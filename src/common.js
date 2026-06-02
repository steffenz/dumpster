/*
 * Shared helpers used by the service worker, content script, options page,
 * popup and block page. Loaded as a classic (non-module) script so the same
 * file works via importScripts() in the worker, in the content-script world,
 * and via a <script> tag in the extension pages.
 *
 * DEFAULT_BLOCKLIST is provided by the generated src/blocklist.data.js, which
 * must be loaded BEFORE this file everywhere.
 */

// Cross-browser alias. Chrome/Brave/Edge/Vivaldi expose `chrome`; Firefox
// exposes both `browser` and `chrome`. We stick to the `chrome` callback/promise
// API which works across all current Chromium browsers and Firefox MV3.
const DS_API = typeof chrome !== "undefined" ? chrome : browser;

const DEFAULT_CONFIG = {
  enabled: true,
  // "warning" | "redirect" | "error"
  // Default action for every blocked site.
  mode: "warning",
  redirectUrl: "https://www.google.com",
  // Per-site action overrides keyed by domain, e.g.
  //   { "vg.no": { action: "redirect", redirectUrl: "https://nrk.no" } }
  // Sites not listed here use the default `mode` above. `action` is one of
  // "warning" | "redirect" | "error"; `redirectUrl` is optional (redirect only,
  // falls back to the default redirectUrl when blank).
  siteOverrides: {},
  blocklist:
    typeof DEFAULT_BLOCKLIST !== "undefined" ? DEFAULT_BLOCKLIST.slice() : [],
  // User-editable wording. "{site}" is replaced with the blocked domain.
  bannerText: "You chose to stop using {site}. It's on your block list.",
  blockedTitle: "Site blocked",
  blockedText: "You decided to stop using {site}. It's on your block list.",
  // Button labels.
  backLabel: "Take me back",
  hideLabel: "Hide for now",
  manageLabel: "Manage block list"
};

/**
 * Safely render a template like "Stop using {site}." into `targetEl`, replacing
 * each "{site}" with a styled <span> containing the domain. Uses DOM nodes (not
 * innerHTML) so user-entered wording can never inject markup.
 */
function fillTemplate(targetEl, template, site, siteClassName) {
  targetEl.textContent = "";
  const parts = String(template == null ? "" : template).split("{site}");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) targetEl.appendChild(document.createTextNode(parts[i]));
    if (i < parts.length - 1) {
      const span = document.createElement("span");
      if (siteClassName) span.className = siteClassName;
      span.textContent = site;
      targetEl.appendChild(span);
    }
  }
}

/** Match pattern that covers a domain and all of its subdomains. */
function originPattern(domain) {
  return "*://*." + domain + "/*";
}

/** True if a domain is part of the shipped default list (granted at install). */
function isDefaultDomain(domain) {
  return (
    typeof DEFAULT_BLOCKLIST !== "undefined" &&
    DEFAULT_BLOCKLIST.indexOf(domain) !== -1
  );
}

/**
 * Reduce arbitrary user input ("https://www.VG.no/sport", " Finn.no ") down to a
 * bare registrable-ish host like "vg.no". We don't strip the public suffix —
 * matching is suffix-based, so keeping "vg.no" is exactly what we want.
 */
function normalizeDomain(input) {
  if (!input) return "";
  let s = String(input).trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // strip scheme
  s = s.split(/[/?#]/)[0].split(":")[0]; // strip path/query/fragment/port
  s = s.replace(/^www\./, ""); // strip leading www.
  s = s.replace(/\.$/, ""); // strip trailing dot
  return s;
}

/** Parse a textarea / list into a clean, de-duplicated array of domains. */
function parseBlocklist(text) {
  const lines = Array.isArray(text) ? text : String(text).split(/[\n,]+/);
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const d = normalizeDomain(line);
    if (d && !seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

/** Ensure a URL has a scheme; default to https://. Empty input stays empty. */
function normalizeUrl(input) {
  const s = String(input == null ? "" : input).trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

/** The override object for a domain, or null if it uses the default action. */
function siteOverrideFor(domain, config) {
  return config.siteOverrides && config.siteOverrides[domain]
    ? config.siteOverrides[domain]
    : null;
}

/** The action that actually applies to a domain: "warning" | "redirect" | "error". */
function effectiveAction(domain, config) {
  const o = siteOverrideFor(domain, config);
  return o && o.action ? o.action : config.mode;
}

/** Where a domain redirects: its custom URL, else the default redirectUrl. */
function effectiveRedirectUrl(domain, config) {
  const o = siteOverrideFor(domain, config);
  if (o && o.action === "redirect" && o.redirectUrl) return o.redirectUrl;
  return config.redirectUrl;
}

/** The blocklist entry that matches `hostname` (apex or subdomain), or null. */
function matchBlocklistDomain(hostname, blocklist) {
  if (!hostname || !blocklist || !blocklist.length) return null;
  const h = hostname.toLowerCase().replace(/\.$/, "");
  for (const entry of blocklist) {
    if (!entry) continue;
    if (h === entry || h.endsWith("." + entry)) return entry;
  }
  return null;
}

/** Domains in the list that are NOT shipped defaults (need optional perms). */
function userAddedDomains(blocklist) {
  return blocklist.filter(function (d) {
    return !isDefaultDomain(d);
  });
}

/**
 * Read siteOverrides from stored config, migrating the older redirectOverrides
 * shape ({ domain: url }) into the new ({ domain: { action, redirectUrl } }).
 */
function normalizeSiteOverrides(cfg) {
  if (cfg.siteOverrides && typeof cfg.siteOverrides === "object") {
    return cfg.siteOverrides;
  }
  const out = {};
  if (cfg.redirectOverrides && typeof cfg.redirectOverrides === "object") {
    for (const d of Object.keys(cfg.redirectOverrides)) {
      out[d] = { action: "redirect", redirectUrl: cfg.redirectOverrides[d] };
    }
  }
  return out;
}

/** Load the stored config, falling back to defaults for any missing field. */
function getConfig() {
  return DS_API.storage.local.get("config").then(function (stored) {
    const cfg = stored && stored.config ? stored.config : {};
    return {
      enabled: cfg.enabled !== undefined ? cfg.enabled : DEFAULT_CONFIG.enabled,
      mode: cfg.mode || DEFAULT_CONFIG.mode,
      redirectUrl: cfg.redirectUrl || DEFAULT_CONFIG.redirectUrl,
      siteOverrides: normalizeSiteOverrides(cfg),
      blocklist: Array.isArray(cfg.blocklist)
        ? cfg.blocklist
        : DEFAULT_CONFIG.blocklist.slice(),
      bannerText: cfg.bannerText || DEFAULT_CONFIG.bannerText,
      blockedTitle: cfg.blockedTitle || DEFAULT_CONFIG.blockedTitle,
      blockedText: cfg.blockedText || DEFAULT_CONFIG.blockedText,
      backLabel: cfg.backLabel || DEFAULT_CONFIG.backLabel,
      hideLabel: cfg.hideLabel || DEFAULT_CONFIG.hideLabel,
      manageLabel: cfg.manageLabel || DEFAULT_CONFIG.manageLabel
    };
  });
}

/** Merge a patch into the stored config and persist it. */
function setConfig(patch) {
  return getConfig().then(function (current) {
    const next = Object.assign({}, current, patch);
    return DS_API.storage.local.set({ config: next }).then(function () {
      return next;
    });
  });
}

/** Is the host permission for this domain currently granted? */
function hasDomainPermission(domain) {
  return DS_API.permissions.contains({ origins: [originPattern(domain)] });
}

/** Request host permission for a set of domains (must be from a user gesture). */
function requestDomainPermissions(domains) {
  if (!domains.length) return Promise.resolve(true);
  return DS_API.permissions.request({
    origins: domains.map(originPattern)
  });
}
