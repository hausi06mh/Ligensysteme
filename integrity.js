
export function validateState(state){
  const errors=[];
  if(!Array.isArray(state.leagues))errors.push("Ligen fehlen");
  if(!Array.isArray(state.teams))errors.push("Teams fehlen");
  const teamIds=new Set(state.teams.map(t=>t.id));
  for(const league of state.leagues||[]){
    for(const season of league.seasons||[]){
      for(const id of season.teamIds||[])if(!teamIds.has(id))errors.push(`Unbekannte Team-ID ${id}`);
      const matchIds=new Set();
      for(const m of season.matches||[]){
        if(matchIds.has(m.id))errors.push(`Doppelte Spiel-ID ${m.id}`);
        matchIds.add(m.id);
        if(m.homeId===m.awayId)errors.push(`Ungültige Partie ${m.id}`);
        if(!teamIds.has(m.homeId)||!teamIds.has(m.awayId))errors.push(`Partie ${m.id} enthält unbekanntes Team`);
        if(Number(m.homeGoals)<0||Number(m.awayGoals)<0)errors.push(`Negative Tore in Partie ${m.id}`);
      }
    }
  }
  return errors;
}
export function normalizeState(state){
  state.undoStack ||= [];
  state.settings ||= {};
  state.settings.relegationPlaces ??= 2;
  state.settings.promotionPlaces ??= 2;
  state.settings.autoBackup ??= true;
  state.settings.compactMode ??= false;
  state.cups ||= [];
  return state;
}
