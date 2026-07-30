
export function roundRobin(teamIds, doubleRound=false){
  let arr=[...teamIds]; if(arr.length%2) arr.push(null);
  const n=arr.length, half=n/2, rounds=n-1, out=[];
  const build=(reverse,startRound)=>{
    let work=[...arr];
    for(let r=0;r<rounds;r++){
      for(let i=0;i<half;i++){
        let h=work[i],a=work[n-1-i];
        if(h!==null&&a!==null){
          if((r+i)%2===1)[h,a]=[a,h];
          if(reverse)[h,a]=[a,h];
          out.push({matchday:startRound+r,homeId:h,awayId:a});
        }
      }
      work=[work[0],work[n-1],...work.slice(1,n-1)];
    }
  };
  build(false,1);
  if(doubleRound) build(true,rounds+1);
  return out;
}
export function dateForRound(startDate,round){
  const d=new Date(`${startDate}T12:00:00`);
  d.setDate(d.getDate()+(round-1)*7);
  return d.toISOString().slice(0,10);
}
