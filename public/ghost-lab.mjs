import * as T from '/vendor/three.module.js';
import {WEAPONS} from '/weapons.mjs';
import {loadFirstPersonArms} from '/first-person-arms.mjs';
import {loadImportedWeapon} from '/imported-assets.mjs';
import {attachGhostMechanics} from '/weapon-feel.mjs';
import {animateWeapon,getMuzzlePosition,getEjectionPosition} from '/scene.mjs';
import {createShotEffects} from '/shot-effects.mjs';
const $=id=>document.getElementById(id),renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x65838d);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(74,innerWidth/innerHeight,.05,20);scene.add(camera);const effects=createShotEffects(scene);
scene.add(new T.HemisphereLight(0xffffff,0x454e58,2));const light=new T.DirectionalLight(0xfff3e4,3);light.position.set(3,5,4);scene.add(light);
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
let arms,gun,ghost,playback=false,phase=0,last=performance.now(),sampled='';
const duration=()=>({idle:.8,fire:.8,double:.8,equip:1.25,reload:WEAPONS.ghost.visualReload/1000+.1})[$('action').value];
$('action').onchange=()=>{phase=0;sampled='';$('phase').value=0;playback=false;};$('play').onclick=()=>playback=!playback;$('restart').onclick=()=>{phase=0;sampled='';$('phase').value=0;playback=true;};$('phase').oninput=()=>{phase=Number($('phase').value);playback=false;};
try{
 arms=await loadFirstPersonArms(camera);ghost=(await loadImportedWeapon('ghost')).root;await attachGhostMechanics(ghost);
 gun=new T.Group();gun.scale.setScalar(.82);camera.add(gun);gun.add(ghost);const flash=new T.Object3D();gun.add(flash);
 Object.assign(gun.userData,{basePosition:new T.Vector3(),assets:{ghost},activeAsset:ghost,weapon:'ghost',firstPersonArms:arms,muzzle:flash});
}catch(error){$('report').textContent='Loading failed: '+error.message;console.error(error);}
function sample(){
 const mode=$('action').value,key=mode+':'+phase;if(key===sampled)return;sampled=key;
 effects.clear();gun.visible=false;gun.userData.attackAt=0;gun.userData.lastArmShot=0;animateWeapon(gun,{dt:0});gun.visible=true;
 for(let i=0;i<210;i++)animateWeapon(gun,{dt:1/120});
 if(mode==='equip'){arms.equip();ghost.userData.equip();}
 const total=phase*duration();let now=0,count=0,ejected=0;
 while(now<total-1e-8){
  if(['fire','double'].includes(mode)&&count<(mode==='double'?2:1)&&now>=count*.25-1e-8){ghost.userData.fire();gun.userData.attackAt=++count;}
  const dt=Math.min(1/240,total-now);animateWeapon(gun,{dt,reloading:mode==='reload'&&now<WEAPONS.ghost.reload/1000});now+=dt;
  if(ejected<count&&now>=(ejected*.25+.028)){const origin=getEjectionPosition(gun);if(origin)effects.eject({origin,orientation:camera.quaternion,weapon:'ghost',floorY:-1.62,seed:ejected+1,now:now*1000});ejected++;}
  effects.update(now*1000);
 }
 const muzzle=getMuzzlePosition(gun).clone().project(camera);
 $('report').textContent=JSON.stringify({mode,seconds:+total.toFixed(3),shots:count,casings:effects.diagnostics.shells,muzzleScreen:[+(muzzle.x*.5+.5).toFixed(4),+(.5-muzzle.y*.5).toFixed(4)],arms:arms.diagnostics.active,mechanics:ghost.userData.animationDiagnostics.active,reloadContact:ghost.userData.fpReloadContact?.diagnostics,leftHandIk:arms.diagnostics.leftHandIk,fireBlend:arms.diagnostics.fireBlend},null,2);
}
function loop(now){requestAnimationFrame(loop);const dt=Math.min((now-last)/1000,.1);last=now;if(gun){if(playback){phase=Math.min(1,phase+dt/duration());if(phase===1)playback=false;$('phase').value=phase;}sample();}renderer.render(scene,camera);}requestAnimationFrame(loop);
