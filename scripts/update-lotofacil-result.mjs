import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const API_BASE = process.env.CAIXA_LOTOFACIL_API || "https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil";
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const LATEST_PATH = path.join(DATA_DIR, "ultimo-concurso.json");
const ARCHIVE_PATH = path.join(DATA_DIR, "concursos-oficiais.json");
const CSV_PATH = path.join(DATA_DIR, "concursos-oficiais.csv");
const requestedContest = String(process.env.CONTEST_NUMBER || "").trim();

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function formatDateBr(value) {
  const normalized = normalizeDate(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeNumbers(values) {
  const input = Array.isArray(values) ? values : String(values || "").match(/\d{1,2}/g) || [];
  const numbers = [...new Set(input.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 25))].sort((a, b) => a - b);
  if (numbers.length !== 15) throw new Error(`Resultado inválido: esperadas 15 dezenas, recebidas ${numbers.length}.`);
  return numbers;
}

function normalizePrizeTiers(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const description = String(item?.descricaoFaixa || item?.description || "").trim();
      const hitMatch = description.match(/\d+/);
      const hits = Number(item?.hits ?? hitMatch?.[0] ?? (16 - Number(item?.faixa || 0)));
      return {
        hits,
        winners: Math.max(0, Number(item?.numeroDeGanhadores ?? item?.winners) || 0),
        prize: Math.max(0, Number(item?.valorPremio ?? item?.prize) || 0),
        description: description || `${hits} acertos`,
      };
    })
    .filter((item) => Number.isInteger(item.hits) && item.hits >= 11 && item.hits <= 15)
    .sort((a, b) => b.hits - a.hits);
}

function normalizeCaixaPayload(payload, fetchedAt = new Date().toISOString()) {
  if (!payload || typeof payload !== "object") throw new Error("A CAIXA retornou uma resposta vazia.");
  if (payload.tipoJogo && String(payload.tipoJogo).toUpperCase() !== "LOTOFACIL") {
    throw new Error(`Tipo de jogo inesperado: ${payload.tipoJogo}`);
  }

  const number = Number(payload.numero ?? payload.number);
  const date = normalizeDate(payload.dataApuracao ?? payload.date);
  const numbers = normalizeNumbers(payload.listaDezenas ?? payload.numbers);
  const drawOrder = Array.isArray(payload.dezenasSorteadasOrdemSorteio)
    ? payload.dezenasSorteadasOrdemSorteio.map(Number).filter((n) => n >= 1 && n <= 25)
    : [];

  if (!Number.isInteger(number) || number < 1) throw new Error("Número do concurso inválido.");
  if (!date) throw new Error("Data de apuração inválida.");

  const nextNumber = Number(payload.numeroConcursoProximo ?? payload.nextContest?.number);
  const nextDate = normalizeDate(payload.dataProximoConcurso ?? payload.nextContest?.date);
  const estimatedPrize = Math.max(0, Number(payload.valorEstimadoProximoConcurso ?? payload.nextContest?.estimatedPrize) || 0);

  return {
    schemaVersion: 1,
    game: "LOTOFACIL",
    number,
    date,
    numbers,
    drawOrder,
    source: `${API_BASE}/${number}`,
    official: true,
    updatedAt: fetchedAt,
    accumulated: Boolean(payload.acumulado ?? payload.accumulated),
    location: String(payload.nomeMunicipioUFSorteio || payload.localSorteio || payload.location || "").trim(),
    prizeTiers: normalizePrizeTiers(payload.listaRateioPremio ?? payload.prizeTiers),
    nextContest: Number.isInteger(nextNumber) && nextNumber > 0
      ? { number: nextNumber, date: nextDate, estimatedPrize }
      : null,
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(results) {
  const headers = [
    "Concurso",
    "Data",
    ...Array.from({ length: 15 }, (_, index) => `N${String(index + 1).padStart(2, "0")}`),
    "Fonte",
    "Oficial",
    "AtualizadoEm",
  ];

  const rows = [...results]
    .sort((a, b) => Number(a.number) - Number(b.number))
    .map((item) => {
      const numbers = normalizeNumbers(item.numbers).map((n) => String(n).padStart(2, "0"));
      return [
        Number(item.number),
        formatDateBr(item.date),
        ...numbers,
        item.source || `${API_BASE}/${item.number}`,
        item.official !== false,
        item.updatedAt || "",
      ];
    });

  return `${[headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function comparable(result) {
  if (!result || typeof result !== "object") return null;
  const clone = structuredClone(result);
  delete clone.updatedAt;
  return clone;
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "SU-Loto-GitHub-Actions/1.0",
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 2500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Falha ao consultar a CAIXA: ${lastError?.message || "erro desconhecido"}`);
}

async function loadPayload() {
  const fixture = process.env.CAIXA_LOTOFACIL_FIXTURE;
  if (fixture) return JSON.parse(await readFile(path.resolve(fixture), "utf8"));
  const url = requestedContest ? `${API_BASE}/${requestedContest}` : API_BASE;
  return fetchWithRetry(url);
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const payload = await loadPayload();
  const fetchedAt = new Date().toISOString();
  const result = normalizeCaixaPayload(payload, fetchedAt);

  const existingLatest = await readJson(LATEST_PATH, null);
  const existingArchivePayload = await readJson(ARCHIVE_PATH, { schemaVersion: 1, game: "LOTOFACIL", results: [] });
  const existingArchive = Array.isArray(existingArchivePayload)
    ? existingArchivePayload
    : Array.isArray(existingArchivePayload.results)
      ? existingArchivePayload.results
      : [];

  const archiveMap = new Map(existingArchive.map((item) => [Number(item.number), item]));
  const existingRecord = archiveMap.get(result.number);
  const recordChanged = JSON.stringify(comparable(existingRecord)) !== JSON.stringify(comparable(result));
  if (!recordChanged && existingRecord?.updatedAt) result.updatedAt = existingRecord.updatedAt;
  archiveMap.set(result.number, result);

  const results = [...archiveMap.values()]
    .filter((item) => Number.isInteger(Number(item.number)))
    .sort((a, b) => Number(b.number) - Number(a.number))
    .slice(0, 500);

  const archiveOutput = { schemaVersion: 1, game: "LOTOFACIL", results };
  const latestShouldChange = !existingLatest || result.number >= Number(existingLatest.number || 0);
  const latestCandidate = latestShouldChange ? result : existingLatest;
  if (latestShouldChange && JSON.stringify(comparable(existingLatest)) === JSON.stringify(comparable(result)) && existingLatest?.updatedAt) {
    latestCandidate.updatedAt = existingLatest.updatedAt;
  }

  await writeFile(ARCHIVE_PATH, `${JSON.stringify(archiveOutput, null, 2)}\n`, "utf8");
  await writeFile(LATEST_PATH, `${JSON.stringify(latestCandidate, null, 2)}\n`, "utf8");
  await writeFile(CSV_PATH, buildCsv(results), "utf8");

  console.log(`Concurso ${result.number} validado: ${result.numbers.map((n) => String(n).padStart(2, "0")).join(" ")}`);
  console.log(latestShouldChange ? "Arquivo do último concurso verificado." : "Concurso histórico adicionado sem alterar o último concurso.");
  console.log("JSON e CSV operacionais sincronizados pela mesma execução.");
}

export {
  buildCsv,
  formatDateBr,
  normalizeCaixaPayload,
  normalizeDate,
  normalizeNumbers,
  normalizePrizeTiers,
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
