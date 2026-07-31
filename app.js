
import {initStore,getState,saveState,resetState,exportState,importState,pushUndo,undoLast,createBackupNow,listAutomaticBackups,restoreLatestAutomaticBackup} from "./store.js";
import {getLeague,getSeason,getTeam,standingsAt,movementAt,maxMatchday} from "./standings.js";
import {roundRobin,dateForRound} from "./fixtures.js";
import {el,toast,closeOverlay,badge,compressedImageDataURL,cropImageFile,normalizeLogoImage} from "./ui.js";
import {validateState,normalizeState} from "./integrity.js";
import {COUNTRIES,POSITIONS,generatePlayers,developPlayer,playerCombinations,generateCountrySpecificName,normalizePosition} from "./playerUniverse.js";
import {defaultFinance,playerWage,recalcWages,addTransaction,settleMatchFinance,seasonFinance,aiTransferWindow,createCompetition,groupTable,simulateCompetitionStep} from "./managerWorld.js";
import {migrateState,compactCareerState,snapshotCareer,restoreSnapshot,createSaveExport,parseSaveImport,validateCareerState,competitionDiagnostics,normalizeCompetitionParticipants,updateCareerRecords,hallOfFameCandidate} from "./stabilityCareer.js";

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
await bootApplication();

function state(){ return getState(); }
function league(){ return getLeague(state()); }
function season(){ return getSeason(state(),league()); }
function team(id){ return getTeam(state(),id); }
function playerById(id){
  for(const t of state().teams){ const p=t.players.find(x=>x.id===Number(id)); if(p) return p; }
  return null;
}
function activeTeams(){ return season().teamIds.map(team).filter(Boolean); }


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
        <div class="brand"><div class="brandmark">🏆</div><div>Fantasy Liga Studio <span class="version-pill">V36</span></div></div>
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
  document.querySelectorAll("[data-simulate-match]").forEach(b=>b.onclick=e=>{e.stopPropagation();simulateMatch(Number(b.dataset.simulateMatch));});
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
        <div><h2>Partien</h2><span class="subtitle">${matches.filter(m=>m.status==="played").length}/${matches.length} beendet</span></div>
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
    season().matches=pairs.map((p,i)=>({id:i+1,matchday:p.matchday,homeId:p.homeId,awayId:p.awayId,date:dateForRound(start,p.matchday),time,status:"scheduled",homeGoals:0,awayGoals:0,lineups:{home:[...(team(Number(el("#mHome").value))?.defaultLineup||[])].slice(0,11),away:[...(team(Number(el("#mAway").value))?.defaultLineup||[])].slice(0,11),homeBench:fullBenchIds(team(Number(el("#mHome").value)),team(Number(el("#mHome").value))?.defaultLineup||[]),awayBench:fullBenchIds(team(Number(el("#mAway").value)),team(Number(el("#mAway").value))?.defaultLineup||[])},events:[],notes:"",attendance:0,referee:"",weather:"",motmPlayerId:null}));
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
  const simulateBtn=el("#simulateMatch");if(simulateBtn)simulateBtn.onclick=()=>simulateMatch(m.id);
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
  return `<div class="celebration-cinema broadcast-clean ${c.side} ${c.intensity}">
    <div class="cinematic-stadium broadcast-stadium" style="background-image:url('${image}');background-position:${pos}"></div>
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
    <div class="cinematic-controls broadcast-controls"><button class="btn primary" data-open-broadcast-report>Spielbericht öffnen</button><button class="btn" data-replay-celebration="${m.id}">Sequenz wiederholen</button><button class="btn" data-close-celebration>Schließen</button></div>
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
  const wrap=document.createElement('div');wrap.className='celebration-overlay';wrap.innerHTML=celebrationSceneHtml(m);document.body.appendChild(wrap);bindCelebrationActions(m);
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
function pickAssist(players,scorer){
  const pool=players.filter(p=>p.id!==scorer?.id);
  const weights={GK:.03,DEF:.7,MID:2.2,AM:3.8,ST:1.8};
  return Math.random()<.18?null:weightedPick(pool,p=>(weights[playerPositionGroup(p)]||1)*(0.6+Number(p.rating||60)/100));
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
function addSimEvent(m,type,minute,player,assist=null,addedTime=0){
  if(!player)return;
  m.events.push({id:nextId(m.events),type,minute,addedTime,playerId:player.id,assistId:assist?.id||null,playerOutId:null});
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
  const seed=seededFraction(m.id,m.matchday,m.homeGoals,m.awayGoals,goals.length,"manual-v32");
  let serial=0;
  const minute=(min=2,max=89)=>{
    serial++;
    return clamp(Math.round(min+seededFraction(m.id,serial,seed)*Math.max(1,max-min)),min,max);
  };
  const generated=[];
  const add=(type,side,at=minute(),weight=()=>1)=>{
    const squad=side==="home"?hXI:aXI;
    const player=weightedPick(squad,weight);
    if(player)generated.push({id:0,type,minute:at,addedTime:0,playerId:player.id,assistId:null,playerOutId:null,generated:true});
  };
  const cardTotal=clamp(Math.round(2+seed*3+(Number(stats.foulsHome||10)+Number(stats.foulsAway||10))/13),2,7);
  for(let i=0;i<cardTotal;i++){
    const side=seededFraction(m.id,"card",i)<.5?"home":"away";
    const redRoll=seededFraction(m.id,"red",i);
    add(redRoll<.035?"red":redRoll<.075?"secondYellow":"yellow",side,minute(12,88),p=>playerPositionGroup(p)==="DEF"?2.3:playerPositionGroup(p)==="MID"?1.6:.7);
  }
  const cornersH=clamp(Number(stats.cornersHome||0),0,12),cornersA=clamp(Number(stats.cornersAway||0),0,12);
  for(let i=0;i<Math.min(cornersH,7);i++)add("corner","home",minute(3,89),p=>playerPositionGroup(p)==="AM"?2.2:playerPositionGroup(p)==="MID"?1.6:1);
  for(let i=0;i<Math.min(cornersA,7);i++)add("corner","away",minute(3,89),p=>playerPositionGroup(p)==="AM"?2.2:playerPositionGroup(p)==="MID"?1.6:1);
  const extra=clamp(Math.round(4+seed*5+(Number(m.homeGoals||0)+Number(m.awayGoals||0))),4,11);
  const types=["chance","save","post"];
  for(let i=0;i<extra;i++)add(types[Math.floor(seededFraction(m.id,"narrative",i)*types.length)],seededFraction(m.id,"side",i)<.52?"home":"away",minute(4,89),p=>playerPositionGroup(p)==="ST"?2.4:playerPositionGroup(p)==="AM"?1.9:1);
  const anchor=hXI[0]||aXI[0];
  if(anchor){generated.push({id:0,type:"halftime",minute:45,addedTime:0,playerId:anchor.id,assistId:null,playerOutId:null,generated:true});generated.push({id:0,type:"fulltime",minute:90,addedTime:0,playerId:anchor.id,assistId:null,playerOutId:null,generated:true});}
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

  const previous=deepClone(m);
  m.__simulationBusy=true;
  try{
    pushUndo("Spiel simuliert");
    const hXI=chooseLineup(h),aXI=chooseLineup(a);
    if(!hXI.length||!aXI.length)throw new Error("Keine gültige Aufstellung verfügbar");

    m.events=[];
    h.defaultLineup=hXI.map(p=>p.id).filter(Number.isFinite);a.defaultLineup=aXI.map(p=>p.id).filter(Number.isFinite);h.defaultFormation=h.defaultFormation||"4-3-2-1";a.defaultFormation=a.defaultFormation||"4-3-2-1";
    m.lineups={
      home:hXI.map(p=>p.id).filter(Number.isFinite),
      away:aXI.map(p=>p.id).filter(Number.isFinite),
      homeBench:fullBenchIds(h,hXI.map(x=>x.id)),
      awayBench:fullBenchIds(a,aXI.map(x=>x.id))
    };

    const hs=Number(teamAverage(h))||65,as=Number(teamAverage(a))||65;
    const context=simulationSeasonContext(h.id,a.id,m.matchday);
    const formH=weightedFormScore(h.id,context.dayBefore);
    const formA=weightedFormScore(a.id,context.dayBefore);

    // V32: Jeder Stärkepunkt ist sichtbar. Grundstärke dominiert; Form und Tabelle dürfen verschieben,
    // aber einen Qualitätsunterschied nur bei klarer Saisonleistung wirklich ausgleichen.
    const ratingGap=clamp(hs-as,-8,8);
    const formGap=clamp(formH-formA,-1,1);
    const seasonGap=clamp(context.seasonGap,-1,1);
    const derby=isDerbyMatch(m);
    const fatigueH=fatigueScore(h.id,m),fatigueA=fatigueScore(a.id,m);
    const fatigueGap=fatigueA-fatigueH;
    const leaderH=context.home.rank===1?.06:0,leaderA=context.away.rank===1?.06:0;
    const relegationH=context.home.rank>=Math.max(2,activeTeams().length-3)?.035:0,relegationA=context.away.rank>=Math.max(2,activeTeams().length-3)?.035:0;
    const upsetSwing=randomNormal()*(derby?.09:.07);
    const homeAdvantage=.075;
    let baseHome=1.30+homeAdvantage+ratingGap*.235+formGap*.15+seasonGap*.22+fatigueGap*.17+leaderH+relegationH+upsetSwing;
    let baseAway=1.26-ratingGap*.225-formGap*.14-seasonGap*.20-fatigueGap*.16+leaderA+relegationA-upsetSwing;
    if(derby){baseHome=(baseHome+1.27)*.5;baseAway=(baseAway+1.24)*.5;}
    const openMatch=Math.random()<.085;
    const blowoutMatch=!openMatch&&Math.random()<.026;
    const defensiveMatch=!openMatch&&!blowoutMatch&&Math.random()<.205;
    if(openMatch){baseHome*=1.28;baseAway*=1.28}
    if(blowoutMatch){baseHome*=1.62;baseAway*=1.62}
    if(defensiveMatch){baseHome*=.70;baseAway*=.70}
    baseHome=clamp(baseHome,.24,3.45);baseAway=clamp(baseAway,.20,3.25);

    let hg=clamp(poisson(baseHome),0,8),ag=clamp(poisson(baseAway),0,8);
    // Deutliche Ergebnisse bleiben drin, werden außerhalb eines echten Ausreißers aber selten.
    if(!blowoutMatch){
      let guard=0;
      while((Math.abs(hg-ag)>=4||hg+ag>=7)&&guard++<5){hg=clamp(poisson(baseHome),0,7);ag=clamp(poisson(baseAway),0,7)}
      if(Math.abs(hg-ag)>=4){
        if(hg>ag)hg=ag+3;else ag=hg+3;
      }
    }

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
    for(let i=0;i<hg;i++){
      const scorer=pickScorer(hXI);
      if(scorer)addSimEvent(m,Math.random()<.11?"penalty":"goal",minute(),scorer,pickAssist(hXI,scorer));
    }
    for(let i=0;i<ag;i++){
      const scorer=pickScorer(aXI);
      if(scorer)addSimEvent(m,Math.random()<.11?"penalty":"goal",minute(),scorer,pickAssist(aXI,scorer));
    }
    const cards=clamp(poisson(3.8),1,8);
    for(let i=0;i<cards;i++){
      const side=Math.random()<.52?hXI:aXI;
      const player=weightedPick(side,p=>playerPositionGroup(p)==="DEF"?2.2:playerPositionGroup(p)==="MID"?1.5:.7);
      if(player){
        const roll=Math.random(),type=roll<.055?"red":roll<.11?"secondYellow":"yellow";
        addSimEvent(m,type,minute(),player);
      }
    }
    const redEvents=m.events.filter(e=>["red","secondYellow"].includes(e.type));
    const redHome=redEvents.filter(e=>playerById(e.playerId)?.teamId===h.id||h.players.some(p=>p.id===e.playerId)).length;
    const redAway=redEvents.filter(e=>playerById(e.playerId)?.teamId===a.id||a.players.some(p=>p.id===e.playerId)).length;
    if(redHome>redAway&&Math.random()<.58){const scorer=pickScorer(aXI);if(scorer){ag=Math.min(8,ag+1);addSimEvent(m,"goal",minute(),scorer,pickAssist(aXI,scorer));}}
    if(redAway>redHome&&Math.random()<.58){const scorer=pickScorer(hXI);if(scorer){hg=Math.min(8,hg+1);addSimEvent(m,"goal",minute(),scorer,pickAssist(hXI,scorer));}}
    if(Math.random()<.24){const side=Math.random()<.5?hXI:aXI;const injured=weightedPick(side,()=>1);if(injured)addSimEvent(m,"injury",minute(),injured);}
    const narrativeCount=clamp(poisson(7.5),4,15),narrativeTypes=["chance","save","post","corner"];
    for(let i=0;i<narrativeCount;i++){const side=Math.random()<.53?hXI:aXI;const actor=weightedPick(side,p=>playerPositionGroup(p)==="GK"?.35:playerPositionGroup(p)==="ST"?2.2:1);if(actor)addSimEvent(m,narrativeTypes[Math.floor(Math.random()*narrativeTypes.length)],minute(),actor);}
    const halfPlayer=hXI[0]||aXI[0];if(halfPlayer)addSimEvent(m,"halftime",45,halfPlayer,null,0);if(halfPlayer)addSimEvent(m,"fulltime",90,halfPlayer,null,0);

    m.events.sort((x,y)=>Number(x.minute||0)-Number(y.minute||0));
    m.homeGoals=hg;
    m.awayGoals=ag;
    m.status="played";
    m.simulated=true;

    const possH=Math.round(clamp(50+(hs-as)*.6+randomNormal()*4,35,65));
    const shotsH=Math.max(hg+2,Math.round(8+baseHome*3+randomNormal()*2.2));
    const shotsA=Math.max(ag+2,Math.round(7+baseAway*3+randomNormal()*2.2));
    m.statistics={
      possessionHome:possH,possessionAway:100-possH,
      shotsHome:shotsH,shotsAway:shotsA,
      shotsOnTargetHome:Math.max(hg,Math.round(shotsH*(.32+Math.random()*.16))),
      shotsOnTargetAway:Math.max(ag,Math.round(shotsA*(.32+Math.random()*.16))),
      xgHome:Number(clamp(baseHome+randomNormal()*.22,.2,4.7).toFixed(1)),
      xgAway:Number(clamp(baseAway+randomNormal()*.22,.2,4.4).toFixed(1)),
      cornersHome:clamp(poisson(4.8),0,12),cornersAway:clamp(poisson(4.2),0,12),
      foulsHome:clamp(poisson(10.5),5,20),foulsAway:clamp(poisson(11),5,21)
    };
    m.statisticsSource="simulated";
    m.simulationFactors={
      homeStrength:Number(hs.toFixed(1)),awayStrength:Number(as.toFixed(1)),
      strengthGap:Number(ratingGap.toFixed(2)),formGap:Number(formGap.toFixed(3)),
      seasonGap:Number(seasonGap.toFixed(3)),tableEvidence:Number(context.evidence.toFixed(3)),
      tableDay:context.dayBefore,derby:isDerbyMatch(m),fatigueHome:Number(fatigueScore(h.id,m).toFixed(2)),fatigueAway:Number(fatigueScore(a.id,m).toFixed(2))
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
    toast(`${h.short||h.name} ${hg}:${ag} ${a.short||a.name} simuliert`);
    render();
    setTimeout(()=>{openMatch(matchId);setTimeout(()=>openCelebration(matchId),420)},80);
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
function lineupView(m){
  const sideBoard=(side,t)=>{
    const startIds=m.lineups[side]||[];
    const benchKey=`${side}Bench`;
    const benchIds=m.lineups[benchKey]||[];
    const unused=sortPlayersByPosition(t.players.filter(p=>!startIds.includes(p.id)&&!benchIds.includes(p.id)));
    const cards=ids=>ids.map(id=>playerById(id)).filter(Boolean).map(p=>lineupPlayerCard(p,side)).join("");
    const unusedCards=unused.map(p=>lineupPlayerCard(p,side)).join("");
    return `<section class="card lineup-board" data-lineup-board="${side}">
      <div class="section-head"><div><h3>${t.name}</h3><span class="subtitle">${t.defaultFormation||"4-3-2-1"} · positionsgerecht</span></div>${badge(t)}</div>
      <div class="lineup-zone pitch-zone" data-lineup-zone="${side}">
        <div class="lineup-zone-title"><b>Startelf</b><span>${startIds.length}/11</span></div>
        <div class="lineup-player-list">${cards(startIds)||`<div class="lineup-empty">Spieler hierher ziehen</div>`}</div>
      </div>
      <div class="lineup-zone" data-lineup-zone="${benchKey}">
        <div class="lineup-zone-title"><b>Bank</b><span>${benchIds.length}</span></div>
        <div class="lineup-player-list">${cards(benchIds)||`<div class="lineup-empty">Bank ist leer</div>`}</div>
      </div>
      <div class="lineup-zone squad-zone" data-lineup-zone="${side}Squad">
        <div class="lineup-zone-title"><b>Kader</b><span>${unused.length}</span></div>
        <div class="lineup-player-list">${unusedCards||`<div class="lineup-empty">Alle Spieler verteilt</div>`}</div>
      </div>
    </section>`;
  };
  return `<div class="lineup-instruction">Spieler gedrückt halten und in Startelf, Bank oder Kader ziehen. Antippen öffnet Schnellaktionen.</div><div class="grid lineup-grid">${sideBoard("home",team(m.homeId))}${sideBoard("away",team(m.awayId))}</div>`;
}

function lineupPlayerCard(p,side){
  return `<button type="button" class="lineup-player-card" draggable="true" data-lineup-player="${p.id}" data-player-side="${side}">
    <span class="player-num">${p.shirtNumber||"–"}</span>
    <span><b>${p.name}</b><small>${p.position||"Spieler"}</small></span>
    <span class="drag-handle">⋮⋮</span>
  </button>`;
}

function moveLineupPlayer(m,pid,side,target){
  const startKey=side;
  const benchKey=`${side}Bench`;
  m.lineups[startKey]=(m.lineups[startKey]||[]).filter(id=>id!==pid);
  m.lineups[benchKey]=(m.lineups[benchKey]||[]).filter(id=>id!==pid);
  if(target===startKey){
    if(m.lineups[startKey].length>=11)return toast("Die Startelf hat bereits 11 Spieler");
    m.lineups[startKey].push(pid);
  }else if(target===benchKey){
    m.lineups[benchKey].push(pid);
  }
  saveState({label:"Aufstellung geändert"});
  document.querySelector('[data-tab="lineups"]')?.click();
}

function bindLineupDrag(m){
  let dragged=null;
  document.querySelectorAll("[data-lineup-player]").forEach(card=>{
    card.ondragstart=e=>{
      dragged={pid:Number(card.dataset.lineupPlayer),side:card.dataset.playerSide};
      e.dataTransfer.effectAllowed="move";
      e.dataTransfer.setData("text/plain",JSON.stringify(dragged));
      card.classList.add("is-dragging");
    };
    card.ondragend=()=>card.classList.remove("is-dragging");
    card.onclick=()=>openLineupQuickActions(m,Number(card.dataset.lineupPlayer),card.dataset.playerSide);
    bindLongPress(card,()=>openLineupQuickActions(m,Number(card.dataset.lineupPlayer),card.dataset.playerSide));
  });
  document.querySelectorAll("[data-lineup-zone]").forEach(zone=>{
    zone.ondragover=e=>{e.preventDefault();zone.classList.add("drag-over")};
    zone.ondragleave=()=>zone.classList.remove("drag-over");
    zone.ondrop=e=>{
      e.preventDefault();zone.classList.remove("drag-over");
      let payload=dragged;
      try{payload=JSON.parse(e.dataTransfer.getData("text/plain"))}catch{}
      if(payload)moveLineupPlayer(m,payload.pid,payload.side,zone.dataset.lineupZone);
    };
  });

  let touchDrag=null;
  document.querySelectorAll("[data-lineup-player]").forEach(card=>{
    card.addEventListener("pointerdown",e=>{
      // Auf Touch-Geräten bleibt vertikales Scrollen immer erhalten.
      // Änderungen erfolgen dort zuverlässig über Antippen/Schnellaktionen.
      return;
      touchDrag={pid:Number(card.dataset.lineupPlayer),side:card.dataset.playerSide,startX:e.clientX,startY:e.clientY,card,timer:setTimeout(()=>card.classList.add("is-dragging"),220)};
    });
    card.addEventListener("pointermove",e=>{
      if(!touchDrag)return;
      const moved=Math.hypot(e.clientX-touchDrag.startX,e.clientY-touchDrag.startY);
      if(moved>8){
        clearTimeout(touchDrag.timer);
        touchDrag.card.classList.add("is-dragging");
        const zone=document.elementFromPoint(e.clientX,e.clientY)?.closest?.("[data-lineup-zone]");
        document.querySelectorAll("[data-lineup-zone]").forEach(z=>z.classList.toggle("drag-over",z===zone));
      }
    });
    card.addEventListener("pointerup",e=>{
      if(!touchDrag)return;
      clearTimeout(touchDrag.timer);
      const zone=document.elementFromPoint(e.clientX,e.clientY)?.closest?.("[data-lineup-zone]");
      document.querySelectorAll("[data-lineup-zone]").forEach(z=>z.classList.remove("drag-over"));
      touchDrag.card.classList.remove("is-dragging");
      if(zone)moveLineupPlayer(m,touchDrag.pid,touchDrag.side,zone.dataset.lineupZone);
      touchDrag=null;
    });
    card.addEventListener("pointercancel",()=>{if(touchDrag)clearTimeout(touchDrag.timer);touchDrag=null});
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
    chance:`Großchance für ${club} durch ${name}.`,
    save:`${name} verhindert mit einer starken Parade den Treffer.`,
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
  const auto=el("#saveDefaultLineup");if(auto)auto.onclick=async()=>{t.defaultLineup=[];chooseLineup(t);t.defaultFormation="4-3-2-1";await saveState({label:"Standardelf vorgeschlagen"});toast("4-3-2-1 wurde vorgeschlagen – du kannst sie manuell ändern");openTeam(t.id);};
  document.querySelectorAll("[data-player]").forEach(r=>r.onclick=()=>openPlayerEditor(t.id,Number(r.dataset.player)));
}
function openDefaultLineupEditor(teamId){
  const t=team(teamId);
  if(!t)return;
  let selected=(Array.isArray(t.defaultLineup)?t.defaultLineup:[]).filter(id=>t.players.some(p=>p.id===id)).slice(0,11);
  if(selected.length!==11)selected=chooseLineup(t).map(p=>p.id).slice(0,11);
  while(selected.length<11)selected.push(null);
  let activeSlot=0;
  const draw=()=>{
    const selectedSet=new Set(selected.filter(Boolean));
    const pitch=selected.map((id,index)=>{const p=id?t.players.find(x=>x.id===id):null;return `<button type="button" class="goal-player default-lineup-slot ${activeSlot===index?"selected":""}" data-default-slot="${index}" style="--slot:${index}"><span class="goal-player-pos">${formationSlotLabel(index)}</span><b>${p?.shirtNumber||"+"}</b><small>${p?.name||"Spieler wählen"}</small></button>`}).join("");
    const roster=sortPlayersByPosition(t.players||[]).map(p=>`<button type="button" class="goal-bench-player default-squad-player ${selectedSet.has(p.id)?"is-in-xi":""}" data-default-player="${p.id}"><span>${p.position||"SP"}</span><b>${p.shirtNumber||"–"}</b><small>${p.name}</small></button>`).join("");
    el("#overlay").innerHTML=`<div class="modal"><div class="sheet default-lineup-sheet"><div class="sheet-head"><div><div class="eyebrow">${t.name}</div><h2>Startaufstellung festlegen</h2><p class="subtitle">4-3-2-1 · Tippe zuerst eine Position und danach den gewünschten Spieler.</p></div><button class="iconbtn" id="close">×</button></div><div class="goal-picker-pitch default-lineup-pitch">${pitch}</div><div class="goal-picker-bench"><div class="goal-picker-bench-title"><b>Kompletter Mannschaftskader</b><span>${t.players.length} Spieler · grün markiert = Startelf</span></div><div class="goal-picker-bench-list default-squad-list">${roster}</div></div><div class="actions sticky-lineup-actions"><button id="saveManualLineup" class="btn primary">Startelf speichern</button><button id="autoManualLineup" class="btn secondary">Automatisch neu wählen</button></div></div></div>`;
    el("#close").onclick=()=>openTeam(teamId);
    document.querySelectorAll("[data-default-slot]").forEach(btn=>btn.onclick=()=>{activeSlot=Number(btn.dataset.defaultSlot);draw();});
    document.querySelectorAll("[data-default-player]").forEach(btn=>btn.onclick=()=>{const pid=Number(btn.dataset.defaultPlayer);const oldIndex=selected.indexOf(pid);if(oldIndex>=0&&oldIndex!==activeSlot){const displaced=selected[activeSlot];selected[oldIndex]=displaced||null;}selected[activeSlot]=pid;activeSlot=Math.min(10,activeSlot+1);draw();});
    el("#autoManualLineup").onclick=()=>{t.defaultLineup=[];selected=chooseLineup(t).map(p=>p.id).slice(0,11);while(selected.length<11)selected.push(null);activeSlot=0;draw();};
    el("#saveManualLineup").onclick=async()=>{const ids=selected.filter(Boolean);if(ids.length!==11||new Set(ids).size!==11)return toast("Bitte 11 verschiedene Spieler auswählen");t.defaultFormation="4-3-2-1";t.defaultLineup=[...ids];for(const m of season().matches||[]){if(m.status==="played")continue;m.lineups||={home:[],away:[],homeBench:[],awayBench:[]};if(m.homeId===t.id){m.lineups.home=[...ids];m.lineups.homeBench=fullBenchIds(t,ids,m.lineups.homeBench);}if(m.awayId===t.id){m.lineups.away=[...ids];m.lineups.awayBench=fullBenchIds(t,ids,m.lineups.awayBench);}}await saveState({label:"Startaufstellung manuell gespeichert"});toast("Startelf gespeichert – alle übrigen Spieler sind auswählbar");openTeam(teamId);};
  };
  draw();
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
    players:[]
  };

  let pendingLogo=teamEditorDraft?.id===id ? teamEditorDraft.logo : (t.logo||"");
  let pendingStadium=teamEditorDraft?.id===id ? teamEditorDraft.stadium : (t.stadium?.image||"");

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
    teamEditorDraft={id,logo:pendingLogo,stadium:pendingStadium};
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
    teamEditorDraft={id,logo:pendingLogo,stadium:pendingStadium};
    openTeamEditor(id);
  };

  const removeLogo=el("#removeLogo");
  if(removeLogo)removeLogo.onclick=()=>{
    teamEditorDraft={id,logo:"",stadium:pendingStadium};
    openTeamEditor(id);
  };

  const removeStadium=el("#removeStadiumImage");
  if(removeStadium)removeStadium.onclick=()=>{
    teamEditorDraft={id,logo:pendingLogo,stadium:""};
    openTeamEditor(id);
  };

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
    "4-3-3":[["GK",50,88],["LB",14,70],["CB1",38,72],["CB2",62,72],["RB",86,70],["CM1",25,50],["CM2",50,45],["CM3",75,50],["LW",18,23],["ST",50,13],["RW",82,23]],
    "4-2-3-1":[["GK",50,88],["LB",14,70],["CB1",38,72],["CB2",62,72],["RB",86,70],["DM1",35,55],["DM2",65,55],["LAM",20,34],["CAM",50,31],["RAM",80,34],["ST",50,13]],
    "4-4-2":[["GK",50,88],["LB",14,70],["CB1",38,72],["CB2",62,72],["RB",86,70],["LM",18,45],["CM1",40,48],["CM2",60,48],["RM",82,45],["ST1",38,17],["ST2",62,17]],
    "3-5-2":[["GK",50,88],["CB1",25,70],["CB2",50,73],["CB3",75,70],["LWB",12,48],["CM1",35,50],["CAM",50,37],["CM2",65,50],["RWB",88,48],["ST1",38,16],["ST2",62,16]]
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
