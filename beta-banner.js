(() => {
  "use strict";
  function init() {
    if (document.getElementById("su-beta-banner")) return;
    const bar = document.createElement("div");
    bar.id = "su-beta-banner";
    bar.textContent = "SU Loto Beta — ambiente de testes";
    bar.style.cssText = "position:sticky;top:0;z-index:9999;background:#fff3cd;color:#6b4f00;border-bottom:1px solid #e5c76b;padding:8px 12px;text-align:center;font:700 13px system-ui,sans-serif";
    document.body.prepend(bar);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
