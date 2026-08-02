(() => {
  "use strict";
  function apply() {
    const actions = document.querySelector("#su-loto-contest-bets .su-life-actions");
    if (!actions) return false;
    const parent = actions.parentElement;
    if (parent?.classList.contains("contest-bets-actions")) parent.after(actions);
    actions.style.gridColumn = "1 / -1";
    const fields = document.querySelector("#su-loto-contest-bets .su-life-fields");
    if (fields) fields.style.display = "block";
    return true;
  }
  if (!apply()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (apply() || attempts >= 60) clearInterval(timer);
    }, 250);
  }
})();