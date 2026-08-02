(() => {
"use strict";
const C={app:'SU Loto',metaKey:'su-loto-c2-contest-lifecycle-v1',betsKey:'su-loto-c2-contest-bets-v1',statusKey:'su-loto-c2-status-v4',resultKey:'su-loto-c2-contests-v1',contestsApi:'SULotoContests',prefix:'su-loto-bet-life',border:'#eadff0',muted:'#6b6470',chipBg:'#f3e9f6',chip:'#6f2385',focus:'rgba(111,35,133,.18)',games:()=>Array.isArray(globalThis.SU_LOTO_GAMES)?globalThis.SU_LOTO_GAMES:[],ids:{root:'su-loto-contest-bets',number:'su-loto-bet-contest',history:'su-loto-bet-history',summary:'su-loto-bet-summary',save:'su-loto-save-contest-bets',delete:'su-loto-delete-contest-bets',actions:'su-loto-save-contest-bets'}};
const META_KEY=C.metaKey,BETS_KEY=C.betsKey,STATUS_KEY=C.statusKey,RESULT_KEY=C.resultKey;
const PHASES=new Set(["draft","closed","locked"]);
let renderQueued=false,checkBusy=false,deleteContext=null;

function parse(raw,fallback){try{return JSON.parse(raw??"")}catch{return fallback}}
function now(){return new Date().toISOString()}
function validNumber(v){const n=Number(v);return Number.isInteger(n)&&n>0?n:null}
function normalizeMeta(raw){
 const source=raw&&typeof raw==="object"?raw:{}, contests={};
 for(const [key,value] of Object.entries(source.contests||{})){
  const contest=validNumber(value?.contest??key); if(!contest)continue;
  contests[String(contest)]={contest,type:value?.type==="special"?"special":"normal",phase:PHASES.has(value?.phase)?value.phase:"closed",updatedAt:String(value?.updatedAt||now()),closedAt:String(value?.closedAt||""),reopenedAt:String(value?.reopenedAt||""),lockedAt:String(value?.lockedAt||"")};
 }
 let activeContest=validNumber(source.activeContest);
 if(activeContest&&contests[String(activeContest)]?.phase!=="draft")activeContest=null;
 if(!activeContest){const draft=Object.values(contests).filter(x=>x.phase==="draft").sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];activeContest=draft?.contest||null}
 return{schema:1,activeContest,contests};
}
function loadMeta(){return normalizeMeta(parse(localStorage.getItem(META_KEY),{}))}
function saveMeta(meta){try{localStorage.setItem(META_KEY,JSON.stringify(normalizeMeta(meta)));window.dispatchEvent(new CustomEvent("su:contest-lifecycle-updated"));return true}catch(e){console.error(C.app+" ciclo de concursos:",e);return false}}
function loadBets(){const v=parse(localStorage.getItem(BETS_KEY),{});return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function saveBets(v){try{localStorage.setItem(BETS_KEY,JSON.stringify(v));window.dispatchEvent(new CustomEvent("su:contest-bets-updated"));return true}catch(e){return false}}
function statusData(){const raw=parse(localStorage.getItem(STATUS_KEY),{}),statuses=raw?.statuses||raw||{};return{raw,statuses:{...statuses}}}
function currentBetIds(){const{statuses}=statusData();return C.games().filter(g=>(statuses[g.id]||g.initialStatus||"pendente")==="apostado").map(g=>String(g.id))}
function writeStatuses(ids,status,reload=true){
 const set=new Set((ids||[]).map(String)),{raw,statuses}=statusData();let changed=0;
 for(const id of set)if(statuses[id]!==status){statuses[id]=status;changed++}
 if(changed){const payload=raw&&typeof raw==="object"&&raw.statuses?{...raw,savedAt:now(),statuses}:{app:C.app,wallet:"C2",savedAt:now(),statuses};localStorage.setItem(STATUS_KEY,JSON.stringify(payload));window.dispatchEvent(new StorageEvent("storage",{key:STATUS_KEY,newValue:JSON.stringify(payload)}))}
 if(reload)setTimeout(()=>location.reload(),changed?650:350);
}
function metaFor(n,meta=loadMeta()){return meta.contests[String(n)]||{contest:n,type:"normal",phase:"closed",updatedAt:now(),closedAt:"",reopenedAt:"",lockedAt:""}}
function labelPhase(p){return p==="locked"?"Resultado publicado • bloqueado":p==="draft"?"Em montagem":"Concluído • editável"}
function labelType(t){return t==="special"?"Especial":"Normal"}
function money(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v)||0)}
function resultNumbers(){
 const set=new Set();try{const api=globalThis[C.contestsApi],list=api?.exportData?.()||parse(localStorage.getItem(RESULT_KEY),[]);if(Array.isArray(list))for(const r of list){const n=validNumber(r?.number);if(n)set.add(n)}}catch{}return set
}
async function fetchNumbers(url){const r=await fetch(url,{cache:"no-store",headers:{Accept:"application/json"}});if(!r.ok)throw Error("HTTP "+r.status);const p=await r.json(),src=Array.isArray(p)?p:(p?.results||[p]),set=new Set();for(const x of src||[]){const n=validNumber(x?.number??x?.numero);if(n)set.add(n)}return set}
function lockContest(n,reload=true){
 const bets=loadBets(),row=bets[String(n)];if(!row)return false;
 const meta=loadMeta(),m=metaFor(n,meta);if(m.phase==="locked")return false;
 const active=meta.activeContest===n,ids=active?currentBetIds():(Array.isArray(row.gameIds)?row.gameIds.map(String):[]);
 if(active){row.gameIds=ids;row.totalInvested=ids.length*(Number(row.unitPrice)||0);row.savedAt=row.savedAt||now();bets[String(n)]=row;saveBets(bets)}
 meta.contests[String(n)]={...m,phase:"locked",closedAt:m.closedAt||now(),lockedAt:now(),updatedAt:now()};if(active)meta.activeContest=null;saveMeta(meta);
 if(active)writeStatuses(ids,"registrado",reload);queueRender();return true
}
function lockFromLocal(){
 const known=resultNumbers(),meta=loadMeta();let needsReload=false;
 for(const n of known){const m=meta.contests[String(n)];if(m&&m.phase!=="locked"){const active=meta.activeContest===n;if(lockContest(n,false)&&active)needsReload=true}}
 if(needsReload)setTimeout(()=>location.reload(),650);else queueRender()
}
async function checkLatest(){
 if(checkBusy)return;checkBusy=true;try{const known=await fetchNumbers("./data/ultimo-concurso.json"),meta=loadMeta();let needsReload=false;for(const n of known){const m=meta.contests[String(n)];if(m&&m.phase!=="locked"){const active=meta.activeContest===n;if(lockContest(n,false)&&active)needsReload=true}}if(needsReload)setTimeout(()=>location.reload(),650);else queueRender()}catch{}finally{checkBusy=false}
}
async function resultExists(n){if(resultNumbers().has(n))return true;try{if((await fetchNumbers("./data/ultimo-concurso.json")).has(n))return true}catch{}try{if((await fetchNumbers("./data/concursos-oficiais.json")).has(n))return true}catch{}return false}
function selectedNumber(){return validNumber(document.getElementById(C.ids.number)?.value)}
function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render()})}
function decorateHistory(){
 const meta=loadMeta(),history=document.getElementById(C.ids.history);if(!history)return;
 history.querySelectorAll("button[data-contest]").forEach(btn=>{const n=validNumber(btn.dataset.contest);if(!n)return;const m=metaFor(n,meta),row=loadBets()[String(n)],text=`${labelType(m.type)} • ${labelPhase(m.phase)}`;let tag=btn.querySelector(".su-life-tag");if(!tag){tag=document.createElement("small");tag.className="su-life-tag";tag.style.cssText="display:block;margin-top:4px;font-weight:850";btn.appendChild(tag)}if(tag.textContent!==text)tag.textContent=text;if(meta.activeContest===n)btn.classList.add("su-life-active");else btn.classList.remove("su-life-active");if(row&&tag.previousElementSibling?.tagName==="SPAN"){} });
}
function render(){
 const root=document.getElementById(C.ids.root);if(!root)return;
 const meta=loadMeta(),n=selectedNumber(),m=n?metaFor(n,meta):null,row=n?loadBets()[String(n)]:null;
 const active=document.getElementById(C.prefix+"-active"),note=document.getElementById(C.prefix+"-active-note"),type=document.getElementById(C.prefix+"-type"),finish=document.getElementById(C.prefix+"-finish"),reopen=document.getElementById(C.prefix+"-reopen"),summary=document.getElementById(C.ids.summary),save=document.getElementById(C.ids.save),del=document.getElementById(C.ids.delete);
 if(active){active.textContent=meta.activeContest?`Concurso ${meta.activeContest} • ${labelType(metaFor(meta.activeContest,meta).type)}`:"Nenhum";note.textContent=meta.activeContest?`${currentBetIds().length} jogos atualmente marcados como Apostado.`:"A carteira está livre para um novo concurso."}
 if(type&&m){type.value=m.type;type.disabled=m.phase!=="draft"&&Boolean(row)}
 if(summary&&row&&m){let badge=summary.querySelector(".su-life-phase");if(!badge){badge=document.createElement("span");badge.className="su-life-phase";summary.append(document.createElement("br"),badge)}badge.textContent=labelPhase(m.phase);badge.dataset.phase=m.phase}
 const other=meta.activeContest&&meta.activeContest!==n;
 if(save)save.disabled=Boolean(row&&(m.phase==="closed"||m.phase==="locked")||other);
 if(finish)finish.disabled=Boolean(!row||m.phase==="locked"||meta.activeContest!==n);
 if(reopen)reopen.disabled=Boolean(!row||m.phase!=="closed"||other);
 if(del)del.disabled=Boolean(!row||m.phase==="locked");
 decorateHistory()
}
function install(){
 const root=document.getElementById(C.ids.root);if(!root||document.getElementById(C.prefix+"-lifecycle"))return false;
 const style=document.createElement("style");style.id=C.prefix+"-lifecycle";style.textContent=`.su-life-box{margin:10px 0;padding:11px 12px;border:1px solid ${C.border};border-radius:12px;background:#fff}.su-life-box span{display:block;color:${C.muted};font-size:.82rem}.su-life-box strong{display:block;margin-top:2px}.su-life-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.su-life-fields label{margin:0!important}.su-life-fields select{width:100%;box-sizing:border-box;font:inherit;padding:11px;border:1px solid ${C.border};border-radius:10px;background:#fff}.su-life-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.su-life-actions .button{min-height:46px}.su-life-phase{display:inline-block;margin-top:7px;padding:5px 8px;border-radius:999px;background:${C.chipBg};color:${C.chip};font-size:.78rem;font-weight:900}.su-life-phase[data-phase="locked"]{background:#fbe8ea;color:#a51d2d}.su-life-phase[data-phase="draft"]{background:#fff4cf;color:#7a5a00}.su-life-active{box-shadow:0 0 0 2px ${C.focus}}.su-life-tag{color:${C.chip}}@media(max-width:560px){.su-life-fields,.su-life-actions{grid-template-columns:1fr}}`;document.head.appendChild(style);
 const intro=root.querySelector("p"),box=document.createElement("div");box.className="su-life-box";box.innerHTML=`<span>Concurso ativo na carteira</span><strong id="${C.prefix}-active">Nenhum</strong><small id="${C.prefix}-active-note">A carteira está livre para um novo concurso.</small>`;intro?.after(box);
 const fields=document.createElement("div");fields.className="su-life-fields";fields.innerHTML=`<label><span>Tipo</span><select id="${C.prefix}-type"><option value="normal">Concurso normal</option><option value="special">Concurso especial</option></select></label>`;const contestInput=document.getElementById(C.ids.number);contestInput?.closest("label")?.after(fields);
 const actions=document.createElement("div");actions.className="su-life-actions";actions.innerHTML=`<button id="${C.prefix}-finish" class="button" type="button">Concluir e liberar carteira</button><button id="${C.prefix}-reopen" class="button" type="button">Reabrir para adicionar jogos</button>`;document.getElementById(C.ids.actions)?.after(actions);
 const save=document.getElementById(C.ids.save),del=document.getElementById(C.ids.delete),type=document.getElementById(C.prefix+"-type");
 save?.addEventListener("click",e=>{const n=selectedNumber(),meta=loadMeta(),row=n?loadBets()[String(n)]:null,m=n?metaFor(n,meta):null;if(!n)return;if(row&&m.phase==="locked"){e.preventDefault();e.stopImmediatePropagation();alert("Este concurso está bloqueado porque o resultado oficial já foi publicado.");return}if(row&&m.phase==="closed"){e.preventDefault();e.stopImmediatePropagation();alert("Reabra este concurso antes de alterar suas apostas.");return}if(meta.activeContest&&meta.activeContest!==n){e.preventDefault();e.stopImmediatePropagation();alert(`O concurso ${meta.activeContest} está ativo. Conclua-o antes de iniciar ou editar outro concurso.`)}},true);
 save?.addEventListener("click",()=>setTimeout(()=>{const n=selectedNumber(),bets=loadBets(),row=n?bets[String(n)]:null;if(!n||!row)return;const meta=loadMeta(),old=metaFor(n,meta);meta.activeContest=n;meta.contests[String(n)]={...old,contest:n,type:type?.value==="special"?"special":"normal",phase:"draft",closedAt:"",updatedAt:now()};saveMeta(meta);queueRender()},80));
 document.getElementById(C.prefix+"-finish")?.addEventListener("click",()=>{const n=selectedNumber(),meta=loadMeta(),bets=loadBets(),row=n?bets[String(n)]:null;if(!n||!row||meta.activeContest!==n)return alert("Selecione o concurso que está ativo na carteira.");const ids=currentBetIds();if(!confirm(`Concluir as apostas do concurso ${n} e retirar ${ids.length} jogos do status Apostado? O registro continuará editável até a publicação do resultado.`))return;row.gameIds=ids;row.totalInvested=ids.length*(Number(row.unitPrice)||0);row.savedAt=row.savedAt||now();bets[String(n)]=row;saveBets(bets);const m=metaFor(n,meta);meta.activeContest=null;meta.contests[String(n)]={...m,phase:"closed",closedAt:now(),updatedAt:now()};saveMeta(meta);writeStatuses(ids,"registrado")});
 document.getElementById(C.prefix+"-reopen")?.addEventListener("click",async()=>{const n=selectedNumber(),meta=loadMeta(),bets=loadBets(),row=n?bets[String(n)]:null;if(!n||!row)return;const m=metaFor(n,meta);if(m.phase==="locked")return alert("Este concurso está bloqueado porque o resultado oficial já foi publicado.");if(meta.activeContest&&meta.activeContest!==n)return alert(`O concurso ${meta.activeContest} está ativo. Conclua-o antes de reabrir outro concurso.`);if(await resultExists(n)){lockContest(n);alert(`O resultado do concurso ${n} já foi publicado. O registro foi bloqueado e não pode mais ser editado.`);return}if(!confirm(`Reabrir o concurso ${n}? Os ${row.gameIds?.length||0} jogos salvos voltarão ao status Apostado.`))return;meta.activeContest=n;meta.contests[String(n)]={...m,phase:"draft",reopenedAt:now(),updatedAt:now()};saveMeta(meta);writeStatuses(row.gameIds||[],"apostado")});
 del?.addEventListener("click",e=>{const n=selectedNumber(),meta=loadMeta(),m=n?metaFor(n,meta):null;if(!n)return;if(m.phase==="locked"){e.preventDefault();e.stopImmediatePropagation();alert("Registros bloqueados por resultado publicado não podem ser excluídos.");return}deleteContext={n,active:meta.activeContest===n,ids:meta.activeContest===n?currentBetIds():[]}},true);
 del?.addEventListener("click",()=>setTimeout(()=>{if(!deleteContext)return;const ctx=deleteContext;deleteContext=null;if(loadBets()[String(ctx.n)])return;const meta=loadMeta();delete meta.contests[String(ctx.n)];if(meta.activeContest===ctx.n)meta.activeContest=null;saveMeta(meta);if(ctx.active)writeStatuses(ctx.ids,"registrado");else queueRender()},100));
 document.getElementById(C.ids.number)?.addEventListener("input",queueRender);document.getElementById(C.ids.history)?.addEventListener("click",()=>setTimeout(queueRender,0));type?.addEventListener("change",queueRender);
 new MutationObserver(queueRender).observe(root,{subtree:true,childList:true,characterData:true});
 window.addEventListener("su:contest-bets-cloud-updated",queueRender);window.addEventListener("su:contest-lifecycle-cloud-updated",queueRender);window.addEventListener("focus",()=>{lockFromLocal();checkLatest()});document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){lockFromLocal();checkLatest()}});
 setInterval(lockFromLocal,3000);setInterval(checkLatest,5*60*1000);setTimeout(()=>{lockFromLocal();checkLatest();queueRender()},800);return true
}
if(!install()){let tries=0,t=setInterval(()=>{if(install()||++tries>60)clearInterval(t)},250)}
})();