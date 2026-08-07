(() => {
  "use strict";

  const STATUS_KEY = "su-loto-c2-status-v4";
  const VALID = new Set(["pendente", "registrado", "apostado"]);
  const dirtyStatuses = new Map();
  let quietTimer = null;
  let savingSession = false;

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

  function rememberLocalIntent(event) {
    const button = event.target.closest?.(".game-card[data-id] .status-actions button[data-status]");
    if (!button) return;
    const id = String(button.closest(".game-card[data-id]")?.dataset.id || "");
    const status = String(button.dataset.status || "");
    if (id && VALID.has(status)) dirtyStatuses.set(id, status);
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
      #su-loto-cloud-root[data-sync-quiet="true"] #su-loto-cloud-text::after{
        content:"✓";font-size:1rem;line-height:1;color:#fff;
      }
    `;
    document.head.appendChild(style);
  }

  function quietCloudRoot(root, delay) {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      if (root?.isConnected) root.dataset.syncQuiet = "true";
    }, delay);
  }

  function refreshCloudUx() {
    const root = document.getElementById("su-loto-cloud-root");
    const button = document.getElementById("su-loto-cloud-status");
    const label = document.getElementById("su-loto-cloud-text");
    if (!root || !button || !label) return false;

    injectCloudUxStyle();
    const rawText = String(label.textContent || "").trim();
    const state = String(button.dataset.state || "");
    const saving = state === "saving" || /Salvando|Sincronizando|Reconectando|Preparando|Verificando/i.test(rawText);
    const synced = state === "synced" || /Sincronizado/i.test(rawText);

    if (saving) {
      if (/Salvando (alterações|na nuvem|concursos)/i.test(rawText) && rawText !== "Salvando na nuvem…") {
        label.textContent = "Salvando na nuvem…";
      }
      if (!savingSession) {
        savingSession = true;
        root.dataset.syncQuiet = "false";
        quietCloudRoot(root, 2200);
      }
      return true;
    }

    savingSession = false;
    clearTimeout(quietTimer);
    if (synced) {
      root.dataset.syncQuiet = "false";
      quietCloudRoot(root, 1200);
    } else {
      root.dataset.syncQuiet = "false";
    }
    return true;
  }

  function installCloudUxObserver() {
    const observer = new MutationObserver(() => refreshCloudUx());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-state"]
    });
    refreshCloudUx();
  }

  document.addEventListener("click", rememberLocalIntent, true);
  window.addEventListener("storage", repairIncomingStorage, true);
  installCloudUxObserver();

  globalThis.SULotoLocalFirstGuard = Object.freeze({
    pendingCount: () => dirtyStatuses.size,
    pendingStatuses: () => Object.fromEntries(dirtyStatuses)
  });
})();
