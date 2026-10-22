import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {WEAPONS} from '../weapons.mjs';
import {server,close} from '../server.mjs';
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const clients=[],url=`ws://127.0.0.1:${server.address().port}`;
after(()=>{clients.forEach(c=>c.ws.terminate());close();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+5000;while(Date.now()<end){if(fn())return fn();await sleep(15);}throw Error('Combat synchronization timed out');}
async function client(){const ws=new WebSocket(url),c={ws,shots:[]};clients.push(c);ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')c.welcome=m;if(m.type==='state')c.state=m;if(m.type==='shot')c.shots.push(m);});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});c.send=m=>ws.send(JSON.stringify(m));return c;}
test('peer sees authoritative fire IDs, reload/equip deadlines and knife variants',{timeout:20000},async()=>{
 const a=await client(),b=await client();a.send({type:'create',name:'Combat QA'});await until(()=>a.welcome);b.send({type:'join',code:a.welcome.code,name:'Observer'});
 await until(()=>b.state?.phase==='active');const peer=()=>b.state.players.find(p=>p.id===a.welcome.id);
 const input=m=>a.send({type:'input',yaw:0,pitch:0,...m});
 input({fire:true});input({fire:false});await until(()=>a.shots.length===1&&b.shots.length===1);
 assert.equal(b.shots[0].id,a.welcome.id);assert.equal(b.shots[0].shotId,a.shots[0].shotId);assert.equal(peer().weapon,'vandal');
 input({reload:true});await until(()=>peer().reloadUntil>b.state.now);
 const reloadRemaining=(peer().reloadUntil-b.state.now)/1000;assert.ok(reloadRemaining>WEAPONS.vandal.reload/1000-.15&&reloadRemaining<=WEAPONS.vandal.reload/1000);
 a.send({type:'equip',weapon:'ghost'});await until(()=>peer().weapon==='ghost');assert.equal(peer().reloadUntil,0);assert.ok(peer().equipUntil>b.state.now);
 await until(()=>peer().equipUntil<=b.state.now);input({fire:true});input({fire:false});await until(()=>b.shots.length===2);assert.equal(b.shots[1].weapon,'ghost');
 a.send({type:'equip',weapon:'knife'});await until(()=>peer().weapon==='knife'&&peer().equipUntil<=b.state.now);
 await sleep(260);input({secondaryFire:true});input({secondaryFire:false});await until(()=>b.shots.length===3);assert.equal(b.shots[2].attack,'secondary');
 await sleep(1020);input({fire:true});input({fire:false});await until(()=>b.shots.length===4);assert.equal(b.shots[3].attack,'primary');
 assert.equal(new Set(b.shots.map(s=>s.shotId)).size,4);
 console.log(JSON.stringify({peerEvents:b.shots.map(({shotId,weapon,attack})=>({shotId,weapon,attack})),reloadRemaining,cancelledReload:peer().reloadUntil}));
});
