import {test} from 'node:test';
import assert from 'node:assert/strict';
import {move} from '../shared.mjs';
import {createMovementPrediction,queueMoves,stepQueuedMove,FIXED_DT,MAX_QUEUE} from '../movement-net.mjs';
const spawn=()=>({x:-8,z:11,y:0,yaw:0,vx:0,vz:0,vy:0,hp:100,grounded:true,crouch:false,jumpHeld:false,spawnEpoch:1,moveAck:0,moveReceived:0,moveQueue:[]});
test('delayed authoritative snapshots replay unacknowledged fixed inputs without walking backsteps',()=>{
 const self=spawn(),server=spawn(),expected=spawn(),prediction=createMovementPrediction(self);prediction.reconcile(server);
 const packets=[],snapshots=[];let maxCorrection=0;
 for(let frame=0;frame<180;frame++){
  const intent={right:frame<65,left:frame>=80&&frame<145,crouch:frame>=105&&frame<125,jump:frame===100};
  prediction.advance(FIXED_DT,intent,0);move(expected,intent,FIXED_DT);
  packets.push({at:frame+8,moves:prediction.takeMoves()});
  for(const p of packets.filter(p=>p.at===frame))queueMoves(server,p.moves,1);
  stepQueuedMove(server);
  if(frame%3===0)snapshots.push({at:frame+8,state:{...server,moveQueue:undefined}});
  for(const s of snapshots.filter(s=>s.at===frame)){prediction.reconcile(s.state);maxCorrection=Math.max(maxCorrection,prediction.diagnostics.correction);}
  assert.ok(Math.hypot(self.x-expected.x,self.y-expected.y,self.z-expected.z)<1e-8,'prediction must follow complete input history');
 }
 assert.ok(maxCorrection<1e-8,`correction ${maxCorrection}`);assert.ok(prediction.diagnostics.pending>0,'latency must leave outstanding commands');
});
test('movement queue bounds duplicate, wrong epoch, gaps and excessive batch; server applies one fixed step',()=>{
 const p=spawn(),c=n=>({n,yaw:0,right:true});assert.equal(queueMoves(p,[c(1),c(2)],0),0);assert.equal(queueMoves(p,[c(1),c(2)],1),2);assert.equal(queueMoves(p,[c(1),c(2)],1),0);assert.equal(queueMoves(p,[c(4)],1),0);assert.equal(queueMoves(p,Array.from({length:9},(_,i)=>c(i+3)),1),0);
 const x=p.x;stepQueuedMove(p);assert.equal(p.moveAck,1);assert.ok(p.x-x<=5.4*FIXED_DT);assert.equal(p.moveQueue.length,1);stepQueuedMove(p);assert.equal(p.moveAck,2);
});
test('respawn discards pre-death input, and stalled network cannot grow prediction without bound',()=>{
 const p=spawn(),prediction=createMovementPrediction(p);prediction.reconcile(p);for(let i=0;i<240;i++)prediction.advance(FIXED_DT,{right:true},0);assert.equal(prediction.pending.length,MAX_QUEUE);
 const next={...spawn(),spawnEpoch:2,x:0,z:-11};prediction.reconcile(next);assert.equal(prediction.pending.length,0);assert.equal(p.x,0);assert.equal(prediction.takeMoves().length,0);prediction.advance(FIXED_DT,{left:true},0);assert.equal(prediction.takeMoves()[0].n,1);
});
test('20 FPS and 60 FPS predict equal one-second movement from elapsed time',()=>{
 const run=fps=>{const actor=spawn(),prediction=createMovementPrediction(actor);prediction.reconcile(actor);for(let frame=0;frame<fps;frame++)prediction.advance(1/fps,{right:true},0);return {actor,steps:prediction.diagnostics.steps};};
 const fast=run(60),slow=run(20);assert.equal(slow.steps,fast.steps);assert.equal(slow.steps,60);
 for(const field of ['x','z','vx','vz'])assert.ok(Math.abs(slow.actor[field]-fast.actor[field])<1e-10,`${field} independent of rendering FPS`);
});

 test('queued pre-equip input preserves speed context but publishes current weapon animation',()=>{
 const p={x:0,y:0,z:0,yaw:0,weapon:'vandal',ads:false,hp:100,grounded:true,spawnEpoch:1,vx:0,vz:0};
 queueMoves(p,[{n:1,yaw:0,left:true}],1);p.weapon='ghost';stepQueuedMove(p);
 assert.equal(p.weapon,'ghost');assert(p.hitboxMotion.key.startsWith('ghost|'));
 queueMoves(p,[{n:2,yaw:0,right:true,crouch:true}],1);p.weapon='knife';stepQueuedMove(p);
 assert.equal(p.weapon,'knife');assert(p.hitboxMotion.key.startsWith('knife|crouch'));
 });
