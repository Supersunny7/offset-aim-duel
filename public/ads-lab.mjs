import {buildWeapon,animateWeapon} from '/scene.mjs';
import * as T from '/vendor/three.module.js';
import {loadFirstPersonArms} from '/first-person-arms.mjs';
import {loadVandal} from '/vandal.mjs';
import {createAdsReticle} from '/ads-reticle.mjs';
import {createNativeBoneClip} from '/psa-animation.mjs';
import {createADS,adsFov,scopeViewmodelOpacity,applyScopeViewmodelOpacity,renderScopedViewmodel} from '/ads.mjs';
import {WEAPONS} from '/weapons.mjs';
import {createAimRecoil} from '/weapon-feel.mjs';
if(new URL(location.href).searchParams.get('weapon')==='operator'){try{await bootOperatorComparison();}catch(error){document.querySelector('output').textContent='Comparison page failed to load: '+error.message;console.error(error);}}else{
const $=id=>document.getElementById(id),renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x65838d);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(74,innerWidth/innerHeight,.05,20);scene.add(camera);
scene.add(new T.HemisphereLight(0xffffff,0x454e58,2));const light=new T.DirectionalLight(0xfff3e4,3);light.position.set(3,5,4);scene.add(light);
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
const adsReticle=createAdsReticle(document.body);
const gripLabel=document.createElement('label');gripLabel.innerHTML='<input id="leftGrip" type="checkbox" checked> Left-hand grip correction(Disable to compare the original Fire)';$('action').parentElement.after(gripLabel);
gripLabel.querySelector('input').onchange=()=>{if(gun){gun.userData.disableLeftGripConstraint=!$('leftGrip').checked;lastRuntimePhase=-1;}};
let runtime=false,lastRuntimePhase=-1,playback=false,phase=0,last=performance.now(),mixer,arms,gun,actions={},selected;
function select(){mixer.stopAllAction();arms.update(0,{visible:false,weapon:'vandal'});gun.children[0].userData.updateAnimation(0,{visible:false,reloading:false});arms.mount.position.set(0,-1.62*.82,0);arms.mount.rotation.set(0,Math.PI/2,0);arms.mount.visible=true;runtime=$('action').value.startsWith('fire-');lastRuntimePhase=-1;phase=0;$('phase').value=0;if(runtime){selected=null;return;}arms.update(0,{visible:false,weapon:'vandal'});arms.mount.visible=true;const additive=!['idlepose','altidlepose'].includes($('action').value);if(additive)actions.altidlepose.reset().setEffectiveWeight(1).play();selected=actions[$('action').value];selected.reset().setLoop(T.LoopOnce,1).play();selected.clampWhenFinished=true;phase=0;$('phase').value=0;}
$('action').onchange=()=>{if(mixer)select();};$('play').onclick=()=>playback=!playback;$('restart').onclick=()=>{select();playback=true;};$('phase').oninput=()=>{phase=Number($('phase').value);playback=false;};
try{
 arms=await loadFirstPersonArms(camera);arms.update(0,{visible:false,weapon:'vandal'});arms.mount.visible=true;
 gun=new T.Group();gun.scale.setScalar(.82);camera.add(gun);const asset=await loadVandal();gun.add(asset);const muzzle=new T.Object3D();gun.add(muzzle);Object.assign(gun.userData,{basePosition:new T.Vector3(),weapon:'vandal',vandal:asset,assets:{vandal:asset},activeAsset:asset,firstPersonArms:arms,muzzle,attackAt:0,lastArmShot:0});
 mixer=new T.AnimationMixer(arms.model);
 const neutralResponse=await fetch('/assets/packs/animations/jett-vandal-neutraldelta.json');if(!neutralResponse.ok)throw Error('Neutral reference HTTP '+neutralResponse.status);const neutralClip=createNativeBoneClip(arms.model,await neutralResponse.json());
 for(const kind of ['idlepose','altidlepose','altaimn','altaime','altaims','altaimw','altidleadd']){const response=await fetch(`/assets/packs/animations/jett-vandal-${kind}.json`);if(!response.ok)throw Error(kind+' HTTP '+response.status);const clip=createNativeBoneClip(arms.model,await response.json());if(!['idlepose','altidlepose'].includes(kind))T.AnimationUtils.makeClipAdditive(clip,0,neutralClip);actions[kind]=mixer.clipAction(clip);}
 select();
}catch(error){$('report').textContent='Animation failed to load: '+error.message;console.error(error);}
function sampleRuntime(){
 if(lastRuntimePhase===phase)return;lastRuntimePhase=phase;
 const ads=$('action').value==='fire-ads'?1:0,state={visible:true,weapon:'vandal',ads};
 const hip=new T.Vector3(0,-1.62*.82,0);arms.mount.position.copy(hip);arms.mount.rotation.set(0,Math.PI/2,0);
 gun.visible=false;gun.userData.attackAt=0;gun.userData.lastArmShot=0;animateWeapon(gun,{dt:0});gun.visible=true;camera.fov=ads?62.166779729:74;camera.updateProjectionMatrix();
 for(let i=0;i<240;i++)animateWeapon(gun,{dt:1/120,ads});
 const shots=$('action').value==='fire-single'?1:3,total=phase*.8;let now=0,count=0;
 while(now<total-1e-8){if(count<shots&&now>=count*.103-1e-8){gun.children[0].userData.fire();gun.userData.attackAt=++count;}
  const dt=Math.min(1/240,total-now);animateWeapon(gun,{dt,ads});now+=dt;
 }
 adsReticle.setAmount(ads);camera.fov=ads?62.166779729:74;camera.updateProjectionMatrix();
 gun.updateWorldMatrix(true,true);
 $('report').textContent=JSON.stringify({path:'production animateWeapon / source Fire + grip',mode:$('action').value,seconds:+total.toFixed(3),shots:count,grip:arms.diagnostics.gripConstraint,rightGrip:arms.diagnostics.rightGrip},null,2);
}
function loop(now){requestAnimationFrame(loop);const dt=Math.min((now-last)/1000,.1);last=now;if(runtime){if(playback){phase=Math.min(1,phase+dt/.8);if(phase===1)playback=false;$('phase').value=phase;}sampleRuntime();}else if(selected){adsReticle.setAmount(0);camera.fov=74;camera.updateProjectionMatrix();if(playback){phase=Math.min(1,phase+dt/selected.getClip().duration);if(phase===1)playback=false;$('phase').value=phase;}
 selected.paused=false;selected.time=Math.min(selected.getClip().duration-1e-6,phase*selected.getClip().duration);mixer.update(0);selected.paused=true;
 const anchor=arms.getWeaponTransform();gun.position.copy(anchor.position);gun.quaternion.copy(anchor.rotation);gun.updateWorldMatrix(true,true);
 $('report').textContent=JSON.stringify({clip:selected.getClip().name,phase:+phase.toFixed(3),sourceSeconds:+selected.time.toFixed(3),duration:+selected.getClip().duration.toFixed(3)},null,2);
 }renderer.render(scene,camera);}requestAnimationFrame(loop);

}

async function bootOperatorComparison(){
 document.title='OFFSET / Operator Fixed landmark comparison';
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='/style.css';document.head.append(stylesheet);
 const panelStyle=document.createElement('style');panelStyle.textContent='aside{width:250px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto}aside h1{font:700 20px/1.2 system-ui;letter-spacing:0;margin:0 0 8px}aside button,aside a{font-size:12px;padding:8px 10px}aside p{font-size:12px;line-height:1.5;margin:8px 0}aside label{font-size:11px;line-height:1.4}aside output{font-size:11px}';document.head.append(panelStyle);
 const aside=document.querySelector('aside');aside.style.zIndex='5';aside.innerHTML=`<h1>Operator · Fixed landmark</h1><p>Standalone camera comparison, Not connected to a match. Fixed camera; 30 m away, the red frame measures 1 × 1 m. </p><button id="scopeCycle">ADS / Next zoom</button><button id="scopeExit">Exit ADS</button><button id="scopeShot">Fire once</button><button id="scopeRepeat">Repeat-fire test: Off</button><button id="scopeReset">Reset baseline</button><label><input id="fixedAim" type="checkbox" checked style="width:auto">Fixed aim(Uncheck to show gameplay recoil)</label><output id="scopeReadout">Loading original model…</output><p>Right click: Cycle hip fire / 2.5× / 5×; Left click: Fire. Esc: Stop repeated firing and exit scope. H: Hide / Show panel. </p><p><a href="/">Back to game</a></p>`;
 const canvas=document.querySelector('canvas');canvas.setAttribute('aria-label','Operator 30 m fixed target, Compare both zoom levels and original firing animations');canvas.tabIndex=0;
 const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0xa2b4bb);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(74,innerWidth/innerHeight,.05,100);camera.position.set(0,1.62,0);camera.rotation.order='YXZ';scene.add(camera);
 const hemisphere=new T.HemisphereLight(0xffffff,0x3f4e57,2.2);hemisphere.layers.enable(1);scene.add(hemisphere);const light=new T.DirectionalLight(0xfff3df,2.6);light.layers.enable(1);light.position.set(4,6,3);scene.add(light);
 const material=new T.MeshStandardMaterial({color:0xd9dbd6,roughness:.9});const board=new T.Mesh(new T.BoxGeometry(8,5,.1),material);board.position.set(0,1.62,-30.06);scene.add(board);
 const positions=[];for(let i=-4;i<=4;i++){positions.push(i,-.88,-30,i,4.12,-30);}for(let i=0;i<=5;i++){positions.push(-4,i-.88,-30,4,i-.88,-30);}const grid=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)),new T.LineBasicMaterial({color:0x83949c}));scene.add(grid);
 const target=new T.LineSegments(new T.BufferGeometry().setFromPoints([new T.Vector3(-.5,1.12,-30),new T.Vector3(.5,1.12,-30),new T.Vector3(.5,1.12,-30),new T.Vector3(.5,2.12,-30),new T.Vector3(.5,2.12,-30),new T.Vector3(-.5,2.12,-30),new T.Vector3(-.5,2.12,-30),new T.Vector3(-.5,1.12,-30)]),new T.LineBasicMaterial({color:0xb62836}));scene.add(target);
 const centre=new T.Mesh(new T.CircleGeometry(.025,12),new T.MeshBasicMaterial({color:0xb62836}));centre.position.set(0,1.62,-29.98);scene.add(centre);
 const floor=new T.GridHelper(60,30,0x536b76,0x83949c);floor.position.z=-25;scene.add(floor);
 const resize=()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};addEventListener('resize',resize);resize();
 const reticle=createAdsReticle(document.body),ads=createADS(),recoil=createAimRecoil(),{gun,flash}=buildWeapon(camera);let ready=false,repeat=false,shotSerial=0,nextShotAt=0,last=performance.now(),aimLift=0;
 const state=()=>({weapon:'operator',alive:true,playing:ready,phase:'waiting',reloading:false,equipping:false});
 document.getElementById('scopeCycle').onclick=()=>ads.toggle(state());
 const exit=()=>{repeat=false;document.getElementById('scopeRepeat').textContent='Repeat-fire test: Off';ads.reset();};document.getElementById('scopeExit').onclick=exit;
 const reset=()=>{exit();ads.reset(true);recoil.reset();aimLift=0;camera.rotation.set(0,0,0,'YXZ');nextShotAt=0;};document.getElementById('scopeReset').onclick=reset;
 const shoot=()=>{const now=performance.now();if(!ready||now<nextShotAt)return false;nextShotAt=now+(ads.requested?WEAPONS.operator.ads.interval:WEAPONS.operator.interval);gun.userData.attackAt=++shotSerial;gun.userData.attackKind='primary';gun.userData.activeAsset.userData.fire();reticle.shot('operator',now);recoil.shot(now,'operator');flash.userData.effects.trigger({weapon:'operator',seed:shotSerial,now,ads:ads.amount>.5});return true;};
 document.getElementById('fixedAim').onchange=()=>{recoil.reset();aimLift=0;};
 document.getElementById('scopeShot').onclick=shoot;document.getElementById('scopeRepeat').onclick=()=>{repeat=!repeat;document.getElementById('scopeRepeat').textContent='Repeat-fire test: '+(repeat?'On':'Off');if(repeat)shoot();};
 canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('mousedown',e=>{canvas.focus();if(e.button===2){e.preventDefault();ads.toggle(state());}else if(e.button===0)shoot();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')exit();if(e.key.toLowerCase()==='h')aside.hidden=!aside.hidden;});addEventListener('blur',()=>{repeat=false;document.getElementById('scopeRepeat').textContent='Repeat-fire test: Off';});
 await gun.userData.readyPromise;gun.userData.selectWeapon('operator');const loadDeadline=Date.now()+15000;while(!gun.userData.isWeaponReady()){if(Date.now()>loadDeadline)throw Error('Operator Resource loading timed out, Refresh and try again');if(gun.userData.loadingDiagnostics.errors.operator)throw Error(gun.userData.loadingDiagnostics.errors.operator);await new Promise(r=>setTimeout(r,10));}gun.visible=true;ready=true;
 animateWeapon(gun,{dt:0,ads:0,equipElapsed:100,grounded:true});ads.update(0,state());
 function frame(now){const dt=Math.max(0,Math.min(.05,(now-last)/1000));last=now;if(repeat)shoot();const amount=ads.update(dt,state());gun.userData.ads=amount;
  aimLift+=recoil.consume(now);camera.rotation.x=document.getElementById('fixedAim').checked?0:aimLift;camera.fov=adsFov(74,amount,ads.zoom);camera.updateProjectionMatrix();
  animateWeapon(gun,{dt,ads:amount,equipElapsed:100,grounded:true,speed:0});flash.userData.effects.update(now);reticle.setAmount(amount,{weapon:'operator',scoped:true,now});
  gun.traverse(o=>o.layers.set(1));for(const arms of new Set(Object.values(gun.userData.additionalArms||{})))arms.mount.traverse(o=>o.layers.set(1));gun.userData.firstPersonArms?.mount.traverse(o=>o.layers.set(1));
  const alpha=scopeViewmodelOpacity(amount,true);applyScopeViewmodelOpacity(gun.userData.activeAsset,alpha);applyScopeViewmodelOpacity(gun.userData.getActiveArms()?.mount,alpha);
  camera.layers.set(0);renderer.autoClear=true;renderer.render(scene,camera);
  const left=new T.Vector3(-.5,1.62,-30).project(camera),right=new T.Vector3(.5,1.62,-30).project(camera),pixelWidth=(right.x-left.x)*innerWidth/2;
  if(alpha>0){renderer.autoClear=false;renderer.clearDepth();camera.layers.set(1);renderScopedViewmodel(camera,true,()=>renderer.render(scene,camera));camera.layers.set(0);renderer.autoClear=true;}
  document.getElementById('scopeReadout').textContent=`${amount<.001?'Hip fire':ads.zoom.toFixed(1)+'×'} · 1m Frame width ${pixelWidth.toFixed(1)} px
Shots fired ${shotSerial} shots · ${repeat?'Repeated shots':'Single shot'}`;
  window.render_operator_comparison=()=>({distance:30,targetMetres:1,zoom:ads.zoom,ads:amount,worldFov:camera.fov,targetWidthPixels:pixelWidth,shots:shotSerial,fixedAim:document.getElementById('fixedAim').checked,source:gun.userData.getActiveArms()?.diagnostics,gunSource:gun.userData.activeAsset.userData.animationDiagnostics});
  requestAnimationFrame(frame);
 }requestAnimationFrame(frame);
}
