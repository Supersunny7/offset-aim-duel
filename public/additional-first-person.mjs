import * as T from '/vendor/three.module.js';
import {GLTFLoader} from '/vendor/addons/loaders/GLTFLoader.js';
import {createNativeBoneClip} from '/psa-animation.mjs';
import {createMeshSpaceFireClip,createSourceMeshSpaceClip,createSourceReloadTimeline} from '/weapon-feel.mjs';
import {WEAPONS} from '/weapons.mjs';
import {ADS_VIEW_PROFILES} from '/ads.mjs';
import {createSourceWeaponGrip} from '/source-weapon-grip.mjs';

// An independent original-Jett rig for the new guns. The validated legacy controller
// and all its clips, grip corrections and recorded perspective fits remain untouched.
const byCamera=new WeakMap();
// Camera-space fits from the user's primary video; both hands and gun move as
// one rig, leaving every original skeletal key and the legacy viewmodels intact.
const videoHipOffsets={phantom:new T.Vector3(.025,-.045,.09),sheriff:new T.Vector3(.025,-.035,.09)};
// The supplied video's native held poses sit farther right and below centre.
// Fit the complete new rig; moving a gun alone would detach the supporting hand.
const newHipOffset=new T.Vector3(.04,-.075,0);
const fireKinds=['fire','firezoomed','altfireadd'];
const motionKinds=['walkadd','runadd','jumpadd','jumplandadd','altwalkadd','altrunadd','altjumpadd','altjumplandadd'];
// Sheriff 01:03.900: more side profile and a clockwise silhouette. Rotate the
// complete original held pose around its grip, never the gun alone or fingers.
const sheriffViewRotation=new T.Quaternion().setFromEuler(new T.Euler(0,.077,-.18,'YXZ'));
const sheriffViewTranslation=new T.Vector3(.035,-.012,0);
export const ADDITIONAL_WEAPONS=Object.freeze(['phantom','sheriff','classic','shorty','frenzy','stinger','spectre','bucky','judge','bulldog','guardian','marshal','operator','ares','odin']);
const nativeIndices=new Map();
export function loadNativeWeaponIndex(weapon){
 if(nativeIndices.has(weapon))return nativeIndices.get(weapon);
 const pending=readNativeWeaponIndex(weapon).catch(error=>{nativeIndices.delete(weapon);throw error;});nativeIndices.set(weapon,pending);return pending;
}
async function readNativeWeaponIndex(weapon){
 if(!ADDITIONAL_WEAPONS.includes(weapon))throw Error('Unsupported additional weapon');
 const response=await fetch(`/assets/packs/animations/${weapon}-native-index.json`);
 if(!response.ok)throw Error(`${weapon} native index: HTTP ${response.status}`);
 const index=await response.json();if(index.weapon!==weapon||index.format!=='native-weapon-index-v1')throw Error('Native weapon index mismatch');return index;
}
export async function loadAdditionalFirstPersonArms(camera,weapon){
 let pending=byCamera.get(camera);
 if(!pending){pending=createController(camera);byCamera.set(camera,pending);pending.catch(()=>byCamera.delete(camera));}
 const controller=await pending;await controller.ensureWeapon(weapon);return controller;
}
async function createController(camera){
 const gltf=await new GLTFLoader().loadAsync('/assets/packs/jett-arms.glb');
 const model=gltf.scene,mount=new T.Group();mount.name='Independent original Phantom / Sheriff hands';
 mount.rotation.y=Math.PI/2;mount.scale.setScalar(.82);mount.position.y=-1.62*.82;mount.visible=false;mount.add(model);camera.add(mount);
 const hipPosition=mount.position.clone(),hipRotation=mount.quaternion.clone();
 model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});
 const mixer=new T.AnimationMixer(model),socket=model.getObjectByName('R_WeaponPoint');if(!socket)throw Error('Original Jett R_WeaponPoint missing');
 const basis=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0,-1,0),new T.Vector3(-1,0,0),new T.Vector3(0,0,-1)));
 const sourceGrip=createSourceWeaponGrip(model);
 function rawSocketTransform(){mount.updateWorldMatrix(true,true);return {position:camera.worldToLocal(socket.getWorldPosition(new T.Vector3())),rotation:camera.getWorldQuaternion(new T.Quaternion()).invert().multiply(socket.getWorldQuaternion(new T.Quaternion())).multiply(basis)};}
 const sets={},tasks={},rest=[];model.traverse(b=>{if(b.isBone)rest.push({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()});});
 let current=null,active='idlepose',actionAge=0,wasVisible=false,wasReload=false,wasGrounded=true,fireAge=Infinity,listener=null,adsAmount=0,fireKind='fire';
 const reloadClock=createSourceReloadTimeline();
 function captureAdsReferences(set){
  // Sample only original held clips on an isolated FK copy. Fire and walking
  // must never feed back into the alignment and cancel authored recoil.
  const virtualCamera=new T.Group(),referenceMount=new T.Group(),referenceModel=model.clone(true);
  referenceMount.position.copy(mount.position);referenceMount.quaternion.copy(mount.quaternion);referenceMount.scale.copy(mount.scale);
  virtualCamera.add(referenceMount);referenceMount.add(referenceModel);
  const referenceMixer=new T.AnimationMixer(referenceModel),master=referenceModel.getObjectByName('MasterWeapon');
  const hip=referenceMixer.clipAction(createNativeBoneClip(referenceModel,set.sources.idlepose));
  const altSource=set.sources.adsidlepose||set.sources.altidlepose;
  const alt=altSource?referenceMixer.clipAction(createNativeBoneClip(referenceModel,altSource)):null;
  const sample=t=>{referenceMixer.stopAllAction();hip.reset().setEffectiveWeight(1-(alt?t:0)).play();if(alt)alt.reset().setEffectiveWeight(t).play();referenceMixer.update(0);virtualCamera.updateMatrixWorld(true);};
  sample(0);
  const localPoint=master.worldToLocal(set.idleTransform.position.clone());
  const localRotation=master.getWorldQuaternion(new T.Quaternion()).invert().multiply(set.idleTransform.rotation);
  set.adsReferences=[];
  for(let i=0;i<=32;i++){sample(i/32);set.adsReferences.push({position:master.localToWorld(localPoint.clone()),rotation:master.getWorldQuaternion(new T.Quaternion()).multiply(localRotation)});}
  referenceMixer.stopAllAction();referenceMixer.uncacheRoot(referenceModel);
 }
 const diagnostics={isolated:true,weapon:null,source:'original Shared FP Carbine / Revolver on jettFirstPerson bind',loaded:[],errors:[],active:null,fireLeadIn:.020,movement:null,matchedBones:0,adsPose:'source held pose + geometry sight-axis alignment; no full AltIdlePose in supplied Carbine pack'};
 function restore(){mixer.stopAllAction();for(const {b,p,q,s} of rest){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}sourceGrip.forgetHands();reloadClock.reset();fireAge=Infinity;active='idlepose';actionAge=0;}
 function play(kind,metadata={}){
  const set=sets[current],previousFireKind=fireKind;
  const selected=kind==='fire'&&adsAmount>=.5?(set?.actions.firezoomed?'firezoomed':set?.actions.altfireadd?'altfireadd':'fire'):kind;
  const a=set?.actions[selected];if(!a)return;
  if(kind==='fire'){
   // Preserve only the current authored fire delta on restart. Capturing final
   // bone transforms here would also capture locomotion and apply it twice.
   const previous=new Map(set.clips[previousFireKind].tracks.map(t=>[t.name,t])),previousAction=set.actions[previousFireKind];
   const samples=set.clips[selected].tracks.map(t=>active==='fire'&&previous.has(t.name)?Array.from(previous.get(t.name).createInterpolant().evaluate(previousAction.time)):set.sources[selected].sourceSemantics==='absolute'?(()=>{const [uuid,p]=t.name.split('.');return model.getObjectByProperty('uuid',uuid)[p].toArray();})():t.ValueTypeName==='quaternion'?[0,0,0,1]:[0,0,0]);
   if(active==='fire'&&['ares','odin'].includes(current)){
    const weight=previousAction.getEffectiveWeight();
    set.clips[selected].tracks.forEach((t,i)=>{samples[i]=t.ValueTypeName==='quaternion'?new T.Quaternion().slerp(new T.Quaternion(...samples[i]),weight).toArray():samples[i].map(v=>v*weight);});
   }
   if(active==='fire'&&set.actions.firezoomed&&adsAmount>0&&adsAmount<1){
    const hip=new Map(set.clips.fire.tracks.map(t=>[t.name,t])),zoom=new Map(set.clips.firezoomed.tracks.map(t=>[t.name,t]));
    set.clips[selected].tracks.forEach((t,i)=>{if(!hip.has(t.name)||!zoom.has(t.name))return;const h=Array.from(hip.get(t.name).createInterpolant().evaluate(Math.min(fireAge,set.clips.fire.duration))),z=Array.from(zoom.get(t.name).createInterpolant().evaluate(Math.min(fireAge,set.clips.firezoomed.duration)));samples[i]=t.ValueTypeName==='quaternion'?new T.Quaternion().slerp(new T.Quaternion(...h),1-adsAmount).multiply(new T.Quaternion().slerp(new T.Quaternion(...z),adsAmount)).toArray():h.map((v,n)=>v+(z[n]-v)*adsAmount);});
   }
   const captured=new Map(set.clips[selected].tracks.map((t,i)=>[t.name,samples[i]]));
   for(const variant of (set.actions.firezoomed?['fire','firezoomed']:[selected]))for(const t of set.clips[variant].tracks){const value=captured.get(t.name);if(value)t.values.set(value,0);}
   fireKind=selected;
  }
  for(const [name,entry] of Object.entries(set.actions))if(entry!==set.actions.idlepose&&entry!==a&&!(['fire','idlepose'].includes(kind)&&motionKinds.includes(name)))entry.stop();
  if(kind==='idlepose')for(const variant of fireKinds)set.actions[variant]?.stop();
  if(['equip','reload','inspect'].includes(kind)||kind==='fire'&&set.sources[selected].sourceSemantics==='absolute'){set.actions.idlepose.stop();reloadClock.reset();fireAge=Infinity;}
  else set.actions.idlepose.enabled=true,set.actions.idlepose.reset().setEffectiveWeight(1).play();
  a.reset().setEffectiveWeight(kind==='fire'?1:1).setEffectiveTimeScale(1).play();active=kind;actionAge=0;
  if(kind==='fire')fireAge=0;
  if(['equip','reload'].includes(kind))listener?.({kind,weapon:current,...metadata});
 }
 async function ensureWeapon(weapon){
  if(sets[weapon])return;if(tasks[weapon])return tasks[weapon];
  tasks[weapon]=(async()=>{
   const index=await loadNativeWeaponIndex(weapon),kinds=['idlepose','equip','reload','fire','neutral-delta','altidlepose','runadd','walkadd','jumpadd','jumplandadd','inspect',...(!['phantom','sheriff'].includes(weapon)?['firezoomed','altfireadd','adsidlepose','altidleadd','altwalkadd','altrunadd','altjumpadd','altjumplandadd']:[])].filter(k=>index.fp[k]);
   const entries=await Promise.all(kinds.map(async kind=>{const r=await fetch('/assets/packs/animations/'+index.fp[kind]);if(!r.ok)throw Error(`${weapon} FP ${kind}: HTTP ${r.status}`);return[kind,await r.json()];}));
   const sources=Object.fromEntries(entries),actions={},clips={};
   for(const [kind,source] of entries){if(kind==='neutral-delta')continue;
    // Fire and locomotion use original component-space deltas. Parent compensation
    // prevents the same recoil being multiplied down both arm chains.
    const isFire=fireKinds.includes(kind),delta=isFire||motionKinds.includes(kind),alternate=kind.startsWith('alt')||kind==='firezoomed';
    const reference=alternate&&sources.altidleadd?sources.altidleadd:sources['neutral-delta'],held=alternate?(sources.altidlepose||sources.adsidlepose||sources.idlepose):sources.idlepose;
    const clip=isFire?source.sourceSemantics==='absolute'?createNativeBoneClip(model,source):createSourceMeshSpaceClip(model,source,reference,held):delta?createMeshSpaceFireClip(model,source,reference,held):createNativeBoneClip(model,source);
    if(isFire)for(const track of clip.tracks){const [uuid,p]=track.name.split('.'),first=source.sourceSemantics==='absolute'?model.getObjectByProperty('uuid',uuid)[p].toArray():track.ValueTypeName==='quaternion'?[0,0,0,1]:[0,0,0];track.times=new Float32Array([0,...Array.from(track.times,t=>t+.020)]);track.values=new Float32Array([...first,...track.values]);}if(isFire)clip.duration+=.020;
    const a=mixer.clipAction(clip);const loop=['idlepose','altidlepose','adsidlepose','runadd','walkadd','altrunadd','altwalkadd'].includes(kind);a.setLoop(loop?T.LoopRepeat:T.LoopOnce,loop?Infinity:1);a.clampWhenFinished=true;actions[kind]=a;clips[kind]=clip;
   }
   sets[weapon]={index,sources,actions,clips};diagnostics.loaded=Object.keys(sets);diagnostics.matchedBones=clips.idlepose.userData.matchedBones.length;
  })().finally(()=>delete tasks[weapon]);return tasks[weapon];
 }
 const controller={mount,model,diagnostics,ensureWeapon,setActionListener(fn){listener=fn;},getNativeAdsOffset(){return new T.Vector3();},
  releaseWeapon(weapon){
   // Evict only inactive newly imported sets. Do not reset the shared rig or
   // the selected source pose while another model is loading asynchronously.
   if(['phantom','sheriff'].includes(weapon)||weapon===current||tasks[weapon]||!sets[weapon])return false;
   const set=sets[weapon];for(const action of Object.values(set.actions))action.stop();
   for(const clip of Object.values(set.clips))mixer.uncacheClip(clip);
   delete sets[weapon];delete tasks[weapon];sourceGrip.releaseWeapon?.(weapon);diagnostics.loaded=Object.keys(sets);return true;
  },
  equip(){if(wasVisible&&!wasReload)play('equip');},fire(){if(wasVisible&&!wasReload)play('fire');},inspect(){if(wasVisible&&!wasReload)play('inspect');},
  update(dt,{visible=false,weapon=current,reloading=false,reloadRemaining,reloadReadyDuration,equipElapsed,speed=0,grounded=true,ads=0}={}){
   adsAmount=Math.max(0,Math.min(1,ads));
   mount.position.copy(hipPosition).add(videoHipOffsets[weapon]||newHipOffset);mount.quaternion.copy(hipRotation);
   if(!visible||!sets[weapon]){if(wasVisible)restore();mount.visible=false;wasVisible=false;wasReload=false;diagnostics.active=null;return;}
   const changed=weapon!==current,entering=!wasVisible||changed;if(changed){
    restore();current=weapon;fireKind='fire';diagnostics.jumpVariant=null;diagnostics.adsPose='source held pose + geometry sight-axis alignment';
    sets[current].actions.idlepose.reset().setEffectiveWeight(1).play();mixer.update(0);
    const idleTransform=rawSocketTransform();sets[current].idleTransform=idleTransform;
    sourceGrip.captureIdle(current,idleTransform);if(WEAPONS[current]?.ads&&!sets[current].adsReferences)captureAdsReferences(sets[current]);restore();
   }
   const set=sets[current],expired=reloading&&Number.isFinite(reloadRemaining)&&reloadRemaining<=0;reloading=!!reloading&&!expired;
   if(reloading&&(!wasReload||entering||active!=='reload'))play('reload',{reloadRemaining,...(!['phantom','sheriff'].includes(current)?{readyDuration:Number.isFinite(reloadReadyDuration)&&reloadReadyDuration>0?reloadReadyDuration:WEAPONS[current].reload/1000}:{})});
   else if(entering){restore();if(!expired&&(!Number.isFinite(equipElapsed)||equipElapsed<WEAPONS[current].visualEquip/1000)){play('equip',{equipElapsed});actionAge=Math.max(0,equipElapsed||0);}else play('idlepose');}
   else if(!reloading&&wasReload&&active!=='reload')play('idlepose');
   if(active==='reload'){
    const readyDuration=!['phantom','sheriff'].includes(current)&&Number.isFinite(reloadReadyDuration)&&reloadReadyDuration>0?reloadReadyDuration:WEAPONS[current].reload/1000;
    const clock=reloadClock.sample(set.sources.reload.duration,readyDuration,{dt,mechanical:reloading,remaining:reloadRemaining});set.actions.reload.time=clock.sourceSeconds;set.actions.reload.setEffectiveTimeScale(0);set.actions.reload.paused=false;diagnostics.sourcePhase=clock.phase;diagnostics.reloadReadyDuration=readyDuration;
    if(clock.finished&&!reloading)play('idlepose');
   }else if(active==='equip'){
    if(!entering)actionAge+=Math.max(0,dt);set.actions.equip.time=Math.min(set.sources.equip.duration,actionAge);set.actions.equip.setEffectiveTimeScale(0);set.actions.equip.paused=false;diagnostics.sourcePhase=set.actions.equip.time/set.sources.equip.duration;
    if(actionAge>=set.sources.equip.duration)play('idlepose');
   }
   fireAge+=Math.max(0,dt);
   const lmgFire=['ares','odin'].includes(current),fireDuration=set.actions.firezoomed?Math.max(set.clips.fire.duration,set.clips.firezoomed.duration):set.clips[fireKind].duration;
   if(active==='fire'&&fireAge>=fireDuration+(lmgFire ? .080 : 0))play('idlepose');
   if(active==='fire'&&lmgFire){
    const tail=Math.max(0,Math.min(1,(fireAge-fireDuration)/.080)),weight=1-tail*tail*(3-2*tail),a=set.actions[fireKind];
    a.enabled=true;a.paused=false;a.setEffectiveTimeScale(0).setEffectiveWeight(weight).play();a.time=Math.min(fireAge,fireDuration-1e-8);diagnostics.fireReturnWeight=weight;
   }
   // Original family movement is applied over the selected gun's own held pose,
   // never a copied weapon idle. Suppress it during draw/reload/inspect.
   const motionAllowed=['idlepose','fire'].includes(active),baseMove=set.actions.walkadd&&speed<3?'walkadd':'runadd',moveKind=adsAmount>=.5&&set.actions['alt'+baseMove]?'alt'+baseMove:baseMove;
   for(const kind of ['walkadd','runadd','altwalkadd','altrunadd']){
    const a=set.actions[kind];if(!a)continue;const hasAlt=!!set.actions['alt'+baseMove];
    const blend=kind===baseMove?(hasAlt?1-adsAmount:1):kind==='alt'+baseMove?adsAmount:0;
    if(motionAllowed&&grounded&&speed>.1&&(blend>0||kind===baseMove&&hasAlt)){a.enabled=true;a.paused=false;a.setEffectiveWeight(Math.min(1,speed/WEAPONS[current].runSpeed)*blend).play();
     if(kind.startsWith('alt')){const ratio=set.clips[kind].duration/set.clips[baseMove].duration;a.time=set.actions[baseMove].time*ratio;a.setEffectiveTimeScale(ratio);}else a.setEffectiveTimeScale(1);
    }else a.stop();
   }
   // Blend only genuine source Fire/FireZoomed clips, on the same elapsed shot
   // clock. No replayed shot/audio events and no invented alternate for other guns.
   if(active==='fire'&&set.actions.firezoomed){
    // Additive quaternion products are ordered. Keep the native hip→zoom
    // layer order stable during partial ADS so repeat-shot leads sample it exactly.
    if(adsAmount>0&&adsAmount<1){set.actions.fire.stop();set.actions.firezoomed.stop();}
    for(const [kind,weight] of [['fire',1-adsAmount],['firezoomed',adsAmount]]){
     const a=set.actions[kind];if(weight<=0){a.stop();continue;}
     a.enabled=true;a.paused=false;a.setEffectiveWeight(weight).setEffectiveTimeScale(0).play();a.time=Math.min(fireAge,set.clips[kind].duration);
    }
    diagnostics.fireBlend=adsAmount;
   }
   if(motionAllowed&&grounded!==wasGrounded){const base=grounded?'jumplandadd':'jumpadd',kind=adsAmount>=.5&&set.actions['alt'+base]?'alt'+base:base;for(const previous of ['jumpadd','jumplandadd','altjumpadd','altjumplandadd'])if(previous!==kind)set.actions[previous]?.stop();set.actions[kind]?.reset().setEffectiveWeight(1).fadeIn(.035).play();diagnostics.jumpVariant=kind;}
   if(!motionAllowed)for(const kind of ['jumpadd','jumplandadd','altjumpadd','altjumplandadd'])set.actions[kind]?.stop();
   const scopedPose=set.actions.adsidlepose?'adsidlepose':'altidlepose';
   if(set.actions[scopedPose]){const scoped=motionAllowed?adsAmount:0;set.actions.idlepose.setEffectiveWeight(1-scoped);if(scoped>0)set.actions[scopedPose].reset().setEffectiveWeight(scoped).setEffectiveTimeScale(0).play();else set.actions[scopedPose].stop();diagnostics.adsPose=scopedPose;}
   sourceGrip.restoreHands(current);
   mixer.update(Math.max(0,dt));
   if(active==='inspect'&&set.actions.inspect?.paused){play('idlepose');mixer.update(0);}
   for(const kind of ['jumpadd','jumplandadd','altjumpadd','altjumplandadd'])if(set.actions[kind]?.paused){set.actions[kind].stop();mixer.update(0);}
   sourceGrip.applyHands(current,active);
   if(current==='sheriff'){
    const pivot=set.idleTransform.position;
    mount.position.sub(pivot).applyQuaternion(sheriffViewRotation).add(pivot).add(sheriffViewTranslation);
    mount.quaternion.premultiply(sheriffViewRotation);
    diagnostics.viewFit={referenceSeconds:63.9,yawRadians:.077,rollRadians:-.18,translation:sheriffViewTranslation.toArray(),sourceKeysChanged:false};
   }
   diagnostics.grip=sourceGrip.diagnostics;diagnostics.fireBasis=set.clips.fire?.userData.conversion;diagnostics.videoReference='fteRz6Y59AA';diagnostics.hipOffset=(videoHipOffsets[current]||newHipOffset).toArray();
   wasVisible=true;wasReload=reloading;wasGrounded=grounded;mount.visible=true;
   Object.assign(diagnostics,{weapon:current,active,fireVariant:fireKind,availableVariants:Object.keys(set.sources).filter(k=>k.startsWith('alt')||k==='firezoomed'||k==='adsidlepose'),sourcePhase:active==='fire'?Math.min(1,fireAge/set.clips[fireKind].duration):diagnostics.sourcePhase,movement:motionAllowed&&speed>.1?moveKind:null,adsAmount:ads,sourceEntries:Object.fromEntries(Object.entries(set.sources).map(([k,s])=>[k,s.sourceEntry]))});
  },
  getWeaponTransform(){return current?sourceGrip.getWeaponTransform(camera,current):rawSocketTransform();},
  applyWeaponGrip(){},applyNativeRightGrip(){},applyViewmodelPose(){},applyGhostViewmodelPose(){},
  applyAdditionalAds(asset,amount){
   if(!WEAPONS[current]?.ads||amount<=0||!asset?.userData.nativeSight)return;
   // Move both hands and gun as one camera-space rig. The sight landmark comes
   // from the genuine GN mesh, not a synthesized/copy-named ADS skeletal clip.
   // Fit from native Idle, not the live Fire pose: a live alignment would
   // continually undo the original recoil while aiming down sights.
   const refs=sets[current].adsReferences,u=Math.max(0,Math.min(1,amount))*32,a=Math.floor(u),b=Math.min(32,a+1),f=u-a;
   const transform=refs?{position:refs[a].position.clone().lerp(refs[b].position,f),rotation:refs[a].rotation.clone().slerp(refs[b].rotation,f)}:sets[current].idleTransform;
   const sight=asset.userData.nativeSight.clone().multiplyScalar(.82).applyQuaternion(transform.rotation).add(transform.position);
   const bore=asset.userData.nativeBore.clone().applyQuaternion(transform.rotation).normalize();
   // Reflex is above the barrel; Reflex-to-Muzzle would wrongly pitch by 4°.
   let alignment=new T.Quaternion().setFromUnitVectors(bore,new T.Vector3(0,0,-1));
   alignment=new T.Quaternion().slerp(alignment,amount);
   const target=sight.clone().lerp(new T.Vector3(0,0,sight.z),amount);
   mount.position.sub(sight).applyQuaternion(alignment).add(target);mount.quaternion.premultiply(alignment);
   const fit=ADS_VIEW_PROFILES[current];
   if(fit?.viewOffsetY){const offset=fit.viewOffsetY*amount;mount.position.y+=offset;target.y+=offset;}
   if(fit?.viewPitch){const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),fit.viewPitch*amount);const translation=new T.Vector3(0,(fit.viewTranslationY||0)*amount,(fit.viewTranslationZ||0)*amount);mount.position.applyQuaternion(q).add(translation);mount.quaternion.premultiply(q);target.applyQuaternion(q).add(translation);}
   diagnostics.adsViewFit=fit?.viewOffsetY?{translationY:fit.viewOffsetY*amount,extraPitch:fit.viewPitch*amount||0,topFraction:fit.topFraction,source:fit.referenceSeconds?'per-weapon saved fteRz6Y59AA receiver/front-sight fit; presentation transform only':fit.provisional?'provisional clearance fit; native ADS animation preserved':'saved fteRz6Y59AA ADS frame; vertical rig fit preserves native bore alignment'}:null;
   diagnostics.adsDistanceMetres=-target.z;diagnostics.adsDistanceBasis=fit?.referenceSeconds?'original held clip plus saved-video landmark fit; not an authored ADS clip':'original held clip and native Reflex landmark; not inferred from HUD size';diagnostics.adsOffset=target.clone().sub(sight).toArray();diagnostics.adsAlignmentDegrees=T.MathUtils.radToDeg(new T.Quaternion().angleTo(alignment));
   diagnostics.adsReference=sets[current].sources.adsidlepose?.sourceEntry||sets[current].sources.altidlepose?.sourceEntry||sets[current].sources.idlepose.sourceEntry;
  }
 };
 return controller;
}

