import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const LOTO = "https://hanyuph.github.io/SU-Loto/beta/";
const MEGA = "https://hanyuph.github.io/SU-Mega/beta/";
const outDir = "artifacts/live-visual-sync-v5";
await mkdir(outDir, { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchUntil(url, pattern, timeoutMs = 240_000) {
  const started = Date.now();
  let lastText = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}qa=${Date.now()}`, {
        headers: { "Cache-Control": "no-cache" }
      });
      lastText = await response.text();
      if (response.ok && lastText.includes(pattern)) return lastText;
    } catch {}
    await sleep(5_000);
  }
  throw new Error(`Timeout esperando ${pattern} em ${url}. Último conteúdo: ${lastText.slice(0, 300)}`);
}

console.log("Aguardando publicação sync-v5 no GitHub Pages...");
const swText = await fetchUntil(`${LOTO}service-worker.js`, "su-loto-c2-v23-sync-v5");
const bootstrapText = await fetchUntil(`${LOTO}bootstrap.js`, "cloud-sync.js?v=3");
const cloudText = await fetchUntil(`${LOTO}cloud-sync.js`, "Conectando à nuvem…");
await fetchUntil(`${LOTO}beta-banner.js`, 'const BUILD = "v23"');
await fetchUntil(`${LOTO}VERSION`, "latestBetaDocumented=v23");
await fetchUntil(`${MEGA}beta-banner.js`, 'const BUILD = "v29"');
await fetchUntil(`${MEGA}service-worker.js`, "su-mega-c2-beta-v29");

assert.ok(swText.includes("sync-local-first-guard.js"), "Service Worker deve precachear guard local-first");
assert.ok(bootstrapText.includes('import("./sync-local-first-guard.js?v=1")'), "Bootstrap deve carregar guard local-first");
assert.ok(bootstrapText.includes('import("./cloud-sync.js?v=3")'), "Bootstrap deve carregar cloud-sync v3");
assert.ok(cloudText.includes("listenStatuses();") && cloudText.includes("listenContests();"), "Listeners em tempo real devem existir");
assert.ok(!cloudText.includes("getDocsFromServer"), "Startup publicado não deve depender de leitura completa getDocsFromServer");
assert.ok(!cloudText.includes("getDocs("), "Startup publicado não deve depender de leitura completa getDocs");
console.log("Publicação estática confirmada: SU Loto v23 sync-v5 + SU Mega v29.");

const statusMap = Object.fromEntries(Array.from({ length: 300 }, (_, index) => [String(index + 1), index < 43 ? "apostado" : "pendente"]));
const contests = Array.from({ length: 6 }, (_, index) => ({
  number: 9900 - index,
  date: `2026-08-${String(7 - index).padStart(2, "0")}`,
  numbers: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
  source: "https://loterias.caixa.gov.br/",
  notes: "QA visual temporário",
  createdAt: `2026-08-0${7-index}T12:00:00.000Z`,
  updatedAt: `2026-08-0${7-index}T12:00:00.000Z`
}));
const contestBets = {
  "9990": {
    contest: 9990,
    type: "normal",
    specialName: "",
    status: "concluido",
    gameIds: ["1", "2", "3"],
    unitPrice: 3.5,
    totalInvested: 10.5,
    createdAt: "2026-08-07T12:00:00.000Z",
    savedAt: "2026-08-07T12:00:00.000Z",
    updatedAt: "2026-08-07T12:30:00.000Z",
    concludedAt: "2026-08-07T12:30:00.000Z",
    releaseStatus: "pendente"
  }
};

async function seed(page) {
  await page.evaluate(({ statusMap, contests, contestBets }) => {
    localStorage.setItem("su-loto-c2-status-v4", JSON.stringify({
      app: "SU Loto", wallet: "C2", schema: 3, source: "qa-live", savedAt: new Date().toISOString(), statuses: statusMap
    }));
    localStorage.setItem("su-loto-c2-contests-v1", JSON.stringify(contests));
    localStorage.setItem("su-loto-c2-contest-bets-v1", JSON.stringify(contestBets));
    localStorage.setItem("su-loto-last-bet-contest-v1", "9990");
  }, { statusMap, contests, contestBets });
}

async function hideAuthGate(page) {
  await page.evaluate(() => {
    const gate = document.getElementById("su-loto-cloud-gate");
    if (gate) gate.hidden = true;
  });
}

async function waitApp(page) {
  await page.waitForFunction(() => document.querySelectorAll(".game-card[data-id]").length === 300, null, { timeout: 30_000 });
  await hideAuthGate(page);
}

async function testBrowser(name, engine, viewport, { offline = false } = {}) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport.width <= 500 ? 2 : 1,
    isMobile: viewport.width <= 500,
    hasTouch: viewport.width <= 500
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(String(error)));

  try {
    await page.goto(`${LOTO}?visual=${name}-${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitApp(page);
    await seed(page);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitApp(page);

    const summary = await page.evaluate(() => {
      const n = id => Number(document.getElementById(id)?.textContent || 0);
      return {
        banner: document.body.innerText.includes("SU Loto Beta v23 — ambiente de testes"),
        total: n("count-total"),
        pending: n("count-pendente"),
        registered: n("count-registrado"),
        bet: n("count-apostado"),
        visible: n("visible-count"),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        walletSelected: document.querySelector('[data-view="wallet-view"]')?.getAttribute("aria-selected"),
        contestBadge: n("contest-tab-count")
      };
    });

    assert.equal(summary.banner, true, `${name}: banner Beta v23 deve estar visível`);
    assert.equal(summary.total, 300, `${name}: total deve ser 300`);
    assert.equal(summary.pending + summary.registered + summary.bet, 300, `${name}: contadores devem fechar 300`);
    assert.equal(summary.bet, 43, `${name}: seed deve mostrar 43 apostados`);
    assert.equal(summary.visible, 300, `${name}: 300 jogos devem ser exibidos`);
    assert.ok(summary.overflow <= 2, `${name}: não deve existir overflow horizontal (${summary.overflow}px)`);
    assert.equal(summary.walletSelected, "true", `${name}: Carteira deve iniciar selecionada`);
    assert.equal(summary.contestBadge, 6, `${name}: badge deve indicar 6 concursos`);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${outDir}/${name}-carteira.png`, fullPage: false });

    const clickResult = await page.evaluate(() => {
      const card = document.querySelector('.game-card[data-status="pendente"]');
      const button = card?.querySelector('button[data-status="apostado"]');
      const counter = document.getElementById("count-apostado");
      if (!card || !button || !counter) throw new Error("Jogo pendente indisponível");
      const before = Number(counter.textContent || 0);
      const started = performance.now();
      button.click();
      const latency = performance.now() - started;
      return { before, after: Number(counter.textContent || 0), latency, status: card.dataset.status };
    });
    assert.equal(clickResult.after, clickResult.before + 1, `${name}: contador deve atualizar no clique`);
    assert.equal(clickResult.status, "apostado", `${name}: cartão deve atualizar no clique`);
    assert.ok(clickResult.latency < 250, `${name}: clique deve responder <250ms; ${clickResult.latency.toFixed(1)}ms`);

    await page.locator('.view-tab[data-view="contests-view"]').click();
    await page.waitForFunction(() => !document.getElementById("contests-view")?.hidden);
    await page.waitForSelector("#su-loto-contest-bets", { timeout: 10_000 });
    await page.waitForFunction(() => document.querySelectorAll("#su-loto-bet-history button[data-contest]").length >= 1);

    const historyButton = page.locator('#su-loto-bet-history button[data-contest="9990"]');
    await historyButton.click();
    await page.waitForFunction(() => document.querySelector('#su-loto-bet-history button[data-contest="9990"]')?.classList.contains("is-selected"));

    const selection = await page.evaluate(() => {
      const button = document.querySelector('#su-loto-bet-history button[data-contest="9990"]');
      const input = document.getElementById("su-loto-bet-contest");
      const reopen = document.getElementById("su-loto-reopen-contest-bets");
      const close = document.getElementById("su-close-contest-bets");
      const del = document.getElementById("su-delete-contest-bets");
      const style = getComputedStyle(button);
      return {
        value: input?.value,
        selectedClass: button?.classList.contains("is-selected"),
        ariaCurrent: button?.getAttribute("aria-current"),
        borderWidth: style.borderTopWidth,
        borderColor: style.borderTopColor,
        background: style.backgroundColor,
        boxShadow: style.boxShadow,
        inputSelected: input?.classList.contains("contest-number-selected"),
        reopenExists: Boolean(reopen),
        reopenDisabled: reopen?.disabled,
        closeExists: Boolean(close),
        deleteExists: Boolean(del),
        overflow: document.documentElement.scrollWidth - window.innerWidth
      };
    });
    assert.equal(selection.value, "9990", `${name}: concurso clicado deve preencher seleção`);
    assert.equal(selection.selectedClass, true, `${name}: concurso deve receber classe is-selected`);
    assert.equal(selection.ariaCurrent, "true", `${name}: seleção deve expor aria-current`);
    assert.equal(selection.borderWidth, "2px", `${name}: borda de seleção deve ter 2px`);
    assert.notEqual(selection.boxShadow, "none", `${name}: seleção deve ter anel visual`);
    assert.equal(selection.inputSelected, true, `${name}: campo concurso deve receber destaque`);
    assert.equal(selection.reopenExists && selection.closeExists && selection.deleteExists, true, `${name}: ações concluir/excluir/reabrir devem existir`);
    assert.equal(selection.reopenDisabled, false, `${name}: concurso concluído sem outro ativo deve poder reabrir`);
    assert.ok(selection.overflow <= 2, `${name}: concursos não devem gerar overflow horizontal`);

    await historyButton.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${outDir}/${name}-concursos-selecao.png`, fullPage: false });

    const scope = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return "unsupported";
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error("service worker timeout")), 12_000))
      ]);
      return registration.scope;
    });
    assert.ok(scope.endsWith("/SU-Loto/beta/"), `${name}: escopo do Service Worker deve ser /SU-Loto/beta/; ${scope}`);

    if (offline) {
      await context.setOffline(false);
      await page.goto(`${LOTO}?offline-prep=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await waitApp(page);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      await waitApp(page);
      await context.setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForFunction(() => document.querySelectorAll(".game-card[data-id]").length === 300, null, { timeout: 20_000 });
      assert.equal(await page.locator("#count-total").textContent(), "300", `${name}: PWA offline deve carregar a carteira`);
      await context.setOffline(false);
    }

    assert.equal(pageErrors.length, 0, `${name}: não deve haver pageerror: ${pageErrors.join(" | ")}`);
    return { name, viewport, clickLatencyMs: Number(clickResult.latency.toFixed(1)), serviceWorkerScope: scope, selection };
  } finally {
    await context.setOffline(false).catch(() => {});
    await browser.close();
  }
}

const results = [];
results.push(await testBrowser("chromium-mobile", chromium, { width: 430, height: 932 }, { offline: true }));
results.push(await testBrowser("webkit-mobile", webkit, { width: 430, height: 932 }));
results.push(await testBrowser("chromium-tablet", chromium, { width: 820, height: 1180 }));

await writeFile(`${outDir}/summary.json`, JSON.stringify({
  testedAt: new Date().toISOString(),
  loto: { version: "v23", cache: "sync-v5" },
  mega: { version: "v29" },
  results
}, null, 2));

console.log("Bateria live/visual aprovada:");
for (const result of results) console.log(`- ${result.name}: clique ${result.clickLatencyMs} ms; SW ${result.serviceWorkerScope}`);
