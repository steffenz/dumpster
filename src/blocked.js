/* Block page shown in "error" mode. Reads the blocked domain from the URL. */
(function () {
  const params = new URLSearchParams(window.location.search);
  const domain = params.get("domain") || "This site";

  getConfig()
    .then(function (config) {
      document.getElementById("blockedTitle").textContent = config.blockedTitle;
      fillTemplate(
        document.getElementById("blockedSub"),
        config.blockedText,
        domain,
        "domain"
      );
      document.getElementById("back").textContent = config.backLabel;
      document.getElementById("options").textContent = config.manageLabel;
    })
    .catch(function () {
      fillTemplate(
        document.getElementById("blockedSub"),
        DEFAULT_CONFIG.blockedText,
        domain,
        "domain"
      );
    });

  document.getElementById("back").addEventListener("click", function () {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "about:blank";
    }
  });

  document.getElementById("options").addEventListener("click", function () {
    DS_API.runtime.openOptionsPage();
  });
})();
