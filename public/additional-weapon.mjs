import * as T from '/vendor/three.module.js';
import {REFERENCE_OPTIC_FITS} from '/ads.mjs';
import {WEAPONS} from '/weapons.mjs';
import {createNativeBoneClip} from '/psa-animation.mjs';
import {createSourceReloadTimeline} from '/weapon-feel.mjs';
import {loadNativeWeaponIndex} from '/additional-first-person.mjs';


// Supplemental geometry fitted to the user's video. The original resource has
// a Reflex landmark but no standalone optical mesh or deployment animation.
// Keep the original GN Root, all skeletal keys and every hip mesh untouched.
function attachReferenceOptic(root,weapon){
 const fit=REFERENCE_OPTIC_FITS[weapon];
 const socket=root.userData.model?.getObjectByName('Root');
 if(!fit||!socket)return null;
 const optic=new T.Group();optic.name=weapon+' reference ADS optic supplement';
 optic.position.fromArray(fit.position);optic.quaternion.fromArray(fit.quaternion);optic.scale.fromArray(fit.scale);
 const dark=new T.MeshStandardMaterial({color:0x181a1c,roughness:.43,metalness:.55}),gold=new T.MeshBasicMaterial({color:0xffc34b});
 const shape=new T.Shape();shape.moveTo(-.024,-.006);
 for(const [x,y] of [[-.024,.006],[0,.019],[.024,.006],[.024,-.006]])shape.lineTo(x,y);shape.closePath();
 const housing=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.006,bevelEnabled:true,bevelSize:.0008,bevelThickness:.0008,bevelSegments:1,steps:1}),dark);
 housing.name=weapon+' reference housing';housing.position.z=.011;optic.add(housing);
 const outline=[[-.0058,.0102,.025],[0,.0164,.025],[.0058,.0102,.025],[-.0058,.0102,.025]].map(p=>new T.Vector3(...p)),path=new T.CurvePath();
 for(let i=0;i<3;i++)path.add(new T.LineCurve3(outline[i],outline[i+1]));
 const triangle=new T.Mesh(new T.TubeGeometry(path,12,.0004,4,false),gold);triangle.name=weapon+' reference triangle';optic.add(triangle);
 if(['phantom','guardian'].includes(weapon)){
  // Video-derived rear aperture and two orange dots. This complete attachment
  // is supplemental; it is not presented as an original imported sight mesh.
  const aperture=new T.Mesh(new T.TorusGeometry(weapon==='guardian'?.010:.012,weapon==='guardian'?.0023:.003,6,24),dark);aperture.name=weapon+' reference rear aperture';aperture.position.set(0,weapon==='guardian'?-.0033:-.005,.030);optic.add(aperture);
  const dotGeometry=new T.SphereGeometry(.0022,8,6);
  for(const side of weapon==='phantom'?[-1,1]:[]){const dot=new T.Mesh(dotGeometry,gold);dot.name='Phantom reference sight dot';dot.position.set(side*.015,-.005,.033);optic.add(dot);}
 }
 for(const side of [-1,1]){const wing=new T.Mesh(new T.BoxGeometry(.022,.007,.007),dark);wing.position.set(side*.021,.0155,0);wing.rotation.z=side*.37;optic.add(wing);}
 optic.traverse(o=>{o.userData.adsSupplement=true;o.castShadow=false;o.receiveShadow=false;});
 root.add(optic);root.updateWorldMatrix(true,true);socket.attach(optic);optic.visible=false;
 optic.userData.materials=[dark,gold];
 root.userData.referenceOptic={source:`fteRz6Y59AA ~${fit.seconds}s; video-derived supplemental geometry`,nativeAnimation:false,socket:'Root',fit};
 return optic;
}

// Use the same continuous ADS amount as the complete native hand/gun rig.
// This is an opacity transition for the missing attachment, not a new PSA clip.
function updateReferenceOptic(optic,amount,visible){
 const alpha=Math.max(0,Math.min(1,amount));optic.visible=!!visible&&alpha>0;
 for(const m of optic.userData.materials){const transparent=alpha<1;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.opacity=alpha;m.depthWrite=alpha>=1;}
}


// Video-derived supplemental geometry. The supplied BLENDs contain a Reflex
// socket, but no corresponding attachment mesh or authored deployment clip.
// Only Stinger opts in; original GN actions and every hip vertex stay intact.
function attachStingerReferenceOptic(root){
 const socket=root.userData.model?.getObjectByName('Root')||root.getObjectByName('Root');if(!socket||!root.userData.nativeSight)return null;
 const optic=new T.Group();optic.name='Stinger reference ADS optic supplement';optic.position.copy(root.userData.nativeSight).add(new T.Vector3(0,.013,.095));optic.scale.setScalar(.60);
 const dark=new T.MeshStandardMaterial({color:0x151a1e,roughness:.5,metalness:.55}),gold=new T.MeshBasicMaterial({color:0xffc54b});
 const shape=new T.Shape();shape.moveTo(-.024,-.006);for(const [x,y] of [[-.024,.006],[0,.019],[.024,.006],[.024,-.006]])shape.lineTo(x,y);shape.closePath();
 const housing=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.006,bevelEnabled:true,bevelSize:.0008,bevelThickness:.0008,bevelSegments:1,steps:1}),dark);housing.name='Stinger reference housing';housing.position.z=.011;optic.add(housing);
 const outline=[new T.Vector3(-.0058,.0102,.025),new T.Vector3(0,.0164,.025),new T.Vector3(.0058,.0102,.025),new T.Vector3(-.0058,.0102,.025)];
 const path=new T.CurvePath();for(let i=0;i<3;i++)path.add(new T.LineCurve3(outline[i],outline[i+1]));
 const mark=new T.Mesh(new T.TubeGeometry(path,12,.0004,4,false),gold);mark.name='Stinger reference triangle';optic.add(mark);
 for(const side of [-1,1]){const wing=new T.Mesh(new T.BoxGeometry(.022,.007,.007),dark);wing.position.set(side*.021,.0155,0);wing.rotation.z=side*.37;optic.add(wing);}
 optic.traverse(o=>{o.userData.adsSupplement=true;o.castShadow=false;o.receiveShadow=false;});root.add(optic);root.updateWorldMatrix(true,true);socket.attach(optic);optic.visible=false;
 root.userData.referenceOptic={source:'fteRz6Y59AA ~82s; supplemental geometry, not original pack mesh',nativeAnimation:false,socket:'Root',referenceOffset:[0,.013,.095],referenceScale:.60,nativeSight:root.userData.nativeSight.toArray()};return optic;
}

export async function attachAdditionalWeaponMechanics(root,weapon){
 const index=await loadNativeWeaponIndex(weapon),sources={};
 for(const kind of ['fire','equip','reload',...(!['phantom','sheriff'].includes(weapon)?['firezoomed']:[])].filter(k=>index.gn[k])){
  // Original LMG/HMG Fire stores local deltas. The prior absolute export
  // collapsed magazines, handles and belt helpers to the origin on each shot.
  // These two derived files resolve the unchanged PSA keys on the original
  // BLEND bind in its post_quat basis. Every other gun retains its source path.
  const file=kind==='fire'&&weapon==='odin'?'odin-fire-source-belt.json':kind==='fire'&&weapon==='ares'?'ares-fire-source-delta.json':index.gn[kind];
  const r=await fetch('/assets/packs/animations/'+file);if(!r.ok)throw Error(`${weapon} GN ${kind}: HTTP ${r.status}`);sources[kind]=await r.json();
 }
 const model=root.userData.model||root,clips={},actions={},mixer=new T.AnimationMixer(model),rest=[];
 model.traverse(b=>{if(b.isBone)rest.push({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()});});
 // The pack has eight loose cartridge meshes, only three constrained (with
 // offsets from a different pose). Reuse its cartridge geometry/material on
 // the six authored Bullet sockets, using the source IdlePose as socket bind.
 // No inferred belt motion: GN Reload/Equip/Fire remain the motion owners.
 let beltIdle=null;
 if(weapon==='odin'){
  const response=await fetch('/assets/packs/animations/'+index.gn.idlepose);if(!response.ok)throw Error('Odin belt IdlePose missing');
  const idle=await response.json(),originals=[];model.traverse(o=>{if(o.isMesh&&/^Bullet_50bmg_StaticMeshmo(?:\d+)?$/.test(o.name))originals.push(o);});
  const reference=originals.find(o=>o.name==='Bullet_50bmg_StaticMeshmo007');
  if(!reference||originals.length!==8)throw Error('Odin original cartridge attachment contract changed');
  model.updateWorldMatrix(true,true);const referenceWorld=reference.matrixWorld.clone();
  beltIdle=idle.tracks.filter(t=>/^Bullet\d*$/.test(t.bone));
  const bind=new Map(rest.map(r=>[r.b.name,r]));
  for(const t of beltIdle){const b=bind.get(t.bone)?.b;if(b){b.position.fromArray(t.positions);b.quaternion.fromArray(t.quaternions).normalize();}}
  model.updateWorldMatrix(true,true);const first=model.getObjectByName('Bullet'),local=first.matrixWorld.clone().invert().multiply(referenceWorld);
  for(const o of originals)o.visible=false;
  for(const t of beltIdle){const b=model.getObjectByName(t.bone),cartridge=new T.Mesh(reference.geometry,reference.material);cartridge.name='Odin source cartridge '+t.bone;cartridge.castShadow=reference.castShadow;cartridge.receiveShadow=reference.receiveShadow;local.decompose(cartridge.position,cartridge.quaternion,cartridge.scale);b.add(cartridge);}
  for(const {b,p,q,s} of rest){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}
  root.userData.beltAttachments={source:idle.sourceEntry,sockets:beltIdle.map(t=>t.bone),originalLooseMeshes:8,activeCartridges:6};
 }
 function holdBeltIdle(){if(beltIdle)for(const t of beltIdle){const b=model.getObjectByName(t.bone);b.position.fromArray(t.positions);b.quaternion.fromArray(t.quaternions).normalize();}}
 const muzzleBone=model.getObjectByName('Muzzle'),emitter=root.userData.muzzle;
 const muzzleBind=muzzleBone?.position.clone(),emitterBind=emitter?.position.clone();
 const muzzleTrack=sources.fire.tracks.find(t=>t.bone==='Muzzle');
 let muzzleWeighted=false;model.traverse(o=>{if(!o.isSkinnedMesh||!muzzleBone)return;const k=o.skeleton.bones.indexOf(muzzleBone),a=o.geometry.attributes;if(k<0)return;for(let i=0;i<a.skinIndex.array.length;i++)if(a.skinIndex.array[i]===k&&a.skinWeight.array[i]>0)muzzleWeighted=true;});
 // LMG/HMG source Fire zeroes the unweighted Muzzle helper. Preserve those
 // original keys, but keep the visual emitter at its native bind socket.
 // This changes only the emission helper, never a hip mesh or hand pose.
 const zeroMuzzleHelper=['ares','odin'].includes(weapon)&&!muzzleWeighted&&muzzleTrack&&muzzleTrack.positions.every(v=>Math.abs(v)<.001)&&muzzleBind?.length()>.1;
 const emitterCorrection=new T.Vector3(),inverseMuzzle=new T.Quaternion();
 function updateSourceEmitter(){if(!zeroMuzzleHelper||!emitter)return;emitter.position.copy(emitterBind);{emitterCorrection.copy(muzzleBind).sub(muzzleBone.position).applyQuaternion(inverseMuzzle.copy(muzzleBone.quaternion).invert()).divide(muzzleBone.scale);emitter.position.add(emitterCorrection);}diagnostics.sourceMuzzleHelperCorrection=emitterCorrection.length();}
 for(const [kind,source] of Object.entries(sources)){
  const clip=createNativeBoneClip(model,source);
  // Odin cartridge channels are already resolved against the original GN
  // IdleAdd reference. Adding IdlePose here again bends the belt twice.
  if(!clip.tracks.length)throw Error(weapon+' GN has no matching native bones');
  if(kind==='fire'||kind==='firezoomed'){
   for(const track of clip.tracks){const [uuid,property]=track.name.split('.'),bone=model.getObjectByProperty('uuid',uuid);track.times=new Float32Array([0,...Array.from(track.times,t=>t+.020)]);track.values=new Float32Array([...bone[property].toArray(),...track.values]);}
   clip.duration+=.020;
  }
  clips[kind]=clip;const a=mixer.clipAction(clip).setLoop(T.LoopOnce,1);a.clampWhenFinished=true;actions[kind]=a;
 }
 const referenceOptic=weapon==='stinger'?attachStingerReferenceOptic(root):attachReferenceOptic(root,weapon);
 const reloadClock=createSourceReloadTimeline();let visibleWas=false,reloadWas=false,active=null,equipAge=0,adsAmount=0,fireAge=0;
 const diagnostics={weapon,source:'original GN '+(index.family||weapon),fireLeadIn:.020,matchedBones:clips.fire.userData.matchedBones.length,sourceEntries:Object.fromEntries(Object.entries(sources).map(([k,s])=>[k,s.sourceEntry]))};
 function restore(){mixer.stopAllAction();reloadClock.reset();for(const {b,p,q,s} of rest){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}active=null;equipAge=0;holdBeltIdle();}
 function play(kind){const firing=kind==='fire'||kind==='firezoomed',lead=firing?clips[kind].tracks.map(t=>{const [uuid,p]=t.name.split('.');return model.getObjectByProperty('uuid',uuid)[p].toArray();}):null;restore();if(lead){const captured=new Map(clips[kind].tracks.map((t,i)=>[t.name,lead[i]]));for(const variant of ['fire','firezoomed'])for(const t of clips[variant]?.tracks||[]){const value=captured.get(t.name);if(value)t.values.set(value,0);}}actions[kind].reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();active=kind;if(firing){fireAge=0;diagnostics.fireVariant=kind;}}
 root.userData.clips=Object.values(clips).map(c=>c.name);root.userData.animationDiagnostics=diagnostics;
 root.userData.fire=()=>{if(visibleWas&&!reloadWas)play(adsAmount>=.5&&actions.firezoomed?'firezoomed':'fire');};root.userData.equip=()=>{if(visibleWas&&!reloadWas)play('equip');};
 root.userData.updateAnimation=(dt,{visible,reloading=false,reloadRemaining,reloadReadyDuration,equipElapsed,ads=0}={})=>{
  adsAmount=Math.max(0,Math.min(1,ads));diagnostics.adsAmount=adsAmount;if(referenceOptic){if(weapon==='stinger')referenceOptic.visible=!!visible&&adsAmount>.02;else updateReferenceOptic(referenceOptic,adsAmount,visible);diagnostics.referenceOptic=root.userData.referenceOptic;diagnostics.referenceOpticVisible=referenceOptic.visible;}
  const entering=visible&&!visibleWas,expired=reloading&&Number.isFinite(reloadRemaining)&&reloadRemaining<=0;reloading=!!reloading&&!expired;
  if(!visible){if(visibleWas)restore();if(zeroMuzzleHelper)emitter.position.copy(emitterBind);visibleWas=false;reloadWas=false;diagnostics.active=null;return;}
  if(reloading&&(!reloadWas||entering||active!=='reload'))play('reload');
  else if(entering){restore();if(!expired&&(!Number.isFinite(equipElapsed)||equipElapsed<WEAPONS[weapon].visualEquip/1000)){play('equip');equipAge=Math.max(0,equipElapsed||0);}}
  else if(!reloading&&reloadWas&&active!=='reload')restore();
  if(active==='reload'){const readyDuration=!['phantom','sheriff'].includes(weapon)&&Number.isFinite(reloadReadyDuration)&&reloadReadyDuration>0?reloadReadyDuration:WEAPONS[weapon].reload/1000;const clock=reloadClock.sample(sources.reload.duration,readyDuration,{dt,mechanical:reloading,remaining:reloadRemaining});actions.reload.time=clock.sourceSeconds;actions.reload.setEffectiveTimeScale(0);actions.reload.paused=false;diagnostics.sourcePhase=clock.phase;diagnostics.reloadReadyDuration=readyDuration;if(clock.finished&&!reloading)restore();}
  if(active==='equip'){if(!entering)equipAge+=Math.max(0,dt);actions.equip.time=Math.min(sources.equip.duration,equipAge);actions.equip.setEffectiveTimeScale(0);actions.equip.paused=false;diagnostics.sourcePhase=actions.equip.time/sources.equip.duration;if(equipAge>=sources.equip.duration)restore();}
  if(active==='fire'&&['ares','odin'].includes(weapon)){
   // Play the original resolved mechanical keys, then blend their endpoint
   // into bind instead of snapping ammo-belt and handle bones on release.
   fireAge+=Math.max(0,dt);const duration=clips.fire.duration,tail=Math.max(0,Math.min(1,(fireAge-duration)/.080));
   actions.fire.enabled=true;actions.fire.paused=false;actions.fire.setEffectiveTimeScale(0).setEffectiveWeight(1-tail*tail*(3-2*tail)).play();actions.fire.time=Math.min(fireAge,duration-1e-8);
   mixer.update(0);diagnostics.fireReturnWeight=1-tail*tail*(3-2*tail);if(tail>=1)restore();
  }else if(['fire','firezoomed'].includes(active)&&actions.firezoomed){
   fireAge+=Math.max(0,dt);
   for(const [kind,weight] of [['fire',1-adsAmount],['firezoomed',adsAmount]]){const a=actions[kind];if(weight<=0){a.stop();continue;}a.enabled=true;a.paused=false;a.setEffectiveWeight(weight).setEffectiveTimeScale(0).play();a.time=Math.min(fireAge,clips[kind].duration);}
   diagnostics.fireBlend=adsAmount;
   mixer.update(0);if(fireAge>=Math.max(clips.fire.duration,clips.firezoomed.duration))restore();
  }else {mixer.update(Math.max(0,dt));if(['fire','firezoomed'].includes(active)&&actions[active].paused)restore();}visibleWas=true;reloadWas=reloading;
  if(weapon==='odin'&&active==='reload'){
   // Native Reload ends with a slightly different belt curl than IdlePose.
   // Blend only those cartridge sockets over the last 80ms; do not move the
   // magazine, receiver, hands or the original mechanical event times.
   const a=Math.max(0,Math.min(1,(actions.reload.time-(sources.reload.duration-.080))/.080)),weight=a*a*(3-2*a);
   if(weight>0)for(const t of beltIdle){const b=model.getObjectByName(t.bone);b.position.lerp(new T.Vector3().fromArray(t.positions),weight);b.quaternion.slerp(new T.Quaternion().fromArray(t.quaternions).normalize(),weight);}
   diagnostics.beltReturnWeight=weight;
  }
  updateSourceEmitter();diagnostics.active=active;diagnostics.time=active?actions[active].time:0;
 };
 return root;
}
