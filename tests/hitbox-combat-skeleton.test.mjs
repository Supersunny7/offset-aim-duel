import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPON_IDS} from '../weapons.mjs';
const ADS_IDS=['stinger','spectre','bulldog','guardian','marshal','operator','ares','odin'];
import {HITBOX_COMBAT_SKELETON as data} from '../hitbox-combat-skeleton-data.mjs';
import {sampledHitboxPose} from '../hitbox-motion.mjs';
const actor=()=>({weapon:'vandal',hp:100,hitboxSampleAt:1750,hitboxMotion:{key:'vandal|run-e',phase:.37,previousKey:'vandal|crouch-walk-e',previousPhase:.71,blend:.5},crouch:false,pitch:0});
test('original upper action transforms cover both stances and fire uses the original additive tracks',()=>{
 assert.equal(Object.keys(data.clips).length,(WEAPON_IDS.length-1)*4+6);for(const clip of Object.values(data.clips)){assert.equal(clip.hz,480);assert.equal(clip.frames.length,Math.round(clip.duration*480)+1);for(const f of clip.frames)assert(f.length===data.names.length&&f.every(i=>data.pool[i]?.every(Number.isFinite)));}
 assert.equal(Object.keys(data.fire).length,WEAPON_IDS.length-1+ADS_IDS.length);for(const w of [...WEAPON_IDS.filter(w=>w!=='knife'),...ADS_IDS.map(id=>id+'-ads')]){if(!w.endsWith('-ads'))assert.equal(Object.keys(data.clips).filter(k=>k.startsWith(w+'|')).length,4);assert(data.fire[w].duration>0);assert(data.fire[w].tracks.some(t=>t.name==='R_Elbow'&&t.property==='quaternion'));for(const t of data.fire[w].tracks){assert(t.times.every(Number.isFinite));assert(t.values.every(Number.isFinite));assert.equal(t.values.length,t.times.length*(t.property==='quaternion'?4:3));}}
});
test('native attack composition rejects foreign, future and expired actions and dead actors',()=>{
 const p=actor(),rest=sampledHitboxPose(p);p.hitboxAction={weapon:'ghost',kind:'reload',at:1000};assert.deepEqual(sampledHitboxPose(p),rest);
 p.hitboxAction={weapon:'vandal',kind:'reload',at:2000};assert.deepEqual(sampledHitboxPose(p),rest);
 p.hitboxAction.at=1000;assert.notDeepEqual(sampledHitboxPose(p),rest);p.hp=0;assert.deepEqual(sampledHitboxPose(p),rest);p.hp=100;p.hitboxAction.at=-5000;assert.deepEqual(sampledHitboxPose(p),rest);
});
test('pause deadline shifts preserve combined attack and leg IK without replay side effects',()=>{
 const p=actor();p.hitboxAction={weapon:'vandal',kind:'reload',at:1000};p.reloadUntil=3500;const before=sampledHitboxPose(p);const original=JSON.stringify(p);
 assert.deepEqual(sampledHitboxPose(p),before);assert.equal(JSON.stringify(p),original);
 p.hitboxSampleAt+=1200;p.hitboxAction.at+=1200;p.reloadUntil+=1200;assert.deepEqual(sampledHitboxPose(p),before);
 const m=p.hitboxMotion;for(const side of ['L','R']){const neutral=sampledHitboxPose({...p,hitboxAction:null});for(const [a,b] of [['Hip','Knee'],['Knee','Foot']]){const length=pose=>Math.hypot(...pose[side+'_'+a].map((v,i)=>v-pose[side+'_'+b][i]));assert(Math.abs(length(before)-length(neutral))<.00002,'combat IK preserves source leg lengths');}}
});
