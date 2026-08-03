import { getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const FIREBASE_APP_NAME = "su-loto-cloud";
const STATUS_KEY = "su-loto-c2-status-v4";
const VALID = new Set(["pendente", "registrado", "apostado"]);
const LABELS = { pendente: "Pendente", registrado: "Registrada", apostado: "Apostado" };

let currentUser = null;
let db = null;
let lastSignature = "";
let uploadTimer = null;
let pullTimer = null;
let uploadInFlight = false;

function parse(raw, fallback) {
  try { return JSON.parse(raw ?? ""); } catch { return fallback; }
}

function readStatuses() {
  const payload = parse(localStorage.getItem(STATUS_KEY), {});
  const source = payload?.statuses || payload || {};
  const output = {};
  for (const [id, status] of Object.entries(source)) {
    if (VALID.has(status)) output[id] = status;
  }
  return output;
}

function signature(statuses = readStatuses()) {
  return JSON.stringify(Object.fromEntries(
    Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }))
  ));
}

function refreshInterface(statuses = readStatuses()) {
  document.querySelectorAll(".game-card[data-id]").forEach(card => {
    const id = card.dataset.id;
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
  const games = Array.isArray(globalThis.SU_LOTO_GAMES) ? globalThis.SU_LOTO_GAMES : [];
  games.forEach(game => count[statuses[game.id] || "pendente"] += 1);
  for (const [status, value] of Object.entries(count)) {
    const element = document.getElementById(`count-${status}`);
    if (element) element.textContent = String(value);
  }

  const statusFilter = document.getElementById("filter-status");
  if (statusFilter) statusFilter.dispatchEvent(new Event("change", { bubbles: true }));
  globalThis.SULotoContests?.refresh?.();
}

function updateCloudIndicator(text) {
  const element = document.getElementById("su-loto-cloud-text");
  if (element) element.textContent = text;
}

async function uploadStatuses() {
  if (!currentUser || !db || uploadInFlight) return;
  uploadInFlight = true;
  updateCloudIndicator("Sincronizando…");
  try {
    const entries = Object.entries(readStatuses());
    for (let index = 0; index < entries.length; index += 400) {
      const batch = writeBatch(db);
      for (const [id, status] of entries.slice(index, index + 400)) {
        batch.set(doc(db, "users", currentUser.uid, "suLoto", "C2", "gameStatuses", id), {
          status,
          updatedAt: serverTimestamp(),
          syncBridge: true
        }, { merge: true });
      }
      await batch.commit();
    }
    updateCloudIndicator("Sincronizado");
  } catch (error) {
    console.error("SU Loto ponte de sincronização:", error);
    updateCloudIndicator("Falha na sincronização");
  } finally {
    uploadInFlight = false;
  }
}

function scheduleUpload() {
  clearTimeout(uploadTimer);
  uploadTimer = setTimeout(uploadStatuses, 220);
}

async function pullStatuses() {
  if (!currentUser || !db || document.hidden) return;
  clearTimeout(pullTimer);
  pullTimer = setTimeout(async () => {
    try {
      const snapshot = await getDocs(collection(db, "users", currentUser.uid, "suLoto", "C2", "gameStatuses"));
      if (snapshot.empty) return;
      const merged = readStatuses();
      snapshot.forEach(item => {
        const status = item.data()?.status;
        if (VALID.has(status)) merged[item.id] = status;
      });
      const nextSignature = signature(merged);
      if (nextSignature !== signature()) {
        const payload = {
          app: "SU Loto",
          wallet: "C2",
          schema: 2,
          savedAt: new Date().toISOString(),
          statuses: merged
        };
        localStorage.setItem(STATUS_KEY, JSON.stringify(payload));
      }
      lastSignature = nextSignature;
      refreshInterface(merged);
      updateCloudIndicator("Sincronizado");
    } catch (error) {
      console.error("SU Loto atualização ao retomar:", error);
    }
  }, 180);
}

function monitorLocalChanges() {
  const current = readStatuses();
  const currentSignature = signature(current);
  if (currentSignature === lastSignature) return;
  lastSignature = currentSignature;
  refreshInterface(current);
  if (currentUser) scheduleUpload();
}

function installResumeHooks() {
  window.addEventListener("pageshow", pullStatuses);
  window.addEventListener("focus", pullStatuses);
  window.addEventListener("online", pullStatuses);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pullStatuses();
  });
  window.addEventListener("su:cloud-statuses-applied", () => {
    lastSignature = signature();
    refreshInterface();
  });
}

function start() {
  const firebaseApp = getApps().find(item => item.name === FIREBASE_APP_NAME);
  if (!firebaseApp) {
    setTimeout(start, 400);
    return;
  }
  db = getFirestore(firebaseApp);
  lastSignature = signature();
  installResumeHooks();
  setInterval(monitorLocalChanges, 650);
  onAuthStateChanged(getAuth(firebaseApp), user => {
    currentUser = user;
    if (user) setTimeout(pullStatuses, 350);
  });
}

start();
