(() => {
  "use strict";

  const ROOT_ID = "su-loto-contest-bets";
  const NUMBER_ID = "su-loto-bet-contest";
  const HISTORY_ID = "su-loto-bet-history";
  const STYLE_ID = "su-loto-contest-selection-highlight-v23";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{--su-loto-selection:#7b2b91;--su-loto-selection-dark:#5a1f6b;--su-loto-selection-soft:#f7edf9;--su-loto-selection-ring:rgba(123,43,145,.28)}
      #${ROOT_ID} #${HISTORY_ID} button[data-contest]{position:relative;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease}
      #${ROOT_ID} #${HISTORY_ID} button[data-contest].is-selected{border:2px solid var(--su-loto-selection)!important;background:var(--su-loto-selection-soft)!important;box-shadow:0 0 0 4px var(--su-loto-selection-ring)!important;transform:translateY(-1px)}
      #${ROOT_ID} #${HISTORY_ID} button[data-contest].is-selected strong{color:var(--su-loto-selection-dark)!important}
      #${ROOT_ID} #${NUMBER_ID}.contest-number-selected{border-color:var(--su-loto-selection)!important;box-shadow:0 0 0 3px var(--su-loto-selection-ring)!important;background:#fff!important}
    `;
    document.head.appendChild(style);
  }

  function applyVisualFallback(button, active) {
    if (active) {
      button.style.setProperty("border", "2px solid #7b2b91", "important");
      button.style.setProperty("background", "#f7edf9", "important");
      button.style.setProperty("box-shadow", "0 0 0 4px rgba(123,43,145,.28)", "important");
    } else {
      button.style.removeProperty("border");
      button.style.removeProperty("background");
      button.style.removeProperty("box-shadow");
    }
  }

  function refresh() {
    const root = document.getElementById(ROOT_ID);
    const number = document.getElementById(NUMBER_ID);
    const history = document.getElementById(HISTORY_ID);
    if (!root || !number || !history) return false;

    ensureStyles();
    const selected = String(number.value || "").trim();
    let matched = false;

    history.querySelectorAll("button[data-contest]").forEach(button => {
      const active = Boolean(selected) && String(button.dataset.contest || "") === selected;
      button.classList.toggle("is-selected", active);
      button.toggleAttribute("data-selected", active);
      button.setAttribute("aria-pressed", String(active));
      applyVisualFallback(button, active);
      if (active) {
        button.setAttribute("aria-current", "true");
        matched = true;
      } else {
        button.removeAttribute("aria-current");
      }
    });

    number.classList.toggle("contest-number-selected", matched);
    root.dataset.selectedContest = matched ? selected : "";
    return true;
  }

  function schedule() {
    requestAnimationFrame(refresh);
  }

  function install() {
    const root = document.getElementById(ROOT_ID);
    const number = document.getElementById(NUMBER_ID);
    const history = document.getElementById(HISTORY_ID);
    if (!root || !number || !history) return false;
    if (root.dataset.selectionHighlightV23 === "true") {
      schedule();
      return true;
    }

    root.dataset.selectionHighlightV23 = "true";
    ensureStyles();

    number.addEventListener("input", schedule);
    number.addEventListener("change", schedule);
    history.addEventListener("click", event => {
      if (event.target.closest?.("button[data-contest]")) {
        schedule();
        setTimeout(schedule, 30);
      }
    });

    const observer = new MutationObserver(schedule);
    observer.observe(history, { childList: true, subtree: true });

    window.addEventListener("su:contest-bets-updated", schedule);
    window.addEventListener("su:contest-bets-cloud-updated", schedule);
    window.addEventListener("storage", event => {
      if (event.key === "su-loto-c2-contest-bets-v1") schedule();
    });

    schedule();
    return true;
  }

  if (!install()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 100) clearInterval(timer);
    }, 100);
  }
})();
