// Example SUPERIPS extension (userscript-style)
// Loaded from extensions/*.js when "Enable Local JS Extensions" is active.
(function () {
  if (!document || !document.body) {
    return;
  }
  document.documentElement.setAttribute("data-superips-extension", "enabled");
})();
