import fs from "node:fs";
import assert from "node:assert/strict";

const transport = fs.readFileSync("firebase-ios-transport.js", "utf8");
const bootstrap = fs.readFileSync("bootstrap.js", "utf8");
const cloud = fs.readFileSync("cloud-sync.js", "utf8");
const resume = fs.readFileSync("cloud-resume-refresh.js", "utf8");
const sw = fs.readFileSync("service-worker.js", "utf8");

assert.ok(transport.includes("function isIOSWebKit()"), "deve limitar o modo resiliente ao iOS/iPadOS");
assert.ok(transport.includes("memoryLocalCache"), "iOS deve evitar coordenação IndexedDB persistente do Firestore");
assert.ok(transport.includes("experimentalForceLongPolling: true"), "iOS deve forçar long-polling");
assert.ok(transport.includes("experimentalLongPollingOptions: { timeoutSeconds: 15 }"), "long-polling deve possuir timeout controlado");
assert.ok(transport.includes('transportMode = "ios-force-long-polling-memory-cache"'), "modo iOS deve ser diagnosticável");
assert.ok(!transport.includes("data/carteira-c2"), "transporte não pode acessar arquivos da Carteira C2");
assert.ok(!transport.includes("SU_LOTO_GAMES"), "transporte não pode alterar jogos oficiais");

const transportIndex = bootstrap.indexOf('import("./firebase-ios-transport.js?v=1")');
const cloudIndex = bootstrap.indexOf('import("./cloud-sync.js?v=3")');
assert.ok(transportIndex >= 0 && transportIndex < cloudIndex, "transporte deve inicializar antes do cloud-sync");

assert.ok(cloud.includes("persistentLocalCache"), "demais navegadores preservam arquitetura persistente atual");
assert.ok(cloud.includes("persistentMultipleTabManager"), "demais navegadores preservam multi-tab atual");
assert.ok(resume.includes("getDocsFromServer"), "reforço de retomada deve permanecer ativo");
assert.ok(sw.includes('const CACHE = "su-loto-c2-v23-sync-v6";'), "PWA deve renovar cache para sync-v6");
assert.ok(sw.includes('"./firebase-ios-transport.js"'), "Service Worker deve pré-carregar o transporte iOS");

console.log("Transporte iOS aprovado: long-polling forçado + cache Firestore em memória, com C2 e demais navegadores preservados.");
