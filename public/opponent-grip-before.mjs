import * as T from '/vendor/three.module.js';
import {GLTFLoader} from '/vendor/addons/loaders/GLTFLoader.js';
import {createNativeBoneClip} from '/psa-animation.mjs';
import {loadImportedWeapon,visibleBounds} from '/imported-assets.mjs';
import {loadVandal} from '/vandal.mjs';
import {attachOpponentMechanics} from '/opponent-mechanics.mjs';
import {createOpponentLifecycle,OPPONENT_LIFECYCLE_ANIMATIONS} from '/opponent-lifecycle.mjs';
import {createOpponentCombat,OPPONENT_COMBAT_ANIMATIONS} from '/opponent-combat.mjs';
import {applyReloadContact,applyThirdPersonSupportGrip} from '/reload-contact.mjs';

const lowerBone=name=>/^(Splitter|Pelvis|[LR]_(Hip|Knee|Foot|Toe|Belt|Sash|IK_Foot))/.test(name);
export const OPPONENT_ANIMATIONS=['idle-lower','crouch-lower','jump-lower',...['walk','run','crouch-walk'].flatMap(mode=>['n','e','s','w'].map(d=>mode+'-'+d)),...['vandal','ghost','knife'].flatMap(w=>[w+'-upper',w+'-crouch-upper']),...OPPONENT_COMBAT_ANIMATIONS,...OPPONENT_LIFECYCLE_ANIMATIONS];
const tmp=new T.Vector3();
const updatePose=state=>{state.display.parent?.updateWorldMatrix(true,false);state.display.updateMatrixWorld(true);};
const saveAnimationPose=state=>{state.animationPose??=Object.values(state.bones).map(bone=>({bone,position:new T.Vector3(),quaternion:new T.Quaternion()}));for(const pose of state.animationPose){pose.position.copy(pose.bone.position);pose.quaternion.copy(pose.bone.quaternion);}};
function vertexBottom(samples){const updated=new Set();let bottom=Infinity;for(const sample of samples){if(!updated.has(sample.mesh.skeleton)){sample.mesh.skeleton.update();updated.add(sample.mesh.skeleton);}bottom=Math.min(bottom,sample.mesh.getVertexPosition(sample.index,tmp).applyMatrix4(sample.mesh.matrixWorld).y);}return bottom;}

export function buildOpponent({cosmeticRig=true}={}){
  const group=new T.Group();group.name='Network opponent';
  const placeholder=new T.Group();placeholder.name='Pending native opponent';placeholder.visible=false;group.add(placeholder);
  const weapon=new T.Object3D();weapon.position.set(.13,1.1,-.6);group.add(weapon);
  group.userData={cosmeticRig,status:'loading',rig:{weapon},diagnostics:{status:'loading',errors:[],clips:[],headHeight:0,footError:0},placeholder};
  group.userData.combat=createOpponentCombat(group,getOpponentMuzzle,switchLayer);
  group.userData.lifecycle=createOpponentLifecycle(group);
  let loading=null;
  group.userData.retryAssets=()=>{
    if(loading||group.userData.status==='ready')return loading||Promise.resolve(group);
    group.userData.combat.reset();group.userData.lifecycle.reset();
    for(const child of [...group.children])if(child.name==='Native animated Jett'){
      const resources=new Set();child.traverse(o=>{if(o.isMesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}}});
      group.remove(child);for(const resource of resources)resource.dispose();
    }
    group.userData.native=null;group.userData.status='loading';group.userData.diagnostics.status='loading';group.userData.diagnostics.errors=[];
    loading=loadOpponent(group).catch(error=>{group.userData.status='failed';group.userData.diagnostics.status='failed';group.userData.diagnostics.errors.push(String(error.message||error));return group;}).finally(()=>{loading=null;group.userData.onAssetsChanged?.();});
    return loading;
  };
  group.userData.readyPromise=group.userData.retryAssets();
  return group;
}

function makeClip(model,source,part){
  // Shared/Simple animation translations belong to its reference skeleton.
  // This supplied Jett skin has shorter shoulder offsets and nonzero twist
  // segment lengths. Skeleton translation retargeting preserves that actual
  // bind geometry while retaining every authored rotation and root/socket key.
  let bind=model.userData.tpSkinTranslationBind;
  if(!bind){
    const weighted=new Set();
    model.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const ids=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
      for(let i=0;i<ids.count;i++)for(let k=0;k<4;k++)if(weights.array[i*4+k]>1e-6)weighted.add(mesh.skeleton.bones[ids.array[i*4+k]]?.name);
    });
    // Unweighted joints such as Shoulder still position weighted twist children.
    model.traverse(bone=>{if(bone.isBone&&weighted.has(bone.name))for(let parent=bone.parent;parent?.isBone;parent=parent.parent)weighted.add(parent.name);});
    bind=new Map();model.traverse(bone=>{if(bone.isBone&&weighted.has(bone.name)&&!['Root','Skeleton','Splitter','Pelvis'].includes(bone.name))bind.set(bone.name,bone.position.toArray());});
    model.userData.tpSkinTranslationBind=bind;
  }
  const selected=part==='full'?source.tracks:source.tracks.filter(t=>lowerBone(t.bone)===(part==='lower'));
  const tracks=selected.map(track=>{
    const target=bind.get(track.bone);if(!target)return track;
    // Retarget only reference bone proportions; retain authored animated deltas.
    const first=track.positions.slice(0,3);
    return {...track,positions:track.positions.map((value,i)=>target[i%3]+value-first[i%3])};
  });
  const filtered={...source,tracks};
  return createNativeBoneClip(model,filtered);
}
// Shared PSA clips omit agent-specific shoulder-pad channels and leave some
// twist helpers at bind pose. Reconstruct only those skin helpers from the
// supplied bind relationship and authored arm/wrist transforms.
function captureSkinHelpers(model){
  model.updateMatrixWorld(true);const pads=[],twists=[];
  for(const side of ['L','R']){
    const shoulder=model.getObjectByName(side+'_Shoulder'),pad=model.getObjectByName(side+'_ShoulderPad');
    if(shoulder&&pad)pads.push({shoulder,pad,offset:shoulder.matrixWorld.clone().invert().multiply(pad.matrixWorld),desired:new T.Matrix4(),local:new T.Matrix4()});
    for(const [segment,end] of [['Shoulder','Elbow'],['Elbow','Hand']]){
      const parent=model.getObjectByName(side+'_'+segment),distal=model.getObjectByName(side+'_'+end);if(!parent||!distal)continue;
      const length=distal.position.length();
      for(const suffix of ['Twst1','Twst2','Twst3']){
        const bone=model.getObjectByName(side+'_'+segment+'_'+suffix);if(!bone||bone.parent!==parent)continue;
        twists.push({bone,distal,bind:bone.quaternion.clone(),distalBindInverse:distal.quaternion.clone().invert(),fraction:T.MathUtils.clamp(bone.position.y/length,0,1),delta:new T.Quaternion(),roll:new T.Quaternion(),partial:new T.Quaternion()});
      }
    }
  }
  return {pads,twists};
}
function applySkinHelpers(state){
  const helpers=state.skinHelpers;let driven=0;
  for(const item of helpers.twists){
    // Retain any authored twist channel; only fill unchanged bind placeholders.
    if(item.bone.quaternion.angleTo(item.bind)>.001)continue;
    item.delta.copy(item.distal.quaternion).multiply(item.distalBindInverse).normalize();
    const norm=Math.hypot(item.delta.y,item.delta.w);if(norm<1e-6)continue;
    item.roll.set(0,item.delta.y/norm,0,item.delta.w/norm);
    item.partial.identity().slerp(item.roll,item.fraction);
    item.bone.quaternion.copy(item.partial.multiply(item.bind));driven++;
  }
  updatePose(state);
  for(const item of helpers.pads){
    item.desired.multiplyMatrices(item.shoulder.matrixWorld,item.offset);
    item.local.copy(item.pad.parent.matrixWorld).invert().multiply(item.desired);
    item.local.decompose(item.pad.position,item.pad.quaternion,item.pad.scale);
    item.pad.updateWorldMatrix(false,true);
  }
  return {pads:helpers.pads.length,twists:driven,method:'original bind attachment / authored distal roll; no arm or wrist changes'};
}
async function loadOpponent(group){
  const [gltf,...sources]=await Promise.all([
    new GLTFLoader().loadAsync('/assets/packs/opponent-jett.glb'),
    ...OPPONENT_ANIMATIONS.map(async name=>{const response=await fetch('/assets/packs/animations/opponent-'+name+'.json');if(!response.ok)throw new Error('Opponent animation '+name+': HTTP '+response.status);return response.json();})
  ]);
  const display=new T.Group(),model=gltf.scene;display.name='Native animated Jett';display.add(model);model.rotation.y=Math.PI/2;const skinHelpers=captureSkinHelpers(model);skinHelpers.pads=skinHelpers.pads.filter(item=>!sources.some(source=>source.tracks.some(track=>track.bone===item.pad.name)));
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
  const mixer=new T.AnimationMixer(model),actions={},firePools={vandal:[],ghost:[]};
  sources.forEach((source,i)=>{
    const name=OPPONENT_ANIMATIONS[i],clip=makeClip(model,source,name.startsWith('death-')?'full':name.startsWith('hit-')||/^(vandal|ghost|knife)-/.test(name)?'upper':'lower'),combat=OPPONENT_COMBAT_ANIMATIONS.includes(name)||OPPONENT_LIFECYCLE_ANIMATIONS.includes(name),gunFire=/^(vandal|ghost)-fire$/.test(name);
    if(gunFire||name.startsWith('hit-'))T.AnimationUtils.makeClipAdditive(clip,0);
    const action=mixer.clipAction(clip).setLoop(combat?T.LoopOnce:T.LoopRepeat,combat?1:Infinity);action.clampWhenFinished=combat;actions[name]=action;
    if(gunFire){const other=mixer.clipAction(clip.clone()).setLoop(T.LoopOnce,1);other.clampWhenFinished=true;firePools[name.split('-')[0]]=[action,other];}
  });
  actions['idle-lower'].play();actions['vandal-upper'].play();mixer.update(0);display.updateMatrixWorld(true);
  // Normalize after applying native idle, not the source's taller bind pose.
  const bounds=visibleBounds(display),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  const scale=1.8/size.y;display.scale.setScalar(scale);
  model.position.set(-center.x,-bounds.min.y,-center.z);
  display.updateMatrixWorld(true);
  const bones={};model.traverse(o=>{if(o.isBone)bones[o.name]=o;});
  const head=bones.Head,feet=[bones.L_Foot,bones.R_Foot],splitter=bones.Splitter;
  const posedBounds=visibleBounds(display);
  const headTopOffset=posedBounds.max.y-head.getWorldPosition(new T.Vector3()).y;
  const footSoleOffset=Math.min(...feet.map(b=>b.getWorldPosition(new T.Vector3()).y))-posedBounds.min.y;
  const headTopOffsets={};
  for(const weapon of ['vandal','ghost','knife'])for(const crouch of [false,true]){
    mixer.stopAllAction();actions[crouch?'crouch-lower':'idle-lower'].reset().play();const name=weapon+(crouch?'-crouch-upper':'-upper');actions[name].reset().play();mixer.update(0);display.updateMatrixWorld(true);
    headTopOffsets[name]=visibleBounds(display).max.y-head.getWorldPosition(new T.Vector3()).y;
  }
  mixer.stopAllAction();actions['idle-lower'].reset().play();actions['vandal-upper'].reset().play();mixer.update(0);
  const clothVertices=[],soleVertices=[];
  model.traverse(o=>{if(!o.isSkinnedMesh)return;const indices=o.geometry.attributes.skinIndex,weights=o.geometry.attributes.skinWeight;for(let i=0;i<indices.count;i++)for(let k=0;k<4;k++)if(weights.array[i*4+k]>.5){const name=o.skeleton.bones[indices.array[i*4+k]]?.name;if(name==='R_Sash_01')clothVertices.push({mesh:o,index:i});if(/^[LR]_(Foot|Toe)$/.test(name))soleVertices.push({mesh:o,index:i});break;}});
  group.add(display);display.visible=false;
  group.userData.placeholder.visible=false;

  const state={model,display,mixer,skinHelpers,actions,firePools,bones,head,feet,splitter,headTopOffset,headTopOffsets,clothVertices,soleVertices,footSoleOffset,lower:'idle-lower',upper:'vandal-upper',weapon:'vandal',weaponModels:{},weaponHolders:{},lastGrounded:true,dead:false};
  saveAnimationPose(state);
  group.userData.diagnostics.clips=OPPONENT_ANIMATIONS;group.userData.diagnostics.scale=scale;
  group.userData.diagnostics.idleBounds={min:posedBounds.min.toArray(),max:posedBounds.max.toArray()};
  group.userData.diagnostics.matchedBones=sources.map((source,i)=>({name:OPPONENT_ANIMATIONS[i],count:source.tracks.filter(t=>bones[t.bone]).length}));
  // Finish idle-pose mount calibration before publishing the combat controller.
  await Promise.all(['vandal','ghost','knife'].map(kind=>{
    return (kind==='vandal'?loadVandal().then(async root=>{await attachOpponentMechanics(root,'vandal');return root;}):loadImportedWeapon(kind,{viewmodel:false}).then(async asset=>{if(kind==='ghost')await attachOpponentMechanics(asset.root,'ghost');return asset.root;})).then(weapon=>{
      const holder=new T.Group();holder.name='Opponent '+kind+' hand mount';
      // Calibrate against that weapon's authored idle hand pose before parenting.
      const previous=state.upper;mixer.stopAllAction();actions['idle-lower'].reset().play();actions[kind+'-upper'].reset().play();mixer.update(0);display.updateMatrixWorld(true);
      const socket=bones.R_WeaponPoint||bones.R_Hand;
      holder.quaternion.copy(socket.getWorldQuaternion(new T.Quaternion()).invert().multiply(group.getWorldQuaternion(new T.Quaternion())));
      // GNTP magazine paths and TP hands must inherit the same actor scale.
      holder.scale.setScalar(kind==='knife'?1/scale:1);
      if(kind==='knife'){
        // TP finger rows run along socket +Y (FP uses -X). Keep that authored
        // basis; center the grip between Index/Ring with its handle below guard.
        holder.quaternion.identity();
        const index=socket.worldToLocal(bones.R_Index1.getWorldPosition(new T.Vector3()));
        const ring=socket.worldToLocal(bones.R_Ring1.getWorldPosition(new T.Vector3()));
        holder.position.copy(index.add(ring).multiplyScalar(.5));
        holder.position.y+=.04/scale;holder.position.z=0;
        group.userData.diagnostics.knifeMount={basis:'TP socket +Y',offset:holder.position.toArray(),nativeGrip:true};
      }
      holder.add(weapon);socket.add(holder);
      // Native GN grip origin is retained; no compensating mesh-centre offset.
      if(kind==='ghost')group.userData.diagnostics.ghostMount={nativeGrip:!!weapon.userData.nativeGrip,rootScale:weapon.scale.toArray(),rootOffset:weapon.position.toArray()};
      weapon.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
      state.weaponModels[kind]=weapon;state.weaponHolders[kind]=holder;holder.visible=kind===state.weapon;
      mixer.stopAllAction();actions[state.lower].reset().play();actions[previous].reset().play();mixer.update(0);saveAnimationPose(state);display.updateMatrixWorld(true);
      group.userData.diagnostics.weapons=Object.keys(state.weaponModels);
    }).catch(error=>group.userData.diagnostics.errors.push(kind+': '+String(error.message||error)));
  }));
  if(Object.keys(state.weaponModels).length!==3)throw new Error('Opponent weapon resources incomplete');
  display.visible=true;group.userData.native=state;group.userData.status='ready';group.userData.diagnostics.status='ready';
  return group;
}

function switchLayer(state,key,next,fade=.09){
  if(state[key]===next)return;
  const old=state.actions[state[key]],action=state.actions[next];
  action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).fadeIn(fade).play();old?.fadeOut(fade);state[key]=next;
}
function movementDirection(yaw,vx=0,vz=0){
  const right=vx*Math.cos(yaw)-vz*Math.sin(yaw),forward=-vx*Math.sin(yaw)-vz*Math.cos(yaw);
  return Math.abs(forward)>=Math.abs(right)?forward>=0?'n':'s':right>=0?'e':'w';
}

// CCD keeps the original ankle targets planted when deepening the native crouch
// to the server's 1.2 m profile. The body/face is not uniformly squashed.
function plantLeg(bones,side,target){
  const foot=bones[side+'_Foot'],knee=bones[side+'_Knee'],hip=bones[side+'_Hip'];if(!foot||!knee||!hip)return;
  const footRotation=foot.getWorldQuaternion(new T.Quaternion());
  const a=hip.getWorldPosition(new T.Vector3()),b=knee.getWorldPosition(new T.Vector3()),c=foot.getWorldPosition(new T.Vector3());
  const first=a.distanceTo(b),second=b.distanceTo(c),toward=target.clone().sub(a),distance=T.MathUtils.clamp(toward.length(),.001,first+second-.00001);toward.normalize();
  const bend=b.clone().sub(a).addScaledVector(toward,-b.clone().sub(a).dot(toward));if(bend.lengthSq()<1e-8)bend.set(0,0,-1);bend.normalize();
  const along=(first*first-second*second+distance*distance)/(2*distance),out=Math.sqrt(Math.max(0,first*first-along*along));
  const desiredKnee=a.clone().addScaledVector(toward,along).addScaledVector(bend,out);
  const rotate=(joint,from,to)=>{const delta=new T.Quaternion().setFromUnitVectors(from.normalize(),to.normalize()),parent=joint.parent.getWorldQuaternion(new T.Quaternion());joint.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));joint.updateWorldMatrix(true,true);};
  rotate(hip,b.clone().sub(a),desiredKnee.clone().sub(a));
  const origin=knee.getWorldPosition(new T.Vector3());rotate(knee,foot.getWorldPosition(new T.Vector3()).sub(origin),target.clone().sub(origin));
  // Preserve authored ankle rotation so planted boots do not tilt into the floor.
  foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(footRotation));foot.updateWorldMatrix(true,true);
}

export function getOpponentHitboxPose(group){
 const state=group.userData.native;if(!state)return null;group.updateMatrixWorld(true);
 const inverse=group.matrixWorld.clone().invert(),pose={};
 for(const name of ['Head','Neck','Splitter','Spine1','Spine2','Spine3','Spine4',...['L','R'].flatMap(s=>['Shoulder','Elbow','Hand','Hip','Knee','Foot','Toe'].map(b=>s+'_'+b))])if(state.bones[name])pose[name]=state.bones[name].getWorldPosition(new T.Vector3()).applyMatrix4(inverse).toArray();
 return pose;
}
export function animateOpponent(group,{crouch=false,speed=0,time=0,grounded=true,yaw=0,pitch=0,weapon='vandal',dead=false,dt=1/60,vx=0,vz=0,reloadRemaining=0,equipRemaining=0,spawnEpoch,respawnAt=0,serverNow=0,deathPart,hitboxMotion,actionStartedAt=null,fireStartedAt=null,snapshotCombat=null}={}){
  const state=group.userData.native;
  if(!state)return;
  if(!dead)for(const pose of state.animationPose){pose.bone.position.copy(pose.position);pose.bone.quaternion.copy(pose.quaternion);}
  state.dead=dead;state.weapon=weapon;
  if(group.userData.lifecycle.before(dt,{dead,crouch,spawnEpoch,respawnAt,serverNow,deathPart})){
    updatePose(state);
    if(crouch&&group.userData.diagnostics.deathBlend<1&&state.deathFootTargets){plantLeg(state.bones,'L',state.deathFootTargets[0]);plantLeg(state.bones,'R',state.deathFootTargets[1]);updatePose(state);}
    const floor=group.getWorldPosition(new T.Vector3()).y,bottom=visibleBounds(state.display).min.y;
    if(bottom<floor){state.display.position.y+=floor-bottom;updatePose(state);}
    group.userData.diagnostics.weapon=weapon;return;
  }
  const direction=movementDirection(yaw,vx,vz);
  let lower=!grounded?'jump-lower':speed>.25?(crouch?'crouch-walk-':speed>3.4?'run-':'walk-')+direction:crouch?'crouch-lower':'idle-lower';
  if(hitboxMotion?.key?.startsWith(weapon+'|')&&state.actions[hitboxMotion.key.split('|')[1]])lower=hitboxMotion.key.split('|')[1];
  const idleUpper=weapon+(crouch?'-crouch-upper':'-upper');
  switchLayer(state,'lower',lower);
  if(snapshotCombat)group.userData.combat.syncSnapshot(snapshotCombat,serverNow);
  const upper=group.userData.combat.before(dt,{weapon,dead,crouch,reloadRemaining,equipRemaining,serverNow,actionStartedAt,fireStartedAt});
  state.headTopOffset=state.headTopOffsets[idleUpper]||state.headTopOffset;
  if(hitboxMotion?.previousKey?.startsWith(weapon+'|')&&hitboxMotion.blend<1){const oldUpper=weapon+(hitboxMotion.previousKey.includes('|crouch')?'-crouch-upper':'-upper'),oldOffset=state.headTopOffsets[oldUpper];state.headTopOffset=oldOffset+(state.headTopOffset-oldOffset)*hitboxMotion.blend;}
  state.actions[lower].setEffectiveTimeScale(lower.startsWith('run')?Math.max(.6,speed/5.4):lower.startsWith('walk')?Math.max(.5,speed/2.7):lower.startsWith('crouch-walk')?Math.max(.5,speed/3.2):1);
  if(hitboxMotion?.key===weapon+'|'+lower){
    const previous=hitboxMotion.previousKey?.split('|')[1],blend=Math.max(0,Math.min(1,hitboxMotion.blend??1));
    for(const name of OPPONENT_ANIMATIONS.slice(0,15)){
      const action=state.actions[name];
      if(name!==lower&&(name!==previous||blend>=1)){action.stop();continue;}
      action.play().stopFading().setEffectiveTimeScale(0).setEffectiveWeight(name===lower?(previous===lower?1:blend):1-blend);
      action.time=(name===lower?hitboxMotion.phase:hitboxMotion.previousPhase)*action.getClip().duration;
    }
    if(upper===idleUpper&&!group.userData.combat.isReturning()&&blend<1&&previous?.includes('crouch')!==crouch){
      const oldIdle=weapon+(previous?.includes('crouch')?'-crouch-upper':'-upper');
      state.actions[oldIdle].play().stopFading().setEffectiveWeight(1-blend);
      state.actions[idleUpper].stopFading().setEffectiveWeight(blend);
    }else if(upper===idleUpper&&!group.userData.combat.isReturning()){state.actions[weapon+(crouch?'-upper':'-crouch-upper')].stop();state.actions[idleUpper].stopFading().setEffectiveWeight(1);}
  }
  // Restore the last mixer output before corrective IK. Static tracks may skip
  // unchanged values, so leaving last frame's corrections would accumulate.
  state.mixer.update(Math.min(.1,Math.max(0,dt)));saveAnimationPose(state);
  state.display.position.set(0,0,0);updatePose(state);
  const groupY=group.getWorldPosition(new T.Vector3()).y;
  if(grounded){state.display.position.y=groupY-vertexBottom(state.soleVertices);updatePose(state);}
  const targets=state.feet.map(b=>b.getWorldPosition(new T.Vector3()));
  const headTop=state.head.getWorldPosition(new T.Vector3()).y+state.headTopOffset-groupY;
  const previousCrouch=hitboxMotion?.previousKey?.includes('crouch'),nextHeight=crouch?1.2:1.8;
  const desired=hitboxMotion&&hitboxMotion.blend<1?(previousCrouch?1.2:1.8)+(nextHeight-(previousCrouch?1.2:1.8))*hitboxMotion.blend:nextHeight;
  const correction=desired-headTop;
  // Translate shared torso/pelvis bone in its parent's basis, then solve legs.
  if(state.splitter&&Math.abs(correction)>.003){
    const directionY=new T.Vector3(0,correction,0).applyQuaternion(state.splitter.parent.getWorldQuaternion(new T.Quaternion()).invert()).divideScalar(state.display.scale.x);
    state.splitter.position.add(directionY);updatePose(state);
    if(grounded){plantLeg(state.bones,'L',targets[0]);plantLeg(state.bones,'R',targets[1]);}
  }
  // Ankle-to-sole offset is measured from native idle, so support foot stays on ground.
  updatePose(state);
  if(grounded){state.display.position.y+=groupY-vertexBottom(state.soleVertices);updatePose(state);}
  // Aim pitch is distributed over the spine in WORLD right-axis, retaining native yaw.
  const right=new T.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  for(const [name,weight] of [['Spine3',.5],['Spine4',.3],['Neck',.2]]){
    const bone=state.bones[name];if(!bone)continue;
    const localRight=right.clone().applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).invert());
    bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(localRight,pitch*weight));bone.updateWorldMatrix(true,true);
  }
  for(const [kind,holder] of Object.entries(state.weaponHolders))holder.visible=kind===weapon&&!dead;
  if(grounded&&state.bones.R_Sash_01&&state.clothVertices.length){
    updatePose(state);const clothBottom=vertexBottom(state.clothVertices);
    if(clothBottom<groupY+.005){const bone=state.bones.R_Sash_01,raise=new T.Vector3(0,(groupY+.005-clothBottom)/.9,0).applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).invert()).divideScalar(state.display.scale.x);bone.position.add(raise);}
  }
  state.display.visible=true;
  updatePose(state);
  // Native backward locomotion leans beyond the server's head envelope.
  // Bound only the display offset; authoritative player coordinates stay fixed.
  const before=group.worldToLocal(state.head.getWorldPosition(new T.Vector3()));
  const horizontal=Math.hypot(before.x,before.z),limit=.14;
  if(horizontal>limit){
    const fraction=limit/horizontal-1;
    state.display.position.x+=before.x*fraction;
    state.display.position.z+=before.z*fraction;
    updatePose(state);
  }
  group.userData.combat.after(dt,{weapon,dead,reloadRemaining,equipRemaining,serverNow,fireStartedAt});
  group.userData.diagnostics.supportGrip=applyThirdPersonSupportGrip(state,weapon,{busy:dead||reloadRemaining>0||equipRemaining>0||/reload|equip/.test(state.upper)||group.userData.combat.isReturning()});
  if(group.userData.cosmeticRig)group.userData.diagnostics.skinHelpers=applySkinHelpers(state);
  applyReloadContact(state,weapon,reloadRemaining);
  const diagnostic=group.userData.diagnostics;
  diagnostic.reloadContact=state.weaponModels[weapon]?.userData.contactDiagnostics||null;
  diagnostic.lower=lower;diagnostic.upper=upper;diagnostic.weapon=weapon;
  diagnostic.headHeight=state.head.getWorldPosition(tmp).y+state.headTopOffset-groupY;
  diagnostic.footError=vertexBottom(state.soleVertices)-groupY;
  const headLocal=group.worldToLocal(state.head.getWorldPosition(new T.Vector3()));diagnostic.headXZOffset=[headLocal.x,headLocal.z];
  const equipped=state.weaponModels[weapon],raw=equipped?.userData.model||equipped?.children[0];
  if(raw&&weapon!=='knife'){const direction=new T.Vector3(1,0,0).applyQuaternion(raw.getWorldQuaternion(new T.Quaternion()));diagnostic.weaponForward=direction.toArray();diagnostic.weaponForwardDot=direction.dot(new T.Vector3(0,0,-1).applyQuaternion(group.getWorldQuaternion(new T.Quaternion())));}
  if(weapon==='knife'&&equipped){
    delete diagnostic.weaponForward;delete diagnostic.weaponForwardDot;
    diagnostic.knifeBladeDirection=new T.Vector3(0,1,0).transformDirection(equipped.matrixWorld).toArray();
    diagnostic.knifeClip=state.actions[state.upper]?.getClip().name;
  }else{delete diagnostic.knifeBladeDirection;delete diagnostic.knifeClip;}
}

export function getOpponentMuzzle(group){
  const state=group.userData.native,weapon=state?.weaponModels[state.weapon];
  const socket=weapon?.userData.muzzle||weapon?.userData.socket;
  group.updateWorldMatrix(true,true);
  if(socket?.parent)return socket.getWorldPosition(new T.Vector3());
  if(state?.bones.R_WeaponPoint)return state.bones.R_WeaponPoint.getWorldPosition(new T.Vector3());
  return group.userData.rig.weapon.getWorldPosition(new T.Vector3());
}
