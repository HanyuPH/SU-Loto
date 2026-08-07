import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "allow" });
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

  // Resultado oficial simulado deve aparecer e poder ser registrado sem digitação manual.
  await page.waitForFunction(() => document.querySelector("#official-preview-title")?.textContent?.includes("99992"), null, { timeout: 10_000 });
  await page.locator("#official-register").click({ force: true });
  await page.waitForFunction(() => (globalThis.SULotoContests.exportData() || []).some(item => Number(item.number) === 99992));

  const contest = await page.evaluate(() => (globalThis.SULotoContests.exportData() || []).find(item => Number(item.number) === 99992));
  assert.equal(contest.numbers.length, 15, "Resultado oficial registrado deve manter 15 dezenas");
  assert.equal(contest.date, "2026-08-07", "Data oficial deve ser preservada");

  // Conferência deve abrir e avaliar a carteira.
  await page.waitForFunction(() => !document.querySelector("#contest-analysis")?.hidden, null, { timeout: 10_000 });
  const analysisText = await page.locator("#contest-analysis").innerText();
  assert.match(analysisText, /Concurso 99992/, "Conferência deve abrir o concurso registrado");
  assert.match(analysisText, /300/, "Conferência de todos os jogos deve avaliar a carteira completa");

  // Exportação/importação via API local deve preservar o histórico.
  const exported = await page.evaluate(() => globalThis.SULotoContests.exportData());
  assert.ok(exported.some(item => Number(item.number) === 99992), "Histórico exportado deve conter o concurso QA");
  const restored = await page.evaluate(data => {
    localStorage.removeItem("su-loto-c2-contests-v1");
    return globalThis.SULotoContests.importData(data, true);
  }, exported);
  assert.equal(restored, true, "Reimportação do histórico deve ser aceita");

  // Busca e filtros básicos da carteira.
  await page.locator("#search-game").fill("43");
  await page.waitForFunction(() => document.querySelectorAll('.game-card[data-id]:not([hidden])').length >= 1);
  assert.equal(await page.locator('.game-card[data-id="43"]').isVisible(), true, "Busca por jogo deve localizar o ID 043");
  await page.locator("#search-game").fill("");

  // Banner de identificação v23 deve estar semanticamente correto quando carregado.
  await page.evaluate(async () => { await import("./beta-banner.js?qa=1"); });
  await page.waitForFunction(() => document.querySelector("#su-beta-banner")?.textContent?.includes("v23"));
  assert.match(await page.locator("#su-beta-banner").innerText(), /SU Loto Beta v23/, "Banner deve identificar a Beta v23");

  console.log("Smoke funcional aprovado: resultado oficial, conferência, histórico, filtros e identificação Beta v23 funcionando.");
} finally {
  await browser.close();
}
