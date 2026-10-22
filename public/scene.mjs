import {loadAdditionalFirstPersonArms,ADDITIONAL_WEAPONS} from '/additional-first-person.mjs';
import {attachAdditionalWeaponMechanics} from '/additional-weapon.mjs';
import {createMuzzleFlash} from '/muzzle-effects.mjs';
import * as T from '/vendor/three.module.js';
import {loadVandal} from '/vandal.mjs';
import {loadFirstPersonArms} from '/first-person-arms.mjs';
import {attachGhostMechanics} from '/weapon-feel.mjs';
import {loadImportedWeapon,disposeImportedWeapon} from '/imported-assets.mjs';
import {resetFirstPersonReloadContact,applyFirstPersonReloadContact} from '/reload-contact.mjs';

// Original procedural art. Collision lives in shared.mjs, independently of detail.
const palette = {
  concrete: [0xd9d4c5,.92,0], plaster: [0xe8e1cd,.85,0],
  blue: [0x526d76,.79,0], dark: [0x273b46,.8,.12],
  stone: [0xa5ada8,.95,0], trim: [0x65787d,.65,.15],
  steel: [0x424c54,.44,.45], black: [0x202b34,.58,.25],
  rubber: [0x14212b,.96,0], cloth: [0x344c62,.94,0],
  armor: [0xc9605c,.7,.05], skin: [0xc99877,.9,0],
  hair: [0x27272e,.93,0], accent: [0xe2b782,.54,.2]
};
const materials = Object.fromEntries(Object.entries(palette).map(([k,[color,roughness,metalness]])=>[k,new T.MeshStandardMaterial({color,roughness,metalness})]));
const cube = new T.BoxGeometry(1,1,1);
function mesh(parent,geometry,material,x,y,z,sx=1,sy=1,sz=1) {
  const m=new T.Mesh(geometry,materials[material]||material);
  m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function decal(parent,text,w,h,x,y,z,ry=0) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#263c46';ctx.fillRect(0,0,512,256);
  ctx.fillStyle='#e6dfcc';ctx.font='700 110px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,150);
  ctx.fillStyle='#ca9270';ctx.fillRect(60,195,392,8);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const m=mesh(parent,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture}),x,y,z);m.rotation.y=ry;return m;
}

export function buildArena(scene,BOXES) {
  const world=new T.Group();world.name='Tactical training courtyard';scene.add(world);
  // Every repeated architectural detail is batched by material.
  const batches=new Map();
  const add=(w,h,d,x,y,z,mat='concrete',ry=0)=>{
    if(!batches.has(mat))batches.set(mat,[]);
    batches.get(mat).push({w,h,d,x,y,z,ry});
  };
  add(24,.2,28,0,-.1,0,'stone');
  for(const s of [-1,1]) {
    add(.6,4.6,27,s*11.3,2.3,0,'plaster');add(22,4.6,.6,0,2.3,s*13.3,'plaster');
    add(.64,.38,26,s*11.3,.19,0,'blue');add(22,.38,.64,0,.19,s*13.3,'blue');
    add(.66,.14,26,s*11.3,3.65,0,'trim');add(22,.14,.66,0,3.65,s*13.3,'trim');
    for(let z=-11;z<=11;z+=5.5) {
      add(.68,4.8,.38,s*11.3,2.4,z,'concrete');
      add(.03,1.05,2.3,s*10.975,2.55,z,'blue');
      // Inset vent slats remain on the solid wall, no fake walkable opening.
      for(let j=0;j<5;j++)add(.04,.045,1.85,s*10.95,2.2+j*.13,z,'dark');
    }
    // End-wall storage shutters framed as architecture, not accessible doors.
    for(const x of [-6,6]) {
      add(2.6,2.7,.04,x,1.35,s*12.975,'blue');
      add(.16,2.9,.08,x-1.38,1.45,s*12.95,'trim');add(.16,2.9,.08,x+1.38,1.45,s*12.95,'trim');
      add(2.9,.18,.1,x,2.86,s*12.94,'trim');
      for(let j=0;j<8;j++)add(2.5,.025,.055,x,.35+j*.28,s*12.94,'dark');
      add(.18,.05,.1,x+.65,1.3,s*12.9,'accent');
    }
    // Layered exterior roofs/towers imply an authored industrial campus.
    add(5.8,6.6,4.5,s*15,3.3,-8,'blue');add(8,8,5,s*18,4,7,'concrete');
    add(6.2,.3,4.9,s*15,6.7,-8,'dark');add(8.3,.24,5.3,s*18,8.1,7,'dark');
    for(let y=3;y<7;y+=1.4)for(let z=5;z<=9;z+=2)add(.03,.65,.95,s*13.98,y,z,'blue');
    add(1.7,1.4,1.5,s*15,7.45,-8,'trim');add(.12,2.3,.12,s*14.5,8.1,-7.5,'steel');
    // Spawn lane stripes stay low-contrast and cannot obscure heads.
    for(let x=-2;x<=2;x+=1)add(.55,.009,.07,x,.013,s*11.4,'accent');
  }
  for(const [i,b] of BOXES.entries()) {
    const mat=i===0?'concrete':b.h<1.5?'blue':'plaster';
    add(b.w,b.h,b.d,b.x,b.h/2,b.z,mat);
    add(b.w+.035,.12,b.d+.035,b.x,b.h-.1,b.z,'trim');
    add(b.w+.02,.17,b.d+.02,b.x,.085,b.z,'dark');
    for(const side of [-1,1]) {
      // Functional inset access panel and four narrow frame rails.
      add(Math.max(.5,b.w-.45),Math.max(.35,b.h-.65),.012,b.x,b.h/2,b.z+side*(b.d/2+.01),'blue');
      for(const x of [-1,1])add(.065,b.h-.35,.028,b.x+x*(b.w/2-.11),b.h/2,b.z+side*(b.d/2+.026),'trim');
      add(Math.min(.75,b.w*.5),.045,.028,b.x,b.h*.7,b.z+side*(b.d/2+.03),'accent');
    }
  }
  // Floor expansion seams and directional loading bays.
  for(let x=-10;x<=10;x+=4)add(.018,.006,26,x,.004,0,'trim');
  for(let z=-12;z<=12;z+=4)add(22,.006,.018,0,.004,z,'trim');
  // Conduits high on the walls create scale without adding collision traps.
  for(const s of [-1,1])for(const y of [3.9,4.06])add(.06,.055,25,s*10.96,y,0,'steel');
  const transform=new T.Object3D();
  for(const [mat,items] of batches) {
    const instanced=new T.InstancedMesh(cube,materials[mat],items.length);
    items.forEach((b,i)=>{transform.position.set(b.x,b.y,b.z);transform.scale.set(b.w,b.h,b.d);transform.rotation.set(0,b.ry,0);transform.updateMatrix();instanced.setMatrixAt(i,transform.matrix);});
    instanced.castShadow=true;instanced.receiveShadow=true;instanced.instanceMatrix.needsUpdate=true;world.add(instanced);
  }
  decal(world,'SECTOR 01',3.3,1.2,0,3.02,-12.975);
  decal(world,'SECTOR 02',3.3,1.2,0,3.02,12.975,Math.PI);
  decal(world,'AIM / DUEL',3,1,-10.975,3,0,Math.PI/2);
  return world;
}

export function buildWeapon(camera,{loaders={}}={}) {
  const gun=new T.Group();gun.name='Imported first-person weapons';camera.add(gun);
  const flash=createMuzzleFlash();gun.add(flash);flash.visible=false;
  gun.scale.setScalar(.82);gun.position.set(.22,-.23,-.55);gun.userData.basePosition=gun.position.clone();
  const states={arms:'loading',vandal:'loading',ghost:'loading',knife:'loading',...Object.fromEntries(ADDITIONAL_WEAPONS.map(id=>[id,'unrequested']))},errors={},tasks={};
  Object.assign(gun.userData,{weapon:'vandal',assets:{},assetStatus:'loading',handsStatus:'loading',muzzle:flash,
    loadingDiagnostics:{states,errors,placeholderMeshes:0},additionalArms:{},assetsReady:false});
  const recentAssets=new Map(),protectedAssets=new Set(['vandal','ghost','knife','phantom','sheriff']);
  gun.userData.loadingDiagnostics.cacheLimit=4;gun.userData.loadingDiagnostics.evictions=0;
  function pruneAssets(){
    const live=Object.keys(gun.userData.assets).filter(id=>!protectedAssets.has(id));
    for(const id of [...recentAssets.keys()]){
      if(live.length<=4)break;if(id===gun.userData.weapon||protectedAssets.has(id)||tasks[id])continue;
      const arms=gun.userData.additionalArms[id];if(arms?.diagnostics.weapon===id)continue;
      if(arms?.releaseWeapon?.(id)===false)continue;
      disposeImportedWeapon(gun.userData.assets[id]);delete gun.userData.assets[id];delete gun.userData.additionalArms[id];states[id]='unrequested';recentAssets.delete(id);live.splice(live.indexOf(id),1);gun.userData.loadingDiagnostics.evictions++;
    }
    gun.userData.loadingDiagnostics.cachedNew=Object.keys(gun.userData.assets).filter(id=>!protectedAssets.has(id));
  }
  function touchAsset(id){if(!protectedAssets.has(id)){recentAssets.delete(id);recentAssets.set(id,true);}pruneAssets();}
  const ready=()=>ADDITIONAL_WEAPONS.includes(gun.userData.weapon)?states[gun.userData.weapon]==='ready'&&!!gun.userData.additionalArms[gun.userData.weapon]:states.arms==='ready'&&states[gun.userData.weapon]==='ready';
  const sync=()=>{
    const weapon=gun.userData.weapon;gun.userData.activeAsset=gun.userData.assets[weapon]||null;
    gun.userData.handsStatus=states.arms;gun.userData.assetStatus=states[weapon];gun.userData.assetsReady=ready();
    for(const [id,asset] of Object.entries(gun.userData.assets))asset.visible=id===weapon&&ready();
    if(gun.userData.firstPersonArms&&!ready())gun.userData.firstPersonArms.mount.visible=false;
    for(const controller of new Set(Object.values(gun.userData.additionalArms)))if(!ready()||!ADDITIONAL_WEAPONS.includes(weapon))controller.mount.visible=false;
    gun.userData.onAssetsChanged?.();
  };
  const load=key=>{
    if(states[key]==='ready'||tasks[key])return tasks[key]||Promise.resolve();
    states[key]='loading';delete errors[key];sync();
    const task=(async()=>{
      try{
        if(key==='arms'){
          const controller=await (loaders.arms||loadFirstPersonArms)(camera);
          gun.userData.firstPersonArms=controller;controller.mount.userData.hipPosition=controller.mount.position.clone();
          gun.userData.adsOffset=controller.getNativeAdsOffset();controller.setActionListener(({kind,weapon,reloadRemaining,reloadReadyDuration,equipElapsed})=>gun.userData.onWeaponAction?.(kind,weapon,{reloadRemaining,reloadReadyDuration,equipElapsed}));
        }else{
          let model;
          if(key==='vandal')model=await (loaders.vandal||loadVandal)();
          else{model=(await (loaders.imported||loadImportedWeapon)(key)).root;if(key==='ghost')await (loaders.ghostMechanics||attachGhostMechanics)(model);
            if(ADDITIONAL_WEAPONS.includes(key)){await attachAdditionalWeaponMechanics(model,key);const controller=await loadAdditionalFirstPersonArms(camera,key);gun.userData.additionalArms[key]=controller;controller.setActionListener(({kind,weapon,...metadata})=>gun.userData.onWeaponAction?.(kind,weapon,metadata));}}
          model.visible=false;gun.add(model);gun.userData.assets[key]=model;
          if(key==='vandal'){gun.userData.vandal=model;flash.position.copy(model.userData.socket.position);}
        }
        states[key]='ready';if(key!=='arms')touchAsset(key);
      }catch(error){states[key]='failed';errors[key]=String(error?.message||error);console.error(key+' asset failed',error);}
      finally{delete tasks[key];sync();}
    })();tasks[key]=task;return task;
  };
  gun.userData.isWeaponReady=ready;
  // Warm a requested weapon without changing the authoritative equipped weapon.
  gun.userData.preloadWeapon=kind=>Object.hasOwn(states,kind)?load(kind):Promise.resolve();
  gun.userData.selectWeapon=kind=>{if(gun.userData.weapon!==kind){gun.userData.weapon=kind;touchAsset(kind);sync();if(ADDITIONAL_WEAPONS.includes(kind)&&states[kind]!=='ready')load(kind);}};
  gun.userData.getActiveArms=()=>gun.userData.additionalArms[gun.userData.weapon]||gun.userData.firstPersonArms;
  gun.userData.retryAssets=()=>Promise.all(Object.keys(states).filter(key=>states[key]==='failed').map(load));
  gun.userData.resetAnimation=()=>{
    gun.userData.attackAt=0;gun.userData.lastArmShot=0;
    const arms=gun.userData.firstPersonArms;arms?.update(0,{visible:false,weapon:ADDITIONAL_WEAPONS.includes(gun.userData.weapon)?'vandal':gun.userData.weapon});
    for(const controller of new Set(Object.values(gun.userData.additionalArms)))controller.update(0,{visible:false});
    for(const asset of Object.values(gun.userData.assets))asset.userData.updateAnimation?.(0,{visible:false,reloading:false});
    flash.userData.effects.clear();
  };
  gun.userData.replayEquip=()=>{
    if(!ready()||!gun.visible)return;
    gun.userData.getActiveArms().update(0,{visible:true,weapon:gun.userData.weapon,reloading:false});
    gun.userData.activeAsset.userData.updateAnimation?.(0,{visible:true,reloading:false});
    gun.userData.getActiveArms().equip();gun.userData.activeAsset.userData.equip?.();
  };
  gun.userData.readyPromise=Promise.all(['arms','vandal','ghost','knife'].map(load));
  return {gun,flash};
}

export function animateWeapon(gun,{time=0,dt=0,speed=0,kick=0,crouch=false,grounded=true,ads=0,reloading=false,reloadRemaining,reloadReadyDuration,equipElapsed}={}) {
  const imported=gun.userData.activeAsset;
  if(ADDITIONAL_WEAPONS.includes(gun.userData.weapon)){animateAdditionalViewmodel(gun,{dt,speed,crouch,grounded,ads,reloading,reloadRemaining,reloadReadyDuration,equipElapsed});return;}
  for(const controller of new Set(Object.values(gun.userData.additionalArms||{})))controller.update(0,{visible:false});
  for(const kind of ADDITIONAL_WEAPONS)gun.userData.assets[kind]?.userData.updateAnimation?.(0,{visible:false,reloading:false});
  resetFirstPersonReloadContact(gun);
  gun.userData.vandal?.userData.updateAnimation(dt,{visible:gun.visible&&gun.userData.weapon==='vandal',reloading:reloading&&gun.userData.weapon==='vandal',reloadRemaining,reloadReadyDuration,equipElapsed,ads});
  gun.userData.assets.ghost?.userData.updateAnimation?.(dt,{visible:gun.visible&&gun.userData.weapon==='ghost',reloading:reloading&&gun.userData.weapon==='ghost',reloadRemaining,reloadReadyDuration,equipElapsed});
  const arms=gun.userData.firstPersonArms;
  const useArms=!!arms&&gun.visible&&(gun.userData.isWeaponReady?.()??true);
  if(arms){const hip=arms.mount.userData.hipPosition||(arms.mount.userData.hipPosition=arms.mount.position.clone());const rotation=arms.mount.userData.hipRotation||(arms.mount.userData.hipRotation=arms.mount.quaternion.clone());arms.mount.position.copy(hip);arms.mount.quaternion.copy(rotation);}
  const armsState={visible:useArms,reloading:reloading&&useArms,weapon:gun.userData.weapon,speed,grounded,crouch,ads,reloadRemaining,reloadReadyDuration,equipElapsed};
  if(arms&&gun.userData.attackAt!==gun.userData.lastArmShot){
    gun.userData.lastArmShot=gun.userData.attackAt;
    if(gun.userData.attackAt){arms.update(0,armsState);arms.fire(gun.userData.attackKind);}
  }
  // Sample the shot on the same render frame as its weapon mechanism.
  arms?.update(dt,armsState);
  if(arms&&gun.userData.weapon==='vandal'){
    arms.applyViewmodelPose();
  }
  if(arms&&gun.userData.weapon==='knife'){arms.mount.position.add(arms.getKnifeViewmodelOffset());}
  if(arms&&gun.userData.weapon==='ghost'){arms.applyGhostViewmodelPose();}
  if(gun.userData.fallbackHands)gun.userData.fallbackHands.visible=gun.userData.weapon==='vandal'&&!useArms;
  if(useArms){
    if(!gun.userData.disableGripConstraint)arms.applyNativeRightGrip?.();
    const anchor=arms.getWeaponTransform();gun.position.copy(anchor.position);gun.quaternion.copy(anchor.rotation);
  }
  applyFirstPersonReloadContact(gun,reloading);
  if(useArms&&!gun.userData.disableGripConstraint&&!gun.userData.disableLeftGripConstraint)arms.applyWeaponGrip?.(imported);
  if(imported){
    gun.updateWorldMatrix(true,true);
    const flash=gun.userData.muzzle;
    flash.position.copy(gun.worldToLocal(imported.userData.muzzle.getWorldPosition(new T.Vector3())));
  }
}


function animateAdditionalViewmodel(gun,{dt,speed,crouch,grounded,ads,reloading,reloadRemaining,reloadReadyDuration,equipElapsed}){
  const weapon=gun.userData.weapon,model=gun.userData.activeAsset,arms=gun.userData.additionalArms[weapon];
  for(const kind of ADDITIONAL_WEAPONS)if(kind!==weapon)gun.userData.assets[kind]?.userData.updateAnimation?.(0,{visible:false,reloading:false});
  // Hide the legacy rig; never call it with an unsupported new gun or alter its action maps.
  gun.userData.firstPersonArms?.update(0,{visible:false,weapon:'vandal'});
  gun.userData.vandal?.userData.updateAnimation?.(0,{visible:false,reloading:false});
  gun.userData.assets.ghost?.userData.updateAnimation?.(0,{visible:false,reloading:false});
  const visible=gun.visible&&gun.userData.isWeaponReady();
  model?.userData.updateAnimation?.(dt,{visible,reloading:visible&&reloading,reloadRemaining,reloadReadyDuration,equipElapsed,ads});
  if(!arms)return;
  const state={visible,reloading:visible&&reloading,weapon,speed,crouch,grounded,ads,reloadRemaining,reloadReadyDuration,equipElapsed};
  if(gun.userData.attackAt!==gun.userData.lastArmShot){gun.userData.lastArmShot=gun.userData.attackAt;if(gun.userData.attackAt){arms.update(0,state);arms.fire();}}
  arms.update(dt,state);arms.applyAdditionalAds(model,ads);
  if(visible){const anchor=arms.getWeaponTransform();gun.position.copy(anchor.position);gun.quaternion.copy(anchor.rotation);gun.updateWorldMatrix(true,true);if(model?.userData.muzzle)gun.userData.muzzle.position.copy(gun.worldToLocal(model.userData.muzzle.getWorldPosition(new T.Vector3())));}
}

export function getMuzzlePosition(gun) {
 gun.updateWorldMatrix(true,true);
 const bone=gun.userData.activeAsset?.userData.muzzle;
 return bone?bone.getWorldPosition(new T.Vector3()):(gun.userData.muzzle||gun.children.find(o=>o.geometry?.type==='ConeGeometry')).getWorldPosition(new T.Vector3());
}

export function getEjectionPosition(gun){
 const asset=gun.userData.activeAsset;if(!asset)return null;
 let bone=asset.userData.ejectionBone;
 if(!bone){asset.traverse(o=>{if(o.isBone&&/^Ejection(?:_\d+)?$/.test(o.name))bone??=o;});asset.userData.ejectionBone=bone;}
 if(!bone)return null;gun.updateWorldMatrix(true,true);return bone.getWorldPosition(new T.Vector3());
}


// Give nearby characters genuine depth against the viewmodel, while retaining
// the established separate pass for architecture. Does not move FP bones/guns.
export function createCharacterViewmodelOcclusion(){
  const cache=new WeakMap(),materials=new Set(),meshes=[],origin=new T.Vector3(),point=new T.Vector3(),direction=new T.Vector3();
  let prepared=null;
  const diagnostics={active:false,meshes:0,reason:'not near a character'};
  function depthMaterial(original){
    if(cache.has(original))return cache.get(original);
    const depth=new T.MeshDepthMaterial({colorWrite:false,depthWrite:true,depthTest:true,side:original.side,map:original.map,alphaMap:original.alphaMap,alphaTest:original.alphaTest});
    depth.name='Character-only viewmodel depth';cache.set(original,depth);materials.add(depth);return depth;
  }
  return {diagnostics,
    render(renderer,scene,camera,opponent,{wallDistance=()=>Infinity}={}){
      diagnostics.active=false;diagnostics.reason='not near a character';
      if(!opponent?.visible||opponent.userData.status!=='ready')return false;
      camera.getWorldPosition(origin);const root=opponent.getWorldPosition(point);
      if(Math.hypot(root.x-origin.x,root.z-origin.z)>2.2)return false;
      const model=opponent.userData.native?.model;if(!model)return false;
      // Hidden characters behind solid cover must not clip the viewmodel.
      const bones=opponent.userData.native.bones;let visible=false;
      for(const name of ['Head','Spine3','L_Hand','R_Hand']){
        const bone=bones[name];if(!bone)continue;bone.getWorldPosition(point);direction.copy(point).sub(origin);const distance=direction.length();
        if(distance<.001||wallDistance(origin,direction.divideScalar(distance))+.015>=distance){visible=true;break;}
      }
      if(!visible){diagnostics.reason='character behind cover';return false;}
      if(prepared!==model){meshes.length=0;model.traverse(mesh=>{if(!mesh.isMesh)return;const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(list.some(m=>m.transparent))return;mesh.layers.enable(2);meshes.push(mesh);});prepared=model;}
      const saved=meshes.map(mesh=>({mesh,material:mesh.material})),layers=camera.layers.mask,background=scene.background,override=scene.overrideMaterial;
      try{
        for(const {mesh,material} of saved)mesh.material=Array.isArray(material)?material.map(depthMaterial):depthMaterial(material);
        scene.background=null;scene.overrideMaterial=null;camera.layers.set(2);renderer.render(scene,camera);
      }finally{
        for(const {mesh,material} of saved)mesh.material=material;camera.layers.mask=layers;scene.background=background;scene.overrideMaterial=override;
      }
      diagnostics.active=true;diagnostics.meshes=meshes.length;diagnostics.reason='nearby character depth';return true;
    },
    dispose(){for(const material of materials)material.dispose();materials.clear();meshes.length=0;prepared=null;}
  };
}
