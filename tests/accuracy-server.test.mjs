import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {shoot,pauseRoom,resumeRoom,server,close} from '../server.mjs';
import {sampleSpreadDirection,shotRandom,previewAccuracy} from '../accuracy.mjs';
const sockets=[];after(()=>{sockets.forEach(s=>s.terminate());close();});
const actor=(weapon='vandal')=>({id:'probe',x:9,z:10,y:0,yaw:0,pitch:.123,vx:0,vz:0,grounded:true,crouch:false,hp:100,armor:50,weapon,ammo:25,magazines:{vandal:25,ghost:13},equipUntil:0,reloadUntil:0,nextShotAt:0,spray:0,shots:0});
test('server shot uses exactly its seed and accuracy terms, preserves retained aim, gates illegal shots, and does not allow reload/fire cadence to advance bloom',()=>{
 const p=actor(),r={phase:'waiting',players:[p]};const e=shoot(p,r,10000,'primary',null,{randomSeed:123});assert(e.accuracy);assert.equal(e.accuracy.baseDegrees,.25);assert.equal(e.accuracy.seed,123);
 const d=sampleSpreadDirection(p.yaw,p.pitch,e.accuracy.totalDegrees,shotRandom(123)),n=Math.hypot(e.end.x-e.origin.x,e.end.y-e.origin.y,e.end.z-e.origin.z);for(const k of ['x','y','z'])assert(Math.abs((e.end[k]-e.origin[k])/n-d[k])<1e-12);
 const state={...p.accuracyState};assert.equal(shoot(p,r,10001),undefined);assert.deepEqual(p.accuracyState,state);p.reloadUntil=20000;assert.equal(shoot(p,r,11000),undefined);assert.deepEqual(p.accuracyState,state);assert.equal(p.pitch,.123);
});
test('pause/resume shifts recovery and landing deadlines together; no free recovery or lost landing penalty during paused game',()=>{
 const p=actor(),r={phase:'active',players:[p]};shoot(p,r,1000);p.landingUntil=1225;const before=previewAccuracy(p,1100);pauseRoom(r,1100);resumeRoom(r,5100);const after=previewAccuracy(p,5100);assert.equal(after.bloomDegrees,before.bloomDegrees);assert.equal(after.landingDegrees,before.landingDegrees);assert.equal(p.landingUntil,5225);
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<300;n++){const v=fn();if(v)return v;await sleep(10);}throw new Error('Accuracy WS timeout');}
test('real WebSocket jump/landing deadline is server-created, spoofed accuracy fields are ignored, weapon equip clears bloom but preserves landing',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const ws=new WebSocket('ws://127.0.0.1:'+server.address().port);sockets.push(ws);let state,id;const shots=[];ws.on('message',b=>{const m=JSON.parse(b);if(m.type==='welcome')id=m.id;if(m.type==='state')state=m;if(m.type==='shot')shots.push(m);});await new Promise(r=>ws.once('open',r));const send=m=>ws.send(JSON.stringify(m)),me=()=>state?.players.find(p=>p.id===id);
 send({type:'create',map:'training'});await until(()=>me());assert.equal(me().landingUntil,0);
 send({type:'input',yaw:0,pitch:0,jump:true,landingUntil:9999999999999,accuracyState:{level:0},randomSeed:0});await until(()=>me().grounded===false);assert.equal(me().landingUntil,0);
 send({type:'input',yaw:0,pitch:0,jump:false,fire:true,fireEdge:true,clientShotId:1});send({type:'input',yaw:0,pitch:0,fire:false});await until(()=>shots.length);assert.equal(shots[0].accuracy.movementMode,'air');assert.equal(shots[0].accuracy.movementDegrees,10);
 await until(()=>me().grounded&&me().landingUntil>state.now);const landing=me().landingUntil;assert(landing-state.now<=225);send({type:'equip',weapon:'ghost'});await until(()=>me().weapon==='ghost');assert.equal(me().accuracyState,null);assert.equal(me().landingUntil,landing);await until(()=>state.now>=landing);assert.equal(previewAccuracy(me(),state.now).landingDegrees,0);
});
