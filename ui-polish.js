(() => {
  "use strict";
  const VERSION="Cloud v11";
  const THEME="#7b238f";
  const LIGHT="#f6edf8";
  const STATUS_KEY="su-loto-c2-status-v4";
  const BACKUP_KEYS=["su-loto-c2-last-cloud-backup","su-loto-last-cloud-backup"];
  const fmt=value=>{if(!value)return"Ainda não disponível";try{return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value))}catch{return String(value)}};
  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}};
  const readBackup=()=>BACKUP_KEYS.map(key=>localStorage.getItem(key)).find(Boolean)||null;
  const setText=(el,value)=>{if(el&&el.textContent!==String(value))el.textContent=String(value)};

  function injectStyles(){
    if(document.getElementById("su-ui-polish"))return;
    const style=document.createElement("style");
    style.id="su-ui-polish";
    style.textContent=`:root{--su-accent:${THEME};--su-accent-light:${LIGHT}}
    .cloud-version-badge{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:5px 9px;border:1px solid #ffffff66;border-radius:999px;background:#ffffff18;color:#fff;font-size:.76rem;font-weight:800}
    .toolbar-top{display:grid!important;grid-template-columns:1fr!important;gap:16px!important}.toolbar-top>.actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;width:100%!important}
    .toolbar-top>.actions .button{width:100%!important;min-height:52px!important;height:100%!important;margin:0!important;padding:11px 12px!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;line-height:1.15!important;font-size:.95rem!important;border-radius:15px!important;box-sizing:border-box!important}
    .toolbar-top>.actions #reset-status{grid-column:1/-1!important}.toolbar-top>.actions .button::before{font-size:1.05em;margin-right:7px}.toolbar-top>.actions #export-backup::before{content:"↑"}.toolbar-top>.actions label[for="import-file"]::before{content:"↓"}.toolbar-top>.actions #print-games::before{content:"▣"}.toolbar-top>.actions #reset-status::before{content:"↺"}
    .su-activity-panel{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:14px}.su-activity-panel article{padding:11px 12px;border:1px solid #eadff0;border-radius:14px;background:#fbf8fc;min-width:0}.su-activity-panel span{display:block;color:#716678;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.035em}.su-activity-panel strong{display:block;margin-top:5px;font-size:.84rem;overflow-wrap:anywhere}.su-activity-panel .sync strong{color:var(--su-accent)}
    .filters label>select,.filters label>input{min-height:52px!important}.filter-footer{align-items:center!important;gap:12px!important}.su-count-detail{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:5px;color:#716678;font-size:.82rem}.su-count-detail b{color:#201724}
    input:focus,select:focus,textarea:focus{outline:3px solid color-mix(in srgb,var(--su-accent) 20%,transparent)!important;border-color:var(--su-accent)!important}
    body{padding-bottom:max(16px,env(safe-area-inset-bottom))}.toast{bottom:max(18px,calc(env(safe-area-inset-bottom) + 10px))!important}
    @media(min-width:760px){.toolbar-top{grid-template-columns:minmax(230px,.8fr) minmax(420px,1.2fr)!important;align-items:start}.toolbar-top>.actions #reset-status{grid-column:auto!important}.toolbar-top>.actions .button{min-height:48px!important}}
    @media(max-width:620px){.page{padding-left:12px!important;padding-right:12px!important}.toolbar{padding:18px!important}.su-activity-panel{grid-template-columns:1fr!important}.toolbar-top>.actions .button{font-size:.83rem!important;padding:10px 7px!important;min-height:58px!important}.filters{grid-template-columns:1fr 1fr!important}.filters .numbers-search{grid-column:1/-1}.filter-footer{align-items:flex-start!important}.hero-inner{padding-left:14px!important;padding-right:14px!important}}
    @media(max-width:370px){.toolbar-top>.actions{grid-template-columns:1fr!important}.toolbar-top>.actions #reset-status{grid-column:auto!important}.filters{grid-template-columns:1fr!important}.filters .numbers-search{grid-column:auto}}`;
    document.head.appendChild(style);
  }
  function addVersion(){if(document.querySelector(".cloud-version-badge"))return;const subtitle=document.querySelector(".hero .subtitle");if(!subtitle)return;const badge=document.createElement("span");badge.className="cloud-version-badge";badge.textContent=`☁ ${VERSION}`;subtitle.insertAdjacentElement("afterend",badge)}
  function addActivityPanel(){if(document.querySelector(".su-activity-panel"))return;const save=document.getElementById("save-status");if(!save)return;const panel=document.createElement("div");panel.className="su-activity-panel";panel.innerHTML=`<article><span>Último salvamento</span><strong id="su-ui-last-save">—</strong></article><article class="sync"><span>Sincronização</span><strong id="su-ui-sync">Verificando…</strong></article><article><span>Último backup</span><strong id="su-ui-backup">—</strong></article>`;save.insertAdjacentElement("afterend",panel)}
  function addCounterDetails(){if(document.querySelector(".su-count-detail"))return;const line=document.querySelector(".results-line");if(!line)return;const detail=document.createElement("div");detail.className="su-count-detail";detail.innerHTML=`<span>Pendentes: <b id="su-detail-pending">0</b></span><span>Registrados: <b id="su-detail-registered">0</b></span><span>Apostados: <b id="su-detail-bet">0</b></span>`;line.appendChild(detail)}
  function refresh(){
    const payload=readJson(STATUS_KEY);
    const saveText=payload?.savedAt?fmt(payload.savedAt):(document.getElementById("save-status")?.textContent||"—");
    const cloud=document.getElementById("su-loto-cloud-text");
    const syncText=cloud?.textContent?.trim()||(navigator.onLine?"Conectado":"Offline");
    setText(document.getElementById("su-ui-last-save"),saveText);
    setText(document.getElementById("su-ui-sync"),syncText);
    setText(document.getElementById("su-ui-backup"),fmt(readBackup()));
    [["su-detail-pending","count-pendente"],["su-detail-registered","count-registrado"],["su-detail-bet","count-apostado"]].forEach(([target,source])=>setText(document.getElementById(target),document.getElementById(source)?.textContent||"0"));
  }
  function init(){injectStyles();addVersion();addActivityPanel();addCounterDetails();refresh();window.addEventListener("online",refresh);window.addEventListener("offline",refresh);window.addEventListener("storage",refresh);document.addEventListener("click",()=>setTimeout(refresh,80),{passive:true});document.addEventListener("change",()=>setTimeout(refresh,80),{passive:true});setInterval(refresh,5000)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();