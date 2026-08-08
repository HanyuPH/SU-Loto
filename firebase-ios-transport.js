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

function isIOSWebKit() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  return /iPhone|iPad|iPod/i.test(ua) || (platform === "MacIntel" && touchPoints > 1);
}

getApps().find(item => item.name === APP_INSTANCE) || initializeApp(CONFIG, APP_INSTANCE);
const ios = isIOSWebKit();

globalThis.SULotoFirestoreTransport = Object.freeze({
  ios,
  mode: ios ? "ios-rest-only" : "default",
  firestoreReady: false,
  longPollingForced: false,
  persistentFirestoreCache: false,
  restOnly: ios,
  protocol: ios ? "sync-v9" : "sdk"
});
