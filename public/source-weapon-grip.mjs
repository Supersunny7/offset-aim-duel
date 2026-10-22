import * as T from '/vendor/three.module.js';

// The supplied FP animations own the weapon through MasterWeapon and author
// their wrist effectors separately from the FK arm chains. This is a runtime
// source-effector solve for the two new guns only; it never edits source keys.
export function createSourceWeaponGrip(model){
 const master=model.getObjectByName('MasterWeapon'),sets=new Map();
 if(!master?.isBone)throw Error('Native MasterWeapon is missing');
 const chains={};for(const side of ['L','R']){
  const shoulder=model.getObjectByName(side+'_Shoulder'),elbow=model.getObjectByName(side+'_Elbow'),hand=model.getObjectByName(side+'_Hand');
  const offset=model.getObjectByName(side+'_Weapon_HandOffset'),target=offset||model.getObjectByName(side+'_Weapon_HandTarget');
  if(!shoulder?.isBone||!elbow?.isBone||!hand?.isBone||!target?.isBone)throw Error('Native '+side+' wrist effector is missing');
  chains[side]={shoulder,elbow,hand,target,explicitOffset:!!offset};
 }
 const diagnostics={method:'native MasterWeapon ownership and source wrist effectors',weapon:null,active:null,hands:{}};
 let nativeHands=null;
 const position=b=>b.getWorldPosition(new T.Vector3()),rotation=b=>b.getWorldQuaternion(new T.Quaternion()).normalize();
 function cameraOf(){for(let p=model.parent;p;p=p.parent)if(p.isCamera)return p;throw Error('Native FP rig is not attached to a camera');}
 function update(){model.updateWorldMatrix(true,true);}
 function setWorldRotation(b,q){b.quaternion.copy(rotation(b.parent).invert().multiply(q)).normalize();update();}
 function solve(chain,reference){
  const {shoulder,elbow,hand,target}=chain;update();
  const a=position(shoulder),b=position(elbow),c=position(hand),requested=target.localToWorld(reference.position.clone()),desired=requested.clone();
  const desiredQ=rotation(target).multiply(reference.rotation),upper=a.distanceTo(b),lower=b.distanceTo(c);let distance=a.distanceTo(desired);
  const info={sourceTarget:target.name,requestedMm:c.distanceTo(desired)*1000,upperLength:upper,lowerLength:lower,reachDistance:distance,unreachable:false};
  // Clamp to the original per-frame reach sphere; never stretch source bones.
  // Sheriff Fire's first effector lies 1.69 mm beyond reach, so skipping the
  // whole solve there would leave its wrist 182 mm from the authored target.
  if(!Number.isFinite(distance)||distance<1e-8||upper<1e-8||lower<1e-8){info.degenerate=true;info.residualMm=info.requestedMm;return info;}
  const axis=desired.clone().sub(a).normalize(),reachable=T.MathUtils.clamp(distance,Math.abs(upper-lower)+1e-8,upper+lower-1e-8);
  if(Math.abs(reachable-distance)>1e-8){info.unreachable=true;info.clampResidualMm=Math.abs(reachable-distance)*1000;distance=reachable;desired.copy(a).addScaledVector(axis,distance);}
  const plane=b.clone().sub(a);plane.addScaledVector(axis,-plane.dot(axis));
  if(plane.lengthSq()<1e-12){info.degenerate=true;info.residualMm=info.requestedMm;return info;}plane.normalize();
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  const desiredElbow=a.clone().addScaledVector(axis,along).addScaledVector(plane,height);
  const nativeUpper=b.clone().sub(a).normalize(),solvedUpper=desiredElbow.clone().sub(a).normalize();
  setWorldRotation(shoulder,new T.Quaternion().setFromUnitVectors(nativeUpper,solvedUpper).multiply(rotation(shoulder)));
  const elbowNow=position(elbow),handNow=position(hand),nativeLower=handNow.clone().sub(elbowNow).normalize(),solvedLower=desired.clone().sub(elbowNow).normalize();
  setWorldRotation(elbow,new T.Quaternion().setFromUnitVectors(nativeLower,solvedLower).multiply(rotation(elbow)));
  setWorldRotation(hand,desiredQ);
  info.residualMm=position(hand).distanceTo(requested)*1000;
  info.solvedReachResidualMm=position(hand).distanceTo(desired)*1000;
  info.upperLengthErrorMm=Math.abs(position(shoulder).distanceTo(position(elbow))-upper)*1000;
  info.lowerLengthErrorMm=Math.abs(position(elbow).distanceTo(position(hand))-lower)*1000;
  info.wristAngleErrorDeg=rotation(hand).angleTo(desiredQ.normalize())*180/Math.PI;
  return info;
 }
 return {diagnostics,
  restoreHands(weapon){
   if(['phantom'].includes(weapon)||!nativeHands)return;
   for(const {bone,p,q,s} of nativeHands){bone.position.copy(p);bone.quaternion.copy(q);bone.scale.copy(s);}
  },
  forgetHands(){nativeHands=null;},
  captureIdle(weapon,rawSocketTransform){
   if(!weapon)throw Error('Source grip weapon is missing');
   update();const camera=cameraOf(),worldPosition=camera.localToWorld(rawSocketTransform.position.clone());
   const worldRotation=rotation(camera).multiply(rawSocketTransform.rotation.clone());
   const refs={};for(const [side,chain]of Object.entries(chains))refs[side]={position:chain.target.worldToLocal(position(chain.hand)),rotation:rotation(chain.target).invert().multiply(rotation(chain.hand))};
   const saved={position:master.worldToLocal(worldPosition),rotation:rotation(master).invert().multiply(worldRotation),hands:refs};sets.set(weapon,saved);
   diagnostics.captured=Object.fromEntries([...sets].map(([id,s])=>[id,{master:master.name,hands:Object.fromEntries(Object.entries(chains).map(([side,c])=>[side,{target:c.target.name,explicitOffset:c.explicitOffset,idleOffset:s.hands[side].position.toArray()}]))}]));
  },
  getWeaponTransform(camera,weapon){
   const saved=sets.get(weapon);if(!saved)throw Error('Native idle reference was not captured for '+weapon);update();
   return {position:camera.worldToLocal(master.localToWorld(saved.position.clone())),rotation:rotation(camera).invert().multiply(rotation(master)).multiply(saved.rotation)};
  },
  applyHands(weapon,active){
   const saved=sets.get(weapon);if(!saved)return;diagnostics.weapon=weapon;diagnostics.active=active;
   // PropertyMixer skips writes for unchanged source channels. Restore the
   // previous sampled FK pose before mixing, so IK cannot become the next pose.
   if(weapon!=='phantom')nativeHands=Object.values(chains).flatMap(c=>[c.shoulder,c.elbow,c.hand]).map(bone=>({bone,p:bone.position.clone(),q:bone.quaternion.clone(),s:bone.scale.clone()}));
   // Every render frame must sample its original FK pose before this solve.
   // Repeating the solve at dt=0 converges to the same point and keeps lengths.
   diagnostics.hands={R:solve(chains.R,saved.hands.R),L:solve(chains.L,saved.hands.L)};
  }
 };
}
