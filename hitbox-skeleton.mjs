const nodeRuntime=typeof process!=='undefined'&&process.versions?.node;
const {HITBOX_COMBAT_SKELETON:combatData}=nodeRuntime
 ? (await import('./server-hitbox-data.mjs')).loadServerHitboxes('combat')
 : await import('./hitbox-combat-skeleton-data.mjs');
const {HITBOX_SKELETON:data}=nodeRuntime
 ? (await import('./server-hitbox-data.mjs')).loadServerHitboxes('skeleton')
 : await import('./hitbox-skeleton-data.mjs');
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function slerp(a,b,t){
 let dot=a.reduce((s,v,i)=>s+v*b[i],0);if(dot<0){b=b.map(v=>-v);dot=-dot;}
 if(dot>.9995){const q=mix(a,b,t),length=Math.hypot(...q);return q.map(v=>v/length);}
 const angle=Math.acos(Math.min(1,dot)),den=Math.sin(angle),x=Math.sin((1-t)*angle)/den,y=Math.sin(t*angle)/den;
 return a.map((v,i)=>v*x+b[i]*y);
}
function multiply(a,b){const [x,y,z,w]=a,[X,Y,Z,W]=b;return [w*X+x*W+y*Z-z*Y,w*Y+y*W+z*X-x*Z,w*Z+z*W+x*Y-y*X,w*W-x*X-y*Y-z*Z];}
function rotate(p,q){const v=multiply(multiply(q,[...p,0]),[-q[0],-q[1],-q[2],q[3]]);return v.slice(0,3);}
function sample(key,phase){
 const frames=data.clips[key]?.frames;if(!frames)return null;
 const u=((phase%1)+1)%1*frames.length,i=Math.floor(u),t=u-i,a=frames[i],b=frames[(i+1)%frames.length];
 return Object.fromEntries(data.names.map((n,i)=>{const x=data.pool[a[i]],y=data.pool[b[i]];return [n,[...mix(x.slice(0,3),y.slice(0,3),t),...slerp(x.slice(3),y.slice(3),t)]];}));
}
// Blend the original local transforms, then evaluate the parent chain.
// Reproduce the display torso height correction after native bone mixing.
// Match display skinning floor correction and the original two-bone leg IK.
// No hitbox radius, source animation, or weapon value changes.
export function sampleNativeSkeletonPose(m,p={}){
 if(!m)return null;
 if(m.previousKey&&m.blend===0)return sampleNativeSkeletonPose({key:m.previousKey,phase:m.previousPhase},p);
 if(m.previousKey&&m.blend>=1)return sampleNativeSkeletonPose({key:m.key,phase:m.phase},p);
 const previous=m.previousKey||m.key,t=Math.max(0,Math.min(1,m.previousKey?(m.blend??1):1));
 const a=sample(previous,m.previousPhase??m.phase),b=sample(m.key,m.phase);if(!a||!b)return null;
 const local=Object.fromEntries(data.names.map(n=>[n,[...mix(a[n].slice(0,3),b[n].slice(0,3),t),...slerp(a[n].slice(3),b[n].slice(3),t)]]));
 const action=p.hitboxAction,age=((p.hitboxSampleAt??Date.now())-(action?.at??0))/1000;
 const combat=action?.weapon===m.key.split('|')[0].replace(/-ads$/,'')&&p.hp!==0?combatFrame(action,age,m.key.includes('|crouch')):null;
 if(combat){const old=m.previousKey&&t<1&&previous.includes('|crouch')!==m.key.includes('|crouch')?combatFrame(action,age,previous.includes('|crouch')):null;
  for(const n of combatData.names)local[n]=old?[...mix(old[n].slice(0,3),combat[n].slice(0,3),t),...slerp(old[n].slice(3),combat[n].slice(3),t)]:combat[n];
 }
 const now=p.hitboxSampleAt??Date.now(),blocked=(p.reloadUntil||0)>now||(p.equipUntil||0)>now;
 let nativeFire=false;
 if(!combat&&!blocked&&p.hp!==0){
  const history=Array.isArray(p.hitboxFire)?p.hitboxFire:[{at:p.lastShot,weapon:p.lastShotWeapon||p.weapon}];
  for(let i=0;i<history.length;i++){
   const event=history[i],clip=combatData.fire[event.weapon+((event.ads??m.key.includes('-ads|'))?'-ads':'')]||combatData.fire[event.weapon],age=(now-event.at)/1000;if(!clip)continue;if(!event.at||event.weapon!==m.key.split('|')[0].replace(/-ads$/,'')||age<0)continue;
   const newer=history[i+1],fade=newer&&newer.at<=now?Math.max(0,1-(now-newer.at)/60):age>clip.duration?Math.max(0,1-(age-clip.duration)/.08):Math.min(1,age/.025),weight=.55*fade;
   if(weight<=0)continue;nativeFire=true;
   for(const track of clip.tracks){const v=sampleFireTrack(track,Math.min(age,clip.duration));if(track.property==='quaternion')local[track.name]=[...local[track.name].slice(0,3),...multiply(local[track.name].slice(3),slerp([0,0,0,1],v,weight))];else for(let j=0;j<3;j++)local[track.name][j]+=v[j]*weight;}
  }
 }
 const world={};
 for(const n of data.names){
  const pos=local[n].slice(0,3),q=local[n].slice(3),parent=world[data.parents[n]];
  const parentQ=parent?.q||data.baseQuaternion,offset=rotate(pos,parentQ);
  world[n]={p:offset.map((v,i)=>v+(parent?.p[i]??data.basePosition[i])),q:multiply(parentQ,q)};
 }
 const stance=k=>k.includes('|crouch'),weapon=m.key.split('|')[0],grounded=!m.key.endsWith('|jump-lower');
 const descendant=(n,ancestor)=>{for(let p=n;p;p=data.parents[p])if(p===ancestor)return true;return false;};
 const shift=(dy,ancestor)=>{for(const n of data.names)if(!ancestor||descendant(n,ancestor))world[n].p[1]+=dy;};
 const floor=()=>Math.min(...data.sole.map(influences=>influences.reduce((sum,{name,weight,offset})=>sum+weight*(world[name].p[1]+rotate(offset,world[name].q)[1]),0)));
 if(grounded)shift(-floor());
 const targets=Object.fromEntries(['L','R'].map(side=>[side,[...world[side+'_Foot'].p]]));
 const desired=(stance(previous)?1.2:1.8)*(1-t)+(stance(m.key)?1.2:1.8)*t;
 const oldWeapon=m.key.includes('-ads|')||previous?.includes('-ads|')?previous.split('|')[0]:weapon;const oldOffset=data.headTopOffsets[oldWeapon+(stance(previous)?'-crouch-upper':'-upper')],nextOffset=data.headTopOffsets[weapon+(stance(m.key)?'-crouch-upper':'-upper')];
 const offset=oldOffset+(nextOffset-oldOffset)*t;
 const correction=desired-world.Head.p[1]-offset;
 if(Math.abs(correction)>.003){
  shift(correction,'Splitter');
  if(grounded)for(const side of ['L','R']){
   const hip=side+'_Hip',knee=side+'_Knee',foot=side+'_Foot',target=targets[side],footRotation=[...world[foot].q];
   const a=[...world[hip].p],b=[...world[knee].p],c=[...world[foot].p];
   const first=length(sub(b,a)),second=length(sub(c,b)),toward=normalize(sub(target,a)),distance=Math.max(.001,Math.min(length(sub(target,a)),first+second-.00001));
   let bend=sub(sub(b,a),scale(toward,dot(sub(b,a),toward)));if(dot(bend,bend)<1e-8)bend=[0,0,-1];bend=normalize(bend);
   const along=(first*first-second*second+distance*distance)/(2*distance),out=Math.sqrt(Math.max(0,first*first-along*along));
   const wanted=add(add(a,scale(toward,along)),scale(bend,out));
   const turn=(joint,delta)=>{const origin=[...world[joint].p];for(const n of data.names)if(descendant(n,joint)){world[n].p=add(origin,rotate(sub(world[n].p,origin),delta));world[n].q=multiply(delta,world[n].q);}};
   turn(hip,fromVectors(sub(b,a),sub(wanted,a)));
   turn(knee,fromVectors(sub(world[foot].p,world[knee].p),sub(target,world[knee].p)));
   const q=world[foot].q;turn(foot,multiply(footRotation,[-q[0],-q[1],-q[2],q[3]]));
  }
 }
 if(grounded)shift(-floor());
 const pose=Object.fromEntries(data.names.filter(n=>n!=='Root').map(n=>[n,world[n].p]));Object.defineProperty(pose,'nativeCombat',{value:!!combat||nativeFire});return pose;
}
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),length=a=>Math.hypot(...a),normalize=a=>scale(a,1/(length(a)||1));
function fromVectors(from,to){
 const a=normalize(from),b=normalize(to),r=dot(a,b)+1;
 let q=r<1e-6?(Math.abs(a[0])>Math.abs(a[2])?[-a[1],a[0],0,0]:[0,-a[2],a[1],0]):[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0],r];
 return scale(q,1/length(q));
}

function combatFrame(action,age,crouch){
 const clip=combatData.clips[action.weapon+'|'+action.kind+'|'+crouch];if(!clip||age<0||age>=clip.duration)return null;
 const u=age*clip.hz,i=Math.min(clip.frames.length-2,Math.floor(u)),t=u-i,a=clip.frames[i],b=clip.frames[i+1];
 return Object.fromEntries(combatData.names.map((n,j)=>{const x=combatData.pool[a[j]],y=combatData.pool[b[j]];return [n,[...mix(x.slice(0,3),y.slice(0,3),t),...slerp(x.slice(3),y.slice(3),t)]];}));
}

function sampleFireTrack(track,age){
 const times=track.times,size=track.property==='quaternion'?4:3;let i=0;while(i<times.length-2&&times[i+1]<=age)i++;
 const t=Math.max(0,Math.min(1,(age-times[i])/(times[i+1]-times[i]||1))),a=track.values.slice(i*size,(i+1)*size),b=track.values.slice((i+1)*size,(i+2)*size);
 return size===4?slerp(a,b,t):mix(a,b,t);
}
