import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "data", "carteira-c2", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const forbidden = new Set(["status", "initialStatus", "registered", "apostado", "pendente"]);
const games = [];

for (const shard of manifest.shards || []) {
  const payload = JSON.parse(await readFile(path.join(root, "data", "carteira-c2", shard.file), "utf8"));
  games.push(...(payload.games || []));
}

if (manifest.wallet !== "SU Loto - C2") throw new Error("Carteira inesperada.");
if (games.length !== 300) throw new Error(`Esperados 300 jogos; encontrados ${games.length}.`);
const signatures = new Set();

for (let index = 0; index < games.length; index += 1) {
  const game = games[index];
  const id = index + 1;
  if (Number(game.id) !== id) throw new Error(`ID canônico divergente: ${game.id} na posição ${id}.`);
  for (const key of Object.keys(game)) if (forbidden.has(key)) throw new Error(`Campo operacional ${key} encontrado no jogo ${id}.`);
  const expectedSystem = id <= 100 ? "Base preservada" : "Sistema Universal";
  if (game.system !== expectedSystem) throw new Error(`Sistema divergente no jogo ${id}.`);
  if (!Array.isArray(game.numbers) || game.numbers.length !== 15 || new Set(game.numbers).size !== 15) throw new Error(`Jogo ${id} inválido.`);
  if (game.numbers.some(number => !Number.isInteger(number) || number < 1 || number > 25)) throw new Error(`Faixa inválida no jogo ${id}.`);
  const signature = [...game.numbers].sort((a, b) => a - b).join("-");
  if (signatures.has(signature)) throw new Error(`Jogo duplicado no ID ${id}.`);
  signatures.add(signature);
}

console.log("Carteira C2 derivada validada: 300 jogos, 15 dezenas, IDs 001-300, sem estado operacional embutido.");
