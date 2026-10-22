import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {recordShotSnapshot,resolveShotHistory,clearShotHistory,selectViewSnapshot} from '../lag-compensation.mjs';
import {trace,eyeHeight,direction} from '../shared.mjs';
import {shoot,server,close} from '../server.mjs';
import {WebSocket} from 'ws';
after(close);
function fixture(weapon='vandal'){
 const a={id:'a',x:9,y:0,z:10,yaw:0,pitch:0,vx:0,vz:0,grounded:true,weapon,hp:100,armor:50,lifeEpoch:1,spawnEpoch:1,protectedUntil:0,connected:true,ws:{readyState:1,send(){}},ammo:25,magazines:{},nextShotAt:0,equipUntil:0,reloadUntil:0,lastShot:0,spray:0,shots:0,hits:0,headHits:0,headKills:0,kills:0};
 const b={id:'b',x:9,y:0,z:8,yaw:0,pitch:0,weapon:'vandal',hp:100,armor:50,lifeEpoch:1,spawnEpoch:1,protectedUntil:0,connected:true,ws:{readyState:1,send(){}},deaths:0};
 const r={phase:'active',players:[a,b]};recordShotSnapshot(r,'one',1000);return {a,b,r};
}
function aim(a,target){const h=target.hitboxShapes[0].center;const dx=h.x-a.x,dz=h.z-a.z;return {yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(h.y-eyeHeight(a),Math.hypot(dx,dz))};}
test('both guns hit the historical target without moving actors or applying historical health',()=>{
 for(const weapon of ['vandal','ghost']){
  const {a,b,r}=fixture(weapon);b.x=10;a.viewSnapshot='one';const old=resolveShotHistory(r,a,b,'one',1200);Object.assign(a,aim(a,old.target));
  assert.equal(trace({x:a.x,y:eyeHeight(a),z:a.z},direction(a.yaw,a.pitch),b).part,null);
  const e=shoot(a,r,1200,'primary',31);assert.equal(e.part,'head');assert.equal(e.damage,weapon==='vandal'?160:105);assert(e.rewind.applied);assert.equal(e.rewind.ageMs,200);assert.equal(b.x,10);assert.equal(r.shotHistory[0].actors.b.hp,100);assert.equal(e.killed,weapon==='vandal');
 }
});
test('two issued snapshots interpolate actual capsule endpoints and head centers',()=>{
 const {a,b,r}=fixture();b.x=10;recordShotSnapshot(r,'two',1050);const h=resolveShotHistory(r,a,b,{from:'one',to:'two',alpha:.5},1200);assert(h.rewind.applied);assert.equal(h.rewind.at,1025);
 const first=r.shotHistory[0].actors.b.shapes,last=r.shotHistory[1].actors.b.shapes;
 assert.equal(h.target.hitboxShapes[0].center.x,(first[0].center.x+last[0].center.x)/2);assert.equal(h.target.hitboxShapes[4].a.x,(first[4].a.x+last[4].a.x)/2);
});
test('expired, future, invalid and unissued references cannot select a historical target',()=>{
 const {a,b,r}=fixture();for(const [view,now,reason] of [['one',1400,'expired'],['one',900,'future'],['missing',1200,'unissued'],[{from:'one',to:'one',alpha:2},1200,'invalid']]){const h=resolveShotHistory(r,a,b,view,now);assert(!h.rewind.applied);assert.equal(h.rewind.reason,reason);assert.equal(h.target,b);}
 r.shotHistory[0].issued=[];assert.equal(resolveShotHistory(r,a,b,'one',1200).rewind.reason,'unissued');
});
test('real life changes, weapon changes, deaths and spawn protection block historical references',()=>{
 for(const [change,reason] of [[({b})=>b.lifeEpoch++,'life'],[({a})=>a.lifeEpoch++,'life'],[({a})=>a.weapon='ghost','weapon'],[({b})=>b.hp=0,'dead'],[({b})=>b.protectedUntil=1300,'protected'],[({r})=>r.shotHistory[0].actors.b.protectedUntil=1100,'protected']]){const f=fixture();change(f);assert.equal(resolveShotHistory(f.r,f.a,f.b,'one',1200).rewind.reason,reason);}
});
test('pause flushes snapshot authorization and knives retain contact-time geometry',()=>{
 const {a,b,r}=fixture();clearShotHistory(r);assert.equal(r.shotHistory.length,0);assert.equal(resolveShotHistory(r,a,b,'one',1200).rewind.reason,'unissued');recordShotSnapshot(r,'fresh',1250);r.phase='paused';assert.equal(resolveShotHistory(r,a,b,'fresh',1300).rewind.reason,'phase');r.phase='active';a.weapon='knife';assert.equal(resolveShotHistory(r,a,b,'fresh',1300).rewind.reason,'current');
});
test('rewind keeps static-wall occlusion and a current authoritative shooter origin',()=>{
 const {a,b,r}=fixture();a.x=0;a.z=2;b.x=0;b.z=-2;recordShotSnapshot(r,'wall',1100);b.x=9;
 const h=resolveShotHistory(r,a,b,'wall',1200);Object.assign(a,aim(a,h.target));assert(h.rewind.applied);assert.equal(trace({x:a.x,y:eyeHeight(a),z:a.z},direction(a.yaw,a.pitch),h.target).part,null);
 a.viewSnapshot='wall';const e=shoot(a,r,1200,'primary',32);assert.equal(e.damage,0);assert.equal(e.origin.x,0);assert.equal(e.origin.z,2);
});
test('client selects only compatible received snapshot pairs near the displayed actor',()=>{
 const frames=[0,1,2].map((n)=>({snapshotId:String(n),players:[{id:'a',weapon:'vandal',lifeEpoch:1},{id:'b',x:n,y:0,z:0,lifeEpoch:1}]}));
 assert.deepEqual(selectViewSnapshot(frames,{x:.6,y:0,z:0},'b','a','vandal',1),{from:'0',to:'1',alpha:.6});assert.equal(selectViewSnapshot(frames,{x:0,y:0,z:0},'b','a','ghost',1),null);
});

test('history is bounded and new-life client selection cannot choose old-life pairs',()=>{
 const {r}=fixture();for(let n=1;n<=30;n++)recordShotSnapshot(r,'f'+n,1000+n*50);assert(r.shotHistory.length<=11);assert(r.shotHistory.every(f=>f.at>=2000));
 const frames=[{snapshotId:'old',players:[{id:'a',weapon:'vandal',lifeEpoch:1},{id:'b',x:0,y:0,z:0,lifeEpoch:1}]},{snapshotId:'new',players:[{id:'a',weapon:'vandal',lifeEpoch:1},{id:'b',x:9,y:0,z:0,lifeEpoch:2}]}];
 assert.deepEqual(selectViewSnapshot(frames,{x:9,y:0,z:0},'b','a','vandal',1),{from:'new',to:'new',alpha:0});
});
test('real input duplicates and foreign lives cannot replay shots; held auto fire still works',{timeout:15000},async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}`),events=[];let state,welcome;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let i=0;i<500;i++){if(fn())return fn();await sleep(10);}throw Error('shot input timeout');}
 ws.on('message',b=>{const m=JSON.parse(b);if(m.type==='state')state=m;if(m.type==='welcome')welcome=m;if(m.type==='shot')events.push(m);});
 await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const send=m=>ws.send(JSON.stringify(m));const me=()=>state.players.find(p=>p.id===welcome.id);
 try{
  send({type:'create'});await until(()=>state&&welcome);const input=(fire,id,life=me().lifeEpoch,view=state.snapshotId)=>({type:'input',yaw:0,pitch:0,fire,clientShotId:id,shotLife:life,viewSnapshot:view});
  send(input(true,51));await sleep(35);send(input(false,51));await until(()=>me().ammo===24);await sleep(150);
  send(input(true,51));await sleep(35);send(input(false,51));await sleep(200);assert.equal(events.length,1,'replayed accepted edge is ignored');
  send(input(true,52,me().lifeEpoch+1));await sleep(35);send(input(false,52));await sleep(200);assert.equal(events.length,1,'foreign life rejected');
  const heartbeat=setInterval(()=>send(input(true,53)),40);send(input(true,53));await sleep(285);clearInterval(heartbeat);send(input(false,53));await sleep(180);
  assert(events.filter(e=>e.clientShotId===53).length>=3,'holding the trigger keeps server-owned automatic cadence');assert.equal(new Set(events.map(e=>e.shotId)).size,events.length);
  send(input(true,54,me().lifeEpoch,'foreign-room-ticket'));await sleep(35);send(input(false,54));await until(()=>events.some(e=>e.clientShotId===54));assert.equal(events.find(e=>e.clientShotId===54).rewind.reason,'unissued');
  const held=setInterval(()=>send({...input(true,55),fireEdge:false}),40);send({...input(true,55),fireEdge:true});await until(()=>me().ammo===0);clearInterval(held);send({...input(false,55),reload:true});await until(()=>me().reloadUntil>0);
  const count=events.length,continuation=setInterval(()=>send({...input(true,55),fireEdge:false}),40);
  try{await until(()=>events.length>count+1);}finally{clearInterval(continuation);send(input(false,55));}
  assert(events.length>count,'same held intent resumes after automatic reload without a fresh click');

 }finally{ws.terminate();}
});
