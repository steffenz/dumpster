/* Quick toggles in the toolbar popup. Changes save immediately. */
(function () {
  const enabled = document.getElementById("enabled");
  const binsEl = document.getElementById("bins");
  const status = document.getElementById("status");
  const options = document.getElementById("options");

  let timer = null;
  function flash(text) {
    status.textContent = text;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      status.textContent = "";
    }, 1800);
  }

  const MODE_LABELS = {
    warning: "Warning bar",
    redirect: "Redirect",
    error: "Stop page"
  };

  function render(config) {
    enabled.checked = !!config.enabled;
    binsEl.textContent = "";

    if (!config.bins.length) {
      const empty = document.createElement("p");
      empty.className = "popup-empty";
      empty.textContent = "No bins yet. Open settings to create one.";
      binsEl.appendChild(empty);
      return;
    }

    config.bins.forEach(function (bin) {
      const row = document.createElement("label");
      row.className = "popup-bin";

      const meta = document.createElement("span");
      meta.className = "popup-bin-meta";
      const name = document.createElement("span");
      name.className = "popup-bin-name";
      name.textContent = bin.name;
      const sub = document.createElement("span");
      sub.className = "popup-bin-sub";
      const n = bin.sites.length;
      sub.textContent =
        n + (n === 1 ? " site · " : " sites · ") + MODE_LABELS[bin.mode];
      meta.appendChild(name);
      meta.appendChild(sub);

      const sw = document.createElement("span");
      sw.className = "switch switch-sm";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = bin.enabled !== false;
      cb.disabled = !config.enabled;
      const track = document.createElement("span");
      track.className = "switch-track";
      track.appendChild(Object.assign(document.createElement("span"), { className: "switch-thumb" }));
      sw.appendChild(cb);
      sw.appendChild(track);

      cb.addEventListener("change", function () {
        toggleBin(bin.id, cb.checked);
      });

      row.appendChild(meta);
      row.appendChild(sw);
      binsEl.appendChild(row);
    });
  }

  function toggleBin(id, on) {
    getConfig().then(function (cfg) {
      const bins = cfg.bins.map(function (b) {
        return b.id === id ? Object.assign({}, b, { enabled: on }) : b;
      });
      setConfig({ bins: bins }).then(function () {
        flash(on ? "Bin on" : "Bin off");
      });
    });
  }

  getConfig().then(render);

  enabled.addEventListener("change", function () {
    setConfig({ enabled: enabled.checked }).then(function (cfg) {
      render(cfg);
      flash(cfg.enabled ? "Blocking on" : "Blocking off");
    });
  });

  options.addEventListener("click", function () {
    DS_API.runtime.openOptionsPage();
  });
})();
