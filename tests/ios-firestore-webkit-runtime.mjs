import assert from "node:assert/strict";
import { webkit } from "playwright";

const browser = await webkit.launch();
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(String(error)));

await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => globalThis.SULotoFirestoreTransport?.firestoreReady === true, null, { timeout: 20000 });
const diagnostics = await page.evaluate(() => globalThis.SULotoFirestoreTransport);

assert.equal(diagnostics.ios, true, "WebKit com UA de iPhone deve ser reconhecido como iOS");
assert.equal(diagnostics.mode, "ios-force-long-polling-memory-cache", "deve inicializar o modo resiliente iOS");
assert.equal(diagnostics.longPollingForced, true, "long-polling deve estar forçado no iOS");
assert.equal(diagnostics.persistentFirestoreCache, false, "cache persistente do Firestore deve ser desligado no iOS");

const transportErrors = errors.filter(message => /firestore|initialize|transport/i.test(message));
assert.deepEqual(transportErrors, [], `não deve haver erro de inicialização Firestore: ${transportErrors.join(" | ")}`);

console.log("WebKit runtime aprovado:", diagnostics);
await browser.close();
