import assert from "node:assert/strict";
import { webkit } from "playwright";

const browser = await webkit.launch();
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});

const APP_STUB = `
const app={name:"su-loto-cloud"};
export function getApps(){return [app]}
export function initializeApp(){return app}
`;
const AUTH_STUB = `
const user={uid:"qa-user-secret",email:"qa@example.com",getIdToken:async()=>"qa-token-secret"};
const auth={currentUser:user};
export function getAuth(){return auth}
export function onAuthStateChanged(_auth,next){queueMicrotask(()=>next(user));return()=>{}}
`;
const FIRESTORE_STUB = `
const db={kind:"qa-db"};
export function memoryLocalCache(){return {kind:"memory"}}
export function initializeFirestore(){return db}
export function getFirestore(){return db}
export function collection(_db,...parts){return {path:parts.join("/")}}
function snapshot(path){return {size:path.endsWith("gameStatuses")?300:8,metadata:{fromCache:false,hasPendingWrites:false},forEach(){}}}
export function getDocsFromServer(ref){
  const params=new URLSearchParams(location.search);
  if(params.get("sdk")==="hang") return new Promise(()=>{});
  if(params.get("sdk")==="fail") return Promise.reject(Object.assign(new Error("SDK QA failure"),{code:"firestore/unavailable"}));
  return Promise.resolve(snapshot(ref.path));
}
`;

async function installRoutes(page, { restStatus = 200 } = {}) {
  await page.route("https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: APP_STUB }));
  await page.route("https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: AUTH_STUB }));
  await page.route("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: FIRESTORE_STUB }));
  await page.route("https://firestore.googleapis.com/**", route => {
    if (restStatus === 200) route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ documents: [{ name: "qa" }] }) });
    else route.fulfill({ status: restStatus, contentType: "application/json", body: JSON.stringify({ error: { status: "PERMISSION_DENIED", message: "QA denied" } }) });
  });
}

async function runCase(url, expectedText, options = {}) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(String(error)));
  await installRoutes(page, options);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(text => document.getElementById("overall")?.textContent?.includes(text), expectedText, { timeout: 6000 });
  const reportText = await page.locator("#report").innerText();
  const report = JSON.parse(reportText);
  assert.equal(report.authenticated, true);
  assert.equal(report.transport.ios, true);
  assert.equal(report.transport.mode, "ios-force-long-polling-memory-cache");
  assert.ok(!reportText.includes("qa-token-secret"), "relatório não pode expor token");
  assert.ok(!reportText.includes("qa-user-secret"), "relatório não pode expor UID completo");
  assert.deepEqual(pageErrors, [], `sem erros de página: ${pageErrors.join(" | ")}`);
  await page.close();
  return report;
}

const base = "http://127.0.0.1:4173/diagnostics/firestore.html?qa=1";
const healthy = await runCase(base, "SDK e REST alcançaram o Firestore");
assert.equal(healthy.probes.sdkStatuses.ok, true);
assert.equal(healthy.probes.restStatuses.ok, true);

const sdkStuck = await runCase(`${base}&sdk=hang`, "REST funciona, mas o SDK Firestore falhou");
assert.equal(sdkStuck.probes.sdkStatuses.ok, false);
assert.equal(sdkStuck.probes.sdkStatuses.error.code, "diagnostic/timeout");
assert.equal(sdkStuck.probes.restStatuses.ok, true);

const denied = await runCase(`${base}&sdk=fail`, "SDK e REST falharam", { restStatus: 403 });
assert.equal(denied.probes.sdkStatuses.ok, false);
assert.equal(denied.probes.restStatuses.ok, false);
assert.equal(denied.probes.restStatuses.error.code, "http/403");

console.log("WebKit diagnóstico aprovado: saudável, SDK travado/REST OK e falha SDK+REST são distinguidos sem expor credenciais.");
await browser.close();
