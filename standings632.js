
export function getLeague(state){
  return state.leagues.find(l=>l.id===state.activeLeagueId) || state.leagues[0];
}
export function getSeason(state, league=getLeague(state)){
  return league.seasons.find(s=>s.id===state.activeSeasonId) || league.seasons.find(s=>s.status==="active") || league.seasons[0];
}
export function getTeam(state,id){ return state.teams.find(t=>t.id===Number(id)); }
export function standingsAt(state, matchday=null){
  const league = getLeague(state), season = getSeason(state,league);
  const rows = season.teamIds.map(id=>{
    const t = getTeam(state,id);
    return {id:t.id,name:t.name,short:t.short,color:t.color,logo:t.logo,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0};
  });
  const map = Object.fromEntries(rows.map(r=>[r.id,r]));
  for(const m of season.matches.filter(m=>m.status==="played" && (matchday===null || m.matchday<=matchday))){
    const h=map[m.homeId], a=map[m.awayId]; if(!h||!a) continue;
    h.p++;a.p++;h.gf+=m.homeGoals;h.ga+=m.awayGoals;a.gf+=m.awayGoals;a.ga+=m.homeGoals;
    if(m.homeGoals>m.awayGoals){h.w++;a.l++;h.pts+=state.settings.pointsWin}
    else if(m.homeGoals<m.awayGoals){a.w++;h.l++;a.pts+=state.settings.pointsWin}
    else{h.d++;a.d++;h.pts+=state.settings.pointsDraw;a.pts+=state.settings.pointsDraw}
  }
  return rows.sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||a.name.localeCompare(b.name));
}
export function movementAt(state, matchday){
  if(!matchday || matchday<=1) return {};
  const prev=standingsAt(state,matchday-1), cur=standingsAt(state,matchday);
  const p=Object.fromEntries(prev.map((r,i)=>[r.id,i+1]));
  const out={};cur.forEach((r,i)=>out[r.id]=p[r.id]-(i+1));
  return out;
}
export function maxMatchday(state){
  const season=getSeason(state);return Math.max(0,...season.matches.map(m=>m.matchday||0));
}
