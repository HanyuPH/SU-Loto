(() => {
  "use strict";

  const APP_NAME = "SU Loto";
  const KEY = "su-loto-c2-contest-bets-v1";
  const PRICE_KEY = "su-loto-bet-price-v1";
  const LAST_CONTEST_KEY = "su-loto-last-bet-contest-v1";
  const STATUS_KEY = "su-loto-c2-status-v4";
  const games = Array.isArray(globalThis.SU_LOTO_GAMES) ? globalThis.SU_LOTO_GAMES : [];
  const gameById = new Map(games.map(game => [String(game.id), game]));
  const validGameIds = new Set(games.map(game => String(game.id)));
  let toastTimer = null;

  function parse(raw, fallback) {
    try { return JSON.parse(raw ?? ""); } catch { return fallback; }
  }

  function normalizeRow(row, key) {
    const contest = Number(row?.contest ?? key);
    if (!Number.isInteger(contest) || contest < 1) return null;
    const savedAt = String(row?.savedAt || new Date().toISOString());
    return {
      contest,
      type: row?.type === "especial" ? "especial" : "normal",
      specialName: String(row?.specialName || "").trim(),
      status: row?.status === "concluido" ? "concluido" : "ativo",
      gameIds: Array.isArray(row?.gameIds) ? row.gameIds.map(String) : [],
      unitPrice: Math.max(0, Number(row?.unitPrice) || 0),
      totalInvested: Math.max(0, Number(row?.totalInvested) || 0),
      createdAt: String(row?.createdAt || savedAt),
      savedAt,
      updatedAt: String(row?.updatedAt || row?.concludedAt || savedAt),
      concludedAt: String(row?.concludedAt || ""),
      releaseStatus: row?.releaseStatus === "registrado" ? "registrado" : "pendente"
    };
  }

  function load() {
    const raw = parse(localStorage.getItem(KEY), {});
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const output = {};
    for (const [key, row] of Object.entries(source)) {
      const normalized = normalizeRow(row, key);
      if (normalized) output[String(normalized.contest)] = normalized;
    }
    return output;
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error("SU Loto apostas por concurso:", error);
      return false;
    }
  }

  function currentStatuses() {
    const payload = parse(localStorage.getItem(STATUS_KEY), {});
    const statuses = payload?.statuses || payload || {};
    return statuses && typeof statuses === "object" ? { ...statuses } : {};
  }

  function persistStatuses(statuses) {
    const payload = {
      app: APP_NAME,
      wallet: "C2",
      schema: 2,
      savedAt: new Date().toISOString(),
      statuses
    };
    try {
      const value = JSON.stringify(payload);
      localStorage.setItem(STATUS_KEY, value);
      window.dispatchEvent(new StorageEvent("storage", { key: STATUS_KEY, newValue: value }));
      return true;
    } catch (error) {
      console.error("SU Loto alteração de concurso:", error);
      return false;
    }
  }

  function currentBetGameIds() {
    const statuses = currentStatuses();
    return games
      .filter(game => (statuses[game.id] || game.initialStatus || "pendente") === "apostado")
      .map(game => String(game.id));
  }

  function rows(data = load()) {
    return Object.values(data)
      .filter(row => Number.isInteger(Number(row?.contest)) && Number(row.contest) > 0)
      .sort((a, b) => Number(b.contest) - Number(a.contest));
  }

  function money(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
  }

  function dateTime(value) {
    if (!value) return "—";
    try { return new Date(value).toLocaleString("pt-BR"); } catch { return "data indisponível"; }
  }

  function contestLabel(row) {
    if (row.type === "especial") return row.specialName || "Concurso especial";
    return "Concurso normal";
  }

  function statusLabel(row) {
    return row.status === "concluido" ? "Concluído" : "Ativo";
  }

  function announce(message) {
    if (globalThis.SULotoApp?.toast) {
      globalThis.SULotoApp.toast(message);
      return;
    }
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    requestAnimationFrame(() => toast.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2100);
  }

  function ensureStyles() {
    if (document.getElementById("su-loto-contest-bets-style")) return;
    const style = document.createElement("style");
    style.id = "su-loto-contest-bets-style";
    style.textContent = `
      .contest-bets-box{margin-top:14px;padding:16px;border:1px solid #eadff0;border-radius:16px;background:#fbf7fc}
      .contest-bets-box h3{margin:0 0 6px}.contest-bets-box p{margin:0 0 12px;color:#6b6470}
      .contest-bets-box label{display:grid;gap:6px;margin:10px 0;font-weight:800}
      .contest-bets-box input,.contest-bets-box select{width:100%;box-sizing:border-box;font:inherit;padding:11px;border:1px solid #dfd2e5;border-radius:10px;background:#fff}
      .contest-bets-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:stretch}
      .contest-bets-actions .button{min-height:46px;display:flex;align-items:center;justify-content:center;text-align:center}
      .contest-bets-actions .save-current,.contest-bets-actions .danger{grid-column:1/-1}
      .contest-bets-summary{margin-top:12px;padding:12px;border-radius:12px;background:#fff;border:1px solid #eadff0;line-height:1.5}
      .contest-bets-status{display:inline-block;margin-left:6px;padding:3px 7px;border-radius:999px;font-size:.75rem;font-weight:900;background:#e5f5eb;color:#12643f}
      .contest-bets-status.concluded{background:#eef0ef;color:#6b6470}
      .contest-bets-history{margin-top:14px}.contest-bets-history h4{margin:0 0 8px}
      .contest-bets-history-list{display:grid;gap:8px}.contest-bets-history-list button{width:100%;padding:11px 12px;border:1px solid #e7dceb;border-radius:12px;background:#fff;text-align:left;font:inherit;color:inherit}
      .contest-bets-history-list button strong,.contest-bets-history-list button span{display:block}.contest-bets-history-list button span{margin-top:3px;color:#6b6470;font-size:.86rem}
      .contest-bets-history-list button[data-status="concluido"]{background:#f7f8f7}
      .contest-bets-empty{padding:10px 0;color:#6b6470}
      @media(max-width:560px){.contest-bets-actions{grid-template-columns:1fr}.contest-bets-actions .save-current,.contest-bets-actions .danger{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function inject() {
    const host = document.querySelector(".contest-tools-card .tool-stack") || document.getElementById("contests-view");
    if (!host || document.getElementById("su-loto-contest-bets")) return false;

    ensureStyles();
    const box = document.createElement("section");
    box.id = "su-loto-contest-bets";
    box.className = "contest-bets-box";
    box.innerHTML = `
      <h3>Apostas por concurso</h3>
      <p>Registre uma fotografia das apostas, conclua o concurso e libere a Carteira para o próximo — normal ou especial.</p>
      <label><span>Concurso</span><input id="su-loto-bet-contest" type="number" min="1" inputmode="numeric" placeholder="Ex.: 3750"></label>
      <label><span>Tipo do concurso</span><select id="su-loto-bet-type"><option value="normal">Normal</option><option value="especial">Especial</option></select></label>
      <label id="su-loto-bet-special-label" hidden><span>Nome do concurso especial</span><input id="su-loto-bet-special-name" type="text" maxlength="80" placeholder="Ex.: Lotofácil da Independência"></label>
      <label><span>Valor por aposta</span><input id="su-loto-bet-price" type="number" min="0" step="0.01" value="${localStorage.getItem(PRICE_KEY) || "3.50"}"></label>
      <label><span>Ao concluir, devolver os jogos para</span><select id="su-loto-bet-release"><option value="pendente">Pendente</option><option value="registrado">Registrado</option></select></label>
      <div class="contest-bets-actions">
        <button id="su-loto-save-contest-bets" class="button primary save-current" type="button">Registrar apostas atuais</button>
        <button id="su-loto-close-contest-bets" class="button" type="button">Concluir concurso</button>
        <button id="su-loto-reopen-contest-bets" class="button" type="button" hidden>Reabrir concurso</button>
        <button id="su-loto-delete-contest-bets" class="button danger" type="button">Excluir registro</button>
      </div>
      <div id="su-loto-bet-summary" class="contest-bets-summary">Nenhum concurso selecionado.</div>
      <div class="contest-bets-history">
        <h4>Registros salvos</h4>
        <div id="su-loto-bet-history" class="contest-bets-history-list"></div>
      </div>
    `;
    host.appendChild(box);

    const number = document.getElementById("su-loto-bet-contest");
    const type = document.getElementById("su-loto-bet-type");
    const specialLabel = document.getElementById("su-loto-bet-special-label");
    const specialName = document.getElementById("su-loto-bet-special-name");
    const price = document.getElementById("su-loto-bet-price");
    const release = document.getElementById("su-loto-bet-release");
    const saveButton = document.getElementById("su-loto-save-contest-bets");
    const closeButton = document.getElementById("su-loto-close-contest-bets");
    const reopenButton = document.getElementById("su-loto-reopen-contest-bets");
    const summary = document.getElementById("su-loto-bet-summary");
    const history = document.getElementById("su-loto-bet-history");

    function refreshSpecialField() {
      specialLabel.hidden = type.value !== "especial";
      if (specialLabel.hidden) specialName.value = "";
    }

    function setActionState(row) {
      const hasRow = Boolean(row);
      const concluded = row?.status === "concluido";
      saveButton.disabled = concluded;
      saveButton.textContent = !hasRow ? "Registrar apostas atuais" : concluded ? "Concurso concluído" : "Atualizar apostas do concurso";
      closeButton.hidden = concluded;
      closeButton.disabled = !hasRow || concluded;
      reopenButton.hidden = !concluded;
      reopenButton.disabled = !concluded;
    }

    function renderCurrent() {
      const contest = String(number.value || "").trim();
      const row = load()[contest];
      setActionState(row);
      if (!contest) {
        summary.textContent = "Nenhum concurso selecionado. Marque os jogos como Apostado e registre o próximo concurso.";
        type.value = "normal";
        specialName.value = "";
        refreshSpecialField();
        return;
      }
      localStorage.setItem(LAST_CONTEST_KEY, contest);
      if (!row) {
        summary.textContent = `Concurso ${contest}: nenhuma aposta vinculada.`;
        return;
      }
      type.value = row.type;
      specialName.value = row.specialName;
      release.value = row.releaseStatus;
      price.value = String(Number(row.unitPrice) || Number(price.value) || 3.5);
      refreshSpecialField();
      summary.innerHTML = `<strong>Concurso ${contest}</strong><span class="contest-bets-status ${row.status === "concluido" ? "concluded" : ""}">${statusLabel(row)}</span><br>${contestLabel(row)} • ${row.gameIds.length} jogos • ${money(row.totalInvested)}<br><small>Registrado em ${dateTime(row.savedAt)}${row.concludedAt ? ` • concluído em ${dateTime(row.concludedAt)}` : ""}</small>`;
    }

    function renderHistory() {
      const savedRows = rows();
      if (!savedRows.length) {
        history.innerHTML = '<div class="contest-bets-empty">Nenhuma aposta por concurso foi registrada.</div>';
        return;
      }
      history.innerHTML = savedRows.map(row => `
        <button type="button" data-contest="${row.contest}" data-status="${row.status}">
          <strong>Concurso ${row.contest} • ${statusLabel(row)}</strong>
          <span>${contestLabel(row)} • ${row.gameIds.length} jogos • ${money(row.totalInvested)} • ${dateTime(row.savedAt)}</span>
        </button>
      `).join("");
    }

    function renderAll() {
      renderCurrent();
      renderHistory();
    }

    number.addEventListener("input", renderCurrent);
    type.addEventListener("change", refreshSpecialField);
    price.addEventListener("change", () => localStorage.setItem(PRICE_KEY, price.value));
    history.addEventListener("click", event => {
      const button = event.target.closest("button[data-contest]");
      if (!button) return;
      number.value = button.dataset.contest;
      renderCurrent();
    });

    saveButton.addEventListener("click", () => {
      const contest = Number(number.value);
      const unitPrice = Number(price.value);
      if (!Number.isInteger(contest) || contest < 1) return alert("Informe um concurso válido.");
      if (!(unitPrice >= 0)) return alert("Informe um valor válido.");

      const data = load();
      const existing = data[String(contest)];
      if (existing?.status === "concluido") return alert("Este concurso está concluído. Use Reabrir concurso antes de atualizar as apostas.");

      const gameIds = currentBetGameIds();
      if (!gameIds.length && !confirm("Nenhum jogo está marcado como Apostado. Salvar mesmo assim?")) return;

      const now = new Date().toISOString();
      data[String(contest)] = {
        contest,
        type: type.value === "especial" ? "especial" : "normal",
        specialName: type.value === "especial" ? specialName.value.trim() : "",
        status: "ativo",
        gameIds,
        unitPrice,
        totalInvested: gameIds.length * unitPrice,
        createdAt: existing?.createdAt || now,
        savedAt: now,
        updatedAt: now,
        concludedAt: "",
        releaseStatus: release.value === "registrado" ? "registrado" : "pendente"
      };
      if (!save(data)) return alert("Não foi possível salvar as apostas neste dispositivo.");

      localStorage.setItem(PRICE_KEY, String(unitPrice));
      localStorage.setItem(LAST_CONTEST_KEY, String(contest));
      renderAll();
      announce(existing ? "Apostas do concurso atualizadas" : "Apostas do concurso salvas");
      window.dispatchEvent(new CustomEvent("su:contest-bets-updated", { detail: data[String(contest)] }));
    });

    closeButton.addEventListener("click", () => {
      const contest = String(number.value || "").trim();
      const data = load();
      const row = data[contest];
      if (!contest || !row) return alert("Selecione um concurso registrado.");
      if (row.status === "concluido") return;

      const destination = release.value === "registrado" ? "registrado" : "pendente";
      const destinationLabel = destination === "registrado" ? "Registrado" : "Pendente";
      if (!confirm(`Concluir o concurso ${contest}? Os jogos vinculados sairão do status Apostado e voltarão para ${destinationLabel}. O histórico será preservado.`)) return;

      const otherActiveIds = new Set(
        rows(data)
          .filter(item => String(item.contest) !== contest && item.status !== "concluido")
          .flatMap(item => item.gameIds)
          .map(String)
      );
      const statuses = currentStatuses();
      let released = 0;
      let preserved = 0;
      for (const id of row.gameIds) {
        const key = String(id);
        if (otherActiveIds.has(key)) {
          preserved += 1;
          continue;
        }
        if ((statuses[key] || gameById.get(key)?.initialStatus || "pendente") === "apostado") {
          statuses[key] = destination;
          released += 1;
        }
      }

      if (!persistStatuses(statuses)) return alert("Não foi possível liberar os jogos da Carteira.");
      const now = new Date().toISOString();
      data[contest] = {
        ...row,
        status: "concluido",
        releaseStatus: destination,
        concludedAt: now,
        updatedAt: now
      };
      if (!save(data)) return alert("Não foi possível concluir o concurso.");

      localStorage.removeItem(LAST_CONTEST_KEY);
      window.dispatchEvent(new CustomEvent("su:contest-bets-updated", { detail: data[contest] }));
      announce(`Concurso concluído • ${released} jogos liberados${preserved ? ` • ${preserved} preservados em outro concurso ativo` : ""}`);
      setTimeout(() => location.reload(), 850);
    });

    reopenButton.addEventListener("click", () => {
      const contest = String(number.value || "").trim();
      const data = load();
      const row = data[contest];
      if (!contest || !row) return alert("Selecione um concurso registrado.");
      if (row.status !== "concluido") return;

      if (!confirm(`Reabrir o concurso ${contest}? Os ${row.gameIds.length} jogos registrados voltarão ao status Apostado. Depois você poderá marcar novos jogos e atualizar o concurso.`)) return;

      const statuses = currentStatuses();
      let restored = 0;
      for (const id of row.gameIds) {
        const key = String(id);
        if (!validGameIds.has(key)) continue;
        if (statuses[key] !== "apostado") {
          statuses[key] = "apostado";
          restored += 1;
        }
      }
      if (!persistStatuses(statuses)) return alert("Não foi possível restaurar os jogos do concurso.");

      const now = new Date().toISOString();
      data[contest] = {
        ...row,
        status: "ativo",
        concludedAt: "",
        updatedAt: now
      };
      if (!save(data)) return alert("Não foi possível reabrir o concurso.");

      localStorage.setItem(LAST_CONTEST_KEY, contest);
      window.dispatchEvent(new CustomEvent("su:contest-bets-updated", { detail: data[contest] }));
      announce(`Concurso reaberto • ${restored} jogos restaurados como Apostado`);
      setTimeout(() => location.reload(), 850);
    });

    document.getElementById("su-loto-delete-contest-bets").addEventListener("click", () => {
      const contest = String(number.value || "").trim();
      const data = load();
      if (!contest || !data[contest]) return;
      if (!confirm(`Excluir o registro do concurso ${contest}? A situação atual dos jogos não será alterada.`)) return;
      delete data[contest];
      if (!save(data)) return alert("Não foi possível excluir o registro.");
      const nextActive = rows(data).find(row => row.status !== "concluido");
      number.value = nextActive ? String(nextActive.contest) : "";
      localStorage.setItem(LAST_CONTEST_KEY, number.value);
      renderAll();
      announce("Registro de apostas excluído");
      window.dispatchEvent(new CustomEvent("su:contest-bets-updated", { detail: null }));
    });

    const savedRows = rows();
    const activeRows = savedRows.filter(row => row.status !== "concluido");
    const lastContest = localStorage.getItem(LAST_CONTEST_KEY);
    number.value = lastContest && load()[lastContest]?.status !== "concluido"
      ? lastContest
      : (activeRows[0] ? String(activeRows[0].contest) : "");
    refreshSpecialField();
    renderAll();

    window.addEventListener("storage", event => {
      if (event.key === KEY) renderAll();
    });
    window.addEventListener("su:contest-bets-cloud-updated", renderAll);
    return true;
  }

  if (!inject()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (inject() || attempts >= 50) clearInterval(timer);
    }, 300);
  }

  globalThis.SULotoContestBets = {
    get: contest => load()[String(contest)] || null,
    all: load
  };
})();
