import * as T from '/vendor/three.module.js';
import {WEAPONS} from '/weapons.mjs';

// The authored wrist is not the palm: use the index/middle finger roots.
// Correct only the held magazine, retaining native arm pose and magazine angle.
const windows={vandal:[.10,.15,.30,.40],ghost:[.16,.20,.30,.40]};
export function contactWeight(weapon,phase){
  const w=windows[weapon];if(!w||phase<=w[0]||phase>=w[3])return 0;
  const smooth=u=>u*u*(3-2*u);
  return smooth(T.MathUtils.clamp((phase-w[0])/(w[1]-w[0]),0,1))*smooth(T.MathUtils.clamp((w[3]-phase)/(w[3]-w[2]),0,1));
}
function controller(model,weapon){
  if(model.userData.reloadContact)return model.userData.reloadContact;
  let mesh;model.traverse(o=>{if(o.isMesh&&o.name.startsWith(weapon==='ghost'?'GN_Luger_Magazine_S0_Staticmesh':'GN_AK_Magazine_S0_Staticmesh'))mesh=o;});
  if(!mesh)return null;
  mesh.geometry.computeBoundingBox();
  const c={mesh,bind:mesh.position.clone(),center:mesh.geometry.boundingBox.getCenter(new T.Vector3()),palm:new T.Vector3(),point:new T.Vector3(),delta:new T.Vector3()};
  model.userData.reloadContact=c;
  model.userData.resetReloadContact=()=>{mesh.position.copy(c.bind);Object.assign(model.userData.contactDiagnostics,{active:false,weight:0,error:0});};
  model.userData.contactDiagnostics={active:false,weight:0,error:0};return c;
}
function nearestSurface(mesh,palm,point,tri,a,b,c){
  const indices=mesh.geometry.index,count=indices?.count||mesh.geometry.attributes.position.count;
  mesh.skeleton?.update();let best=Infinity;
  for(let i=0;i<count;i+=3){
    for(const [j,v] of [[0,a],[1,b],[2,c]])mesh.getVertexPosition(indices?indices.getX(i+j):i+j,v).applyMatrix4(mesh.matrixWorld);
    tri.set(a,b,c);tri.closestPointToPoint(palm,point);const distance=point.distanceTo(palm);
    if(distance<best){best=distance;mesh.userData.tpClosest??=new T.Vector3();mesh.userData.tpClosest.copy(point);}
  }
  if(mesh.userData.tpClosest)point.copy(mesh.userData.tpClosest);return best;
}
export function applyReloadContact(state,weapon,remaining){
  for(const [kind,model] of Object.entries(state.weaponModels)){
    if(kind==='knife')continue;const c=controller(model,kind);if(!c)continue;
    model.userData.resetReloadContact();
    const phase=model.userData.animationDiagnostics?.phase??1-remaining/(WEAPONS[kind].reload/1000);
    const weight=kind===weapon&&model.userData.animationDiagnostics?.active==='reload'?contactWeight(kind,phase):0;
    if(!weight||!state.bones.L_Index1||!state.bones.L_Middle1)continue;
    state.model.updateWorldMatrix(true,true);c.mesh.updateWorldMatrix(true,false);
    c.palm.copy(state.bones.L_Index1.getWorldPosition(c.palm)).lerp(state.bones.L_Middle1.getWorldPosition(c.point),.5);
    c.triangle??=new T.Triangle();c.a??=new T.Vector3();c.b??=new T.Vector3();c.c??=new T.Vector3();
    const before=nearestSurface(c.mesh,c.palm,c.point,c.triangle,c.a,c.b,c.c),padding=.006;
    // Retain discarded/seated source poses; bound contact adaptation to 45 mm.
    if(before>.08||before<=padding){Object.assign(model.userData.contactDiagnostics,{active:false,phase,before,reason:before>.08?'outside authored contact neighborhood':'source contact'});continue;}
    const correction=Math.min(.045,before-padding)*weight,parent=c.mesh.parent;
    c.delta.copy(c.palm).sub(c.point).multiplyScalar(correction/before);
    c.mesh.position.add(parent.worldToLocal(c.point.clone().add(c.delta)).sub(parent.worldToLocal(c.point.clone())));c.mesh.updateWorldMatrix(true,false);
    const error=nearestSurface(c.mesh,c.palm,c.point,c.triangle,c.a,c.b,c.c);
    Object.assign(model.userData.contactDiagnostics,{active:true,phase,weight,before,error,correction,method:'source-phase magazine surface contact'});
  }
}

const supportCache=new WeakMap();
export function applyThirdPersonSupportGrip(state,weapon,{busy=false}={}){
  const model=state.weaponModels[weapon],hand=state.bones.L_Hand,index=state.bones.L_Index1,middle=state.bones.L_Middle1;
  if(!model||!hand||!index||!middle||busy||!['vandal','ghost'].includes(weapon))return {active:false,reason:'native action'};
  state.model.updateWorldMatrix(true,true);
  const palm=index.getWorldPosition(new T.Vector3()).lerp(middle.getWorldPosition(new T.Vector3()),.5);
  let cache=supportCache.get(model);const palmLocal=model.worldToLocal(palm.clone());
  if(!cache||cache.center.distanceTo(palmLocal)>.025){
    cache={center:palmLocal.clone(),faces:[],tri:new T.Triangle(),a:new T.Vector3(),b:new T.Vector3(),c:new T.Vector3(),point:new T.Vector3(),closest:new T.Vector3()};
    model.traverseVisible(mesh=>{if(!mesh.isMesh||!(/GN_(AK|Luger)_S0_Skelmesh|GN_(AK|Luger)_Magazine_S0_Staticmesh/.test(mesh.name)))return;mesh.skeleton?.update();const ix=mesh.geometry.index,n=ix?.count||mesh.geometry.attributes.position.count;
      for(let i=0;i<n;i+=3){const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k);ids.forEach((id,k)=>mesh.getVertexPosition(id,[cache.a,cache.b,cache.c][k]).applyMatrix4(mesh.matrixWorld));cache.tri.set(cache.a,cache.b,cache.c);cache.tri.closestPointToPoint(palm,cache.point);if(cache.point.distanceTo(palm)<.08)cache.faces.push({mesh,ids});}
    });supportCache.set(model,cache);
  }
  let before=Infinity;
  if(cache.lastPalm&&palmLocal.distanceToSquared(cache.lastPalm)<1e-12&&!model.userData.animationDiagnostics?.active){
    before=cache.lastBefore;cache.closest.copy(model.localToWorld(cache.lastClosest.clone()));
  }else{
    const updated=new Set();
    for(const {mesh,ids} of cache.faces){if(!updated.has(mesh)){mesh.skeleton?.update();updated.add(mesh);}ids.forEach((id,k)=>mesh.getVertexPosition(id,[cache.a,cache.b,cache.c][k]).applyMatrix4(mesh.matrixWorld));cache.tri.set(cache.a,cache.b,cache.c);cache.tri.closestPointToPoint(palm,cache.point);const d=palm.distanceTo(cache.point);if(d<before){before=d;cache.closest.copy(cache.point);}}
    cache.lastPalm=palmLocal.clone();cache.lastBefore=before;cache.lastClosest=model.worldToLocal(cache.closest.clone());
  }
  if(before<=.008||before>.04)return {active:false,before,reason:'source contact / outside bounded grip'};
  const wrist=hand.getWorldPosition(new T.Vector3()),target=cache.closest.clone().add(palm.clone().sub(cache.closest).normalize().multiplyScalar(.006));
  const delta=new T.Quaternion().setFromUnitVectors(palm.clone().sub(wrist).normalize(),target.sub(wrist).normalize());
  const angle=2*Math.acos(Math.min(1,Math.abs(delta.w))),strength=Math.min(1,.20943951024/Math.max(angle,1e-9))*T.MathUtils.clamp((before-.006)/.006,0,1);
  delta.identity().slerp(new T.Quaternion().setFromUnitVectors(palm.clone().sub(wrist).normalize(),target.normalize()),strength);
  const parent=hand.parent.getWorldQuaternion(new T.Quaternion());hand.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));hand.updateWorldMatrix(false,true);
  const after=index.getWorldPosition(new T.Vector3()).lerp(middle.getWorldPosition(new T.Vector3()),.5).distanceTo(cache.closest);
  return {active:true,before,after,angle:angle*strength,faces:cache.faces.length,method:'authored wrist with bounded surface rotation; arm joints/finger keys retained'};
}

// FP correction targets the nearest actual rigid-mesh vertex, not its center.
// Keep finger-root padding, and never pull a discarded or seated magazine.
function fpController(model){
 if(model.userData.fpReloadContact)return model.userData.fpReloadContact;
 const meshes=[];model.traverse(o=>{if(o.isMesh&&(/GN_(AK|Luger)_Magazine_S0_Staticmesh/.test(o.name)||o.name==='Animated reload spare magazine'))meshes.push({mesh:o,bind:o.position.clone()});});
 return model.userData.fpReloadContact={meshes,palm:new T.Vector3(),vertex:new T.Vector3(),closest:new T.Vector3(),diagnostics:{active:false}};
}
export function resetFirstPersonReloadContact(gun){
 for(const model of Object.values(gun.userData.assets||{})){
  const c=model.userData.fpReloadContact;if(!c)continue;
  for(const item of c.meshes)item.mesh.position.copy(item.bind);
  c.diagnostics={active:false};
 }
}
export function applyFirstPersonReloadContact(gun,reloading){
 const arms=gun.userData.firstPersonArms,weapon=gun.userData.weapon,model=gun.userData.activeAsset;
 if(!model||!arms||!['vandal','ghost'].includes(weapon))return;
 const c=fpController(model),phase=arms.diagnostics.phase;
 if(!reloading||!gun.visible||arms.diagnostics.active!=='reload')return;
 const w=weapon==='vandal'?[.055,.075,.44,.47]:[.18,.20,.26,.30],smooth=u=>{u=T.MathUtils.clamp(u,0,1);return u*u*(3-2*u);};
 const weight=smooth((phase-w[0])/(w[1]-w[0]))*smooth((w[3]-phase)/(w[3]-w[2]));if(!weight)return;
 const index=arms.model.getObjectByName('L_Index1'),middle=arms.model.getObjectByName('L_Middle1');if(!index||!middle)return;
 gun.updateWorldMatrix(true,true);arms.mount.updateWorldMatrix(true,true);
 c.palm.copy(index.getWorldPosition(c.palm)).lerp(middle.getWorldPosition(c.vertex),.5);
 let distance=Infinity,held=null;
 for(const item of c.meshes){const a=item.mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){c.vertex.fromBufferAttribute(a,i);item.mesh.localToWorld(c.vertex);const d=c.vertex.distanceTo(c.palm);if(d<distance){distance=d;held=item.mesh;c.closest.copy(c.vertex);}}}
 if(!held||distance>.06||distance<=.012){c.diagnostics={active:false,phase,before:distance};return;}
 const correction=Math.min(.020,distance-.012)*weight;
 const desired=c.closest.clone().lerp(c.palm,correction/distance),parent=held.parent;
 held.position.add(parent.worldToLocal(desired).sub(parent.worldToLocal(c.closest.clone())));held.updateWorldMatrix(true,false);
 c.diagnostics={active:true,phase,mesh:held.name,before:distance,after:distance-correction,correction,weight};
}
