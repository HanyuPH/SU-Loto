(function(){
  "use strict";
  const STORAGE_KEY="su-loto-c2-contests-v1";
  let games=[];
  let states={};
  let labels={};
  let pad=n=>String(n).padStart(3,"0");
  let toast=()=>{};
  let downloadJson=()=>{};
  let contests=[];
  let selectedNumbers=new Set();
  let activeContestNumber=null;
  let initialized=false;
  const el={};

  function init(context){
    if(initialized)return;initialized=true;
    games=context.games||[];states=context.states||{};labels=context.labels||{};pad=context.pad||pad;toast=context.toast||toast;downloadJson=context.downloadJson||downloadJson;
    cacheElements();buildNumberGrid();load();bind();renderHistory();updateCounts();
  }
  function cacheElements(){
    ["contest-form","contest-form-title","contest-editing-number","contest-number","contest-date","contest-source","contest-notes","contest-numbers-text","contest-selected-count","contest-number-grid","contest-form-error","contest-cancel-edit","contest-clear-form","contest-scope","contest-search","contest-csv-file","contest-export-history","contest-clear-history","contest-total-count","contest-tab-count","contest-history","contest-empty-history","contest-analysis"].forEach(id=>el[id]=document.getElementById(id));
  }
  function bind(){
    el["contest-form"].addEventListener("submit",saveContestFromForm);
    el["contest-clear-form"].addEventListener("click",resetForm);
    el["contest-cancel-edit"].addEventListener("click",resetForm);
    el["contest-numbers-text"].addEventListener("input",syncFromText);
    el["contest-scope"].addEventListener("change",()=>{if(activeContestNumber!==null)openContest(activeContestNumber)});
    el["contest-search"].addEventListener("input",renderHistory);
    el["contest-csv-file"].addEventListener("change",event=>{const file=event.target.files&&event.target.files[0];if(file)importCsv(file);event.target.value=""});
    el["contest-export-history"].addEventListener("click",()=>{downloadJson({app:"SU Loto",wallet:"C2",type:"contest-history",version:1,exportedAt:new Date().toISOString(),contests},"SU-Loto-C2-concursos-"+new Date().toISOString().slice(0,10)+".json");toast("Histórico exportado")});
    el["contest-clear-history"].addEventListener("click",()=>{if(!contests.length)return;if(confirm("Apagar todos os concursos salvos neste aparelho? Esta ação não altera os 300 jogos.")){contests=[];activeContestNumber=null;save();resetForm();renderHistory();renderAnalysis(null);toast("Histórico local apagado")}});
  }
  function buildNumberGrid(){
    const frag=document.createDocumentFragment();
    for(let n=1;n<=25;n++){
      const button=document.createElement("button");button.type="button";button.className="draw-ball";button.dataset.number=String(n);button.textContent=String(n).padStart(2,"0");button.setAttribute("aria-pressed","false");button.addEventListener("click",()=>toggleNumber(n));frag.appendChild(button);
    }
    el["contest-number-grid"].replaceChildren(frag);
  }
  function toggleNumber(number){
    if(selectedNumbers.has(number))selectedNumbers.delete(number);else if(selectedNumbers.size<15)selectedNumbers.add(number);else{showError("Selecione exatamente 15 dezenas.");return}
    syncSelectionUi();hideError();
  }
  function parseNumbers(value){
    const values=String(value||"").match(/\d{1,2}/g)||[];
    const unique=[];const seen=new Set();
    values.map(Number).forEach(n=>{if(n>=1&&n<=25&&!seen.has(n)){seen.add(n);unique.push(n)}});
    return unique.sort((a,b)=>a-b);
  }
  function syncFromText(){
    const values=parseNumbers(el["contest-numbers-text"].value);
    selectedNumbers=new Set(values.slice(0,15));syncSelectionUi(false);
    if(values.length>15)showError("Foram encontradas mais de 15 dezenas; somente as 15 primeiras válidas foram selecionadas.");else hideError();
  }
  function syncSelectionUi(updateText=true){
    const sorted=[...selectedNumbers].sort((a,b)=>a-b);
    el["contest-selected-count"].textContent=sorted.length+"/15";
    el["contest-selected-count"].classList.toggle("complete",sorted.length===15);
    el["contest-number-grid"].querySelectorAll(".draw-ball").forEach(button=>{const active=selectedNumbers.has(Number(button.dataset.number));button.classList.toggle("selected",active);button.setAttribute("aria-pressed",String(active))});
    if(updateText)el["contest-numbers-text"].value=sorted.map(n=>String(n).padStart(2,"0")).join(" ");
  }
  function load(){
    try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");contests=sanitizeContests(parsed)}catch(e){contests=[]}
  }
  function save(){
    contests.sort((a,b)=>b.number-a.number);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(contests))}catch(e){}updateCounts();
  }
  function sanitizeContests(input){
    if(!Array.isArray(input))return[];
    const seen=new Set();const clean=[];
    input.forEach(item=>{
      const number=Number(item&&item.number);const numbers=parseNumbers(item&&item.numbers);
      if(!Number.isInteger(number)||number<1||numbers.length!==15||seen.has(number))return;
      seen.add(number);const rawSource=String(item.source||"").trim();const source=/^https?:\/\//i.test(rawSource)?rawSource:"";clean.push({number,date:normalizeDate(item.date),numbers,source,notes:String(item.notes||"").trim(),createdAt:item.createdAt||new Date().toISOString(),updatedAt:item.updatedAt||item.createdAt||new Date().toISOString()});
    });
    return clean.sort((a,b)=>b.number-a.number);
  }
  function normalizeDate(value){
    const text=String(value||"").trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
    const match=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(match)return match[3]+"-"+match[2].padStart(2,"0")+"-"+match[1].padStart(2,"0");
    return "";
  }
  function saveContestFromForm(event){
    event.preventDefault();hideError();
    const number=Number(el["contest-number"].value);const date=el["contest-date"].value;const numbers=[...selectedNumbers].sort((a,b)=>a-b);const source=el["contest-source"].value.trim();const notes=el["contest-notes"].value.trim();const editing=Number(el["contest-editing-number"].value)||null;
    if(!Number.isInteger(number)||number<1)return showError("Informe um número de concurso válido.");
    if(!date)return showError("Informe a data do sorteio.");
    if(numbers.length!==15)return showError("Selecione exatamente 15 dezenas diferentes.");
    if(source&& !/^https?:\/\//i.test(source))return showError("A fonte deve começar com http:// ou https://.");
    if(contests.some(item=>item.number===number&&item.number!==editing))return showError("Este concurso já está registrado. Abra-o no histórico para editar.");
    const now=new Date().toISOString();
    const existing=contests.find(item=>item.number===editing);
    const record={number,date,numbers,source,notes,createdAt:existing?existing.createdAt:now,updatedAt:now};
    if(existing){contests=contests.map(item=>item.number===editing?record:item)}else contests.push(record);
    activeContestNumber=number;save();renderHistory();resetForm(false);openContest(number);toast(existing?"Concurso atualizado e conferido":"Concurso registrado e conferido");
  }
  function showError(message){el["contest-form-error"].textContent=message;el["contest-form-error"].hidden=false}
  function hideError(){el["contest-form-error"].hidden=true;el["contest-form-error"].textContent=""}
  function resetForm(clearActive=true){
    el["contest-form"].reset();el["contest-editing-number"].value="";selectedNumbers=new Set();syncSelectionUi();hideError();el["contest-form-title"].textContent="Cadastrar concurso";el["contest-cancel-edit"].hidden=true;if(clearActive)activeContestNumber=null;
  }
  function editContest(number){
    const contest=contests.find(item=>item.number===number);if(!contest)return;
    el["contest-editing-number"].value=String(contest.number);el["contest-number"].value=String(contest.number);el["contest-date"].value=contest.date;el["contest-source"].value=contest.source;el["contest-notes"].value=contest.notes;selectedNumbers=new Set(contest.numbers);syncSelectionUi();el["contest-form-title"].textContent="Editar concurso "+contest.number;el["contest-cancel-edit"].hidden=false;document.querySelector(".contest-form-card").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function deleteContest(number){
    if(!confirm("Excluir o concurso "+number+" do histórico local?"))return;
    contests=contests.filter(item=>item.number!==number);if(activeContestNumber===number){activeContestNumber=null;renderAnalysis(null)}save();renderHistory();toast("Concurso excluído")
  }
  function updateCounts(){const count=contests.length;el["contest-total-count"].textContent=count;el["contest-tab-count"].textContent=count}
  function formatContestDate(value){if(!value)return "Data não informada";const [y,m,d]=value.split("-");return d+"/"+m+"/"+y}
  function renderHistory(){
    const query=String(el["contest-search"].value||"").trim();const filtered=contests.filter(item=>!query||String(item.number).includes(query));
    el["contest-empty-history"].hidden=filtered.length!==0;
    const frag=document.createDocumentFragment();
    filtered.forEach(contest=>{
      const article=document.createElement("article");article.className="history-item";if(contest.number===activeContestNumber)article.classList.add("active");
      const result=calculate(contest,el["contest-scope"].value);
      article.innerHTML='<button type="button" class="history-open" aria-label="Abrir concurso '+contest.number+'"><span class="history-title">Concurso '+contest.number+'</span><span class="history-date">'+escapeHtml(formatContestDate(contest.date))+'</span><span class="history-balls">'+contest.numbers.map(n=>'<b>'+String(n).padStart(2,"0")+'</b>').join("")+'</span><span class="history-result">Melhor: <strong>'+result.best+'</strong> pontos • '+result.evaluated+' jogos conferidos</span></button><div class="history-actions"><button type="button" data-action="edit">Editar</button><button type="button" data-action="delete" class="danger-text">Excluir</button></div>';
      article.querySelector(".history-open").addEventListener("click",()=>openContest(contest.number));article.querySelector('[data-action="edit"]').addEventListener("click",()=>editContest(contest.number));article.querySelector('[data-action="delete"]').addEventListener("click",()=>deleteContest(contest.number));frag.appendChild(article);
    });
    el["contest-history"].replaceChildren(frag);
  }
  function eligibleGames(scope){return games.filter(game=>scope==="all"||states[game.id]===scope)}
  function calculate(contest,scope){
    const draw=new Set(contest.numbers);const results=eligibleGames(scope).map(game=>{const hits=game.numbers.filter(n=>draw.has(n));return{game,hits:hits.length,hitNumbers:hits}}).sort((a,b)=>b.hits-a.hits||a.game.id-b.game.id);
    const distribution={11:0,12:0,13:0,14:0,15:0};results.forEach(item=>{if(distribution[item.hits]!==undefined)distribution[item.hits]++});
    const best=results.length?results[0].hits:0;const bestGames=results.filter(item=>item.hits===best);
    const systems={};results.forEach(item=>{const key=item.game.system||"Sem sistema";if(!systems[key])systems[key]={name:key,evaluated:0,best:0,distribution:{11:0,12:0,13:0,14:0,15:0}};const s=systems[key];s.evaluated++;s.best=Math.max(s.best,item.hits);if(s.distribution[item.hits]!==undefined)s.distribution[item.hits]++});
    return{scope,evaluated:results.length,results,distribution,best,bestGames,systems:Object.values(systems)};
  }
  function openContest(number){
    const contest=contests.find(item=>item.number===number);if(!contest)return;activeContestNumber=number;renderHistory();renderAnalysis(contest);document.getElementById("contest-analysis").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function renderAnalysis(contest){
    if(!contest){el["contest-analysis"].hidden=true;el["contest-analysis"].replaceChildren();return}
    const result=calculate(contest,el["contest-scope"].value);const scopeLabel=el["contest-scope"].selectedOptions[0].textContent;
    el["contest-analysis"].hidden=false;
    const source=contest.source?'<a href="'+escapeAttribute(contest.source)+'" target="_blank" rel="noopener">Abrir fonte</a>':"Sem link de fonte";
    const topGames=result.bestGames.slice(0,12).map(item=>'<span class="top-game-chip">Jogo '+pad(item.game.id)+' • '+item.hits+' pontos</span>').join("");
    const systemRows=result.systems.map(system=>'<tr><td>'+escapeHtml(system.name)+'</td><td>'+system.evaluated+'</td><td><strong>'+system.best+'</strong></td><td>'+system.distribution[11]+'</td><td>'+system.distribution[12]+'</td><td>'+system.distribution[13]+'</td><td>'+system.distribution[14]+'</td><td>'+system.distribution[15]+'</td></tr>').join("");
    const gameRows=result.results.map(item=>'<article class="checked-game"><div class="checked-game-head"><div><strong>Jogo '+pad(item.game.id)+'</strong><span>'+escapeHtml(item.game.system)+' • '+escapeHtml(item.game.group)+' • '+escapeHtml(labels[states[item.game.id]]||states[item.game.id]||"Pendente")+'</span></div><b class="score-badge score-'+Math.min(item.hits,15)+'">'+item.hits+' pontos</b></div><div class="checked-numbers">'+item.game.numbers.map(n=>'<span class="'+(contest.numbers.includes(n)?"hit":"miss")+'">'+String(n).padStart(2,"0")+'</span>').join("")+'</div></article>').join("");
    el["contest-analysis"].innerHTML='<div class="analysis-head"><div><p class="eyebrow purple">Conferência automática</p><h2>Concurso '+contest.number+'</h2><p>'+escapeHtml(formatContestDate(contest.date))+' • '+escapeHtml(scopeLabel)+' • '+source+'</p></div><button type="button" class="button" id="analysis-edit">Editar concurso</button></div><div class="draw-result-balls">'+contest.numbers.map(n=>'<span>'+String(n).padStart(2,"0")+'</span>').join("")+'</div><div class="analysis-metrics"><article><span>Jogos conferidos</span><strong>'+result.evaluated+'</strong></article><article><span>Melhor pontuação</span><strong>'+result.best+'</strong></article><article><span>11 pontos</span><strong>'+result.distribution[11]+'</strong></article><article><span>12 pontos</span><strong>'+result.distribution[12]+'</strong></article><article><span>13 pontos</span><strong>'+result.distribution[13]+'</strong></article><article><span>14 pontos</span><strong>'+result.distribution[14]+'</strong></article><article><span>15 pontos</span><strong>'+result.distribution[15]+'</strong></article></div><div class="analysis-section"><h3>Melhores jogos</h3><div class="top-games">'+(topGames||'<span class="muted">Nenhum jogo disponível neste filtro.</span>')+'</div></div><div class="analysis-section"><h3>Desempenho por sistema</h3><div class="table-wrap"><table><thead><tr><th>Sistema</th><th>Jogos</th><th>Melhor</th><th>11</th><th>12</th><th>13</th><th>14</th><th>15</th></tr></thead><tbody>'+systemRows+'</tbody></table></div></div><details class="all-results"><summary>Ver todos os '+result.evaluated+' jogos conferidos</summary><div class="checked-games">'+gameRows+'</div></details>'+(contest.notes?'<div class="analysis-note"><strong>Observação:</strong> '+escapeHtml(contest.notes)+'</div>':'');
    document.getElementById("analysis-edit").addEventListener("click",()=>editContest(contest.number));
  }
  function refresh(){if(!initialized)return;renderHistory();if(activeContestNumber!==null){const contest=contests.find(item=>item.number===activeContestNumber);renderAnalysis(contest||null)}}
  function exportData(){return contests.map(item=>({...item,numbers:[...item.numbers]}))}
  function importData(data,replace){
    const incoming=sanitizeContests(data);if(!incoming.length)return false;
    if(replace)contests=incoming;else{const map=new Map(contests.map(item=>[item.number,item]));incoming.forEach(item=>map.set(item.number,item));contests=[...map.values()]}
    save();renderHistory();if(activeContestNumber!==null)refresh();return true;
  }
  function importCsv(file){
    const reader=new FileReader();reader.onload=()=>{try{
      const rows=parseCsv(String(reader.result||""));if(!rows.length)throw new Error("Arquivo vazio");
      const records=[];let invalid=0;const start=/concurso|contest/i.test(rows[0].join(" "))?1:0;
      for(let i=start;i<rows.length;i++){
        const row=rows[i].map(value=>String(value||"").trim());if(!row.some(Boolean))continue;
        const number=Number((row[0].match(/\d+/)||[])[0]);const date=normalizeDate(row[1]);const numbers=parseNumbers(row.slice(2).join(" "));
        if(Number.isInteger(number)&&number>0&&date&&numbers.length===15)records.push({number,date,numbers,source:"",notes:"Importado de "+file.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});else invalid++;
      }
      if(!records.length)throw new Error("Nenhum concurso válido encontrado");
      const existing=new Set(contests.map(item=>item.number));const newRecords=records.filter(item=>!existing.has(item.number));contests.push(...newRecords);save();renderHistory();toast(newRecords.length+" concursos importados"+(invalid?" • "+invalid+" linhas ignoradas":""));
    }catch(error){alert("Não foi possível importar o CSV. Use colunas Concurso, Data e 15 dezenas.\n\n"+error.message)}};reader.readAsText(file,"utf-8")
  }
  function parseCsv(text){
    const clean=text.replace(/^\uFEFF/,"");const firstLine=(clean.split(/\r?\n/)[0]||"");const delimiter=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?";":",";const rows=[];let row=[];let field="";let quoted=false;
    for(let i=0;i<clean.length;i++){
      const char=clean[i];if(char==='"'){if(quoted&&clean[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(char===delimiter&&!quoted){row.push(field);field=""}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&clean[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field=""}else field+=char;
    }
    if(field||row.length){row.push(field);rows.push(row)}return rows;
  }
  function escapeHtml(value){return String(value||"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char])}
  function escapeAttribute(value){return escapeHtml(value).replace(/`/g,"&#096;")}

  window.SULotoContests={init,refresh,exportData,importData};
})();
