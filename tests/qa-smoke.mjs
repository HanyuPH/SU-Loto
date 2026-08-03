import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const APP = process.env.QA_APP || "loto";
const BASE_URL = process.env.QA_BASE_URL || "http://127.0.0.1:4173/";
const EXPECTED_VERSION = process.env.QA_VERSION || (APP === "mega" ? "v27" : "v20");
const config = APP === "mega" ? {
  name: "SU Mega",
  gameCount: 705,
  versionDataset: "suMegaBetaBuild",
  walletStorage: "su-mega-c2-status-v1",
  contestStorage: "su-mega-c2-contests-v1",
  betsStorage: "su-mega-c2-contest-bets-v1",
  betsRoot: "#su-contest-bets",
  betNumber: "#su-bet-contest",
  betHistory: "#su-bet-history",
  backupButton: "#export-backup",
  searchInput: "#filter-game",
  clearFilters: "#clear-filters",
  firstSystem: "Ouro",
  contestNumbers: [1, 2, 3, 4, 5, 6],
  selectedCount: "6/6",
  expectedAnalysisText: "Jogos conferidos"
} : {
  name: "SU Loto",
  gameCount: 300,
  versionDataset: "suLotoBetaBuild",
  walletStorage: "su-loto-c2-status-v4",
  contestStorage: "su-loto-c2-contests-v1",
  betsStorage: "su-loto-c2-contest-bets-v1",
  betsRoot: "#su-loto-contest-bets",
  betNumber: "#su-loto-bet-contest",
  betHistory: "#su-loto-bet-history",
  backupButton: "#export-backup",
  searchInput: "#search",
  clearFilters: null,
  firstSystem: "Base preservada",
  contestNumbers: Array.from({ length: 15 }, (_, index) => index + 1),
  selectedCount: "15/15",
  expectedAnalysisText: "Jogos conferidos"
};

const results = [];
const pageErrors = [];
const consoleErrors = [];
const startedAt = new Date().toISOString();
let browser;
let context;
let page;

function record(name, status, details = "") {
  results.push({ name, status, details });
  const icon = status === "pass" ? "✓" : status === "skip" ? "○" : "✗";
  console.log(`${icon} ${name}${details ? ` — ${details}` : ""}`);
}

async function test(name, fn) {
  try {
    await fn();
    record(name, "pass");
  } catch (error) {
    record(name, "fail", error?.stack || String(error));
  }
}

async function waitText(selector, expected, timeout = 8000) {
  await page.waitForFunction(({ selector, expected }) => {
    const node = document.querySelector(selector);
    return node && String(node.textContent || "").includes(expected);
  }, { selector, expected }, { timeout });
}

async function boot({ requireModules = true } = {}) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".game-card", { timeout: 20000 });
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.ready;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".game-card", { timeout: 20000 });
  if (requireModules) {
    await page.waitForSelector("#su-beta-banner", { timeout: 30000 });
    await page.waitForFunction(({ key, version }) => document.documentElement.dataset[key] === version,
      { key: config.versionDataset, version: EXPECTED_VERSION }, { timeout: 30000 });
    await page.waitForSelector(config.betsRoot, { timeout: 30000 });
  }
}

async function switchView(view) {
  await page.click(`.view-tab[data-view="${view}"]`);
  await page.waitForFunction(view => {
    const panel = document.getElementById(view);
    return panel && !panel.hidden;
  }, view);
}

async function resetFilters() {
  if (config.clearFilters) {
    await page.click(config.clearFilters);
    return;
  }
  await page.selectOption("#filter-status", "all");
  await page.selectOption("#filter-system", "all");
  await page.selectOption("#filter-group", "all");
  await page.fill("#search", "");
}

async function markGame(cardId, status) {
  await page.locator(`.game-card[data-id="${cardId}"] button[data-status="${status}"]`).click();
  await page.waitForFunction(({ cardId, status }) =>
    document.querySelector(`.game-card[data-id="${cardId}"]`)?.dataset.status === status,
    { cardId, status });
}

async function reportAndExit() {
  const failed = results.filter(item => item.status === "fail");
  const passed = results.filter(item => item.status === "pass");
  const report = {
    app: config.name,
    expectedVersion: EXPECTED_VERSION,
    startedAt,
    finishedAt: new Date().toISOString(),
    totals: { passed: passed.length, failed: failed.length, total: results.length },
    results,
    pageErrors,
    consoleErrors
  };
  await fs.mkdir("qa", { recursive: true });
  await fs.writeFile("qa/latest-report.json", JSON.stringify(report, null, 2));
  const lines = [
    `# Auditoria automática — ${config.name} ${EXPECTED_VERSION}`,
    "",
    `- Executada em: ${report.finishedAt}`,
    `- Aprovados: ${passed.length}`,
    `- Falhas: ${failed.length}`,
    `- Total: ${results.length}`,
    "",
    "## Resultados",
    "",
    ...results.map(item => `- ${item.status === "pass" ? "✅" : item.status === "skip" ? "⚪" : "❌"} **${item.name}**${item.details ? ` — ${item.details.replace(/\n/g, " ").slice(0, 800)}` : ""}`),
    "",
    "## Erros de página",
    "",
    ...(pageErrors.length ? pageErrors.map(item => `- ${item}`) : ["- Nenhum erro JavaScript não tratado capturado."]),
    "",
    "## Erros de console",
    "",
    ...(consoleErrors.length ? consoleErrors.map(item => `- ${item}`) : ["- Nenhum erro de console capturado."]),
    ""
  ];
  await fs.writeFile("qa/latest-report.md", lines.join("\n"));
  if (browser) await browser.close();
  if (failed.length) process.exitCode = 1;
}

try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
    serviceWorkers: "allow"
  });
  page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("dialog", dialog => dialog.accept().catch(() => {}));

  await test("Inicialização, service worker e módulos Beta", async () => {
    await boot();
    assert.equal(await page.locator(".game-card").count(), config.gameCount);
    assert.equal(await page.textContent("#count-total"), String(config.gameCount));
    assert.equal(await page.locator(".view-tab").count(), 2);
    assert.equal(await page.locator(config.betsRoot).count(), 1);
    assert.equal(await page.locator(".official-sync-card").count(), 1);
  });

  await test("Integridade do DOM e ausência de IDs duplicados", async () => {
    const duplicates = await page.evaluate(() => {
      const counts = {};
      document.querySelectorAll("[id]").forEach(node => { counts[node.id] = (counts[node.id] || 0) + 1; });
      return Object.entries(counts).filter(([, count]) => count > 1);
    });
    assert.deepEqual(duplicates, []);
  });

  await test("Navegação entre Carteira e Concursos", async () => {
    await switchView("contests-view");
    assert.equal(await page.getAttribute('.view-tab[data-view="contests-view"]', "aria-selected"), "true");
    assert.equal(await page.isHidden("#wallet-view"), true);
    await switchView("wallet-view");
    assert.equal(await page.getAttribute('.view-tab[data-view="wallet-view"]', "aria-selected"), "true");
    assert.equal(await page.isHidden("#contests-view"), true);
  });

  let firstId;
  let secondId;
  let initialFirstStatus;
  await test("Alteração de status e atualização dos contadores", async () => {
    firstId = await page.locator(".game-card").first().getAttribute("data-id");
    secondId = await page.locator(".game-card").nth(1).getAttribute("data-id");
    initialFirstStatus = await page.locator(`.game-card[data-id="${firstId}"]`).getAttribute("data-status");
    await markGame(firstId, "apostado");
    assert.equal(await page.textContent("#count-apostado"), "1");
    await markGame(firstId, "registrado");
    assert.equal(await page.textContent("#count-registrado"), "1");
    await markGame(firstId, initialFirstStatus || "pendente");
  });

  await test("Filtros de status, sistema, grupo e busca", async () => {
    await markGame(firstId, "apostado");
    await page.selectOption("#filter-status", "apostado");
    await page.waitForFunction(() => Number(document.querySelector("#visible-count")?.textContent) === 1);
    await resetFilters();

    await page.selectOption("#filter-system", config.firstSystem);
    await page.waitForFunction(total => {
      const value = Number(document.querySelector("#visible-count")?.textContent);
      return value > 0 && value < total;
    }, config.gameCount);
    await resetFilters();

    const group = await page.locator("#filter-group option").nth(1).getAttribute("value");
    await page.selectOption("#filter-group", group);
    await page.waitForFunction(total => {
      const value = Number(document.querySelector("#visible-count")?.textContent);
      return value > 0 && value < total;
    }, config.gameCount);
    await resetFilters();

    const searchValue = APP === "mega"
      ? await page.locator(`.game-card[data-id="${firstId}"]`).getAttribute("data-number")
      : String(firstId);
    await page.fill(config.searchInput, searchValue || "1");
    await page.waitForFunction(total => {
      const value = Number(document.querySelector("#visible-count")?.textContent);
      return value > 0 && value < total;
    }, config.gameCount);
    await resetFilters();
    await markGame(firstId, initialFirstStatus || "pendente");
  });

  await test("Exportação e importação de backup local", async () => {
    const downloadPromise = page.waitForEvent("download");
    await page.click(config.backupButton);
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /backup/i);

    const payload = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), config.walletStorage);
    const statuses = payload.statuses || payload;
    statuses[firstId] = "registrado";
    const importPayload = { ...payload, statuses };
    await page.locator("#import-file").setInputFiles({
      name: "qa-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(importPayload))
    });
    await page.waitForFunction(id => document.querySelector(`.game-card[data-id="${id}"]`)?.dataset.status === "registrado", firstId);
    await markGame(firstId, initialFirstStatus || "pendente");
  });

  await test("Validação do formulário de concurso oficial", async () => {
    await switchView("contests-view");
    await page.fill("#contest-number", "999901");
    await page.fill("#contest-date", "2026-08-03");
    await page.fill("#contest-numbers-text", config.contestNumbers.map(number => String(number).padStart(2, "0")).join(" "));
    assert.equal(await page.textContent("#contest-selected-count"), config.selectedCount);
    await page.click('#contest-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector("#contest-total-count")?.textContent === "1");
    assert.equal(await page.isVisible("#contest-analysis"), true);
    assert.match(await page.textContent("#contest-analysis"), new RegExp(config.expectedAnalysisText, "i"));
    assert.equal(await page.locator("#contest-history .history-item").count(), 1);
  });

  await test("Edição, busca, escopo e exportação do histórico oficial", async () => {
    await page.click("#contest-history .history-actions button:not(.danger-text)");
    await waitText("#contest-form-title", "Editar concurso 999901");
    await page.click("#contest-cancel-edit");
    await page.fill("#contest-search", "999901");
    assert.equal(await page.locator("#contest-history .history-item").count(), 1);
    await page.selectOption("#contest-scope", "apostado");
    await page.selectOption("#contest-scope", "all");
    const downloadPromise = page.waitForEvent("download");
    await page.click("#contest-export-history");
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /concursos/i);
    await page.fill("#contest-search", "");
  });

  await test("Importação por CSV e exclusão do histórico oficial", async () => {
    const csvNumbers = config.contestNumbers.map(number => String(number).padStart(2, "0")).join(";");
    const csv = `999902;03/08/2026;${csvNumbers}\n`;
    await page.locator("#contest-csv-file").setInputFiles({
      name: "qa-concursos.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv)
    });
    await page.waitForFunction(() => document.querySelector("#contest-total-count")?.textContent === "2");
    await page.click("#contest-clear-history");
    await page.waitForFunction(() => document.querySelector("#contest-total-count")?.textContent === "0");
  });

  await test("Consulta automática: interface, atualização e validação local", async () => {
    assert.equal(await page.locator("#official-refresh").count(), 1);
    assert.equal(await page.locator("#official-search-specific").count(), 1);
    await page.fill("#official-contest-number", "");
    await page.click("#official-search-specific");
    await page.waitForFunction(() => {
      const node = document.querySelector("#official-search-error");
      return node && !node.hidden && node.textContent.trim().length > 0;
    });
    await page.click("#official-refresh");
    await page.waitForFunction(() => !document.querySelector("#official-refresh")?.disabled, null, { timeout: 25000 });
    assert.ok((await page.textContent("#official-sync-title")).trim().length > 0);
  });

  await test("Apostas por concurso: registrar e destacar seleção", async () => {
    await switchView("wallet-view");
    await markGame(firstId, "apostado");
    await markGame(secondId, "apostado");
    await switchView("contests-view");
    await page.fill(config.betNumber, "999911");
    await page.click("#su-save-contest-bets");
    await page.waitForSelector(`${config.betHistory} button[data-contest="999911"]`);
    await page.click(`${config.betHistory} button[data-contest="999911"]`);
    await page.waitForSelector(`${config.betHistory} button[data-contest="999911"].is-selected`);
    assert.equal(await page.locator(`${config.betHistory} button[data-contest="999911"] .contest-selected-badge`).count(), 1);
    await waitText(`${config.betsRoot} .contest-selection-context`, "Concurso 999911");
  });

  await test("Apostas por concurso: concluir e reabrir", async () => {
    await page.click("#su-close-contest-bets");
    await page.waitForTimeout(1200);
    await page.waitForSelector(".game-card", { timeout: 15000 });
    await page.waitForSelector(config.betsRoot, { timeout: 25000 });
    await switchView("contests-view");
    await page.click(`${config.betHistory} button[data-contest="999911"]`);
    await page.waitForFunction(key => {
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      return data["999911"]?.status === "concluido";
    }, config.betsStorage);
    await page.waitForFunction(() => {
      const button = document.querySelector("#su-reopen-contest-bets");
      return button && !button.disabled;
    });
    await page.click("#su-reopen-contest-bets");
    await page.waitForFunction(key => {
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      return data["999911"]?.status === "ativo";
    }, config.betsStorage);
    await switchView("wallet-view");
    assert.equal(await page.locator(`.game-card[data-id="${firstId}"]`).getAttribute("data-status"), "apostado");
    assert.equal(await page.locator(`.game-card[data-id="${secondId}"]`).getAttribute("data-status"), "apostado");
  });

  await test("Apostas por concurso: exclusão do registro", async () => {
    await switchView("contests-view");
    await page.fill(config.betNumber, "999911");
    await page.click("#su-delete-contest-bets");
    await page.waitForFunction(key => {
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      return !data["999911"];
    }, config.betsStorage);
  });

  await test("Persistência local após recarregar", async () => {
    await switchView("wallet-view");
    await markGame(firstId, "registrado");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(`.game-card[data-id="${firstId}"]`);
    assert.equal(await page.locator(`.game-card[data-id="${firstId}"]`).getAttribute("data-status"), "registrado");
    await markGame(firstId, initialFirstStatus || "pendente");
  });

  await test("Funcionamento offline do núcleo e persistência", async () => {
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".game-card", { timeout: 15000 });
    await markGame(firstId, "apostado");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(`.game-card[data-id="${firstId}"]`, { timeout: 15000 });
    assert.equal(await page.locator(`.game-card[data-id="${firstId}"]`).getAttribute("data-status"), "apostado");
    await context.setOffline(false);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".game-card", { timeout: 15000 });
    await markGame(firstId, initialFirstStatus || "pendente");
    await markGame(secondId, "pendente");
  });

  await test("Manifesto, ícone e arquivos essenciais disponíveis", async () => {
    const paths = APP === "mega"
      ? ["manifest.json", "assets/icons/icon.svg", "styles.css", "contests.css", "service-worker.js"]
      : ["manifest.json", "icon.svg", "styles.css", "contests.css", "service-worker.js"];
    for (const path of paths) {
      const response = await page.request.get(new URL(path, BASE_URL).toString());
      assert.ok(response.ok(), `${path}: HTTP ${response.status()}`);
    }
  });

  await test("Ausência de erros JavaScript não tratados", async () => {
    assert.deepEqual(pageErrors, []);
  });
} catch (error) {
  record("Falha geral da auditoria", "fail", error?.stack || String(error));
} finally {
  await reportAndExit();
}
