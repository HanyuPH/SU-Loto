import { getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocsFromServer,
  enableNetwork
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const APP_INSTANCE = "su-loto-cloud";
const WALLET = "C2";
const STATUS_KEY = "su-loto-c2-status-v4";
const VALID = new Set(["pendente", "registrado", "apostado"]);
const CHANNEL_NAME = "su-loto-c2-fast-sync-v1";
const REFRESH_THROTTLE_MS = 1500;

const firebaseApp = getApps().find(item => item.name === APP_INSTANCE);
if (!firebaseApp) throw new Error("SU Loto: instância Firebase da nuvem ainda não foi inicializada.");

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const instanceId = crypto.randomUUID?.() || `su-loto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const channel = "BroadcastChannel" in globalThis ? new BroadcastChannel(CHANNEL_NAME) : null;

let currentUser = null;
let refreshPromise = null;
let lastRefreshStartedAt = 0;
let lastRefreshFinishedAt = 0;
let lastRefreshReason = null;
let queuedRefreshTimer = null;

function statusesCollection(uid) {
  return collection(db, "users", uid, "suLoto", WALLET, "gameStatuses");
}

function contestsCollection(uid) {
  return collection(db, "users", uid, "suLoto", WALLET, "contests");
}

function validGameId(id) {
  const value = String(id || "");
  return (globalThis.SU_LOTO_GAMES || []).some(game => String(game.id) === value) ? value : null;
}

function parseStatusPayload() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATUS_KEY) || "null");
    if (parsed && typeof parsed === "object") {
      const statuses = parsed.statuses && typeof parsed.statuses === "object" ? { ...parsed.statuses } : { ...parsed };
      return { payload: parsed, statuses };
    }
  } catch {}
  return { payload: {}, statuses: {} };
}

function applyPeerStatus(id, status) {
  const gameId = validGameId(id);
  if (!gameId || !VALID.has(status)) return false;

  const { payload, statuses } = parseStatusPayload();
  if (statuses[gameId] === status) return false;

  statuses[gameId] = status;
  const next = payload.statuses && typeof payload.statuses === "object"
    ? {
        ...payload,
        source: "peer-realtime",
        savedAt: new Date().toISOString(),
        statuses
      }
    : {
        app: "SU Loto",
        wallet: WALLET,
        schema: 3,
        source: "peer-realtime",
        walletLogicalSha256: globalThis.SU_LOTO_WALLET_MANIFEST?.source?.registeredWalletLogicalSha256 || null,
        savedAt: new Date().toISOString(),
        statuses
      };

  localStorage.setItem(STATUS_KEY, JSON.stringify(next));
  if (globalThis.SULotoApp?.refreshFromStorage) globalThis.SULotoApp.refreshFromStorage();
  else window.dispatchEvent(new StorageEvent("storage", { key: STATUS_KEY, newValue: JSON.stringify(next) }));
  return true;
}

function broadcastLocalStatus(event) {
  if (!channel || event?.domain !== "statuses" || event?.source !== "ui") return;
  const id = validGameId(event.detail?.id);
  const status = String(event.detail?.status || "");
  if (!id || !VALID.has(status)) return;

  channel.postMessage({
    type: "status-intent",
    wallet: WALLET,
    id,
    status,
    source: instanceId,
    at: Date.now()
  });
}

if (channel) {
  channel.onmessage = event => {
    const message = event.data || {};
    if (message.type !== "status-intent" || message.wallet !== WALLET || message.source === instanceId) return;
    try {
      applyPeerStatus(message.id, message.status);
    } catch (error) {
      console.warn("SU Loto sincronização direta entre contextos:", error);
    }
  };
}

globalThis.SULotoSyncEvents?.subscribe?.(broadcastLocalStatus);

async function refreshRemote(reason = "manual", { force = false } = {}) {
  if (!currentUser || !navigator.onLine) return false;

  const now = Date.now();
  if (refreshPromise) return refreshPromise;
  if (!force && now - lastRefreshStartedAt < REFRESH_THROTTLE_MS) return false;

  lastRefreshStartedAt = now;
  lastRefreshReason = reason;

  refreshPromise = (async () => {
    // Safari/PWA pode manter a instância do Firestore viva ao voltar do segundo
    // plano. Reabilitar a rede e forçar uma leitura do servidor faz o listener
    // existente receber rapidamente o estado mais recente sem bloquear a UI.
    try { await enableNetwork(db); } catch {}

    const [statuses, contests] = await Promise.allSettled([
      getDocsFromServer(statusesCollection(currentUser.uid)),
      getDocsFromServer(contestsCollection(currentUser.uid))
    ]);

    lastRefreshFinishedAt = Date.now();
    const ok = statuses.status === "fulfilled" || contests.status === "fulfilled";

    window.dispatchEvent(new CustomEvent("su:loto-cloud-refresh", {
      detail: {
        reason,
        ok,
        statuses: statuses.status,
        contests: contests.status,
        durationMs: lastRefreshFinishedAt - lastRefreshStartedAt,
        at: new Date(lastRefreshFinishedAt).toISOString()
      }
    }));

    if (!ok) {
      console.warn("SU Loto atualização de retomada não conseguiu alcançar o servidor.", {
        reason,
        statuses: statuses.reason,
        contests: contests.reason
      });
    }

    return ok;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function queueRefresh(reason, { force = false } = {}) {
  clearTimeout(queuedRefreshTimer);
  queuedRefreshTimer = setTimeout(() => {
    void refreshRemote(reason, { force });
  }, 80);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") queueRefresh("visibility");
});
window.addEventListener("pageshow", () => queueRefresh("pageshow"));
window.addEventListener("focus", () => queueRefresh("focus"));
window.addEventListener("online", () => queueRefresh("online", { force: true }));

onAuthStateChanged(auth, current => {
  currentUser = current;
  if (!current) return;
  queueRefresh("login", { force: true });
});

globalThis.SULotoRealtimeBoost = Object.freeze({
  refreshNow: () => refreshRemote("manual", { force: true }),
  peerChannelAvailable: Boolean(channel),
  diagnostics: () => ({
    lastRefreshStartedAt,
    lastRefreshFinishedAt,
    lastRefreshReason,
    refreshing: Boolean(refreshPromise),
    online: navigator.onLine,
    visibility: document.visibilityState
  })
});
