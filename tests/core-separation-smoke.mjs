import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "allow" });
const page = await context.newPage();

await page.route("https://www.gstatic.com/**", route => route.abort());

async function waitForWallet() {
  await page.waitForFunction(() => document.querySelectorAll(".game-card[data-id]").length === 300, null, { timeout: 30_000 });
}

async function waitForServiceWorkerControl() {
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === "activated" && Boolean(navigator.serviceWorker.controller);
  }, null, { timeout: 20_000 });
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForWallet();

  const initial = await page.evaluate(() => {
    const games = globalThis.SU_LOTO_GAMES || [];
    const cards = [...document.querySelectorAll(".game-card[data-id]")];
    return {
      gameCount: games.length,
      firstId: Number(games[0]?.id),
      lastId: Number(games.at(-1)?.id),
      forbiddenFields: games.flatMap(game => ["status", "initialStatus", "registered", "apostado", "pendente"].filter(key => Object.hasOwn(game, key))),
      apostado: cards.filter(card => card.dataset.status === "apostado").length,
      pendente: cards.filter(card => card.dataset.status === "pendente").length,
      registrado: cards.filter(card => card.dataset.status === "registrado").length,
      scripts: [...document.scripts].map(script => script.getAttribute("src")).filter(Boolean)
    };
  });

  assert.equal(initial.gameCount, 300, "A aplicação deve carregar 300 jogos");
  assert.equal(initial.firstId, 1, "Primeiro ID deve ser 001");
  assert.equal(initial.lastId, 300, "Último ID deve ser 300");
  assert.deepEqual(initial.forbiddenFields, [], "Jogos oficiais não podem conter estado operacional");
  assert.equal(initial.apostado, 42, "Migração operacional deve preservar os 42 jogos legados apostados");
  assert.equal(initial.pendente, 258, "Demais jogos devem iniciar pendentes");
  assert.equal(initial.registrado, 0, "Nenhum estado registrado deve ser embutido na carteira");
  assert.deepEqual(initial.scripts, ["bootstrap.js"], "O HTML deve ter um único ponto de entrada JavaScript");

  await page.locator('.game-card[data-id="43"] button[data-status="apostado"]').click({ force: true });
  await page.waitForFunction(() => {
    const payload = JSON.parse(localStorage.getItem("su-loto-c2-status-v4") || "{}");
    return payload?.statuses?.["43"] === "apostado";
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForWallet();
  assert.equal(await page.locator('.game-card[data-id="43"]').getAttribute("data-status"), "apostado", "Estado operacional deve sobreviver ao reload");

  await waitForServiceWorkerControl();
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForWallet();

  const offline = await page.evaluate(() => ({
    count: document.querySelectorAll(".game-card[data-id]").length,
    game43: document.querySelector('.game-card[data-id="43"]')?.dataset.status,
    wallet: globalThis.SU_LOTO_WALLET_MANIFEST?.wallet,
    controlled: Boolean(navigator.serviceWorker.controller)
  }));
  assert.equal(offline.count, 300, "A carteira deve abrir completa offline");
  assert.equal(offline.game43, "apostado", "Estado operacional deve permanecer disponível offline");
  assert.equal(offline.wallet, "SU Loto - C2", "Manifesto oficial deve permanecer disponível offline");
  assert.equal(offline.controlled, true, "A página offline deve permanecer controlada pelo Service Worker");

  console.log("Smoke test aprovado: 300 jogos, estado separado, persistência e PWA offline funcionando.");
} finally {
  await browser.close();
}
