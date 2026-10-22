// Engineering tuning for this game; these are not claimed Riot constants.
export function stepHorizontalVelocity(p,x,z,dt){
  const step=(value,target)=>{
    const braking=Math.abs(target)<1e-8||Math.abs(target)<Math.abs(value)&&value*target>=0;
    const reversing=value*target<0;
    const rate=p.grounded?(braking?90:reversing?60:30):30;
    const next=value+(target-value)*(1-Math.exp(-dt*rate));
    return Math.abs(target)<1e-8&&Math.abs(next)<.015?0:next;
  };
  p.vx=step(p.vx||0,x);p.vz=step(p.vz||0,z);
}

// Animation receives velocity from the same displayed trajectory as position.
export function stepOpponentDisplay(current,target,dt){
  if(!(dt>0))return {...current,vx:0,vz:0};
  const a=1-Math.exp(-dt*20),next={};
  for(const key of ['x','y','z'])next[key]=current[key]+((target[key]||0)-current[key])*a;
  next.vx=(next.x-current.x)/dt;next.vz=(next.z-current.z)/dt;
  return next;
}
