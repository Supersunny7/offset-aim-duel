import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPON_IDS} from '../weapons.mjs';
const ADS_IDS=['stinger','spectre','bulldog','guardian','marshal','operator','ares','odin'];
import {advanceHitboxMotion,sampledHitboxPose,extrapolateHitboxMotion} from '../hitbox-motion.mjs';
import {HITBOX_MOTION} from '../hitbox-motion-data.mjs';
import {HITBOX_ACTION} from '../hitbox-action-data.mjs';
import {playerHitboxes} from '../shared.mjs';
test('all baked locomotion cycles have finite bone samples and phase-continuous loop endpoints',()=>{
 assert.equal(Object.keys(HITBOX_MOTION).length,(WEAPON_IDS.length+ADS_IDS.length)*15);
 for(const weapon of WEAPON_IDS){assert.equal(Object.keys(HITBOX_MOTION).filter(k=>k.startsWith(weapon+'|')).length,15);const p={weapon,grounded:true,hp:100};advanceHitboxMotion(p,0);assert.equal(p.hitboxMotion.key,weapon+'|idle-lower');const a=sampledHitboxPose(p);assert(a&&Object.values(a).every(v=>v.every(Number.isFinite)));p.hitboxMotion.phase=1;assert.deepEqual(sampledHitboxPose(p),a,'native cycle wraps at phase1');}
 for(const clip of Object.values(HITBOX_MOTION)){
  assert(clip.duration>0);assert.equal(clip.frames.length,96);
  for(const frame of clip.frames)for(const point of Object.values(frame))assert(point.every(Number.isFinite));
 }
});

test('accepted action curves cover knife light/heavy, reload and equip in both stances',()=>{
 assert.equal(Object.keys(HITBOX_ACTION).length,14);
 for(const clip of Object.values(HITBOX_ACTION)){
  assert.equal(clip.hz,480);assert.equal(clip.frames.length,Math.round(clip.duration*clip.hz)+1);
  for(const frame of clip.frames)for(const point of Object.values(frame))assert(point.every(Number.isFinite));
 }
 for(const weapon of ['vandal','ghost','knife'])for(const crouch of [false,true]){
  const p={weapon,crouch,grounded:true,hp:100};advanceHitboxMotion(p,0);const rest=sampledHitboxPose(p);
  for(const kind of weapon==='knife'?['primary','secondary','equip']:['reload','equip']){
   p.hitboxAction={weapon,kind,at:1000};p.hitboxSampleAt=1215;
   const posed=sampledHitboxPose(p);assert.notDeepEqual(posed.R_Hand,rest.R_Hand);
   p.hitboxSampleAt=1000+HITBOX_ACTION[weapon+'|'+kind+'|'+crouch].duration*1000+1;
   assert.deepEqual(sampledHitboxPose(p),rest,'expired action returns to locomotion');
  }
 }
});

test('cancelled and foreign actions cannot survive switching, and dead actors do not apply combat curves',()=>{
 const p={weapon:'vandal',grounded:true,hp:100,hitboxSampleAt:1215};advanceHitboxMotion(p,0);const rest=sampledHitboxPose(p);
 p.hitboxAction={weapon:'knife',kind:'secondary',at:1000};assert.deepEqual(sampledHitboxPose(p),rest);
 p.hitboxAction={weapon:'vandal',kind:'reload',at:1000};assert.notDeepEqual(sampledHitboxPose(p),rest);
 p.hitboxAction=null;assert.deepEqual(sampledHitboxPose(p),rest);
 p.hitboxAction={weapon:'vandal',kind:'reload',at:1000};p.hp=0;assert.deepEqual(sampledHitboxPose(p),rest);
});

test('stance changes blend action deltas with the same locomotion transition rather than snapping them',()=>{
 const p={weapon:'vandal',grounded:true,hp:100,hitboxSampleAt:1600,hitboxAction:{weapon:'vandal',kind:'reload',at:1000}};advanceHitboxMotion(p,0);
 const standing=sampledHitboxPose(p);p.crouch=true;advanceHitboxMotion(p,0);
 assert.deepEqual(sampledHitboxPose(p),standing,'zero-age stance transition preserves the old action pose');
 advanceHitboxMotion(p,.045);const half=sampledHitboxPose(p);assert.notDeepEqual(half,standing);
 advanceHitboxMotion(p,.045);assert.equal(p.hitboxMotion.blend,1);assert.notDeepEqual(sampledHitboxPose(p),half);
});

test('two accepted fire events overlap only during the existing 60ms fade and are blocked by reload/equip',()=>{
 const p={weapon:'vandal',grounded:true,hp:100,hitboxSampleAt:1120,hitboxFire:[{weapon:'vandal',at:1000},{weapon:'vandal',at:1100}]};advanceHitboxMotion(p,0);
 const overlap=sampledHitboxPose(p);p.hitboxFire.shift();assert.notDeepEqual(sampledHitboxPose(p),overlap);
 p.hitboxSampleAt=1161;const latest=sampledHitboxPose(p);p.hitboxFire.unshift({weapon:'vandal',at:1000});assert.deepEqual(sampledHitboxPose(p),latest);
 p.hitboxFire=[];const rest=sampledHitboxPose(p);p.hitboxFire=[{weapon:'vandal',at:1100}];
 p.reloadUntil=2000;assert.deepEqual(sampledHitboxPose(p),rest);p.reloadUntil=0;p.equipUntil=2000;assert.deepEqual(sampledHitboxPose(p),rest);
});
test('running legs follow source phase; crouch switches blend rather than teleporting the head',()=>{
 const p={x:0,z:0,y:0,weapon:'vandal',vx:0,vz:-5.4,yaw:0,grounded:true};advanceHitboxMotion(p,1/60);
 assert.equal(p.hitboxMotion.key,'vandal|run-n');
 const a=sampledHitboxPose(p);p.hitboxMotion.phase=(p.hitboxMotion.phase+.4)%1;const b=sampledHitboxPose(p);
 assert(Math.hypot(...a.L_Knee.map((v,i)=>v-b.L_Knee[i]))>.01);
 p.vx=0;p.vz=0;const prior=sampledHitboxPose(p).Head[1];p.crouch=true;advanceHitboxMotion(p,1/60);
 assert(p.hitboxMotion.blend<1);const next=sampledHitboxPose(p).Head[1];assert(Math.abs(next-prior)<.2);
 for(let i=0;i<10;i++)advanceHitboxMotion(p,1/60);assert.equal(p.hitboxMotion.blend,1);assert(sampledHitboxPose(p).Head[1]<1.2);
});
test('fire pose affects arms without changing damage or replaying sound, and expires after one second',()=>{
 for(const weapon of ['vandal','ghost']){
  const p={x:0,z:0,y:0,weapon,vx:0,vz:0,grounded:true};advanceHitboxMotion(p,0);
  const rest=sampledHitboxPose(p);p.lastShot=1000;p.lastShotWeapon=weapon;p.hitboxSampleAt=1000;assert.deepEqual(sampledHitboxPose(p),rest);p.hitboxSampleAt=1100;
  const firing=sampledHitboxPose(p);assert(Math.hypot(...rest.R_Hand.map((v,i)=>v-firing.R_Hand[i]))>.0001);
  p.hitboxSampleAt=2100;assert.deepEqual(sampledHitboxPose(p),rest);
 }
});
test('pose sampling is repeatable, bounded while stale, and aim follows upper bones and preserves leg spacing under the display head bound',()=>{
 const p={x:0,z:0,y:0,weapon:'vandal',vx:0,vz:0,grounded:true};advanceHitboxMotion(p,0);
 const neutral=sampledHitboxPose(p);p.pitch=.6;const aimed=sampledHitboxPose(p);
 assert(Math.abs(Math.hypot(...neutral.L_Foot.map((v,i)=>v-neutral.R_Foot[i]))-Math.hypot(...aimed.L_Foot.map((v,i)=>v-aimed.R_Foot[i])))<1e-10);assert.notDeepEqual(neutral.Head,aimed.Head);
 assert.deepEqual(playerHitboxes(p),playerHitboxes(p));
 assert.deepEqual(extrapolateHitboxMotion(p.hitboxMotion,1),extrapolateHitboxMotion(p.hitboxMotion,.1));
});

test('new ADS source poses are available for every native ADS gun and wrap without replacing hip curves',()=>{for(const weapon of ADS_IDS){assert.equal(Object.keys(HITBOX_MOTION).filter(k=>k.startsWith(weapon+'-ads|')).length,15);const p={weapon,ads:true,grounded:true,hp:100};advanceHitboxMotion(p,0);assert.equal(p.hitboxMotion.key,weapon+'-ads|idle-lower');const pose=sampledHitboxPose(p);assert(Object.values(pose).every(v=>v.every(Number.isFinite)));p.hitboxMotion.phase=1;assert.deepEqual(sampledHitboxPose(p),pose);}});

test('native ADS changes keep the shared lower-body stride phase while protected legacy weapons retain their original keys',()=>{
 for(const weapon of ADS_IDS){
  const p={weapon,ads:false,grounded:true,hp:100,vx:5.4,vz:0};advanceHitboxMotion(p,.3);const phase=p.hitboxMotion.phase;
  p.ads=true;advanceHitboxMotion(p,0);assert.equal(p.hitboxMotion.key,weapon+'-ads|run-e');assert.equal(p.hitboxMotion.phase,phase);assert.equal(p.hitboxMotion.previousPhase,phase);
  advanceHitboxMotion(p,.03);assert.equal(p.hitboxMotion.previousPhase,p.hitboxMotion.phase);
  const stale=extrapolateHitboxMotion(p.hitboxMotion,.03);assert.equal(stale.previousPhase,stale.phase);
  p.ads=false;const nextPhase=p.hitboxMotion.phase;advanceHitboxMotion(p,0);assert.equal(p.hitboxMotion.key,weapon+'|run-e');assert.equal(p.hitboxMotion.phase,nextPhase);
 }
 for(const weapon of ['vandal','ghost','knife','phantom','sheriff']){
  const p={weapon,ads:false,grounded:true,hp:100,vx:5.4,vz:0};advanceHitboxMotion(p,.3);const before={...p.hitboxMotion};p.ads=true;advanceHitboxMotion(p,0);assert.equal(p.hitboxMotion.key,before.key);assert.equal(p.hitboxMotion.phase,before.phase);
 }
});
