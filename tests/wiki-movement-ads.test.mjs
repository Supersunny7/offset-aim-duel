import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {move} from '../shared.mjs';
import {createMovementPrediction,queueMoves,stepQueuedMove,FIXED_DT} from '../movement-net.mjs';
import {WEAPONS,weaponShotInterval} from '../weapons.mjs';
import {acceptAds,shoot,pauseRoom,server,close} from '../server.mjs';
import {WebSocket} from 'ws';
const evidence={};
const actor=(weapon='vandal',ads=false)=>({x:-8,z:10,y:0,yaw:0,pitch:0,vx:0,vz:0,vy:0,hp:100,weapon,ads,grounded:true,crouch:false,spawnEpoch:1,moveAck:0,moveReceived:0,moveQueue:[]});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const clients=[];
after(async()=>{clients.forEach(c=>c.terminate());close();const dir=new URL('./.artifacts/movement-ads/',import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL('movement-ads-evidence.json',dir),JSON.stringify(evidence,null,2));});
test('weapon movement converges to Wiki speeds; diagonal normalization and both maps share speed',()=>{
 evidence.speeds=[];
 for(const [weapon,ads,speed] of [['vandal',false,5.4],['ghost',false,5.73],['knife',false,6.75],['vandal',true,4.104]]){
  const p=actor(weapon,ads);for(let n=0;n<20;n++)move(p,{right:true},FIXED_DT);
  assert.ok(Math.abs(p.vx-speed)<.0004);evidence.speeds.push({weapon,ads,speed,measured:p.vx});
 }
 const p=actor('knife');for(let n=0;n<15;n++)move(p,{right:true,forward:true},FIXED_DT);assert.ok(Math.hypot(p.vx,p.vz)<=6.75);
 const p2=actor('vandal',true);p2.map='ascent';p2.x=8;p2.z=6;p2.y=.12545222843585835;for(let n=0;n<20;n++)move(p2,{right:true},FIXED_DT);assert.ok(Math.abs(Math.hypot(p2.vx,p2.vz)-4.104)<.0004);evidence.ascentAdsSpeed=Math.hypot(p2.vx,p2.vz);
});
test('pending prediction keeps historical weapon/ADS context through equip; queue strips weapon spoof',()=>{
 const p=actor(),base=actor(),expected=actor(),prediction=createMovementPrediction(p);prediction.reconcile(base);
 for(const [weapon,ads] of [['vandal',false],['ghost',false],['knife',false],['vandal',true]]){
  p.weapon=expected.weapon=weapon;p.ads=expected.ads=ads;
  for(let n=0;n<5;n++){prediction.advance(FIXED_DT,{right:true,ads},0);move(expected,{right:true},FIXED_DT);}
 }
 const before={x:p.x,vx:p.vx};prediction.reconcile(base);assert.ok(Math.abs(p.x-before.x)<1e-12);assert.ok(Math.abs(p.vx-before.vx)<1e-12);assert.equal(p.weapon,'vandal');assert.equal(p.ads,true);
 const outgoing=prediction.takeMoves();assert.ok(outgoing.every(c=>!('movementWeapon' in c)&&!('movementAds' in c)));
 const serverActor=actor('ghost');queueMoves(serverActor,[{n:1,yaw:0,right:true,ads:true,weapon:'knife',movementWeapon:'knife',movementAds:true}],1);stepQueuedMove(serverActor);assert.ok(serverActor.vx<5.73);assert.equal(serverActor.weapon,'ghost');assert.equal(serverActor.ads,false);
 const mixed=actor('vandal');queueMoves(mixed,[{n:1,yaw:0,ads:true},{n:2,yaw:0,ads:false}],1,{adsAllowed:true});assert.deepEqual(mixed.moveQueue.map(c=>c.movementAds),[true,false]);
 evidence.prediction={pending:prediction.pending.length,correction:prediction.diagnostics.correction,spoofIgnored:true};
});
test('authoritative ADS gate and shoot cadence reject illegal states',()=>{
 const room={phase:'waiting',players:[]};const p={...actor(),ammo:25,magazines:{vandal:25},shots:0,spray:0,lastShot:0,nextShotAt:0,equipUntil:0,reloadUntil:0};room.players=[p];
 for(const [field,value] of [['weapon','ghost'],['hp',0],['reloadUntil',2000],['equipUntil',2000]]){const q={...p,[field]:value};assert.equal(acceptAds(q,room,true,1000),false);}
 assert.equal(acceptAds(p,{phase:'countdown'},true,1000),false);assert.equal(acceptAds(p,room,true,1000),true);
 shoot(p,room,1000);assert.equal(p.nextShotAt,1000+1000/8.775);assert.equal(shoot(p,room,p.nextShotAt-.001),undefined);const next=p.nextShotAt;shoot(p,room,next);assert.equal(p.shots,2);
 acceptAds(p,room,false,next);shoot(p,room,p.nextShotAt);assert.ok(Math.abs(p.nextShotAt-p.lastShot-1000/9.75)<1e-9);pauseRoom(room,2000);assert.equal(p.ads,false);
 evidence.cadence={hipInterval:weaponShotInterval('vandal'),adsInterval:weaponShotInterval('vandal',true),illegalAdsCleared:true,pauseCleared:true};
});
test('WebSocket ADS snapshot clears on reload/equip/stale; spoof does not change speed',{timeout:9000},async()=>{
 const url=`ws://127.0.0.1:${server.address().port}`;const ws=new WebSocket(url);clients.push(ws);let welcome,state;ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')welcome=m;if(m.type==='state')state=m;});await new Promise(r=>ws.once('open',r));
 const send=m=>ws.send(JSON.stringify(m)),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let n=0;n<150;n++){if(fn())return;await sleep(20);}throw Error('timeout');}const me=()=>state?.players.find(p=>p.id===welcome?.id);const input=m=>send({type:'input',yaw:0,pitch:0,...m});
 send({type:'create'});await until(()=>me());input({ads:true});await until(()=>me().ads===true);
 input({ads:true,fire:true});input({ads:true,fire:false});await until(()=>me().ammo===24);input({ads:true,reload:true});await until(()=>me().reloadUntil>0);assert.equal(me().ads,false);
 send({type:'equip',weapon:'ghost'});await until(()=>me().weapon==='ghost');input({ads:true});await sleep(70);assert.equal(me().ads,false);
 send({type:'equip',weapon:'vandal'});await until(()=>me().weapon==='vandal');input({ads:true});await sleep(70);assert.equal(me().ads,false,'equip gate rejects ADS');await sleep(WEAPONS.vandal.equip+50);input({ads:true});await until(()=>me().ads===true);await until(()=>me().ads===false);
 evidence.websocket={adsSnapshot:true,reloadCleared:true,equipCleared:true,staleCleared:true};ws.close();
});
