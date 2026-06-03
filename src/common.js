/*
 * Shared helpers used by the service worker, content script, options page,
 * popup and block page. Loaded as a classic (non-module) script so the same
 * file works via importScripts() in the worker, in the content-script world,
 * and via a <script> tag in the extension pages.
 *
 * Data model (stored under storage.local "config"):
 *   {
 *     enabled: true,                  // master on/off
 *     bins: [                         // collections; zero by default
 *       {
 *         id, name, enabled,
 *         mode: "warning"|"redirect"|"error",   // the bin's default action
 *         redirectUrl,                          // the bin's default redirect
 *         sites: [ { domain, action, redirectUrl? } ]  // action "default" = bin mode
 *       }
 *     ],
 *     bannerText, blockedTitle, blockedText, backLabel, hideLabel, manageLabel
 *   }
 */

const DS_API = typeof chrome !== "undefined" ? chrome : browser;

const DEFAULT_CONFIG = {
  enabled: true,
  bins: [], // zero defaults — users create bins and paste lists in
  // Global wording. "{site}" is replaced with the blocked domain.
  bannerText: "You chose to stop using {site}. It's on your block list.",
  blockedTitle: "Site blocked",
  blockedText: "You decided to stop using {site}. It's on your block list.",
  backLabel: "Take me back",
  hideLabel: "Hide for now",
  manageLabel: "Manage block list"
};

/** Match pattern that covers a domain and all of its subdomains. */
function originPattern(domain) {
  return "*://*." + domain + "/*";
}

/** A unique-enough id for a new bin. */
function makeId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (_) {
    /* fall through */
  }
  return "bin-" + Math.floor(Math.random() * 1e9).toString(36);
}

/** A fresh, empty bin. */
function newBin(name) {
  return {
    id: makeId(),
    name: name || "New bin",
    enabled: true,
    mode: "warning",
    redirectUrl: "https://www.google.com",
    sites: []
  };
}

/**
 * Reduce arbitrary input ("https://www.VG.no/sport", " Finn.no ") to a bare
 * host like "vg.no". Suffix matching means keeping "vg.no" is exactly right.
 */
function normalizeDomain(input) {
  if (!input) return "";
  let s = String(input).trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  s = s.split(/[/?#]/)[0].split(":")[0]; // path/query/fragment/port
  s = s.replace(/^www\./, ""); // leading www.
  s = s.replace(/\.$/, ""); // trailing dot
  return s;
}

/** Ensure a URL has a scheme; default to https://. Empty input stays empty. */
function normalizeUrl(input) {
  const s = String(input == null ? "" : input).trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

/** Parse pasted text / a list into a clean, de-duplicated array of domains. */
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

/* ---------- Bins ---------- */

/** Bins that are currently switched on. */
function activeBins(config) {
  return (config.bins || []).filter(function (b) {
    return b && b.enabled !== false;
  });
}

/**
 * Resolve every active site to its effective action. Returns a map
 *   { domain: { action: "warning"|"redirect"|"error", url } }
 * First occurrence wins if a domain appears in more than one bin.
 */
function resolveBlocklist(config) {
  const out = {};
  if (!config.enabled) return out;
  activeBins(config).forEach(function (bin) {
    const mode = bin.mode || "warning";
    (bin.sites || []).forEach(function (site) {
      const d = site.domain;
      if (!d || Object.prototype.hasOwnProperty.call(out, d)) return;
      const action = site.action && site.action !== "default" ? site.action : mode;
      let url = "";
      if (action === "redirect") url = site.redirectUrl || bin.redirectUrl || "";
      out[d] = { action: action, url: url };
    });
  });
  return out;
}

/** Resolve the effective action for a hostname (apex or subdomain), or null. */
function resolveForHost(hostname, config) {
  if (!hostname) return null;
  const map = resolveBlocklist(config);
  const h = hostname.toLowerCase().replace(/\.$/, "");
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const d = keys[i];
    if (h === d || h.endsWith("." + d)) return map[d];
  }
  return null;
}

/** Every distinct domain across all bins (for permission requests / counts). */
function allBinDomains(config) {
  const out = [];
  const seen = new Set();
  (config.bins || []).forEach(function (bin) {
    (bin.sites || []).forEach(function (site) {
      if (site.domain && !seen.has(site.domain)) {
        seen.add(site.domain);
        out.push(site.domain);
      }
    });
  });
  return out;
}

/* ---------- Storage ---------- */

/** Coerce stored bins into a well-formed shape. */
function normalizeBins(bins) {
  return (bins || []).map(function (b) {
    return {
      id: b.id || makeId(),
      name: b.name || "Untitled bin",
      enabled: b.enabled !== false,
      mode: b.mode || "warning",
      redirectUrl: b.redirectUrl || "https://www.google.com",
      sites: Array.isArray(b.sites)
        ? b.sites
            .map(function (s) {
              const site = {
                domain: normalizeDomain(s.domain || s),
                action: s.action || "default"
              };
              if (s.redirectUrl) site.redirectUrl = s.redirectUrl;
              return site;
            })
            .filter(function (s) {
              return s.domain;
            })
        : []
    };
  });
}

/** Migrate the older flat-blocklist config shape into a single bin. */
function migrateToBins(cfg) {
  if (Array.isArray(cfg.bins)) return cfg.bins;
  if (Array.isArray(cfg.blocklist) && cfg.blocklist.length) {
    const so =
      cfg.siteOverrides && typeof cfg.siteOverrides === "object"
        ? cfg.siteOverrides
        : null;
    const ro =
      cfg.redirectOverrides && typeof cfg.redirectOverrides === "object"
        ? cfg.redirectOverrides
        : null;
    const sites = cfg.blocklist.map(function (d) {
      const site = { domain: d, action: "default" };
      if (so && so[d]) {
        site.action = so[d].action || "default";
        if (so[d].redirectUrl) site.redirectUrl = so[d].redirectUrl;
      } else if (ro && ro[d]) {
        site.action = "redirect";
        site.redirectUrl = ro[d];
      }
      return site;
    });
    return [
      {
        id: makeId(),
        name: "Imported list",
        enabled: true,
        mode: cfg.mode || "warning",
        redirectUrl: cfg.redirectUrl || "https://www.google.com",
        sites: sites
      }
    ];
  }
  return [];
}

/** Load the stored config, falling back to defaults for any missing field. */
function getConfig() {
  return DS_API.storage.local.get("config").then(function (stored) {
    const cfg = stored && stored.config ? stored.config : {};
    return {
      enabled: cfg.enabled !== undefined ? cfg.enabled : DEFAULT_CONFIG.enabled,
      bins: normalizeBins(migrateToBins(cfg)),
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
  return DS_API.permissions.request({ origins: domains.map(originPattern) });
}

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
