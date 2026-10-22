import {scopeViewmodelOpacity,applyScopeViewmodelOpacity,renderScopedViewmodel} from '/ads.mjs';
import {equipmentById,loadoutOrder,readLoadoutPreference,saveLoadoutPreference,readyWeapon} from '/loadout.mjs';
import {mountArmory} from '/armory-ui.mjs';
import {ACCURACY_CALIBRATION,previewAccuracy} from '/accuracy.mjs';
import {saveRoomSession,readRoomSession,clearRoomSession} from '/session-resume.mjs';
import {ensureBrowserHitboxData,isBrowserHitboxReady,browserHitboxDataStatus} from '/hitbox-data-loader.mjs';
import {selectViewSnapshot,viewSample} from '/lag-compensation.mjs';
import {stepOpponentDisplay} from '/movement-feel.mjs';
import {createMapScene} from '/map-scene.mjs';
import * as T from '/vendor/three.module.js';
import {BOXES,EYE,trace,playerHitboxes} from '/shared.mjs';
import {buildArena,buildWeapon,animateWeapon,getMuzzlePosition,getEjectionPosition,createCharacterViewmodelOcclusion} from '/scene.mjs';
import {buildOpponent,animateOpponent,getOpponentMuzzle,getOpponentHitboxPose} from '/opponent.mjs';
import {weaponShotInterval,weaponAttackSpec,WEAPONS} from '/weapons.mjs';
import {createGameAudio} from '/game-audio.mjs';
import {createADS,adsFov} from '/ads.mjs';
import {createAdsReticle} from '/ads-reticle.mjs';
import {createCombatFeedbackPlanner,planConfirmedGunSound} from '/combat-feedback.mjs';
import {createShotEffects,resolveShotVisual} from '/shot-effects.mjs';
import {createMovementPrediction} from '/movement-net.mjs';
import {createLookInput,createWeaponWheel,reconcileAimSnapshot,requestGamePointerLock,createViewTrace} from '/look-input.mjs';
import {createAimRecoil} from '/weapon-feel.mjs';
const serverMessageEnglish={"\u91cd\u8fde\u623f\u95f4\u5df2\u5931\u6548\uff0c\u8bf7\u521b\u5efa\u65b0\u623f\u95f4\u3002":"The previous room is no longer available. Create a new room.","\u670d\u52a1\u5668\u623f\u95f4\u5df2\u6ee1\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002":"The server has reached its room limit. Please try again later.","\u627e\u4e0d\u5230\u8fd9\u4e2a\u623f\u95f4\uff0c\u8bf7\u68c0\u67e5\u623f\u95f4\u7801\u3002":"Room not found. Check the room code.","\u623f\u95f4\u5df2\u6709\u4e24\u4f4d\u73a9\u5bb6\u3002":"This room already has two players.","\u5f53\u524d\u72b6\u6001\u4e0d\u80fd\u66f4\u6362\u88c5\u5907\uff0c\u8bf7\u7b49\u5f85\u590d\u6d3b\u6216\u7ee7\u7eed\u5bf9\u5c40\u3002":"Equipment cannot be changed right now. Wait for respawn or resume the match.","\u670d\u52a1\u5668\u5df2\u786e\u8ba4\u914d\u88c5\u3002":"Loadout confirmed.","\u65e0\u6548\u6d88\u606f\u3002":"Invalid message.","\u5bf9\u624b\u65ad\u7ebf\uff0c\u5bf9\u5c40\u6682\u505c\u3002\u7b49\u5f85\u91cd\u8fde 30 \u79d2\u3002":"Opponent disconnected. Match paused for up to 30 seconds while they reconnect.","\u65e0\u6548\u914d\u88c5\u3002":"Invalid loadout.","\u6b64\u88c5\u5907\u5c1a\u672a\u63a5\u5165\uff0c\u6216\u4e0d\u5c5e\u4e8e\u8be5\u69fd\u4f4d\u3002":"This equipment is unavailable or does not belong in this slot.","\u6b64\u76ae\u80a4\u5c1a\u672a\u63a5\u5165\u3002":"This skin is not available yet.","\u6b64\u82f1\u96c4\u5c1a\u672a\u63a5\u5165\u3002":"This agent is not available yet.","\u8bf7\u9009\u62e9\u88c5\u5907\u6216\u82f1\u96c4\u3002":"Select a weapon or an agent."};
const recoil=createAimRecoil();
let lastTraceSave=-Infinity,pointerInputMode='none';
const viewTrace=createViewTrace({onJump:record=>{const now=performance.now();if(now-lastTraceSave<500)return;lastTraceSave=now;try{localStorage.setItem('offset:view-jump',JSON.stringify(record));}catch{}}});
const gameAudio=createGameAudio(),ads=createADS(),lookInput=createLookInput(),weaponWheel=createWeaponWheel();
function adsState(){const p=state?.players.find(p=>p.id===id);return {weapon:gun.userData.weapon,alive:!!p&&p.hp>0,playing:connected&&!!playing(),phase:state?.phase,reloading:!!p?.reloadUntil,equipping:Date.now()<(p?.equipUntil||0)};}
const pendingEjections=[];
const pendingShots=new Map(),seenShots=new Set(),inputMuzzles=new Map();let localReadyAt=0,localEquipReadyAt=0,clientShotId=0,secondaryFire=false,middleMouse=false,lastReload=0,lastWeapon=null,tracerCount=0,lastTracer=null;
const $=id=>document.getElementById(id),canvas=$('scene');
// Update this share origin when renewing the temporary public tunnel.
const foundryShareOrigin='https://mounting-thumbs-roughly-mild.trycloudflare.com';
const publicShareOrigin='https://sufficiently-country-voters-modules.trycloudflare.com';
const invitePanel=document.createElement('div');invitePanel.className='pauseInvite';
invitePanel.innerHTML='<label for="inviteLink">Invite a friend <b id="pauseRoomCode"></b></label><input id="inviteLink" readonly aria-label="Invite link"><button id="pauseCopy" class="secondary">Copy invite link</button>';
$('play').after(invitePanel);
function refreshInvite(){
 const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 const url=new URL('/',location.origin);if(code)url.searchParams.set('room',code);
 const value=code?url.href:'';if($('inviteLink').value!==value)$('inviteLink').value=value;
 $('pauseRoomCode').textContent=code||'';$('pauseCopy').disabled=!code;
 return url.href;
}
const adsReticle=createAdsReticle($('hud')),combatFeedback=createCombatFeedbackPlanner();
let renderer;try{renderer=new T.WebGLRenderer({canvas,antialias:true});}catch(e){$('error').textContent='WebGL could not start. Use a desktop browser with 3D support.';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.setClearColor(0xacc9cf);
const scene=new T.Scene();const shotEffects=createShotEffects(scene,{surfaceRoot:()=>mapScene.surfaceRoot});scene.fog=new T.Fog(0xacc9cf,28,75);
const camera=new T.PerspectiveCamera(74,innerWidth/innerHeight,.05,100);camera.rotation.order='YXZ';scene.add(camera);
const hemisphere=new T.HemisphereLight(0xdaf5ff,0x6a6665,2.1);hemisphere.layers.enable(1);scene.add(hemisphere);const sun=new T.DirectionalLight(0xffefda,3);sun.position.set(8,20,10);sun.layers.enable(1);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-22,right:22,top:25,bottom:-25,near:.5,far:60});sun.shadow.bias=-.001;scene.add(sun);
const qualityProfiles={performance:{ratio:1,shadow:0},balanced:{ratio:1.25,shadow:1024},high:{ratio:2,shadow:2048}};
const qualitySelect=document.createElement('select');qualitySelect.id='quality';qualitySelect.innerHTML='<option value="performance">Performance</option><option value="balanced">Balanced</option><option value="high">High</option>';
const qualityLabel=document.createElement('label');qualityLabel.textContent='Graphics ';qualityLabel.append(qualitySelect);document.querySelector('.settings').prepend(qualityLabel);
function applyQuality(name){const profile=qualityProfiles[name]||qualityProfiles.balanced;renderer.setPixelRatio(Math.min(devicePixelRatio,profile.ratio));renderer.shadowMap.enabled=!!profile.shadow;if(profile.shadow){sun.shadow.mapSize.set(profile.shadow,profile.shadow);sun.shadow.map?.dispose();sun.shadow.map=null;}renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.needsUpdate=true;}
qualitySelect.value=localStorage.getItem('offset:quality')||'balanced';if(!qualityProfiles[qualitySelect.value])qualitySelect.value='balanced';applyQuality(qualitySelect.value);qualitySelect.onchange=()=>{applyQuality(qualitySelect.value);localStorage.setItem('offset:quality',qualitySelect.value);};
const fpsReadout=document.createElement('span');fpsReadout.id='fps';fpsReadout.style.marginRight='12px';$('ping').before(fpsReadout);let lastFpsUpdate=0;
const trainingArena=buildArena(scene,BOXES),mapScene=createMapScene(scene,trainingArena);let mapReady=true;async function selectMap(map){shotEffects.clear();mapReady=false;$('play').disabled=true;$('play').textContent='Loading map…';try{await mapScene.select(map);mapReady=true;refreshPlayButton();$('overlay').querySelector('h2').nextElementSibling.textContent=map==='ascent'?'Ascent B courtyard training. The cyan fence marks the playable boundary. Press Esc for settings.':'Adjust settings or copy the invite link. Select Resume game to continue.';}catch(e){toast('Map failed to load. Return to the menu and try again.');}}
const {gun,flash}=buildWeapon(camera);
const characterOcclusion=createCharacterViewmodelOcclusion();
const enemyGroup=buildOpponent();scene.add(enemyGroup);enemyGroup.visible=false;
const hitboxDebugEnabled=new URLSearchParams(location.search).has('hitboxes');
const hitboxDebug={authoritative:[],displayed:[],comparison:null,peaks:{}};
const debugBoxes=[],debugGeometryCache=new Map();
if(hitboxDebugEnabled){
 const label=document.createElement('div');label.textContent='HITBOX DEBUG · Same display timestamp · Cyan: Hitbox reference · Orange: Original animation skeleton';
 label.style.cssText='position:fixed;left:12px;top:90px;background:#13252edd;color:white;padding:8px;font:12px sans-serif;pointer-events:none';document.body.append(label);
}
function updateHitboxDebug(){
 if(!hitboxDebugEnabled)return;
 const shown=enemyDisplaySample?.player||enemyTarget;
 const at=enemyDisplaySample?.at??(state?.phase==='paused'?state.pausedAt:state?.now);
 const visible=!!id&&connected&&enemyGroup.visible&&enemyGroup.userData.status==='ready'&&shown?.hp>0;
 hitboxDebug.authoritative=visible?playerHitboxes({...shown,hitboxSampleAt:at}):[];
 hitboxDebug.displayed=visible?playerHitboxes({...shown,x:enemyGroup.position.x,y:enemyGroup.position.y,z:enemyGroup.position.z,hitboxPose:getOpponentHitboxPose(enemyGroup)}):[];
 if(visible){
  const errors=hitboxDebug.authoritative.map((shape,i)=>{const other=hitboxDebug.displayed[i],points=shape.kind==='ellipsoid'?['center']:['a','b'];return {name:shape.name,mm:1000*Math.max(...points.map(k=>Math.hypot(...['x','y','z'].map(c=>shape[k][c]-other[k][c]))))};});
  const worst=errors.reduce((a,b)=>a.mm>b.mm?a:b);
  const context=[shown.weapon,shown.crouch?'crouch':'stand',shown.hitboxMotion?.previousKey,shown.hitboxMotion?.key].join(':');
  hitboxDebug.comparison={at,weapon:shown.weapon,crouch:shown.crouch,motion:shown.hitboxMotion,action:shown.hitboxAction,rig:{upper:enemyGroup.userData.diagnostics.combatUpper,combat:enemyGroup.userData.diagnostics.combat,returnBlend:enemyGroup.userData.diagnostics.returnBlend},worst,errors};
  const previous=hitboxDebug.peaks[context];
  if(!previous||worst.mm>previous.worst.mm)hitboxDebug.peaks[context]={...hitboxDebug.comparison};
 }else hitboxDebug.comparison=null;
 const shapes=[...hitboxDebug.authoritative,...hitboxDebug.displayed],activeGeometry=new Set();
 shapes.forEach((shape,i)=>{
  const length=shape.kind==='capsule'?Math.hypot(shape.b.x-shape.a.x,shape.b.y-shape.a.y,shape.b.z-shape.a.z):0;
  const key=shape.kind==='ellipsoid'?'sphere':`capsule:${shape.radius}:${length.toFixed(5)}`;
  activeGeometry.add(key);if(!debugGeometryCache.has(key))debugGeometryCache.set(key,shape.kind==='ellipsoid'?new T.SphereGeometry(1,12,8):new T.CapsuleGeometry(shape.radius,length,4,8));
  let mesh=debugBoxes[i];if(!mesh){mesh=new T.Mesh(debugGeometryCache.get(key),new T.MeshBasicMaterial({color:i<hitboxDebug.authoritative.length?0x64ffe0:0xffaa44,wireframe:true,depthTest:true,transparent:true,opacity:.75}));scene.add(mesh);debugBoxes[i]=mesh;}
  mesh.visible=true;mesh.geometry=debugGeometryCache.get(key);mesh.quaternion.identity();mesh.scale.set(1,1,1);
  if(shape.kind==='ellipsoid'){mesh.position.set(shape.center.x,shape.center.y,shape.center.z);mesh.scale.set(shape.radii.x,shape.radii.y,shape.radii.z);}
  else{mesh.position.set((shape.a.x+shape.b.x)/2,(shape.a.y+shape.b.y)/2,(shape.a.z+shape.b.z)/2);if(length>1e-8)mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(shape.b.x-shape.a.x,shape.b.y-shape.a.y,shape.b.z-shape.a.z).normalize());}
 });
 for(let i=shapes.length;i<debugBoxes.length;i++)debugBoxes[i].visible=false;
 for(const [key,geometry] of debugGeometryCache)if(debugGeometryCache.size>128&&!activeGeometry.has(key)){geometry.dispose();debugGeometryCache.delete(key);}
}
let viewSnapshots=[],lastRewind=null,enemyDisplaySample=null;
function shotView(){return enemyDisplaySample?.view||null;}
let entryPending=false,entryGeneration=0,hasEnteredArena=false;
let settingsOpen=false,suspended=false,bootLoaded=false,autoEntryRequested=false,wasPointerLocked=false,pointerUnlockPending=false;
const loadingScreen=document.createElement('section');loadingScreen.id='gameLoading';loadingScreen.className='gameLoading';loadingScreen.setAttribute('aria-label','Game loading');
loadingScreen.innerHTML='<div class="loadingCard"><span class="eyebrow">OFFSET / AIM DUEL</span><h2>Preparing arena</h2><p id="loadingMessage" role="status" aria-live="polite">Loading models and original animations…</p><div class="loadingTrack"><span id="loadingProgress"></span></div><small id="loadingDetails"></small><button id="loadingContinue" hidden>Continue</button><button id="loadingBack" class="secondary" hidden>Main menu</button></div>';
document.body.append(loadingScreen);loadingScreen.hidden=true;$('bootSplash')?.remove();document.querySelector('.settings').hidden=true;
function releaseGamePointer(){wasPointerLocked=false;pointerUnlockPending=false;document.exitPointerLock();}
function openSettings(){if(!id||resultShown)return;autoEntryRequested=false;settingsOpen=true;suspended=false;armoryReturnToGame=false;armoryResumePending=false;$('armory').hidden=true;document.querySelector('.settings').hidden=false;$('overlay').querySelector('h2').textContent='Settings';pauseControls({settings:true});releaseGamePointer();}
let refreshResume=false,refreshRetries=0;
let lastConfirmedAccuracy=null;
function accuracyReadout(){const own=state?.players.find(p=>p.id===id),now=state?.phase==='paused'?state.pausedAt:(state?.now||0)+Math.max(0,performance.now()-stateReceivedAt);return {current:own?previewAccuracy(own,now):null,lastConfirmed:lastConfirmedAccuracy,calibration:ACCURACY_CALIBRATION};}
let ws=null,id=null,code=null,token=null,state=null,stateReceivedAt=0,self={x:0,z:11,yaw:0,pitch:0,vx:0,vz:0,y:0,vy:0,grounded:true,crouch:false},keys={},fire=false,seq=0,connected=false,joining=false,lastFrame=performance.now(),lastSend=0,lastHp=100,localShot=0,kick=0,enemyTarget=null,enemyEpoch=null,toastTimer,resultShown=false,reconnectTimer=null,dragLook=false,rightMouse=false,eyeOffset=EYE,frameMs=16,shotFeedbacks=0,aimRecoil=0;
gun.userData.onWeaponAction=(action,weapon,options={})=>{if(!['equip','reload'].includes(action)||!id||state?.phase==='paused'||state?.players.find(p=>p.id===id)?.hp<=0)return;if(action==='equip'){localEquipReadyAt=performance.now()+(Number.isFinite(options.equipElapsed)?Math.max(0,WEAPONS[weapon].equip-options.equipElapsed*1000):WEAPONS[weapon].equip);localReadyAt=localEquipReadyAt;}gameAudio.play(action,{weapon,actualDuration:(action==='equip'?WEAPONS[weapon].visualEquip:(WEAPONS[weapon].visualReload||WEAPONS[weapon].reload))/1000,reloadRemaining:options.reloadRemaining,readyDuration:options.readyDuration,equipRemaining:Number.isFinite(options.equipElapsed)?Math.max(0,WEAPONS[weapon].visualEquip/1000-options.equipElapsed):undefined});};
const movement=createMovementPrediction(self);let resetMovement=true;
function ownWeaponDeadline(now=performance.now()){
 const player=state?.players.find(p=>p.id===id);
 const serverNow=state?.phase==='paused'?state.pausedAt:(state?.now||0)+Math.max(0,now-stateReceivedAt);
 const reloadRemaining=player?.hp>0?Math.max(0,((player.reloadUntil||0)-serverNow)/1000):0;
 let equipElapsed=player?.weapon===gun.userData.weapon?(player.equipUntil>0?Math.max(0,(serverNow-player.equipUntil+WEAPONS[player.weapon].equip)/1000):WEAPONS[player.weapon].visualEquip/1000):undefined;
 if(gun.userData.previewWeapon===player?.weapon&&Number.isFinite(gun.userData.previewStartedAt)&&now-gun.userData.previewStartedAt<WEAPONS[player.weapon].visualEquip)equipElapsed=Math.max(0,(now-gun.userData.previewStartedAt)/1000);
 const reloadReadyDuration=player?.hitboxAction?.kind==='reload'&&player.reloadUntil>player.hitboxAction.at?(player.reloadUntil-player.hitboxAction.at)/1000:undefined;return {reloading:reloadRemaining>0,reloadRemaining,reloadReadyDuration,equipElapsed,serverNow};
}

const dataReady=()=>isBrowserHitboxReady(gun.userData.weapon)&&(!enemyTarget||isBrowserHitboxReady(enemyTarget.weapon));
const pendingHitboxLoads=new Map();
function prepareHitbox(weapon){if(!weapon||isBrowserHitboxReady(weapon)||pendingHitboxLoads.has(weapon))return;const task=ensureBrowserHitboxData(weapon).catch(e=>{toast('Hitbox data failed to load: '+weapon);console.error(e);}).finally(()=>{pendingHitboxLoads.delete(weapon);refreshPlayButton();});pendingHitboxLoads.set(weapon,task);}
let armoryReturnToGame=false,armoryResumePending=false;
const shopPreview=()=>!!id&&!$('armory').hidden&&!resultShown&&!!state?.players.find(p=>p.id===id)?.hp;
const playing=()=>dataReady()&&!entryPending&&(!enemyTarget||(enemyGroup.userData.status==='ready'&&(enemyGroup.userData.isWeaponReady?.(enemyTarget.weapon)??true)))&&gun.userData.isWeaponReady()&&connected&&mapReady&&!!id&&$('overlay').hidden&&$('armory').hidden&&!resultShown&&(document.pointerLockElement===canvas||dragLook);
const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ControlLeft','ControlRight','ShiftLeft','ShiftRight','Space','KeyC']);
const canMove=()=>!!playing()||(shopPreview()&&connected&&mapReady&&!settingsOpen&&!document.hidden);
function applyAimRecoil(now=performance.now()){self.pitch=Math.max(-1.45,Math.min(1.45,self.pitch+recoil.consume(now)));aimRecoil=recoil.sample(now);}
function resetAimRecoil(){applyAimRecoil();recoil.reset();aimRecoil=0;}
function resetControls({keepMovement=false}={}){const held=keepMovement?Object.fromEntries(Object.entries(keys).filter(([code])=>movementKeys.has(code))):{};weaponWheel.reset();resetAimRecoil();flash.userData.effects.clear();aimRecoil=0;kick=0;pendingEjections.length=0;keys=held;fire=false;secondaryFire=false;rightMouse=false;middleMouse=false;lookInput.reset();ads.reset(true);}
function pauseControls({settings=false}={}){entryGeneration++;entryPending=false;resetControls();gun.userData.resetAnimation?.();gameAudio.stop('all');dragLook=false;sendInput();if(id&&!resultShown){const showSettings=settings||settingsOpen;$('overlay').hidden=!showSettings;suspended=!showSettings;}refreshPlayButton();}
function adsIntent(){const s=adsState();return ads.requested&&!!WEAPONS[s.weapon]?.ads&&s.alive&&s.playing&&!s.reloading&&!s.equipping&&['active','waiting'].includes(s.phase);}
const input=()=>({ads:adsIntent(),forward:!!keys.KeyW,back:!!keys.KeyS,left:!!keys.KeyA,right:!!keys.KeyD,walk:!!keys.ShiftLeft||!!keys.ShiftRight,crouch:!!keys.ControlLeft||!!keys.ControlRight||!!keys.KeyC,jump:!!keys.Space});
function toast(t){$('toast').textContent=t;$('toast').style.opacity=1;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.opacity=0,3000);}
function send(m){if(m.type==='input'){applyAimRecoil();m.pitch=self.pitch;m.moves=movement.takeMoves();m.moveEpoch=movement.epoch;inputMuzzles.set(m.seq,{muzzle:getMuzzlePosition(gun).toArray()});if(inputMuzzles.size>180)inputMuzzles.delete(inputMuzzles.keys().next().value);}if(ws?.readyState===1)ws.send(JSON.stringify(m));}
function hitFeedback(m){const feedback=combatFeedback.plan(m,id);if(!feedback)return;const {own,weapon}=feedback;
  if(playing())for(const layer of feedback.sounds)gameAudio.play(layer.sound,{weapon,eventId:layer.eventId,volume:layer.volume,variant:layer.sound==='kill'?Math.min(4,(state?.players.find(p=>p.id===id)?.kills||0)+1):undefined});
  if(m.damage&&m.victim===enemyTarget?.id)enemyGroup.userData.lifecycle?.triggerHit(m.part,m.shotId,!!m.killed);  if(own&&m.damage){$('hitmarker').style.borderColor=m.part==='head'?'#ff5369':'white';$('hitmarker').style.opacity=1;setTimeout(()=>$('hitmarker').style.opacity=0,130);}  if(m.killed){const attacker=state?.players.find(p=>p.id===m.id)?.name||'Agent',victim=state?.players.find(p=>p.id===m.victim)?.name||'Agent';$('feed').textContent=`${attacker} ${m.part==='head'?'◇ HEADSHOT':'→'} ${victim}`;setTimeout(()=>$('feed').textContent='',3000);}
}
function connect(action){autoEntryRequested=true;settingsOpen=false;document.querySelector('.settings').hidden=true;const inputGeneration=++entryGeneration;gameAudio.unlock();requestGamePointerLock(canvas).then(mode=>{if(inputGeneration===entryGeneration&&!settingsOpen)pointerInputMode=mode;}).catch(()=>{if(inputGeneration===entryGeneration&&!settingsOpen){pointerInputMode='drag-fallback';dragLook=true;}});if(['create','join'].includes(action.type))action={...action,preference:readLoadoutPreference(localStorage)};if(action.type!=='resume'){refreshResume=false;clearTimeout(reconnectTimer);clearRoomSession(sessionStorage);$('rejoinPrevious')?.remove();}joining=true;$('error').textContent='Connecting to server…';ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);ws.onopen=()=>{connected=true;send(action);};ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.message)m.message=serverMessageEnglish[m.message]||m.message;if(m.type==='welcome'){$('rejoinPrevious')?.remove();id=m.id;code=m.code;token=m.token;if(Number.isSafeInteger(m.shotRequestFloor))clientShotId=Math.max(clientShotId,m.shotRequestFloor);saveRoomSession(sessionStorage,m);refreshResume=false;resetMovement=true;joining=false;$('menu').hidden=true;$('hud').hidden=false;$('roomCode').textContent=code;$('overlay').hidden=true;suspended=true;settingsOpen=false;document.querySelector('.settings').hidden=true;$('error').textContent='';toast('Room connected: '+code);}
 else if(m.type==='error'){$('error').textContent=m.message;toast(m.message);if(action.type==='resume'){if(refreshResume&&refreshRetries++<3){const failed=ws;failed.onclose=null;failed.close();connected=false;clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>connect(action),300);}else{refreshResume=false;leave();}}else if(!id){joining=false;ws.close();}}
 else if(m.type==='loadout-result'){
  if(m.requestId!==pendingLoadoutRequest)return;
  pendingLoadoutRequest=null;if(!m.ok)pendingLoadoutWeapon=null;
  armoryUI.status(m.message,!m.ok);
  if(m.ok){saveLoadoutPreference(localStorage,{loadout:m.loadout,weapon:m.weapon});toast('Loadout confirmed · '+(WEAPONS[m.weapon]?.label||'JETT'));}
 }
 else if(m.type==='pong')$('ping').textContent=Math.max(0,Math.round(Date.now()-m.time))+' ms';
 else if(m.type==='state'){const first=!state,previousPhase=state?.phase;if(first||state.map!==m.map)selectMap(m.map||'training');state=m;$('mapLabel').textContent=(m.map==='ascent'?'ASCENT B / Courtyard':m.map==='duel'?'FOUNDRY':'TRAINING')+' · 100 HP + '+m.armor+' ARMOR';stateReceivedAt=performance.now();if(first||previousPhase!==m.phase){viewSnapshots=[];if(m.phase!=='paused')enemyDisplaySample=null;}if(m.snapshotId){viewSnapshots.push(m.trainingBot?{...m,players:[...m.players,m.trainingBot]}:m);viewSnapshots=viewSnapshots.filter(f=>m.now-f.now<=500).slice(-16);}const p=m.players.find(p=>p.id===id);if(!p)return;prepareHitbox(p.weapon);syncLoadoutUI(p,m.phase);if(first){Object.assign(self,{x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch,vx:0,vz:0,y:p.y||0,vy:p.vy||0,grounded:p.grounded!==false});}
  if(m.phase==='paused'&&previousPhase!=='paused'){resetControls();gameAudio.stop('all');}
  if(previousPhase==='paused'&&m.phase!=='paused'&&p.hp>0&&playing()){
   if(p.reloadUntil>m.now)gameAudio.play('reload',{weapon:p.weapon,actualDuration:(WEAPONS[p.weapon].visualReload||WEAPONS[p.weapon].reload)/1000,reloadRemaining:(p.reloadUntil-m.now)/1000,readyDuration:p.hitboxAction?.kind==='reload'?(p.reloadUntil-p.hitboxAction.at)/1000:undefined});
   else if(p.equipUntil>m.now&&p.weapon!=='knife')gameAudio.play('equip',{weapon:p.weapon,actualDuration:WEAPONS[p.weapon].visualEquip/1000,equipRemaining:(p.equipUntil-m.now+WEAPONS[p.weapon].visualEquip-WEAPONS[p.weapon].equip)/1000});
  }
  self.collisionPeers=m.characterCollision?[...m.players,...(m.phase==='waiting'&&m.trainingBot?[m.trainingBot]:[])].filter(q=>q.id!==id&&q.hp>0).map(q=>({id:q.id,x:q.x,y:q.y||0,z:q.z,crouch:!!q.crouch,hp:q.hp})):[];const reset=isBrowserHitboxReady(p.weapon)?movement.reconcile(p,{reset:first||resetMovement||lastHp<=0}):false;resetMovement=!isBrowserHitboxReady(p.weapon);const resetAim=reconcileAimSnapshot(self,p,{first,respawn:lastHp<=0&&p.hp>0,newRound:previousPhase==='finished'&&m.phase==='countdown'});if(resetAim){recoil.reset();aimRecoil=0;lastConfirmedAccuracy=null;}viewTrace.record("network",self,{first,resetMovement:reset,resetAim,life:p.lifeEpoch,epoch:p.spawnEpoch,correction:movement.diagnostics.correction,phase:m.phase});
  if((lastReload&&!p.reloadUntil)||lastWeapon!==p.weapon||p.hp<=0)gameAudio.stopReload();lastReload=p.reloadUntil||0;if(p.hp<=0||p.reloadUntil)resetAimRecoil();if(lastWeapon!==p.weapon){resetAimRecoil();flash.userData.effects.clear();if(lastWeapon)gameAudio.stop('equip',{weapon:lastWeapon});lastWeapon=p.weapon;}
  if(p.hp<=0&&lastHp>0){gameAudio.stop('equip',{weapon:p.weapon});resetControls();}
  if(p.hp<lastHp){$('damageFlash').style.opacity=1;setTimeout(()=>$('damageFlash').style.opacity=0,150);}lastHp=p.hp;
  $('hp').textContent=Math.ceil(p.hp);$('armor').textContent=Math.ceil(p.armor||0);$('healthLine').style.width=p.hp+'px';$('ammo').textContent=p.reloadUntil?'RELOAD':p.weapon==='knife'?'MELEE':p.ammo+' / ∞';$('weaponLabel').textContent=WEAPONS[p.weapon||'vandal'].label;gun.userData.pinnedWeapons=Object.values(p.loadout||{});gun.userData.selectWeapon?.(p.weapon||'vandal');if(p.weapon===pendingLoadoutWeapon)pendingLoadoutWeapon=null;$('myScore').textContent=p.kills;
  const q=m.players.find(q=>q.id!==id)||m.trainingBot;if(q){prepareHitbox(q.weapon);enemyGroup.userData.ensureWeapon?.(q.weapon);}if(q?.id!==enemyTarget?.id){enemyEpoch=null;enemyDisplaySample=null;enemyGroup.userData.combat?.reset();enemyGroup.userData.lifecycle?.reset();}$('theirScore').textContent=q?.kills||0;enemyTarget=q;enemyGroup.visible=!!q;if(q&&(!isBrowserHitboxReady(q.weapon)||enemyGroup.userData.status!=='ready'||enemyGroup.userData.isWeaponReady?.(q.weapon)===false)&&$('overlay').hidden&&!hasEnteredArena&&!shopPreview()&&!armoryResumePending){pauseControls();releaseGamePointer();}refreshPlayButton();
  if(q&&enemyEpoch!==(q.lifeEpoch??q.spawnEpoch)){enemyGroup.position.set(q.x,q.y||0,q.z);enemyEpoch=q.lifeEpoch??q.spawnEpoch;enemyDisplaySample=null;}
  let status=m.phase==='waiting'?(m.trainingBot?`BOT WARMUP · Eliminations ${p.trainingKills||0} · Passive · Respawns in 2s\nRoom ${code} · A friend joining starts 1v1`:`WARMUP · Move / jump / fire\nRoom ${code} · Copy the invite link to bring a friend`):m.phase==='paused'?'Opponent disconnected · Reconnecting (up to 30s)':m.phase==='countdown'?`Get ready · ${Math.max(1,Math.ceil((m.startAt-m.now)/1000))}`:p.hp<=0?`Eliminated · Respawning in ${Math.max(1,Math.ceil((p.respawnAt-m.now)/1000))}s`:'';
  document.querySelector('.score small').textContent=m.phase==='waiting'?'TRAINING':'FIRST TO 10';
  $('status').textContent=status;$('status').hidden=!status;
  if(m.phase==='finished'&&!resultShown){resultShown=true;resetControls();gameAudio.stopReload();gameAudio.stop('equip',{weapon:p.weapon});releaseGamePointer();$('overlay').hidden=true;$('results').hidden=false;$('resultTitle').textContent=m.winner===id?'VICTORY':'DEFEAT';$('resultScore').textContent=`${p.name} ${p.kills} : ${q.kills} ${q.name}`;const metrics=[['Accuracy',p.shots?Math.round(p.hits/p.shots*100)+'%':'—'],['Headshot percentage',p.hits?Math.round(p.headHits/p.hits*100)+'%':'—'],['Kills / Deaths',p.kills+' / '+p.deaths],['Headshot kills',p.headKills]];$('stats').replaceChildren(...metrics.map(([label,value])=>{const div=document.createElement('div'),b=document.createElement('b'),small=document.createElement('small');b.textContent=value;small.textContent=label;div.append(b,small);return div;}));$('rematch').disabled=false;}
  if(m.phase==='countdown'&&resultShown){resultShown=false;$('results').hidden=true;$('overlay').hidden=true;suspended=true;$('rematchStatus').textContent='';}
 }
 else if(m.type==='shot'){
  if(m.shotId&&seenShots.has(m.shotId))return;if(m.shotId){seenShots.add(m.shotId);if(seenShots.size>512)seenShots.delete(seenShots.values().next().value);}
  const own=m.id===id,weapon=m.weapon||'vandal',attack=m.attack||'primary';if(own&&m.accuracy)lastConfirmedAccuracy={...m.accuracy,at:m.occurredAt};if(own)lastRewind=m.rewind||null;
  const pending=own?pendingShots.get(m.clientShotId):null;
  if(pending&&pending.weapon===weapon&&!pending.used)pending.used=true;
  const predicted=pending&&pending.weapon===weapon&&pending.attack===attack&&!pending.acknowledged;if(predicted)pending.acknowledged=true;
  if(own&&!predicted&&weapon===gun.userData.weapon&&playing()&&state?.players.find(p=>p.id===id)?.hp>0&&['waiting','active'].includes(state?.phase))weaponFeedback(attack,weapon,{playSound:weapon==='knife'});
  const confirmedSound=planConfirmedGunSound(m,{own,predicted:!!predicted,predictedAudioPlayed:!!pending?.audioPlayed,audible:own?!!playing():true});
  if(confirmedSound)gameAudio.play(confirmedSound.event,{weapon,eventId:confirmedSound.eventId,distance:own?0:Math.hypot(self.x-m.origin.x,self.z-m.origin.z)});
  if(!own){enemyGroup.userData.combat?.triggerFire(weapon,attack,m.shotId,m.startedAt??m.occurredAt,m.ads);if(weapon==='knife')gameAudio.play('melee',{weapon,variant:attack,distance:Math.hypot(self.x-m.origin.x,self.z-m.origin.z)});}
  hitFeedback(m);

  if(weapon!=='knife'){
   const captured=own&&predicted?pending.muzzle:own?inputMuzzles.get(m.seq)?.muzzle:null;
   const visual=resolveShotVisual({muzzle:own?getMuzzlePosition(gun):getOpponentMuzzle(enemyGroup),end:m.end,eye:own?camera.position:m.origin,forward:own?camera.getWorldDirection(new T.Vector3()):null,enabled:!own||weapon===gun.userData.weapon&&playing()&&state?.players.find(p=>p.id===id)?.hp>0});
   const {start,end,drawTracer}=visual,delta=end.clone().sub(start),length=delta.length();
   if(drawTracer&&length>.001){const dir=delta.clone().normalize(),clip=trace(start,dir,null,state?.map).distance;end.copy(start).addScaledVector(dir,Math.min(length,clip));}
   lastTracer={start:start.toArray(),end:end.toArray(),weapon,clientShotId:m.clientShotId,predicted:!!predicted,drawTracer,reason:visual.reason,source:'rendered muzzle',capturedStart:captured,muzzleDrift:captured?start.distanceTo(new T.Vector3(...captured)):null};tracerCount++;
   if(m.pellets)for(const pellet of m.pellets)shotEffects.shot({start,drawTracer,end:new T.Vector3(pellet.end.x,pellet.end.y,pellet.end.z),impactEnd:pellet.end,origin:pellet.origin,weapon,local:own,damage:pellet.damage,map:state?.map,now:performance.now()});
   else shotEffects.shot({start,end,drawTracer,impactEnd:m.end,origin:m.origin,weapon,local:own,damage:m.damage,map:state?.map,now:performance.now()});
  }

 }
 else if(m.type==='melee-hit'){
  hitFeedback(m);
  if(m.weapon==='knife'&&shotEffects.meleeImpact({...m,map:state?.map,now:performance.now()})&&playing())
   gameAudio.play('knife-wall',{weapon:'knife',position:m.end,eventId:`melee-wall:${m.id}:${m.shotId}`,volume:.85});
 }
 else if(m.type==='notice')toast(m.message);
 else if(m.type==='expired'){toast('Room closed. Create a new match.');leave();}
 };ws.onclose=()=>{entryGeneration++;entryPending=false;gun.userData.resetAnimation?.();refreshPlayButton();enemyGroup.userData.combat?.reset();enemyGroup.userData.lifecycle?.reset();enemyTarget=null;enemyEpoch=null;enemyDisplaySample=null;enemyGroup.visible=false;resetControls();gameAudio.stop('all');connected=false;if(id){toast('Connection lost. Reconnecting…');clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>connect({type:'resume',code,token}),1500);}else{joining=false;$('error').textContent='Connection closed. Please try again.';}};ws.onerror=()=>{$('error').textContent='Unable to connect to the server. Please try again.';};}
$('create').onclick=()=>{if(!joining&&!id)connect({type:'create',name:$('name').value,map:'duel',armor:50});};$('join').onclick=()=>{if(!joining&&!id){if(!/^[a-f\d]{6}$/i.test($('code').value.trim())){$('error').textContent='Enter a 6-character room code.';return;}connect({type:'join',name:$('name').value,code:$('code').value});}};
function leave(){hasEnteredArena=false;autoEntryRequested=false;pendingLoadoutWeapon=null;pendingLoadoutRequest=null;settingsOpen=false;suspended=false;armoryResumePending=false;document.querySelector('.settings').hidden=true;lastConfirmedAccuracy=null;clearRoomSession(sessionStorage);$('rejoinPrevious')?.remove();refreshResume=false;entryGeneration++;entryPending=false;pendingShots.clear();seenShots.clear();inputMuzzles.clear();localReadyAt=0;localEquipReadyAt=0;gun.userData.resetAnimation?.();shotEffects.clear();combatFeedback.clear();gameAudio.clearFeedbackHistory();enemyGroup.userData.combat?.reset();enemyGroup.userData.lifecycle?.reset();enemyTarget=null;enemyEpoch=null;enemyDisplaySample=null;ads.reset(true);gameAudio.stop('all');lastReload=0;lastWeapon=null;id=null;token=null;code=null;state=null;stateReceivedAt=0;enemyTarget=null;connected=false;clearTimeout(reconnectTimer);if(ws){ws.onclose=null;ws.onmessage=null;ws.onerror=null;ws.close();ws=null;}releaseGamePointer();$('menu').hidden=false;$('hud').hidden=true;$('overlay').hidden=true;$('results').hidden=true;enemyGroup.visible=false;resultShown=false;resetControls();dragLook=false;}
$('leave').onclick=leave;$('resultLeave').onclick=leave;$('rematch').onclick=()=>{send({type:'rematch'});$('rematch').disabled=true;$('rematchStatus').textContent='Waiting for your opponent to accept the rematch…';};
function startFallback(){resetControls();pointerInputMode='drag-fallback';dragLook=true;$('overlay').hidden=true;canvas.focus();$('tip').textContent='Hold middle mouse to aim · Left click fire · Right click ADS / secondary · WASD move · Space jump · C / Ctrl crouch · R reload · 1 / 2 / 3 or scroll: switch weapon · B armory · Esc menu';}
function refreshPlayButton(){
 refreshInvite();
 const states=gun.userData.loadingDiagnostics.states,failed=states.arms==='failed'||states[gun.userData.weapon]==='failed',opponentPending=!!enemyTarget&&(enemyGroup.userData.status!=='ready'||enemyGroup.userData.isWeaponReady?.(enemyTarget.weapon)===false),opponentFailed=opponentPending&&(enemyGroup.userData.status==='failed'||enemyGroup.userData.hasWeaponError?.(enemyTarget.weapon));
 const text=entryPending?'Preparing audio…':!mapReady?'Loading map…':opponentFailed?'Retry character loading':opponentPending?'Loading opponent…':gun.userData.isWeaponReady()?'Resume game':failed?'Retry weapon loading':'Loading weapon and arms…';
 $('play').disabled=entryPending||!mapReady||(opponentPending&&!opponentFailed)||(!gun.userData.isWeaponReady()&&!failed);
 if($('play').textContent!==text)$('play').textContent=text;
}
gun.userData.onAssetsChanged=()=>{refreshPlayButton();if(id&&!hasEnteredArena&&!shopPreview()&&!armoryResumePending&&!gun.userData.isWeaponReady()&&$('overlay').hidden){pauseControls();releaseGamePointer();}};
enemyGroup.userData.onAssetsChanged=refreshPlayButton;refreshPlayButton();enemyGroup.userData.readyPromise.then(refreshPlayButton);
$('play').onclick=async()=>{
 if(entryPending)return;
 settingsOpen=false;document.querySelector('.settings').hidden=true;suspended=false;
 if(enemyTarget&&enemyGroup.userData.status==='failed'){await enemyGroup.userData.retryAssets();refreshPlayButton();return;}
 if(enemyTarget&&enemyGroup.userData.hasWeaponError?.(enemyTarget.weapon)){await enemyGroup.userData.ensureWeapon(enemyTarget.weapon,{retry:true});refreshPlayButton();return;}
 if(enemyTarget&&(enemyGroup.userData.status!=='ready'||enemyGroup.userData.isWeaponReady?.(enemyTarget.weapon)===false))return;
 if(!gun.userData.isWeaponReady()){await Promise.all([gun.userData.retryAssets(),enemyGroup.userData.status==='failed'?enemyGroup.userData.retryAssets():Promise.resolve()]);refreshPlayButton();return;}
 const generation=++entryGeneration;entryPending=true;refreshPlayButton();
 const audioLoad=gameAudio.unlock();canvas.focus();
 try{if(document.pointerLockElement!==canvas&&!dragLook)pointerInputMode=await requestGamePointerLock(canvas);if(generation===entryGeneration){if(document.pointerLockElement===canvas)dragLook=false;$('overlay').hidden=true;}}
 catch{if(generation===entryGeneration)startFallback();}
 await audioLoad;
 if(generation!==entryGeneration||!id||!connected){entryPending=false;refreshPlayButton();return;}
 const player=state?.players.find(p=>p.id===id);
 if(!dataReady()||!gun.userData.isWeaponReady()||!player?.hp||!['waiting','active','countdown'].includes(state?.phase)){pauseControls();return;}
 gun.visible=true;animateWeapon(gun,{dt:0,...ownWeaponDeadline(),ads:0});
 entryPending=false;hasEnteredArena=true;refreshPlayButton();
 // The first visible frame starts native Equip once. No late asynchronous replay.
 if(gameAudio.diagnostics.status==='failed'||gameAudio.diagnostics.status==='partial')toast('Some sounds failed to load. Open settings and resume to retry.');
};
document.addEventListener('pointerlockerror',()=>{if(id&&!resultShown&&!settingsOpen&&$('armory').hidden)startFallback();});
document.addEventListener('pointerlockchange',()=>{
 resetControls({keepMovement:shopPreview()||armoryResumePending});const locked=document.pointerLockElement===canvas,nativeExit=wasPointerLocked&&!locked;wasPointerLocked=locked;
 viewTrace.record('lock',self,{locked});
 if(locked){dragLook=false;suspended=false;pointerUnlockPending=false;}
 if(!locked&&!dragLook&&!shopPreview()&&!armoryResumePending){gameAudio.stop('all');if(!settingsOpen&&id&&!resultShown)suspended=true;}
 // Browsers may consume Esc without delivering either keyboard event.
 // Programmatic exits clear wasPointerLocked before releasing the pointer.
 if(nativeExit&&id&&!resultShown&&!settingsOpen&&!shopPreview()&&!armoryResumePending&&!autoEntryRequested){
  pointerUnlockPending=true;
  setTimeout(()=>{if(!pointerUnlockPending)return;pointerUnlockPending=false;if(!document.pointerLockElement&&!document.hidden&&document.hasFocus()&&id&&!resultShown&&!settingsOpen&&!shopPreview()&&!armoryResumePending)openSettings();},0);
 }
 $('overlay').hidden=!settingsOpen||locked||!id||resultShown;sendInput();
});
$('settings').textContent='Settings / Esc';$('settings').disabled=true;
async function copyInvite(){
 if(!code)return;const url=refreshInvite();
 try{await navigator.clipboard.writeText(url);toast('Invite link copied. Send it to a friend to join.');}
 catch{if($('overlay').hidden){pauseControls();releaseGamePointer();}$('inviteLink').focus();$('inviteLink').select();toast('Could not copy automatically. Select and copy the invite link above.');}
}
$('copy').onclick=copyInvite;$('pauseCopy').onclick=copyInvite;
$('inviteLink').onclick=()=> $('inviteLink').select();
document.addEventListener('mousemove',e=>{if(!(e.buttons&1))fire=false;if(!(e.buttons&2)){rightMouse=false;secondaryFire=false;}const delta=lookInput.delta(e,{enabled:!!playing(),locked:document.pointerLockElement===canvas});middleMouse=lookInput.diagnostics.dragging;if(!delta)return;const sens=Number($('sensitivity').value)*.002*ads.sensitivityScale;self.yaw-=delta[0]*sens;self.pitch=Math.max(-1.45,Math.min(1.45,self.pitch-delta[1]*sens));viewTrace.record('mouse',self,{dx:delta[0],dy:delta[1],mode:lookInput.diagnostics.lastDelta?.mode,inputMode:pointerInputMode});});
function requestEquip(weapon){
 const p=state?.players.find(p=>p.id===id);
 if(!readyWeapon(weapon)||!p?.hp||!loadoutOrder(p.loadout).includes(weapon)||!['waiting','active','countdown'].includes(state?.phase))return;
 if(weapon!==p.weapon)gameAudio.cancelPendingAttacks(p.weapon);
 ads.reset(true);fire=false;secondaryFire=false;weaponWheel.select(weapon,performance.now());
 // Close the stale-snapshot prediction window immediately on the equip intent.
 localEquipReadyAt=performance.now()+WEAPONS[weapon].equip;localReadyAt=localEquipReadyAt;
 send({type:'equip',weapon});
}
document.addEventListener('wheel',e=>{
 const p=state?.players.find(p=>p.id===id);
 if(!playing()||!p?.hp||!['waiting','active','countdown'].includes(state.phase)||e.ctrlKey||e.target.closest?.('button,input,.modal'))return;
 if(!Number.isFinite(e.deltaY)||!e.deltaY)return;
 e.preventDefault();const weapon=weaponWheel.next(e,p.weapon,performance.now(),loadoutOrder(p.loadout));if(weapon)requestEquip(weapon);
},{passive:false});
document.addEventListener('keydown',e=>{if(!$('armory').hidden){if(e.code==='KeyB'&&!e.repeat){e.preventDefault();closeArmory();}else if(movementKeys.has(e.code)&&canMove()&&!e.target.matches?.('input,textarea,select,[contenteditable]')){e.preventDefault();keys[e.code]=true;sendInput();}return;}if(e.code==='KeyB'&&!e.repeat&&id&&!resultShown){e.preventDefault();openArmory();return;}if(!playing())return;if(e.code==='Escape'&&dragLook){dragLook=false;pauseControls();return;}if(['KeyW','KeyA','KeyS','KeyD','ControlLeft','ControlRight','ShiftLeft','ShiftRight','Space','KeyC'].includes(e.code))e.preventDefault();keys[e.code]=true;if(['Digit1','Digit2','Digit3'].includes(e.code)&&!e.repeat){requestEquip(loadoutOrder(state?.players.find(p=>p.id===id)?.loadout)[Number(e.code.slice(-1))-1]);}if(e.code==='KeyF'&&!e.repeat){if(gun.userData.weapon==='knife')gun.userData.firstPersonArms?.inspect();else if(!!gun.userData.additionalArms[gun.userData.weapon])gun.userData.getActiveArms?.()?.inspect();}if(e.code==='KeyR'){ads.reset();send({type:'input',...input(),yaw:self.yaw,pitch:self.pitch,seq:++seq,reload:true,fire:false});}});document.addEventListener('keyup',e=>keys[e.code]=false);
function sendInput({fireEdge=false}={}){send({type:'input',fireEdge,viewSnapshot:shotView(),shotLife:state?.players.find(p=>p.id===id)?.lifeEpoch,...input(),yaw:self.yaw,pitch:self.pitch,seq:++seq,fire:fire&&playing()&&performance.now()>=localEquipReadyAt,secondaryFire:secondaryFire&&playing()&&performance.now()>=localEquipReadyAt,clientShotId});}
function predictShot(attack='primary'){
 const p=state?.players.find(p=>p.id===id),w=WEAPONS[p?.weapon||'vandal'];
 
 if(!playing()||!p||p.hp<=0||(!p.ammo&&p.weapon!=='knife')||p.reloadUntil||Date.now()<(p.equipUntil||0)||!['waiting','active'].includes(state.phase)||performance.now()<localReadyAt||performance.now()<localEquipReadyAt||Date.now()<(p.nextShotAt||0))return;
 localShot=performance.now();camera.updateWorldMatrix(true,true);
 pendingShots.set(clientShotId,{weapon:p.weapon,attack,muzzle:getMuzzlePosition(gun).toArray(),time:localShot,used:false});
 if(pendingShots.size>128)pendingShots.delete(pendingShots.keys().next().value);
 pendingShots.get(clientShotId).audioPlayed=weaponFeedback(attack,p.weapon);
}
let emptyReloadRequest=null;
function reloadEmptyMagazine(){
 const p=state?.players.find(p=>p.id===id),now=performance.now();
 if(!playing()||!connected||!p||WEAPONS[p.weapon].capacity<=0||p.ammo!==0){emptyReloadRequest=null;return false;}
 if(p.hp>0&&!p.reloadUntil&&Date.now()>=(p.equipUntil||0)&&now>=localEquipReadyAt&&['waiting','active'].includes(state.phase)){
  // Keep the physical left trigger held; server blocks shots during reload.
  // Retry only after a missing acknowledgement, never reset an active deadline.
  if(emptyReloadRequest?.player===p.id&&emptyReloadRequest.weapon===p.weapon&&now-emptyReloadRequest.at<500)return true;
  emptyReloadRequest={player:p.id,weapon:p.weapon,at:now};
  ads.reset(true);
  send({type:'input',...input(),yaw:self.yaw,pitch:self.pitch,seq:++seq,reload:true,fire:false,secondaryFire:false});
 }
 return true;
}
document.addEventListener('mousedown',e=>{if(!playing()||e.target.closest?.('button,input,.modal'))return;canvas.focus();if(e.button===1){lookInput.begin(e);middleMouse=true;e.preventDefault();}if(e.button===2){rightMouse=true;if(!WEAPONS[gun.userData.weapon]?.ads&&!WEAPONS[gun.userData.weapon]?.secondary){fire=false;secondaryFire=false;sendInput();return;}if(WEAPONS[gun.userData.weapon]?.ads)ads.toggle(adsState());if((gun.userData.weapon==='knife'||WEAPONS[gun.userData.weapon]?.secondary)){secondaryFire=true;clientShotId++;predictShot('secondary');sendInput({fireEdge:true});}}if(e.button===0){fire=true;clientShotId++;if(!reloadEmptyMagazine())predictShot();sendInput({fireEdge:true});}});
document.addEventListener('mouseup',e=>{if(e.button===0)fire=false;if(e.button===1){lookInput.end(e);middleMouse=false;}if(e.button===2){rightMouse=false;secondaryFire=false;}sendInput();});document.addEventListener('contextmenu',e=>{if(playing())e.preventDefault();});window.addEventListener('blur',pauseControls);document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseControls();});canvas.addEventListener('pointercancel',pauseControls);
for(const setting of ['sensitivity','crossColor','crossSize','crossGap']){const value=localStorage.getItem('offset:'+setting);if(value)$(setting).value=value;$(setting).oninput=()=>{localStorage.setItem('offset:'+setting,$(setting).value);updateSettings();};}
function updateSettings(){document.documentElement.style.setProperty('--cross',$('crossColor').value);document.documentElement.style.setProperty('--size',$('crossSize').value+'px');document.documentElement.style.setProperty('--gap',$('crossGap').value+'px');$('sensValue').textContent=Number($('sensitivity').value).toFixed(2);}updateSettings();
const invite=new URL(location.href).searchParams.get('room');if(invite)$('code').value=invite.slice(0,6);
const savedRoom=readRoomSession(sessionStorage,invite);if(savedRoom){const resumeButton=document.createElement('button');resumeButton.id='rejoinPrevious';resumeButton.className='secondary';resumeButton.textContent='Rejoin previous room';resumeButton.onclick=()=>{refreshResume=true;connect(savedRoom);};$('error').before(resumeButton);}
setInterval(()=>{if(connected)send({type:'ping',time:Date.now()});},2000);
function resize(){lookInput.rebase();viewTrace.record('resize',self,{width:innerWidth,height:innerHeight});renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
function loop(now){requestAnimationFrame(loop);const rawElapsed=(now-lastFrame)/1000,elapsed=Math.min(rawElapsed,.1),dt=Math.min(elapsed,.04);lastFrame=now;frameMs=frameMs*.95+Math.min(rawElapsed*1000,10000)*.05;
 updateLoadingScreen();
 document.body.classList.toggle('aimActive',!!playing());
 if(id&&state){const p=state.players.find(p=>p.id===id),active=state.phase==='active'||state.phase==='waiting';if(fire)reloadEmptyMagazine();weaponWheel.confirm(p?.weapon);if(active&&p?.hp>0&&isBrowserHitboxReady(p.weapon)){self.weapon=p.weapon;self.ads=adsIntent();movement.advance(elapsed,input(),self.yaw,{enabled:canMove()&&connected});}
  if(connected&&now-lastSend>1000/60){lastSend=now;send({type:'input',fireEdge:false,viewSnapshot:shotView(),shotLife:p?.lifeEpoch,...input(),yaw:self.yaw,pitch:self.pitch,seq:++seq,fire:fire&&playing()&&performance.now()>=localEquipReadyAt&&active,secondaryFire:secondaryFire&&playing()&&performance.now()>=localEquipReadyAt&&active,clientShotId});}
  eyeOffset+=((self.crouch?1.05:EYE)-eyeOffset)*(1-Math.exp(-dt*22));camera.position.set(self.x,(self.y||0)+eyeOffset,self.z);aimRecoil=recoil.sample(now);applyAimRecoil(now);camera.rotation.set(self.pitch,self.yaw,0,'YXZ');viewTrace.record('frame',self,{frameMs:Math.round(rawElapsed*1000),locked:document.pointerLockElement===canvas});
  if(enemyTarget&&connected){
    const paused=state.phase==='paused',displayMotion=stepOpponentDisplay(enemyGroup.position,enemyTarget,paused?0:elapsed);
    if(!paused){
      const selected=selectViewSnapshot(viewSnapshots,displayMotion,enemyTarget.id,id,p?.weapon,p?.lifeEpoch??p?.spawnEpoch,enemyDisplaySample?.at??-Infinity);
      enemyDisplaySample=viewSample(viewSnapshots,selected,enemyTarget.id);
    }
    const shown=enemyDisplaySample?.player||enemyTarget,serverNow=enemyDisplaySample?.at||(paused?state.pausedAt:state.now);
    // Root, lower/upper pose and shot reference must share one received clock.
    enemyGroup.position.set(shown.x,shown.y||0,shown.z);enemyGroup.rotation.y=shown.yaw;
    animateOpponent(enemyGroup,{dt:paused?0:elapsed,snapshotCombat:shown,spawnEpoch:shown.lifeEpoch??shown.spawnEpoch,respawnAt:shown.respawnAt||0,deathPart:shown.deathPart,serverNow,actionStartedAt:shown.hitboxAction?.at,fireStartedAt:shown.lastShotWeapon===shown.weapon?shown.lastShot:null,hitboxMotion:shown.hitboxMotion,reloadRemaining:Math.max(0,((shown.reloadUntil||0)-serverNow)/1000),equipRemaining:Math.max(0,((shown.equipUntil||0)-serverNow)/1000),pitch:shown.pitch,weapon:shown.weapon,ads:shown.ads,dead:shown.hp<=0,vx:shown.vx,vz:shown.vz,crouch:shown.crouch,speed:Math.hypot(shown.vx||0,shown.vz||0),time:now/1000,yaw:shown.yaw,grounded:shown.grounded});
  }
 }else{camera.position.set(7.5,5.3,10.5);camera.lookAt(-1,1,-3);}
 const adsAmount=ads.update(elapsed,adsState());gun.userData.ads=adsAmount;const fov=adsFov(74,adsAmount,ads.zoom),near=gun.userData.weapon==='knife'?.015:.05;if(Math.abs(camera.fov-fov)>.001||camera.near!==near){camera.fov=fov;camera.near=near;camera.updateProjectionMatrix();}adsReticle.setAmount(adsAmount,{scoped:!!WEAPONS[gun.userData.weapon]?.ads?.scope,weapon:gun.userData.weapon,now});document.body.classList.toggle('ads',adsAmount>.8);$('adsIndicator').hidden=adsAmount<.5;$('adsIndicator').textContent='ADS ×'+Number(ads.zoom.toFixed(2));
 document.querySelector('.grain').hidden=!!id;gun.visible=!!(playing()||shopPreview()||armoryResumePending)&&gun.userData.isWeaponReady()&&!!state?.players.find(p=>p.id===id)?.hp;if(shopPreview()&&gun.userData.isWeaponReady()&&gun.userData.previewWeapon!==gun.userData.weapon){gun.userData.previewWeapon=gun.userData.weapon;gun.userData.previewStartedAt=now;}const walk=Math.hypot(self.vx,self.vz);document.documentElement.style.setProperty('--gap',(Number($('crossGap').value)+Math.min(12,walk*1.2+(self.grounded===false?7:0)+kick*45))+'px');animateWeapon(gun,{time:now/1000,dt:!connected||state?.phase==='paused'?0:elapsed,speed:walk,kick,crouch:self.crouch,grounded:self.grounded,ads:adsAmount,...ownWeaponDeadline(now)});if(shopPreview()&&gun.userData.isWeaponReady())gun.userData.previewWeapon=gun.userData.weapon;kick*=Math.exp(-dt*18);flash.userData.effects.update(now);
 for(let i=pendingEjections.length-1;i>=0;i--){const event=pendingEjections[i];
  if(!playing()||!gun.visible||event.weapon!==gun.userData.weapon){pendingEjections.splice(i,1);continue;}
  if(now>=event.at){const origin=getEjectionPosition(gun);if(origin)shotEffects.eject({origin,orientation:camera.getWorldQuaternion(new T.Quaternion()),weapon:event.weapon,seed:event.seed,now});pendingEjections.splice(i,1);}
 }
 shotEffects.update(now);updateHitboxDebug();
 if(now-lastFpsUpdate>=500){fpsReadout.textContent=Math.round(1000/Math.max(1,frameMs))+' FPS';lastFpsUpdate=now;}
 // First-person meshes keep their own depth ordering, in a pass after architecture.
 // World collision/authoritative hit rays are unchanged; no depthTest hacks on skin.
 gun.traverse(o=>o.layers.set(1));gun.userData.firstPersonArms?.mount.traverse(o=>o.layers.set(1));
 // Additional FP hands are separate camera children, outside gun/legacy arms.
 // Render them with the gun in the same depth buffer, so fingers can occlude it.
 for(const arms of new Set(Object.values(gun.userData.additionalArms||{})))arms.mount.traverse(o=>o.layers.set(1));
 camera.layers.set(0);renderer.autoClear=true;renderer.info.reset();renderer.render(scene,camera);
 const scopeOpacity=scopeViewmodelOpacity(ads.amount,!!WEAPONS[gun.userData.weapon]?.ads?.scope);
 applyScopeViewmodelOpacity(gun.userData.activeAsset,scopeOpacity);applyScopeViewmodelOpacity(gun.userData.getActiveArms?.()?.mount,scopeOpacity);
 if(gun.visible&&scopeOpacity>0){
  const shadowAuto=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;
  renderer.autoClear=false;renderer.clearDepth();
  characterOcclusion.render(renderer,scene,camera,enemyGroup,{wallDistance:(origin,direction)=>trace(origin,direction,null,state?.map||'training').distance});
  camera.layers.set(1);renderScopedViewmodel(camera,!!WEAPONS[gun.userData.weapon]?.ads?.scope,()=>renderer.render(scene,camera));
  camera.layers.set(0);renderer.autoClear=true;renderer.shadowMap.autoUpdate=shadowAuto;
 }
}requestAnimationFrame(loop);

function weaponFeedback(attack='primary',weapon=gun.userData.weapon,{playSound=true}={}){localShot=performance.now();adsReticle.shot(weapon,localShot);recoil.shot(localShot,weapon);gun.userData.attackAt=localShot;const profile=weaponAttackSpec(weapon,adsIntent(),attack);localReadyAt=localShot+profile.interval;gun.userData.attackKind=attack;gun.userData.activeAsset?.userData.fire?.();shotFeedbacks++;if(weapon!=='knife'){if(pendingEjections.length>=8)pendingEjections.shift();pendingEjections.push({weapon,at:localShot+28,seed:shotFeedbacks});}flash.userData.effects.trigger({weapon,seed:shotFeedbacks,now:localShot,ads:ads.amount>.5});kick=Math.min(.085,kick+.023);return playSound?gameAudio.play(weapon==='knife'?'melee':'fire',{weapon,variant:attack}):false;}
const volume=$('volume');volume.value=localStorage.getItem('offset:volume')??'0.7';gameAudio.setVolume(Number(volume.value));volume.oninput=()=>{gameAudio.setVolume(Number(volume.value));localStorage.setItem('offset:volume',volume.value);};
if(new URL(location.href).searchParams.has('debug')){
 const diagnostic=document.createElement('output');diagnostic.id='diagnostics';diagnostic.hidden=true;document.body.append(diagnostic);
 window.render_game_to_text=()=>JSON.stringify({
  coordinateSystem:'metres; +Y up; yaw 0 faces -Z; positive pitch looks up',accuracy:accuracyReadout(),
  room:code,phase:state?.phase||'menu',playing:!!playing(),
  player:{position:[self.x,self.y||0,self.z],velocity:[self.vx||0,self.vy||0,self.vz||0],yaw:self.yaw,pitch:self.pitch,weapon:gun.userData.weapon,ads:{requested:ads.requested,amount:ads.amount,confirmed:!!state?.players.find(p=>p.id===id)?.ads,fov:camera.fov},health:state?.players.find(p=>p.id===id)?.hp,armor:state?.players.find(p=>p.id===id)?.armor,ammo:state?.players.find(p=>p.id===id)?.ammo},
  opponent:enemyTarget?{position:[enemyTarget.x,enemyTarget.y||0,enemyTarget.z],health:enemyTarget.hp,weapon:enemyTarget.weapon}:null,
  deadline:ownWeaponDeadline(),hands:{active:gun.userData.firstPersonArms?.diagnostics.active,phase:gun.userData.firstPersonArms?.diagnostics.phase},mechanism:gun.userData.activeAsset?.userData.animationDiagnostics,
  hitboxes:hitboxDebugEnabled?hitboxDebug:undefined,network:{viewSnapshot:shotView(),lastRewind,snapshotAt:state?.now,ageMs:state?Math.max(0,performance.now()-stateReceivedAt):null,opponentLife:enemyTarget?.lifeEpoch,opponentMoveEpoch:enemyTarget?.spawnEpoch,opponentMotion:enemyTarget?.hitboxMotion,opponentAction:enemyTarget?.hitboxAction,opponentFire:enemyTarget?.hitboxFire},shots:shotFeedbacks,audio:{active:gameAudio.diagnostics.active,events:gameAudio.diagnostics.events,scheduled:gameAudio.diagnostics.scheduled,lastAsset:gameAudio.diagnostics.lastAssetId,errors:gameAudio.diagnostics.errors},assetsReady:gun.userData.isWeaponReady()
 });

 setInterval(()=>{const direction=camera.getWorldDirection(new T.Vector3());diagnostic.textContent=JSON.stringify({accuracy:accuracyReadout(),map:mapScene.diagnostics,hitboxSync:hitboxDebugEnabled?{comparison:hitboxDebug.comparison,peaks:hitboxDebug.peaks}:undefined,opponent:enemyGroup.userData.diagnostics,characterOcclusion:characterOcclusion.diagnostics,characterPosition:enemyGroup.position.toArray(),movement:movement.diagnostics,serverPosition:state?.players.find(p=>p.id===id)?[state.players.find(p=>p.id===id).x,state.players.find(p=>p.id===id).y,state.players.find(p=>p.id===id).z]:null,audio:gameAudio.diagnostics,shotEffects:shotEffects.diagnostics,muzzleEffects:flash.userData.effects.diagnostics,tracers:tracerCount,lastTracer,clientShotId,attack:gun.userData.attackKind,phase:state?.phase,playing:!!playing(),viewTrace:viewTrace.diagnostics,look:{inputMode:pointerInputMode,...lookInput.diagnostics,locked:document.pointerLockElement===canvas,fallback:dragLook,fire,secondaryFire,yaw:self.yaw},feetY:self.y,cameraY:camera.position.y,cameraNear:camera.near,crouch:self.crouch,grounded:self.grounded,pitch:self.pitch,aimRecoil,recoil:recoil.diagnostics,cameraDirectionY:direction.y,x:self.x,z:self.z,health:state?.players.find(p=>p.id===id)?.hp,armor:state?.players.find(p=>p.id===id)?.armor,roomArmor:state?.armor,ammo:state?.players.find(p=>p.id===id)?.ammo,shots:shotFeedbacks,frameMs:Math.round(frameMs),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,ads:{requested:ads.requested,amount:ads.amount,fov:camera.fov,sensitivityScale:ads.sensitivityScale},weapon:gun.userData.weapon,weaponAsset:gun.userData.assetStatus,hitboxData:browserHitboxDataStatus(),assetLoading:gun.userData.loadingDiagnostics,assetsReady:gun.userData.isWeaponReady(),entryPending,localEquipReadyAt,localReadyAt,weaponTriangles:gun.userData.activeAsset?.userData.triangles||gun.userData.activeAsset?.userData.assetDiagnostics?.triangles,weaponClips:gun.userData.activeAsset?.userData.clips,reloadContact:gun.userData.activeAsset?.userData.fpReloadContact?.diagnostics,weaponAnimation:gun.userData.activeAsset?.userData.animationDiagnostics,handsAnimation:gun.userData.getActiveArms?.()?.diagnostics||gun.userData.firstPersonArms?.diagnostics,muzzle:getMuzzlePosition(gun).toArray(),muzzleFlashError:flash.getWorldPosition(new T.Vector3()).distanceTo(getMuzzlePosition(gun))});},100);
}

function openArmory(){
 entryGeneration++;entryPending=false;autoEntryRequested=false;
 armoryReturnToGame=!!id&&!resultShown;armoryResumePending=false;suspended=false;settingsOpen=false;document.querySelector('.settings').hidden=true;
 armoryUI.update(state?.players.find(p=>p.id===id)||null,state?.phase);
 // Display the actual equipped viewmodel beneath the translucent shop while
 // pointer selects equipment while movement remains available.
 resetControls({keepMovement:true});gameAudio.cancelPendingAttacks(gun.userData.weapon);sendInput();
 $('armory').hidden=false;$('overlay').hidden=true;if(!id)$('menu').hidden=true;
 releaseGamePointer();$('closeArmory').focus();
}
let loadoutRequestSerial=0,pendingLoadoutRequest=null,pendingLoadoutWeapon=null,lastLoadoutSignature='';
let previewWarmupPending=false;
function warmArmoryWeapon(weapon){
 if(previewWarmupPending||!id||!connected||$('armory').hidden)return;
 previewWarmupPending=true;
 Promise.all([gun.userData.preloadWeapon?.(weapon),ensureBrowserHitboxData(weapon)]).catch(error=>console.warn('Weapon preview preparation failed',weapon,error)).finally(()=>{previewWarmupPending=false;});
}
const armoryUI=mountArmory($('armory'),{onPreview:warmArmoryWeapon,onSelect:weapon=>requestLoadout({weapon,equipmentSlot:equipmentById[weapon]?.slot,skin:'default'}),onHero:hero=>requestLoadout({hero})});
function requestLoadout(change){
 const p=state?.players.find(p=>p.id===id);
 if(!connected||!p?.hp||!['waiting','active','countdown'].includes(state?.phase)){armoryUI.status('Join a room to change equipment for free while alive.',true);return;}
 if(change.weapon){pendingLoadoutWeapon=change.weapon;ads.reset(true);fire=false;secondaryFire=false;gun.userData.previewWeapon=null;gameAudio.cancelPendingAttacks(p.weapon);gun.userData.preloadWeapon?.(change.weapon);prepareHitbox(change.weapon);}
 pendingLoadoutRequest=++loadoutRequestSerial;armoryUI.status('Waiting for server confirmation…');
 send({type:'loadout',requestId:pendingLoadoutRequest,...change});
}
function syncLoadoutUI(p,phase){
 const signature=JSON.stringify([p.loadout,p.weapon,p.hp>0,phase]);
 if(signature===lastLoadoutSignature)return;lastLoadoutSignature=signature;
 armoryUI.update(p,phase);saveLoadoutPreference(localStorage,p);
}
async function closeArmory(){
 const resume=armoryReturnToGame&&!!id&&!resultShown;armoryReturnToGame=false;
 armoryResumePending=resume;$('armory').hidden=true;
 if(!id){$('menu').hidden=false;armoryResumePending=false;$('create').focus();return;}
 if(!resume){$('overlay').hidden=!settingsOpen;suspended=!settingsOpen;return;}
 // Start the real pointer-lock request in the B/click gesture. No duplicate
 // Equip call: the preview has already advanced the original FP/GN draw clips.
 const generation=entryGeneration;
 // Acquire pointer lock in the B gesture, while resources continue loading.
 try{const mode=await requestGamePointerLock(canvas);if(generation!==entryGeneration)return;pointerInputMode=mode;dragLook=false;}catch{if(generation===entryGeneration)startFallback();}
 const deadline=performance.now()+20000;
 while(generation===entryGeneration&&id&&!settingsOpen&&(!gun.userData.isWeaponReady()||!dataReady()||!mapReady||pendingLoadoutRequest||pendingLoadoutWeapon&&gun.userData.weapon!==pendingLoadoutWeapon)&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,40));
 if(generation!==entryGeneration){if(settingsOpen)releaseGamePointer();return;}
 armoryResumePending=false;
 if(!gun.userData.isWeaponReady()||!dataReady()||!mapReady||pendingLoadoutRequest||pendingLoadoutWeapon&&gun.userData.weapon!==pendingLoadoutWeapon){pauseControls();return;}
 hasEnteredArena=true;suspended=false;$('overlay').hidden=true;canvas.focus();gameAudio.unlock();
}
$('closeArmory').onclick=closeArmory;
$('armoryButton').onclick=openArmory;$('pauseArmory').onclick=openArmory;
let escapeDownHandled=false;
function closeSettings(){settingsOpen=false;document.querySelector('.settings').hidden=true;$('overlay').hidden=true;return $('play').onclick();}
document.addEventListener('keydown',e=>{if(e.code!=='Escape'||!id||resultShown)return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;escapeDownHandled=true;if(settingsOpen)closeSettings();else openSettings();},true);
document.addEventListener('keyup',e=>{if(e.code!=='Escape')return;if(escapeDownHandled){escapeDownHandled=false;return;}if(id&&!resultShown&&!settingsOpen)openSettings();});
$('loadingContinue').onclick=()=>$('play').onclick();$('loadingBack').onclick=()=>{leave();suspended=false;};
function updateLoadingScreen(){
 const states=gun.userData.loadingDiagnostics.states,base=['arms','vandal','ghost','knife'];
 const baseDone=base.filter(key=>states[key]==='ready').length,failed=Object.values(states).includes('failed');
 if(!bootLoaded&&(baseDone===base.length||failed))bootLoaded=true;
 const ownReady=gun.userData.isWeaponReady(),opponentReady=!enemyTarget||(enemyGroup.userData.status==='ready'&&enemyGroup.userData.isWeaponReady?.(enemyTarget.weapon)!==false),ready=!!id&&!!state&&connected&&mapReady&&ownReady&&opponentReady&&dataReady()&&!pendingLoadoutRequest;
 if(autoEntryRequested&&ready&&['waiting','active','countdown'].includes(state?.phase)&&!settingsOpen&&!resultShown&&!entryPending&&!shopPreview()){autoEntryRequested=false;queueMicrotask(()=>$('play').onclick());}
 const show=!hasEnteredArena&&!pointerUnlockPending&&(joining||entryPending||!!id&&!settingsOpen&&!shopPreview()&&!resultShown&&(suspended||armoryResumePending||!ready));
 loadingScreen.hidden=!show;if(!show)return;
 const stages=id?[connected,mapReady,ownReady,opponentReady,dataReady()]:base.map(key=>states[key]==='ready');
 $('loadingProgress').style.width=Math.round(stages.filter(Boolean).length/stages.length*100)+'%';
 $('loadingMessage').textContent=joining?'Connecting to room…':!connected&&id?'Reconnecting to the server…':!mapReady?'Loading arena…':!ownReady?'Loading weapon and original animations…':!opponentReady?'Loading opponent…':!dataReady()?'Loading hitbox data…':pendingLoadoutRequest?'Confirming equipment…':entryPending?'Preparing controls and audio…':'Arena ready';
 $('loadingDetails').textContent=failed?'Some resources failed to load. Select Continue to retry.':'Models / Original animations / Map / Hitbox data';
 $('loadingContinue').hidden=autoEntryRequested||!id||(!ready&&!failed)||armoryResumePending||entryPending;
 $('loadingContinue').disabled=!connected;$('loadingBack').hidden=!id;
}
if(new URL(location.href).searchParams.has('debug')){const output=document.createElement('output');output.id='handsDiagnostics';output.hidden=true;document.body.append(output);setInterval(()=>{output.textContent=JSON.stringify({status:gun.userData.handsStatus,animation:gun.userData.firstPersonArms?.diagnostics});},100);}



