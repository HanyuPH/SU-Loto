const EVENT_NAME = "su:state-change";
const KEYS = Object.freeze({
  statuses: "su-loto-c2-status-v4",
  contests: "su-loto-c2-contests-v1",
  contestBets: "su-loto-c2-contest-bets-v1"
});

const keyToDomain = new Map(Object.entries(KEYS).map(([domain, key]) => [key, domain]));
const timers = new Map();

function emit(domain, { source = "local", detail = null, delay = 0 } = {}) {
  if (!Object.hasOwn(KEYS, domain)) return;
  const dispatch = () => {
    timers.delete(domain);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: {
        domain,
        key: KEYS[domain],
        source,
        detail,
        at: new Date().toISOString()
      }
    }));
  };
  clearTimeout(timers.get(domain));
  if (delay > 0) timers.set(domain, setTimeout(dispatch, delay));
  else dispatch();
}

function subscribe(handler) {
  const listener = event => handler(event.detail || {});
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

window.addEventListener("storage", event => {
  const domain = keyToDomain.get(event.key);
  if (domain) emit(domain, { source: "storage", detail: { newValue: event.newValue } });
});

// Status dos jogos: o app salva antes do clique terminar; a leitura pela nuvem ocorre no próximo ciclo.
document.addEventListener("click", event => {
  if (event.target.closest?.(".game-card[data-id] .status-actions button[data-status]")) {
    emit("statuses", { source: "ui", delay: 0 });
  }
}, true);

// Concursos salvos pelo formulário, exclusões e limpeza do histórico.
document.addEventListener("submit", event => {
  if (event.target?.id === "contest-form") emit("contests", { source: "ui", delay: 0 });
}, true);

document.addEventListener("click", event => {
  if (
    event.target.closest?.("#contest-clear-history") ||
    event.target.closest?.("#contest-history [data-action=\"delete\"]")
  ) {
    emit("contests", { source: "ui", delay: 0 });
  }
}, true);

document.addEventListener("change", event => {
  if (event.target?.id === "contest-csv-file") emit("contests", { source: "ui", delay: 1200 });
});

// Importações programáticas, inclusive resultado oficial e restauração por outros módulos.
const contestsApi = globalThis.SULotoContests;
if (contestsApi?.importData && !contestsApi.__syncEventsWrapped) {
  const originalImport = contestsApi.importData.bind(contestsApi);
  contestsApi.importData = (...args) => {
    const result = originalImport(...args);
    if (result) emit("contests", { source: "api" });
    return result;
  };
  Object.defineProperty(contestsApi, "__syncEventsWrapped", { value: true });
}

window.addEventListener("su:contest-bets-updated", event => {
  emit("contestBets", { source: "contest-bets", detail: event.detail ?? null });
});

globalThis.SULotoSyncEvents = Object.freeze({
  EVENT_NAME,
  KEYS,
  emit,
  subscribe
});

export { EVENT_NAME, KEYS, emit, subscribe };
