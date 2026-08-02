import{getApps,getApp}from"https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import{getFirestore,doc,getDoc,setDoc,onSnapshot,serverTimestamp}from"https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
const C={key:'su-loto-c2-contest-lifecycle-v1',appName:'su-loto-cloud',label:'SU Loto',doc:'suLotoContestLifecycleC2'},KEY=C.key,PHASES=new Set(["draft","closed","locked"]);
const app=getApps().find(x=>x.name===C.appName)||getApp(),auth=getAuth(app),db=getFirestore(app);
let user=null,stop=null,applying=false,writing=false,timer=null;
function parse(raw,fallback){try{return JSON.parse(raw??"")}catch{return fallback}}
function norm(raw){
 const s=raw&&typeof raw==="object"?raw:{},contests={};
 for(const[k,v]of Object.entries(s.contests||{})){const n=Number(v?.contest??k);if(!Number.isInteger(n)||n<1)continue;contests[String(n)]={contest:n,type:v?.type==="special"?"special":"normal",phase:PHASES.has(v?.phase)?v.phase:"closed",updatedAt:String(v?.updatedAt||new Date(0).toISOString()),closedAt:String(v?.closedAt||""),reopenedAt:String(v?.reopenedAt||""),lockedAt:String(v?.lockedAt||"")}}
 let active=Number(s.activeContest)||null;if(active&&contests[String(active)]?.phase!=="draft")active=null;if(!active){const d=Object.values(contests).filter(x=>x.phase==="draft").sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];active=d?.contest||null}
 return{schema:1,activeContest:active,contests}
}
function local(){return norm(parse(localStorage.getItem(KEY),{}))}
function stamp(x){const t=new Date(x?.updatedAt||0).getTime();return Number.isFinite(t)?t:0}
function merge(a,b){const out={},keys=new Set([...Object.keys(a.contests),...Object.keys(b.contests)]);for(const k of keys){const x=a.contests[k],y=b.contests[k];out[k]=!x?y:!y?x:(stamp(x)>=stamp(y)?x:y)}const draft=Object.values(out).filter(x=>x.phase==="draft").sort((x,y)=>stamp(y)-stamp(x))[0];return norm({activeContest:draft?.contest||null,contests:out})}
function stable(v){const n=norm(v),ordered=Object.fromEntries(Object.keys(n.contests).sort((a,b)=>Number(a)-Number(b)).map(k=>[k,n.contests[k]]));return JSON.stringify({activeContest:n.activeContest,contests:ordered})}
function ref(uid){return doc(db,"users",uid,"settings",C.doc)}
function apply(remote){const n=norm(remote);if(stable(n)===stable(local()))return;applying=true;localStorage.setItem(KEY,JSON.stringify(n));applying=false;window.dispatchEvent(new CustomEvent("su:contest-lifecycle-cloud-updated",{detail:n}))}
async function upload(){if(!user)return;writing=true;try{const state=local();await setDoc(ref(user.uid),{app:C.label,wallet:"C2",schema:1,state,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()},{merge:false})}catch(e){console.error(C.label+" ciclo de concursos:",e)}finally{writing=false}}
function schedule(){clearTimeout(timer);timer=setTimeout(upload,180)}
async function start(u){user=u;const r=ref(u.uid),snap=await getDoc(r),l=local(),remote=snap.exists()?norm(snap.data()?.state):norm({}),m=merge(l,remote);apply(m);if(!snap.exists()||stable(m)!==stable(remote))await upload();stop?.();stop=onSnapshot(r,s=>{if(!s.exists()||writing)return;apply(s.data()?.state||{})},e=>console.error(C.label+" ciclo snapshot:",e))}
const previous=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const old=this.getItem(k);previous.call(this,k,v);if(this===localStorage&&k===KEY&&!applying&&old!==String(v))schedule()};
window.addEventListener("su:contest-lifecycle-updated",schedule);
onAuthStateChanged(auth,u=>{stop?.();stop=null;user=u;if(u)start(u).catch(e=>console.error(C.label+" ciclo:",e))});