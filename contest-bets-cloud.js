import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const APP_NAME = "SU Loto";
const LOCAL_KEY = "su-loto-c2-contest-bets-v1";
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
let writeInFlight = false;
let uploadTimer = null;
let statusHideTimer = null;

function parse(raw, fallback) {
  try { return JSON.parse(raw ?? ""); } catch { return fallback; }
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

function localRecords() {
  return normalizeRecords(parse(localStorage.getItem(LOCAL_KEY), {}));
}

function timestamp(row) {
  const value = new Date(row?.updatedAt || row?.concludedAt || row?.savedAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function mergeRecords(local, remote) {
  const output = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    const a = local[key];
    const b = remote[key];
    output[key] = !a ? b : !b ? a : (timestamp(a) >= timestamp(b) ? a : b);
  }
  return normalizeRecords(output);
}

function stable(value) {
  const normalized = normalizeRecords(value);
  return JSON.stringify(Object.fromEntries(
    Object.keys(normalized)
      .sort((a, b) => Number(a) - Number(b))
      .map(key => [key, normalized[key]])
  ));
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

function applyRemote(records) {
  const normalized = normalizeRecords(records);
  if (stable(normalized) === stable(localRecords())) return;
  applyingCloud = true;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(normalized));
  } finally {
    applyingCloud = false;
  }
  window.dispatchEvent(new CustomEvent("su:contest-bets-cloud-updated", { detail: normalized }));
}

async function uploadLocal() {
  if (!currentUser) {
    setStatus("Salvo neste dispositivo • entre na conta para sincronizar", "local");
    return;
  }
  writeInFlight = true;
  setStatus("Sincronizando apostas por concurso…", "saving");
  try {
    const records = localRecords();
    await setDoc(cloudRef(currentUser.uid), {
      app: APP_NAME,
      wallet: "C2",
      records,
      updatedAt: serverTimestamp(),
      updatedAtClient: new Date().toISOString()
    }, { merge: false });
    setStatus("Apostas sincronizadas", "synced");
  } catch (error) {
    console.error(`${APP_NAME} apostas por concurso na nuvem:`, error);
    setStatus("Falha ao sincronizar apostas por concurso", "error");
  } finally {
    writeInFlight = false;
  }
}

function scheduleUpload() {
  if (applyingCloud) return;
  clearTimeout(uploadTimer);
  uploadTimer = setTimeout(uploadLocal, 180);
}

async function start(user) {
  currentUser = user;
  setStatus("Preparando sincronização das apostas…", "saving");
  const reference = cloudRef(user.uid);
  const snapshot = await getDoc(reference);
  const local = localRecords();
  const remote = snapshot.exists() ? normalizeRecords(snapshot.data()?.records) : {};
  const merged = mergeRecords(local, remote);
  applyRemote(merged);
  if (!snapshot.exists() || stable(merged) !== stable(remote)) await uploadLocal();
  else setStatus("Apostas sincronizadas", "synced");

  stopSnapshot?.();
  stopSnapshot = onSnapshot(reference, snap => {
    if (!snap.exists() || writeInFlight) return;
    applyRemote(snap.data()?.records || {});
    setStatus("Apostas sincronizadas", "synced");
  }, error => {
    console.error(`${APP_NAME} apostas por concurso snapshot:`, error);
    setStatus("Falha ao acompanhar apostas por concurso", "error");
  });
}

globalThis.SULotoSyncEvents?.subscribe?.(event => {
  if (event.domain === "contestBets" && event.source !== "cloud" && !applyingCloud) scheduleUpload();
});

// Compatibilidade durante a transição: o módulo local já emite este evento explicitamente.
window.addEventListener("su:contest-bets-updated", scheduleUpload);

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
