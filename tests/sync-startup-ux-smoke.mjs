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
  await page.waitForFunction(() => Boolean(globalThis.SULotoLocalFirstGuard), null, { timeout: 30_000 });

  await page.evaluate(() => {
    let root = document.getElementById("su-loto-cloud-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "su-loto-cloud-root";
      document.body.appendChild(root);
    }
    let button = document.getElementById("su-loto-cloud-status");
    if (!button) {
      button = document.createElement("button");
      button.id = "su-loto-cloud-status";
      button.className = "su-loto-cloud-btn";
      root.appendChild(button);
    }
    let label = document.getElementById("su-loto-cloud-text");
    if (!label) {
      label = document.createElement("span");
      label.id = "su-loto-cloud-text";
      button.appendChild(label);
    }
  });

  async function assertCompact(text) {
    await page.evaluate(value => {
      const button = document.getElementById("su-loto-cloud-status");
      const label = document.getElementById("su-loto-cloud-text");
      button.dataset.state = "saving";
      label.textContent = value;
    }, text);
    await page.waitForFunction(() => document.getElementById("su-loto-cloud-root")?.dataset.syncQuiet === "true", null, { timeout: 2_000 });
    assert.equal(await page.locator("#su-loto-cloud-root").getAttribute("data-sync-quiet"), "true", `${text} deve ficar compacto`);
  }

  await assertCompact("Verificando login…");
  await assertCompact("Preparando sincronização…");
  await assertCompact("Conectando à nuvem…");
  await assertCompact("Conexão lenta • sincronizando…");
  await assertCompact("Reconectando…");

  await page.evaluate(() => {
    const button = document.getElementById("su-loto-cloud-status");
    const label = document.getElementById("su-loto-cloud-text");
    button.dataset.state = "saving";
    label.textContent = "Sincronizando…";
  });
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#su-loto-cloud-root").getAttribute("data-sync-quiet"), "false", "Sincronização manual deve continuar visível");

  console.log(`UX de startup ${engineName} aprovada: conexão automática compacta; ação manual continua visível.`);
} finally {
  await browser.close();
}
