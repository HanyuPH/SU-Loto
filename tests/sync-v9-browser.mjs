import { chromium, webkit } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const syncSource = await readFile('ios-rest-operational-sync.js', 'utf8');
const officialSource = await readFile('official-results-live-refresh.js', 'utf8');

function testableSyncSource() {
  return syncSource
    .replace(/^import .*?;\n/gm, '')
    .replace(
      /const firebaseApp = getApps\(\)\.find\(item => item\.name === APP_INSTANCE\);\nif \(!firebaseApp\) throw new Error\([^\n]+\);\nconst auth = getAuth\(firebaseApp\);/,
      'const auth = globalThis.__mockAuth;'
    );
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
    const remote = {
      statuses: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [String(i + 1), i === 0 ? 'apostado' : 'pendente'])),
      contests: Array.from({ length: 8 }, (_, i) => ({
        number: 3755 - i,
        date: '2026-08-01',
        numbers: nums,
        source: 'https://caixa.test',
        notes: '',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`
      })),
      bets: {
        '3755': {
          contest: 3755,
          type: 'normal',
          specialName: '',
          status: 'ativo',
          gameIds: ['1'],
          unitPrice: 3.5,
          totalInvested: 3.5,
          createdAt: '2026-08-01T00:00:00.000Z',
          savedAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          concludedAt: '',
          releaseStatus: 'pendente'
        }
      },
      meta: { statusRevision: 's1', contestsRevision: 'c1', contestBetsRevision: 'b1' },
      commits: []
    };

    globalThis.__remote = remote;
    globalThis.SULotoFirestoreTransport = { ios: true, restOnly: true };
    globalThis.SU_LOTO_GAMES = Array.from({ length: 300 }, (_, i) => ({ id: i + 1 }));
    globalThis.SU_LOTO_WALLET_MANIFEST = { source: { registeredWalletLogicalSha256: 'hash-test' } };
    globalThis.__mockAuth = {};
    globalThis.__authUser = { uid: 'user1', getIdToken: async () => 'token-test' };
    globalThis.onAuthStateChanged = (_auth, cb) => { globalThis.__authCb = cb; };
    globalThis.SULotoApp = { refreshFromStorage: () => { globalThis.__refreshes = (globalThis.__refreshes || 0) + 1; } };

    let contests = [];
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
        const payload = JSON.parse(options.body);
        remote.commits.push(payload);
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
          else if (path.endsWith('/syncMeta/state')) Object.assign(remote.meta, data);
          else if (path.includes('/contests/')) {
            remote.contests = remote.contests.filter(row => Number(row.number) !== Number(data.number));
            remote.contests.push(data);
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
      if (text.endsWith('/syncMeta/state')) {
        return response({ name: 'meta', fields: Object.fromEntries(Object.entries(remote.meta).map(([k, v]) => [k, encode(v)])) });
      }
      return response({ error: { status: 'NOT_FOUND' } }, 404);
    };
  });
}

async function testSync(browserType, name) {
  const browser = await browserType.launch({ headless: true });
  const page = await newOriginPage(browser);
  await installMockCloud(page);
  await page.addScriptTag({ content: `const onAuthStateChanged = globalThis.onAuthStateChanged;\n${testableSyncSource()}` });
  await page.evaluate(() => globalThis.__authCb(globalThis.__authUser));

  await page.waitForFunction(() => {
    const d = globalThis.SULotoIOSRestOperationalSync?.diagnostics?.();
    return d?.ready?.statuses && d?.ready?.contests && d?.ready?.contestBets;
  }, null, { timeout: 10000 });

  const initial = await page.evaluate(() => ({
    statuses: JSON.parse(localStorage.getItem('su-loto-c2-status-v4')).statuses,
    contestCount: globalThis.__contestCount,
    diagnostics: globalThis.SULotoIOSRestOperationalSync.diagnostics()
  }));
  assert.equal(initial.statuses['1'], 'apostado', `${name}: status remoto inicial`);
  assert.equal(initial.contestCount, 8, `${name}: oito concursos iniciais`);
  assert.ok(initial.diagnostics.lastSync, `${name}: última sincronização inicial`);

  await page.evaluate(() => {
    const payload = JSON.parse(localStorage.getItem('su-loto-c2-status-v4'));
    payload.statuses['2'] = 'apostado';
    localStorage.setItem('su-loto-c2-status-v4', JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('su:state-change', {
      detail: { domain: 'statuses', source: 'ui', detail: { id: '2', status: 'apostado' } }
    }));
  });
  await page.waitForFunction(() => globalThis.__remote.statuses['2'] === 'apostado', null, { timeout: 5000 });
  const afterWrite = await page.evaluate(() => globalThis.SULotoIOSRestOperationalSync.diagnostics());
  assert.deepEqual(afterWrite.pendingStatuses, {}, `${name}: fila local limpa após gravação REST`);

  await page.evaluate(() => {
    globalThis.__remote.statuses['3'] = 'apostado';
    globalThis.__remote.meta.statusRevision = 'remote-s2';
  });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('su-loto-c2-status-v4')).statuses['3'] === 'apostado', null, { timeout: 6000 });

  await page.evaluate(() => {
    globalThis.__remote.contests.push({
      number: 3756,
      date: '2026-08-07',
      numbers: [2,3,5,6,9,10,11,13,14,15,16,19,20,21,22],
      source: 'https://caixa.test/3756',
      notes: '',
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z'
    });
    globalThis.__remote.meta.contestsRevision = 'remote-c2';
  });
  await page.waitForFunction(() => globalThis.__contestCount === 9, null, { timeout: 6000 });

  const final = await page.evaluate(() => globalThis.SULotoIOSRestOperationalSync.diagnostics());
  assert.equal(final.lastError, null, `${name}: sem erro final`);
  assert.ok(final.lastSync, `${name}: última sincronização final`);
  await browser.close();
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
  const result = await page.evaluate(() => ({
    title: document.getElementById('official-sync-title').textContent,
    diagnostics: globalThis.SULotoOfficialLiveRefresh.diagnostics()
  }));
  assert.match(result.title, /3756/, `${name}: interface promoveu o concurso 3756`);
  assert.equal(result.diagnostics.lastRemoteNumber, 3756, `${name}: consulta direta encontrou 3756`);
  await browser.close();
}

for (const [browserType, name] of [[chromium, 'Chromium'], [webkit, 'WebKit']]) {
  await testSync(browserType, name);
  await testOfficial(browserType, name);
  console.log(`${name}: sync-v9 e resultado 3756 aprovados`);
}
