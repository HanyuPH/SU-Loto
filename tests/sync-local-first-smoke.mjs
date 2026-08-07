import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173/";
const engineName = process.env.QA_BROWSER || "chromium";
const engine = engineName === "webkit" ? webkit : chromium;
const browser = await engine.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();
await page.route("https://www.gstatic.com/**", route => route.abort());

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".game-card[data-id]").length === 300, null, { timeout: 30_000 });
  await page.waitForFunction(() => Boolean(globalThis.SULotoApp && globalThis.SULotoLocalFirstGuard));

  const before = await page.evaluate(() => ({
    apostado: Number(document.getElementById("count-apostado")?.textContent || 0),
    registrado: Number(document.getElementById("count-registrado")?.textContent || 0)
  }));

  // Mede apenas a resposta da aplicação depois que o clique chega ao DOM.
  // Assim o resultado não inclui scroll/actionability do driver do navegador,
  // que no WebKit pode levar segundos sem representar latência do aplicativo.
  const local = await page.evaluate(() => {
    const target = document.querySelector('.game-card[data-status="pendente"]');
    const button = target?.querySelector('.status-actions button[data-status="apostado"]');
    const counter = document.getElementById("count-apostado");
    if (!target || !button || !counter) throw new Error("Jogo pendente ou botão Apostado indisponível");
    const id = String(target.dataset.id || "");
    const beforeCount = Number(counter.textContent || 0);
    const startedAt = performance.now();
    button.click();
    const latency = performance.now() - startedAt;
    return {
      id,
      beforeCount,
      afterCount: Number(counter.textContent || 0),
      cardStatus: target.dataset.status,
      latency
    };
  });

  assert.ok(local.id, "Deve existir ao menos um jogo pendente para o teste");
  assert.equal(local.afterCount, local.beforeCount + 1, "Contador deve mudar no mesmo ciclo do clique local");
  assert.equal(local.cardStatus, "apostado", "Cartão deve assumir Apostado imediatamente");
  assert.ok(local.latency < 250, `Resposta local da aplicação deve ser imediata; medido ${local.latency.toFixed(1)} ms`);
  console.log(`Resposta local ${engineName}: ${local.latency.toFixed(1)} ms`);
  const id = local.id;

  await page.evaluate(gameId => {
    const key = "su-loto-c2-status-v4";
    const payload = JSON.parse(localStorage.getItem(key));
    payload.statuses[gameId] = "pendente";
    localStorage.setItem(key, JSON.stringify(payload));
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: JSON.stringify(payload) }));
  }, id);

  await page.waitForTimeout(100);
  assert.equal(await page.locator(`[data-id="${id}"]`).getAttribute("data-status"), "apostado", "Snapshot antigo não pode reverter a marcação local");
  assert.equal(await page.locator("#count-apostado").textContent(), String(before.apostado + 1), "Contador não pode regredir enquanto a nuvem confirma");

  const repaired = await page.evaluate(gameId => {
    const payload = JSON.parse(localStorage.getItem("su-loto-c2-status-v4"));
    return payload.statuses[gameId];
  }, id);
  assert.equal(repaired, "apostado", "Storage deve ser reparado para preservar a intenção local");

  await page.evaluate(gameId => {
    const key = "su-loto-c2-status-v4";
    const payload = JSON.parse(localStorage.getItem(key));
    payload.statuses[gameId] = "apostado";
    localStorage.setItem(key, JSON.stringify(payload));
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: JSON.stringify(payload) }));
  }, id);
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => globalThis.SULotoLocalFirstGuard.pendingCount()), 0, "Confirmação equivalente da nuvem deve encerrar a proteção local");

  const remoteTarget = page.locator('.game-card[data-status="pendente"]').first();
  const remoteId = await remoteTarget.getAttribute("data-id");
  assert.ok(remoteId, "Deve existir outro jogo pendente para validar alteração remota");
  await page.evaluate(gameId => {
    const key = "su-loto-c2-status-v4";
    const payload = JSON.parse(localStorage.getItem(key));
    payload.statuses[gameId] = "registrado";
    payload.savedAt = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(payload));
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: JSON.stringify(payload) }));
  }, remoteId);
  await page.waitForFunction(expected => Number(document.getElementById("count-registrado")?.textContent || 0) === expected, before.registrado + 1, { timeout: 2_000 });

  // Usa o próprio componente de nuvem quando ele já existe. Se a nuvem estiver
  // indisponível no ambiente de QA, cria-o uma única vez para o guard anexar.
  await page.evaluate(() => {
    let root = document.getElementById("su-loto-cloud-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "su-loto-cloud-root";
      document.body.appendChild(root);
    }
    let button = document.getElementById("su-loto-cloud-status");
    if (!button) {
      button = document.createElement("button");
      button.id = "su-loto-cloud-status";
      root.appendChild(button);
    }
    let label = document.getElementById("su-loto-cloud-text");
    if (!label) {
      label = document.createElement("span");
      label.id = "su-loto-cloud-text";
      button.appendChild(label);
    }
    button.dataset.state = "saving";
    label.textContent = "Salvando alterações…";
  });

  await page.waitForFunction(
    () => document.getElementById("su-loto-cloud-root")?.dataset.syncQuiet === "true",
    null,
    { timeout: 3_000 }
  );

  // Simula exatamente a disputa visual observada no iPhone: outro caminho
  // volta a escrever a frase antiga enquanto a sincronização segue em fundo.
  // O indicador deve permanecer compacto em vez de voltar a ocupar a tela.
  await page.evaluate(() => {
    document.getElementById("su-loto-cloud-text").textContent = "Salvando alterações…";
  });
  await page.waitForTimeout(250);
  assert.equal(
    await page.locator("#su-loto-cloud-root").getAttribute("data-sync-quiet"),
    "true",
    "Alternância de mensagens de salvamento não pode reexpandir o indicador"
  );

  await page.evaluate(() => {
    const button = document.getElementById("su-loto-cloud-status");
    const label = document.getElementById("su-loto-cloud-text");
    button.dataset.state = "synced";
    label.textContent = "Sincronizado em tempo real";
  });
  await page.waitForTimeout(100);
  assert.equal(
    await page.locator("#su-loto-cloud-root").getAttribute("data-sync-quiet"),
    "true",
    "Estado sincronizado normal deve permanecer compacto"
  );

  console.log(`Smoke ${engineName} aprovado: resposta local ${local.latency.toFixed(1)} ms; snapshot antigo bloqueado; alteração remota aceita; indicador de fundo permaneceu compacto.`);
} finally {
  await browser.close();
}