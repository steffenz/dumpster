/* Block page shown in "error" mode. Reads the blocked domain from the URL. */
(function () {
  const params = new URLSearchParams(window.location.search);
  const domain = params.get("domain") || "";
  const el = document.getElementById("domain");
  el.textContent = domain || "This site";

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
