import test from 'node:test';
import assert from 'node:assert/strict';
import {createArenaPreparation,warmArenaGraphics} from '../public/arena-preparation.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function harness({fail=null,hold=null}={}){
 const states={arms:'ready'},loaded=new Set(),hitboxes=new Set(),calls=[],prepared=[];let warmed=0,retained=false,failOnce=!!fail;
 const gun={userData:{weapon:'vandal',additionalArms:{},loadingDiagnostics:{states},readyPromise:Promise.resolve(),retryAssets:async()=>{},retainAllWeapons:()=>{retained=true;},preloadWeapon:async id=>{calls.push(id);if(hold?.id===id)await hold.promise;if(id===fail&&failOnce){failOnce=false;states[id]='failed';return;}states[id]='ready';gun.userData.additionalArms[id]={prepareWeapon:key=>prepared.push(key)};}}};
 const opponent={userData:{status:'ready',readyPromise:Promise.resolve(),ensureWeapon:async id=>loaded.add(id),isWeaponReady:id=>loaded.has(id)}};
 const manager=createArenaPreparation({weapons:['vandal','ghost','odin'],gun,opponent,ensureHitbox:async id=>hitboxes.add(id),isHitboxReady:id=>hitboxes.has(id),warmGraphics:async()=>{warmed++;},yieldFrame:async()=>{}});
 return {manager,gun,opponent,calls,prepared,get warmed(){return warmed;},get retained(){return retained;}};
}
test('entry preparation waits for every gun; repeat starts share work and preserve loadout',async()=>{
 const wait=deferred(),h=harness({hold:{id:'odin',...wait}});const a=h.manager.start(),b=h.manager.start();assert.equal(a,b);
 await new Promise(r=>setImmediate(r));assert.equal(h.manager.state.status,'loading');assert.equal(h.warmed,0);assert(h.manager.state.completed<h.manager.state.total);
 wait.resolve();await a;assert.equal(h.manager.state.status,'ready');assert.equal(h.manager.state.weaponsReady,3);assert.equal(h.manager.state.completed,h.manager.state.total);assert.equal(h.gun.userData.weapon,'vandal');assert(h.retained);assert(h.opponent.userData.retainWeaponCache);assert.equal(h.prepared.length,3);await h.manager.start();assert.equal(h.calls.length,3);assert.equal(h.warmed,1);
});
test('failed gun blocks entry and retry keeps already prepared guns',async()=>{
 const h=harness({fail:'ghost'});await h.manager.start();assert.equal(h.manager.state.status,'failed');assert.equal(h.warmed,0);assert.equal(h.manager.state.weaponsReady,2);await h.manager.start();assert.equal(h.manager.state.status,'ready');assert.equal(h.calls.filter(id=>id==='ghost').length,2);assert.equal(h.calls.filter(id=>id==='odin').length,1);assert.equal(h.warmed,1);
});
test('graphics preparation uploads each shared texture once then compiles hidden materials',async()=>{
 const texture={isTexture:true},other={isTexture:true},events=[];
 const scene={traverse:fn=>[{material:{map:texture}},{material:[{map:texture},{normalMap:other}]}].forEach(fn)};
 await warmArenaGraphics({initTexture:t=>events.push(t),compileAsync:async(s,c)=>{assert.equal(s,scene);assert.equal(c,'camera');events.push('compile');}},scene,'camera',{yieldFrame:async()=>{}});assert.deepEqual(events,[texture,other,'compile']);
});

test('offscreen buffer warm-up restores hidden meshes, culling and target even on failure',async()=>{
 for(const fail of [false,true]){
  const node={isMesh:true,visible:false,frustumCulled:true},scene={traverse:fn=>fn(node)},camera={constructor:class {copy(){this.layers={set(){}};return this;}}};let target='screen',disposed=false;
  const renderer={compileAsync:async()=>{},clearDepth(){},getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},render:()=>{assert.equal(node.visible,true);assert.equal(node.frustumCulled,false);if(fail)throw Error('context lost');}};
  const pending=warmArenaGraphics(renderer,scene,camera,{createRenderTarget:()=>({dispose(){disposed=true;}})});
  if(fail)await assert.rejects(pending,/context lost/);else await pending;
  assert.equal(node.visible,false);assert.equal(node.frustumCulled,true);assert.equal(target,'screen');assert(disposed);
 }
});
