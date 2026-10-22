// Prepare the complete playable armory once per browser session. Never equip a
// weapon or change the player's loadout while preparing its original resources.
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
export function createArenaPreparation({weapons,gun,opponent,ensureHitbox,isHitboxReady,warmGraphics,yieldFrame=nextFrame,concurrency=2}){
 const ids=[...new Set(weapons)],done=new Set();let pending=null,started=0;
 const state={status:'idle',message:'Preparing all weapons…',completed:0,total:ids.length+2,weaponsReady:0,weaponCount:ids.length,errors:{},durationMs:0};
 const publish=()=>{state.completed=done.size;state.weaponsReady=ids.filter(id=>done.has(id)).length;};
 const start=()=>{
  if(pending)return pending;if(state.status==='ready')return Promise.resolve(state);
  gun.userData.retainAllWeapons();opponent.userData.retainWeaponCache=true;
  state.status='loading';state.errors={};started=performance.now();
  pending=(async()=>{
   await Promise.all([gun.userData.readyPromise,opponent.userData.readyPromise]);
   if(opponent.userData.status==='failed')await opponent.userData.retryAssets();
   await gun.userData.retryAssets();
   if(opponent.userData.status!=='ready'||gun.userData.loadingDiagnostics.states.arms!=='ready')throw Error('Character resources failed to load');
   done.add('characters');publish();
   let cursor=0;
   async function worker(){
    while(cursor<ids.length){
     const id=ids[cursor++];if(done.has(id))continue;
     try{
      await Promise.all([gun.userData.preloadWeapon(id),opponent.userData.ensureWeapon(id,{retry:true}),ensureHitbox(id)]);
      if(gun.userData.loadingDiagnostics.states[id]!=='ready'||!opponent.userData.isWeaponReady(id)||!isHitboxReady(id))throw Error('Incomplete weapon resources');
      gun.userData.additionalArms[id]?.prepareWeapon(id);
      done.add(id);publish();state.message=`Preparing weapons ${state.weaponsReady} / ${ids.length}…`;
     }catch(error){state.errors[id]=String(error?.message||error);}
     // Let progress paint and input run between CPU-heavy original clip builds.
     await yieldFrame();
    }
   }
   await Promise.all(Array.from({length:Math.max(1,Math.min(concurrency,ids.length))},worker));
   if(Object.keys(state.errors).length)throw Error('Some weapons could not be prepared');
   state.message='Preparing graphics…';await yieldFrame();await warmGraphics();done.add('graphics');publish();
   state.status='ready';state.message='Arena ready';
  })().catch(error=>{state.status='failed';state.errors.arena=String(error?.message||error);state.errors.stack=String(error?.stack||'');state.message='Arena preparation failed';}).finally(()=>{state.durationMs=Math.round(performance.now()-started);pending=null;});
  return pending;
 };
 return {state,start};
}

// Upload decoded textures and compile every retained material while the loading
// screen covers the arena. Three's compile traverses hidden weapon meshes too.
export async function warmArenaGraphics(renderer,scene,camera,{yieldFrame=nextFrame,createRenderTarget}={}){
 const textures=new Set();scene.traverse(object=>{
  for(const material of Array.isArray(object.material)?object.material:[object.material])if(material)for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
 });
 let count=0;for(const texture of textures){renderer.initTexture(texture);if(++count%4===0)await yieldFrame();}
 await renderer.compileAsync(scene,camera);
 if(createRenderTarget){
  // A tiny offscreen draw allocates geometry and skinning buffers for hidden
  // guns. Restore visibility/culling and target before yielding. No mixer,
  // animation event, authored transform or visible canvas is advanced.
  const target=createRenderTarget(),previous=renderer.getRenderTarget(),saved=[],warmCamera=new camera.constructor().copy(camera,false);warmCamera.layers.enableAll();
  scene.traverse(object=>{saved.push([object,object.visible,object.frustumCulled]);object.visible=true;if(object.isMesh)object.frustumCulled=false;});
  try{renderer.setRenderTarget(target);renderer.render(scene,warmCamera);}
  finally{for(const [object,visible,culled] of saved){object.visible=visible;object.frustumCulled=culled;}renderer.setRenderTarget(previous);target.dispose();}
 }
}
