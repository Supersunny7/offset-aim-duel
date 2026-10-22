import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {HITBOX_MOTION} from '../hitbox-motion-data.mjs';import {HITBOX_SKELETON} from '../hitbox-skeleton-data.mjs';import {HITBOX_COMBAT_SKELETON} from '../hitbox-combat-skeleton-data.mjs';import {advanceHitboxMotion,sampledHitboxPose} from '../hitbox-motion.mjs';
test('Phantom and Sheriff TP clips use their original Simple Carbine/Revolver sources and Jett Simple target basis',()=>{
 for(const [weapon,family] of [['phantom','Carbine'],['sheriff','Revolver']])for(const [action,suffix]of [['upper','IdlePose_UB'],['crouch-upper','CrouchPose_UB'],['equip','Equip_UB'],['fire','FireAdd_UB'],['reload','Reload_UB']]){
  const source=JSON.parse(fs.readFileSync(new URL('../public/assets/packs/animations/opponent-'+weapon+'-'+action+'.json',import.meta.url)));
  assert.equal(source.sourceEntry,'Animations/Agent Animations/Shared/Simple/TP_Core_'+family+'_S0_'+suffix+'.psa');assert.equal(source.targetRig,'jettSimple.blend');assert.equal(source.targetRigSha256,'98f3f152debe3c7c023d2e4beab1553bafefe75fc35aa2a43dad6a8451a9df85');assert(source.targetBind.L_Shoulder_Twst1[3]>.99&&source.targetBind.R_Shoulder_Twst1[3]>.99);
  assert(source.tracks.some(t=>t.bone==='R_WeaponPoint'));assert(source.tracks.some(t=>t.bone==='L_Hand'));assert(source.fps>0&&source.frames>=2);assert(Math.abs(source.duration-(source.frames-1)/source.fps)<1e-8);
 }
});
test('new weapon locomotion and native combat samples are distinct, finite and weapon gated',()=>{
 for(const weapon of ['phantom','sheriff']){
  const keys=Object.keys(HITBOX_MOTION).filter(k=>k.startsWith(weapon+'|'));assert.equal(keys.length,15);assert(keys.every(k=>HITBOX_SKELETON.clips[k]?.frames.length===192));
  for(const crouch of [false,true]){
   const p={weapon,grounded:true,crouch,hp:100,hitboxSampleAt:1400};advanceHitboxMotion(p,0);const idle=sampledHitboxPose(p);
   for(const kind of ['equip','reload']){assert(HITBOX_COMBAT_SKELETON.clips[weapon+'|'+kind+'|'+crouch]);p.hitboxAction={weapon,kind,at:1000};const active=sampledHitboxPose(p);assert.notDeepEqual(active.R_Hand,idle.R_Hand);assert(Object.values(active).flat().every(Number.isFinite));p.hitboxAction={weapon:weapon==='phantom'?'sheriff':'phantom',kind,at:1000};assert.deepEqual(sampledHitboxPose(p),idle);}
   p.hitboxAction=null;p.hitboxFire=[{weapon,at:1350}];assert.notDeepEqual(sampledHitboxPose(p).R_Hand,idle.R_Hand);p.equipUntil=1500;assert.deepEqual(sampledHitboxPose(p),idle);
  }
 }
 assert.notDeepEqual(HITBOX_SKELETON.clips['phantom|idle-lower'].frames[0],HITBOX_SKELETON.clips['sheriff|idle-lower'].frames[0]);
});
