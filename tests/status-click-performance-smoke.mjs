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
  await page.waitForFunction(() => Boolean(
    globalThis.SULotoApp
    && globalThis.SULotoContests
    && globalThis.SULotoLocalFirstGuard
    && globalThis.SULotoLocalFirstGuard.contestRefreshWrapped?.()
  ));

  await page.evaluate(() => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const contests = Array.from({ length: 6 }, (_, index) => ({
      number: 3900 + index,
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      numbers: base.map(value => ((value + index - 1) % 25) + 1).sort((a, b) => a - b),
      source: "https://example.com/qa",
      notes: "QA de desempenho",
      createdAt: new Date(2026, 7, index + 1).toISOString(),
      updatedAt: new Date(2026, 7, index + 1).toISOString()
    }));
    globalThis.SULotoContests.importData(contests, true);
  });

  assert.equal(await page.locator("#contest-tab-count").textContent(), "6", "Cenário deve conter seis concursos");
  assert.equal(await page.locator("#contest-scope").inputValue(), "all", "Escopo padrão deve ser Todos os jogos");

  const result = await page.evaluate(() => {
    const target = document.querySelector('.game-card[data-status="pendente"]');
    const button = target?.querySelector('.status-actions button[data-status="apostado"]');
    const counter = document.getElementById("count-apostado");
    if (!target || !button || !counter) throw new Error("Jogo pendente indisponível");
    const before = Number(counter.textContent || 0);
    const startedAt = performance.now();
    button.click();
    const elapsed = performance.now() - startedAt;
    return {
      elapsed,
      before,
      after: Number(counter.textContent || 0),
      status: target.dataset.status
    };
  });

  assert.equal(result.after, result.before + 1, "Contador deve mudar no próprio clique");
  assert.equal(result.status, "apostado", "Cartão deve mudar no próprio clique");
  assert.ok(result.elapsed < 120, `Clique com seis concursos deve permanecer leve; medido ${result.elapsed.toFixed(1)} ms`);

  console.log(`Performance ${engineName} aprovada: clique com 6 concursos em ${result.elapsed.toFixed(1)} ms.`);
} finally {
  await browser.close();
}