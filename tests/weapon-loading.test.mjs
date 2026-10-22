import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as T from 'three';
const read=n=>fs.readFileSync(new URL('../public/'+n+'.mjs',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
function harness({arms,imported,mechanics}={}){
 const disposed=[],controller=()=>({mount:new T.Group(),getNativeAdsOffset:()=>new T.Vector3(),setActionListener(){},releaseWeapon:()=>true,diagnostics:{weapon:null}});
 const c=vm.createContext({T,performance,console,ADDITIONAL_WEAPONS:['odin','ares','guardian','operator','spectre','bulldog'],createMuzzleFlash:()=>new T.Group(),loadFirstPersonArms:async()=>controller(),loadVandal:async()=>{const root=new T.Group();root.userData.socket=new T.Object3D();return root;},loadImportedWeapon:imported|| (async()=>({root:new T.Group()})),attachGhostMechanics:async()=>{},attachAdditionalWeaponMechanics:mechanics|| (async()=>{}),loadAdditionalFirstPersonArms:arms|| (async()=>controller()),disposeImportedWeapon:o=>disposed.push(o)});
 vm.runInContext(read('scene').split('export function buildWeapon')[1].split('export function animateWeapon')[0].replace('(camera,','function buildWeapon(camera,'),c);
 return{gun:c.buildWeapon(new T.Group()).gun,disposed};
}
test('new weapon starts hands before its deferred model resolves; repeats share one load',async()=>{
 const mesh=deferred(),hands=deferred();let modelCalls=0,handCalls=0,attached=0;
 const h=harness({imported:async id=>{if(id==='odin'){modelCalls++;return mesh.promise;}return{root:new T.Group()};},arms:()=>{handCalls++;return hands.promise;},mechanics:async()=>{attached++;}});
 await h.gun.userData.readyPromise;const a=h.gun.userData.preloadWeapon('odin'),b=h.gun.userData.preloadWeapon('odin');
 assert.equal(a,b);assert.equal(modelCalls,1);assert.equal(handCalls,1);assert.equal(attached,0);
 mesh.resolve({root:new T.Group()});hands.resolve({mount:new T.Group(),setActionListener(){},diagnostics:{weapon:null}});await a;
 assert.equal(attached,1);assert.equal(h.gun.userData.loadingDiagnostics.states.vandal,'ready');assert.equal(h.gun.userData.loadingDiagnostics.states.odin,'ready');assert.equal(h.gun.userData.weapon,'vandal');
 h.gun.userData.selectWeapon('odin');assert.equal(h.gun.userData.isWeaponReady(),true);
});
test('failed hand preparation disposes completed model and permits a clean retry',async()=>{
 let attempt=0;const model=new T.Group(),h=harness({imported:async id=>({root:id==='odin'?model:new T.Group()}),arms:async()=>{if(!attempt++)throw Error('offline');return{mount:new T.Group(),setActionListener(){},diagnostics:{weapon:null}};}});
 await h.gun.userData.readyPromise;await h.gun.userData.preloadWeapon('odin');assert.equal(h.gun.userData.loadingDiagnostics.states.odin,'failed');assert.equal(h.disposed[0],model);
 await h.gun.userData.preloadWeapon('odin');assert.equal(h.gun.userData.loadingDiagnostics.states.odin,'ready');
});
test('cache eviction retains equipped loadout while keeping a bounded model cache',async()=>{
 const h=harness();await h.gun.userData.readyPromise;h.gun.userData.pinnedWeapons=['odin','ares'];
 for(const id of ['odin','ares','guardian','operator','spectre','bulldog'])await h.gun.userData.preloadWeapon(id);
 assert(h.gun.userData.assets.odin);assert(h.gun.userData.assets.ares);assert.equal(h.gun.userData.loadingDiagnostics.cachedNew.length,4);assert.equal(h.gun.userData.loadingDiagnostics.evictions,2);
});
test('gun fire/equip/reload source requests overlap and retain exact source data',async()=>{
 const requests=[],pending=[];const c=vm.createContext({loadNativeWeaponIndex:async()=>({gn:{fire:'f',equip:'e',reload:'r'}}),fetch:url=>{requests.push(url);const d=deferred();pending.push(d);return d.promise;}});
 let fn=read('additional-weapon').split('export async function attachAdditionalWeaponMechanics')[1].split(' const model=root.userData.model||root')[0];
 vm.runInContext('async function load'+fn+'return sources;}',c);const task=c.load({},'phantom');await tick();assert.equal(requests.length,3);
 for(const i of [2,0,1])pending[i].resolve({ok:true,json:async()=>({native:i})});const result=await task;assert.equal(result.fire.native,0);assert.equal(result.equip.native,1);assert.equal(result.reload.native,2);assert.deepEqual(Object.keys(result),['fire','equip','reload']);
});
test('native index fetch is shared, and a rejected request remains retryable',async()=>{
 let calls=0;const c=vm.createContext({ADDITIONAL_WEAPONS:['odin'],fetch:async()=>{calls++;return{ok:true,json:async()=>({weapon:'odin',format:'native-weapon-index-v1'})};}});
 vm.runInContext(read('additional-first-person').slice(read('additional-first-person').indexOf('const nativeIndices='),read('additional-first-person').indexOf('export async function loadAdditionalFirstPersonArms')).replaceAll('export ',''),c);
 const a=c.loadNativeWeaponIndex('odin'),b=c.loadNativeWeaponIndex('odin');assert.equal(a,b);await a;assert.equal(calls,1);
 const r=vm.createContext({ADDITIONAL_WEAPONS:['odin'],fetch:async()=>{throw Error('offline');}});vm.runInContext(read('additional-first-person').slice(read('additional-first-person').indexOf('const nativeIndices='),read('additional-first-person').indexOf('export async function loadAdditionalFirstPersonArms')).replaceAll('export ',''),r);await assert.rejects(r.loadNativeWeaponIndex('odin'));r.fetch=async()=>({ok:true,json:async()=>({weapon:'odin',format:'native-weapon-index-v1'})});await r.loadNativeWeaponIndex('odin');
});

test('full arena retention keeps all prepared guns beyond the old four gun limit',async()=>{const h=harness();await h.gun.userData.readyPromise;h.gun.userData.retainAllWeapons();for(const id of ['odin','ares','guardian','operator','spectre','bulldog'])await h.gun.userData.preloadWeapon(id);assert.equal(h.gun.userData.loadingDiagnostics.evictions,0);assert.equal(h.gun.userData.loadingDiagnostics.cachedNew.length,6);for(const id of ['odin','ares','guardian','operator','spectre','bulldog']){h.gun.userData.selectWeapon(id);assert(h.gun.userData.isWeaponReady());}});
