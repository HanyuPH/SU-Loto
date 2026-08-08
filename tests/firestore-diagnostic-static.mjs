import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("diagnostics/firestore-diagnostic.js", "utf8");
const html = fs.readFileSync("diagnostics/firestore.html", "utf8");

assert.ok(source.includes("getDocsFromServer"), "diagnóstico deve testar leitura SDK diretamente do servidor");
assert.ok(source.includes("firestore.googleapis.com/v1/projects/"), "diagnóstico deve testar REST HTTPS do Firestore");
assert.ok(source.includes('method: "GET"'), "sonda REST deve ser somente leitura");
assert.ok(!/\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/.test(source), "diagnóstico não pode importar ou chamar operações de escrita Firestore");
assert.ok(!/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(source), "diagnóstico REST não pode escrever");
assert.ok(!source.includes("localStorage.setItem"), "diagnóstico não deve alterar estado operacional local");
assert.ok(!source.includes("data/carteira-c2"), "diagnóstico não deve acessar a Carteira C2");
assert.ok(html.includes("SOMENTE LEITURA"), "página deve identificar explicitamente o escopo somente leitura");
assert.ok(html.includes("não inclui senha, token de autenticação, UID completo"), "página deve informar a proteção de dados do relatório");
console.log("Diagnóstico Firestore aprovado como ferramenta somente leitura e fora da Carteira C2.");
