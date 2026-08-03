import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const CONFIG = {
  apiKey: "AIzaSyB7fo20WlKpoySHDBdtjilOqVYRAI8OvKM",
  authDomain: "su-mega.firebaseapp.com",
  projectId: "su-mega",
  storageBucket: "su-mega.firebasestorage.app",
  messagingSenderId: "747588237835",
  appId: "1:747588237835:web:b5cc26c6971ca37cb3a50e"
};
const APP_INSTANCE = "su-loto-cloud";
const STATUS_KEY = "su-loto-c2-status-v4";
const CONTEST_KEY = "su-loto-c2-contests-v1";
const MIGRATION_KEY = "su-loto-native-firestore-v1";
const VALID = new Set(["pendente", "registrado", "apostado"]);
const LABELS = { pendente: "Pendente", registrado: "Registrada", apostado: "Apostado" };
const APP_NAME = "SU Loto";
const WALLET = "C2";

const firebaseApp = getApps().find(item => item.name === APP_INSTANCE)
  || initializeApp(CONFIG, APP_INSTANCE);
let db;
try {
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch {
  db = getFirestore(firebaseApp);
}
const auth = getAuth(firebaseApp);

let currentUser = null;
let stopStatuses = null;
let stopContests = null;
let statusObserver = null;
let contestTimer = null;
let flushTimer = null;
let refreshTimer = null;
let localCaptureTimer = null;
let flushPromise = null;
let applyingRemoteMirror = false;
let statusSnapshotReady = false;
let deferredLocalStatuses = null;
let cachedCardIds = new Set();
let pendingWrites = new Map();
let inFlightWrites = new Map();
let remoteStatuses = new Map();
let knownContestSignature = "";
let remoteContestIds = new Set();
let applyingRemoteContests = false;
let startedUid = null;
let clientId = localStorage.getItem("su-ecosystem-device-id");
if (!clientId) {
  clientId = crypto.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem("su-ecosystem-device-id", clientId);
}

function parse(raw, fallback) {
  try { return JSON.parse(raw ?? ""); } catch { return fallback; }
}

function currentStatuses() {
  const payload = parse(localStorage.getItem(STATUS_KEY), {});
  const source = payload?.statuses || payload || {};
  const result = {};
  for (const [id, status] of Object.entries(source)) {
    if (VALID.has(status)) result[String(id)] = status;
  }
  return result;
}

function cardIds() {
  return [...document.querySelectorAll(".game-card[data-id]")].map(card => String(card.dataset.id));
}

function cardIdSet() {
  const ids = cardIds();
  if (cachedCardIds.size !== ids.length || ids.some(id => !cachedCardIds.has(id))) cachedCardIds = new Set(ids);
  return cachedCardIds;
}

function completeStatusMap(partial) {
  const result = {};
  for (const id of cardIds()) result[id] = VALID.has(partial[id]) ? partial[id] : "pendente";
  return result;
}

function mapFromStatusObject(statuses) {
  return new Map(Object.entries(completeStatusMap(statuses)));
}

function effectiveStatuses(base = Object.fromEntries(remoteStatuses)) {
  const result = completeStatusMap(base);
  for (const [id, status] of inFlightWrites) result[id] = status;
  for (const [id, status] of pendingWrites) result[id] = status;
  return result;
}

function setState(kind, text) {
  const button = document.getElementById("su-loto-cloud-status");
  const label = document.getElementById("su-loto-cloud-text");
  const panel = document.getElementById("su-loto-cloud-panel-state");
  if (button) button.dataset.state = kind;
  if (label) label.textContent = text;
  if (panel) panel.textContent = text;
}

function renderStatuses(statuses) {
  document.querySelectorAll(".game-card[data-id]").forEach(card => {
    const id = String(card.dataset.id);
    const status = statuses[id] || "pendente";
    card.dataset.status = status;
    const pill = card.querySelector(".status-pill");
    if (pill) pill.textContent = LABELS[status];
    card.querySelectorAll(".status-actions button[data-status]").forEach(button => {
      const active = button.dataset.status === status;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  });

  const count = { pendente: 0, registrado: 0, apostado: 0 };
  cardIds().forEach(id => { count[statuses[id] || "pendente"] += 1; });
  for (const [status, value] of Object.entries(count)) {
    const element = document.getElementById(`count-${status}`);
    if (element) element.textContent = String(value);
  }
  const total = document.getElementById("count-total");
  if (total) total.textContent = String(cardIds().length);
  const filter = document.getElementById("filter-status");
  if (filter) filter.dispatchEvent(new Event("change", { bubbles: true }));
  globalThis.SULotoContests?.refresh?.();
}

function saveStatusMirror(statuses) {
  const payload = {
    app: APP_NAME,
    wallet: WALLET,
    schema: 4,
    source: "firestore",
    savedAt: new Date().toISOString(),
    statuses
  };
  const serialized = JSON.stringify(payload);
  applyingRemoteMirror = true;
  try {
    localStorage.setItem(STATUS_KEY, serialized);
    window.dispatchEvent(new StorageEvent("storage", { key: STATUS_KEY, newValue: serialized }));
  } catch {
    localStorage.setItem(STATUS_KEY, serialized);
  } finally {
    applyingRemoteMirror = false;
  }
  renderStatuses(statuses);
  window.dispatchEvent(new CustomEvent("su:cloud-statuses-applied", { detail: statuses }));
}

function ensureUi() {
  if (document.getElementById("su-loto-cloud-root")) return;
  const style = document.createElement("style");
  style.textContent = `#su-loto-cloud-root{position:fixed;right:14px;bottom:14px;z-index:9998}.su-loto-cloud-button{border:0;border-radius:999px;padding:11px 15px;background:#6f2385;color:#fff;font-weight:800;box-shadow:0 8px 28px #0003}.su-loto-cloud-gate,.su-loto-cloud-panel{position:fixed;inset:0;z-index:10000;background:#2f1039ef;display:grid;place-items:center;padding:24px}.su-loto-cloud-gate[hidden],.su-loto-cloud-panel[hidden]{display:none}.su-loto-cloud-card{width:min(460px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:24px;padding:26px;color:#17202a}.su-loto-cloud-card label{display:grid;gap:7px;margin-top:15px;font-weight:700}.su-loto-cloud-card input{font:inherit;padding:13px;border:1px solid #cbd5e1;border-radius:12px}.su-loto-cloud-card button{font:inherit;font-weight:800;border-radius:12px;border:0;padding:12px 15px}.su-loto-cloud-primary{background:#6f2385;color:#fff;width:100%;margin-top:18px}.su-loto-cloud-error{color:#b91c1c;font-weight:700}.su-loto-cloud-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.su-loto-cloud-grid article{background:#f6eff8;border-radius:14px;padding:12px}.su-loto-cloud-grid span{display:block;color:#647067;font-size:.84rem}.su-loto-cloud-grid strong{display:block;margin-top:4px}.su-loto-cloud-actions{display:grid;gap:9px}.su-loto-cloud-actions button{background:#f3f4f6}.su-loto-cloud-close{float:right;background:#eee!important}`;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "su-loto-cloud-root";
  root.innerHTML = `<button id="su-loto-cloud-status" class="su-loto-cloud-button" data-state="offline"><span id="su-loto-cloud-text">Nuvem desconectada</span></button>`;
  document.body.appendChild(root);

  const gate = document.createElement("div");
  gate.id = "su-loto-cloud-gate";
  gate.className = "su-loto-cloud-gate";
  gate.innerHTML = `<div class="su-loto-cloud-card"><p style="color:#6f2385;font-weight:900;margin:0">ECOSSISTEMA SU</p><h2>Entrar no SU Loto</h2><p>Use exatamente a mesma conta no Safari e no aplicativo instalado.</p><form id="su-loto-login"><label>E-mail<input id="su-loto-email" type="email" autocomplete="username" required></label><label>Senha<input id="su-loto-password" type="password" autocomplete="current-password" required></label><p id="su-loto-error" class="su-loto-cloud-error"></p><button class="su-loto-cloud-primary" type="submit">Entrar</button></form></div>`;
  document.body.appendChild(gate);

  const panel = document.createElement("div");
  panel.id = "su-loto-cloud-panel";
  panel.className = "su-loto-cloud-panel";
  panel.hidden = true;
  panel.innerHTML = `<div class="su-loto-cloud-card"><button id="su-loto-cloud-close" class="su-loto-cloud-close">Fechar</button><p style="color:#6f2385;font-weight:900;margin:0">ECOSSISTEMA SU</p><h2>Conta e sincronização</h2><div class="su-loto-cloud-grid"><article><span>Conta</span><strong id="su-loto-cloud-account">—</strong></article><article><span>Estado</span><strong id="su-loto-cloud-panel-state">—</strong></article><article><span>Modelo</span><strong>Firestore em tempo real</strong></article><article><span>Dispositivo</span><strong id="su-loto-cloud-device">—</strong></article></div><div class="su-loto-cloud-actions"><button id="su-loto-sync-now">Atualizar agora</button><button id="su-loto-signout">Sair da conta</button></div></div>`;
  document.body.appendChild(panel);

  document.getElementById("su-loto-cloud-status").addEventListener("click", () => {
    if (currentUser) panel.hidden = false;
    else gate.hidden = false;
  });
  document.getElementById("su-loto-cloud-close").addEventListener("click", () => { panel.hidden = true; });
  document.getElementById("su-loto-sync-now").addEventListener("click", () => refreshFromServer(true));
  document.getElementById("su-loto-signout").addEventListener("click", () => signOut(auth));
  document.getElementById("su-loto-login").addEventListener("submit", async event => {
    event.preventDefault();
    const error = document.getElementById("su-loto-error");
    error.textContent = "";
    setState("saving", "Entrando…");
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(
        auth,
        document.getElementById("su-loto-email").value.trim(),
        document.getElementById("su-loto-password").value
      );
    } catch (cause) {
      console.error(cause);
      error.textContent = `Não foi possível entrar (${cause.code || "erro"}).`;
      setState("error", "Falha no login");
    }
  });
  window.addEventListener("offline", () => setState("offline", "Offline • alterações em espera"));
  window.addEventListener("online", () => refreshFromServer(false));
}

function updateAccountUi(user) {
  const gate = document.getElementById("su-loto-cloud-gate");
  const account = document.getElementById("su-loto-cloud-account");
  const device = document.getElementById("su-loto-cloud-device");
  if (gate) gate.hidden = Boolean(user);
  if (account) account.textContent = user?.email || "Desconectado";
  if (device) device.textContent = /iPad/i.test(navigator.userAgent) ? "iPad" : /iPhone/i.test(navigator.userAgent) ? "iPhone" : "Safari";
}

function statusesCollection(uid) {
  return collection(db, "users", uid, "suLoto", "C2", "gameStatuses");
}

function contestsCollection(uid) {
  return collection(db, "users", uid, "suLoto", "C2", "contests");
}

function mapSnapshot(snapshot) {
  const partial = {};
  snapshot.forEach(item => {
    const status = item.data()?.status;
    if (VALID.has(status)) partial[String(item.id)] = status;
  });
  return completeStatusMap(partial);
}

async function migrateStatuses(user) {
  const reference = statusesCollection(user.uid);
  let snapshot;
  try { snapshot = await getDocsFromServer(reference); }
  catch { snapshot = await getDocs(reference); }

  const local = completeStatusMap(currentStatuses());
  const remoteIds = new Set();
  snapshot.forEach(item => remoteIds.add(String(item.id)));
  const partialRemote = {};
  snapshot.forEach(item => {
    const status = item.data()?.status;
    if (VALID.has(status)) partialRemote[String(item.id)] = status;
  });
  if (!localStorage.getItem(MIGRATION_KEY)) {
    const missing = Object.entries(local).filter(([id, status]) => status !== "pendente" && !remoteIds.has(id));
    for (let index = 0; index < missing.length; index += 400) {
      const batch = writeBatch(db);
      for (const [id, status] of missing.slice(index, index + 400)) {
        batch.set(doc(reference, id), {
          status,
          wallet: WALLET,
          updatedAt: serverTimestamp(),
          updatedBy: clientId,
          migration: true
        }, { merge: true });
      }
      await batch.commit();
    }
    for (const [id, status] of missing) partialRemote[id] = status;
    localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
  }
  return completeStatusMap(partialRemote);
}

function queueStatus(id, status, allowed = cardIdSet()) {
  const key = String(id);
  if (!VALID.has(status) || !allowed.has(key)) return;
  const remote = remoteStatuses.get(key) || "pendente";
  if (status === remote && !inFlightWrites.has(key)) pendingWrites.delete(key);
  else pendingWrites.set(key, status);
}

function captureLocalStatuses() {
  if (applyingRemoteMirror || !currentUser) return;
  const local = completeStatusMap(currentStatuses());
  if (!statusSnapshotReady) {
    deferredLocalStatuses = local;
    return;
  }
  const allowed = cardIdSet();
  for (const [id, status] of Object.entries(local)) queueStatus(id, status, allowed);
  if (pendingWrites.size) scheduleFlush();
}

function scheduleLocalCapture() {
  clearTimeout(localCaptureTimer);
  localCaptureTimer = setTimeout(captureLocalStatuses, 0);
}

function installLocalWriteCapture() {
  const previousSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    const oldValue = this.getItem(key);
    previousSetItem.call(this, key, value);
    if (this === localStorage && key === STATUS_KEY && !applyingRemoteMirror && oldValue !== String(value)) {
      scheduleLocalCapture();
    }
  };

  document.addEventListener("click", event => {
    if (event.target.closest?.(".game-card[data-id] .status-actions button[data-status]")) scheduleLocalCapture();
  }, true);

  window.addEventListener("storage", event => {
    if (event.key === STATUS_KEY && !applyingRemoteMirror) scheduleLocalCapture();
  });
  window.addEventListener("su:local-statuses-changed", scheduleLocalCapture);
}

function startStatusObserver() {
  statusObserver?.disconnect();
  const host = document.getElementById("games") || document.body;
  statusObserver = new MutationObserver(mutations => {
    if (applyingRemoteMirror) return;
    for (const mutation of mutations) {
      const card = mutation.target.closest?.(".game-card[data-id]") || mutation.target;
      if (!(card instanceof HTMLElement) || !card.matches(".game-card[data-id]")) continue;
      queueStatus(card.dataset.id, card.dataset.status);
    }
    if (pendingWrites.size) scheduleFlush();
  });
  statusObserver.observe(host, { subtree: true, attributes: true, attributeFilter: ["data-status"] });
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushStatusWrites().catch(() => {}); }, 90);
  const count = pendingWrites.size + inFlightWrites.size;
  setState("saving", `Salvando ${count} alteração${count === 1 ? "" : "ões"}…`);
}

async function flushStatusWrites() {
  if (!currentUser || !pendingWrites.size) return flushPromise;
  if (flushPromise) return flushPromise;

  const entries = [...pendingWrites.entries()];
  for (const [id, status] of entries) {
    if (pendingWrites.get(id) === status) pendingWrites.delete(id);
    inFlightWrites.set(id, status);
  }
  const reference = statusesCollection(currentUser.uid);

  flushPromise = (async () => {
    try {
      for (let index = 0; index < entries.length; index += 400) {
        const batch = writeBatch(db);
        for (const [id, status] of entries.slice(index, index + 400)) {
          batch.set(doc(reference, id), {
            status,
            wallet: WALLET,
            updatedAt: serverTimestamp(),
            updatedBy: clientId
          }, { merge: true });
        }
        await batch.commit();
      }
      for (const [id, status] of entries) {
        remoteStatuses.set(id, status);
        if (inFlightWrites.get(id) === status) inFlightWrites.delete(id);
      }
      saveStatusMirror(effectiveStatuses());
      if (pendingWrites.size) scheduleFlush();
      else if (navigator.onLine) setState("synced", "Sincronizado em tempo real");
    } catch (error) {
      console.error("SU Loto Firestore status:", error);
      for (const [id, status] of entries) {
        if (inFlightWrites.get(id) === status) inFlightWrites.delete(id);
        if (!pendingWrites.has(id)) pendingWrites.set(id, status);
      }
      setState(navigator.onLine ? "error" : "offline", navigator.onLine ? "Falha ao salvar • nova tentativa pendente" : "Offline • alterações em espera");
      if (navigator.onLine) setTimeout(scheduleFlush, 1500);
    } finally {
      flushPromise = null;
    }
  })();
  return flushPromise;
}

function listenStatuses(user) {
  stopStatuses?.();
  stopStatuses = onSnapshot(
    statusesCollection(user.uid),
    { includeMetadataChanges: true },
    snapshot => {
      if (snapshot.empty && snapshot.metadata.fromCache && !navigator.onLine) {
        setState("offline", "Offline • usando dados deste dispositivo");
        return;
      }
      const statuses = mapSnapshot(snapshot);
      remoteStatuses = mapFromStatusObject(statuses);
      statusSnapshotReady = true;
      if (deferredLocalStatuses) {
        const deferred = deferredLocalStatuses;
        deferredLocalStatuses = null;
        const allowed = cardIdSet();
        for (const [id, status] of Object.entries(deferred)) queueStatus(id, status, allowed);
      }
      for (const [id, status] of [...inFlightWrites]) {
        if (remoteStatuses.get(id) === status && !snapshot.metadata.hasPendingWrites) inFlightWrites.delete(id);
      }
      saveStatusMirror(effectiveStatuses(statuses));
      if (pendingWrites.size || inFlightWrites.size || snapshot.metadata.hasPendingWrites) setState("saving", "Salvando na nuvem…");
      else if (snapshot.metadata.fromCache) setState("offline", "Dados locais • aguardando servidor");
      else setState("synced", "Sincronizado em tempo real");
    },
    error => {
      console.error("SU Loto listener de status:", error);
      setState("error", `Falha na sincronização (${error.code || "erro"})`);
    }
  );
}

function normalizeContests(input) {
  const source = Array.isArray(input) ? input : [];
  return source
    .map(item => ({
      number: Number(item?.number),
      date: String(item?.date || ""),
      numbers: Array.isArray(item?.numbers) ? item.numbers.map(Number).sort((a, b) => a - b) : [],
      source: String(item?.source || ""),
      notes: String(item?.notes || ""),
      createdAt: String(item?.createdAt || ""),
      updatedAt: String(item?.updatedAt || item?.createdAt || "")
    }))
    .filter(item => Number.isInteger(item.number) && item.number > 0)
    .sort((a, b) => b.number - a.number);
}

function localContests() {
  try {
    if (globalThis.SULotoContests?.exportData) return normalizeContests(globalThis.SULotoContests.exportData());
    return normalizeContests(parse(localStorage.getItem(CONTEST_KEY), []));
  } catch { return []; }
}

function contestSignature(list = localContests()) {
  return JSON.stringify(normalizeContests(list));
}

async function uploadContestCollection(list) {
  if (!currentUser) return;
  const normalized = normalizeContests(list);
  const ids = new Set(normalized.map(item => String(item.number)));
  const operations = [
    ...normalized.map(item => ({ type: "set", id: String(item.number), item })),
    ...[...remoteContestIds].filter(id => !ids.has(id)).map(id => ({ type: "delete", id }))
  ];
  const reference = contestsCollection(currentUser.uid);
  for (let index = 0; index < operations.length; index += 400) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(index, index + 400)) {
      const target = doc(reference, operation.id);
      if (operation.type === "delete") batch.delete(target);
      else batch.set(target, {
        ...operation.item,
        wallet: WALLET,
        updatedAtCloud: serverTimestamp(),
        updatedBy: clientId
      }, { merge: true });
    }
    await batch.commit();
  }
  remoteContestIds = ids;
}

function applyRemoteContests(snapshot) {
  const list = [];
  remoteContestIds = new Set();
  snapshot.forEach(item => {
    remoteContestIds.add(String(item.id));
    list.push(item.data());
  });
  const normalized = normalizeContests(list);
  knownContestSignature = contestSignature(normalized);
  applyingRemoteContests = true;
  try {
    if (globalThis.SULotoContests?.importData) globalThis.SULotoContests.importData(normalized, true);
    else localStorage.setItem(CONTEST_KEY, JSON.stringify(normalized));
  } finally {
    applyingRemoteContests = false;
  }
}

async function startContestSync(user) {
  const reference = contestsCollection(user.uid);
  let initial;
  try { initial = await getDocsFromServer(reference); }
  catch { initial = await getDocs(reference); }
  if (initial.empty) {
    const local = localContests();
    if (local.length) await uploadContestCollection(local);
  } else {
    applyRemoteContests(initial);
  }

  stopContests?.();
  stopContests = onSnapshot(reference, { includeMetadataChanges: true }, snapshot => {
    applyRemoteContests(snapshot);
  }, error => console.error("SU Loto concursos em tempo real:", error));

  clearInterval(contestTimer);
  contestTimer = setInterval(() => {
    if (!currentUser || applyingRemoteContests) return;
    const list = localContests();
    const signature = contestSignature(list);
    if (signature === knownContestSignature) return;
    knownContestSignature = signature;
    uploadContestCollection(list).catch(error => {
      console.error("SU Loto envio de concursos:", error);
      setState("error", "Falha ao salvar concursos");
    });
  }, 700);
}

async function refreshFromServer(manual) {
  if (!currentUser || document.hidden) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (manual) setState("saving", "Atualizando agora…");
    try {
      if (pendingWrites.size) await flushStatusWrites();
      const snapshot = navigator.onLine
        ? await getDocsFromServer(statusesCollection(currentUser.uid))
        : await getDocs(statusesCollection(currentUser.uid));
      if (!snapshot.empty || navigator.onLine) {
        const statuses = mapSnapshot(snapshot);
        remoteStatuses = mapFromStatusObject(statuses);
        saveStatusMirror(effectiveStatuses(statuses));
      }
      if (pendingWrites.size) await flushStatusWrites();
      if (navigator.onLine && !pendingWrites.size && !inFlightWrites.size) setState("synced", "Sincronizado em tempo real");
    } catch (error) {
      console.error("SU Loto atualização manual:", error);
      setState(navigator.onLine ? "error" : "offline", navigator.onLine ? "Falha ao atualizar" : "Offline • alterações em espera");
    }
  }, 120);
}

function installResumeHooks() {
  window.addEventListener("pageshow", () => refreshFromServer(false));
  window.addEventListener("focus", () => refreshFromServer(false));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshFromServer(false);
  });
}

async function start(user) {
  if (startedUid === user.uid) {
    refreshFromServer(false);
    return;
  }
  startedUid = user.uid;
  setState("saving", "Preparando sincronização em tempo real…");
  await setDoc(doc(db, "users", user.uid, "settings", "ecosystem"), {
    products: { suMega: true, suLoto: true },
    updatedAt: serverTimestamp()
  }, { merge: true });
  const initialStatuses = await migrateStatuses(user);
  remoteStatuses = mapFromStatusObject(initialStatuses);
  statusSnapshotReady = true;
  if (deferredLocalStatuses) {
    const deferred = deferredLocalStatuses;
    deferredLocalStatuses = null;
    const allowed = cardIdSet();
    for (const [id, status] of Object.entries(deferred)) queueStatus(id, status, allowed);
  }
  saveStatusMirror(effectiveStatuses(initialStatuses));
  startStatusObserver();
  listenStatuses(user);
  await startContestSync(user);
  if (pendingWrites.size) scheduleFlush();
  refreshFromServer(false);
}

ensureUi();
installLocalWriteCapture();
installResumeHooks();
setState("saving", "Verificando login…");
onAuthStateChanged(auth, user => {
  currentUser = user;
  updateAccountUi(user);
  if (!user) {
    startedUid = null;
    stopStatuses?.();
    stopContests?.();
    clearInterval(contestTimer);
    statusObserver?.disconnect();
    pendingWrites.clear();
    inFlightWrites.clear();
    remoteStatuses.clear();
    statusSnapshotReady = false;
    deferredLocalStatuses = null;
    setState("offline", "Entre para sincronizar");
    return;
  }
  start(user).catch(error => {
    console.error("SU Loto Firestore nativo:", error);
    setState("error", `Falha ao iniciar (${error.code || error.message || "erro"})`);
    const message = document.getElementById("su-loto-error");
    if (message) message.textContent = `Falha ao acessar a nuvem: ${error.code || error.message || "erro desconhecido"}`;
    document.getElementById("su-loto-cloud-gate").hidden = false;
  });
});
