import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "allow" });
const page = await context.newPage();

// O smoke test valida a camada local de eventos sem depender de credenciais Firebase.
await page.route("https://www.gstatic.com/**", route => route.abort());

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".game-card[data-id]").length === 300, null, { timeout: 30_000 });
  await page.waitForFunction(() => Boolean(globalThis.SULotoSyncEvents), null, { timeout: 10_000 });

  await page.evaluate(() => {
    globalThis.__SU_SYNC_EVENTS__ = [];
    window.addEventListener("su:state-change", event => {
      globalThis.__SU_SYNC_EVENTS__.push(event.detail);
    });
  });

  await page.locator('.game-card[data-id="43"] button[data-status="apostado"]').click({ force: true });
  await page.waitForFunction(() => globalThis.__SU_SYNC_EVENTS__.some(event => event.domain === "statuses" && event.detail?.id === "43"));

  const contest = {
    number: 99991,
    date: "2026-08-07",
    numbers: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
    source: "",
    notes: "QA sync events",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await page.evaluate(value => globalThis.SULotoContests.importData([value], true), contest);
  await page.waitForFunction(() => globalThis.__SU_SYNC_EVENTS__.some(event => event.domain === "contests" && event.source === "api"));

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("su:contest-bets-updated", { detail: { contest: 99991 } }));
  });
  await page.waitForFunction(() => globalThis.__SU_SYNC_EVENTS__.some(event => event.domain === "contestBets"));

  const events = await page.evaluate(() => globalThis.__SU_SYNC_EVENTS__);
  assert.ok(events.some(event => event.domain === "statuses" && event.detail?.id === "43"), "Mudança de status deve identificar o jogo alterado");
  assert.ok(events.some(event => event.domain === "contests"), "Importação de concurso deve emitir evento central");
  assert.ok(events.some(event => event.domain === "contestBets"), "Apostas por concurso devem emitir evento central");

  await page.evaluate(() => navigator.serviceWorker.ready.then(registration => Boolean(registration.active)));
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".game-card[data-id]").length === 300, null, { timeout: 20_000 });
  await page.waitForFunction(() => Boolean(globalThis.SULotoSyncEvents), null, { timeout: 10_000 });
  assert.equal(await page.evaluate(() => Boolean(globalThis.SULotoSyncEvents)), true, "Barramento de sincronização deve estar disponível offline");

  console.log("Smoke test aprovado: eventos centrais de status, concursos e apostas disponíveis, inclusive offline.");
} finally {
  await browser.close();
}
