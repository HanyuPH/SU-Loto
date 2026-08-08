import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const read = file => readFile(file, 'utf8');
const [bootstrap, transport, rest, shell, sw, official] = await Promise.all([
  read('bootstrap.js'), read('firebase-ios-transport.js'), read('ios-rest-operational-sync.js'),
  read('ios-cloud-shell.js'), read('service-worker.js'), read('official-results-live-refresh.js')
]);
assert.match(bootstrap, /SERVICE_WORKER_BUILD = "sync-v9"/);
assert.match(bootstrap, /ios-rest-operational-sync\.js\?v=1/);
assert.match(bootstrap, /ios-cloud-shell\.js\?v=1/);
assert.match(bootstrap, /official-results-live-refresh\.js\?v=1/);
assert.match(transport, /restOnly: ios/);
assert.doesNotMatch(transport, /firebase-firestore\.js/);
assert.match(rest, /documents:commit/);
assert.match(rest, /gameStatuses/);
assert.match(rest, /\/contests/);
assert.match(rest, /suLotoContestBetsC2/);
assert.match(rest, /POLL_MS = 2000/);
assert.match(rest, /statusRevision/);
assert.match(rest, /contestsRevision/);
assert.match(rest, /contestBetsRevision/);
assert.match(rest, /Falha ao salvar jogo/);
assert.match(shell, /firebase-auth\.js/);
assert.doesNotMatch(shell, /firebase-firestore\.js/);
assert.match(shell, /REST sync-v9/);
assert.match(sw, /su-loto-c2-v23-sync-v9/);
assert.match(sw, /ios-rest-operational-sync\.js/);
assert.match(sw, /ios-cloud-shell\.js/);
assert.match(official, /servicebus2\.caixa\.gov\.br\/portaldeloterias\/api\/lotofacil/);
console.log('sync-v9 static gates: OK');
