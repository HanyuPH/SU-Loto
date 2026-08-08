import { chromium, webkit } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const syncSource = await readFile('ios-rest-operational-sync.js', 'utf8');
const officialSource = await readFile('official-results-live-refresh.js', 'utf8');

function testableSyncSource() {
  return syncSource
    .replace(/^import .*?;\n/gm, '')
    .replace(
      /const firebaseApp = getApps\(\)[\s\S]*?const auth = getAuth\(firebaseApp\);/,
      'const auth = globalThis.__mockAuth;'
    )
    .replace('const STATUS_POLL_MS = 2500;', 'const STATUS_POLL_MS = 120;')
    .replace('const FULL_POLL_MS = 12000;', 'const FULL_POLL_MS = 300;');
}

async function newOriginPage(browser) {
  const page = await browser.newPage();
  await page.route('https://su-loto.test/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="app"></main></body></html>'
  }));
  await page.goto('https://su-loto.test/');
  return page;
}

async function installMockCloud(page) {
  await page.evaluate(() => {
    const nums = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
    const now = '2026-08-08T12:00:00.000Z';
    const remote = {
      statuses: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [String(i + 1), i === 0 ? 'apostado' : 'pendente'])),
      contests: Array.from({ length: 9 }, (_, i) => ({
        number: 3756 - i,
        date: '2026-08-07',
        numbers: nums,
        source: 'https://caixa.test',
        notes: '',
        createdAt: now,
        updatedAt: now
      })),
      bets: {
        '3756': {
          contest: 3756,
          type: 'normal',
          specialName: '',
          status: 'ativo',
          gameIds: ['1'],
          unitPrice: 3.5,
          totalInvested: 3.5,
          createdAt: now,
          savedAt: now,
          updatedAt: now,
          concludedAt: '',
          releaseStatus: 'pendente'
        }
      },
      commits: [],
      failNextCommit: false
    };

    globalThis.__remote = remote;
    globalThis.SULotoFirestoreTransport = { ios: true, restOnly: true, protocol: 'sync-v9' };
    globalThis.SU_LOTO_GAMES = Array.from({ length: 300 }, (_, i) => ({ id: i + 1 }));
    globalThis.SU_LOTO_WALLET_MANIFEST = { source: { registeredWalletLogicalSha256: 'hash-test' } };
    globalThis.__mockAuth = {};
    globalThis.__authUser = { uid: 'user1', getIdToken: async () => 'token-test' };
    globalThis.onAuthStateChanged = (_auth, cb) => { globalThis.__authCb = cb; };
    globalThis.SULotoApp = { refreshFromStorage: () => { globalThis.__refreshes = (globalThis.__refreshes || 0) + 1; } };
    globalThis.SULotoSyncEvents = { EVENT_NAME: 'su:state-change' };

    let contests = [];
    globalThis.__setLocalContests = value => { contests = structuredClone(value); };
    globalThis.SULotoContests = {
      exportData: () => structuredClone(contests),
      importData: value => {
        contests = structuredClone(value);
        globalThis.__contestCount = contests.length;
        return true;
      }
    };

    const encode = value => {
      if (value === null || value === undefined) return { nullValue: null };
      if (typeof value === 'string') return { stringValue: value };
      if (typeof value === 'boolean') return { booleanValue: value };
      if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
      if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
      return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
    };
    const decode = value => {
      if (!value) return null;
      if ('nullValue' in value) return null;
      if ('stringValue' in value) return value.stringValue;
      if ('booleanValue' in value) return value.booleanValue;
      if ('integerValue' in value) return Number(value.integerValue);
      if ('doubleValue' in value) return Number(value.doubleValue);
      if ('timestampValue' in value) return value.timestampValue;
      if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
      if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
      return null;
    };
    const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

    globalThis.fetch = async (url, options = {}) => {
      const text = String(url);
      if (options.method === 'POST' && text.endsWith('/documents:commit')) {
        if (remote.failNextCommit) {
          remote.failNextCommit = false;
          return response({ error: { status: 'UNAVAILABLE', message: 'falha simulada' } }, 503);
        }
        const payload = JSON.parse(options.body);
        remote.commits.push(structuredClone(payload));
        for (const write of payload.writes || []) {
          if (write.delete) {
            const id = write.delete.split('/').pop();
            if (write.delete.includes('/contests/')) remote.contests = remote.contests.filter(row => String(row.number) !== id);
            continue;
          }
          const document = write.update;
          const path = document.name;
          const data = Object.fromEntries(Object.entries(document.fields || {}).map(([k, v]) => [k, decode(v)]));
          if (path.includes('/gameStatuses/')) remote.statuses[path.split('/').pop()] = data.status;
          else if (path.includes('/contests/')) {
            const number = Number(data.number ?? path.split('/').pop());
            remote.contests = remote.contests.filter(row => Number(row.number) !== number);
            remote.contests.push({ ...data, number });
          } else if (path.endsWith('/settings/suLotoContestBetsC2')) remote.bets = data.records || {};
        }
        return response({ writeResults: [] });
      }

      if (text.includes('/gameStatuses?')) {
        return response({ documents: Object.entries(remote.statuses).map(([id, status]) => ({
          name: `projects/su-mega/databases/(default)/documents/users/user1/suLoto/C2/gameStatuses/${id}`,
          fields: { status: encode(status) }
        })) });
      }
      if (text.includes('/contests?')) {
        return response({ documents: remote.contests.map(item => ({
          name: `projects/su-mega/databases/(default)/documents/users/user1/suLoto/C2/contests/${item.number}`,
          fields: Object.fromEntries(Object.entries(item).map(([k, v]) => [k, encode(v)]))
        })) });
      }
      if (text.endsWith('/settings/suLotoContestBetsC2')) {
        return response({ name: 'bets', fields: { records: encode(remote.bets) } });
      }
      return response({ error: { status: 'NOT_FOUND' } }, 404);
    };
  });
}

async function testSync(browserType, name) {
  const browser = await browserType.launch({ headless: true });
  const page = await newOriginPage(browser);
  await installMockCloud(page);
  const states = [];
  page.on('console', message => {
    if (message.type() === 'error') console.log(`${name} console error: ${message.text()}`);
  });
  await page.exposeFunction('__captureState', detail => states.push(detail));
  await page.evaluate(() => window.addEventListener('su:loto-rest-sync-state', event => globalThis.__captureState(event.detail)));
  await page.addScriptTag({ content: `const onAuthStateChanged = globalThis.onAuthStateChanged;\n${testableSyncSource()}` });
  await page.evaluate(() => globalThis.__authCb(globalThis.__authUser));

  await page.waitForFunction(() => {
    const d = globalThis.SULotoIOSRestOperationalSync?.diagnostics?.();
    return d?.ready?.statuses && d?.ready?.contests && d?.ready?.contestBets;
  }, null, { timeout: 10000 });

  let initial = await page.evaluate(() => ({
    statuses: JSON.parse(localStorage.getItem('su-loto-c2-status-v4')).statuses,
    contestCount: globalThis.__contestCount,
    diagnostics: globalThis.SULotoIOSRestOperationalSync.diagnostics()
  }));
  assert.equal(initial.statuses['1'], 'apostado', `${name}: status inicial remoto`);
  assert.equal(initial.contestCount, 9, `${name}: nove concursos iniciais`);
  assert.equal(initial.diagnostics.hotfix, 'direct-status-poll-3', `${name}: hotfix ativo`);

  // PWA -> remoto: gravação normal, sem syncMeta.
  await page.evaluate(() => {
    const payload = JSON.parse(localStorage.getItem('su-loto-c2-status-v4'));
    payload.statuses['2'] = 'apostado';
    localStorage.setItem('su-loto-c2-status-v4', JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('su:state-change', {
      detail: { domain: 'statuses', source: 'ui', detail: { id: '2', status: 'apostado' } }
    }));
  });
  await page.waitForFunction(() => globalThis.__remote.statuses['2'] === 'apostado', null, { timeout: 5000 });
  let diagnostics = await page.evaluate(() => globalThis.SULotoIOSRestOperationalSync.diagnostics());
  assert.deepEqual(diagnostics.pendingStatuses, {}, `${name}: fila limpa após write`);

  // Safari -> PWA: altera remoto SEM qualquer syncMeta. O polling direto deve captar.
  await page.evaluate(() => { globalThis.__remote.statuses['3'] = 'apostado'; });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('su-loto-c2-status-v4')).statuses['3'] === 'apostado', null, { timeout: 2500 });

  // Falha real de gravação preserva pendência; syncNow recupera sem perder estado.
  await page.evaluate(() => {
    globalThis.__remote.failNextCommit = true;
    const payload = JSON.parse(localStorage.getItem('su-loto-c2-status-v4'));
    payload.statuses['4'] = 'apostado';
    localStorage.setItem('su-loto-c2-status-v4', JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('su:state-change', {
      detail: { domain: 'statuses', source: 'ui', detail: { id: '4', status: 'apostado' } }
    }));
  });
  await page.waitForFunction(() => globalThis.SULotoIOSRestOperationalSync.diagnostics().lastError?.domain === 'statuses', null, { timeout: 5000 });
  diagnostics = await page.evaluate(() => globalThis.SULotoIOSRestOperationalSync.diagnostics());
  assert.equal(diagnostics.pendingStatuses['4'], 'apostado', `${name}: falha preserva pending`);
  const recovery = await page.evaluate(() => globalThis.SULotoIOSRestOperationalSync.syncNow());
  assert.equal(recovery.ok, true, `${name}: recuperação manual`);
  await page.waitForFunction(() => globalThis.__remote.statuses['4'] === 'apostado', null, { timeout: 5000 });
  diagnostics = await page.evaluate(() => globalThis.SULotoIOSRestOperationalSync.diagnostics());
  assert.deepEqual(diagnostics.pendingStatuses, {}, `${name}: pending zerado após recuperação`);

  // Pull periódico de concursos é somente leitura: remoto novo chega sem commit automático.
  const commitsBeforeRemoteContest = await page.evaluate(() => globalThis.__remote.commits.length);
  await page.evaluate(() => {
    globalThis.__remote.contests.push({
      number: 3757,
      date: '2026-08-09',
      numbers: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
      source: 'https://caixa.test/3757',
      notes: '',
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T00:00:00.000Z'
    });
  });
  await page.waitForFunction(() => globalThis.__contestCount === 10, null, { timeout: 3000 });
  const commitsAfterRemoteContest = await page.evaluate(() => globalThis.__remote.commits.length);
  assert.equal(commitsAfterRemoteContest, commitsBeforeRemoteContest, `${name}: pull de concurso não deve regravar`);

  // Mudança local de concurso deve gravar por evento explícito.
  await page.evaluate(() => {
    const current = globalThis.SULotoContests.exportData();
    current.push({
      number: 3758,
      date: '2026-08-10',
      numbers: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
      source: 'local', notes: '',
      createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z'
    });
    globalThis.__setLocalContests(current);
    window.dispatchEvent(new CustomEvent('su:state-change', { detail: { domain: 'contests', source: 'ui' } }));
  });
  await page.waitForFunction(() => globalThis.__remote.contests.some(row => Number(row.number) === 3758), null, { timeout: 5000 });

  // Mudança local de apostas por concurso também deve gravar explicitamente.
  await page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem('su-loto-c2-contest-bets-v1') || '{}');
    records['3758'] = {
      contest: 3758, type: 'normal', specialName: '', status: 'ativo', gameIds: ['2','4'],
      unitPrice: 3.5, totalInvested: 7,
      createdAt: new Date().toISOString(), savedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      concludedAt: '', releaseStatus: 'pendente'
    };
    localStorage.setItem('su-loto-c2-contest-bets-v1', JSON.stringify(records));
    window.dispatchEvent(new CustomEvent('su:state-change', { detail: { domain: 'contestBets', source: 'ui' } }));
  });
  await page.waitForFunction(() => Boolean(globalThis.__remote.bets['3758']), null, { timeout: 5000 });

  const final = await page.evaluate(() => ({
    diagnostics: globalThis.SULotoIOSRestOperationalSync.diagnostics(),
    names: globalThis.__remote.commits.flatMap(commit => (commit.writes || []).map(write => write.update?.name || write.delete || ''))
  }));
  assert.equal(final.names.some(nameValue => String(nameValue).includes('/syncMeta/state')), false, `${name}: nenhum commit syncMeta`);
  assert.ok(final.diagnostics.lastStatusPollAt, `${name}: polling de status executou`);
  assert.equal(final.diagnostics.contestsDirty, false, `${name}: concursos sem dirty final`);
  assert.equal(final.diagnostics.contestBetsDirty, false, `${name}: apostas sem dirty final`);

  await browser.close();
  console.log(`${name}: direct-poll Safari<->PWA aprovado`);
}

async function testOfficial(browserType, name) {
  const browser = await browserType.launch({ headless: true });
  const page = await newOriginPage(browser);
  await page.setContent(`<!doctype html><html><body>
    <button id="official-refresh">Atualizar</button>
    <input id="official-contest-number">
    <button id="official-search-specific">Buscar</button>
    <div id="official-sync-state"></div>
    <strong id="official-sync-title"></strong>
    <p id="official-sync-message"></p>
    <div id="official-result-preview"><strong id="official-preview-title">Concurso 3755</strong></div>
    <span id="official-update-dot"></span>
  </body></html>`);
  await page.evaluate(() => {
    globalThis.SULotoContests = { exportData: () => [] };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ numero: 3756 }) });
    document.getElementById('official-search-specific').addEventListener('click', () => {
      setTimeout(() => {
        document.getElementById('official-preview-title').textContent = `Concurso ${document.getElementById('official-contest-number').value}`;
      }, 15);
    });
  });
  await page.addScriptTag({ content: officialSource });
  await page.waitForFunction(() => document.getElementById('official-preview-title')?.textContent.includes('3756'), null, { timeout: 5000 });
  const result = await page.evaluate(() => globalThis.SULotoOfficialLiveRefresh.diagnostics());
  assert.equal(result.lastRemoteNumber, 3756, `${name}: resultado oficial 3756`);
  await browser.close();
}

for (const [browserType, name] of [[chromium, 'Chromium'], [webkit, 'WebKit']]) {
  await testSync(browserType, name);
  await testOfficial(browserType, name);
}

console.log('sync-v9 direct-poll browser gates: OK');
