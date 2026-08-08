import { webkit } from 'playwright';

const BASE = 'http://127.0.0.1:4173';
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1',
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
await page.goto(`${BASE}/tests/ios-rest-fastpath-harness.html`);

await page.evaluate(() => {
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  const realMatchMedia = globalThis.matchMedia.bind(globalThis);
  globalThis.matchMedia = query => query === '(display-mode: standalone)'
    ? { matches: true, media: query, addEventListener(){}, removeEventListener(){} }
    : realMatchMedia(query);

  const panel = document.createElement('div');
  panel.id = 'su-loto-cloud-panel';
  panel.innerHTML = `<div class="su-loto-card"><div class="su-eco-body"><div class="su-loto-grid"><article><strong id="su-loto-state">Conexão lenta • sincronizando…</strong></article><article><strong id="su-loto-last">Nunca</strong></article></div><div class="su-loto-actions"><button id="su-loto-sync-now">Sincronizar agora</button></div></div></div>`;
  document.body.appendChild(panel);

  globalThis.SULotoFirestoreTransport = { ios: true, mode: 'qa-ios' };
  globalThis.__sequence = [];
  globalThis.__refreshCalls = 0;
  globalThis.SULotoIOSRestStatus = {
    active: true,
    refreshNow: async reason => {
      globalThis.__sequence.push(`refresh:${reason}`);
      globalThis.__refreshCalls += 1;
      const at = new Date().toISOString();
      localStorage.setItem('su-loto-c2-last-server-sync-v1', at);
      window.dispatchEvent(new CustomEvent('su:loto-ios-rest-status-refresh', { detail: { ok: true, reason, at, durationMs: 12 } }));
      return true;
    }
  };

  document.getElementById('su-loto-sync-now').onclick = async () => {
    globalThis.__sequence.push('upload');
    const label = document.getElementById('su-loto-cloud-text');
    label.textContent = 'Conectando à nuvem…';
    document.getElementById('su-loto-cloud-status').dataset.state = 'saving';
  };
});

await page.evaluate(async () => { await import('/ios-pwa-sync-coordinator.js?qa=v8'); });
await page.waitForFunction(() => globalThis.SULotoIOSPWASync?.diagnostics?.().manualWrapped === true);

await page.evaluate(() => {
  const at = new Date().toISOString();
  localStorage.setItem('su-loto-c2-last-server-sync-v1', at);
  window.dispatchEvent(new CustomEvent('su:loto-ios-rest-status-refresh', { detail: { ok: true, reason: 'qa-initial', at, durationMs: 10 } }));
});
await page.waitForTimeout(50);

let state = await page.evaluate(() => ({
  standalone: globalThis.SULotoIOSPWASync?.standalone,
  protocol: globalThis.SULotoIOSPWASync?.protocol,
  label: document.getElementById('su-loto-cloud-text')?.textContent,
  buttonState: document.getElementById('su-loto-cloud-status')?.dataset.state,
  last: document.getElementById('su-loto-last')?.textContent,
  stateCopy: document.getElementById('su-loto-state')?.textContent,
  protocolLabel: document.getElementById('su-loto-ios-sync-protocol')?.textContent
}));
if (!state.standalone || state.protocol !== 'sync-v8') throw new Error(`standalone/protocolo inválido: ${JSON.stringify(state)}`);
if (!/Sincronizado/i.test(state.label || '') || state.buttonState !== 'synced') throw new Error(`UI não ficou saudável: ${JSON.stringify(state)}`);
if (!state.last || state.last === 'Nunca') throw new Error('Última sincronização continuou Nunca');
if (!/Aplicativo iPhone.*sync-v8/i.test(state.protocolLabel || '')) throw new Error(`marcador visual ausente: ${state.protocolLabel}`);

// Simula o núcleo SDK lento tentando voltar a exibir o estado antigo.
await page.evaluate(() => {
  document.getElementById('su-loto-cloud-text').textContent = 'Conexão lenta • sincronizando…';
  document.getElementById('su-loto-cloud-status').dataset.state = 'saving';
  document.getElementById('su-loto-last').textContent = 'Nunca';
  document.getElementById('su-loto-state').textContent = 'Conexão lenta • sincronizando…';
});
await page.waitForTimeout(80);
state = await page.evaluate(() => ({
  label: document.getElementById('su-loto-cloud-text')?.textContent,
  buttonState: document.getElementById('su-loto-cloud-status')?.dataset.state,
  last: document.getElementById('su-loto-last')?.textContent,
  stateCopy: document.getElementById('su-loto-state')?.textContent
}));
if (!/Sincronizado/i.test(state.label || '') || state.buttonState !== 'synced' || state.last === 'Nunca') throw new Error(`núcleo lento conseguiu desfazer saúde REST: ${JSON.stringify(state)}`);

// Sincronização manual precisa baixar antes de executar o upload legado.
await page.evaluate(() => { globalThis.__sequence = []; });
await page.click('#su-loto-sync-now');
await page.waitForTimeout(50);
const sequence = await page.evaluate(() => globalThis.__sequence.slice());
if (sequence.length < 2 || !sequence[0].startsWith('refresh:manual-preflight') || sequence[1] !== 'upload') throw new Error(`ordem manual insegura: ${JSON.stringify(sequence)}`);

// PWA: se o primeiro refresh não avançar após a retomada, o fallback deve tentar novamente.
await page.evaluate(() => {
  localStorage.removeItem('su-loto-c2-last-server-sync-v1');
  globalThis.__refreshCalls = 0;
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
});
await page.waitForTimeout(2800);
const fallbackCalls = await page.evaluate(() => globalThis.__refreshCalls);
if (fallbackCalls < 1) throw new Error('fallback de retomada do PWA não executou');

await context.close();
await browser.close();
console.log(JSON.stringify({ result: 'APROVADO', standalone: true, sequence, fallbackCalls, state }, null, 2));
