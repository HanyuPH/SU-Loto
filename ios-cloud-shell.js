import { getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const APP_INSTANCE = "su-loto-cloud";
const DEVICE_NAME_KEY = "su-loto-device-name";
const LAST_SYNC_KEY = "su-loto-c2-rest-last-sync-v1";
const LOGIN_TIMEOUT_MS = 15000;
const PERSISTENCE_GRACE_MS = 1200;
const active = Boolean(globalThis.SULotoFirestoreTransport?.ios && globalThis.SULotoFirestoreTransport?.restOnly);
const protocol = globalThis.SULotoFirestoreTransport?.protocol || "sync-v9";
const firebaseApp = getApps().find(item => item.name === APP_INSTANCE);
if (!firebaseApp) throw new Error("SU Loto: Firebase não inicializado.");
const auth = getAuth(firebaseApp);

let user = null;
let loginInFlight = null;
let cloudState = {
  kind: "offline",
  text: "Nuvem desconectada",
  lastSync: null,
  ready: null,
  error: null
};

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loginTimeout() {
  return new Promise((_, reject) => {
    setTimeout(() => reject(Object.assign(new Error("Tempo limite no login"), { code: "auth/timeout" })), LOGIN_TIMEOUT_MS);
  });
}

function deviceName() {
  return localStorage.getItem(DEVICE_NAME_KEY)
    || (/iPad/i.test(navigator.userAgent) ? "iPad" : /iPhone/i.test(navigator.userAgent) ? "iPhone" : "Navegador");
}

function fmt(value) {
  if (!value) return "Nunca";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function lastSync() {
  return cloudState.lastSync || localStorage.getItem(LAST_SYNC_KEY) || null;
}

function setState(kind, text, extra = {}) {
  cloudState = { ...cloudState, kind, text, ...extra };
  const button = document.getElementById("su-loto-cloud-status");
  const label = document.getElementById("su-loto-cloud-text");
  if (button) button.dataset.state = kind;
  if (label) label.textContent = text;
  refreshPanel();
}

function resetLoginButton() {
  const button = document.getElementById("su-loto-login-button");
  if (!button) return;
  button.disabled = false;
  button.textContent = "Entrar";
}

function injectUi() {
  if (document.getElementById("su-loto-cloud-root")) return;

  const style = document.createElement("style");
  style.textContent = `#su-loto-cloud-root{position:fixed;right:14px;bottom:14px;z-index:9998}.su-loto-cloud-btn{border:0;border-radius:999px;padding:11px 15px;background:#6f2385;color:#fff;font-weight:800;box-shadow:0 8px 28px #0003}.su-loto-cloud-gate,.su-loto-cloud-panel{position:fixed;inset:0;z-index:10000;background:#2f1039ef;display:grid;place-items:center;padding:24px}.su-loto-cloud-gate[hidden],.su-loto-cloud-panel[hidden]{display:none}.su-loto-card{width:min(460px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:24px;padding:26px;color:#17202a}.su-loto-card label{display:grid;gap:7px;margin-top:15px;font-weight:700}.su-loto-card input{font:inherit;padding:13px;border:1px solid #cbd5e1;border-radius:12px}.su-loto-card button{font:inherit;font-weight:800;border-radius:12px;border:0;padding:12px 15px}.su-loto-primary{background:#6f2385;color:#fff;width:100%;margin-top:18px}.su-loto-error{color:#b91c1c;font-weight:700;min-height:1.3em}.su-loto-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.su-loto-grid article{background:#f6eff8;border-radius:14px;padding:12px}.su-loto-grid span{display:block;color:#6b7280;font-size:.85rem}.su-loto-grid strong{display:block;margin-top:4px}.su-loto-actions{display:grid;gap:9px}.su-loto-actions button{background:#f3f4f6}.su-loto-close{float:right;background:#eee!important}`;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "su-loto-cloud-root";
  root.innerHTML = `<button id="su-loto-cloud-status" class="su-loto-cloud-btn" data-state="offline" type="button"><span id="su-loto-cloud-text">Nuvem desconectada</span></button>`;
  document.body.appendChild(root);

  const gate = document.createElement("div");
  gate.id = "su-loto-cloud-gate";
  gate.className = "su-loto-cloud-gate";
  gate.innerHTML = `<div class="su-loto-card"><p style="color:#6f2385;font-weight:900;margin:0">ECOSSISTEMA SU</p><h2>Entrar no SU Loto</h2><p>Use a mesma conta já utilizada no SU Mega.</p><form id="su-loto-login"><label>E-mail<input id="su-loto-email" type="email" autocomplete="username" required></label><label>Senha<input id="su-loto-password" type="password" autocomplete="current-password" required></label><p id="su-loto-error" class="su-loto-error"></p><button id="su-loto-login-button" class="su-loto-primary" type="submit">Entrar</button></form></div>`;
  document.body.appendChild(gate);

  const panel = document.createElement("div");
  panel.id = "su-loto-cloud-panel";
  panel.className = "su-loto-cloud-panel";
  panel.hidden = true;
  panel.innerHTML = `<div class="su-loto-card"><button id="su-loto-close" class="su-loto-close" type="button">Fechar</button><p style="color:#6f2385;font-weight:900;margin:0">ECOSSISTEMA SU</p><h2>Conta e sincronização</h2><div class="su-loto-grid"><article><span>Conta</span><strong id="su-loto-account">—</strong></article><article><span>Estado</span><strong id="su-loto-state">—</strong></article><article><span>Última sincronização</span><strong id="su-loto-last">—</strong></article><article><span>Dispositivo</span><strong id="su-loto-device">—</strong></article></div><p id="su-loto-sync-details" style="margin:0 0 12px;color:#6b7280;font-size:.8rem;font-weight:700"></p><label>Nome do dispositivo<input id="su-loto-device-name"></label><div class="su-loto-actions"><button id="su-loto-sync-now" type="button">Sincronizar agora</button><button id="su-loto-save-device" type="button">Salvar nome do dispositivo</button><button id="su-loto-signout" type="button">Sair da conta</button></div></div>`;
  document.body.appendChild(panel);

  root.querySelector("button").onclick = () => {
    if (user) {
      panel.hidden = false;
      refreshPanel();
    } else {
      gate.hidden = false;
    }
  };

  document.getElementById("su-loto-close").onclick = () => { panel.hidden = true; };
  document.getElementById("su-loto-signout").onclick = () => signOut(auth);
  document.getElementById("su-loto-save-device").onclick = () => {
    const value = document.getElementById("su-loto-device-name").value.trim();
    if (value) localStorage.setItem(DEVICE_NAME_KEY, value);
    refreshPanel();
  };

  document.getElementById("su-loto-sync-now").onclick = async () => {
    const button = document.getElementById("su-loto-sync-now");
    button.disabled = true;
    setState("saving", "Sincronizando…");
    try {
      const result = await globalThis.SULotoIOSRestOperationalSync?.syncNow?.();
      if (!result?.ok) {
        setState(
          navigator.onLine ? "error" : "offline",
          navigator.onLine ? "Falha na sincronização" : "Offline • alterações em espera",
          { error: result?.error || null }
        );
      }
    } finally {
      button.disabled = false;
    }
  };

  document.getElementById("su-loto-login").onsubmit = async event => {
    event.preventDefault();
    if (loginInFlight) return loginInFlight;

    const errorBox = document.getElementById("su-loto-error");
    const button = document.getElementById("su-loto-login-button");
    errorBox.textContent = "";
    button.disabled = true;
    button.textContent = "Entrando…";
    setState("saving", "Entrando na conta…");

    const email = document.getElementById("su-loto-email").value.trim();
    const password = document.getElementById("su-loto-password").value;

    loginInFlight = (async () => {
      try {
        // No WebKit, preparar a persistência não pode bloquear o login para sempre.
        // Esperamos somente uma janela curta e seguimos com a autenticação normal.
        await Promise.race([persistenceReady, wait(PERSISTENCE_GRACE_MS)]);
        if (!auth.currentUser) {
          await Promise.race([
            signInWithEmailAndPassword(auth, email, password),
            loginTimeout()
          ]);
        }
      } catch (cause) {
        errorBox.textContent = cause?.code === "auth/timeout"
          ? "O login demorou além do esperado. Tente novamente; o aplicativo não ficará preso nesta tela."
          : `Não foi possível entrar (${cause?.code || "erro"}).`;
        setState("error", "Falha no login", {
          error: {
            code: cause?.code || "error",
            message: cause?.message || String(cause)
          }
        });
      } finally {
        resetLoginButton();
        loginInFlight = null;
      }
    })();

    return loginInFlight;
  };

  window.addEventListener("online", () => {
    if (user) setState("saving", "Reconectando…");
  });
  window.addEventListener("offline", () => setState("offline", "Offline • alterações em espera"));
}

function refreshPanel() {
  const account = document.getElementById("su-loto-account");
  const syncState = document.getElementById("su-loto-state");
  const last = document.getElementById("su-loto-last");
  const device = document.getElementById("su-loto-device");
  const input = document.getElementById("su-loto-device-name");
  const details = document.getElementById("su-loto-sync-details");

  if (account) account.textContent = user?.email || "Desconectado";
  if (syncState) syncState.textContent = cloudState.text || "—";
  if (last) last.textContent = fmt(lastSync());
  if (device) device.textContent = deviceName();
  if (input && !input.value) input.value = deviceName();

  if (details) {
    const r = cloudState.ready || {};
    const icon = value => value ? "✓" : "…";
    const errorCode = cloudState.error?.code ? ` • Erro ${cloudState.error.code}` : "";
    details.textContent = user
      ? `Jogos ${icon(r.statuses)} • Concursos ${icon(r.contests)} • Apostas ${icon(r.contestBets)} • REST ${protocol}${errorCode}`
      : `REST ${protocol} • aguardando login`;
  }
}

injectUi();
setState(navigator.onLine ? "saving" : "offline", navigator.onLine ? "Verificando login…" : "Offline");

const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn("SU Loto: persistência de autenticação indisponível.", error);
});

window.addEventListener("su:loto-rest-sync-state", event => {
  const detail = event.detail || {};
  setState(detail.kind || "saving", detail.text || "Sincronizando…", {
    lastSync: detail.lastSync || lastSync(),
    ready: detail.ready || cloudState.ready,
    error: detail.error || null
  });
});

onAuthStateChanged(auth, current => {
  user = current;
  const gate = document.getElementById("su-loto-cloud-gate");
  if (gate) gate.hidden = Boolean(current);

  if (current) {
    resetLoginButton();
    const errorBox = document.getElementById("su-loto-error");
    if (errorBox) errorBox.textContent = "";
    setState(
      navigator.onLine ? "saving" : "offline",
      navigator.onLine ? "Conta conectada • sincronizando…" : "Offline • alterações em espera"
    );
  } else {
    setState("offline", "Nuvem desconectada", { ready: null, lastSync: null, error: null });
  }
  refreshPanel();
});

globalThis.SULotoIOSCloudShell = Object.freeze({
  active,
  protocol,
  refreshPanel,
  diagnostics: () => ({
    active,
    authenticated: Boolean(user),
    email: user?.email || null,
    loginInFlight: Boolean(loginInFlight),
    state: { ...cloudState },
    lastSync: lastSync(),
    online: navigator.onLine,
    protocol
  })
});
