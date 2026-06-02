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
  mode: "warning",
  redirectUrl: "https://www.google.com",
  blocklist:
    typeof DEFAULT_BLOCKLIST !== "undefined" ? DEFAULT_BLOCKLIST.slice() : []
};

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

/** True if `hostname` is, or is a subdomain of, any entry in `blocklist`. */
function hostMatchesBlocklist(hostname, blocklist) {
  if (!hostname || !blocklist || !blocklist.length) return false;
  const h = hostname.toLowerCase().replace(/\.$/, "");
  for (const entry of blocklist) {
    if (!entry) continue;
    if (h === entry || h.endsWith("." + entry)) return true;
  }
  return false;
}

/** Domains in the list that are NOT shipped defaults (need optional perms). */
function userAddedDomains(blocklist) {
  return blocklist.filter(function (d) {
    return !isDefaultDomain(d);
  });
}

/** Load the stored config, falling back to defaults for any missing field. */
function getConfig() {
  return DS_API.storage.local.get("config").then(function (stored) {
    const cfg = stored && stored.config ? stored.config : {};
    return {
      enabled: cfg.enabled !== undefined ? cfg.enabled : DEFAULT_CONFIG.enabled,
      mode: cfg.mode || DEFAULT_CONFIG.mode,
      redirectUrl: cfg.redirectUrl || DEFAULT_CONFIG.redirectUrl,
      blocklist: Array.isArray(cfg.blocklist)
        ? cfg.blocklist
        : DEFAULT_CONFIG.blocklist.slice()
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
