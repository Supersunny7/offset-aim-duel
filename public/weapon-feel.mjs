import * as T from '/vendor/three.module.js';
import {WEAPONS,equipClipPhase} from '/weapons.mjs';

// remaining is measured at the current rendered frame, not at its beginning.
// A fixed value freezes pause time; a newer snapshot cannot rewind a reload.
export function createReloadTimeline(){
  let elapsed=0;
  return {reset(){elapsed=0;},sample(duration,remaining,minimumElapsed=0){
    if(!Number.isFinite(remaining)||!(duration>0))return null;
    elapsed=Math.max(elapsed,Math.max(0,Math.min(duration,minimumElapsed)),Math.max(0,Math.min(duration,duration-remaining)));
    return {elapsed,phase:elapsed/duration,expired:remaining<=0};
  }};
}

// Ghost visual source time is independent from its mechanical ready gate.
// Authoritative remaining is frame-end time: seek without adding dt twice.
export function createSourceReloadTimeline(){
  let sourceSeconds=0,coreEnded=false;
  return {reset(){sourceSeconds=0;coreEnded=false;},sample(sourceDuration,readyDuration,{dt=0,mechanical=false,remaining}={}){
    let deadlineDriven=false;
    if(mechanical&&Number.isFinite(remaining)){
      sourceSeconds=Math.max(sourceSeconds,Math.max(0,Math.min(readyDuration,readyDuration-remaining)));deadlineDriven=true;
    }else if(!coreEnded&&Number.isFinite(remaining)&&remaining<=0){
      sourceSeconds=Math.max(sourceSeconds,readyDuration);coreEnded=true;deadlineDriven=true;
    }else{
      sourceSeconds+=Math.max(0,dt);if(!mechanical)coreEnded=true;
    }
    sourceSeconds=Math.min(sourceDuration,sourceSeconds);
    return {sourceSeconds,phase:sourceSeconds/sourceDuration,deadlineDriven,cosmetic:coreEnded,finished:sourceSeconds>=sourceDuration};
  }};
}

// Repeated native component rotation keys indicate mesh-space additive Fire. The same component rotation is
// present on several descendants: adding those samples as local rotations
// applies the recoil repeatedly and turns pitch into a large lateral swing.
// Convert against the native neutral basis and the chosen native held pose.
export function createMeshSpaceFireClip(model,source,neutral,basePose){
  const bones=[];model.traverse(b=>{if(b.isBone)bones.push(b);});
  const src=new Map(source.tracks.map(t=>[t.bone,t]));
  const refs=new Map(neutral.tracks.map(t=>[t.bone,t]));
  const bases=new Map(basePose.tracks.map(t=>[t.bone,t]));
  const localOf=(b,map)=>map.has(b.name)?new T.Quaternion().fromArray(map.get(b.name).quaternions).normalize():b.quaternion.clone();
  const worldOf=(map)=>{const result=new Map();const visit=b=>{if(result.has(b))return result.get(b);const parent=b.parent?.isBone?visit(b.parent):b.parent?.getWorldQuaternion(new T.Quaternion())||new T.Quaternion();const world=parent.clone().multiply(localOf(b,map));result.set(b,world);return world;};for(const b of bones)visit(b);return result;};
  const neutralWorld=worldOf(refs),baseWorld=worldOf(bases),rotations=new Map(bones.map(b=>[b,[]]));
  const desired=new Map(),times=Array.from({length:source.frames},(_,i)=>i/source.fps);
  for(let frame=0;frame<source.frames;frame++){
    for(const b of bones){const track=src.get(b.name),ref=refs.get(b.name);let delta=new T.Quaternion();
      if(track&&ref){delta.fromArray(ref.quaternions).normalize().invert().multiply(new T.Quaternion().fromArray(track.quaternions,frame*4).normalize());delta.premultiply(neutralWorld.get(b)).multiply(neutralWorld.get(b).clone().invert());}
      desired.set(b,delta.multiply(baseWorld.get(b)));
    }
    for(const b of bones){const parent=b.parent?.isBone?desired.get(b.parent):b.parent?.getWorldQuaternion(new T.Quaternion())||new T.Quaternion();const local=parent.clone().invert().multiply(desired.get(b));const delta=localOf(b,bases).invert().multiply(local).normalize();const values=rotations.get(b);if(values.length&&new T.Quaternion().fromArray(values,values.length-4).dot(delta)<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);values.push(...delta.toArray());}
  }
  const tracks=[];
  for(const b of bones){if(!src.has(b.name))continue;tracks.push(new T.QuaternionKeyframeTrack(`${b.uuid}.quaternion`,times,rotations.get(b)));
    const track=src.get(b.name),ref=refs.get(b.name);if(ref){const values=track.positions.map((v,i)=>v-ref.positions[i%3]);tracks.push(new T.VectorKeyframeTrack(`${b.uuid}.position`,times,values));}
  }
  const clip=new T.AnimationClip(`${source.name} mesh-space over ${basePose.name}`,source.duration,tracks,T.AdditiveAnimationBlendMode);
  clip.userData={matchedBones:bones.filter(b=>src.has(b.name)).map(b=>b.name),missingBones:[],sourceName:source.name,basePose:basePose.name,reference:neutral.name,conversion:'native mesh-space parent compensation'};return clip;
}

// Consume shot-clock lift into the player's actual aim. Gun-body recovery is
// separate: releasing fire must never pull the player's aim back to its origin.
// Native FP Camera keys are constant: actual-aim recoil belongs to gameplay,
// not the weapon skeleton. These new-gun curves are bounded project tuning;
// no public source establishes the exact Valorant camera-recoil curve.
export const AIM_RECOIL_PROFILES=Object.freeze({
  vandal:Object.freeze({first:0,step:.006,cap:.075,resetGap:300}),
  phantom:Object.freeze({first:0,step:.005,cap:.065,resetGap:300}),
  sheriff:Object.freeze({first:.012,step:.006,cap:.06,resetGap:450}),
  // Bounded practice camera curves, independent from unmodified source Fire.
  // Wiki does not publish complete camera recoil curves for these weapons.
  classic:Object.freeze({first:.005,step:.004,cap:.035,resetGap:300}),
  shorty:Object.freeze({first:.016,step:.006,cap:.035,resetGap:450}),
  frenzy:Object.freeze({first:.002,step:.004,cap:.055,resetGap:300}),
  stinger:Object.freeze({first:.002,step:.005,cap:.075,resetGap:300}),
  spectre:Object.freeze({first:.002,step:.003,cap:.055,resetGap:300}),
  bucky:Object.freeze({first:.025,step:0,cap:.025,resetGap:500}),
  judge:Object.freeze({first:.018,step:.004,cap:.055,resetGap:400}),
  bulldog:Object.freeze({first:.002,step:.005,cap:.065,resetGap:300}),
  guardian:Object.freeze({first:.018,step:.005,cap:.055,resetGap:450}),
  marshal:Object.freeze({first:.024,step:0,cap:.024,resetGap:500}),
  operator:Object.freeze({first:.035,step:0,cap:.035,resetGap:700}),
  ares:Object.freeze({first:.002,step:.003,cap:.065,resetGap:300}),
  odin:Object.freeze({first:.002,step:.003,cap:.065,resetGap:300})
});
export function createAimRecoil(){
  let last=-Infinity,count=0,from=0,target=0,consumed=0,burstLift=0,activeWeapon=null;
  function sample(now){
    const age=Math.max(0,(now-last)/1000);
    const value=target+(from-target)*Math.exp(-35*age);
    return Number.isFinite(value)?value:0;
  }
  return {
    sample,
    consume(now){const value=Math.max(consumed,sample(now)),delta=value-consumed;consumed=value;return delta;},
    shot(now,weapon){const profile=AIM_RECOIL_PROFILES[weapon];if(!profile)return;from=sample(now);if(activeWeapon!==weapon||now-last>profile.resetGap){count=0;burstLift=0;}activeWeapon=weapon;count++;const next=Math.min(profile.first+(count-1)*profile.step,profile.cap);target+=next-burstLift;burstLift=next;last=now;},
    reset(){last=-Infinity;count=0;from=0;target=0;consumed=0;burstLift=0;activeWeapon=null;},
    get diagnostics(){return {shots:count,target,weapon:activeWeapon,source:activeWeapon==='vandal'?'existing validated project curve':'bounded project curve; native Camera keys unchanged',lastShot:Number.isFinite(last)?last:null};}
  };
}

// Bind the actual Luger skin; this pack also contains a hidden Classic skeleton.
export async function attachGhostMechanics(root){
  let body,magazine;
  root.traverse(o=>{
    if(o.isSkinnedMesh&&o.name.startsWith('GN_Luger_S0_Skelmesh'))body??=o;
    if(o.name.startsWith('GN_Luger_Magazine_S0_Staticmesh'))magazine??=o;
  });
  if(!body?.skeleton)throw new Error('Ghost Luger skin not found');
  const bones=Object.fromEntries(body.skeleton.bones.map(b=>[b.name.replace(/_\d+$/,''),b]));
  const main=bones.Magazine_Main,slide=bones.Slide;
  if(!main||!slide)throw new Error('Ghost mechanical bones missing');
  root.updateWorldMatrix(true,true);
  if(magazine){main.attach(magazine);magazine.traverse(o=>o.visible=true);}
  const clips=await Promise.all(['fire','equip','reload'].map(async kind=>{
    const response=await fetch(`/assets/packs/animations/ghost-${kind}.json`);
    if(!response.ok)throw new Error(`Ghost ${kind}: HTTP ${response.status}`);
    const source=await response.json(),tracks=[];
    // The exported Fire begins with an already-retracted slide. Add a real
    // 28ms rest-to-source lead-in, then retain the native cycle speed.
    // This keeps the supplied mechanical motion without a first-frame teleport.
    const fire=kind==='fire',lead=.028,cycle=source.duration;
    const times=Array.from({length:source.frames},(_,i)=>fire?lead+(i/source.fps)*cycle/source.duration:i/source.fps);
    if(fire)times.unshift(0);
    for(const t of source.tracks){const bone=bones[t.bone];if(!bone)continue;
      let positions=t.positions,quaternions=t.quaternions;
      if(kind==='reload'&&t.bone==='Slide'){
        positions=[...positions];quaternions=[...quaternions];
        // Actual GLB bind differs from Reload's first Slide sample by 40mm.
        // Blend the first 4% of source time from bind; the source ends at bind.
        for(let i=0;i<source.frames;i++){
          const phase=i/(source.frames-1),u=Math.min(1,phase/.04),blend=u*u*(3-2*u);
          new T.Vector3().copy(bone.position).lerp(new T.Vector3().fromArray(t.positions,i*3),blend).toArray(positions,i*3);
          new T.Quaternion().copy(bone.quaternion).slerp(new T.Quaternion().fromArray(t.quaternions,i*4),blend).toArray(quaternions,i*4);
        }
      }
      tracks.push(new T.VectorKeyframeTrack(`${bone.uuid}.position`,times,fire?[...bone.position.toArray(),...positions]:positions));
      tracks.push(new T.QuaternionKeyframeTrack(`${bone.uuid}.quaternion`,times,fire?[...bone.quaternion.toArray(),...quaternions]:quaternions));
    }
    return new T.AnimationClip(source.name,fire?lead+cycle:source.duration,tracks);
  }));
  const mixer=new T.AnimationMixer(root),actions=Object.fromEntries(clips.map((clip,i)=>{
    const kind=['fire','equip','reload'][i],action=mixer.clipAction(clip).setLoop(T.LoopOnce,1);action.clampWhenFinished=true;
    if(kind==='equip')action.timeScale=clip.duration/(WEAPONS.ghost.visualEquip/1000);
    if(kind==='reload')action.timeScale=1;
    if(kind==='fire')action.timeScale=1;
    return [kind,action];
  }));
  const rest=body.skeleton.bones.map(b=>({bone:b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
  const reloadTimeline=createSourceReloadTimeline();
  let active=null,equipAge=0,visibleWas=false,reloadWas=false;
  const restore=()=>{mixer.stopAllAction();reloadTimeline.reset();for(const b of rest){b.bone.position.copy(b.p);b.bone.quaternion.copy(b.q);b.bone.scale.copy(b.s);}active=null;};
  const play=kind=>{restore();if(kind==='equip')equipAge=0;active=kind;actions[kind].reset().setEffectiveTimeScale(kind==='reload'||kind==='fire'?1:actions[kind].timeScale).play();};
  const diagnostics={matchedBones:clips[0].tracks.length/2,magazineMeshBound:magazine?.parent===main,fireLeadIn:.028,fireCycleDuration:clips[0].duration,reloadSlideLeadIn:{startPhase:0,endPhase:.04,duration:clips[2].duration*.04,sourceInitialOffset:.04}};
  root.userData.equip=()=>{if(visibleWas&&!reloadWas)play('equip');};
  root.userData.fire=()=>{if(visibleWas&&!reloadWas)play('fire');};
  root.userData.clips=clips.map(c=>c.name);
  root.userData.animationDiagnostics=diagnostics;
  root.userData.updateAnimation=(dt,{visible,reloading,reloadRemaining,equipElapsed}={})=>{
    const entering=visible&&!visibleWas;
      const expired=reloading&&Number.isFinite(reloadRemaining)&&reloadRemaining<=0;
    reloading=!!reloading&&!expired;
    if(!visible){restore();visibleWas=false;reloadWas=false;}
    else {
      if(reloading&&(!visibleWas||!reloadWas||active!=='reload'))play('reload');
      else if(expired&&!visibleWas)restore();
      else if(!visibleWas){if(Number.isFinite(equipElapsed)&&equipElapsed>=WEAPONS.ghost.visualEquip/1000)restore();else {play('equip');if(Number.isFinite(equipElapsed)){equipAge=equipElapsed;actions.equip.time=equipClipPhase('ghost',equipElapsed)*actions.equip.getClip().duration;actions.equip.setEffectiveTimeScale(0);}}}
      else if(!reloading&&reloadWas&&active!=='reload')restore();
      visibleWas=true;reloadWas=reloading;
    }
    const deadline=visible&&active==='reload'?reloadTimeline.sample(clips[2].duration,WEAPONS.ghost.reload/1000,{dt,mechanical:reloading,remaining:reloadRemaining}):null;
    if(active==='reload'){
      actions.reload.time=deadline.sourceSeconds;actions.reload.paused=false;actions.reload.setEffectiveTimeScale(0);
    }
    if(active==='equip'&&dt>0&&!(entering&&Number.isFinite(equipElapsed))){const nextAge=equipAge+dt;actions.equip.setEffectiveTimeScale((equipClipPhase('ghost',nextAge)+(nextAge>=WEAPONS['ghost'].visualEquip/1000?1e-7:0)-equipClipPhase('ghost',equipAge))*actions.equip.getClip().duration/dt);equipAge=nextAge;}
    mixer.update(dt);
    if(active==='reload'&&deadline.finished&&!reloading)restore();
    else if(active&&actions[active].paused&&!reloading)restore();
    diagnostics.active=active;diagnostics.time=active?actions[active].time:0;
    diagnostics.reloadPhase=active==='reload'?actions.reload.time/clips[2].duration:null;diagnostics.reloadDeadlineDriven=!!deadline?.deadlineDriven;diagnostics.reloadRemaining=Number.isFinite(reloadRemaining)?reloadRemaining:null;
    diagnostics.reloadSourceDuration=clips[2].duration;diagnostics.reloadCosmetic=active==='reload'&&!reloading;
    diagnostics.slide=slide.position.toArray();diagnostics.magazine=main.position.toArray();
    diagnostics.magazineMeshParent=magazine?.parent?.name;
  };
  return root;
}


// Opt-in for original Jett FP Carbine / Revolver component-space clips only.
// These values come from jettFirstPerson.blend's Skeleton custom orig_quat
// (stored w,x,y,z), not from a fitted recoil curve or altered animation key.
const skeletonOriginal=new T.Quaternion(.4999999701976776,.4999999701976776,.5,-.5000000596046448).normalize();
const actorToGltf=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2);

export function createSourceMeshSpaceClip(model,source,neutral,basePose){
 if(!source.sourceEntry?.includes('/First Person/FP_Core_')||!['Carbine','Revolver','Shared Rifle','BasePistol','Slim','AutoPistol','Vector','MP5','PumpShotgun','AutoShotgun','Burst','Dmr','Leversniper','Boltsniper','LMG','HMG'].includes(source.sourceFamily))throw Error('Native component opt-in only supports the additional source families');
 const skeleton=model.getObjectByName('Skeleton');if(!skeleton?.isBone)throw Error('Original FP Skeleton is missing');
 model.updateWorldMatrix(true,true);
 // The parent is the original glTF armature object. Its local bone root
 // already contains the glTF Z-up -> Y-up transform and the imported root's
 // rest reorientation. Mesh-space deltas must use the mesh component frame,
 // not that imported Skeleton bind frame.
 const meshWorld=skeleton.parent.getWorldQuaternion(new T.Quaternion()).normalize().multiply(actorToGltf);
 const correction=meshWorld.clone().multiply(skeletonOriginal).multiply(meshWorld.clone().invert());
 const correctionInverse=correction.clone().invert();
 const bones=[];model.traverse(b=>{if(b.isBone)bones.push(b);});
 const src=new Map(source.tracks.map(t=>[t.bone,t])),refs=new Map(neutral.tracks.map(t=>[t.bone,t])),bases=new Map(basePose.tracks.map(t=>[t.bone,t]));
 const localOf=(b,map)=>map.has(b.name)?new T.Quaternion().fromArray(map.get(b.name).quaternions).normalize():b.quaternion.clone().normalize();
 function worldOf(map){const result=new Map();function visit(b){if(result.has(b))return result.get(b);const parent=b.parent?.isBone?visit(b.parent):b.parent?.getWorldQuaternion(new T.Quaternion()).normalize()||new T.Quaternion();const world=parent.clone().multiply(localOf(b,map)).normalize();result.set(b,world);return world;}for(const b of bones)visit(b);return result;}
 const neutralWorld=worldOf(refs),baseWorld=worldOf(bases),values=new Map(bones.map(b=>[b,[]])),desired=new Map(),times=Array.from({length:source.frames},(_,i)=>i/source.fps);
 for(let frame=0;frame<source.frames;frame++){
  for(const b of bones){const track=src.get(b.name),ref=refs.get(b.name);let delta=new T.Quaternion();
   if(track&&ref){delta.fromArray(ref.quaternions).normalize().invert().multiply(new T.Quaternion().fromArray(track.quaternions,frame*4).normalize());delta.premultiply(neutralWorld.get(b)).multiply(neutralWorld.get(b).clone().invert());
    // Undo only the extra original Skeleton basis inherited by the retargeted
    // zero-pose world frame. The authored rotation angle and source timing stay.
    delta.premultiply(correction).multiply(correctionInverse).normalize();}
   desired.set(b,delta.multiply(baseWorld.get(b)).normalize());
  }
  for(const b of bones){const parent=b.parent?.isBone?desired.get(b.parent):b.parent?.getWorldQuaternion(new T.Quaternion()).normalize()||new T.Quaternion();const local=parent.clone().invert().multiply(desired.get(b));const delta=localOf(b,bases).invert().multiply(local).normalize(),out=values.get(b);if(out.length&&new T.Quaternion().fromArray(out,out.length-4).dot(delta)<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);out.push(...delta.toArray());}
 }
 const tracks=[];for(const b of bones){if(!src.has(b.name))continue;tracks.push(new T.QuaternionKeyframeTrack(`${b.uuid}.quaternion`,times,values.get(b)));const track=src.get(b.name),ref=refs.get(b.name);if(ref)tracks.push(new T.VectorKeyframeTrack(`${b.uuid}.position`,times,track.positions.map((v,i)=>v-ref.positions[i%3])));}
 const clip=new T.AnimationClip(`${source.name} original mesh-component frame over ${basePose.name}`,source.duration,tracks,T.AdditiveAnimationBlendMode);
 clip.userData={matchedBones:bones.filter(b=>src.has(b.name)).map(b=>b.name),missingBones:[],sourceName:source.name,basePose:basePose.name,reference:neutral.name,conversion:'source mesh-space parent compensation with original Skeleton-basis removal',sourceSkeletonQuaternion:skeletonOriginal.toArray(),actorToGltfQuaternion:actorToGltf.toArray(),componentCorrection:correction.toArray()};return clip;
}
