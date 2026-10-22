import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {move,trace,direction,blocked,eyeHeight,BOXES} from '../shared.mjs';
import {server,close} from '../server.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=process.env.DUEL_URL||`ws://127.0.0.1:${server.address().port}`;
const clients=[];after(()=>{clients.forEach(c=>c.ws.terminate());close();});
test('collision, head/body rays and occlusion',()=>{
 let p={x:0,z:4,yaw:0,vx:0,vz:0};for(let i=0;i<200;i++)move(p,{forward:true},1/60);assert.ok(p.z>=1.9);assert.ok(blocked(0,0));
 const enemy={x:7,z:-8,hp:100};assert.equal(trace({x:7,y:1.62,z:8},direction(0,0),enemy).part,'head');assert.equal(trace({x:7,y:1,z:8},direction(0,0),enemy).part,'body');assert.equal(trace({x:0,y:1.62,z:8},direction(0,0),{x:0,z:-8,hp:100}).part,null);
 let q={x:0,z:5,yaw:0,vx:0,vz:0};for(let i=0;i<10;i++)move(q,{right:true},1/60);for(let i=0;i<10;i++)move(q,{},1/60);assert.ok(Math.abs(q.vx)<.1,'stop regains precision');
});
async function client(){const ws=new WebSocket(url,{origin:url.replace(/^ws/,'http')});const c={ws,messages:[],state:null};clients.push(c);ws.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(m.type==='state')c.state=m;if(m.type==='welcome')c.welcome=m;});ws.on('close',(code,reason)=>{if(!c.welcome)console.log('pre-welcome close',code,reason.toString(),c.messages);});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});c.send=m=>ws.send(JSON.stringify(m));return c;}
async function until(fn,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return fn();await sleep(20);}throw Error('Condition timed out');}
test('jump rises, lands once per press, crouch clears low ceilings and airborne rays follow feet',()=>{
 const p={x:9,z:9,yaw:0};let apex=0;
 for(let n=0;n<120;n++){move(p,{jump:true},1/60);apex=Math.max(apex,p.y);}
 assert.ok(apex>1&&apex<1.3);assert.equal(p.y,0);assert.equal(p.grounded,true,'holding jump must not auto-repeat');
 move(p,{},1/60);move(p,{jump:true},1/60);assert.ok(p.y>0,'second press jumps');
 const q={x:9,z:9,yaw:0,y:0,crouch:true};
 BOXES.push({x:9,z:9,w:2,d:2,y:1.3,h:.4});
 try{move(q,{},1/60);assert.equal(q.crouch,true,'cannot stand through ceiling');assert.equal(eyeHeight(q),1.05);}finally{BOXES.pop();}
 const target={x:7,z:-8,hp:100,y:1};
 assert.equal(trace({x:7,y:2.62,z:8},direction(0,0),target).part,'head');
 assert.equal(trace({x:7,y:.8,z:8},direction(0,0),target).part,null);
});
test('solo waiting room accepts jump, crouch, fire and reload through WebSocket',{timeout:10000},async()=>{
 const c=await client();c.send({type:'create',name:'Practice'});await until(()=>c.welcome&&c.state);
 const me=()=>c.state.players.find(p=>p.id===c.welcome.id);
 c.send({type:'input',yaw:0,pitch:0,jump:true,fire:true});await until(()=>me().y>.1&&me().ammo<25);
 assert.equal(c.state.phase,'waiting');assert.ok(c.messages.some(m=>m.type==='shot'));
 const holdCrouch=()=>c.send({type:'input',yaw:0,pitch:0,crouch:true});holdCrouch();const heartbeat=setInterval(holdCrouch,30);
 try{await until(()=>me().y>.3);assert.equal(me().crouch,false,'legacy input cannot crouch in the air');await until(()=>me().grounded&&me().crouch);}finally{clearInterval(heartbeat);}
 c.send({type:'input',yaw:0,pitch:0,reload:true});await until(()=>me().reloadUntil>0);await until(()=>me().ammo===25);
 const before=me().shots;
 c.send({type:'input',yaw:0,pitch:0,fire:true});c.send({type:'input',yaw:0,pitch:0,fire:false});
 await until(()=>me().shots===before+1);await sleep(250);assert.equal(me().shots,before+1,'short press fires exactly once');
 c.ws.close();
});
test('real WebSocket rooms, server movement, damage, respawn, win, rematch and reconnect',{timeout:90000},async(t)=>{
 const a=await client(),b=await client();a.send({type:'create',name:'Alpha'});await until(()=>a.welcome);b.send({type:'join',name:'Bravo',code:a.welcome.code});await until(()=>b.welcome);assert.notEqual(a.welcome.id,b.welcome.id);assert.equal(a.welcome.code,b.welcome.code);
 const third=await client();third.send({type:'join',code:a.welcome.code});await until(()=>third.messages.find(m=>m.type==='error'));third.ws.close();
 await until(()=>a.state?.phase==='active');assert.equal(a.state.players.length,2);assert.ok(!JSON.stringify(a.state).includes(a.welcome.token),'tokens stay private');
 const me=()=>a.state.players.find(p=>p.id===a.welcome.id),enemy=()=>a.state.players.find(p=>p.id===b.welcome.id);
 // Move both into clear east corridor via authoritative inputs. Client position spoof is ignored.
 const ax=me().x;a.send({type:'input',yaw:0,pitch:0,x:500,z:500});await sleep(80);assert.ok(Math.abs(me().x-ax)<.1);
 let ticks=setInterval(()=>{a.send({type:'input',yaw:0,pitch:0,right:true});b.send({type:'input',yaw:Math.PI,pitch:0,left:true});},30);t.after(()=>clearInterval(ticks));
 await until(()=>me().x>7.2&&enemy().x>7.2,5000);clearInterval(ticks);a.send({type:'input',yaw:0,pitch:0});b.send({type:'input',yaw:Math.PI,pitch:0});await sleep(300);assert.ok(me().x<11);
 // Aim at server positions, fire short bursts. Reposition after each safe respawn.
 let sawRespawn=false,sawFullRespawn=false,lastDeaths=0,aMoving=true,bMoving=true;const driver=setInterval(()=>{
  if(!a.state)return;const p=me(),q=enemy();if(a.state.phase!=='active')return;
  if(q.deaths>lastDeaths){lastDeaths=q.deaths;sawRespawn=true;}
  if(q.deaths>0&&q.hp===100&&q.armor===50&&q.magazines.ghost===13)sawFullRespawn=true;
  const xTarget=9.6;
  if(Math.abs(p.x-xTarget)<.6)aMoving=false;else if(Math.abs(p.x-xTarget)>1.2)aMoving=true;
  if(Math.abs(q.x-xTarget)<.6)bMoving=false;else if(Math.abs(q.x-xTarget)>1.2)bMoving=true;
  const aMove=aMoving,bMove=bMoving;
  let yaw=Math.atan2(-(q.x-p.x),-(q.z-p.z));
  if(aMove)yaw=0;
  a.send({type:'input',yaw,pitch:0,right:aMove&&p.x<xTarget,left:aMove&&p.x>xTarget,fire:!aMove&&!bMove&&q.hp>0&&Date.now()-p.lastShot>320,reload:p.ammo===0});
  b.send({type:'input',yaw:0,pitch:0,right:bMove&&q.x<xTarget,left:bMove&&q.x>xTarget});
 },25);
 try{await until(()=>a.state.phase==='finished',65000);}catch(e){console.log('match progress',JSON.stringify({phase:a.state.phase,players:a.state.players.map(p=>({x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch,kills:p.kills,deaths:p.deaths,hp:p.hp,ammo:p.ammo,shots:p.shots,hits:p.hits,vx:p.vx}))}));throw e;}finally{clearInterval(driver);}
 assert.equal(me().kills,10);assert.equal(enemy().deaths,10);assert.ok(sawRespawn);assert.ok(sawFullRespawn,'respawn restores heavy armor and Ghost magazine');assert.equal(a.state.winner,a.welcome.id);assert.ok(me().headHits>0);
 const saved=b.welcome;b.ws.close();await until(()=>a.state.phase==='paused');
 a.send({type:'rematch'});await until(()=>me().rematch);assert.equal(a.state.phase,'paused','disconnected peer cannot start rematch');
 const re=await client();re.send({type:'resume',code:saved.code,token:saved.token});await until(()=>re.welcome);assert.equal(re.welcome.id,saved.id);await until(()=>a.state.phase==='finished');
 re.send({type:'rematch'});await until(()=>a.state.phase==='countdown');assert.equal(me().kills,0);assert.ok(a.state.players.every(p=>p.hp===100&&p.armor===50&&p.magazines.ghost===13));
 a.ws.close();re.ws.close();
});
