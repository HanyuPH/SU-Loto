import { getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const APP_INSTANCE = "su-loto-cloud";
const PROJECT_ID = "su-mega";
const WALLET = "C2";
const STATUS_KEY = "su-loto-c2-status-v4";
const LAST_SERVER_SYNC_KEY = "su-loto-c2-last-server-sync-v1";
const VALID = new Set(["pendente", "registrado", "apostado"]);
const REFRESH_THROTTLE_MS = 1500;
const REQUEST_TIMEOUT_MS = 5000;
const UI_FRESH_MS = 60000;

const firebaseApp = getApps().find(item => item.name === APP_INSTANCE);
if (!firebaseApp) throw new Error("SU Loto: instância Firebase da nuvem ainda não foi inicializada.");
const auth = getAuth(firebaseApp);

const transport = globalThis.SULotoFirestoreTransport || {};
const active = Boolean(transport.ios);
let currentUser = null;
let refreshPromise = null;
let queuedTimer = null;
let lastRefreshStartedAt = 0;
let lastRefreshFinishedAt = 0;
let lastRefreshDurationMs = 0;
let lastRefreshReason = null;
let lastRefreshError = null;
let uiObserver = null;

function parse(raw, fallback) {
  try { return JSON.parse(raw ?? ""); } catch { return fallback; }
}

function currentStatuses() {
  const payload = parse(localStorage.getItem(STATUS_KEY), {});
  const source = payload?.statuses || payload || {};
  const output = {};
  for (const game of globalThis.SU_LOTO_GAMES || []) {
    const id = String(game.id);
    output[id] = VALID.has(source[id]) ? source[id] : "pendente";
  }
  return output;
}

function statusPayload(statuses, savedAt) {
  return {
    app: "SU Loto",
    wallet: WALLET,
    schema: 3,
    source: "firestore-rest-ios",
    walletLogicalSha256: globalThis.SU_LOTO_WALLET_MANIFEST?.source?.registeredWalletLogicalSha256 || null,
    savedAt,
    statuses
  };
}

function sameStatuses(left, right) {
  const ids = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  for (const id of ids) {
    const a = VALID.has(left?.[id]) ? left[id] : "pendente";
    const b = VALID.has(right?.[id]) ? right[id] : "pendente";
    if (a !== b) return false;
  }
  return true;
}

function formatSyncTime(value) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch { return String(value || ""); }
}

function freshSyncAt() {
  return localStorage.getItem(LAST_SERVER_SYNC_KEY) || null;
}

function hasFreshServerSync() {
  const value = new Date(freshSyncAt() || 0).getTime();
  return Number.isFinite(value) && value > 0 && Date.now() - value < UI_FRESH_MS;
}

function reflectHealthyUi() {
  if (!active || !currentUser || !navigator.onLine || !hasFreshServerSync()) return;
  const button = document.getElementById("su-loto-cloud-status");
  const label = document.getElementById("su-loto-cloud-text");
  const last = document.getElementById("su-loto-last");
  const text = String(label?.textContent || "");
  const startupText = /^(Verificando login|Preparando sincronização|Conectando à nuvem|Conexão lenta|Reconectando)/i.test(text);
  if (startupText) {
    if (button) button.dataset.state = "synced";
    if (label) label.textContent = "Sincronizado em segundo plano";
  }
  if (last) last.textContent = formatSyncTime(freshSyncAt());
}

function installUiObserver() {
  if (!active || uiObserver) return;
  const attach = () => {
    const root = document.getElementById("su-loto-cloud-root");
    if (!root) return false;
    uiObserver = new MutationObserver(() => reflectHealthyUi());
    uiObserver.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-state"] });
    reflectHealthyUi();
    return true;
  };
  if (attach()) return;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (attach() || attempts >= 200) clearInterval(timer);
  }, 50);
}

function collectionUrl(uid, pageToken = null) {
  const path = ["users", uid, "suLoto", WALLET, "gameStatuses"].map(encodeURIComponent).join("/");
  const params = new URLSearchParams({ pageSize: "300" });
  if (pageToken) params.set("pageToken", pageToken);
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?${params}`;
}

function documentId(document) {
  const name = String(document?.name || "");
  return decodeURIComponent(name.split("/").pop() || "");
}

function documentStatus(document) {
  const value = document?.fields?.status?.stringValue;
  return VALID.has(value) ? value : null;
}

async function fetchPage(user, token, pageToken = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(collectionUrl(user.uid, pageToken), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Cache-Control": "no-cache"
      }
    });
    let body = null;
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(`Firestore REST HTTP ${response.status}${body?.error?.status ? ` • ${body.error.status}` : ""}`);
      error.code = `http/${response.status}`;
      throw error;
    }
    return body || {};
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAllRemoteStatuses(user) {
  const token = await user.getIdToken(false);
  const allowed = new Set((globalThis.SU_LOTO_GAMES || []).map(game => String(game.id)));
  const remote = Object.fromEntries([...allowed].map(id => [id, "pendente"]));
  const remoteIds = new Set();
  let pageToken = null;
  let pages = 0;
  do {
    pages += 1;
    if (pages > 5) throw new Error("Firestore REST retornou paginação inesperada para 300 jogos.");
    const body = await fetchPage(user, token, pageToken);
    for (const document of Array.isArray(body.documents) ? body.documents : []) {
      const id = documentId(document);
      const status = documentStatus(document);
      if (!allowed.has(id) || !status) continue;
      remote[id] = status;
      remoteIds.add(id);
    }
    pageToken = body.nextPageToken || null;
  } while (pageToken);
  return { remote, remoteIds, pages };
}

function mergeWithLocalProtection(remote, remoteIds) {
  const local = currentStatuses();
  const protectedStatuses = globalThis.SULotoLocalFirstGuard?.pendingStatuses?.() || {};
  const merged = { ...remote };

  // Se o servidor ainda não possui um documento e o aparelho tem um estado
  // operacional não-pendente, preservamos esse estado até o uploader normal
  // da v23 concluir a reconciliação.
  for (const [id, status] of Object.entries(local)) {
    if (!remoteIds.has(id) && status !== "pendente") merged[id] = status;
  }
  // Uma intenção local ainda não confirmada nunca pode ser sobrescrita pela
  // leitura rápida do servidor.
  for (const [id, status] of Object.entries(protectedStatuses)) {
    if (VALID.has(status) && Object.hasOwn(merged, id)) merged[id] = status;
  }
  return merged;
}

function applyStatuses(statuses, savedAt) {
  const current = currentStatuses();
  const payload = statusPayload(statuses, savedAt);
  const serialized = JSON.stringify(payload);
  localStorage.setItem(LAST_SERVER_SYNC_KEY, savedAt);
  if (!sameStatuses(current, statuses)) {
    localStorage.setItem(STATUS_KEY, serialized);
    if (globalThis.SULotoApp?.refreshFromStorage) globalThis.SULotoApp.refreshFromStorage();
    else window.dispatchEvent(new StorageEvent("storage", { key: STATUS_KEY, newValue: serialized }));
  }
  reflectHealthyUi();
}

async function refreshNow(reason = "manual", { force = false } = {}) {
  if (!active || !currentUser || !navigator.onLine) return false;
  const now = Date.now();
  if (refreshPromise) return refreshPromise;
  if (!force && now - lastRefreshStartedAt < REFRESH_THROTTLE_MS) return false;

  lastRefreshStartedAt = now;
  lastRefreshReason = reason;
  lastRefreshError = null;
  refreshPromise = (async () => {
    const started = performance.now();
    try {
      const { remote, remoteIds, pages } = await fetchAllRemoteStatuses(currentUser);
      const merged = mergeWithLocalProtection(remote, remoteIds);
      const savedAt = new Date().toISOString();
      applyStatuses(merged, savedAt);
      lastRefreshFinishedAt = Date.now();
      lastRefreshDurationMs = Math.round(performance.now() - started);
      window.dispatchEvent(new CustomEvent("su:loto-ios-rest-status-refresh", {
        detail: { ok: true, reason, durationMs: lastRefreshDurationMs, documents: remoteIds.size, pages, at: savedAt }
      }));
      return true;
    } catch (error) {
      lastRefreshFinishedAt = Date.now();
      lastRefreshDurationMs = Math.round(performance.now() - started);
      lastRefreshError = { code: String(error?.code || error?.name || "error"), message: String(error?.message || error) };
      console.warn("SU Loto leitura rápida REST no iOS:", error);
      window.dispatchEvent(new CustomEvent("su:loto-ios-rest-status-refresh", {
        detail: { ok: false, reason, durationMs: lastRefreshDurationMs, error: lastRefreshError, at: new Date().toISOString() }
      }));
      return false;
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function queueRefresh(reason, { force = false } = {}) {
  if (!active) return;
  clearTimeout(queuedTimer);
  queuedTimer = setTimeout(() => { void refreshNow(reason, { force }); }, 60);
}

if (active) {
  installUiObserver();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") queueRefresh("visibility", { force: true });
  });
  window.addEventListener("pageshow", () => queueRefresh("pageshow", { force: true }));
  window.addEventListener("focus", () => queueRefresh("focus"));
  window.addEventListener("online", () => queueRefresh("online", { force: true }));
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (!active || !user) return;
  queueRefresh("login", { force: true });
});

globalThis.SULotoIOSRestStatus = Object.freeze({
  active,
  refreshNow: (reason = "manual") => refreshNow(reason, { force: true }),
  diagnostics: () => ({
    active,
    refreshing: Boolean(refreshPromise),
    lastRefreshStartedAt,
    lastRefreshFinishedAt,
    lastRefreshDurationMs,
    lastRefreshReason,
    lastRefreshError,
    lastServerSyncAt: freshSyncAt(),
    online: navigator.onLine
  })
});
