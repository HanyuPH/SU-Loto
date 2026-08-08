import { webkit } from 'playwright';

const BASE = 'http://127.0.0.1:4173';
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1'
});
const page = await context.newPage();
await page.goto(`${BASE}/tests/ios-rest-fastpath-harness.html`);

await page.evaluate(async () => {
  await caches.open('su-loto-c2-v23-sync-v6');
  await caches.open('su-loto-c2-v23-sync-v7');
});

const supported = await page.evaluate(() => 'serviceWorker' in navigator);
if (!supported) throw new Error('WebKit QA sem suporte a Service Worker');

await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.register('/service-worker.js?build=sync-v8', {
    scope: '/',
    updateViaCache: 'none'
  });
  await registration.update();
  await navigator.serviceWorker.ready;
});

await page.waitForFunction(async () => {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return Boolean(registration?.active?.scriptURL?.includes('build=sync-v8'));
}, null, { timeout: 10000 });
await page.waitForTimeout(250);

const result = await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.getRegistration('/');
  const keys = await caches.keys();
  const response = await fetch('/ios-pwa-sync-coordinator.js?qa=sw-v8', { cache: 'no-store' });
  const text = await response.text();
  return {
    scriptURL: registration?.active?.scriptURL || '',
    keys,
    coordinatorPublished: response.ok && text.includes('protocol: "sync-v8"'),
    controller: navigator.serviceWorker.controller?.scriptURL || null
  };
});

if (!result.scriptURL.includes('build=sync-v8')) throw new Error(`worker ativo inesperado: ${result.scriptURL}`);
if (!result.keys.includes('su-loto-c2-v23-sync-v8')) throw new Error(`cache sync-v8 ausente: ${JSON.stringify(result.keys)}`);
if (result.keys.includes('su-loto-c2-v23-sync-v6') || result.keys.includes('su-loto-c2-v23-sync-v7')) throw new Error(`caches antigos não foram removidos: ${JSON.stringify(result.keys)}`);
if (!result.coordinatorPublished) throw new Error('coordenador sync-v8 não foi servido pelo PWA');

await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.getRegistration('/');
  await registration?.unregister();
});
await context.close();
await browser.close();
console.log(JSON.stringify({ result: 'APROVADO', ...result }, null, 2));
