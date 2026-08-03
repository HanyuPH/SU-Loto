import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const APP_NAME = "SU Loto";
const LOCAL_KEY = "su-loto-c2-contest-bets-v1";
const TOMBSTONE_KEY = "su-loto-c2-contest-bets-tombstones-v1";
const FIREBASE_APP_NAME = "su-loto-cloud";
const DOCUMENT_ID = "suLotoContestBetsC2";
const BOX_ID = "su-loto-contest-bets";
const STATUS_ID = "su-loto-bet-cloud-status";
const ACCENT = "#6f2385";
const firebaseApp = getApps().find(item => item.name === FIREBASE_APP_NAME) || getApp();
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

let currentUser = null;
let stopSnapshot = null;
let applyingCloud = false;
let dirty = false;
let writePromise = null;
let uploadTimer = null;
let statusHideTimer = null;
let refreshTimer = null;

function parse(raw, fallback) {
  try { return JSON.parse(raw ?? ""); } catch { return fallback; }
}

function now() {
  return new Date().toISOString();
}

function normalizeRecords(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const output = {};
  for (const [key, row] of Object.entries(source)) {
    const contest = Number(row?.contest ?? key);
    if (!Number.isInteger(contest) || contest < 1) continue;
    const savedAt = String(row?.savedAt || new Date(0).toISOString());
    output[String(contest)] = {
      contest,
      type: row?.type === "especial" ? "especial" : "normal",
      specialName: String(row?.specialName || "").trim(),
      status: row?.status === "concluido" ? "concluido" : "ativo",
      gameIds: Array.isArray(row?.gameIds) ? row.gameIds.map(String) : [],
      unitPrice: Math.max(0, Number(row?.unitPrice) || 0),
      totalInvested: Math.max(0, Number(row?.totalInvested) || 0),
      createdAt: String(row?.createdAt || savedAt),
      savedAt,
      updatedAt: String(row?.updatedAt || row?.concludedAt || savedAt),
      concludedAt: String(row?.concludedAt || ""),
      releaseStatus: row?.releaseStatus === "registrado" ? "registrado" : "pendente"
    };
  }
  return output;
}

function normalizeTombstones(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const output = {};
  for (const [key, date] of Object.entries(source)) {
    const contest = Number(key);
    const timestamp = new Date(date).getTime();
    if (Number.isInteger(contest) && contest > 0 && Number.isFinite(timestamp)) output[String(contest)] = String(date);
  }
  return output;
}

function rowTimestamp(row) {
  const value = new Date(row?.updatedAt || row?.concludedAt || row?.savedAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function tombstoneTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function localBundle() {
  return {
    records: normalizeRecords(parse(localStorage.getItem(LOCAL_KEY), {})),
    tombstones: normalizeTombstones(parse(localStorage.getItem(TOMBSTONE_KEY), {}))
  };
}

function normalizeBundle(value) {
  return {
    records: normalizeRecords(value?.records),
    tombstones: normalizeTombstones(value?.tombstones)
  };
}

function mergeBundles(local, remote) {
  const records = {};
  const tombstones = {};
  const keys = new Set([
    ...Object.keys(local.records),
    ...Object.keys(remote.records),
    ...Object.keys(local.tombstones),
    ...Object.keys(remote.tombstones)
  ]);

  for (const key of keys) {
    const localRow = local.records[key];
    const remoteRow = remote.records[key];
    const row = !localRow ? remoteRow : !remoteRow ? localRow
      : (rowTimestamp(localRow) >= rowTimestamp(remoteRow) ? localRow : remoteRow);

    const localDeleted = local.tombstones[key];
    const remoteDeleted = remote.tombstones[key];
    const deletedAt = tombstoneTimestamp(localDeleted) >= tombstoneTimestamp(remoteDeleted)
      ? localDeleted : remoteDeleted;

    if (deletedAt && tombstoneTimestamp(deletedAt) > rowTimestamp(row)) {
      tombstones[key] = deletedAt;
      continue;
    }

    if (row) records[key] = row;
  }

  return { records: normalizeRecords(records), tombstones: normalizeTombstones(tombstones) };
}

function stableBundle(value) {
  const bundle = normalizeBundle(value);
  const orderedRecords = Object.fromEntries(
    Object.keys(bundle.records).sort((a, b) => Number(a) - Number(b)).map(key => [key, bundle.records[key]])
  );
  const orderedTombstones = Object.fromEntries(
    Object.keys(bundle.tombstones).sort((a, b) => Number(a) - Number(b)).map(key => [key, bundle.tombstones[key]])
  );
  return JSON.stringify({ records: orderedRecords, tombstones: orderedTombstones });
}

function cloudRef(uid) {
  return doc(db, "users", uid, "settings", DOCUMENT_ID);
}

function ensureStatusElement() {
  const box = document.getElementById(BOX_ID);
  if (!box) return null;
  let element = document.getElementById(STATUS_ID);
  if (!element) {
    element = document.createElement("p");
    element.id = STATUS_ID;
    element.hidden = true;
    element.style.cssText = "margin:10px 0 0;font-size:.82rem;font-weight:800;color:#647067";
    box.appendChild(element);
  }
  return element;
}

function setStatus(text, state = "idle") {
  const element = ensureStatusElement();
  if (!element) return;
  clearTimeout(statusHideTimer);
  element.hidden = false;
  element.textContent = text;
  element.dataset.state = state;
  element.style.color = state === "error" ? "#b42332" : state === "synced" ? ACCENT : "#647067";

  if (state === "synced" || state === "local") {
    statusHideTimer = setTimeout(() => {
      element.hidden = true;
      element.textContent = "";
    }, 2200);
  }
}

function dispatchStorage(value) {
  try {
    window.dispatchEvent(new StorageEvent("storage", { key: LOCAL_KEY, newValue: value }));
  } catch {
    window.dispatchEvent(new CustomEvent("su:storage-mirror-updated", { detail: { key: LOCAL_KEY, value } }));
  }
}

function applyBundle(bundle) {
  const normalized = normalizeBundle(bundle);
  const local = localBundle();
  if (stableBundle(normalized) === stableBundle(local)) return;

  applyingCloud = true;
  try {
    const recordsValue = JSON.stringify(normalized.records);
    localStorage.setItem(LOCAL_KEY, recordsValue);
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(normalized.tombstones));
    dispatchStorage(recordsValue);
  } finally {
    applyingCloud = false;
  }
  window.dispatchEvent(new CustomEvent("su:contest-bets-cloud-updated", { detail: normalized.records }));
}

function captureDeletions(oldValue, newValue) {
  const before = normalizeRecords(parse(oldValue, {}));
  const after = normalizeRecords(parse(newValue, {}));
  const tombstones = normalizeTombstones(parse(localStorage.getItem(TOMBSTONE_KEY), {}));
  let changed = false;

  for (const key of Object.keys(before)) {
    if (after[key]) continue;
    tombstones[key] = now();
    changed = true;
  }
  for (const [key, row] of Object.entries(after)) {
    if (tombstoneTimestamp(tombstones[key]) && rowTimestamp(row) >= tombstoneTimestamp(tombstones[key])) {
      delete tombstones[key];
      changed = true;
    }
  }

  if (changed) localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(tombstones));
}

function markDirty() {
  if (applyingCloud) return;
  dirty = true;
  scheduleUpload();
}

async function uploadLocal() {
  if (!currentUser) {
    setStatus("Salvo neste dispositivo • entre na conta para sincronizar", "local");
    return;
  }
  if (writePromise) return writePromise;

  const bundle = localBundle();
  const fingerprint = stableBundle(bundle);
  dirty = false;
  setStatus("Sincronizando apostas por concurso…", "saving");

  writePromise = (async () => {
    try {
      await setDoc(cloudRef(currentUser.uid), {
        app: APP_NAME,
        wallet: "C2",
        records: bundle.records,
        tombstones: bundle.tombstones,
        schema: 2,
        updatedAt: serverTimestamp(),
        updatedAtClient: now()
      }, { merge: false });

      if (stableBundle(localBundle()) !== fingerprint) dirty = true;
      setStatus(dirty ? "Novas alterações aguardando envio…" : "Apostas sincronizadas", dirty ? "saving" : "synced");
    } catch (error) {
      dirty = true;
      console.error(`${APP_NAME} apostas por concurso na nuvem:`, error);
      setStatus(navigator.onLine ? "Falha ao sincronizar apostas por concurso" : "Offline • apostas aguardando envio", navigator.onLine ? "error" : "local");
    } finally {
      writePromise = null;
      if (dirty) setTimeout(scheduleUpload, navigator.onLine ? 500 : 1500);
    }
  })();

  return writePromise;
}

function scheduleUpload() {
  clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => { uploadLocal().catch(() => {}); }, 120);
}

function handleRemote(data) {
  const remote = normalizeBundle(data || {});
  const merged = mergeBundles(localBundle(), remote);
  applyBundle(merged);
  if (stableBundle(merged) !== stableBundle(remote)) {
    dirty = true;
    scheduleUpload();
  } else if (!dirty && !writePromise) {
    setStatus("Apostas sincronizadas", "synced");
  }
}

async function refreshFromServer() {
  if (!currentUser || document.hidden) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try {
      const snapshot = await getDoc(cloudRef(currentUser.uid));
      handleRemote(snapshot.exists() ? snapshot.data() : {});
      if (dirty) await uploadLocal();
    } catch (error) {
      console.error(`${APP_NAME} atualização de apostas por concurso:`, error);
      if (!navigator.onLine) setStatus("Offline • apostas aguardando envio", "local");
    }
  }, 80);
}

async function start(user) {
  currentUser = user;
  setStatus("Preparando sincronização das apostas…", "saving");
  const reference = cloudRef(user.uid);
  const snapshot = await getDoc(reference);
  const remote = snapshot.exists() ? normalizeBundle(snapshot.data()) : { records: {}, tombstones: {} };
  const merged = mergeBundles(localBundle(), remote);
  applyBundle(merged);

  if (!snapshot.exists() || stableBundle(merged) !== stableBundle(remote)) {
    dirty = true;
    await uploadLocal();
  } else {
    setStatus("Apostas sincronizadas", "synced");
  }

  stopSnapshot?.();
  stopSnapshot = onSnapshot(reference, snap => {
    if (!snap.exists()) {
      if (Object.keys(localBundle().records).length) {
        dirty = true;
        scheduleUpload();
      }
      return;
    }
    handleRemote(snap.data());
  }, error => {
    console.error(`${APP_NAME} apostas por concurso snapshot:`, error);
    setStatus("Falha ao acompanhar apostas por concurso", "error");
  });
}

const previousSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function(key, value) {
  const oldValue = this.getItem(key);
  previousSetItem.call(this, key, value);
  if (this !== localStorage || applyingCloud) return;
  if (key === LOCAL_KEY && oldValue !== String(value)) {
    captureDeletions(oldValue, String(value));
    markDirty();
  } else if (key === TOMBSTONE_KEY && oldValue !== String(value)) {
    markDirty();
  }
};

window.addEventListener("su:contest-bets-updated", markDirty);
window.addEventListener("online", refreshFromServer);
window.addEventListener("pageshow", refreshFromServer);
window.addEventListener("focus", refreshFromServer);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshFromServer();
});

const statusTimer = setInterval(() => {
  if (ensureStatusElement()) {
    setStatus(currentUser ? "Apostas sincronizadas" : "Salvo neste dispositivo • entre na conta para sincronizar", currentUser ? "synced" : "local");
    clearInterval(statusTimer);
  }
}, 250);
setTimeout(() => clearInterval(statusTimer), 15000);

onAuthStateChanged(auth, user => {
  stopSnapshot?.();
  stopSnapshot = null;
  currentUser = user;
  if (!user) {
    setStatus("Salvo neste dispositivo • entre na conta para sincronizar", "local");
    return;
  }
  start(user).catch(error => {
    console.error(`${APP_NAME} apostas por concurso:`, error);
    setStatus("Falha ao iniciar sincronização das apostas", "error");
  });
});
