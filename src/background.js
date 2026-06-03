/*
 * Service worker. Per-domain dynamic blocking engine over multiple bins.
 *
 * Every active site resolves to an effective action (its override, else its
 * bin's default). Actions apply independently, so the list can mix:
 *
 *   - "warning"  : no network rule; a dynamically-registered content script
 *                  shows the bar.
 *   - "redirect" : a DNR rule redirects to the site's URL (or its bin default).
 *   - "error"    : a DNR rule redirects to the bundled stop page.
 *
 * There are no baked-in defaults, so every domain is user-supplied and its
 * host permission is requested on demand. Content scripts are registered
 * dynamically for the warning domains we have permission for.
 */

importScripts("common.js");

const WARN_SCRIPT_ID = "ds-warning";

// A full chrome-extension:// URL. Using `redirect.url` (not `extensionPath`)
// because extensionPath rejects the "?domain=" query string we need.
function stopPageUrl(domain) {
  return (
    DS_API.runtime.getURL("src/blocked.html") +
    "?domain=" +
    encodeURIComponent(domain)
  );
}

async function syncDynamicRules(config) {
  const resolved = resolveBlocklist(config);
  const dynamic = [];
  let id = 1;

  Object.keys(resolved).forEach(function (d) {
    const r = resolved[d];
    if (r.action === "redirect") {
      // normalizeUrl guarantees a scheme — an unschemed URL would make the rule
      // invalid and cause updateDynamicRules to reject the WHOLE batch.
      const url = normalizeUrl(r.url);
      if (!url) {
        console.warn("[Dumpster] skipping redirect for", d, "— no URL");
        return;
      }
      dynamic.push({
        id: id++,
        priority: 1,
        action: { type: "redirect", redirect: { url: url } },
        condition: { requestDomains: [d], resourceTypes: ["main_frame"] }
      });
    } else if (r.action === "error") {
      dynamic.push({
        id: id++,
        priority: 1,
        action: { type: "redirect", redirect: { url: stopPageUrl(d) } },
        condition: { requestDomains: [d], resourceTypes: ["main_frame"] }
      });
    }
    // "warning": no network rule — handled by the content script.
  });

  const existing = await DS_API.declarativeNetRequest.getDynamicRules();
  try {
    await DS_API.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map(function (r) {
        return r.id;
      }),
      addRules: dynamic
    });
    console.debug(
      "[Dumpster] applied",
      dynamic.length,
      "dynamic rule(s):",
      dynamic.map(function (r) {
        return r.condition.requestDomains[0] + " → " + r.action.redirect.url;
      })
    );
  } catch (e) {
    console.error(
      "[Dumpster] updateDynamicRules failed — no rules applied:",
      e,
      dynamic
    );
  }
}

/** Register the warning-bar content script for warning domains we can access. */
async function syncContentScripts(config) {
  if (!DS_API.scripting || !DS_API.scripting.registerContentScripts) return;

  try {
    await DS_API.scripting.unregisterContentScripts({ ids: [WARN_SCRIPT_ID] });
  } catch (_) {
    /* not registered yet — fine. */
  }

  const resolved = resolveBlocklist(config);
  const warnDomains = Object.keys(resolved).filter(function (d) {
    return resolved[d].action === "warning";
  });

  const granted = [];
  for (const d of warnDomains) {
    try {
      if (await hasDomainPermission(d)) granted.push(d);
    } catch (_) {
      /* ignore */
    }
  }
  if (!granted.length) return;

  await DS_API.scripting.registerContentScripts([
    {
      id: WARN_SCRIPT_ID,
      matches: granted.map(originPattern),
      js: ["src/common.js", "src/content.js"],
      runAt: "document_start",
      allFrames: false
    }
  ]);
}

async function applyState() {
  const config = await getConfig();

  await syncDynamicRules(config);
  await syncContentScripts(config);

  try {
    await DS_API.action.setBadgeBackgroundColor({ color: "#2E7D32" });
    await DS_API.action.setBadgeText({ text: config.enabled ? "" : "off" });
  } catch (_) {
    /* action API unavailable in some contexts; ignore. */
  }
}

DS_API.runtime.onInstalled.addListener(async function () {
  const stored = await DS_API.storage.local.get("config");
  if (!stored || !stored.config) {
    await DS_API.storage.local.set({ config: DEFAULT_CONFIG });
  }
  await applyState();
});

DS_API.runtime.onStartup.addListener(function () {
  applyState();
});

// Config edits (options page / popup) re-apply the whole state.
DS_API.storage.onChanged.addListener(function (changes, area) {
  if (area === "local" && changes.config) {
    applyState();
  }
});

// Granting/revoking optional host permissions also re-applies.
if (DS_API.permissions && DS_API.permissions.onAdded) {
  DS_API.permissions.onAdded.addListener(function () {
    applyState();
  });
}
if (DS_API.permissions && DS_API.permissions.onRemoved) {
  DS_API.permissions.onRemoved.addListener(function () {
    applyState();
  });
}
