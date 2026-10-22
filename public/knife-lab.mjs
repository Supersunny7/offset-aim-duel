import * as T from '/vendor/three.module.js';
import {WEAPONS} from '/weapons.mjs';
import {animateWeapon} from '/scene.mjs';
import {loadFirstPersonArms} from '/first-person-arms.mjs';
import {loadImportedWeapon} from '/imported-assets.mjs';
import {createNativeBoneClip} from '/psa-animation.mjs';
import {buildOpponent,animateOpponent} from '/opponent.mjs';
const third=new URL(location.href).searchParams.get('view')==='third',runtime=new URL(location.href).searchParams.has('runtime');
const $=id=>document.getElementById(id),renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x65838d);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(74,innerWidth/innerHeight,.015,20);scene.add(camera);
scene.add(new T.HemisphereLight(0xffffff,0x454e58,2));const light=new T.DirectionalLight(0xfff3e4,3);light.position.set(3,5,4);scene.add(light);
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
const runtimeDuration=()=>({inspect:3.200086021,equip:1.650164954}[$('action').value]??($('action').value==='secondary'?WEAPONS.knife.secondary:WEAPONS.knife).animationDuration/1000);
let playback=false,phase=0,last=performance.now(),mixer,arms,gun,actions={},selected,opponent,lastSample=-1;
function select(){phase=0;lastSample=-1;$('phase').value=0;if(third||runtime)return;mixer.stopAllAction();selected=actions[$('action').value];selected.reset().setLoop(T.LoopOnce,1).play();selected.clampWhenFinished=true;}
addEventListener('keydown',event=>{if(event.code==='KeyH')document.querySelector('aside').hidden=!document.querySelector('aside').hidden;});
$('action').onchange=()=>{if(mixer||opponent||runtime&&arms)select();};$('play').onclick=()=>playback=!playback;$('restart').onclick=()=>{select();playback=true;};$('phase').oninput=()=>{phase=Number($('phase').value);playback=false;};
function sampleRuntime(){
 arms.update(0,{visible:false,weapon:'knife'});gun.userData.attackAt=0;gun.userData.lastArmShot=0;
 for(let i=0;i<240;i++)animateWeapon(gun,{dt:1/120});
 const attack=$('action').value,spec=attack==='secondary'?WEAPONS.knife.secondary:WEAPONS.knife;
 if(attack!=='idlepose'){
  arms.playKnifePreview(({primary:'fire',secondary:'secondary'})[attack]||attack);animateWeapon(gun,{dt:0});let remaining=phase*runtimeDuration();
  while(remaining>1e-8){const dt=Math.min(1/120,remaining);animateWeapon(gun,{dt});remaining-=dt;}
 }
 $('report').textContent=JSON.stringify({view:'First person · Gameplay controller',attack,phase,elapsedSeconds:phase*runtimeDuration(),contactMs:spec.contact,animationMs:runtimeDuration()*1000,sourcePhase:arms.diagnostics.phase,viewmodelOffset:arms.getKnifeViewmodelOffset().toArray(),projection:{fov:camera.fov,near:camera.near}},null,2);
}
function sampleThird(){
 const state=opponent.userData.native;opponent.userData.combat.reset();state.mixer.stopAllAction();
 for(const action of Object.values(state.actions))action.stopFading().setEffectiveWeight(1).setEffectiveTimeScale(1);
 state.upper='knife-upper';state.lower='idle-lower';state.actions[state.lower].reset().play();state.actions[state.upper].reset().play();
 const step=dt=>animateOpponent(opponent,{weapon:'knife',grounded:true,dt});for(let i=0;i<24;i++)step(1/120);
 const attack=$('action').value,duration=(attack==='secondary'?WEAPONS.knife.secondary:WEAPONS.knife).animationDuration/1000;
 if(attack!=='idle'){opponent.userData.combat.triggerFire('knife',attack,1);let remaining=phase*duration;step(0);while(remaining>1e-8){const dt=Math.min(1/120,remaining);step(dt);remaining-=dt;}}
 $('report').textContent=JSON.stringify({view:'Third person · Gameplay controller',attack,phase,seconds:phase*duration,upper:state.upper,source:state.actions[state.upper].getClip().name,knifeMount:opponent.userData.diagnostics.knifeMount,contact:opponent.userData.diagnostics.knifeAttack},null,2);
}
try{
 if(third){
  camera.fov=45;camera.updateProjectionMatrix();document.querySelector('canvas').setAttribute('aria-label','Third-person knife animation preview');
  document.querySelector('h1').textContent='Third-person knife animations';document.querySelector('aside p').textContent='Left-click slash / Right-click heavy attack. Uses the gameplay opponent controller, Scrub the timeline to inspect knife grip and contact. ';
  $('action').innerHTML='<option value="idle">Knife stance</option><option value="primary">Left click / Attack01</option><option value="secondary">Right click / Alt_Attack</option>';
  camera.position.set(2.1,1.3,2.8);camera.lookAt(0,.95,0);opponent=buildOpponent();scene.add(opponent);await opponent.userData.readyPromise;if(opponent.userData.status!=='ready')throw Error(opponent.userData.diagnostics.errors.join(';'));select();
 }else{
 arms=await loadFirstPersonArms(camera);arms.update(0,{visible:false,weapon:'knife'});arms.mount.visible=true;if(!runtime)arms.mount.position.add(arms.getKnifeViewmodelOffset());
 gun=new T.Group();gun.scale.setScalar(.82);camera.add(gun);gun.add((await loadImportedWeapon('knife')).root);
 if(runtime){
  Object.assign(gun.userData,{basePosition:new T.Vector3(),weapon:'knife',assets:{},firstPersonArms:arms});
  document.querySelector('aside p').textContent='Tactical Modes Original animations, Preserve source FPS. Scrub the timeline to inspect the slash, Arm attacks and recovery; View the source clips in the first-person knife viewer. ';
  $('action').innerHTML='<option value="idlepose">Knife stance</option><option value="equip">Equip</option><option value="primary">Left-click slash</option><option value="attack2">Second light attack</option><option value="attack3">Third light attack</option><option value="attack4">Attack4 Original variants</option><option value="secondary">Right-click heavy attack</option><option value="inspect">Inspect</option>';
 }else{
 mixer=new T.AnimationMixer(arms.model);
 for(const kind of ['idlepose','attack1','attack2','attack3','attack4','attack-alt','inspect']){const response=await fetch(`/assets/packs/animations/jett-knife-tactical-${kind}${kind==='attack-alt'?'':'-modes'}.json`);if(!response.ok)throw Error(kind+' HTTP '+response.status);actions[kind]=mixer.clipAction(createNativeBoneClip(arms.model,await response.json()));}
 }select();
 }
}catch(error){$('report').textContent='Animation failed to load: '+error.message;console.error(error);}
function loop(now){requestAnimationFrame(loop);const dt=Math.min((now-last)/1000,.1);last=now;if(runtime&&arms){if(playback){phase=Math.min(1,phase+dt/runtimeDuration());if(phase===1)playback=false;$('phase').value=phase;}if(phase!==lastSample){sampleRuntime();lastSample=phase;}}else if(third&&opponent?.userData.status==='ready'){if(playback){phase=Math.min(1,phase+dt/runtimeDuration());if(phase===1)playback=false;$('phase').value=phase;}if(phase!==lastSample){sampleThird();lastSample=phase;}}else if(selected){if(playback){phase=Math.min(1,phase+dt/selected.getClip().duration);if(phase===1)playback=false;$('phase').value=phase;}
 arms.restoreKnifeHandPose();selected.paused=false;selected.time=Math.min(selected.getClip().duration-1e-6,phase*selected.getClip().duration);mixer.update(0);selected.paused=true;arms.applyKnifeHandPose();
 const anchor=arms.getWeaponTransform();gun.position.copy(anchor.position);gun.quaternion.copy(anchor.rotation);gun.updateWorldMatrix(true,true);
 $('report').textContent=JSON.stringify({clip:selected.getClip().name,phase:+phase.toFixed(3),sourceSeconds:+selected.time.toFixed(3),duration:+selected.getClip().duration.toFixed(3)},null,2);
 }renderer.render(scene,camera);}requestAnimationFrame(loop);
