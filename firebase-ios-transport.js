import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache
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

function isIOSWebKit() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  return /iPhone|iPad|iPod/i.test(ua) || (platform === "MacIntel" && touchPoints > 1);
}

const firebaseApp = getApps().find(item => item.name === APP_INSTANCE)
  || initializeApp(CONFIG, APP_INSTANCE);

let transportMode = "default";
let firestoreReady = false;

if (isIOSWebKit()) {
  try {
    // No iPhone/iPad a SU Loto já preserva o estado operacional no localStorage.
    // O cache persistente do Firestore é dispensável e pode adicionar coordenação
    // extra entre contextos WebKit. Para a nuvem, priorizamos conexão confiável.
    initializeFirestore(firebaseApp, {
      localCache: memoryLocalCache(),
      experimentalAutoDetectLongPolling: false,
      experimentalForceLongPolling: true,
      experimentalLongPollingOptions: { timeoutSeconds: 15 }
    });
    transportMode = "ios-force-long-polling-memory-cache";
    firestoreReady = true;
  } catch (error) {
    // Se outra parte já inicializou o Firestore, não criamos uma segunda instância.
    // O módulo continua diagnóstico e deixa a instância existente operar.
    try {
      getFirestore(firebaseApp);
      transportMode = "ios-existing-firestore";
      firestoreReady = true;
    } catch {
      console.warn("SU Loto: não foi possível preparar o transporte Firestore do iOS.", error);
    }
  }
}

globalThis.SULotoFirestoreTransport = Object.freeze({
  ios: isIOSWebKit(),
  mode: transportMode,
  firestoreReady,
  longPollingForced: transportMode === "ios-force-long-polling-memory-cache",
  persistentFirestoreCache: transportMode !== "ios-force-long-polling-memory-cache"
});
