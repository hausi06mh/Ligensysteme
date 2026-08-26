
import {initStore,getState,saveState,resetState,exportState,importState,pushUndo,undoLast,createBackupNow,listAutomaticBackups,restoreLatestAutomaticBackup} from "./store632.js";
import {getLeague,getSeason,getTeam,standingsAt,movementAt,maxMatchday} from "./standings632.js";
import {roundRobin,dateForRound} from "./fixtures632.js";
import {el,toast,closeOverlay,badge,compressedImageDataURL,cropImageFile,normalizeLogoImage} from "./ui632.js";
import {validateState,normalizeState} from "./integrity632.js";
import {COUNTRIES,POSITIONS,generatePlayers,developPlayer,playerCombinations,generateCountrySpecificName,normalizePosition} from "./playerUniverse632.js";
import {defaultFinance,playerWage,recalcWages,addTransaction,settleMatchFinance,seasonFinance,aiTransferWindow,createCompetition,groupTable,simulateCompetitionStep} from "./managerWorld632.js";
import {migrateState,compactCareerState,snapshotCareer,restoreSnapshot,createSaveExport,parseSaveImport,validateCareerState,competitionDiagnostics,normalizeCompetitionParticipants,updateCareerRecords,hallOfFameCandidate} from "./stabilityCareer632.js";

let view="home";
let tableMode="overall";
let tableDay=null;
let marketFilters={query:"",country:"",position:"",minRating:0,maxAge:99};
let lastRuntimeErrorToast=0;
function reportRuntimeProblem(error){
  // Nicht-kritische Browser-/UI-Fehler werden protokolliert, ohne die Bedienung
  // bei jedem Klick mit einer allgemeinen Fehlermeldung zu unterbrechen.
  console.error(error);
}
window.addEventListener("error",event=>reportRuntimeProblem(event.error||event.message));
window.addEventListener("unhandledrejection",event=>{
  event.preventDefault();
  reportRuntimeProblem(event.reason||"Unbekannter Speicherfehler");
});
window.addEventListener("flm:save-error",event=>{
  const now=Date.now();
  if(now-lastRuntimeErrorToast>2500){lastRuntimeErrorToast=now;try{toast(event.detail?.message||"Speichern fehlgeschlagen")}catch{}}
});
window.addEventListener("flm:recovered",()=>{
  setTimeout(()=>{try{toast("Rettungsspielstand wiederhergestellt")}catch{}},500);
});
async function bootApplication(){
  try{
    await initStore();
    normalizeState(state());
    upgradeState();
    render();
    window.dispatchEvent(new Event("fle:boot-ok"));
  }catch(error){
    console.error("Startfehler:",error);
    const appRoot=document.querySelector("#app");
    if(appRoot){
      const safeMessage=String(error?.message||error||"Unbekannter Fehler").replace(/[<>&]/g,"");
      appRoot.innerHTML=`<main style="max-width:680px;margin:40px auto;padding:20px;font-family:system-ui">
        <section class="card">
          <h1>App konnte nicht vollständig starten</h1>
          <p>Dein Spielstand wurde nicht automatisch gelöscht. Lade die Seite zunächst neu.</p>
          <div class="actions">
            <button class="btn primary" id="bootReload">Neu laden</button>
            <button class="btn danger" id="bootReset">Lokale Daten zurücksetzen</button>
          </div>
          <p class="small muted">${safeMessage}</p>
        </section>
      </main>`;
      document.querySelector("#bootReload")?.addEventListener("click",()=>location.reload());
      document.querySelector("#bootReset")?.addEventListener("click",async()=>{
        if(!confirm("Lokale App-Daten wirklich zurücksetzen? Nur fortfahren, wenn du ein Export-Backup hast."))return;
        await resetState();
      });
    }
  }
}
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded",()=>{bootApplication();},{once:true});
}else{
  bootApplication();
}

function state(){ return getState(); }
function league(){ return getLeague(state()); }
function season(){ return getSeason(state(),league()); }
function team(id){ return getTeam(state(),id); }
function playerById(id){
  for(const t of state().teams){ const p=t.players.find(x=>x.id===Number(id)); if(p) return p; }
  return null;
}
function activeTeams(){ return season().teamIds.map(team).filter(Boolean); }

function swapScheduledFixtureSides(match){
  const oldHome=match.homeId,oldAway=match.awayId;
  match.homeId=oldAway;match.awayId=oldHome;
  if(match.lineups){
    const h=match.lineups.home||[],a=match.lineups.away||[],hb=match.lineups.homeBench||[],ab=match.lineups.awayBench||[];
    match.lineups.home=a;match.lineups.away=h;match.lineups.homeBench=ab;match.lineups.awayBench=hb;
  }
}
function rebalanceFutureHomeAway(seasonObj){
  const all=(seasonObj?.matches||[]).filter(m=>m&&Number(m.homeId)&&Number(m.awayId));
  if(all.length<2)return false;
  const playedDay=Math.max(0,...all.filter(m=>m.status!=="scheduled"||(m.events||[]).length).map(m=>Number(m.matchday||0)));
  const history=new Map();
  const push=(id,side)=>{if(!history.has(Number(id)))history.set(Number(id),[]);history.get(Number(id)).push(side)};
  all.filter(m=>Number(m.matchday||0)<=playedDay||m.status!=="scheduled"||(m.events||[]).length)
    .sort((a,b)=>Number(a.matchday||0)-Number(b.matchday||0)||Number(a.id||0)-Number(b.id||0))
    .forEach(m=>{push(m.homeId,"H");push(m.awayId,"A")});
  const future=all.filter(m=>m.status==="scheduled"&&!(m.events||[]).length&&Number(m.matchday||0)>playedDay)
    .sort((a,b)=>Number(a.matchday||0)-Number(b.matchday||0)||Number(a.id||0)-Number(b.id||0));
  const cost=(id,side)=>{
    const seq=history.get(Number(id))||[];let score=0;
    const last=seq[seq.length-1],prev=seq[seq.length-2];
    if(last===side)score+=7;
    if(last===side&&prev===side)score+=80;
    const h=seq.filter(x=>x==="H").length+(side==="H"?1:0),a=seq.length+1-h;
    score+=Math.abs(h-a)*1.25;
    return score;
  };
  let changed=false,currentDay=null,dayGames=[];
  const flush=()=>{
    for(const m of dayGames){
      const keep=cost(m.homeId,"H")+cost(m.awayId,"A");
      const flip=cost(m.homeId,"A")+cost(m.awayId,"H");
      if(flip+0.01<keep){swapScheduledFixtureSides(m);changed=true;}
      push(m.homeId,"H");push(m.awayId,"A");
    }
    dayGames=[];
  };
  for(const m of future){
    if(currentDay!==null&&Number(m.matchday)!==currentDay)flush();
    currentDay=Number(m.matchday);dayGames.push(m);
  }
  flush();
  return changed;
}


function teamForm(teamId,day=null,limit=5){
  const matches=season().matches
    .filter(m=>m.status==="played" && (m.homeId===teamId||m.awayId===teamId) && (day===null||m.matchday<=day))
    .sort((a,b)=>(b.matchday||0)-(a.matchday||0) || String(b.date||"").localeCompare(String(a.date||"")))
    .slice(0,limit)
    .reverse();
  return matches.map(m=>{
    const goalsFor=m.homeId===teamId?m.homeGoals:m.awayGoals;
    const goalsAgainst=m.homeId===teamId?m.awayGoals:m.homeGoals;
    return goalsFor>goalsAgainst?"W":goalsFor<goalsAgainst?"L":"D";
  });
}
function formDots(teamId,day=null){
  const form=teamForm(teamId,day,5);
  const empty=Array(Math.max(0,5-form.length)).fill("E");
  return [...empty,...form].map(result=>{
    const cls=result==="W"?"win":result==="L"?"loss":result==="D"?"draw":"empty";
    const label=result==="W"?"Sieg":result==="L"?"Niederlage":result==="D"?"Unentschieden":"Kein Spiel";
    return `<span class="form-dot ${cls}" title="${label}" aria-label="${label}"></span>`;
  }).join("");
}

function eventTeamId(event,match){
  const p=playerById(event.playerId);
  if(!p)return null;
  const playerTeamId=Number(p.teamId);
  if(event.type==="ownGoal"){
    return playerTeamId===match.homeId?match.awayId:match.homeId;
  }
  return playerTeamId;
}
function isGoalEvent(event){return ["goal","penalty","ownGoal"].includes(event.type)}
function scoreFromEvents(match){
  let home=0,away=0;
  for(const event of match.events||[]){
    if(!isGoalEvent(event))continue;
    const scoringTeam=eventTeamId(event,match);
    if(scoringTeam===match.homeId)home++;
    if(scoringTeam===match.awayId)away++;
  }
  return {home,away,total:home+away};
}
function syncMatchScoreFromEvents(match){
  const score=scoreFromEvents(match);
  match.homeGoals=score.home;
  match.awayGoals=score.away;
  // Ein Tor beendet ein manuell geführtes Spiel nicht mehr automatisch.
  // Erst „Spiel beenden“ erzeugt Endstand und automatische Statistiken.
  if(score.total>0&&match.status==="scheduled")match.status="live";
  return score;
}
function visibleMatchScore(match){
  if(match.scoreMode==="manual"){
    return match.status==="played"?`${Number(match.homeGoals||0)}:${Number(match.awayGoals||0)}`:"– : –";
  }
  const eventScore=scoreFromEvents(match);
  if(eventScore.total>0)return `${eventScore.home}:${eventScore.away}`;
  return match.status==="played"?`${Number(match.homeGoals||0)}:${Number(match.awayGoals||0)}`:"– : –";
}
function eventTeam(event,match){
  const id=eventTeamId(event,match);
  return id?team(id):null;
}

function fmtDate(value){ return value ? new Date(`${value}T12:00:00`).toLocaleDateString("de-DE") : "Kein Datum"; }
function nextId(items){ return Math.max(0,...items.map(x=>x.id))+1; }
function deepClone(v){ return JSON.parse(JSON.stringify(v)); }

function upgradeState(){
  const s=migrateState(state());
  s.settings ||= {};
  if(!s.settings.countryNamesV25){
    const used=new Set(s.teams.flatMap(t=>(t.players||[]).map(p=>p.name)));
    for(const p of [...(s.freeAgents||[]),...(s.academyPlayers||[])]){
      let next=generateCountrySpecificName(p.nationality);
      let guard=0;
      while(used.has(next)&&guard++<80)next=generateCountrySpecificName(p.nationality);
      p.name=next;
      used.add(next);
    }
    s.settings.countryNamesV25=true;
    s.settings.dataSchemaVersion=25;
  }
  if(!s.settings.positionsGermanV24){
    for(const p of [...(s.freeAgents||[]),...(s.academyPlayers||[]),...s.teams.flatMap(t=>t.players||[])])p.position=normalizePosition(p.position);
    s.settings.positionsGermanV24=true;
  }
  if(!s.settings.countryNamesV23Fixed){
    const used=new Set();
    for(const p of s.freeAgents||[]){
      if(used.has(p.name)||["Schottland","England","Wales","Irland","Nordirland","Schweden","Norwegen","Dänemark","Deutschland","Frankreich","Spanien","Italien","Niederlande","Portugal","Polen","Österreich","Schweiz","Kroatien","Serbien","Rumänien","Türkei","Brasilien","Argentinien"].includes(p.nationality)){
        let next=generateCountrySpecificName(p.nationality);
        let guard=0;
        while(used.has(next)&&guard++<30)next=generateCountrySpecificName(p.nationality);
        p.name=next;
      }
      used.add(p.name);
    }
    s.settings.countryNamesV23Fixed=true;
  }
  s.settings ||= {};
  s.settings.pointsWin ??= 3;
  s.settings.pointsDraw ??= 1;
  s.freeAgents ||= [];
  s.academyPlayers ||= [];
  s.retiredPlayers ||= [];
  s.transferLog ||= [];
  s.news ||= [];
  s.competitions ||= [];
  s.manager ||= {managedTeamId:null,aiTransfers:true,lastAiWindow:""};
  for(const t of s.teams){
    t.finance ||= defaultFinance(t);
    t.aiEnabled ??= true;
    if(t.defaultFormation!=="4-3-2-1"){
      t.defaultFormation="4-3-2-1";
      t.defaultLineup=[];
    }
    chooseLineup(t);
    recalcWages(t);
  }
  s.settings.tableZones ||= [
    {id:"promotion",label:"Aufstieg",from:1,to:2,color:"#28d66f"},
    {id:"promotionPlayoff",label:"Aufstiegs-Relegation",from:3,to:3,color:"#ff9f43"},
    {id:"cupBlue",label:"Pokalplatz",from:4,to:5,color:"#4da8ff"},
    {id:"cupPurple",label:"Weiterer Pokalplatz",from:6,to:6,color:"#9b5cff"},
    {id:"relegationPlayoff",label:"Abstiegs-Relegation",from:0,to:0,color:"#ff9f43"},
    {id:"relegation",label:"Abstieg",from:0,to:0,color:"#ff5368"}
  ];
  for(const l of s.leagues){
    l.records ||= {biggestWin:null,mostGoalsMatch:null,longestWinStreak:null};
    for(const sea of l.seasons){
      sea.history ||= {championTeamId:null,finalTable:[],awards:{},playerSnapshots:[]};
      for(const m of sea.matches){
        m.events ||= [];
        m.lineups ||= {home:[],away:[],homeBench:[],awayBench:[]};
        const homeTeam=s.teams.find(t=>t.id===m.homeId);
        const awayTeam=s.teams.find(t=>t.id===m.awayId);
        if(homeTeam&&(!Array.isArray(m.lineups.home)||m.lineups.home.length!==11)){
          m.lineups.home=[...(homeTeam.defaultLineup||chooseLineup(homeTeam).map(p=>p.id))].slice(0,11);
        }
        if(awayTeam&&(!Array.isArray(m.lineups.away)||m.lineups.away.length!==11)){
          m.lineups.away=[...(awayTeam.defaultLineup||chooseLineup(awayTeam).map(p=>p.id))].slice(0,11);
        }
        if(homeTeam&&(!Array.isArray(m.lineups.homeBench)||!m.lineups.homeBench.length)){
          m.lineups.homeBench=fullBenchIds(homeTeam,m.lineups.home,m.lineups.homeBench);
        }
        if(awayTeam&&(!Array.isArray(m.lineups.awayBench)||!m.lineups.awayBench.length)){
          m.lineups.awayBench=fullBenchIds(awayTeam,m.lineups.away,m.lineups.awayBench);
        }
        m.notes ||= "";
        m.attendance ||= 0;
        m.referee ||= "";
        m.weather ||= "";
        m.motmPlayerId ||= null;
        m.scoreMode ||= "events";
        m.statistics ||= {possessionHome:50,possessionAway:50,shotsHome:0,shotsAway:0,shotsOnTargetHome:0,shotsOnTargetAway:0,xgHome:0,xgAway:0,cornersHome:0,cornersAway:0,foulsHome:0,foulsAway:0};
        m.statisticsSource ||= m.simulated ? "simulated" : (m.status==="played" && ((m.statistics.shotsHome||0)+(m.statistics.shotsAway||0)>0) ? "estimated" : "");
        m.simulated ||= false;
      }
    }
  }
  for(const t of s.teams){
    t.history ||= [];
    t.players ||= [];
    t.logoScale ||= 100;
    t.logoPosX ??= 50;
    t.logoPosY ??= 50;
    t.stadium ||= {name:"Neues Stadion",capacity:0,image:""};
    t.stadiumZoom ||= 100;
    t.stadiumPosX ??= 50;
    t.stadiumPosY ??= 50;
  }
  const everyPlayer=[...s.teams.flatMap(t=>t.players||[]),...(s.freeAgents||[]),...(s.academyPlayers||[]),...(s.retiredPlayers||[])];
  for(const p of everyPlayer){
    p.stats ||= {apps:0,goals:0,assists:0,yellow:0,red:0};
    p.history ||= [];
    p.transferHistory ||= [];
    p.value ||= Math.max(100000,Number(p.rating||60)*75000);
    p.contractUntil ||= season()?.name || "";
    p.preferredFoot ||= "Rechts";
    p.injuredUntil ||= "";
    p.form ||= 6.5;
    p.photo ||= "";
    p.attributes ||= {pace:60,shooting:60,passing:60,dribbling:60,defending:60,physical:60};
    p.status ||= "active";
    p.potential ||= Math.min(95,Math.max(Number(p.rating||60),Number(p.rating||60)+Math.floor(Math.random()*10)));
    p.personality ||= "Teamspieler";
  }
  // V27: complete defensive normalization of leagues, seasons, matches and players.
  s.leagues ||= [];
  s.teams ||= [];
  s.transferLog ||= [];
  s.freeAgents ||= [];
  s.academyPlayers ||= [];
  s.retiredPlayers ||= [];
  for(const l of s.leagues){
    l.seasons ||= [];
    for(const se of l.seasons){
      se.teamIds ||= [];
      se.matches ||= [];
      for(const m of se.matches){
        m.events ||= [];
        m.lineups ||= {home:[],away:[],homeBench:[],awayBench:[]};
        m.lineups.home ||= [];
        m.lineups.away ||= [];
        m.lineups.homeBench ||= [];
        m.lineups.awayBench ||= [];
        m.statistics ||= {};
        m.status ||= "scheduled";
        m.scoreMode ||= m.events.length?"events":"manual";
        m.homeGoals=Number.isFinite(Number(m.homeGoals))?Math.max(0,Number(m.homeGoals)):0;
        m.awayGoals=Number.isFinite(Number(m.awayGoals))?Math.max(0,Number(m.awayGoals)):0;
      }
    }
  }
  // V38: Importierte ältere Spielpläne behalten alle bereits gespielten Partien.
  // Nur zukünftige, noch leere Begegnungen werden in Heim/Auswärts sinnvoll neu ausgerichtet.
  if(!s.settings.fixtureBalanceV38){
    for(const l of s.leagues||[])for(const se of l.seasons||[])rebalanceFutureHomeAway(se);
    s.settings.fixtureBalanceV38=true;
  }
  ensureWorldMarket(80);
  compactCareerState(s);
  saveState({skipHistory:true}).catch(error=>console.warn("Normalisierung konnte nicht sofort gespeichert werden:",error));
}


async function persistCareer(label="Autosave"){
 const s=state();
 s.careerMeta ||= {};
 s.careerMeta.lastSavedAt=new Date().toISOString();
 compactCareerState(s);
 try{
   await saveState({label,throwOnError:true});
 }catch(err){
   console.error(err);
   toast("Speichern fehlgeschlagen – die letzte Änderung bleibt geöffnet.");
   return false;
 }
 if(s.settings?.autoBackup){
  const last=Date.parse(s.careerMeta.lastBackupAt||0),now=Date.now();
  if(!last||now-last>1000*60*60*6){
   s.backups ||= [];
   s.backups.push(snapshotCareer(s,label));
   s.careerMeta.lastBackupAt=new Date().toISOString();
   compactCareerState(s);
   saveState({skipHistory:true}).catch(()=>{});
  }
 }
 return true;
}
function rememberView(view,competitionId=null){
 const s=state();s.settings.lastView=view;
 if(competitionId!==null)s.settings.lastCompetitionId=competitionId;
 try{saveState()}catch{}
}
function resumeLastView(){
 const s=state();if(!s.settings?.resumeLastView)return;
 if(s.settings.lastView==="competition"&&s.settings.lastCompetitionId&&s.competitions.some(c=>c.id===s.settings.lastCompetitionId)){
  setTimeout(()=>openCompetition(s.settings.lastCompetitionId),120);
 }
}
function allUsedPlayerNames(){return [...state().teams.flatMap(t=>t.players),...(state().freeAgents||[]),...(state().academyPlayers||[])].map(p=>p.name)}
function globalPlayerId(){return Math.max(0,...state().teams.flatMap(t=>t.players.map(p=>Number(p.id)||0)),...(state().freeAgents||[]).map(p=>Number(p.id)||0),...(state().academyPlayers||[]).map(p=>Number(p.id)||0))+1}
function ensureWorldMarket(minimum=80){
  state().freeAgents ||= [];
  if(state().freeAgents.length>=minimum)return;
  const count=minimum-state().freeAgents.length;
  const generated=generatePlayers(count,{usedNames:allUsedPlayerNames()});
  let id=globalPlayerId();generated.forEach(p=>p.id=id++);state().freeAgents.push(...generated);
}

function render(){
  const s=state(), l=league();
  el("#app").innerHTML=`
    <div class="shell">
      <header class="topbar"><div class="topbar-inner">
        <div class="brand"><div class="brandmark">🏆</div><div>Fantasy Liga Studio <span class="version-pill">V41</span></div></div>
        <div class="top-actions"><span id="saveStateIndicator" class="small muted">Gespeichert</span><button id="commandPaletteButton" class="theme-toggle" aria-label="Schnellmenü">⌘</button><button id="themeToggle" class="theme-toggle" aria-label="Theme wechseln">${state().settings.theme==="light"?"🌙":"☀️"}</button><select class="selector" id="leagueSelector">
          ${s.leagues.map(x=>`<option value="${x.id}" ${x.id===l.id?"selected":""}>${x.name}</option>`).join("")}
        </select></div>
      </div></header>
      <main>${renderView()}</main>
      <nav class="bottomnav">
        ${[
          ["home","⌂","Home"],["fixtures","⚽","Spieltag"],["table","≡","Tabelle"],["teams","🏟️","Teams"],["more","•••","Mehr"]
        ].map(([id,icon,label])=>`<button data-view="${id}" class="${view===id?"active":""}"><b>${icon}</b>${label}</button>`).join("")}
      </nav>
    </div>`;
  bindBase();
}
function bindBase(){
  el("#leagueSelector").onchange=e=>{state().activeLeagueId=Number(e.target.value);const l=league();state().activeSeasonId=l.seasons.find(s=>s.status==="active")?.id||l.seasons[0]?.id;tableDay=null;saveState();render();};
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{view=b.dataset.view;render();window.scrollTo({top:0,behavior:"instant"});});
  document.querySelectorAll("[data-match]").forEach(b=>{
    b.onclick=()=>openMatch(Number(b.dataset.match));
    b.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openMatch(Number(b.dataset.match));}};
  });
  document.querySelectorAll("[data-open-match]").forEach(b=>b.onclick=()=>openMatch(Number(b.dataset.openMatch)));
  document.querySelectorAll("[data-save-result]").forEach(b=>b.onclick=e=>{e.stopPropagation();saveDirectResult(Number(b.dataset.saveResult));});
  document.querySelectorAll("[data-simulate-match]").forEach(b=>b.onclick=e=>{e.stopPropagation();openPreMatchLineup(Number(b.dataset.simulateMatch));});
  document.querySelectorAll("[data-edit-result]").forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    const id=Number(b.dataset.editResult);
    const input=el(`#directHG-${id}`);
    input?.focus();
    input?.select();
    toast("Ergebnis ändern und erneut speichern");
  });
  document.querySelectorAll("[data-reset-result]").forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    resetMatchResult(Number(b.dataset.resetResult));
  });
  document.querySelectorAll("[data-reschedule-match]").forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    openMatchReschedule(Number(b.dataset.rescheduleMatch));
  });
  document.querySelectorAll("[data-open-result-actions]").forEach(card=>card.onclick=()=>openResultActions(Number(card.dataset.openResultActions)));
  document.querySelectorAll(".direct-score-inputs input").forEach(input=>{
    input.oninput=()=>{
      const card=input.closest("[data-fixture-card]");
      card?.classList.add("fixture-dirty");
      const button=card?.querySelector("[data-save-result]");
      if(button){button.classList.remove("saved");button.textContent="Speichern"}
    };
    input.onkeydown=e=>{
      if(e.key==="Enter"){
        e.preventDefault();
        const id=Number(input.closest("[data-fixture-card]")?.dataset.fixtureCard);
        if(id)saveDirectResult(id);
      }
    };
  });
  document.querySelectorAll("[data-table-day]").forEach(b=>b.onclick=()=>openTable(Number(b.dataset.tableDay)));
  document.querySelectorAll("[data-team]").forEach(b=>b.onclick=()=>openTeam(Number(b.dataset.team)));
  document.querySelectorAll("[data-edit-team]").forEach(b=>b.onclick=()=>openTeamEditor(Number(b.dataset.editTeam)));
  const auto=el("#autoSchedule"); if(auto) auto.onclick=openScheduleSheet;
  const matchdayMenu=el("#matchdayMenu");if(matchdayMenu)matchdayMenu.onclick=()=>el("#matchdayActions")?.classList.toggle("hidden");
  const mdSelect=el("#matchdaySelect");if(mdSelect)mdSelect.onchange=()=>{sessionStorage.setItem("flm:selectedMatchday",String(mdSelect.value));render()};
  const prev=el("#prevMatchday");if(prev)prev.onclick=()=>{const v=Math.max(1,Number(el("#matchdaySelect").value)-1);sessionStorage.setItem("flm:selectedMatchday",v);render()};
  const next=el("#nextMatchday");if(next)next.onclick=()=>{const v=Number(el("#matchdaySelect").value)+1;sessionStorage.setItem("flm:selectedMatchday",v);render()};
  const newMatch=el("#newMatch"); if(newMatch) newMatch.onclick=openSingleMatchSheet;
  const moveMatchday=el("#moveMatchday");if(moveMatchday)moveMatchday.onclick=()=>openMatchdayReschedule(Number(el("#matchdaySelect")?.value||1));
  const resetMatchday=el("#resetMatchday");if(resetMatchday)resetMatchday.onclick=()=>resetMatchdayResults(Number(el("#matchdaySelect")?.value||1));
  const newTeam=el("#newTeam"); if(newTeam) newTeam.onclick=()=>openTeamEditor(null);
  const newLeague=el("#newLeague"); if(newLeague) newLeague.onclick=()=>openLeagueEditor(null);
  const editLeague=el("#editLeague"); if(editLeague) editLeague.onclick=()=>openLeagueEditor(league().id);
  const history=el("#history"); if(history) history.onclick=openHistory;
  const records=el("#records"); if(records) records.onclick=openRecords;
  const quickRecords=el("#quickRecords"); if(quickRecords) quickRecords.onclick=openRecords;
  const h2h=el("#headToHead"); if(h2h) h2h.onclick=openHeadToHead;
  const review=el("#seasonReview"); if(review) review.onclick=openSeasonReview;
  const exp=el("#exportData"); if(exp) exp.onclick=exportState;
  const imp=el("#importData"); if(imp) imp.onchange=async e=>{try{await importState(e.target.files[0]);upgradeState();render();toast("Backup importiert")}catch(err){toast(err.message)}};
  const reset=el("#resetData"); if(reset) reset.onclick=async()=>{if(confirm("Wirklich alle Daten löschen?"))await resetState();};
  const undo=el("#undoAction"); if(undo) undo.onclick=()=>{const label=undoLast();if(label){render();toast(`Rückgängig: ${label}`)}else toast("Nichts zum Rückgängigmachen")};
  const validate=el("#validateData"); if(validate) validate.onclick=()=>openValidation();
  const backupNow=el("#backupNow");if(backupNow)backupNow.onclick=async()=>{const at=await createBackupNow();toast(`Lokales Backup: ${new Date(at).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}`)};
  const restoreBackup=el("#restoreBackup");if(restoreBackup)restoreBackup.onclick=async()=>{const backups=await listAutomaticBackups();if(!backups.length)return toast("Noch kein automatisches Backup vorhanden");if(!confirm("Den aktuellsten lokalen Sicherungsstand wiederherstellen?"))return;const at=await restoreLatestAutomaticBackup();if(at){render();toast("Backup wiederhergestellt")}else toast("Backup konnte nicht geladen werden")};
  const backupTest=el("#backupTest");if(backupTest)backupTest.onclick=openBackupTest;
  const quality=el("#qualityCenter");if(quality)quality.onclick=openQualityCenter;
  const transferCenter=el("#transferCenter");if(transferCenter)transferCenter.onclick=()=>openWorldPlayerCenter("market");
  const managerControl=el("#managerControl");if(managerControl)managerControl.onclick=openManagerControl;
  const financeCenter=el("#financeCenter");if(financeCenter)financeCenter.onclick=openFinanceCenter;
  const newsCenter=el("#newsCenter");if(newsCenter)newsCenter.onclick=openNewsCenter;
  const careerCenter=el("#careerCenter");if(careerCenter)careerCenter.onclick=openCareerCenter;
  const recordsCenter=el("#recordsCenter");if(recordsCenter)recordsCenter.onclick=openRecordsCenter;
  const competitionStudio=el("#competitionStudio");if(competitionStudio)competitionStudio.onclick=openCompetitionStudio;
  const awards=el("#awardsCenter");if(awards)awards.onclick=openAwardsCenter;
  const calendar=el("#calendarCenter");if(calendar)calendar.onclick=openCalendarCenter;
  const recordsHub=el("#recordsHub");if(recordsHub)recordsHub.onclick=openRecordsHub;
  const cup=el("#cupManager"); if(cup) cup.onclick=openCupManager;
  const globalSearch=el("#globalSearch"); if(globalSearch){
    let searchTimer;
    globalSearch.oninput=e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>renderSearchResults(e.target.value),90)};
  }
  const theme=el("#themeToggle"); if(theme)theme.onclick=()=>{state().settings.theme=state().settings.theme==="light"?"dark":"light";document.body.classList.toggle("light",state().settings.theme==="light");saveState();render();};
  const palette=el("#commandPaletteButton");if(palette)palette.onclick=openCommandPalette;
  const motion=el("#reduceMotion");if(motion)motion.onchange=()=>{state().settings.reduceMotion=motion.checked;document.body.classList.toggle("reduce-motion",motion.checked);saveState()};
  const compact=el("#compactCards");if(compact)compact.onchange=()=>{state().settings.compactCards=compact.checked;document.body.classList.toggle("compact-cards",compact.checked);saveState();render()};
  document.body.classList.toggle("reduce-motion",Boolean(state().settings.reduceMotion));
  document.body.classList.toggle("compact-cards",Boolean(state().settings.compactCards));
  const report=el("#seasonReport");if(report)report.onclick=openSeasonReport;
  const lineup=el("#lineupStudio");if(lineup)lineup.onclick=openLineupStudio;
  const globalQuick=el("#globalQuickAction");if(globalQuick)globalQuick.onclick=openGlobalQuickActions;
  bindFixtureGestures();

  if(view==="home")requestAnimationFrame(()=>renderDashboardCharts());
  if(!window.__flmSaveListenerInstalled){
    window.__flmSaveListenerInstalled=true;
    window.addEventListener("flm:save-error",e=>toast(e.detail?.message||"Speichern fehlgeschlagen"));
    window.addEventListener("flm:saved",()=>{
      const n=el("#saveStateIndicator");
      if(n){
        n.textContent="Gespeichert ✓";
        setTimeout(()=>{const current=el("#saveStateIndicator");if(current)current.textContent="Gespeichert";},1200);
      }
    });
  }
  const tableSelect=el("#tableSelect"); if(tableSelect) tableSelect.onchange=e=>{tableDay=Number(e.target.value);render();};
  document.querySelectorAll("[data-table-mode]").forEach(b=>b.onclick=()=>{tableMode=b.dataset.tableMode;render();});
  document.querySelectorAll(".league-table-scroll").forEach(scroller=>{
    const sync=()=>scroller.classList.toggle("is-scrolled",scroller.scrollLeft>28);
    scroller.addEventListener("scroll",sync,{passive:true});sync();
  });
  document.querySelectorAll("[data-expand-row]").forEach(row=>row.onclick=()=>{
    const detail=document.querySelector(`[data-detail-row="${row.dataset.expandRow}"]`);
    if(detail)detail.classList.toggle("hidden");
  });
}
function renderView(){
  if(view==="fixtures") return renderFixtures();
  if(view==="table") return renderTables();
  if(view==="teams") return renderTeams();
  if(view==="more") return renderMore();
  return renderHome();
}
function renderHome(){
  const st=standingsForMode("overall"),matches=season().matches,played=matches.filter(m=>m.status==="played");
  const goals=played.reduce((n,m)=>n+m.homeGoals+m.awayGoals,0),completion=matches.length?Math.round(played.length/matches.length*100):0;
  const leader=st[0],top=topSnapshot("goals"),next=matches.filter(m=>m.status!=="played").sort((a,b)=>(a.matchday||0)-(b.matchday||0))[0];
  const last=played.slice().sort((a,b)=>(b.matchday||0)-(a.matchday||0))[0];
  return `
    <section class="premium-hero">
      <div class="premium-hero-copy">
        <div class="hero-badge">⚡ ELITE COMPETITION CENTER</div>
        <div class="eyebrow">${season().name}</div>
        <h1>${league().name}</h1>
        <p>Deine komplette Liga mit Live-Tabelle, Analytics, Kadern, Historien und Wettbewerben.</p>
        <div class="hero-actions">
          <button class="btn primary" data-view="fixtures">Spielplan öffnen</button>
          <button class="btn secondary" data-view="table">Analytics</button>
        </div>
      </div>
      <div class="hero-scorecard">
        <div class="scorecard-ring" style="--progress:${completion*3.6}deg"><div><b>${completion}%</b><span>Saison</span></div></div>
        <div class="hero-mini-stats"><span><b>${played.length}</b> Spiele</span><span><b>${goals}</b> Tore</span><span><b>${activeTeams().length}</b> Teams</span></div>
      </div>
    </section>

    <section class="widget-grid">
      <article class="dashboard-widget accent-widget"><span>Tabellenführer</span><b>${leader?.name||"–"}</b><small>${leader?`${leader.pts} Punkte · ${leader.gf-leader.ga>=0?"+":""}${leader.gf-leader.ga} Diff`:"Noch keine Ergebnisse"}</small></article>
      <article class="dashboard-widget"><span>Top-Torschütze</span><b>${top?.name||"–"}</b><small>${top?`${top.value} Tore`:"Noch keine Tore"}</small></article>
      <article class="dashboard-widget"><span>Nächstes Spiel</span><b>${next?`${team(next.homeId).short} – ${team(next.awayId).short}`:"–"}</b><small>${next?`Spieltag ${next.matchday} · ${fmtDate(next.date)}`:"Kein Termin"}</small></article>
      <article class="dashboard-widget"><span>Letztes Ergebnis</span><b>${last?`${team(last.homeId).short} ${visibleMatchScore(last)} ${team(last.awayId).short}`:"–"}</b><small>${last?`Spieltag ${last.matchday}`:"Noch kein Ergebnis"}</small></article>
    </section>

    <section class="card global-search-card">
      <div class="section-head"><div><h2>Schnellsuche</h2><span class="subtitle">Teams, Spieler, Stadien und Wettbewerbe</span></div><span class="keyboard-hint">⌘ K</span></div>
      <div class="autocomplete"><div class="searchbar"><input id="globalSearch" autocomplete="off" placeholder="Suchen…"></div><div id="searchResults"></div></div>
    </section>

    <div class="dashboard-grid">
      <section class="card chart-card"><div class="section-head"><div><h2>Punkteentwicklung</h2><span class="subtitle">Top 4 im Saisonverlauf</span></div></div><div class="chart-wrap"><canvas id="pointsChart"></canvas></div><div id="pointsLegend" class="chart-legend"></div></section>
      <section class="card next-match-panel"><div class="section-head"><div><h2>Nächste Partie</h2><span class="subtitle">${next?fmtDate(next.date):"Noch nichts geplant"}</span></div></div>${next?premiumMatchCard(next):`<div class="empty">Erstelle zuerst den Spielplan.</div>`}</section>
    </div>

    <section class="card"><div class="section-head"><div><h2>Live-Tabelle</h2><span class="subtitle">Punkte und Differenz sofort sichtbar</span></div><button class="btn secondary" data-view="table">Vollständig</button></div>${tableHTML(st.slice(0,8),null)}</section>

    <div class="dashboard-grid">
      <section class="card chart-card"><div class="section-head"><div><h2>Torproduktion</h2><span class="subtitle">Beste Offensiven</span></div></div><div class="chart-wrap"><canvas id="goalsChart"></canvas></div></section>
      <section class="card"><div class="section-head"><div><h2>Top-Scorer</h2><span class="subtitle">Aktuelle Bestenliste</span></div></div>${topPlayers("goals",6)}</section>
    </div>`;
}
function premiumMatchCard(m){
  const h=team(m.homeId),a=team(m.awayId);
  return `<button class="premium-match-card" data-match="${m.id}">
    <div class="premium-side">${badge(h)}<b>${h.name}</b></div>
    <div class="premium-kickoff"><span>${m.time||"--:--"}</span><small>Spieltag ${m.matchday}</small></div>
    <div class="premium-side">${badge(a)}<b>${a.name}</b></div>
  </button>`;
}
function renderFixtures(){
  const rounds=[...new Set(season().matches.map(m=>m.matchday).filter(Boolean))].sort((a,b)=>a-b);
  const current=maxMatchday(state())||1;
  const selected=Number(sessionStorage.getItem("flm:selectedMatchday")||current||1);
  const matches=season().matches.filter(m=>m.matchday===selected);
  return `
    <section class="simple-page-head">
      <div><div class="eyebrow">Saison ${season().name}</div><h1>Spieltag ${selected}</h1></div>
      <div class="matchday-switcher">
        <button id="prevMatchday" ${selected<=1?"disabled":""}>‹</button>
        <select id="matchdaySelect">${(rounds.length?rounds:[1]).map(day=>`<option value="${day}" ${day===selected?"selected":""}>Spieltag ${day}</option>`).join("")}</select>
        <button id="nextMatchday" ${selected>=Math.max(...(rounds.length?rounds:[1]))?"disabled":""}>›</button>
      </div>
    </section>
    <section class="card simple-matchday-card">
      <div class="section-head matchday-head">
        <div><h2>Partien</h2><span class="subtitle">${matches.filter(m=>m.status==="played").length}/${matches.length} beendet · Heim/Auswärts ausgewogen</span></div>
        <div class="matchday-progress"><span style="width:${matches.length?matches.filter(m=>m.status==="played").length/matches.length*100:0}%"></span></div>
        <button id="matchdayMenu" class="iconbtn" aria-label="Spieltag-Menü">•••</button>
      </div>
      <div id="matchdayActions" class="matchday-actions hidden">
        <button id="newMatch" class="btn secondary">+ Einzelspiel</button>
        <button id="moveMatchday" class="btn secondary">📅 Ganzen Spieltag verlegen</button>
        <button id="resetMatchday" class="btn danger">↶ Ergebnisse dieses Spieltags zurücksetzen</button>
        <button id="autoSchedule" class="btn primary">Kompletten Spielplan erstellen</button>
      </div>
      ${matches.length?`<div class="simple-fixtures">${matches.map(simpleFixtureRow).join("")}</div>`:`<div class="empty">Für diesen Spieltag gibt es noch keine Partien.</div>`}
    </section>
    <div class="usage-hint"><b>Schnell:</b> Ergebnis direkt eintragen und speichern. Für Tore, Karten und Aufstellungen auf ein Team tippen.</div>
    <section class="card"><div class="section-head"><div><h2>Tabelle nach Spieltag ${selected}</h2><span class="subtitle">Punkte und Differenz direkt sichtbar</span></div><button class="btn secondary" data-table-day="${selected}">Groß anzeigen</button></div>${tableHTML(standingsAt(state(),selected),selected)}</section>`;
}
function simpleFixtureRow(m){
  const h=team(m.homeId),a=team(m.awayId);
  if(m.status==="played"){
    return `<article class="fixture-card finished-fixture-card" data-open-result-actions="${m.id}">
      <div class="fixture-team home">
        ${badge(h)}
        <div><b>${h.name}</b><small>Heim</small></div>
      </div>
      <div class="finished-score-block">
        <strong>${m.homeGoals} : ${m.awayGoals}</strong>
        <small>Endstand</small>
      </div>
      <div class="fixture-team away">
        ${badge(a)}
        <div><b>${a.name}</b><small>Auswärts</small></div>
      </div>
    </article>`;
  }
  return `<article class="fixture-card direct-save-card" data-fixture-card="${m.id}">
    <div class="fixture-team home" data-open-match="${m.id}">
      ${badge(h)}
      <div><b>${h.name}</b><small>Heim</small></div>
    </div>
    <div class="fixture-direct-score">
      <div class="direct-score-inputs">
        <input inputmode="numeric" min="0" max="99" type="number" id="directHG-${m.id}" value="" placeholder="-">
        <span>:</span>
        <input inputmode="numeric" min="0" max="99" type="number" id="directAG-${m.id}" value="" placeholder="-">
      </div>
      <button class="direct-save-btn" data-save-result="${m.id}">Speichern</button>
      <div class="fixture-mini-actions">
        <button class="simulate-mini-btn" data-simulate-match="${m.id}">🎲 Simulieren</button>
        <button class="simulate-mini-btn" data-reschedule-match="${m.id}">📅 Termin</button>
      </div>
      <small>Geplant · ${fmtDate(m.date)} · ${m.time||"--:--"}</small>
    </div>
    <div class="fixture-team away" data-open-match="${m.id}">
      ${badge(a)}
      <div><b>${a.name}</b><small>Auswärts</small></div>
    </div>
  </article>`;
}
function openResultActions(matchId){
  const m=season().matches.find(x=>x.id===matchId);if(!m)return;
  const h=team(m.homeId),a=team(m.awayId);
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet compact-result-sheet">
    <div class="sheet-head"><div><div class="eyebrow">Endstand</div><h2>${h.short} ${m.homeGoals}:${m.awayGoals} ${a.short}</h2></div><button id="close" class="iconbtn">×</button></div>
    <div class="result-action-match"><div>${badge(h)}<b>${h.name}</b></div><strong>${m.homeGoals} : ${m.awayGoals}</strong><div>${badge(a)}<b>${a.name}</b></div></div>
    <div class="actions"><button id="editPlayedResult" class="btn primary">Ergebnis ändern</button><button id="resetPlayedResult" class="btn danger">Ergebnis zurücksetzen</button><button id="reschedulePlayedMatch" class="btn secondary">Termin ändern</button></div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
  el("#editPlayedResult").onclick=()=>{closeOverlay();openMatch(matchId)};
  el("#resetPlayedResult").onclick=()=>{closeOverlay();resetMatchResult(matchId)};
  el("#reschedulePlayedMatch").onclick=()=>{closeOverlay();openMatchReschedule(matchId)};
}
async function saveDirectResult(matchId){
  const m=season().matches.find(x=>x.id===matchId);
  if(!m)return;
  const homeInput=el(`#directHG-${matchId}`);
  const awayInput=el(`#directAG-${matchId}`);
  const btn=document.querySelector(`[data-save-result="${matchId}"]`);

  if(btn?.dataset.busy==="1")return;

  const homeRaw=homeInput?.value ?? "";
  const awayRaw=awayInput?.value ?? "";
  if(homeRaw===""||awayRaw==="")return toast("Bitte beide Tore eingeben");

  const hg=Number(homeRaw);
  const ag=Number(awayRaw);
  if(!Number.isInteger(hg)||!Number.isInteger(ag)||hg<0||ag<0||hg>99||ag>99){
    return toast("Tore müssen ganze Zahlen von 0 bis 99 sein");
  }

  pushUndo("Ergebnis gespeichert");
  m.scoreMode="manual";
  m.homeGoals=hg;
  m.awayGoals=ag;
  m.status="played";
  m.simulated=false;
  generateEstimatedMatchDetails(m,{refresh:true});

  if(btn){
    btn.dataset.busy="1";
    btn.disabled=true;
    btn.textContent="Speichert…";
  }

  try{
    await saveState({label:"Ergebnis gespeichert",throwOnError:true});
    const card=document.querySelector(`[data-fixture-card="${matchId}"]`);
    card?.classList.remove("fixture-dirty");
    card?.classList.add("fixture-saved");
    if(btn){
      btn.classList.add("saved");
      btn.textContent="✓ Gespeichert";
    }
    toast(`${team(m.homeId).short} ${hg}:${ag} ${team(m.awayId).short} gespeichert`);
    setTimeout(()=>render(),350);
  }catch(error){
    console.error(error);
    if(btn){
      btn.dataset.busy="0";
      btn.disabled=false;
      btn.textContent="Erneut speichern";
    }
    toast("Speichern fehlgeschlagen – bitte erneut versuchen");
  }
}

async function resetMatchResult(matchId,{skipConfirm=false}={}){
  const m=season().matches.find(x=>x.id===matchId);
  if(!m)return;
  if(!skipConfirm&&!confirm(`${team(m.homeId).short} – ${team(m.awayId).short}: Ergebnis wirklich zurücksetzen?`))return;
  pushUndo("Ergebnis zurückgesetzt");
  m.status="scheduled";
  m.scoreMode="manual";
  m.homeGoals=0;
  m.awayGoals=0;
  m.events=[];
  m.simulated=false;
  m.attendance=0;
  m.motmPlayerId=null;
  m.statistics={};
  m.statisticsSource="";
  m.referee="";
  m.weather="";
  m.lineups={home:[],away:[],homeBench:[],awayBench:[]};
  m.notes=m.notes||"";
  delete m.estimatedStats;
  delete m.generatedDetails;
  delete m.simulationSeed;
  rebuildPlayerStats();
  await saveState({label:"Ergebnis zurückgesetzt"});
  render();
  toast("Ergebnis wurde zurückgesetzt");
}
async function resetMatchdayResults(day){
  const played=season().matches.filter(m=>m.matchday===day&&m.status==="played");
  if(!played.length)return toast("An diesem Spieltag gibt es keine gespeicherten Ergebnisse");
  if(!confirm(`Alle ${played.length} Ergebnisse von Spieltag ${day} zurücksetzen?`))return;
  pushUndo(`Spieltag ${day} zurückgesetzt`);
  for(const m of played){
    m.status="scheduled";m.scoreMode="manual";m.homeGoals=0;m.awayGoals=0;m.events=[];
    m.simulated=false;m.attendance=0;m.motmPlayerId=null;
    m.statistics={};m.statisticsSource="";m.referee="";m.weather="";
    m.lineups={home:[],away:[],homeBench:[],awayBench:[]};
    delete m.estimatedStats;delete m.generatedDetails;delete m.simulationSeed;
  }
  rebuildPlayerStats();
  await saveState({label:`Spieltag ${day} zurückgesetzt`});
  render();
  toast(`Spieltag ${day} wurde zurückgesetzt`);
}
function openMatchReschedule(matchId){
  const m=season().matches.find(x=>x.id===matchId);if(!m)return;
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><div><div class="eyebrow">Einzelne Partie</div><h2>Termin ändern</h2></div><button id="close" class="iconbtn">×</button></div>
    <div class="card"><b>${team(m.homeId).name} – ${team(m.awayId).name}</b><div class="small muted">Aktuell: Spieltag ${m.matchday} · ${fmtDate(m.date)} · ${m.time||"--:--"}</div></div>
    <div class="form-grid">
      <div class="field"><label>Spieltag</label><input id="moveSingleDay" type="number" min="1" value="${m.matchday}"></div>
      <div class="field"><label>Neues Datum</label><input id="moveSingleDate" type="date" value="${m.date||""}"></div>
      <div class="field"><label>Neue Uhrzeit</label><input id="moveSingleTime" type="time" value="${m.time||"15:30"}"></div>
    </div>
    <div class="actions"><button id="saveSingleMove" class="btn primary">Termin speichern</button></div></div></div>`;
  el("#close").onclick=closeOverlay;
  el("#saveSingleMove").onclick=async()=>{
    const day=Number(el("#moveSingleDay").value),date=el("#moveSingleDate").value,time=el("#moveSingleTime").value;
    if(!Number.isInteger(day)||day<1)return toast("Bitte einen gültigen Spieltag angeben");
    if(!date)return toast("Bitte ein Datum auswählen");
    pushUndo("Spieltermin geändert");
    m.matchday=day;m.date=date;m.time=time||"15:30";
    await saveState({label:"Spieltermin geändert"});
    sessionStorage.setItem("flm:selectedMatchday",String(day));
    closeOverlay();render();toast("Spieltermin geändert");
  };
}
function openMatchdayReschedule(day){
  const games=season().matches.filter(m=>m.matchday===day);
  if(!games.length)return toast("Dieser Spieltag enthält keine Partien");
  const currentDate=games[0]?.date||"";
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><div><div class="eyebrow">Spieltag ${day}</div><h2>Ganzen Spieltag verlegen</h2></div><button id="close" class="iconbtn">×</button></div>
    <div class="card"><b>${games.length} Partien</b><div class="small muted">Alle Spiele erhalten dasselbe neue Datum. Die bisherigen Uhrzeiten können erhalten bleiben.</div></div>
    <div class="form-grid">
      <div class="field"><label>Neues Datum</label><input id="moveDayDate" type="date" value="${currentDate}"></div>
      <div class="field"><label>Uhrzeiten</label><select id="moveDayTimeMode"><option value="keep">Bisherige Uhrzeiten behalten</option><option value="same">Für alle dieselbe Uhrzeit</option></select></div>
      <div class="field" id="moveDayTimeField" style="display:none"><label>Neue Uhrzeit für alle</label><input id="moveDayTime" type="time" value="${games[0]?.time||"15:30"}"></div>
    </div>
    <div class="actions"><button id="saveMatchdayMove" class="btn primary">Spieltag verlegen</button></div></div></div>`;
  el("#close").onclick=closeOverlay;
  el("#moveDayTimeMode").onchange=()=>el("#moveDayTimeField").style.display=el("#moveDayTimeMode").value==="same"?"":"none";
  el("#saveMatchdayMove").onclick=async()=>{
    const date=el("#moveDayDate").value;
    if(!date)return toast("Bitte ein Datum auswählen");
    const same=el("#moveDayTimeMode").value==="same",time=el("#moveDayTime").value||"15:30";
    pushUndo(`Spieltag ${day} verlegt`);
    games.forEach(m=>{m.date=date;if(same)m.time=time});
    await saveState({label:`Spieltag ${day} verlegt`});
    closeOverlay();render();toast(`Spieltag ${day} wurde verlegt`);
  };
}
function renderTables(){
  const max=maxMatchday(state()); if(tableDay===null) tableDay=max||1;
  const modes=[["overall","Gesamt"],["home","Heim"],["away","Auswärts"],["form","Form"]];
  const rows=tableMode==="form"?formTable(tableDay):standingsForMode(tableMode,tableDay);
  return `<div class="section-head"><h2>Tabellen & Historie</h2></div>
    <div class="tabs">${modes.map(([id,l])=>`<button data-table-mode="${id}" class="${tableMode===id?"active":""}">${l}</button>`).join("")}</div>
    <div class="card"><div class="field"><label>Spieltag auswählen</label><select id="tableSelect">${Array.from({length:max||1},(_,i)=>i+1).map(i=>`<option value="${i}" ${i===tableDay?"selected":""}>Spieltag ${i}</option>`).join("")}</select></div></div>
    <div class="card">${tableHTML(rows,tableDay)}<div class="form-legend"><span><i class="form-dot win"></i>Sieg</span><span><i class="form-dot draw"></i>Unentschieden</span><span><i class="form-dot loss"></i>Niederlage</span></div></div>`;
}
function standingsForMode(mode,day=null){
  if(mode==="overall") return standingsAt(state(),day);
  const rows=activeTeams().map(t=>({id:t.id,name:t.name,short:t.short,color:t.color,logo:t.logo,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}));
  const map=Object.fromEntries(rows.map(r=>[r.id,r]));
  for(const m of season().matches.filter(m=>m.status==="played" && (day===null||m.matchday<=day))){
    if(mode==="home"){
      const h=map[m.homeId];h.p++;h.gf+=m.homeGoals;h.ga+=m.awayGoals;if(m.homeGoals>m.awayGoals){h.w++;h.pts+=3}else if(m.homeGoals===m.awayGoals){h.d++;h.pts++}else h.l++;
    }else{
      const a=map[m.awayId];a.p++;a.gf+=m.awayGoals;a.ga+=m.homeGoals;if(m.awayGoals>m.homeGoals){a.w++;a.pts+=3}else if(m.awayGoals===m.homeGoals){a.d++;a.pts++}else a.l++;
    }
  }
  return rows.sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf);
}
function formTable(day){
  const start=Math.max(1,(day||maxMatchday(state()))-4);
  const rows=activeTeams().map(t=>({id:t.id,name:t.name,short:t.short,color:t.color,logo:t.logo,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}));
  const map=Object.fromEntries(rows.map(r=>[r.id,r]));
  for(const m of season().matches.filter(m=>m.status==="played"&&m.matchday>=start&&m.matchday<=day)){
    const h=map[m.homeId],a=map[m.awayId];h.p++;a.p++;h.gf+=m.homeGoals;h.ga+=m.awayGoals;a.gf+=m.awayGoals;a.ga+=m.homeGoals;
    if(m.homeGoals>m.awayGoals){h.w++;a.l++;h.pts+=3}else if(m.homeGoals<m.awayGoals){a.w++;h.l++;a.pts+=3}else{h.d++;a.d++;h.pts++;a.pts++}
  }
  return rows.sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf);
}
function renderTeams(){
  return `<div class="section-head"><h2>Mannschaften</h2><button id="newTeam" class="btn primary">+ Team</button></div><div class="grid">${activeTeams().map(t=>`
    <article class="card team-card">
      <div class="stadium-cover" style="${t.stadium.image?`background-image:url('${t.stadium.image}');background-size:${t.stadiumZoom||100}%;background-position:${t.stadiumPosX??50}% ${t.stadiumPosY??50}%`:""}"><div class="stadium-title">${t.stadium.name}</div></div>
      <div class="team-body"><div class="team-head">${badge(t)}<div><h3>${t.name}</h3><div class="small muted">${t.short}</div></div></div>
      <div class="meta">${t.players.length} Spieler · ${Number(t.stadium.capacity).toLocaleString("de-DE")} Plätze · Ø ${teamAverage(t)}</div>
      <div class="actions"><button data-team="${t.id}" class="btn secondary">Profil</button><button class="btn secondary" data-edit-team="${t.id}">Bearbeiten</button></div></div>
    </article>`).join("")}</div>`;
}

function teamAverage(t){
  const players=Array.isArray(t?.players)?t.players:[];
  if(!players.length)return "–";
  return (players.reduce((n,p)=>n+Number(p?.rating||0),0)/players.length).toFixed(1);
}
function squadValue(t){
  const players=Array.isArray(t?.players)?t.players:[];
  return players.reduce((n,p)=>n+Number(p?.value||0),0);
}
function renderMore(){
  return `<div class="section-head"><h2>Mehr</h2></div>
    <div class="card"><h3>Ligen & Saisons</h3><div class="actions"><button id="newLeague" class="btn primary">+ Neue Liga</button><button id="editLeague" class="btn secondary">Aktuelle Liga</button><button id="history" class="btn secondary">Historie</button></div></div>
    <div class="card"><h3>Analysen</h3><div class="actions"><button id="records" class="btn secondary">Rekorde</button><button id="headToHead" class="btn secondary">Direkter Vergleich</button><button id="seasonReview" class="btn secondary">Saisonanalyse</button></div></div>
    <div class="card"><h3>Wettbewerbe</h3><div class="actions">
      <button id="competitionStudio" class="btn primary">🏆 Wettbewerbs-Studio</button><button id="cupManager" class="btn secondary">Schneller Ligapokal</button>
      <button id="calendarCenter" class="btn secondary">Saisonkalender</button>
      <button id="awardsCenter" class="btn secondary">Auszeichnungen</button>
    </div></div>
    <div class="card"><h3>Manager-Zentrale</h3><div class="actions">
      <button id="managerControl" class="btn primary">🎮 Mein Verein & KI</button><button id="financeCenter" class="btn secondary">💸 Vereinsfinanzen</button><button id="newsCenter" class="btn secondary">📰 Nachrichten</button><button id="careerCenter" class="btn secondary">💾 Karriere & Backups</button><button id="recordsCenter" class="btn secondary">🏛️ Rekorde & Hall of Fame</button><button id="transferCenter" class="btn secondary">🌍 Welt-Spielerdatenbank</button>
      <button id="recordsHub" class="btn secondary">Rekordbuch</button>
    </div></div><div class="card"><h3>Darstellung & Bedienung</h3><div class="settings-list">
      <label class="setting-row"><div><b>Animationen reduzieren</b><div class="small muted">Für ältere Geräte und maximale Geschwindigkeit</div></div><input id="reduceMotion" type="checkbox" ${state().settings.reduceMotion?"checked":""}></label>
      <label class="setting-row"><div><b>Kompakte Karten</b><div class="small muted">Mehr Inhalte gleichzeitig sichtbar</div></div><input id="compactCards" type="checkbox" ${state().settings.compactCards?"checked":""}></label>
    </div></div>
    <div class="card"><h3>Daten & Sicherheit</h3><div class="actions"><button id="undoAction" class="btn secondary">Letzte Änderung rückgängig</button><button id="validateData" class="btn secondary">Daten prüfen</button><button id="backupNow" class="btn secondary">Jetzt lokal sichern</button><button id="restoreBackup" class="btn secondary">Letztes Auto-Backup</button><button id="backupTest" class="btn secondary">Backup-Test</button><button id="qualityCenter" class="btn secondary">Quality Center</button><button id="exportData" class="btn secondary">Backup exportieren</button><label class="btn secondary">Backup importieren<input id="importData" type="file" accept=".json" hidden></label><button id="resetData" class="btn danger">Zurücksetzen</button></div></div>`;
}
function matchList(matches){
  if(!matches.length) return `<div class="empty">Keine Partien vorhanden.</div>`;
  return `<div class="match-list">${matches.map(m=>{
    const h=team(m.homeId),a=team(m.awayId);
    return `<div class="match" data-match="${m.id}">
      <div class="match-main match-main-logos">
        <div class="match-team home">${badge(h)}<b>${h?.name||"?"}</b></div>
        <div class="score">${visibleMatchScore(m)}</div>
        <div class="match-team">${badge(a)}<b>${a?.name||"?"}</b></div>
      </div>
      <div class="match-meta"><span class="chip">Spieltag ${m.matchday}</span><span class="chip">${fmtDate(m.date)}</span><span class="chip">${m.time||"--:--"}</span><span class="chip">${m.status==="played"||scoreFromEvents(m).total?"Beendet":"Geplant"}</span></div>
    </div>`;
  }).join("")}</div>`;
}
function zoneForPosition(position,total){
  const zones=state().settings.tableZones||[];
  return zones.find(z=>{
    const from=Number(z.from||0),to=Number(z.to||0);
    if(!from||!to)return false;
    const start=from<0?total+from+1:from;
    const finish=to<0?total+to+1:to;
    return position>=Math.min(start,finish)&&position<=Math.max(start,finish);
  })||null;
}

function formPointsForTeam(teamId,day){
  const latest=season().matches
    .filter(m=>m.status==="played"&&(m.homeId===teamId||m.awayId===teamId)&&(!day||m.matchday<=day))
    .sort((a,b)=>(b.matchday||0)-(a.matchday||0))
    .slice(0,5);
  return latest.reduce((pts,m)=>{
    const gf=m.homeId===teamId?m.homeGoals:m.awayGoals;
    const ga=m.homeId===teamId?m.awayGoals:m.homeGoals;
    return pts+(gf>ga?3:gf===ga?1:0);
  },0);
}
function tableHTML(rows,day){
  const movement=day?movementAt(state(),day):{};
  const total=rows.length;
  const zones=state().settings.tableZones||[];
  return `<div class="league-table-shell">
    <div class="league-table-scroll" role="region" aria-label="Ligatabelle" tabindex="0">
      <table class="table league-table-v15">
        <thead><tr>
          <th class="sticky-rank">#</th>
          <th class="sticky-club">Verein</th>
          <th class="sticky-points">Pkt</th>
          <th>Sp</th><th>S</th><th>U</th><th>N</th>
          <th>Tore</th><th>GT</th><th>Diff</th><th>P/Sp</th><th>Sieg %</th><th>Form-Pkt</th><th class="form-column">Letzte 5</th>
        </tr></thead>
        <tbody>${rows.map((r,i)=>{
          const moveValue=movement[r.id]||0;
          const move=moveValue>0?`<span class="position-move up">▲${moveValue}</span>`:moveValue<0?`<span class="position-move down">▼${Math.abs(moveValue)}</span>`:`<span class="position-move same">●</span>`;
          const diff=r.gf-r.ga,zone=zoneForPosition(i+1,total);
          return `<tr style="${zone?`--zone-color:${zone.color}`:""}" class="${zone?"custom-zone":""}">
            <td class="sticky-rank"><b>${i+1}</b></td>
            <td class="sticky-club">
              <div class="compact-club-cell">${badge(r)}<div><b class="club-full-name">${r.name}</b><b class="club-short-name">${r.short}</b><small>${move}</small></div></div>
            </td>
            <td class="sticky-points"><b>${r.pts}</b></td>
            <td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
            <td><b>${r.gf}</b></td><td>${r.ga}</td>
            <td class="${diff>0?"positive":diff<0?"negative":""}"><b>${diff>0?"+":""}${diff}</b></td>
            <td>${r.p?(r.pts/r.p).toFixed(2):"0.00"}</td>
            <td>${r.p?Math.round(r.w/r.p*100):0}%</td>
            <td>${formPointsForTeam(r.id,day)}</td>
            <td class="form-column"><div class="form-dots">${formDots(r.id,day)}</div></td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>
    <div class="table-swipe-note">Nach links wischen: zusätzlich Tore, Gegentore, Differenz, Punkte pro Spiel, Siegquote, Formpunkte und letzte 5 sehen.</div>
    ${zones.some(z=>Number(z.from)&&Number(z.to))?`<div class="zone-legend">${zones.filter(z=>Number(z.from)&&Number(z.to)).map(z=>`<span><i style="background:${z.color}"></i>${z.label}</span>`).join("")}</div>`:""}
  </div>`;
}

function topPlayers(field,limit){
  const arr=activeTeams().flatMap(t=>t.players.map(p=>({...p,teamName:t.name}))).sort((a,b)=>b.stats[field]-a.stats[field]).slice(0,limit);
  return `<div class="player-list">${arr.map((p,i)=>`<div class="player-row"><div class="player-num">${i+1}</div><div><b>${p.name}</b><div class="player-pos">${p.teamName} · ${p.position}</div></div><span>${field==="goals"?"⚽":"🎯"} ${p.stats[field]}</span></div>`).join("")}</div>`;
}
function openScheduleSheet(){
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Kompletten Spielplan erstellen</h2><button class="iconbtn" id="close">×</button></div>
    <div class="form-grid"><div class="field"><label>Modus</label><select id="scheduleMode"><option value="single">Hinrunde</option><option value="double">Hin- und Rückrunde</option></select></div>
    <div class="field"><label>Startdatum</label><input id="scheduleStart" type="date"></div><div class="field"><label>Standard-Uhrzeit</label><input id="scheduleTime" type="time" value="15:30"></div></div>
    <button id="createSchedule" class="btn primary" style="width:100%;margin-top:14px">Alle Spieltage erstellen</button></div></div>`;
  el("#close").onclick=closeOverlay;
  el("#createSchedule").onclick=async()=>{
    const createButton=el("#createSchedule");
    const startValue=el("#scheduleStart").value||new Date().toISOString().slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(startValue))return toast("Bitte ein gültiges Startdatum wählen");
    if(season().teamIds.length<2)return toast("Mindestens zwei Teams werden benötigt");
    if(season().matches.length && !confirm("Es gibt bereits einen Spielplan. Beim Fortfahren wird er vollständig ersetzt. Wirklich fortfahren?"))return;

    createButton.disabled=true;
    createButton.textContent="Spielplan wird erstellt…";
    pushUndo("Spielplan erstellt");

    const pairs=roundRobin(season().teamIds,el("#scheduleMode").value==="double");
    const start=el("#scheduleStart").value||new Date().toISOString().slice(0,10),time=el("#scheduleTime").value||"15:30";
    season().matches=pairs.map((p,i)=>{
      const ht=team(Number(p.homeId)),at=team(Number(p.awayId));
      const hIds=[...(ht?.defaultLineup||chooseLineup(ht).map(x=>x.id))].slice(0,11),aIds=[...(at?.defaultLineup||chooseLineup(at).map(x=>x.id))].slice(0,11);
      return {id:i+1,matchday:p.matchday,homeId:p.homeId,awayId:p.awayId,date:dateForRound(start,p.matchday),time,status:"scheduled",homeGoals:0,awayGoals:0,lineups:{home:hIds,away:aIds,homeBench:fullBenchIds(ht,hIds),awayBench:fullBenchIds(at,aIds)},events:[],notes:"",attendance:0,referee:"",weather:"",motmPlayerId:null};
    });
    state().settings.fixtureBalanceV38=true;
    await saveState();
    closeOverlay();
    render();
    toast("Kompletter Spielplan erstellt");
  };
}
function openSingleMatchSheet(){
  const options=activeTeams().map(t=>`<option value="${t.id}">${t.name}</option>`).join("");
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Einzelpartie</h2><button class="iconbtn" id="close">×</button></div>
    <div class="form-grid"><div class="field"><label>Spieltag</label><input id="mDay" type="number" min="1" value="1"></div><div class="field"><label>Datum</label><input id="mDate" type="date"></div><div class="field"><label>Uhrzeit</label><input id="mTime" type="time" value="15:30"></div>
    <div class="field"><label>Heim</label><select id="mHome">${options}</select></div><div class="field"><label>Gast</label><select id="mAway">${options}</select></div></div>
    <button id="saveMatch" class="btn primary" style="width:100%;margin-top:14px">Partie speichern</button></div></div>`;
  el("#close").onclick=closeOverlay;if(activeTeams()[1])el("#mAway").value=activeTeams()[1].id;
  el("#saveMatch").onclick=()=>{
    if(el("#mHome").value===el("#mAway").value)return toast("Zwei verschiedene Teams wählen");
    if(Number(el("#mDay").value)<1)return toast("Spieltag muss mindestens 1 sein");
    pushUndo("Partie erstellt");
    season().matches.push({id:nextId(season().matches),matchday:Number(el("#mDay").value),homeId:Number(el("#mHome").value),awayId:Number(el("#mAway").value),date:el("#mDate").value,time:el("#mTime").value,status:"scheduled",homeGoals:0,awayGoals:0,lineups:{home:[],away:[],homeBench:[],awayBench:[]},events:[],notes:"",attendance:0,referee:"",weather:"",motmPlayerId:null});saveState();closeOverlay();render();};
}
function openMatch(id){
  const m=season().matches.find(x=>x.id===id),h=team(m.homeId),a=team(m.awayId);
  el("#overlay").innerHTML=`<div class="modal"><div id="matchSheet" class="sheet match-sheet-redesign match-stadium-sheet" style="${h.stadium?.image?`--match-stadium-image:url('${h.stadium.image}')`:""}">
    <div class="sheet-head"><div><div class="eyebrow">Spieltag ${m.matchday}</div><h2>${h.short} – ${a.short}</h2></div><button class="iconbtn" id="close">×</button></div>
    <div class="match-hero">
      <div class="match-hero-team">${badge(h)}<b>${h.name}</b><span>Heim</span></div>
      <div class="match-hero-score"><b>${visibleMatchScore(m)}</b><span>${m.status==="played"?"Endstand":m.status==="live"?"Live":"Geplant"}</span></div>
      <div class="match-hero-team">${badge(a)}<b>${a.name}</b><span>Auswärts</span></div>
    </div>
    <div class="match-actions-bar">
      ${m.status==="scheduled"?`<button id="startMatch" class="btn primary">▶ Spiel starten</button><button id="simulateMatch" class="btn simulation-btn">🎲 Realistisch simulieren</button>`:""}
      ${m.status==="live"?`<button id="finishMatch" class="btn primary">⏹ Spiel beenden</button>`:""}
      ${m.status==="played"?`<div class="finished-banner">✓ Spiel beendet</div>`:""}
      <button id="editMatchQuick" class="btn secondary">Ergebnis & Details</button>
    </div>
    <div class="tabs match-tabs"><button class="active" data-tab="overview">Übersicht</button><button data-tab="events">Ereignisse</button><button data-tab="lineups">Aufstellungen</button><button data-tab="edit">Details</button></div>
    <div id="matchBody">${matchOverview(m)}</div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{
    document.querySelectorAll("[data-tab]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    el("#matchSheet")?.classList.toggle("ticker-focus",b.dataset.tab==="events");
    el("#matchBody").innerHTML=b.dataset.tab==="overview"?matchOverview(m):b.dataset.tab==="lineups"?lineupView(m):b.dataset.tab==="events"?eventsView(m):editMatchView(m);
    bindMatchActions(m);
  });
  const startBtn=el("#startMatch");if(startBtn)startBtn.onclick=()=>{m.status="live";saveState({label:"Spiel gestartet"});openMatch(m.id)};
  const finishBtn=el("#finishMatch");if(finishBtn)finishBtn.onclick=()=>finishMatch(m.id);
  const simulateBtn=el("#simulateMatch");if(simulateBtn)simulateBtn.onclick=()=>openPreMatchLineup(m.id);
  const quick=el("#editMatchQuick");if(quick)quick.onclick=()=>document.querySelector('[data-tab="edit"]').click();
  bindMatchActions(m);
}
async function finishMatch(matchId){
  const m=season()?.matches?.find(x=>x.id===matchId);
  if(!m)return toast("Spiel wurde nicht gefunden");
  const previous=deepClone(m);
  try{
    if(m.scoreMode!=="manual")syncMatchScoreFromEvents(m);
    m.status="played";
    m.simulated=false;
    generateEstimatedMatchDetails(m,{refresh:true});
    generateManualTimeline(m);
    rebuildPlayerStats();
    await saveState({label:"Spiel beendet",throwOnError:true});
    toast(`Endstand gespeichert: ${visibleMatchScore(m)}`);
    openMatch(matchId);
    setTimeout(()=>openCelebration(matchId),420);
  }catch(error){
    Object.keys(m).forEach(key=>delete m[key]);
    Object.assign(m,previous);
    try{rebuildPlayerStats()}catch{}
    toast("Spiel konnte nicht gespeichert werden.");
  }
}

function teamColor(teamObj){
  const c=String(teamObj?.color||"#e93555").trim();
  return /^#[0-9a-f]{3,8}$/i.test(c)?c:"#e93555";
}
function hexToRgb(hex){
  const c=String(hex||'').replace('#','').trim();
  const full=c.length===3?c.split('').map(x=>x+x).join(''):c;
  if(!/^[0-9a-f]{6}$/i.test(full))return null;
  return {r:parseInt(full.slice(0,2),16),g:parseInt(full.slice(2,4),16),b:parseInt(full.slice(4,6),16)};
}
function rgbToHex(r,g,b){return '#'+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('')}
function colorDistance(a,b){
  const x=hexToRgb(a),y=hexToRgb(b); if(!x||!y)return 999;
  return Math.hypot(x.r-y.r,x.g-y.g,x.b-y.b);
}
function alternateTeamColor(hex){
  const rgb=hexToRgb(hex)||{r:111,g:140,b:255};
  // Kräftiger Kontrast: invertiert und leicht in Richtung Cyan/Violett verschoben.
  return rgbToHex(255-rgb.r*.25, 230-rgb.g*.18, 255-rgb.b*.05);
}
function distinctMatchColors(homeTeam,awayTeam){
  const home=teamColor(homeTeam);
  let away=teamColor(awayTeam);
  if(colorDistance(home,away)<95) away=alternateTeamColor(away);
  return {home,away};
}
function hashText(value){let h=2166136261;for(const ch of String(value||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
function teamRivalId(teamObj){
  const ids=activeTeams().map(t=>Number(t.id)).sort((a,b)=>a-b);if(ids.length<2)return null;
  const i=ids.indexOf(Number(teamObj?.id));return i<0?null:ids[i%2===0?Math.min(i+1,ids.length-1):i-1];
}
function isDerbyMatch(m){return teamRivalId(team(m.homeId))===Number(m.awayId)||teamRivalId(team(m.awayId))===Number(m.homeId)}
function daysBetween(a,b){if(!a||!b)return 99;const x=new Date(a),y=new Date(b);if(Number.isNaN(+x)||Number.isNaN(+y))return 99;return Math.abs((x-y)/86400000)}
function fatigueScore(teamId,m){
  const previous=season().matches.filter(x=>x.id!==m.id&&x.status==="played"&&(x.homeId===teamId||x.awayId===teamId)&&x.date&&m.date&&new Date(x.date)<=new Date(m.date)).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
  const d=previous?daysBetween(previous.date,m.date):99;return d<=2?1:d<=3?.72:d<=4?.38:0;
}
function tableNarrative(m){
  const rows=standingsAt(state(),Math.max(0,Number(m.matchday||1)-1));const by=new Map(rows.map((r,i)=>[Number(r.id),{...r,rank:i+1}]));
  const h=by.get(Number(m.homeId)),a=by.get(Number(m.awayId)),n=rows.length||20;
  if(isDerbyMatch(m))return {kind:"Derby",before:"Heute zählt mehr als nur die Tabelle – das Derby elektrisiert beide Fanlager."};
  if(h&&a&&h.rank<=4&&a.rank<=4)return {kind:"Topspiel des Spieltags",before:`Der ${h.rank}. empfängt den ${a.rank}. – ein direktes Duell um die Spitze.`};
  if(h&&a&&h.rank>=n-4&&a.rank>=n-4)return {kind:"Abstiegskracher",before:"Beide Mannschaften brauchen dringend Punkte im Kampf um den Klassenerhalt."};
  if(h&&a&&Math.abs(h.rank-a.rank)>=8)return {kind:"Favorit gegen Außenseiter",before:"Die Rollen sind klar verteilt, doch der Außenseiter hofft auf den großen Coup."};
  return {kind:"Ligaspiel",before:"Beide Teams wollen ihren Saisontrend bestätigen und wichtige Punkte sammeln."};
}
function postMatchHeadline(m){
  const h=team(m.homeId),a=team(m.awayId),hs=teamAverage(h),as=teamAverage(a),hg=Number(m.homeGoals||0),ag=Number(m.awayGoals||0);
  const rows=standingsAt(state(),Math.max(0,Number(m.matchday||1)-1));const by=new Map(rows.map((r,i)=>[Number(r.id),i+1]));
  const winner=hg>ag?h:ag>hg?a:null,loser=hg>ag?a:ag>hg?h:null;
  if(!winner)return "Punkteteilung nach einem umkämpften Spiel.";
  if((winner.id===h.id?hs:as)+1.5<(loser.id===h.id?hs:as))return `${winner.name} sorgt für eine echte Überraschung.`;
  if(by.get(loser.id)===1)return "Der Tabellenführer patzt überraschend.";
  if(Math.abs(hg-ag)>=3)return `${winner.name} setzt ein deutliches Ausrufezeichen.`;
  const red=(m.events||[]).some(e=>["red","secondYellow"].includes(e.type));if(red)return "Ein Platzverweis kippt den Spielverlauf entscheidend.";
  return `${winner.name} setzt sich in einem engen Spiel durch.`;
}
function weatherDetails(m){
  const seed=hashText(`${m.id}-${m.date}-${m.time}`),night=Number(String(m.time||"15:30").slice(0,2))>=18;
  const options=[{icon:"☀️",label:"Klar",temp:18},{icon:"⛅",label:"Leicht bewölkt",temp:15},{icon:"☁️",label:"Bewölkt",temp:12},{icon:"🌧️",label:"Leichter Regen",temp:10},{icon:"🌬️",label:"Windig",temp:13}];
  const w=options[seed%options.length];return {...w,temp:w.temp+(seed%7)-3,night};
}
function deterministicAttendance(m,homeTeam){
  const cap=Math.max(500,Number(homeTeam?.stadium?.capacity||12000));
  const rows=standingsAt(state(),Math.max(0,Number(m.matchday||1)-1));
  const by=new Map(rows.map((r,i)=>[Number(r.id),{...r,rank:i+1}]));
  const hr=by.get(Number(m.homeId))?.rank||Math.ceil((rows.length||20)/2);
  const ar=by.get(Number(m.awayId))?.rank||Math.ceil((rows.length||20)/2);
  const n=Math.max(2,rows.length||20),seed=(hashText(`${m.id}-${m.date}-${m.homeId}-${m.awayId}`)%1000)/1000;
  const strengthAppeal=clamp((teamAverage(team(m.homeId))+teamAverage(team(m.awayId))-122)/110,-.05,.13);
  const tableAppeal=clamp(((n+1-hr)+(n+1-ar))/(n*2)*.18,.03,.18);
  const special=isDerbyMatch(m)?.12:(hr<=4&&ar<=4?.08:0);
  const weather=weatherDetails(m);const weatherPenalty=weather.label.includes('Regen')?.07:weather.label==='Windig'?.04:0;
  const fill=clamp(.60+strengthAppeal+tableAppeal+special+seed*.14-weatherPenalty,.48,1);
  return Math.min(cap,Math.round(cap*fill));
}
function deterministicReferee(m){
  const refs=["Leon Richter","Mika Hartmann","Jonas Winter","Tobias Kern","David Falk","Emil Berger","Marco Feldmann","Nico Seidel","Florian Brandt","Lukas Stein","Jan Vollmer","Daniel Vogt","Oliver Reimann","Simon Krüger","Patrick Neumann","Felix Adler","Robert Lenz","Bastian König","Maximilian Frank","Julian Wolf"];
  return refs[hashText(`${m.id}-${m.matchday}-${m.homeId}-${m.awayId}`)%refs.length];
}
function chantFor(teamObj,phase="before"){
  const name=teamObj?.short||teamObj?.name||"Unser Team";
  const sets={
    before:[`${name}! ${name}! Vorwärts, immer weiter!`,`Oh ${name}, wir stehen hinter dir!`,`Heimkurve laut – gemeinsam für ${name}!`,`Auf geht's ${name}, kämpfen und siegen!`,`Für unsere Farben, für unseren Verein – ${name}!`],
    goal:[`Tor für ${name}! Das ganze Stadion springt!`,`Hier regiert ${name}!`,`Und wieder hallt es durch die Kurve: ${name}!`,`Oh wie ist das schön – ${name} trifft!`],
    final:[`Wir sind stolz auf euch – ${name}!`,`Nie allein, gemeinsam heim!`,`Noch lange nach Abpfiff singt die Kurve weiter.`,`Für immer ${name}, egal was auch geschieht!`]
  };
  const list=sets[phase]||sets.before;return list[hashText(`${teamObj?.id}-${phase}`)%list.length];
}

function ensureTeamFanMedia(t){
  t.fanMedia ||= {homeWin:[],awayWin:[],draw:[],generic:[],chants:[],goal:[]};
  for(const k of ["homeWin","awayWin","draw","generic","chants","goal"]) if(!Array.isArray(t.fanMedia[k]))t.fanMedia[k]=[];
  return t.fanMedia;
}
function fanMediaChoice(m){
  const h=team(m.homeId),a=team(m.awayId),hg=Number(m.homeGoals||0),ag=Number(m.awayGoals||0);
  const winner=hg>ag?h:ag>hg?a:null;
  const owner=winner||h, media=ensureTeamFanMedia(owner), seed=hashText(`${m.id}-${hg}-${ag}-${owner.id}`);
  let pool=[];
  if(!winner)pool=media.draw;
  else if(winner.id===h.id)pool=media.homeWin;
  else pool=media.awayWin;
  if(!pool?.length)pool=media.generic||[];
  const video=pool.length?pool[seed%pool.length]:null;
  const chants=media.chants||[], chant=chants.length?chants[(seed>>2)%chants.length]:null;
  return {owner,video,chant,winner,side:!winner?"draw":winner.id===h.id?"home":"away"};
}
async function hydrateCelebrationMedia(scene,m){
  const choice=fanMediaChoice(m),video=scene?.querySelector('[data-real-fan-video]'),audioBtn=scene?.querySelector('[data-real-fan-audio]');
  if(video&&choice.video){
    const url=await fanMediaUrl(choice.video);if(url){video.src=url;video.hidden=false;scene.classList.add('has-real-video');video.play().catch(()=>{});}
  }
  if(audioBtn){
    if(choice.chant){audioBtn.hidden=false;audioBtn.onclick=async()=>{const url=await fanMediaUrl(choice.chant);if(!url)return toast("Audiodatei wurde nicht gefunden");stopCelebrationAudio();const audio=new Audio(url);audio.loop=true;audio.volume=choice.side==="away"?.72:.92;activeCelebrationAudio={stop(){audio.pause();audio.currentTime=0}};try{await audio.play();audioBtn.textContent="🔇 Gesang stoppen";audioBtn.onclick=()=>{stopCelebrationAudio();audioBtn.textContent="🔊 Fangesang starten"}}catch{toast("Ton konnte nicht gestartet werden. Bitte Stummmodus prüfen.")}};
    }else audioBtn.hidden=true;
  }
}

function atmosphereBlock(m){
  const h=team(m.homeId),w=weatherDetails(m),cap=Math.max(500,Number(h.stadium?.capacity||12000));
  const att=Number(m.attendance||deterministicAttendance(m,h)),fill=Math.min(100,Math.round(att/cap*100)),n=tableNarrative(m);
  const phase=m.status==="played"?"final":"before",stadiumImage=h.stadium?.image||"";
  const imageStyle=stadiumImage?`background-image:linear-gradient(180deg,rgba(2,8,14,.05),rgba(2,8,14,.88)),url('${stadiumImage}');background-size:cover;background-position:${h.stadiumPosX??50}% ${h.stadiumPosY??50}%`:``;
  return `<section class="card atmosphere-card">
    <div class="stadium-atmosphere-hero" style="${imageStyle}">
      <div class="stadium-live-badge">${w.night?"🌙 FLUTLICHT":"🏟️ SPIELTAG"}</div>
      <div class="stadium-atmosphere-copy"><span>${n.kind}</span><b>${h.stadium?.name||"Stadion"}</b><small>${chantFor(h,phase)}</small></div>
      <div class="crowd-strip" aria-hidden="true">${Array.from({length:26},(_,i)=>`<i style="--i:${i};--c:${i%3===0?'#fff':teamColor(h)}"></i>`).join("")}</div>
    </div>
    <div class="atmosphere-grid"><div><span>🏟️ Stadion</span><b>${h.stadium?.name||"Stadion"}</b></div><div><span>👥 Zuschauer</span><b>${att.toLocaleString("de-DE")} · ${fill}%</b></div><div><span>${w.icon} Wetter</span><b>${m.weather||w.label} · ${m.temperature??w.temp} °C</b></div><div><span>🧑‍⚖️ Schiedsrichter</span><b>${m.referee||deterministicReferee(m)}</b></div></div>
    <div class="press-note"><span>📰 ${m.status==="played"?"Nach dem Spiel":"Vor dem Spiel"}</span><b>${m.status==="played"?postMatchHeadline(m):n.before}</b></div>
    <button class="btn crowd-audio-btn" data-play-chant="${h.id}">🔊 Kurve & Fangesang hören</button>
    ${m.status==="played"?`<button class="btn primary celebration-open-btn" data-open-celebration="${m.id}">🎬 Schlussfeier im Stadion ansehen</button>`:""}
    <div class="audio-note">Ton startet erst nach Antippen – Lautstärke am iPhone bitte einschalten.</div>
  </section>`;
}

let activeCrowdAudio=null;
async function playCrowdChant(teamObj){
  try{
    if(activeCrowdAudio?.stop)activeCrowdAudio.stop();
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx){toast("Audio wird auf diesem Gerät nicht unterstützt");return}
    const ctx=new AudioCtx();await ctx.resume();
    const now=ctx.currentTime,master=ctx.createGain();master.gain.setValueAtTime(.0001,now);master.gain.exponentialRampToValueAtTime(.34,now+.12);master.gain.setValueAtTime(.34,now+4.5);master.gain.exponentialRampToValueAtTime(.0001,now+6.2);master.connect(ctx.destination);
    const noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*6.3,ctx.sampleRate),d=noiseBuffer.getChannelData(0);
    for(let i=0;i<d.length;i++){const wave=Math.sin(i/ctx.sampleRate*Math.PI*3.3)*.16;d[i]=(Math.random()*2-1)*(.32+wave)}
    const crowd=ctx.createBufferSource(),low=ctx.createBiquadFilter(),cg=ctx.createGain();crowd.buffer=noiseBuffer;low.type="lowpass";low.frequency.value=1250;cg.gain.value=.30;crowd.connect(low);low.connect(cg);cg.connect(master);crowd.start(now);
    const seed=hashText(teamObj?.id||1),root=150+(seed%45);
    for(let voice=0;voice<9;voice++){
      const osc=ctx.createOscillator(),g=ctx.createGain();osc.type=voice%3===0?"square":"sawtooth";osc.frequency.value=root*(1+(voice%4)*.08);g.gain.value=.0001;
      for(let k=0;k<10;k++){const t=now+.2+k*.55+(voice%3)*.035;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.035/(1+voice*.22),t+.07);g.gain.exponentialRampToValueAtTime(.0001,t+.38)}
      osc.connect(g);g.connect(master);osc.start(now);osc.stop(now+6.1)
    }
    const chant=chantFor(teamObj,"before");
    if("speechSynthesis" in window){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(chant);u.lang="de-DE";u.rate=.92;u.pitch=.78;u.volume=1;setTimeout(()=>window.speechSynthesis.speak(u),180)}
    let stopped=false;activeCrowdAudio={stop(){if(stopped)return;stopped=true;try{window.speechSynthesis?.cancel();crowd.stop();ctx.close()}catch{}}};
    setTimeout(()=>{if(!stopped){stopped=true;ctx.close().catch(()=>{})}},6600);
    toast(`🔊 ${chant}`);
  }catch(error){console.error(error);toast("Ton konnte nicht gestartet werden – bitte Stummmodus und Lautstärke prüfen")}
}

function celebrationProfile(m){
  const h=team(m.homeId),a=team(m.awayId),hg=Number(m.homeGoals||0),ag=Number(m.awayGoals||0);
  const winner=hg>ag?h:ag>hg?a:null;
  const side=winner?.id===h.id?"home":winner?"away":"draw";
  const derby=isDerbyMatch(m),margin=Math.abs(hg-ag),seed=hashText(`${m.id}-${winner?.id||0}-${hg}-${ag}`);
  const intensity=winner?(derby||margin>=3?"wild":margin===1?"tense":"strong"):"calm";
  const variants={
    wild:["Kurvenbeben","Derby-Ekstase","Fahnenmeer","Trommelsturm"],
    tense:["Erlösender Jubel","Gemeinsam vor der Kurve","Letzter Gesang","Sieg im Flutlicht"],
    strong:["Siegesfeier","Mannschaft und Fans","Heimkurve in Bewegung","Abpfiff-Party"],
    calm:["Applaus nach Abpfiff","Gemeinsam bis zum Schluss","Respekt von den Rängen","Ruhiger Ausklang"]
  };
  const list=variants[intensity];
  return {h,a,winner,side,derby,margin,intensity,title:list[seed%list.length],seed};
}
function celebrationChant(teamObj,seed,intensity){
  const name=teamObj?.short||teamObj?.name||"Unser Verein";
  const chants=[
    `Oh ${name}, oh ${name}, wir stehen immer hinter dir!`,
    `${name}! ${name}! Kämpfen und siegen!`,
    `Für die Farben, für die Stadt – ${name} gibt niemals auf!`,
    `Schal nach oben, alle mit – ${name}, unser Verein!`,
    `Hier regiert ${name} – singt es laut durch die Nacht!`,
    `Gemeinsam vorwärts, Schritt für Schritt – ${name} nimmt uns alle mit!`
  ];
  return chants[(seed+(intensity==="wild"?2:0))%chants.length];
}
function celebrationSceneHtml(m){
  const c=celebrationProfile(m),home=c.h,away=c.a,winner=c.winner;
  const image=home?.stadium?.image||"";
  const pos=`${home?.stadiumPosX??50}% ${home?.stadiumPosY??50}%`;
  const mediaChoice=fanMediaChoice(m);
  const weather=weatherDetails(m),att=Number(m.attendance||deterministicAttendance(m,home));
  const cap=Math.max(500,Number(home?.stadium?.capacity||12000)),fill=Math.min(100,Math.round(att/cap*100));
  const events=(m.events||[]).filter(e=>e.type==="goal").slice().sort((a,b)=>Number(a.minute||0)-Number(b.minute||0));
  const goalRows=events.map(e=>{
    const side=Number(e.teamId)===Number(m.homeId)?home:away;
    const pl=playerById(e.playerId)?.name||e.playerName||"Torschütze";
    return `<div class="broadcast-report-row"><b>${Number(e.minute||0)}'</b><span>${side.short}</span><em>${pl}</em></div>`;
  }).join("")||`<div class="broadcast-report-empty">Keine Tore in diesem Spiel.</div>`;
  const headline=winner
    ? (c.side==="away"?`${winner.name} gewinnt auswärts.`:`${winner.name} behält die Punkte zuhause.`)
    : `Kein Sieger im ${home.stadium?.name||"Stadion"}.`;
  const post=postMatchHeadline(m);
  const possession=m.statistics?`${m.statistics.possessionHome||50} : ${m.statistics.possessionAway||50}`:"—";
  const shots=m.statistics?`${m.statistics.shotsHome||0} : ${m.statistics.shotsAway||0}`:"—";
  const corners=m.statistics?`${m.statistics.cornersHome||0} : ${m.statistics.cornersAway||0}`:"—";
  return `<div class="celebration-cinema broadcast-clean real-media-scene ${c.side} ${c.intensity}">
    <div class="cinematic-stadium broadcast-stadium" style="background-image:url('${image}');background-position:${pos}"></div>
    <video class="real-fan-video" data-real-fan-video playsinline muted autoplay loop hidden></video>
    <div class="broadcast-shade"></div><div class="broadcast-light"></div>
    <header class="broadcast-top"><span>FANTASY LIGA LIVE</span><b>${weather.night?"FLUTLICHT":"LIVE AUS DEM STADION"}</b></header>
    <div class="broadcast-score">
      <div>${badge(home)}<span>${home.short}</span></div>
      <strong>${Number(m.homeGoals||0)}–${Number(m.awayGoals||0)}</strong>
      <div>${badge(away)}<span>${away.short}</span></div>
      <small>ABPFIFF</small>
    </div>
    <div class="broadcast-caption">
      <span>90'+ · SCHLUSSPFIFF</span>
      <h2>${headline}</h2>
      <p>${post}</p>
    </div>
    <div class="broadcast-meta">🏟️ ${home.stadium?.name||"Stadion"} &nbsp;·&nbsp; 👥 ${att.toLocaleString("de-DE")} (${fill} %) &nbsp;·&nbsp; ${weather.icon} ${weather.label}, ${weather.temp} °C</div>
    <div class="broadcast-report" hidden>
      <div class="broadcast-report-head"><div><span>SPIELBERICHT</span><h3>${home.short} ${Number(m.homeGoals||0)}–${Number(m.awayGoals||0)} ${away.short}</h3></div><button class="broadcast-report-close" type="button">×</button></div>
      <div class="broadcast-report-stats"><div><span>Ballbesitz</span><b>${possession}</b></div><div><span>Schüsse</span><b>${shots}</b></div><div><span>Ecken</span><b>${corners}</b></div></div>
      <div class="broadcast-report-goals"><h4>Tore</h4>${goalRows}</div>
    </div>
    <div class="cinematic-controls broadcast-controls"><button class="btn primary" data-open-broadcast-report>Spielbericht öffnen</button><button class="btn real-audio-button" data-real-fan-audio hidden>🔊 Fangesang starten</button><button class="btn" data-replay-celebration="${m.id}">Sequenz wiederholen</button><button class="btn" data-close-celebration>Schließen</button></div>
  </div>`;
}
let activeCelebrationAudio=null;
function stopCelebrationAudio(){try{activeCelebrationAudio?.stop?.()}catch{}activeCelebrationAudio=null;try{window.speechSynthesis?.cancel?.()}catch{}}
async function playCelebrationAudio(m){
  const c=celebrationProfile(m),club=c.winner||c.h;
  try{
    stopCelebrationAudio();
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return toast("Audio wird auf diesem Gerät nicht unterstützt");
    const ctx=new AC();await ctx.resume();
    const now=ctx.currentTime,duration=c.intensity==="wild"?12:c.intensity==="calm"?7:9.5;
    const master=ctx.createGain();master.gain.setValueAtTime(.0001,now);master.gain.exponentialRampToValueAtTime(c.side==="away"?.52:.68,now+.12);master.gain.setValueAtTime(c.side==="away"?.52:.68,now+duration-.8);master.gain.exponentialRampToValueAtTime(.0001,now+duration);master.connect(ctx.destination);
    const buffer=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate);
    for(let ch=0;ch<2;ch++){const d=buffer.getChannelData(ch);let smooth=0;for(let i=0;i<d.length;i++){smooth=smooth*.93+(Math.random()*2-1)*.07;const swell=.62+.25*Math.sin(i/ctx.sampleRate*Math.PI*(c.intensity==="wild"?1.7:1.05));d[i]=smooth*swell}}
    const crowd=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),cg=ctx.createGain();crowd.buffer=buffer;filter.type="bandpass";filter.frequency.value=c.side==="away"?780:1050;filter.Q.value=.55;cg.gain.value=c.side==="away"?.48:.62;crowd.connect(filter);filter.connect(cg);cg.connect(master);crowd.start(now);
    const beatPatterns=[[0,.52,1.04,1.56],[0,.44,.88,1.32,1.76],[0,.62,1.24],[0,.36,.72,1.44]];
    const pattern=beatPatterns[c.seed%beatPatterns.length],bar=c.intensity==="wild"?1.8:2.15;
    for(let base=0;base<duration;base+=bar){for(const off of pattern){const t=now+base+off;if(t>now+duration-.2)continue;const osc=ctx.createOscillator(),g=ctx.createGain();osc.type="sine";osc.frequency.setValueAtTime(92+(c.seed%19),t);osc.frequency.exponentialRampToValueAtTime(46,t+.16);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(c.intensity==="wild"?.52:.38,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.23);osc.connect(g);g.connect(master);osc.start(t);osc.stop(t+.25)}}
    const chantRoot=145+(c.seed%40);for(let barStart=.25;barStart<duration-1;barStart+=bar){for(let v=0;v<(c.side==="away"?4:8);v++){const o=ctx.createOscillator(),g=ctx.createGain();o.type=v%3===0?"square":"sawtooth";o.frequency.value=chantRoot*(1+(v%4)*.055);const t=now+barStart+(v%2)*.035;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.032/(1+v*.12),t+.08);g.gain.setValueAtTime(.025/(1+v*.12),t+.48);g.gain.exponentialRampToValueAtTime(.0001,t+.82);o.connect(g);g.connect(master);o.start(t);o.stop(t+.86)}}
    if("speechSynthesis" in window){const text=celebrationChant(club,c.seed,c.intensity),utter=new SpeechSynthesisUtterance(text);utter.lang="de-DE";utter.rate=.82;utter.pitch=.62;utter.volume=1;setTimeout(()=>{try{window.speechSynthesis.speak(utter)}catch{}},550)}
    let stopped=false;activeCelebrationAudio={stop(){if(stopped)return;stopped=true;try{crowd.stop();ctx.close()}catch{};try{window.speechSynthesis?.cancel()}catch{}}};
    setTimeout(()=>{if(!stopped){stopped=true;ctx.close().catch(()=>{})}},(duration+.3)*1000);
  }catch(e){console.error(e);toast("Ton konnte nicht gestartet werden. Bitte Medienlautstärke einschalten.")}
}
function bindCelebrationActions(m){
  document.querySelectorAll("[data-replay-celebration]").forEach(b=>b.onclick=()=>{const scene=b.closest('.celebration-cinema');scene?.classList.remove('replay');void scene?.offsetWidth;scene?.classList.add('replay')});
  document.querySelectorAll("[data-close-celebration]").forEach(b=>b.onclick=()=>{stopCelebrationAudio();b.closest('.celebration-overlay')?.remove()});
  document.querySelectorAll("[data-open-broadcast-report]").forEach(b=>b.onclick=()=>{const scene=b.closest('.celebration-cinema');const report=scene?.querySelector('.broadcast-report');if(report)report.hidden=false});
  document.querySelectorAll(".broadcast-report-close").forEach(b=>b.onclick=()=>{const report=b.closest('.broadcast-report');if(report)report.hidden=true});
}
function openCelebration(mOrId){
  const m=typeof mOrId==="object"?mOrId:season()?.matches?.find(x=>x.id===Number(mOrId));if(!m||m.status!=="played")return;
  stopCelebrationAudio();document.querySelector('.celebration-overlay')?.remove();
  const wrap=document.createElement('div');wrap.className='celebration-overlay';wrap.innerHTML=celebrationSceneHtml(m);document.body.appendChild(wrap);bindCelebrationActions(m);hydrateCelebrationMedia(wrap,m).catch(console.error);
}

function matchOverview(m){
  const h=team(m.homeId),motm=m.motmPlayerId?playerById(m.motmPlayerId)?.name:"–";
  const s=m.statistics||{};
  const homeConversion=s.shotsHome?Number(m.homeGoals||0)/s.shotsHome*100:0;
  const awayConversion=s.shotsAway?Number(m.awayGoals||0)/s.shotsAway*100:0;
  const sourceChip=m.simulated?`<span class="chip simulation-chip">Simulation</span>`:m.statisticsSource==="estimated"?`<span class="chip estimated-chip">Statistiken geschätzt</span>`:"";
  return `${atmosphereBlock(m)}<section class="card match-overview-card"><div class="match-meta centered"><span class="chip">${fmtDate(m.date)}</span><span class="chip">${m.time||"--:--"}</span><span class="chip">${h.stadium.name}</span><span class="chip">${Number(m.attendance||0).toLocaleString("de-DE")} / ${Number(h.stadium?.capacity||0).toLocaleString("de-DE")} Plätze · ${h.stadium?.capacity?Math.round(Number(m.attendance||0)/Number(h.stadium.capacity)*100):0}%</span>${sourceChip}</div></section>
  <section class="card"><div class="section-head"><div><h3>Spielstatistik</h3><span class="subtitle">${m.statisticsSource==="estimated"?"Automatisch aus Ergebnis, Ereignissen und Teamstärken abgeleitet":"Vollständiger Spielbericht"}</span></div></div>
    ${matchStatBar("Ballbesitz",s.possessionHome??50,s.possessionAway??50,"%")}
    ${matchStatBar("Schüsse",s.shotsHome??0,s.shotsAway??0)}
    ${matchStatBar("Aufs Tor",s.shotsOnTargetHome??0,s.shotsOnTargetAway??0)}
    ${matchStatBar("Chancenverwertung",homeConversion,awayConversion,"%",1)}
    ${matchStatBar("xG",s.xgHome??0,s.xgAway??0,"",1)}
    ${matchStatBar("Ecken",s.cornersHome??0,s.cornersAway??0)}
    ${matchStatBar("Fouls",s.foulsHome??0,s.foulsAway??0)}
  </section>${eventsView(m)}<section class="card"><div class="stat-pair"><span>Schiedsrichter</span><b>${m.referee||"–"}</b></div><div class="stat-pair"><span>Wetter</span><b>${m.weather||"–"}</b></div><div class="stat-pair"><span>MVP</span><b>${motm}</b></div></section>`;
}

function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function randomNormal(){
  let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
function poisson(lambda){
  const L=Math.exp(-lambda);let p=1,k=0;
  do{k++;p*=Math.random()}while(p>L&&k<12);
  return k-1;
}
function playerPositionGroup(p){
  const raw=String(p.position||"").toUpperCase().replace(/\s/g,"");
  if(raw.includes("TW")||raw.includes("GK"))return "GK";
  if(["IV","LV","RV","LIV","RIV"].some(x=>raw.includes(x)))return "DEF";
  if(["ZDM","ZM","LM","RM"].some(x=>raw.includes(x)))return "MID";
  if(["ZOM","LF","RF","LA","RA"].some(x=>raw.includes(x)))return "AM";
  if(["ST","MS"].some(x=>raw.includes(x)))return "ST";
  return "MID";
}
function weightedPick(items,weightFn){
  if(!Array.isArray(items)||!items.length)return null;
  const weights=items.map(x=>{
    const value=Number(weightFn(x));
    return Number.isFinite(value)?Math.max(.001,value):.001;
  }),sum=weights.reduce((a,b)=>a+b,0);
  let r=Math.random()*sum;
  for(let i=0;i<items.length;i++){r-=weights[i];if(r<=0)return items[i]}
  return items[items.length-1];
}
function pickScorer(players){
  const weights={GK:.02,DEF:.6,MID:1.5,AM:3.2,ST:4.8};
  return weightedPick(players,p=>(weights[playerPositionGroup(p)]||1)*(0.6+Number(p.rating||60)/100));
}
function pickScorerBySource(players,source='open'){
  const pool=(players||[]).filter(Boolean);
  if(!pool.length)return null;
  const maps={
    corner:{GK:.01,DEF:2.9,MID:1.7,AM:1.1,ST:3.3},
    distance:{GK:.01,DEF:.25,MID:3.6,AM:3.1,ST:1.2},
    open:{GK:.01,DEF:.42,MID:1.85,AM:3.2,ST:4.4}
  };
  const weights=maps[source]||maps.open;
  return weightedPick(pool,p=>(weights[playerPositionGroup(p)]||1)*(0.58+Number(p.rating||60)/100));
}
function pickAssist(players,scorer){
  const pool=players.filter(p=>p.id!==scorer?.id);
  const weights={GK:.03,DEF:.7,MID:2.2,AM:3.8,ST:1.8};
  return Math.random()<.18?null:weightedPick(pool,p=>(weights[playerPositionGroup(p)]||1)*(0.6+Number(p.rating||60)/100));
}
function attackingWeight(p){
  const g=playerPositionGroup(p),w={GK:.01,DEF:.32,MID:2.35,AM:3.6,ST:4.5};
  return (w[g]||1)*(0.55+Number(p.rating||60)/95);
}
function cornerTakerWeight(p){
  const pos=normalizedPos(p);
  if(["RA","LA","RF","LF","RM","LM"].includes(pos))return 8.5;
  if(pos==="ZOM")return 5.4;
  if(pos==="ZM")return 2.7;
  if(["RV","LV"].includes(pos))return 1.25;
  if(pos==="ZDM")return .8;
  if(pos==="ST")return .65;
  if(["IV","RIV","LIV"].includes(pos))return .12;
  return pos==="TW"||pos==="GK"?.01:.4;
}
function pickGoalkeeper(players){
  const keepers=(players||[]).filter(p=>playerPositionGroup(p)==="GK");
  return keepers.sort((a,b)=>Number(b.rating||0)-Number(a.rating||0))[0]||null;
}
function pickAttacker(players){return weightedPick((players||[]).filter(p=>playerPositionGroup(p)!=="GK"),attackingWeight);}
function spacedMinutes(count,min=4,max=89,seedBase="timeline"){
  const out=[];let tries=0;
  while(out.length<count&&tries++<500){
    const candidate=Math.round(min+seededFraction(seedBase,tries,count)*Math.max(1,max-min));
    if(out.every(x=>Math.abs(x-candidate)>=2))out.push(candidate);
  }
  while(out.length<count)out.push(clamp(min+out.length*3,min,max));
  return out.sort((a,b)=>a-b);
}
function normalizedPos(p){
  return String(p?.position||"ZM").toUpperCase().trim().replace(/\s+/g,"");
}
function positionOrder(p){
  const order={TW:0,GK:0,RV:10,RIV:11,IV:12,LIV:13,LV:14,ZDM:20,RM:21,ZM:22,LM:23,ZOM:30,RA:31,RF:31,LA:32,LF:32,ST:40,MS:40};
  return order[normalizedPos(p)]??25;
}
function sortPlayersByPosition(players){
  return [...(players||[])].sort((a,b)=>positionOrder(a)-positionOrder(b)||Number(b.rating||0)-Number(a.rating||0)||String(a.name||"").localeCompare(String(b.name||""),"de"));
}
function fullBenchIds(teamObj,startIds,existingIds=[]){
  const start=new Set((startIds||[]).map(Number));
  const valid=new Set((teamObj?.players||[]).map(p=>Number(p.id)));
  const ordered=[];
  for(const id of existingIds||[]){const n=Number(id);if(valid.has(n)&&!start.has(n)&&!ordered.includes(n))ordered.push(n);}
  for(const p of sortPlayersByPosition(teamObj?.players||[])){const n=Number(p.id);if(!start.has(n)&&!ordered.includes(n))ordered.push(n);}
  return ordered;
}
function positionFit(p,slot){
  const pos=normalizedPos(p);
  const fits={TW:{TW:100,GK:100},RV:{RV:100,RIV:80,IV:58,RM:48},IV:{IV:100,RIV:95,LIV:95,RV:58,LV:58,ZDM:45},LV:{LV:100,LIV:80,IV:58,LM:48},ZDM:{ZDM:100,ZM:82,IV:48},ZM:{ZM:100,ZDM:86,ZOM:70,RM:62,LM:62},RM:{RM:100,RA:92,RF:88,ZOM:72,ZM:64,RV:48},ZOM:{ZOM:100,ZM:78,RA:72,LA:72,ST:55},LM:{LM:100,LA:92,LF:88,ZOM:72,ZM:64,LV:48},ST:{ST:100,MS:96,ZOM:58,RA:48,LA:48}};
  return fits[slot]?.[pos]??10;
}
function chooseLineup(t){
  const players=Array.isArray(t?.players)?t.players.filter(Boolean):[];
  const available=players.filter(p=>p.status!=="injured"&&p.status!=="suspended"&&!p.injuredUntil);
  const pool=(available.length>=11?available:players).slice();
  const savedIds=Array.isArray(t.defaultLineup)?t.defaultLineup:[];
  const saved=savedIds.map(id=>pool.find(p=>p.id===id)).filter(Boolean);
  if(saved.length===11)return saved;
  // V32: feste 4-3-2-1-Grundordnung: Viererkette, drei zentrale Mittelfeldspieler, zwei offensive Halbräume, eine Spitze.
  const slots=["TW","RV","IV","IV","LV","ZDM","ZM","ZM","ZOM","ZOM","ST"];
  const chosen=[];
  for(const slot of slots){
    const candidates=pool.filter(p=>!chosen.some(x=>x.id===p.id));
    const pick=candidates.sort((a,b)=>{const sa=positionFit(a,slot)*2+Number(a.rating||0)+Number(a.form||6.5)*1.5;const sb=positionFit(b,slot)*2+Number(b.rating||0)+Number(b.form||6.5)*1.5;return sb-sa;})[0];
    if(pick)chosen.push(pick);
  }
  while(chosen.length<Math.min(11,pool.length)){const next=pool.filter(p=>!chosen.some(x=>x.id===p.id)).sort((a,b)=>Number(b.rating||0)-Number(a.rating||0))[0];if(!next)break;chosen.push(next);}
  t.defaultFormation=t.defaultFormation||"4-3-2-1";t.defaultLineup=chosen.map(p=>p.id);return chosen;
}
function addSimEvent(m,type,minute,player,assist=null,addedTime=0,extra={}){
  if(!player)return;
  m.events.push({id:nextId(m.events),type,minute,addedTime,playerId:player.id,assistId:assist?.id||null,playerOutId:null,...extra});
}
function matchStatBar(label,home,away,suffix="",decimals=0){
  const hv=Number(home||0),av=Number(away||0),sum=Math.max(.001,hv+av),pct=clamp(hv/sum*100,4,96);
  return `<div class="match-stat-row"><div><b>${hv.toFixed(decimals)}${suffix}</b><span>${label}</span><b>${av.toFixed(decimals)}${suffix}</b></div><div class="match-stat-track"><i style="width:${pct}%"></i></div></div>`;
}

function eventCountForTeam(m,teamId,types){
  return (m.events||[]).filter(e=>types.includes(e.type)&&eventTeamId(e,m)===teamId).length;
}
function seededFraction(...values){
  const text=values.join("|");
  let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return ((hash>>>0)%10000)/10000;
}
function generateEstimatedMatchDetails(m,{refresh=false,preserveDetails=false}={}){
  if(!m||m.status!=="played"||m.simulated)return;
  const existing=m.statistics||{};
  const hasStats=(Number(existing.shotsHome||0)+Number(existing.shotsAway||0))>0;
  if(hasStats&&!refresh&&m.statisticsSource!=="estimated")return;

  const h=team(m.homeId),a=team(m.awayId);
  const hg=Math.max(0,Number(m.homeGoals||0)),ag=Math.max(0,Number(m.awayGoals||0));
  const hs=Number(teamAverage(h))||65,as=Number(teamAverage(a))||65;
  const seed=seededFraction(m.id,m.matchday,hg,ag,(m.events||[]).length,hs,as);
  const strengthDiff=clamp((hs-as)/22,-1.3,1.3);
  const goalTotal=hg+ag;
  const homeGoalEvents=eventCountForTeam(m,h.id,["goal","penalty","ownGoal"]);
  const awayGoalEvents=eventCountForTeam(m,a.id,["goal","penalty","ownGoal"]);
  const homeCards=eventCountForTeam(m,h.id,["yellow","secondYellow","red"]);
  const awayCards=eventCountForTeam(m,a.id,["yellow","secondYellow","red"]);

  // Every goal must be a shot on target; additional attempts scale with score and team strength.
  const shotsH=Math.max(hg+3,Math.round(8.2+hg*1.75+strengthDiff*1.5+seed*3.3));
  const shotsA=Math.max(ag+3,Math.round(7.4+ag*1.75-strengthDiff*1.25+(1-seed)*3.1));
  const onTargetH=clamp(Math.max(hg,Math.round(hg+2+shotsH*(.18+seed*.08))),hg,shotsH);
  const onTargetA=clamp(Math.max(ag,Math.round(ag+2+shotsA*(.18+(1-seed)*.08))),ag,shotsA);
  const possH=Math.round(clamp(51+strengthDiff*7+(seed-.5)*5,35,66));
  const xgH=Number(clamp(.25+hg*.58+shotsH*.045+onTargetH*.075+(homeGoalEvents?0.08:0),.15,5.4).toFixed(1));
  const xgA=Number(clamp(.25+ag*.58+shotsA*.045+onTargetA*.075+(awayGoalEvents?0.08:0),.15,5.4).toFixed(1));

  m.statistics={
    possessionHome:possH,possessionAway:100-possH,
    shotsHome:shotsH,shotsAway:shotsA,
    shotsOnTargetHome:onTargetH,shotsOnTargetAway:onTargetA,
    xgHome:xgH,xgAway:xgA,
    cornersHome:clamp(Math.round(shotsH*.31+seed*2),0,14),
    cornersAway:clamp(Math.round(shotsA*.31+(1-seed)*2),0,14),
    foulsHome:clamp(Math.round(8.5+awayCards*.7+(1-seed)*5),5,23),
    foulsAway:clamp(Math.round(8.5+homeCards*.7+seed*5),5,23)
  };
  m.statisticsSource="estimated";

  if(!preserveDetails||!Number(m.attendance)){
    const capacity=Math.max(500,Number(h.stadium?.capacity||12000));
    const appeal=clamp(.52+(hs+as-120)/190+goalTotal*.015+seed*.20,.36,.99);
    m.attendance=Math.min(capacity,Math.round(capacity*appeal));
  }
  if(!preserveDetails||!m.referee)m.referee=m.referee||["Leon Richter","Mika Hartmann","Jonas Winter","Tobias Kern","David Falk","Emil Berger"][Math.floor(seed*6)%6];
  if(!preserveDetails||!m.weather)m.weather=m.weather||["Klar","Leicht bewölkt","Bewölkt","Leichter Regen","Flutlichtabend"][Math.floor(seed*5)%5];

  if(!m.motmPlayerId){
    const goals=(m.events||[]).filter(e=>["goal","penalty"].includes(e.type));
    const assists=(m.events||[]).filter(e=>e.assistId).map(e=>e.assistId);
    if(goals.length){
      const scores=new Map();
      goals.forEach(e=>scores.set(e.playerId,(scores.get(e.playerId)||0)+2));
      assists.forEach(id=>scores.set(id,(scores.get(id)||0)+1));
      m.motmPlayerId=[...scores.entries()].sort((x,y)=>y[1]-x[1])[0]?.[0]||null;
    }
  }
}
function generateManualTimeline(m){
  if(!m||m.simulated)return;
  const goals=(m.events||[]).filter(isGoalEvent).map(e=>({...e}));
  const manualSubs=(m.events||[]).filter(e=>e.type==="sub"&&e.manual).map(e=>({...e}));
  const h=team(m.homeId),a=team(m.awayId);
  const hXI=(m.lineups?.home||[]).map(playerById).filter(Boolean).length?m.lineups.home.map(playerById).filter(Boolean):chooseLineup(h);
  const aXI=(m.lineups?.away||[]).map(playerById).filter(Boolean).length?m.lineups.away.map(playerById).filter(Boolean):chooseLineup(a);
  m.lineups ||= {home:[],away:[],homeBench:[],awayBench:[]};
  if(!m.lineups.home?.length)m.lineups.home=hXI.map(p=>p.id);
  if(!m.lineups.away?.length)m.lineups.away=aXI.map(p=>p.id);
  const stats=m.statistics||{};
  const seed=seededFraction(m.id,m.matchday,m.homeGoals,m.awayGoals,goals.length,"manual-v38");
  const generated=[];
  const push=(type,minute,player,extra={})=>{if(player)generated.push({id:0,type,minute,addedTime:0,playerId:player.id,assistId:null,playerOutId:null,generated:true,...extra})};
  const chooseSide=(tag,i)=>seededFraction(m.id,tag,i,seed)<.5?"home":"away";
  const xi=side=>side==="home"?hXI:aXI;
  const opponent=side=>side==="home"?aXI:hXI;

  // Karten: Gelb ist normal, Platzverweise bleiben echte Ausnahmen.
  const cardTotal=clamp(Math.round(1.8+seed*2.2+(Number(stats.foulsHome||10)+Number(stats.foulsAway||10))/16),1,6);
  const cardMinutes=spacedMinutes(cardTotal,12,88,`cards-${m.id}`);
  for(let i=0;i<cardTotal;i++){
    const side=chooseSide("card",i),roll=seededFraction(m.id,"red-v38",i);
    const type=roll<.006?"red":roll<.018?"secondYellow":"yellow";
    const player=weightedPick(xi(side),p=>playerPositionGroup(p)==="DEF"?2.2:playerPositionGroup(p)==="MID"?1.55:.65);
    push(type,cardMinutes[i],player);
  }

  // Ecken werden fast immer von Außen-/offensiven Mittelfeldspielern getreten.
  for(const side of ["home","away"]){
    const count=clamp(Number(side==="home"?stats.cornersHome:stats.cornersAway)||0,0,10);
    const mins=spacedMinutes(Math.min(count,7),4,88,`corners-${m.id}-${side}`);
    for(let i=0;i<mins.length;i++)push("corner",mins[i],weightedPick(xi(side),cornerTakerWeight));
  }

  // Chancen, Pfosten und Paraden hängen logisch zusammen. Bei einer Parade ist der
  // Hauptspieler der gegnerische Torwart; der Schütze wird separat gespeichert.
  const extra=clamp(Math.round(3+seed*4+(Number(m.homeGoals||0)+Number(m.awayGoals||0))),3,9);
  const mins=spacedMinutes(extra,6,87,`chances-${m.id}`);
  for(let i=0;i<extra;i++){
    const attackSide=chooseSide("attack",i),attackers=xi(attackSide),defenders=opponent(attackSide);
    const shooter=pickAttacker(attackers);if(!shooter)continue;
    const roll=seededFraction(m.id,"chance-type",i);
    if(roll<.46){
      const keeper=pickGoalkeeper(defenders);
      if(keeper)push("save",mins[i],keeper,{shotById:shooter.id,attackingTeamId:attackSide==="home"?m.homeId:m.awayId});
      else push("chance",mins[i],shooter);
    }else if(roll<.62)push("post",mins[i],shooter);
    else push("chance",mins[i],shooter);
  }
  const anchor=hXI[0]||aXI[0];
  if(anchor){push("halftime",45,anchor);push("fulltime",90,anchor);}
  m.events=[...goals,...manualSubs,...generated].sort((x,y)=>(x.minute+(x.addedTime||0)/100)-(y.minute+(y.addedTime||0)/100));
  m.events.forEach((e,i)=>e.id=i+1);
}

function simulationSeasonContext(homeId,awayId,matchday){
  const dayBefore=Math.max(0,Number(matchday||1)-1);
  const rows=standingsAt(state(),dayBefore);
  const count=Math.max(2,rows.length);
  const byId=new Map(rows.map((row,index)=>[Number(row.id),{...row,rank:index+1}]));
  const home=byId.get(Number(homeId))||{p:0,pts:0,gf:0,ga:0,rank:Math.ceil(count/2)};
  const away=byId.get(Number(awayId))||{p:0,pts:0,gf:0,ga:0,rank:Math.ceil(count/2)};
  const ppg=row=>row.p?Number(row.pts||0)/row.p:0;
  const gdpg=row=>row.p?(Number(row.gf||0)-Number(row.ga||0))/row.p:0;
  const rankGap=clamp((away.rank-home.rank)/(count-1),-1,1);
  const ppgGap=clamp((ppg(home)-ppg(away))/3,-1,1);
  const goalDiffGap=clamp((gdpg(home)-gdpg(away))/2.5,-1,1);
  // Tabellenplatz zählt erst mit wachsender Datenbasis voll. Nach einem Spieltag soll die Tabelle noch nicht alles verzerren.
  const evidence=clamp(Math.min(Number(home.p||0),Number(away.p||0))/6,0,1);
  const seasonGap=(rankGap*.35+ppgGap*.45+goalDiffGap*.20)*evidence;
  return {dayBefore,home,away,rankGap,ppgGap,goalDiffGap,seasonGap,evidence};
}
function weightedFormScore(teamId,day){
  const results=teamForm(teamId,day,5);
  if(!results.length)return .5;
  let earned=0,possible=0;
  results.forEach((result,index)=>{
    const weight=index+1; // jüngste Partie besitzt das höchste Gewicht
    earned+=(result==="W"?3:result==="D"?1:0)*weight;
    possible+=3*weight;
  });
  return possible?earned/possible:.5;
}

// V63: Ein gemeinsames Leistungsmodell für Ergebnis, Chancen und sichtbare Dominanz.
// Ein Tabellenplatz ist am 3. Spieltag nur ein Hinweis, am 26. Spieltag aber echte Saisonleistung.
function simulationPowerModel(homeTeam,awayTeam,matchObj){
  const hs=Number(teamAverage(homeTeam))||65, as=Number(teamAverage(awayTeam))||65;
  const ctx=simulationSeasonContext(homeTeam.id,awayTeam.id,matchObj.matchday);
  const formH=weightedFormScore(homeTeam.id,ctx.dayBefore), formA=weightedFormScore(awayTeam.id,ctx.dayBefore);
  const games=Math.min(Number(ctx.home.p||0),Number(ctx.away.p||0));
  const evidence=clamp(games/22,.08,1); // ab ca. Spieltag 22 ist die Tabelle voll aussagekräftig
  const ratingGap=clamp(hs-as,-8,8);
  const rankPlaces=Number(ctx.away.rank||10)-Number(ctx.home.rank||10); // + = Heim steht besser
  const rankEffect=clamp(rankPlaces/4,-4.75,4.75)*evidence;
  const ppgH=ctx.home.p?Number(ctx.home.pts||0)/ctx.home.p:1.35, ppgA=ctx.away.p?Number(ctx.away.pts||0)/ctx.away.p:1.35;
  const gdH=ctx.home.p?(Number(ctx.home.gf||0)-Number(ctx.home.ga||0))/ctx.home.p:0, gdA=ctx.away.p?(Number(ctx.away.gf||0)-Number(ctx.away.ga||0))/ctx.away.p:0;
  const ppgEffect=clamp((ppgH-ppgA)*.82,-1.8,1.8)*evidence;
  const gdEffect=clamp((gdH-gdA)*.32,-1.0,1.0)*evidence;
  const formEffect=clamp((formH-formA)*2.35,-1.5,1.5);
  const homeEffect=.62;
  const fatigueEffect=clamp((fatigueScore(awayTeam.id,matchObj)-fatigueScore(homeTeam.id,matchObj))*.42,-.55,.55);
  const effectiveGap=ratingGap+rankEffect+ppgEffect+gdEffect+formEffect+homeEffect+fatigueEffect;
  // Gesamt-Torlevel bleibt realistisch, bekommt aber selten offene/extreme Spiele.
  let totalXg=2.62 + Math.abs(effectiveGap)*.055 + randomNormal()*.16;
  const styleRoll=Math.random();
  let style='normal';
  if(styleRoll<.025){totalXg*=1.90;style='festival'}
  else if(styleRoll<.15){totalXg*=1.34;style='open'}
  else if(styleRoll>.88){totalXg*=.72;style='defensive'}
  totalXg=clamp(totalXg,1.35,5.65);
  const share=1/(1+Math.exp(-effectiveGap/2.55));
  let lambdaHome=clamp(totalXg*share,.18,4.9),lambdaAway=clamp(totalXg*(1-share),.16,4.7);
  return {hs,as,ctx,formH,formA,evidence,ratingGap,rankEffect,ppgEffect,gdEffect,formEffect,homeEffect,fatigueEffect,effectiveGap,totalXg,lambdaHome,lambdaAway,style};
}
function simulateScoreFromPower(model){
  let hg=clamp(poisson(model.lambdaHome),0,9),ag=clamp(poisson(model.lambdaAway),0,9),guard=0;
  while(hg+ag>10&&guard++<20){hg=clamp(poisson(model.lambdaHome),0,9);ag=clamp(poisson(model.lambdaAway),0,9)}
  // 0:0 bleibt möglich. In normalen/offenen Spielen wird ein torloses Spiel aber nicht künstlich häufig.
  if(hg===0&&ag===0&&model.style!=='defensive'&&Math.random()<.58){
    if(Math.random()<(model.lambdaHome/(model.lambdaHome+model.lambdaAway)))hg=1;else ag=1;
  }
  return [hg,ag];
}
function ensureSimulationLineups(m){
  const fill=(t,ids)=>{
    const roster=(t.players||[]).filter(Boolean);
    const valid=new Set(roster.map(p=>Number(p.id)));
    const out=[];
    for(const id of (ids||[])){const n=Number(id);if(valid.has(n)&&!out.includes(n))out.push(n);}
    const preferred=[...(t.defaultLineup||[]),...chooseLineup(t).map(p=>p.id),...sortPlayersByPosition(roster).map(p=>p.id)];
    for(const id of preferred){const n=Number(id);if(valid.has(n)&&!out.includes(n))out.push(n);if(out.length===11)break;}
    return out.slice(0,11);
  };
  const h=team(m.homeId),a=team(m.awayId); if(!h||!a)return false;
  m.lineups ||= {home:[],away:[],homeBench:[],awayBench:[]};
  m.lineups.home=fill(h,m.lineups.home);
  m.lineups.away=fill(a,m.lineups.away);
  m.lineups.homeBench=fullBenchIds(h,m.lineups.home,m.lineups.homeBench);
  m.lineups.awayBench=fullBenchIds(a,m.lineups.away,m.lineups.awayBench);
  return m.lineups.home.length===11&&m.lineups.away.length===11;
}

function renderPreMatchLineupBody(m){
  const host=el('#preMatchLineupBody');
  if(!host)return;
  ensureSimulationLineups(m);
  host.innerHTML=lineupView(m);
  bindLineupDrag(m);
}
function openPreMatchLineup(matchId){
  const m=season()?.matches?.find(x=>x.id===matchId);
  if(!m)return toast('Spiel wurde nicht gefunden');
  const h=team(m.homeId),a=team(m.awayId);
  if(!h||!a)return toast('Heim- oder Auswärtsteam fehlt');
  if(!ensureSimulationLineups(m))return toast('Für mindestens ein Team stehen nicht 11 Spieler zur Verfügung.');
  el('#overlay').innerHTML=`<div class="modal"><div class="sheet prematch-lineup-sheet">
    <div class="sheet-head"><div><div class="eyebrow">Spieltag ${m.matchday||''}</div><h2>${h.short} – ${a.short}</h2><p class="muted">Formation wählen · Spieler antippen und Position antippen</p></div><button class="iconbtn" id="closePreMatchLineup">×</button></div>
    <div id="preMatchLineupBody"></div>
    <div class="prematch-lineup-actions"><button class="btn ghost" id="autoPreMatchLineup">↻ Automatisch auffüllen</button><button class="btn primary" id="confirmPreMatchSimulation">▶ Mit diesen Aufstellungen simulieren</button></div>
  </div></div>`;
  renderPreMatchLineupBody(m);
  el('#closePreMatchLineup').onclick=closeOverlay;
  el('#autoPreMatchLineup').onclick=()=>{const hf=lineupFormation(m,'home'),af=lineupFormation(m,'away');m.lineups={home:[],away:[],homeBench:[],awayBench:[],homeFormation:hf,awayFormation:af};ensureSimulationLineups(m);renderPreMatchLineupBody(m);toast('Aufstellungen automatisch aufgefüllt')};
  el('#confirmPreMatchSimulation').onclick=()=>{
    if(!ensureSimulationLineups(m)||new Set(m.lineups.home||[]).size!==11||new Set(m.lineups.away||[]).size!==11)return toast('Beide Teams brauchen 11 verschiedene Spieler.');
    saveState({label:'Aufstellungen vor Simulation bestätigt'});
    simulateMatch(matchId);
  };
}

async function simulateMatch(matchId){
  const m=season()?.matches?.find(x=>x.id===matchId);
  if(!m)return toast("Spiel wurde nicht gefunden");
  if(m.__simulationBusy)return;
  if(m.status==="played"&&!confirm("Dieses bereits beendete Spiel neu simulieren?"))return;

  const h=team(m.homeId),a=team(m.awayId);
  if(!h||!a)return toast("Heim- oder Auswärtsteam fehlt");
  h.players=Array.isArray(h.players)?h.players.filter(Boolean):[];
  a.players=Array.isArray(a.players)?a.players.filter(Boolean):[];
  if(!h.players.length||!a.players.length)return toast("Beide Teams brauchen mindestens einen Spieler");
  if(!ensureSimulationLineups(m))return toast("Für mindestens ein Team stehen nicht 11 Spieler zur Verfügung.");
  delete m.__lineupConfirmedForSimulation;delete m.__awaitingSimulationLineup;

  const previous=deepClone(m);
  m.__simulationBusy=true;
  try{
    pushUndo("Spiel simuliert");
    const hXI=(m.lineups.home||[]).map(playerById).filter(Boolean),aXI=(m.lineups.away||[]).map(playerById).filter(Boolean);
    if(hXI.length!==11||aXI.length!==11)throw new Error("Keine vollständige Aufstellung verfügbar");

    m.events=[];
    h.defaultLineup=hXI.map(p=>p.id).filter(Number.isFinite);a.defaultLineup=aXI.map(p=>p.id).filter(Number.isFinite);h.defaultFormation=h.defaultFormation||"4-3-2-1";a.defaultFormation=a.defaultFormation||"4-3-2-1";
    m.lineups.home=hXI.map(p=>p.id);m.lineups.away=aXI.map(p=>p.id);
    m.lineups.homeBench=fullBenchIds(h,m.lineups.home,m.lineups.homeBench);
    m.lineups.awayBench=fullBenchIds(a,m.lineups.away,m.lineups.awayBench);

    const power=simulationPowerModel(h,a,m);
    const {hs,as,ctx:context,formH,formA,evidence,ratingGap,rankEffect,ppgEffect,gdEffect,formEffect,effectiveGap,lambdaHome,lambdaAway,style}=power;
    const seasonGap=clamp((rankEffect+ppgEffect+gdEffect)/4.2,-1,1);
    const formGap=clamp(formH-formA,-1,1);
    const derby=isDerbyMatch(m);
    const fatigueH=fatigueScore(h.id,m),fatigueA=fatigueScore(a.id,m);
    const controlHome=clamp(1/(1+Math.exp(-effectiveGap/2.8)),.16,.84);
    let [hg,ag]=simulateScoreFromPower(power);

    m.scoreMode="events";
    const usedMinutes=new Set();
    const minute=()=>{
      let x=clamp(Math.round(4+Math.random()*88),1,90),guard=0;
      while(usedMinutes.has(x)&&guard++<100)x=x>=90?1:x+1;
      usedMinutes.add(x);
      return x;
    };
    const starH=Math.max(...hXI.map(p=>Number(p.rating||60))),starA=Math.max(...aXI.map(p=>Number(p.rating||60)));
    if(starH-starA>=4&&Math.random()<.16)hg=Math.min(8,hg+1);
    if(starA-starH>=4&&Math.random()<.16)ag=Math.min(8,ag+1);
    const addPlannedGoal=(sidePlayers,teamId)=>{
      const r=Math.random();
      let source='open',type='goal';
      if(r<.10){type='penalty';source='penalty'}
      else if(r<.24)source='corner';
      else if(r<.42)source='distance';
      const scorer=pickScorerBySource(sidePlayers,source==='penalty'?'open':source);
      if(!scorer)return;
      const gm=minute();
      addSimEvent(m,type,gm,scorer,pickAssist(sidePlayers,scorer),0,{source,attackingTeamId:teamId});
    };
    for(let i=0;i<hg;i++)addPlannedGoal(hXI,m.homeId);
    for(let i=0;i<ag;i++)addPlannedGoal(aXI,m.awayId);
    const cards=clamp(poisson(3.35),1,7);
    for(let i=0;i<cards;i++){
      const side=Math.random()<.52?hXI:aXI;
      const player=weightedPick(side,p=>playerPositionGroup(p)==="DEF"?2.2:playerPositionGroup(p)==="MID"?1.5:.65);
      if(player){
        const roll=Math.random(),type=roll<.006?"red":roll<.018?"secondYellow":"yellow";
        addSimEvent(m,type,minute(),player);
      }
    }
    const redEvents=m.events.filter(e=>["red","secondYellow"].includes(e.type));
    const redHome=redEvents.filter(e=>playerById(e.playerId)?.teamId===h.id||h.players.some(p=>p.id===e.playerId)).length;
    const redAway=redEvents.filter(e=>playerById(e.playerId)?.teamId===a.id||a.players.some(p=>p.id===e.playerId)).length;
    if(redHome>redAway&&Math.random()<.58){const scorer=pickScorer(aXI);if(scorer){ag=Math.min(8,ag+1);addSimEvent(m,"goal",minute(),scorer,pickAssist(aXI,scorer));}}
    if(redAway>redHome&&Math.random()<.58){const scorer=pickScorer(hXI);if(scorer){hg=Math.min(8,hg+1);addSimEvent(m,"goal",minute(),scorer,pickAssist(hXI,scorer));}}
    if(Math.random()<.20){const side=Math.random()<.5?hXI:aXI;const injured=weightedPick(side,()=>1);if(injured)addSimEvent(m,"injury",minute(),injured);}
    // V41: Mehr sichtbare Offensivszenen. Wer mehr Spielkontrolle hat, erzeugt auch mehr
    // Chancen; Außenseiter können aber selten trotz mehr Abschlüssen verlieren.
    const eventControlHome=clamp(.50 + ratingGap*.035 + seasonGap*.115 + formGap*.07 + .025 - fatigueH*.025 + fatigueA*.025,.20,.80);
    const chanceVolume=clamp(Math.round(9 + power.totalXg*2.1 + Math.abs(effectiveGap)*.55 + poisson(2.8)),8,22);
    for(let i=0;i<chanceVolume;i++){
      const homeAttack=Math.random()<eventControlHome,attackers=homeAttack?hXI:aXI,defenders=homeAttack?aXI:hXI;
      const shooter=pickAttacker(attackers);if(!shooter)continue;
      const roll=Math.random();
      if(roll<.31){
        const keeper=pickGoalkeeper(defenders);
        if(keeper)addSimEvent(m,"save",minute(),keeper,null,0,{shotById:shooter.id,attackingTeamId:homeAttack?m.homeId:m.awayId});
      }else if(roll<.50)addSimEvent(m,"corner",minute(),weightedPick(attackers,cornerTakerWeight),null,0,{attackingTeamId:homeAttack?m.homeId:m.awayId});
      else if(roll<.59)addSimEvent(m,"post",minute(),shooter,null,0,{attackingTeamId:homeAttack?m.homeId:m.awayId});
      else addSimEvent(m,"chance",minute(),shooter,null,0,{attackingTeamId:homeAttack?m.homeId:m.awayId});
    }
    // Seltene zusätzliche Elfmeter, die auch vergeben werden können.
    if(Math.random()<.07){
      const homePen=Math.random()<eventControlHome,sidePlayers=homePen?hXI:aXI,teamId=homePen?m.homeId:m.awayId;
      const shooter=pickScorerBySource(sidePlayers,'open');
      if(shooter)addSimEvent(m,'missedPenalty',minute(),shooter,null,0,{source:'penalty',attackingTeamId:teamId});
    }
    const halfPlayer=hXI[0]||aXI[0];if(halfPlayer)addSimEvent(m,"halftime",45,halfPlayer,null,0);if(halfPlayer)addSimEvent(m,"fulltime",90,halfPlayer,null,0);

    m.events.sort((x,y)=>Number(x.minute||0)-Number(y.minute||0));
    // V58: Endergebnis bleibt bis zum Abpfiff verborgen.
    // Die Live-Simulation kennt die Torereignisse, aber Tabellen/Spieltag sehen noch kein Endresultat.
    m.__liveFinalHome=hg;
    m.__liveFinalAway=ag;
    m.homeGoals=0;
    m.awayGoals=0;
    m.status="scheduled";
    m.simulated=false;
    m.__livePreview=true;

    // V41 Statistikmodell: Tabellenlage, Form und Stärke sollen sich deutlich in der
    // Anzahl der Angriffe/Schüsse spiegeln. Ergebnisse bleiben aber nicht deterministisch.
    let shotEdge=effectiveGap*1.65 + randomNormal()*1.8;
    // Seltene statistische Überraschung: der Verlierer kann trotzdem mehr Chancen gehabt haben.
    const statUpset=Math.random()<.085;
    if(statUpset && hg!==ag){
      if(hg>ag)shotEdge=-Math.max(1.5,Math.abs(shotEdge)*.55);
      else shotEdge=Math.max(1.5,Math.abs(shotEdge)*.55);
    }
    const totalShots=clamp(Math.round(23 + Math.abs(ratingGap)*1.0 + Math.abs(seasonGap)*5.5 + randomNormal()*3.2),13,38);
    let shotsH=Math.round(totalShots/2 + shotEdge/1.75);
    let shotsA=totalShots-shotsH;
    shotsH=clamp(Math.max(hg+2,shotsH),4,26);
    shotsA=clamp(Math.max(ag+2,shotsA),4,26);
    // Verhindert, dass die Anpassung der Mindestwerte die Summe völlig aus dem Rahmen zieht.
    if(shotsH+shotsA>38){const over=shotsH+shotsA-38;if(shotsH>shotsA)shotsH-=over;else shotsA-=over;}
    const possH=Math.round(clamp(50 + shotEdge*.72 + ratingGap*.22 + randomNormal()*2.5,31,69));
    const sotH=clamp(Math.max(hg,Math.round(shotsH*(.30+Math.random()*.15))),hg,shotsH);
    const sotA=clamp(Math.max(ag,Math.round(shotsA*(.30+Math.random()*.15))),ag,shotsA);
    const qualityH=clamp(lambdaHome*.72 + shotsH*.055 + sotH*.075,.25,5.2);
    const qualityA=clamp(lambdaAway*.72 + shotsA*.055 + sotA*.075,.25,5.0);
    m.statistics={
      possessionHome:possH,possessionAway:100-possH,
      shotsHome:shotsH,shotsAway:shotsA,
      shotsOnTargetHome:sotH,shotsOnTargetAway:sotA,
      xgHome:Number((qualityH+randomNormal()*.14).toFixed(1)),
      xgAway:Number((qualityA+randomNormal()*.14).toFixed(1)),
      cornersHome:clamp(Math.round(shotsH*.28+Math.random()*2),0,13),
      cornersAway:clamp(Math.round(shotsA*.28+Math.random()*2),0,13),
      foulsHome:clamp(poisson(10.5),5,20),foulsAway:clamp(poisson(11),5,21),
      bigChancesHome:clamp(Math.round(sotH*.42 + hg*.45 + Math.random()*1.5),0,10),
      bigChancesAway:clamp(Math.round(sotA*.42 + ag*.45 + Math.random()*1.5),0,10)
    };
    // V62: Standards sind echte, geplante Live-Ereignisse und nicht nur Zahlen in der Statistik.
    const countSideEvents=(type,teamId)=>m.events.filter(ev=>ev.type===type&&Number(ev.attackingTeamId||0)===Number(teamId)).length;
    const addCornerEventsToTarget=(sidePlayers,teamId,target)=>{
      const missing=Math.max(0,Math.min(8,Number(target||0))-countSideEvents('corner',teamId));
      for(let i=0;i<missing;i++){
        const taker=weightedPick(sidePlayers,cornerTakerWeight);if(taker)addSimEvent(m,'corner',minute(),taker,null,0,{attackingTeamId:teamId,source:'corner'});
      }
    };
    addCornerEventsToTarget(hXI,m.homeId,m.statistics.cornersHome);
    addCornerEventsToTarget(aXI,m.awayId,m.statistics.cornersAway);
    // 1–4 gefährliche Freistöße pro Spiel. Das normale Foulvolumen bleibt in den Statistiken höher.
    const dangerousFK=clamp(poisson(2.1),1,4);
    for(let i=0;i<dangerousFK;i++){
      const homeFK=Math.random()<eventControlHome,sidePlayers=homeFK?hXI:aXI,teamId=homeFK?m.homeId:m.awayId;
      const taker=weightedPick(sidePlayers,p=>['AM','MID','ST'].includes(playerPositionGroup(p))?2.4:0.4);
      if(taker)addSimEvent(m,'freeKick',minute(),taker,null,0,{attackingTeamId:teamId,source:'foul'});
    }
    // Selten zusätzlicher Elfmeter, falls noch keiner im Spiel geplant ist.
    const hasPenalty=m.events.some(ev=>['penalty','missedPenalty'].includes(ev.type));
    if(!hasPenalty&&Math.random()<.16){
      const homePen=Math.random()<eventControlHome,sidePlayers=homePen?hXI:aXI,teamId=homePen?m.homeId:m.awayId;
      const shooter=pickScorerBySource(sidePlayers,'open');
      if(shooter){
        if(Math.random()<.76){
          // Ein erfolgreicher Elfmeter zählt als zusätzliches geplantes Tor und ist live sichtbar.
          if(homePen)hg=Math.min(8,hg+1);else ag=Math.min(8,ag+1);
          addSimEvent(m,'penalty',minute(),shooter,null,0,{source:'penalty',attackingTeamId:teamId});
        }else addSimEvent(m,'missedPenalty',minute(),shooter,null,0,{source:'penalty',attackingTeamId:teamId});
      }
    }
    m.events.sort((x,y)=>Number(x.minute||0)-Number(y.minute||0));

    m.statisticsSource="simulated";
    m.simulationFactors={
      homeStrength:Number(hs.toFixed(1)),awayStrength:Number(as.toFixed(1)),strengthGap:Number(ratingGap.toFixed(2)),
      effectiveGap:Number(effectiveGap.toFixed(3)),rankEffect:Number(rankEffect.toFixed(3)),ppgEffect:Number(ppgEffect.toFixed(3)),goalDiffEffect:Number(gdEffect.toFixed(3)),
      formHome:Number(formH.toFixed(3)),formAway:Number(formA.toFixed(3)),formEffect:Number(formEffect.toFixed(3)),
      tableEvidence:Number(evidence.toFixed(3)),tableDay:context.dayBefore,matchStyle:style,
      expectedGoalsHome:Number(lambdaHome.toFixed(3)),expectedGoalsAway:Number(lambdaAway.toFixed(3)),
      derby:isDerbyMatch(m),fatigueHome:Number(fatigueScore(h.id,m).toFixed(2)),fatigueAway:Number(fatigueScore(a.id,m).toFixed(2))
    };
    const capacity=Math.max(0,Number(h.stadium?.capacity||12000));
    {const tableAppeal=clamp((hs+as-120)/180,-.08,.16);const rivalry=Math.random()<.08?.08:0;const fill=clamp(.62+tableAppeal+rivalry+Math.random()*.23,.42,1);m.attendance=Math.min(capacity,Math.round(capacity*fill));}
    m.referee=["Leon Richter","Mika Hartmann","Jonas Winter","Tobias Kern","David Falk","Emil Berger"][Math.floor(Math.random()*6)];
    {const wd=weatherDetails(m);m.weather=wd.night&&Math.random()<.45?`Flutlicht · ${wd.label}`:wd.label;m.temperature=wd.temp;}
    const goalEvents=m.events.filter(e=>["goal","penalty"].includes(e.type));
    const motmEvent=goalEvents.length?weightedPick(goalEvents,e=>1+(e.assistId?0.3:0)):null;
    const motmPlayer=motmEvent?playerById(motmEvent.playerId):weightedPick([...hXI,...aXI],p=>Number(p.rating||60));
    m.motmPlayerId=motmPlayer?.id||null;

    rebuildPlayerStats();
    delete m.__simulationBusy;
    await saveState({label:"Realistische Spielsimulation",throwOnError:true});
    toast(`Live-Simulation gestartet`);
    render();
    // V58: Das Ergebnis wird erst beim Abpfiff übernommen. Bis dahin bleibt es verborgen.
    setTimeout(()=>openLiveSimulation(matchId),80);
  }catch(error){
    console.error("Simulation fehlgeschlagen:",error);
    Object.keys(m).forEach(key=>delete m[key]);
    Object.assign(m,previous);
    try{rebuildPlayerStats()}catch{}
    toast(`Simulation fehlgeschlagen: ${error?.message||"Unbekannter Fehler"}`);
    render();
  }finally{
    delete m.__simulationBusy;
  }
}

// V62 – Match Event & Scoring Engine -------------------------------------------------
// Die Simulation bleibt datengetrieben. Die Visualisierung spielt genau die
// bereits berechneten Ereignisse ab und erfindet keine zusätzlichen Tore/Karten.
function liveSimTeamSideForPlayer(m,playerId){
  if((m.lineups?.home||[]).includes(Number(playerId))||(m.lineups?.homeBench||[]).includes(Number(playerId)))return "home";
  if((m.lineups?.away||[]).includes(Number(playerId))||(m.lineups?.awayBench||[]).includes(Number(playerId)))return "away";
  const p=playerById(playerId);
  if(p&&team(m.homeId)?.players?.some(x=>x.id===p.id))return "home";
  if(p&&team(m.awayId)?.players?.some(x=>x.id===p.id))return "away";
  return null;
}
function liveSimBasePositions(side){
  // 4-3-2-1, x/y in Prozent. Heim greift nach rechts an, Gast nach links.
  const home=[
    [7,50],[22,14],[19,38],[19,62],[22,86],
    [39,25],[36,50],[39,75],[57,32],[57,68],[72,50]
  ];
  return side==="home"?home:home.map(([x,y])=>[100-x,100-y]);
}
function liveSimPlayerLabel(p){
  const n=String(p?.name||"Spieler").trim().split(/\s+/);
  return n.length>1?n[n.length-1].slice(0,10):n[0].slice(0,10);
}
function liveSimContrast(hex){
  const c=String(hex||"").replace('#','');
  if(!/^[0-9a-f]{6}$/i.test(c))return '#fff';
  const r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);
  return (r*299+g*587+b*114)/1000>155?'#07131b':'#fff';
}
function liveSimEventTitle(e,m){
  const p=playerById(e.playerId), shooter=e.shotById?playerById(e.shotById):null;
  const name=p?.name||"Spieler";
  if(e.type==="goal")return `⚽ TOR · ${name}`;
  if(e.type==="penalty")return `⚽ ELFMETERTOR · ${name}`;
  if(e.type==="save")return `🧤 PARADE · ${name}${shooter?` gegen ${shooter.name}`:""}`;
  if(e.type==="chance")return `🔥 CHANCE · ${name}`;
  if(e.type==="post")return `🥅 ALUMINIUM · ${name}`;
  if(e.type==="corner")return `🚩 ECKE · ${name}`;
  if(e.type==="yellow")return `🟨 GELB · ${name}`;
  if(e.type==="secondYellow")return `🟨🟥 GELB-ROT · ${name}`;
  if(e.type==="red")return `🟥 ROT · ${name}`;
  if(e.type==="injury")return `🩹 VERLETZUNG · ${name}`;
  if(e.type==="halftime")return `⏸ HALBZEIT`;
  if(e.type==="fulltime")return `🏁 ABPFIFF`;
  if(e.type==="substitution")return `🔄 WECHSEL · ${name}`;
  return `• ${name}`;
}
function liveSimTickerRow(e,title,side='home'){
  const classes=['live2d-ticker-row',side||'home',e?.type||'misc'];
  if(['goal','penalty'].includes(e?.type))classes.push('goal');
  if(['yellow','secondYellow','red'].includes(e?.type))classes.push('card');
  if(e?.type==='chance')classes.push('chance');
  if(e?.type==='save')classes.push('save');
  if(e?.type==='corner')classes.push('corner');
  if(e?.type==='post')classes.push('post');
  if(e?.type==='fulltime')classes.push('full');
  return `<div class="${classes.join(' ')}"><b>${Number(e?.minute||0)}'</b><span>${title}</span></div>`;
}
function liveTickerAllowedType(type){return ['goal','penalty','chance','save','post','yellow','secondYellow','red'].includes(type)}
function liveTickerDisplayTitle(e,m){
  const p=playerById(e?.playerId), shooter=e?.shotById?playerById(e.shotById):p, name=(shooter||p)?.name||'Spieler';
  if(e?.type==='goal'||e?.type==='penalty')return `⚽ TOR · ${p?.name||name}`;
  if(['chance','save','post'].includes(e?.type))return `🔥 CHANCE · ${name}`;
  if(e?.type==='yellow')return `🟨 GELB · ${p?.name||name}`;
  if(e?.type==='secondYellow')return `🟨🟥 GELB-ROT · ${p?.name||name}`;
  if(e?.type==='red')return `🟥 ROT · ${p?.name||name}`;
  return liveSimEventTitle(e,m);
}
function liveSimScoreAt(m,minute){
  let h=0,a=0;
  const goals=(m.events||[]).filter(e=>["goal","penalty"].includes(e.type)&&Number(e.minute||0)<=minute).sort((x,y)=>Number(x.minute||0)-Number(y.minute||0));
  goals.forEach(e=>{const side=liveSimTeamSideForPlayer(m,e.playerId);if(side==="home")h++;else if(side==="away")a++;});
  return [h,a];
}
function liveSimBuildPlayerNodes(m){
  const h=team(m.homeId),a=team(m.awayId);
  const homeIds=(m.lineups?.home||[]).slice(0,11),awayIds=(m.lineups?.away||[]).slice(0,11);
  const mk=(ids,side,t)=>{
    const pos=liveSimBasePositions(side),color=teamColor(t),text=liveSimContrast(color);
    return ids.map((id,i)=>{const p=playerById(id); if(!p)return '';
      const [x,y]=pos[i]||[50,50];
      return `<div class="live2d-player ${side}" data-live-player="${p.id}" data-live-slot="${i}" data-base-x="${x}" data-base-y="${y}" style="--px:${x}%;--py:${y}%;--pc:${color};--pt:${text}">
        <span class="live2d-dot">${String(p.number||i+1).slice(0,2)}</span><small>${liveSimPlayerLabel(p)}</small>
      </div>`;
    }).join('');
  };
  return mk(homeIds,'home',h)+mk(awayIds,'away',a);
}
function openLiveSimulation(matchId){
  const m=season()?.matches?.find(x=>x.id===matchId),h=m&&team(m.homeId),a=m&&team(m.awayId);
  if(!m||!h||!a)return openMatch(matchId);

  // V43: wichtige Ereignisse bekommen innerhalb einer Minute eigene Zeitfenster.
  const rawEvents=(m.events||[]).filter(e=>Number(e.minute||0)>=0).slice().sort((x,y)=>Number(x.minute||0)-Number(y.minute||0));
  const minuteBuckets=new Map();
  rawEvents.forEach(e=>{const min=Number(e.minute||0),list=minuteBuckets.get(min)||[];list.push(e);minuteBuckets.set(min,list)});
  const events=[];
  [...minuteBuckets.entries()].sort((x,y)=>x[0]-y[0]).forEach(([min,list])=>list.forEach((e,i)=>events.push({...e,__liveSecond:Math.min(90*60,Math.max(0,min*60+(list.length===1?30:8+i*(46/Math.max(1,list.length-1))))) })));
  events.sort((x,y)=>x.__liveSecond-y.__liveSecond);

  const {home:hColor,away:aColor}=distinctMatchColors(h,a);
  el('#overlay').innerHTML=`<div class="modal live2d-modal"><div class="live2d-shell live2d-v50 live2d-v52 live2d-v54 live2d-v55 live2d-v56 live2d-v57 live2d-v58 live2d-v59 live2d-v60 live2d-v65" style="--liveTempo:1.05s;--home:${hColor};--away:${aColor};${h.stadium?.image?`--stadium-photo:url(\'${h.stadium.image}\');`:``}">
    <header class="v50-scoreboard">
      <div class="v50-team home">${badge(h)}<div><small>${h.short||"HEIM"}</small><strong>${h.name}</strong><span>HEIM</span></div></div>
      <div class="v50-score-center"><small id="live2dPeriod">1. HZ</small><strong id="live2dScore">0 : 0</strong><b id="live2dClock">00:00</b></div>
      <div class="v50-team away"><div><small>${a.short||"GAST"}</small><strong>${a.name}</strong><span>GAST</span></div>${badge(a)}</div>
    </header>
    <div class="v50-controlbar">
      <button class="v50-control pause" id="live2dPause">⏸ Pause</button>
      <div class="v50-progress"><i id="live2dProgress"></i></div>
      <button class="v50-control speed" id="live2dSpeed">1×⌄</button>
      <button class="v50-control gear" id="v50Gear">⚙</button>
      <button class="v50-control close" id="live2dClose">×</button>
    </div>
    <div class="live2d-halftime-panel" id="live2dHalftimePanel" hidden></div>
    <section class="v50-stadium-wrap v53-stadium-wrap v54-stadium-wrap">
      <div class="v54-stadium-photo" aria-hidden="true"></div>
      <div class="v54-stand-side left" aria-hidden="true"></div><div class="v54-stand-side right" aria-hidden="true"></div>
      <div class="v53-crowd v53-crowd-top"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="v53-crowd v53-crowd-left"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="v53-crowd v53-crowd-right"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="v50-stadium-band"><span>FLE</span><b>FANTASY LIGA ELITE</b><span>FLE</span><b>FANTASY LIGA ELITE</b><span>FLE</span></div>
      <div class="v53-goal-shell left" aria-hidden="true"><span></span><b></b></div>
      <div class="v53-goal-shell right" aria-hidden="true"><span></span><b></b></div>
      <section class="live2d-pitch v50-pitch v52-pitch" id="live2dPitch" style="--home:${hColor};--away:${aColor}">
        <div class="live2d-field-lines"><i class="touch"></i><i class="half"></i><i class="circle"></i><i class="center-dot"></i><i class="box left"></i><i class="box right"></i><i class="six left"></i><i class="six right"></i><i class="spot left"></i><i class="spot right"></i><i class="arc left"></i><i class="arc right"></i><i class="goal left"></i><i class="goal right"></i><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i></div>
        <svg class="live2d-traces" id="live2dTraces" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line id="live2dTraceMain" x1="50" y1="50" x2="50" y2="50"></line></svg>
        <div class="live2d-attackbar" id="live2dAttackBar"><span id="live2dAttackTeam">AUFBAU</span><b>»</b></div>
        ${liveSimBuildPlayerNodes(m)}
        <div class="live2d-ball" id="live2dBall"><span></span></div>
        <div class="live2d-possession-flash" id="live2dPossFlash"></div>
        <div class="live2d-action-card" id="live2dActionCard"><small id="live2dActionType">LIVE-SZENE</small><strong id="live2dActionTitle"></strong><span id="live2dActionDetail"></span></div>
        <div class="live2d-goalflash" id="live2dGoalFlash"><span>TOR!</span><small id="live2dGoalName"></small></div>
        <div class="live2d-setpiece" id="live2dSetpiece"></div>
        <div class="live2d-scene-caption show" id="live2dScene">⚽ Anstoß</div>
      </section>
    </section>
    <section class="v50-live-scene" id="live2dStatusRail">
      <div class="v50-live-tag">LIVE-SZENE</div>
      <div class="v50-live-copy"><small id="live2dStatusType">ANSTOSS</small><strong id="live2dStatusTitle">Das Spiel beginnt</strong><span id="live2dStatusDetail">${h.name} gegen ${a.name}</span></div>
      <div class="v50-mini-pitch"><i></i><i></i><b></b></div>
    </section>
    <section class="v50-data-grid">
      <aside class="v50-card v50-stats" id="live2dStatsPanel">
        <h3>LIVE-STATISTIKEN</h3>
        <div class="v50-stat-teams"><span>${badge(h)}<b>${h.short||h.name}</b></span><span><b>${a.short||a.name}</b>${badge(a)}</span></div>
        <div class="v50-stat-row"><b id="v50PossH">50%</b><div><span>Ballbesitz</span><i><em id="v50BarPossH"></em><em class="away" id="v50BarPossA"></em></i></div><b id="v50PossA">50%</b></div>
        <div class="v50-stat-row"><b id="v50ShotsH">0</b><div><span>Schüsse</span><i><em id="v50BarShotsH"></em><em class="away" id="v50BarShotsA"></em></i></div><b id="v50ShotsA">0</b></div>
        <div class="v50-stat-row"><b id="v50SotH">0</b><div><span>Aufs Tor</span><i><em id="v50BarSotH"></em><em class="away" id="v50BarSotA"></em></i></div><b id="v50SotA">0</b></div>
        <div class="v50-stat-row"><b id="v50BigH">0</b><div><span>Großchancen</span><i><em id="v50BarBigH"></em><em class="away" id="v50BarBigA"></em></i></div><b id="v50BigA">0</b></div>
        <div class="v50-stat-row"><b id="v50CornersH">0</b><div><span>Ecken</span><i><em id="v50BarCornersH"></em><em class="away" id="v50BarCornersA"></em></i></div><b id="v50CornersA">0</b></div>
        <div class="v50-stat-row"><b id="v50FoulsH">0</b><div><span>Fouls</span><i><em id="v50BarFoulsH"></em><em class="away" id="v50BarFoulsA"></em></i></div><b id="v50FoulsA">0</b></div>
        <div class="v50-stat-row"><b id="v50XgH">0.00</b><div><span>xG</span><i><em id="v50BarXgH"></em><em class="away" id="v50BarXgA"></em></i></div><b id="v50XgA">0.00</b></div>
        <span class="hidden-v50" id="live2dPoss">50 : 50</span><span class="hidden-v50" id="live2dPossMini">50 : 50</span><span class="hidden-v50" id="live2dShots">0 : 0</span><span class="hidden-v50" id="live2dSot">0 : 0</span><span class="hidden-v50" id="live2dBig">0 : 0</span><span class="hidden-v50" id="live2dCorners">0 : 0</span><span class="hidden-v50" id="live2dXg">0.0 : 0.0</span>
      </aside>
      <aside class="v50-card v50-ticker" id="live2dTickerPanel"><div class="v50-card-head"><h3>LIVE-TICKER</h3><span>SZENEN & SPIELVERLAUF</span></div><div class="live2d-ticker" id="live2dTicker"><div class="live2d-ticker-empty">Anstoß – ${h.name} gegen ${a.name}</div></div></aside>
    </section>
    <section class="v50-bottom-controls">
      <div class="v50-main-controls"><button id="v50Camera">📷 <span>KAMERA<br><b>BROADCAST</b></span></button><button id="v50SpeedBottom">GESCHWINDIGKEIT<br><b>1X⌄</b></button><button class="danger" id="v50PauseBottom">SIMULATION LÄUFT</button></div>
      <div class="v50-setpieces"><button id="v50Kickoff">📣 ANSTOSS</button><button id="v50Corner">🚩 ECKE</button><button id="v50FreeKick">🧍‍♂️🧍‍♂️ FREISTOSS</button><button id="v50Penalty">🥅 ELFMETER</button><button id="v50Tactics">⚙ TAKTIK</button></div>
      <div class="v50-footnote"><span>ⓘ ${h.name} gegen ${a.name} läuft!</span><b style="color:${hColor}">${h.short||h.name} 4-2-3-1</b><b style="color:${aColor}">${a.short||a.name} 4-3-3</b></div>
    </section>
  </div></div>`;

  const shell=document.querySelector('.live2d-shell'),pitch=el('#live2dPitch'),clock=el('#live2dClock'),score=el('#live2dScore'),period=el('#live2dPeriod'),progress=el('#live2dProgress'),ticker=el('#live2dTicker'),scene=el('#live2dScene'),ball=el('#live2dBall'),goalFlash=el('#live2dGoalFlash'),goalName=el('#live2dGoalName'),setpiece=el('#live2dSetpiece'),tickerPanel=el('#live2dTickerPanel'),statsPanel=el('#live2dStatsPanel'),traceMain=el('#live2dTraceMain'),attackBar=el('#live2dAttackBar'),attackTeam=el('#live2dAttackTeam'),possFlash=el('#live2dPossFlash'),actionCard=el('#live2dActionCard'),actionType=el('#live2dActionType'),actionTitle=el('#live2dActionTitle'),actionDetail=el('#live2dActionDetail'),statusRail=el('#live2dStatusRail'),statusType=el('#live2dStatusType'),statusTitle=el('#live2dStatusTitle'),statusDetail=el('#live2dStatusDetail'),halftimePanel=el('#live2dHalftimePanel');
  let simSecond=0,lastFrame=performance.now(),paused=false,speed=1,eventIndex=0,raf=0,ended=false,sequenceTimers=[],goalTimer=0;
  let ballCarrierNode=null,ballFlightRAF=0,traceTimer=0,actionTimer=0,possTimer=0,statusTimer=0;
  let visibleHomeGoals=0,visibleAwayGoals=0,eventSceneActive=false,eventSceneUntil=0;const visibleGoalEventIds=new Set();
  let possessionSide=Math.random()<(Number(m.statistics?.possessionHome||50)/100)?'home':'away';
  let currentBallPlayerId=null,cinematicUntil=0,nextAmbientAction=70,nextShapeReal=0,shapeNonce=0,ballInFlight=false,restartLock=false,lastAmbientTickerAt=-999,lastAmbientTickerKey='',actionBusyUntil=0;
  const totalSeconds=90*60,realSecondsAt1x=420,simPerReal=totalSeconds/realSecondsAt1x,tickerRows=[];
  const liveRuntime={shotsHome:0,shotsAway:0,sotHome:0,sotAway:0,bigHome:0,bigAway:0,cornersHome:0,cornersAway:0,foulsHome:0,foulsAway:0,xgHome:0,xgAway:0};
  const countedLiveEvents=new Set();

  const sideNodes=side=>[...shell.querySelectorAll(`.live2d-player.${side}`)];
  const nodeFor=id=>shell?.querySelector(`[data-live-player="${Number(id)}"]`);
  const playerNodeId=node=>Number(node?.dataset.livePlayer||0);
  const slotOf=node=>Number(node?.dataset.liveSlot||0);
  const attackingDir=side=>side==='home'?1:-1;
  const sideOf=node=>node?.classList.contains('home')?'home':node?.classList.contains('away')?'away':null;
  const isGoalkeeper=node=>slotOf(node)===0;
  const groupOf=node=>{const s=slotOf(node);return s===0?'GK':s<=4?'DEF':s<=7?'MID':s<=9?'AM':'ST'};
  const baseXY=node=>({x:Number(node?.dataset.baseX||50),y:Number(node?.dataset.baseY||50)});
  const currentXY=node=>{const sx=parseFloat(node?.style.getPropertyValue('--px')),sy=parseFloat(node?.style.getPropertyValue('--py')),b=baseXY(node);return{x:Number.isFinite(sx)?sx:b.x,y:Number.isFinite(sy)?sy:b.y}};
  const setNodeXY=(node,x,y)=>{if(!node)return;const cx=clamp(x,2.5,97.5),cy=clamp(y,3,97);node.style.setProperty('--px',`${cx}%`);node.style.setProperty('--py',`${cy}%`);if(ballCarrierNode===node&&!ballInFlight)rawBallXY(cx,cy,false)};
  const setLocked=(node,ms=0)=>{if(node)node.dataset.lockUntil=String(performance.now()+ms)};
  const isLocked=node=>Number(node?.dataset.lockUntil||0)>performance.now();
  const later=(fn,ms)=>{const id=setTimeout(()=>{sequenceTimers=sequenceTimers.filter(x=>x!==id);fn()},ms);sequenceTimers.push(id);return id};
  const clearSequenceTimers=()=>{sequenceTimers.forEach(clearTimeout);sequenceTimers=[]};
  const tempoScale=()=>1/Math.max(.78,Math.sqrt(speed));
  function setTempo(){shell?.style.setProperty('--liveTempo',`${Math.max(.48,1.16/Math.sqrt(speed))}s`)}
  function clearActive(){shell?.querySelectorAll('.live2d-player.active,.live2d-player.duel,.live2d-player.runner,.live2d-player.shooter,.live2d-player.wall').forEach(n=>n.classList.remove('active','duel','runner','shooter','wall'))}
  function rawBallXY(x,y,air=false){if(!ball)return;ball.classList.toggle('air',air);ball.style.left=`${clamp(x,1.3,98.7)}%`;ball.style.top=`${clamp(y,2,98)}%`}
  function setBallXY(x,y,air=false){ballCarrierNode=null;if(ballFlightRAF){cancelAnimationFrame(ballFlightRAF);ballFlightRAF=0}rawBallXY(x,y,air)}
  function actualXY(node){return currentXY(node)}
  function setBallAtNode(node){if(!node)return;ballCarrierNode=node;currentBallPlayerId=playerNodeId(node);ballInFlight=false;shell?.querySelectorAll('.live2d-player.ball-owner').forEach(n=>n.classList.remove('ball-owner'));node.classList.add('ball-owner');const p=actualXY(node);rawBallXY(p.x,p.y,false)}
  function clearBallOwner(){ballCarrierNode=null;shell?.querySelectorAll('.live2d-player.ball-owner').forEach(n=>n.classList.remove('ball-owner'))}
  function drawTrace(a,b,kind='pass',ms=900){if(!traceMain)return;traceMain.setAttribute('x1',a.x);traceMain.setAttribute('y1',a.y);traceMain.setAttribute('x2',b.x);traceMain.setAttribute('y2',b.y);traceMain.setAttribute('class',kind);traceMain.parentElement?.classList.add('show');clearTimeout(traceTimer);traceTimer=setTimeout(()=>traceMain.parentElement?.classList.remove('show'),ms)}
  function flyBall(start,getEnd,duration=900,{air=false,kind='pass',onDone=null}={}){if(ballFlightRAF)cancelAnimationFrame(ballFlightRAF);clearBallOwner();ballInFlight=true;const t0=performance.now();const end0=typeof getEnd==='function'?getEnd():getEnd;drawTrace(start,end0,kind,Math.max(450,duration*.9));const step=now=>{const t=clamp((now-t0)/Math.max(120,duration),0,1),e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2,end=typeof getEnd==='function'?getEnd():getEnd;let x=start.x+(end.x-start.x)*e,y=start.y+(end.y-start.y)*e;if(air)y-=Math.sin(Math.PI*t)*5.5;rawBallXY(x,y,air);if(t<1)ballFlightRAF=requestAnimationFrame(step);else{ballFlightRAF=0;ballInFlight=false;rawBallXY(end.x,end.y,false);onDone?.()}};ballFlightRAF=requestAnimationFrame(step)}
  function flashPossession(side,node){if(!possFlash)return;const who=node?playerLabel(node):teamLabel(side);possFlash.textContent=`↔ BALLGEWINN · ${who}`;possFlash.className=`live2d-possession-flash show ${side}`;clearTimeout(possTimer);possTimer=setTimeout(()=>possFlash.classList.remove('show'),1800)}
  function showAction(type,title,detail='',side='home',ms=2200){if(actionCard){actionType.textContent=type;actionTitle.textContent=title;actionDetail.textContent=detail;actionCard.className=`live2d-action-card show ${side}`;clearTimeout(actionTimer);actionTimer=setTimeout(()=>actionCard.classList.remove('show'),ms)}if(statusRail){statusRail.className=`v50-live-scene show ${side}`;if(statusType)statusType.textContent=type;if(statusTitle)statusTitle.textContent=title;if(statusDetail)statusDetail.textContent=detail||'';clearTimeout(statusTimer);statusTimer=setTimeout(()=>statusRail.classList.remove('show'),ms)}}
  function setAttackLabel(side,label='ANGRIFF'){if(!attackBar)return;attackTeam.textContent=`${label} ${teamLabel(side)}`;attackBar.className=`live2d-attackbar show ${side}`}
  function showScene(text,strong=false){if(scene){scene.textContent=text;scene.classList.toggle('strong',Boolean(strong));scene.classList.add('show')}}
  function pushAmbientTicker(){return}
  function refreshRuntimeStats(){
    const st=m.statistics||{},minute=simSecond/60,frac=clamp(minute/90,0,1),basePoss=Number(st.possessionHome||50),swing=Math.sin(frac*Math.PI*2.6)*4,ph=clamp(Math.round(basePoss+swing*(basePoss>=50?1:-1)),28,72),pa=100-ph;
    const R=liveRuntime,set=(id,v)=>{const n=el(id);if(n)n.textContent=v};
    set('#live2dPoss',`${ph} : ${pa}`);set('#live2dPossMini',`${ph} : ${pa}`);set('#live2dShots',`${R.shotsHome} : ${R.shotsAway}`);set('#live2dSot',`${R.sotHome} : ${R.sotAway}`);set('#live2dBig',`${R.bigHome} : ${R.bigAway}`);set('#live2dCorners',`${R.cornersHome} : ${R.cornersAway}`);set('#live2dXg',`${R.xgHome.toFixed(2)} : ${R.xgAway.toFixed(2)}`);
    set('#v50PossH',`${ph}%`);set('#v50PossA',`${pa}%`);set('#v50ShotsH',R.shotsHome);set('#v50ShotsA',R.shotsAway);set('#v50SotH',R.sotHome);set('#v50SotA',R.sotAway);set('#v50BigH',R.bigHome);set('#v50BigA',R.bigAway);set('#v50CornersH',R.cornersHome);set('#v50CornersA',R.cornersAway);set('#v50FoulsH',R.foulsHome);set('#v50FoulsA',R.foulsAway);set('#v50XgH',R.xgHome.toFixed(2));set('#v50XgA',R.xgAway.toFixed(2));
    const bar=(id,val,total)=>{const n=el(id);if(n)n.style.width=`${clamp(total?val/total*100:0,0,100)}%`};
    bar('#v50BarPossH',ph,100);bar('#v50BarPossA',pa,100);bar('#v50BarShotsH',R.shotsHome,Math.max(1,R.shotsHome+R.shotsAway));bar('#v50BarShotsA',R.shotsAway,Math.max(1,R.shotsHome+R.shotsAway));bar('#v50BarSotH',R.sotHome,Math.max(1,R.sotHome+R.sotAway));bar('#v50BarSotA',R.sotAway,Math.max(1,R.sotHome+R.sotAway));bar('#v50BarBigH',R.bigHome,Math.max(1,R.bigHome+R.bigAway));bar('#v50BarBigA',R.bigAway,Math.max(1,R.bigHome+R.bigAway));bar('#v50BarCornersH',R.cornersHome,Math.max(1,R.cornersHome+R.cornersAway));bar('#v50BarCornersA',R.cornersAway,Math.max(1,R.cornersHome+R.cornersAway));bar('#v50BarFoulsH',R.foulsHome,Math.max(1,R.foulsHome+R.foulsAway));bar('#v50BarFoulsA',R.foulsAway,Math.max(1,R.foulsHome+R.foulsAway));bar('#v50BarXgH',R.xgHome,Math.max(.01,R.xgHome+R.xgAway));bar('#v50BarXgA',R.xgAway,Math.max(.01,R.xgHome+R.xgAway));
  }
  function registerVisibleEvent(type,side,event=null){
    const key=event?`e:${event.id||event.type+'-'+event.minute+'-'+event.playerId}`:`s:${type}:${side}:${Math.round(simSecond)}`;if(countedLiveEvents.has(key))return;countedLiveEvents.add(key);const H=side==='home',k=n=>H?`${n}Home`:`${n}Away`;
    if(['goal','penalty','chance','post','save','missedPenalty'].includes(type))liveRuntime[k('shots')]++;
    if(['goal','penalty','save'].includes(type))liveRuntime[k('sot')]++;
    if(['goal','penalty','chance','post','save','missedPenalty'].includes(type))liveRuntime[k('big')]++;
    if(type==='corner')liveRuntime[k('corners')]++;
    if(type==='foul')liveRuntime[k('fouls')]++;
    const xgMap={goal:.34,penalty:.76,chance:.22,post:.29,save:.18,missedPenalty:.76};if(xgMap[type])liveRuntime[k('xg')]+=xgMap[type];
    refreshRuntimeStats();
  }

  function showSetpiece(text){if(!setpiece)return;setpiece.textContent=text;setpiece.classList.remove('show');void setpiece.offsetWidth;setpiece.classList.add('show');later(()=>setpiece.classList.remove('show'),1700*tempoScale())}
  function teamLabel(side){return side==='home'?(h.short||h.name):(a.short||a.name)}
  function eventAttackSide(e){if(Number(e?.attackingTeamId||0)===Number(m.homeId))return 'home';if(Number(e?.attackingTeamId||0)===Number(m.awayId))return 'away';return liveSimTeamSideForPlayer(m,e?.shotById||e?.playerId)||possessionSide||'home'}
  function playerLabel(node){return liveSimPlayerLabel(playerById(playerNodeId(node)))}
  function progressFor(node,side=sideOf(node)){const p=currentXY(node);return side==='home'?p.x:100-p.x}
  function weightedNode(nodes,fn){return weightedPick(nodes,n=>Math.max(.025,fn(n)))}
  function roleNodes(side,groups,exclude=[]){return sideNodes(side).filter(n=>groups.includes(groupOf(n))&&!exclude.includes(n))}
  function nearestOpp(node){if(!node)return null;const p=currentXY(node),opp=sideOf(node)==='home'?'away':'home';return [...sideNodes(opp)].sort((x,y)=>Math.hypot(currentXY(x).x-p.x,currentXY(x).y-p.y)-Math.hypot(currentXY(y).x-p.x,currentXY(y).y-p.y))[0]||null}
  function chooseRole(side,groups,exclude=[]){const nodes=roleNodes(side,groups,exclude);return weightedNode(nodes,n=>{const p=playerById(playerNodeId(n)),a=p?.attributes||{};return 1+Number(a.passing||60)/80+Number(a.dribbling||60)/110})||nodes[0]||null}
  function chooseCarrier(side){return chooseRole(side,['MID','AM','ST','DEF'])||sideNodes(side)[1]||sideNodes(side)[0]}
  function keeper(side){return sideNodes(side).find(isGoalkeeper)||null}
  function squadProfile(side){
    const t=side==='home'?h:a, ids=side==='home'?(m.lineups?.home||[]):(m.lineups?.away||[]), ps=ids.map(playerById).filter(Boolean);
    const avg=k=>ps.length?ps.reduce((sum,p)=>sum+Number(p.attributes?.[k]||p.rating||60),0)/ps.length:60;
    const passing=avg('passing'),pace=avg('pace'),dribbling=avg('dribbling'),defending=avg('defending');
    // Stabiler Vereinscharakter ohne gespeicherte Zusatzdaten: Attribute + Vereins-ID.
    const signature=((Number(t?.id)||1)*9301+49297)%233280/233280;
    return {passing,pace,dribbling,defending,
      direct:clamp((pace-passing)/35+.42+signature*.18,.20,.78),
      possession:clamp((passing+dribbling-defending)/80+.48,.28,.78),
      press:clamp((defending+pace-110)/75+.45,.25,.82)};
  }
  const profiles={home:squadProfile('home'),away:squadProfile('away')};
  function segmentPressure(from,to,side){
    const a=currentXY(from),b=currentXY(to),vx=b.x-a.x,vy=b.y-a.y,len2=vx*vx+vy*vy||1,opp=side==='home'?'away':'home';let pressure=0;
    sideNodes(opp).forEach(n=>{const q=currentXY(n),t=clamp(((q.x-a.x)*vx+(q.y-a.y)*vy)/len2,0,1),cx=a.x+t*vx,cy=a.y+t*vy,d=Math.hypot(q.x-cx,q.y-cy);if(d<7)pressure+=7-d});
    return pressure;
  }

  // Das Team bewegt sich als Block, aber jeder Spieler bekommt eigene Läufe.
  function updateDynamicShape(force=false){
    if(!shell||ended||paused)return;
    const now=performance.now();if(!force&&now<nextShapeReal)return;nextShapeReal=now+620/Math.max(.9,Math.sqrt(speed));shapeNonce++;
    const carrier=nodeFor(currentBallPlayerId),cp=carrier?currentXY(carrier):{x:50,y:50};
    ['home','away'].forEach(side=>{
      const own=side===possessionSide,dir=attackingDir(side),ballProg=side==='home'?cp.x:100-cp.x;
      sideNodes(side).forEach(node=>{
        if(node===carrier||isLocked(node))return;
        const b=baseXY(node),g=groupOf(node),slot=slotOf(node);let x=b.x,y=b.y;
        const block=clamp((ballProg-50)*(own?.11:.075),-4.5,6.2);if(g!=='GK')x+=dir*block;
        if(g!=='GK')y+=clamp((cp.y-b.y)*(own?.055:.035),-3.2,3.2);
        if(own){
          if(g==='ST'){const nearBall=Math.abs(cp.y-b.y)<20;x+=dir*(nearBall?5.2:3.2);y+=clamp((cp.y-b.y)*.10,-4,4)}
          else if(g==='AM'){x+=dir*3.0;y+=clamp((cp.y-b.y)*.07,-3,3)}
          else if(g==='MID'){x+=dir*1.4;y+=clamp((cp.y-b.y)*.04,-2,2)}
          else if(g==='DEF'&&(slot===1||slot===4)&&ballProg>62){x+=dir*2.2;y+=Math.sign(b.y-50)*1.4}
        }else{
          if(g==='ST')x-=dir*1.0;else if(g==='AM')x-=dir*.7;else if(g==='MID')x-=dir*.45;
          if(g!=='GK')y+=(50-b.y)*.025;
        }
        setNodeXY(node,clamp(x,3.5,96.5),clamp(y,5,95));
      });
    });
  }

  function runTo(node,x,y,ms=1200,cls='runner'){
    if(!node)return;node.classList.add(cls);setLocked(node,ms+180);setNodeXY(node,x,y);later(()=>node.classList.remove(cls),ms+120);
  }
  function runIntoSpace(node,side,distance=11,laneShift=0,ms=1350){if(!node)return;const p=currentXY(node),dir=attackingDir(side),tx=side==='home'?Math.min(88,p.x+dir*distance):Math.max(12,p.x+dir*distance),ty=clamp(p.y+laneShift,8,92);runTo(node,tx,ty,ms,'runner')}

  function passCandidates(from,side,{through=false,long=false}={}){
    const fp=currentXY(from),fg=groupOf(from),dir=attackingDir(side);
    return sideNodes(side).filter(n=>n!==from&&!isGoalkeeper(n)).map(n=>{
      const p=currentXY(n),g=groupOf(n),dx=(p.x-fp.x)*dir,dy=Math.abs(p.y-fp.y),dist=Math.hypot(p.x-fp.x,p.y-fp.y);
      let w=1;
      if(fg==='GK')w=(g==='DEF'?8:g==='MID'?2.3:.08);
      else if(fg==='DEF')w=(g==='DEF'?2.2:g==='MID'?7:g==='AM'?1.7:g==='ST'?.35:.1);
      else if(fg==='MID')w=(g==='DEF'?1.4:g==='MID'?4.2:g==='AM'?6.2:g==='ST'?4.3:.1);
      else if(fg==='AM')w=(g==='MID'?2.8:g==='AM'?3.4:g==='ST'?7:g==='DEF'?.5:.1);
      else w=(g==='AM'?5.5:g==='MID'?2.8:g==='ST'?1.4:.35);
      if(dx>0)w*=1+Math.min(dx,28)/18; else w*=.58;
      if(dist>42&&!long)w*=.08;if(dist<5)w*=.32;if(dy>45&&!long)w*=.26;if(dx<2&&g!=='DEF'&&!long)w*=.55;
      const pressure=segmentPressure(from,n,side);w*=1/(1+pressure*.20);
      if(through){w*=dx>7?(g==='ST'?5.3:g==='AM'?3.4:.42):.06; if(pressure<4)w*=1.55}
      if(long){w*=dist>25?2.5:.5}
      const pp=playerById(playerNodeId(from)),passQ=Number(pp?.attributes?.passing||pp?.rating||60);w*=.72+passQ/180;
      return{n,w};
    }).filter(x=>x.w>.02);
  }
  function choosePassTarget(from,side,opts={}){
    if(!from)return null;
    const through=Boolean(opts.through),long=Boolean(opts.long),fp=currentXY(from),fg=groupOf(from),dir=attackingDir(side);
    const candidates=sideNodes(side).filter(n=>n!==from&&!isGoalkeeper(n)).map(n=>{
      const p=currentXY(n),g=groupOf(n),dx=(p.x-fp.x)*dir,dy=Math.abs(p.y-fp.y),dist=Math.hypot(p.x-fp.x,p.y-fp.y),pressure=segmentPressure(from,n,side);
      if(!long&&dist>34)return null;
      if(!long&&dy>27)return null;
      if(through&&(dx<7||dist>30))return null;
      let w=.4;
      if(fg==='GK')w=g==='DEF'?8:g==='MID'?1.8:.05;
      else if(fg==='DEF')w=g==='MID'?7:g==='DEF'?2.4:g==='AM'?1.4:g==='ST'?.2:.1;
      else if(fg==='MID')w=g==='AM'?6.4:g==='MID'?3.8:g==='ST'?4.2:g==='DEF'?1.1:.1;
      else if(fg==='AM')w=g==='ST'?7.2:g==='AM'?2.8:g==='MID'?2.2:g==='DEF'?.35:.1;
      else if(fg==='ST')w=g==='AM'?3.4:g==='MID'?1.25:g==='ST'?1.0:.08;
      // Normale Pässe bevorzugen kurze/mittlere Distanzen und leichtes Vorwärtsspiel.
      if(dx>=2&&dx<=22)w*=1.9;else if(dx>22)w*=.78;else if(dx<0)w*=fg==='ST'?.24:.48;
      if(dist>=7&&dist<=25)w*=1.65;else if(dist<5)w*=.5;
      if(dy<15)w*=1.35;
      w*=1/(1+pressure*.28);
      if(through){w*=g==='ST'?4.8:g==='AM'?2.4:.28;w*=dx>=8&&dx<=24?2.1:.35;if(progressFor(n,side)>86)w*=.18;}
      if(long){w*=dist>=24&&dist<=48?2.2:.5;}
      return {n,w};
    }).filter(Boolean).filter(x=>x.w>.04);
    return weightedPick(candidates,x=>x.w)?.n||chooseRole(side,['MID','AM','ST'],[from]);
  }


  function animatePass(from,to,{through=false,long=false,label=''}={}){
    if(!from||!to)return 0;const side=sideOf(from),scale=tempoScale(),fp=actualXY(from),dist0=Math.hypot(actualXY(to).x-fp.x,actualXY(to).y-fp.y);actionBusyUntil=performance.now()+2600*scale;
    clearActive();from.classList.add('active');setBallAtNode(from);setLocked(from,1350*scale);setLocked(to,2300*scale);setAttackLabel(side,through?'STEILPASS':long?'SEITENWECHSEL':'ANGRIFF');
    let lead=0;
    const support=sideNodes(side).filter(n=>n!==from&&n!==to&&!isGoalkeeper(n)).sort((a,b)=>Math.hypot(currentXY(a).x-fp.x,currentXY(a).y-fp.y)-Math.hypot(currentXY(b).x-fp.x,currentXY(b).y-fp.y)).slice(0,3);
    support.forEach((n,i)=>{if(isLocked(n))return;const p=currentXY(n),dir=attackingDir(side);if(groupOf(n)==='ST'||groupOf(n)==='AM')runTo(n,p.x+dir*(1.2+Math.random()*4.4),p.y+(Math.random()-.5)*8,1150*scale+i*18,'runner');else runTo(n,p.x+dir*(0.6+Math.random()*2.2),p.y+(Math.random()-.5)*4.2,980*scale+i*14,'runner')});
    if(through){const lane=(Math.random()-.5)*9;runIntoSpace(to,side,12+Math.random()*11,lane,1750*scale);showScene(`${playerLabel(from)} spielt steil in den Lauf von ${playerLabel(to)}`);showAction('STEILPASS',`${playerLabel(from)} → ${playerLabel(to)}`,'in den freien Raum',side,1900*scale);lead=280*scale}
    else if(long){runIntoSpace(to,side,5+Math.random()*7,(Math.random()-.5)*8,1580*scale);showScene(`${playerLabel(from)} verlagert auf ${playerLabel(to)}`);showAction('SEITENWECHSEL',`${playerLabel(from)} → ${playerLabel(to)}`,'Verlagerung',side,1800*scale);lead=180*scale}
    else {if(groupOf(to)==='ST'||groupOf(to)==='AM')runIntoSpace(to,side,2+Math.random()*4,(Math.random()-.5)*5,1180*scale);showScene(label||`${playerLabel(from)} findet ${playerLabel(to)}`);showAction('PASS',`${playerLabel(from)} → ${playerLabel(to)}`,'Kurzpass',side,850*scale)}
    const duration=clamp(900+dist0*24+(long?420:0)+(through?170:0),980,2500)*scale;
    later(()=>{const start=actualXY(from);flyBall(start,()=>actualXY(to),duration,{air:long||through,kind:through?'through':long?'long':'pass',onDone:()=>{if(ended)return;from.classList.remove('active');to.classList.add('active','receiving');setBallAtNode(to);showScene(`${playerLabel(to)} nimmt den Ball mit`);nextAmbientAction=Math.min(nextAmbientAction,simSecond+4+Math.random()*3);later(()=>to.classList.remove('active','receiving'),650*scale)}})},lead);
    return duration+lead;
  }

  function dribble(node,side,aggressive=false){
    if(!node)return 0;const scale=tempoScale(),p=actualXY(node),dir=attackingDir(side),opp=nearestOpp(node),dist=(aggressive?8:5)+Math.random()*(aggressive?7:4),lane=(Math.random()-.5)*(aggressive?8:5);actionBusyUntil=performance.now()+2100*scale;
    node.classList.add('active','runner');setLocked(node,1850*scale);setBallAtNode(node);setAttackLabel(side,'DRIBBLING');showScene(`${playerLabel(node)} ${aggressive?'geht ins Eins-gegen-Eins':'trägt den Ball'}`);showAction('DRIBBLING',playerLabel(node),aggressive?'zieht mit Tempo am Gegenspieler vorbei':'treibt den Ball nach vorne',side,1650*scale);
    const step1={x:p.x+dir*(dist*.42),y:p.y+lane*.38},step2={x:p.x+dir*dist,y:p.y+lane};
    runTo(node,step1.x,step1.y,760*scale,'runner');later(()=>runTo(node,step2.x,step2.y,980*scale,'runner'),720*scale);
    let duelLoss=false;if(opp&&Math.hypot(actualXY(opp).x-p.x,actualXY(opp).y-p.y)<19){runTo(opp,p.x+dir*(dist*.56),p.y+lane*.54,1420*scale,'duel');const ap=playerById(playerNodeId(node)),dp=playerById(playerNodeId(opp)),atk=Number(ap?.attributes?.dribbling||ap?.rating||60)+Number(ap?.attributes?.pace||60)*.28,def=Number(dp?.attributes?.defending||dp?.rating||60)+Number(dp?.attributes?.physical||60)*.24;duelLoss=Math.random()<clamp(.31+(def-atk)/120,.12,.60)}
    later(()=>{if(duelLoss&&opp){possessionSide=sideOf(opp);setBallAtNode(opp);flashPossession(possessionSide,opp);showScene(`${playerLabel(opp)} stoppt das Dribbling`)}else {setBallAtNode(node);nextAmbientAction=Math.min(nextAmbientAction,simSecond+3+Math.random()*3)}},1420*scale);later(()=>node.classList.remove('active'),1780*scale);return 1850*scale;
  }

  function turnover(from,opp){
    if(!from||!opp)return;const scale=tempoScale();from.classList.add('duel');opp.classList.add('duel','active');setLocked(from,1050*scale);setLocked(opp,1050*scale);showScene(`${playerLabel(opp)} gewinnt den Ball gegen ${playerLabel(from)}`);showAction('BALLGEWINN',playerLabel(opp),`gewinnt das Duell gegen ${playerLabel(from)}`,sideOf(opp),1350*scale);pushAmbientTicker(sideOf(opp),`BALLGEWINN ${teamLabel(sideOf(opp))}`,`${playerLabel(opp)} erobert den Ball`,'↔');later(()=>{possessionSide=sideOf(opp);setBallAtNode(opp);flashPossession(possessionSide,opp);from.classList.remove('duel');opp.classList.remove('duel','active')},720*scale)
  }

  function arrangeKickoff(side,label='Anstoß'){
    const scale=tempoScale(),other=side==='home'?'away':'home',dir=attackingDir(side),attack=chooseRole(side,['ST'])||chooseRole(side,['AM']),mate=chooseRole(side,['AM','MID'],[attack]);
    restartLock=true;cinematicUntil=performance.now()+2900*scale;possessionSide=side;clearActive();setAttackLabel(side,'ANSTOSS');showSetpiece(label);showScene(`⚽ ${label} für ${teamLabel(side)}`,true);pushAmbientTicker(side,label.toUpperCase(),`${teamLabel(side)} eröffnet die Partie`,'📣',{force:true});
    sideNodes(side).forEach((n,i)=>{const b=baseXY(n);let x=b.x,y=b.y;if(!isGoalkeeper(n))x=side==='home'?Math.min(x,48):Math.max(x,52);setNodeXY(n,x,y);setLocked(n,2600*scale)});
    sideNodes(other).forEach(n=>{const b=baseXY(n);let x=b.x;if(!isGoalkeeper(n))x=other==='home'?Math.min(x,46):Math.max(x,54);setNodeXY(n,x,b.y);setLocked(n,2600*scale)});
    if(attack){runTo(attack,50-dir*1.2,49,700*scale,'active');setBallXY(50,50);currentBallPlayerId=playerNodeId(attack)}
    if(mate)runTo(mate,50+dir*2.1,55,700*scale,'runner');
    later(()=>{if(attack&&mate)animatePass(attack,mate,{label:`${playerLabel(attack)} eröffnet die Partie`})},1050*scale);
    later(()=>{restartLock=false;updateDynamicShape(true);nextAmbientAction=simSecond+32},2750*scale);
  }

  function arrangeCorner(side,e){
    const scale=tempoScale(),other=side==='home'?'away':'home',dir=attackingDir(side),taker=nodeFor(e?.playerId)||chooseRole(side,['AM','MID']),gk=keeper(other);
    const aerial=chooseRole(side,['ST','DEF','AM','MID'],[taker])||chooseCarrier(side);if(!taker||!aerial){eventSceneActive=false;return}
    restartLock=true;actionBusyUntil=performance.now()+5000*scale;cinematicUntil=performance.now()+5000*scale;registerVisibleEvent('corner',side,e);clearActive();showSetpiece('ECKE');showAction('ECKE',playerLabel(taker),`Flanke auf ${playerLabel(aerial)}`,side,1600*scale);showScene(`🚩 Ecke für ${teamLabel(side)}`,true);
    const cornerX=side==='home'?98:2,cornerY=Math.random()<.5?3:97,boxX=side==='home'?87:13,boxY=38+Math.random()*24;
    runTo(taker,cornerX,cornerY,700*scale,'active');setBallXY(cornerX,cornerY);runTo(aerial,boxX,boxY,950*scale,'runner');setLocked(taker,4200*scale);setLocked(aerial,4200*scale);
    roleNodes(side,['ST','AM','DEF']).filter(n=>n!==aerial).slice(0,4).forEach((n,i)=>runTo(n,boxX-dir*(2+i%2*2),30+i*10,950*scale,'runner'));
    roleNodes(other,['DEF','MID']).slice(0,5).forEach((n,i)=>runTo(n,boxX+dir*(1+i%2*2),28+i*10,950*scale,'duel'));if(gk)runTo(gk,side==='home'?96:4,50,650*scale,'active');
    later(()=>{const start=actualXY(taker);flyBall(start,()=>actualXY(aerial),950*scale,{air:true,kind:'long',onDone:()=>setBallAtNode(aerial)});showScene(`${playerLabel(taker)} bringt die Ecke herein`,true)},900*scale);
    later(()=>{showAction('KOPFBALL',playerLabel(aerial),'kommt zum Abschluss',side,1250*scale);const r=Math.random();const kind=r<.12?'goal':r<.56?'save':r<.69?'post':'chance';if(kind==='goal'){
      const goalEvent={id:e?.id?Number(e.id)*1000+17:Date.now(),type:'goal',minute:Math.max(1,Math.floor(simSecond/60)),playerId:playerNodeId(aerial),attackingTeamId:side==='home'?m.homeId:m.awayId,source:'corner'};
      realisticShot(side,aerial,{kind:'goal',keeperNode:gk,event:goalEvent,technique:'header'});later(()=>playGoalAnimation(goalEvent,side,aerial),1750*scale);
    }else realisticShot(side,aerial,{kind,keeperNode:gk,event:e,technique:'header'});
    },2150*scale);
    later(()=>{restartLock=false;eventSceneActive=false;nextAmbientAction=Math.min(nextAmbientAction,simSecond+5)},4700*scale);
  }

  function arrangeFreeKick(side){
    const scale=tempoScale(),other=side==='home'?'away':'home',dir=attackingDir(side),taker=chooseRole(side,['AM','MID','ST']),fouled=chooseRole(side,['AM','MID','ST'],[taker])||taker,fouler=nearestOpp(fouled)||chooseCarrier(other),gk=keeper(other),ballX=side==='home'?70+Math.random()*8:30-Math.random()*8,ballY=30+Math.random()*40,goalX=side==='home'?98:2,outcome=Math.random()<.46?'save':'miss';
    if(!taker)return;restartLock=true;cinematicUntil=performance.now()+5000*scale;clearActive();
    if(fouler&&fouled){registerVisibleEvent('foul',other);showAction('FOUL',playerLabel(fouler),`an ${playerLabel(fouled)}`,other,1500*scale);showScene(`Pfiff – Foul an ${playerLabel(fouled)}`,true);tickerRows.unshift(`<div class="live2d-ticker-row ${other} foul"><b>${Math.max(1,Math.round(simSecond/60))}'</b><span>🛑 Foul von ${playerLabel(fouler)} an ${playerLabel(fouled)}</span></div>`);if(ticker)ticker.innerHTML=tickerRows.slice(0,5).join('')}
    later(()=>{showSetpiece('FREISTOSS');showAction('FREISTOSS',playerLabel(taker),'Mauer steht · Schütze bereit',side,1900*scale);showScene(`🎯 Freistoß für ${teamLabel(side)}`,true)},600*scale);
    runTo(taker,ballX-dir*2,ballY,980*scale,'shooter');setLocked(taker,4700*scale);setBallXY(ballX,ballY);
    const wall=roleNodes(other,['DEF','MID']).slice(0,4);wall.forEach((n,i)=>{runTo(n,ballX+dir*7,ballY-7+i*4.6,980*scale,'wall');setLocked(n,4100*scale)});if(gk)runTo(gk,side==='home'?96:4,50,760*scale,'active');
    later(()=>{showAction('ANLAUF',playerLabel(taker),'Freistoß wird ausgeführt',side,1250*scale);showScene(`${playerLabel(taker)} läuft an…`,true)},1760*scale);
    later(()=>{registerVisibleEvent(outcome==='save'?'save':'chance',side);showAction('SCHUSS',playerLabel(taker),outcome==='save'?'aufs Tor':'knapp vorbei',side,1800*scale);ballInFlight=true;const gy=outcome==='save'?45+Math.random()*10:(Math.random()<.5?28:72);setBallXY((ballX+goalX)/2,ballY+(50-ballY)*.42-7,true);later(()=>setBallXY(goalX,gy,true),780*scale)},2520*scale);
    later(()=>{showScene(outcome==='save'?'🧤 Der Torwart ist zur Stelle':'↗ Der Ball geht knapp vorbei');restartLock=false;ballInFlight=false;possessionSide=other;const c=keeper(other)||chooseCarrier(other);if(c)setBallAtNode(c);nextAmbientAction=Math.min(nextAmbientAction,simSecond+4)},4200*scale);
  }

  function playGoalAnimation(e,side,shooter){
    const other=side==='home'?'away':'home',scale=tempoScale();
    const eventId=Number(e?.id||0);if(eventId&&visibleGoalEventIds.has(eventId))return;if(eventId)visibleGoalEventIds.add(eventId);
    if(side==='home')visibleHomeGoals++; else visibleAwayGoals++;
    if(score)score.textContent=`${visibleHomeGoals} : ${visibleAwayGoals}`;
    if(goalName)goalName.textContent=playerLabel(shooter);
    if(goalFlash){goalFlash.className=`live2d-goalflash show ${side}`;clearTimeout(goalTimer);goalTimer=setTimeout(()=>goalFlash.classList.remove('show'),2300*scale)}
    showAction('TOR!',playerLabel(shooter),`${teamLabel(side)} geht auf ${visibleHomeGoals}:${visibleAwayGoals}`,side,2400*scale);
    showScene(`⚽ TOR! ${playerLabel(shooter)}`,true);
    registerVisibleEvent('goal',side,e);
    const ge={...e,type:'goal',minute:Math.max(1,Number(e?.minute||Math.floor(simSecond/60))),attackingTeamId:side==='home'?m.homeId:m.awayId};
    if(!m.events.some(ev=>Number(ev.id||0)===Number(ge.id||0)&&['goal','penalty'].includes(ev.type)))m.events.push(ge);
    {const title=liveTickerDisplayTitle(ge,m);tickerRows.unshift(liveSimTickerRow(ge,title,side));if(ticker)ticker.innerHTML=tickerRows.slice(0,6).join('')}
    actionBusyUntil=performance.now()+2600*scale;eventSceneUntil=performance.now()+3000*scale;
  }

  function arrangePenalty(side,e,scored=true){
    const scale=tempoScale(),other=side==='home'?'away':'home',dir=attackingDir(side),shooter=nodeFor(e?.playerId)||chooseRole(side,['ST','AM']),gk=keeper(other),spotX=side==='home'?88.5:11.5,goalX=side==='home'?98.5:1.5;
    if(!shooter)return;restartLock=true;cinematicUntil=performance.now()+5200*scale;if(!scored)registerVisibleEvent('missedPenalty',side,e);clearActive();showSetpiece('ELFMETER');showAction('ELFMETER',playerLabel(shooter),'tritt an',side,2100*scale);showScene(`⚽ Elfmeter · ${playerLabel(shooter)}`,true);runTo(shooter,spotX-dir*3,50,900*scale,'shooter');setLocked(shooter,5000*scale);setBallXY(spotX,50);if(gk){runTo(gk,side==='home'?96.2:3.8,50,700*scale,'active');setLocked(gk,5000*scale)}
    [...sideNodes(side),...sideNodes(other)].filter(n=>n!==shooter&&n!==gk).forEach((n,i)=>{const p=currentXY(n);runTo(n,side==='home'?75:25,28+(i%8)*6.2,900*scale,'runner')});
    later(()=>showScene(`${playerLabel(shooter)} läuft an…`,true),1600*scale);
    later(()=>{const gy=36+Math.random()*28;ballInFlight=true;setBallXY(goalX,gy,false);if(gk)runTo(gk,side==='home'?95.5:4.5,gy,520*scale,'runner')},2500*scale);
    later(()=>{if(scored){playGoalAnimation({...e,type:'goal'},side,shooter)}else showScene('❌ Elfmeter vergeben!',true)},3150*scale);
    later(()=>{restartLock=false;ballInFlight=false;if(!scored){possessionSide=other;const c=gk||chooseCarrier(other);if(c)setBallAtNode(c)}},4700*scale);
  }

  function realisticShot(side,shooter,{kind='chance',keeperNode=null,event=null,technique='auto'}={}){
    const scale=tempoScale(),goalX=side==='home'?98.5:1.5,gk=keeperNode||keeper(side==='home'?'away':'home');actionBusyUntil=performance.now()+3900*scale;if(kind!=='goal')registerVisibleEvent(kind==='save'?'save':kind==='post'?'post':'chance',side,event);
    if(!shooter)return;const sp=actualXY(shooter),shootX=side==='home'?clamp(Math.max(sp.x,70),70,88):clamp(Math.min(sp.x,30),12,30),shootY=clamp(sp.y,18,82),distance=Math.round(Math.abs((side==='home'?100-shootX:shootX))*1.05);
    runTo(shooter,shootX,shootY,780*scale,'shooter');setLocked(shooter,3900*scale);setBallAtNode(shooter);setAttackLabel(side,'ABSCHLUSS');
    const shotType=technique==='header'?'KOPFBALL':technique==='distance'?'DISTANZSCHUSS':distance>24?'DISTANZSCHUSS':Math.random()<.23?'FLACHSCHUSS':'ABSCHLUSS';showAction(shotType,playerLabel(shooter),`${distance} m`,side,1900*scale);showScene(`${playerLabel(shooter)} zieht ab`,true);if(!event&&kind!=='goal'){const faux={type:kind==='save'?'save':kind==='post'?'post':'chance',minute:Math.max(1,Math.floor(simSecond/60)),playerId:Number(shooter.dataset.livePlayer||0),shotById:Number(shooter.dataset.livePlayer||0)};tickerRows.unshift(liveSimTickerRow(faux,`🔥 CHANCE · ${playerById(Number(shooter.dataset.livePlayer||0))?.name||playerLabel(shooter)}`,side));if(ticker)ticker.innerHTML=tickerRows.slice(0,6).join('')}
    later(()=>{
      const start=actualXY(shooter),onTargetY=40+Math.random()*20,wideY=Math.random()<.5?(18+Math.random()*10):(72+Math.random()*10),postY=Math.random()<.5?37:63;
      const end=kind==='chance'?{x:goalX+(side==='home'?1.7:-1.7),y:wideY}:kind==='post'?{x:goalX,y:postY}:{x:goalX,y:onTargetY};
      if(gk&&kind!=='chance'){const gkp=actualXY(gk);runTo(gk,side==='home'?96:4,onTargetY,700*scale,'runner');showScene(`${playerLabel(gk)} macht sich bereit`,false)}
      flyBall(start,end,850*scale,{air:distance>18,kind:kind==='chance'?'miss':kind==='post'?'post':'shot',onDone:()=>{
        if(kind==='goal'){showScene(`Der Ball ist im Netz`,true)}
        else if(kind==='save'&&gk){later(()=>{const parry=Math.random()<.28;if(parry){registerVisibleEvent('corner',side);showAction('PARADE',playerLabel(gk),`lenkt den Schuss zur Ecke`,side==='home'?'away':'home',2100*scale);showScene(`🧤 ${playerLabel(gk)} pariert zur Ecke`,true);later(()=>arrangeCorner(side,{playerId:playerNodeId(chooseRole(side,['AM','MID'])),attackingTeamId:side==='home'?m.homeId:m.awayId}),900*scale)}else{setBallAtNode(gk);showAction('PARADE',playerLabel(gk),`hält gegen ${playerLabel(shooter)}`,side==='home'?'away':'home',2100*scale);showScene(`🧤 ${playerLabel(gk)} hält den Schuss`,true)}},240*scale)}
        else if(kind==='post'){showAction('ALUMINIUM',playerLabel(shooter),'Pfosten oder Latte',side,2100*scale);showScene(`🥅 Aluminium!`,true)}
        else{showAction('VORBEI',playerLabel(shooter),'der Ball verfehlt das Tor',side,1900*scale);showScene(`↗ ${playerLabel(shooter)} schießt vorbei`,true)}
      }})
    },900*scale);
  }

  function buildAttackToEvent(side,shooter,onReady){
    const scale=tempoScale();
    const first=chooseRole(side,['DEF','MID'],[shooter])||chooseCarrier(side);
    const chain=[first];
    const mid=choosePassTarget(first,side,{});if(mid&&mid!==shooter)chain.push(mid);
    const next=mid?choosePassTarget(mid,side,{through:false}):null;if(next&&next!==shooter&&!chain.includes(next))chain.push(next);
    if(shooter&&!chain.includes(shooter))chain.push(shooter);
    if(!chain.length){onReady?.(0);return}
    setBallAtNode(chain[0]);currentBallPlayerId=playerNodeId(chain[0]);showScene(`${teamLabel(side)} baut den Angriff auf`);
    let i=0,total=0;
    const step=()=>{
      if(i>=chain.length-1){nextAmbientAction=Math.max(nextAmbientAction,simSecond+8);onReady?.(total);return}
      const from=chain[i],to=chain[i+1],last=i===chain.length-2;
      if(!from||!to){i++;step();return}
      const through=last&&['ST','AM'].includes(groupOf(to))&&Math.random()<.58;
      const passMs=animatePass(from,to,{through,long:false});
      total+=passMs;
      const shouldDribble=!last&&['MID','AM','ST'].includes(groupOf(to))&&Math.random()<.30;
      later(()=>{
        if(shouldDribble){const d=dribble(to,side,groupOf(to)==='AM'||groupOf(to)==='ST');total+=d;later(()=>{i++;step()},d+180*scale)}
        else {i++;step()}
      },passMs+180*scale);
    };
    step();
  }


  function oneTwo(side,carrier){
    const scale=tempoScale(),mate=choosePassTarget(carrier,side,{});if(!mate)return 0;
    const dir=attackingDir(side),cp=currentXY(carrier),mp=currentXY(mate);actionBusyUntil=performance.now()+4100*scale;
    showAction('DOPPELPASS',`${playerLabel(carrier)} ↔ ${playerLabel(mate)}`,'schnelle Kombination',side,1900*scale);setAttackLabel(side,'DOPPELPASS');
    const forward=chooseRole(side,['ST','AM'],[carrier,mate])||carrier;
    const first=animatePass(carrier,mate,{});
    later(()=>{runTo(carrier,cp.x+dir*(7+Math.random()*5),cp.y+(Math.random()-.5)*8,1000*scale,'runner');const back=animatePass(mate,carrier,{through:true});later(()=>{setBallAtNode(carrier);nextAmbientAction=Math.min(nextAmbientAction,simSecond+5)},back+180*scale)},first+180*scale);
    return 4000*scale;
  }

  function crossAttack(side,carrier){
    const scale=tempoScale(),dir=attackingDir(side),p=currentXY(carrier),target=chooseRole(side,['ST','AM'],[carrier]),other=side==='home'?'away':'home',gk=keeper(other);if(!target)return 0;
    actionBusyUntil=performance.now()+4700*scale;setAttackLabel(side,'FLANKE');showAction('FLANKE',playerLabel(carrier),`auf ${playerLabel(target)}`,side,1900*scale);
    const wingY=p.y<50?13:87,wingX=side==='home'?82:18;runTo(carrier,wingX,wingY,1000*scale,'runner');
    const tp=currentXY(target),boxX=side==='home'?88:12,boxY=clamp(42+(Math.random()-.5)*26,27,73);runTo(target,boxX,boxY,1250*scale,'runner');
    later(()=>{const start=actualXY(carrier);flyBall(start,()=>actualXY(target),1100*scale,{air:true,kind:'long',onDone:()=>{setBallAtNode(target);showAction('KOPFBALL',playerLabel(target),'steigt zur Flanke hoch',side,1350*scale);showScene(`${playerLabel(target)} köpft`,true);later(()=>realisticShot(side,target,{kind:Math.random()<.52?'save':Math.random()<.18?'post':'chance',keeperNode:gk,technique:'header'}),330*scale)}})},1150*scale);
    return 4550*scale;
  }

  function counterAttack(side,carrier){
    const scale=tempoScale(),dir=attackingDir(side),runner=chooseRole(side,['ST','AM'],[carrier])||choosePassTarget(carrier,side,{through:true});if(!runner)return 0;
    actionBusyUntil=performance.now()+5000*scale;setAttackLabel(side,'KONTER');showAction('KONTER',teamLabel(side),`${playerLabel(carrier)} schaltet schnell um`,side,1900*scale);pushAmbientTicker(side,`KONTER ${teamLabel(side)}`,`${playerLabel(carrier)} treibt den Angriff an`,'⚡',{force:true});
    const p=currentXY(runner);runTo(runner,p.x+dir*(13+Math.random()*8),p.y+(Math.random()-.5)*10,1300*scale,'runner');
    const pass=animatePass(carrier,runner,{through:true});later(()=>{setBallAtNode(runner);const rp=currentXY(runner);if(progressFor(runner,side)>70){later(()=>realisticShot(side,runner,{kind:Math.random()<.48?'save':Math.random()<.16?'post':'chance',keeperNode:keeper(side==='home'?'away':'home')}),500*scale)}else{dribble(runner,side,true)}},pass+240*scale);
    return 4900*scale;
  }

  function reboundChance(side,shooter,gk){
    const scale=tempoScale(),support=chooseRole(side,['ST','AM','MID'],[shooter]);if(!support)return;
    showAction('ABPRALLER',playerLabel(support),'kommt an den zweiten Ball',side,1800*scale);const sp=currentXY(support),dir=attackingDir(side);runTo(support,sp.x+dir*5,sp.y+(Math.random()-.5)*8,800*scale,'runner');later(()=>realisticShot(side,support,{kind:Math.random()<.55?'save':'chance',keeperNode:gk}),850*scale)
  }

  function ambientAttack(){
    if(ended||paused||restartLock||performance.now()<cinematicUntil||performance.now()<actionBusyUntil)return;
    let carrier=nodeFor(currentBallPlayerId);
    if(!carrier||sideOf(carrier)!==possessionSide){carrier=chooseCarrier(possessionSide);if(carrier)setBallAtNode(carrier)}
    if(!carrier)return;
    const side=possessionSide,g=groupOf(carrier),progress=progressFor(carrier,side),profile=profiles[side],r=Math.random(),wide=Math.abs(currentXY(carrier).y-50)>25;
    updateDynamicShape(true);

    // Letzte Zone: Abschluss, Flanke oder Distanzschuss – nicht endlos festmachen und zurückspielen.
    if(progress>68&&['ST','AM','MID'].includes(g)){
      const keeperNode=keeper(side==='home'?'away':'home');
      if(wide&&Math.random()<.58){crossAttack(side,carrier);nextAmbientAction=simSecond+32+Math.random()*18;return}
      if(g==='ST'){
        const roll=Math.random();
        if(roll<.72){let outcome=roll<.39?'save':roll<.52?'post':'chance';realisticShot(side,carrier,{kind:outcome,keeperNode});possessionSide=side==='home'?'away':'home';later(()=>{const c=keeper(possessionSide)||chooseCarrier(possessionSide);if(c&&!ballInFlight)setBallAtNode(c)},2800*tempoScale());nextAmbientAction=simSecond+34+Math.random()*18;return}
        if(roll<.86){oneTwo(side,carrier);nextAmbientAction=simSecond+25+Math.random()*15;return}
        dribble(carrier,side,true);nextAmbientAction=simSecond+22+Math.random()*12;return;
      }
      if(['AM','MID'].includes(g)&&progress>58&&Math.random()<.28){const outcome=Math.random()<.48?'save':Math.random()<.18?'post':'chance';realisticShot(side,carrier,{kind:outcome,keeperNode,technique:'distance'});possessionSide=side==='home'?'away':'home';later(()=>{const c=keeper(possessionSide)||chooseCarrier(possessionSide);if(c&&!ballInFlight)setBallAtNode(c)},2800*tempoScale());nextAmbientAction=simSecond+34+Math.random()*18;return}
      if(Math.random()<.20){oneTwo(side,carrier);nextAmbientAction=simSecond+26+Math.random()*14;return}
      const outcome=Math.random()<.46?'save':Math.random()<.16?'post':'chance';realisticShot(side,carrier,{kind:outcome,keeperNode});possessionSide=side==='home'?'away':'home';later(()=>{const c=keeper(possessionSide)||chooseCarrier(possessionSide);if(c&&!ballInFlight)setBallAtNode(c)},2800*tempoScale());nextAmbientAction=simSecond+36+Math.random()*18;return;
    }

    // Ball recovery in own/middle third can create a counter.
    if(progress<58&&['MID','AM','ST'].includes(g)&&Math.random()<.13){counterAttack(side,carrier);nextAmbientAction=simSecond+44+Math.random()*20;return}
    if(progress>=54&&progress<=68&&['MID','AM'].includes(g)&&Math.random()<.12){realisticShot(side,carrier,{kind:Math.random()<.52?'save':'chance',keeperNode:keeper(side==='home'?'away':'home'),technique:'distance'});nextAmbientAction=simSecond+34+Math.random()*18;return}
    if(g==='GK'){
      const to=choosePassTarget(carrier,side,{});if(to)animatePass(carrier,to,{label:`${playerLabel(carrier)} eröffnet kurz`});
    } else if(progress>60&&wide&&Math.random()<.20){
      crossAttack(side,carrier);
    } else if(progress>58&&['AM','ST'].includes(g)&&r<.20){
      dribble(carrier,side,true);
    } else if(r<.25){
      dribble(carrier,side,g==='AM'||g==='ST');
    } else if(r<.36&&['MID','AM','ST'].includes(g)){
      oneTwo(side,carrier);
    } else if(r<.63){
      const to=choosePassTarget(carrier,side,{through:progress>52});if(to)animatePass(carrier,to,{through:progress>52&&['AM','ST'].includes(groupOf(to))});
    } else if(r<.96){
      const to=choosePassTarget(carrier,side,{});if(to)animatePass(carrier,to,{});
    } else {
      const opp=nearestOpp(carrier);if(opp)turnover(carrier,opp);
    }
    nextAmbientAction=simSecond+32+Math.random()*18;
  }

  function liveStatAt(currentMinute){refreshRuntimeStats()}

  function guaranteedGoalSequence(side,e){
    const scale=tempoScale(),other=side==='home'?'away':'home',dir=attackingDir(side),source=e?.source||'open';
    const shooter=nodeFor(e?.playerId)||chooseRole(side,source==='distance'?['MID','AM']:['ST','AM','MID','DEF']);
    const gk=keeper(other);if(!shooter){eventSceneActive=false;return}
    restartLock=true;actionBusyUntil=performance.now()+5200*scale;cinematicUntil=performance.now()+5200*scale;clearActive();
    const goalX=side==='home'?98.6:1.4,goalY=42+Math.random()*16;
    if(source==='corner'){
      const taker=chooseRole(side,['AM','MID'],[shooter])||chooseRole(side,['MID'],[shooter]);
      const cornerY=Math.random()<.5?3:97,cornerX=side==='home'?98:2,boxX=side==='home'?87:13;
      registerVisibleEvent('corner',side,e);showSetpiece('ECKBALL');showAction('ECKE',teamLabel(side),`${playerLabel(taker)} auf ${playerLabel(shooter)}`,side,1700*scale);
      if(taker){runTo(taker,cornerX,cornerY,650*scale,'active');setBallXY(cornerX,cornerY)}
      runTo(shooter,boxX,42+Math.random()*18,900*scale,'runner');if(gk)runTo(gk,side==='home'?96:4,50,600*scale,'active');
      later(()=>{const start=taker?actualXY(taker):{x:cornerX,y:cornerY};flyBall(start,()=>actualXY(shooter),900*scale,{air:true,kind:'long',onDone:()=>setBallAtNode(shooter)});showScene(`${playerLabel(taker)} flankt in den Strafraum`,true)},850*scale);
      later(()=>{showAction('KOPFBALL',playerLabel(shooter),'auf das Tor',side,1200*scale);const start=actualXY(shooter);flyBall(start,{x:goalX,y:goalY},650*scale,{air:true,kind:'shot',onDone:()=>{playGoalAnimation(e,side,shooter)}})},2050*scale);
      later(()=>{arrangeKickoff(other,'Wiederanstoß');restartLock=false;eventSceneActive=false},4300*scale);return;
    }
    const sx=source==='distance'?(side==='home'?69:31):(side==='home'?83:17),sy=34+Math.random()*32;
    const provider=chooseRole(side,['MID','AM'],[shooter]);
    if(provider){const px=source==='distance'?(side==='home'?54:46):(side==='home'?67:33);runTo(provider,px,sy+(Math.random()-.5)*14,650*scale,'active');setBallAtNode(provider);runTo(shooter,sx,sy,900*scale,'runner');
      later(()=>animatePass(provider,shooter,{through:source!=='distance'}),500*scale);
    }else{runTo(shooter,sx,sy,750*scale,'active');setBallAtNode(shooter)}
    if(gk)runTo(gk,side==='home'?96:4,50,650*scale,'active');
    later(()=>{setBallAtNode(shooter);showAction(source==='distance'?'DISTANZSCHUSS':'ABSCHLUSS',playerLabel(shooter),'zieht ab',side,1400*scale);showScene(`${playerLabel(shooter)} schießt`,true);const start=actualXY(shooter);flyBall(start,{x:goalX,y:goalY},720*scale,{air:source==='distance',kind:'shot',onDone:()=>playGoalAnimation(e,side,shooter)})},source==='distance'?1500*scale:1750*scale);
    later(()=>{arrangeKickoff(other,'Wiederanstoß');restartLock=false;eventSceneActive=false},4300*scale);
  }

  function applyLiveLineupSide(side,ids){
    const nodes=sideNodes(side).slice().sort((a,b)=>slotOf(a)-slotOf(b));
    const t=side==='home'?h:a;
    nodes.forEach((node,i)=>{
      const pid=Number(ids[i]||0),p=playerById(pid);if(!p)return;
      node.dataset.livePlayer=String(pid);node.classList.remove('sent-off');
      const dot=node.querySelector('.live2d-dot'),label=node.querySelector('small');
      if(dot)dot.textContent=String(p.shirtNumber||p.number||i+1).slice(0,2);
      if(label)label.textContent=liveSimPlayerLabel(p);
    });
    const benchKey=side==='home'?'homeBench':'awayBench';
    m.lineups[side]=ids.map(Number);m.lineups[benchKey]=fullBenchIds(t,m.lineups[side],m.lineups[benchKey]);
  }
  function remapFutureEventsAfterHalftime(){
    const current={home:new Set(m.lineups.home||[]),away:new Set(m.lineups.away||[])};
    const chooseFor=(side,type)=>{
      const ids=side==='home'?m.lineups.home:m.lineups.away,players=(ids||[]).map(playerById).filter(Boolean);
      if(!players.length)return null;
      if(['goal','penalty','chance','post'].includes(type))return weightedPick(players,p=>{const g=playerPositionGroup(p);return g==='ST'?4:g==='AM'?3:g==='MID'?1.8:.55});
      if(type==='save')return players.find(p=>String(p.position||'').toUpperCase().includes('TW'))||players[0];
      if(type==='corner'||type==='freeKick')return weightedPick(players,p=>['AM','MID'].includes(playerPositionGroup(p))?3:.45);
      return weightedPick(players,()=>1);
    };
    const remap=e=>{if(Number(e.minute||0)<=45)return;let side=liveSimTeamSideForPlayer(m,e.playerId)||eventAttackSide(e);if(!side)side=e.attackingTeamId===m.homeId?'home':'away';if(side&&e.playerId&&!current[side].has(Number(e.playerId))){const p=chooseFor(side,e.type);if(p)e.playerId=p.id}if(side&&e.assistId&&!current[side].has(Number(e.assistId))){const p=chooseFor(side,'assist');if(p&&p.id!==e.playerId)e.assistId=p.id}if(side&&e.shotById&&!current[side].has(Number(e.shotById))){const p=chooseFor(side,'chance');if(p)e.shotById=p.id}};
    (m.events||[]).forEach(remap);events.forEach(remap);
  }
  function openHalftimeLineupEditor(){
    if(!halftimePanel)return;paused=true;syncPauseLabels();ensureSimulationLineups(m);
    let tempHome=[...(m.lineups.home||[])].slice(0,11),tempAway=[...(m.lineups.away||[])].slice(0,11);
    const draw=()=>{
      const editor=(side,t,ids)=>{const used=new Set(ids.map(Number)),rest=sortPlayersByPosition((t.players||[]).filter(p=>!used.has(Number(p.id))));return `<section class="halftime-team tactical-halftime-team"><div class="halftime-team-head">${badge(t)}<div><b>${t.name}</b><span>Startelf 2. Halbzeit · ziehen</span></div></div>${tacticalPitchMarkup(ids,`half-${side}`,m.lineups?.[`${side}Formation`]||t.defaultFormation||'4-3-3')}<div class="compact-squad"><div class="compact-squad-title"><b>Bank / Kader</b><span>${rest.length}</span></div><div class="compact-squad-list">${rest.map(p=>`<button type="button" class="compact-squad-card" draggable="true" data-half-player="${p.id}" data-half-side="${side}"><b>${p.shirtNumber||'–'}</b><span>${p.name}<small>${p.position||'SP'}</small></span></button>`).join('')}</div></div></section>`};
      halftimePanel.hidden=false;halftimePanel.innerHTML=`<div class="halftime-sheet tactical-halftime-sheet"><div class="halftime-head"><div><small>45:00 · HALBZEIT</small><h3>Aufstellung ändern</h3><p>Ziehe Spieler auf die gewünschte Position.</p></div></div><div class="halftime-grid">${editor('home',h,tempHome)}${editor('away',a,tempAway)}</div><div class="halftime-actions"><button class="btn secondary" id="halftimeContinue">Ohne Änderung weiter</button><button class="btn primary" id="halftimeSave">Änderungen übernehmen</button></div></div>`;
      const bindHalf=(side,arrRef)=>{
        let drag=null,touch=null;
        const commit=(pid,idx)=>{const arr=side==='home'?tempHome:tempAway,old=arr.indexOf(Number(pid)),disp=arr[idx];if(old>=0&&old!==idx)arr[old]=disp;arr[idx]=Number(pid);draw()};
        halftimePanel.querySelectorAll(`[data-half-side="${side}"]`).forEach(card=>{card.ondragstart=e=>{drag={pid:Number(card.dataset.halfPlayer)};e.dataTransfer.setData('text/plain',JSON.stringify(drag));card.classList.add('is-dragging')};card.ondragend=()=>card.classList.remove('is-dragging');card.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;touch={pid:Number(card.dataset.halfPlayer),card,x:e.clientX,y:e.clientY,moved:false};card.setPointerCapture?.(e.pointerId)});card.addEventListener('pointermove',e=>{if(touch&&Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>9){touch.moved=true;touch.card.classList.add('is-dragging')}});card.addEventListener('pointerup',e=>{if(!touch)return;const z=document.elementFromPoint(e.clientX,e.clientY)?.closest?.(`[data-lineup-slot="half-${side}"]`);touch.card.classList.remove('is-dragging');if(touch.moved&&z)commit(touch.pid,Number(z.dataset.lineupIndex));touch=null})});
        halftimePanel.querySelectorAll(`[data-lineup-slot="half-${side}"]`).forEach(z=>{const existing=z.querySelector('[data-lineup-player]');if(existing){existing.dataset.halfPlayer=existing.dataset.lineupPlayer;existing.dataset.halfSide=side;}z.ondragover=e=>{e.preventDefault();z.classList.add('drag-over')};z.ondragleave=()=>z.classList.remove('drag-over');z.ondrop=e=>{e.preventDefault();z.classList.remove('drag-over');let d=drag;try{d=JSON.parse(e.dataTransfer.getData('text/plain'))||d}catch{}if(d)commit(d.pid,Number(z.dataset.lineupIndex))};});
      };
      bindHalf('home',tempHome);bindHalf('away',tempAway);
      const closeAndResume=()=>{halftimePanel.hidden=true;halftimePanel.innerHTML='';paused=false;lastFrame=performance.now();syncPauseLabels();arrangeKickoff('away','Anstoß 2. Halbzeit');eventSceneActive=false;};
      el('#halftimeContinue').onclick=closeAndResume;
      el('#halftimeSave').onclick=()=>{if(new Set(tempHome).size!==11||new Set(tempAway).size!==11)return toast('Jedes Team braucht 11 verschiedene Spieler.');applyLiveLineupSide('home',tempHome);applyLiveLineupSide('away',tempAway);remapFutureEventsAfterHalftime();saveState({label:'Halbzeit-Aufstellungen geändert'});closeAndResume();};
    };
    draw();
  }
  function focusEvent(e){
    const side=eventAttackSide(e),other=side==='home'?'away':'home',scale=tempoScale(),title=liveSimEventTitle(e,m);possessionSide=side;restartLock=false;clearActive();updateDynamicShape(true);eventSceneActive=true;
    liveStatAt(Number(e.minute||0));
    if(liveTickerAllowedType(e.type)&&!['goal','penalty'].includes(e.type)){
      const tickerTitle=liveTickerDisplayTitle(e,m);tickerRows.unshift(liveSimTickerRow(e,tickerTitle,side));ticker.innerHTML=tickerRows.slice(0,6).join('');if(tickerPanel){tickerPanel.classList.add('pulse');setTimeout(()=>tickerPanel.classList.remove('pulse'),620)}
    }
    if(['goal','penalty','save','chance','post'].includes(e.type)&&statsPanel){statsPanel.classList.add('pulse');setTimeout(()=>statsPanel.classList.remove('pulse'),620)}
    if(e.type==='halftime'){cinematicUntil=performance.now()+3300*scale;showSetpiece('HALBZEIT');showScene('⏸ Halbzeitpause',true);later(()=>openHalftimeLineupEditor(),700*scale);return}
    if(e.type==='goal'){guaranteedGoalSequence(side,e);return}
    if(e.type==='corner'){arrangeCorner(side,e);later(()=>eventSceneActive=false,5000*scale);return}
    if(e.type==='freeKick'){arrangeFreeKick(side);later(()=>eventSceneActive=false,5200*scale);return}
    if(e.type==='penalty'||e.type==='missedPenalty'){arrangePenalty(side,e,e.type==='penalty');if(e.type==='penalty')later(()=>arrangeKickoff(other,'Wiederanstoß'),5100*scale);later(()=>eventSceneActive=false,5200*scale);return}
    if(['yellow','secondYellow','red','injury'].includes(e.type)){cinematicUntil=performance.now()+2700*scale;pitch?.classList.add('cinematic');later(()=>pitch?.classList.remove('cinematic'),2200*scale);const actor=nodeFor(e.playerId);if(actor){actor.classList.add('active');setLocked(actor,2300*scale);if(['red','secondYellow'].includes(e.type))later(()=>actor.classList.add('sent-off'),1800*scale)}showAction(e.type==='yellow'?'GELBE KARTE':e.type==='red'||e.type==='secondYellow'?'PLATZVERWEIS':'UNTERBRECHUNG',actor?playerLabel(actor):title,'',side,2100*scale);showScene(title,true);later(()=>eventSceneActive=false,2300*scale);return}
    const gk=e.type==='save'?nodeFor(e.playerId):keeper(other),shooter=visualAttacker(side,e.type==='save'?e.shotById:e.playerId);
    cinematicUntil=performance.now()+(e.type==='goal'?7000:5200)*scale;pitch?.classList.add('cinematic');later(()=>pitch?.classList.remove('cinematic'),(e.type==='goal'?6200:4300)*scale);
    buildAttackToEvent(side,shooter,()=>{
      if(!shooter)return;shooter.classList.add('active');
      if(e.type==='save'){realisticShot(side,shooter,{kind:'save',keeperNode:gk,event:e});later(()=>eventSceneActive=false,3600*scale)}
      else if(e.type==='post'){realisticShot(side,shooter,{kind:'post',keeperNode:gk,event:e});later(()=>eventSceneActive=false,3400*scale)}
      else if(e.type==='chance'){realisticShot(side,shooter,{kind:'chance',keeperNode:gk,event:e});later(()=>eventSceneActive=false,3300*scale)}
      else if(e.type==='goal'){
        realisticShot(side,shooter,{kind:'goal',keeperNode:gk,event:e});later(()=>{playGoalAnimation(e,side,shooter)},1900*scale);later(()=>{arrangeKickoff(other,'Wiederanstoß');eventSceneActive=false},4300*scale);
      }else{setBallAtNode(shooter);showScene(title,true);later(()=>eventSceneActive=false,1700*scale)}
    });
    nextAmbientAction=simSecond+50;
  }

  function finish(){
    if(ended)return;ended=true;clearSequenceTimers();if(goalTimer)clearTimeout(goalTimer);cancelAnimationFrame(raf);
    const finalHome=visibleHomeGoals;
    const finalAway=visibleAwayGoals;
    // Nur Tore, die im Live-Spiel tatsächlich sichtbar gefallen sind, bleiben im Spielbericht.
    m.events=(m.events||[]).filter(ev=>!['goal','penalty'].includes(ev.type)||visibleGoalEventIds.has(Number(ev.id||0)));
    m.homeGoals=finalHome;m.awayGoals=finalAway;m.status="played";m.simulated=true;delete m.__livePreview;delete m.__liveFinalHome;delete m.__liveFinalAway;
    const targetPoss=Number(m.statistics?.possessionHome||50);
    m.statistics={
      possessionHome:clamp(Math.round(targetPoss),25,75),possessionAway:100-clamp(Math.round(targetPoss),25,75),
      shotsHome:liveRuntime.shotsHome,shotsAway:liveRuntime.shotsAway,
      shotsOnTargetHome:liveRuntime.sotHome,shotsOnTargetAway:liveRuntime.sotAway,
      bigChancesHome:liveRuntime.bigHome,bigChancesAway:liveRuntime.bigAway,
      cornersHome:liveRuntime.cornersHome,cornersAway:liveRuntime.cornersAway,
      foulsHome:liveRuntime.foulsHome,foulsAway:liveRuntime.foulsAway,
      xgHome:Number(liveRuntime.xgHome.toFixed(2)),xgAway:Number(liveRuntime.xgAway.toFixed(2))
    };
    m.statisticsSource="live-simulation";
    try{rebuildPlayerStats();saveState({label:"Live-Simulation beendet"})}catch(err){console.error("Endstand speichern:",err)}
    clock.textContent='90:00';if(period)period.textContent='ENDE';score.textContent=`${finalHome} : ${finalAway}`;progress.style.width='100%';liveStatAt(90);showScene('🏁 Abpfiff',true);showSetpiece('ABPFIFF');tickerRows.unshift(`<div class="live2d-ticker-row full"><b>90'</b><span>🏁 Abpfiff · ${h.short||h.name} ${finalHome}:${finalAway} ${a.short||a.name}</span></div>`);ticker.innerHTML=tickerRows.slice(0,6).join('');if(tickerPanel){tickerPanel.classList.add('pulse');setTimeout(()=>tickerPanel.classList.remove('pulse'),620)}el('#live2dPause').textContent='✓ Beendet';el('#live2dPause').disabled=true;if(el('#v50PauseBottom')){el('#v50PauseBottom').textContent='SIMULATION BEENDET';el('#v50PauseBottom').disabled=true;}setTimeout(()=>{if(document.querySelector('.live2d-shell')){closeOverlay();openMatch(matchId)}},3300)
  }
  function tick(now){
    if(!shell||!document.body.contains(shell))return;
    const dt=Math.min(.08,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
    try{
      if(!paused&&!ended){
        const advance=dt*simPerReal*speed;
        const nextEvt=eventIndex<events.length?Number(events[eventIndex].__liveSecond||0):Infinity;
        const blocked=eventSceneActive||performance.now()<actionBusyUntil||restartLock;
        // V62: Sobald eine geplante Szene erreicht ist, wartet die Spieluhr auf deren sichtbare Ausführung.
        // Dadurch können Tore/Ecken/Elfmeter nicht mehr unsichtbar übersprungen werden – auch nicht bei 8×.
        if(Number.isFinite(nextEvt)&&nextEvt>=simSecond&&simSecond+advance>=nextEvt)simSecond=nextEvt;
        else if(!(blocked&&Number.isFinite(nextEvt)&&simSecond>=nextEvt))simSecond=Math.min(totalSeconds,simSecond+advance);
        const minute=simSecond/60,whole=Math.floor(minute),sec=Math.floor((minute-whole)*60);
        clock.textContent=`${String(Math.min(90,whole)).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
        progress.style.width=`${(simSecond/totalSeconds)*100}%`;if(period)period.textContent=whole<45?'1. HZ':whole<90?'2. HZ':'ENDE';
        refreshRuntimeStats();updateDynamicShape();if(ballCarrierNode&&!ballInFlight){const bp=actualXY(ballCarrierNode);rawBallXY(bp.x,bp.y,false)}
        if(!eventSceneActive&&performance.now()>=actionBusyUntil&&eventIndex<events.length&&Number(events[eventIndex].__liveSecond||0)<=simSecond){focusEvent(events[eventIndex++])}
        if(simSecond>=nextAmbientAction&&now>=cinematicUntil&&!restartLock&&now>=actionBusyUntil)ambientAttack();
        if(simSecond>=totalSeconds&&eventIndex>=events.length&&!eventSceneActive&&performance.now()>=actionBusyUntil){finish();return;}else if(simSecond>=totalSeconds){simSecond=totalSeconds;}
      }
    }catch(err){console.error('Live simulation recovered from runtime error',err);restartLock=false;cinematicUntil=0;actionBusyUntil=performance.now()+500;}
    if(!ended)raf=requestAnimationFrame(tick);
  }


  const syncPauseLabels=()=>{const top=el('#live2dPause'),bottom=el('#v50PauseBottom');if(top)top.textContent=paused?'▶ Weiter':'⏸ Pause';if(bottom)bottom.textContent=paused?'SIMULATION PAUSIERT':'SIMULATION LÄUFT'};
  const togglePause=()=>{if(ended)return;paused=!paused;syncPauseLabels();lastFrame=performance.now()};
  const cycleSpeed=()=>{speed=speed===1?2:speed===2?4:speed===4?8:1;const label=`${speed}×`;if(el('#live2dSpeed'))el('#live2dSpeed').textContent=`${label}⌄`;if(el('#v50SpeedBottom'))el('#v50SpeedBottom').innerHTML=`GESCHWINDIGKEIT<br><b>${label.toUpperCase()}⌄</b>`;setTempo()};
  el('#live2dPause').onclick=togglePause;el('#v50PauseBottom').onclick=togglePause;el('#live2dSpeed').onclick=cycleSpeed;el('#v50SpeedBottom').onclick=cycleSpeed;
  el('#v50Camera').onclick=()=>{pitch.classList.toggle('camera-zoom');showAction('KAMERA','Broadcast-Ansicht',pitch.classList.contains('camera-zoom')?'Nahaufnahme aktiviert':'Standardansicht','home',1300)};
  el('#v50Kickoff').onclick=()=>arrangeKickoff(possessionSide,'Anstoß');
  el('#v50Corner').onclick=()=>arrangeCorner(possessionSide,{playerId:playerNodeId(chooseRole(possessionSide,['AM','MID']))});
  el('#v50FreeKick').onclick=()=>arrangeFreeKick(possessionSide);
  el('#v50Penalty').onclick=()=>arrangePenalty(possessionSide,{playerId:playerNodeId(chooseRole(possessionSide,['ST','AM']))},Math.random()<.76);
  el('#v50Tactics').onclick=()=>showAction('TAKTIK',teamLabel(possessionSide),'Formation und Pressing angepasst',possessionSide,1600);
  el('#v50Gear').onclick=()=>showAction('EINSTELLUNGEN','Match-Ansicht','Geschwindigkeit und Kamera unten steuerbar','home',1500);
  el('#live2dClose').onclick=()=>{clearSequenceTimers();if(goalTimer)clearTimeout(goalTimer);cancelAnimationFrame(raf);closeOverlay();openMatch(matchId)};
  setTempo();arrangeKickoff(possessionSide,'Anstoß');raf=requestAnimationFrame(tick);
}

const TACTICAL_FORMATIONS=['4-3-3','4-2-3-1','4-4-2','3-5-2','3-4-3','5-3-2'];
function lineupFormation(m,side){
  const t=team(side==='home'?m.homeId:m.awayId);
  return m.lineups?.[`${side}Formation`]||t?.defaultFormation||'4-3-3';
}
function formationSelectMarkup(value,side){
  return `<label class="formation-control"><span>Formation</span><select data-lineup-formation="${side}">${TACTICAL_FORMATIONS.map(f=>`<option value="${f}" ${f===value?'selected':''}>${f}</option>`).join('')}</select></label>`;
}
function lineupSlotMarkup(p,side,index,slot){
  const [label,x,y]=slot||['SP',50,50];
  return `<button type="button" class="tactical-slot ${p?'filled':''}" data-lineup-slot="${side}" data-lineup-index="${index}" data-slot-label="${label}" style="left:${x}%;top:${y}%">
    ${p?`<span class="tactical-player" draggable="true" data-lineup-player="${p.id}" data-player-side="${side}"><b>${p.shirtNumber||'–'}</b><small>${p.name}</small><em>${p.position||'SP'} · ${label}</em></span>`:`<span class="slot-plus">+</span><small>${label}</small>`}
  </button>`;
}
function tacticalPitchMarkup(ids,side,formation='4-3-3'){
  const slots=formationSlots(formation), list=(ids||[]).slice(0,11);
  const arr=slots.map((slot,i)=>lineupSlotMarkup(playerById(list[i]),side,i,slot)).join('');
  return `<div class="tactical-pitch" data-lineup-pitch="${side}" data-formation="${formation}"><div class="pitch-box left"></div><div class="pitch-box right"></div><div class="pitch-center"></div>${arr}</div>`;
}
function compactSquadCard(p,side){
  return `<button type="button" class="compact-squad-card" draggable="true" data-lineup-player="${p.id}" data-player-side="${side}"><b>${p.shirtNumber||'–'}</b><span>${p.name}<small>${p.position||'SP'} · ${Number(p.rating||0).toFixed(1)}</small></span></button>`;
}
function lineupView(m){
  ensureSimulationLineups(m);
  const board=(side,t)=>{
    const ids=(m.lineups?.[side]||[]).slice(0,11), used=new Set(ids.map(Number)), formation=lineupFormation(m,side);
    const rest=sortPlayersByPosition((t.players||[]).filter(p=>!used.has(Number(p.id))));
    return `<section class="card tactical-lineup-board" data-lineup-board="${side}">
      <div class="tactical-lineup-head"><div>${badge(t)}<span><b>${t.name}</b><small>Spieler antippen und Position antippen</small></span></div><strong>${ids.length}/11</strong></div>
      ${formationSelectMarkup(formation,side)}
      ${tacticalPitchMarkup(ids,side,formation)}
      <div class="compact-squad"><div class="compact-squad-title"><b>Bank & Kader</b><span>Antippen oder ziehen</span></div><div class="compact-squad-list">${rest.map(p=>compactSquadCard(p,side)).join('')}</div></div>
    </section>`;
  };
  return `<div class="lineup-instruction tactical-note"><b>Einfach auf dem Handy:</b> Spieler antippen → gewünschte Position antippen. Bankspieler ersetzen dabei direkt den Feldspieler.</div><div class="grid tactical-lineup-grid">${board('home',team(m.homeId))}${board('away',team(m.awayId))}</div>`;
}
function lineupPlayerCard(p,side){return compactSquadCard(p,side)}
function setLineupSlot(m,side,pid,index){
  ensureSimulationLineups(m);
  const arr=[...(m.lineups?.[side]||[])];
  while(arr.length<11)arr.push(null);
  const oldIndex=arr.findIndex(id=>Number(id)===Number(pid));
  const displaced=arr[index];
  if(oldIndex>=0&&oldIndex!==index)arr[oldIndex]=displaced;
  arr[index]=Number(pid);
  const clean=[];for(const id of arr){if(id!=null&&!clean.includes(Number(id)))clean.push(Number(id));else if(id==null)clean.push(null)}
  while(clean.length<11)clean.push(null);
  const t=team(side==='home'?m.homeId:m.awayId);
  // Keep empty slots empty while editing; only simulation auto-fill may fill them.
  m.lineups[side]=clean.slice(0,11);
  m.lineups[`${side}Bench`]=fullBenchIds(t,m.lineups[side].filter(Boolean),m.lineups[`${side}Bench`]);
  t.defaultLineup=[...m.lineups[side]].filter(Boolean);t.defaultFormation=lineupFormation(m,side);
  saveState({label:'Aufstellung geändert'});
  if(el('#preMatchLineupBody'))renderPreMatchLineupBody(m);else document.querySelector('[data-tab="lineups"]')?.click();
}
function moveLineupPlayer(m,pid,side,target){
  if(target===side){const arr=m.lineups?.[side]||[],free=arr.findIndex(x=>!x);return setLineupSlot(m,side,pid,free>=0?free:10)}
  const t=team(side==='home'?m.homeId:m.awayId),start=(m.lineups?.[side]||[]).map(id=>Number(id)===Number(pid)?null:id);
  m.lineups[side]=start;m.lineups[`${side}Bench`]=fullBenchIds(t,start.filter(Boolean),m.lineups[`${side}Bench`]);saveState({label:'Aufstellung geändert'});if(el('#preMatchLineupBody'))renderPreMatchLineupBody(m);else document.querySelector('[data-tab="lineups"]')?.click();
}
function bindLineupDrag(m){
  let payload=null,touch=null,selected=null;
  const cards=()=>[...document.querySelectorAll('[data-lineup-player]')];
  const clearSelected=()=>{cards().forEach(c=>c.classList.remove('tap-selected'));selected=null};
  const selectCard=card=>{cards().forEach(c=>c.classList.remove('tap-selected'));selected={pid:Number(card.dataset.lineupPlayer),side:card.dataset.playerSide};card.classList.add('tap-selected')};
  const refreshPayload=card=>({pid:Number(card.dataset.lineupPlayer),side:card.dataset.playerSide});
  cards().forEach(card=>{
    card.ondragstart=e=>{payload=refreshPayload(card);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',JSON.stringify(payload));card.classList.add('is-dragging')};
    card.ondragend=()=>card.classList.remove('is-dragging');
    card.onclick=e=>{e.stopPropagation();selectCard(card)};
    card.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;touch={...refreshPayload(card),card,x:e.clientX,y:e.clientY,moved:false};});
    card.addEventListener('pointermove',e=>{if(!touch||touch.card!==card)return;if(Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>12){touch.moved=true;card.classList.add('is-dragging');const z=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-lineup-slot]');document.querySelectorAll('[data-lineup-slot]').forEach(x=>x.classList.toggle('drag-over',x===z));}});
    card.addEventListener('pointerup',e=>{if(!touch||touch.card!==card)return;const z=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-lineup-slot]');document.querySelectorAll('[data-lineup-slot]').forEach(x=>x.classList.remove('drag-over'));card.classList.remove('is-dragging');if(touch.moved&&z&&z.dataset.lineupSlot===touch.side){setLineupSlot(m,touch.side,touch.pid,Number(z.dataset.lineupIndex));}touch=null;});
  });
  document.querySelectorAll('[data-lineup-slot]').forEach(slot=>{
    slot.onclick=e=>{if(e.target.closest('[data-lineup-player]'))return;if(selected&&selected.side===slot.dataset.lineupSlot){setLineupSlot(m,selected.side,selected.pid,Number(slot.dataset.lineupIndex));clearSelected()}};
    slot.ondragover=e=>{e.preventDefault();slot.classList.add('drag-over')};slot.ondragleave=()=>slot.classList.remove('drag-over');slot.ondrop=e=>{e.preventDefault();slot.classList.remove('drag-over');let p=payload;try{p=JSON.parse(e.dataTransfer.getData('text/plain'))||p}catch{}if(p&&p.side===slot.dataset.lineupSlot)setLineupSlot(m,p.side,p.pid,Number(slot.dataset.lineupIndex));};
  });
  document.querySelectorAll('[data-lineup-formation]').forEach(sel=>sel.onchange=()=>{
    const side=sel.dataset.lineupFormation;m.lineups||={};m.lineups[`${side}Formation`]=sel.value;
    const t=team(side==='home'?m.homeId:m.awayId);if(t)t.defaultFormation=sel.value;saveState({label:'Formation geändert'});
    if(el('#preMatchLineupBody'))renderPreMatchLineupBody(m);else document.querySelector('[data-tab="lineups"]')?.click();
  });
}
function openLineupQuickActions(m,pid,side){
  const p=playerById(pid);
  const start=m.lineups[side]?.includes(pid);
  const bench=m.lineups[`${side}Bench`]?.includes(pid);
  el("#contextMenu").innerHTML=`<div class="quick-menu open">
    <b>${p?.name||"Spieler"}</b>
    <button data-lineup-target="${side}">In die Startelf</button>
    <button data-lineup-target="${side}Bench">Auf die Bank</button>
    <button data-lineup-target="${side}Squad">Aus Aufstellung entfernen</button>
  </div>`;
  document.querySelectorAll("[data-lineup-target]").forEach(btn=>btn.onclick=()=>{
    moveLineupPlayer(m,pid,side,btn.dataset.lineupTarget);
    el("#contextMenu").innerHTML="";
  });
}
function eventsView(m){
  const h=team(m.homeId),a=team(m.awayId);
  const events=[...(m.events||[])].sort((x,y)=>(y.minute+(y.addedTime||0)/100)-(x.minute+(x.addedTime||0)/100));
  const chronological=[...(m.events||[])].sort((x,y)=>(x.minute+(x.addedTime||0)/100)-(y.minute+(y.addedTime||0)/100));
  const scoreAtEvent=new Map();
  let runningHome=0,runningAway=0;
  chronological.forEach(e=>{
    if(isGoalEvent(e)){
      const scoringTeam=eventTeamId(e,m);
      if(scoringTeam===m.homeId)runningHome++;
      if(scoringTeam===m.awayId)runningAway++;
    }
    scoreAtEvent.set(e.id,`${runningHome}:${runningAway}`);
  });
  return `<div class="event-card live-ticker-page">
    <div class="ticker-scoreboard">
      <div class="ticker-team">${badge(h)}<span>${h.short}</span></div>
      <div class="ticker-current-score"><b>${visibleMatchScore(m)}</b><span>${m.status==="played"?"ABPFIFF":m.status==="live"?"LIVE":"SPIELVORBEREITUNG"}</span></div>
      <div class="ticker-team">${badge(a)}<span>${a.short}</span></div>
    </div>
    <div class="section-head ticker-head"><div><h3>Live-Ticker</h3><span class="subtitle">Neueste Meldung oben · ${events.length} Einträge</span></div><button id="addEvent" class="btn primary">+ Tor eintragen</button></div>
    <div class="event-timeline">${events.length?events.map(e=>{
      const et=eventTeam(e,m),player=playerById(e.playerId),assist=e.assistId?playerById(e.assistId):null,out=e.playerOutId?playerById(e.playerOutId):null;
      const goalScore=isGoalEvent(e)?`<span class="event-score">${scoreAtEvent.get(e.id)||""}</span>`:"";
      const text=eventTickerText(e,player,assist,out,et);
      return `<article class="event-item ${et?.id===m.homeId?"home-event":"away-event"} ${isGoalEvent(e)?"goal-event":""}">
        <div class="event-minute">${displayMinute(e)}</div>
        <div class="event-club">${et?badge(et):""}<span>${et?.short||"SPIEL"}</span></div>
        <div class="event-content">
          <div class="event-title-line"><b>${eventLabel(e.type)}</b>${goalScore}</div>
          <strong>${player?.name||eventLabel(e.type)}</strong>
          <p>${text}</p>
        </div>
        <button class="iconbtn event-delete" data-delete-event="${e.id}" aria-label="Ereignis löschen">×</button>
      </article>`;
    }).join(""):`<div class="empty ticker-empty"><b>Noch ist der Ticker leer.</b><span>Trage das erste Ereignis ein und baue den Spielverlauf Minute für Minute auf.</span></div>`}</div>
  </div>`;
}
function eventTickerText(e,player,assist,out,et){
  const name=player?.name||"Ein Spieler",club=et?.short||"das Team";
  const shooter=e.shotById?playerById(e.shotById):null;
  const attackingClub=e.attackingTeamId?team(Number(e.attackingTeamId))?.short:null;
  const texts={
    goal:`${name} trifft für ${club}${assist?` nach Vorlage von ${assist.name}`:""}.`,
    penalty:`${name} verwandelt den Strafstoß sicher für ${club}.`,
    ownGoal:`Bittere Szene: ${name} lenkt den Ball ins eigene Tor.`,
    disallowedGoal:`Der vermeintliche Treffer von ${name} zählt nicht.`,
    missedPenalty:`${name} vergibt die große Chance vom Punkt.`,
    yellow:`${name} sieht nach dem Foul die Gelbe Karte.`,
    secondYellow:`Für ${name} ist die Partie nach Gelb-Rot beendet.`,
    red:`Direkter Platzverweis für ${name}.`,
    sub:`${name} kommt in die Partie${out?` und ersetzt ${out.name}`:""}.`,
    injury:`${name} muss behandelt werden.`,
    chance:`${name} kommt für ${club} gefährlich zum Abschluss.`,
    save:`${name} hält stark${shooter?` gegen den Abschluss von ${shooter.name}`:""}${attackingClub?` (${attackingClub})`:""}.`,
    post:`${name} trifft nur Aluminium.`,
    corner:`Eckball für ${club}, ausgeführt von ${name}.`,
    halftime:`Pause – beide Teams gehen in die Kabine.`,
    fulltime:`Abpfiff – die Partie ist beendet.`
  };
  return texts[e.type]||`${eventLabel(e.type)} für ${club}.`;
}
function eventLabel(type){return ({goal:"⚽ TOR",yellow:"🟨 Gelbe Karte",secondYellow:"🟨🟥 Gelb-Rot",red:"🟥 Rote Karte",sub:"🔁 Wechsel",penalty:"⚽ Elfmeter verwandelt",missedPenalty:"❌ Elfmeter verschossen",ownGoal:"⚽ Eigentor",disallowedGoal:"🚫 Tor aberkannt",injury:"🩹 Verletzung",chance:"🔥 Großchance",save:"🧤 Starke Parade",post:"🥅 Pfosten oder Latte",corner:"🚩 Ecke",halftime:"⏸ Halbzeit",fulltime:"🏁 Abpfiff"})[type]||type}
function displayMinute(e){
  if(e.addedTime&&Number(e.addedTime)>0)return `${e.minute}+${e.addedTime}'`;
  return `${e.minute}'`;
}
function editMatchView(m){
  const allPlayers=[...team(m.homeId).players,...team(m.awayId).players];
  return `<div class="form-grid"><div class="field"><label>Status</label><select id="editStatus"><option value="scheduled" ${m.status==="scheduled"?"selected":""}>Geplant</option><option value="played" ${m.status==="played"?"selected":""}>Beendet</option></select></div>
    <div class="field"><label>Ergebnisquelle</label><select id="editScoreMode"><option value="events" ${m.scoreMode!=="manual"?"selected":""}>Automatisch aus Ereignissen</option><option value="manual" ${m.scoreMode==="manual"?"selected":""}>Manuell eingeben</option></select></div><div class="field"><label>Spieltag</label><input id="editDay" type="number" value="${m.matchday}"></div><div class="field"><label>Datum</label><input id="editDate" type="date" value="${m.date}"></div><div class="field"><label>Uhrzeit</label><input id="editTime" type="time" value="${m.time}"></div><div class="field"><label>Heimtore</label><input id="editHG" type="number" min="0" value="${m.homeGoals}"></div><div class="field"><label>Gasttore</label><input id="editAG" type="number" min="0" value="${m.awayGoals}"></div><div class="field"><label>Zuschauer</label><input id="editAttendance" type="number" value="${m.attendance||0}"></div><div class="field"><label>Schiedsrichter</label><input id="editReferee" value="${m.referee||""}"></div><div class="field"><label>Wetter</label><input id="editWeather" value="${m.weather||""}"></div><div class="field"><label>Man of the Match</label><select id="editMotm"><option value="">Keiner</option>${allPlayers.map(p=>`<option value="${p.id}" ${m.motmPlayerId===p.id?"selected":""}>${p.name}</option>`).join("")}</select></div><div class="field"><label>Notizen</label><textarea id="editNotes">${m.notes||""}</textarea></div></div><div class="actions"><button id="saveMatchEdit" class="btn primary">Speichern</button><button id="deleteMatch" class="btn danger">Löschen</button></div>`;
}
function bindMatchActions(m){
  bindLineupDrag(m);

  document.querySelectorAll("[data-play-chant]").forEach(button=>button.onclick=()=>playCrowdChant(team(Number(button.dataset.playChant))));
  document.querySelectorAll("[data-open-celebration]").forEach(button=>button.onclick=()=>openCelebration(Number(button.dataset.openCelebration)));
  const add=el("#addEvent");if(add)add.onclick=()=>openEventEditor(m.id);
  document.querySelectorAll("[data-delete-event]").forEach(b=>b.onclick=()=>{m.events=m.events.filter(e=>e.id!==Number(b.dataset.deleteEvent));if(m.scoreMode!=="manual")syncMatchScoreFromEvents(m);rebuildPlayerStats();saveState({label:"Ereignis gelöscht"});openMatch(m.id);});
  const sm=el("#saveMatchEdit");if(sm)sm.onclick=()=>{
    const hg=Number(el("#editHG").value),ag=Number(el("#editAG").value);
    if(hg<0||ag<0)return toast("Tore dürfen nicht negativ sein");
    pushUndo("Partie bearbeitet");
    m.status=el("#editStatus").value;
    m.scoreMode=el("#editScoreMode").value;m.matchday=Number(el("#editDay").value);m.date=el("#editDate").value;m.time=el("#editTime").value;if(m.scoreMode==="manual"){m.homeGoals=hg;m.awayGoals=ag}else{syncMatchScoreFromEvents(m)};m.attendance=Number(el("#editAttendance").value);m.referee=el("#editReferee").value;m.weather=el("#editWeather").value;m.motmPlayerId=el("#editMotm").value?Number(el("#editMotm").value):null;m.notes=el("#editNotes").value;if(m.status==="played"&&!m.simulated){generateEstimatedMatchDetails(m,{refresh:true,preserveDetails:true});generateManualTimeline(m);}rebuildPlayerStats();saveState({label:"Partie gespeichert"});closeOverlay();render();toast("Partie gespeichert");};
  const dm=el("#deleteMatch");if(dm)dm.onclick=()=>{if(confirm("Partie löschen?")){season().matches=season().matches.filter(x=>x.id!==m.id);rebuildPlayerStats();saveState({label:"Partie gelöscht"});closeOverlay();render();}};
}
function formationSlotLabel(index){
  return ["TW","RV","IV","IV","LV","ZDM","ZM","ZM","ZOM","ZOM","ST"][index]||"SP";
}
function goalPickerPitch(teamObj,lineupIds,benchIds,side,selectedId=null,assistMode=false){
  const ids=(lineupIds||[]).slice(0,11);
  const players=ids.map(playerById).filter(Boolean);
  const bench=(benchIds||[]).map(playerById).filter(Boolean);
  const mode=assistMode?"assist":"scorer";
  return `<section class="goal-picker-team"><div class="goal-picker-head">${badge(teamObj)}<div><b>${teamObj.name}</b><span>4-3-2-1 · ${assistMode?"Vorlagengeber":"Torschütze"}</span></div></div><div class="goal-picker-pitch" data-pick-side="${side}" data-pick-mode="${mode}">${players.map((p,index)=>`<button type="button" class="goal-player ${Number(selectedId)===p.id?"selected":""}" data-goal-player="${p.id}" data-goal-side="${side}" data-goal-mode="${mode}" data-player-origin="start" style="--slot:${index}"><span class="goal-player-pos">${formationSlotLabel(index)}</span><b>${p.shirtNumber||"–"}</b><small>${p.name}</small></button>`).join("")}</div><div class="goal-picker-bench"><div class="goal-picker-bench-title"><b>Ersatzbank</b><span>Auch Einwechselspieler auswählbar</span></div><div class="goal-picker-bench-list">${bench.map(p=>`<button type="button" class="goal-bench-player ${Number(selectedId)===p.id?"selected":""}" data-goal-player="${p.id}" data-goal-side="${side}" data-goal-mode="${mode}" data-player-origin="bench"><span>${p.position||"SP"}</span><b>${p.shirtNumber||"–"}</b><small>${p.name}</small></button>`).join("")||`<div class="empty">Keine Bankspieler verfügbar.</div>`}</div></div></section>`;
}
function ensureGoalSubstitution(m,side,playerId,goalMinute){
  const startKey=side,benchKey=`${side}Bench`;
  const startIds=m.lineups?.[startKey]||[],benchIds=m.lineups?.[benchKey]||[];
  if(!benchIds.includes(playerId))return;
  const already=(m.events||[]).some(e=>e.type==="sub"&&Number(e.playerId)===Number(playerId));
  if(already)return;
  const candidateIds=startIds.filter(id=>Number(id)!==Number(playerId));
  const incoming=playerById(playerId);
  const sameGroup=candidateIds.filter(id=>playerPositionGroup(playerById(id))===playerPositionGroup(incoming));
  const pool=sameGroup.length?sameGroup:candidateIds;
  if(!pool.length)return;
  const outId=pool[Math.floor(seededFraction(m.id,playerId,goalMinute,"auto-sub-v32")*pool.length)];
  const latest=Math.max(1,Number(goalMinute||1)-1);
  const earliest=Math.max(1,Math.min(latest,Number(goalMinute||1)-18));
  const subMinute=Math.max(1,Math.min(latest,Math.round(earliest+seededFraction(m.id,playerId,"sub-minute")*Math.max(1,latest-earliest))));
  m.events.push({id:nextId(m.events),minute:subMinute,addedTime:0,type:"sub",playerId:Number(playerId),assistId:null,playerOutId:Number(outId),manual:true,autoGeneratedSub:true});
}
function openEventEditor(matchId){
  const m=season().matches.find(x=>x.id===matchId);
  const homeTeam=team(m.homeId),awayTeam=team(m.awayId);
  const homeXI=(m.lineups?.home||[]).length===11?m.lineups.home:chooseLineup(homeTeam).map(p=>p.id);
  const awayXI=(m.lineups?.away||[]).length===11?m.lineups.away:chooseLineup(awayTeam).map(p=>p.id);
  m.lineups ||= {home:[],away:[],homeBench:[],awayBench:[]};
  m.lineups.home=homeXI;m.lineups.away=awayXI;
  m.lineups.homeBench=fullBenchIds(homeTeam,homeXI,m.lineups.homeBench);
  m.lineups.awayBench=fullBenchIds(awayTeam,awayXI,m.lineups.awayBench);
  let selectedTeamId=m.homeId,selectedScorerId=null,selectedAssistId=null;
  const renderPicker=()=>{
    const selectedTeam=team(selectedTeamId),isHome=selectedTeamId===m.homeId;
    const ids=isHome?homeXI:awayXI,benchIds=isHome?m.lineups.homeBench:m.lineups.awayBench;
    const root=el("#goalPitchPicker");if(!root)return;
    root.innerHTML=`${goalPickerPitch(selectedTeam,ids,benchIds,selectedTeamId,selectedScorerId,false)}<div class="goal-picker-divider"><b>Vorlage auswählen</b><span>optional · Startelf oder Bank</span></div>${goalPickerPitch(selectedTeam,ids,benchIds,selectedTeamId,selectedAssistId,true)}`;
    root.querySelectorAll("[data-goal-player]").forEach(button=>button.onclick=()=>{
      const id=Number(button.dataset.goalPlayer);
      if(button.dataset.goalMode==="scorer"){
        selectedScorerId=id;
        if(selectedAssistId===id)selectedAssistId=null;
      }else selectedAssistId=selectedAssistId===id?null:id;
      renderPicker();
    });
  };
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet goal-entry-sheet"><div class="sheet-head"><div><div class="eyebrow">Manuelle Eingabe</div><h2>Tor eintragen</h2></div><button class="iconbtn" id="close">×</button></div>
    <p class="goal-entry-note">Du trägst nur Tor, Minute, Torschütze und Vorlage ein. Karten, Ecken und weitere Spielszenen erstellt die App beim Spielende automatisch.</p>
    <div class="team-key">
      <button type="button" class="team-filter active" data-event-team="${m.homeId}">${badge(homeTeam)}<b>${homeTeam.name}</b></button>
      <button type="button" class="team-filter" data-event-team="${m.awayId}">${badge(awayTeam)}<b>${awayTeam.name}</b></button>
    </div>
    <div class="form-grid compact-goal-fields"><div class="field"><label>Minute</label><input id="evMinute" type="number" min="1" max="130" value="1"></div><div class="field"><label>Nachspielzeit</label><input id="evAdded" type="number" min="0" max="20" value="0"></div><div class="field"><label>Torart</label><select id="evType"><option value="goal">Tor aus dem Spiel</option><option value="penalty">Elfmeter</option><option value="ownGoal">Eigentor</option></select></div></div>
    <div id="goalPitchPicker"></div>
    <button id="saveEvent" class="btn primary" style="width:100%;margin-top:14px">Tor speichern</button>
  </div></div>`;
  el("#close").onclick=()=>openMatch(matchId);
  document.querySelectorAll("[data-event-team]").forEach(button=>button.onclick=()=>{
    document.querySelectorAll("[data-event-team]").forEach(x=>x.classList.remove("active"));button.classList.add("active");
    selectedTeamId=Number(button.dataset.eventTeam);selectedScorerId=null;selectedAssistId=null;renderPicker();
  });
  renderPicker();
  el("#saveEvent").onclick=()=>{
    const minute=Number(el("#evMinute").value),addedTime=Number(el("#evAdded").value||0),type=el("#evType").value;
    if(minute<1||minute>130)return toast("Minute muss zwischen 1 und 130 liegen");
    if(addedTime<0||addedTime>20)return toast("Nachspielzeit muss zwischen 0 und 20 liegen");
    if(!selectedScorerId)return toast("Bitte den Torschützen direkt auf dem Spielfeld auswählen");
    if(selectedAssistId===selectedScorerId)return toast("Torschütze und Vorlagengeber müssen verschieden sein");
    pushUndo("Tor eingetragen");
    m.scoreMode="events";m.simulated=false;
    m.events=(m.events||[]).filter(e=>!e.generated);
    const side=selectedTeamId===m.homeId?"home":"away";
    ensureGoalSubstitution(m,side,selectedScorerId,minute);
    if(type!=="ownGoal"&&selectedAssistId)ensureGoalSubstitution(m,side,selectedAssistId,minute);
    m.events.push({id:nextId(m.events),minute,addedTime,type,playerId:selectedScorerId,assistId:type==="ownGoal"?null:selectedAssistId,playerOutId:null,manual:true});
    syncMatchScoreFromEvents(m);rebuildPlayerStats();saveState({label:"Tor eingetragen"});openMatch(matchId);
  };
}
function rebuildPlayerStats(){
  for(const t of state().teams||[]){
    t.players ||= [];
    for(const p of t.players){
      if(!p)continue;
      p.stats={apps:0,goals:0,assists:0,yellow:0,red:0};
    }
  }
  for(const l of state().leagues||[])for(const s of l.seasons||[])for(const m of s.matches||[]){
    m.events ||= [];
    m.lineups ||= {home:[],away:[],homeBench:[],awayBench:[]};
    if(m.status==="played"){
      const used=[...(m.lineups.home||[]),...(m.lineups.away||[])];
      for(const id of used){
        const p=playerById(id);
        if(p){p.stats ||= {apps:0,goals:0,assists:0,yellow:0,red:0};p.stats.apps++}
      }
    }
    for(const e of m.events){
      if(!e)continue;
      const p=playerById(e.playerId);
      if(!p)continue;
      p.stats ||= {apps:0,goals:0,assists:0,yellow:0,red:0};
      if(["goal","penalty"].includes(e.type))p.stats.goals++;
      if(e.assistId){
        const assister=playerById(e.assistId);
        if(assister){assister.stats ||= {apps:0,goals:0,assists:0,yellow:0,red:0};assister.stats.assists++}
      }
      if(e.type==="yellow")p.stats.yellow++;
      if(e.type==="secondYellow"){p.stats.yellow++;p.stats.red++}
      if(e.type==="red")p.stats.red++;
    }
  }
}
function openTable(day){el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Tabelle nach Spieltag ${day}</h2><button class="iconbtn" id="close">×</button></div>${tableHTML(standingsAt(state(),day),day)}</div></div>`;el("#close").onclick=closeOverlay;}
function openTeam(id){
  const t=team(id),played=season().matches.filter(m=>m.status==="played"&&(m.homeId===id||m.awayId===id));
  const wins=played.filter(m=>(m.homeId===id&&m.homeGoals>m.awayGoals)||(m.awayId===id&&m.awayGoals>m.homeGoals)).length;
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet">
    <div class="sheet-head"><h2>Team Center</h2><button class="iconbtn" id="close">×</button></div>
    <div class="profile-cover" style="${t.stadium.image?`background-image:url('${t.stadium.image}');background-size:${t.stadiumZoom||100}%;background-position:${t.stadiumPosX??50}% ${t.stadiumPosY??50}%`:""}"><div class="profile-cover-content">${badge(t)}<div><h1>${t.name}</h1><div class="muted">${t.stadium.name} · ${Number(t.stadium.capacity).toLocaleString("de-DE")} Plätze</div></div></div></div>
    <div class="kpis"><div class="kpi"><b>${played.length}</b><span>Spiele</span></div><div class="kpi"><b>${wins}</b><span>Siege</span></div><div class="kpi"><b>${teamAverage(t)}</b><span>Ø Stärke</span></div><div class="kpi"><b>${new Intl.NumberFormat("de-DE",{notation:"compact"}).format(squadValue(t))} €</b><span>Kaderwert</span></div></div>
    <div class="actions" style="margin-top:12px"><button class="btn primary" id="teamTransferButton">Transfer durchführen</button></div><div class="tabs" style="margin-top:12px"><button class="active" data-teamtab="squad">Kader</button><button data-teamtab="stats">Analytics</button><button data-teamtab="history">Historie</button></div>
    <div id="teamBody">${teamSquad(t)}</div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
  document.querySelectorAll("[data-teamtab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-teamtab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");el("#teamBody").innerHTML=b.dataset.teamtab==="squad"?teamSquad(t):b.dataset.teamtab==="stats"?teamAnalytics(t,played,wins):teamHistory(t);bindTeamSquad(t);});
  bindTeamSquad(t);
}
function teamAnalytics(t,played,wins){
  const aggregate=played.reduce((acc,m)=>{
    const home=m.homeId===t.id,s=m.statistics||{};
    acc.gf+=home?Number(m.homeGoals||0):Number(m.awayGoals||0);
    acc.ga+=home?Number(m.awayGoals||0):Number(m.homeGoals||0);
    acc.shots+=home?Number(s.shotsHome||0):Number(s.shotsAway||0);
    acc.shotsAgainst+=home?Number(s.shotsAway||0):Number(s.shotsHome||0);
    acc.onTarget+=home?Number(s.shotsOnTargetHome||0):Number(s.shotsOnTargetAway||0);
    acc.xg+=home?Number(s.xgHome||0):Number(s.xgAway||0);
    acc.xga+=home?Number(s.xgAway||0):Number(s.xgHome||0);
    acc.possession+=home?Number(s.possessionHome||50):Number(s.possessionAway||50);
    acc.corners+=home?Number(s.cornersHome||0):Number(s.cornersAway||0);
    acc.fouls+=home?Number(s.foulsHome||0):Number(s.foulsAway||0);
    return acc;
  },{gf:0,ga:0,shots:0,shotsAgainst:0,onTarget:0,xg:0,xga:0,possession:0,corners:0,fouls:0});
  const games=Math.max(1,played.length);
  const conversion=aggregate.shots?aggregate.gf/aggregate.shots*100:0;
  const accuracy=aggregate.shots?aggregate.onTarget/aggregate.shots*100:0;
  const saveResistance=aggregate.shotsAgainst?aggregate.ga/aggregate.shotsAgainst*100:0;
  return `<div class="analytics-kpi-grid">
    <div class="analytics-kpi featured"><span>Chancenverwertung</span><b>${conversion.toFixed(1)}%</b><small>${aggregate.gf} Tore aus ${aggregate.shots} Schüssen</small></div>
    <div class="analytics-kpi"><span>Schüsse pro Spiel</span><b>${(aggregate.shots/games).toFixed(1)}</b><small>${(aggregate.onTarget/games).toFixed(1)} aufs Tor</small></div>
    <div class="analytics-kpi"><span>Schussgenauigkeit</span><b>${accuracy.toFixed(1)}%</b><small>Schüsse aufs Tor</small></div>
    <div class="analytics-kpi"><span>Ø Ballbesitz</span><b>${(aggregate.possession/games).toFixed(1)}%</b><small>${played.length} ausgewertete Spiele</small></div>
    <div class="analytics-kpi"><span>xG pro Spiel</span><b>${(aggregate.xg/games).toFixed(2)}</b><small>xG gegen ${(aggregate.xga/games).toFixed(2)}</small></div>
    <div class="analytics-kpi"><span>Gegentorquote</span><b>${saveResistance.toFixed(1)}%</b><small>Gegentore je gegnerischem Schuss</small></div>
  </div>
  <div class="card"><div class="stat-pair"><span>Siegquote</span><b>${played.length?Math.round(wins/played.length*100):0}%</b></div><div class="stat-pair"><span>Tore</span><b>${aggregate.gf}</b></div><div class="stat-pair"><span>Gegentore</span><b>${aggregate.ga}</b></div><div class="stat-pair"><span>Tordifferenz</span><b>${aggregate.gf-aggregate.ga>0?"+":""}${aggregate.gf-aggregate.ga}</b></div><div class="stat-pair"><span>Ecken pro Spiel</span><b>${(aggregate.corners/games).toFixed(1)}</b></div><div class="stat-pair"><span>Fouls pro Spiel</span><b>${(aggregate.fouls/games).toFixed(1)}</b></div></div>
  <div class="card"><h3>Top-Spieler</h3>${t.players.slice().sort((a,b)=>b.stats.goals-a.stats.goals).slice(0,8).map(p=>playerRow(p)).join("")}</div>`;
}

function teamHistory(t){return `<div class="card">${t.history.length?t.history.map(h=>`<div class="history-row"><div><b>${h.season}</b><div class="small muted">Platz ${h.position} · ${h.points} Punkte · ${h.gf}:${h.ga} Tore</div></div><span>›</span></div>`).join(""):`<div class="empty">Noch keine Saisonhistorie.</div>`}</div>`}
function playerRow(p){return `<div class="player-row" data-player="${p.id}"><div class="player-avatar">${p.shirtNumber}</div><div><b>${p.name}</b><div class="player-pos">${p.position} · Form ${p.form}</div></div><span class="rating-pill">${p.rating}</span></div>`}
function teamSquad(t){
  const groups=[["Torhüter",["TW","GK"]],["Rechtsverteidiger",["RV","RIV"]],["Innenverteidiger",["IV","LIV"]],["Linksverteidiger",["LV"]],["Defensives Mittelfeld",["ZDM"]],["Zentrales Mittelfeld",["ZM"]],["Rechtes Mittelfeld",["RM","RA","RF"]],["Offensives Mittelfeld",["ZOM"]],["Linkes Mittelfeld",["LM","LA","LF"]],["Stürmer",["ST","MS"]]];
  const sorted=sortPlayersByPosition(t.players),used=new Set();
  const sections=groups.map(([label,positions])=>{const players=sorted.filter(p=>positions.includes(normalizedPos(p)));players.forEach(p=>used.add(p.id));if(!players.length)return "";return `<section class="squad-position-group"><h4>${label}</h4><div class="player-list">${players.map(p=>playerRow(p)).join("")}</div></section>`;}).join("");
  const other=sorted.filter(p=>!used.has(p.id));
  const xi=(t.defaultLineup||[]).map(id=>t.players.find(p=>p.id===id)).filter(Boolean);
  return `<div class="card team-default-lineup-summary"><div><span class="eyebrow">Gespeicherte Aufstellung</span><h3>${t.defaultFormation||"4-3-2-1"} · ${xi.length}/11 Spieler</h3><p>${xi.length===11?"Diese Elf wird automatisch für neue Spiele verwendet.":"Bitte lege eine vollständige Startelf fest."}</p></div><button id="editDefaultLineup" class="btn primary">Startaufstellung manuell festlegen</button></div><div class="actions"><button id="addPlayer" class="btn secondary">+ Spieler</button><button id="saveDefaultLineup" class="btn ghost">Automatisch vorschlagen</button></div>${sections}${other.length?`<section class="squad-position-group"><h4>Weitere Positionen</h4><div class="player-list">${other.map(p=>playerRow(p)).join("")}</div></section>`:""}`;
}
function bindTeamSquad(t){
  const add=el("#addPlayer");if(add)add.onclick=()=>openPlayerEditor(t.id,null);
  const edit=el("#editDefaultLineup");if(edit)edit.onclick=()=>openDefaultLineupEditor(t.id);
  const auto=el("#saveDefaultLineup");if(auto)auto.onclick=async()=>{t.defaultLineup=[];chooseLineup(t);t.defaultFormation=t.defaultFormation||"4-3-3";await saveState({label:"Standardelf vorgeschlagen"});toast("Startelf wurde vorgeschlagen – Formation kannst du frei ändern");openTeam(t.id);};
  document.querySelectorAll("[data-player]").forEach(r=>r.onclick=()=>openPlayerEditor(t.id,Number(r.dataset.player)));
}
function openDefaultLineupEditor(teamId){
  const t=team(teamId);if(!t)return;
  let selected=(Array.isArray(t.defaultLineup)?t.defaultLineup:[]).filter(id=>t.players.some(p=>Number(p.id)===Number(id))).slice(0,11),formation=t.defaultFormation||'4-3-3';
  if(selected.length!==11)selected=chooseLineup(t).map(p=>p.id).slice(0,11);
  const save=async()=>{if(selected.length!==11||new Set(selected).size!==11)return toast('Bitte 11 verschiedene Spieler aufstellen');t.defaultFormation=formation;t.defaultLineup=[...selected];for(const m of season().matches||[]){if(m.status==='played')continue;m.lineups||={home:[],away:[],homeBench:[],awayBench:[]};if(m.homeId===t.id){m.lineups.home=[...selected];m.lineups.homeBench=fullBenchIds(t,selected,m.lineups.homeBench)}if(m.awayId===t.id){m.lineups.away=[...selected];m.lineups.awayBench=fullBenchIds(t,selected,m.lineups.awayBench)}}await saveState({label:'Startaufstellung gespeichert'});toast('Startelf gespeichert');openTeam(teamId)};
  const draw=()=>{
    const used=new Set(selected.map(Number)),rest=sortPlayersByPosition((t.players||[]).filter(p=>!used.has(Number(p.id))));
    el('#overlay').innerHTML=`<div class="modal"><div class="sheet default-lineup-sheet tactical-default-sheet"><div class="sheet-head"><div><div class="eyebrow">${t.name}</div><h2>Startaufstellung</h2><p class="subtitle">Formation wählen · Spieler antippen und Position antippen</p></div><button class="iconbtn" id="close">×</button></div>${formationSelectMarkup(formation,'default')}${tacticalPitchMarkup(selected,'default',formation)}<div class="compact-squad"><div class="compact-squad-title"><b>Kompletter Kader</b><span>${t.players.length} Spieler</span></div><div class="compact-squad-list">${rest.map(p=>compactSquadCard(p,'default')).join('')}</div></div><div class="actions sticky-lineup-actions"><button id="saveManualLineup" class="btn primary">Startelf speichern</button><button id="autoManualLineup" class="btn secondary">Automatisch</button></div></div></div>`;
    el('#close').onclick=()=>openTeam(teamId);const fs=el('[data-lineup-formation="default"]');if(fs)fs.onchange=()=>{formation=fs.value;draw()};el('#saveManualLineup').onclick=save;el('#autoManualLineup').onclick=()=>{selected=chooseLineup(t).map(p=>p.id).slice(0,11);draw()};
    let drag=null,touch=null,tapPid=null;const allCards=()=>[...document.querySelectorAll('[data-lineup-player]')];
    const applyPid=(pid,idx)=>{const old=selected.indexOf(Number(pid)),disp=selected[idx];if(old>=0&&old!==idx)selected[old]=disp;selected[idx]=Number(pid);draw()};
    allCards().forEach(card=>{const dat=()=>({pid:Number(card.dataset.lineupPlayer)});card.onclick=e=>{e.stopPropagation();tapPid=Number(card.dataset.lineupPlayer);allCards().forEach(x=>x.classList.toggle('tap-selected',x===card))};card.ondragstart=e=>{drag=dat();e.dataTransfer.setData('text/plain',JSON.stringify(drag));card.classList.add('is-dragging')};card.ondragend=()=>card.classList.remove('is-dragging');card.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;touch={...dat(),card,x:e.clientX,y:e.clientY,moved:false}});card.addEventListener('pointermove',e=>{if(!touch||touch.card!==card)return;if(Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>12){touch.moved=true;touch.card.classList.add('is-dragging')}});card.addEventListener('pointerup',e=>{if(!touch||touch.card!==card)return;const z=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-lineup-slot="default"]');touch.card.classList.remove('is-dragging');if(touch.moved&&z)applyPid(touch.pid,Number(z.dataset.lineupIndex));touch=null})});
    document.querySelectorAll('[data-lineup-slot="default"]').forEach(z=>{z.onclick=e=>{if(e.target.closest('[data-lineup-player]'))return;if(tapPid!=null)applyPid(tapPid,Number(z.dataset.lineupIndex))};z.ondragover=e=>{e.preventDefault();z.classList.add('drag-over')};z.ondragleave=()=>z.classList.remove('drag-over');z.ondrop=e=>{e.preventDefault();z.classList.remove('drag-over');let d=drag;try{d=JSON.parse(e.dataTransfer.getData('text/plain'))||d}catch{}if(d)applyPid(d.pid,Number(z.dataset.lineupIndex))}});
  };draw();
}
function topTeamPlayers(t){return `<div class="card"><h3>Top-Spieler</h3>${t.players.slice().sort((a,b)=>b.stats.goals-a.stats.goals).slice(0,8).map(p=>`<div class="player-row"><div class="player-num">${p.shirtNumber}</div><div><b>${p.name}</b><div class="player-pos">${p.position}</div></div><span>⚽ ${p.stats.goals} · 🎯 ${p.stats.assists}</span></div>`).join("")}</div>`}
function openPlayerEditor(teamId,playerId){
  const t=team(teamId),p=playerId?t.players.find(x=>x.id===playerId):{name:"",shirtNumber:t.players.length+1,position:"ST",age:20,rating:60,nationality:"Fantasy",preferredFoot:"Rechts",value:1000000,contractUntil:season().name};
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><div><div class="eyebrow">${t.name}</div><h2>${playerId?"Spieler bearbeiten":"Neuer Spieler"}</h2></div><button class="iconbtn" id="close">×</button></div><div class="form-grid"><div class="field"><label>Name</label><input id="pName" value="${p.name}"></div><div class="field"><label>Nummer</label><input id="pNumber" type="number" value="${p.shirtNumber}"></div><div class="field"><label>Position</label><input id="pPosition" value="${p.position}"></div><div class="field"><label>Alter</label><input id="pAge" type="number" value="${p.age}"></div><div class="field"><label>Stärke</label><input id="pRating" type="number" min="1" max="99" value="${p.rating}"></div><div class="field"><label>Nationalität</label><input id="pNation" value="${p.nationality}"></div><div class="field"><label>Kaderstatus</label><select id="pStatus"><option value="active" ${p.status==="active"?"selected":""}>Aktiv</option><option value="injured" ${p.status==="injured"?"selected":""}>Verletzt</option><option value="suspended" ${p.status==="suspended"?"selected":""}>Gesperrt</option><option value="loaned" ${p.status==="loaned"?"selected":""}>Verliehen</option></select></div><div class="field"><label>Starker Fuß</label><select id="pFoot"><option ${p.preferredFoot==="Rechts"?"selected":""}>Rechts</option><option ${p.preferredFoot==="Links"?"selected":""}>Links</option><option ${p.preferredFoot==="Beidfüßig"?"selected":""}>Beidfüßig</option></select></div><div class="field"><label>Marktwert</label><input id="pValue" type="number" value="${p.value}"></div><div class="field"><label>Vertrag bis</label><input id="pContract" value="${p.contractUntil}"></div><div class="field"><label>Verletzt bis</label><input id="pInjured" type="date" value="${p.injuredUntil||""}"></div><div class="field"><label>Form (1–10)</label><input id="pForm" type="number" min="1" max="10" step="0.1" value="${p.form||6.5}"></div><div class="field"><label>Tempo</label><input id="pPace" type="number" min="1" max="99" value="${p.attributes?.pace||60}"></div><div class="field"><label>Abschluss</label><input id="pShooting" type="number" min="1" max="99" value="${p.attributes?.shooting||60}"></div><div class="field"><label>Passen</label><input id="pPassing" type="number" min="1" max="99" value="${p.attributes?.passing||60}"></div><div class="field"><label>Dribbling</label><input id="pDribbling" type="number" min="1" max="99" value="${p.attributes?.dribbling||60}"></div><div class="field"><label>Defensive</label><input id="pDefending" type="number" min="1" max="99" value="${p.attributes?.defending||60}"></div><div class="field"><label>Physis</label><input id="pPhysical" type="number" min="1" max="99" value="${p.attributes?.physical||60}"></div></div><div class="actions"><button id="savePlayer" class="btn primary">Speichern</button>${playerId?`<button id="deletePlayer" class="btn danger">Löschen</button>`:""}</div></div></div>`;
  el("#close").onclick=()=>openTeam(teamId);
  el("#savePlayer").onclick=async()=>{
    const saveBtn=el("#savePlayer");
    if(saveBtn?.dataset.busy==="1")return;
    const name=el("#pName").value.trim();
    const number=Number(el("#pNumber").value);
    const rating=Number(el("#pRating").value);
    if(!name)return toast("Bitte einen Spielernamen eingeben");
    if(number<1||number>99)return toast("Trikotnummer muss zwischen 1 und 99 liegen");
    if(rating<1||rating>99)return toast("Stärke muss zwischen 1 und 99 liegen");
    if(saveBtn){saveBtn.dataset.busy="1";saveBtn.disabled=true;saveBtn.textContent="Speichert…";}
    let target=p;if(!playerId){target={id:nextId(state().teams.flatMap(x=>x.players)),teamId,stats:{apps:0,goals:0,assists:0,yellow:0,red:0},history:[]};t.players.push(target);}Object.assign(target,{name,shirtNumber:number,position:normalizePosition(el("#pPosition").value||"ST"),age:Number(el("#pAge").value),rating,nationality:el("#pNation").value||"Fantasy",preferredFoot:el("#pFoot").value,value:Number(el("#pValue").value),contractUntil:el("#pContract").value,injuredUntil:el("#pInjured").value,status:el("#pStatus").value,form:Number(el("#pForm").value),attributes:{pace:Number(el("#pPace").value),shooting:Number(el("#pShooting").value),passing:Number(el("#pPassing").value),dribbling:Number(el("#pDribbling").value),defending:Number(el("#pDefending").value),physical:Number(el("#pPhysical").value)}});
    try{
      await saveState({label:playerId?"Spieler bearbeitet":"Spieler erstellt",throwOnError:true});
      toast("Spieler gespeichert");
      openTeam(teamId);
    }catch(error){
      console.error(error);
      if(saveBtn){saveBtn.dataset.busy="0";saveBtn.disabled=false;saveBtn.textContent="Speichern";}
      toast("Speichern fehlgeschlagen – bitte erneut versuchen");
    }
  };
  const del=el("#deletePlayer");if(del)del.onclick=()=>{
    if(!confirm("Spieler wirklich löschen?"))return;
    pushUndo("Spieler gelöscht");
    t.players=t.players.filter(x=>x.id!==playerId);
    saveState();openTeam(teamId);
  };
}
let teamEditorDraft=null;
function openTeamEditor(id){
  const t=id?team(id):{
    name:"",short:"",color:"#2563eb",
    stadium:{name:"",capacity:0,image:""},
    logo:"",logoScale:100,logoPosX:50,logoPosY:50,
    stadiumZoom:100,stadiumPosX:50,stadiumPosY:50,
    fanMedia:{homeWin:[],awayWin:[],draw:[],generic:[],chants:[],goal:[]},
    players:[]
  };

  ensureTeamFanMedia(t);
  let pendingLogo=teamEditorDraft?.id===id ? teamEditorDraft.logo : (t.logo||"");
  let pendingStadium=teamEditorDraft?.id===id ? teamEditorDraft.stadium : (t.stadium?.image||"");
  let pendingFanMedia=teamEditorDraft?.id===id ? teamEditorDraft.fanMedia : JSON.parse(JSON.stringify(t.fanMedia));

  el("#overlay").innerHTML=`<div class="modal"><div class="sheet team-editor-sheet">
    <div class="sheet-head">
      <div><div class="eyebrow">Verein</div><h2>${id?"Team bearbeiten":"Neues Team"}</h2></div>
      <button class="iconbtn" id="close">×</button>
    </div>

    <div class="form-grid">
      <div class="field"><label>Name</label><input id="tName" value="${t.name}"></div>
      <div class="field"><label>Kürzel</label><input id="tShort" maxlength="5" value="${t.short}"></div>
      <div class="field"><label>Farbe</label><input id="tColor" type="color" value="${t.color}"></div>
      <div class="field"><label>Stadion</label><input id="tStadium" value="${t.stadium.name}"></div>
      <div class="field"><label>Kapazität</label><input id="tCapacity" type="number" min="0" value="${t.stadium.capacity}"></div>
    </div>

    <div class="image-editor-section">
      <div class="image-editor-head">
        <div><h3>Vereinslogo</h3><p>Der Hintergrund außerhalb des Logos wird transparent. Weiße Flächen im Logo bleiben erhalten.</p></div>
        <label class="btn secondary image-pick-btn">Bild wählen<input id="tLogo" type="file" accept="image/*" hidden></label>
      </div>
      <div class="logo-edit-layout">
        <div class="logo-editor-preview">
          ${pendingLogo?`<img src="${pendingLogo}" alt="Logo Vorschau">`:`<span>${(t.short||"FC").slice(0,2)}</span>`}
        </div>
        <div class="crop-summary">
          <b>${pendingLogo?"Logo freigestellt und zugeschnitten":"Noch kein Logo"}</b>
          <span>Nur der äußere, mit dem Bildrand verbundene Hintergrund wird entfernt. Das Logo selbst bleibt vollständig erhalten.</span>
          ${pendingLogo?`<button class="btn ghost" id="removeLogo">Logo entfernen</button>`:""}
        </div>
      </div>
    </div>

    <div class="image-editor-section">
      <div class="image-editor-head">
        <div><h3>Stadionbild</h3><p>Breites 16:9-Format für Teamkarte und Vereinsprofil.</p></div>
        <label class="btn secondary image-pick-btn">Bild wählen<input id="tStadiumImage" type="file" accept="image/*" hidden></label>
      </div>
      <div class="stadium-editor-preview" ${pendingStadium?`style="background-image:url('${pendingStadium}')"`:""}>
        ${pendingStadium?"":`<span>Noch kein Stadionbild</span>`}
      </div>
      ${pendingStadium?`<button class="btn ghost" id="removeStadiumImage">Stadionbild entfernen</button>`:""}
    </div>


    <div class="image-editor-section fan-media-editor">
      <div class="image-editor-head"><div><h3>Reale Fanszenen & Fangesänge</h3><p>Lade echte kurze Videos und Audiodateien hoch. Sie bleiben lokal auf deinem Gerät und landen nicht im Backup.</p></div></div>
      <div class="fan-media-upload-grid">
        <label class="fan-media-upload"><b>Heimsieg-Videos</b><span>${pendingFanMedia.homeWin.length} gespeichert</span><input id="fanHomeWin" type="file" accept="video/mp4,video/webm,video/quicktime" multiple></label>
        <label class="fan-media-upload"><b>Auswärtssieg-Videos</b><span>${pendingFanMedia.awayWin.length} gespeichert</span><input id="fanAwayWin" type="file" accept="video/mp4,video/webm,video/quicktime" multiple></label>
        <label class="fan-media-upload"><b>Unentschieden-Videos</b><span>${pendingFanMedia.draw.length} gespeichert</span><input id="fanDraw" type="file" accept="video/mp4,video/webm,video/quicktime" multiple></label>
        <label class="fan-media-upload"><b>Allgemeine Fanvideos</b><span>${pendingFanMedia.generic.length} gespeichert</span><input id="fanGeneric" type="file" accept="video/mp4,video/webm,video/quicktime" multiple></label>
        <label class="fan-media-upload"><b>Fangesänge / Trommeln</b><span>${pendingFanMedia.chants.length} gespeichert</span><input id="fanChants" type="file" accept="audio/*" multiple></label>
      </div>
      <div class="fan-media-list">${Object.entries(pendingFanMedia).filter(([k])=>k!=="goal").flatMap(([kind,items])=>items.map(item=>`<button type="button" class="fan-media-chip" data-remove-fan-media="${kind}:${item.id}">${item.name||kind} <span>×</span></button>`)).join("")||`<div class="muted">Noch keine echten Medien hinterlegt. Ohne Upload bleibt die normale Stadion-TV-Sequenz aktiv.</div>`}</div>
    </div>

    <div class="actions sticky-editor-actions">
      <button id="saveTeam" class="btn primary">Team speichern</button>
      ${id?`<button id="deleteTeam" class="btn danger">Aus Liga entfernen</button>`:""}
    </div>
  </div></div>`;

  el("#close").onclick=()=>{teamEditorDraft=null;closeOverlay()};

  el("#tLogo").onchange=async()=>{
    const file=el("#tLogo").files?.[0];
    if(!file)return;
    try{
      const cropped=await cropImageFile(file,{
        aspect:1,
        outputWidth:640,
        outputHeight:640,
        quality:.86,
        title:"Vereinslogo zuschneiden"
      });
      if(cropped)pendingLogo=await normalizeLogoImage(cropped,{removeLightBackground:true,padding:.055,tolerance:44});
    }catch(error){
      console.error(error);
      toast(error.message||"Logo konnte nicht verarbeitet werden");
    }
    teamEditorDraft={id,logo:pendingLogo,stadium:pendingStadium,fanMedia:pendingFanMedia};
    openTeamEditor(id);
  };

  el("#tStadiumImage").onchange=async()=>{
    const file=el("#tStadiumImage").files?.[0];
    if(!file)return;
    try{
      const cropped=await cropImageFile(file,{
        aspect:16/9,
        outputWidth:1200,
        outputHeight:675,
        quality:.76,
        title:"Stadionbild zuschneiden"
      });
      if(cropped)pendingStadium=cropped;
    }catch(error){
      console.error(error);
      toast(error.message||"Stadionbild konnte nicht verarbeitet werden");
    }
    teamEditorDraft={id,logo:pendingLogo,stadium:pendingStadium,fanMedia:pendingFanMedia};
    openTeamEditor(id);
  };

  const removeLogo=el("#removeLogo");
  if(removeLogo)removeLogo.onclick=()=>{
    teamEditorDraft={id,logo:"",stadium:pendingStadium,fanMedia:pendingFanMedia};
    openTeamEditor(id);
  };

  const removeStadium=el("#removeStadiumImage");
  if(removeStadium)removeStadium.onclick=()=>{
    teamEditorDraft={id,logo:pendingLogo,stadium:"",fanMedia:pendingFanMedia};
    openTeamEditor(id);
  };


  const mediaInputs={fanHomeWin:"homeWin",fanAwayWin:"awayWin",fanDraw:"draw",fanGeneric:"generic",fanChants:"chants"};
  for(const [inputId,kind] of Object.entries(mediaInputs)){
    const input=el(`#${inputId}`);if(!input)continue;
    input.onchange=async()=>{
      const files=[...(input.files||[])];if(!files.length)return;
      const teamId=id||(`draft-${Date.now()}`);
      for(const file of files){
        const max=kind==="chants"?18*1024*1024:45*1024*1024;
        if(file.size>max){toast(`${file.name} ist zu groß`);continue}
        try{pendingFanMedia[kind].push(await saveFanMediaBlob(teamId,kind,file))}catch(e){console.error(e);toast(`${file.name} konnte nicht gespeichert werden`)}
      }
      teamEditorDraft={id,logo:pendingLogo,stadium:pendingStadium,fanMedia:pendingFanMedia};openTeamEditor(id);
    };
  }
  document.querySelectorAll('[data-remove-fan-media]').forEach(btn=>btn.onclick=async()=>{
    const [kind,itemId]=btn.dataset.removeFanMedia.split(':');const list=pendingFanMedia[kind]||[];const item=list.find(x=>x.id===itemId);
    if(item)await deleteFanMediaItem(item);pendingFanMedia[kind]=list.filter(x=>x.id!==itemId);
    teamEditorDraft={id,logo:pendingLogo,stadium:pendingStadium,fanMedia:pendingFanMedia};openTeamEditor(id);
  });

  el("#saveTeam").onclick=async()=>{
    const name=el("#tName").value.trim();
    const short=el("#tShort").value.trim().toUpperCase();
    const capacity=Number(el("#tCapacity").value);

    if(!name)return toast("Bitte einen Teamnamen eingeben");
    if(!short)return toast("Bitte ein Kürzel eingeben");
    if(short.length>5)return toast("Das Kürzel darf höchstens 5 Zeichen haben");
    if(!Number.isFinite(capacity)||capacity<0)return toast("Bitte eine gültige Kapazität eingeben");

    const saveBtn=el("#saveTeam");
    if(saveBtn?.dataset.busy==="1")return;
    if(saveBtn){saveBtn.dataset.busy="1";saveBtn.disabled=true;saveBtn.textContent="Speichert…";}

    let target=t;
    if(!id){
      target={
        id:nextId(state().teams),
        players:[],
        logo:"",
        logoScale:100,
        logoPosX:50,
        logoPosY:50,
        stadiumZoom:100,
        stadiumPosX:50,
        stadiumPosY:50,
        stadium:{image:""},
        fanMedia:{homeWin:[],awayWin:[],draw:[],generic:[],chants:[],goal:[]},
        history:[]
      };
      state().teams.push(target);
      season().teamIds.push(target.id);
    }

    target.name=name;
    target.short=short;
    target.color=el("#tColor").value;
    target.logo=pendingLogo;
    target.logoScale=100;
    target.logoPosX=50;
    target.logoPosY=50;
    target.stadium.name=el("#tStadium").value.trim()||"Neues Stadion";
    target.stadium.capacity=capacity;
    target.stadium.image=pendingStadium;
    target.fanMedia=pendingFanMedia;
    target.stadiumZoom=100;
    target.stadiumPosX=50;
    target.stadiumPosY=50;

    try{
      await saveState({label:id?"Team bearbeitet":"Team erstellt",persistMedia:true,throwOnError:true});
      teamEditorDraft=null;
      closeOverlay();
      render();
      toast("Team gespeichert");
    }catch(error){
      console.error(error);
      if(saveBtn){saveBtn.dataset.busy="0";saveBtn.disabled=false;saveBtn.textContent="Team speichern";}
      toast("Team konnte nicht gespeichert werden. Bitte Speicherplatz prüfen und erneut versuchen.");
    }
  };

  const del=el("#deleteTeam");
  if(del)del.onclick=()=>{
    if(season().matches.some(m=>m.homeId===id||m.awayId===id))return toast("Team wird im Spielplan verwendet");
    if(!confirm("Team wirklich aus dieser Liga entfernen?"))return;
    pushUndo("Team entfernt");
    season().teamIds=season().teamIds.filter(x=>x!==id);
    saveState();
    teamEditorDraft=null;
    closeOverlay();
    render();
  };
}
function openLeagueEditor(id){
  const l=id?state().leagues.find(x=>x.id===id):{name:"",country:"Fantasy",seasons:[]};
  const active=id?getSeason(state(),l):{name:"2026/27"};
  const zones=deepClone(state().settings.tableZones||[]);
  const zoneRows=()=>zones.map((z,i)=>`<div class="zone-editor-row" data-zone-row="${i}">
    <input data-zone-label="${i}" value="${z.label||""}" placeholder="Bezeichnung">
    <input data-zone-from="${i}" type="number" value="${z.from||0}" placeholder="Von">
    <input data-zone-to="${i}" type="number" value="${z.to||0}" placeholder="Bis">
    <input data-zone-color="${i}" type="color" value="${z.color||"#4da8ff"}">
    <button class="iconbtn" data-zone-delete="${i}">×</button>
  </div>`).join("");
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>${id?"Liga bearbeiten":"Neue Liga"}</h2><button class="iconbtn" id="close">×</button></div>
    <div class="form-grid"><div class="field"><label>Liganame</label><input id="lName" value="${l.name}"></div><div class="field"><label>Land</label><input id="lCountry" value="${l.country}"></div><div class="field"><label>Saison</label><input id="lSeason" value="${active.name}"></div></div>
    <section class="image-editor-section"><div class="section-head"><div><h3>Tabellenplätze & Farben</h3><span class="subtitle">Jede Zone frei festlegen. Beispiel: 1–2 Aufstieg, 3 Relegation, letzte 2 Abstieg.</span></div><button id="addZone" class="btn secondary">+ Zone</button></div>
      <div class="zone-editor-head"><span>Name</span><span>Von</span><span>Bis</span><span>Farbe</span><span></span></div>
      <div id="zoneRows">${zoneRows()}</div>
      <div class="small muted">Für Plätze vom Tabellenende kannst du negative Zahlen nutzen: -2 bis -1 = letzte zwei Plätze.</div>
    </section>
    <div class="actions"><button id="saveLeague" class="btn primary">Speichern</button>${id?`<button id="archiveSeason" class="btn success">Saison abschließen</button>`:""}</div></div></div>`;
  el("#close").onclick=closeOverlay;
  const readZones=()=>[...document.querySelectorAll("[data-zone-row]")].map((row,i)=>({
    id:`zone-${Date.now()}-${i}`,
    label:row.querySelector("[data-zone-label]")?.value.trim()||"Zone",
    from:Number(row.querySelector("[data-zone-from]")?.value||0),
    to:Number(row.querySelector("[data-zone-to]")?.value||0),
    color:row.querySelector("[data-zone-color]")?.value||"#4da8ff"
  }));
  el("#addZone").onclick=()=>{zones.push({label:"Neue Zone",from:0,to:0,color:"#4da8ff"});state().settings.tableZones=readZones();state().settings.tableZones.push(zones[zones.length-1]);closeOverlay();openLeagueEditor(id)};
  document.querySelectorAll("[data-zone-delete]").forEach(btn=>btn.onclick=()=>{const current=readZones();current.splice(Number(btn.dataset.zoneDelete),1);state().settings.tableZones=current;closeOverlay();openLeagueEditor(id)});
  el("#saveLeague").onclick=()=>{
    pushUndo("Liga bearbeitet");
    state().settings.tableZones=readZones();
    if(id){l.name=el("#lName").value||l.name;l.country=el("#lCountry").value||l.country;active.name=el("#lSeason").value||active.name;}
    else{const lid=nextId(state().leagues),sid=nextId(state().leagues.flatMap(x=>x.seasons));state().leagues.push({id:lid,name:el("#lName").value||"Neue Liga",country:el("#lCountry").value||"Fantasy",seasons:[{id:sid,name:el("#lSeason").value||"2026/27",status:"active",teamIds:[],matches:[],history:{championTeamId:null,finalTable:[],awards:{},playerSnapshots:[]}}],records:{}});state().activeLeagueId=lid;state().activeSeasonId=sid;}
    saveState({label:"Liga und Tabellenzonen gespeichert"});closeOverlay();render();toast("Liga gespeichert");
  };
  const archive=el("#archiveSeason");if(archive)archive.onclick=archiveCurrentSeason;
}

function archiveCurrentSeason(){
  const unplayed=season().matches.filter(m=>m.status!=="played");
  if(unplayed.length){
    return toast(`${unplayed.length} Spiele sind noch nicht beendet`);
  }
  if(!season().matches.length)return toast("Es gibt noch keinen Spielplan");
  if(!confirm("Saison wirklich abschließen und archivieren?"))return;
  pushUndo("Saison abgeschlossen");
  const active=season(),l=league(),final=standingsAt(state()),champ=final[0]?.id||null;
  active.status="archived";active.history={championTeamId:champ,finalTable:deepClone(final),awards:{topScorer:topSnapshot("goals"),topAssist:topSnapshot("assists")},playerSnapshots:activeTeams().flatMap(t=>t.players.map(p=>({playerId:p.id,teamId:t.id,name:p.name,stats:deepClone(p.stats)})))};
  final.forEach((r,i)=>{const t=team(r.id);t.history.push({season:active.name,position:i+1,points:r.pts,gf:r.gf,ga:r.ga});});
  activeTeams().forEach(t=>t.players.forEach(p=>{p.history.push({season:active.name,teamId:t.id,stats:deepClone(p.stats),rating:p.rating});}));processPlayerDevelopment();
 final.forEach((r,i)=>seasonFinance(team(r.id),i+1));
 if(state().manager.aiTransfers!==false)runAiWindow(false);
 state().careerMeta.seasonsPlayed=Number(state().careerMeta.seasonsPlayed||0)+1;
 updateCareerRecords(state(),{name:active.name,table:final,playerStats:activeTeams().flatMap(t=>t.players.map(p=>({playerId:p.id,playerName:p.name,goals:p.stats?.goals||0})))});
 for(const t of activeTeams())for(const p of t.players){const candidate=hallOfFameCandidate(p,t.name);if(candidate&&!state().hallOfFame.some(x=>x.id===candidate.id))state().hallOfFame.push(candidate)}
 if(state().settings.autoBackup)state().backups.push(snapshotCareer(state(),`Saisonende ${active.name}`));
 compactCareerState(state());
 pushNews("saison",`Saison ${active.name} abgeschlossen`,`Finanzen, Spieleralterung, Rekorde und Transferfenster wurden verarbeitet.`);
  const sid=nextId(state().leagues.flatMap(x=>x.seasons));l.seasons.push({id:sid,name:prompt("Neue Saisonbezeichnung","2027/28")||"Neue Saison",status:"active",teamIds:[...active.teamIds],matches:[],history:{championTeamId:null,finalTable:[],awards:{},playerSnapshots:[]}});state().activeSeasonId=sid;saveState();closeOverlay();render();toast("Saison archiviert");
}
function topSnapshot(field){const arr=activeTeams().flatMap(t=>t.players.map(p=>({playerId:p.id,name:p.name,teamId:t.id,value:p.stats[field]}))).sort((a,b)=>b.value-a.value);return arr[0]||null}
function openHistory(){
  const archived=state().leagues.flatMap(l=>l.seasons.filter(s=>s.status==="archived").map(s=>({league:l,season:s})));
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Ligahistorie</h2><button class="iconbtn" id="close">×</button></div>${archived.length?archived.map((x,i)=>`<div class="history-row" data-history="${i}"><div><b>${x.league.name} · ${x.season.name}</b><div class="small muted">Meister: ${getTeam(state(),x.season.history.championTeamId)?.name||"–"} · Torschütze: ${x.season.history.awards?.topScorer?.name||"–"}</div></div><span>›</span></div>`).join(""):`<div class="empty">Noch keine abgeschlossene Saison.</div>`}</div></div>`;
  el("#close").onclick=closeOverlay;document.querySelectorAll("[data-history]").forEach(r=>r.onclick=()=>{const x=archived[Number(r.dataset.history)];el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>${x.league.name} ${x.season.name}</h2><button class="iconbtn" id="close">×</button></div>${tableHTML(x.season.history.finalTable,null)}<div class="card"><h3>Saisonpreise</h3><p>Torschützenkönig: <b>${x.season.history.awards?.topScorer?.name||"–"}</b></p><p>Meiste Vorlagen: <b>${x.season.history.awards?.topAssist?.name||"–"}</b></p></div></div></div>`;el("#close").onclick=openHistory;});
}
function openRecords(){
  const played=season().matches.filter(m=>m.status==="played");
  let biggest=null,mostGoals=null;
  for(const m of played){
    const diff=Math.abs(m.homeGoals-m.awayGoals),total=m.homeGoals+m.awayGoals;
    if(!biggest||diff>biggest.diff)biggest={m,diff};
    if(!mostGoals||total>mostGoals.total)mostGoals={m,total};
  }
  const rec=(x)=>x?`${team(x.m.homeId).name} ${x.m.homeGoals}:${x.m.awayGoals} ${team(x.m.awayId).name}`:"–";
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Ligarekorde</h2><button class="iconbtn" id="close">×</button></div><div class="card"><h3>Höchster Sieg</h3><p>${rec(biggest)}</p></div><div class="card"><h3>Torreichstes Spiel</h3><p>${rec(mostGoals)}</p></div><div class="card"><h3>Meiste Tore</h3>${topPlayers("goals",10)}</div></div></div>`;el("#close").onclick=closeOverlay;
}
function openHeadToHead(){
  const opts=activeTeams().map(t=>`<option value="${t.id}">${t.name}</option>`).join("");
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Direkter Vergleich</h2><button class="iconbtn" id="close">×</button></div><div class="form-grid"><div class="field"><label>Team 1</label><select id="h2hA">${opts}</select></div><div class="field"><label>Team 2</label><select id="h2hB">${opts}</select></div></div><button id="calcH2H" class="btn primary" style="width:100%;margin-top:12px">Auswerten</button><div id="h2hResult"></div></div></div>`;el("#close").onclick=closeOverlay;if(activeTeams()[1])el("#h2hB").value=activeTeams()[1].id;
  el("#calcH2H").onclick=()=>{const a=Number(el("#h2hA").value),b=Number(el("#h2hB").value),games=league().seasons.flatMap(s=>s.matches).filter(m=>m.status==="played"&&((m.homeId===a&&m.awayId===b)||(m.homeId===b&&m.awayId===a)));let aw=0,bw=0,d=0,ag=0,bg=0;for(const m of games){const aGoals=m.homeId===a?m.homeGoals:m.awayGoals,bGoals=m.homeId===b?m.homeGoals:m.awayGoals;ag+=aGoals;bg+=bGoals;if(aGoals>bGoals)aw++;else if(bGoals>aGoals)bw++;else d++;}el("#h2hResult").innerHTML=`<div class="card"><h3>${team(a).name} vs. ${team(b).name}</h3><div class="kpis"><div class="kpi"><b>${games.length}</b><span>Spiele</span></div><div class="kpi"><b>${aw}</b><span>Siege ${team(a).short}</span></div><div class="kpi"><b>${d}</b><span>Unentschieden</span></div><div class="kpi"><b>${bw}</b><span>Siege ${team(b).short}</span></div></div><p>Tore: ${ag}:${bg}</p></div>`;};
}


function openSeasonReview(){
  const st=standingsAt(state()), played=season().matches.filter(m=>m.status==="played");
  const goals=played.reduce((n,m)=>n+m.homeGoals+m.awayGoals,0);
  const bestAttack=[...st].sort((a,b)=>b.gf-a.gf)[0];
  const bestDefense=[...st].sort((a,b)=>a.ga-b.ga)[0];
  const avgAttendance=played.length?Math.round(played.reduce((n,m)=>n+Number(m.attendance||0),0)/played.length):0;
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Saisonanalyse</h2><button class="iconbtn" id="close">×</button></div>
    <section class="hero"><div class="eyebrow">Season Intelligence</div><h1>${league().name}</h1><p>${season().name}</p>
      <div class="kpis"><div class="kpi"><b>${played.length}</b><span>Spiele</span></div><div class="kpi"><b>${goals}</b><span>Tore</span></div><div class="kpi"><b>${avgAttendance}</b><span>Ø Zuschauer</span></div><div class="kpi"><b>${st[0]?.name||"–"}</b><span>Leader</span></div></div>
    </section>
    <div class="card"><div class="stat-pair"><span>Beste Offensive</span><b>${bestAttack?.name||"–"} (${bestAttack?.gf||0})</b></div><div class="stat-pair"><span>Beste Defensive</span><b>${bestDefense?.name||"–"} (${bestDefense?.ga||0})</b></div><div class="stat-pair"><span>Torschützenkönig</span><b>${topSnapshot("goals")?.name||"–"}</b></div><div class="stat-pair"><span>Assist-König</span><b>${topSnapshot("assists")?.name||"–"}</b></div></div>
    <div class="card"><h3>Top 5</h3>${tableHTML(st.slice(0,5),null)}</div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
}


function renderSearchResults(query){
  const box=el("#searchResults");
  if(!box)return;
  const q=String(query||"").trim().toLocaleLowerCase("de-DE");
  if(q.length<2){box.innerHTML="";return}

  const teams=activeTeams()
    .filter(t=>`${t.name} ${t.short} ${t.stadium.name}`.toLocaleLowerCase("de-DE").includes(q))
    .slice(0,6);

  const players=activeTeams()
    .flatMap(t=>t.players.map(p=>({...p,teamName:t.name})))
    .filter(p=>`${p.name} ${p.teamName} ${p.position}`.toLocaleLowerCase("de-DE").includes(q))
    .slice(0,10);

  box.innerHTML=`<div class="autocomplete-results">
    <div class="autocomplete-item"><b>Suchergebnisse</b><span class="small muted">${teams.length+players.length} Treffer</span></div>
    ${teams.map(t=>`<button type="button" class="autocomplete-item autocomplete-button" data-search-team="${t.id}"><div>${badge(t)}</div><div style="flex:1;text-align:left"><b>${t.name}</b><div class="small muted">${t.stadium.name}</div></div><span>›</span></button>`).join("")}
    ${players.map(p=>`<button type="button" class="autocomplete-item autocomplete-button" data-search-player="${p.id}"><div class="player-avatar">${p.shirtNumber}</div><div style="flex:1;text-align:left"><b>${p.name}</b><div class="small muted">${p.teamName} · ${p.position}</div></div><span class="rating-pill">${p.rating}</span></button>`).join("")}
    ${!teams.length&&!players.length?`<div class="empty">Nichts gefunden.</div>`:""}
  </div>`;

  box.querySelectorAll("[data-search-team]").forEach(node=>node.addEventListener("click",()=>{
    box.innerHTML="";
    const input=el("#globalSearch");if(input)input.value="";
    openTeam(Number(node.dataset.searchTeam));
  }));
  box.querySelectorAll("[data-search-player]").forEach(node=>node.addEventListener("click",()=>{
    box.innerHTML="";
    const input=el("#globalSearch");if(input)input.value="";
    openPlayerProfile(Number(node.dataset.searchPlayer));
  }));
}
function openValidation(){
  const errors=validateState(state());
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Datenprüfung</h2><button class="iconbtn" id="close">×</button></div>
    <div class="card">${errors.length?`<h3>${errors.length} Probleme gefunden</h3>${errors.map(e=>`<div class="news-card">${e}</div>`).join("")}`:`<h3>Alles in Ordnung ✓</h3><p class="muted">Keine strukturellen Datenfehler gefunden.</p>`}</div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
}


function managerTeam(){return team(Number(state().manager?.managedTeamId))}
function pushNews(type,title,body="",teamId=null,playerId=null){
 state().news.unshift({id:Date.now()+Math.random(),type,title,body,teamId,playerId,date:new Date().toISOString().slice(0,10)});
 state().news=state().news.slice(0,200);
}

function downloadTextFile(filename,text,type="application/json"){
 const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function openCareerCenter(){
 const s=state(),validation=validateCareerState(s),bytes=new Blob([JSON.stringify(s)]).size;
 el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><div><div class="eyebrow">V19 Stabilität</div><h2>Karriere & Backups</h2></div><button id="close" class="iconbtn">×</button></div>
 <div class="kpis"><div class="kpi"><b>${s.careerMeta?.seasonsPlayed||0}</b><span>Saisons</span></div><div class="kpi"><b>${(bytes/1024).toFixed(1)} KB</b><span>Spielstand</span></div><div class="kpi"><b>${s.backups?.length||0}</b><span>Backups</span></div><div class="kpi"><b>${validation.ok?"OK":"Fehler"}</b><span>Datenprüfung</span></div></div>
 <div class="card"><h3>Automatische Stabilität</h3><label class="setting-row"><div><b>Automatische Backups</b><div class="small muted">Alle sechs Stunden sowie bei wichtigen Karriereereignissen.</div></div><input id="autoBackup" type="checkbox" ${s.settings.autoBackup?"checked":""}></label><label class="setting-row"><div><b>Letzten Wettbewerb wieder öffnen</b><div class="small muted">Nach Neustart dort fortsetzen, wo du warst.</div></div><input id="resumeView" type="checkbox" ${s.settings.resumeLastView?"checked":""}></label><label class="setting-row"><div><b>Performance-Modus</b><div class="small muted">Reduziert Langzeitdaten stärker bei sehr langen Karrieren.</div></div><input id="performanceMode" type="checkbox" ${s.settings.performanceMode?"checked":""}></label></div>
 <div class="card"><h3>Spielstand sichern</h3><div class="actions"><button id="createBackupNow" class="btn primary">Backup jetzt erstellen</button><button id="exportCareer" class="btn secondary">Karriere exportieren</button><label class="btn secondary file-label">Karriere importieren<input id="importCareer" type="file" accept=".json,application/json" hidden></label></div></div>
 <div class="card"><h3>Backups</h3>${(s.backups||[]).slice().reverse().map(b=>`<div class="history-row"><div><b>${b.label}</b><div class="small muted">${new Date(b.createdAt).toLocaleString("de-DE")} · ${(b.bytes/1024).toFixed(1)} KB</div></div><button class="btn secondary" data-restore-backup="${b.id}">Wiederherstellen</button></div>`).join("")||`<div class="empty">Noch kein Backup vorhanden.</div>`}</div>
 <div class="card"><h3>Datenprüfung</h3><div class="${validation.ok?"positive":"negative"}">${validation.ok?"Spielstand strukturell in Ordnung.":validation.errors.join("<br>")}</div>${validation.warnings.map(w=>`<div class="small muted">${w}</div>`).join("")}</div></div></div>`;
 el("#close").onclick=closeOverlay;
 ["autoBackup","resumeView","performanceMode"].forEach(id=>el("#"+id).onchange=()=>{const key=id==="resumeView"?"resumeLastView":id;state().settings[key]=el("#"+id).checked;persistCareer("Einstellungen")});
 el("#createBackupNow").onclick=()=>{state().backups.push(snapshotCareer(state(),"Manuelles Backup"));compactCareerState(state());persistCareer("Backup");openCareerCenter();toast("Backup erstellt")};
 el("#exportCareer").onclick=()=>downloadTextFile(`fantasy-liga-karriere-v19-${new Date().toISOString().slice(0,10)}.json`,createSaveExport(state()));
 el("#importCareer").onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{const imported=parseSaveImport(await file.text()),check=validateCareerState(imported);if(!check.ok)throw new Error(check.errors.join(", "));await importState(new File([JSON.stringify(imported)],"import-v19.json",{type:"application/json"}));location.reload()}catch(err){alert("Import fehlgeschlagen: "+err.message)}};
 document.querySelectorAll("[data-restore-backup]").forEach(b=>b.onclick=async()=>{const snap=state().backups.find(x=>x.id===Number(b.dataset.restoreBackup));if(!snap)return;if(confirm("Diesen Spielstand wiederherstellen?")){await importState(new File([JSON.stringify(restoreSnapshot(snap))],"restore-v19.json",{type:"application/json"}));location.reload()}});
}
function openRecordsCenter(){
 const s=state(),records=s.records||{},hof=(s.hallOfFame||[]).sort((a,b)=>b.score-a.score);
 const titleRows=Object.entries(records.mostTitles||{}).sort((a,b)=>b[1]-a[1]).slice(0,20);
 el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><div><div class="eyebrow">Langzeitkarriere</div><h2>Rekorde & Hall of Fame</h2></div><button id="close" class="iconbtn">×</button></div>
 <div class="kpis"><div class="kpi"><b>${records.mostGoalsSeason?.goals||"–"}</b><span>Meiste Saisontore</span></div><div class="kpi"><b>${records.mostPointsSeason?.points||"–"}</b><span>Punkterekord</span></div><div class="kpi"><b>${hof.length}</b><span>Legenden</span></div></div>
 <div class="card"><h3>Titelhistorie</h3>${titleRows.map(([id,n],i)=>`<div class="history-row"><div><b>${i+1}. ${team(Number(id))?.name||"Unbekannt"}</b></div><b>${n} Titel</b></div>`).join("")||`<div class="empty">Noch keine archivierten Titel.</div>`}</div>
 <div class="card"><h3>Hall of Fame</h3>${hof.map((p,i)=>`<div class="history-row"><div><b>${i+1}. ${p.name}</b><div class="small muted">${p.teamName} · ${p.position} · ${p.apps} Spiele · ${p.goals} Tore · ${p.assists} Vorlagen</div></div><b>${p.score}</b></div>`).join("")||`<div class="empty">Legenden werden bei langen Karrieren automatisch aufgenommen.</div>`}</div></div></div>`;
 el("#close").onclick=closeOverlay;
}
function openManagerControl(){
 const teams=activeTeams(),managed=managerTeam();
 el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><div><div class="eyebrow">Manager-Modus</div><h2>Mein Verein & KI-Steuerung</h2></div><button id="close" class="iconbtn">×</button></div>
 <div class="card"><h3>Dein fester Verein</h3><p class="muted">Bei diesem Verein führt die KI keine Transfers durch. Du kannst ihn jederzeit wechseln.</p>
 <div class="field"><label>Mein Verein</label><select id="managedTeam"><option value="">Kein fester Verein</option>${teams.map(t=>`<option value="${t.id}" ${state().manager.managedTeamId===t.id?"selected":""}>${t.name}</option>`).join("")}</select></div></div>
 <div class="card"><div class="section-head"><div><h3>KI-Vereine</h3><div class="small muted">Du darfst trotzdem jederzeit manuell Spieler, Finanzen und Teams ändern.</div></div><button id="runAiWindow" class="btn primary">KI-Transferfenster starten</button></div>
 ${teams.map(t=>`<label class="setting-row"><div><b>${t.name}${t.id===state().manager.managedTeamId?" · Dein Verein":""}</b><div class="small muted">${t.players.length} Spieler · Budget ${money(t.finance?.transferBudget)}</div></div><input type="checkbox" data-ai-team="${t.id}" ${t.aiEnabled!==false&&t.id!==state().manager.managedTeamId?"checked":""} ${t.id===state().manager.managedTeamId?"disabled":""}></label>`).join("")}</div>
 <div class="card"><h3>KI-Grundsätze</h3><div class="settings-list"><label class="setting-row"><div><b>Automatische KI-Transfers</b><div class="small muted">Beim Saisonwechsel öffnet sich automatisch ein Transferfenster.</div></div><input id="autoAiTransfers" type="checkbox" ${state().manager.aiTransfers!==false?"checked":""}></label></div></div>
 </div></div>`;
 el("#close").onclick=closeOverlay;
 el("#managedTeam").onchange=()=>{const old=state().manager.managedTeamId;state().manager.managedTeamId=Number(el("#managedTeam").value)||null;if(old&&team(old))team(old).aiEnabled=true;if(managerTeam())managerTeam().aiEnabled=false;persistCareer("Managerverein");openManagerControl();toast("Managerverein gespeichert")};
 el("#autoAiTransfers").onchange=()=>{state().manager.aiTransfers=el("#autoAiTransfers").checked;saveState()};
 document.querySelectorAll("[data-ai-team]").forEach(x=>x.onchange=()=>{team(Number(x.dataset.aiTeam)).aiEnabled=x.checked;saveState()});
 el("#runAiWindow").onclick=()=>runAiWindow(true);
}
function runAiWindow(reopen=false){
 ensureWorldMarket(Math.max(120,activeTeams().length*8));
 pushUndo("KI-Transferfenster");
 const count=aiTransferWindow({teams:activeTeams(),freeAgents:state().freeAgents,managedTeamId:state().manager.managedTeamId,news:state().news,transferLog:state().transferLog,nextId:globalPlayerId,contractSeason});
 state().manager.lastAiWindow=new Date().toISOString();persistCareer("KI-Transferfenster");if(reopen)openManagerControl();toast(`${count} KI-Transfers durchgeführt`);
}
function openFinanceCenter(selectedId=null){
 const teams=activeTeams(),selected=team(Number(selectedId))||managerTeam()||teams[0];if(!selected)return;
 selected.finance ||= defaultFinance(selected);recalcWages(selected);
 const f=selected.finance;
 el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><div><div class="eyebrow">Finanzzentrum</div><h2>${selected.name}</h2></div><button id="close" class="iconbtn">×</button></div>
 <div class="field"><label>Verein anzeigen</label><select id="financeTeam">${teams.map(t=>`<option value="${t.id}" ${t.id===selected.id?"selected":""}>${t.name}</option>`).join("")}</select></div>
 <div class="kpis"><div class="kpi"><b>${money(f.balance)}</b><span>Kontostand</span></div><div class="kpi"><b>${money(f.transferBudget)}</b><span>Transferbudget</span></div><div class="kpi"><b>${money(f.wageExpense)}</b><span>Jahresgehälter</span></div><div class="kpi"><b>${money(f.sponsorIncome)}</b><span>Sponsor/Jahr</span></div></div>
 <div class="card"><h3>Finanzen bearbeiten</h3><div class="form-grid"><div class="field"><label>Kontostand</label><input id="finBalance" type="number" value="${Math.round(f.balance)}"></div><div class="field"><label>Transferbudget</label><input id="finBudget" type="number" value="${Math.round(f.transferBudget)}"></div><div class="field"><label>Sponsor pro Saison</label><input id="finSponsor" type="number" value="${Math.round(f.sponsorIncome)}"></div><div class="field"><label>Ticketpreis</label><input id="finTicket" type="number" value="${f.ticketPrice}"></div></div><button id="saveFinance" class="btn primary">Änderungen speichern</button></div>
 <div class="card"><h3>Eigene Buchung</h3><div class="form-grid"><div class="field"><label>Bezeichnung</label><input id="customFinLabel" value="Manuelle Anpassung"></div><div class="field"><label>Betrag (+ Einnahme / − Ausgabe)</label><input id="customFinAmount" type="number" value="0"></div></div><button id="addFinance" class="btn secondary">Buchung hinzufügen</button></div>
 <div class="card"><h3>Letzte Buchungen</h3>${f.transactions.slice(0,30).map(x=>`<div class="history-row"><div><b>${x.label}</b><div class="small muted">${x.date} · ${x.type}</div></div><b class="${x.amount>=0?"positive":"negative"}">${x.amount>=0?"+":""}${money(x.amount)}</b></div>`).join("")||`<div class="empty">Noch keine Buchungen.</div>`}</div>
 </div></div>`;
 el("#close").onclick=closeOverlay;el("#financeTeam").onchange=()=>openFinanceCenter(Number(el("#financeTeam").value));
 el("#saveFinance").onclick=()=>{pushUndo("Finanzen geändert");f.balance=Number(el("#finBalance").value);f.transferBudget=Number(el("#finBudget").value);f.sponsorIncome=Number(el("#finSponsor").value);f.ticketPrice=Number(el("#finTicket").value);persistCareer("Finanzen");openFinanceCenter(selected.id);toast("Finanzen gespeichert")};
 el("#addFinance").onclick=()=>{pushUndo("Finanzbuchung");addTransaction(selected,"manual",Number(el("#customFinAmount").value),el("#customFinLabel").value||"Manuelle Anpassung");saveState();openFinanceCenter(selected.id)};
}
function openNewsCenter(){
 const items=state().news||[];
 el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><div><div class="eyebrow">Fußballwelt</div><h2>Nachrichten & Schlagzeilen</h2></div><button id="close" class="iconbtn">×</button></div>
 <div class="actions"><button id="createHeadline" class="btn secondary">+ Eigene Meldung</button><button id="clearNews" class="btn danger">Alle löschen</button></div>
 <div style="margin-top:12px">${items.map(n=>`<article class="news-card"><div class="eyebrow">${n.date} · ${n.type}</div><h3>${n.title}</h3><p>${n.body||""}</p></article>`).join("")||`<div class="empty">Noch keine Nachrichten. KI-Transfers und Wettbewerbe erzeugen automatisch Meldungen.</div>`}</div></div></div>`;
 el("#close").onclick=closeOverlay;el("#clearNews").onclick=()=>{if(confirm("Alle Nachrichten löschen?")){state().news=[];saveState();openNewsCenter()}};
 el("#createHeadline").onclick=()=>{const title=prompt("Überschrift:");if(!title)return;const body=prompt("Text:")||"";pushNews("eigene Meldung",title,body);saveState();openNewsCenter()};
}
function teamOptionsForCompetition(selected=[]){
 return state().teams.map(t=>`<label class="competition-team-select"><input type="checkbox" data-comp-team="${t.id}" ${selected.includes(t.id)?"checked":""}>${badge(t)}<span>${t.name}</span></label>`).join("");
}
function openCompetitionStudio(){
 const comps=state().competitions||[];
 el("#overlay").innerHTML=`<div class="modal"><div class="sheet competition-sheet"><div class="sheet-head"><div><div class="eyebrow">International & frei gestaltbar</div><h2>Wettbewerbs-Studio</h2></div><button id="close" class="iconbtn">×</button></div>
 <button id="newCompetition" class="btn primary" style="width:100%">+ Wettbewerb komplett selbst erstellen</button>
 <div class="competition-list">${comps.map(c=>`<article class="card"><div class="section-head"><div><div class="eyebrow">${c.type==="groups"?"Gruppenphase + K.-o.":"K.-o.-System"} · ${c.teamIds.length} Teams</div><h3>${c.name}</h3><div class="small muted">${c.status==="finished"?"Sieger: "+(team(c.winnerTeamId)?.name||"?"):`${c.groups.length} Gruppen · ${c.rounds.length} K.-o.-Runden`}</div></div><button class="btn secondary" data-open-comp="${c.id}">Öffnen</button></div></article>`).join("")||`<div class="empty">Noch kein eigener Wettbewerb angelegt.</div>`}</div></div></div>`;
 el("#close").onclick=closeOverlay;el("#newCompetition").onclick=openCompetitionBuilder;document.querySelectorAll("[data-open-comp]").forEach(b=>b.onclick=()=>openCompetition(Number(b.dataset.openComp)));
}
function openCompetitionBuilder(){
 el("#overlay").innerHTML=`<div class="modal"><div class="sheet competition-sheet"><div class="sheet-head"><h2>Wettbewerb konfigurieren</h2><button id="close" class="iconbtn">×</button></div>
 <div class="form-grid"><div class="field"><label>Name</label><input id="compName" value="Champions Cup"></div><div class="field"><label>Format</label><select id="compType"><option value="groups">Gruppenphase + K.-o.-Phase</option><option value="knockout">Nur K.-o.-Runden</option></select></div>
 <div class="field group-setting"><label>Gruppengröße</label><select id="compGroupSize">${[3,4,5,6,7,8].map(n=>`<option ${n===4?"selected":""}>${n}</option>`).join("")}</select></div>
 <div class="field group-setting"><label>Weiter pro Gruppe</label><select id="compQualifiers">${[1,2,3,4].map(n=>`<option ${n===2?"selected":""}>${n}</option>`).join("")}</select></div>
 <div class="field group-setting"><label>Gruppenphase</label><select id="compGroupLegs"><option value="1">Einmal gegeneinander</option><option value="2" selected>Hin- und Rückrunde</option></select></div>
 <div class="field"><label>K.-o.-Duelle</label><select id="compKoLegs"><option value="1">Ein Spiel</option><option value="2" selected>Hin- und Rückspiel</option></select></div>
 <div class="field"><label>Finale</label><select id="compFinalLegs"><option value="1" selected>Ein Spiel</option><option value="2">Hin- und Rückspiel</option></select></div></div>
 <div class="card"><div class="section-head"><h3>Teilnehmende Vereine</h3><button id="toggleAllCompTeams" class="btn secondary">Alle auswählen</button></div><div class="competition-team-grid">${teamOptionsForCompetition()}</div></div>
 <button id="createCompetitionNow" class="btn primary" style="width:100%">Wettbewerb erstellen und auslosen</button></div></div>`;
 el("#close").onclick=openCompetitionStudio;
 const toggleGroup=()=>document.querySelectorAll(".group-setting").forEach(x=>x.style.display=el("#compType").value==="groups"?"":"none");el("#compType").onchange=toggleGroup;toggleGroup();
 el("#toggleAllCompTeams").onclick=()=>{const all=[...document.querySelectorAll("[data-comp-team]")],on=all.some(x=>!x.checked);all.forEach(x=>x.checked=on)};
 el("#createCompetitionNow").onclick=()=>{const ids=normalizeCompetitionParticipants([...document.querySelectorAll("[data-comp-team]:checked")].map(x=>Number(x.dataset.compTeam)));if(ids.length<2)return toast("Mindestens zwei Vereine auswählen");
  const type=el("#compType").value,groupSize=Number(el("#compGroupSize").value),qual=Number(el("#compQualifiers").value);if(type==="groups"&&qual>=groupSize)return toast("Es müssen weniger Teams weiterkommen als in der Gruppe spielen");
  pushUndo("Wettbewerb erstellt");const c=createCompetition({id:nextId(state().competitions),name:el("#compName").value.trim()||"Pokal",type,scope:"international",groupSize,qualifiersPerGroup:qual,groupLegs:Number(el("#compGroupLegs").value),knockoutLegs:Number(el("#compKoLegs").value),finalLegs:Number(el("#compFinalLegs").value)},ids);
  state().competitions.push(c);pushNews("wettbewerb",`${c.name} wurde ausgelost`,`${ids.length} Vereine nehmen teil.`);persistCareer("Wettbewerb erstellt");openCompetition(c.id)};
}
function competitionMatchLine(m){return `<div class="match"><div class="match-main"><div class="home">${team(m.homeId)?.short||"?"}</div><div class="score">${m.played?`${m.homeGoals}:${m.awayGoals}`:"– : –"}</div><div>${team(m.awayId)?.short||"?"}</div></div></div>`}
function openCompetition(id){
 const c=state().competitions.find(x=>x.id===id);if(!c)return openCompetitionStudio();
 rememberView("competition",id);const diag=competitionDiagnostics(c);
 el("#overlay").innerHTML=`<div class="modal"><div class="sheet competition-sheet"><div class="sheet-head"><div><div class="eyebrow">${c.status}</div><h2>${c.name}</h2></div><button id="close" class="iconbtn">×</button></div>
 ${c.winnerTeamId?`<div class="world-hero"><div><b>🏆 ${team(c.winnerTeamId)?.name||"Sieger"}</b><span>Gewinner des Wettbewerbs</span></div></div>`:""}<div class="kpis competition-kpis"><div class="kpi"><b>${diag.teamCount}</b><span>Teams</span></div><div class="kpi"><b>${diag.progress}%</b><span>Fortschritt</span></div><div class="kpi"><b>${diag.estimatedByes}</b><span>mögliche Freilose</span></div></div>
 ${c.groups.map(g=>{const tableRows=groupTable(g);return `<div class="card"><h3>Gruppe ${g.name}</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Team</th><th>Sp</th><th>TD</th><th>Pkt</th></tr></thead><tbody>${tableRows.map((r,i)=>`<tr><td>${i+1}</td><td>${team(r.id)?.name||"?"}</td><td>${r.p}</td><td>${r.gf-r.ga}</td><td><b>${r.pts}</b></td></tr>`).join("")}</tbody></table></div><details><summary>Spiele anzeigen</summary>${g.matches.map(competitionMatchLine).join("")}</details></div>`}).join("")}
 ${c.rounds.map(r=>`<div class="card"><h3>${r.name}</h3>${(r.byes||[]).map(id=>`<div class="small muted">${team(id)?.name} hat ein Freilos</div>`).join("")}${r.ties.map(t=>`<div class="competition-tie"><b>${team(t.homeId)?.name} – ${team(t.awayId)?.name}</b>${t.matches.map(competitionMatchLine).join("")}${t.played?`<div class="small muted">Gesamt ${t.aggregateHome}:${t.aggregateAway} · Weiter: ${team(t.winnerId)?.name}</div>`:""}</div>`).join("")}</div>`).join("")}
 <div class="actions"><button id="simulateComp" class="btn primary" ${c.status==="finished"?"disabled":""}>Nächsten Abschnitt simulieren</button><button id="deleteComp" class="btn danger">Wettbewerb löschen</button></div></div></div>`;
 el("#close").onclick=openCompetitionStudio;
 el("#simulateComp").onclick=()=>{pushUndo("Wettbewerb simuliert");const message=simulateCompetitionStep(c);if(c.status==="finished"){pushNews("titel",`${team(c.winnerTeamId)?.name} gewinnt ${c.name}`,`Das Finale ist entschieden.`);const winner=team(c.winnerTeamId);if(winner){addTransaction(winner,"prize",1000000,`Siegprämie ${c.name}`)}}persistCareer("Wettbewerb");openCompetition(id);toast(message)};
 el("#deleteComp").onclick=()=>{if(confirm("Wettbewerb löschen?")){state().competitions=state().competitions.filter(x=>x.id!==id);saveState();openCompetitionStudio()}};
}
function openCupManager(){
  state().cups ||= [];
  const cups=state().cups.filter(c=>c.leagueId===league().id);
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Pokalverwaltung</h2><button class="iconbtn" id="close">×</button></div>
    <div class="actions"><button id="newCup" class="btn primary">+ Neuer Pokal</button></div>
    <div style="margin-top:12px">${cups.length?cups.map(c=>`<div class="card"><div class="section-head"><h3>${c.name}</h3><button class="btn secondary" data-open-cup="${c.id}">Öffnen</button></div><p class="muted">${c.rounds.length} Runden · ${c.status}</p></div>`).join(""):`<div class="empty">Noch kein Pokal angelegt.</div>`}</div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
  el("#newCup").onclick=openNewCup;
  document.querySelectorAll("[data-open-cup]").forEach(b=>b.onclick=()=>openCup(Number(b.dataset.openCup)));
}
function openNewCup(){
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Neuer Pokal</h2><button class="iconbtn" id="close">×</button></div>
    <div class="field"><label>Name</label><input id="cupName" value="Ligapokal"></div>
    <button id="createCup" class="btn primary" style="width:100%;margin-top:12px">Auslosen</button>
  </div></div>`;
  el("#close").onclick=openCupManager;
  el("#createCup").onclick=()=>{pushUndo("Pokal erstellt");const ids=[...season().teamIds].sort(()=>Math.random()-.5);
    const round=[],byes=[];
    for(let i=0;i<ids.length;i+=2){
      if(ids[i+1]!==undefined)round.push({id:round.length+1,homeId:ids[i],awayId:ids[i+1],played:false,homeGoals:0,awayGoals:0});
      else byes.push(ids[i]);
    }
    const cup={id:nextId(state().cups),leagueId:league().id,seasonId:season().id,name:el("#cupName").value.trim()||"Pokal",status:"active",rounds:[round],pendingByes:byes};state().cups.push(cup);saveState();openCup(cup.id);};
}
function openCup(id){
  const cup=state().cups.find(c=>c.id===id);
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>${cup.name}</h2><button class="iconbtn" id="close">×</button></div>
    ${cup.rounds.map((round,ri)=>`<div class="card"><h3>Runde ${ri+1}</h3>${round.map(t=>`<div class="match"><div class="match-main"><div class="home">${team(t.homeId)?.short||"?"}</div><div class="score">${t.played?`${t.homeGoals}:${t.awayGoals}`:"– : –"}</div><div>${team(t.awayId)?.short||"?"}</div></div></div>`).join("")}</div>`).join("")}
    <div class="actions"><button id="simulateCup" class="btn primary">Aktuelle Runde simulieren</button><button id="deleteCup" class="btn danger">Pokal löschen</button></div>
  </div></div>`;
  el("#close").onclick=openCupManager;
  el("#simulateCup").onclick=()=>{pushUndo("Pokalrunde simuliert");const current=cup.rounds[cup.rounds.length-1];if(current.some(t=>!t.played)){current.forEach(t=>{t.homeGoals=Math.floor(Math.random()*4);t.awayGoals=Math.floor(Math.random()*4);if(t.homeGoals===t.awayGoals)t.homeGoals++;t.played=true;});let winners=current.map(t=>t.homeGoals>t.awayGoals?t.homeId:t.awayId);
      if(cup.pendingByes?.length){winners=[...winners,...cup.pendingByes];cup.pendingByes=[]}
      if(winners.length>1){
        const next=[],nextByes=[];
        for(let i=0;i<winners.length;i+=2){
          if(winners[i+1]!==undefined)next.push({id:next.length+1,homeId:winners[i],awayId:winners[i+1],played:false,homeGoals:0,awayGoals:0});
          else nextByes.push(winners[i]);
        }
        cup.pendingByes=nextByes;
        if(next.length)cup.rounds.push(next);
        else if(nextByes.length===1){cup.status="finished";cup.winnerTeamId=nextByes[0]}
      }else{cup.status="finished";cup.winnerTeamId=winners[0]}}saveState();openCup(id);};
  el("#deleteCup").onclick=()=>{if(confirm("Pokal löschen?")){pushUndo("Pokal gelöscht");state().cups=state().cups.filter(c=>c.id!==id);saveState();openCupManager();}};
}


function openPlayerProfile(playerId){
  const p=playerById(playerId),t=team(p.teamId)||state().teams.find(x=>x.players.some(z=>z.id===p.id));
  const attrs=p.attributes||{};
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet">
    <div class="sheet-head"><h2>Spielerprofil</h2><button class="iconbtn" id="close">×</button></div>
    <div class="card player-hero"><div class="player-avatar-lg">${p.shirtNumber}</div><div><div class="eyebrow">${t?.name||"Ohne Team"}</div><h1 style="margin:4px 0">${p.name}</h1><div class="muted">${p.flag||""} ${p.nationality||"Fantasy"} · ${p.position} · ${p.age} Jahre · ${p.preferredFoot}</div><div class="market-tags"><span>Potenzial ${p.potential||p.rating}</span><span>Vertrag bis ${p.contractUntil||"offen"}</span><span>${p.personality||"Teamspieler"}</span></div></div></div>
    <div class="kpis"><div class="kpi"><b>${p.rating}</b><span>Gesamtstärke</span></div><div class="kpi"><b>${p.stats.goals}</b><span>Tore</span></div><div class="kpi"><b>${p.stats.assists}</b><span>Vorlagen</span></div><div class="kpi"><b>${new Intl.NumberFormat("de-DE",{notation:"compact"}).format(p.value)} €</b><span>Marktwert</span></div></div>
    <div class="card"><h3>Attribute</h3><div class="form-bars">${Object.entries({Tempo:attrs.pace,Abschluss:attrs.shooting,Passen:attrs.passing,Dribbling:attrs.dribbling,Defensive:attrs.defending,Physis:attrs.physical}).map(([k,v])=>`<div class="form-row"><span>${k}</span><div class="bar"><span style="width:${v||60}%"></span></div><b>${v||60}</b></div>`).join("")}</div></div>
    <div class="card"><h3>Karriere</h3>${p.history?.length?p.history.map(h=>`<div class="history-row"><div><b>${h.season}</b><div class="small muted">${h.stats.goals} Tore · ${h.stats.assists} Vorlagen · Stärke ${h.rating}</div></div></div>`).join(""):`<div class="empty">Noch keine abgeschlossene Saison.</div>`}</div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
}

function renderDashboardCharts(){
  const points=el("#pointsChart"),goals=el("#goalsChart");if(!points||!goals)return;
  const top=standingsAt(state()).slice(0,4),max=maxMatchday(state());
  const series=top.map(t=>({name:t.short,color:t.color,values:Array.from({length:max||1},(_,i)=>standingsAt(state(),i+1).find(x=>x.id===t.id)?.pts||0)}));
  drawLineChart(points,series);
  const legend=el("#pointsLegend");if(legend)legend.innerHTML=series.map(s=>`<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${s.name}</div>`).join("");
  const attacks=[...standingsAt(state())].sort((a,b)=>b.gf-a.gf).slice(0,8);
  drawBarChart(goals,attacks.map(x=>({label:x.short,value:x.gf,color:x.color})));
}
function setupCanvas(canvas){
  const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  canvas.width=Math.max(300,rect.width*dpr);canvas.height=Math.max(180,rect.height*dpr);
  const c=canvas.getContext("2d");c.scale(dpr,dpr);return {c,w:rect.width,h:rect.height};
}
function drawLineChart(canvas,series){
  const {c,w,h}=setupCanvas(canvas),pad=28,max=Math.max(1,...series.flatMap(s=>s.values));c.clearRect(0,0,w,h);
  c.strokeStyle="rgba(150,180,200,.18)";c.lineWidth=1;
  for(let i=0;i<5;i++){const y=pad+(h-pad*2)*i/4;c.beginPath();c.moveTo(pad,y);c.lineTo(w-pad,y);c.stroke()}
  series.forEach(s=>{c.strokeStyle=s.color;c.lineWidth=3;c.beginPath();s.values.forEach((v,i)=>{const x=pad+(w-pad*2)*(s.values.length===1?0:i/(s.values.length-1)),y=h-pad-(h-pad*2)*(v/max);i?c.lineTo(x,y):c.moveTo(x,y)});c.stroke()});
}
function drawBarChart(canvas,data){
  const {c,w,h}=setupCanvas(canvas),pad=30,max=Math.max(1,...data.map(d=>d.value)),gap=8,bw=(w-pad*2-gap*(data.length-1))/data.length;c.clearRect(0,0,w,h);
  data.forEach((d,i)=>{const bh=(h-pad*2)*(d.value/max),x=pad+i*(bw+gap),y=h-pad-bh;c.fillStyle=d.color;c.beginPath();c.roundRect(x,y,bw,bh,8);c.fill();c.fillStyle=getComputedStyle(document.body).getPropertyValue("--muted");c.font="11px sans-serif";c.textAlign="center";c.fillText(d.label,x+bw/2,h-8)});
}

let selectedStudioPlayerId=null;
let studioAssignments={};
function openLineupStudio(){
  const teams=activeTeams(),options=teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join("");
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet">
    <div class="sheet-head"><h2>Lineup Studio</h2><button class="iconbtn" id="close">×</button></div>
    <div class="form-grid"><div class="field"><label>Team</label><select id="studioTeam">${options}</select></div><div class="field"><label>Formation</label><select id="studioFormation"><option value="4-3-3">4-3-3</option><option value="4-2-3-1">4-2-3-1</option><option value="4-4-2">4-4-2</option><option value="3-5-2">3-5-2</option></select></div></div>
    <div id="studioBody"></div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
  el("#studioTeam").onchange=()=>{selectedStudioPlayerId=null;studioAssignments={};renderLineupStudio(Number(el("#studioTeam").value))};
  el("#studioFormation").onchange=()=>{state().settings.defaultFormation=el("#studioFormation").value;studioAssignments={};renderLineupStudio(Number(el("#studioTeam").value));saveState()};
  el("#studioFormation").value=state().settings.defaultFormation||"4-3-3";
  renderLineupStudio(teams[0]?.id);
}

function formationSlots(name){
  const maps={
    "4-3-3":[["TW",7,50],["LV",25,16],["IV",23,38],["IV",23,62],["RV",25,84],["ZM",49,24],["ZM",45,50],["ZM",49,76],["LA",73,18],["ST",86,50],["RA",73,82]],
    "4-2-3-1":[["TW",7,50],["LV",25,16],["IV",23,38],["IV",23,62],["RV",25,84],["ZDM",45,38],["ZDM",45,62],["LA",66,20],["ZOM",66,50],["RA",66,80],["ST",86,50]],
    "4-4-2":[["TW",7,50],["LV",25,16],["IV",23,38],["IV",23,62],["RV",25,84],["LM",52,15],["ZM",48,39],["ZM",48,61],["RM",52,85],["ST",82,38],["ST",82,62]],
    "3-5-2":[["TW",7,50],["IV",25,26],["IV",23,50],["IV",25,74],["LAV",50,10],["ZM",48,34],["ZOM",60,50],["ZM",48,66],["RAV",50,90],["ST",82,38],["ST",82,62]],
    "3-4-3":[["TW",7,50],["IV",25,25],["IV",23,50],["IV",25,75],["LM",50,15],["ZM",47,40],["ZM",47,60],["RM",50,85],["LA",76,20],["ST",86,50],["RA",76,80]],
    "5-3-2":[["TW",7,50],["LV",27,9],["IV",24,31],["IV",23,50],["IV",24,69],["RV",27,91],["ZM",50,28],["ZM",47,50],["ZM",50,72],["ST",82,38],["ST",82,62]]
  };
  return maps[name]||maps["4-3-3"];
}

function renderLineupStudio(teamId){
  const t=team(teamId);if(!t)return;
  const positions=formationSlots(state().settings.defaultFormation||"4-3-3");
  el("#studioBody").innerHTML=`<div class="pitch-layout" style="margin-top:12px">
    <div>
      <div class="touch-help">${selectedStudioPlayerId?`Ausgewählt: <b>${t.players.find(p=>p.id===selectedStudioPlayerId)?.name}</b> – jetzt Position antippen.`:"Spieler antippen und danach eine Position wählen."}</div>
      <div class="pitch">${positions.map(([id,x,y])=>{
        const pid=studioAssignments[id],p=t.players.find(z=>z.id===pid);
        return `<button class="pitch-slot" data-slot="${id}" style="left:${x}%;top:${y}%">${p?`<span class="pitch-player"><b>${p.shirtNumber} ${p.name.split(" ").slice(-1)}</b><small>${p.position} · ${p.rating}</small></span>`:`<span>${id}</span>`}</button>`;
      }).join("")}</div>
    </div>
    <div class="card"><h3>Kader</h3><p class="small muted">Auf iPhone antippen; am Computer auch ziehen.</p><div class="squad-drawer">${t.players.map(p=>`<button class="player-row drag-source ${selectedStudioPlayerId===p.id?"selected-player":""}" draggable="true" data-drag-player="${p.id}"><div class="player-avatar">${p.shirtNumber}</div><div><b>${p.name}</b><div class="player-pos">${t.short} · ${p.position}</div></div><span class="rating-pill">${p.rating}</span></button>`).join("")}</div></div>
  </div>`;
  document.querySelectorAll("[data-drag-player]").forEach(node=>{
    node.onclick=()=>{selectedStudioPlayerId=Number(node.dataset.dragPlayer);renderLineupStudio(teamId)};
    node.ondragstart=e=>{node.classList.add("dragging");e.dataTransfer.setData("text/plain",node.dataset.dragPlayer)};
    node.ondragend=()=>node.classList.remove("dragging");
  });
  document.querySelectorAll("[data-slot]").forEach(slot=>{
    slot.onclick=()=>{
      if(!selectedStudioPlayerId){
        if(studioAssignments[slot.dataset.slot]){delete studioAssignments[slot.dataset.slot];renderLineupStudio(teamId)}
        else toast("Zuerst Spieler auswählen");
        return;
      }
      Object.keys(studioAssignments).forEach(k=>{if(studioAssignments[k]===selectedStudioPlayerId)delete studioAssignments[k]});
      studioAssignments[slot.dataset.slot]=selectedStudioPlayerId;
      selectedStudioPlayerId=null;
      renderLineupStudio(teamId);
    };
    slot.ondragover=e=>{e.preventDefault();slot.classList.add("drop-hover")};
    slot.ondragleave=()=>slot.classList.remove("drop-hover");
    slot.ondrop=e=>{
      e.preventDefault();slot.classList.remove("drop-hover");
      const pid=Number(e.dataTransfer.getData("text/plain"));
      Object.keys(studioAssignments).forEach(k=>{if(studioAssignments[k]===pid)delete studioAssignments[k]});
      studioAssignments[slot.dataset.slot]=pid;renderLineupStudio(teamId);
    };
  });
}
function openSeasonReport(){
  const st=standingsAt(state()),topG=topSnapshot("goals"),topA=topSnapshot("assists"),played=season().matches.filter(m=>m.status==="played"),goals=played.reduce((n,m)=>n+m.homeGoals+m.awayGoals,0);
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet">
    <div class="sheet-head no-print"><h2>Saisonbericht</h2><div class="actions"><button id="printReport" class="btn primary">Als PDF speichern</button><button id="close" class="iconbtn">×</button></div></div>
    <div class="report-sheet">
      <h1>${league().name} – ${season().name}</h1><p>Offizieller Saisonbericht · erstellt am ${new Date().toLocaleDateString("de-DE")}</p>
      <h2>Kennzahlen</h2><p>${activeTeams().length} Teams · ${played.length} Spiele · ${goals} Tore · Ø ${played.length?(goals/played.length).toFixed(2):"0.00"} Tore/Spiel</p>
      <h2>Abschlusstabelle / aktueller Stand</h2><table class="report-table"><thead><tr><th>#</th><th>Team</th><th>Sp</th><th>Tore</th><th>Diff</th><th>P</th></tr></thead><tbody>${st.map((r,i)=>`<tr><td>${i+1}</td><td>${r.name}</td><td>${r.p}</td><td>${r.gf}:${r.ga}</td><td>${r.gf-r.ga}</td><td>${r.pts}</td></tr>`).join("")}</tbody></table>
      <h2>Auszeichnungen</h2><p>Torschützenkönig: <b>${topG?.name||"–"}</b> (${topG?.value||0})</p><p>Assist-König: <b>${topA?.name||"–"}</b> (${topA?.value||0})</p>
      <h2>Rekorde</h2><p>Beste Offensive: <b>${[...st].sort((a,b)=>b.gf-a.gf)[0]?.name||"–"}</b></p><p>Beste Defensive: <b>${[...st].sort((a,b)=>a.ga-b.ga)[0]?.name||"–"}</b></p>
    </div>
  </div></div>`;
  el("#close").onclick=closeOverlay;el("#printReport").onclick=()=>window.print();
}

function openBackupTest(){
  let ok=false,details="";
  try{
    const raw=JSON.stringify(state());
    const parsed=JSON.parse(raw);
    ok=Array.isArray(parsed.leagues)&&Array.isArray(parsed.teams)&&parsed.leagues.length===state().leagues.length&&parsed.teams.length===state().teams.length;
    details=`${raw.length.toLocaleString("de-DE")} Zeichen · ${parsed.leagues.length} Ligen · ${parsed.teams.length} Teams`;
  }catch(error){details=error.message}
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Backup-Test</h2><button id="close" class="iconbtn">×</button></div><div class="card"><h3>${ok?"Backup-Struktur ist lesbar ✓":"Backup-Test fehlgeschlagen"}</h3><p class="muted">${details}</p><p class="small muted">Dieser Test prüft Export und erneutes Einlesen im Speicher, ohne deine Daten zu verändern.</p></div></div></div>`;
  el("#close").onclick=closeOverlay;
}



function money(value){return new Intl.NumberFormat("de-DE",{notation:"compact",maximumFractionDigits:1}).format(Number(value||0))+" €"}
function contractSeason(years=3){
 const hit=String(season().name||"").match(/\d{4}/),year=hit?Number(hit[0]):new Date().getFullYear();
 return `${year+years}/${String(year+years+1).slice(-2)}`;
}

function ensureCountryMarket(country,minimum=10){
  if(!country)return 0;
  const existing=(state().freeAgents||[]).filter(p=>p.nationality===country).length;
  const missing=Math.max(0,minimum-existing);
  if(!missing)return 0;
  const generated=generatePlayers(missing,{nationality:country,usedNames:allUsedPlayerNames()});
  let id=globalPlayerId();
  generated.forEach(p=>p.id=id++);
  state().freeAgents.push(...generated);
  saveState({label:`Spieler aus ${country} ergänzt`});
  return generated.length;
}
function marketPlayerCard(p,source="market"){
 return `<article class="market-player-card">
   <div class="market-rating">${p.rating}<small>POT ${p.potential||p.rating}</small></div>
   <div class="market-player-main"><h3>${p.flag||""} ${p.name}</h3><div class="market-meta">${p.position} · ${p.age} Jahre · ${p.nationality} · ${p.preferredFoot}</div><div class="market-tags"><span>${p.personality||"Teamspieler"}</span><span>${money(p.value)}</span></div></div>
   <button class="btn primary market-sign" data-sign-player="${p.id}" data-source="${source}">Verpflichten</button>
 </article>`;
}
function openWorldPlayerCenter(tab="market"){
 ensureWorldMarket(100);
 const filtered=(state().freeAgents||[]).filter(p=>{
  const q=marketFilters.query.toLowerCase();
  return (!q||`${p.name} ${p.nationality}`.toLowerCase().includes(q))
   &&(!marketFilters.country||p.nationality===marketFilters.country)
   &&(!marketFilters.position||p.position===marketFilters.position)
   &&Number(p.rating)>=Number(marketFilters.minRating||0)
   &&Number(p.age)<=Number(marketFilters.maxAge||99);
 }).sort((a,b)=>b.rating-a.rating||b.potential-a.potential);
 const academy=state().academyPlayers||[];
 el("#overlay").innerHTML=`<div class="modal"><div class="sheet world-player-sheet">
  <div class="sheet-head"><div><div class="eyebrow">V26 · Performance-Speicher</div><h2>Welt-Spielerdatenbank</h2></div><button id="close" class="iconbtn">×</button></div>
  <div class="tabs"><button data-world-tab="market" class="${tab==="market"?"active":""}">Transfermarkt</button><button data-world-tab="academy" class="${tab==="academy"?"active":""}">Jugendakademie</button><button data-world-tab="club" class="${tab==="club"?"active":""}">Vereinswechsel</button></div>
  ${tab==="market"?`
    <div class="world-hero"><div><b>Praktisch unbegrenzte Namen</b><span>Mehr als ${playerCombinations().toLocaleString("de-DE")} mögliche Namensvarianten aus aller Welt</span></div><button id="refreshMarket" class="btn secondary">↻ 100 neue Spieler</button></div>
    <div class="market-filters">
      <input id="marketQuery" placeholder="Name oder Land suchen" value="${marketFilters.query}">
      <select id="marketCountry"><option value="">Alle Nationalitäten</option>${COUNTRIES.map(c=>`<option value="${c.name}" ${marketFilters.country===c.name?"selected":""}>${c.flag} ${c.name}</option>`).join("")}</select>
      <select id="marketPosition"><option value="">Alle Positionen</option>${POSITIONS.map(p=>`<option ${marketFilters.position===p?"selected":""}>${p}</option>`).join("")}</select>
      <input id="marketMinRating" type="number" min="0" max="99" placeholder="Min. Stärke" value="${marketFilters.minRating||""}">
      <input id="marketMaxAge" type="number" min="15" max="50" placeholder="Max. Alter" value="${marketFilters.maxAge===99?"":marketFilters.maxAge}">
    </div>
    <div class="small muted market-count">${filtered.length} von ${(state().freeAgents||[]).length} freien Spielern${marketFilters.country?` · mindestens 10 Spieler aus ${marketFilters.country} werden vorgehalten`:""}</div>
    <div class="market-list">${filtered.slice(0,120).map(p=>marketPlayerCard(p)).join("")||`<div class="empty">Keine Spieler für diese Filter.</div>`}</div>
  `:tab==="academy"?`
    <div class="world-hero"><div><b>Jugendakademie</b><span>Talente zwischen 15 und 18 Jahren mit Entwicklungspotenzial</span></div><button id="scoutYouth" class="btn primary">5 Talente scouten</button></div>
    <div class="field"><label>Akademie für Verein</label><select id="academyTeam">${activeTeams().map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></div>
    <div class="market-list">${academy.sort((a,b)=>b.potential-a.potential).map(p=>marketPlayerCard(p,"academy")).join("")||`<div class="empty">Noch keine Jugendspieler gescoutet.</div>`}</div>
  `:clubTransferHTML()}
 </div></div>`;
 el("#close").onclick=closeOverlay;
 document.querySelectorAll("[data-world-tab]").forEach(b=>b.onclick=()=>openWorldPlayerCenter(b.dataset.worldTab));
 if(tab==="market"){
  const apply=()=>{marketFilters={query:el("#marketQuery").value,country:el("#marketCountry").value,position:el("#marketPosition").value,minRating:Number(el("#marketMinRating").value||0),maxAge:Number(el("#marketMaxAge").value||99)};if(marketFilters.country)ensureCountryMarket(marketFilters.country,10);openWorldPlayerCenter("market")};
  let timer;el("#marketQuery").oninput=()=>{clearTimeout(timer);timer=setTimeout(apply,180)};
  ["marketCountry","marketPosition","marketMinRating","marketMaxAge"].forEach(id=>el("#"+id).onchange=apply);
  el("#refreshMarket").onclick=async()=>{
    const btn=el("#refreshMarket");
    if(btn?.dataset.busy==="1")return;
    if(btn){btn.dataset.busy="1";btn.disabled=true;btn.textContent="Erzeugt…";}
    const previous=state().freeAgents;
    try{
      pushUndo("Transfermarkt erneuert");
      const generated=generatePlayers(100,{usedNames:allUsedPlayerNames()});
      let id=globalPlayerId();
      generated.forEach(p=>{p.id=id++;p.transferHistory ||= [];p.stats ||= {apps:0,goals:0,assists:0,yellow:0,red:0};});
      state().freeAgents=generated;
      await saveState({label:"Transfermarkt erneuert",throwOnError:true});
      openWorldPlayerCenter("market");
      toast("100 neue Spieler erzeugt");
    }catch(error){
      console.error(error);
      state().freeAgents=previous;
      if(btn){btn.dataset.busy="0";btn.disabled=false;btn.textContent="Transfermarkt erneuern";}
      toast("Transfermarkt konnte nicht gespeichert werden.");
    }
  };
 }
 if(tab==="academy"){
  el("#scoutYouth").onclick=async()=>{
    const btn=el("#scoutYouth");
    if(btn?.dataset.busy==="1")return;
    if(btn){btn.dataset.busy="1";btn.disabled=true;btn.textContent="Scoutet…";}
    const beforeLength=state().academyPlayers.length;
    try{
      pushUndo("Jugendspieler gescoutet");
      const generated=generatePlayers(5,{youth:true,usedNames:allUsedPlayerNames()});
      let id=globalPlayerId();
      generated.forEach(p=>{
        p.id=id++;
        p.academyTeamId=Number(el("#academyTeam").value);
        p.status="academy";
        p.transferHistory ||= [];
        p.stats ||= {apps:0,goals:0,assists:0,yellow:0,red:0};
      });
      state().academyPlayers.push(...generated);
      await saveState({label:"Jugendspieler gescoutet",throwOnError:true});
      openWorldPlayerCenter("academy");
      toast("5 neue Talente entdeckt");
    }catch(error){
      console.error(error);
      state().academyPlayers.splice(beforeLength);
      if(btn){btn.dataset.busy="0";btn.disabled=false;btn.textContent="5 Talente scouten";}
      toast("Talente konnten nicht gespeichert werden.");
    }
  };
 }
 document.querySelectorAll("[data-sign-player]").forEach(b=>b.onclick=()=>openSigningSheet(Number(b.dataset.signPlayer),b.dataset.source));
 if(tab==="club")bindClubTransfer();
}
function openSigningSheet(playerId,source){
 const list=source==="academy"?state().academyPlayers:state().freeAgents,p=list.find(x=>x.id===playerId);if(!p)return;
 el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>${p.name} verpflichten</h2><button id="close" class="iconbtn">×</button></div>
  ${marketPlayerCard(p,source)}
  <div class="form-grid"><div class="field"><label>Verein</label><select id="signTeam">${activeTeams().map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></div>
  <div class="field"><label>Vertrag</label><select id="signYears">${[1,2,3,4,5].map(y=>`<option value="${y}" ${y===3?"selected":""}>${y} Jahr${y>1?"e":""}</option>`).join("")}</select></div>
  <div class="field"><label>Rückennummer</label><input id="signNumber" type="number" min="1" max="99" value="${Math.floor(1+Math.random()*40)}"></div></div>
  <button id="confirmSigning" class="btn primary" style="width:100%">Vertrag abschließen</button></div></div>`;
 el("#close").onclick=()=>openWorldPlayerCenter(source==="academy"?"academy":"market");
 el("#confirmSigning").onclick=async()=>{
  const btn=el("#confirmSigning");
  if(btn?.dataset.busy==="1")return;
  const t=team(Number(el("#signTeam").value));
  if(!t)return toast("Verein fehlt");
  t.players ||= [];
  state().transferLog ||= [];
  const sourceList=source==="academy"?state().academyPlayers:state().freeAgents;
  const sourceIndex=sourceList.findIndex(x=>x.id===p.id);
  if(sourceIndex<0)return toast("Spieler ist nicht mehr verfügbar");
  if(t.players.some(x=>x.id===p.id))return toast("Spieler ist bereits in diesem Kader");
  if(btn){btn.dataset.busy="1";btn.disabled=true;btn.textContent="Speichert…";}
  const previousPlayer=deepClone(p);
  const logLength=state().transferLog.length;
  try{
    pushUndo("Spieler verpflichtet");
    p.transferHistory ||= [];
    p.stats ||= {apps:0,goals:0,assists:0,yellow:0,red:0};
    p.teamId=t.id;
    p.status="active";
    p.contractUntil=contractSeason(Number(el("#signYears").value));
    p.shirtNumber=Number(el("#signNumber").value||0);
    p.transferHistory.push({
      date:new Date().toISOString().slice(0,10),
      type:source,
      fromId:null,
      toId:t.id,
      fee:0
    });
    t.players.push(p);
    sourceList.splice(sourceIndex,1);
    state().transferLog.push({
      id:Date.now(),
      playerId:p.id,
      playerName:p.name,
      fromId:null,
      fromName:source==="academy"?"Jugendakademie":"Vereinslos",
      toId:t.id,
      toName:t.name,
      fee:0,
      type:source,
      date:new Date().toISOString().slice(0,10)
    });
    await saveState({label:"Spieler verpflichtet",throwOnError:true});
    openWorldPlayerCenter(source==="academy"?"academy":"market");
    toast(`${p.name} wechselt zu ${t.name}`);
  }catch(error){
    console.error(error);
    t.players=t.players.filter(x=>x.id!==p.id);
    sourceList.splice(Math.min(sourceIndex,sourceList.length),0,p);
    Object.assign(p,previousPlayer);
    state().transferLog.splice(logLength);
    if(btn){btn.dataset.busy="0";btn.disabled=false;btn.textContent="Vertrag abschließen";}
    toast("Verpflichtung konnte nicht gespeichert werden. Es wurde nichts verändert.");
  }
 };
}
function clubTransferHTML(){
 const teams=activeTeams(),opts=teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join("");
 return `<div class="card"><h3>Spieler zwischen Vereinen wechseln</h3><div class="form-grid"><div class="field"><label>Von</label><select id="trFrom">${opts}</select></div><div class="field"><label>Spieler</label><select id="trPlayer"></select></div><div class="field"><label>Zu</label><select id="trTo">${opts}</select></div><div class="field"><label>Ablöse</label><input id="trFee" type="number" min="0" value="1000000"></div><div class="field"><label>Neuer Vertrag</label><select id="trYears">${[1,2,3,4,5].map(y=>`<option value="${y}">${y} Jahre</option>`).join("")}</select></div></div><button id="executeTransfer" class="btn primary" style="width:100%">Transfer durchführen</button></div>
 <div class="card"><h3>Letzte Transfers</h3>${(state().transferLog||[]).slice().reverse().slice(0,15).map(x=>`<div class="history-row"><div><b>${x.playerName}</b><div class="small muted">${x.fromName} → ${x.toName} · ${money(x.fee)} · ${x.date}</div></div></div>`).join("")||`<div class="empty">Noch keine Transfers.</div>`}</div>`;
}
function bindClubTransfer(){
 const refresh=()=>{const from=team(Number(el("#trFrom").value));el("#trPlayer").innerHTML=(from?.players||[]).map(p=>`<option value="${p.id}">${p.name} · ${p.position} · ${p.rating}</option>`).join("")};
 refresh();el("#trFrom").onchange=refresh;
 if(activeTeams().length>1)el("#trTo").value=String(activeTeams()[1].id);
 el("#executeTransfer").onclick=async()=>{
  const btn=el("#executeTransfer");
  if(btn?.dataset.busy==="1")return;
  const from=team(Number(el("#trFrom").value));
  const to=team(Number(el("#trTo").value));
  if(!from||!to)return toast("Verein fehlt");
  from.players ||= [];
  to.players ||= [];
  state().transferLog ||= [];
  const playerId=Number(el("#trPlayer").value);
  const playerIndex=from.players.findIndex(x=>x.id===playerId);
  const p=from.players[playerIndex];
  if(!p)return toast("Spieler fehlt");
  if(from.id===to.id)return toast("Zielverein muss anders sein");
  if(to.players.some(x=>x.id===p.id))return toast("Spieler ist bereits beim Zielverein");
  const fee=Number(el("#trFee").value||0);
  if(!Number.isFinite(fee)||fee<0)return toast("Bitte eine gültige Ablöse eingeben");
  if(btn){btn.dataset.busy="1";btn.disabled=true;btn.textContent="Transfer läuft…";}
  const previousPlayer=deepClone(p);
  const logLength=state().transferLog.length;
  try{
    pushUndo("Transfer durchgeführt");
    from.players.splice(playerIndex,1);
    p.transferHistory ||= [];
    p.teamId=to.id;
    p.contractUntil=contractSeason(Number(el("#trYears").value));
    p.status="active";
    to.players.push(p);
    const date=new Date().toISOString().slice(0,10);
    p.transferHistory.push({date,type:"permanent",fromId:from.id,toId:to.id,fee});
    state().transferLog.push({
      id:Date.now(),
      playerId:p.id,
      playerName:p.name,
      fromId:from.id,
      fromName:from.name,
      toId:to.id,
      toName:to.name,
      fee,
      type:"permanent",
      date
    });
    await saveState({label:"Transfer durchgeführt",throwOnError:true});
    openWorldPlayerCenter("club");
    toast("Transfer gespeichert");
  }catch(error){
    console.error(error);
    to.players=to.players.filter(x=>x.id!==p.id);
    Object.assign(p,previousPlayer);
    from.players.splice(Math.min(playerIndex,from.players.length),0,p);
    state().transferLog.splice(logLength);
    if(btn){btn.dataset.busy="0";btn.disabled=false;btn.textContent="Transfer durchführen";}
    toast("Transfer konnte nicht gespeichert werden. Der alte Kader wurde wiederhergestellt.");
  }
 };
}
function processPlayerDevelopment(){
 const retired=[];
 for(const t of activeTeams()){
  const keep=[];
  for(const p of t.players){
   const change=developPlayer(p);
   p.lastDevelopment=change;
   if(p.age>=38||(p.age>=35&&Math.random()<.12)){p.status="retired";retired.push({...p,retiredFrom:t.id});}
   else keep.push(p);
   p.stats={apps:0,goals:0,assists:0,yellow:0,red:0};
  }
  t.players=keep;
 }
 state().retiredPlayers ||= [];
 state().retiredPlayers.push(...retired);
 for(const p of state().freeAgents||[])developPlayer(p);
 const yearly=generatePlayers(Math.max(12,activeTeams().length*2),{youth:true,usedNames:allUsedPlayerNames()});
 let id=globalPlayerId();yearly.forEach((p,i)=>{p.id=id++;p.status="academy";p.academyTeamId=activeTeams()[i%Math.max(1,activeTeams().length)]?.id||null});
 state().academyPlayers ||= [];
 yearly.forEach(p=>{p.transferHistory ||= [];p.stats ||= {apps:0,goals:0,assists:0,yellow:0,red:0};});
 state().academyPlayers.push(...yearly);
 ensureWorldMarket(100);
}
function openTransferCenter(prefillTeamId=null){openWorldPlayerCenter("club")}

function openAwardsCenter(){
  const players=activeTeams().flatMap(t=>t.players.map(p=>({...p,teamName:t.name})));
  const by=(field)=>[...players].sort((a,b)=>b.stats[field]-a.stats[field])[0];
  const bestRating=[...players].sort((a,b)=>b.rating-a.rating)[0];
  const bestForm=[...players].sort((a,b)=>b.form-a.form)[0];
  const topG=by("goals"),topA=by("assists"),fair=[...players].sort((a,b)=>(a.stats.yellow+a.stats.red*3)-(b.stats.yellow+b.stats.red*3))[0];
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Auszeichnungen</h2><button id="close" class="iconbtn">×</button></div>
    <div class="award-grid">
      ${awardCard("⚽","Torschützenkönig",topG,`${topG?.stats.goals||0} Tore`)}
      ${awardCard("🎯","Assist-König",topA,`${topA?.stats.assists||0} Vorlagen`)}
      ${awardCard("⭐","Höchste Stärke",bestRating,`Rating ${bestRating?.rating||0}`)}
      ${awardCard("🔥","Beste Form",bestForm,`Form ${bestForm?.form||0}`)}
      ${awardCard("🤝","Fairplay",fair,`${fair?.stats.yellow||0} Gelb · ${fair?.stats.red||0} Rot`)}
    </div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
}
function awardCard(icon,title,p,detail){
  return `<div class="award-card"><div class="award-icon">${icon}</div><div class="small muted">${title}</div><h3>${p?.name||"–"}</h3><div>${p?.teamName||""}</div><b>${detail}</b></div>`;
}

function openCalendarCenter(){
  const rounds=[...new Set(season().matches.map(m=>m.matchday))].sort((a,b)=>a-b);
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Saisonkalender</h2><button id="close" class="iconbtn">×</button></div>
    <div class="calendar-grid">${rounds.map(day=>{
      const games=season().matches.filter(m=>m.matchday===day),date=games[0]?.date;
      const done=games.filter(m=>m.status==="played").length;
      return `<button class="calendar-card" data-calendar-day="${day}"><div class="small muted">Spieltag ${day}</div><h3>${fmtDate(date)}</h3><div>${done}/${games.length} beendet</div><div class="progress"><span style="width:${games.length?done/games.length*100:0}%"></span></div></button>`;
    }).join("")||`<div class="empty">Noch kein Spielplan.</div>`}</div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
  document.querySelectorAll("[data-calendar-day]").forEach(b=>b.onclick=()=>openMatchdayCenter(Number(b.dataset.calendarDay)));
}
function openMatchdayCenter(day){
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Spieltag ${day}</h2><button id="close" class="iconbtn">×</button></div>${matchList(season().matches.filter(m=>m.matchday===day))}<div class="card"><h3>Tabelle danach</h3>${tableHTML(standingsAt(state(),day),day)}</div></div></div>`;
  el("#close").onclick=openCalendarCenter;
  document.querySelectorAll("[data-match]").forEach(b=>{
    b.onclick=()=>openMatch(Number(b.dataset.match));
    b.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openMatch(Number(b.dataset.match));}};
  });
}

function openRecordsHub(){
  const st=standingsAt(state()),played=season().matches.filter(m=>m.status==="played");
  const biggest=[...played].sort((a,b)=>Math.abs(b.homeGoals-b.awayGoals)-Math.abs(a.homeGoals-a.awayGoals))[0];
  const highest=[...played].sort((a,b)=>(b.homeGoals+b.awayGoals)-(a.homeGoals+a.awayGoals))[0];
  const topAttack=[...st].sort((a,b)=>b.gf-a.gf)[0],topDefense=[...st].sort((a,b)=>a.ga-b.ga)[0];
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Rekordbuch</h2><button id="close" class="iconbtn">×</button></div>
    <div class="records-grid">
      <div class="record-card"><span>Höchster Sieg</span><b>${biggest?`${team(biggest.homeId).short} ${biggest.homeGoals}:${biggest.awayGoals} ${team(biggest.awayId).short}`:"–"}</b></div>
      <div class="record-card"><span>Torreichstes Spiel</span><b>${highest?`${team(highest.homeId).short} ${highest.homeGoals}:${highest.awayGoals} ${team(highest.awayId).short}`:"–"}</b></div>
      <div class="record-card"><span>Beste Offensive</span><b>${topAttack?.name||"–"} · ${topAttack?.gf||0}</b></div>
      <div class="record-card"><span>Beste Defensive</span><b>${topDefense?.name||"–"} · ${topDefense?.ga||0}</b></div>
      <div class="record-card"><span>Meiste Punkte</span><b>${st[0]?.name||"–"} · ${st[0]?.pts||0}</b></div>
      <div class="record-card"><span>Größter Kaderwert</span><b>${[...activeTeams()].sort((a,b)=>squadValue(b)-squadValue(a))[0]?.name||"–"}</b></div>
    </div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
}


function openCommandPalette(){
  const actions=[
    ["home","⌂","Dashboard"],["fixtures","🗓️","Spieltage"],["table","📊","Tabellen"],["teams","👥","Mannschaften"],
    ["lineup","🧠","Lineup Studio"],["transfer","🔄","Transfercenter"],["calendar","📅","Saisonkalender"],["awards","🏆","Auszeichnungen"],
    ["records","📚","Rekordbuch"],["report","📄","Saisonbericht"],["validation","✓","Datenprüfung"]
  ];
  el("#overlay").innerHTML=`<div class="modal command-modal"><div class="sheet command-sheet">
    <div class="sheet-head"><h2>Schnellmenü</h2><button id="close" class="iconbtn">×</button></div>
    <input id="commandSearch" class="command-search" placeholder="Aktion suchen…" autofocus>
    <div id="commandResults" class="command-results">${actions.map(a=>commandItem(a)).join("")}</div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
  const renderCommands=q=>{const value=(q||"").toLowerCase();el("#commandResults").innerHTML=actions.filter(a=>a.join(" ").toLowerCase().includes(value)).map(a=>commandItem(a)).join("")||`<div class="empty">Keine Aktion gefunden.</div>`;bindCommands()};
  const bindCommands=()=>document.querySelectorAll("[data-command]").forEach(b=>b.onclick=()=>runCommand(b.dataset.command));
  bindCommands();
  el("#commandSearch").oninput=e=>renderCommands(e.target.value);
}
function commandItem(action){return `<button class="command-item" data-command="${action[0]}"><span>${action[1]}</span><b>${action[2]}</b><small>Öffnen</small></button>`}
function runCommand(command){
  closeOverlay();
  if(["home","fixtures","table","teams"].includes(command)){view=command;render();return}
  if(command==="lineup")openLineupStudio();
  if(command==="transfer")openTransferCenter();
  if(command==="calendar")openCalendarCenter();
  if(command==="awards")openAwardsCenter();
  if(command==="records")openRecordsHub();
  if(command==="report")openSeasonReport();
  if(command==="validation")openValidation();
}


function bindLongPress(element,callback,duration=520){
  let timer=null,moved=false,startX=0,startY=0;
  element.addEventListener("pointerdown",e=>{
    moved=false;startX=e.clientX;startY=e.clientY;
    timer=setTimeout(()=>{if(!moved){navigator.vibrate?.(20);callback(e)}},duration);
  });
  element.addEventListener("pointermove",e=>{
    if(Math.hypot(e.clientX-startX,e.clientY-startY)>10){moved=true;clearTimeout(timer)}
  });
  ["pointerup","pointercancel","pointerleave"].forEach(type=>element.addEventListener(type,()=>clearTimeout(timer)));
}

function bindFixtureGestures(){
  document.querySelectorAll("[data-fixture-card]").forEach(card=>{
    let startX=0,startY=0;
    card.addEventListener("pointerdown",e=>{startX=e.clientX;startY=e.clientY});
    card.addEventListener("pointerup",e=>{
      const dx=e.clientX-startX,dy=e.clientY-startY;
      if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.4){
        const id=Number(card.dataset.fixtureCard);
        if(dx<0)openMatch(id);
        else{
          card.querySelector('input[id^="directHG-"]')?.focus();
          toast("Ergebnis eintragen und direkt speichern");
        }
      }
    });
    bindLongPress(card,()=>openFixtureQuickActions(Number(card.dataset.fixtureCard)));
  });
}

function openFixtureQuickActions(matchId){
  const m=season().matches.find(x=>x.id===matchId);
  if(!m)return;
  el("#contextMenu").innerHTML=`<div class="quick-menu open">
    <b>${team(m.homeId).short} – ${team(m.awayId).short}</b>
    <button data-qmatch="open">Spiel öffnen</button>
    <button data-qmatch="result">Ergebnis eintragen</button>
    <button data-qmatch="lineup">Aufstellung bearbeiten</button>
    <button data-qmatch="events">Ereignis hinzufügen</button>
  </div>`;
  document.querySelector('[data-qmatch="open"]').onclick=()=>openMatch(matchId);
  document.querySelector('[data-qmatch="result"]').onclick=()=>{el("#contextMenu").innerHTML="";document.querySelector(`[data-fixture-card="${matchId}"] input`)?.focus()};
  document.querySelector('[data-qmatch="lineup"]').onclick=()=>{openMatch(matchId);setTimeout(()=>document.querySelector('[data-tab="lineups"]')?.click(),50)};
  document.querySelector('[data-qmatch="events"]').onclick=()=>openEventEditor(matchId);
}

function openGlobalQuickActions(){
  el("#contextMenu").innerHTML=`<div class="quick-menu open global-menu">
    <b>Schnellaktionen</b>
    <button data-global-action="team">＋ Team erstellen</button>
    <button data-global-action="match">＋ Partie erstellen</button>
    <button data-global-action="backup">⬇ Backup exportieren</button>
    <button data-global-action="undo">↶ Letzte Änderung zurück</button>
  </div>`;
  document.querySelector('[data-global-action="team"]').onclick=()=>openTeamEditor();
  document.querySelector('[data-global-action="match"]').onclick=openMatchCreator;
  document.querySelector('[data-global-action="backup"]').onclick=()=>{exportState();el("#contextMenu").innerHTML=""};
  document.querySelector('[data-global-action="undo"]').onclick=()=>{const label=undoLast();el("#contextMenu").innerHTML="";if(label){render();
resumeLastView();toast(`Rückgängig: ${label}`)}else toast("Nichts zum Rückgängigmachen")};
}

document.addEventListener("pointerdown",event=>{
  if(!event.target.closest(".quick-menu")&&!event.target.closest("#globalQuickAction"))el("#contextMenu").innerHTML="";
});
function runQualityAudit(){
  const results=[];
  const check=(name,condition,detail="")=>results.push({name,ok:Boolean(condition),detail});
  const s=state();
  const currentLeague=league();
  const currentSeason=season();
  const allMatches=s.leagues.flatMap(l=>l.seasons.flatMap(sea=>sea.matches||[]));
  const allPlayers=s.teams.flatMap(t=>t.players||[]);
  const idsUnique=items=>new Set(items.map(x=>x.id)).size===items.length;

  check("Aktive Liga vorhanden",Boolean(currentLeague));
  check("Aktive Saison vorhanden",Boolean(currentSeason));
  check("Mindestens zwei Mannschaften",activeTeams().length>=2,`${activeTeams().length} Teams`);
  check("Eindeutige Liga-IDs",idsUnique(s.leagues));
  check("Eindeutige Team-IDs",idsUnique(s.teams));
  check("Eindeutige Spieler-IDs",idsUnique(allPlayers));
  check("Eindeutige Spiel-IDs",idsUnique(allMatches));
  check("Keine Partie gegen sich selbst",allMatches.every(m=>m.homeId!==m.awayId));
  check("Alle Partien haben gültige Teams",allMatches.every(m=>team(m.homeId)&&team(m.awayId)));
  check("Alle Ergebnisse sind gültig",allMatches.every(m=>Number.isInteger(Number(m.homeGoals||0))&&Number.isInteger(Number(m.awayGoals||0))&&Number(m.homeGoals||0)>=0&&Number(m.awayGoals||0)>=0));
  check("Alle Teams haben Namen",s.teams.every(t=>Boolean(t.name?.trim())));
  check("Alle Teams haben Kürzel",s.teams.every(t=>Boolean(t.short?.trim())));
  check("Alle Spieler haben Namen",allPlayers.every(p=>Boolean(p.name?.trim())));
  check("Spieler gehören zu gültigen Teams",s.teams.every(t=>(t.players||[]).every(p=>!p.teamId||Number(p.teamId)===Number(t.id))));
  check("Logos sind gültige Bilder",s.teams.every(t=>!t.logo||String(t.logo).startsWith("data:image/")));
  check("Stadionbilder sind gültige Bilder",s.teams.every(t=>!t.stadium?.image||String(t.stadium.image).startsWith("data:image/")));
  check("Keine unmöglichen Spieltage",allMatches.every(m=>Number(m.matchday)>=1));
  check("Tabellenberechnung möglich",(()=>{try{return standingsAt(s).every(r=>Number.isFinite(r.pts))}catch{return false}})());

  return results;
}
function openQualityCenter(){
  const results=runQualityAudit(),passed=results.filter(x=>x.ok).length;
  el("#overlay").innerHTML=`<div class="modal"><div class="sheet"><div class="sheet-head"><h2>Quality Center</h2><button id="close" class="iconbtn">×</button></div>
    <div class="quality-score"><b>${passed}/${results.length}</b><span>Prüfungen bestanden</span></div>
    <div class="card">${results.map(r=>`<div class="quality-row ${r.ok?"ok":"fail"}"><span>${r.ok?"✓":"!"}</span><div><b>${r.name}</b>${r.detail?`<small>${r.detail}</small>`:""}</div></div>`).join("")}</div>
  </div></div>`;
  el("#close").onclick=closeOverlay;
}
