import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {server,close} from '../server.mjs';
import {playerHitboxes,eyeHeight} from '../shared.mjs';
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const clients=[];after(()=>{for(const c of clients)c.ws.terminate();close();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<400;i++){const value=fn();if(value)return value;await sleep(15);}throw Error('Training bot condition timed out');}
async function connect(message){const c={ws:new WebSocket(`ws://127.0.0.1:${server.address().port}`),events:[],botSamples:[]};clients.push(c);c.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')Object.assign(c,{id:m.id,code:m.code});if(m.type==='state'){c.state=m;if(m.trainingBot)c.botSamples.push({...m.trainingBot,at:m.now});}if(m.type==='shot')c.events.push(m);});await new Promise(r=>c.ws.once('open',r));c.ws.send(JSON.stringify(message));await until(()=>c.state?.players.find(p=>p.id===c.id));return c;}
for(const map of ['training','duel'])test(map+' stationary warmup bot uses native hitboxes, respawns, does not consume a human slot or score, and exits on join',{timeout:15000},async()=>{
 const c=await connect({type:'create',name:'Trainer',map});assert.equal(c.state.map,map);assert.equal(c.state.players.length,1);assert.equal(c.state.phase,'waiting');const bot=c.state.trainingBot;assert(bot?.bot);assert(!('token' in bot));assert(!('ws' in bot));assert.equal(bot.hp,100);
 const me=c.state.players[0],head=playerHitboxes({...bot,hitboxSampleAt:c.state.now})[0].center;const dx=head.x-me.x,dz=head.z-me.z,dy=head.y-eyeHeight(me);const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz));
 c.ws.send(JSON.stringify({type:'input',yaw,pitch,fire:true,fireEdge:true,clientShotId:1}));c.ws.send(JSON.stringify({type:'input',yaw,pitch,fire:false,clientShotId:1}));
 const event=await until(()=>c.events.find(e=>e.clientShotId===1));assert.equal(event.victim,bot.id);assert.equal(event.part,'head');assert.equal(event.damage,160);assert(event.killed);
 await until(()=>c.state.trainingBot?.hp===0);assert.equal(c.state.players[0].kills,0);assert.equal(c.state.players[0].trainingKills,1);assert.equal(c.state.phase,'waiting');
 await until(()=>c.state.trainingBot?.hp===100&&c.state.trainingBot.lifeEpoch>bot.lifeEpoch);const fixed={...c.state.trainingBot},born=fixed.bornAt;
 // Owner movement must not make the target strafe or rotate to track them.
 c.ws.send(JSON.stringify({type:'input',yaw:me.yaw+.4,pitch:0,right:true,fire:false}));
 await until(()=>c.state.now-born>2500);
 const samples=c.botSamples.filter(b=>b.lifeEpoch===fixed.lifeEpoch&&b.hp>0);assert(samples.length>20);
 for(const b of samples){assert.equal(b.x,fixed.x);assert.equal(b.y,fixed.y);assert.equal(b.z,fixed.z);assert.equal(b.yaw,fixed.yaw);assert.equal(b.vx,0);assert.equal(b.vz,0);assert.equal(b.crouch,false);assert.equal(b.grounded,true);}
assert.equal(c.state.phase,'waiting');assert.equal(c.state.players[0].hp,100);
 const peer=await connect({type:'join',code:c.code,name:'Human'});await until(()=>c.state.players.length===2);assert.equal(c.state.trainingBot,null);assert.equal(peer.state.trainingBot,null);assert.equal(c.state.phase,'countdown');assert.equal(c.state.players[0].kills,0);assert.equal(c.state.players[0].shots,0);assert.equal(c.state.players[0].trainingKills,0);assert(c.state.players.every(p=>!p.bot));
});
