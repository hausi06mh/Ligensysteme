
const MAX_NEWS=250;
const MAX_TRANSACTIONS=120;
const MAX_TRANSFER_LOG=500;
const MAX_UNDO=25;
const MAX_ARCHIVED_SEASONS=150;
function cloneCareerWithoutMedia(value){
 if(value===null||typeof value!=="object")return value;
 if(Array.isArray(value))return value.map(cloneCareerWithoutMedia);
 const out={};
 for(const [key,item] of Object.entries(value)){
  if((key==="logo"||key==="image"||key==="avatar"||key==="photo")&&typeof item==="string"&&item.startsWith("data:image/")){out[key]="";continue}
  out[key]=cloneCareerWithoutMedia(item);
 }
 return out;
}


export function migrateState(state){
 const s=state||{};
 s.schemaVersion ||= 19;
 s.settings ||= {};
 s.settings.mobileCompact ??= true;
 s.settings.autoBackup ??= true;
 s.settings.resumeLastView ??= true;
 s.settings.performanceMode ??= false;
 s.settings.lastView ||= "home";
 s.settings.lastCompetitionId ||= null;
 s.manager ||= {managedTeamId:null,aiTransfers:true,lastAiWindow:""};
 s.news ||= [];
 s.competitions ||= [];
 s.transferLog ||= [];
 s.academyPlayers ||= [];
 s.freeAgents ||= [];
 s.retiredPlayers ||= [];
 s.archives ||= [];
 s.backups ||= [];
 s.hallOfFame ||= [];
 s.records ||= {
  mostGoalsSeason:null,
  mostPointsSeason:null,
  biggestWin:null,
  mostTitles:{}
 };
 s.careerMeta ||= {
  seasonsPlayed:0,
  createdAt:new Date().toISOString(),
  lastSavedAt:new Date().toISOString(),
  lastAutosaveAt:"",
  lastBackupAt:"",
  activeSaveName:"Hauptkarriere"
 };
 for(const t of s.teams||[]){
  t.aiEnabled ??= true;
  t.finance ||= {
   balance:2000000,transferBudget:750000,wageBudget:200000,sponsorIncome:500000,
   ticketPrice:18,wageExpense:0,seasonIncome:0,seasonExpense:0,transactions:[]
  };
  t.finance.transactions ||= [];
  t.players ||= [];
  for(const p of t.players){
   p.history ||= [];
   p.transferHistory ||= [];
   p.stats ||= {apps:0,goals:0,assists:0,yellow:0,red:0};
   p.potential ||= Math.max(Number(p.rating||60),Number(p.rating||60)+5);
   p.status ||= "active";
  }
 }
 for(const c of s.competitions){
  c.status ||= "active";
  c.groups ||= [];
  c.rounds ||= [];
  c.teamIds ||= [];
  c.currentStep ||= 0;
  c.resumeToken ||= `${c.id}:${c.status}:${c.rounds.length}:${c.groups.length}`;
 }
 s.schemaVersion=19;
 return s;
}

export function compactCareerState(state){
 const s=state;
 s.news=(s.news||[]).slice(0,MAX_NEWS);
 s.transferLog=(s.transferLog||[]).slice(-MAX_TRANSFER_LOG);
 s.archives=(s.archives||[]).slice(-MAX_ARCHIVED_SEASONS);
 s.backups=(s.backups||[]).slice(-3).map(b=>({ ...b, data: typeof b?.data==="string" ? JSON.stringify(cloneCareerWithoutMedia(JSON.parse(b.data))) : b?.data }));
 for(const t of s.teams||[]){
  if(t.finance?.transactions)t.finance.transactions=t.finance.transactions.slice(0,MAX_TRANSACTIONS);
  for(const p of t.players||[]){
   if(p.history?.length>40)p.history=p.history.slice(-40);
   if(p.transferHistory?.length>30)p.transferHistory=p.transferHistory.slice(-30);
  }
 }
 return s;
}

export function snapshotCareer(state,label="Automatisches Backup"){
 const raw=JSON.stringify(compactCareerState(cloneCareerWithoutMedia(state)));
 return {
  id:Date.now(),
  label,
  createdAt:new Date().toISOString(),
  schemaVersion:19,
  bytes:raw.length,
  data:raw
 };
}

export function restoreSnapshot(snapshot){
 const parsed=JSON.parse(snapshot.data);
 return migrateState(parsed);
}

export function createSaveExport(state){
 const payload={
  app:"Fantasy Liga Studio Elite",
  version:19,
  exportedAt:new Date().toISOString(),
  checksum:String(hashString(JSON.stringify(state))),
  state:compactCareerState(structuredClone(state))
 };
 return JSON.stringify(payload,null,2);
}

export function parseSaveImport(text){
 const payload=JSON.parse(text);
 const candidate=payload?.state||payload;
 return migrateState(candidate);
}

export function hashString(str){
 let h=2166136261;
 for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
 return h>>>0;
}

export function validateCareerState(state){
 const errors=[],warnings=[];
 if(!state||typeof state!=="object")errors.push("Spielstand ist kein Objekt.");
 if(!Array.isArray(state?.teams))errors.push("Teams fehlen.");
 if(!Array.isArray(state?.competitions))warnings.push("Wettbewerbe wurden ergänzt.");
 if(!Array.isArray(state?.news))warnings.push("Nachrichten wurden ergänzt.");
 const ids=new Set();
 for(const t of state?.teams||[]){
  if(ids.has(t.id))errors.push(`Doppelte Team-ID ${t.id}`);
  ids.add(t.id);
  if(!Array.isArray(t.players))errors.push(`Spielerliste fehlt bei ${t.name}`);
 }
 return {ok:errors.length===0,errors,warnings};
}

export function normalizeCompetitionParticipants(ids){
 const clean=[...new Set((ids||[]).map(Number).filter(Number.isFinite))];
 return clean;
}

export function recommendedBracketSize(count){
 let n=1;while(n<count)n*=2;return n;
}

export function competitionDiagnostics(c){
 const teamCount=(c.teamIds||[]).length;
 const bracket=recommendedBracketSize(Math.max(2,teamCount));
 const byes=Math.max(0,bracket-teamCount);
 const activeMatches=[
  ...(c.groups||[]).flatMap(g=>g.matches||[]),
  ...(c.rounds||[]).flatMap(r=>(r.ties||[]).flatMap(t=>t.matches||[]))
 ];
 return {
  teamCount,
  bracketSize:bracket,
  estimatedByes:byes,
  played:activeMatches.filter(m=>m.played).length,
  total:activeMatches.length,
  progress:activeMatches.length?Math.round(activeMatches.filter(m=>m.played).length/activeMatches.length*100):0
 };
}

export function updateCareerRecords(state,archive){
 const records=state.records;
 if(!archive)return;
 const table=archive.table||archive.finalTable||[];
 if(table[0]){
  const champion=table[0];
  records.mostTitles[champion.id]=(records.mostTitles[champion.id]||0)+1;
  if(!records.mostPointsSeason||Number(champion.pts||0)>records.mostPointsSeason.points){
   records.mostPointsSeason={teamId:champion.id,points:Number(champion.pts||0),season:archive.name||archive.season};
  }
 }
 for(const stat of archive.playerStats||[]){
  if(!records.mostGoalsSeason||Number(stat.goals||0)>records.mostGoalsSeason.goals){
   records.mostGoalsSeason={playerId:stat.playerId,playerName:stat.playerName,goals:Number(stat.goals||0),season:archive.name||archive.season};
  }
 }
}

export function hallOfFameCandidate(player,teamName){
 const career=(player.history||[]).reduce((a,h)=>({
  apps:a.apps+Number(h.stats?.apps||0),
  goals:a.goals+Number(h.stats?.goals||0),
  assists:a.assists+Number(h.stats?.assists||0)
 }),{apps:Number(player.stats?.apps||0),goals:Number(player.stats?.goals||0),assists:Number(player.stats?.assists||0)});
 const score=career.apps+career.goals*3+career.assists*2+Number(player.rating||0);
 if(score<180)return null;
 return {id:player.id,name:player.name,teamName,position:player.position,score,...career,inductedAt:new Date().toISOString()};
}
