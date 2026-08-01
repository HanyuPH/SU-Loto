import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const STATUS_KEY = "su-loto-c2-status-v4";
const CONTEST_KEY = "su-loto-c2-contests-v1";
const BACKUP_LOCAL_KEY = "su-loto-c2-last-cloud-backup";
const DAY_MS = 24 * 60 * 60 * 1000;

function parse(raw, fallback) {
  try { return JSON.parse(raw ?? ""); } catch { return fallback; }
}

function fmt(value) {
  if (!value) return "Nunca";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch { return String(value); }
}

function getFirebaseApp() {
  const apps = getApps();
  return apps.find(item => item.name === "su-loto-cloud") || apps[0] || getApp();
}

const app = getFirebaseApp();
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
let busy = false;

function announce(message) {
  if (globalThis.SULotoApp?.toast) globalThis.SULotoApp.toast(message);
  else if (globalThis.SUMegaApp?.announce) globalThis.SUMegaApp.announce(message);
}

function backupRef(uid) {
  return doc(db, "users", uid, "suLoto", "C2", "backups", "latest");
}

function localPayload() {
  const rawStatuses = parse(localStorage.getItem(STATUS_KEY), {});
  const statuses = rawStatuses?.statuses || rawStatuses || {};
  const contests = parse(localStorage.getItem(CONTEST_KEY), []);
  return {
    app: "SU Loto",
    wallet: "C2",
    schema: 2,
    createdAt: new Date().toISOString(),
    statuses,
    contests: Array.isArray(contests) ? contests : []
  };
}

function setLastBackup(value) {
  if (!value) return;
  localStorage.setItem(BACKUP_LOCAL_KEY, value);
  const el = document.getElementById("su-loto-last-backup");
  if (el) el.textContent = fmt(value);
}

async function readLastBackupDate() {
  if (!currentUser) return null;
  const snapshot = await getDoc(backupRef(currentUser.uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const value = data.createdAt || data.updatedAtClient || null;
  if (value) setLastBackup(value);
  return value;
}

async function createBackup({ automatic = false } = {}) {
  if (!currentUser || busy) return;
  busy = true;
  const button = document.getElementById("su-loto-create-backup");
  if (button) { button.disabled = true; button.textContent = "Criando backup…"; }
  try {
    const payload = localPayload();
    await setDoc(backupRef(currentUser.uid), {
      ...payload,
      automatic,
      updatedAt: serverTimestamp(),
      updatedAtClient: payload.createdAt
    }, { merge: false });
    setLastBackup(payload.createdAt);
    announce(automatic ? "Backup automático atualizado" : "Backup criado com sucesso");
  } catch (error) {
    console.error("SU Loto backup:", error);
    announce("Não foi possível criar o backup");
    throw error;
  } finally {
    busy = false;
    if (button) { button.disabled = false; button.textContent = "Criar backup agora"; }
  }
}

async function restoreBackup() {
  if (!currentUser || busy) return;
  const snapshot = await getDoc(backupRef(currentUser.uid));
  if (!snapshot.exists()) {
    announce("Nenhum backup em nuvem foi encontrado");
    return;
  }
  if (!confirm("Restaurar o último backup do SU Loto? As marcações e concursos atuais serão substituídos.")) return;
  busy = true;
  const button = document.getElementById("su-loto-restore-backup");
  if (button) { button.disabled = true; button.textContent = "Restaurando…"; }
  try {
    const data = snapshot.data();
    const payload = {
      app: "SU Loto",
      wallet: "C2",
      schema: 2,
      savedAt: new Date().toISOString(),
      statuses: data.statuses && typeof data.statuses === "object" ? data.statuses : {}
    };
    localStorage.setItem(STATUS_KEY, JSON.stringify(payload));
    localStorage.setItem(CONTEST_KEY, JSON.stringify(Array.isArray(data.contests) ? data.contests : []));
    window.dispatchEvent(new StorageEvent("storage", { key: STATUS_KEY, newValue: JSON.stringify(payload) }));
    window.dispatchEvent(new StorageEvent("storage", { key: CONTEST_KEY, newValue: JSON.stringify(data.contests || []) }));
    announce("Backup restaurado. Atualizando o aplicativo…");
    setTimeout(() => location.reload(), 700);
  } catch (error) {
    console.error("SU Loto restore:", error);
    announce("Não foi possível restaurar o backup");
  } finally {
    busy = false;
    if (button) { button.disabled = false; button.textContent = "Restaurar último backup"; }
  }
}

function injectBackupUi() {
  const body = document.querySelector("#su-loto-cloud-panel .su-eco-body");
  const grid = document.querySelector("#su-loto-cloud-panel .su-loto-grid");
  const actions = document.querySelector("#su-loto-cloud-panel .su-loto-actions");
  if (!body || !grid || !actions || document.getElementById("su-loto-last-backup")) return false;

  const card = document.createElement("article");
  card.innerHTML = `<span>Último backup</span><strong id="su-loto-last-backup">${fmt(localStorage.getItem(BACKUP_LOCAL_KEY))}</strong>`;
  grid.appendChild(card);

  const create = document.createElement("button");
  create.id = "su-loto-create-backup";
  create.type = "button";
  create.textContent = "Criar backup agora";
  create.addEventListener("click", () => createBackup());

  const restore = document.createElement("button");
  restore.id = "su-loto-restore-backup";
  restore.type = "button";
  restore.textContent = "Restaurar último backup";
  restore.addEventListener("click", restoreBackup);

  const signout = document.getElementById("su-loto-signout");
  if (signout) {
    actions.insertBefore(create, signout);
    actions.insertBefore(restore, signout);
  } else {
    actions.append(create, restore);
  }
  return true;
}

async function automaticBackupIfNeeded() {
  if (!currentUser) return;
  let last = localStorage.getItem(BACKUP_LOCAL_KEY);
  try { last = (await readLastBackupDate()) || last; } catch (error) { console.warn(error); }
  if (!last || Date.now() - new Date(last).getTime() >= DAY_MS) {
    await createBackup({ automatic: true });
  }
}

const timer = setInterval(() => {
  if (injectBackupUi()) clearInterval(timer);
}, 250);
setTimeout(() => clearInterval(timer), 20000);

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (!user) return;
  injectBackupUi();
  try { await automaticBackupIfNeeded(); } catch (error) { console.warn("Backup automático pendente", error); }
});
