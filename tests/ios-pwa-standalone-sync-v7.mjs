import { webkit } from 'playwright';

const BASE = 'http://127.0.0.1:4173';
const browser = await webkit.launch({ headless: true });
let restRequests = 0;
let remoteOverrides = { '1': 'apostado' };

function documents(overrides = {}) {
  return Array.from({ length: 300 }, (_, index) => {
    const id = String(index + 1);
    return {
      name: `projects/su-mega/databases/(default)/documents/users/uid-pwa/suLoto/C2/gameStatuses/${id}`,
      fields: { status: { stringValue: overrides[id] || 'pendente' } }
    };
  });
}

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1',
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});

await context.addInitScript(() => {
  Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });
  const nativeMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = query => {
    if (String(query).includes('display-mode: standalone')) {
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; }
      };
    }
    return nativeMatchMedia(query);
  };
});

const page = await context.newPage();
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
  restRequests += 1;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ documents: documents(remoteOverrides) })
  });
});

await page.goto(`${BASE}/tests/ios-rest-fastpath-harness.html`);
await page.evaluate(() => {
  globalThis.__fakeFirebaseApp = { name: 'su-loto-cloud' };
  globalThis.__fakeAuth = {};
  globalThis.__fakeUser = { uid: 'uid-pwa', getIdToken: async () => 'pwa-token' };
  globalThis.SULotoFirestoreTransport = {
    ios: true,
    mode: 'ios-force-long-polling-memory-cache',
    firestoreReady: true,
    longPollingForced: true,
    persistentFirestoreCache: false
  };
  globalThis.SU_LOTO_GAMES = Array.from({ length: 300 }, (_, index) => ({ id: index + 1 }));
  globalThis.SU_LOTO_WALLET_MANIFEST = { source: { registeredWalletLogicalSha256: 'qa-pwa-hash' } };
  globalThis.SULotoLocalFirstGuard = { pendingStatuses: () => ({}) };
  const statuses = Object.fromEntries(globalThis.SU_LOTO_GAMES.map(game => [String(game.id), 'pendente']));
  localStorage.setItem('su-loto-c2-status-v4', JSON.stringify({ app: 'SU Loto', wallet: 'C2', schema: 3, statuses }));
});

const standalone = await page.evaluate(() => ({
  navigatorStandalone: navigator.standalone === true,
  mediaStandalone: matchMedia('(display-mode: standalone)').matches
}));
if (!standalone.navigatorStandalone || !standalone.mediaStandalone) {
  throw new Error(`ambiente PWA standalone não foi simulado corretamente: ${JSON.stringify(standalone)}`);
}

const initialStarted = Date.now();
await page.evaluate(async () => { await import('/ios-rest-status-refresh.js?qa=pwa-standalone'); });
await page.waitForFunction(() => {
  const payload = JSON.parse(localStorage.getItem('su-loto-c2-status-v4') || '{}');
  return payload.statuses?.['1'] === 'apostado' && Boolean(localStorage.getItem('su-loto-c2-last-server-sync-v1'));
}, null, { timeout: 3000 });
const initialDurationMs = Date.now() - initialStarted;

const initial = await page.evaluate(() => ({
  status1: JSON.parse(localStorage.getItem('su-loto-c2-status-v4')).statuses['1'],
  lastSync: localStorage.getItem('su-loto-c2-last-server-sync-v1'),
  state: document.getElementById('su-loto-cloud-status')?.dataset.state,
  label: document.getElementById('su-loto-cloud-text')?.textContent,
  diag: globalThis.SULotoIOSRestStatus?.diagnostics?.()
}));
if (initial.status1 !== 'apostado') throw new Error(`abertura PWA não aplicou o servidor: ${initial.status1}`);
if (!initial.lastSync) throw new Error('abertura PWA não registrou última sincronização');
if (!initial.diag?.active || initial.diag.lastRefreshError) throw new Error(`diagnóstico inicial inválido: ${JSON.stringify(initial.diag)}`);
if (/Conexão lenta/i.test(initial.label || '')) throw new Error(`PWA permaneceu em conexão lenta após REST: ${initial.label}`);

// Simula a PWA voltando do segundo plano: o visibilitychange visível deve
// forçar uma leitura fresca e aplicar o novo estado sem depender do listener SDK.
remoteOverrides = { '1': 'registrado', '2': 'apostado' };
const resumeStarted = Date.now();
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForFunction(() => {
  const payload = JSON.parse(localStorage.getItem('su-loto-c2-status-v4') || '{}');
  return payload.statuses?.['1'] === 'registrado' && payload.statuses?.['2'] === 'apostado';
}, null, { timeout: 3000 });
const resumeDurationMs = Date.now() - resumeStarted;

// Simula restauração da página pelo sistema (pageshow/BFCache), outra rota
// relevante de retorno de um PWA instalado na Tela de Início.
remoteOverrides = { '1': 'apostado', '2': 'registrado', '3': 'apostado' };
const pageshowStarted = Date.now();
await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
await page.waitForFunction(() => {
  const payload = JSON.parse(localStorage.getItem('su-loto-c2-status-v4') || '{}');
  return payload.statuses?.['1'] === 'apostado' && payload.statuses?.['2'] === 'registrado' && payload.statuses?.['3'] === 'apostado';
}, null, { timeout: 3000 });
const pageshowDurationMs = Date.now() - pageshowStarted;

const finalState = await page.evaluate(() => ({
  lastSync: localStorage.getItem('su-loto-c2-last-server-sync-v1'),
  state: document.getElementById('su-loto-cloud-status')?.dataset.state,
  label: document.getElementById('su-loto-cloud-text')?.textContent,
  diag: globalThis.SULotoIOSRestStatus?.diagnostics?.()
}));

if (restRequests < 3) throw new Error(`esperadas >=3 leituras REST no ciclo PWA, obtidas ${restRequests}`);
if (!finalState.lastSync || finalState.diag?.lastRefreshError) throw new Error(`estado final PWA inválido: ${JSON.stringify(finalState)}`);
if (/Conexão lenta/i.test(finalState.label || '')) throw new Error(`PWA terminou em conexão lenta: ${finalState.label}`);
if (initialDurationMs > 2500 || resumeDurationMs > 2500 || pageshowDurationMs > 2500) {
  throw new Error(`latência local do fast path acima do limite: initial=${initialDurationMs} resume=${resumeDurationMs} pageshow=${pageshowDurationMs}`);
}

await browser.close();
console.log(JSON.stringify({
  result: 'APROVADO',
  standalone,
  initialDurationMs,
  resumeDurationMs,
  pageshowDurationMs,
  restRequests,
  finalState: {
    state: finalState.state,
    label: finalState.label,
    lastSync: finalState.lastSync,
    lastRefreshReason: finalState.diag?.lastRefreshReason,
    lastRefreshDurationMs: finalState.diag?.lastRefreshDurationMs
  }
}, null, 2));
