import {sampleNativeSkeletonPose} from './hitbox-skeleton.mjs';
const {HITBOX_MOTION,AIM_ANCESTORS}=typeof process!=='undefined'&&process.versions?.node
 ? (await import('./server-hitbox-data.mjs')).loadServerHitboxes('motion')
 : await import('./hitbox-motion-data.mjs');
export function advanceHitboxMotion(p,dt){
 const speed=Math.hypot(p.vx||0,p.vz||0),yaw=p.yaw||0;
 const right=(p.vx||0)*Math.cos(yaw)-(p.vz||0)*Math.sin(yaw),forward=-(p.vx||0)*Math.sin(yaw)-(p.vz||0)*Math.cos(yaw);
 const direction=Math.abs(right)>Math.abs(forward)?right>0?'e':'w':forward>0?'n':'s';
 const lower=p.grounded===false?'jump-lower':speed>.25?(p.crouch?'crouch-walk-':speed>3.4?'run-':'walk-')+direction:p.crouch?'crouch-lower':'idle-lower';
 const id=p.weapon||'vandal',poseWeapon=p.ads&&HITBOX_MOTION[id+'-ads|'+lower]?id+'-ads':id;
 const key=poseWeapon+'|'+lower,clip=HITBOX_MOTION[key];
 const rate=lower.startsWith('run')?Math.max(.6,speed/5.4):lower.startsWith('walk')?Math.max(.5,speed/2.7):lower.startsWith('crouch-walk')?Math.max(.5,speed/3.2):1;
 let m=p.hitboxMotion;
 if(!m||m.key!==key){
  const sameLower=m&&m.key.replace('-ads|','|')===key.replace('-ads|','|')&&(m.key.includes('-ads|')||key.includes('-ads|'));
  m=p.hitboxMotion={key,phase:sameLower?m.phase:0,previousKey:m?.key,previousPhase:m?.phase||0,previousRate:m?.rate||1,blend:m?0:1,rate,sharedLower:!!sameLower};
 }
 const previous=HITBOX_MOTION[m.previousKey];if(previous&&m.blend<1)m.previousPhase=(m.previousPhase+dt*m.previousRate/previous.duration)%1;
 m.phase=(m.phase+dt*rate/clip.duration)%1;if(m.sharedLower)m.previousPhase=m.phase;m.rate=rate;m.blend=Math.min(1,m.blend+dt/.09);
}
function framePose(key,phase){
 const clip=HITBOX_MOTION[key];if(!clip)return null;
 const u=((phase%1)+1)%1*clip.frames.length,a=Math.floor(u),b=(a+1)%clip.frames.length,f=u-a;
 return Object.fromEntries(Object.entries(clip.frames[a]).map(([bone,p])=>[bone,p.map((v,i)=>v+(clip.frames[b][bone][i]-v)*f)]));
}
export function extrapolateHitboxMotion(m,seconds){
 if(!m)return null;const clip=HITBOX_MOTION[m.key];if(!clip)return m;
 const dt=Math.max(0,Math.min(.1,seconds)),phase=(m.phase+dt*m.rate/clip.duration)%1;return {...m,phase,previousPhase:m.sharedLower?phase:m.previousPhase,blend:Math.min(1,m.blend+dt/.09)};
}
export function sampledHitboxPose(p){
 if(p.hitboxPose)return p.hitboxPose;
 const m=p.hitboxMotion;if(!m)return null;
 let current=framePose(m.key,m.phase);if(!current)return null;
 const previous=m.blend<1?framePose(m.previousKey,m.previousPhase):null;
 if(previous)current=Object.fromEntries(Object.entries(current).map(([bone,pos])=>[bone,pos.map((v,i)=>previous[bone][i]+(v-previous[bone][i])*m.blend)]));
 const native=sampleNativeSkeletonPose(m,p);if(native)for(const [bone,pos] of Object.entries(native))if(current[bone])current[bone]=pos;
 // Native combat transforms are composed before FK and leg IK.
 const pitch=Math.max(-1.45,Math.min(1.45,p.pitch||0));
 for(const [pivot,weight] of [['Spine3',.5],['Spine4',.3],['Neck',.2]]){
  const c=Math.cos(pitch*weight),s=Math.sin(pitch*weight);
  const origin=current[pivot];if(!origin)continue;
  for(const [bone,pos] of Object.entries(current))if(AIM_ANCESTORS[bone]?.includes(pivot)){
   const y=pos[1]-origin[1],z=pos[2]-origin[2];current[bone]=[pos[0],origin[1]+y*c-z*s,origin[2]+y*s+z*c];
  }
 }
 const head=current.Head,horizontal=Math.hypot(head[0],head[2]);
 if(horizontal>.14){const f=.14/horizontal-1,dx=head[0]*f,dz=head[2]*f;for(const [bone,pos] of Object.entries(current))current[bone]=[pos[0]+dx,pos[1],pos[2]+dz];}
 return current;
}
