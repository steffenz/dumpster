/*
 * Service worker. Implements the hybrid blocking engine:
 *
 *   - "error" mode   : the STATIC ruleset (rules/schibsted.json) blocks the
 *                      shipped defaults with the stop page. User-added domains
 *                      get DYNAMIC stop-page rules; defaults the user removed get
 *                      a DYNAMIC `allow` exemption that overrides the static rule.
 *   - "redirect" mode: the static ruleset is disabled; every blocked domain gets
 *                      a DYNAMIC redirect rule to the user's chosen URL.
 *   - "warning" mode : no rules at all; the content script shows the bar.
 *
 * Content scripts cover the defaults via static manifest matches; user-added
 * domains are registered dynamically (once their host permission is granted).
 */

importScripts("blocklist.data.js", "common.js");

const RULESET_ID = "schibsted";
const USER_SCRIPT_ID = "ds-user-warning";

function stopPagePath(domain) {
  return "/src/blocked.html?domain=" + encodeURIComponent(domain);
}

async function syncStaticRuleset(errorMode) {
  await DS_API.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: errorMode ? [RULESET_ID] : [],
    disableRulesetIds: errorMode ? [] : [RULESET_ID]
  });
}

async function syncDynamicRules(config) {
  const list = config.enabled ? config.blocklist : [];
  const userDomains = userAddedDomains(list);
  const removedDefaults = (
    typeof DEFAULT_BLOCKLIST !== "undefined" ? DEFAULT_BLOCKLIST : []
  ).filter(function (d) {
    return list.indexOf(d) === -1;
  });

  const dynamic = [];
  let id = 1;

  if (config.enabled && config.mode === "redirect") {
    // Everything redirects to the user's URL (no static ruleset in this mode).
    for (const d of list) {
      dynamic.push({
        id: id++,
        priority: 1,
        action: { type: "redirect", redirect: { url: config.redirectUrl } },
        condition: { requestDomains: [d], resourceTypes: ["main_frame"] }
      });
    }
  } else if (config.enabled && config.mode === "error") {
    // Defaults are covered by the static ruleset. Add stop-page rules for the
    // user's own domains, and allow-exemptions for defaults they removed.
    for (const d of userDomains) {
      dynamic.push({
        id: id++,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { extensionPath: stopPagePath(d) }
        },
        condition: { requestDomains: [d], resourceTypes: ["main_frame"] }
      });
    }
    for (const d of removedDefaults) {
      dynamic.push({
        id: id++,
        priority: 2, // beats the static block rule
        action: { type: "allow" },
        condition: { requestDomains: [d], resourceTypes: ["main_frame"] }
      });
    }
  }

  const existing = await DS_API.declarativeNetRequest.getDynamicRules();
  await DS_API.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map(function (r) {
      return r.id;
    }),
    addRules: dynamic
  });
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
  const errorMode = config.enabled && config.mode === "error";

  await syncStaticRuleset(errorMode);
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
