import {WEAPONS,equipClipPhase} from '/weapons.mjs';
import * as T from '/vendor/three.module.js';
import {GLTFLoader} from '/vendor/addons/loaders/GLTFLoader.js';
import {createNativeBoneClip} from '/psa-animation.mjs';
import {createReloadTimeline} from '/weapon-feel.mjs';

// Local user-provided asset. No model code or embedded instructions are executed.
export async function loadVandal() {
  const textures=new T.TextureLoader();
  const paths=['DF','NM','R','M','AO'];
  const [model,...maps]=await Promise.all([
    new GLTFLoader().loadAsync('/assets/packs/vandal.glb').then(gltf=>gltf.scene),
    ...paths.map(s=>textures.loadAsync(`/assets/vandal/AK_S0_${s}.png`))
  ]);
  const [map,normalMap,roughnessMap,metalnessMap,aoMap]=maps;
  for(const texture of maps)texture.flipY=false;
  map.colorSpace=T.SRGBColorSpace;
  const material=new T.MeshStandardMaterial({map,normalMap,roughnessMap,metalnessMap,aoMap,roughness:1,metalness:1});
  // Packed textures originate from a DirectX pipeline; flip tangent-space green.
  material.normalScale.set(1,-1);
  model.updateMatrixWorld(true);
  // The source pack's separate rigid magazine was not parented to its animated
  // bone. Attach it preserving its authored bind pose, plus the reload spare.
  let magazine;model.traverse(o=>{if(o.isMesh&&o.name.startsWith('GN_AK_Magazine_S0_Staticmesh'))magazine=o;});
  const main=model.getObjectByName('Magazine_Main'),extra=model.getObjectByName('Magazine_Extra');
  if(magazine&&main){
    main.attach(magazine);
    if(extra){const spare=magazine.clone();spare.name='Animated reload spare magazine';extra.add(spare);}
  }
  const mounted=new T.Group();mounted.name='Imported Vandal';mounted.rotation.y=Math.PI/2;mounted.add(model);
  // ADS-only deformation of the supplied rear U sight, rather than a second
  // overlapping sight mesh. The base geometry and hip pose remain untouched.
  mounted.updateMatrixWorld(true);
  const rearSightMorphs=[];
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!mesh.name.startsWith('GN_AK_S0_Skelmesh'))return;
    mesh.skeleton.update();const positions=mesh.geometry.attributes.position;
    const delta=new Float32Array(positions.count*3);let affected=0;
    for(let i=0;i<positions.count;i++){
      const point=mesh.localToWorld(mesh.getVertexPosition(i,new T.Vector3()));
      if(point.z<-.386||point.z>-.359||point.y<.140||Math.abs(point.x)<.010)continue;
      const weight=T.MathUtils.smoothstep(point.y,.146,.158);
      const displacement=new T.Vector3(point.x*.70*T.MathUtils.smoothstep(point.y,.140,.145),.006*weight,0);
      const localDelta=mesh.worldToLocal(point.clone().add(displacement)).sub(mesh.worldToLocal(point.clone()));
      delta.set(localDelta.toArray(),i*3);affected++;
    }
    if(affected){mesh.geometry.morphTargetsRelative=true;mesh.geometry.morphAttributes.position=[new T.Float32BufferAttribute(delta,3)];mesh.updateMorphTargets();rearSightMorphs.push({mesh,affected});}
  });
  // The supplied Reflex marker has no weighted vertices or deploy clip.
  // A separate ADS-only housing follows the real rifle Root, including Fire.
  const adsSight=new T.Group();adsSight.name='Calibrated ADS sight supplement';adsSight.scale.x=.70;adsSight.position.y=-.012;adsSight.rotation.y=-Math.PI/2;mounted.add(adsSight);
  const dark=new T.MeshStandardMaterial({color:0x151b20,roughness:.45,metalness:.65}),gold=new T.MeshBasicMaterial({color:0xffc54b});
  const shape=new T.Shape();shape.moveTo(-.057,-.007);for(const [x,y] of [[-.053,.004],[-.035,.018],[.035,.018],[.053,.004],[.057,-.007]])shape.lineTo(x,y);shape.closePath();
  const housing=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.002,bevelThickness:.002}),dark);housing.scale.y=.6;housing.position.set(0,.145,-.30);adsSight.add(housing);
  const line=(parent,points)=>{const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'catmullrom',0);const mesh=new T.Mesh(new T.TubeGeometry(curve,points.length*4,.0012,5,false),gold);parent.add(mesh);return mesh;};
  line(adsSight,[[-.011,.160,-.245],[0,.173,-.245],[.011,.160,-.245],[-.011,.160,-.245]]);
  const wings=[-1,1].map(side=>{const wing=new T.Group();wing.position.set(side*.028,.160,-.285);const plate=new T.Mesh(new T.BoxGeometry(.028,.008,.018),dark);plate.position.x=side*.014;wing.add(plate);line(wing,[[0,.005,.010],[side*.026,.005,.010]]);adsSight.add(wing);return {wing,side};});
  adsSight.traverse(o=>o.userData.adsSupplement=true);
  mounted.updateWorldMatrix(true,true);model.getObjectByName('Root')?.attach(adsSight);adsSight.visible=false;
  let triangles=0,meshes=0;
  model.traverse(o=>{if(o.isMesh&&!o.userData.adsSupplement){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;o.material=material;o.castShadow=false;o.receiveShadow=false;}});
  mounted.updateMatrixWorld(true);
  const muzzle=model.getObjectByName('Muzzle');
  const muzzleLocal=mounted.worldToLocal(muzzle.getWorldPosition(new T.Vector3()));
  // Parent-space socket already includes the asset rotation, centimeters and pivot.
  const socket=new T.Object3D();socket.name='Vandal muzzle socket';
  socket.position.copy(muzzleLocal).applyAxisAngle(new T.Vector3(0,1,0),Math.PI/2);
  const clips=await Promise.all(['Fire','Equip','Reload'].map(async kind=>{
    const response=await fetch(`/assets/packs/animations/vandal-${kind.toLowerCase()}.json`);
    if(!response.ok)throw new Error(`Vandal ${kind} animation HTTP ${response.status}`);
    const source=await response.json(),clip=createNativeBoneClip(model,source);
    if(kind==='Fire'){
      // The supplied first Fire key is already pulled back by 91 mm. A native
      // 20 ms bind-to-source lead prevents a zero-time visible mesh teleport.
      // Keep every authored key, its spacing, and the full mechanical amplitude.
      const lead=.020;
      for(const track of clip.tracks){
        const dot=track.name.lastIndexOf('.'),bone=model.getObjectByProperty('uuid',track.name.slice(0,dot)),property=track.name.slice(dot+1);
        const initial=bone[property].toArray();
        track.times=new Float32Array([0,...Array.from(track.times,t=>t+lead)]);
        track.values=new Float32Array([...initial,...track.values]);
      }
      clip.duration=source.duration+lead;
      clip.userData.fireLeadIn=lead;clip.userData.nativeDuration=source.duration;
    }
    return clip;
  }));
  const mixer=new T.AnimationMixer(model),actions=Object.fromEntries(clips.map((clip,i)=>{
    const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;
    if(i===2)action.timeScale=clip.duration/(WEAPONS.vandal.reload/1000);
    if(i===1)action.timeScale=clip.duration/(WEAPONS.vandal.visualEquip/1000);
    return [['fire','equip','reload'][i],action];
  }));
  const rest=[];model.traverse(o=>{if(o.isBone)rest.push({bone:o,position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()});});
  const reloadTimeline=createReloadTimeline();
  let active=null,equipAge=0,reloadWas=false,equipped=false;
  const restore=()=>{mixer.stopAllAction();reloadTimeline.reset();for(const b of rest){b.bone.position.copy(b.position);b.bone.quaternion.copy(b.quaternion);b.bone.scale.copy(b.scale);}active=null;};
  const play=kind=>{
    // A rapid second shot can arrive before the native mechanical tail ends.
    // Begin its lead from the currently rendered GN pose, not a bind reset.
    const entry=kind==='fire'?clips[0].tracks.map(track=>{
      const dot=track.name.lastIndexOf('.'),bone=model.getObjectByProperty('uuid',track.name.slice(0,dot));
      return bone[track.name.slice(dot+1)].toArray();
    }):null;
    restore();
    if(entry)clips[0].tracks.forEach((track,i)=>track.values.set(entry[i],0));
    if(kind==='equip')equipAge=0;active=kind;actions[kind].reset().setEffectiveTimeScale(kind==='reload'?clips[2].duration/(WEAPONS.vandal.reload/1000):kind==='fire'?1:actions[kind].timeScale).play();
  };
  mounted.userData={model,muzzle,material,adsSight,triangles,meshes,clips:clips.map(a=>a.name),socket,
    rearSightMorphs,
    animationDiagnostics:{rearSightVertices:rearSightMorphs.reduce((sum,r)=>sum+r.affected,0),active:null,matchedBones:clips[0].userData.matchedBones.length,missingBones:clips[0].userData.missingBones,reloadDuration:WEAPONS.vandal.reload/1000,fireLeadIn:clips[0].userData.fireLeadIn,nativeFireDuration:clips[0].userData.nativeDuration,fireCycleDuration:clips[0].duration},
    equip(){if(equipped&&!reloadWas)play('equip');},
    fire(){if(!reloadWas&&equipped)play('fire');},
    updateAnimation(dt,{visible,reloading,ads=0,reloadRemaining,equipElapsed}){
      const entering=visible&&!equipped;
      const expired=reloading&&Number.isFinite(reloadRemaining)&&reloadRemaining<=0;
      reloading=!!reloading&&!expired;
      for(const {mesh} of rearSightMorphs)mesh.morphTargetInfluences[0]=visible&&!reloading?Math.max(0,Math.min(1,ads)):0;
      adsSight.visible=visible&&ads>.35&&!reloading;for(const {wing,side} of wings)wing.rotation.z=side*.42*Math.max(0,Math.min(1,ads));
      if(!visible){restore();equipped=false;reloadWas=false;}
      else {
        if(reloading&&(!equipped||!reloadWas||active!=='reload'))play('reload');
        else if(expired&&(!equipped||reloadWas))restore();
        else if(!equipped){if(Number.isFinite(equipElapsed)&&equipElapsed>=WEAPONS.vandal.visualEquip/1000)restore();else {play('equip');if(Number.isFinite(equipElapsed)){equipAge=equipElapsed;actions.equip.time=equipClipPhase('vandal',equipElapsed)*actions.equip.getClip().duration;actions.equip.setEffectiveTimeScale(0);}}}
        else if(!reloading&&reloadWas)restore();
        equipped=true;reloadWas=reloading;
      }
      const deadline=visible&&active==='reload'?reloadTimeline.sample(WEAPONS.vandal.reload/1000,reloadRemaining,actions.reload.time/clips[2].duration*WEAPONS.vandal.reload/1000):null;
      if(active==='reload'){
        if(deadline){actions.reload.time=deadline.phase*clips[2].duration;actions.reload.paused=false;actions.reload.setEffectiveTimeScale(0);}
        else actions.reload.setEffectiveTimeScale(clips[2].duration/(WEAPONS.vandal.reload/1000));
      }
      if(active==='equip'&&dt>0&&!(entering&&Number.isFinite(equipElapsed))){const nextAge=equipAge+dt;actions.equip.setEffectiveTimeScale((equipClipPhase('vandal',nextAge)+(nextAge>=WEAPONS.vandal.visualEquip/1000?1e-7:0)-equipClipPhase('vandal',equipAge))*actions.equip.getClip().duration/dt);equipAge=nextAge;}
      mixer.update(dt);
      if(active&&actions[active].paused&&!reloading)restore();
      this.animationDiagnostics.active=active;
      this.animationDiagnostics.time=active?actions[active].time:0;
      this.animationDiagnostics.reloadPhase=active==='reload'?actions.reload.time/clips[2].duration:null;this.animationDiagnostics.reloadDeadlineDriven=!!deadline;this.animationDiagnostics.reloadRemaining=Number.isFinite(reloadRemaining)?reloadRemaining:null;
      this.animationDiagnostics.magazine=model.getObjectByName('Magazine_Main')?.position.toArray();
      this.animationDiagnostics.magazineMeshBound=magazine?.parent===main;
      this.animationDiagnostics.magazineMeshParent=magazine?.parent?.name;
      this.animationDiagnostics.spareMeshParent=model.getObjectByName('Animated reload spare magazine')?.parent?.name;
      this.animationDiagnostics.magazineWorld=main?.getWorldPosition(new T.Vector3()).toArray();
    }};
  return mounted;
}
