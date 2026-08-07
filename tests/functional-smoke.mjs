import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
// PWA/offline é validado pelos outros smoke tests. Aqui bloqueamos Service Worker
// para que o resultado oficial simulado seja interceptado de forma determinística.
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();

await page.route("https://www.gstatic.com/**", route => route.abort());

const qaResult = {
  schemaVersion: 1,
  game: "LOTOFACIL",
  number: 99992,
  date: "2026-08-07",
  numbers: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
  source: "https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil/99992",
  official: true,
  updatedAt: new Date().toISOString(),
  accumulated: false,
  location: "QA",
  prizeTiers: [
    { hits: 15, winners: 1, prize: 1000000, description: "15 acertos" },
    { hits: 14, winners: 10, prize: 1000, description: "14 acertos" }
  ]
};

await page.route("**/data/ultimo-concurso.json", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(qaResult)
}));

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".game-card[data-id]").length === 300, null, { timeout: 30_000 });
  await page.waitForFunction(() => Boolean(globalThis.SULotoContests), null, { timeout: 10_000 });

  await page.locator('.view-tab[data-view="contests-view"]').click();
  await page.waitForFunction(() => !document.querySelector("#contests-view")?.hidden);
  await page.waitForSelector("#official-refresh", { state: "visible", timeout: 10_000 });
  await page.locator("#official-refresh").click();
  await page.waitForFunction(() => document.querySelector("#official-preview-title")?.textContent?.includes("99992"), null, { timeout: 15_000 });
  await page.locator("#official-register").click();
  await page.waitForFunction(() => (globalThis.SULotoContests.exportData() || []).some(item => Number(item.number) === 99992));

  const contest = await page.evaluate(() => (globalThis.SULotoContests.exportData() || []).find(item => Number(item.number) === 99992));
  assert.equal(contest.numbers.length, 15, "Resultado oficial registrado deve manter 15 dezenas");
  assert.equal(contest.date, "2026-08-07", "Data oficial deve ser preservada");

  await page.waitForFunction(() => !document.querySelector("#contest-analysis")?.hidden, null, { timeout: 10_000 });
  const analysisText = await page.locator("#contest-analysis").innerText();
  assert.match(analysisText, /Concurso 99992/, "Conferência deve abrir o concurso registrado");
  assert.match(analysisText, /300/, "Conferência de todos os jogos deve avaliar a carteira completa");

  const exported = await page.evaluate(() => globalThis.SULotoContests.exportData());
  assert.ok(exported.some(item => Number(item.number) === 99992), "Histórico exportado deve conter o concurso QA");
  const restored = await page.evaluate(data => {
    localStorage.removeItem("su-loto-c2-contests-v1");
    return globalThis.SULotoContests.importData(data, true);
  }, exported);
  assert.equal(restored, true, "Reimportação do histórico deve ser aceita");

  await page.locator('.view-tab[data-view="wallet-view"]').click();
  await page.locator("#search").fill("43");
  await page.waitForFunction(() => document.querySelector('.game-card[data-id="43"]') && !document.querySelector('.game-card[data-id="43"]').hidden);
  assert.equal(await page.locator('.game-card[data-id="43"]').isVisible(), true, "Busca por jogo deve localizar o ID 043");
  await page.locator("#search").fill("");

  await page.evaluate(async () => { await import("./beta-banner.js?qa=1"); });
  await page.waitForFunction(() => document.querySelector("#su-beta-banner")?.textContent?.includes("v23"));
  assert.match(await page.locator("#su-beta-banner").innerText(), /SU Loto Beta v23/, "Banner deve identificar a Beta v23");

  console.log("Smoke funcional aprovado: resultado oficial, conferência, histórico, filtros e identificação Beta v23 funcionando.");
} finally {
  await browser.close();
}
