(() => {
  const STYLE_ID = "su-ecosystem-unified-style-v3";
  const apply = () => {
    const panel = document.getElementById("su-loto-cloud-panel");
    const card = panel?.querySelector(".su-loto-card");
    if (!panel || !card) return false;

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .su-loto-cloud-panel{background:linear-gradient(145deg,#25102df2,#4a1558f2)!important;backdrop-filter:blur(14px);padding:20px!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;align-items:start!important}
        .su-loto-cloud-panel .su-loto-card{width:min(520px,100%)!important;max-height:none!important;margin:auto 0!important;border-radius:28px!important;padding:0!important;overflow:visible!important;box-shadow:0 28px 80px #0008!important;background:#fff!important}
        .su-eco-head{padding:24px 24px 18px;background:linear-gradient(135deg,#6f2385,#9d4ab0);color:#fff;position:relative}.su-eco-kicker{margin:0 0 6px;font-size:.78rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase;opacity:.9}
        .su-eco-head h2{margin:0;font-size:1.55rem}.su-eco-sub{margin:7px 0 0;opacity:.9;line-height:1.45}.su-eco-close{position:absolute;right:18px;top:18px;border:1px solid #ffffff55!important;background:#ffffff20!important;color:#fff!important;border-radius:999px!important;padding:8px 12px!important}
        .su-eco-body{padding:22px}.su-eco-user{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #eadff0;border-radius:18px;background:#fbf7fc;margin-bottom:16px}.su-eco-avatar{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:#6f2385;color:#fff;font-weight:900}
        .su-eco-user span{display:block;color:#6b7280;font-size:.82rem}.su-eco-user strong{display:block;margin-top:3px;overflow-wrap:anywhere}.su-loto-grid{grid-template-columns:1fr 1fr!important;gap:10px!important;margin:0 0 16px!important}.su-loto-grid article{background:#f8f4fa!important;border:1px solid #eadff0;border-radius:16px!important;padding:13px!important;min-width:0}
        .su-loto-grid span{font-size:.78rem!important;text-transform:uppercase;letter-spacing:.04em}.su-loto-grid strong{font-size:.98rem;overflow-wrap:anywhere}.su-eco-device{display:grid;gap:7px;margin:14px 0 16px;font-weight:800}.su-eco-device input{margin:0!important;background:#fff}
        .su-loto-actions{grid-template-columns:1fr 1fr!important;gap:10px!important;padding-bottom:max(8px,env(safe-area-inset-bottom))}.su-loto-actions button{width:100%!important;min-height:46px!important;padding:12px 14px!important;background:#f3edf6!important;color:#3d1748!important;border:1px solid #e2d4e8!important;font-size:.96rem!important}
        #su-loto-sync-now{background:#6f2385!important;color:#fff!important;border-color:#6f2385!important}#su-loto-create-backup{background:#e9f7ef!important;color:#0f6b48!important;border-color:#d5e7dc!important}#su-loto-restore-backup{background:#fff8e8!important;color:#8b5a00!important;border-color:#f2dfad!important}
        #su-loto-signout{grid-column:1/-1;background:#fff1f2!important;color:#b42335!important;border-color:#fecdd3!important}@media(max-width:520px){.su-loto-cloud-panel{padding:12px!important}.su-loto-grid,.su-loto-actions{grid-template-columns:1fr!important}#su-loto-signout{grid-column:auto}.su-eco-head{padding-right:78px}.su-eco-body{padding:18px}}
      `;
      document.head.appendChild(style);
    }

    if (!card.dataset.unifiedV3) {
      card.dataset.unifiedV3 = "true";
      const close=document.getElementById("su-loto-close"),account=document.getElementById("su-loto-account"),grid=card.querySelector(".su-loto-grid"),label=card.querySelector("label"),actions=card.querySelector(".su-loto-actions");
      const head=document.createElement("div");head.className="su-eco-head";head.innerHTML=`<p class="su-eco-kicker">Ecossistema SU</p><h2>Conta e sincronização</h2><p class="su-eco-sub">A mesma conta conecta o SU Mega e o SU Loto com dados separados e privados.</p>`;if(close){close.className="su-eco-close";close.textContent="Fechar";head.appendChild(close)}
      const body=document.createElement("div");body.className="su-eco-body";const user=document.createElement("div");user.className="su-eco-user";user.innerHTML=`<div class="su-eco-avatar">SU</div><div><span>Conta conectada</span><strong id="su-eco-account-copy">${account?.textContent||"—"}</strong></div>`;body.appendChild(user);if(grid)body.appendChild(grid);if(label){label.classList.add("su-eco-device");body.appendChild(label)}if(actions)body.appendChild(actions);card.replaceChildren(head,body)
      if(account)new MutationObserver(()=>{const copy=document.getElementById("su-eco-account-copy");if(copy)copy.textContent=account.textContent}).observe(account,{childList:true,characterData:true,subtree:true});
    }
    return true;
  };
  if(!apply()){const timer=setInterval(()=>{if(apply())clearInterval(timer)},250);setTimeout(()=>clearInterval(timer),15000)}
})();
