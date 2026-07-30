
export function defaultFinance(team){
 const capacity=Number(team?.stadium?.capacity||8000);
 return {
  balance:Math.max(1500000,capacity*900),
  transferBudget:Math.max(600000,capacity*320),
  wageBudget:Math.max(120000,capacity*28),
  sponsorIncome:Math.max(250000,capacity*75),
  ticketPrice:18,
  wageExpense:0,
  seasonIncome:0,
  seasonExpense:0,
  transactions:[]
 };
}
export function playerWage(p){
 return Math.max(5000,Math.round((Number(p.rating||55)**2.35)*(1+(Math.max(0,25-Number(p.age||24))*.012))/1000)*1000);
}
export function recalcWages(team){
 const total=(team.players||[]).reduce((n,p)=>n+playerWage(p),0);
 team.finance.wageExpense=total;
 return total;
}
export function addTransaction(team,type,amount,label,meta={}){
 team.finance ||= defaultFinance(team);
 amount=Number(amount||0);
 team.finance.balance+=amount;
 if(amount>=0)team.finance.seasonIncome+=amount;else team.finance.seasonExpense+=Math.abs(amount);
 team.finance.transactions.unshift({id:Date.now()+Math.random(),date:new Date().toISOString().slice(0,10),type,amount,label,...meta});
 team.finance.transactions=team.finance.transactions.slice(0,100);
}
export function settleMatchFinance(home,away,match){
 if(!home||!away||match.financeSettled)return null;
 home.finance ||= defaultFinance(home); away.finance ||= defaultFinance(away);
 const attendance=Number(match.attendance||Math.round(Number(home.stadium?.capacity||8000)*(.52+Math.random()*.38)));
 const gate=Math.round(attendance*Number(home.finance.ticketPrice||18));
 const homeShare=Math.round(gate*.86),awayShare=gate-homeShare;
 addTransaction(home,"tickets",homeShare,`Zuschauererlös gegen ${away.name}`,{matchId:match.id});
 addTransaction(away,"away_share",awayShare,`Auswärtsanteil bei ${home.name}`,{matchId:match.id});
 match.financeSettled=true;return {attendance,gate};
}
export function seasonFinance(team,position=10){
 team.finance ||= defaultFinance(team);
 const sponsor=Math.round(team.finance.sponsorIncome*(1+Math.max(-.15,(11-position)*.012)));
 const prize=Math.max(50000,Math.round((21-position)*90000));
 const wages=Math.round(recalcWages(team));
 addTransaction(team,"sponsor",sponsor,"Sponsorenzahlung");
 addTransaction(team,"prize",prize,`Ligaprämie Platz ${position}`);
 addTransaction(team,"wages",-wages,"Jahresgehälter");
 team.finance.transferBudget=Math.max(100000,Math.round(team.finance.balance*.34));
 team.finance.seasonIncome=0;team.finance.seasonExpense=0;
 return {sponsor,prize,wages};
}
export function aiTransferWindow({teams,freeAgents,managedTeamId,news,transferLog,nextId,contractSeason}){
 const eligible=teams.filter(t=>t.id!==managedTeamId && t.aiEnabled!==false);
 let transfers=0;
 for(const buyer of eligible.sort(()=>Math.random()-.5)){
  buyer.finance ||= defaultFinance(buyer);recalcWages(buyer);
  const needs=[...["TW","IV","LV","RV","ZDM","ZM","ZOM","LA","RA","ST"]]
    .filter(pos=>(buyer.players||[]).filter(p=>p.position===pos).length<(pos==="IV"||pos==="ST"?2:1));
  let candidates=freeAgents.filter(p=>(!needs.length||needs.includes(p.position))&&Number(p.value||0)<=buyer.finance.transferBudget*.75)
    .sort((a,b)=>(b.rating+b.potential*.35)-(a.rating+a.potential*.35));
  if(!candidates.length)candidates=freeAgents.filter(p=>Number(p.value||0)<=buyer.finance.transferBudget*.75)
    .sort((a,b)=>(b.rating+b.potential*.35)-(a.rating+a.potential*.35));
  const p=candidates[Math.floor(Math.random()*Math.min(8,candidates.length))];
  if(!p||Math.random()<.28)continue;
  const fee=Math.max(0,Math.round(Number(p.value||0)*(.15+Math.random()*.18)));
  p.teamId=buyer.id;p.status="active";p.contractUntil=contractSeason(2+Math.floor(Math.random()*4));
  p.shirtNumber=p.shirtNumber||1+Math.floor(Math.random()*49);
  buyer.players.push(p);freeAgents.splice(freeAgents.indexOf(p),1);
  addTransaction(buyer,"transfer",-fee,`Verpflichtung ${p.name}`,{playerId:p.id});
  buyer.finance.transferBudget=Math.max(0,buyer.finance.transferBudget-fee);
  transferLog.push({id:Date.now()+transfers,playerId:p.id,playerName:p.name,fromId:null,fromName:"Vereinslos",toId:buyer.id,toName:buyer.name,fee,type:"ai",date:new Date().toISOString().slice(0,10)});
  news.unshift({id:Date.now()+transfers,type:"transfer",title:`${buyer.name} verpflichtet ${p.name}`,body:`Der ${p.age}-jährige ${p.position} unterschreibt bis ${p.contractUntil}.`,teamId:buyer.id,playerId:p.id,date:new Date().toISOString().slice(0,10)});
  transfers++;
  if(transfers>=Math.max(3,Math.ceil(eligible.length*.55)))break;
 }
 return transfers;
}
export function makeKnockoutRound(ids,legs=1,roundNo=1){
 const shuffled=[...ids].sort(()=>Math.random()-.5),ties=[],byes=[];
 for(let i=0;i<shuffled.length;i+=2){
  if(shuffled[i+1]==null){byes.push(shuffled[i]);continue}
  ties.push({id:`r${roundNo}t${ties.length+1}`,homeId:shuffled[i],awayId:shuffled[i+1],legs,played:false,
   matches:Array.from({length:legs},(_,li)=>({leg:li+1,homeId:li%2?shuffled[i+1]:shuffled[i],awayId:li%2?shuffled[i]:shuffled[i+1],homeGoals:0,awayGoals:0,played:false}))});
 }
 return {ties,byes};
}
export function createCompetition(config,teamIds){
 const c={id:config.id,name:config.name,type:config.type,scope:config.scope||"custom",teamIds:[...teamIds],status:"active",
  groupSize:Number(config.groupSize||4),groupLegs:Number(config.groupLegs||1),knockoutLegs:Number(config.knockoutLegs||1),
  finalLegs:Number(config.finalLegs||1),qualifiersPerGroup:Number(config.qualifiersPerGroup||2),groups:[],rounds:[],winnerTeamId:null,createdAt:new Date().toISOString()};
 if(c.type==="groups"){
  const shuffled=[...teamIds].sort(()=>Math.random()-.5);
  for(let i=0;i<shuffled.length;i+=c.groupSize){
   const ids=shuffled.slice(i,i+c.groupSize),matches=[];
   for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){
    matches.push({id:`g${c.groups.length+1}m${matches.length+1}a`,homeId:ids[a],awayId:ids[b],homeGoals:0,awayGoals:0,played:false});
    if(c.groupLegs===2)matches.push({id:`g${c.groups.length+1}m${matches.length+1}b`,homeId:ids[b],awayId:ids[a],homeGoals:0,awayGoals:0,played:false});
   }
   c.groups.push({id:c.groups.length+1,name:String.fromCharCode(65+c.groups.length),teamIds:ids,matches});
  }
 }else{
  const r=makeKnockoutRound(teamIds,c.knockoutLegs,1);c.rounds.push({name:"1. Runde",...r});
 }
 return c;
}
export function groupTable(group){
 const rows=Object.fromEntries(group.teamIds.map(id=>[id,{id,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}]));
 for(const m of group.matches.filter(x=>x.played)){
  const h=rows[m.homeId],a=rows[m.awayId];h.p++;a.p++;h.gf+=m.homeGoals;h.ga+=m.awayGoals;a.gf+=m.awayGoals;a.ga+=m.homeGoals;
  if(m.homeGoals>m.awayGoals){h.w++;a.l++;h.pts+=3}else if(m.homeGoals<m.awayGoals){a.w++;h.l++;a.pts+=3}else{h.d++;a.d++;h.pts++;a.pts++}
 }
 return Object.values(rows).sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf);
}
export function simulateCompetitionStep(c){
 const score=()=>Math.floor(Math.random()*4);
 if(c.type==="groups"&&c.groups.some(g=>g.matches.some(m=>!m.played))){
  for(const g of c.groups)for(const m of g.matches.filter(x=>!x.played)){m.homeGoals=score();m.awayGoals=score();m.played=true}
  const qualified=c.groups.flatMap(g=>groupTable(g).slice(0,c.qualifiersPerGroup).map(r=>r.id));
  const r=makeKnockoutRound(qualified,c.knockoutLegs,1);c.rounds.push({name:"K.-o.-Phase",...r});return "Gruppenphase beendet";
 }
 const round=c.rounds[c.rounds.length-1];if(!round)return "Keine Runde";
 for(const tie of round.ties.filter(t=>!t.played)){
  for(const m of tie.matches){m.homeGoals=score();m.awayGoals=score();m.played=true}
  let a=0,b=0;for(const m of tie.matches){if(m.homeId===tie.homeId){a+=m.homeGoals;b+=m.awayGoals}else{a+=m.awayGoals;b+=m.homeGoals}}
  if(a===b){if(Math.random()<.5)a++;else b++}
  tie.aggregateHome=a;tie.aggregateAway=b;tie.winnerId=a>b?tie.homeId:tie.awayId;tie.played=true;
 }
 const winners=[...(round.byes||[]),...round.ties.map(t=>t.winnerId)];
 if(winners.length===1){c.status="finished";c.winnerTeamId=winners[0];return "Wettbewerb beendet"}
 const legs=winners.length===2?c.finalLegs:c.knockoutLegs,r=makeKnockoutRound(winners,legs,c.rounds.length+1);
 c.rounds.push({name:winners.length===2?"Finale":winners.length===4?"Halbfinale":winners.length===8?"Viertelfinale":`${c.rounds.length+1}. K.-o.-Runde`,...r});
 return "Nächste Runde ausgelost";
}
