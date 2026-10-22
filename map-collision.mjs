import {stepHorizontalVelocity} from './movement-feel.mjs';
import {ASCENT} from './ascent-data.mjs';
// One authored layout drives rendering, collision, hitscan and spawn selection.
export const DUEL_MAP={
 id:'duel',label:'FOUNDRY / Foundry Courtyard',bounds:[-11,11,-13,13],
 boxes:[
  {id:'core',kind:'core',x:0,z:0,w:3.2,d:4.2,h:3},
  {id:'west-wing',kind:'wing',x:-6,z:0,w:2,d:5,h:2.5},
  {id:'east-wing',kind:'wing',x:6,z:0,w:2,d:5,h:2.5},
  {id:'south-baffle',kind:'baffle',x:-2,z:7.4,w:5,d:1,h:2.5},
  {id:'north-baffle',kind:'baffle',x:2,z:-7.4,w:5,d:1,h:2.5},
  {id:'south-low',kind:'low',x:5,z:6.5,w:2.2,d:1.6,h:1.05},
  {id:'north-low',kind:'low',x:-5,z:-6.5,w:2.2,d:1.6,h:1.05},
  {id:'north-shoulder',kind:'shoulder',x:-4,z:-4,w:2,d:1.6,h:2.1},
  {id:'south-shoulder',kind:'shoulder',x:4,z:4,w:2,d:1.6,h:2.1}
 ],
 // Rotation symmetry gives both slots identical cover and route access.
 spawns:[{x:0,z:11,yaw:0},{x:0,z:-11,yaw:Math.PI},{x:-8.8,z:10.8,yaw:0},{x:8.8,z:-10.8,yaw:Math.PI}]
};

export const MAPS={training:{id:'training',label:'Training Courtyard'},duel:DUEL_MAP,ascent:ASCENT};
const cells=new Map(),triangles=ASCENT.triangles.map(v=>{const ax=v[3]-v[0],ay=v[4]-v[1],az=v[5]-v[2],bx=v[6]-v[0],by=v[7]-v[1],bz=v[8]-v[2],nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;return {v,n:[nx,ny,nz],horizontal:Math.abs(ny)/Math.hypot(nx,ny,nz)>.65}});
for(let i=0;i<triangles.length;i++){const v=triangles[i].v;for(let x=Math.max(-11,Math.floor(Math.min(v[0],v[3],v[6])));x<=Math.min(11,Math.floor(Math.max(v[0],v[3],v[6])));x++)for(let z=Math.max(-9,Math.floor(Math.min(v[2],v[5],v[8])));z<=Math.min(9,Math.floor(Math.max(v[2],v[5],v[8])));z++){const k=x+','+z;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(i)}}
function nearby(x,z,r=0){const result=new Set();for(let a=Math.floor(x-r);a<=Math.floor(x+r);a++)for(let b=Math.floor(z-r);b<=Math.floor(z+r);b++)for(const i of cells.get(a+','+b)||[])result.add(i);return result}
function height(t,x,z){const v=t.v,d=(v[5]-v[8])*(v[0]-v[6])+(v[6]-v[3])*(v[2]-v[8]);if(Math.abs(d)<1e-9)return null;const a=((v[5]-v[8])*(x-v[6])+(v[6]-v[3])*(z-v[8]))/d,b=((v[8]-v[2])*(x-v[6])+(v[0]-v[6])*(z-v[8]))/d;if(a<-.00001||b<-.00001||a+b>1.00001)return null;return a*v[1]+b*v[4]+(1-a-b)*v[7]}
export function ascentFloor(x,z,top=6){let best=-Infinity;for(const i of nearby(x,z)){const t=triangles[i];if(!t.horizontal)continue;const y=height(t,x,z);if(y!==null&&y<=top+.001)best=Math.max(best,y)}return best}
function clip(poly,y,above){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ai=above?a[1]>=y:a[1]<=y,bi=above?b[1]>=y:b[1]<=y;if(ai)out.push(a);if(ai!==bi){const f=(y-a[1])/(b[1]-a[1]);out.push([a[0]+(b[0]-a[0])*f,y,a[2]+(b[2]-a[2])*f])}}return out}
function touches(poly,x,z,r){if(!poly.length)return false;let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i],dx=b[0]-a[0],dz=b[2]-a[2],f=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz||1)));if(Math.hypot(x-a[0]-dx*f,z-a[2]-dz*f)<r)return true;if((a[2]>z)!==(b[2]>z)&&x<(b[0]-a[0])*(z-a[2])/(b[2]-a[2])+a[0])inside=!inside}return inside}
export function ascentBlocked(x,z,y=0,h=1.8,r=.32){const [l,rr,b,t]=ASCENT.bounds;if(x<l+r||x>rr-r||z<b+r||z>t-r)return true;if(!Number.isFinite(ascentFloor(x,z,y+.3)))return true;if(Number.isFinite(ascentCeiling(x,z,y+.31,y+h)))return true;for(const i of nearby(x,z,r)){const tr=triangles[i];const v=tr.v,footMargin=tr.horizontal?.3:.05;if(Math.max(v[1],v[4],v[7])<=y+footMargin||Math.min(v[1],v[4],v[7])>=y+h-.001)continue;const poly=clip(clip([v.slice(0,3),v.slice(3,6),v.slice(6,9)],y+footMargin,true),y+h-.001,false);if(touches(poly,x,z,r))return true}return false}
export function ascentCeiling(x,z,bottom,top){let best=Infinity;for(const i of nearby(x,z,.25)){const t=triangles[i];if(!t.horizontal)continue;const y=height(t,x,z);if(y!==null&&y>=bottom-.001&&y<top)best=Math.min(best,y)}return best}
export function ascentWall(o,d){let best=100;for(const {v} of triangles){const e1=[v[3]-v[0],v[4]-v[1],v[5]-v[2]],e2=[v[6]-v[0],v[7]-v[1],v[8]-v[2]],p=[d.y*e2[2]-d.z*e2[1],d.z*e2[0]-d.x*e2[2],d.x*e2[1]-d.y*e2[0]],det=e1[0]*p[0]+e1[1]*p[1]+e1[2]*p[2];if(Math.abs(det)<1e-9)continue;const tx=o.x-v[0],ty=o.y-v[1],tz=o.z-v[2],u=(tx*p[0]+ty*p[1]+tz*p[2])/det;if(u<0||u>1)continue;const q=[ty*e1[2]-tz*e1[1],tz*e1[0]-tx*e1[2],tx*e1[1]-ty*e1[0]],w=(d.x*q[0]+d.y*q[1]+d.z*q[2])/det;if(w<0||u+w>1)continue;const hit=(e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2])/det;if(hit>=0&&hit<best)best=hit}const [l,r,b,t]=ASCENT.bounds;for(const [axis,min,max] of [['x',l,r],['z',b,t]])if(Math.abs(d[axis])>1e-9){const hit=((d[axis]>0?max:min)-o[axis])/d[axis];if(hit>=0)best=Math.min(best,hit)}return best}
// A jump takes priority over crouch. A crouched actor trapped under a ceiling
// stays grounded rather than standing into geometry or taking off crouched.
export function groundedStance(p,i,standingBlocked){
 const trapped=!!p.crouch&&standingBlocked();
 const jump=!!i.jump&&!p.jumpHeld&&!!p.grounded&&!trapped;
 p.crouch=!!p.grounded&&(trapped||!!i.crouch&&!jump);
 return jump;
}
export function ascentMove(p,i,dt,{height,radius,speed,gravity,jump}){p.y??=ascentFloor(p.x,p.z,2);p.vy??=0;p.vx??=0;p.vz??=0;p.grounded??=true;const takeoff=groundedStance(p,i,()=>ascentBlocked(p.x,p.z,p.y,1.8,radius));const h=height(p);if(takeoff){p.vy=jump;p.grounded=false}p.jumpHeld=!!i.jump;const old=p.y;p.vy-=gravity*dt;let next=old+p.vy*dt;const ceiling=ascentCeiling(p.x,p.z,old+h,next+h);if(p.vy>0&&Number.isFinite(ceiling)){next=ceiling-h;p.vy=0}const floor=ascentFloor(p.x,p.z,old+.001);if(next<=floor){p.y=floor;p.vy=0;p.grounded=true}else{p.y=next;p.grounded=false}
 // Sweep the whole body against slanted faces and overhang edges, not just the center ray.
 if(ascentBlocked(p.x,p.z,p.y,h,radius)&&!ascentBlocked(p.x,p.z,old,h,radius)){let lo=0,hi=1;for(let n=0;n<14;n++){const f=(lo+hi)/2;if(ascentBlocked(p.x,p.z,old+(p.y-old)*f,h,radius))hi=f;else lo=f}const downward=p.y<old;p.y=old+(p.y-old)*lo;p.vy=0;p.grounded=downward;}
 const sx=(i.right?1:0)-(i.left?1:0),sz=(i.back?1:0)-(i.forward?1:0),n=Math.hypot(sx,sz)||1,s=speed*(i.walk?.52:1)*(p.crouch?.6:1);stepHorizontalVelocity(p,(sx*Math.cos(p.yaw)+sz*Math.sin(p.yaw))/n*s,(-sx*Math.sin(p.yaw)+sz*Math.cos(p.yaw))/n*s,dt);
 for(const axis of ['x','z']){const v=axis==='x'?'vx':'vz',x=axis==='x'?p.x+p[v]*dt:p.x,z=axis==='z'?p.z+p[v]*dt:p.z;let ground=ascentFloor(x,z,p.y+.3);let y=p.grounded&&ground>=p.y-.3?Math.max(p.y,ground):p.y;if(!ascentBlocked(x,z,y,h,radius)){p[axis]+=p[v]*dt;if(p.grounded&&ground>=p.y-.3)p.y=ground}else p[v]=0}
}
export const ASCENT_SPAWNS=[{x:-8,z:-6,yaw:-Math.PI*.75},{x:8,z:6,yaw:Math.PI*.25},{x:8,z:-6,yaw:Math.PI*.75},{x:4,z:6,yaw:-Math.PI*.25}].map(s=>({...s,y:ascentFloor(s.x,s.z,2)}));
