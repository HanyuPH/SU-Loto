import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();
await page.route("https://www.gstatic.com/**", route => route.abort());

const KEY = "su-loto-c2-contest-bets-v1";
const LAST = "su-loto-last-bet-contest-v1";
const now = new Date().toISOString();

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".game-card[data-id]").length === 300, null, { timeout: 30_000 });

  await page.evaluate(({ key, last, at }) => {
    localStorage.setItem(key, JSON.stringify({
      "99990": { contest: 99990, type: "normal", specialName: "", status: "ativo", gameIds: ["1","2"], unitPrice: 3.5, totalInvested: 7, createdAt: at, savedAt: at, updatedAt: at, concludedAt: "", releaseStatus: "pendente" },
      "99991": { contest: 99991, type: "normal", specialName: "", status: "concluido", gameIds: ["3","4"], unitPrice: 3.5, totalInvested: 7, createdAt: at, savedAt: at, updatedAt: at, concludedAt: at, releaseStatus: "pendente" }
    }));
    localStorage.setItem(last, "99990");
  }, { key: KEY, last: LAST, at: now });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".game-card[data-id]").length === 300, null, { timeout: 30_000 });
  await page.locator('.view-tab[data-view="contests-view"]').click();
  await page.waitForSelector("#su-loto-bet-history button[data-contest='99990']", { state: "visible", timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector("#su-loto-contest-bets")?.dataset.selectionHighlightV23 === "true");

  const active = page.locator("#su-loto-bet-history button[data-contest='99990']");
  await page.waitForFunction(() => document.querySelector("#su-loto-bet-history button[data-contest='99990']")?.classList.contains("is-selected"));
  assert.equal(await active.getAttribute("aria-current"), "true", "Concurso ativo deve ser indicado como seleção atual");

  const firstStyle = await active.evaluate(element => {
    const style = getComputedStyle(element);
    return { border: style.borderTopColor, background: style.backgroundColor };
  });
  assert.equal(firstStyle.border, "rgb(123, 43, 145)", "Seleção deve usar a borda roxa da SU Loto");
  assert.equal(firstStyle.background, "rgb(247, 237, 249)", "Seleção deve usar fundo lilás de destaque");

  const concluded = page.locator("#su-loto-bet-history button[data-contest='99991']");
  await concluded.click();
  await page.waitForFunction(() => document.querySelector("#su-loto-bet-history button[data-contest='99991']")?.classList.contains("is-selected"));

  assert.equal(await concluded.getAttribute("aria-current"), "true", "Concurso concluído escolhido deve receber o destaque antes de reabrir/excluir");
  assert.equal(await active.getAttribute("aria-current"), null, "Seleção anterior deve ser removida ao trocar de concurso");
  assert.equal(await page.locator("#su-loto-bet-contest").inputValue(), "99991", "Campo de concurso deve acompanhar o item visualmente selecionado");

  console.log("Smoke aprovado: concurso selecionado recebe borda, fundo e estado acessível na Beta v23.");
} finally {
  await browser.close();
}
