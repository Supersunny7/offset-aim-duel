import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleViewPlayer,selectViewSnapshot,viewSample} from '../lag-compensation.mjs';
const actor=(phase)=>({id:'b',x:0,y:0,z:0,weapon:'ghost',lifeEpoch:1,hp:100,yaw:0,hitboxMotion:{key:'ghost|run-e',phase,previousPhase:0,blend:1}});
test('pose phase wraps forward and aim yaw takes the short path',()=>{
 const a=actor(.98),b=actor(.02);a.yaw=3.1;b.yaw=-3.1;
 const s=sampleViewPlayer(a,b,1000,1050,.5);assert(Math.abs(s.hitboxMotion.phase)<1e-9);assert(Math.abs(s.yaw-Math.PI)<1e-9);
});
test('historical sample excludes future firing and reload actions',()=>{
 const a=actor(.1),b={...actor(.2),lastShot:1040,lastShotWeapon:'ghost',hitboxFire:[{at:1040,weapon:'ghost'}],hitboxAction:{at:1030,weapon:'ghost',kind:'reload'},reloadUntil:2530};
 const early=sampleViewPlayer(a,b,1000,1050,.4);assert.equal(early.lastShot,0);assert.equal(early.reloadUntil,0);assert.equal(early.hitboxAction,null);assert.deepEqual(early.hitboxFire,[]);
 const late=sampleViewPlayer(a,b,1000,1050,.9);assert.equal(late.lastShot,1040);assert.equal(late.hitboxAction,null,'accepted shot interrupts reload');
});
test('reversing direction cannot select an earlier displayed clock',()=>{
 const frames=[0,1,2].map((n)=>({snapshotId:String(n),now:1000+50*n,players:[{id:'a',weapon:'vandal',lifeEpoch:1},{...actor(.1),x:n===1?1:0}]}));
 const view=selectViewSnapshot(frames,{x:.1,y:0,z:0},'b','a','vandal',1,1075);
 assert(viewSample(frames,view,'b').at>=1075);
});
