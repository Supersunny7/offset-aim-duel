import {normalizeLoadout,canEquipLoadout,planLoadoutChange} from './loadout.mjs';
import {advanceHitboxMotion} from './hitbox-motion.mjs';
import {recordShotSnapshot,resolveShotHistory,clearShotHistory} from './lag-compensation.mjs';
import {ASCENT_SPAWNS,MAPS,ascentBlocked,DUEL_MAP} from './map-collision.mjs';
import http from 'node:http';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createGzip} from 'node:zlib';
import {WebSocketServer} from 'ws';
import {move,direction,trace,SPAWNS,eyeHeight,RATE,blocked} from './shared.mjs';
import {queueMoves,stepQueuedMove} from './movement-net.mjs';
import {traceVolley} from './combat-projectiles.mjs';
import {weaponAttackSpec,weaponReloadDuration} from './weapons.mjs';
import {WEAPONS,isWeapon,hitDamage,isBackstab,applyDamage,weaponShotInterval} from './weapons.mjs';
import {ACCURACY_CALIBRATION,commitAccuracyShot,recordAccuracyLanding,sampleSpreadDirection,shotRandom} from './accuracy.mjs';
const root=fileURLToPath(new URL('.',import.meta.url)),rooms=new Map();
let shotSerial=0;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.png':'image/png','.fbx':'application/octet-stream','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.wav':'audio/wav'};
export const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 // Production serves the game and runtime assets, not development lab pages.
 if(process.env.NODE_ENV==='production'&&/(?:^|\/)[^/]*-lab(?:\.mjs)?$/.test(pathname)){res.writeHead(404);return res.end('Not found');}
 if(pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,rooms:rooms.size,accuracyRevision:ACCURACY_CALIBRATION.revision}));}
 const routes={'/movement-net.mjs':'movement-net.mjs','/':'public/index.html','/app.mjs':'public/app.mjs','/scene.mjs':'public/scene.mjs','/style.css':'public/style.css','/shared.mjs':'shared.mjs','/vendor/three.module.js':'node_modules/three/build/three.module.min.js','/vendor/three.core.min.js':'node_modules/three/build/three.core.min.js'};
 routes['/session-resume.mjs']='public/session-resume.mjs';
 for(const file of ['equipment-catalog.mjs','loadout.mjs'])routes['/'+file]=file;
 for(const file of ['armory-ui.mjs','armory-ui.css'])routes['/'+file]='public/'+file;
 routes['/accuracy.mjs']='accuracy.mjs';
 routes['/hitbox-combat-skeleton-data.mjs']='hitbox-combat-skeleton-data.mjs';
 routes['/hitbox-skeleton.mjs']='hitbox-skeleton.mjs';routes['/hitbox-skeleton-data.mjs']='hitbox-skeleton-data.mjs';
 routes['/hitbox-action-data.mjs']='hitbox-action-data.mjs';routes['/hitbox-motion.mjs']='hitbox-motion.mjs';routes['/hitbox-motion-data.mjs']='hitbox-motion-data.mjs';
 routes['/lag-compensation.mjs']='lag-compensation.mjs';routes['/hitbox-profile.mjs']='hitbox-profile.mjs';
 routes['/movement-feel.mjs']='movement-feel.mjs';
 routes['/ads.mjs']='public/ads.mjs';routes['/shot-effects.mjs']='public/shot-effects.mjs';routes['/combat-feedback.mjs']='public/combat-feedback.mjs';
 routes['/ads-reticle.mjs']='public/ads-reticle.mjs';routes['/ads-reticle.css']='public/ads-reticle.css';
 routes['/look-input.mjs']='public/look-input.mjs';
 routes['/muzzle-effects.mjs']='public/muzzle-effects.mjs';
 routes['/weapon-feel.mjs']='public/weapon-feel.mjs';
 for(const kind of ['fire','equip','reload'])routes['/assets/packs/animations/ghost-'+kind+'.json']='public/assets/packs/animations/ghost-'+kind+'.json';
 routes['/opponent.mjs']='public/opponent.mjs';routes['/tp-lab']='public/tp-lab.html';routes['/tp-lab.mjs']='public/tp-lab.mjs';routes['/opponent-before.mjs']='public/opponent-before.mjs';
 routes['/opponent-combat.mjs']='public/opponent-combat.mjs';
 routes['/opponent-lifecycle.mjs']='public/opponent-lifecycle.mjs';
 routes['/opponent-mechanics.mjs']='public/opponent-mechanics.mjs';
 routes['/reload-contact.mjs']='public/reload-contact.mjs';
 for(const [weapon,kinds] of [['vandal',['reload']],['ghost',['equip','fire','reload']]])for(const kind of kinds)routes[`/assets/packs/animations/tp-${weapon}-${kind}.json`]=`public/assets/packs/animations/tp-${weapon}-${kind}.json`;
 routes['/assets/packs/opponent-jett.glb']='public/assets/packs/opponent-jett.glb';
 const opponentClips=['hit-body','hit-head','death-body','death-head','idle-lower','crouch-lower','jump-lower',...['walk','run','crouch-walk'].flatMap(mode=>['n','e','s','w'].map(d=>mode+'-'+d)),...['vandal','ghost','knife'].flatMap(w=>[w+'-upper',w+'-crouch-upper',w+'-equip',w+'-fire',...(w==='knife'?[w+'-secondary']:[w+'-reload'])])];
 for(const clip of opponentClips)routes['/assets/packs/animations/opponent-'+clip+'.json']='public/assets/packs/animations/opponent-'+clip+'.json';
 routes['/vandal.mjs']='public/vandal.mjs';
 routes['/weapon-audio-timing.mjs']='public/weapon-audio-timing.mjs';
 routes['/game-audio.mjs']='public/game-audio.mjs';
 for(const id of ['body-hit','shield-hit','knife-hit','hit-reference'])routes[`/assets/audio/${id}.wav`]=`public/assets/audio/${id}.wav`;
 routes['/assets/audio/manifest.json']='public/assets/audio/manifest.json';
 for(const f of ['vandal-fire','vandal-reload','ghost-fire','ghost-reload','knife-equip','knife-light','knife-heavy','headshot','kill-1','kill-2','kill-3','kill-4'])routes['/assets/audio/'+f+'.mp3']='public/assets/audio/'+f+'.mp3';
 routes['/ads-lab']='public/ads-lab.html';routes['/ads-lab.mjs']='public/ads-lab.mjs';
 routes['/ghost-lab']='public/ghost-lab.html';routes['/ghost-lab.mjs']='public/ghost-lab.mjs';
 for(const kind of ['altidlepose','altaimn','altaime','altaims','altaimw','altidleadd','neutraldelta'])routes[`/assets/packs/animations/jett-vandal-${kind}.json`]=`public/assets/packs/animations/jett-vandal-${kind}.json`;
 routes['/knife-lab']='public/knife-lab.html';routes['/knife-lab.mjs']='public/knife-lab.mjs';
 for(const kind of ['idlepose','equip','attack1','attack2','attack3','attack4','inspect'])routes[`/assets/packs/animations/jett-knife-tactical-${kind}-modes.json`]=`public/assets/packs/animations/jett-knife-tactical-${kind}-modes.json`;
 for(const kind of ['idlepose','equip','attack1','attack2','attack3','attack4','attack-alt','inspect','walkadd','runadd','jumpadd','jumplandadd','crouchin','crouchout'])routes[`/assets/packs/animations/jett-knife-tactical-${kind}.json`]=`public/assets/packs/animations/jett-knife-tactical-${kind}.json`;
 for(const kind of ['attack1','attack2','attack3','attack-alt'])routes[`/assets/packs/animations/jett-knife-${kind}.json`]=`public/assets/packs/animations/jett-knife-${kind}.json`;
 routes['/asset-lab']='public/asset-lab.html';routes['/asset-lab.mjs']='public/asset-lab.mjs';
 for(const f of ['jett.glb','ascent-b.glb'])routes['/assets/packs/'+f]='public/assets/packs/'+f;
 routes['/weapons.mjs']='weapons.mjs';
 routes['/imported-assets.mjs']='public/imported-assets.mjs';
 for(const f of ['ghost.glb','knife.glb'])routes['/assets/packs/'+f]='public/assets/packs/'+f;
 routes['/psa-animation.mjs']='public/psa-animation.mjs';
 routes['/first-person-arms.mjs']='public/first-person-arms.mjs';
 routes['/assets/packs/jett-arms.glb']='public/assets/packs/jett-arms.glb';
 for(const weapon of ['vandal','ghost','knife'])for(const kind of ['walkadd','runadd','jumpadd','jumplandadd',...(weapon==='ghost'?['crouchwalkadd']:['crouchin','crouchout'])])routes[`/assets/packs/animations/jett-${weapon}-${kind}.json`]=`public/assets/packs/animations/jett-${weapon}-${kind}.json`;
 routes['/assets/packs/vandal.glb']='public/assets/packs/vandal.glb';
 for(const kind of ['fire','equip','reload'])routes[`/assets/packs/animations/vandal-${kind}.json`]=`public/assets/packs/animations/vandal-${kind}.json`;
 for(const kind of ['idlepose','fire','equip','reload'])routes[`/assets/packs/animations/jett-vandal-${kind}.json`]=`public/assets/packs/animations/jett-vandal-${kind}.json`;
 for(const weapon of ['ghost','knife'])for(const kind of (weapon==='knife'?['idlepose','fire','secondary','equip']:['idlepose','fire','equip','reload']))routes[`/assets/packs/animations/jett-${weapon}-${kind}.json`]=`public/assets/packs/animations/jett-${weapon}-${kind}.json`;
 for(const kind of ['Fire','Equip','Reload'])routes[`/assets/vandal/animations/GN_Core_AK_S0_${kind}.json`]=`public/assets/vandal/animations/GN_Core_AK_S0_${kind}.json`;
 for(const f of ['loaders/FBXLoader.js','loaders/GLTFLoader.js','utils/BufferGeometryUtils.js','libs/fflate.module.js','curves/NURBSCurve.js','curves/NURBSUtils.js'])routes['/vendor/addons/'+f]='node_modules/three/examples/jsm/'+f;
 for(const f of ['vandal.fbx','AK_S0_DF.png','AK_S0_NM.png','AK_S0_AO.png','AK_S0_R.png','AK_S0_M.png','AK_S0_S.png'])routes['/assets/vandal/'+f]='public/assets/vandal/'+f;
 for(const f of ['map-collision.mjs','ascent-data.mjs'])routes['/'+f]=f;routes['/map-scene.mjs']='public/map-scene.mjs';routes['/duel-arena.mjs']='public/duel-arena.mjs';
 for(const file of ['additional-first-person.mjs','additional-weapon.mjs','source-weapon-grip.mjs'])routes['/'+file]='public/'+file;
 if(/^\/assets\/packs\/(phantom|sheriff|classic|shorty|frenzy|stinger|spectre|bucky|judge|bulldog|guardian|marshal|operator|ares|odin)\.glb$/.test(pathname))routes[pathname]='public'+pathname;
 if(/^\/assets\/packs\/animations\/(?:jett-|opponent-|tp-)?(?:phantom|sheriff|classic|shorty|frenzy|stinger|spectre|bucky|judge|bulldog|guardian|marshal|operator|ares|odin)-[a-z0-9-]+\.json$/.test(pathname))routes[pathname]='public'+pathname;
 for(const file of Object.keys(WEAPONS).filter(id=>!['vandal','ghost','knife'].includes(id)).flatMap(id=>[id+'-fire.mp3',id+'-reload.mp3']))routes['/assets/audio/'+file]='public/assets/audio/'+file;
 for(const name of ['hitbox-skeleton-data.mjs','hitbox-combat-skeleton-data.mjs','hitbox-motion-data.mjs'])routes['/'+name]='public/browser-hitbox/'+name;
 routes['/assets/packs/animations/all-weapons-tp-manifest.json']='public/assets/packs/animations/all-weapons-tp-manifest.json';
 routes['/hitbox-data-loader.mjs']='public/hitbox-data-loader.mjs';
 if(/^\/assets\/browser-hitbox\/[a-z]+\.json$/.test(pathname)&&isWeapon(pathname.split('/').at(-1).slice(0,-5)))routes[pathname]='public/browser-hitbox/'+pathname.split('/').at(-1);
 const file=routes[pathname];if(!file){res.writeHead(404);return res.end('Not found');}
 try{
  const path=resolve(root,file);await stat(path);
  const zip=/\bgzip\b/.test(req.headers['accept-encoding']||'');
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'text/plain','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Vary':'Accept-Encoding',...(zip?{'Content-Encoding':'gzip'}:{})});
  // Backpressure bounds memory when two devices download large models together.
  const stream=createReadStream(path);
  await pipeline(...(zip?[stream,createGzip(),res]:[stream,res]));
 }catch{if(!res.headersSent){res.writeHead(500);res.end('Asset unavailable');}else res.destroy();}
});
const wss=new WebSocketServer({server,maxPayload:2048,perMessageDeflate:{threshold:256}});
const send=(ws,m)=>{if(ws?.readyState===1)ws.send(JSON.stringify(m));};
const broadcast=(r,m)=>r.players.forEach(p=>send(p.ws,m));
export function spawn(p,r){
 p.loadout=normalizeLoadout(p.loadout);
 const spawnWeapon=canEquipLoadout(p,p.weapon)?p.weapon:p.loadout.primary;
 p.map=r.map||'training';const enemy=r.players.find(q=>q!==p),spots=(p.map==='ascent'?ASCENT_SPAWNS:p.map==='duel'?DUEL_MAP.spawns:SPAWNS).filter((_,i)=>i%2===p.slot);
 const score=s=>{if(!enemy||enemy.hp<=0)return 0;const dx=s.x-enemy.x,dz=s.z-enemy.z,length=Math.hypot(dx,dz),dy=(s.y||0)+1.62-eyeHeight(enemy),len=Math.hypot(length,dy)||1,hit=trace({x:enemy.x,y:eyeHeight(enemy),z:enemy.z},{x:dx/len,y:dy/len,z:dz/len},{...s,hp:100,y:s.y||0},p.map);return length+(hit.part?0:100);};
 const s=spots.sort((a,b)=>score(b)-score(a))[0];
 Object.assign(p,s,{spawnEpoch:(p.spawnEpoch||0)+1,lifeEpoch:(p.lifeEpoch||0)+1,moveAck:0,moveReceived:0,moveQueue:[],moveStale:false,moveAt:0,recentShotRequests:new Set(),viewSnapshot:null,queuedViewSnapshot:null,hitboxMotion:null,hitboxAction:null,hitboxFire:[],y:s.y||0,vy:0,grounded:true,jumpHeld:false,crouch:false,vx:0,vz:0,pitch:0,hp:100,armor:r.armor??50,weapon:spawnWeapon,ads:false,magazines:Object.fromEntries(Object.entries(WEAPONS).map(([id,w])=>[id,w.capacity])),ammo:WEAPONS[spawnWeapon].capacity,equipUntil:0,nextShotAt:0,reloadUntil:0,respawnAt:0,deathPart:null,protectedUntil:Date.now()+1500,input:{},trigger:false,secondaryTrigger:false,shotQueued:false,secondaryQueued:false,pendingBurst:null,nextShellAt:0,pendingMelee:null,clientShotId:null,primaryClientShotId:null,secondaryClientShotId:null,spray:0,lastShot:0,lastShotWeapon:null});
 Object.assign(p,{accuracyState:null,landingUntil:0,accuracyMoveMode:'run'});
}
function spawnTrainingBot(r,now){
 const owner=r.players[0];if(!owner)return;
 const bot=r.bot||player(1,'TRAINING BOT',null);r.bot=bot;spawn(bot,r);
 const d=direction(owner.yaw,0);let spot;
 for(const distance of [5,4,3,6,2.5,2]){const x=owner.x+d.x*distance,z=owner.z+d.z*distance;if(!blocked(x,z,owner.y||0,1.8,r.map)){const candidate={...bot,x,z,y:owner.y||0,hp:100};if(trace({x:owner.x,y:eyeHeight(owner),z:owner.z},d,candidate,r.map).part){spot={x,z};break;}}}
 if(spot)Object.assign(bot,spot,{y:owner.y||0});
 Object.assign(bot,{bot:true,connected:true,protectedUntil:0,yaw:Math.atan2(-(owner.x-bot.x),-(owner.z-bot.z)),bornAt:now});advanceHitboxMotion(bot,0);
}
function advanceTrainingBot(r,now){
 const bot=r.bot,owner=r.players[0];if(!bot||!owner)return;
 if(bot.hp<=0){if(now>=bot.respawnAt)spawnTrainingBot(r,now);return;}
 // Fixed standing target: retain physics/idle hitbox updates, no strafing or tracking turns.
 move(bot,{},1/RATE);
}
function equip(p,id,now){
 if(!isWeapon(id)||!canEquipLoadout(p,id)||p.hp<=0||p.weapon===id)return;
 p.magazines[p.weapon]=p.ammo;p.weapon=id;p.ammo=p.magazines[id];
 p.viewSnapshot=null;p.queuedViewSnapshot=null;p.hitboxAction={kind:'equip',weapon:id,at:now};p.hitboxFire=[];p.ads=false;p.pendingMelee=null;p.pendingBurst=null;p.nextShellAt=0;p.reloadUntil=0;p.equipUntil=now+WEAPONS[id].equip;p.shotQueued=false;p.secondaryQueued=false;p.spray=0;p.accuracyState=null;
 advanceHitboxMotion(p,0);
 // nextShotAt survives switching, so a weapon change cannot bypass cadence.
}
function canAds(p,r,now){return !!WEAPONS[p.weapon]?.ads&&p.hp>0&&!p.reloadUntil&&now>=(p.equipUntil||0)&&['active','waiting'].includes(r.phase);}
export function acceptAds(p,r,requested,now){p.ads=!!requested&&canAds(p,r,now);return p.ads;}
function player(slot,name,ws,preference){const loadout=normalizeLoadout(preference?.loadout);const weapon=canEquipLoadout({loadout},preference?.weapon)?preference.weapon:loadout.primary;return {loadout,weapon,id:randomBytes(8).toString('hex'),token:randomBytes(24).toString('hex'),slot,name:String(name||'Agent').trim().slice(0,18)||'Agent',ws,connected:true,kills:0,deaths:0,shots:0,hits:0,headHits:0,headKills:0,seq:0,rematch:false};}
function state(r){const now=Date.now(),snapshotId=randomBytes(8).toString('hex');recordShotSnapshot(r,snapshotId,now);return {type:'state',snapshotId,characterCollision:true,armor:r.armor??50,map:r.map||'training',code:r.code,phase:r.phase,winner:r.winner,now,pausedAt:r.pausedAt||0,startAt:r.startAt,trainingBot:r.phase==='waiting'&&r.bot?(({ws,token,input,collisionPeers,moveQueue,recentShotRequests,viewSnapshot,queuedViewSnapshot,...p})=>p)(r.bot):null,players:r.players.map(({ws,token,input,collisionPeers,moveQueue,recentShotRequests,viewSnapshot,queuedViewSnapshot,...p})=>p)};}
export function pauseRoom(r,now){
 if(r.phase==='paused')return;
 clearShotHistory(r);r.previousPhase=r.phase;r.phase='paused';r.pausedAt=now;
 for(const p of r.players){p.ads=false;p.input={};p.trigger=false;p.secondaryTrigger=false;p.shotQueued=false;p.secondaryQueued=false;p.pendingMelee=null;p.pendingBurst=null;p.moveQueue=[];p.moveReceived=p.moveAck||0;}
}
export function resumeRoom(r,now){
 clearShotHistory(r);
 const delay=Math.max(0,now-(r.pausedAt||now));
 for(const p of [...r.players,...(r.bot?[r.bot]:[])]){if(p.bot&&p.bornAt)p.bornAt+=delay;for(const key of ['reloadUntil','equipUntil','nextShotAt','respawnAt','protectedUntil','landingUntil','nextShellAt'])if(p[key]>0)p[key]+=delay;if(p.pendingBurst)p.pendingBurst.at+=delay;if(p.lastShot>0)p.lastShot+=delay;if(p.accuracyState)p.accuracyState.at+=delay;if(p.hitboxAction)p.hitboxAction.at+=delay;for(const e of p.hitboxFire||[])e.at+=delay;p.inputAt=now;p.moveAt=now;}
 r.phase=r.previousPhase||'active';r.pausedAt=0;
 if(r.phase==='countdown')r.startAt=now+3000;
}
function reset(r){r.bot=null;clearShotHistory(r);r.winner=null;r.phase='countdown';r.startAt=Date.now()+3000;for(const p of r.players){Object.assign(p,{kills:0,deaths:0,shots:0,hits:0,headHits:0,headKills:0,trainingKills:0,rematch:false});spawn(p,r);}}
function attach(ws,r,p){ws.room=r;ws.player=p;p.ws=ws;p.connected=true;p.disconnectedAt=0;p.ads=false;p.input={};p.moveQueue=[];p.moveReceived=p.moveAck||0;send(ws,{type:'welcome',id:p.id,token:p.token,code:r.code,shotRequestFloor:Math.max(0,...[p.clientShotId,...(p.recentShotRequests||[])].filter(Number.isSafeInteger))});}
wss.on('connection',(ws,req)=>{
 const forwardedHost=String(req.headers['x-forwarded-host']||req.headers.host).split(',')[0].trim();
 const forwardedProto=String(req.headers['x-forwarded-proto']||'http').split(',')[0].trim();
 if(req.headers.origin&&req.headers.origin!==`${forwardedProto}://${forwardedHost}`&&req.headers.origin!==process.env.PUBLIC_ORIGIN){console.log('Origin check rejected',JSON.stringify({origin:req.headers.origin,host:req.headers.host,forwardedHost,forwardedProto}));ws.close(1008,'Invalid origin');return;}
 ws.rateStart=Date.now();ws.messages=0;
 ws.on('message',raw=>{try{
 let now=Date.now();if(now-ws.rateStart>1000){ws.rateStart=now;ws.messages=0;}if(++ws.messages>180){ws.close(1008,'Rate limit');return;}
 const m=JSON.parse(raw);let r=ws.room,p=ws.player;
 if(m.type==='ping'){send(ws,{type:'pong',time:m.time});return;}
 if(!p){
  if(m.type==='resume'){r=rooms.get(String(m.code).toUpperCase());p=r?.players.find(p=>p.token===m.token&&!p.connected);if(!p)return send(ws,{type:'error',message:'The previous room is no longer available. Create a new room.'});attach(ws,r,p);if(r.players.every(p=>p.connected)){resumeRoom(r,now);for(const q of r.players){q.spawnEpoch=(q.spawnEpoch||0)+1;q.moveAck=0;q.moveReceived=0;q.moveQueue=[];}if(r.phase==='finished'&&r.players.every(q=>q.rematch))reset(r);}return;}
  if(m.type==='create'){if(rooms.size>=100)return send(ws,{type:'error',message:'The server has reached its room limit. Please try again later.'});let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));r={code,armor:[0,25,50].includes(m.armor)?m.armor:50,map:['ascent','duel'].includes(m.map)?m.map:'training',players:[],phase:'waiting',winner:null,startAt:0,created:now};rooms.set(code,r);p=player(0,m.name,ws,m.preference);r.players.push(p);spawn(p,r);spawnTrainingBot(r,now);attach(ws,r,p);return;}
  if(m.type==='join'){r=rooms.get(String(m.code).trim().toUpperCase());if(!r)return send(ws,{type:'error',message:'Room not found. Check the room code.'});if(r.players.length>=2)return send(ws,{type:'error',message:'This room already has two players.'});p=player(1,m.name,ws,m.preference);r.players.push(p);attach(ws,r,p);reset(r);return;}
  return;
 }
 if(m.type==='leave'){ws.close(1000);return;}
 if(m.type==='loadout'){
  const requestId=Number.isSafeInteger(m.requestId)?m.requestId:null;
  const reject=message=>send(ws,{type:'loadout-result',requestId,ok:false,message});
  if(!['active','waiting','countdown'].includes(r.phase)||p.hp<=0)return reject('Equipment cannot be changed right now. Wait for respawn or resume the match.');
  const plan=planLoadoutChange(p.loadout,m);if(plan.error)return reject(plan.error);
  p.loadout=plan.loadout;
  if(m.weapon!==undefined)equip(p,m.weapon,now);
  send(ws,{type:'loadout-result',requestId,ok:true,loadout:p.loadout,weapon:p.weapon,message:'Loadout confirmed.'});
  return;
 }

 if(m.type==='equip'){if(['active','waiting','countdown'].includes(r.phase))equip(p,m.weapon,now);return;}
 if(m.type==='rematch'&&(r.phase==='finished'||(r.phase==='paused'&&r.previousPhase==='finished'))){p.rematch=true;if(r.players.every(p=>p.rematch&&p.connected))reset(r);return;}
 if(m.type==='input'&&['paused','finished'].includes(r.phase))return;
 if(m.type==='input'){if(!Number.isFinite(m.yaw)||!Number.isFinite(m.pitch))return;p.yaw=m.yaw%(Math.PI*2);p.pitch=Math.max(-1.45,Math.min(1.45,m.pitch));p.seq=Number.isSafeInteger(m.seq)?m.seq:p.seq;p.input={forward:!!m.forward,back:!!m.back,left:!!m.left,right:!!m.right,walk:!!m.walk,crouch:!!m.crouch,jump:!!m.jump};
  const clientShotId=Number.isSafeInteger(m.clientShotId)&&m.clientShotId>=0?m.clientShotId:(typeof m.clientShotId==='string'&&m.clientShotId.length<=64?m.clientShotId:null);
  if(clientShotId!==null)p.clientShotId=clientShotId;
  const sameLife=m.shotLife===undefined||m.shotLife===p.lifeEpoch;
  let requestedFire=!!m.fire&&sameLife;
  if(requestedFire&&!p.trigger&&clientShotId!==null&&p.recentShotRequests?.has(clientShotId)&&(m.fireEdge!==false||!weaponAttackSpec(p.weapon,p.ads)?.automatic))requestedFire=false;
  p.viewSnapshot=m.viewSnapshot||null;
  if(requestedFire&&!p.trigger){p.shotQueued=true;p.primaryClientShotId=clientShotId;p.queuedViewSnapshot=p.viewSnapshot;}
  if(m.secondaryFire&&sameLife&&!p.secondaryTrigger&&(p.weapon==='knife'||WEAPONS[p.weapon]?.secondary)){p.secondaryQueued=true;p.secondaryClientShotId=clientShotId;}
  p.trigger=requestedFire;p.secondaryTrigger=!!m.secondaryFire&&sameLife;p.inputAt=now;
  if(m.weapon&&['active','waiting','countdown'].includes(r.phase))equip(p,m.weapon,now);
  const weapon=WEAPONS[p.weapon];
  if(m.reload&&['active','waiting'].includes(r.phase)&&weapon.capacity>0&&p.ammo<weapon.capacity&&!p.reloadUntil&&p.hp>0&&now>=p.equipUntil){p.reloadUntil=now+weaponReloadDuration(p.weapon,p.ammo);p.nextShellAt=weapon.reloadPerRound?now+weapon.reloadPerRound:0;p.pendingBurst=null;p.hitboxAction={kind:'reload',weapon:p.weapon,at:now};p.hitboxFire=[];p.ads=false;}
  acceptAds(p,r,m.ads,now);
  if(['active','waiting'].includes(r.phase)&&p.hp>0&&Array.isArray(m.moves)){if(queueMoves(p,m.moves,m.moveEpoch,{adsAllowed:canAds(p,r,now)})>0)p.moveAt=now;}
 }
 }catch{send(ws,{type:'error',message:'Invalid message.'});}});
 ws.on('close',()=>{const r=ws.room,p=ws.player;if(!p)return;p.connected=false;p.ws=null;p.disconnectedAt=Date.now();pauseRoom(r,p.disconnectedAt);broadcast(r,{type:'notice',message:'Opponent disconnected. Match paused for up to 30 seconds while they reconnect.'});});
});
export function shoot(p,r,now,attack='primary',clientShotId=null,{randomSeed,burstContinuation=false}={}){
 if(!['active','waiting'].includes(r.phase))return;
 const weapon=WEAPONS[p.weapon];
 if(attack==='secondary'&&!weapon.secondary)return;
 const profile=weaponAttackSpec(p.weapon,p.ads,attack);
 if(p.reloadUntil&&weapon.reloadPerRound&&p.ammo>0){p.reloadUntil=0;p.nextShellAt=0;p.hitboxAction=null;}
 if((!burstContinuation&&now<p.nextShotAt)||now<p.equipUntil||(weapon.capacity>0&&p.ammo<=0)||p.reloadUntil||p.hp<=0)return;
 if(clientShotId!==null&&(p.shotQueued||!p.trigger)){
  p.recentShotRequests??=new Set();if(p.recentShotRequests.has(clientShotId))return;
  p.recentShotRequests.add(clientShotId);if(p.recentShotRequests.size>128)p.recentShotRequests.delete(p.recentShotRequests.values().next().value);
 }
 p.hitboxAction=p.weapon==='knife'?{kind:attack,weapon:p.weapon,at:now}:null;p.hitboxFire=p.weapon==='knife'?[]:[...(p.hitboxFire||[]).filter(e=>e.weapon===p.weapon&&now-e.at<1000),{weapon:p.weapon,ads:!!p.ads,at:now}].slice(-2);p.lastShot=now;p.lastShotWeapon=p.weapon;p.nextShotAt=now+(attack==='secondary'?profile.interval:weaponShotInterval(p.weapon,p.ads));p.lastPelletCount=profile.ammoCost>1?Math.min(p.ammo,profile.pellets||1):profile.pellets;if(weapon.capacity>0)p.ammo-=Math.min(p.ammo,profile.ammoCost||1);p.magazines[p.weapon]=p.ammo;p.shots++;p.protectedUntil=0;
 const shotId=++shotSerial;
 if(p.weapon==='knife'){
  const impactAt=now+profile.contact;
  p.pendingMelee={attack,clientShotId,shotId,impactAt,spawnEpoch:p.spawnEpoch};
  const o={x:p.x,y:eyeHeight(p),z:p.z},d=direction(p.yaw,p.pitch);
  const event={type:'shot',id:p.id,shotId,clientShotId,weapon:'knife',attack,yaw:p.yaw,pitch:p.pitch,seq:p.seq,origin:o,end:{x:o.x+d.x*profile.range,y:o.y+d.y*profile.range,z:o.z+d.z*profile.range},damage:0,part:null,killed:false,startedAt:now,impactAt};
  broadcast(r,event);return event;
 }
 if(profile.burst&&!burstContinuation){p.pendingBurst={weapon:p.weapon,attack,remaining:Math.min(profile.burst.count-1,p.ammo),at:now+profile.burst.interval,interval:profile.burst.interval,cycleUntil:now+profile.burst.cycleMs};p.nextShotAt=now+profile.burst.cycleMs;}
 if(burstContinuation&&p.pendingBurst)p.nextShotAt=p.pendingBurst.cycleUntil;
 if(profile.fireRateRamp&&!p.ads){if(p.lastRampWeapon!==p.weapon||now-(p.rampShotAt||0)>250)p.rampStarted=now;p.lastRampWeapon=p.weapon;p.rampShotAt=now;const u=Math.min(1,(now-p.rampStarted)/profile.fireRateRamp.rampMs);p.nextShotAt=now+1000/(profile.fireRateRamp.fromRps+(profile.fireRateRamp.toRps-profile.fireRateRamp.fromRps)*u);}
 return resolveAttack(p,r,now,attack,clientShotId,shotId,'shot',randomSeed);
}
function resolveAttack(p,r,now,attack,clientShotId,shotId,eventType='shot',randomSeed){
 const weapon=WEAPONS[p.weapon],profile=weaponAttackSpec(p.weapon,p.ads,attack);
 const accuracy=p.weapon==='knife'?null:commitAccuracyShot(p,now,attack);
 const seed=accuracy?(randomSeed??randomBytes(4).readUInt32LE(0)):null;
 const d=accuracy?sampleSpreadDirection(p.yaw,p.pitch,accuracy.totalDegrees,shotRandom(seed)):direction(p.yaw,p.pitch);p.spray++;
 const o={x:p.x,y:eyeHeight(p),z:p.z},enemy=r.phase==='waiting'?r.bot:r.players.find(q=>q!==p);
 const history=resolveShotHistory(r,p,enemy,p.shotQueued?p.queuedViewSnapshot:p.viewSnapshot,now),hit=trace(o,d,history.target,p.map);
 const volley=profile.pellets>1&&accuracy?traceVolley(p,o,history.target,p.map,accuracy,shotRandom(seed),attack):null;
 const volleyHits=volley?.filter(h=>h.damage>0)||[];
 if(volley){const nearest=volleyHits.find(h=>h.part==='head')||volleyHits[0]||volley[0];hit.distance=nearest.distance;hit.part=volleyHits.length?nearest.part:null;}
 let damage=0,armorDamage=0,healthDamage=0,backstab=false;const part=p.weapon==='knife'&&hit.part?'body':hit.part;if(hit.part&&hit.distance<=profile.range&&enemy?.hp>0&&now>enemy.protectedUntil){backstab=p.weapon==='knife'&&isBackstab(p,enemy);damage=volley?volleyHits.reduce((sum,h)=>sum+h.damage,0):hitDamage(p.weapon,hit.part,hit.distance,attack,backstab);({armorDamage,healthDamage}=applyDamage(enemy,damage));p.hits++;if(part==='head')p.headHits++;
  if(enemy.hp===0){if(enemy.bot)p.trainingKills=(p.trainingKills||0)+1;else p.kills++;enemy.deaths++;if(part==='head')p.headKills++;enemy.respawnAt=now+2000;enemy.deathPart=part;enemy.ads=false;enemy.input={};enemy.trigger=false;if(!enemy.bot&&p.kills>=10){r.phase='finished';r.winner=p.id;}}
 }
 const distance=Math.min(hit.distance,profile.range);
 const event={type:eventType,rewind:history.rewind,occurredAt:now,id:p.id,shotId,clientShotId,weapon:p.weapon,attack,ads:!!p.ads,yaw:p.yaw,pitch:p.pitch,seq:p.seq,origin:o,end:{x:o.x+d.x*distance,y:o.y+d.y*distance,z:o.z+d.z*distance},part:damage?part:null,damage,armorDamage,healthDamage,backstab:damage?backstab:false,distance:hit.distance,victim:damage?enemy.id:null,killed:damage&&enemy.hp===0};
 if(volley){event.pellets=volley.map(h=>({origin:h.origin,end:h.end,part:h.part,damage:h.damage}));event.end=volley[0].end;}
 if(accuracy)event.accuracy={...accuracy,seed};
 broadcast(r,event);return event;
}
export function resolveMelee(p,r,now){
 const pending=p.pendingMelee;if(!pending)return;
 if(p.hp<=0||p.weapon!=='knife'||p.spawnEpoch!==pending.spawnEpoch||!['active','waiting'].includes(r.phase)||p.connected===false){p.pendingMelee=null;return;}
 if(now<pending.impactAt)return;
 p.pendingMelee=null;
 return resolveAttack(p,r,now,pending.attack,pending.clientShotId,pending.shotId,'melee-hit');
}
function updateReload(p,now){
 const weapon=WEAPONS[p.weapon];
 if(p.reloadUntil&&weapon.reloadPerRound)while(p.nextShellAt>0&&now>=p.nextShellAt&&p.ammo<weapon.capacity){p.ammo++;p.magazines[p.weapon]=p.ammo;p.nextShellAt+=weapon.reloadPerRound;}
 if(p.reloadUntil&&now>=p.reloadUntil){p.ammo=weapon.capacity;p.magazines[p.weapon]=p.ammo;p.reloadUntil=0;p.nextShellAt=0;}
}
function attacks(p,r,now){
 if(p.pendingBurst){const burst=p.pendingBurst;if(burst.weapon!==p.weapon||p.hp<=0||p.reloadUntil)p.pendingBurst=null;else if(now>=burst.at){if(burst.remaining>0&&p.ammo>0)shoot(p,r,now,burst.attack,null,{burstContinuation:true});burst.remaining--;burst.at+=burst.interval;if(burst.remaining<=0||p.ammo<=0)p.pendingBurst=null;}return;}
 if(p.secondaryQueued){shoot(p,r,now,'secondary',p.secondaryClientShotId);}
 else if((p.trigger&&weaponAttackSpec(p.weapon,p.ads)?.automatic)||p.shotQueued){shoot(p,r,now,'primary',p.shotQueued?p.primaryClientShotId:p.clientShotId);}
 p.shotQueued=false;p.secondaryQueued=false;
}
function stopStaleInput(p,now){if(!p.inputAt)return;const staleInput=now-p.inputAt>250,staleMovement=p.moveMode&&now-(p.moveAt||p.inputAt)>250;if(!staleInput&&!staleMovement)return;p.ads=false;p.input={};p.trigger=false;p.secondaryTrigger=false;p.shotQueued=false;p.secondaryQueued=false;if(p.moveMode&&!p.moveStale){p.moveStale=true;p.spawnEpoch=(p.spawnEpoch||0)+1;p.moveAck=0;p.moveReceived=0;p.moveQueue=[];}}
function advancePlayer(p,now,r){p.collisionPeers=[...r.players,...(r.phase==='waiting'&&r.bot?[r.bot]:[])].filter(q=>q!==p&&q.hp>0).map(q=>({id:q.id,x:q.x,y:q.y||0,z:q.z,crouch:!!q.crouch,hp:q.hp}));const wasGrounded=p.grounded;if(!p.moveMode||p.moveStale)move(p,p.moveStale?{}:p.input,1/RATE);else stepQueuedMove(p);recordAccuracyLanding(p,wasGrounded,now);}
let simulationAt=performance.now(),accumulator=0,lastBroadcast=0;
const timer=setInterval(()=>{const wall=performance.now(),now=Date.now();accumulator+=Math.min((wall-simulationAt)/1000,2);simulationAt=wall;let steps=0;
while(accumulator>=1/RATE&&steps<6){accumulator-=1/RATE;steps++;for(const [code,r] of rooms){
 if(r.players.some(p=>!p.connected&&now-p.disconnectedAt>30000)||now-r.created>7200000){for(const p of r.players){send(p.ws,{type:'expired'});p.ws?.close(1000);}rooms.delete(code);continue;}
 if(r.phase==='countdown'&&now>=r.startAt){r.phase='active';for(const p of r.players)p.protectedUntil=now+1000;}
 if(r.phase==='active')for(const p of r.players){stopStaleInput(p,now);if(p.hp<=0){if(now>=p.respawnAt)spawn(p,r);continue;}updateReload(p,now);advancePlayer(p,now,r);resolveMelee(p,r,now);attacks(p,r,now);}
 if(r.phase==='waiting')advanceTrainingBot(r,now);
 if(r.phase==='waiting')for(const p of r.players){stopStaleInput(p,now);updateReload(p,now);advancePlayer(p,now,r);resolveMelee(p,r,now);attacks(p,r,now);}
}}
if(wall-lastBroadcast>=1000/20){lastBroadcast=wall;for(const r of rooms.values())broadcast(r,state(r));}
},1000/RATE);
export function close(){clearInterval(timer);for(const ws of wss.clients)ws.terminate();wss.close();server.close();}
if(process.argv[1]===fileURLToPath(import.meta.url)){server.listen(Number(process.env.PORT)||5180,'0.0.0.0',()=>console.log(`Aim Duel http://localhost:${server.address().port}`));}





