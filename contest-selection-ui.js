(() => {
  "use strict";

  const C = {
    root: "su-loto-contest-bets",
    number: "su-loto-bet-contest",
    history: "su-loto-bet-history",
    summary: "su-loto-bet-summary",
    storageKey: "su-loto-c2-contest-bets-v1",
    styleId: "su-loto-contest-selection-style-v2"
  };

  let selectedContest = "";
  let frame = 0;
  let observer = null;

  function parse(raw, fallback) {
    try { return JSON.parse(raw ?? ""); } catch { return fallback; }
  }

  function records() {
    const value = parse(localStorage.getItem(C.storageKey), {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function ensureStyles() {
    if (document.getElementById(C.styleId)) return;
    const style = document.createElement("style");
    style.id = C.styleId;
    style.textContent = `
      #${C.root}{--su-loto-selection:#7b2b91;--su-loto-selection-dark:#5a1f6b;--su-loto-selection-soft:#f7edf9;--su-loto-selection-ring:rgba(123,43,145,.28)}
      #${C.root} .contest-selection-context{display:grid;gap:4px;margin:14px 0 10px;padding:13px 14px;border:1px dashed #cfc4d4;border-radius:14px;background:#fff;color:#59615c;transition:border-color .18s ease,background .18s ease,box-shadow .18s ease}
      #${C.root} .contest-selection-context span{font-size:.76rem;font-weight:900;letter-spacing:.055em;text-transform:uppercase}
      #${C.root} .contest-selection-context strong{font-size:1rem;line-height:1.35;color:#202823}
      #${C.root} .contest-selection-context small{font-size:.85rem;line-height:1.4;color:#687069}
      #${C.root} .contest-selection-context[data-state="selected"]{border:2px solid var(--su-loto-selection);background:var(--su-loto-selection-soft);box-shadow:0 0 0 4px var(--su-loto-selection-ring)}
      #${C.root} .contest-selection-context[data-state="selected"] span,#${C.root} .contest-selection-context[data-state="selected"] strong{color:var(--su-loto-selection-dark)}
      #${C.root} .contest-selection-context[data-state="draft"]{border-style:solid;border-color:#d6bd62;background:#fff9e7}
      #${C.root} #${C.number}.contest-number-selected{border-color:var(--su-loto-selection)!important;box-shadow:0 0 0 3px var(--su-loto-selection-ring)!important;background:#fff!important}
      #${C.root} #${C.summary}.is-selected{border:2px solid var(--su-loto-selection)!important;background:var(--su-loto-selection-soft)!important}
      #${C.root} #${C.history} button[data-contest]{position:relative;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease}
      #${C.root} #${C.history} button[data-contest].is-selected{border:2px solid var(--su-loto-selection)!important;background:var(--su-loto-selection-soft)!important;box-shadow:0 0 0 4px var(--su-loto-selection-ring)!important;transform:translateY(-1px);padding-right:106px!important}
      #${C.root} #${C.history} button[data-contest].is-selected strong{color:var(--su-loto-selection-dark)!important}
      #${C.root} .contest-selected-badge{position:absolute;right:10px;top:10px;display:inline-flex!important;align-items:center;justify-content:center;width:auto!important;margin:0!important;padding:4px 8px;border-radius:999px;background:var(--su-loto-selection);color:#fff!important;font-size:.68rem!important;font-weight:900!important;letter-spacing:.035em;text-transform:uppercase;line-height:1.2}
      @media(max-width:560px){#${C.root} #${C.history} button[data-contest].is-selected{padding-right:94px!important}#${C.root} .contest-selected-badge{font-size:.62rem!important;padding:4px 7px}}
    `;
    document.head.appendChild(style);
  }

  function ensureContext(root) {
    let context = root.querySelector(".contest-selection-context");
    if (context) return context;
    const actions = root.querySelector(".contest-bets-actions");
    if (!actions) return null;
    context = document.createElement("div");
    context.id = "su-loto-selected-contest-context";
    context.className = "contest-selection-context";
    context.setAttribute("role", "status");
    context.setAttribute("aria-live", "polite");
    actions.insertAdjacentElement("beforebegin", context);
    return context;
  }

  function setContext(context, state, html) {
    if (context.dataset.state !== state) context.dataset.state = state;
    if (context.innerHTML !== html) context.innerHTML = html;
  }

  function setSelectedStyle(button, selected) {
    button.classList.toggle("is-selected", selected);
    button.toggleAttribute("data-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    if (selected) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");

    // Fallback visual para o Safari/PWA mesmo quando uma folha antiga estiver em cache.
    if (selected) {
      button.style.setProperty("border", "2px solid #7b2b91", "important");
      button.style.setProperty("background", "#f7edf9", "important");
      button.style.setProperty("box-shadow", "0 0 0 4px rgba(123,43,145,.28)", "important");
    } else {
      button.style.removeProperty("border");
      button.style.removeProperty("background");
      button.style.removeProperty("box-shadow");
    }

    let badge = button.querySelector(".contest-selected-badge");
    if (selected && !badge) {
      badge = document.createElement("span");
      badge.className = "contest-selected-badge";
      badge.textContent = "Selecionado";
      button.appendChild(badge);
    } else if (!selected && badge) {
      badge.remove();
    }
  }

  function updateActionLabels(root, contest, hasRecord) {
    const labels = {
      "su-save-contest-bets": hasRecord ? "Atualizar apostas do concurso" : "Registrar apostas atuais no concurso",
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
      if (labels[button.id]) button.setAttribute("aria-label", `${labels[button.id]} ${contest}`);
    });
  }

  function refresh() {
    const root = document.getElementById(C.root);
    const number = document.getElementById(C.number);
    const history = document.getElementById(C.history);
    if (!root || !number || !history) return false;

    ensureStyles();
    const context = ensureContext(root);
    if (!context) return false;

    const inputContest = String(number.value || "").trim();
    if (inputContest) selectedContest = inputContest;
    else selectedContest = "";

    const saved = records();
    const row = selectedContest ? saved[selectedContest] : null;
    const hasRecord = Boolean(row);

    root.dataset.selectedContest = selectedContest;
    root.classList.toggle("has-selected-contest", hasRecord);
    number.classList.toggle("contest-number-selected", hasRecord);
    number.setAttribute("aria-describedby", context.id);
    document.getElementById(C.summary)?.classList.toggle("is-selected", hasRecord);

    history.querySelectorAll("button[data-contest]").forEach(button => {
      setSelectedStyle(button, Boolean(selectedContest) && String(button.dataset.contest) === selectedContest);
    });

    if (!selectedContest) {
      setContext(context, "empty", `<span>Concurso em foco</span><strong>Nenhum concurso selecionado</strong><small>Toque em um registro salvo para escolher qual concurso receberá as ações abaixo.</small>`);
    } else if (!row) {
      setContext(context, "draft", `<span>Novo registro</span><strong>Concurso ${selectedContest}</strong><small>Registrar apostas atuais criará um novo registro para este concurso.</small>`);
    } else {
      const status = row.status === "concluido" ? "Concluído" : "Ativo";
      setContext(context, "selected", `<span>Concurso selecionado</span><strong>Concurso ${selectedContest} • ${status}</strong><small>Registrar, concluir, excluir ou reabrir serão aplicados especificamente a este registro.</small>`);
    }

    updateActionLabels(root, selectedContest, hasRecord);
    return true;
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(refresh);
  }

  function selectFromButton(button) {
    const contest = String(button?.dataset?.contest || "").trim();
    if (!contest) return;
    selectedContest = contest;
    const number = document.getElementById(C.number);
    if (number && number.value !== contest) {
      number.value = contest;
      number.dispatchEvent(new Event("input", { bubbles: true }));
      number.dispatchEvent(new Event("change", { bubbles: true }));
    }
    schedule();
    setTimeout(schedule, 30);
    setTimeout(schedule, 160);
  }

  function install() {
    const root = document.getElementById(C.root);
    const number = document.getElementById(C.number);
    const history = document.getElementById(C.history);
    if (!root || !number || !history) return false;

    if (root.dataset.selectionUiV2 === "true") {
      schedule();
      return true;
    }
    root.dataset.selectionUiV2 = "true";
    ensureStyles();
    ensureContext(root);

    // Captura antes dos demais módulos e confirma novamente após a renderização deles.
    document.addEventListener("click", event => {
      const button = event.target.closest?.(`#${C.history} button[data-contest]`);
      if (button) selectFromButton(button);
    }, true);

    number.addEventListener("input", schedule);
    number.addEventListener("change", schedule);
    window.addEventListener("storage", event => {
      if (event.key === C.storageKey) schedule();
    });
    window.addEventListener("su:storage-mirror-updated", event => {
      if (event.detail?.key === C.storageKey) schedule();
    });
    window.addEventListener("su:contest-bets-cloud-updated", schedule);
    window.addEventListener("su:contest-bets-updated", schedule);
    window.addEventListener("su:cloud-statuses-applied", schedule);

    observer?.disconnect();
    observer = new MutationObserver(schedule);
    observer.observe(history, { childList: true, subtree: true });

    globalThis.SULotoContestSelection = { refresh: schedule, select: contest => selectFromButton(history.querySelector(`button[data-contest="${String(contest)}"]`)) };
    schedule();
    return true;
  }

  if (!install()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 100) clearInterval(timer);
    }, 200);
  }
})();
