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
    blockRows: document.getElementById("blockRows"),
    addSite: document.getElementById("addSite"),
    count: document.getElementById("count"),
    resetList: document.getElementById("resetList"),
    save: document.getElementById("save"),
    status: document.getElementById("status"),
    dirty: document.getElementById("dirty")
  };

  const MODE_LABELS = {
    warning: "Warning bar",
    redirect: "Redirect",
    error: "Stop page"
  };

  let statusTimer = null;
  let savedSnapshot = null;
  let isDirty = false;

  function selectedMode() {
    const checked = els.modes.find(function (m) {
      return m.checked;
    });
    return checked ? checked.value : "warning";
  }

  /* ---------- Block-list rows ---------- */

  const TRASH_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 6h18"/>' +
    '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
    '<line x1="10" y1="11" x2="10" y2="17"/>' +
    '<line x1="14" y1="11" x2="14" y2="17"/>' +
    "</svg>";

  function buildRow(domain, override) {
    override = override || {};
    const row = document.createElement("div");
    row.className = "block-row";
    row.innerHTML =
      '<div class="row-main">' +
      '<input type="text" class="row-domain" placeholder="example.com" spellcheck="false" autocapitalize="off" autocorrect="off">' +
      '<select class="row-action" aria-label="What happens on this site">' +
      '<option value="default">Default</option>' +
      '<option value="warning">Warning bar</option>' +
      '<option value="redirect">Redirect</option>' +
      '<option value="error">Stop page</option>' +
      "</select>" +
      '<button type="button" class="row-del" aria-label="Remove site" title="Remove site">' +
      TRASH_SVG +
      "</button>" +
      "</div>" +
      '<div class="row-redirect">' +
      '<span class="row-arrow" aria-hidden="true">&rarr;</span>' +
      '<input type="url" class="row-ovr-url" placeholder="Uses the default redirect if left blank" spellcheck="false">' +
      "</div>";
    row.querySelector(".row-domain").value = domain || "";
    row.querySelector(".row-action").value = override.action || "default";
    if (override.redirectUrl) {
      row.querySelector(".row-ovr-url").value = override.redirectUrl;
    }
    return row;
  }

  function renderRows(domains, overrides) {
    els.blockRows.textContent = "";
    overrides = overrides || {};
    domains.forEach(function (d) {
      els.blockRows.appendChild(buildRow(d, overrides[d]));
    });
  }

  /** Show each row's redirect line only when its action is "redirect". */
  function updateRowStates() {
    els.blockRows.querySelectorAll(".block-row").forEach(function (row) {
      const action = row.querySelector(".row-action").value;
      row.classList.toggle("show-redirect", action === "redirect");
    });
  }

  /** Collect rows into { domains, siteOverrides }. */
  function readRows() {
    const domains = [];
    const siteOverrides = {};
    const seen = new Set();
    els.blockRows.querySelectorAll(".block-row").forEach(function (row) {
      const d = normalizeDomain(row.querySelector(".row-domain").value);
      if (!d || seen.has(d)) return;
      seen.add(d);
      domains.push(d);
      const action = row.querySelector(".row-action").value;
      if (action !== "default") {
        const o = { action: action };
        if (action === "redirect") {
          const url = normalizeUrl(row.querySelector(".row-ovr-url").value);
          if (url) o.redirectUrl = url;
        }
        siteOverrides[d] = o;
      }
    });
    return { domains: domains, siteOverrides: siteOverrides };
  }

  /** The set of actions in play: the default, plus every per-site override. */
  function usedActions() {
    const set = new Set([selectedMode()]);
    els.blockRows.querySelectorAll(".row-action").forEach(function (s) {
      if (s.value !== "default") set.add(s.value);
    });
    return set;
  }

  /* ---------- Mode-dependent visibility ---------- */

  function syncDependentUI() {
    const mode = selectedMode();
    const used = usedActions();

    // The default redirect URL matters whenever anything redirects.
    els.redirectRow.hidden = !used.has("redirect");

    // Show only the wording for actions actually in use (default or overridden).
    const warn = used.has("warning");
    const stop = used.has("error");
    els.bannerTextRow.hidden = !warn;
    els.blockedTitleRow.hidden = !stop;
    els.blockedTextRow.hidden = !stop;
    els.backLabelRow.hidden = !(warn || stop);
    els.hideLabelRow.hidden = !warn;
    els.manageLabelRow.hidden = !stop;
    els.wordingCard.hidden = !(warn || stop);

    // Reflect the current default in every row's "Default" option.
    const label = "Default (" + MODE_LABELS[mode] + ")";
    els.blockRows
      .querySelectorAll('.row-action option[value="default"]')
      .forEach(function (opt) {
        opt.textContent = label;
      });

    els.enabledLabel.textContent = els.enabled.checked ? "Enabled" : "Disabled";
    const n = readRows().domains.length;
    els.count.textContent = n + (n === 1 ? " site" : " sites");
  }

  /* ---------- Unsaved-changes tracking ---------- */

  function formSnapshot() {
    const rows = readRows();
    return JSON.stringify({
      enabled: els.enabled.checked,
      mode: selectedMode(),
      redirectUrl: els.redirectUrl.value.trim(),
      bannerText: els.bannerText.value.trim(),
      blockedTitle: els.blockedTitle.value.trim(),
      blockedText: els.blockedText.value.trim(),
      backLabel: els.backLabel.value.trim(),
      hideLabel: els.hideLabel.value.trim(),
      manageLabel: els.manageLabel.value.trim(),
      domains: rows.domains,
      siteOverrides: rows.siteOverrides
    });
  }

  function setDirty(dirty) {
    isDirty = dirty;
    els.dirty.hidden = !dirty;
    els.save.disabled = !dirty;
    els.save.textContent = dirty ? "Save changes" : "Saved";
  }

  function refreshDirty() {
    setDirty(formSnapshot() !== savedSnapshot);
  }

  function markClean() {
    savedSnapshot = formSnapshot();
    setDirty(false);
  }

  function showStatus(text) {
    els.status.textContent = text;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      els.status.textContent = "";
    }, 2500);
  }

  /* ---------- Load / save ---------- */

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
      renderRows(config.blocklist, config.siteOverrides);
      updateRowStates();
      syncDependentUI();
      markClean();
    });
  }

  function save() {
    const mode = selectedMode();
    const rows = readRows();
    const used = usedActions();
    let redirectUrl = els.redirectUrl.value.trim();

    if (used.has("redirect")) {
      if (!redirectUrl) {
        showStatus("Add a default redirect URL first.");
        els.redirectUrl.focus();
        return;
      }
      redirectUrl = normalizeUrl(redirectUrl);
    }

    // Request host permission for any user-added (non-default) domains. This
    // MUST run synchronously off the click — no awaits before it — so the
    // browser still sees the user gesture. Already-granted origins don't
    // re-prompt, so it's safe to request the whole set.
    const userDomains = userAddedDomains(rows.domains);
    requestDomainPermissions(userDomains)
      .then(function (granted) {
        return setConfig({
          enabled: els.enabled.checked,
          mode: mode,
          redirectUrl: redirectUrl || DEFAULT_CONFIG.redirectUrl,
          siteOverrides: rows.siteOverrides,
          bannerText: els.bannerText.value.trim() || DEFAULT_CONFIG.bannerText,
          blockedTitle:
            els.blockedTitle.value.trim() || DEFAULT_CONFIG.blockedTitle,
          blockedText: els.blockedText.value.trim() || DEFAULT_CONFIG.blockedText,
          backLabel: els.backLabel.value.trim() || DEFAULT_CONFIG.backLabel,
          hideLabel: els.hideLabel.value.trim() || DEFAULT_CONFIG.hideLabel,
          manageLabel: els.manageLabel.value.trim() || DEFAULT_CONFIG.manageLabel,
          blocklist: rows.domains
        }).then(function () {
          // Re-render from the cleaned data (dedupes, lowercases, drops blanks).
          els.redirectUrl.value = redirectUrl;
          renderRows(rows.domains, rows.siteOverrides);
          updateRowStates();
          syncDependentUI();
          markClean();
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

  /* ---------- Events ---------- */

  function onAnyChange() {
    updateRowStates();
    syncDependentUI();
    refreshDirty();
  }

  const shell = document.querySelector(".shell");
  shell.addEventListener("input", onAnyChange);
  shell.addEventListener("change", function (e) {
    // When a row is switched to "Redirect", jump focus to its URL box.
    if (
      e.target.classList.contains("row-action") &&
      e.target.value === "redirect"
    ) {
      updateRowStates();
      e.target.closest(".block-row").querySelector(".row-ovr-url").focus();
    }
    onAnyChange();
  });

  // Delete a row, confirming first if it has a real domain in it.
  els.blockRows.addEventListener("click", function (e) {
    const del = e.target.closest(".row-del");
    if (!del) return;
    const row = del.closest(".block-row");
    const domain = normalizeDomain(row.querySelector(".row-domain").value);
    if (domain && !window.confirm("Remove " + domain + " from the block list?")) {
      return;
    }
    row.remove();
    onAnyChange();
  });

  els.addSite.addEventListener("click", function () {
    const row = buildRow("", {});
    els.blockRows.appendChild(row);
    row.querySelector(".row-domain").focus();
    onAnyChange();
  });

  els.resetList.addEventListener("click", function () {
    renderRows(DEFAULT_BLOCKLIST, {});
    onAnyChange();
    showStatus("List reset — remember to save.");
  });

  els.save.addEventListener("click", save);

  // Warn before leaving with unsaved edits.
  window.addEventListener("beforeunload", function (e) {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  load();
})();
