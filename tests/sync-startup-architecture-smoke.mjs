import fs from "node:fs";
import assert from "node:assert/strict";

const cloud = fs.readFileSync("cloud-sync.js", "utf8");
const bootstrap = fs.readFileSync("bootstrap.js", "utf8");
const guard = fs.readFileSync("sync-local-first-guard.js", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");

assert.ok(cloud.includes("function start(current)"), "cloud-sync deve possuir start(current)");
const startIndex = cloud.indexOf("function start(current)");
const statusListenerIndex = cloud.indexOf("listenStatuses();", startIndex);
const contestListenerIndex = cloud.indexOf("listenContests();", startIndex);
const settingsWriteIndex = cloud.indexOf("void setDoc", startIndex);

assert.ok(statusListenerIndex > startIndex, "listener de status deve ser iniciado no start");
assert.ok(contestListenerIndex > startIndex, "listener de concursos deve ser iniciado no start");
assert.ok(settingsWriteIndex > startIndex, "gravação administrativa deve existir no start");
assert.ok(statusListenerIndex < settingsWriteIndex, "listener de status deve iniciar antes da gravação administrativa");
assert.ok(contestListenerIndex < settingsWriteIndex, "listener de concursos deve iniciar antes da gravação administrativa");

assert.ok(!cloud.includes("getDocsFromServer"), "startup não deve aguardar leitura completa getDocsFromServer");
assert.ok(!cloud.match(/\bgetDocs\b/), "startup não deve usar leitura completa getDocs");
assert.ok(cloud.includes("!statusServerReady && snapshot.metadata.fromCache"), "primeiro cache de status deve preservar o estado local visível");
assert.ok(cloud.includes("!contestsServerReady && snapshot.metadata.fromCache"), "primeiro cache de concursos deve preservar o estado local visível");
assert.ok(cloud.includes("startupStatusIntents"), "status locais ausentes na nuvem devem ser preservados até confirmação remota");
assert.ok(cloud.includes("Conectando à nuvem…"), "estado de conexão não bloqueante deve estar identificado");
assert.ok(cloud.includes("Conexão lenta • sincronizando…"), "conexão lenta deve ser identificada sem travar a aplicação");

assert.ok(bootstrap.includes('import("./cloud-sync.js?v=3")'), "bootstrap deve forçar cloud-sync v3");
assert.ok(serviceWorker.includes('const CACHE = "su-loto-c2-v23-sync-v5";'), "Service Worker deve usar cache sync-v5");
assert.ok(guard.includes("Conectando à nuvem"), "guard deve compactar a conexão rotineira");
assert.ok(guard.includes("Conexão lenta"), "guard deve compactar conexão lenta sem esconder erros reais");
assert.ok(guard.includes("Verificando login"), "verificação automática de login deve ficar compacta");

console.log("Arquitetura de startup aprovada: listeners primeiro, reconciliação em tempo real, UI de conexão compacta e cache sync-v5.");
