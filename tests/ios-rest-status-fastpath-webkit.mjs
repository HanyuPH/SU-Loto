import { webkit } from 'playwright';

const BASE = 'http://127.0.0.1:4173';
const browser = await webkit.launch({ headless: true });
let firestoreRequests = 0;
let lastFirestoreUrl = '';
let lastAuthorization = '';

function documents({ skipId = null, overrides = {} } = {}) {
  const list = [];
  for (let id = 1; id <= 300; id += 1) {
    if (String(id) === String(skipId)) continue;
    const status = overrides[String(id)] || 'pendente';
    list.push({
      name: `projects/su-mega/databases/(default)/documents/users/uid-test/suLoto/C2/gameStatuses/${id}`,
      fields: { status: { stringValue: status } }
    });
  }
  return list;
}

let remoteDocuments = documents({ skipId: 3, overrides: { '1': 'apostado', '2': 'registrado' } });

async function configureRoutes(page) {
  await page.route('https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export function getApps(){return [globalThis.__fakeFirebaseApp];}'
  }));
  await page.route('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export function getAuth(){return globalThis.__fakeAuth;}
      export function onAuthStateChanged(_auth, callback){queueMicrotask(()=>callback(globalThis.__fakeUser));return ()=>{};}`
  }));
  await page.route('https://firestore.googleapis.com/**', async route => {
    firestoreRequests += 1;
    lastFirestoreUrl = route.request().url();
    lastAuthorization = route.request().headers()['authorization'] || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents: remoteDocuments })
    });
  });
}

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1',
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
await configureRoutes(page);
await page.goto(`${BASE}/tests/ios-rest-fastpath-harness.html`);
await page.evaluate(() => {
  globalThis.__fakeFirebaseApp = { name: 'su-loto-cloud' };
  globalThis.__fakeAuth = {};
  globalThis.__fakeUser = { uid: 'uid-test', getIdToken: async () => 'fake-token' };
  globalThis.SULotoFirestoreTransport = { ios: true, mode: 'qa-ios', firestoreReady: true };
  globalThis.SU_LOTO_GAMES = Array.from({ length: 300 }, (_, index) => ({ id: index + 1 }));
  globalThis.SU_LOTO_WALLET_MANIFEST = { source: { registeredWalletLogicalSha256: 'qa-hash' } };
  globalThis.SULotoLocalFirstGuard = { pendingStatuses: () => ({ '2': 'apostado' }) };
  const statuses = Object.fromEntries(globalThis.SU_LOTO_GAMES.map(game => [String(game.id), 'pendente']));
  statuses['2'] = 'apostado';
  statuses['3'] = 'registrado';
  localStorage.setItem('su-loto-c2-status-v4', JSON.stringify({ app: 'SU Loto', wallet: 'C2', schema: 3, statuses }));
});

await page.evaluate(async () => { await import('/ios-rest-status-refresh.js?qa=webkit-1'); });
await page.waitForFunction(() => Boolean(localStorage.getItem('su-loto-c2-last-server-sync-v1')), null, { timeout: 3000 });

const first = await page.evaluate(() => {
  const payload = JSON.parse(localStorage.getItem('su-loto-c2-status-v4'));
  return {
    one: payload.statuses['1'],
    two: payload.statuses['2'],
    three: payload.statuses['3'],
    source: payload.source,
    state: document.getElementById('su-loto-cloud-status')?.dataset.state,
    label: document.getElementById('su-loto-cloud-text')?.textContent,
    last: document.getElementById('su-loto-last')?.textContent,
    diag: globalThis.SULotoIOSRestStatus?.diagnostics?.()
  };
});

if (first.one !== 'apostado') throw new Error(`status remoto não aplicado: jogo 1 = ${first.one}`);
if (first.two !== 'apostado') throw new Error(`intenção local pendente foi sobrescrita: jogo 2 = ${first.two}`);
if (first.three !== 'registrado') throw new Error(`status local sem documento remoto não foi preservado: jogo 3 = ${first.three}`);
if (first.source !== 'firestore-rest-ios') throw new Error(`origem inesperada: ${first.source}`);
if (first.state !== 'synced') throw new Error(`estado visual não ficou synced: ${first.state}`);
if (!/Sincronizado/i.test(first.label || '')) throw new Error(`rótulo visual inesperado: ${first.label}`);
if (!first.last || first.last === 'Nunca') throw new Error('Última sincronização não foi atualizada');
if (!first.diag?.active || first.diag.lastRefreshError) throw new Error('diagnóstico do fast path indica falha');
if (!lastFirestoreUrl.includes('pageSize=300')) throw new Error(`REST não pediu pageSize=300: ${lastFirestoreUrl}`);
if (lastAuthorization !== 'Bearer fake-token') throw new Error('Bearer token não foi enviado corretamente');

remoteDocuments = documents({ overrides: { '1': 'registrado', '2': 'apostado', '3': 'registrado' } });
await page.evaluate(async () => { await globalThis.SULotoIOSRestStatus.refreshNow('qa-second'); });
const second = await page.evaluate(() => JSON.parse(localStorage.getItem('su-loto-c2-status-v4')).statuses['1']);
if (second !== 'registrado') throw new Error(`segunda leitura REST não atualizou jogo 1: ${second}`);
if (firestoreRequests < 2) throw new Error(`esperadas pelo menos 2 leituras REST, obtidas ${firestoreRequests}`);

await context.close();

const nonIosContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const nonIosPage = await nonIosContext.newPage();
let nonIosRestRequests = 0;
await nonIosPage.route('https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js', route => route.fulfill({ contentType: 'application/javascript', body: 'export function getApps(){return [globalThis.__fakeFirebaseApp];}' }));
await nonIosPage.route('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js', route => route.fulfill({ contentType: 'application/javascript', body: 'export function getAuth(){return globalThis.__fakeAuth;} export function onAuthStateChanged(_a,cb){queueMicrotask(()=>cb(globalThis.__fakeUser));return ()=>{};}' }));
await nonIosPage.route('https://firestore.googleapis.com/**', route => { nonIosRestRequests += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"documents":[]}' }); });
await nonIosPage.goto(`${BASE}/tests/ios-rest-fastpath-harness.html`);
await nonIosPage.evaluate(() => {
  globalThis.__fakeFirebaseApp = { name: 'su-loto-cloud' };
  globalThis.__fakeAuth = {};
  globalThis.__fakeUser = { uid: 'uid-test', getIdToken: async () => 'fake-token' };
  globalThis.SULotoFirestoreTransport = { ios: false, mode: 'default' };
  globalThis.SU_LOTO_GAMES = Array.from({ length: 300 }, (_, index) => ({ id: index + 1 }));
});
await nonIosPage.evaluate(async () => { await import('/ios-rest-status-refresh.js?qa=non-ios'); });
await nonIosPage.waitForTimeout(180);
const activeNonIos = await nonIosPage.evaluate(() => globalThis.SULotoIOSRestStatus?.active);
if (activeNonIos !== false) throw new Error(`fast path deveria estar inativo fora do iOS: ${activeNonIos}`);
if (nonIosRestRequests !== 0) throw new Error(`fast path fez REST fora do iOS: ${nonIosRestRequests}`);
await nonIosContext.close();

await browser.close();
console.log(JSON.stringify({
  result: 'APROVADO',
  webkitIos: true,
  firstRemoteApplied: first.one,
  pendingProtected: first.two,
  missingRemoteProtected: first.three,
  secondRemoteApplied: second,
  restRequests: firestoreRequests,
  nonIosRestRequests,
  uiState: first.state,
  uiLabel: first.label,
  lastSync: first.last
}, null, 2));
