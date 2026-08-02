(() => {
  "use strict";
  if (document.getElementById("su-beta-layout-review")) return;
  const style = document.createElement("style");
  style.id = "su-beta-layout-review";
  style.textContent = `
    :root{--su-control-height:46px;--su-gap:10px}
    body{min-width:320px;overflow-x:hidden}
    .page,.hero-inner{width:100%;max-width:1420px}
    .hero-inner,.toolbar-top,.filter-footer,.card-top{min-width:0}
    .brand,.brand>div,.toolbar-top>div,.card-top>div{min-width:0}
    .hero h1,.subtitle,.game-meta{overflow-wrap:anywhere}

    .toolbar-top{display:grid!important;grid-template-columns:minmax(220px,.9fr) minmax(420px,1.1fr)!important;align-items:start!important;gap:16px!important}
    .actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:var(--su-gap)!important;width:100%!important;margin:0!important}
    .actions .button,.actions label.button{width:100%!important;min-width:0!important;min-height:var(--su-control-height)!important;height:100%!important;margin:0!important;padding:10px 12px!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;line-height:1.2!important;white-space:normal!important}
    .actions .danger{grid-column:1/-1!important}

    .filters{align-items:end!important}
    .filters label{min-width:0!important}
    .filters input,.filters select{height:var(--su-control-height)!important;min-height:var(--su-control-height)!important;min-width:0!important}
    .results-line{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;text-align:left!important}

    .summary{align-items:stretch}
    .metric{min-width:0;min-height:88px;display:flex;flex-direction:column;justify-content:center}
    .metric span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .games{align-items:stretch}
    .game-card{min-width:0;height:100%;display:flex;flex-direction:column}
    .numbers{margin-top:auto}
    .status-actions{margin-top:auto}
    .status-actions button{min-width:0;min-height:44px;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.15}

    /* Ordem padronizada com o SU Mega em telas grandes, iPad e iPhone. */
    .contest-layout>.contest-form-card{order:1!important}
    .contest-layout>.contest-tools-card{order:2!important}

    .contest-bets-box{width:100%;box-sizing:border-box}
    .contest-bets-box label{min-width:0}
    .contest-bets-box input{width:100%;min-width:0;min-height:var(--su-control-height)}
    .contest-bets-actions{align-items:stretch}
    .contest-bets-actions .button{min-height:var(--su-control-height);height:100%;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.2}

    .su-loto-cloud-gate,.su-loto-cloud-panel,.su-account-overlay{overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;align-items:flex-start!important;padding-top:max(18px,env(safe-area-inset-top))!important;padding-bottom:max(18px,env(safe-area-inset-bottom))!important}
    .su-loto-card,.su-account-card{margin:auto!important;max-height:none!important;overflow:visible!important}
    .su-loto-grid,.su-account-grid{align-items:stretch!important}
    .su-loto-grid article,.su-account-item{min-height:82px!important;display:flex!important;flex-direction:column!important;justify-content:center!important;min-width:0!important}
    .su-loto-actions,.su-account-actions{align-items:stretch!important}
    .su-loto-actions button,.su-account-actions button{height:100%!important;min-height:48px!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;line-height:1.2!important}
    .su-loto-card input,.su-account-label input{width:100%!important;box-sizing:border-box!important}

    @media(max-width:900px){
      .toolbar-top{grid-template-columns:1fr!important}
      .actions{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .filters{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .search-field{grid-column:1/-1!important}
    }
    @media(min-width:700px) and (max-width:1100px){
      .page{padding-left:20px!important;padding-right:20px!important}
      .games{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .summary{grid-template-columns:repeat(4,minmax(0,1fr))!important}
      .su-loto-card,.su-account-card{width:min(620px,94vw)!important}
    }
    @media(max-width:620px){
      .page{padding-left:12px!important;padding-right:12px!important}
      .hero-inner{gap:10px!important}
      .brand{gap:10px!important}
      .toolbar{padding:14px!important}
      .actions{grid-template-columns:1fr 1fr!important}
      .actions .danger{grid-column:1/-1!important}
      .filters{grid-template-columns:1fr 1fr!important}
      .search-field{grid-column:1/-1!important}
      .results-line{align-items:stretch!important;flex-direction:column!important}
      .contest-bets-actions{grid-template-columns:1fr!important}
      .su-loto-grid,.su-loto-actions,.su-account-grid,.su-account-actions{grid-template-columns:1fr!important}
      .su-loto-grid article,.su-account-item{min-height:74px!important}
    }
    @media(max-width:380px){
      .actions,.filters{grid-template-columns:1fr!important}
      .actions .danger,.search-field{grid-column:auto!important}
      .summary{grid-template-columns:1fr 1fr!important}
      .status-actions{grid-template-columns:1fr!important}
      .numbers{grid-template-columns:repeat(5,minmax(0,1fr))!important}
    }
  `;
  document.head.appendChild(style);
})();
