import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {shoot,server,close} from '../server.mjs';
import {WEAPONS} from '../weapons.mjs';
const clients=[];after(()=>{for(const ws of clients)ws.terminate();close();});
function encounter(weapon,ammo=WEAPONS[weapon].capacity){
 const p={id:'attacker',x:9,z:10,y:0,yaw:0,pitch:Math.atan2(-.62,2),vx:0,vz:0,grounded:true,crouch:false,ads:false,hp:100,weapon,ammo,magazines:{[weapon]:ammo},lastShot:0,nextShotAt:0,equipUntil:0,reloadUntil:0,spray:0,shots:0,hits:0,headHits:0,headKills:0,kills:0};
 const enemy={id:'target',x:9,z:8,y:0,yaw:Math.PI,armor:50,hp:1000,protectedUntil:0,deaths:0};
 return {p,enemy,room:{players:[p,enemy],phase:'active'}};
}
test('Classic alternate fire debits every projectile and produces one aggregate hit event',()=>{
 const {p,enemy,room}=encounter('classic');
 const e=shoot(p,room,10000,'secondary','classic-alt',{randomSeed:4});
 assert.equal(p.ammo,9);assert.equal(p.magazines.classic,9);
 assert.equal(e.pellets.length,3);assert.equal(p.shots,1);
 const sum=e.pellets.reduce((n,h)=>n+h.damage,0);assert.ok(sum>0);assert.equal(e.damage,sum);
 assert.equal(p.hits,1);assert.equal(enemy.hp+enemy.armor,1050-e.damage);
 assert.equal(shoot(p,room,10100,'primary'),undefined,'alternate fire shares primary cooldown');
});
test('Classic cannot produce more pellets than the remaining ammunition',()=>{
 for(const ammo of [1,2]){
  const {p,room}=encounter('classic',ammo),e=shoot(p,room,10000,'secondary',null,{randomSeed:4});
  assert.equal(p.ammo,0);assert.equal(e.pellets.length,ammo);
 }
});
test('Bucky intact canister stops at architecture before detonation and never damages a target behind it',()=>{
 const {p,enemy,room}=encounter('bucky');p.x=0;p.z=5;p.pitch=0;enemy.x=0;enemy.z=-5;
 const e=shoot(p,room,10000,'secondary',null,{randomSeed:4});
 assert.equal(e.damage,0);assert.equal(enemy.hp,1000);assert.equal(e.pellets.length,1);
 assert.ok(e.distance<7.5);assert.equal(p.ammo,4);
});
test('ADS burst continuation preserves its first-shot cycle deadline and consumes one round per bullet',()=>{
 for(const [weapon,times] of [['stinger',[1000/18,2000/18,3000/18]],['bulldog',[1000/13.333,2000/13.333]]]){
  const {p,room}=encounter(weapon);p.ads=true;p.trigger=true;const start=10000;
  shoot(p,room,start,'primary',null,{randomSeed:4});const deadline=start+WEAPONS[weapon].ads.burst.cycleMs;
  assert.equal(p.nextShotAt,deadline);
  for(const t of times)shoot(p,room,start+t,'primary',null,{randomSeed:4,burstContinuation:true});
  assert.equal(p.ammo,WEAPONS[weapon].capacity-WEAPONS[weapon].ads.burst.count);
  assert.equal(p.nextShotAt,deadline,'continuation must not overwrite group cooldown');
  assert.equal(shoot(p,room,deadline-1,'primary'),undefined);
 }
});
test('Odin scope begins at its maximum fire rate while hip fire begins at12rps',()=>{
 for(const ads of [false,true]){
  const {p,room}=encounter('odin');p.ads=ads;
  shoot(p,room,10000,'primary',null,{randomSeed:4});
  const expected=10000+1000/(ads?15.6:12);
  assert.ok(Math.abs(p.nextShotAt-expected)<1e-9,`ads=${ads}: ${p.nextShotAt} versus ${expected}`);
 }
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+5000;while(Date.now()<end){const value=fn();if(value)return value;await sleep(15);}throw Error('Alternate firearm WS condition timed out');}
test('Classic secondary input reaches authoritative shooting without TDZ or duplicate held attacks',{timeout:12000},async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}`);clients.push(ws);
 let state,id;const shots=[],errors=[];
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')id=m.id;if(m.type==='state')state=m;if(m.type==='shot')shots.push(m);if(m.type==='error')errors.push(m);});
 await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
 const send=m=>ws.send(JSON.stringify(m)),me=()=>state?.players.find(p=>p.id===id);
 send({type:'create',preference:{loadout:{primary:'vandal',sidearm:'classic'},weapon:'classic'}});await until(()=>me());
 assert.equal(me().weapon,'classic','catalog must expose integrated Classic before WS test');
 await until(()=>Date.now()>me().equipUntil+50);
 send({type:'input',yaw:0,pitch:0,secondaryFire:true,clientShotId:'classic-secondary'});
 await until(()=>shots.length||errors.length);assert.deepEqual(errors,[]);assert.equal(shots[0].attack,'secondary');
 assert.equal(shots[0].clientShotId,'classic-secondary');assert.equal(shots[0].pellets.length,3);
 const hold=setInterval(()=>send({type:'input',yaw:0,pitch:0,secondaryFire:true,clientShotId:'classic-secondary'}),40);
 try{await sleep(650);}finally{clearInterval(hold);}
 send({type:'input',yaw:0,pitch:0,secondaryFire:false});await until(()=>me().ammo===9);
 assert.equal(shots.length,1,'secondary requires a fresh edge');
});
test('Stinger ADS holds one burst and Bucky per-round reload can stop after a loaded shell',{timeout:25000},async()=>{
 const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}`);clients.push(ws);
 let state,id;const shots=[],errors=[];
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')id=m.id;if(m.type==='state')state=m;if(m.type==='shot')shots.push(m);if(m.type==='error')errors.push(m);});
 await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
 const send=m=>ws.send(JSON.stringify(m)),me=()=>state?.players.find(p=>p.id===id),input=m=>send({type:'input',yaw:Math.PI,pitch:0,...m});
 send({type:'create',preference:{loadout:{primary:'stinger',sidearm:'classic'},weapon:'stinger'}});await until(()=>me());
 assert.equal(me().weapon,'stinger');await until(()=>Date.now()>me().equipUntil+50);
 const hold=setInterval(()=>input({fire:true,ads:true,clientShotId:'stinger-held',fireEdge:false}),40);
 input({fire:true,ads:true,clientShotId:'stinger-held',fireEdge:true});
 try{await sleep(900);}finally{clearInterval(hold);}
 input({fire:false,ads:true});await until(()=>me().ammo===16);
 assert.equal(shots.filter(s=>s.weapon==='stinger').length,4,'holding burst-mode trigger must not repeat bursts');
 assert.deepEqual(errors,[]);
 send({type:'loadout',equipmentSlot:'primary',weapon:'bucky'});await until(()=>me().weapon==='bucky');await until(()=>Date.now()>me().equipUntil+50);
 for(let i=0;i<3;i++){
  input({fire:true,clientShotId:'bucky-'+i,fireEdge:true});
  await until(()=>me().ammo===4-i);input({fire:false});
  if(i<2)await until(()=>Date.now()>me().nextShotAt+30);
 }
 await until(()=>Date.now()>me().nextShotAt+30);
 input({reload:true});await until(()=>me().reloadUntil>0);
 const reloadUntil=me().reloadUntil;
 await until(()=>me().ammo===3&&me().reloadUntil===reloadUntil);
 input({fire:true,clientShotId:'bucky-interrupt',fireEdge:true});
 await until(()=>me().reloadUntil===0&&me().ammo===2);input({fire:false});
 await sleep(1200);assert.equal(me().ammo,2,'cancelled remainder cannot silently fill magazine');
 assert.equal(me().magazines.bucky,2);assert.deepEqual(errors,[]);
});

test('Shorty has no secondary attack and primary still consumes a shell',()=>{const {p,room}=encounter('shorty');assert.equal(shoot(p,room,10000,'secondary'),undefined);assert.equal(p.ammo,2);assert.ok(shoot(p,room,10000,'primary',null,{randomSeed:4}));assert.equal(p.ammo,1);});
