(() => {
  "use strict";
  const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator.standalone===true;
  if(standalone)return;
  const GATE_ID="su-loto-cloud-gate";
  const STATUS_ID="su-loto-cloud-status";
  let userOpened=false;
  function hideGate(){const gate=document.getElementById(GATE_ID);if(!gate||userOpened)return;gate.hidden=true;gate.style.display="none";gate.setAttribute("aria-hidden","true")}
  function openGate(){userOpened=true;const gate=document.getElementById(GATE_ID);if(!gate)return;gate.style.removeProperty("display");gate.hidden=false;gate.removeAttribute("aria-hidden");const card=gate.querySelector(".su-loto-card");if(card&&!document.getElementById("su-loto-login-later")){const later=document.createElement("button");later.id="su-loto-login-later";later.type="button";later.textContent="Agora não";later.style.cssText="width:100%;margin-top:10px;background:#f3edf6;color:#5f256f;border:1px solid #dfd0e5";later.onclick=()=>{userOpened=false;hideGate()};card.appendChild(later)}}
  document.addEventListener("click",event=>{if(event.target.closest(`#${STATUS_ID}`))openGate()},true);
  [0,100,300,700,1500,3000].forEach(delay=>setTimeout(hideGate,delay));
})();