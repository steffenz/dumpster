/* Admin panel: bins in a grid, a popup editor per bin, and an Appearance tab. */
(function () {
  const MODE_LABELS = {
    warning: "Warning bar",
    redirect: "Redirect",
    error: "Stop page"
  };
  const TRASH_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
    '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  const $ = function (id) {
    return document.getElementById(id);
  };

  let current = null; // last-saved config, kept in sync with storage
  let editingId = null; // bin id open in the modal (null = new bin)
  let editingEnabled = true; // preserve the bin's enabled flag across an edit
  let modalSnapshot = "";
  let appSnapshot = "";
  let statusTimer = null;

  /* ---------- persistence ---------- */

  function persist(patch) {
    return setConfig(patch).then(function (cfg) {
      current = cfg;
      return cfg;
    });
  }

  /* ---------- grid ---------- */

  function renderGrid() {
    const wrap = $("bins");
    wrap.textContent = "";
    $("emptyBins").hidden = current.bins.length > 0;

    current.bins.forEach(function (bin) {
      const card = document.createElement("article");
      card.className = "bin-card" + (bin.enabled === false ? " is-off" : "");
      card.dataset.id = bin.id;

      const n = bin.sites.length;
      card.innerHTML =
        '<div class="bin-card-top">' +
        '<button type="button" class="bin-card-name bin-edit">' +
        "</button>" +
        '<label class="switch switch-sm bin-toggle"><input type="checkbox"><span class="switch-track"><span class="switch-thumb"></span></span></label>' +
        "</div>" +
        '<div class="bin-card-meta">' +
        '<span class="badge badge-' +
        bin.mode +
        '">' +
        MODE_LABELS[bin.mode] +
        "</span>" +
        '<span class="bin-card-count">' +
        n +
        (n === 1 ? " site" : " sites") +
        "</span>" +
        "</div>" +
        '<div class="bin-card-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm bin-edit">Edit</button>' +
        '<button type="button" class="row-del bin-card-del" title="Delete bin" aria-label="Delete bin">' +
        TRASH_SVG +
        "</button>" +
        "</div>";

      card.querySelector(".bin-card-name").textContent = bin.name;
      card.querySelector(".bin-toggle input").checked = bin.enabled !== false;
      wrap.appendChild(card);
    });
  }

  /* ---------- rows (inside modal) ---------- */

  function buildRow(site) {
    site = site || {};
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
      '<input type="url" class="row-ovr-url" placeholder="Uses the bin\'s redirect if left blank" spellcheck="false">' +
      "</div>";
    row.querySelector(".row-domain").value = site.domain || "";
    row.querySelector(".row-action").value = site.action || "default";
    if (site.redirectUrl) row.querySelector(".row-ovr-url").value = site.redirectUrl;
    return row;
  }

  function readRow(row) {
    const domain = normalizeDomain(row.querySelector(".row-domain").value);
    if (!domain) return null;
    const action = row.querySelector(".row-action").value;
    const site = { domain: domain, action: action };
    if (action === "redirect") {
      const url = normalizeUrl(row.querySelector(".row-ovr-url").value);
      if (url) site.redirectUrl = url;
    }
    return site;
  }

  function readModalSites() {
    const seen = new Set();
    const out = [];
    $("modalRows")
      .querySelectorAll(".block-row")
      .forEach(function (row) {
        const s = readRow(row);
        if (s && !seen.has(s.domain)) {
          seen.add(s.domain);
          out.push(s);
        }
      });
    return out;
  }

  function readModalBin() {
    return {
      id: editingId || makeId(),
      name: $("modalName").value.trim() || "Untitled bin",
      enabled: editingEnabled,
      mode: $("modalMode").value,
      redirectUrl: normalizeUrl($("modalRedirect").value),
      sites: readModalSites()
    };
  }

  /* ---------- modal UI sync ---------- */

  function syncModalUI() {
    const mode = $("modalMode").value;
    $("modalRedirectRow").hidden = mode !== "redirect";
    const label = "Default (" + MODE_LABELS[mode] + ")";
    const rowsEl = $("modalRows");
    rowsEl.querySelectorAll('.row-action option[value="default"]').forEach(
      function (opt) {
        opt.textContent = label;
      }
    );
    rowsEl.querySelectorAll(".block-row").forEach(function (row) {
      row.classList.toggle(
        "show-redirect",
        row.querySelector(".row-action").value === "redirect"
      );
    });
    const n = rowsEl.querySelectorAll(".block-row").length;
    $("modalCount").textContent = n + (n === 1 ? " site" : " sites");
  }

  function modalSnapshotNow() {
    return JSON.stringify(readModalBin());
  }

  function refreshModalDirty() {
    const dirty = editingId === null || modalSnapshotNow() !== modalSnapshot;
    $("modalDirty").hidden = !dirty;
    $("modalSave").disabled = !dirty;
  }

  function onModalChange() {
    syncModalUI();
    refreshModalDirty();
  }

  /* ---------- modal open/close ---------- */

  function openModal(bin) {
    editingId = bin ? bin.id : null;
    editingEnabled = bin ? bin.enabled !== false : true;
    bin = bin || newBin("Bin " + (current.bins.length + 1));

    $("modalName").value = bin.name || "";
    $("modalMode").value = bin.mode || "warning";
    $("modalRedirect").value = bin.redirectUrl || "";
    const rowsEl = $("modalRows");
    rowsEl.textContent = "";
    (bin.sites || []).forEach(function (s) {
      rowsEl.appendChild(buildRow(s));
    });
    $("modalPasteBox").hidden = true;
    $("modalPasteText").value = "";

    syncModalUI();
    modalSnapshot = modalSnapshotNow();
    refreshModalDirty();

    $("binModal").hidden = false;
    $("modalName").focus();
  }

  function modalIsDirty() {
    return editingId === null || modalSnapshotNow() !== modalSnapshot;
  }

  function closeModal(force) {
    if (!force && modalIsDirty()) {
      if (!window.confirm("Discard unsaved changes to this bin?")) return;
    }
    $("binModal").hidden = true;
    editingId = null;
  }

  function saveModal() {
    const bin = readModalBin();
    const usesRedirect =
      bin.mode === "redirect" ||
      bin.sites.some(function (s) {
        return s.action === "redirect";
      });
    if (usesRedirect && !bin.redirectUrl) {
      flashModal("Add a default redirect URL first.");
      $("modalRedirect").focus();
      return;
    }

    // Request host permission for this bin's domains (gesture from the click).
    requestDomainPermissions(bin.sites.map(function (s) {
      return s.domain;
    }))
      .then(function () {
        const bins = current.bins.slice();
        const idx = bins.findIndex(function (b) {
          return b.id === bin.id;
        });
        if (idx >= 0) bins[idx] = bin;
        else bins.push(bin);
        return persist({ bins: bins });
      })
      .then(function () {
        // Snapshot matches saved state so closeModal() won't prompt, then close.
        editingId = bin.id;
        modalSnapshot = modalSnapshotNow();
        renderGrid();
        closeModal(true);
      })
      .catch(function () {
        flashModal("Couldn't save — permission request failed.");
      });
  }

  function deleteModalBin() {
    const name = $("modalName").value.trim() || "this bin";
    if (editingId === null) {
      closeModal(true);
      return;
    }
    if (!window.confirm("Delete the bin “" + name + "” and all its sites?")) return;
    const bins = current.bins.filter(function (b) {
      return b.id !== editingId;
    });
    persist({ bins: bins }).then(function () {
      renderGrid();
      closeModal(true);
    });
  }

  let modalStatusTimer = null;
  function flashModal(text) {
    const el = $("modalDirty");
    el.hidden = false;
    el.querySelector(".dirty-dot").style.display = "none";
    el.lastChild.textContent = text;
    if (modalStatusTimer) clearTimeout(modalStatusTimer);
    modalStatusTimer = setTimeout(function () {
      el.querySelector(".dirty-dot").style.display = "";
      el.lastChild.textContent = "Unsaved";
      refreshModalDirty();
    }, 1600);
  }

  /* ---------- appearance tab ---------- */

  const APP_FIELDS = [
    "bannerText",
    "blockedTitle",
    "blockedText",
    "backLabel",
    "hideLabel",
    "manageLabel"
  ];

  function fillAppearance(config) {
    APP_FIELDS.forEach(function (k) {
      $(k).value = config[k];
    });
  }

  function appSnapshotNow() {
    return JSON.stringify(
      APP_FIELDS.map(function (k) {
        return $(k).value.trim();
      })
    );
  }

  function refreshAppDirty() {
    const dirty = appSnapshotNow() !== appSnapshot;
    $("appDirty").hidden = !dirty;
    $("appSave").disabled = !dirty;
    $("appSave").textContent = dirty ? "Save changes" : "Saved";
  }

  function saveAppearance() {
    const patch = {};
    APP_FIELDS.forEach(function (k) {
      patch[k] = $(k).value.trim() || DEFAULT_CONFIG[k];
    });
    persist(patch).then(function () {
      fillAppearance(current);
      appSnapshot = appSnapshotNow();
      refreshAppDirty();
      flashStatus("appStatus", "Saved ✓");
    });
  }

  function flashStatus(id, text) {
    const el = $(id);
    el.textContent = text;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      el.textContent = "";
    }, 2500);
  }

  /* ---------- tabs ---------- */

  function selectTab(name) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("is-active", t.dataset.tab === name);
    });
    document.querySelectorAll(".tabpane").forEach(function (p) {
      p.hidden = p.dataset.pane !== name;
    });
  }

  /* ---------- wiring ---------- */

  function load() {
    getConfig().then(function (config) {
      current = config;
      $("enabled").checked = !!config.enabled;
      $("enabledLabel").textContent = config.enabled ? "Enabled" : "Disabled";
      fillAppearance(config);
      appSnapshot = appSnapshotNow();
      refreshAppDirty();
      renderGrid();
    });
  }

  // Master enable — applies instantly.
  $("enabled").addEventListener("change", function () {
    $("enabledLabel").textContent = $("enabled").checked
      ? "Enabled"
      : "Disabled";
    persist({ enabled: $("enabled").checked });
  });

  // Tabs.
  document.querySelector(".tabs").addEventListener("click", function (e) {
    const tab = e.target.closest(".tab");
    if (tab) selectTab(tab.dataset.tab);
  });

  // Grid interactions.
  $("bins").addEventListener("click", function (e) {
    const card = e.target.closest(".bin-card");
    if (!card) return;
    const bin = current.bins.find(function (b) {
      return b.id === card.dataset.id;
    });
    if (!bin) return;

    if (e.target.closest(".bin-card-del")) {
      if (window.confirm("Delete the bin “" + bin.name + "” and all its sites?")) {
        const bins = current.bins.filter(function (b) {
          return b.id !== bin.id;
        });
        persist({ bins: bins }).then(renderGrid);
      }
      return;
    }
    if (e.target.closest(".bin-edit")) {
      openModal(bin);
    }
  });

  // Bin enable toggle — applies instantly.
  $("bins").addEventListener("change", function (e) {
    if (!e.target.closest(".bin-toggle")) return;
    const card = e.target.closest(".bin-card");
    const on = e.target.checked;
    const bins = current.bins.map(function (b) {
      return b.id === card.dataset.id ? Object.assign({}, b, { enabled: on }) : b;
    });
    card.classList.toggle("is-off", !on);
    persist({ bins: bins });
  });

  $("newBin").addEventListener("click", function () {
    openModal(null);
  });

  /* Modal events */
  $("binModal").addEventListener("input", onModalChange);
  $("binModal").addEventListener("change", function (e) {
    if (
      e.target.classList.contains("row-action") &&
      e.target.value === "redirect"
    ) {
      const row = e.target.closest(".block-row");
      row.classList.add("show-redirect");
      row.querySelector(".row-ovr-url").focus();
    }
    onModalChange();
  });
  $("binModal").addEventListener("click", function (e) {
    if (e.target.closest(".row-del") && !e.target.closest(".bin-card-del")) {
      const row = e.target.closest(".block-row");
      if (!row) return;
      const domain = normalizeDomain(row.querySelector(".row-domain").value);
      if (domain && !window.confirm("Remove " + domain + "?")) return;
      row.remove();
      onModalChange();
      return;
    }
    // Click outside the dialog (on the backdrop) closes it.
    if (e.target === $("binModal")) closeModal();
  });
  $("modalAddSite").addEventListener("click", function () {
    const row = buildRow();
    $("modalRows").appendChild(row);
    row.querySelector(".row-domain").focus();
    onModalChange();
  });
  $("modalPaste").addEventListener("click", function () {
    const box = $("modalPasteBox");
    box.hidden = !box.hidden;
    if (!box.hidden) $("modalPasteText").focus();
  });
  $("modalPasteCancel").addEventListener("click", function () {
    $("modalPasteBox").hidden = true;
    $("modalPasteText").value = "";
  });
  $("modalPasteAdd").addEventListener("click", function () {
    const rowsEl = $("modalRows");
    const existing = new Set();
    rowsEl.querySelectorAll(".row-domain").forEach(function (inp) {
      const d = normalizeDomain(inp.value);
      if (d) existing.add(d);
    });
    let added = 0;
    parseBlocklist($("modalPasteText").value).forEach(function (d) {
      if (existing.has(d)) return;
      existing.add(d);
      rowsEl.appendChild(buildRow({ domain: d, action: "default" }));
      added++;
    });
    $("modalPasteBox").hidden = true;
    $("modalPasteText").value = "";
    onModalChange();
    flashModal(added ? "Added " + added + " site(s)." : "No new domains.");
  });
  $("modalSave").addEventListener("click", saveModal);
  $("modalDelete").addEventListener("click", deleteModalBin);
  $("modalCancel").addEventListener("click", function () {
    closeModal();
  });
  $("modalClose").addEventListener("click", function () {
    closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("binModal").hidden) closeModal();
  });

  /* Appearance events */
  $("appSave").addEventListener("click", saveAppearance);
  $("appReset").addEventListener("click", function () {
    APP_FIELDS.forEach(function (k) {
      $(k).value = DEFAULT_CONFIG[k];
    });
    refreshAppDirty();
    flashStatus("appStatus", "Reset — remember to Save.");
  });
  document
    .querySelector('.tabpane[data-pane="appearance"]')
    .addEventListener("input", refreshAppDirty);

  load();
})();
