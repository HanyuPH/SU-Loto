(function(){
  "use strict";
  const LATEST_URL="./data/ultimo-concurso.json";
  const ARCHIVE_URL="./data/concursos-oficiais.json";
  const CAIXA_API="https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil";
  let preview=null;
  let archive=[];
  let busy=false;
  const ui={};

  function init(){
    if(!window.SULotoContests||!document.getElementById("contests-view"))return;
    addStylesheet();buildInterface();bind();setTimeout(()=>checkLatest(true),650);
  }
  function addStylesheet(){
    if(document.querySelector('link[href="official-results.css"]'))return;
    const link=document.createElement("link");link.rel="stylesheet";link.href="official-results.css";document.head.appendChild(link);
  }
  function buildInterface(){
    const section=document.createElement("section");section.className="contest-card official-sync-card";section.setAttribute("aria-live","polite");
    section.innerHTML='<div class="official-sync-head"><div><p class="eyebrow purple">Resultado oficial automático</p><h2>Consultar a CAIXA</h2><p>O GitHub atualiza o resultado oficial e o aplicativo preenche as dezenas automaticamente.</p></div><button id="official-refresh" class="button primary" type="button">Atualizar agora</button></div><div id="official-sync-state" class="official-sync-state loading"><span class="official-source-badge">CAIXA</span><div><strong id="official-sync-title">Verificando o concurso mais recente…</strong><p id="official-sync-message">A consulta usa o arquivo oficial atualizado automaticamente no GitHub.</p></div></div><div id="official-result-preview" class="official-result-preview" hidden><div class="official-preview-head"><div><strong id="official-preview-title"></strong><p id="official-preview-meta"></p></div><span id="official-preview-status" class="official-preview-status"></span></div><div id="official-preview-balls" class="draw-result-balls official-preview-balls"></div><div id="official-preview-prizes" class="official-prize-summary"></div><div class="official-preview-actions"><button id="official-register" class="button primary large" type="button">Registrar e conferir</button><button id="official-fill-form" class="button" type="button">Revisar no formulário</button></div></div><div class="official-specific-search"><label><span>Buscar concurso específico</span><input id="official-contest-number" type="number" min="1" inputmode="numeric" placeholder="Ex.: 3749"></label><button id="official-search-specific" class="button" type="button">Buscar resultado</button></div><p id="official-search-error" class="form-error" role="alert" hidden></p>';
    const view=document.getElementById("contests-view");view.insertBefore(section,view.firstChild);
    const tab=document.querySelector('[data-view="contests-view"]');if(tab){const dot=document.createElement("span");dot.id="official-update-dot";dot.className="update-dot";dot.hidden=true;dot.setAttribute("aria-label","Novo concurso disponível");tab.appendChild(dot)}
    ["official-refresh","official-sync-state","official-sync-title","official-sync-message","official-result-preview","official-preview-title","official-preview-meta","official-preview-status","official-preview-balls","official-preview-prizes","official-register","official-fill-form","official-contest-number","official-search-specific","official-search-error","official-update-dot"].forEach(id=>ui[id]=document.getElementById(id));
  }
  function bind(){
    ui["official-refresh"].addEventListener("click",()=>checkLatest(false));
    ui["official-register"].addEventListener("click",registerPreview);
    ui["official-fill-form"].addEventListener("click",fillManualForm);
    ui["official-search-specific"].addEventListener("click",searchSpecific);
    ui["official-contest-number"].addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();searchSpecific()}});
  }
  async function fetchJson(url,timeout=15000){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
    try{const response=await fetch(url,{cache:"no-store",headers:{Accept:"application/json"},signal:controller.signal});if(!response.ok)throw new Error("HTTP "+response.status);return await response.json()}finally{clearTimeout(timer)}
  }
  function normalizeDate(value){const text=String(value||"").trim();if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const match=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);return match?match[3]+"-"+match[2].padStart(2,"0")+"-"+match[1].padStart(2,"0"):""}
  function parseNumbers(value){const source=Array.isArray(value)?value:String(value||"").match(/\d{1,2}/g)||[];return [...new Set(source.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=25))].sort((a,b)=>a-b)}
  function normalizeResult(payload){
    if(!payload||typeof payload!=="object")throw new Error("Resposta oficial inválida.");
    const number=Number(payload.number??payload.numero);const date=normalizeDate(payload.date??payload.dataApuracao);const numbers=parseNumbers(payload.numbers??payload.listaDezenas);
    if(!Number.isInteger(number)||number<1||!date||numbers.length!==15)throw new Error("O resultado oficial não passou pela validação de segurança.");
    const rawTiers=payload.prizeTiers??payload.listaRateioPremio??[];
    const prizeTiers=Array.isArray(rawTiers)?rawTiers.map(item=>{const description=String(item.description??item.descricaoFaixa??"");const hits=Number(item.hits??description.match(/\d+/)?.[0]??(16-Number(item.faixa||0)));return{hits,winners:Math.max(0,Number(item.winners??item.numeroDeGanhadores)||0),prize:Math.max(0,Number(item.prize??item.valorPremio)||0)}}).filter(item=>item.hits>=11&&item.hits<=15).sort((a,b)=>b.hits-a.hits):[];
    return{number,date,numbers,source:String(payload.source||CAIXA_API+"/"+number),location:String(payload.location||payload.nomeMunicipioUFSorteio||payload.localSorteio||"").trim(),prizeTiers,accumulated:Boolean(payload.accumulated??payload.acumulado),nextContest:payload.nextContest||null};
  }
  function setState(type,title,message){ui["official-sync-state"].className="official-sync-state "+type;ui["official-sync-title"].textContent=title;ui["official-sync-message"].textContent=message}
  function showError(message){ui["official-search-error"].textContent=message||"";ui["official-search-error"].hidden=!message}
  function formatDate(value){const parts=value.split("-");return parts.length===3?parts[2]+"/"+parts[1]+"/"+parts[0]:value}
  function formatCurrency(value){try{return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value)||0)}catch(e){return "R$ "+Number(value||0).toFixed(2)}}
  function getContests(){try{return window.SULotoContests.exportData()||[]}catch(e){return[]}}
  function sameNumbers(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((n,i)=>Number(n)===Number(b[i]))}
  function renderPreview(result,latest){
    preview=result;showError("");const existing=getContests().find(item=>Number(item.number)===result.number);const exact=existing&&sameNumbers(existing.numbers,result.numbers);
    ui["official-result-preview"].hidden=false;ui["official-preview-title"].textContent="Concurso "+result.number;ui["official-preview-meta"].textContent=formatDate(result.date)+(result.location?" • "+result.location:"");ui["official-preview-status"].textContent=exact?"Já registrado":existing?"Divergência encontrada":"Novo resultado";ui["official-preview-status"].className="official-preview-status "+(exact?"registered":existing?"warning":"new");ui["official-preview-balls"].innerHTML=result.numbers.map(n=>'<span>'+String(n).padStart(2,"0")+'</span>').join("");ui["official-preview-prizes"].innerHTML=result.prizeTiers.map(tier=>'<article><span>'+tier.hits+' acertos</span><strong>'+tier.winners.toLocaleString("pt-BR")+' ganhadores</strong><small>'+formatCurrency(tier.prize)+'</small></article>').join("");ui["official-register"].textContent=exact?"Abrir conferência":existing?"Atualizar e conferir":"Registrar e conferir";if(ui["official-update-dot"])ui["official-update-dot"].hidden=!(latest&&!exact);
    if(latest)setState(exact?"success":"available",exact?"Concurso "+result.number+" já registrado":"Concurso "+result.number+" disponível",exact?"O resultado oficial já está salvo neste aparelho.":"Toque em Registrar e conferir; nenhum preenchimento manual é necessário.");
  }
  async function checkLatest(silent){
    if(busy)return;busy=true;ui["official-refresh"].disabled=true;if(!silent)setState("loading","Consultando a fonte oficial…","Aguarde enquanto o resultado mais recente é verificado.");
    try{renderPreview(normalizeResult(await fetchJson(LATEST_URL)),true)}catch(error){setState("error","Não foi possível atualizar agora",navigator.onLine?"A fonte automática pode estar sendo atualizada. Tente novamente em alguns minutos.":"O aparelho está offline. O último resultado registrado continua disponível.");if(!silent)showError("Falha na consulta automática: "+(error.message||"erro desconhecido"))}finally{busy=false;ui["official-refresh"].disabled=false}
  }
  async function loadArchive(){try{const payload=await fetchJson(ARCHIVE_URL);const items=Array.isArray(payload)?payload:payload.results||[];archive=items.map(normalizeResult);return archive}catch(e){return[]}}
  async function searchSpecific(){
    const number=Number(ui["official-contest-number"].value);showError("");if(!Number.isInteger(number)||number<1)return showError("Informe um número de concurso válido.");ui["official-search-specific"].disabled=true;setState("loading","Buscando o concurso "+number+"…","Consultando primeiro o histórico automático do aplicativo.");
    try{const items=archive.length?archive:await loadArchive();let result=items.find(item=>item.number===number);if(!result){try{result=normalizeResult(await fetchJson(CAIXA_API+"/"+number))}catch(e){throw new Error("O concurso ainda não está no histórico automático e a consulta direta à CAIXA está indisponível.")}}renderPreview(result,false);setState("success","Concurso "+number+" localizado","Confira as dezenas e registre o resultado com um toque.")}catch(error){setState("error","Concurso não localizado","O cadastro manual permanece disponível como alternativa.");showError(error.message||"Não foi possível localizar esse concurso.")}finally{ui["official-search-specific"].disabled=false}
  }
  function switchToContests(){const tab=document.querySelector('[data-view="contests-view"]');if(tab&&!tab.classList.contains("active"))tab.click()}
  function openContest(number){switchToContests();setTimeout(()=>{const button=[...document.querySelectorAll(".history-open")].find(item=>item.getAttribute("aria-label")==="Abrir concurso "+number);if(button)button.click()},40)}
  function registerPreview(){
    if(!preview)return;const contests=getContests();const existing=contests.find(item=>Number(item.number)===preview.number);if(existing&&sameNumbers(existing.numbers,preview.numbers)){if(ui["official-update-dot"])ui["official-update-dot"].hidden=true;openContest(preview.number);setState("success","Concurso "+preview.number+" já registrado","A conferência foi aberta.");return}if(existing&&!confirm("O concurso "+preview.number+" está salvo com dezenas diferentes. Substituir pelo resultado oficial da CAIXA?"))return;
    const now=new Date().toISOString();const record={number:preview.number,date:preview.date,numbers:preview.numbers,source:preview.source,notes:"Resultado importado automaticamente da fonte oficial da CAIXA.",createdAt:existing?.createdAt||now,updatedAt:now};const merged=existing?contests.map(item=>Number(item.number)===preview.number?record:item):[record,...contests];const imported=window.SULotoContests.importData(merged,true);if(!imported)return showError("Não foi possível salvar o resultado oficial.");if(ui["official-update-dot"])ui["official-update-dot"].hidden=true;setState("success","Concurso "+preview.number+" registrado","A carteira foi conferida automaticamente.");openContest(preview.number)
  }
  function fillManualForm(){
    if(!preview)return;switchToContests();const existing=getContests().find(item=>Number(item.number)===preview.number);document.getElementById("contest-editing-number").value=existing?String(existing.number):"";document.getElementById("contest-number").value=String(preview.number);document.getElementById("contest-date").value=preview.date;document.getElementById("contest-source").value=preview.source;document.getElementById("contest-notes").value="Resultado consultado automaticamente na CAIXA.";const numbers=document.getElementById("contest-numbers-text");numbers.value=preview.numbers.map(n=>String(n).padStart(2,"0")).join(" ");numbers.dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("contest-form-title").textContent=(existing?"Revisar":"Registrar")+" concurso "+preview.number;document.getElementById("contest-cancel-edit").hidden=false;document.querySelector(".contest-form-card").scrollIntoView({behavior:"smooth",block:"start"})
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
