(() => {
"use strict";
const C={app:'SU Loto',betsKey:'su-loto-c2-contest-bets-v1',statusKey:'su-loto-c2-status-v4',lockKey:'su-loto-c2-contest-locks-v1',ids:{root:'su-loto-contest-bets',number:'su-loto-bet-contest',history:'su-loto-bet-history',save:'su-loto-save-contest-bets',reopen:'su-loto-reopen-contest-bets'}},BETS_KEY=C.betsKey,STATUS_KEY=C.statusKey,LOCK_KEY=C.lockKey;
function parse(raw,fallback){try{return JSON.parse(raw??"")}catch{return fallback}}
function now(){return new Date().toISOString()}
function valid(v){const n=Number(v);return Number.isInteger(n)&&n>0?n:null}
function loadBets(){const v=parse(localStorage.getItem(BETS_KEY),{});return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function saveBets(data){try{localStorage.setItem(BETS_KEY,JSON.stringify(data));window.dispatchEvent(new CustomEvent("su:contest-bets-updated"));return true}catch(e){console.error(C.app+" reabertura de concurso:",e);return false}}
function locked(n){const v=parse(localStorage.getItem(LOCK_KEY),{});return Boolean(n&&v&&typeof v==="object"&&v[String(n)])}
function selected(){return valid(document.getElementById(C.ids.number)?.value)}
function activeOther(data,n){return Object.values(data).find(row=>Number(row?.contest)!==n&&row?.status==="ativo")||null}
function migrateLegacySessions(){
 const data=loadBets(),active=Object.values(data).filter(row=>row?.status==="ativo").sort((a,b)=>String(b.updatedAt||b.savedAt||"").localeCompare(String(a.updatedAt||a.savedAt||"")));
 if(active.length<=1)return;
 const keep=Number(active[0].contest);let changed=false;
 for(const row of active.slice(1)){const n=Number(row.contest);if(!Number.isInteger(n)||n===keep)continue;row.status="concluido";row.concludedAt=row.concludedAt||row.updatedAt||row.savedAt||now();row.updatedAt=now();data[String(n)]=row;changed=true}
 if(changed)saveBets(data)
}
function statusPayload(){const raw=parse(localStorage.getItem(STATUS_KEY),{}),statuses=raw?.statuses||raw||{};return{raw,statuses:{...statuses}}}
function currentBetIds(){const{statuses}=statusPayload();return Object.entries(statuses).filter(([,v])=>v==="apostado").map(([id])=>String(id))}
function restoreGames(ids){const{raw,statuses}=statusPayload();let changed=0;for(const id of Array.isArray(ids)?ids:[]){const key=String(id);if(statuses[key]!=="apostado"){statuses[key]="apostado";changed++}}const payload=raw&&typeof raw==="object"&&raw.statuses?{...raw,savedAt:now(),statuses}:{app:C.app,wallet:"C2",schema:2,savedAt:now(),statuses};const value=JSON.stringify(payload);localStorage.setItem(STATUS_KEY,value);window.dispatchEvent(new StorageEvent("storage",{key:STATUS_KEY,newValue:value}));setTimeout(()=>location.reload(),changed?650:350)}
function render(){
 const button=document.getElementById(C.ids.reopen);if(!button)return;const n=selected(),data=loadBets(),row=n?data[String(n)]:null,other=activeOther(data,n),isLocked=locked(n);
 button.disabled=Boolean(!row||row.status!=="concluido"||other||isLocked);
 button.title=isLocked?"Resultado oficial publicado":other?`Conclua primeiro o concurso ${other.contest}`:row?.status==="concluido"?"Reabrir e restaurar os jogos salvos":"Disponível somente para concurso concluído";
}
function install(){
 const root=document.getElementById(C.ids.root);if(!root||document.getElementById(C.ids.reopen))return false;
 migrateLegacySessions();
 const actions=document.querySelector(`#${C.ids.root} .contest-bets-actions`);if(!actions)return false;
 const button=document.createElement("button");button.id=C.ids.reopen;button.type="button";button.className="button";button.textContent="Reabrir concurso";button.style.gridColumn="1 / -1";actions.appendChild(button);
 document.addEventListener("click",event=>{const save=event.target.closest?.(`#${C.ids.save}`);if(!save)return;const n=selected(),data=loadBets(),row=n?data[String(n)]:null,other=activeOther(data,n);if(row?.status==="concluido"){event.preventDefault();event.stopImmediatePropagation();alert("Este concurso está concluído. Use o botão Reabrir concurso para restaurar os jogos salvos antes de adicionar novas apostas.");return}if(other){event.preventDefault();event.stopImmediatePropagation();alert(`O concurso ${other.contest} está ativo. Conclua-o antes de iniciar ou editar outro concurso.`)}},true);
 button.addEventListener("click",()=>{const n=selected(),data=loadBets(),row=n?data[String(n)]:null;if(!n||!row)return;if(locked(n))return alert("O resultado oficial deste concurso já foi publicado. O registro está bloqueado.");const other=activeOther(data,n);if(other)return alert(`O concurso ${other.contest} está ativo. Conclua-o antes de reabrir outro concurso.`);const stray=currentBetIds();const extra=stray.filter(id=>!new Set((row.gameIds||[]).map(String)).has(id));const note=extra.length?`\n\nAtenção: ${extra.length} jogos já estão marcados como Apostado e serão mantidos na carteira.`:"";if(!confirm(`Reabrir o concurso ${n}? Os ${row.gameIds?.length||0} jogos salvos voltarão ao status Apostado.${note}`))return;row.status="ativo";row.concludedAt="";row.updatedAt=now();data[String(n)]=row;if(!saveBets(data))return alert("Não foi possível reabrir o concurso.");restoreGames(row.gameIds||[])});
 document.getElementById(C.ids.number)?.addEventListener("input",render);document.getElementById(C.ids.history)?.addEventListener("click",()=>setTimeout(render,0));window.addEventListener("su:contest-bets-cloud-updated",render);window.addEventListener("storage",event=>{if([BETS_KEY,LOCK_KEY,STATUS_KEY].includes(event.key))render()});new MutationObserver(render).observe(root,{subtree:true,childList:true,characterData:true});setTimeout(render,100);return true
}
if(!install()){let tries=0,timer=setInterval(()=>{if(install()||++tries>=60)clearInterval(timer)},250)}
})();