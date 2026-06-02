/* Admin panel logic. Loads config into the form and saves edits back. */
(function () {
  const els = {
    enabled: document.getElementById("enabled"),
    enabledLabel: document.getElementById("enabledLabel"),
    modes: Array.prototype.slice.call(
      document.querySelectorAll('input[name="mode"]')
    ),
    redirectRow: document.getElementById("redirectRow"),
    redirectUrl: document.getElementById("redirectUrl"),
    wordingCard: document.getElementById("wordingCard"),
    bannerTextRow: document.getElementById("bannerTextRow"),
    bannerText: document.getElementById("bannerText"),
    blockedTitleRow: document.getElementById("blockedTitleRow"),
    blockedTitle: document.getElementById("blockedTitle"),
    blockedTextRow: document.getElementById("blockedTextRow"),
    blockedText: document.getElementById("blockedText"),
    backLabelRow: document.getElementById("backLabelRow"),
    backLabel: document.getElementById("backLabel"),
    hideLabelRow: document.getElementById("hideLabelRow"),
    hideLabel: document.getElementById("hideLabel"),
    manageLabelRow: document.getElementById("manageLabelRow"),
    manageLabel: document.getElementById("manageLabel"),
    blocklist: document.getElementById("blocklist"),
    count: document.getElementById("count"),
    resetList: document.getElementById("resetList"),
    save: document.getElementById("save"),
    status: document.getElementById("status")
  };

  let statusTimer = null;

  function selectedMode() {
    const checked = els.modes.find(function (m) {
      return m.checked;
    });
    return checked ? checked.value : "warning";
  }

  function syncDependentUI() {
    const mode = selectedMode();
    els.redirectRow.hidden = mode !== "redirect";

    // Show only the wording that applies to the current mode.
    els.bannerTextRow.hidden = mode !== "warning";
    els.blockedTitleRow.hidden = mode !== "error";
    els.blockedTextRow.hidden = mode !== "error";
    els.backLabelRow.hidden = mode === "redirect"; // both warning + stop page
    els.hideLabelRow.hidden = mode !== "warning";
    els.manageLabelRow.hidden = mode !== "error";
    els.wordingCard.hidden = mode === "redirect";

    els.enabledLabel.textContent = els.enabled.checked ? "Enabled" : "Disabled";
    const n = parseBlocklist(els.blocklist.value).length;
    els.count.textContent = n + (n === 1 ? " site" : " sites");
  }

  function showStatus(text) {
    els.status.textContent = text;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      els.status.textContent = "";
    }, 2500);
  }

  function load() {
    getConfig().then(function (config) {
      els.enabled.checked = !!config.enabled;
      els.modes.forEach(function (m) {
        m.checked = m.value === config.mode;
      });
      els.redirectUrl.value = config.redirectUrl || "";
      els.bannerText.value = config.bannerText;
      els.blockedTitle.value = config.blockedTitle;
      els.blockedText.value = config.blockedText;
      els.backLabel.value = config.backLabel;
      els.hideLabel.value = config.hideLabel;
      els.manageLabel.value = config.manageLabel;
      els.blocklist.value = config.blocklist.join("\n");
      syncDependentUI();
    });
  }

  function save() {
    const mode = selectedMode();
    const blocklist = parseBlocklist(els.blocklist.value);
    let redirectUrl = els.redirectUrl.value.trim();

    if (mode === "redirect") {
      if (!redirectUrl) {
        showStatus("Add a redirect URL first.");
        els.redirectUrl.focus();
        return;
      }
      if (!/^https?:\/\//i.test(redirectUrl)) {
        redirectUrl = "https://" + redirectUrl;
      }
    }

    // Request host permission for any user-added (non-default) domains. This
    // MUST run synchronously off the click — no awaits before it — so the
    // browser still sees the user gesture. Already-granted origins don't
    // re-prompt, so it's safe to request the whole set.
    const userDomains = userAddedDomains(blocklist);
    requestDomainPermissions(userDomains)
      .then(function (granted) {
        return setConfig({
          enabled: els.enabled.checked,
          mode: mode,
          redirectUrl: redirectUrl || DEFAULT_CONFIG.redirectUrl,
          bannerText: els.bannerText.value.trim() || DEFAULT_CONFIG.bannerText,
          blockedTitle:
            els.blockedTitle.value.trim() || DEFAULT_CONFIG.blockedTitle,
          blockedText: els.blockedText.value.trim() || DEFAULT_CONFIG.blockedText,
          backLabel: els.backLabel.value.trim() || DEFAULT_CONFIG.backLabel,
          hideLabel: els.hideLabel.value.trim() || DEFAULT_CONFIG.hideLabel,
          manageLabel: els.manageLabel.value.trim() || DEFAULT_CONFIG.manageLabel,
          blocklist: blocklist
        }).then(function () {
          els.blocklist.value = blocklist.join("\n");
          els.redirectUrl.value = redirectUrl;
          syncDependentUI();
          if (userDomains.length && !granted) {
            showStatus("Saved — but allow the permission to block your own sites.");
          } else {
            showStatus("Saved ✓");
          }
        });
      })
      .catch(function () {
        showStatus("Couldn't save — permission request failed.");
      });
  }

  els.modes.forEach(function (m) {
    m.addEventListener("change", syncDependentUI);
  });
  els.enabled.addEventListener("change", syncDependentUI);
  els.blocklist.addEventListener("input", syncDependentUI);
  els.resetList.addEventListener("click", function () {
    els.blocklist.value = DEFAULT_BLOCKLIST.join("\n");
    syncDependentUI();
    showStatus("List reset — remember to save.");
  });
  els.save.addEventListener("click", save);

  load();
})();
