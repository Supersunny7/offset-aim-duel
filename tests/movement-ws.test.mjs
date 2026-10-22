import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {server,close} from '../server.mjs';
import {move} from '../shared.mjs';
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`ws://127.0.0.1:${server.address().port}`,clients=[];
after(()=>{clients.forEach(c=>c.ws.terminate());close();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<150;n++){if(fn())return fn();await sleep(20);}throw Error('state timeout');}
async function connect(){const ws=new WebSocket(url,{origin:url.replace('ws:','http:')});const c={ws};clients.push(c);ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')c.welcome=m;if(m.type==='state')c.state=m;});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});c.send=m=>ws.send(JSON.stringify(m));return c;}
test('WebSocket acknowledges simulated movement, deduplicates and resets epochs',{timeout:12000},async()=>{
 const a=await connect();a.send({type:'create',name:'Move QA'});await until(()=>a.welcome&&a.state);
 const me=()=>a.state.players.find(p=>p.id===a.welcome.id),p=structuredClone(me()),epoch=p.spawnEpoch;
 const commands=Array.from({length:8},(_,i)=>({n:i+1,yaw:0,right:true,jump:i===0,crouch:i>=4}));
 for(const c of commands)move(p,c,1/60);
 const packet={type:'input',yaw:0,pitch:0,seq:1,moveEpoch:epoch,moves:commands};
 assert.ok(Buffer.byteLength(JSON.stringify(packet))<2048);
 a.send(packet);a.send(packet);await until(()=>me().moveAck===8);
 for(const k of ['x','y','z','vx','vy','vz'])assert.ok(Math.abs(me()[k]-p[k])<1e-9,`${k} matches fixed simulation`);
 assert.equal(me().grounded,false);assert.equal(me().crouch,false,'queued crouch is ignored in the air');assert.ok(!('moveQueue' in me()),'server queue stays private');
 const x=me().x;a.send({...packet,moveEpoch:epoch+100,moves:[{n:9,yaw:0,right:true}]});await sleep(40);assert.equal(me().moveAck,8);assert.equal(me().x,x);
 const b=await connect();b.send({type:'join',code:a.welcome.code,name:'Peer'});await until(()=>b.welcome&&me().spawnEpoch>epoch);
 a.send({...packet,moves:[{n:9,yaw:0,right:true}]});await sleep(100);assert.equal(me().moveAck,0,'pre-spawn commands rejected');
 assert(me().lifeEpoch>p.lifeEpoch,'new round is a real new life');
 const beforeResume=me().spawnEpoch,beforeLife=me().lifeEpoch,saved=b.welcome;b.ws.close();await until(()=>a.state.phase==='paused');
 const resumed=await connect();resumed.send({type:'resume',code:saved.code,token:saved.token});await until(()=>resumed.welcome&&me().spawnEpoch>beforeResume);
 assert.equal(me().moveAck,0,'reconnect resets pending movement stream for both peers');
 assert.equal(me().lifeEpoch,beforeLife,'reconnect does not fake a character respawn');
});
test('a stalled jumping client lands, changes epoch once and resumes its new movement stream',{timeout:10000},async()=>{
 const a=await connect();a.send({type:'create',name:'Stall QA'});await until(()=>a.welcome&&a.state);
 const me=()=>a.state.players.find(p=>p.id===a.welcome.id),epoch=me().spawnEpoch,life=me().lifeEpoch;
 a.send({type:'input',yaw:0,pitch:0,moveEpoch:epoch,moves:[{n:1,yaw:0,jump:true,right:true}]});
 await until(()=>me().moveAck===1&&me().y>0);
 await until(()=>me().spawnEpoch>epoch&&me().grounded&&me().y===0);
 const recoveredEpoch=me().spawnEpoch;assert.equal(me().moveAck,0);assert.ok(Math.abs(me().vx)<.1,'stale horizontal momentum decays');
 assert.equal(me().lifeEpoch,life,'stale movement recovery preserves the actual character life');
 await sleep(350);assert.equal(me().spawnEpoch,recoveredEpoch,'stale state does not endlessly reset epoch');
 const x=me().x;
 a.send({type:'input',yaw:0,pitch:0,moveEpoch:epoch,moves:[{n:2,yaw:0,right:true}]});await sleep(80);assert.equal(me().moveAck,0,'old epoch rejected');
 a.send({type:'input',yaw:0,pitch:0,moveEpoch:recoveredEpoch,moves:[{n:1,yaw:0,right:true},{n:2,yaw:0,right:true}]});
 await until(()=>me().moveAck===2);assert.ok(me().x>x,'new epoch resumes movement');assert.equal(me().moveStale,false);
 a.ws.close();
});
test('empty input heartbeats cannot suspend gravity; solo reconnect restores waiting',{timeout:7000},async()=>{
 const a=await connect();a.send({type:'create',name:'Background QA'});await until(()=>a.welcome&&a.state);
 const me=()=>a.state.players.find(p=>p.id===a.welcome.id),epoch=me().spawnEpoch;
 a.send({type:'input',yaw:0,pitch:0,moveEpoch:epoch,moves:[{n:1,yaw:0,jump:true}]});await until(()=>me().y>0);
 const heartbeat=setInterval(()=>a.send({type:'input',yaw:0,pitch:0,moveEpoch:me().spawnEpoch,moves:[]}),50);
 try{await until(()=>me().spawnEpoch>epoch);await until(()=>me().grounded);assert.equal(me().y,0);}finally{clearInterval(heartbeat);}
 const saved=a.welcome;a.ws.close();const resumed=await connect();resumed.send({type:'resume',code:saved.code,token:saved.token});await until(()=>resumed.welcome&&resumed.state);
 assert.equal(resumed.state.phase,'waiting');assert.equal(resumed.welcome.id,saved.id);
});
