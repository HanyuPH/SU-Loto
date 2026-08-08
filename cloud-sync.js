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
const DEVICE_KEY = "su-ecosystem-device-id";
const DEVICE_NAME_KEY = "su-loto-device-name";
const VALID = new Set(["pendente", "registrado", "apostado"]);
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

let user = null;
let stopStatus = null;
let stopContests = null;
let applying = false;
let startedUid = null;
let lastSync = null;
let statusUploadTimer = null;
let contestUploadTimer = null;
let fullStatusSync = false;
const pendingStatusIds = new Set();
let remoteContestIds = new Set();

// A inicialização é agora realmente local-first: os listeners são ligados antes
// de qualquer escrita administrativa ou leitura extra do servidor.
let statusServerReady = false;
let contestsServerReady = false;
let statusInitialized = false;
let contestsInitialized = false;
let statusPendingWrites = false;
let contestsPendingWrites = false;
let startupSlow = false;
let startupSlowTimer = null;
const startupStatusIntents = new Map();

function parse(raw, fallback) {
  try { return JSON.parse(raw ?? ""); } catch { return fallback; }
}

function localStatuses() {
  const payload = parse(localStorage.getItem(STATUS_KEY), {});
  const source = payload?.statuses || payload || {};
  const output = {};
  for (const game of globalThis.SU_LOTO_GAMES || []) {
    const id = String(game.id);
    output[id] = VALID.has(source[id]) ? source[id] : "pendente";
  }
  return output;
}

function normalizeContests(input) {
  const source = Array.isArray(input) ? input : [];
  const seen = new Set();
  const output = [];
  for (const item of source) {
    const number = Number(item?.number);
    if (!Number.isInteger(number) || number < 1 || seen.has(number)) continue;
    const numbers = Array.isArray(item?.numbers)
      ? [...new Set(item.numbers.map(Number).filter(value => Number.isInteger(value) && value >= 1 && value <= 25))].sort((a, b) => a - b)
      : [];
    if (numbers.length !== 15) continue;
    seen.add(number);
    output.push({
      number,
      date: String(item?.date || ""),
      numbers,
      source: String(item?.source || ""),
      notes: String(item?.notes || ""),
      createdAt: String(item?.createdAt || ""),
      updatedAt: String(item?.updatedAt || item?.createdAt || "")
    });
  }
  return output.sort((a, b) => b.number - a.number);
}

function localContests() {
  try {
    if (globalThis.SULotoContests?.exportData) return normalizeContests(globalThis.SULotoContests.exportData());
  } catch {}
  return normalizeContests(parse(localStorage.getItem(CONTEST_KEY), []));
}

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function deviceName() {
  return localStorage.getItem(DEVICE_NAME_KEY)
    || (/iPad/i.test(navigator.userAgent) ? "iPad" : /iPhone/i.test(navigator.userAgent) ? "iPhone" : "Navegador");
}

function fmt(value) {
  if (!value) return "Nunca";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch { return String(value); }
}

function state(kind, text) {
  const button = document.getElementById("su-loto-cloud-status");
  const label = document.getElementById("su-loto-cloud-text");
  if (button) button.dataset.state = kind;
  if (label) label.textContent = text;
  if (kind === "synced") lastSync = new Date().toISOString();
  refreshPanel();
}

function realtimeState() {
  if (!user) return;
  if (!navigator.onLine) {
    state("offline", "Offline • alterações em espera");
    return;
  }
  if (!statusServerReady || !contestsServerReady) {
    state("saving", startupSlow ? "Conexão lenta • sincronizando…" : "Conectando à nuvem…");
    return;
  }
  startupSlow = false;
  clearTimeout(startupSlowTimer);
  if (statusPendingWrites || contestsPendingWrites || startupStatusIntents.size) {
    state("saving", "Salvando na nuvem…");
    return;
  }
  state("synced", "Sincronizado em tempo real");
}

function injectUi() {
  if (document.getElementById("su-loto-cloud-root")) return;
  const style = document.createElement("style");
  style.textContent = `#su-loto-cloud-root{position:fixed;right:14px;bottom:14px;z-index:9998}.su-loto-cloud-btn{border:0;border-radius:999px;padding:11px 15px;background:#6f2385;color:#fff;font-weight:800;box-shadow:0 8px 28px #0003}.su-loto-cloud-gate,.su-loto-cloud-panel{position:fixed;inset:0;z-index:10000;background:#2f1039ef;display:grid;place-items:center;padding:24px}.su-loto-cloud-gate[hidden],.su-loto-cloud-panel[hidden]{display:none}.su-loto-card{width:min(460px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:24px;padding:26px;color:#17202a}.su-loto-card label{display:grid;gap:7px;margin-top:15px;font-weight:700}.su-loto-card input{font:inherit;padding:13px;border:1px solid #cbd5e1;border-radius:12px}.su-loto-card button{font:inherit;font-weight:800;border-radius:12px;border:0;padding:12px 15px}.su-loto-primary{background:#6f2385;color:#fff;width:100%;margin-top:18px}.su-loto-error{color:#b91c1c;font-weight:700}.su-loto-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.su-loto-grid article{background:#f6eff8;border-radius:14px;padding:12px}.su-loto-grid span{display:block;color:#6b7280;font-size:.85rem}.su-loto-grid strong{display:block;margin-top:4px}.su-loto-actions{display:grid;gap:9px}.su-loto-actions button{background:#f3f4f6}.su-loto-close{float:right;background:#eee!important}`;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "su-loto-cloud-root";
  root.innerHTML = `<button id="su-loto-cloud-status" class="su-loto-cloud-btn" data-state="offline"><span id="su-loto-cloud-text">Nuvem desconectada</span></button>`;
  document.body.appendChild(root);

  const gate = document.createElement("div");
  gate.id = "su-loto-cloud-gate";
  gate.className = "su-loto-cloud-gate";
  gate.innerHTML = `<div class="su-loto-card"><p style="color:#6f2385;font-weight:900;margin:0">ECOSSISTEMA SU</p><h2>Entrar no SU Loto</h2><p>Use a mesma conta já utilizada no SU Mega.</p><form id="su-loto-login"><label>E-mail<input id="su-loto-email" type="email" autocomplete="username" required></label><label>Senha<input id="su-loto-password" type="password" autocomplete="current-password" required></label><p id="su-loto-error" class="su-loto-error"></p><button class="su-loto-primary" type="submit">Entrar</button></form></div>`;
  document.body.appendChild(gate);

  const panel = document.createElement("div");
  panel.id = "su-loto-cloud-panel";
  panel.className = "su-loto-cloud-panel";
  panel.hidden = true;
  panel.innerHTML = `<div class="su-loto-card"><button id="su-loto-close" class="su-loto-close">Fechar</button><p style="color:#6f2385;font-weight:900;margin:0">ECOSSISTEMA SU</p><h2>Conta e sincronização</h2><div class="su-loto-grid"><article><span>Conta</span><strong id="su-loto-account">—</strong></article><article><span>Estado</span><strong id="su-loto-state">—</strong></article><article><span>Última sincronização</span><strong id="su-loto-last">—</strong></article><article><span>Dispositivo</span><strong id="su-loto-device">—</strong></article></div><label>Nome do dispositivo<input id="su-loto-device-name"></label><div class="su-loto-actions"><button id="su-loto-sync-now">Sincronizar agora</button><button id="su-loto-save-device">Salvar nome do dispositivo</button><button id="su-loto-signout">Sair da conta</button></div></div>`;
  document.body.appendChild(panel);

  document.getElementById("su-loto-cloud-status").onclick = () => {
    if (user) { panel.hidden = false; refreshPanel(); }
    else gate.hidden = false;
  };
  document.getElementById("su-loto-close").onclick = () => { panel.hidden = true; };
  document.getElementById("su-loto-login").onsubmit = async event => {
    event.preventDefault();
    const error = document.getElementById("su-loto-error");
    error.textContent = "";
    state("saving", "Entrando…");
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(
        auth,
        document.getElementById("su-loto-email").value.trim(),
        document.getElementById("su-loto-password").value
      );
    } catch (cause) {
      error.textContent = `Não foi possível entrar (${cause.code || "erro"}).`;
      state("error", "Falha no login");
    }
  };
  document.getElementById("su-loto-signout").onclick = () => signOut(auth);
  document.getElementById("su-loto-sync-now").onclick = async () => {
    state("saving", "Sincronizando…");
    try {
      await uploadStatuses(localStatuses());
      await uploadContests(localContests());
      realtimeState();
    } catch (error) {
      console.error("SU Loto sincronização manual:", error);
      state("error", "Falha na sincronização");
    }
  };
  document.getElementById("su-loto-save-device").onclick = () => {
    const value = document.getElementById("su-loto-device-name").value.trim();
    if (value) localStorage.setItem(DEVICE_NAME_KEY, value);
    refreshPanel();
  };

  window.addEventListener("offline", () => realtimeState());
  window.addEventListener("online", () => {
    if (!user) return;
    state("saving", "Reconectando…");
    const localFirstPending = new Set(Object.keys(globalThis.SULotoLocalFirstGuard?.pendingStatuses?.() || {}));
    if (localFirstPending.size) scheduleStatusUpload(localFirstPending);
    scheduleContestUpload();
    realtimeState();
  });

  const footer = document.querySelector("footer p");
  if (footer) footer.textContent = "SU Loto – C2 • Sincronização privada local-first do Ecossistema SU • Backup manual preservado.";
}

function refreshPanel() {
  const account = document.getElementById("su-loto-account");
  const syncState = document.getElementById("su-loto-state");
  const last = document.getElementById("su-loto-last");
  const device = document.getElementById("su-loto-device");
  const input = document.getElementById("su-loto-device-name");
  if (account) account.textContent = user?.email || "Desconectado";
  if (syncState) syncState.textContent = document.getElementById("su-loto-cloud-text")?.textContent || "—";
  if (last) last.textContent = fmt(lastSync);
  if (device) device.textContent = deviceName();
  if (input && !input.value) input.value = deviceName();
}

function statusesCollection(uid) {
  return collection(db, "users", uid, "suLoto", WALLET, "gameStatuses");
}

function contestsCollection(uid) {
  return collection(db, "users", uid, "suLoto", WALLET, "contests");
}

async function uploadStatuses(statuses, ids = null) {
  if (!user) return;
  const allowed = new Set((globalThis.SU_LOTO_GAMES || []).map(game => String(game.id)));
  const selected = ids ? [...ids].filter(id => allowed.has(String(id))) : [...allowed];
  const entries = selected.map(id => [String(id), VALID.has(statuses[String(id)]) ? statuses[String(id)] : "pendente"]);
  const reference = statusesCollection(user.uid);
  for (let index = 0; index < entries.length; index += 400) {
    const batch = writeBatch(db);
    for (const [id, status] of entries.slice(index, index + 400)) {
      batch.set(doc(reference, id), {
        status,
        wallet: WALLET,
        updatedAt: serverTimestamp(),
        updatedBy: deviceId(),
        deviceName: deviceName()
      }, { merge: true });
    }
    await batch.commit();
  }
}

async function uploadContests(contests) {
  if (!user) return;
  const normalized = normalizeContests(contests);
  const nextIds = new Set(normalized.map(item => String(item.number)));
  const reference = contestsCollection(user.uid);
  const operations = [
    ...normalized.map(item => ({ type: "set", id: String(item.number), item })),
    ...[...remoteContestIds].filter(id => !nextIds.has(id)).map(id => ({ type: "delete", id }))
  ];

  for (let index = 0; index < operations.length; index += 400) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(index, index + 400)) {
      const target = doc(reference, operation.id);
      if (operation.type === "delete") batch.delete(target);
      else {
        batch.set(target, {
          ...operation.item,
          wallet: WALLET,
          updatedAtCloud: serverTimestamp(),
          updatedBy: deviceId(),
          deviceName: deviceName()
        }, { merge: true });
      }
    }
    await batch.commit();
  }
  remoteContestIds = nextIds;
}

function statusPayload(statuses) {
  return {
    app: "SU Loto",
    wallet: WALLET,
    schema: 3,
    source: "firestore",
    walletLogicalSha256: globalThis.SU_LOTO_WALLET_MANIFEST?.source?.registeredWalletLogicalSha256 || null,
    savedAt: new Date().toISOString(),
    statuses
  };
}

function applyStatuses(statuses) {
  const payload = statusPayload(statuses);
  const serialized = JSON.stringify(payload);
  applying = true;
  try {
    localStorage.setItem(STATUS_KEY, serialized);
    window.dispatchEvent(new StorageEvent("storage", { key: STATUS_KEY, newValue: serialized }));
  } finally {
    applying = false;
  }
}

function snapshotStatuses(snapshot) {
  const output = Object.fromEntries((globalThis.SU_LOTO_GAMES || []).map(game => [String(game.id), "pendente"]));
  snapshot.forEach(item => {
    const status = item.data()?.status;
    if (VALID.has(status) && Object.hasOwn(output, String(item.id))) output[String(item.id)] = status;
  });
  return output;
}

function snapshotStatusIds(snapshot) {
  const ids = new Set();
  snapshot.forEach(item => ids.add(String(item.id)));
  return ids;
}

function overlayStartupStatusIntents(statuses, remoteIds, snapshot) {
  for (const [id, desired] of startupStatusIntents) {
    if (remoteIds.has(id) && statuses[id] === desired && !snapshot.metadata.hasPendingWrites) {
      startupStatusIntents.delete(id);
      continue;
    }
    statuses[id] = desired;
  }
  return statuses;
}

function snapshotContests(snapshot) {
  const list = [];
  remoteContestIds = new Set();
  snapshot.forEach(item => {
    remoteContestIds.add(String(item.id));
    const data = item.data() || {};
    list.push({
      number: Number(data.number ?? item.id),
      date: String(data.date || ""),
      numbers: Array.isArray(data.numbers) ? data.numbers.map(Number).sort((a, b) => a - b) : [],
      source: String(data.source || ""),
      notes: String(data.notes || ""),
      createdAt: String(data.createdAt || ""),
      updatedAt: String(data.updatedAt || data.createdAt || "")
    });
  });
  return normalizeContests(list);
}

function contestTimestamp(item) {
  const value = new Date(item?.updatedAt || item?.createdAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function mergeContests(local, remote) {
  const map = new Map();
  for (const item of normalizeContests(remote)) map.set(item.number, item);
  for (const item of normalizeContests(local)) {
    const current = map.get(item.number);
    if (!current || contestTimestamp(item) >= contestTimestamp(current)) map.set(item.number, item);
  }
  return normalizeContests([...map.values()]);
}

function applyContests(contests) {
  const normalized = normalizeContests(contests);
  applying = true;
  try {
    if (globalThis.SULotoContests?.importData) {
      if (!normalized.length) {
        localStorage.setItem(CONTEST_KEY, "[]");
        window.dispatchEvent(new StorageEvent("storage", { key: CONTEST_KEY, newValue: "[]" }));
      } else {
        globalThis.SULotoContests.importData(normalized, true);
      }
    } else {
      const serialized = JSON.stringify(normalized);
      localStorage.setItem(CONTEST_KEY, serialized);
      window.dispatchEvent(new StorageEvent("storage", { key: CONTEST_KEY, newValue: serialized }));
    }
  } finally {
    applying = false;
  }
}

function reconcileFirstStatusSnapshot(snapshot) {
  const local = localStatuses();
  const remoteIds = snapshotStatusIds(snapshot);
  const remote = snapshotStatuses(snapshot);
  const missingNonPending = Object.entries(local)
    .filter(([id, status]) => status !== "pendente" && !remoteIds.has(id));

  for (const [id, status] of missingNonPending) {
    startupStatusIntents.set(id, status);
    remote[id] = status;
  }
  applyStatuses(overlayStartupStatusIntents(remote, remoteIds, snapshot));

  if (missingNonPending.length) {
    const ids = new Set(missingNonPending.map(([id]) => id));
    statusPendingWrites = true;
    realtimeState();
    void uploadStatuses(local, ids).catch(error => {
      console.error("SU Loto reconciliação inicial de status:", error);
      state(navigator.onLine ? "error" : "offline", navigator.onLine ? "Falha ao salvar" : "Offline • alterações em espera");
    });
  }
}

function reconcileFirstContestSnapshot(snapshot) {
  const remote = snapshotContests(snapshot);
  const local = localContests();
  const merged = mergeContests(local, remote);
  applyContests(merged);
  if (JSON.stringify(merged) !== JSON.stringify(remote)) {
    contestsPendingWrites = true;
    realtimeState();
    void uploadContests(merged).catch(error => {
      console.error("SU Loto reconciliação inicial de concursos:", error);
      state(navigator.onLine ? "error" : "offline", navigator.onLine ? "Falha nos concursos" : "Offline • alterações em espera");
    });
  }
}

function listenStatuses() {
  stopStatus?.();
  stopStatus = onSnapshot(statusesCollection(user.uid), { includeMetadataChanges: true }, snapshot => {
    statusPendingWrites = snapshot.metadata.hasPendingWrites;

    // O primeiro snapshot em cache não deve substituir o estado operacional já
    // visível. Esperamos o primeiro snapshot de servidor, mas o listener já está
    // ativo e a requisição de tempo real já foi iniciada.
    if (!statusServerReady && snapshot.metadata.fromCache) {
      realtimeState();
      return;
    }

    if (!snapshot.metadata.fromCache) statusServerReady = true;
    if (!statusInitialized && statusServerReady) {
      statusInitialized = true;
      reconcileFirstStatusSnapshot(snapshot);
    } else if (statusInitialized) {
      const remoteIds = snapshotStatusIds(snapshot);
      const remote = overlayStartupStatusIntents(snapshotStatuses(snapshot), remoteIds, snapshot);
      applyStatuses(remote);
    }
    realtimeState();
  }, error => {
    console.error("SU Loto listener de status:", error);
    state("error", `Falha na sincronização (${error.code || "erro"})`);
  });
}

function listenContests() {
  stopContests?.();
  stopContests = onSnapshot(contestsCollection(user.uid), { includeMetadataChanges: true }, snapshot => {
    contestsPendingWrites = snapshot.metadata.hasPendingWrites;

    if (!contestsServerReady && snapshot.metadata.fromCache) {
      realtimeState();
      return;
    }

    if (!snapshot.metadata.fromCache) contestsServerReady = true;
    if (!contestsInitialized && contestsServerReady) {
      contestsInitialized = true;
      reconcileFirstContestSnapshot(snapshot);
    } else if (contestsInitialized) {
      applyContests(snapshotContests(snapshot));
    }
    realtimeState();
  }, error => {
    console.error("SU Loto listener de concursos:", error);
    state("error", `Falha nos concursos (${error.code || "erro"})`);
  });
}

function scheduleStatusUpload(ids = null) {
  if (ids?.size) for (const id of ids) pendingStatusIds.add(String(id));
  else fullStatusSync = true;
  clearTimeout(statusUploadTimer);
  statusUploadTimer = setTimeout(async () => {
    if (!user || applying) return;
    const requested = fullStatusSync ? null : new Set(pendingStatusIds);
    fullStatusSync = false;
    pendingStatusIds.clear();
    state(navigator.onLine ? "saving" : "offline", navigator.onLine ? "Salvando alterações…" : "Offline • alterações em espera");
    try {
      await uploadStatuses(localStatuses(), requested);
      realtimeState();
    } catch (error) {
      console.error("SU Loto status na nuvem:", error);
      state(navigator.onLine ? "error" : "offline", navigator.onLine ? "Falha ao salvar" : "Offline • alterações em espera");
    }
  }, 120);
}

function scheduleContestUpload() {
  clearTimeout(contestUploadTimer);
  contestUploadTimer = setTimeout(async () => {
    if (!user || applying) return;
    state(navigator.onLine ? "saving" : "offline", navigator.onLine ? "Salvando concursos…" : "Offline • alterações em espera");
    try {
      await uploadContests(localContests());
      realtimeState();
    } catch (error) {
      console.error("SU Loto concursos na nuvem:", error);
      state(navigator.onLine ? "error" : "offline", navigator.onLine ? "Falha nos concursos" : "Offline • alterações em espera");
    }
  }, 180);
}

function installStateEvents() {
  globalThis.SULotoSyncEvents?.subscribe?.(event => {
    if (!user || applying || event.source === "cloud") return;
    if (event.domain === "statuses") {
      const id = event.detail?.id;
      scheduleStatusUpload(id ? new Set([String(id)]) : null);
    }
    if (event.domain === "contests") scheduleContestUpload();
  });
}

function resetRealtimeBootstrap() {
  statusServerReady = false;
  contestsServerReady = false;
  statusInitialized = false;
  contestsInitialized = false;
  statusPendingWrites = false;
  contestsPendingWrites = false;
  startupSlow = false;
  startupStatusIntents.clear();
  clearTimeout(startupSlowTimer);
}

function start(current) {
  if (startedUid === current.uid) return;
  startedUid = current.uid;
  resetRealtimeBootstrap();
  state("saving", "Conectando à nuvem…");

  // Ordem crítica: o tempo real é ativado imediatamente. Nenhuma escrita de
  // configuração ou leitura completa bloqueia mais a chegada do estado remoto.
  listenStatuses();
  listenContests();

  startupSlowTimer = setTimeout(() => {
    if (!statusServerReady || !contestsServerReady) {
      startupSlow = true;
      realtimeState();
    }
  }, 8000);

  // Metadado administrativo não participa do caminho crítico da sincronização.
  void setDoc(doc(db, "users", current.uid, "settings", "ecosystem"), {
    products: { suMega: true, suLoto: true },
    updatedAt: serverTimestamp()
  }, { merge: true }).catch(error => {
    console.warn("SU Loto configuração do ecossistema não bloqueante:", error);
  });
}

injectUi();
installStateEvents();
state("saving", "Verificando login…");

onAuthStateChanged(auth, current => {
  user = current;
  const gate = document.getElementById("su-loto-cloud-gate");
  if (gate) gate.hidden = Boolean(current);
  refreshPanel();
  if (!current) {
    startedUid = null;
    stopStatus?.();
    stopContests?.();
    stopStatus = null;
    stopContests = null;
    resetRealtimeBootstrap();
    state("offline", "Entre para sincronizar");
    return;
  }
  try {
    start(current);
  } catch (error) {
    console.error("SU Loto sincronização:", error);
    state("error", `Erro: ${error.code || error.message || "nuvem"}`);
    if (gate) gate.hidden = false;
  }
});
