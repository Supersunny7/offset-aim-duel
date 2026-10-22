import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMovementPrediction} from '../movement-net.mjs';
import {reconcileAimSnapshot} from '../public/look-input.mjs';

test('stale movement epoch repositions player without rewinding newer mouse aim',()=>{
 const actor={x:0,y:0,z:0,yaw:0,pitch:0,hp:100},prediction=createMovementPrediction(actor);
 const server={...actor,spawnEpoch:1,moveAck:0};prediction.reconcile(server);reconcileAimSnapshot(actor,server,{first:true});
 actor.yaw=-.06;actor.pitch=.12;prediction.advance(1/60,{right:true},actor.yaw);
 assert.equal(prediction.reconcile({...server,spawnEpoch:2,x:3}),true);
 assert.equal(reconcileAimSnapshot(actor,{...server,spawnEpoch:2}),false);
 assert.equal(actor.x,3);assert.equal(actor.yaw,-.06);assert.equal(actor.pitch,.12);
 prediction.reconcile({...server,spawnEpoch:2,x:3});assert.equal(actor.yaw,-.06);assert.equal(actor.pitch,.12);
});

test('respawn and rematch apply spawn aim while reconnect preserves living player aim',()=>{
 const actor={yaw:.7,pitch:.12},server={yaw:Math.PI,pitch:0};
 assert.equal(reconcileAimSnapshot(actor,server),false);assert.deepEqual(actor,{yaw:.7,pitch:.12});
 assert.equal(reconcileAimSnapshot(actor,server,{respawn:true}),true);assert.deepEqual(actor,server);
 actor.yaw=.7;actor.pitch=.12;assert.equal(reconcileAimSnapshot(actor,{yaw:0,pitch:0},{newRound:true}),true);assert.deepEqual(actor,{yaw:0,pitch:0});
 assert.equal(reconcileAimSnapshot(actor,{yaw:NaN,pitch:0},{first:true}),false);assert.deepEqual(actor,{yaw:0,pitch:0});
});
