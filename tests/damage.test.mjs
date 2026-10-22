import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {WEAPONS,hitDamage,applyDamage,isBackstab} from '../weapons.mjs';
import {trace,direction} from '../shared.mjs';
import {shoot,server,close} from '../server.mjs';
import {sampleSpreadDirection,shotRandom} from '../accuracy.mjs';
const sockets=[];after(()=>{sockets.forEach(ws=>ws.terminate());close();});
test('damage table, exact Ghost boundary, armor depletion and lethal shot counts',()=>{
 assert.equal(WEAPONS.ghost.capacity,13);
 for(const [part,v,n,f] of [['head',160,105,87],['body',40,30,25],['leg',34,25,21]]){
  assert.equal(hitDamage('vandal',part,49),v);assert.equal(hitDamage('ghost',part,30),n);assert.equal(hitDamage('ghost',part,30.0001),f);
 }
 for(const [armor,count] of [[0,3],[25,4],[50,4]]){
  const p={hp:100,armor};for(let i=1;i<=count;i++){applyDamage(p,40);assert.equal(p.hp===0,i===count);}
 }
 const p={hp:100,armor:25};const result=applyDamage(p,40);assert.equal(result.armorDamage,25);assert.equal(p.hp,85);assert.equal(p.armor,0);
 const q={hp:100,armor:50};applyDamage(q,30);assert.ok(Math.abs(q.hp-89.8)<1e-10);assert.ok(Math.abs(q.armor-30.2)<1e-10);
 for(const armor of [0,25,50]){const p={hp:100,armor};applyDamage(p,160);assert.equal(p.hp,0);}
 assert.equal(isBackstab({x:0,z:1},{x:0,z:0,yaw:0}),true);
 assert.equal(isBackstab({x:0,z:-1},{x:0,z:0,yaw:0}),false);
});
test('standing, crouching, airborne leg hitboxes and cover occlusion',()=>{
 for(const [crouch,y,height] of [[false,0,.35],[true,0,.3],[false,1,1.35]]){
  assert.equal(trace({x:7.17,y:height,z:8},direction(0,0),{x:7,z:-8,y,crouch,hp:100}).part,'leg');
 }
 assert.equal(trace({x:0,y:.35,z:8},direction(0,0),{x:0,z:-8,hp:100}).part,null);
});
test('authoritative Vandal impacts apply part damage and armor, retain spawn immunity',()=>{
 for(const [part,height,expected] of [['head',1.62,160],['body',1,40],['leg',.35,34]]){
  const p={id:'a',x:part==='leg'?9.17:9,z:10,yaw:0,pitch:Math.atan2(height-1.62,2),y:0,vx:0,vz:0,grounded:true,hp:100,weapon:'vandal',ammo:25,magazines:{vandal:25},lastShot:0,nextShotAt:0,equipUntil:0,reloadUntil:0,spray:0,shots:0,hits:0,headHits:0,headKills:0,kills:0};
  const enemy={id:'b',x:9,z:8,y:0,hp:100,armor:50,protectedUntil:0,deaths:0};const room={players:[p,enemy],phase:'active'};
  const event=shoot(p,room,10000,'primary',null,{randomSeed:42});assert.equal(event.part,part);assert.equal(event.damage,expected);assert.equal(event.armorDamage,Math.min(50,expected*.66));assert.equal(p.ammo,24);
  if(part==='head'){assert.equal(enemy.hp,0);assert.equal(p.headKills,1);}else assert.ok(enemy.hp>0);
  enemy.hp=100;enemy.armor=50;enemy.protectedUntil=20000;
  assert.equal(shoot(p,room,11000).damage,0);assert.equal(enemy.armor,50);
 }
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('server ray uses actual retained aim without adding vertical recoil twice',()=>{

  const p={id:'aim',x:9,z:10,yaw:0,pitch:.123,y:0,vx:0,vz:0,grounded:true,hp:100,weapon:'vandal',ammo:25,magazines:{vandal:25},lastShot:0,nextShotAt:0,equipUntil:0,reloadUntil:0,spray:14,shots:0,hits:0,headHits:0,headKills:0,kills:0};
  const event=shoot(p,{players:[p],phase:'waiting'},10000,'primary',null,{randomSeed:42});
  const length=Math.hypot(event.end.x-event.origin.x,event.end.y-event.origin.y,event.end.z-event.origin.z);
  const expected=sampleSpreadDirection(p.yaw,p.pitch,event.accuracy.totalDegrees,shotRandom(event.accuracy.seed));
  assert(Math.abs((event.end.y-event.origin.y)/length-expected.y)<1e-10);
  assert.equal(p.pitch,.123);

});
async function until(fn){for(let n=0;n<200;n++){if(fn())return fn();await sleep(20);}throw Error('Room state timeout');}
test('room armor is shared, validated and Ghost spawn magazines are 13',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 async function client(){const ws=new WebSocket('ws://127.0.0.1:'+server.address().port);sockets.push(ws);const c={ws};ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')c.id=m.id;if(m.type==='state')c.state=m;});await new Promise(r=>ws.once('open',r));c.send=m=>ws.send(JSON.stringify(m));return c;}
 for(const [request,expected] of [[undefined,50],[0,0],[25,25],[50,50],[-10,50]]){
  const a=await client();a.send({type:'create',armor:request});await until(()=>a.state);assert.equal(a.state.armor,expected);assert.equal(a.state.players[0].armor,expected);assert.equal(a.state.players[0].magazines.ghost,13);
  const b=await client();b.send({type:'join',code:a.state.code,armor:0});await until(()=>a.state.players.length===2);assert.ok(a.state.players.every(p=>p.hp===100&&p.armor===expected&&p.magazines.ghost===13));assert.equal(a.state.armor,b.state?.armor??expected);
  a.ws.terminate();b.ws.terminate();
 }
});

test('Ghost accepts a new shot at 6.75 rps deadline and blocks earlier attempts',()=>{
 const p={id:'cadence',x:9,z:10,yaw:0,pitch:0,y:0,vx:0,vz:0,grounded:true,hp:100,weapon:'ghost',ammo:13,magazines:{ghost:13},lastShot:0,nextShotAt:0,equipUntil:0,reloadUntil:0,spray:0,shots:0};
 const room={players:[p],phase:'waiting'};
 assert.ok(shoot(p,room,10000));
 assert.equal(shoot(p,room,10148),undefined);
 assert.equal(p.ammo,12);
 assert.ok(shoot(p,room,10000+1000/6.75));
 assert.equal(p.ammo,11);
 assert.equal(p.shots,2);
});
