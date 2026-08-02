(() => {
  "use strict";

  const KEY = "su-loto-c2-contest-bets-v1";
  const PRICE_KEY = "su-loto-bet-price-v1";
  const STATUS_KEY = "su-loto-c2-status-v4";
  const games = Array.isArray(globalThis.SU_LOTO_GAMES) ? globalThis.SU_LOTO_GAMES : [];
  let toastTimer = null;

  function parse(raw, fallback) {
    try { return JSON.parse(raw ?? ""); } catch { return fallback; }
  }

  function load() {
    const data = parse(localStorage.getItem(KEY), {});
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function currentStatuses() {
    const payload = parse(localStorage.getItem(STATUS_KEY), {});
    const saved = payload?.statuses || payload || {};
    return saved && typeof saved === "object" ? saved : {};
  }

  function currentBetGameIds() {
    const saved = currentStatuses();
    return games
      .filter(game => (saved[game.id] || game.initialStatus || "pendente") === "apostado")
      .map(game => game.id);
  }

  function money(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
  }

  function announce(message) {
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
      .contest-bets-box input{width:100%;box-sizing:border-box;font:inherit;padding:11px;border:1px solid #dfd2e5;border-radius:10px}
      .contest-bets-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:stretch}
      .contest-bets-actions .button{min-height:46px;display:flex;align-items:center;justify-content:center;text-align:center}
      .contest-bets-summary{margin-top:12px;padding:12px;border-radius:12px;background:#fff;border:1px solid #eadff0;line-height:1.5}
      @media(max-width:560px){.contest-bets-actions{grid-template-columns:1fr}}
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
      <p>Salve uma fotografia dos jogos atualmente marcados como Apostado para um concurso específico.</p>
      <label><span>Concurso</span><input id="su-loto-bet-contest" type="number" min="1" inputmode="numeric" placeholder="Ex.: 3750"></label>
      <label><span>Valor por aposta</span><input id="su-loto-bet-price" type="number" min="0" step="0.01" value="${localStorage.getItem(PRICE_KEY) || "3.50"}"></label>
      <div class="contest-bets-actions">
        <button id="su-loto-save-contest-bets" class="button primary" type="button">Registrar apostas atuais</button>
        <button id="su-loto-delete-contest-bets" class="button danger" type="button">Excluir registro</button>
      </div>
      <div id="su-loto-bet-summary" class="contest-bets-summary">Nenhum concurso selecionado.</div>
    `;
    host.appendChild(box);

    const number = document.getElementById("su-loto-bet-contest");
    const price = document.getElementById("su-loto-bet-price");
    const summary = document.getElementById("su-loto-bet-summary");

    function render() {
      const contest = String(number.value || "").trim();
      const row = load()[contest];
      if (!contest) {
        summary.textContent = "Nenhum concurso selecionado.";
        return;
      }
      if (!row) {
        summary.textContent = `Concurso ${contest}: nenhuma aposta vinculada.`;
        return;
      }
      summary.innerHTML = `<strong>Concurso ${contest}</strong><br>${row.gameIds.length} jogos apostados • ${money(row.totalInvested)}<br><small>Registrado em ${new Date(row.savedAt).toLocaleString("pt-BR")}</small>`;
    }

    number.addEventListener("input", render);
    price.addEventListener("change", () => localStorage.setItem(PRICE_KEY, price.value));

    document.getElementById("su-loto-save-contest-bets").addEventListener("click", () => {
      const contest = Number(number.value);
      const unitPrice = Number(price.value);
      if (!Number.isInteger(contest) || contest < 1) return alert("Informe um concurso válido.");
      if (!(unitPrice >= 0)) return alert("Informe um valor válido.");

      const gameIds = currentBetGameIds();
      if (!gameIds.length && !confirm("Nenhum jogo está marcado como Apostado. Salvar mesmo assim?")) return;

      const data = load();
      data[contest] = {
        contest,
        gameIds,
        unitPrice,
        totalInvested: gameIds.length * unitPrice,
        savedAt: new Date().toISOString()
      };
      save(data);
      localStorage.setItem(PRICE_KEY, String(unitPrice));
      render();
      announce("Apostas do concurso registradas");
      window.dispatchEvent(new CustomEvent("su:contest-bets-updated", { detail: data[contest] }));
    });

    document.getElementById("su-loto-delete-contest-bets").addEventListener("click", () => {
      const contest = String(number.value || "").trim();
      const data = load();
      if (!contest || !data[contest]) return;
      if (!confirm(`Excluir as apostas vinculadas ao concurso ${contest}?`)) return;
      delete data[contest];
      save(data);
      render();
      announce("Registro de apostas excluído");
    });

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
