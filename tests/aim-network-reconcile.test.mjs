import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMovementPrediction,FIXED_DT} from '../movement-net.mjs';
import {reconcileAimSnapshot} from '../public/look-input.mjs';
test('late movement replay and a stall epoch keep newer local aim instead of old server yaw',()=>{
 const actor={x:0,y:0,z:11,yaw:-2.6,pitch:.1,weapon:'vandal',hp:100,grounded:true,spawnEpoch:1,lifeEpoch:1,moveAck:0};const old={...actor};const prediction=createMovementPrediction(actor);prediction.reconcile(old);
 for(let i=0;i<8;i++)prediction.advance(FIXED_DT,{left:true},-2.6);actor.yaw=.9;actor.pitch=.35;
 prediction.reconcile(old);reconcileAimSnapshot(actor,old);assert.equal(actor.yaw,.9);assert.equal(actor.pitch,.35);
 const stalled={...old,spawnEpoch:2};prediction.reconcile(stalled);reconcileAimSnapshot(actor,stalled);assert.equal(actor.yaw,.9);assert.equal(actor.pitch,.35);
});
