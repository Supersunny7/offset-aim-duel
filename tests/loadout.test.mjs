import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {server,close,spawn} from '../server.mjs';
import {DEFAULT_LOADOUT,normalizeLoadout,planLoadoutChange,loadoutOrder,readLoadoutPreference,saveLoadoutPreference} from '../loadout.mjs';
import {EQUIPMENT,AGENTS,VARIANTS} from '../equipment-catalog.mjs';
import {WEAPONS} from '../weapons.mjs';
import {createWeaponWheel} from '../public/look-input.mjs';
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`ws://127.0.0.1:${server.address().port}`,clients=[];
after(()=>{for(const c of clients)c.ws.terminate();close();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){const result=fn();if(result)return result;await sleep(15);}throw Error('Loadout condition timed out');}
async function client(){const ws=new WebSocket(url),c={ws,events:[],state:null};clients.push(c);ws.on('message',raw=>{const m=JSON.parse(raw);c.events.push(m);if(m.type==='state')c.state=m;if(m.type==='welcome')Object.assign(c,{id:m.id,token:m.token,code:m.code});});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});c.send=m=>ws.send(JSON.stringify(m));c.me=()=>c.state?.players.find(p=>p.id===c.id);return c;}

test('catalog separates provided resources from playable models',()=>{
 assert.equal(EQUIPMENT.filter(w=>w.id!=='knife').length,17);assert.equal(VARIANTS.length,14);assert.equal(AGENTS.length,21);
 assert.equal(new Set([...EQUIPMENT,...VARIANTS].map(w=>w.source)).size,32);
 assert.deepEqual(EQUIPMENT.filter(w=>w.ready).map(w=>w.id).sort(),['ares','bucky','bulldog','classic','frenzy','ghost','guardian','judge','knife','marshal','odin','operator','phantom','sheriff','shorty','spectre','stinger','vandal']);
 for(const item of EQUIPMENT)assert.ok(WEAPONS[item.id],`${item.id}: a ready source needs authoritative weapon rules`);
 assert.equal(EQUIPMENT.some(w=>['outlaw','bandit','warden'].includes(w.id)),false,'unprovided weapon assets stay unavailable');
 assert.deepEqual(AGENTS.filter(a=>a.ready).map(a=>a.id),['jett']);
 assert.equal(EQUIPMENT.find(w=>w.id==='ares').source,'Weapons/Aries.blend');
});
test('slot and readiness validation rejects unavailable guns, skins and heroes atomically',()=>{
 for(const request of [{weapon:'ghost',equipmentSlot:'primary'},{weapon:'outlaw',equipmentSlot:'primary'},{weapon:'ghost',equipmentSlot:'sidearm',skin:'infantryghost'},{hero:'sage'},{hero:'sage',weapon:'ghost',equipmentSlot:'sidearm'}])assert.ok(planLoadoutChange(DEFAULT_LOADOUT,request).error);
 for(const [weapon,equipmentSlot] of [['classic','sidearm'],['operator','primary']])assert.equal(planLoadoutChange(DEFAULT_LOADOUT,{weapon,equipmentSlot}).loadout[equipmentSlot],weapon);
 assert.deepEqual(normalizeLoadout({primary:'ghost',sidearm:'operator',melee:'primeaxe',hero:'sage',skins:{primary:'aristocratvandal'}}),normalizeLoadout(null));
 const original=normalizeLoadout(null);const changed=planLoadoutChange(original,{weapon:'ghost',equipmentSlot:'sidearm'});changed.loadout.skins.sidearm='test';assert.equal(original.skins.sidearm,'default');
});
test('respawn restores the selected weapon and loadout without sharing magazine objects',()=>{
 const p={slot:0,weapon:'ghost',loadout:normalizeLoadout(null),hp:0,ammo:3,magazines:{ghost:3},lifeEpoch:1};const room={players:[p],armor:25,map:'training'};
 spawn(p,room);assert.equal(p.weapon,'ghost');assert.equal(p.ammo,13);assert.equal(p.hp,100);assert.equal(p.armor,25);assert.equal(p.lifeEpoch,2);assert.equal(p.loadout.hero,'jett');
 p.weapon='operator';spawn(p,room);assert.equal(p.weapon,'vandal','invalid active weapon cannot survive respawn');
});
test('preferences tolerate blocked storage and invalid records without making pending assets playable',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(k,v)=>data.set(k,v)};saveLoadoutPreference(storage,{loadout:DEFAULT_LOADOUT,weapon:'ghost'});assert.equal(readLoadoutPreference(storage).weapon,'ghost');
 data.set('offset:loadout-v1','{broken');assert.equal(readLoadoutPreference(storage).weapon,'vandal');
 assert.doesNotThrow(()=>saveLoadoutPreference({setItem(){throw Error('blocked');}},{loadout:DEFAULT_LOADOUT,weapon:'knife'}));
 assert.equal(readLoadoutPreference({getItem(){throw Error('blocked');}}).loadout.hero,'jett');
});
test('wheel follows loadout order rather than a fixed weapon catalog',()=>{
 const w=createWeaponWheel();assert.equal(w.next({deltaY:100,deltaMode:0},'vandal',0,['knife','vandal','ghost']),'ghost');assert.equal(w.next({deltaY:100,deltaMode:0},'ghost',100,['knife','vandal','ghost']),'knife');
 assert.deepEqual(loadoutOrder(null),['vandal','ghost','knife']);
});
test('authoritative free selection keeps ammo, health, armor and cadence; rejects unready assets and survives resume',{timeout:15000},async()=>{
 const a=await client();a.send({type:'create',armor:25,preference:{loadout:DEFAULT_LOADOUT,weapon:'ghost'}});await until(()=>a.me());assert.equal(a.me().weapon,'ghost');assert.equal(a.me().ammo,13);
 a.send({type:'input',yaw:0,pitch:0,fire:true});a.send({type:'input',yaw:0,pitch:0,fire:false});await until(()=>a.me().ammo===12);
 const before=structuredClone(a.me());a.send({type:'loadout',requestId:1,equipmentSlot:'primary',weapon:'vandal'});const ack=await until(()=>a.events.find(e=>e.type==='loadout-result'&&e.requestId===1));assert.equal(ack.ok,true);await until(()=>a.me().weapon==='vandal');
 assert.equal(a.me().magazines.ghost,12);assert.equal(a.me().hp,before.hp);assert.equal(a.me().armor,before.armor);assert.equal(a.me().nextShotAt,before.nextShotAt);assert.equal(a.me().loadout.hero,'jett');
 for(const [requestId,change] of [[2,{weapon:'outlaw',equipmentSlot:'primary'}],[3,{weapon:'ghost',equipmentSlot:'primary'}],[4,{hero:'sage'}],[5,{weapon:'ghost',equipmentSlot:'sidearm',skin:'infantryghost'}]]){a.send({type:'loadout',requestId,...change});assert.equal((await until(()=>a.events.find(e=>e.type==='loadout-result'&&e.requestId===requestId))).ok,false);assert.equal(a.me().weapon,'vandal');}
 a.send({type:'loadout',requestId:6,equipmentSlot:'sidearm',weapon:'ghost'});await until(()=>a.me().weapon==='ghost');assert.equal(a.me().ammo,12);
 const old={code:a.code,token:a.token,id:a.id};await new Promise(r=>{a.ws.once('close',r);a.ws.close();});
 const b=await client();b.send({type:'resume',...old});await until(()=>b.me());assert.equal(b.id,old.id);assert.equal(b.me().ammo,12);assert.equal(b.me().weapon,'ghost');assert.deepEqual(b.me().loadout,DEFAULT_LOADOUT);
});
test('two clients see each other equipment, paused room rejects shop changes, reconnect preserves loadout',{timeout:10000},async()=>{
 const a=await client();a.send({type:'create',preference:{loadout:{primary:'outlaw',hero:'sage'},weapon:'outlaw'}});await until(()=>a.me());assert.equal(a.me().weapon,'vandal');assert.equal(a.me().loadout.hero,'jett');
 const b=await client();b.send({type:'join',code:a.code,preference:{loadout:DEFAULT_LOADOUT,weapon:'knife'}});await until(()=>a.state?.players.length===2&&b.me());assert.equal(b.me().weapon,'knife');
 a.send({type:'loadout',requestId:10,equipmentSlot:'sidearm',weapon:'ghost'});await until(()=>b.state?.players.find(p=>p.id===a.id)?.weapon==='ghost');assert.equal(a.me().loadout.sidearm,'ghost');
 await new Promise(r=>{b.ws.once('close',r);b.ws.close();});await until(()=>a.state?.phase==='paused');const before=structuredClone(a.me());
 a.send({type:'loadout',requestId:11,equipmentSlot:'primary',weapon:'vandal'});assert.equal((await until(()=>a.events.find(e=>e.type==='loadout-result'&&e.requestId===11))).ok,false);await sleep(70);assert.equal(a.me().weapon,before.weapon);assert.equal(a.me().ammo,before.ammo);
 const c=await client();c.send({type:'resume',code:b.code,token:b.token});await until(()=>c.me()&&a.state?.phase!=='paused');assert.equal(c.me().weapon,'knife');assert.deepEqual(c.me().loadout,DEFAULT_LOADOUT);
});
