import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {server,close,spawn} from '../server.mjs';
import {WEAPONS,hitDamage,weaponShotInterval,weaponRunSpeed} from '../weapons.mjs';
import {normalizeLoadout} from '../loadout.mjs';
import {previewAccuracy} from '../accuracy.mjs';
import {planCombatFeedback,planConfirmedGunSound} from '../public/combat-feedback.mjs';

test('fresh Wiki weapon values and range boundaries stay distinct',()=>{
 assert.equal(WEAPONS.phantom.capacity,30);assert.equal(weaponShotInterval('phantom'),1000/11);assert.equal(weaponShotInterval('phantom',true),1000/9.9);assert.equal(weaponRunSpeed('phantom',true),4.104);
 for(const [gun,distance,expected]of [['phantom',20,[156,39,33]],['phantom',20.001,[140,35,29]],['sheriff',30,[159,55,46]],['sheriff',30.001,[145,50,42]]])assert.deepEqual(['head','body','leg'].map(part=>hitDamage(gun,part,distance)),expected);
 assert.equal(WEAPONS.sheriff.interval,250);assert.equal(WEAPONS.sheriff.capacity,6);assert.equal(WEAPONS.sheriff.reload,2250);assert.equal(WEAPONS.phantom.reload,2500);
});
test('new firearms use their own spread profiles, not melee or a renamed old rifle',()=>{
 const p={weapon:'phantom',grounded:true,vx:0,vz:0};assert.equal(previewAccuracy(p,1000).baseDegrees,.2);p.ads=true;assert.equal(previewAccuracy(p,1000).baseDegrees,.11);
 p.weapon='sheriff';p.ads=false;assert.equal(previewAccuracy(p,1000).baseDegrees,.25);p.grounded=false;assert.equal(previewAccuracy(p,1000).movementDegrees,7);
});
test('new guns retain firearm hit and kill audio layers and selected loadout on respawn',()=>{
 for(const weapon of ['phantom','sheriff']){const shot={type:'shot',id:'owner',weapon,shotId:4,damage:100,armorDamage:50,killed:true};assert.deepEqual(planCombatFeedback(shot,'owner').sounds.map(s=>s.sound),['shield-hit','kill']);assert.equal(planConfirmedGunSound(shot,{own:true}).event,'fire');}
 const p={slot:0,weapon:'sheriff',loadout:normalizeLoadout({primary:'phantom',sidearm:'sheriff'}),hp:0,ammo:0};spawn(p,{players:[p],map:'training',armor:50});assert.equal(p.weapon,'sheriff');assert.equal(p.ammo,6);assert.equal(p.magazines.phantom,30);assert.equal(p.loadout.primary,'phantom');
});

await new Promise(r=>server.listen(0,'127.0.0.1',r));const clients=[];after(()=>{clients.forEach(ws=>ws.terminate());close();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+7000;while(Date.now()<end){if(fn())return fn();await sleep(20);}throw Error('New weapon server condition timed out');}
test('same-slot selection keeps all gun magazines, Sheriff held fires once, Phantom holds automatic fire and ADS',{timeout:20000},async()=>{
 const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}`);clients.push(ws);let state,id;const shots=[];
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='state')state=m;if(m.type==='welcome')id=m.id;if(m.type==='shot')shots.push(m);});await new Promise(r=>ws.once('open',r));const send=m=>ws.send(JSON.stringify(m)),me=()=>state?.players.find(p=>p.id===id),input=m=>send({type:'input',yaw:0,pitch:0,...m});
 send({type:'create',preference:{loadout:{primary:'phantom',sidearm:'sheriff'},weapon:'sheriff'}});await until(()=>me());assert.equal(me().ammo,6);
 const hold=setInterval(()=>input({fire:true}),40);await sleep(650);clearInterval(hold);input({fire:false});await until(()=>me().ammo===5);assert.equal(shots.filter(s=>s.weapon==='sheriff').length,1);
 send({type:'loadout',equipmentSlot:'primary',weapon:'phantom'});await until(()=>me().weapon==='phantom');assert.equal(me().magazines.sheriff,5);await until(()=>Date.now()>me().equipUntil+50);
 const auto=setInterval(()=>input({fire:true,ads:true}),40);await sleep(600);clearInterval(auto);const stoppedAt=Date.now();input({fire:false,ads:true});await until(()=>state.now>stoppedAt+120);assert.ok(shots.filter(s=>s.weapon==='phantom').length>=4);assert.equal(me().ads,true);
 const ammo=me().ammo,hp=me().hp,armor=me().armor;send({type:'loadout',equipmentSlot:'primary',weapon:'vandal'});await until(()=>me().weapon==='vandal');assert.equal(me().magazines.phantom,ammo);
 send({type:'loadout',equipmentSlot:'primary',weapon:'phantom'});await until(()=>me().weapon==='phantom');assert.equal(me().ammo,ammo);assert.equal(me().hp,hp);assert.equal(me().armor,armor);
 send({type:'loadout',equipmentSlot:'sidearm',weapon:'sheriff'});await until(()=>me().weapon==='sheriff');assert.equal(me().ammo,5);
 await until(()=>Date.now()>me().equipUntil+50);input({reload:true});await until(()=>me().reloadUntil>0);const time=me().reloadUntil-state.now;assert(time<=2250&&time>2100);await until(()=>me().ammo===6&&!me().reloadUntil);
});
