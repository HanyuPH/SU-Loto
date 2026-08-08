(() => {
  "use strict";

  const LAST_SERVER_SYNC_KEY = "su-loto-c2-last-server-sync-v1";
  const ACTIVE = Boolean(globalThis.SULotoFirestoreTransport?.ios);
  const STANDALONE = Boolean(navigator.standalone) || globalThis.matchMedia?.("(display-mode: standalone)")?.matches === true;
  const FRESH_MS = 120000;
  const RETRY_AFTER_MS = 2500;
  const STARTUP_TEXT = /^(Verificando login|Preparando sincronização|Conectando à nuvem|Conexão lenta|Reconectando)/i;

  let rootObserver = null;
  let panelObserver = null;
  let observedRoot = null;
  let observedPanel = null;
  let manualWrapped = false;
  let wakeTimer = null;
  let lastEvent = null;

  function syncAt() {
    return localStorage.getItem(LAST_SERVER_SYNC_KEY) || null;
  }

  function syncAtMs() {
    const value = new Date(syncAt() || 0).getTime();
    return Number.isFinite(value) ? value : 0;
  }

  function isFresh() {
    const value = syncAtMs();
    return value > 0 && Date.now() - value < FRESH_MS;
  }

  function format(value) {
    if (!value) return "Nunca";
    try {
      return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
    } catch {
      return String(value);
    }
  }

  function ensureProtocolLabel() {
    if (!ACTIVE) return;
    const panel = document.getElementById("su-loto-cloud-panel");
    const body = panel?.querySelector(".su-eco-body") || panel?.querySelector(".su-loto-card");
    if (!body || document.getElementById("su-loto-ios-sync-protocol")) return;
    const label = document.createElement("p");
    label.id = "su-loto-ios-sync-protocol";
    label.style.cssText = "margin:0 0 14px;color:#6b7280;font-size:.78rem;font-weight:700;line-height:1.35";
    label.textContent = `${STANDALONE ? "Aplicativo iPhone" : "Safari iPhone"} • sincronização rápida REST • sync-v8`;
    const actions = body.querySelector(".su-loto-actions");
    if (actions) body.insertBefore(label, actions);
    else body.appendChild(label);
  }

  function reflectHealthyUi() {
    if (!ACTIVE) return;
    ensureProtocolLabel();

    const button = document.getElementById("su-loto-cloud-status");
    const label = document.getElementById("su-loto-cloud-text");
    const last = document.getElementById("su-loto-last");
    const stateCopy = document.getElementById("su-loto-state");
    const currentText = String(label?.textContent || "").trim();

    if (last && syncAt()) {
      const next = format(syncAt());
      if (last.textContent !== next) last.textContent = next;
    }

    if (navigator.onLine && isFresh() && STARTUP_TEXT.test(currentText)) {
      if (button?.dataset.state !== "synced") button.dataset.state = "synced";
      if (label && label.textContent !== "Sincronizado em segundo plano") label.textContent = "Sincronizado em segundo plano";
    }

    if (stateCopy && label && stateCopy.textContent !== label.textContent) {
      stateCopy.textContent = label.textContent;
    }
  }

  function attachObservers() {
    const root = document.getElementById("su-loto-cloud-root");
    if (root && root !== observedRoot) {
      rootObserver?.disconnect();
      observedRoot = root;
      rootObserver = new MutationObserver(reflectHealthyUi);
      rootObserver.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-state"] });
    }

    const panel = document.getElementById("su-loto-cloud-panel");
    if (panel && panel !== observedPanel) {
      panelObserver?.disconnect();
      observedPanel = panel;
      panelObserver = new MutationObserver(reflectHealthyUi);
      panelObserver.observe(panel, { childList: true, subtree: true, characterData: true });
    }

    reflectHealthyUi();
    return Boolean(root && panel);
  }

  function installObservers() {
    if (attachObservers()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (attachObservers() || attempts >= 240) clearInterval(timer);
    }, 50);
  }

  function wrapManualSync() {
    if (!ACTIVE || manualWrapped) return Boolean(manualWrapped);
    const button = document.getElementById("su-loto-sync-now");
    if (!button || typeof button.onclick !== "function") return false;

    const original = button.onclick;
    button.onclick = async event => {
      const label = document.getElementById("su-loto-cloud-text");
      const stateButton = document.getElementById("su-loto-cloud-status");
      if (stateButton) stateButton.dataset.state = "saving";
      if (label) label.textContent = "Atualizando dados da nuvem…";

      const refresh = globalThis.SULotoIOSRestStatus?.refreshNow;
      if (typeof refresh === "function") {
        const ok = await refresh("manual-preflight");
        if (!ok) {
          if (stateButton) stateButton.dataset.state = navigator.onLine ? "error" : "offline";
          if (label) label.textContent = navigator.onLine ? "Falha ao baixar estado atual" : "Offline • alterações em espera";
          reflectHealthyUi();
          return;
        }
      }

      await original.call(button, event);
      reflectHealthyUi();
    };
    button.dataset.iosSafeSync = "true";
    manualWrapped = true;
    return true;
  }

  function installManualSyncGuard() {
    if (wrapManualSync()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (wrapManualSync() || attempts >= 240) clearInterval(timer);
    }, 50);
  }

  function scheduleWakeFallback(reason) {
    if (!ACTIVE || !STANDALONE || !navigator.onLine) return;
    const before = syncAtMs();
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(async () => {
      const current = syncAtMs();
      if (current > before && Date.now() - current < RETRY_AFTER_MS + 1500) return;
      try {
        await globalThis.SULotoIOSRestStatus?.refreshNow?.(`pwa-fallback-${reason}`);
      } catch (error) {
        console.warn("SU Loto PWA: retomada REST de segurança falhou.", error);
      }
      reflectHealthyUi();
    }, RETRY_AFTER_MS);
  }

  window.addEventListener("su:loto-ios-rest-status-refresh", event => {
    lastEvent = event.detail || null;
    if (event.detail?.ok) reflectHealthyUi();
  });

  window.addEventListener("su:loto-cloud-refresh", event => {
    lastEvent = event.detail || lastEvent;
    reflectHealthyUi();
  });

  if (ACTIVE && STANDALONE) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleWakeFallback("visibility");
    });
    window.addEventListener("pageshow", () => scheduleWakeFallback("pageshow"));
    window.addEventListener("online", () => scheduleWakeFallback("online"));
    scheduleWakeFallback("startup");
  }

  installObservers();
  installManualSyncGuard();

  globalThis.SULotoIOSPWASync = Object.freeze({
    active: ACTIVE,
    standalone: STANDALONE,
    protocol: "sync-v8",
    lastServerSyncAt: syncAt,
    diagnostics: () => ({
      active: ACTIVE,
      standalone: STANDALONE,
      protocol: "sync-v8",
      lastServerSyncAt: syncAt(),
      fresh: isFresh(),
      manualWrapped,
      lastEvent
    })
  });
})();
