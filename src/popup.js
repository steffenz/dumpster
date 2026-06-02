/* Quick toggles in the toolbar popup. Changes save immediately. */
(function () {
  const enabled = document.getElementById("enabled");
  const mode = document.getElementById("mode");
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

  function render(config) {
    enabled.checked = !!config.enabled;
    mode.value = config.mode;
    mode.disabled = !config.enabled;
  }

  getConfig().then(render);

  enabled.addEventListener("change", function () {
    setConfig({ enabled: enabled.checked }).then(function (cfg) {
      render(cfg);
      flash(cfg.enabled ? "Blocking on" : "Blocking off");
    });
  });

  mode.addEventListener("change", function () {
    setConfig({ mode: mode.value }).then(function () {
      flash("Mode saved");
    });
  });

  options.addEventListener("click", function () {
    DS_API.runtime.openOptionsPage();
  });
})();
