import {WEAPONS} from '/weapons.mjs';
import * as T from '/vendor/three.module.js';
import {mapBoxes,rayBox} from '/shared.mjs';

const MARK_LIMIT=48,TRANSIENT_LIMIT=24;
const vector=p=>Array.isArray(p)?new T.Vector3(...p):p?.isVector3?p.clone():new T.Vector3(p?.x??0,p?.y??0,p?.z??0);
const time=()=>globalThis.performance?.now?.()??Date.now();
const bounds=map=>[
 ...mapBoxes(map).map(b=>({min:{x:b.x-b.w/2,y:0,z:b.z-b.d/2},max:{x:b.x+b.w/2,y:b.h,z:b.z+b.d/2}})),
 {min:{x:-11.3,y:0,z:-13.3},max:{x:-11,y:5,z:13.3}},
 {min:{x:11,y:0,z:-13.3},max:{x:11.3,y:5,z:13.3}},
 {min:{x:-11,y:0,z:-13.3},max:{x:11,y:5,z:-13}},
 {min:{x:-11,y:0,z:13},max:{x:11,y:5,z:13.3}}
];

// Validate against the authoritative eye-origin/end segment. The viewmodel
// muzzle can cross a nearby plane and must never invent a wall impact.
export function trainingImpact({origin,end,damage=0,map='training'}){
 if(!['training','duel'].includes(map)||damage>0||!origin||!end)return null;
 const o=vector(origin),e=vector(end),d=e.clone().sub(o),length=d.length();
 if(!Number.isFinite(length)||length<.001||length>=99.9)return null;
 d.divideScalar(length);let closest=Infinity,surface=null;
 for(const box of bounds(map)){
  const distance=rayBox(o,d,box.min,box.max);
  if(distance<=.00001||distance>=closest)continue;
  const p=o.clone().addScaledVector(d,distance);let error=Infinity,normal=null;
  for(const axis of ['x','y','z'])for(const sign of [-1,1]){
   const face=sign<0?box.min[axis]:box.max[axis],gap=Math.abs(p[axis]-face);
   if(gap<error){error=gap;normal=new T.Vector3();normal[axis]=sign;}
  }
  closest=distance;surface={point:p,normal};
 }
 if(d.y<-.000001&&o.y>=0){
  const distance=-o.y/d.y,p=o.clone().addScaledVector(d,distance);
  if(distance<closest&&Math.abs(p.x)<=11.3&&Math.abs(p.z)<=13.3){closest=distance;surface={point:p,normal:new T.Vector3(0,1,0)};}
 }
 // A player endpoint in front of a wall is not a wall, even if a caller forgot
 // to supply damage. Require the actual server endpoint to coincide with it.
 if(!surface||Math.abs(closest-length)>.025)return null;
 return surface;
}

// A confirmed hit may arrive after movement/recoil changed the viewmodel.
// Use the currently rendered muzzle for presentation; the server endpoint and
// authoritative eye origin still own damage and impact placement.
export function resolveShotVisual({muzzle,end,eye,forward,enabled=true}){
 const start=vector(muzzle),target=vector(end),view=vector(eye);
 const finite=[start,target,view].every(p=>p.toArray().every(Number.isFinite));
 let reason=!enabled?'inactive weapon or view':!finite?'invalid segment':null;
 if(!reason){
  const ray=target.clone().sub(view),trail=target.clone().sub(start);
  if(trail.lengthSq()<.000001)reason='collapsed segment';
  else if(ray.dot(trail)<=0)reason='muzzle past endpoint';
  else if(forward&&ray.dot(vector(forward))<=0)reason='endpoint behind current view';
 }
 return {start,end:target,drawTracer:!reason,reason};
}

export function createShotEffects(scene,{surfaceRoot=null}={}){
 const surfaceRay=new T.Raycaster();
 function visibleSurface(hit){
  if(!hit)return null;const root=typeof surfaceRoot==='function'?surfaceRoot():surfaceRoot;if(!root)return hit;
  // Only move a confirmed hit onto the shallow decorative skin of its architecture.
  // Never raycast guns/players or let a render surface create a combat impact.
  const authoritativePoint=hit.point.clone();root.updateMatrixWorld(true);
  surfaceRay.set(hit.point.clone().addScaledVector(hit.normal,.1),hit.normal.clone().negate());surfaceRay.near=0;surfaceRay.far=.18;
  const face=surfaceRay.intersectObject(root,true).find(h=>Math.abs(h.point.clone().sub(authoritativePoint).dot(hit.normal))<=.08);
  return {...hit,point:face?face.point.clone():hit.point,authoritativePoint};
 }
 const marks=[],tracers=[],sparks=[],dust=[],shells=[],seenMelee=new Set();
 let shellGeometry=null,shellMaterial=null;
 const diagnostics={marks:0,tracers:0,sparks:0,dust:0,shells:0,ejected:0,created:0,disposed:0,lastImpact:null,lastMeleeImpact:null,meleeImpacts:0,lastEjection:null};
 function remove(entry,list){scene.remove(entry.object);if(list!==shells){entry.object.geometry.dispose();entry.object.material.dispose();}list.splice(list.indexOf(entry),1);diagnostics.disposed++;}
 function append(list,entry,limit){if(list.length>=limit)remove(list[0],list);list.push(entry);scene.add(entry.object);diagnostics.created++;}
 function counts(){diagnostics.marks=marks.length;diagnostics.tracers=tracers.length;diagnostics.sparks=sparks.length;diagnostics.dust=dust.length;diagnostics.shells=shells.length;}
 return {
  diagnostics,
  eject({origin,orientation=new T.Quaternion(),weapon='vandal',seed=0,floorY=0,now=time()}){
   if(!(WEAPONS[weapon]?.capacity>0)||weapon==='sheriff'||!origin)return;
   const start=vector(origin);if(!start.toArray().every(Number.isFinite))return;
   shellGeometry??=new T.CylinderGeometry(1,1,1,6);shellMaterial??=new T.MeshStandardMaterial({color:0xb59349,metalness:.75,roughness:.38});
   const shell=new T.Mesh(shellGeometry,shellMaterial),ghost=weapon==='ghost';
   shell.name=weapon+' ejected casing';shell.scale.set(ghost?.003:.0035,ghost?.016:.026,ghost?.003:.0035);
   shell.position.copy(start);shell.quaternion.copy(orientation);shell.rotateZ(Math.PI/2);
   const variation=Math.sin(seed*2.39996),velocity=new T.Vector3(2.0+variation*.25,1.2+variation*.15,.65).applyQuaternion(orientation);
   append(shells,{object:shell,born:now,life:1400,start,velocity,floorY,rotation:shell.quaternion.clone(),spin:7+variation*3},32);
   diagnostics.ejected++;diagnostics.lastEjection={weapon,origin:start.toArray(),velocity:velocity.toArray()};counts();
  },
  shot({start,end,weapon='vandal',local=true,damage=0,map='training',origin,impactEnd=end,drawTracer=true,now=time()}){
   if(weapon==='knife'||!start||!end)return;
   const a=vector(start),b=vector(end);
   const ghost=weapon==='ghost'||!!WEAPONS[weapon]?.silenced;
   // A muzzle may reach a close wall while the authoritative eye ray still
   // confirms contact. A zero-length visual trail must not discard that hit.
   if(drawTracer&&a.toArray().every(Number.isFinite)&&b.toArray().every(Number.isFinite)&&a.distanceToSquared(b)>=.000001&&(!ghost||local)){
   const line=new T.Line(new T.BufferGeometry().setFromPoints([a,b]),new T.LineBasicMaterial({color:ghost?0xc7c4ab:0xf5d69a,transparent:true,opacity:ghost?.24:.48,depthWrite:false}));
   line.frustumCulled=false;append(tracers,{object:line,born:now,life:35,alpha:ghost?.24:.48},TRANSIENT_LIMIT);
   }
   const hit=visibleSurface(trainingImpact({origin,end:impactEnd,damage,map}));diagnostics.lastImpact=hit?{point:hit.point.toArray(),normal:hit.normal.toArray()}:null;
   if(hit){
    const seed=hit.point.x*17.13+hit.point.y*31.7+hit.point.z*13.91;
    const shape=new T.Shape(),radius=ghost?.014:.019;
    for(let i=0;i<12;i++){const angle=i*Math.PI/6,r=radius*(.8+.2*Math.sin(seed+i*2.399963));const x=Math.cos(angle)*r,y=Math.sin(angle)*r;if(i)shape.lineTo(x,y);else shape.moveTo(x,y);}shape.closePath();
    const material=new T.ShaderMaterial({transparent:true,opacity:.8,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,
     uniforms:{alpha:{value:.8},radius:{value:radius},seed:{value:seed}},
     vertexShader:'varying vec2 p; uniform float radius; void main(){p=position.xy/radius; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
     fragmentShader:`varying vec2 p; uniform float alpha; uniform float seed;
      void main(){float angle=atan(p.y,p.x);float r=length(p);float edge=.88+.07*sin(angle*7.0+seed)+.035*sin(angle*13.0-seed);
       float grain=fract(sin(dot(p,vec2(127.1,311.7))+seed)*43758.5453);
       float cavity=1.0-smoothstep(.27,.59,r);float lip=smoothstep(.43,.58,r)*(1.0-smoothstep(.68,edge,r));
       vec3 color=mix(vec3(.095,.087,.077),vec3(.23,.21,.18),r);color=mix(color,vec3(.022,.019,.016),cavity*.92);
       color+=vec3(.16,.15,.125)*lip*(.55+.45*grain);color*=.86+.24*grain;
       gl_FragColor=vec4(color,alpha*(1.0-smoothstep(edge-.09,edge,r)));
       #include <tonemapping_fragment>
       #include <colorspace_fragment>
      }`});
    const mark=new T.Mesh(new T.ShapeGeometry(shape),material);mark.name='Chipped bullet crater';
    mark.position.copy(hit.point).addScaledVector(hit.normal,.002);mark.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),hit.normal);
    append(marks,{object:mark,born:now,life:6000,alpha:.8},MARK_LIMIT);
    const tangent=new T.Vector3(Math.abs(hit.normal.y)<.9?0:1,Math.abs(hit.normal.y)<.9?1:0,0).cross(hit.normal).normalize(),bitangent=new T.Vector3().crossVectors(hit.normal,tangent);
    const positions=[],velocities=[];
    for(let i=0;i<4;i++){
     const angle=seed+i*2.399963,velocity=hit.normal.clone().multiplyScalar(.7+i*.15).addScaledVector(tangent,Math.cos(angle)*.65).addScaledVector(bitangent,Math.sin(angle)*.65);
     const p=hit.point.clone().addScaledVector(hit.normal,.005),q=p.clone().addScaledVector(velocity,.018);
     positions.push(...p.toArray(),...q.toArray());velocities.push(velocity);
    }
    const object=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)),new T.LineBasicMaterial({color:0xffcb72,transparent:true,opacity:ghost?.5:.85,depthWrite:false}));
    object.frustumCulled=false;append(sparks,{object,born:now,life:80,alpha:ghost?.5:.85,initial:positions,velocities},TRANSIENT_LIMIT);
    const dustPositions=[],dustVelocities=[];
    for(let i=0;i<6;i++){
     const angle=seed+i*2.399963,v=hit.normal.clone().multiplyScalar(.2+i*.025).addScaledVector(tangent,Math.cos(angle)*.25).addScaledVector(bitangent,Math.sin(angle)*.25);
     dustPositions.push(...hit.point.clone().addScaledVector(hit.normal,.012).toArray());dustVelocities.push(v);
    }
    const plume=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(dustPositions,3)),new T.PointsMaterial({color:0xa79e90,size:ghost?.016:.023,transparent:true,opacity:ghost?.22:.32,depthWrite:false,sizeAttenuation:true}));
    plume.frustumCulled=false;append(dust,{object:plume,born:now,life:180,alpha:ghost?.22:.32,initial:dustPositions,velocities:dustVelocities},TRANSIENT_LIMIT);
   }
   counts();
  },
  meleeImpact({origin,end,damage=0,victim=null,part=null,weapon='knife',attack='primary',shotId,id,map='training',now=time()}){
   if(weapon!=='knife'||damage>0||victim||part)return false;
   const key=shotId==null?null:`${id}:${shotId}`;if(key&&seenMelee.has(key))return false;
   const hit=visibleSurface(trainingImpact({origin,end,damage,map}));if(!hit)return false;
   if(key){seenMelee.add(key);if(seenMelee.size>512)seenMelee.delete(seenMelee.values().next().value);}
   const heavy=attack==='secondary',length=heavy?.21:.25,positions=[],colors=[];
   const seed=Number(shotId)||hit.point.x*19+hit.point.y*31+hit.point.z*13;
   const variation=Math.sin(seed*2.399963);
   // Recorded wall cuts are mostly horizontal, tapered wedges. Keep a stable
   // per-contact variation so both clients show the same scar.
   const angle=(heavy?-.10:.045)+variation*.035,c=Math.cos(angle),s=Math.sin(angle);
   const add=(x,y,col)=>{positions.push(x*c-y*s,x*s+y*c,0);colors.push(...new T.Color(col).toArray());};
   const width=heavy?.010:.006,half=length/2;
   const triangle=(a,b,d,color)=>{
    const facing=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);
    for(const p of facing<0?[a,d,b]:[a,b,d])add(p[0],p[1],color);
   };
   triangle([-half,0],[-half*.15,width],[half,-width*.3],0x171713);
   triangle([-half,0],[half,-width*.3],[half*.18,-width],0x211e18);
   triangle([-half,0],[-half*.15,width],[half*.6,width*.15],0x343129);
   triangle([-half,0],[-half*.15,width*1.3],[-half*.15,width],0x999185);
   triangle([-half*.15,width],[half,-width*.3],[half*.72,width*.16],0xa39a88);
   triangle([-half,0],[half*.18,-width],[half*.5,-width*1.15],0x6c675c);
   const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)).setAttribute('color',new T.Float32BufferAttribute(colors,3));
   const mark=new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.95,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
   mark.name='knife surface scar';mark.position.copy(hit.point).addScaledVector(hit.normal,.003);mark.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),hit.normal);
   append(marks,{object:mark,born:now,life:12000,alpha:.95},MARK_LIMIT);
   const tangent=new T.Vector3(Math.abs(hit.normal.y)<.9?0:1,Math.abs(hit.normal.y)<.9?1:0,0).cross(hit.normal).normalize(),bits=new T.Vector3().crossVectors(hit.normal,tangent),v=[],velocities=[];
   for(let i=0;i<3;i++){const velocity=hit.normal.clone().multiplyScalar(.6+i*.12).addScaledVector(tangent,(i-1)*.35).addScaledVector(bits,.35);const p=hit.point.clone().addScaledVector(hit.normal,.006);v.push(...p.toArray(),...p.clone().addScaledVector(velocity,.035).toArray());velocities.push(velocity);}
   const sparksObject=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(v,3)),new T.LineBasicMaterial({color:0xffd08a,transparent:true,opacity:.7,depthWrite:false}));
   append(sparks,{object:sparksObject,born:now,life:100,alpha:.7,initial:v,velocities},TRANSIENT_LIMIT);
   const chips=[],chipVelocities=[];
   for(let i=0;i<5;i++){
    chips.push(...hit.point.clone().addScaledVector(hit.normal,.014).toArray());
    chipVelocities.push(hit.normal.clone().multiplyScalar(.2+i*.025).addScaledVector(tangent,Math.sin(seed+i)*.18).addScaledVector(bits,.10+i*.025));
   }
   const debris=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(chips,3)),new T.PointsMaterial({color:0x89867e,size:heavy?.025:.018,transparent:true,opacity:.65,depthWrite:false,sizeAttenuation:true}));
   append(dust,{object:debris,born:now,life:240,alpha:.65,initial:chips,velocities:chipVelocities,gravity:4.9},TRANSIENT_LIMIT);
   diagnostics.meleeImpacts++;diagnostics.lastMeleeImpact={point:hit.point.toArray(),authoritativePoint:(hit.authoritativePoint||hit.point).toArray(),normal:hit.normal.toArray(),attack,shotId,scar:{length,width,angle}};counts();return true;
  },
  update(now=time()){
   for(const shell of [...shells]){
    const age=Math.max(0,now-shell.born);if(age>=shell.life){remove(shell,shells);continue;}
    const seconds=age/1000;shell.object.position.copy(shell.start).addScaledVector(shell.velocity,seconds);shell.object.position.y-=4.9*seconds*seconds;
    // Cosmetic casings share no combat collision or damage state.
    if(shell.object.position.y<shell.floorY+.018){remove(shell,shells);continue;}
    shell.object.quaternion.copy(shell.rotation);shell.object.rotateX(seconds*shell.spin);shell.object.rotateZ(seconds*shell.spin*.7);
   }
   for(const list of [tracers,sparks,dust,marks])for(const entry of [...list]){
    const age=Math.max(0,now-entry.born);if(age>=entry.life){remove(entry,list);continue;}
    entry.object.material.opacity=entry.alpha*(list===marks?Math.min(1,(entry.life-age)/1200):1-age/entry.life);
    if(entry.object.material.uniforms?.alpha)entry.object.material.uniforms.alpha.value=entry.object.material.opacity;
    if(list===sparks){const attribute=entry.object.geometry.attributes.position;for(let i=0;i<entry.velocities.length;i++)for(let j=0;j<2;j++){
     const index=i*2+j,velocity=entry.velocities[i],seconds=age/1000;
     attribute.setXYZ(index,entry.initial[index*3]+velocity.x*seconds,entry.initial[index*3+1]+velocity.y*seconds-2*seconds*seconds,entry.initial[index*3+2]+velocity.z*seconds);
    }attribute.needsUpdate=true;}
    if(list===dust){const attribute=entry.object.geometry.attributes.position,seconds=age/1000;for(let i=0;i<entry.velocities.length;i++){const v=entry.velocities[i];attribute.setXYZ(i,entry.initial[i*3]+v.x*seconds,entry.initial[i*3+1]+v.y*seconds-(entry.gravity??.4)*seconds*seconds,entry.initial[i*3+2]+v.z*seconds);}attribute.needsUpdate=true;}
   }counts();
  },
  clear(){for(const list of [tracers,sparks,dust,marks,shells])for(const entry of [...list])remove(entry,list);shellGeometry?.dispose();shellMaterial?.dispose();shellGeometry=null;shellMaterial=null;seenMelee.clear();diagnostics.lastImpact=null;diagnostics.lastMeleeImpact=null;diagnostics.lastEjection=null;counts();}
 };
}
