import "../firebase-ios-transport.js?v=1";
import { getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, getDocsFromServer } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const APP_INSTANCE = "su-loto-cloud";
const PROJECT_ID = "su-mega";
const WALLET = "C2";
const QA_MODE = new URLSearchParams(location.search).has("qa");
const TIMEOUT_MS = QA_MODE ? 700 : 10000;
const AUTH_TIMEOUT_MS = QA_MODE ? 700 : 8000;

const app = getApps().find(item => item.name === APP_INSTANCE);
if (!app) throw new Error("Instância Firebase SU Loto não encontrada.");
const auth = getAuth(app);
const db = getFirestore(app);

const el = id => document.getElementById(id);
let latestReport = null;

function now() { return performance.now(); }
function elapsed(started) { return Math.round(performance.now() - started); }
function safeError(error) {
  return {
    name: String(error?.name || "Error"),
    code: String(error?.code || ""),
    message: String(error?.message || error || "erro").slice(0, 220)
  };
}
function timeout(ms, label) {
  return new Promise((_, reject) => setTimeout(() => {
    const error = new Error(`${label}: timeout após ${ms} ms`);
    error.code = "diagnostic/timeout";
    reject(error);
  }, ms));
}
async function timed(label, operation, ms = TIMEOUT_MS) {
  const started = now();
  try {
    const value = await Promise.race([operation(), timeout(ms, label)]);
    return { label, ok: true, durationMs: elapsed(started), value };
  } catch (error) {
    return { label, ok: false, durationMs: elapsed(started), error: safeError(error) };
  }
}
function waitForAuth(ms = AUTH_TIMEOUT_MS) {
  return new Promise(resolve => {
    let done = false;
    let unsubscribe = null;
    let timer = null;
    const finish = user => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      resolve(user || null);
    };
    unsubscribe = onAuthStateChanged(auth, finish, () => finish(null));
    timer = setTimeout(() => finish(auth.currentUser), ms);
  });
}
function collectionRef(uid, domain) {
  return collection(db, "users", uid, "suLoto", WALLET, domain);
}
function restCollectionUrl(uid, domain) {
  const path = ["users", uid, "suLoto", WALLET, domain].map(encodeURIComponent).join("/");
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?pageSize=1`;
}
async function restProbe(user, domain, token) {
  const response = await fetch(restCollectionUrl(user.uid, domain), {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Cache-Control": "no-cache"
    }
  });
  let body = null;
  try { body = await response.json(); } catch {}
  const firestoreStatus = body?.error?.status || null;
  const firestoreMessage = body?.error?.message ? String(body.error.message).slice(0, 180) : null;
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}${firestoreStatus ? ` • ${firestoreStatus}` : ""}${firestoreMessage ? ` • ${firestoreMessage}` : ""}`);
    error.code = `http/${response.status}`;
    throw error;
  }
  return {
    httpStatus: response.status,
    returnedDocuments: Array.isArray(body?.documents) ? body.documents.length : 0,
    nextPage: Boolean(body?.nextPageToken)
  };
}
function summarizeSdk(result) {
  if (!result.ok) return { ok: false, durationMs: result.durationMs, error: result.error };
  return {
    ok: true,
    durationMs: result.durationMs,
    size: Number(result.value?.size || 0),
    fromCache: Boolean(result.value?.metadata?.fromCache),
    pendingWrites: Boolean(result.value?.metadata?.hasPendingWrites)
  };
}
function summarizeRest(result) {
  if (!result.ok) return { ok: false, durationMs: result.durationMs, error: result.error };
  return { ok: true, durationMs: result.durationMs, ...result.value };
}
function statusClass(ok) { return ok ? "ok" : "bad"; }
function renderProbe(name, result) {
  const row = document.createElement("div");
  row.className = "row";
  const left = document.createElement("div");
  left.className = "label";
  left.textContent = name;
  const right = document.createElement("div");
  right.className = `value ${statusClass(result.ok)}`;
  right.textContent = result.ok
    ? `OK • ${result.durationMs} ms${Number.isFinite(result.size) ? ` • ${result.size} docs` : ""}${result.httpStatus ? ` • HTTP ${result.httpStatus}` : ""}`
    : `FALHA • ${result.durationMs} ms • ${result.error?.code || result.error?.message || "erro"}`;
  row.append(left, right);
  return row;
}
function maskEmail(email) {
  const value = String(email || "");
  const [name, domain] = value.split("@");
  if (!name || !domain) return "sim";
  return `${name.slice(0, 2)}***@${domain}`;
}
function transportSnapshot() {
  const value = globalThis.SULotoFirestoreTransport || {};
  return {
    ios: Boolean(value.ios),
    mode: String(value.mode || "não informado"),
    firestoreReady: Boolean(value.firestoreReady),
    longPollingForced: Boolean(value.longPollingForced),
    persistentFirestoreCache: Boolean(value.persistentFirestoreCache)
  };
}
async function runDiagnostic() {
  const runButton = el("run");
  runButton.disabled = true;
  el("overall").textContent = "Executando testes somente leitura…";
  el("results").replaceChildren();
  el("online").textContent = navigator.onLine ? "Online" : "Offline";

  const startedAt = new Date().toISOString();
  const user = await waitForAuth();
  el("auth").textContent = user ? `Sim • ${maskEmail(user.email)}` : "Não";
  const transport = transportSnapshot();
  el("transport").textContent = `${transport.mode}${transport.firestoreReady ? " • pronto" : " • não pronto"}`;

  if (!user) {
    latestReport = {
      schema: 1,
      app: "SU Loto Beta v23",
      startedAt,
      finishedAt: new Date().toISOString(),
      online: navigator.onLine,
      authenticated: false,
      transport,
      userAgent: navigator.userAgent
    };
    el("overall").innerHTML = '<span class="bad">Não foi possível recuperar a sessão autenticada.</span>';
    el("report").textContent = JSON.stringify(latestReport, null, 2);
    runButton.disabled = false;
    return;
  }

  const tokenResult = await timed("auth-token", () => user.getIdToken(false), AUTH_TIMEOUT_MS);
  const token = tokenResult.ok ? tokenResult.value : null;

  const sdkStatuses = await timed("sdk-gameStatuses", () => getDocsFromServer(collectionRef(user.uid, "gameStatuses")));
  const sdkContests = await timed("sdk-contests", () => getDocsFromServer(collectionRef(user.uid, "contests")));
  const restStatuses = token
    ? await timed("rest-gameStatuses", () => restProbe(user, "gameStatuses", token))
    : { label: "rest-gameStatuses", ok: false, durationMs: 0, error: { code: "auth/no-token", message: "Token indisponível" } };
  const restContests = token
    ? await timed("rest-contests", () => restProbe(user, "contests", token))
    : { label: "rest-contests", ok: false, durationMs: 0, error: { code: "auth/no-token", message: "Token indisponível" } };

  const probes = {
    token: tokenResult.ok ? { ok: true, durationMs: tokenResult.durationMs } : { ok: false, durationMs: tokenResult.durationMs, error: tokenResult.error },
    sdkStatuses: summarizeSdk(sdkStatuses),
    sdkContests: summarizeSdk(sdkContests),
    restStatuses: summarizeRest(restStatuses),
    restContests: summarizeRest(restContests)
  };

  const results = el("results");
  results.append(
    renderProbe("Token Firebase", probes.token),
    renderProbe("SDK • status dos jogos", probes.sdkStatuses),
    renderProbe("SDK • concursos", probes.sdkContests),
    renderProbe("REST HTTPS • status dos jogos", probes.restStatuses),
    renderProbe("REST HTTPS • concursos", probes.restContests)
  );

  const sdkOk = probes.sdkStatuses.ok && probes.sdkContests.ok;
  const restOk = probes.restStatuses.ok && probes.restContests.ok;
  let diagnosis;
  if (sdkOk && restOk) diagnosis = "SDK e REST alcançaram o Firestore.";
  else if (!sdkOk && restOk) diagnosis = "REST funciona, mas o SDK Firestore falhou ou expirou. Forte indício de problema no canal SDK/WebChannel do Safari/PWA.";
  else if (!restOk && sdkOk) diagnosis = "SDK funciona, mas REST falhou. Investigar token/endpoint REST antes de qualquer fallback.";
  else diagnosis = "SDK e REST falharam. Investigar autenticação, regras do Firestore ou conectividade antes de alterar novamente a sincronização.";

  latestReport = {
    schema: 1,
    app: "SU Loto Beta v23",
    startedAt,
    finishedAt: new Date().toISOString(),
    online: navigator.onLine,
    authenticated: true,
    transport,
    probes,
    diagnosis,
    userAgent: navigator.userAgent
  };
  el("overall").innerHTML = `<span class="${sdkOk && restOk ? "ok" : "warn"}">${diagnosis}</span>`;
  el("report").textContent = JSON.stringify(latestReport, null, 2);
  runButton.disabled = false;
}

el("run").addEventListener("click", () => void runDiagnostic());
el("copy").addEventListener("click", async () => {
  if (!latestReport) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(latestReport, null, 2));
    el("copy").textContent = "Relatório copiado";
    setTimeout(() => { el("copy").textContent = "Copiar relatório"; }, 1800);
  } catch {
    el("copy").textContent = "Selecione o relatório abaixo";
  }
});

void runDiagnostic();
