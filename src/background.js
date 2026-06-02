/*
 * Service worker. Per-domain dynamic blocking engine.
 *
 * Each blocked domain has an effective action — its per-site override, or the
 * global default. Actions are applied independently, so the list can mix:
 *
 *   - "warning"  : no network rule; the content script shows the bar.
 *   - "redirect" : a DNR rule redirects to the site's custom URL (or default).
 *   - "error"    : a DNR rule redirects to the bundled stop page.
 *
 * Content scripts cover the defaults via static manifest matches; user-added
 * domains are registered dynamically (once their host permission is granted).
 * Each content-script run self-gates on the per-domain action.
 */

importScripts("blocklist.data.js", "common.js");

const USER_SCRIPT_ID = "ds-user-warning";

// A full chrome-extension:// URL. Using `redirect.url` (not `redirect.extensionPath`)
// because extensionPath rejects the "?domain=" query string we need.
function stopPageUrl(domain) {
  return (
    DS_API.runtime.getURL("src/blocked.html") +
    "?domain=" +
    encodeURIComponent(domain)
  );
}

async function syncDynamicRules(config) {
  const list = config.enabled ? config.blocklist : [];
  const dynamic = [];
  let id = 1;

  for (const d of list) {
    const action = effectiveAction(d, config);
    if (action === "redirect") {
      // normalizeUrl guarantees a scheme — an unschemed URL would make the rule
      // invalid and cause updateDynamicRules to reject the WHOLE batch.
      const url = normalizeUrl(effectiveRedirectUrl(d, config));
      if (!url) {
        console.warn("[Drittsleipt] skipping redirect for", d, "— no URL");
        continue;
      }
      dynamic.push({
        id: id++,
        priority: 1,
        action: { type: "redirect", redirect: { url: url } },
        condition: { requestDomains: [d], resourceTypes: ["main_frame"] }
      });
    } else if (action === "error") {
      dynamic.push({
        id: id++,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { url: stopPageUrl(d) }
        },
        condition: { requestDomains: [d], resourceTypes: ["main_frame"] }
      });
    }
    // "warning": no network rule — handled by the content script.
  }

  const existing = await DS_API.declarativeNetRequest.getDynamicRules();
  try {
    await DS_API.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map(function (r) {
        return r.id;
      }),
      addRules: dynamic
    });
    console.debug(
      "[Drittsleipt] applied",
      dynamic.length,
      "dynamic rule(s):",
      dynamic.map(function (r) {
        return r.condition.requestDomains[0] + " → " + (r.action.redirect.url || "stop page");
      })
    );
  } catch (e) {
    console.error(
      "[Drittsleipt] updateDynamicRules failed — no rules applied:",
      e,
      dynamic
    );
  }
}

/** Register the warning-bar content script for user-added domains we can access. */
async function syncUserContentScripts(config) {
  if (!DS_API.scripting || !DS_API.scripting.registerContentScripts) return;

  try {
    await DS_API.scripting.unregisterContentScripts({ ids: [USER_SCRIPT_ID] });
  } catch (_) {
    /* not registered yet — fine. */
  }

  const userDomains = userAddedDomains(
    config.enabled ? config.blocklist : []
  );
  const granted = [];
  for (const d of userDomains) {
    try {
      if (await hasDomainPermission(d)) granted.push(d);
    } catch (_) {
      /* ignore */
    }
  }
  if (!granted.length) return;

  await DS_API.scripting.registerContentScripts([
    {
      id: USER_SCRIPT_ID,
      matches: granted.map(originPattern),
      js: ["src/blocklist.data.js", "src/common.js", "src/content.js"],
      runAt: "document_start",
      allFrames: false
    }
  ]);
}

async function applyState() {
  const config = await getConfig();

  await syncDynamicRules(config);
  await syncUserContentScripts(config);

  try {
    await DS_API.action.setBadgeBackgroundColor({ color: "#dc2626" });
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

// Granting/revoking optional host permissions also re-applies (so newly
// permitted user domains get their content script registered immediately).
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
