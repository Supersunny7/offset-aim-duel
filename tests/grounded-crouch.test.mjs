import {test} from 'node:test';
import assert from 'node:assert/strict';
import {move,eyeHeight,bodyHeight,BOXES,EYE} from '../shared.mjs';
import {ASCENT_SPAWNS,groundedStance} from '../map-collision.mjs';
import {createMovementPrediction,queueMoves,stepQueuedMove} from '../movement-net.mjs';
const actor=map=>map==='ascent'?{...ASCENT_SPAWNS[1],map,grounded:true,weapon:'vandal'}:{map,x:9,z:9,y:0,yaw:0,grounded:true,weapon:'vandal'};
test('all map paths ignore crouch throughout flight, retain standing camera/body, then honor held crouch on the ground',()=>{
 for(const map of ['duel','training','ascent'])for(const startedCrouched of [false,true]){
  const p=actor(map);if(startedCrouched)move(p,{crouch:true},1/60);
  move(p,{jump:true,crouch:true},1/60);assert.equal(p.grounded,false);assert.equal(p.crouch,false);
  let frames=0;while(!p.grounded&&frames++<100){move(p,{jump:true,crouch:true},1/60);assert.equal(p.crouch,false);assert.equal(bodyHeight(p),1.8);assert(Math.abs(eyeHeight(p)-p.y-EYE)<1e-12);}
  assert(p.grounded);move(p,{jump:true,crouch:true},1/60);assert.equal(p.crouch,true,'held crouch starts only after landing');
  move(p,{},1/60);assert.equal(p.crouch,false);
 }
});
test('airborne crouch presses and releases produce the same trajectory and source hitbox motion as no crouch',()=>{
 const a=actor('duel'),b=actor('duel');move(a,{jump:true},1/60);move(b,{jump:true},1/60);
 for(let n=0;n<25;n++){move(a,{crouch:n%2===0,right:true},1/60);move(b,{right:true},1/60);assert.equal(a.crouch,false);for(const k of ['x','y','z','vx','vy','vz'])assert.equal(a[k],b[k]);assert.deepEqual(a.hitboxMotion,b.hitboxMotion);}
});
test('low ceilings preserve crouch and suppress crouched takeoff instead of forcing standing into geometry',()=>{
 const p=actor('training');p.crouch=true;BOXES.push({x:9,z:9,w:2,d:2,y:1.3,h:.4});
 try{move(p,{jump:true,crouch:true},1/60);assert.equal(p.grounded,true);assert.equal(p.y,0);assert.equal(p.crouch,true);}finally{BOXES.pop();}
 move(p,{},1/60);move(p,{jump:true},1/60);assert.equal(p.grounded,false);assert.equal(p.crouch,false);
 const q={grounded:true,crouch:true};assert.equal(groundedStance(q,{jump:true},()=>true),false);assert(q.crouch);
});
test('prediction and authoritative queued movement retain identical grounded-only crouch through replay',()=>{
 const server={...actor('duel'),spawnEpoch:1,moveAck:0,hp:100},local=structuredClone(server),pred=createMovementPrediction(local);pred.reconcile(server);
 for(let n=0;n<70;n++){pred.advance(1/60,{jump:n===0,crouch:n>=2,right:true},0);queueMoves(server,pred.takeMoves(),1);while(stepQueuedMove(server)){}pred.reconcile(server);assert.equal(local.crouch,server.crouch);assert.equal(local.grounded,server.grounded);if(!server.grounded)assert.equal(server.crouch,false);assert(Math.abs(local.y-server.y)<1e-12);}
 assert(server.grounded);assert(server.crouch);
});
