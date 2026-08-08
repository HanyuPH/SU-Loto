import fs from 'node:fs';

const rest = fs.readFileSync('ios-rest-status-refresh.js', 'utf8');
const resume = fs.readFileSync('cloud-resume-refresh.js', 'utf8');
const bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');

const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

must(rest.includes('pageSize: "300"'), 'fast path deve solicitar até 300 documentos por página');
must(rest.includes('Authorization: `Bearer ${token}`'), 'fast path deve usar token Firebase sem expô-lo');
must(rest.includes('firestore.googleapis.com'), 'fast path deve usar endpoint REST oficial do Firestore');
must(rest.includes('firestore-rest-ios'), 'payload local deve identificar origem REST iOS');
must(rest.includes('pendingStatuses'), 'fast path deve preservar intenções locais ainda não confirmadas');
must(rest.includes('!remoteIds.has(id) && status !== "pendente"'), 'status local não-pendente sem documento remoto deve ser preservado');
must(rest.includes('su-loto-c2-last-server-sync-v1'), 'deve persistir instante da última leitura real do servidor');
must(!/setDoc|writeBatch|updateDoc|deleteDoc/.test(rest), 'fast path REST não deve escrever no Firestore');
must(!/method:\s*["'](?:POST|PATCH|DELETE)/.test(rest), 'fast path REST deve permanecer somente leitura');

must(resume.includes('globalThis.SULotoIOSRestStatus'), 'retomada deve detectar fast path iOS');
must(resume.includes('return iosRest.refreshNow'), 'retomada deve delegar status ao REST no iOS');
must(resume.includes('statusTransport'), 'diagnóstico da retomada deve informar transporte de status');

must(bootstrap.includes('./ios-rest-status-refresh.js?v=1'), 'bootstrap deve carregar fast path REST');
must(bootstrap.indexOf('./ios-rest-status-refresh.js?v=1') < bootstrap.indexOf('./cloud-resume-refresh.js?v=2'), 'fast path deve carregar antes da retomada');
must(sw.includes('su-loto-c2-v23-sync-v7'), 'Service Worker deve usar cache sync-v7');
must(sw.includes('./ios-rest-status-refresh.js'), 'Service Worker deve precachear fast path');

for (const forbidden of ['data/carteira-c2/games-001-050.json', 'data/carteira-c2/games-251-300.json']) {
  must(!rest.includes(forbidden), `fast path não deve referenciar arquivo canônico: ${forbidden}`);
}

console.log('QA estático do fast path REST iOS: APROVADO');
