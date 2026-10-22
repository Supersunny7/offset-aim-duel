import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {WEAPONS} from '../weapons.mjs';
import {shoot,resolveMelee,server,close} from '../server.mjs';
const clients=[];after(()=>{clients.forEach(ws=>ws.terminate());close();});
function encounter(distance=1.2,pitch=0){
 const p={id:'attacker',x:9,z:10,y:0,yaw:0,pitch,vx:5,vz:1,grounded:false,hp:100,weapon:'knife',ammo:-1,magazines:{knife:-1},lastShot:0,nextShotAt:0,equipUntil:0,reloadUntil:0,spray:0,shots:0,hits:0,headHits:0,headKills:0,kills:0};
 const enemy={id:'target',x:9,z:10-distance,y:0,yaw:Math.PI,armor:0,hp:100,protectedUntil:0,deaths:0};
 return {p,enemy,room:{players:[p,enemy],phase:'active'}};
}
test('knife facing damage, no head bonus, separate ranges and shared cooldown',()=>{
 for(const [attack,front,back,interval] of [['primary',50,100,500],['secondary',75,150,1000]]){
  for(const rear of [false,true])for(const pitch of [0,Math.atan2(-.62,1.2)]){
   const e=encounter(1.2,pitch);e.enemy.yaw=rear?0:Math.PI;
   const start=shoot(e.p,e.room,10000,attack,41);assert.equal(start.damage,0);assert.equal(e.enemy.hp,100);
   assert.deepEqual(e.p.hitboxAction,{weapon:'knife',kind:attack,at:10000});assert.deepEqual(e.p.hitboxFire,[]);
   const event=resolveMelee(e.p,e.room,start.impactAt);assert.equal(event.damage,rear?back:front);assert.equal(event.part,'body');assert.equal(event.backstab,rear);assert.equal(event.clientShotId,41);
   assert.equal(e.p.headHits,0);assert.equal(e.p.headKills,0);assert.equal(e.p.nextShotAt,10000+interval);
   assert.equal(shoot(e.p,e.room,10000+interval-1,attack==='primary'?'secondary':'primary'),undefined);
   if(event.killed){assert.equal(e.enemy.deathPart,'body');assert.equal(e.enemy.respawnAt,start.impactAt+2000);}
  }
 }
 const turn=encounter();const windup=shoot(turn.p,turn.room,10000);turn.enemy.yaw=0;
 assert.equal(resolveMelee(turn.p,turn.room,windup.impactAt).damage,100,'facing sampled at contact');
 // Aim at abdomen: an outstretched arm may legitimately enter heavy range.
 const long=encounter(1.8,Math.atan2(-.62,1.8));const light=shoot(long.p,long.room,10000);
 assert.equal(resolveMelee(long.p,long.room,light.impactAt).damage,50);
 const short=encounter(1.8,Math.atan2(-.62,1.8));const heavy=shoot(short.p,short.room,10000,'secondary');const miss=resolveMelee(short.p,short.room,heavy.impactAt);
 assert.equal(miss.damage,0);assert.ok(Math.abs(Math.hypot(miss.end.x-miss.origin.x,miss.end.y-miss.origin.y,miss.end.z-miss.origin.z)-1.6)<1e-10);
 let previous;for(let n=0;n<20;n++){const e=encounter(1.2,Math.atan2(-.62,1.2)),start=shoot(e.p,e.room,10000),event=resolveMelee(e.p,e.room,start.impactAt);if(previous)assert.deepEqual(event.end,previous);previous=event.end;}
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('melee contact is delayed, sampled at contact, single-use and cancels on interruption',()=>{
 const e=encounter(1.2,Math.atan2(-.62,1.2));const start=shoot(e.p,e.room,10000,'primary');
 assert.equal(start.impactAt,10000+WEAPONS.knife.contact);assert.equal(resolveMelee(e.p,e.room,10000+WEAPONS.knife.contact-1),undefined);assert.equal(e.enemy.hp,100);
 e.enemy.z=5;const miss=resolveMelee(e.p,e.room,10000+WEAPONS.knife.contact);assert.equal(miss.damage,0,'moving out of reach during windup avoids hit');
 assert.equal(resolveMelee(e.p,e.room,11000),undefined,'one impact only');
 for(const change of [p=>p.hp=0,p=>p.weapon='ghost',p=>p.spawnEpoch=1,p=>p.connected=false]){
  const e=encounter();shoot(e.p,e.room,10000,'secondary');change(e.p);
  assert.equal(resolveMelee(e.p,e.room,10000+WEAPONS.knife.secondary.contact),undefined);assert.equal(e.enemy.hp,100);assert.equal(e.p.pendingMelee,null);
 }
 const paused=encounter();shoot(paused.p,paused.room,10000);paused.room.phase='paused';assert.equal(resolveMelee(paused.p,paused.room,10000+WEAPONS.knife.contact),undefined);assert.equal(paused.enemy.hp,100);
});
async function until(fn){const end=Date.now()+4000;while(Date.now()<end){if(fn())return fn();await sleep(15);}throw Error('Melee input timed out');}
test('secondary input is edge-triggered, identifies its client shot, and simultaneous buttons yield one heavy attack',{timeout:10000},async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}`);clients.push(ws);
 let state,id;const events=[],impacts=[];
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')id=m.id;if(m.type==='state')state=m;if(m.type==='shot')events.push(m);if(m.type==='melee-hit')impacts.push(m);});
 await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const send=m=>ws.send(JSON.stringify(m)),me=()=>state?.players.find(p=>p.id===id);
 send({type:'create'});await until(()=>me());send({type:'equip',weapon:'knife'});await until(()=>me().weapon==='knife');await until(()=>Date.now()>me().equipUntil+50);
 send({type:'input',yaw:0,pitch:0,fire:true,secondaryFire:true,clientShotId:'heavy-1'});send({type:'input',yaw:0,pitch:0,fire:false,secondaryFire:false});
 await until(()=>events.length===1);assert.equal(events[0].attack,'secondary');assert.equal(events[0].clientShotId,'heavy-1');await until(()=>impacts.length===1);assert.equal(impacts[0].shotId,events[0].shotId);assert(impacts[0].occurredAt>=events[0].impactAt);assert(impacts[0].occurredAt-events[0].impactAt<100);assert.equal(events[0].impactAt-events[0].startedAt,WEAPONS.knife.secondary.contact);
 await sleep(1100);const timer=setInterval(()=>send({type:'input',yaw:0,pitch:0,secondaryFire:true,clientShotId:'heavy-held'}),40);
 try{await sleep(1300);}finally{clearInterval(timer);}
 assert.equal(events.length,2,'holding heavy attack never repeats');assert.equal(events[1].clientShotId,'heavy-held');assert.ok(events[1].shotId>events[0].shotId);
});
