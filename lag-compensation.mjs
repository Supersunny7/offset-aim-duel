import {playerHitboxes} from './shared.mjs';
export const HISTORY_MS=500,MAX_REWIND_MS=350;
export function clearShotHistory(room){room.shotHistory=[];for(const p of room.players||[]){p.viewSnapshot=null;p.queuedViewSnapshot=null;}}
export function recordShotSnapshot(room,id,at){
 if(!['active','waiting'].includes(room.phase))return;
 const actors=Object.fromEntries([...room.players,...(room.phase==='waiting'&&room.bot?[room.bot]:[])].map(p=>[p.id,{id:p.id,life:p.lifeEpoch??p.spawnEpoch,weapon:p.weapon,hp:p.hp,protectedUntil:p.protectedUntil||0,source:structuredClone(Object.fromEntries(['id','x','y','z','yaw','pitch','weapon','hp','lifeEpoch','spawnEpoch','crouch','grounded','vx','vz','reloadUntil','equipUntil','respawnAt','deathPart','hitboxMotion','hitboxAction','hitboxFire','lastShot','lastShotWeapon'].map(k=>[k,p[k]]))),shapes:playerHitboxes({...p,hitboxSampleAt:at})}]));
 const frame={id,at,actors,issued:room.players.filter(p=>p.connected&&p.ws?.readyState===1).map(p=>p.id)};
 room.shotHistory=(room.shotHistory||[]).filter(f=>at-f.at<=HISTORY_MS);room.shotHistory.push(frame);if(room.shotHistory.length>16)room.shotHistory.shift();
}
export function resolveShotHistory(room,shooter,enemy,view,now){
 const reject=reason=>({target:enemy,rewind:{applied:false,reason}});
 if(!['vandal','ghost'].includes(shooter.weapon)||!view)return reject('current');
 if(!['active','waiting'].includes(room.phase))return reject('phase');
 if(typeof view==='string')view={from:view,to:view,alpha:0};
 if(typeof view!=='object'||!Number.isFinite(view.alpha)||view.alpha<0||view.alpha>1)return reject('invalid');
 const history=room.shotHistory||[],a=history.find(f=>f.id===view.from),b=history.find(f=>f.id===view.to);
 if(!a||!b||!a.issued.includes(shooter.id)||!b.issued.includes(shooter.id))return reject('unissued');
 if(a.at>b.at||a.at>now||b.at>now)return reject('future');
 const at=a.at+(b.at-a.at)*view.alpha;
 if(now-at>MAX_REWIND_MS)return reject('expired');
 const sa=a.actors[shooter.id],sb=b.actors[shooter.id],ta=a.actors[enemy?.id],tb=b.actors[enemy?.id];
 if(!sa||!sb||!ta||!tb||!enemy)return reject('actor');
 if(sa.life!==(shooter.lifeEpoch??shooter.spawnEpoch)||sb.life!==sa.life||ta.life!==(enemy.lifeEpoch??enemy.spawnEpoch)||tb.life!==ta.life)return reject('life');
 if(sa.weapon!==shooter.weapon||sb.weapon!==shooter.weapon)return reject('weapon');
 if(sa.hp<=0||sb.hp<=0||ta.hp<=0||tb.hp<=0||enemy.hp<=0)return reject('dead');
 if(now<=enemy.protectedUntil||a.at<=ta.protectedUntil||b.at<=tb.protectedUntil)return reject('protected');
 const source=sampleViewPlayer(ta.source,tb.source,a.at,b.at,view.alpha);
 const shapes=playerHitboxes({...source,hitboxSampleAt:at});
 return {target:{...enemy,hitboxShapes:shapes},rewind:{applied:true,ageMs:now-at,at,from:a.id,to:b.id,alpha:view.alpha}};
}
// Select two actually received snapshots around the displayed actor position.
// Send IDs and a bounded fraction, never client-authored hitbox coordinates.
export function selectViewSnapshot(frames,position,enemyId,shooterId,weapon,life,minimumAt=-Infinity){
 let compatible=frames.filter(f=>{const p=f.players.find(p=>p.id===shooterId);return p&&p.weapon===weapon&&(p.lifeEpoch??p.spawnEpoch)===life&&f.players.some(q=>q.id===enemyId);});
 if(!compatible.length)return null;
 const latest=compatible.at(-1).players.find(p=>p.id===enemyId),enemyLife=latest.lifeEpoch??latest.spawnEpoch;compatible=compatible.filter(f=>{const p=f.players.find(p=>p.id===enemyId);return (p.lifeEpoch??p.spawnEpoch)===enemyLife&&p.weapon===latest.weapon;});
 let best={from:compatible.at(-1).snapshotId,to:compatible.at(-1).snapshotId,alpha:0},cost=Math.hypot(position.x-latest.x,position.y-(latest.y||0),position.z-latest.z);
 for(let i=0;i<compatible.length-1;i++){
  const a=compatible[i].players.find(p=>p.id===enemyId),b=compatible[i+1].players.find(p=>p.id===enemyId);if((a.lifeEpoch??a.spawnEpoch)!==(b.lifeEpoch??b.spawnEpoch))continue;
  const d={x:b.x-a.x,y:(b.y||0)-(a.y||0),z:b.z-a.z},length=d.x*d.x+d.y*d.y+d.z*d.z;
  let t=length>1e-10?Math.max(0,Math.min(1,((position.x-a.x)*d.x+(position.y-(a.y||0))*d.y+(position.z-a.z)*d.z)/length)):1;
  if(Number.isFinite(minimumAt)){const fromAt=compatible[i].now,toAt=compatible[i+1].now;if(toAt<minimumAt)continue;if(toAt>fromAt)t=Math.max(t,Math.min(1,(minimumAt-fromAt)/(toAt-fromAt)));}
  const distance=Math.hypot(position.x-a.x-d.x*t,position.y-(a.y||0)-d.y*t,position.z-a.z-d.z*t);
  if(distance<=cost){cost=distance;best={from:compatible[i].snapshotId,to:compatible[i+1].snapshotId,alpha:t};}
 }
 return best;
}

const mix=(a,b,t)=>a+(b-a)*t;
const phaseMix=(a=0,b=0,t)=>((a+((b-a+1)%1)*t)%1+1)%1;
export function sampleViewPlayer(a,b,fromAt,toAt,t){
 const at=mix(fromAt,toAt,t),out={...(t<1?a:b)};
 for(const k of ['x','y','z','vx','vz','pitch'])out[k]=mix(a[k]||0,b[k]||0,t);
 out.yaw=(a.yaw||0)+Math.atan2(Math.sin((b.yaw||0)-(a.yaw||0)),Math.cos((b.yaw||0)-(a.yaw||0)))*t;
 const am=a.hitboxMotion,bm=b.hitboxMotion;
 if(am&&bm){
  if(am.key===bm.key)out.hitboxMotion={...bm,phase:phaseMix(am.phase,bm.phase,t),previousPhase:phaseMix(am.previousPhase,bm.previousPhase,t),blend:mix(am.blend,bm.blend,t)};
  else out.hitboxMotion={...bm,phase:bm.phase*t,previousKey:am.key,previousPhase:phaseMix(am.phase,bm.previousPhase,t),blend:bm.blend*t};
  out.crouch=out.hitboxMotion.key.includes('|crouch');
  out.grounded=!out.hitboxMotion.key.endsWith('|jump-lower');
 }
 const action=[a.hitboxAction,b.hitboxAction].filter(x=>x&&x.at<=at).sort((x,y)=>x.at-y.at).at(-1)||null;
 const shots=[...(a.hitboxFire||[]),...(b.hitboxFire||[])].filter(x=>x.at<=at).sort((x,y)=>x.at-y.at);
 out.hitboxFire=[...new Map(shots.map(x=>[x.at,x])).values()].slice(-2);
 const last=Math.max(a.lastShot<=at?a.lastShot||0:0,b.lastShot<=at?b.lastShot||0:0);
 out.lastShot=last;out.lastShotWeapon=last===b.lastShot?b.lastShotWeapon:a.lastShotWeapon;out.hitboxAction=action&&!(last>action.at&&action.kind!=='primary'&&action.kind!=='secondary')?action:null;
 out.reloadUntil=action?.kind==='reload'&&out.hitboxAction?Math.max(a.reloadUntil||0,b.reloadUntil||0):0;
 out.equipUntil=action?.kind==='equip'?Math.max(a.equipUntil||0,b.equipUntil||0):0;
 if(b.hp<=0&&b.respawnAt>0&&at>=b.respawnAt-2000){out.hp=b.hp;out.respawnAt=b.respawnAt;out.deathPart=b.deathPart;}
 return out;
}
export function viewSample(frames,view,enemyId){
 if(typeof view==='string')view={from:view,to:view,alpha:0};if(!view)return null;
 const a=frames.find(f=>f.snapshotId===view.from),b=frames.find(f=>f.snapshotId===view.to);if(!a||!b)return null;
 const ap=a.players.find(p=>p.id===enemyId),bp=b.players.find(p=>p.id===enemyId);if(!ap||!bp)return null;
 return {player:sampleViewPlayer(ap,bp,a.now,b.now,view.alpha),at:mix(a.now,b.now,view.alpha),view};
}
