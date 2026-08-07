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

  await page.evaluate(() => {
    document.getElementById("su-loto-cloud-root")?.remove();
    const root = document.createElement("div");
    root.id = "su-loto-cloud-root";
    root.innerHTML = '<button id="su-loto-cloud-status" data-state="saving"><span id="su-loto-cloud-text">Salvando alterações…</span></button>';
    document.body.appendChild(root);
  });
  await page.waitForFunction(() => document.getElementById("su-loto-cloud-text")?.textContent === "Salvando na nuvem…", null, { timeout: 2_000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.getElementById("su-loto-cloud-text").textContent = "Salvando alterações…"; });
  await page.waitForFunction(() => document.getElementById("su-loto-cloud-text")?.textContent === "Salvando na nuvem…", null, { timeout: 2_000 });
  await page.waitForTimeout(1_850);
  assert.equal(await page.locator("#su-loto-cloud-root").getAttribute("data-sync-quiet"), "true", "Aviso de salvamento repetitivo deve recolher sem ficar preso na tela");

  console.log(`Smoke ${engineName} aprovado: resposta local ${local.latency.toFixed(1)} ms; snapshot antigo bloqueado; alteração remota aceita; aviso de nuvem recolheu.`);
} finally {
  await browser.close();
}
