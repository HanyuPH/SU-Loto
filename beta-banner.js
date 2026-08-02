(() => {
  "use strict";
  const BUILD = "v8";

  function init() {
    let bar = document.getElementById("su-beta-banner");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "su-beta-banner";
      bar.style.cssText = "position:sticky;top:0;z-index:9999;background:#fff3cd;color:#6b4f00;border-bottom:1px solid #e5c76b;padding:8px 12px;text-align:center;font:700 13px system-ui,sans-serif";
      document.body.prepend(bar);
    }
    bar.textContent = `SU Loto Beta ${BUILD} — ambiente de testes`;
    document.documentElement.dataset.suLotoBetaBuild = BUILD;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
