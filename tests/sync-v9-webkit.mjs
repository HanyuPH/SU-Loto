import { chromium, webkit } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile('ios-rest-operational-sync.js', 'utf8');
const officialSource = await readFile('official-results-live-refresh.js', 'utf8');

function transformedSyncSource() {
  return source
    .replace(/^import .*?;\n/gm, '')
    .replace(/const firebaseApp = getApps\(\)\.find\(item => item\.name === APP_INSTANCE\);\nif \(!firebaseApp\) throw new Error\([^\n]+\);\nconst auth = getAuth\(firebaseApp\);/, 'const auth = globalThis.__mockAuth;');
}

async function run(browserType, name) {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body><div id="host"></div></body></html>');
  await page.evaluate(() => {
    const remote = {
      statuses: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [String(i + 1), i === 0 ? 'apostado' : 'pendente'])),
      contests: Array.from({ length: 8 }, (_, i) => ({ number: 3755 - i, date: '2026-08-01', numbers: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], source: 'https://caixa.test', notes: '', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: `2026-08-0${Math.min(8, i + 1)}T00:00:00.000Z` })),
      bets: { '3755': { contest: 3755, type: 'normal', specialName: '', status: 'ativo', gameIds: ['1'], unitPrice: 3.5, totalInvested: 3.5, createdAt: '2026-08-01T00:00:00.000Z', savedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', concludedAt: '', releaseStatus: 'pendente' } },
      meta: { statusRevision: 's1', contestsRevision: 'c1', contestBetsRevision: 'b1' },
      commits: []
    };
    globalThis.__remote = remote;
    globalThis.SULotoFirestoreTransport = { ios: true, restOnly: true };
    globalThis.SU_LOTO_GAMES = Array.from({ length: 300 }, (_, i) => ({ id: i + 1 }));
    globalThis.SU_LOTO_WALLET_MANIFEST = { source: { registeredWalletLogicalSha256: 'hash' } };
    globalThis.__mockAuth = {};
    globalThis.__authUser = { uid: 'user1', getIdToken: async () => 'token' };
    globalThis.onAuthStateChanged = (_auth, cb) => { globalThis.__authCb = cb; };
    globalThis.SULotoApp = { refreshFromStorage: () => { globalThis.__refreshes = (globalThis.__refreshes || 0) + 1; } };
    let contests = [];
    globalThis.SULotoContests = {
      exportData: () => contests,
      importData: value => { contests = structuredClone(value); globalThis.__contestCount = contests.length; return true; }
    };
    globalThis.fetch = async (url, options = {}) => {
      const text = String(url);
      const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
      if (options.method === 'POST' && text.endsWith('/documents:commit')) {
        const body = JSON.parse(options.body);
        remote.commits.push(body);
        for (const write of body.writes || []) {
          if (write.delete) {
            const id = write.delete.split('/').pop();
            if (write.delete.includes('/contests/')) remote.contests = remote.contests.filter(item => String(item.number) !== id);
            continue;
          }
          const doc = write.update;
          const path = doc.name;
          const fv = v => v?.stringValue ?? (v?.integerValue !== undefined ? Number(v.integerValue) : v?.doubleValue ?? v?.booleanValue ?? null);
          if (path.includes('/gameStatuses/')) remote.statuses[path.split('/').pop()] = fv(doc.fields.status);
          if (path.endsWith('/syncMeta/state')) for (const [key, value] of Object.entries(doc.fields || {})) remote.meta[key] = fv(value);
          if (path.includes('/contests/')) {
            const fromValue = value => {
              if (!value) return null;
              if (value.stringValue !== undefined) return value.stringValue;
              if (value.integerValue !== undefined) return Number(value.integerValue);
              if (value.doubleValue !== undefined) return Number(value.doubleValue);
              if (value.booleanValue !== undefined) return value.booleanValue;
              if (value.arrayValue) return (value.arrayValue.values || []).map(fromValue);
              if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v]) => [k, fromValue(v)]));
              return null;
            };
            const item = Object.fromEntries(Object.entries(doc.fields || {}).map(([k,v]) => [k, fromValue(v)]));
            remote.contests = remote.contests.filter(row => Number(row.number) !== Number(item.number));
            remote.contests.push(item);
          }
          if (path.endsWith('/settings/suLotoContestBetsC2')) {
            const fromValue = value => {
              if (!value) return null;
              if (value.stringValue !== undefined) return value.stringValue;
              if (value.integerValue !== undefined) return Number(value.integerValue);
              if (value.doubleValue !== undefined) return Number(value.doubleValue);
              if (value.booleanValue !== undefined) return value.booleanValue;
              if (value.arrayValue) return (value.arrayValue.values || []).map(fromValue);
              if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v]) => [k, fromValue(v)]));
              return null;
            };
            remote.bets = fromValue(doc.fields.records) || {};
          }
        }
        return jsonResponse({ writeResults: [] });
      }
      if (text.includes('/gameStatuses?')) return jsonResponse({ documents: Object.entries(remote.statuses).map(([id, status]) => ({ name: `projects/su-mega/databases/(default)/documents/users/user1/suLoto/C2/gameStatuses/${id}`, fields: { status: { stringValue: status } } })) });
      if (text.includes('/contests?')) {
        const toValue = value => typeof value === 'string' ? { stringValue: value } : typeof value === 'number' ? (Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }) : Array.isArray(value) ? { arrayValue: { values: value.map(toValue) } } : { stringValue: String(value ?? '') };
        return jsonResponse({ documents: remote.contests.map(item => ({ name: `projects/su-mega/databases/(default)/documents/users/user1/suLoto/C2/contests/${item.number}`, fields: Object.fromEntries(Object.entries(item).map(([k,v]) => [k, toValue(v)])) })) });
      }
      if (text.endsWith('/settings/suLotoContestBetsC2')) {
        const toValue = value => value === null || value === undefined ? { nullValue: null } : typeof value === 'string' ? { stringValue: value } : typeof value === 'number' ? (Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }) : typeof value === 'boolean' ? { booleanValue: value } : Array.isArray(value) ? { arrayValue: { values: value.map(toValue) } } : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k, toValue(v)])) } };
        return jsonResponse({ name: 'bets', fields: { records: toValue(remote.bets) } });
      }
      if (text.endsWith('/syncMeta/state')) {
        const fields = {};
        for (const [key, value] of Object.entries(remote.meta)) if (value != null) fields[key] = { stringValue: String(value) };
        return jsonResponse({ name: 'meta', fields });
      }
      return jsonResponse({ error: { status: 'NOT_FOUND' } }, 404);
    };
  });
  const syncCode = `const onAuthStateChanged = globalThis.onAuthStateChanged;\n${transformedSyncSource()}`;
  await page.addScriptTag({ content: syncCode });
  await page.evaluate(() => globalThis.__authCb(globalThis.__authUser));
  await page.waitForFunction(() => globalThis.SULotoIOSRestOperationalSync?.diagnostics?.().ready?.statuses && globalThis.SULotoIOSRestOperationalSync?.diagnostics?.().ready?.contests, null, { timeout: 10000 });
  const initial = await page.evaluate(() => ({ statuses: JSON.parse(localStorage.getItem('su-loto-c2-status-v4')).statuses, contests: globalThis.__contestCount, diag: globalThis.SULotoIOSRestOperationalSync.diagnostics() }));
  assert.equal(initial.statuses['1'], 'apostado', `${name}: status remoto inicial`);
  assert.equal(initial.contests, 8, `${name}: 8 concursos`);
  assert.equal(initial.diag.ready.contestBets, true, `${name}: apostas por concurso prontas`);
  await page.evaluate(() => {
    const payload = JSON.parse(localStorage.getItem('su-loto-c2-status-v4'));
    payload.statuses['2'] = 'apostado';
    localStorage.setItem('su-loto-c2-status-v4', JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('su:state-change', { detail: { domain: 'statuses', source: 'ui', detail: { id: '2', status: 'apostado' } } }));
  });
  await page.waitForFunction(() => globalThis.__remote.statuses['2'] === 'apostado', null, { timeout: 5000 });
  const writeCheck = await page.evaluate(() => ({ remote: globalThis.__remote.statuses['2'], pending: globalThis.SULotoIOSRestOperationalSync.diagnostics().pendingStatuses }));
  assert.equal(writeCheck.remote, 'apostado', `${name}: escrita REST status`);
  assert.deepEqual(writeCheck.pending, {}, `${name}: pendência confirmada`);
  await page.evaluate(() => { globalThis.__remote.statuses['3'] = 'apostado'; globalThis.__remote.meta.statusRevision = 'remote-s2'; });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('su-loto-c2-status-v4')).statuses['3'] === 'apostado', null, { timeout: 6000 });
  await page.evaluate(() => {
    globalThis.__remote.contests.push({ number: 3756, date: '2026-08-07', numbers: [2,3,5,6,9,10,11,13,14,15,16,19,20,21,22], source: 'https://caixa.test/3756', notes: '', createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z' });
    globalThis.__remote.meta.contestsRevision = 'remote-c2';
  });
  await page.waitForFunction(() => globalThis.__contestCount === 9, null, { timeout: 6000 });
  const finalDiag = await page.evaluate(() => globalThis.SULotoIOSRestOperationalSync.diagnostics());
  assert.equal(finalDiag.lastError, null, `${name}: sem erro final`);
  assert.ok(finalDiag.lastSync, `${name}: última sincronização preenchida`);
  await browser.close();
}

async function testOfficial(browserType, name) {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><body><button id="official-refresh">Atualizar</button><input id="official-contest-number"><button id="official-search-specific">Buscar</button><div id="official-sync-state"></div><strong id="official-sync-title"></strong><p id="official-sync-message"></p><div id="official-result-preview"><strong id="official-preview-title">Concurso 3755</strong></div><span id="official-update-dot"></span></body></html>`);
  await page.evaluate(() => {
    globalThis.SULotoContests = { exportData: () => [] };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ numero: 3756 }) });
    document.getElementById('official-search-specific').addEventListener('click', () => { setTimeout(() => { document.getElementById('official-preview-title').textContent = `Concurso ${document.getElementById('official-contest-number').value}`; }, 15); });
  });
  await page.addScriptTag({ content: officialSource });
  await page.waitForFunction(() => document.getElementById('official-preview-title').textContent.includes('3756'), null, { timeout: 5000 });
  const state = await page.evaluate(() => ({ title: document.getElementById('official-sync-title').textContent, diag: globalThis.SULotoOfficialLiveRefresh.diagnostics() }));
  assert.match(state.title, /3756/, `${name}: resultado 3756`);
  assert.equal(state.diag.lastRemoteNumber, 3756, `${name}: diagnóstico 3756`);
  await browser.close();
}

for (const [type, name] of [[chromium, 'Chromium'], [webkit, 'WebKit']]) {
  await run(type, name);
  await testOfficial(type, name);
  console.log(`${name}: sync-v9 + resultado oficial OK`);
}
