const WALLET_MANIFEST_URL = "./data/carteira-c2/manifest.json";
const OPERATIONAL_MIGRATION_URL = "./data/migrations/v11-operational-seed.json";
const EXPECTED_WALLET = "SU Loto - C2";
const EXPECTED_GAME_COUNT = 300;
const FORBIDDEN_GAME_FIELDS = new Set(["status", "initialStatus", "registered", "apostado", "pendente"]);

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Falha ao carregar ${url} (HTTP ${response.status}).`);
  return response.json();
}

function expectedSystem(id) {
  return id <= 100 ? "Base preservada" : "Sistema Universal";
}

function expectedGroup(id) {
  if (id <= 50) return "001–050";
  if (id <= 100) return "051–100";
  if (id <= 150) return "101–150";
  if (id <= 200) return "151–200";
  if (id <= 250) return "201–250";
  return "251–300";
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") throw new Error("Manifesto da Carteira C2 inválido.");
  if (manifest.wallet !== EXPECTED_WALLET) throw new Error("Identificação inesperada da carteira.");
  if (manifest.rules?.gameCount !== EXPECTED_GAME_COUNT) throw new Error("Quantidade oficial de jogos divergente.");
  if (!Array.isArray(manifest.shards) || manifest.shards.length !== 6) throw new Error("Manifesto da carteira incompleto.");
}

function validateGames(games) {
  if (!Array.isArray(games) || games.length !== EXPECTED_GAME_COUNT) {
    throw new Error(`Carteira inválida: esperados ${EXPECTED_GAME_COUNT} jogos.`);
  }
  const signatures = new Set();
  games.forEach((game, index) => {
    const id = Number(game?.id);
    if (id !== index + 1) throw new Error(`ID canônico inválido na posição ${index + 1}.`);
    for (const key of Object.keys(game || {})) {
      if (FORBIDDEN_GAME_FIELDS.has(key)) throw new Error(`Campo operacional proibido no jogo ${id}: ${key}.`);
    }
    if (game.system !== expectedSystem(id)) throw new Error(`Sistema divergente no jogo ${id}.`);
    if (game.group !== expectedGroup(id)) throw new Error(`Grupo divergente no jogo ${id}.`);
    if (!Array.isArray(game.numbers) || game.numbers.length !== 15) throw new Error(`Jogo ${id} não possui 15 dezenas.`);
    const unique = new Set(game.numbers);
    if (unique.size !== 15 || game.numbers.some(number => !Number.isInteger(number) || number < 1 || number > 25)) {
      throw new Error(`Dezenas inválidas no jogo ${id}.`);
    }
    const signature = [...game.numbers].sort((a, b) => a - b).join("-");
    if (signatures.has(signature)) throw new Error(`Jogo duplicado detectado no ID ${id}.`);
    signatures.add(signature);
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

async function loadWallet() {
  const manifest = await fetchJson(WALLET_MANIFEST_URL);
  validateManifest(manifest);
  const shardPayloads = await Promise.all(
    manifest.shards.map(shard => fetchJson(`./data/carteira-c2/${shard.file}`))
  );
  const games = shardPayloads.flatMap(payload => Array.isArray(payload?.games) ? payload.games : []);
  validateGames(games);
  return { manifest, games };
}

async function loadOperationalMigration() {
  try {
    const payload = await fetchJson(OPERATIONAL_MIGRATION_URL);
    if (payload?.wallet !== "C2" || payload?.type !== "operational-migration") return {};
    const ids = Array.isArray(payload.legacyActiveIds) ? payload.legacyActiveIds : [];
    return Object.fromEntries(ids.map(id => [String(id), "apostado"]));
  } catch (error) {
    console.warn("SU Loto: migração operacional v11 indisponível; usando Pendente como padrão.", error);
    return {};
  }
}

async function loadApplication() {
  const [{ manifest, games }, operationalSeed] = await Promise.all([loadWallet(), loadOperationalMigration()]);
  globalThis.SU_LOTO_WALLET_MANIFEST = deepFreeze(manifest);
  globalThis.SU_LOTO_GAMES = deepFreeze(games);
  globalThis.SU_LOTO_OPERATIONAL_SEED = deepFreeze(operationalSeed);

  await import("./contests.js");
  await import("./app.js");
  await import("./official-results.js");

  const localModules = import("./beta-layout-review.js?v=2")
    .then(() => import("./prize-analysis.js?v=2"))
    .then(() => import("./contest-bets.js?v=4"))
    .then(() => import("./contest-lock.js?v=1"))
    .then(() => import("./contest-session.js?v=1"))
    .catch(error => console.error("SU Loto módulos locais:", error));

  const cloudModules = import("./cloud-sync.js")
    .then(() => import("./ecosystem-ui.js?v=5"))
    .then(() => import("./ecosystem-backup.js"))
    .then(() => localModules)
    .then(() => import("./contest-bets-cloud.js?v=3"))
    .catch(error => console.warn("SU Loto nuvem indisponível:", error));

  await Promise.allSettled([localModules, cloudModules]);
}

loadApplication().catch(error => {
  console.error("SU Loto: falha ao iniciar a aplicação.", error);
  const status = document.getElementById("save-status");
  if (status) status.textContent = "Falha ao validar ou carregar a Carteira Oficial C2.";
  const host = document.getElementById("games");
  if (host) {
    host.innerHTML = `<div class="empty"><strong>Aplicativo não iniciado.</strong><br>${String(error.message || error)}</div>`;
  }
});
