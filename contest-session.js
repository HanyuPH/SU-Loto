(() => {
  "use strict";

  const C = {
    app: "SU Loto",
    betsKey: "su-loto-c2-contest-bets-v1",
    statusKey: "su-loto-c2-status-v4",
    lockKey: "su-loto-c2-contest-locks-v1",
    lastContestKey: "su-loto-last-bet-contest-v1",
    ids: {
      root: "su-loto-contest-bets",
      number: "su-loto-bet-contest",
      history: "su-loto-bet-history",
      save: "su-save-contest-bets",
      reopen: "su-reopen-contest-bets",
      legacyReopen: "su-loto-reopen-contest-bets"
    },
    api: "SULotoContestBets",
    appApi: "SULotoApp"
  };

  const BETS_KEY = C.betsKey;
  const STATUS_KEY = C.statusKey;
  const LOCK_KEY = C.lockKey;

  function parse(raw, fallback) {
    try { return JSON.parse(raw ?? ""); } catch { return fallback; }
  }

  function now() {
    return new Date().toISOString();
  }

  function valid(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function loadBets() {
    const value = parse(localStorage.getItem(BETS_KEY), {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function dispatchStorage(key, value) {
    try {
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
    } catch {
      window.dispatchEvent(new CustomEvent("su:storage-mirror-updated", { detail: { key, value } }));
    }
  }

  function saveBets(data) {
    try {
      const value = JSON.stringify(data);
      localStorage.setItem(BETS_KEY, value);
      dispatchStorage(BETS_KEY, value);
      window.dispatchEvent(new CustomEvent("su:contest-bets-updated", { detail: data }));
      return true;
    } catch (error) {
      console.error(`${C.app} reabertura de concurso:`, error);
      return false;
    }
  }

  function locked(number) {
    const value = parse(localStorage.getItem(LOCK_KEY), {});
    return Boolean(number && value && typeof value === "object" && value[String(number)]);
  }

  function selected() {
    return valid(document.getElementById(C.ids.number)?.value);
  }

  function statusPayload() {
    const raw = parse(localStorage.getItem(STATUS_KEY), {});
    const statuses = raw?.statuses || raw || {};
    return { raw, statuses: { ...statuses } };
  }

  function restoreGames(ids) {
    const { raw, statuses } = statusPayload();
    let changed = 0;
    for (const id of Array.isArray(ids) ? ids : []) {
      const key = String(id);
      if (statuses[key] !== "apostado") {
        statuses[key] = "apostado";
        changed += 1;
      }
    }

    const payload = raw && typeof raw === "object" && raw.statuses
      ? { ...raw, schema: Math.max(4, Number(raw.schema) || 0), source: "local-reopen", savedAt: now(), statuses }
      : { app: C.app, wallet: "C2", schema: 4, source: "local-reopen", savedAt: now(), statuses };

    const value = JSON.stringify(payload);
    localStorage.setItem(STATUS_KEY, value);
    dispatchStorage(STATUS_KEY, value);
    window.dispatchEvent(new CustomEvent("su:local-statuses-changed", { detail: statuses }));
    window.dispatchEvent(new CustomEvent("su:contest-session-reopened", { detail: { gameIds: ids, changed } }));
    return changed;
  }

  function announce(message) {
    const api = globalThis[C.appApi];
    if (typeof api?.announce === "function") {
      api.announce(message);
      return;
    }
    if (typeof api?.toast === "function") {
      api.toast(message);
      return;
    }
    alert(message);
  }

  function ensureHint(root) {
    let hint = root.querySelector(".contest-reopen-hint");
    if (hint) return hint;
    hint = document.createElement("p");
    hint.className = "contest-reopen-hint";
    hint.setAttribute("role", "status");
    hint.setAttribute("aria-live", "polite");
    const actions = root.querySelector(".contest-bets-actions");
    actions?.insertAdjacentElement("afterend", hint);
    return hint;
  }

  function setHint(hint, state, text) {
    if (hint.dataset.state !== state) hint.dataset.state = state;
    if (hint.textContent !== text) hint.textContent = text;
  }

  function ensureStyles() {
    if (document.getElementById("su-contest-reopen-style-v2")) return;
    const style = document.createElement("style");
    style.id = "su-contest-reopen-style-v2";
    style.textContent = `
      .contest-reopen-hint{margin:8px 0 0;padding:9px 11px;border-radius:11px;background:#f3f6f4;color:#5f6b63;font-size:.82rem;font-weight:750;line-height:1.4}
      .contest-reopen-hint[data-state="ready"]{background:#f4ebf8;color:#5a1f6b}
      .contest-reopen-hint[data-state="blocked"]{background:#fbe8ea;color:#a51d2d}
      .contest-reopen-hint[data-state="active"]{background:#eef1ef;color:#5f6b63}
    `;
    document.head.appendChild(style);
  }

  function render() {
    const root = document.getElementById(C.ids.root);
    const button = document.getElementById(C.ids.reopen);
    if (!root || !button) return;

    const hint = ensureHint(root);
    const number = selected();
    const data = loadBets();
    const row = number ? data[String(number)] : null;
    const isLocked = locked(number);

    if (!number || !row) {
      button.disabled = true;
      button.title = "Selecione um concurso salvo";
      setHint(hint, "idle", "Selecione um concurso salvo para verificar se ele pode ser reaberto.");
      return;
    }

    if (row.status !== "concluido") {
      button.disabled = true;
      button.title = "Este concurso já está ativo";
      setHint(hint, "active", `Concurso ${number} já está ativo. As ações serão aplicadas a este registro.`);
      return;
    }

    if (isLocked) {
      button.disabled = true;
      button.title = "Resultado oficial publicado";
      setHint(hint, "blocked", `Concurso ${number}: o resultado oficial já foi publicado e o registro permanece bloqueado.`);
      return;
    }

    button.disabled = false;
    button.title = `Reabrir o concurso ${number} e restaurar seus jogos`;
    setHint(hint, "ready", `Concurso ${number} concluído e disponível para reabertura. Outros concursos ativos serão preservados.`);
  }

  function install() {
    const root = document.getElementById(C.ids.root);
    if (!root) return false;

    const legacy = document.getElementById(C.ids.legacyReopen);
    if (legacy && legacy.id !== C.ids.reopen) legacy.remove();

    let button = document.getElementById(C.ids.reopen);
    if (!button) {
      const actions = root.querySelector(".contest-bets-actions");
      if (!actions) return false;
      button = document.createElement("button");
      button.id = C.ids.reopen;
      button.type = "button";
      button.className = "button";
      button.textContent = "Reabrir concurso";
      button.style.gridColumn = "1 / -1";
      actions.appendChild(button);
    }

    if (root.dataset.contestSessionV2 === "true") {
      render();
      return true;
    }
    root.dataset.contestSessionV2 = "true";
    ensureStyles();
    ensureHint(root);

    document.addEventListener("click", event => {
      const save = event.target.closest?.(`#${C.ids.save}`);
      if (!save) return;
      const number = selected();
      const row = number ? loadBets()[String(number)] : null;
      if (row?.status !== "concluido") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("Este concurso está concluído. Use Reabrir concurso antes de atualizar suas apostas.");
    }, true);

    button.addEventListener("click", () => {
      const number = selected();
      const data = loadBets();
      const row = number ? data[String(number)] : null;
      if (!number || !row) return alert("Selecione um concurso salvo.");
      if (row.status !== "concluido") return alert(`O concurso ${number} já está ativo.`);
      if (locked(number)) return alert("O resultado oficial deste concurso já foi publicado. O registro está bloqueado.");

      const gameIds = Array.isArray(row.gameIds) ? row.gameIds.map(String) : [];
      if (!confirm(`Reabrir o concurso ${number}? Os ${gameIds.length} jogos salvos voltarão ao status Apostado. Outros concursos ativos serão preservados.`)) return;

      const timestamp = now();
      data[String(number)] = {
        ...row,
        status: "ativo",
        concludedAt: "",
        updatedAt: timestamp
      };

      if (!saveBets(data)) return alert("Não foi possível reabrir o concurso.");
      localStorage.setItem(C.lastContestKey, String(number));
      const restored = restoreGames(gameIds);
      render();
      announce(`Concurso ${number} reaberto • ${restored} jogos restaurados`);
    });

    document.getElementById(C.ids.number)?.addEventListener("input", render);
    document.getElementById(C.ids.number)?.addEventListener("change", render);
    document.getElementById(C.ids.history)?.addEventListener("click", () => setTimeout(render, 0));
    window.addEventListener("su:contest-bets-cloud-updated", render);
    window.addEventListener("su:contest-bets-updated", render);
    window.addEventListener("su:cloud-statuses-applied", render);
    window.addEventListener("storage", event => {
      if ([BETS_KEY, LOCK_KEY, STATUS_KEY].includes(event.key)) render();
    });
    window.addEventListener("su:storage-mirror-updated", event => {
      if ([BETS_KEY, LOCK_KEY, STATUS_KEY].includes(event.detail?.key)) render();
    });

    new MutationObserver(() => requestAnimationFrame(render)).observe(root, {
      subtree: true,
      childList: true,
      characterData: true
    });
    setTimeout(render, 100);
    return true;
  }

  if (!install()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (install() || tries >= 80) clearInterval(timer);
    }, 250);
  }
})();