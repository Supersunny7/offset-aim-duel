import {advanceHitboxMotion} from './hitbox-motion.mjs';
import {playerHitboxes,rayHitbox} from './hitbox-profile.mjs';
export {playerHitboxes,rayHitbox} from './hitbox-profile.mjs';
import {weaponRunSpeed} from './weapons.mjs';
import {stepHorizontalVelocity} from './movement-feel.mjs';
import {rememberAccuracyMovement} from './accuracy.mjs';
import {ascentMove,ascentBlocked,ascentWall,groundedStance,DUEL_MAP} from './map-collision.mjs';
export const RATE=60, SPEED=5.4, EYE=1.62, RADIUS=.32;
export const GRAVITY=20, JUMP_SPEED=7;
export const bodyHeight=p=>p.crouch?1.2:1.8;
export const eyeHeight=p=>(p.y||0)+(p.crouch?1.05:EYE);
export const BOXES=[
 {x:0,z:0,w:3.2,d:3.2,h:2.7},
 {x:-5,z:-4,w:2.4,d:3,h:2.5},{x:5,z:4,w:2.4,d:3,h:2.5},
 {x:5,z:-6,w:2,d:2,h:1.15},{x:-5,z:6,w:2,d:2,h:1.15},
 {x:-8,z:0,w:1.5,d:4,h:3},{x:8,z:0,w:1.5,d:4,h:3},
 {x:-3,z:-9,w:2,d:1.4,h:1.1},{x:3,z:9,w:2,d:1.4,h:1.1}
];
export const SPAWNS=[{x:0,z:11,yaw:0},{x:0,z:-11,yaw:Math.PI},{x:-8,z:11,yaw:0},{x:8,z:-11,yaw:Math.PI}];
export const mapBoxes=map=>map==='duel'?DUEL_MAP.boxes:BOXES;
export function blocked(x,z,y=0,height=1.8,map='training'){if(map==='ascent')return ascentBlocked(x,z,y,height);return Math.abs(x)>10.6||Math.abs(z)>12.6||mapBoxes(map).some(b=>Math.abs(x-b.x)<b.w/2+RADIUS&&Math.abs(z-b.z)<b.d/2+RADIUS&&y<(b.y||0)+b.h-.001&&y+height>(b.y||0)+.001);}

// Solid character bodies share the existing world capsule radius. These are
// movement bounds, not damage hitboxes or claimed original-game measurements.
export function constrainCharacterMotion(p,previous){
 const bodies=(p.collisionPeers||[]).filter(q=>q.hp>0&&q.id!==p.id);
 for(const q of bodies){if(Math.hypot(p.x-q.x,p.z-q.z)>=RADIUS*2)continue;const top=(q.y||0)+bodyHeight(q),oldY=previous.y??p.y??0;
  if(p.vy<=0&&oldY>=top-.001&&(p.y||0)<top){p.y=top;p.vy=0;p.grounded=true;}
  else if(p.vy>0&&oldY+bodyHeight(p)<=(q.y||0)+.001&&(p.y||0)+bodyHeight(p)>(q.y||0)){p.y=(q.y||0)-bodyHeight(p);p.vy=0;}
 }
 const peers=bodies.filter(q=>(p.y||0)+bodyHeight(p)>(q.y||0)+.001&&(q.y||0)+bodyHeight(q)>(p.y||0)+.001);
 if(!peers.length)return;
 const target={x:p.x,z:p.z},clearance=RADIUS*2;
 p.x=previous.x;p.z=previous.z;
 for(const axis of ['x','z']){
  const other=axis==='x'?'z':'x',start=p[axis];let end=target[axis];
  for(const q of peers){
   const offset=p[other]-q[other];if(Math.abs(offset)>=clearance)continue;
   const span=Math.sqrt(clearance*clearance-offset*offset),low=q[axis]-span,high=q[axis]+span;
   if(end>start&&start<=low+.000001&&end>low)end=Math.min(end,low);
   else if(end<start&&start>=high-.000001&&end<high)end=Math.max(end,high);
   else if(start>low&&start<high&&Math.abs(end-q[axis])<Math.abs(start-q[axis]))end=start;
  }
  p[axis]=end;if(Math.abs(end-target[axis])>.000001)p[axis==='x'?'vx':'vz']=0;
 }
 if(blocked(p.x,p.z,p.y||0,bodyHeight(p),p.map)){p.x=previous.x;p.z=previous.z;p.vx=p.vz=0;}
}

export function move(p,i,dt){
 const previous={x:p.x,y:p.y||0,z:p.z};
 if(p.map==='ascent'){ascentMove(p,i,dt,{height:bodyHeight,radius:RADIUS,speed:weaponRunSpeed(p.weapon,p.ads),gravity:GRAVITY,jump:JUMP_SPEED});constrainCharacterMotion(p,previous);rememberAccuracyMovement(p,i);advanceHitboxMotion(p,dt);return;}
 p.y??=0;p.vy??=0;p.vx??=0;p.vz??=0;p.grounded??=p.y<=0;
 const takeoff=groundedStance(p,i,()=>blocked(p.x,p.z,p.y,1.8,p.map));
 if(takeoff){p.vy=JUMP_SPEED;p.grounded=false;}
 p.jumpHeld=!!i.jump;
 const oldY=p.y;
 p.vy-=GRAVITY*dt;
 let nextY=p.y+p.vy*dt, floor=0;
 for(const b of mapBoxes(p.map)){
  if(Math.abs(p.x-b.x)>=b.w/2+RADIUS||Math.abs(p.z-b.z)>=b.d/2+RADIUS)continue;
  const bottom=b.y||0,top=bottom+b.h;
  if(p.vy<=0&&oldY>=top-.001&&nextY<=top)floor=Math.max(floor,top);
  if(p.vy>0&&oldY+bodyHeight(p)<=bottom&&nextY+bodyHeight(p)>bottom){nextY=bottom-bodyHeight(p);p.vy=0;}
 }
 if(nextY<=floor){p.y=floor;p.vy=0;p.grounded=true;}else{p.y=nextY;p.grounded=false;}
 let sx=(i.right?1:0)-(i.left?1:0),sz=(i.back?1:0)-(i.forward?1:0),n=Math.hypot(sx,sz)||1;
 let dx=(sx*Math.cos(p.yaw)+sz*Math.sin(p.yaw))/n,dz=(-sx*Math.sin(p.yaw)+sz*Math.cos(p.yaw))/n;
 const speed=weaponRunSpeed(p.weapon,p.ads)*(i.walk?.52:1)*(p.crouch?.6:1);
 stepHorizontalVelocity(p,dx*speed,dz*speed,dt);
 if(!blocked(p.x+p.vx*dt,p.z,p.y,bodyHeight(p),p.map))p.x+=p.vx*dt;else p.vx=0;
 if(!blocked(p.x,p.z+p.vz*dt,p.y,bodyHeight(p),p.map))p.z+=p.vz*dt;else p.vz=0;
 constrainCharacterMotion(p,previous);rememberAccuracyMovement(p,i);advanceHitboxMotion(p,dt);
}
export function direction(yaw,pitch){return {x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};}
export function rayBox(o,d,min,max){let lo=0,hi=200;for(const a of ['x','y','z']){if(Math.abs(d[a])<1e-8){if(o[a]<min[a]||o[a]>max[a])return Infinity;continue;}let t1=(min[a]-o[a])/d[a],t2=(max[a]-o[a])/d[a];lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return Infinity;}return lo;}
export function trace(o,d,target,map='training'){
 let wall=d.y<-.000001&&o.y>=0?-o.y/d.y:Infinity;for(const b of mapBoxes(map))wall=Math.min(wall,rayBox(o,d,{x:b.x-b.w/2,y:0,z:b.z-b.d/2},{x:b.x+b.w/2,y:b.h,z:b.z+b.d/2}));
 wall=Math.min(wall,rayBox(o,d,{x:-11.3,y:0,z:-13.3},{x:-11,y:5,z:13.3}),rayBox(o,d,{x:11,y:0,z:-13.3},{x:11.3,y:5,z:13.3}),rayBox(o,d,{x:-11,y:0,z:-13.3},{x:11,y:5,z:-13}),rayBox(o,d,{x:-11,y:0,z:13},{x:11,y:5,z:13.3}));
 if(map==='ascent')wall=ascentWall(o,d);
 if(!target||target.hp<=0)return {distance:Math.min(wall,100),part:null};
 let nearest=wall,part=null;
 for(const shape of target.hitboxShapes||playerHitboxes(target)){const distance=rayHitbox(o,d,shape);if(distance<nearest){nearest=distance;part=shape.part;}}
 if(part)return {distance:nearest,part};
 return {distance:Math.min(wall,100),part:null};
}
