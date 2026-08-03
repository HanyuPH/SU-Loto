import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, onSnapshot, writeBatch, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const config={apiKey:"AIzaSyB7fo20WlKpoySHDBdtjilOqVYRAI8OvKM",authDomain:"su-mega.firebaseapp.com",projectId:"su-mega",storageBucket:"su-mega.firebasestorage.app",messagingSenderId:"747588237835",appId:"1:747588237835:web:b5cc26c6971ca37cb3a50e"};
const app=initializeApp(config,"su-loto-cloud");
const auth=getAuth(app);
const db=getFirestore(app);
const STATUS_KEY="su-loto-c2-status-v4";
const CONTEST_KEY="su-loto-c2-contests-v1";
const PENDING_KEY="su-loto-c2-sync-pending-v1";
const DEVICE_KEY="su-ecosystem-device-id";
const DEVICE_NAME_KEY="su-loto-device-name";
const VALID=new Set(["pendente","registrado","apostado"]);
let user=null,stopStatus=null,stopContests=null,applying=false,startedUid=null,lastSync=null,uploadTimer=null,resumeTimer=null;
let baselineStatuses={};

function parse(raw,fallback){try{return JSON.parse(raw??"")}catch{return fallback}}
function localStatuses(){const p=parse(localStorage.getItem(STATUS_KEY),{});const s=p?.statuses||p||{};const out={};for(const [id,v] of Object.entries(s))if(VALID.has(v))out[id]=v;return out}
function localContests(){const v=parse(localStorage.getItem(CONTEST_KEY),[]);return Array.isArray(v)?v:[]}
function pendingIds(){const value=parse(localStorage.getItem(PENDING_KEY),[]);return new Set(Array.isArray(value)?value.map(String):[])}
function savePending(set){localStorage.setItem(PENDING_KEY,JSON.stringify([...set]))}
function deviceId(){let id=localStorage.getItem(DEVICE_KEY);if(!id){id=crypto.randomUUID?.()||`device-${Date.now()}`;localStorage.setItem(DEVICE_KEY,id)}return id}
function deviceName(){return localStorage.getItem(DEVICE_NAME_KEY)||(/iPad/i.test(navigator.userAgent)?"iPad":/iPhone/i.test(navigator.userAgent)?"iPhone":"Safari")}
function fmt(value){if(!value)return"Nunca";try{return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value))}catch{return value}}
function state(kind,text){const b=document.getElementById("su-loto-cloud-status"),t=document.getElementById("su-loto-cloud-text");if(b)b.dataset.state=kind;if(t)t.textContent=text;if(kind==="synced"){lastSync=new Date().toISOString()}refreshPanel()}

function injectUi(){
 if(document.getElementById("su-loto-cloud-root"))return;
 const style=document.createElement("style");style.textContent=`#su-loto-cloud-root{position:fixed;right:14px;bottom:14px;z-index:9998}.su-loto-cloud-btn{border:0;border-radius:999px;padding:11px 15px;background:#6f2385;color:#fff;font-weight:800;box-shadow:0 8px 28px #0003}.su-loto-cloud-gate,.su-loto-cloud-panel{position:fixed;inset:0;z-index:10000;background:#2f1039ef;display:grid;place-items:center;padding:24px}.su-loto-cloud-gate[hidden],.su-loto-cloud-panel[hidden]{display:none}.su-loto-card{width:min(460px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:24px;padding:26px;color:#17202a}.su-loto-card label{display:grid;gap:7px;margin-top:15px;font-weight:700}.su-loto-card input{font:inherit;padding:13px;border:1px solid #cbd5e1;border-radius:12px}.su-loto-card button{font:inherit;font-weight:800;border-radius:12px;border:0;padding:12px 15px}.su-loto-primary{background:#6f2385;color:#fff;width:100%;margin-top:18px}.su-loto-error{color:#b91c1c;font-weight:700}.su-loto-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.su-loto-grid article{background:#f6eff8;border-radius:14px;padding:12px}.su-loto-grid span{display:block;color:#6b7280;font-size:.85rem}.su-loto-grid strong{display:block;margin-top:4px}.su-loto-actions{display:grid;gap:9px}.su-loto-actions button{background:#f3f4f6}.su-loto-close{float:right;background:#eee!important}`;document.head.appendChild(style);
 const root=document.createElement("div");root.id="su-loto-cloud-root";root.innerHTML=`<button id="su-loto-cloud-status" class="su-loto-cloud-btn" data-state="offline"><span id="su-loto-cloud-text">Nuvem desconectada</span></button>`;document.body.appendChild(root);
 const gate=document.createElement("div");gate.id="su-loto-cloud-gate";gate.className="su-loto-cloud-gate";gate.innerHTML=`<div class="su-loto-card"><p style="color:#6f2385;font-weight:900;margin:0">ECOSSISTEMA SU</p><h2>Entrar no SU Loto</h2><p>Use exatamente a mesma conta no Safari e no aplicativo instalado.</p><form id="su-loto-login"><label>E-mail<input id="su-loto-email" type="email" autocomplete="username" required></label><label>Senha<input id="su-loto-password" type="password" autocomplete="current-password" required></label><p id="su-loto-error" class="su-loto-error"></p><button class="su-loto-primary" type="submit">Entrar</button></form></div>`;document.body.appendChild(gate);
 const panel=document.createElement("div");panel.id="su-loto-cloud-panel";panel.className="su-loto-cloud-panel";panel.hidden=true;panel.innerHTML=`<div class="su-loto-card"><button id="su-loto-close" class="su-loto-close">Fechar</button><p style="color:#6f2385;font-weight:900;margin:0">ECOSSISTEMA SU</p><h2>Conta e sincronização</h2><div class="su-loto-grid"><article><span>Conta</span><strong id="su-loto-account">—</strong></article><article><span>Estado</span><strong id="su-loto-state">—</strong></article><article><span>Última sincronização</span><strong id="su-loto-last">—</strong></article><article><span>Dispositivo</span><strong id="su-loto-device">—</strong></article></div><label>Nome do dispositivo<input id="su-loto-device-name"></label><div class="su-loto-actions"><button id="su-loto-sync-now">Sincronizar agora</button><button id="su-loto-save-device">Salvar nome do dispositivo</button><button id="su-loto-signout">Sair da conta</button></div></div>`;document.body.appendChild(panel);
 document.getElementById("su-loto-cloud-status").onclick=()=>{if(user){panel.hidden=false;refreshPanel()}else gate.hidden=false};
 document.getElementById("su-loto-close").onclick=()=>panel.hidden=true;
 document.getElementById("su-loto-login").onsubmit=async e=>{e.preventDefault();const err=document.getElementById("su-loto-error");err.textContent="";state("saving","Entrando…");try{await setPersistence(auth,browserLocalPersistence);await signInWithEmailAndPassword(auth,document.getElementById("su-loto-email").value.trim(),document.getElementById("su-loto-password").value)}catch(x){err.textContent=`Não foi possível entrar (${x.code||"erro"}).`;state("error","Falha no login")}};
 document.getElementById("su-loto-signout").onclick=()=>signOut(auth);
 document.getElementById("su-loto-sync-now").onclick=()=>resumeSync(true);
 document.getElementById("su-loto-save-device").onclick=()=>{const v=document.getElementById("su-loto-device-name").value.trim();if(v)localStorage.setItem(DEVICE_NAME_KEY,v);refreshPanel()};
 window.addEventListener("offline",()=>state("offline","Offline • alterações em espera"));
 window.addEventListener("online",()=>{if(user){state("saving","Reconectando…");resumeSync()}});
 const footer=document.querySelector("footer p");if(footer)footer.textContent="SU Loto – C2 • Sincronização privada do Ecossistema SU • Backup manual preservado.";
}
function refreshPanel(){const a=document.getElementById("su-loto-account"),s=document.getElementById("su-loto-state"),l=document.getElementById("su-loto-last"),d=document.getElementById("su-loto-device"),i=document.getElementById("su-loto-device-name");if(a)a.textContent=user?.email||"Desconectado";if(s)s.textContent=document.getElementById("su-loto-cloud-text")?.textContent||"—";if(l)l.textContent=fmt(lastSync);if(d)d.textContent=deviceName();if(i&&!i.value)i.value=deviceName()}

function emitApplied(payload){
 try{window.dispatchEvent(new StorageEvent("storage",{key:STATUS_KEY,newValue:JSON.stringify(payload)}))}catch{}
 window.dispatchEvent(new CustomEvent("su:cloud-statuses-applied",{detail:payload.statuses}));
}

function applyStatuses(snap){
 const current=localStatuses();
 const pending=pendingIds();
 snap.forEach(item=>{const status=item.data()?.status;if(VALID.has(status)&&!pending.has(String(item.id)))current[item.id]=status});
 const payload={app:"SU Loto",wallet:"C2",schema:2,savedAt:new Date().toISOString(),statuses:current};
 applying=true;localStorage.setItem(STATUS_KEY,JSON.stringify(payload));applying=false;
 baselineStatuses={...current};
 emitApplied(payload);
}

function detectLocalChanges(next){
 const pending=pendingIds();
 const keys=new Set([...Object.keys(baselineStatuses),...Object.keys(next)]);
 for(const id of keys){const before=baselineStatuses[id]||"pendente";const after=next[id]||"pendente";if(before!==after)pending.add(String(id))}
 baselineStatuses={...next};
 savePending(pending);
 return pending.size;
}

async function uploadPendingStatuses(){
 if(!user)return;
 const pending=pendingIds();
 if(!pending.size){state("synced","Sincronizado");return}
 const current=localStatuses();
 const sent=new Map();
 state("saving",`Sincronizando ${pending.size} alteração${pending.size===1?"":"ões"}…`);
 const ids=[...pending];
 for(let i=0;i<ids.length;i+=400){const batch=writeBatch(db);for(const id of ids.slice(i,i+400)){const status=current[id]||"pendente";sent.set(id,status);batch.set(doc(db,"users",user.uid,"suLoto","C2","gameStatuses",id),{status,updatedAt:serverTimestamp(),deviceId:deviceId(),deviceName:deviceName()},{merge:true})}await batch.commit()}
 const latest=localStatuses();
 const remaining=pendingIds();
 for(const [id,status] of sent)if((latest[id]||"pendente")===status)remaining.delete(id);
 savePending(remaining);
 baselineStatuses={...latest};
 state("synced",remaining.size?"Sincronização parcial":"Sincronizado");
}

function scheduleStatusUpload(){clearTimeout(uploadTimer);uploadTimer=setTimeout(()=>uploadPendingStatuses().catch(e=>{console.error(e);state("error","Falha ao salvar")}),260)}

async function uploadContests(contests){if(!user)return;for(let i=0;i<contests.length;i+=400){const batch=writeBatch(db);for(const c of contests.slice(i,i+400))batch.set(doc(db,"users",user.uid,"suLoto","C2","contests",String(Number(c.number))),{...c,number:Number(c.number),updatedAtCloud:serverTimestamp(),deviceId:deviceId(),deviceName:deviceName()},{merge:true});await batch.commit()}}
function applyContests(snap){const list=[];snap.forEach(x=>{const d=x.data();list.push({number:Number(d.number??x.id),date:String(d.date||""),numbers:Array.isArray(d.numbers)?d.numbers.map(Number).sort((a,b)=>a-b):[],source:String(d.source||""),notes:String(d.notes||""),createdAt:String(d.createdAt||""),updatedAt:String(d.updatedAt||"")})});list.sort((a,b)=>b.number-a.number);applying=true;if(!globalThis.SULotoContests?.importData?.(list,true))localStorage.setItem(CONTEST_KEY,JSON.stringify(list));applying=false}

const nativeSet=Storage.prototype.setItem;
Storage.prototype.setItem=function(k,v){
 nativeSet.call(this,k,v);
 if(this!==localStorage||applying||!user)return;
 if(k===STATUS_KEY){if(detectLocalChanges(localStatuses()))scheduleStatusUpload()}
 if(k===CONTEST_KEY)uploadContests(localContests()).then(()=>state("synced","Sincronizado")).catch(e=>{console.error(e);state("error","Falha nos concursos")});
};

async function pullStatuses(){if(!user)return;const snap=await getDocs(collection(db,"users",user.uid,"suLoto","C2","gameStatuses"));if(!snap.empty)applyStatuses(snap)}
async function resumeSync(force=false){
 if(!user||document.hidden)return;
 clearTimeout(resumeTimer);
 resumeTimer=setTimeout(async()=>{try{state("saving",force?"Sincronizando agora…":"Atualizando…");await pullStatuses();await uploadPendingStatuses()}catch(e){console.error(e);state("error","Falha ao sincronizar")}},180);
}
function installResumeHooks(){window.addEventListener("pageshow",()=>resumeSync());window.addEventListener("focus",()=>resumeSync());document.addEventListener("visibilitychange",()=>{if(!document.hidden)resumeSync()})}

async function start(u){
 if(startedUid===u.uid){resumeSync();return}
 startedUid=u.uid;
 baselineStatuses=localStatuses();
 state("saving","Preparando sincronização…");
 await setDoc(doc(db,"users",u.uid,"settings","ecosystem"),{products:{suMega:true,suLoto:true},updatedAt:serverTimestamp()},{merge:true});
 const sr=collection(db,"users",u.uid,"suLoto","C2","gameStatuses"),cr=collection(db,"users",u.uid,"suLoto","C2","contests");
 const [rs,rc]=await Promise.all([getDocs(sr),getDocs(cr)]);
 if(rs.empty){const pending=pendingIds();for(const [id,status] of Object.entries(localStatuses()))if(status!=="pendente")pending.add(String(id));savePending(pending)}else applyStatuses(rs);
 if(rc.empty&&localContests().length)await uploadContests(localContests());
 await uploadPendingStatuses();
 stopStatus?.();stopContests?.();
 stopStatus=onSnapshot(sr,s=>{applyStatuses(s);state(navigator.onLine?"synced":"offline",navigator.onLine?"Sincronizado":"Offline • cache local")},e=>{console.error(e);state("error",`Erro status: ${e.code||""}`)});
 stopContests=onSnapshot(cr,s=>{applyContests(s);state(navigator.onLine?"synced":"offline",navigator.onLine?"Sincronizado":"Offline • cache local")},e=>{console.error(e);state("error",`Erro concursos: ${e.code||""}`)});
}

baselineStatuses=localStatuses();
injectUi();installResumeHooks();state("saving","Verificando login…");
onAuthStateChanged(auth,async u=>{user=u;document.getElementById("su-loto-cloud-gate").hidden=!!u;if(!u){startedUid=null;stopStatus?.();stopContests?.();state("offline","Entre para sincronizar");return}try{await start(u)}catch(e){console.error(e);state("error",`Erro: ${e.code||e.message||"nuvem"}`);document.getElementById("su-loto-cloud-gate").hidden=false}});
