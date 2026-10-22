import * as T from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/addons/loaders/GLTFLoader.js';
import {createNativeBoneClip} from '/psa-animation.mjs';
import {createMeshSpaceFireClip,createReloadTimeline,createSourceReloadTimeline} from '/weapon-feel.mjs';
import {WEAPONS,equipClipPhase} from '/weapons.mjs';

// Knife.glb preserves its grip origin; its blade is +Y. A fixed idle basis
// aligns the visible blade with the reference while native socket rotations
// continue to drive primary and secondary attacks.
// Fixed GN mesh coordinate conversion: +Y remains the blade axis, while
// turning its cross-section restores the serrated spine / cutting-edge side.
const nativeKnifeMeshBasis=()=>new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2)
  .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI));
export function getKnifeSocketTransform(camera,socket,basis=nativeKnifeMeshBasis()){
  socket.updateWorldMatrix(true,false);
  const position=camera.worldToLocal(socket.getWorldPosition(new T.Vector3()));
  const rotation=camera.getWorldQuaternion(new T.Quaternion()).invert().multiply(socket.getWorldQuaternion(new T.Quaternion()));
  rotation.multiply(basis);
  return {position,rotation};
}

export async function loadFirstPersonArms(camera) {
  const movementKinds=weapon=>['walkadd','runadd','jumpadd','jumplandadd',...(weapon==='ghost'?['crouchwalkadd']:['crouchin','crouchout'])];
  const entries=['vandal','ghost','knife'].flatMap(weapon=>[...(weapon==='knife'?['idlepose','fire','attack2','attack3','attack4','secondary','inspect','equip']:['idlepose','fire','equip','reload']),...movementKinds(weapon),...(weapon==='vandal'?['altidlepose']:[])].map(kind=>({weapon,kind})));
  const [gltf,...data]=await Promise.all([
    new GLTFLoader().loadAsync('/assets/packs/jett-arms.glb'),
    ...entries.map(async ({weapon,kind})=>{
      const name=weapon==='knife'?`knife-tactical-${({fire:'attack1',secondary:'attack-alt'})[kind]||kind}${['idlepose','equip','fire','attack2','attack3','attack4','inspect'].includes(kind)?'-modes':''}`:`${weapon}-${kind}`;
      const r=await fetch(`/assets/packs/animations/jett-${name}.json`);
      if(!r.ok)throw new Error(`Hand animation ${kind}: HTTP ${r.status}`);
      return r.json();
    })
  ]);
  const neutral=await (await fetch('/assets/packs/animations/jett-vandal-neutraldelta.json')).json();
  const sourceFor=(weapon,kind)=>data[entries.findIndex(e=>e.weapon===weapon&&e.kind===kind)];
  const model=gltf.scene,mount=new T.Group();mount.name='Jett original animated first-person arms';
  mount.rotation.y=Math.PI/2;mount.scale.setScalar(.82);mount.position.y=-1.62*.82;mount.visible=false;mount.add(model);camera.add(mount);
  model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});
  const mixer=new T.AnimationMixer(model),actions={vandal:{},ghost:{},knife:{}},firePools={vandal:[],vandalADS:[],ghost:[]},knifePools={};let matched=0;
  const motionActions={vandal:{},ghost:{},knife:{}},motionStates=new Map();
  const cloneNativeClip=clip=>{const clone=clip.clone();clone.userData={...clip.userData};return clone;};
  const withMechanicalLead=(clip,weapon)=>{
    const lead=weapon==='ghost'?.028:.020;
    // The paired FP/GN source clips have identical FPS and duration. Their
    // neutral-to-first-key lead must share a clock; fading weight while already
    // advancing FP source time skipped its opening recoil and led GN by 20/28ms.
    for(const track of clip.tracks){const initial=track.ValueTypeName==='quaternion'?[0,0,0,1]:[0,0,0];track.times=new Float32Array([0,...Array.from(track.times,t=>t+lead)]);track.values=new Float32Array([...initial,...track.values]);}
    clip.userData.nativeDuration=clip.duration;clip.userData.fireLeadIn=lead;clip.duration+=lead;return clip;
  };
  data.forEach((source,index)=>{
    if(source.format!=='three-bone-tracks-v1')throw new Error('Invalid hand animation format');
    const {weapon,kind}=entries[index];
    const clip=kind==='fire'&&weapon!=='knife'?withMechanicalLead(createMeshSpaceFireClip(model,source,neutral,sourceFor(weapon,'idlepose')),weapon):createNativeBoneClip(model,source);
    // Rifle/pistol Fire files are authored additive deltas (zero translations),
    // not a replacement skeletal pose. Keep their motion over the weapon idle.
    // Fire is converted from its component delta basis, compensating parent motion.
    const movement=movementKinds(weapon).includes(kind);
    // Shared movement/crouch PSA uses a neutral delta basis, unlike IdlePose.
    // Subtract its own first sample; using IdlePose would inject a large root rotation.
    if(movement)T.AnimationUtils.makeClipAdditive(clip,0);
    const action=mixer.clipAction(clip);
    matched=Math.max(matched,clip.userData.matchedBones.length);
    action.setLoop(['idlepose','altidlepose'].includes(kind)?T.LoopRepeat:T.LoopOnce,['idlepose','altidlepose'].includes(kind)?Infinity:1);action.clampWhenFinished=true;
    if(kind==='reload')action.timeScale=weapon==='ghost'?1:clip.duration/(WEAPONS[weapon].reload/1000);
    if(kind==='equip'&&weapon!=='knife')action.timeScale=clip.duration/(WEAPONS[weapon].visualEquip/1000);
    // Tactical source keys retain their original FPS, independently of attack cooldown.
    actions[weapon][kind]=action;
    if(movement){
      const loop=['walkadd','runadd','crouchwalkadd'].includes(kind);
      action.setLoop(loop?T.LoopRepeat:T.LoopOnce,loop?Infinity:1);
      motionActions[weapon][kind]=action;motionStates.set(action,{weight:0,age:0,started:false});
    }
    if(weapon==='knife'&&['fire','attack2','attack3','attack4','secondary'].includes(kind)){
      const alternate=mixer.clipAction(cloneNativeClip(clip));alternate.setLoop(T.LoopOnce,1);alternate.clampWhenFinished=true;
      knifePools[kind]=[action,alternate];
    }
    if(kind==='fire'&&weapon!=='knife'){
      const alternate=mixer.clipAction(cloneNativeClip(clip));alternate.setLoop(T.LoopOnce,1);alternate.clampWhenFinished=true;
      firePools[weapon].push(action,alternate);
      if(weapon==='vandal'){
        const adsClip=withMechanicalLead(createMeshSpaceFireClip(model,source,neutral,sourceFor('vandal','altidlepose')),'vandal');
        for(let i=0;i<2;i++){const a=mixer.clipAction(i?cloneNativeClip(adsClip):adsClip);a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;firePools.vandalADS.push(a);}
      }
    }
  });
  let fireBaseTransition=null;
  const fireEnvelopes=new Map(),smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const reloadTimeline=createReloadTimeline(),ghostReloadTimeline=createSourceReloadTimeline();
  const allActions=[...new Set([...Object.values(actions).flatMap(Object.values),...Object.values(firePools).flat(),...Object.values(knifePools).flat()])];
  const retirements=new Map();
  const stopAction=action=>{action.stop().stopFading().stopWarping().setEffectiveWeight(0);retirements.delete(action);};
  const cancelFire=()=>{fireBaseTransition=null;for(const pool of Object.values(firePools))for(const action of pool)stopAction(action);fireEnvelopes.clear();};
  const retire=(action,duration)=>{action.fadeOut(duration);retirements.set(action,duration);};
  const cancelAll=()=>{fireBaseTransition=null;for(const action of allActions)stopAction(action);for(const state of motionStates.values())Object.assign(state,{weight:0,age:0,started:false});fireEnvelopes.clear();reloadTimeline.reset();ghostReloadTimeline.reset();active=null;activeAction=null;};
  const releaseFire=(action,duration)=>{const envelope=fireEnvelopes.get(action);if(envelope&&!envelope.release)envelope.release={age:0,weight:action.getEffectiveWeight(),duration:duration??envelope.releaseDuration};};
  let equipAge=0,knifeCombo=0,lastKnifeLight=-Infinity;
  let actionListener=null,active=null,activeAction=null,wasVisible=false,wasReload=false,currentWeapon='vandal',wasGrounded=true,wasCrouch=false;
  const triggerMotion=kind=>{const action=motionActions[currentWeapon][kind];if(!action)return;const state=motionStates.get(action);action.reset().setEffectiveWeight(state.weight).play();state.age=0;state.started=true;};
  const play=(kind,metadata={})=>{
    let next=actions[currentWeapon][kind];const idle=actions[currentWeapon].idlepose;
    const additive=kind==='fire'&&currentWeapon!=='knife';
    if(additive){
      if(currentWeapon==='ghost'&&active==='reload')ghostReloadTimeline.reset();
      const pool=firePools[currentWeapon==='vandal'&&currentAds>.5?'vandalADS':currentWeapon];
      next=pool.find(action=>!fireEnvelopes.has(action))||pool.find(action=>action!==activeAction)||next;
      if(activeAction&&activeAction!==next&&activeAction!==idle){
        if(fireEnvelopes.has(activeAction))releaseFire(activeAction);
        else retire(activeAction,.025);
      }
      if((active==='equip'||currentWeapon==='ghost'&&active==='reload')&&activeAction&&!fireEnvelopes.has(activeAction))fireBaseTransition={age:0,duration:.025};
      retirements.delete(idle);idle.stopFading().stopWarping();idle.enabled=true;idle.paused=false;idle.setEffectiveWeight(fireBaseTransition?0:1).play();
      // Keep the full original clip; short blending only prevents discontinuities on interruption.
      retirements.delete(next);next.stopFading().stopWarping().reset().setEffectiveTimeScale(1).setEffectiveWeight(0).play();
      // The clip itself contains the shared neutral-to-source lead. A second
      // weight ramp would attenuate its opening keys and desynchronize the hands.
      fireEnvelopes.set(next,{age:0,peak:1,attackDuration:.001,releaseAt:next.getClip().duration,releaseDuration:.025,release:null});
    }else{
      cancelFire();
      const previous=activeAction;
      if(currentWeapon==='knife'&&knifePools[kind])next=knifePools[kind].find(action=>action!==previous);
      retirements.delete(next);next.stopFading().stopWarping().reset().setEffectiveWeight(1).play();
      if(kind==='reload'){reloadTimeline.reset();ghostReloadTimeline.reset();next.setEffectiveTimeScale(currentWeapon==='ghost'?1:next.getClip().duration/(WEAPONS[currentWeapon].reload/1000));}
      if(previous&&previous!==next){if(!Object.values(firePools).some(pool=>pool.includes(previous)))retire(previous,.045);next.fadeIn(.045);}
      if(next!==idle)retire(idle,.045);
    }
    if(kind==='equip')equipAge=0;
    active=kind;activeAction=next;actionListener?.({kind,weapon:currentWeapon,...(Number.isFinite(metadata.reloadRemaining)?{reloadRemaining:metadata.reloadRemaining}:{}),...(Number.isFinite(metadata.equipElapsed)?{equipElapsed:metadata.equipElapsed}:{})});
  };
  const socket=model.getObjectByName('R_WeaponPoint');
  const idleSocketQuaternions={},leftGripReferences={};
  const leftHand=model.getObjectByName('L_Hand');
  const gripBones=['L_Shoulder','L_Elbow','L_Hand','L_Elbow_Skin_Ndl','L_HandTwist','L_Twist1','L_Twist2'].map(n=>model.getObjectByName(n)).filter(Boolean);
  let gripNative=null;
  const restoreLeftNative=()=>{if(gripNative){for(const [bone,q] of gripNative)bone.quaternion.copy(q);gripNative=null;}};
  const gripTarget=model.getObjectByName('L_Weapon_HandTarget'),gripBases={};
  const rightTarget=model.getObjectByName('R_Weapon_HandTarget');
  const rightBones=['R_Shoulder','R_Elbow','R_Hand','R_Elbow_Skin_Ndl','R_HandTwist','R_Twist1','R_Twist2'].map(n=>model.getObjectByName(n)).filter(Boolean);
  const rightReferences={};let rightNative=null;
  const captureRightReference=()=>model.getObjectByName('R_Hand').getWorldPosition(new T.Vector3()).sub(rightTarget.getWorldPosition(new T.Vector3())).applyQuaternion(rightTarget.getWorldQuaternion(new T.Quaternion()).invert());
  const restoreRightNative=()=>{if(rightNative){for(const [bone,q,position] of rightNative){bone.quaternion.copy(q);if(position)bone.position.copy(position);}rightNative=null;}};
  const captureTargetBasis=()=>socket.getWorldQuaternion(new T.Quaternion()).invert().multiply(gripTarget.getWorldQuaternion(new T.Quaternion()));
  const captureLeftGrip=()=>({position:socket.worldToLocal(leftHand.getWorldPosition(new T.Vector3())),rotation:socket.getWorldQuaternion(new T.Quaternion()).invert().multiply(leftHand.getWorldQuaternion(new T.Quaternion()))});
  for(const weapon of ['vandal','ghost','knife']){
    mixer.stopAllAction();actions[weapon].idlepose.reset().play();mixer.update(0);mount.updateWorldMatrix(true,true);
    if(weapon==='vandal'){leftGripReferences.hip=captureLeftGrip();gripBases.hip=captureTargetBasis();rightReferences.hip=captureRightReference();}
    if(weapon==='ghost'){
      leftGripReferences.ghost=captureLeftGrip();gripBases.ghost=captureTargetBasis();
      // The supplied idle places this authored effector at the right wrist.
      // Keep its tiny calibrated offset, rather than substituting a GN helper.
      rightReferences.ghost=captureRightReference();
    }
    idleSocketQuaternions[weapon]=camera.getWorldQuaternion(new T.Quaternion()).invert().multiply(socket.getWorldQuaternion(new T.Quaternion()));
  }
  // The converted rifle socket's +Z points along the barrel, +X down and +Y
  // left. The mounted rifle uses -Z forward and +Y up. Keep this authored basis
  // instead of cancelling the entire idle quaternion (which loses its yaw).
  // Its GN Left_Hand_Target then coincides with FP L_Weapon_HandTarget; the
  // separate L_Hand offset is intentional and must not be used as the target.
  // Calibrate once in idle camera space, then inherit every native attack's
  // socket rotation. Never force the blade toward a camera direction per frame.
  const knifeSocketBasis=nativeKnifeMeshBasis();
  const rifleSocketBasis=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(
    new T.Vector3(0,-1,0),new T.Vector3(-1,0,0),new T.Vector3(0,0,-1)));
  let currentAds=0,renderedAdsWeight=0,adsRelease=null;
  // Sample the full native alternate idle before calibration. Directional AltAim
  // clips are neutral-basis deltas, not complete poses; they remain lab-only.
  mixer.stopAllAction();actions.vandal.altidlepose.reset().setEffectiveWeight(1).play();mixer.update(0);mount.updateWorldMatrix(true,true);
  leftGripReferences.ads=captureLeftGrip();gripBases.ads=captureTargetBasis();rightReferences.ads=captureRightReference();
  const adsSocketPosition=camera.worldToLocal(socket.getWorldPosition(new T.Vector3()));
  const adsSocketRotation=camera.getWorldQuaternion(new T.Quaternion()).invert().multiply(socket.getWorldQuaternion(new T.Quaternion())).multiply(rifleSocketBasis);
  // Front-sight top measured from the actual supplied GN mesh vertices in
  // mounted rifle units (paired x=+/-0.0033457m, z span -0.65285..-0.66266m).
  // This geometry landmark is not an original-game ADS camera marker.
  // The reference video places the physical post BELOW the screen-space ADS
  // reticle. Fit the whole arms+gun mount to the recorded sight projection. The old stock crossed the
  // camera view; retain its original scale and calibrate depth independently.
  const nativeAdsSight=new T.Vector3(0,.1646436304,-.6577520669).multiplyScalar(.82).applyQuaternion(adsSocketRotation).add(adsSocketPosition);
  const adsDepth=.17,adsPostScreenY=.5833333333,adsVerticalFov=62.166779729;
  const adsPostCameraY=-(adsPostScreenY*2-1)*(-(nativeAdsSight.z+adsDepth))*Math.tan(T.MathUtils.degToRad(adsVerticalFov/2));
  const nativeAdsOffset=new T.Vector3(-nativeAdsSight.x,adsPostCameraY-nativeAdsSight.y,adsDepth);
  const adsPerspectivePivot=nativeAdsSight.clone().add(nativeAdsOffset);
  // Shared camera-space transform fits the recorded near-end perspective,
  // keeping the hip front post at (.618,.539), rather than scaling the gun alone.
  // Move the shared rig toward the camera while preserving the front-post ray.
  // This fits the supplied 17-17-10 recording's lower glove/near-end silhouette.
  const hipViewmodelOffset=new T.Vector3(.04941184,-.05401086,.205);
  const hipPerspectivePivot=new T.Vector3(.17542869,-.03261366,-.55487778);
  const knifeGripOffset=new T.Vector3();
  const knifeViewmodelOffset=new T.Vector3(0,-.06,.10);
  // Fixed shared arms+gun perspective fit against the user's 1920x1080 Ghost
  // idle recording at 10s. Keep source rig, grip frame, scales and world FOV.
  // Silhouette landmarks are hand-read; this is a bounded fit, not a 1:1 claim.
  const ghostViewmodelOffset=new T.Vector3(.0222129834,-.0387203692,.1143434062);
  const ghostPerspectiveRotation=new T.Quaternion().setFromEuler(new T.Euler(-.0161561493,-.0807580118,-.1059184864,'ZYX'));
  // Tactical already contains the authored hand pose. Never alter individual bones.
  const restoreKnifeNative=()=>{};
  const applyKnifeHandPose=()=>{};
  mixer.stopAllAction();
  const controller={mount,model,socket,diagnostics:{matchedBones:matched,active:null,fireBlend:'native component-space conversion over hip / ADS base; complete native Fire keys'},
    setActionListener(listener){actionListener=listener;},
    getNativeAdsOffset(){return nativeAdsOffset.clone();},
    getHipViewmodelOffset(){return hipViewmodelOffset.clone();},
    getViewmodelOffset(weight=renderedAdsWeight){return hipViewmodelOffset.clone().lerp(nativeAdsOffset,Math.max(0,Math.min(1,weight)));},
    getViewmodelRotation(weight=renderedAdsWeight){
      const w=Math.max(0,Math.min(1,weight));
      return new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-.05).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-.025)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-.17)).slerp(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-.045),w);
    },
    getViewmodelPivot(weight=renderedAdsWeight){return hipPerspectivePivot.clone().lerp(adsPerspectivePivot,Math.max(0,Math.min(1,weight)));},
    applyViewmodelPose(weight=renderedAdsWeight){
      mount.position.add(this.getViewmodelOffset(weight));
      const rotation=this.getViewmodelRotation(weight),pivot=this.getViewmodelPivot(weight);
      mount.position.sub(pivot).applyQuaternion(rotation).add(pivot);
      mount.quaternion.premultiply(rotation);
    },
    getKnifeViewmodelOffset(){return knifeViewmodelOffset.clone();},
    getKnifeGripOffset(){return knifeGripOffset.clone();},
    applyKnifeHandPose,
    restoreKnifeHandPose:restoreKnifeNative,
    getGhostViewmodelOffset(){return ghostViewmodelOffset.clone();},
    getGhostViewmodelRotation(){return ghostPerspectiveRotation.clone();},
    applyGhostViewmodelPose(){
      // Rotate the entire shared mount around the camera origin before the
      // native right solve, weapon attachment and native left grip correction.
      mount.position.applyQuaternion(ghostPerspectiveRotation).add(ghostViewmodelOffset);
      mount.quaternion.premultiply(ghostPerspectiveRotation);
    },
    equip(){if(mount.visible&&!wasReload)play('equip');},
    playKnifePreview(kind){if(currentWeapon==='knife'&&mount.visible){play(kind);this.diagnostics.lastAttackClip=actions.knife[kind].getClip().name;}},
    inspect(){if(currentWeapon==='knife'&&mount.visible&&!wasReload)play('inspect');},
    fire(attack='primary'){if(mount.visible&&!wasReload){
      let kind='fire';
      if(currentWeapon==='knife'){
        if(attack==='secondary'){kind='secondary';knifeCombo=0;}
        else{const now=performance.now();if(now-lastKnifeLight>1100)knifeCombo=0;kind=['fire','attack2','attack3'][knifeCombo++%3];lastKnifeLight=now;}
      }
      this.diagnostics.lastAttack=kind;this.diagnostics.lastAttackClip=actions[currentWeapon][kind].getClip().name;play(kind);
    }},
    update(dt,{visible=false,reloading=false,weapon='vandal',speed=0,grounded=true,crouch=false,ads=0,reloadRemaining,equipElapsed}={}){
      restoreRightNative();restoreLeftNative();restoreKnifeNative();
      if(this.diagnostics.gripConstraint)this.diagnostics.gripConstraint.active=false;
      if(this.diagnostics.rightGrip)this.diagnostics.rightGrip.active=false;
      mount.visible=visible;
      const changed=weapon!==currentWeapon;
      if(changed){knifeCombo=0;lastKnifeLight=-Infinity;cancelAll();}
      currentWeapon=weapon;
      const expired=reloading&&Number.isFinite(reloadRemaining)&&reloadRemaining<=0;
      reloading=!!reloading&&!expired&&!!actions[weapon].reload;
      currentAds=Math.max(0,Math.min(1,Number(ads)||0));
      if(changed||!visible){for(const action of Object.values(motionActions[weapon])){action.stop();Object.assign(motionStates.get(action),{weight:0,age:0,started:false});}}
      const entering=visible&&(!wasVisible||changed);
      if(entering){
        if(reloading){cancelAll();play('reload',{reloadRemaining});}
        else if(expired)play('idlepose');
        else if(Number.isFinite(equipElapsed)){
          cancelAll();
          if(equipElapsed>=WEAPONS[weapon].visualEquip/1000)play('idlepose');
          else {play('equip',{equipElapsed});equipAge=equipElapsed;activeAction.stopFading();activeAction.time=(weapon==='knife'?equipElapsed/(WEAPONS.knife.visualEquip/1000):equipClipPhase(weapon,equipElapsed))*activeAction.getClip().duration;activeAction.setEffectiveTimeScale(0);}
        }else play('equip');
      }else if(reloading&&(!wasReload||active!=='reload')&&visible)play('reload',{reloadRemaining});
      else if(!reloading&&wasReload&&visible&&!changed&&!(weapon==='ghost'&&active==='reload')){
        if(expired){cancelAll();play('idlepose');}
        else play('idlepose');
      }
      if(!visible)cancelAll();
      const ghostSource=visible&&active==='reload'&&weapon==='ghost'?ghostReloadTimeline.sample(activeAction.getClip().duration,WEAPONS.ghost.reload/1000,{dt,mechanical:reloading,remaining:reloadRemaining}):null;
      const deadline=visible&&active==='reload'&&weapon!=='ghost'?reloadTimeline.sample(WEAPONS[weapon].reload/1000,reloadRemaining,activeAction.time/activeAction.getClip().duration*WEAPONS[weapon].reload/1000):null;
      if(active==='reload'){
        if(ghostSource){activeAction.time=ghostSource.sourceSeconds;activeAction.paused=false;activeAction.setEffectiveTimeScale(0);}
        else if(deadline){activeAction.time=deadline.phase*activeAction.getClip().duration;activeAction.paused=false;activeAction.setEffectiveTimeScale(0);}
        else activeAction.setEffectiveTimeScale(activeAction.getClip().duration/(WEAPONS[weapon].reload/1000));
      }
      for(const [action,remaining] of retirements){const next=remaining-Math.max(0,dt);if(next<=0)stopAction(action);else retirements.set(action,next);}
      for(const [action,envelope] of fireEnvelopes){
        envelope.age+=Math.max(0,dt);
        // Carry the crossed release boundary within this frame, so a20FPS
        // frame doesn't postpone the return envelope by another50ms.
        if(!envelope.release&&(action.paused||envelope.age>=envelope.releaseAt)){
          envelope.release={age:Math.max(0,envelope.age-envelope.releaseAt)-dt,weight:envelope.peak*smooth(envelope.releaseAt/envelope.attackDuration),duration:envelope.releaseDuration};
        }
        if(envelope.release){
          const r=envelope.release;r.age+=dt;action.setEffectiveWeight(r.weight*(1-smooth(r.age/r.duration)));
          if(r.age>=r.duration){
            stopAction(action);fireEnvelopes.delete(action);
            if(action===activeAction&&active==='fire'){
              active='idlepose';activeAction=actions[currentWeapon].idlepose;
              retirements.delete(activeAction);activeAction.stopFading().stopWarping();activeAction.enabled=true;activeAction.paused=false;activeAction.setEffectiveWeight(1).play();
            }
          }
        }else {action.setEffectiveWeight(envelope.peak*smooth(envelope.age/envelope.attackDuration));}
      }
      const motionAllowed=visible&&!reloading&&(active==='idlepose'||active==='fire'&&weapon!=='knife');
      if(motionAllowed&&!changed&&wasVisible){
        if(wasGrounded&&!grounded){triggerMotion('jumpadd');motionStates.get(motionActions[weapon].jumplandadd).started=false;}
        if(!wasGrounded&&grounded){triggerMotion('jumplandadd');motionStates.get(motionActions[weapon].jumpadd).started=false;}
        if(crouch!==wasCrouch)triggerMotion(crouch?'crouchin':'crouchout');
      }
      if(motionAllowed&&crouch&&motionActions[weapon].crouchin&&!motionStates.get(motionActions[weapon].crouchin).started)triggerMotion('crouchin');
      const motionScale=(1-Math.max(0,Math.min(1,ads))*.85)*(active==='fire'?.5:1);
      const moving=Math.max(0,Number(speed)||0),run=Math.max(0,Math.min(1,(moving-3.4)/2));
      for(const [action,state] of motionStates){
        const kind=Object.entries(motionActions[weapon]).find(([,a])=>a===action)?.[0];
        let target=0;
        if(!motionAllowed&&!['walkadd','runadd','crouchwalkadd'].includes(kind))state.started=false;
        if(kind&&motionAllowed){
          if(['walkadd','runadd','crouchwalkadd'].includes(kind)&&grounded&&moving>.05){
            const amount=Math.min(1,moving/1.5);
            const base=kind==='runadd'?.42:kind==='crouchwalkadd'?.14:.28;
            target=base*amount*(kind==='runadd'?run:kind==='crouchwalkadd'?(crouch?1:0):crouch&&weapon==='ghost'?0:1-run);
          }else if(state.started){
            state.age+=dt;const duration=action.getClip().duration/action.timeScale;
            if(kind==='crouchin'&&crouch)target=.12;
            else target=.12*(1-smooth((state.age-(duration-.12))/.12));
          }
          target*=motionScale;
        }
        const response=target>state.weight?.10:motionAllowed?.12:.035;
        state.weight+=(target-state.weight)*(1-Math.exp(-Math.max(0,dt)/response));
        if(state.weight<.0001&&target===0){state.weight=0;action.stop();if(!['walkadd','runadd','crouchwalkadd'].includes(kind))state.started=false;}
        else {
          const loop=['walkadd','runadd','crouchwalkadd'].includes(kind);
          const duration=action.getClip().duration;
          const phase=(action.time+Math.max(0,dt)*action.timeScale)%duration;
          // Some supplied locomotion loops have unequal endpoints. Blend their
          // boundary through neutral additive weight without changing native keys.
          const seam=loop?smooth(Math.min(phase,duration-phase)/Math.min(.05,duration*.15)):1;
          action.enabled=true;action.setEffectiveWeight(state.weight*seam).play();
        }
      }
      wasGrounded=grounded;wasCrouch=crouch;
      wasVisible=visible;wasReload=visible&&reloading;
      const nativeAdsAllowed=visible&&weapon==='vandal'&&!reloading&&(active==='idlepose'||active==='fire');
      if(nativeAdsAllowed){renderedAdsWeight=currentAds;adsRelease=null;}
      else if(!visible||changed||weapon!=='vandal'){renderedAdsWeight=0;adsRelease=null;}
      else if(renderedAdsWeight>0){
        adsRelease ||= {age:0,weight:renderedAdsWeight};
        adsRelease.age+=Math.max(0,dt);
        renderedAdsWeight=adsRelease.weight*Math.max(0,1-adsRelease.age/.08);
      }
      let fireBaseWeight=1;
      if(fireBaseTransition){fireBaseTransition.age+=Math.max(0,dt);fireBaseWeight=smooth(fireBaseTransition.age/fireBaseTransition.duration);if(fireBaseTransition.age>=fireBaseTransition.duration)fireBaseTransition=null;}
      const nativeAdsWeight=renderedAdsWeight;
      const nativeAds=actions.vandal.altidlepose;
      if(nativeAdsWeight>0){
        retirements.delete(nativeAds);nativeAds.stopFading().stopWarping();nativeAds.enabled=true;nativeAds.paused=true;nativeAds.time=0;nativeAds.setEffectiveWeight(nativeAdsWeight*fireBaseWeight).play();
        if(nativeAdsAllowed){actions.vandal.idlepose.enabled=true;actions.vandal.idlepose.setEffectiveWeight((1-nativeAdsWeight)*fireBaseWeight).play();}
      }else {stopAction(nativeAds);if(nativeAdsAllowed)actions.vandal.idlepose.setEffectiveWeight(fireBaseWeight);}
      if(currentWeapon==='ghost'&&active==='fire')actions.ghost.idlepose.setEffectiveWeight(fireBaseWeight);
      if(active==='equip'&&currentWeapon==='knife'&&activeAction)activeAction.setEffectiveTimeScale(entering&&Number.isFinite(equipElapsed)?0:activeAction.getClip().duration/(WEAPONS.knife.visualEquip/1000));
      if(active==='equip'&&currentWeapon!=='knife'&&activeAction&&dt>0&&!(entering&&Number.isFinite(equipElapsed))){
        const nextAge=equipAge+dt;
        activeAction.setEffectiveTimeScale((equipClipPhase(currentWeapon,nextAge)+(nextAge>=WEAPONS[currentWeapon].visualEquip/1000?1e-7:0)-equipClipPhase(currentWeapon,equipAge))*activeAction.getClip().duration/dt);
        equipAge=nextAge;
      }
      mixer.update(dt);
      if(ghostSource?.finished&&!reloading){play('idlepose');mixer.update(0);}
      if(activeAction?.paused&&!reloading&&active!=='idlepose'){
        if(active==='fire'&&currentWeapon!=='knife'){
          releaseFire(activeAction);active='idlepose';activeAction=actions[currentWeapon].idlepose;
          retirements.delete(activeAction);activeAction.stopFading().stopWarping();activeAction.enabled=true;activeAction.paused=false;activeAction.setEffectiveWeight(1).play();
          mixer.update(0);
        }else play('idlepose');
      }
      // A completed Fire/equip can promote idle after the mixer update. Restore
      // the base-pose weights immediately so no one-frame hip pose leaks in.
      if(nativeAdsAllowed&&nativeAdsWeight>0){actions.vandal.idlepose.setEffectiveWeight((1-nativeAdsWeight)*fireBaseWeight);nativeAds.setEffectiveWeight(nativeAdsWeight*fireBaseWeight);mixer.update(0);}
      // Source keys are sampled first. Gun Fire contact constraints are applied
      // after the shared viewmodel transform; Tactical remains native.
      mount.updateWorldMatrix(true,true);
      const leftIk={active:false,reason:'native source hand motion'};
      this.diagnostics.leftHandIk=leftIk;
      this.diagnostics.nativeAds={clip:actions.vandal.altidlepose.getClip().name,weight:nativeAdsWeight,allowed:nativeAdsAllowed,releasing:!!adsRelease,offset:nativeAdsOffset.toArray(),geometryFrontSight:nativeAdsSight.toArray(),sightLocal:[0,.1646436304,-.6577520669]};
      this.diagnostics.active=active;this.diagnostics.weapon=currentWeapon;this.diagnostics.time=activeAction?.time||0;this.diagnostics.phase=activeAction?Math.min(1,activeAction.time/activeAction.getClip().duration):0;
      this.diagnostics.weaponPoint=socket.getWorldPosition(new T.Vector3()).toArray();
      this.diagnostics.fireEnvelopes=[...fireEnvelopes.values()].map(e=>({age:e.age,returning:!!e.release,returnTime:e.release?.age||0}));
      this.diagnostics.reloadPhase=active==='reload'?activeAction.time/activeAction.getClip().duration:null;this.diagnostics.reloadDeadlineDriven=!!deadline||!!ghostSource?.deadlineDriven;this.diagnostics.reloadRemaining=Number.isFinite(reloadRemaining)?reloadRemaining:null;
      this.diagnostics.reloadCosmetic=active==='reload'&&currentWeapon==='ghost'&&!reloading;this.diagnostics.reloadSourceDuration=currentWeapon==='ghost'?actions.ghost.reload.getClip().duration:null;
      this.diagnostics.actions=allActions.map(action=>({name:action.getClip().name,scheduled:action.isScheduled(),running:action.isRunning(),enabled:action.enabled,paused:action.paused,weight:action.getEffectiveWeight(),time:action.time,timeScale:action.getEffectiveTimeScale(),additive:action.blendMode===T.AdditiveAnimationBlendMode,firePool:Object.entries(firePools).find(([,pool])=>pool.includes(action))?.[0]||null,fireLeadIn:action.getClip().userData?.fireLeadIn||0,nativeSourceTime:Math.max(0,action.time-(action.getClip().userData?.fireLeadIn||0)),retiring:retirements.has(action)}));
      this.diagnostics.motion={speed:moving,grounded,crouch,ads,allowed:motionAllowed,weights:Object.fromEntries(Object.entries(motionActions[weapon]).map(([kind,a])=>[kind,motionStates.get(a).weight]))};
    },
    getWeaponPoint(){mount.updateWorldMatrix(true,true);return socket.getWorldPosition(new T.Vector3());},
    // Engineering reconstruction using original target/offset frames. Source clips remain untouched.
    applyNativeRightGrip(){
      const info=this.diagnostics.rightGrip={active:false,method:'authored right effector / no-stretch rotation solve'};
      if(currentWeapon==='knife'||!mount.visible||active!=='fire'||![...fireEnvelopes.keys()].some(a=>a.getEffectiveWeight()>1e-6))return;
      mount.updateWorldMatrix(true,true);
      const shoulder=model.getObjectByName('R_Shoulder'),elbow=model.getObjectByName('R_Elbow'),hand=model.getObjectByName('R_Hand');
      const pos=b=>b.getWorldPosition(new T.Vector3()),quat=b=>b.getWorldQuaternion(new T.Quaternion());
      const setWorld=(b,q)=>{b.quaternion.copy(quat(b.parent).invert().multiply(q));mount.updateWorldMatrix(true,true);};
      const a=pos(shoulder),b=pos(elbow),c=pos(hand),desiredQ=quat(hand);
      const distal=model.getObjectByName('R_Twist2');
      const distalNative=currentWeapon==='vandal'?{position:pos(distal),rotation:quat(distal)}:null;
      const reference=currentWeapon==='ghost'?rightReferences.ghost.clone():rightReferences.hip.clone().lerp(rightReferences.ads,renderedAdsWeight);
      const desired=pos(rightTarget).add(reference.applyQuaternion(quat(rightTarget)));
      const l1=a.distanceTo(b),l2=b.distanceTo(c),rawDistance=a.distanceTo(desired);
      if(rawDistance<1e-8){info.degenerate=true;return;}
      const axis=desired.clone().sub(a).normalize();
      const distance=T.MathUtils.clamp(rawDistance,Math.abs(l1-l2)+1e-6,l1+l2-1e-6);
      desired.copy(a).addScaledVector(axis,distance);
      Object.assign(info,{requestedMm:c.distanceTo(desired)*1000,clampResidualMm:Math.abs(rawDistance-distance)*1000});
      const plane=b.clone().sub(a).addScaledVector(axis,-b.clone().sub(a).dot(axis));
      if(plane.lengthSq()<1e-10){info.degenerate=true;return;}plane.normalize();
      rightNative=rightBones.map(bone=>[bone,bone.quaternion.clone(),bone.name==='R_Twist2'?bone.position.clone():null]);
      const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
      const desiredElbow=a.clone().addScaledVector(axis,along).addScaledVector(plane,height);
      const upperDelta=new T.Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(),desiredElbow.clone().sub(a).normalize());
      setWorld(shoulder,upperDelta.multiply(quat(shoulder)));
      const afterB=pos(elbow),afterC=pos(hand),lowerDelta=new T.Quaternion().setFromUnitVectors(afterC.clone().sub(afterB).normalize(),desired.clone().sub(afterB).normalize());
      const proxy=model.getObjectByName('R_Elbow_Skin_Ndl'),proxyQ=proxy?quat(proxy):null;
      setWorld(elbow,lowerDelta.clone().multiply(quat(elbow)));
      if(proxy)setWorld(proxy,lowerDelta.clone().multiply(proxyQ));
      const wristDelta=desiredQ.clone().multiply(quat(hand).invert());
      const twists=['R_Twist1','R_Twist2','R_HandTwist'].map(n=>model.getObjectByName(n)).filter(Boolean).map(bone=>({bone,q:quat(bone),fraction:T.MathUtils.clamp(pos(bone).distanceTo(pos(elbow))/l2,0,1)}));
      setWorld(hand,desiredQ);
      for(const t of twists)setWorld(t.bone,new T.Quaternion().slerp(wristDelta,t.fraction).multiply(t.q));
      if(distalNative){
        // This distal skin helper blends with hand/finger weights on the cuff.
        // Preserve its authored wrist-relative frame, rather than letting its
        // forearm pivot compress those mixed vertices after the arm solve.
        // Only this skin helper's local position changes; arm lengths and source
        // keys stay intact. It is restored before every subsequent mixer sample.
        const desiredDistal=distalNative.position.add(pos(hand).sub(c));
        distal.position.copy(distal.parent.worldToLocal(desiredDistal));
        setWorld(distal,distalNative.rotation);
        info.distalSkinHelper={name:distal.name,localOffsetMm:distal.position.distanceTo(rightNative.find(([bone])=>bone===distal)[2])*1000};
      }
      // Preserve source wrist orientation/finger keys. Reach is clamped, never
      // stretched: the supplied clips lack the original game's full IK graph.
      Object.assign(info,{active:true,wristErrorMm:pos(hand).distanceTo(desired)*1000,upperLengthErrorMm:Math.abs(pos(shoulder).distanceTo(pos(elbow))-l1)*1000,lowerLengthErrorMm:Math.abs(pos(elbow).distanceTo(pos(hand))-l2)*1000,wristRotationErrorRad:quat(hand).normalize().angleTo(desiredQ.clone().normalize())});
    },
    applyWeaponGrip(asset){
      const info=this.diagnostics.gripConstraint={active:false,method:'native marker rigid frame / rotation-only arm solve'};
      const walking=Object.entries(motionActions[currentWeapon]||{}).some(([kind,action])=>['walkadd','runadd','crouchwalkadd'].includes(kind)&&(motionStates.get(action)?.weight||0)>.0001);
      const held=currentWeapon==='vandal'&&(active==='idlepose'||active==='fire'&&walking);
      const firing=active==='fire'&&[...fireEnvelopes.keys()].some(a=>a.getEffectiveWeight()>1e-6);
      if(!mount.visible||(!held&&!firing)||currentWeapon==='knife'||!asset?.parent)return;
      let target=asset.userData.gripTarget;
      if(!target){asset.traverse(o=>{if(o.isBone&&/^Left_Hand_Target(?:_\d+)?$/.test(o.name))target??=o;});asset.userData.gripTarget=target;}
      if(!target||!gripTarget)return;
      mount.updateWorldMatrix(true,true);asset.updateWorldMatrix(true,true);
      gripNative=gripBones.map(b=>[b,b.quaternion.clone()]);
      const shoulder=model.getObjectByName('L_Shoulder'),elbow=model.getObjectByName('L_Elbow'),hand=leftHand;
      const pos=b=>b.getWorldPosition(new T.Vector3()),quat=b=>b.getWorldQuaternion(new T.Quaternion());
      const setWorld=(b,q)=>{b.quaternion.copy(quat(b.parent).invert().multiply(q));mount.updateWorldMatrix(true,true);};
      const a=pos(shoulder),b=pos(elbow),c=pos(hand),nativeQ=quat(hand),fp=pos(gripTarget),fpQ=quat(gripTarget);
      const relative=(currentWeapon==='ghost'?gripBases.ghost:gripBases.hip.clone().slerp(gripBases.ads,renderedAdsWeight)).clone();
      const desiredTargetQ=quat(asset.parent).multiply(rifleSocketBasis.clone().invert().multiply(relative));
      const delta=desiredTargetQ.clone().multiply(fpQ.clone().invert());
      // Holding contact comes from the original idle socket frame, not a new pose.
      // Fire keeps its authored moving marker; reload/equip never enter here.
      const reference=held?{position:leftGripReferences.hip.position.clone().lerp(leftGripReferences.ads.position,renderedAdsWeight),rotation:leftGripReferences.hip.rotation.clone().slerp(leftGripReferences.ads.rotation,renderedAdsWeight)}:null;
      const desired=held?socket.localToWorld(reference.position):pos(target).add(c.clone().sub(fp).applyQuaternion(delta));
      const desiredQ=held?quat(socket).multiply(reference.rotation):delta.clone().multiply(nativeQ);
      info.mode=held?'native idle contact':'native Fire marker';
      const l1=a.distanceTo(b),l2=b.distanceTo(c),distance=a.distanceTo(desired);
      Object.assign(info,{requestedMm:c.distanceTo(desired)*1000,extensionMarginMm:(l1+l2-distance)*1000});
      if(distance>=l1+l2-1e-6||distance<=Math.abs(l1-l2)+1e-6){restoreLeftNative();info.unreachable=true;return;}
      const axis=desired.clone().sub(a).normalize(),plane=b.clone().sub(a).addScaledVector(axis,-b.clone().sub(a).dot(axis));
      if(plane.lengthSq()<1e-10){restoreLeftNative();info.degenerate=true;return;}plane.normalize();
      const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
      const desiredElbow=a.clone().addScaledVector(axis,along).addScaledVector(plane,height);
      const upperDelta=new T.Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(),desiredElbow.clone().sub(a).normalize());
      setWorld(shoulder,upperDelta.multiply(quat(shoulder)));
      const afterB=pos(elbow),afterC=pos(hand),lowerBefore=quat(elbow);
      const lowerDelta=new T.Quaternion().setFromUnitVectors(afterC.clone().sub(afterB).normalize(),desired.clone().sub(afterB).normalize());
      const proxy=model.getObjectByName('L_Elbow_Skin_Ndl'),proxyQ=proxy?quat(proxy):null;
      setWorld(elbow,lowerDelta.clone().multiply(lowerBefore));
      if(proxy)setWorld(proxy,lowerDelta.clone().multiply(proxyQ));
      const wristDelta=desiredQ.clone().multiply(quat(hand).invert());
      const twistControls=['L_Twist1','L_Twist2','L_HandTwist'].map(n=>model.getObjectByName(n)).filter(Boolean).map(bone=>({bone,q:quat(bone),fraction:T.MathUtils.clamp(pos(bone).distanceTo(pos(elbow))/l2,0,1)}));
      setWorld(hand,desiredQ);
      // Distribute the wrist constraint along the original forearm controls at
      // their authored segment positions; preserve translations, lengths and finger keys.
      for(const t of twistControls)setWorld(t.bone,new T.Quaternion().slerp(wristDelta,t.fraction).multiply(t.q));
      Object.assign(info,{active:true,wristErrorMm:pos(hand).distanceTo(desired)*1000,upperLengthErrorMm:Math.abs(pos(shoulder).distanceTo(pos(elbow))-l1)*1000,lowerLengthErrorMm:Math.abs(pos(elbow).distanceTo(pos(hand))-l2)*1000});
    },
    getWeaponTransform(){
      mount.updateWorldMatrix(true,true);
      if(currentWeapon==='knife'){
        const transform=getKnifeSocketTransform(camera,socket,knifeSocketBasis);
        transform.position.add(knifeGripOffset.clone().multiplyScalar(.82).applyQuaternion(transform.rotation));
        return transform;
      }
      const position=camera.worldToLocal(socket.getWorldPosition(new T.Vector3()));
      const rotation=camera.getWorldQuaternion(new T.Quaternion()).invert().multiply(socket.getWorldQuaternion(new T.Quaternion()));
      if(currentWeapon==='vandal'||currentWeapon==='ghost')rotation.multiply(rifleSocketBasis);
      else rotation.multiply(idleSocketQuaternions[currentWeapon].clone().invert());
      // Preserve the authored socket basis throughout hip/ADS and actions.
      return {position,rotation};
    }
  };
  mixer.stopAllAction();activeAction=null;
  play('idlepose');mixer.update(0);mount.updateWorldMatrix(true,true);
  return controller;
}

