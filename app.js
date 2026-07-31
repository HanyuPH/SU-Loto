(function(){
  "use strict";
  const STORAGE_KEY="su-loto-c2-status-v4";
  const games=Array.isArray(window.SU_LOTO_GAMES)?window.SU_LOTO_GAMES:[];
  const states={};
  const labels={pendente:"Pendente",registrado:"Registrada",apostado:"Apostado"};
  const container=document.getElementById("games");
  const template=document.getElementById("game-template");
  const statusText=document.getElementById("save-status");
  const visibleCount=document.getElementById("visible-count");
  const emptyState=document.getElementById("empty-state");
  const filters={
    search:document.getElementById("search"),
    status:document.getElementById("filter-status"),
    system:document.getElementById("filter-system"),
    group:document.getElementById("filter-group")
  };

  function initialStates(){const out={};games.forEach(g=>out[g.id]=g.initialStatus||"pendente");return out}
  function load(){
    Object.assign(states,initialStates());
    try{
      const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
      const saved=parsed&&parsed.statuses?parsed.statuses:parsed;
      if(saved&&typeof saved==="object") Object.keys(saved).forEach(id=>{if(labels[saved[id]]) states[id]=saved[id]});
      if(parsed&&parsed.savedAt) statusText.textContent="Último salvamento: "+formatDate(parsed.savedAt);
    }catch(e){statusText.textContent="As marcações originais foram carregadas"}
  }
  function formatDate(value){try{return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value))}catch(e){return "agora"}}
  function save(){
    const payload={app:"SU Loto",wallet:"C2",savedAt:new Date().toISOString(),statuses:states};
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(payload));statusText.textContent="Salvo em "+formatDate(payload.savedAt)}catch(e){statusText.textContent="Não foi possível salvar neste navegador"}
  }
  function pad(n){return String(n).padStart(3,"0")}
  function render(){
    const frag=document.createDocumentFragment();
    games.forEach(game=>{
      const node=template.content.firstElementChild.cloneNode(true);
      node.dataset.id=game.id;node.dataset.status=states[game.id];node.dataset.system=game.system;node.dataset.group=game.group;
      node.querySelector(".game-title").textContent="Jogo "+pad(game.id);
      node.querySelector(".game-meta").textContent=game.system+" • Grupo "+game.group;
      const nums=node.querySelector(".numbers");
      game.numbers.forEach(n=>{const span=document.createElement("span");span.className="ball";span.textContent=String(n).padStart(2,"0");nums.appendChild(span)});
      node.querySelectorAll(".status-actions button").forEach(btn=>btn.addEventListener("click",()=>setStatus(game.id,btn.dataset.status)));
      frag.appendChild(node);
    });
    container.replaceChildren(frag);refreshAll();
  }
  function setStatus(id,status){
    if(!labels[status]||states[id]===status)return;
    states[id]=status;save();refreshCard(id);updateCounters();applyFilters();
    if(window.SULotoContests&&typeof window.SULotoContests.refresh==="function") window.SULotoContests.refresh();
    toast("Jogo "+pad(id)+": "+labels[status]);
  }
  function refreshCard(id){
    const card=container.querySelector('[data-id="'+id+'"]');if(!card)return;
    const status=states[id]||"pendente";card.dataset.status=status;
    card.querySelector(".status-pill").textContent=labels[status];
    card.querySelectorAll(".status-actions button").forEach(btn=>{btn.classList.toggle("active",btn.dataset.status===status);btn.setAttribute("aria-pressed",String(btn.dataset.status===status))});
  }
  function refreshAll(){games.forEach(g=>refreshCard(g.id));updateCounters();applyFilters()}
  function updateCounters(){
    const count={pendente:0,registrado:0,apostado:0};games.forEach(g=>count[states[g.id]]++);
    document.getElementById("count-total").textContent=games.length;
    Object.keys(count).forEach(k=>document.getElementById("count-"+k).textContent=count[k]);
  }
  function normalize(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
  function applyFilters(){
    const q=normalize(filters.search.value);const parts=q.split(/\s+/).filter(Boolean);
    let visible=0;
    games.forEach(game=>{
      const status=states[game.id];
      const text=[game.id,pad(game.id),game.system,game.group,...game.numbers.map(n=>String(n).padStart(2,"0"))].join(" ").toLowerCase();
      const matchSearch=!parts.length||parts.every(p=>text.includes(p));
      const show=matchSearch&&(filters.status.value==="all"||status===filters.status.value)&&(filters.system.value==="all"||game.system===filters.system.value)&&(filters.group.value==="all"||game.group===filters.group.value);
      const card=container.querySelector('[data-id="'+game.id+'"]');card.hidden=!show;if(show)visible++;
    });
    visibleCount.textContent=visible;emptyState.hidden=visible!==0;
  }
  function exportBackup(){
    const contests=window.SULotoContests&&typeof window.SULotoContests.exportData==="function"?window.SULotoContests.exportData():[];
    const payload={app:"SU Loto",wallet:"C2",version:5,exportedAt:new Date().toISOString(),statuses:states,contests};
    downloadJson(payload,"SU-Loto-C2-backup-"+new Date().toISOString().slice(0,10)+".json");toast("Backup completo exportado")
  }
  function downloadJson(payload,name){
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  function importBackup(file){
    const reader=new FileReader();reader.onload=()=>{try{
      const parsed=JSON.parse(reader.result);const incoming=parsed.statuses||parsed;
      if(!incoming||typeof incoming!=="object")throw new Error();
      Object.keys(incoming).forEach(id=>{if(labels[incoming[id]])states[id]=incoming[id]});
      if(Array.isArray(parsed.contests)&&window.SULotoContests&&typeof window.SULotoContests.importData==="function") window.SULotoContests.importData(parsed.contests,true);
      save();refreshAll();toast("Backup importado com sucesso")
    }catch(e){alert("Este arquivo de backup não é válido.")}};reader.readAsText(file)
  }
  function toast(message){let el=document.querySelector(".toast");if(!el){el=document.createElement("div");el.className="toast";document.body.appendChild(el)}el.textContent=message;requestAnimationFrame(()=>el.classList.add("show"));clearTimeout(el.timer);el.timer=setTimeout(()=>el.classList.remove("show"),2100)}
  function initViewTabs(){
    const buttons=[...document.querySelectorAll(".view-tab")];
    buttons.forEach(button=>button.addEventListener("click",()=>{
      buttons.forEach(item=>{const active=item===button;item.classList.toggle("active",active);item.setAttribute("aria-selected",String(active));document.getElementById(item.dataset.view).hidden=!active});
      window.scrollTo({top:0,behavior:"smooth"});
    }));
  }

  Object.values(filters).forEach(el=>el.addEventListener(el===filters.search?"input":"change",applyFilters));
  document.getElementById("export-backup").addEventListener("click",exportBackup);
  document.getElementById("import-file").addEventListener("change",e=>{const file=e.target.files&&e.target.files[0];if(file)importBackup(file);e.target.value=""});
  document.getElementById("reset-status").addEventListener("click",()=>{if(confirm("Restaurar todos os jogos ao estado original da Carteira C2? O histórico dos concursos será preservado.")){Object.assign(states,initialStates());save();refreshAll();if(window.SULotoContests)window.SULotoContests.refresh();toast("Padrão dos jogos restaurado")}});

  let installPrompt=null;const installBtn=document.getElementById("install-btn");
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;installBtn.hidden=false});
  installBtn.addEventListener("click",async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;installBtn.hidden=true}else{alert("No iPhone, toque em Compartilhar e depois em Adicionar à Tela de Início.")}});
  if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));

  load();render();initViewTabs();
  if(window.SULotoContests&&typeof window.SULotoContests.init==="function") window.SULotoContests.init({games,states,labels,pad,toast,formatDate,downloadJson});
  let hasSaved=false;try{hasSaved=!!localStorage.getItem(STORAGE_KEY)}catch(e){}
  if(!hasSaved)save();
})();
