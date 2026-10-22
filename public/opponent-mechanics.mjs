import {ADDITIONAL_WEAPONS,loadNativeWeaponIndex} from '/additional-first-person.mjs';
import * as T from '/vendor/three.module.js';

// Third-person mechanics are sampled from the same authoritative phase as hands.
export async function attachOpponentMechanics(root,weapon){
  const model=root.userData.model||root;
  const index=ADDITIONAL_WEAPONS.includes(weapon)?await loadNativeWeaponIndex(weapon):null;
  let skin;model.traverse(o=>{if(o.isSkinnedMesh&&o.name.startsWith((index?.family?'GN_'+index.family+'_':({ghost:'GN_Luger_',phantom:'GN_Carbine_',sheriff:'GN_Revolver_'}[weapon]||'GN_AK_'))+'S0_Skelmesh'))skin=o;});
  const bones={};(skin?.skeleton.bones||[]).forEach(b=>bones[b.name.replace(/_\d+$/,'')]=b);
  if(!skin)model.traverse(o=>{if(o.isBone)bones[o.name.replace(/_\d+$/,'')]=o;});
  const mechanicFiles=index?{...index.gn,...index.gntp}:null;
  const kinds=weapon==='ghost'?['equip','fire','reload']:Object.keys(mechanicFiles||{reload:true}).filter(kind=>['equip','fire','reload'].includes(kind));
  const clips={};
  for(const kind of kinds){
    const r=await fetch('/assets/packs/animations/'+(mechanicFiles?.[kind]||`tp-${weapon}-${kind}.json`));
    if(!r.ok)throw new Error(`GNTP ${weapon} ${kind}: HTTP ${r.status}`);
    const source=await r.json(),lead=kind==='fire'?.028:0,times=Array.from({length:source.frames},(_,i)=>lead+i/source.fps),tracks=[];
    if(lead)times.unshift(0);
    for(const t of source.tracks){const b=bones[t.bone];if(!b)continue;
      tracks.push(new T.VectorKeyframeTrack(`${b.uuid}.position`,times,lead?[...b.position.toArray(),...t.positions]:t.positions));
      tracks.push(new T.QuaternionKeyframeTrack(`${b.uuid}.quaternion`,times,lead?[...b.quaternion.toArray(),...t.quaternions]:t.quaternions));
    }
    if(!tracks.length)throw new Error(`GNTP ${weapon} has no matching bones`);
    clips[kind]=new T.AnimationClip(source.name,source.duration+lead,tracks);
  }
  let magazine;model.traverse(o=>{if(o.isMesh&&o.name.startsWith('GN_Luger_Magazine_S0_Staticmesh'))magazine=o;});
  if(magazine&&bones.Magazine_Main){model.updateWorldMatrix(true,true);bones.Magazine_Main.attach(magazine);magazine.traverse(o=>o.visible=true);}
  const spare=model.getObjectByName('Animated reload spare magazine');if(spare)spare.visible=false;
  const mixer=new T.AnimationMixer(model),rest=Object.values(bones).map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
  const actions=Object.fromEntries(Object.entries(clips).map(([k,c])=>{const a=mixer.clipAction(c).setLoop(T.LoopOnce,1);a.clampWhenFinished=true;return[k,a];}));
  let active=null,fireAge=Infinity;
  const restore=()=>{root.userData.resetReloadContact?.();mixer.stopAllAction();for(const {b,p,q,s} of rest){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}if(spare)spare.visible=false;active=null;};
  const diag={source:'GNTP',clips:Object.values(clips).map(c=>c.name),matchedBones:Object.fromEntries(Object.entries(clips).map(([k,c])=>[k,c.tracks.length/2]))};
  root.userData.animationDiagnostics=diag;
  root.userData.fire=()=>{fireAge=0;};
  root.userData.equip=()=>{};
  root.userData.updateAnimation=(dt,{visible}={})=>{if(!visible){restore();fireAge=Infinity;diag.active=null;diag.phase=null;}};
  root.userData.sampleOpponentMechanics=(dt,{visible,mode,phase=0,shotAge=null})=>{
    if(!visible){restore();fireAge=Infinity;diag.active=null;diag.phase=null;return;}
    fireAge=Number.isFinite(shotAge)?Math.max(0,shotAge):fireAge+dt;
    if(mode==='reload'||mode==='equip')fireAge=Infinity;
    const kind=clips[mode]?mode:fireAge<clips.fire?.duration?'fire':null;
    if(!kind){if(active)restore();diag.active=null;diag.phase=null;diag.magazine=bones.Magazine_Main?.position.toArray();diag.slide=bones.Slide?.position.toArray();return;}
    if(active!==kind){restore();actions[kind].reset().setEffectiveWeight(1).play();active=kind;}
    const a=actions[kind];a.enabled=true;a.paused=false;a.time=kind==='fire'?fireAge:T.MathUtils.clamp(phase,0,.999999)*clips[kind].duration;mixer.update(0);
    // This pack's Extra stays below the floor then overlaps Main; Main carries the visible reload.
    if(spare)spare.visible=false;
    diag.active=kind;diag.phase=a.time/clips[kind].duration;diag.magazine=bones.Magazine_Main?.position.toArray();diag.slide=bones.Slide?.position.toArray();
  };
  return root;
}
