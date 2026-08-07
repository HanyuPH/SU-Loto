(() => {
  "use strict";

  const STATUS_KEY = "su-loto-c2-status-v4";
  const VALID = new Set(["pendente", "registrado", "apostado"]);
  const dirtyStatuses = new Map();
  let observedCloudRoot = null;
  let cloudObserver = null;
  let statusGestureUntil = 0;
  let contestRefreshWrapped = false;

  function parsePayload(raw) {
    try {
      const payload = JSON.parse(raw || "null");
      if (!payload || typeof payload !== "object") return null;
      const statuses = payload.statuses && typeof payload.statuses === "object" ? payload.statuses : payload;
      if (!statuses || typeof statuses !== "object") return null;
      return { payload, statuses: { ...statuses } };
    } catch {
      return null;
    }
  }

  function sameStatuses(left, right) {
    if (!left || !right) return false;
    const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const id of ids) {
      const a = VALID.has(left[id]) ? left[id] : "pendente";
      const b = VALID.has(right[id]) ? right[id] : "pendente";
      if (a !== b) return false;
    }
    return true;
  }

  function repairIncomingStorage(event) {
    if (event.key !== STATUS_KEY || !event.newValue) return;
    const parsed = parsePayload(event.newValue);
    if (!parsed) return;

    let repaired = false;
    for (const [id, desired] of dirtyStatuses) {
      const incoming = VALID.has(parsed.statuses[id]) ? parsed.statuses[id] : "pendente";
      if (incoming === desired) {
        dirtyStatuses.delete(id);
        continue;
      }
      parsed.statuses[id] = desired;
      repaired = true;
    }

    if (repaired) {
      const nextPayload = parsed.payload.statuses && typeof parsed.payload.statuses === "object"
        ? { ...parsed.payload, statuses: parsed.statuses }
        : parsed.statuses;
      try { localStorage.setItem(STATUS_KEY, JSON.stringify(nextPayload)); } catch {}
    }

    const current = globalThis.SULotoApp?.getStates?.();
    if (current && sameStatuses(parsed.statuses, current)) {
      event.stopImmediatePropagation();
    }
  }

  function isStatusButton(target) {
    return target?.closest?.(".game-card[data-id] .status-actions button[data-status]") || null;
  }

  function rememberLocalIntent(event) {
    const button = isStatusButton(event.target);
    if (!button) return;
    const id = String(button.closest(".game-card[data-id]")?.dataset.id || "");
    const status = String(button.dataset.status || "");
    if (id && VALID.has(status)) dirtyStatuses.set(id, status);

    // Marca apenas o ciclo do clique de status. O app atualiza cartão e contador
    // imediatamente; qualquer recálculo pesado de concursos é empurrado para
    // depois da primeira pintura do navegador.
    statusGestureUntil = performance.now() + 250;
  }

  function wrapContestRefresh() {
    if (contestRefreshWrapped) return true;
    const contests = globalThis.SULotoContests;
    if (!contests || typeof contests.refresh !== "function") return false;

    const originalRefresh = contests.refresh.bind(contests);
    let queued = false;
    let latestArgs = [];

    contests.refresh = (...args) => {
      const fromStatusGesture = performance.now() <= statusGestureUntil;
      if (!fromStatusGesture) return originalRefresh(...args);

      const scope = document.getElementById("contest-scope")?.value || "all";
      if (scope === "all") return;

      latestArgs = args;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        setTimeout(() => {
          queued = false;
          originalRefresh(...latestArgs);
        }, 0);
      });
    };

    try {
      Object.defineProperty(contests, "__statusPaintFirstWrapped", { value: true });
    } catch {}
    contestRefreshWrapped = true;
    return true;
  }

  function installContestRefreshDeferral() {
    if (wrapContestRefresh()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (wrapContestRefresh() || attempts >= 200) clearInterval(timer);
    }, 25);
  }

  function injectCloudUxStyle() {
    if (document.getElementById("su-loto-sync-local-first-style")) return;
    const style = document.createElement("style");
    style.id = "su-loto-sync-local-first-style";
    style.textContent = `
      #su-loto-cloud-root[data-sync-quiet="true"] .su-loto-cloud-btn{
        width:40px!important;height:40px!important;padding:0!important;opacity:.84!important;
        display:grid!important;place-items:center!important;
      }
      #su-loto-cloud-root[data-sync-quiet="true"] #su-loto-cloud-text{
        font-size:0!important;line-height:0!important;
      }
      #su-loto-cloud-root[data-sync-quiet="true"] #su-loto-cloud-status[data-state="saving"] #su-loto-cloud-text::after{
        content:"…";font-size:1.1rem;line-height:1;color:#fff;
      }
      #su-loto-cloud-root[data-sync-quiet="true"] #su-loto-cloud-status[data-state="synced"] #su-loto-cloud-text::after{
        content:"✓";font-size:1rem;line-height:1;color:#fff;
      }
    `;
    document.head.appendChild(style);
  }

  function refreshCloudUx() {
    const root = document.getElementById("su-loto-cloud-root");
    const button = document.getElementById("su-loto-cloud-status");
    const label = document.getElementById("su-loto-cloud-text");
    if (!root || !button || !label) return false;

    injectCloudUxStyle();
    const rawText = String(label.textContent || "").trim();
    const state = String(button.dataset.state || "");
    const backgroundSaving = state === "saving" && /^(Salvando (alterações|na nuvem|concursos)|Verificando login|Preparando sincronização|Conectando à nuvem|Conexão lenta|Reconectando)/i.test(rawText);
    const synced = state === "synced" || /Sincronizado/i.test(rawText);

    if (backgroundSaving) {
      if (/^Salvando (alterações|concursos)/i.test(rawText)) label.textContent = "Salvando na nuvem…";
      root.dataset.syncQuiet = "true";
      return true;
    }

    if (synced) {
      root.dataset.syncQuiet = "true";
      return true;
    }

    // Login manual, sincronização manual, offline e erros continuam visíveis.
    // Inicialização, reconexão e salvamento normal ficam compactos no canto.
    root.dataset.syncQuiet = "false";
    return true;
  }

  function attachCloudObserver(root) {
    if (!root || root === observedCloudRoot) return Boolean(root);
    cloudObserver?.disconnect();
    observedCloudRoot = root;
    cloudObserver = new MutationObserver(() => refreshCloudUx());
    cloudObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-state"]
    });
    refreshCloudUx();
    return true;
  }

  function installCloudUxObserver() {
    if (attachCloudObserver(document.getElementById("su-loto-cloud-root"))) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (attachCloudObserver(document.getElementById("su-loto-cloud-root")) || attempts >= 200) {
        clearInterval(timer);
      }
    }, 50);
  }

  document.addEventListener("click", rememberLocalIntent, true);
  window.addEventListener("storage", repairIncomingStorage, true);
  installContestRefreshDeferral();
  installCloudUxObserver();

  globalThis.SULotoLocalFirstGuard = Object.freeze({
    pendingCount: () => dirtyStatuses.size,
    pendingStatuses: () => Object.fromEntries(dirtyStatuses),
    contestRefreshWrapped: () => contestRefreshWrapped
  });
})();
