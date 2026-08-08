const active = Boolean(globalThis.SULotoFirestoreTransport?.ios && globalThis.SULotoFirestoreTransport?.restOnly);
let engine = null;
let initialized = false;
const STATE_EVENT = "su:loto-rest-sync-state";
const STATUS_KEY = "su-loto-c2-status-v4";
const LAST_SYNC_KEY = "su-loto-c2-rest-last-sync-v1";
const RETRY_DELAYS = [0, 650, 1800];
const RECOVERY_WINDOW_MS = 6500;

let generation = 0;
let recoveryPromise = null;
let recoveryUntil = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function onlineAndVisible() {
  return navigator.onLine && document.visibilityState !== "hidden";
}

function diagnostics() {
  try { return engine?.diagnostics?.() || {}; }
  catch { return {}; }
}

function pendingStatuses() {
  try { return engine?.pendingStatuses?.() || {}; }
  catch { return {}; }
}

function emit(kind, text, extra = {}) {
  const detail = {
    kind,
    text,
    at: new Date().toISOString(),
    lastSync: localStorage.getItem(LAST_SYNC_KEY) || null,
    ready: diagnostics().ready || null,
    error: null,
    source: "ios-safari-pwa-catchup",
    ...extra
  };
  window.dispatchEvent(new CustomEvent(STATE_EVENT, { detail }));
}

function markRecovered(text = "Sincronizado") {
  const at = new Date().toISOString();
  localStorage.setItem(LAST_SYNC_KEY, at);
  emit("synced", text, { lastSync: at, error: null });
}

function retryPendingWrite() {
  const pending = pendingStatuses();
  const first = Object.entries(pending)[0];
  if (!first) return false;
  const [id, status] = first;
  const eventName = globalThis.SULotoSyncEvents?.EVENT_NAME || "su:state-change";
  window.dispatchEvent(new CustomEvent(eventName, {
    detail: {
      domain: "statuses",
      source: "ios-catchup-retry",
      detail: { id, status }
    }
  }));
  return true;
}

async function waitForPendingToClear(timeoutMs = 5200) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!Object.keys(pendingStatuses()).length) return true;
    await sleep(250);
  }
  return !Object.keys(pendingStatuses()).length;
}

async function pullDomains() {
  const tasks = [
    engine?.pullStatuses?.(),
    engine?.pullContests?.(),
    engine?.pullContestBets?.()
  ];
  const results = await Promise.allSettled(tasks);
  return {
    ok: results.every(result => result.status === "fulfilled"),
    results
  };
}

async function recover(reason = "retomada") {
  if (!active || !engine?.active || !onlineAndVisible()) return false;
  if (recoveryPromise) return recoveryPromise;

  const run = ++generation;
  recoveryUntil = Date.now() + RECOVERY_WINDOW_MS;
  recoveryPromise = (async () => {
    emit("saving", "Atualizando dados…", { reason });

    if (Object.keys(pendingStatuses()).length) {
      retryPendingWrite();
      await waitForPendingToClear();
    }

    let domainsOk = false;
    for (const delay of RETRY_DELAYS) {
      if (run !== generation || !onlineAndVisible()) return false;
      if (delay) await sleep(delay);

      if (!domainsOk) {
        const result = await pullDomains();
        domainsOk = result.ok;
      } else {
        // Depois de confirmar concursos e apostas uma vez, as leituras extras
        // são apenas de status para capturar a corrida Safari -> PWA sem
        // retransmitir os outros domínios desnecessariamente.
        try { await engine.pullStatuses(); }
        catch { domainsOk = false; }
      }

      if (domainsOk && !Object.keys(pendingStatuses()).length) {
        if (delay < RETRY_DELAYS.at(-1)) continue;
        markRecovered(reason === "retomada" || reason === "pageshow" ? "Sincronizado ao retornar" : "Sincronizado");
        return true;
      }
    }

    const pending = Object.keys(pendingStatuses()).length;
    const diag = diagnostics();
    emit("error", "Falha na sincronização", {
      error: diag.lastError || {
        code: pending ? "catchup/pending-write" : "catchup/pull",
        message: pending ? `${pending} alteração(ões) ainda aguardando gravação.` : "Não foi possível confirmar os dados remotos."
      }
    });
    return false;
  })().finally(() => {
    recoveryPromise = null;
    recoveryUntil = 0;
  });

  return recoveryPromise;
}

async function waitForEngine(timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const candidate = globalThis.SULotoIOSRestOperationalSync;
    if (candidate?.active) return candidate;
    await sleep(50);
  }
  return null;
}

function installListeners() {
  if (initialized || !engine?.active) return;
  initialized = true;

  // O listener é registrado antes/independentemente do painel. Durante uma
  // retomada, um erro genérico não encerra a UI antes da leitura de recuperação.
  window.addEventListener(STATE_EVENT, event => {
    const detail = event.detail || {};
    if (detail.source === "ios-safari-pwa-catchup") return;
    if (detail.kind !== "error") return;
    if (!["Falha na sincronização", "Falha ao salvar jogo"].includes(String(detail.text || ""))) return;
    if (Date.now() > recoveryUntil && !onlineAndVisible()) return;
    event.stopImmediatePropagation();
    void recover("erro-recuperavel");
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void recover("retomada");
  });
  window.addEventListener("pageshow", () => void recover("pageshow"));
  window.addEventListener("focus", () => void recover("foco"));
  window.addEventListener("online", () => void recover("online"));
}

async function init() {
  if (!active) return false;
  engine = await waitForEngine();
  if (!engine) return false;
  installListeners();
  if (onlineAndVisible()) setTimeout(() => void recover("inicialização"), 0);
  return true;
}

void init();

globalThis.SULotoIOSSafariPWACatchup = Object.freeze({
  active,
  protocol: "sync-v9",
  hotfix: "safari-pwa-catchup-2",
  recover,
  diagnostics: () => ({
    active: Boolean(active && engine?.active),
    initialized,
    recoveryInFlight: Boolean(recoveryPromise),
    pendingStatuses: pendingStatuses(),
    engine: diagnostics(),
    online: navigator.onLine,
    visibility: document.visibilityState,
    statusStored: Boolean(localStorage.getItem(STATUS_KEY))
  })
});
