(() => {
  "use strict";

  const CONFIGS = [
    {
      rootId: "su-contest-bets",
      numberId: "su-bet-contest",
      historyId: "su-bet-history",
      summaryId: "su-bet-summary",
      storageKey: "su-mega-c2-contest-bets-v1",
      styleId: "su-mega-contest-selection-style-v1",
      accent: "#16834f",
      accentDark: "#0d5f3d",
      soft: "#eaf7ef",
      ring: "rgba(22,131,79,.24)"
    },
    {
      rootId: "su-loto-contest-bets",
      numberId: "su-loto-bet-contest",
      historyId: "su-loto-bet-history",
      summaryId: "su-loto-bet-summary",
      storageKey: "su-loto-c2-contest-bets-v1",
      styleId: "su-loto-contest-selection-style-v1",
      accent: "#7b2b91",
      accentDark: "#5a1f6b",
      soft: "#f7edf9",
      ring: "rgba(123,43,145,.24)"
    }
  ];

  function parse(raw, fallback) {
    try { return JSON.parse(raw ?? ""); } catch { return fallback; }
  }

  function savedRows(config) {
    const value = parse(localStorage.getItem(config.storageKey), {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function ensureStyle(config) {
    if (document.getElementById(config.styleId)) return;
    const style = document.createElement("style");
    style.id = config.styleId;
    style.textContent = `
      #${config.rootId}{--contest-selection-accent:${config.accent};--contest-selection-accent-dark:${config.accentDark};--contest-selection-soft:${config.soft};--contest-selection-ring:${config.ring}}
      #${config.rootId} .contest-selection-context{display:grid;gap:3px;margin:14px 0 10px;padding:13px 14px;border:1px dashed #cbd7d0;border-radius:14px;background:#fff;color:#536057;transition:border-color .18s ease,background .18s ease,box-shadow .18s ease}
      #${config.rootId} .contest-selection-context span{font-size:.76rem;font-weight:900;letter-spacing:.055em;text-transform:uppercase}
      #${config.rootId} .contest-selection-context strong{font-size:1rem;line-height:1.35;color:#1f2a24}
      #${config.rootId} .contest-selection-context small{font-size:.85rem;line-height:1.4;color:#647067}
      #${config.rootId} .contest-selection-context[data-state="selected"]{border:2px solid var(--contest-selection-accent);background:var(--contest-selection-soft);box-shadow:0 0 0 4px var(--contest-selection-ring)}
      #${config.rootId} .contest-selection-context[data-state="selected"] span,#${config.rootId} .contest-selection-context[data-state="selected"] strong{color:var(--contest-selection-accent-dark)}
      #${config.rootId} .contest-selection-context[data-state="draft"]{border-style:solid;border-color:#d8c37a;background:#fff9e8}
      #${config.rootId} input.contest-number-selected{border-color:var(--contest-selection-accent)!important;box-shadow:0 0 0 3px var(--contest-selection-ring)!important}
      #${config.rootId} .contest-bets-summary.is-selected{border-color:var(--contest-selection-accent)!important;background:var(--contest-selection-soft)!important}
      #${config.rootId} .contest-bets-history-list button{position:relative;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease}
      #${config.rootId} .contest-bets-history-list button.is-selected{border:2px solid var(--contest-selection-accent)!important;background:var(--contest-selection-soft)!important;box-shadow:0 0 0 4px var(--contest-selection-ring);transform:translateY(-1px);padding-right:106px!important}
      #${config.rootId} .contest-bets-history-list button.is-selected strong{color:var(--contest-selection-accent-dark)}
      #${config.rootId} .contest-selected-badge{position:absolute;right:10px;top:10px;display:inline-flex!important;align-items:center;justify-content:center;width:auto!important;margin:0!important;padding:4px 8px;border-radius:999px;background:var(--contest-selection-accent);color:#fff!important;font-size:.68rem!important;font-weight:900!important;letter-spacing:.035em;text-transform:uppercase;line-height:1.2}
      #${config.rootId} .contest-bets-actions button[data-selected-contest]{outline-offset:2px}
      @media(max-width:560px){#${config.rootId} .contest-bets-history-list button.is-selected{padding-right:92px!important}#${config.rootId} .contest-selected-badge{font-size:.62rem!important;padding:4px 7px}}
    `;
    document.head.appendChild(style);
  }

  function selectedNumber(config) {
    return String(document.getElementById(config.numberId)?.value || "").trim();
  }

  function ensureContext(config, root) {
    let context = root.querySelector(".contest-selection-context");
    if (context) return context;
    const actions = root.querySelector(".contest-bets-actions");
    if (!actions) return null;
    context = document.createElement("div");
    context.className = "contest-selection-context";
    context.id = `${config.rootId}-selected-context`;
    context.setAttribute("role", "status");
    context.setAttribute("aria-live", "polite");
    actions.insertAdjacentElement("beforebegin", context);
    return context;
  }

  function setAttributeIfChanged(element, name, value) {
    if (value === null) {
      if (element.hasAttribute(name)) element.removeAttribute(name);
      return;
    }
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  function updateActionLabels(root, contest, hasSavedRow) {
    const labels = {
      "su-save-contest-bets": hasSavedRow ? "Atualizar apostas do concurso" : "Registrar apostas atuais no concurso",
      "su-close-contest-bets": "Concluir o concurso",
      "su-delete-contest-bets": "Excluir o registro do concurso",
      "su-reopen-contest-bets": "Reabrir o concurso"
    };
    root.querySelectorAll(".contest-bets-actions button").forEach(button => {
      if (!contest) {
        button.removeAttribute("data-selected-contest");
        button.removeAttribute("aria-label");
        return;
      }
      button.dataset.selectedContest = contest;
      const prefix = labels[button.id];
      if (prefix) button.setAttribute("aria-label", `${prefix} ${contest}`);
    });
  }

  function update(config) {
    const root = document.getElementById(config.rootId);
    const number = document.getElementById(config.numberId);
    const history = document.getElementById(config.historyId);
    if (!root || !number || !history) return false;

    ensureStyle(config);
    const context = ensureContext(config, root);
    if (!context) return false;

    const contest = selectedNumber(config);
    const rows = savedRows(config);
    const row = contest ? rows[contest] : null;
    const hasSavedRow = Boolean(row);

    root.dataset.selectedContest = contest;
    root.classList.toggle("has-selected-contest", hasSavedRow);
    number.classList.toggle("contest-number-selected", hasSavedRow);
    setAttributeIfChanged(number, "aria-describedby", context.id);

    const summary = document.getElementById(config.summaryId);
    summary?.classList.toggle("is-selected", hasSavedRow);

    if (!contest) {
      context.dataset.state = "empty";
      context.innerHTML = `<span>Concurso em foco</span><strong>Nenhum concurso selecionado</strong><small>Toque em um registro salvo para definir qual concurso receberá as ações abaixo.</small>`;
    } else if (!row) {
      context.dataset.state = "draft";
      context.innerHTML = `<span>Novo registro</span><strong>Concurso ${contest}</strong><small>Registrar apostas atuais criará um novo registro para este concurso.</small>`;
    } else {
      const status = row.status === "concluido" ? "Concluído" : "Ativo";
      context.dataset.state = "selected";
      context.innerHTML = `<span>Concurso selecionado</span><strong>Concurso ${contest} • ${status}</strong><small>Registrar, concluir, excluir ou reabrir serão aplicados especificamente a este registro.</small>`;
    }

    history.querySelectorAll("button[data-contest]").forEach(button => {
      const selected = Boolean(contest) && String(button.dataset.contest) === contest;
      button.classList.toggle("is-selected", selected);
      setAttributeIfChanged(button, "aria-current", selected ? "true" : null);
      setAttributeIfChanged(button, "aria-pressed", String(selected));
      let badge = button.querySelector(".contest-selected-badge");
      if (selected && !badge) {
        badge = document.createElement("span");
        badge.className = "contest-selected-badge";
        badge.textContent = "Selecionado";
        button.appendChild(badge);
      } else if (!selected && badge) {
        badge.remove();
      }
    });

    updateActionLabels(root, contest, hasSavedRow);
    return true;
  }

  function install(config) {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => update(config));
    };

    const tryInstall = () => {
      const root = document.getElementById(config.rootId);
      const number = document.getElementById(config.numberId);
      const history = document.getElementById(config.historyId);
      if (!root || !number || !history) return false;
      if (root.dataset.selectionUiInstalled === "true") return true;
      root.dataset.selectionUiInstalled = "true";
      number.addEventListener("input", schedule);
      number.addEventListener("change", schedule);
      history.addEventListener("click", event => {
        if (event.target.closest("button[data-contest]")) setTimeout(schedule, 0);
      });
      window.addEventListener("storage", event => {
        if (event.key === config.storageKey) schedule();
      });
      window.addEventListener("su:contest-bets-cloud-updated", schedule);
      window.addEventListener("su:contest-bets-updated", schedule);
      new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
      schedule();
      return true;
    };

    if (tryInstall()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (tryInstall() || attempts >= 80) clearInterval(timer);
    }, 250);
  }

  CONFIGS.forEach(install);
})();
