import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPON_IDS} from '../weapons.mjs';
const ADS_IDS=['stinger','spectre','bulldog','guardian','marshal','operator','ares','odin'];
import {HITBOX_SKELETON as data} from '../hitbox-skeleton-data.mjs';
import {sampleNativeSkeletonPose} from '../hitbox-skeleton.mjs';
test('source transform pool covers all native locomotion and equipment combinations with a valid parent chain',()=>{
 assert.equal(Object.keys(data.clips).length,(WEAPON_IDS.length+ADS_IDS.length)*15);
 for(const key of Object.keys(data.clips)){assert.equal(data.clips[key].frames.length,key.startsWith('stinger-ads|')?768:192);for(const f of data.clips[key].frames){assert.equal(f.length,data.names.length);assert(f.every(i=>Number.isInteger(i)&&data.pool[i]));}}
 for(const p of data.pool){assert.equal(p.length,7);assert(p.every(Number.isFinite));assert(Math.abs(Math.hypot(...p.slice(3))-1)<.000003);}
 for(const weapon of [...WEAPON_IDS,...ADS_IDS.map(id=>id+'-ads')]){assert.equal(Object.keys(data.clips).filter(k=>k.startsWith(weapon+'|')).length,15);for(const suffix of ['-upper','-crouch-upper'])assert(Number.isFinite(data.headTopOffsets[weapon+suffix]));}
 for(const n of data.names){const p=data.parents[n];assert(!p||data.names.indexOf(p)<data.names.indexOf(n));}
});
test('native local rotation mixing retains forearm length instead of shrinking a linearly blended world-space segment',()=>{
 for(const weapon of [...WEAPON_IDS,...ADS_IDS.map(id=>id+'-ads')]){
  let reference;
  for(const blend of [.01,.2,.5,.8,.99]){
   const m={key:weapon+'|run-w',previousKey:weapon+'|crouch-walk-e',phase:.25,previousPhase:.71,blend};
   const pose=sampleNativeSkeletonPose(m);assert.deepEqual(pose,sampleNativeSkeletonPose(m));
   const length=Math.hypot(...pose.R_Hand.map((v,i)=>v-pose.R_Elbow[i]));
   reference??=length;assert(Math.abs(length-reference)<.000003);
  }
 }
});
test('zero/full transition preserve native endpoint sampling and unknown clips fall back',()=>{
 const m={key:'vandal|run-w',previousKey:'vandal|run-e',phase:.2,previousPhase:.3};
 assert.deepEqual(sampleNativeSkeletonPose({...m,blend:0}),sampleNativeSkeletonPose({key:m.previousKey,phase:m.previousPhase}));assert.deepEqual(sampleNativeSkeletonPose({...m,blend:1}),sampleNativeSkeletonPose({key:m.key,phase:m.phase}));assert.equal(sampleNativeSkeletonPose({...m,key:'missing',blend:.5}),null);
});

test('two-bone leg correction preserves authored limb lengths through stance and reversal',()=>{
 for(const weapon of [...WEAPON_IDS,...ADS_IDS.map(id=>id+'-ads')]){
  let reference;
  for(const blend of [.01,.2,.5,.8,.99]){
   const pose=sampleNativeSkeletonPose({key:weapon+'|run-w',previousKey:weapon+'|crouch-walk-e',phase:.25,previousPhase:.71,blend});
   const lengths=['L','R'].flatMap(s=>[['Hip','Knee'],['Knee','Foot']].map(([a,b])=>Math.hypot(...pose[s+'_'+a].map((v,i)=>v-pose[s+'_'+b][i]))));
   reference??=lengths;for(let i=0;i<4;i++)assert(Math.abs(lengths[i]-reference[i])<.00002,'IK cannot stretch or shrink native legs');
   assert(Object.values(pose).every(point=>point.every(Number.isFinite)));
  }
 }
});
