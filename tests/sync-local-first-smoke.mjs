import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
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

  const target = page.locator('.game-card[data-status="pendente"]').first();
  const id = await target.getAttribute("data-id");
  assert.ok(id, "Deve existir ao menos um jogo pendente para o teste");

  const startedAt = Date.now();
  await target.locator('.status-actions button[data-status="apostado"]').click();
  await page.waitForFunction(expected => Number(document.getElementById("count-apostado")?.textContent || 0) === expected, before.apostado + 1, { timeout: 1_000 });
  const localLatency = Date.now() - startedAt;
  assert.ok(localLatency < 1_000, `Contador local deve responder antes da nuvem; medido ${localLatency} ms`);

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
  await page.waitForFunction(() => document.getElementById("su-loto-cloud-text")?.textContent === "Salvando na nuvem…");
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.getElementById("su-loto-cloud-text").textContent = "Salvando alterações…"; });
  await page.waitForFunction(() => document.getElementById("su-loto-cloud-text")?.textContent === "Salvando na nuvem…");
  await page.waitForTimeout(1_850);
  assert.equal(await page.locator("#su-loto-cloud-root").getAttribute("data-sync-quiet"), "true", "Aviso de salvamento repetitivo deve recolher sem ficar preso na tela");

  console.log(`Smoke aprovado: contador local-first respondeu em ${localLatency} ms; snapshot antigo foi bloqueado e aviso de nuvem recolheu.`);
} finally {
  await browser.close();
}
