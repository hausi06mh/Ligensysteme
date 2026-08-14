export function roundRobin(teamIds, doubleRound=false){
  let arr=[...teamIds]; if(arr.length%2) arr.push(null);
  const n=arr.length, half=n/2, rounds=n-1, first=[];
  let work=[...arr];
  for(let r=0;r<rounds;r++){
    const games=[];
    for(let i=0;i<half;i++){
      let left=work[i],right=work[n-1-i];
      if(left===null||right===null)continue;
      // Berger-Prinzip: Das feste Team wechselt konsequent. Die übrigen
      // Paarungen werden gegensätzlich ausgerichtet. Dadurch entstehen
      // statt langen Heim-/Auswärtsserien normalerweise nur 1–2 Spiele.
      let homeId,awayId;
      if(i===0){ [homeId,awayId]=(r%2===0)?[left,right]:[right,left]; }
      else{ [homeId,awayId]=(i%2===0)?[left,right]:[right,left]; }
      games.push({homeId,awayId});
    }
    first.push(games);
    work=[work[0],work[n-1],...work.slice(1,n-1)];
  }
  const out=[];
  first.forEach((games,r)=>games.forEach(g=>out.push({matchday:r+1,...g})));
  if(doubleRound){
    // Die Rückrunde startet um einen Spieltag versetzt. So bleibt auch am
    // Übergang zwischen Hin- und Rückrunde der Heim/Auswärts-Rhythmus sauber.
    const second=first.length>1?[...first.slice(1),first[0]]:first;
    second.forEach((games,r)=>games.forEach(g=>out.push({matchday:rounds+r+1,homeId:g.awayId,awayId:g.homeId})));
  }
  return out;
}
export function dateForRound(startDate,round){
  const d=new Date(`${startDate}T12:00:00`);
  d.setDate(d.getDate()+(round-1)*7);
  return d.toISOString().slice(0,10);
}
