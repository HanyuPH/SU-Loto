import fs from "node:fs";
import assert from "node:assert/strict";

const boost = fs.readFileSync("cloud-resume-refresh.js", "utf8");
const bootstrap = fs.readFileSync("bootstrap.js", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
const cloud = fs.readFileSync("cloud-sync.js", "utf8");

assert.ok(boost.includes("getDocsFromServer"), "camada de retomada deve forçar leitura fresca do servidor");
assert.ok(boost.includes("enableNetwork"), "camada de retomada deve reabilitar a rede do Firestore");
assert.ok(boost.includes('document.addEventListener("visibilitychange"'), "deve atualizar ao voltar do segundo plano");
assert.ok(boost.includes('window.addEventListener("pageshow"'), "deve atualizar ao reabrir/restaurar o PWA");
assert.ok(boost.includes('window.addEventListener("focus"'), "deve atualizar ao recuperar foco");
assert.ok(boost.includes('window.addEventListener("online"'), "deve atualizar ao recuperar internet");
assert.ok(boost.includes('queueRefresh("login", { force: true })'), "deve forçar atualização após login");
assert.ok(boost.includes("REFRESH_THROTTLE_MS"), "deve limitar leituras duplicadas de retomada");
assert.ok(boost.includes("BroadcastChannel"), "deve possuir fast path opcional entre contextos do mesmo aparelho");
assert.ok(boost.includes('CHANNEL_NAME = "su-loto-c2-fast-sync-v1"'), "canal de sincronização direta deve ser versionado");
assert.ok(boost.includes('message.type !== "status-intent"'), "canal direto deve aceitar apenas intenção de status validada");
assert.ok(boost.includes("VALID.has(status)"), "status recebido deve ser validado");
assert.ok(boost.includes("validGameId"), "ID recebido deve pertencer à Carteira Oficial carregada");

const cloudIndex = bootstrap.indexOf('import("./cloud-sync.js?v=3")');
const boostIndex = bootstrap.indexOf('import("./cloud-resume-refresh.js?v=1")');
assert.ok(cloudIndex >= 0 && boostIndex > cloudIndex, "reforço deve carregar somente depois da sincronização principal");
assert.ok(serviceWorker.includes('"./cloud-resume-refresh.js"'), "PWA deve pré-carregar o reforço para uso offline após instalação");

assert.ok(!boost.includes("data/carteira-c2"), "reforço não pode escrever nem depender de arquivos da C2");
assert.ok(!boost.includes("games-001-050"), "reforço não pode incorporar jogos oficiais");
assert.ok(!boost.includes("VERSION"), "reforço não pode alterar versionamento oficial");

// A arquitetura principal continua local-first: leitura completa fresca fica
// exclusivamente na camada paralela de retomada, nunca bloqueando start().
assert.ok(!cloud.includes("getDocsFromServer"), "cloud-sync principal deve continuar sem leitura completa bloqueante");

console.log("Reforço de retomada aprovado: login/foreground online refresh + fast path site↔PWA, sem tocar C2.");
