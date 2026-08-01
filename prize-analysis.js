(() => {
  "use strict";
  const ARCHIVE_URL = "./data/concursos-oficiais.json";
  const CAIXA_API = "https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil";
  const UNIT_COST_KEY = "su-loto-unit-cost-v1";
  const DEFAULT_UNIT_COST = 3.5;
  let timer = null;
  let cachedContest = null;
  let cachedTiers = null;

  function money(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
  }
  function percent(value) {
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0) + "%";
  }
  function unitCost() {
    const stored = Number(localStorage.getItem(UNIT_COST_KEY));
    return stored > 0 ? stored : DEFAULT_UNIT_COST;
  }
  function normalizeTiers(payload) {
    const raw = payload?.prizeTiers ?? payload?.listaRateioPremio ?? [];
    return Array.isArray(raw) ? raw.map(item => {
      const description = String(item.description ?? item.descricaoFaixa ?? "");
      const hits = Number(item.hits ?? description.match(/\d+/)?.[0] ?? (16 - Number(item.faixa || 0)));
      const prize = Math.max(0, Number(item.prize ?? item.valorPremio) || 0);
      return { hits, prize };
    }).filter(item => item.hits >= 11 && item.hits <= 15) : [];
  }
  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  async function getTiers(contestNumber) {
    if (cachedContest === contestNumber && cachedTiers) return cachedTiers;
    let payload = null;
    try {
      const archive = await fetchJson(ARCHIVE_URL);
      const items = Array.isArray(archive) ? archive : archive?.results || [];
      payload = items.find(item => Number(item.number ?? item.numero) === contestNumber) || null;
    } catch {}
    if (!payload) {
      try { payload = await fetchJson(`${CAIXA_API}/${contestNumber}`); } catch {}
    }
    cachedContest = contestNumber;
    cachedTiers = normalizeTiers(payload);
    return cachedTiers;
  }
  function ensureStyles() {
    if (document.getElementById("su-loto-prize-analysis-style")) return;
    const style = document.createElement("style");
    style.id = "su-loto-prize-analysis-style";
    style.textContent = `
      .su-prize-summary{margin:18px 0;padding:18px;border:1px solid #eadff0;border-radius:18px;background:#fbf7fc}
      .su-prize-summary h3{margin:0 0 12px}.su-prize-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .su-prize-grid article{padding:12px;border:1px solid #eadff0;border-radius:14px;background:#fff;min-width:0}.su-prize-grid span{display:block;color:#6b7280;font-size:.8rem}.su-prize-grid strong{display:block;margin-top:4px;overflow-wrap:anywhere}
      .su-prize-total{background:#f3eafb!important;border-color:#d9c5e5!important}.su-financial-positive{background:#e8f7ee!important;border-color:#a9d8bb!important;color:#0f6b48}.su-financial-negative{background:#fff1f2!important;border-color:#fecdd3!important;color:#b42335}
      .su-cost-editor{display:flex;align-items:end;gap:10px;margin:14px 0 0}.su-cost-editor label{display:grid;gap:5px;font-size:.82rem;color:#6b7280;font-weight:700}.su-cost-editor input{width:130px;min-height:40px;padding:8px 10px;border:1px solid #dfd0e7;border-radius:10px;font:inherit}.su-cost-editor button{min-height:40px;padding:8px 13px;border:1px solid #6f2385;border-radius:10px;background:#fff;color:#6f2385;font-weight:800}
      .game-return{margin-top:10px;padding:9px 11px;border-radius:12px;background:#f5ecf8;color:#6f2385;font-weight:800;display:flex;justify-content:space-between;gap:12px}.game-return.none{background:#f5f5f5;color:#6b7280}
      @media(max-width:700px){.su-prize-grid{grid-template-columns:1fr 1fr}.su-cost-editor{align-items:stretch;flex-direction:column}.su-cost-editor input{width:100%}}
    `;
    document.head.appendChild(style);
  }
  async function enhance() {
    const analysis = document.getElementById("contest-analysis");
    if (!analysis || analysis.hidden) return;
    const title = analysis.querySelector(".analysis-head h2")?.textContent || "";
    const contestNumber = Number(title.match(/\d+/)?.[0]);
    if (!contestNumber) return;
    const cards = [...analysis.querySelectorAll(".checked-game")];
    if (!cards.length) return;
    ensureStyles();
    const tiers = await getTiers(contestNumber);
    const prizeMap = new Map(tiers.map(item => [item.hits, item.prize]));
    const counts = { 11: 0, 12: 0, 13: 0, 14: 0, 15: 0 };
    let total = 0;
    for (const card of cards) {
      card.querySelector(".game-return")?.remove();
      const hits = Number(card.querySelector(".score-badge")?.textContent.match(/\d+/)?.[0] || 0);
      const prize = prizeMap.get(hits) || 0;
      if (counts[hits] !== undefined) counts[hits] += 1;
      total += prize;
      const row = document.createElement("div");
      row.className = `game-return${prize ? "" : " none"}`;
      row.innerHTML = `<span>Retorno deste jogo</span><strong>${prize ? money(prize) : "Sem prêmio"}</strong>`;
      card.appendChild(row);
    }
    analysis.querySelector(".su-prize-summary")?.remove();
    const metrics = analysis.querySelector(".analysis-metrics");
    const summary = document.createElement("section");
    summary.className = "su-prize-summary";
    const cost = unitCost();
    const investment = cards.length * cost;
    const net = total - investment;
    const roi = investment > 0 ? total / investment * 100 : 0;
    if (!tiers.length) {
      summary.innerHTML = `<h3>Resumo financeiro</h3><div class="su-prize-grid">
        <article><span>Jogos no cálculo</span><strong>${cards.length}</strong></article><article><span>Valor por aposta</span><strong>${money(cost)}</strong></article><article><span>Valor investido</span><strong>${money(investment)}</strong></article>
      </div><p>Os valores de premiação ainda não estão disponíveis para este concurso.</p>${costEditor(cost)}`;
    } else {
      const rows = [11,12,13,14,15].map(hits => `<article><span>${hits} pontos premiados</span><strong>${counts[hits]} × ${money(prizeMap.get(hits) || 0)}</strong></article>`).join("");
      summary.innerHTML = `<h3>Resumo financeiro dos jogos conferidos</h3><div class="su-prize-grid">${rows}
        <article class="su-prize-total"><span>Retorno bruto</span><strong>${money(total)}</strong></article>
        <article><span>Jogos no cálculo</span><strong>${cards.length}</strong></article>
        <article><span>Valor investido</span><strong>${money(investment)}</strong></article>
        <article class="${net >= 0 ? "su-financial-positive" : "su-financial-negative"}"><span>${net >= 0 ? "Lucro" : "Prejuízo"}</span><strong>${money(Math.abs(net))}</strong></article>
        <article class="${roi >= 100 ? "su-financial-positive" : "su-financial-negative"}"><span>Retorno percentual</span><strong>${percent(roi)}</strong></article>
      </div>${costEditor(cost)}`;
    }
    metrics?.insertAdjacentElement("afterend", summary);
    summary.querySelector(".su-save-unit-cost")?.addEventListener("click", () => {
      const value = Number(summary.querySelector(".su-unit-cost")?.value.replace(",", "."));
      if (!(value > 0)) return;
      localStorage.setItem(UNIT_COST_KEY, String(value));
      enhance();
    });
  }
  function costEditor(cost) {
    return `<div class="su-cost-editor"><label>Valor por aposta simples<input class="su-unit-cost" inputmode="decimal" value="${cost.toFixed(2).replace(".", ",")}"></label><button type="button" class="su-save-unit-cost">Atualizar cálculo</button></div>`;
  }
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(enhance, 180); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("change", event => { if (event.target?.id === "contest-scope") setTimeout(enhance, 250); });
  setTimeout(enhance, 1000);
})();