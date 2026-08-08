import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

const CONFIG = {
  apiKey: "AIzaSyB7fo20WlKpoySHDBdtjilOqVYRAI8OvKM",
  authDomain: "su-mega.firebaseapp.com",
  projectId: "su-mega",
  storageBucket: "su-mega.firebasestorage.app",
  messagingSenderId: "747588237835",
  appId: "1:747588237835:web:b5cc26c6971ca37cb3a50e"
};
const APP_INSTANCE = "su-loto-cloud";
const FIRESTORE_COMMIT_URL = "https://firestore.googleapis.com/v1/projects/su-mega/databases/(default)/documents:commit";
const SYNC_META_SUFFIX = "/suLoto/C2/syncMeta/state";

function isIOSWebKit() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  return /iPhone|iPad|iPod/i.test(ua) || (platform === "MacIntel" && touchPoints > 1);
}

function writeDocumentName(write) {
  return String(write?.update?.name || write?.delete || write?.transform?.document || "");
}

function installIOSCommitCompatibility() {
  if (globalThis.__SU_LOTO_IOS_COMMIT_COMPAT_V1__) return;
  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function suLotoIOSFetch(input, init = {}) {
    const url = typeof input === "string" ? input : String(input?.url || "");
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    if (url !== FIRESTORE_COMMIT_URL || method !== "POST" || typeof init?.body !== "string") {
      return nativeFetch(input, init);
    }

    let payload;
    try { payload = JSON.parse(init.body); }
    catch { return nativeFetch(input, init); }

    const writes = Array.isArray(payload?.writes) ? payload.writes : [];
    const syncMetaWrites = writes.filter(write => writeDocumentName(write).endsWith(SYNC_META_SUFFIX));
    const operationalWrites = writes.filter(write => !writeDocumentName(write).endsWith(SYNC_META_SUFFIX));

    if (!syncMetaWrites.length || !operationalWrites.length) return nativeFetch(input, init);

    // A gravação operacional é a parte obrigatória. O marcador syncMeta é somente
    // uma otimização de descoberta entre contextos e nunca pode invalidar o dado.
    const operationalResponse = await nativeFetch(input, {
      ...init,
      body: JSON.stringify({ ...payload, writes: operationalWrites })
    });

    if (!operationalResponse.ok) return operationalResponse;

    // Tenta atualizar o marcador separadamente. Se as regras atuais do Firestore
    // não autorizarem esse caminho, mantemos o write operacional já confirmado.
    void nativeFetch(input, {
      ...init,
      body: JSON.stringify({ ...payload, writes: syncMetaWrites })
    }).then(response => {
      if (!response.ok) console.warn(`SU Loto: syncMeta opcional recusado (HTTP ${response.status}); dado operacional preservado.`);
    }).catch(error => {
      console.warn("SU Loto: syncMeta opcional indisponível; dado operacional preservado.", error);
    });

    return operationalResponse;
  };

  globalThis.__SU_LOTO_IOS_COMMIT_COMPAT_V1__ = true;
}

getApps().find(item => item.name === APP_INSTANCE) || initializeApp(CONFIG, APP_INSTANCE);
const ios = isIOSWebKit();
if (ios) installIOSCommitCompatibility();

globalThis.SULotoFirestoreTransport = Object.freeze({
  ios,
  mode: ios ? "ios-rest-only" : "default",
  firestoreReady: false,
  longPollingForced: false,
  persistentFirestoreCache: false,
  restOnly: ios,
  protocol: ios ? "sync-v9-hotfix1" : "sdk",
  operationalWriteBeforeMeta: ios
});
