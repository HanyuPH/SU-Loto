import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const read = file => readFile(file, 'utf8');
const [bootstrap, transport, rest, shell, sw, official, banner] = await Promise.all([
  read('bootstrap.js'), read('firebase-ios-transport.js'), read('ios-rest-operational-sync.js'),
  read('ios-cloud-shell.js'), read('service-worker.js'), read('official-results-live-refresh.js'),
  read('beta-banner.js')
]);

assert.match(bootstrap, /SERVICE_WORKER_BUILD = "sync-v9"/);
assert.match(bootstrap, /ios-rest-operational-sync\.js\?v=1/);
assert.match(bootstrap, /ios-cloud-shell\.js\?v=1/);
assert.match(bootstrap, /official-results-live-refresh\.js\?v=1/);
assert.match(transport, /restOnly: ios/);
assert.doesNotMatch(transport, /firebase-firestore\.js/);

assert.match(rest, /firestoreBase\(\)\}:commit/);
assert.match(rest, /gameStatuses/);
assert.match(rest, /\/contests/);
assert.match(rest, /suLotoContestBetsC2/);
assert.match(rest, /STATUS_POLL_MS = 2500/);
assert.match(rest, /FULL_POLL_MS = 12000/);
assert.match(rest, /hotfix: "direct-status-poll-3"/);
assert.match(rest, /setInterval\(\(\) => \{ void pollStatuses\(\); \}, STATUS_POLL_MS\)/);
assert.match(rest, /await commit\(writes\);\n  confirmPending/);
assert.doesNotMatch(rest, /syncMeta\/state/);
assert.doesNotMatch(rest, /statusRevision/);
assert.doesNotMatch(rest, /contestsRevision/);
assert.doesNotMatch(rest, /contestBetsRevision/);
assert.match(rest, /Falha ao salvar jogo/);
assert.match(rest, /CONTEST_DIRTY_KEY/);
assert.match(rest, /BETS_DIRTY_KEY/);

assert.doesNotMatch(banner, /ios-safari-pwa-catchup/);
assert.match(shell, /firebase-auth\.js/);
assert.doesNotMatch(shell, /firebase-firestore\.js/);
assert.match(sw, /su-loto-c2-v23-sync-v9/);
assert.match(sw, /ios-rest-operational-sync\.js/);
assert.match(sw, /ios-cloud-shell\.js/);
assert.match(official, /servicebus2\.caixa\.gov\.br\/portaldeloterias\/api\/lotofacil/);

console.log('sync-v9 direct-poll static gates: OK');
