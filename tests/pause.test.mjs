import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {server,close,pauseRoom,resumeRoom} from '../server.mjs';
const clients=[];after(()=>{clients.forEach(c=>c.ws.terminate());close();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<350;n++){if(fn())return fn();await sleep(15);}throw Error('Pause state timed out');}
test('pause freezes all gameplay deadlines and cancels queued inputs once',()=>{
 const p={reloadUntil:12200,equipUntil:11634,nextShotAt:10500,respawnAt:12000,protectedUntil:11500,lastShot:10000,moveAck:6,moveReceived:9,moveQueue:[{}],input:{forward:true},trigger:true,shotQueued:true,pendingMelee:{impactAt:10115}};
 p.hitboxAction={weapon:'vandal',kind:'reload',at:10000};p.hitboxFire=[{weapon:'vandal',at:9900},{weapon:'vandal',at:10000}];
 const room={phase:'active',players:[p]};pauseRoom(room,10100);pauseRoom(room,11000);
 assert.equal(room.pausedAt,10100);assert.equal(p.pendingMelee,null);assert.equal(p.trigger,false);assert.deepEqual(p.moveQueue,[]);
 resumeRoom(room,14100);assert.equal(room.phase,'active');
 assert.equal(p.hitboxAction.at,14000);assert.deepEqual(p.hitboxFire.map(e=>e.at),[13900,14000]);
 for(const [key,value] of Object.entries({reloadUntil:16200,equipUntil:15634,nextShotAt:14500,respawnAt:16000,protectedUntil:15500,lastShot:14000}))assert.equal(p[key],value,key);
 const countdown={phase:'countdown',players:[],startAt:13000};pauseRoom(countdown,11000);resumeRoom(countdown,16000);assert.equal(countdown.startAt,19000);
});
test('real reconnect preserves unfinished reload and rejects paused reload/fire',{timeout:12000},async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`ws://127.0.0.1:${server.address().port}`;
 async function client(){const ws=new WebSocket(url),c={ws,shots:[]};clients.push(c);ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')c.welcome=m;if(m.type==='state')c.state=m;if(m.type==='shot')c.shots.push(m);});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});c.send=m=>ws.send(JSON.stringify(m));return c;}
 const a=await client();a.send({type:'create'});await until(()=>a.state);const me=()=>a.state.players.find(p=>p.id===a.welcome.id);
 a.send({type:'input',yaw:0,pitch:0,fire:true});a.send({type:'input',yaw:0,pitch:0,fire:false});await until(()=>me().ammo===24);
 a.send({type:'input',yaw:0,pitch:0,reload:true});await until(()=>me().reloadUntil>0);assert.equal(me().hitboxAction.kind,'reload');assert.deepEqual(me().hitboxFire,[]);const original=me().reloadUntil,saved=a.welcome;
 a.ws.close();await sleep(2600);
 const re=await client();re.send({type:'resume',code:saved.code,token:saved.token});await until(()=>re.state?.phase==='waiting');const p=()=>re.state.players.find(p=>p.id===saved.id);
 assert.equal(p().ammo,24,'reload did not complete during disconnection');assert.ok(p().reloadUntil-original>2500);assert.ok(p().reloadUntil-re.state.now>1800);
 await until(()=>p().ammo===25);assert.equal(p().reloadUntil,0);
 const b=await client();b.send({type:'join',code:saved.code});await until(()=>re.state.phase==='active');b.ws.close();await until(()=>re.state.phase==='paused');
 const shots=p().shots;re.send({type:'input',yaw:2,pitch:1,fire:true,reload:true});await sleep(150);assert.equal(p().shots,shots);assert.equal(p().reloadUntil,0);
 console.log('PASS live pause/reconnect: reload remains pending; paused input cannot mutate combat');
});
