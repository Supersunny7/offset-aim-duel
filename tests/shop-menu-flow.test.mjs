import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';
const source=fs.readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
const close=source.slice(source.indexOf('async function closeArmory(){'),source.indexOf("$('closeArmory').onclick=closeArmory;"));
function harness({ready=true,menu=false}={}){
 const controls=new Map();const $=id=>{if(!controls.has(id))controls.set(id,{hidden:true,focus(){}});return controls.get(id);};
 let calls=0;const context=vm.createContext({$,releaseGamePointer(){},document:{exitPointerLock(){}},performance:{now:()=>0},setTimeout:fn=>{ready=true;fn();},requestGamePointerLock:async()=>{calls++;throw Error('no lock in test');},gameAudio:{unlock(){}},gun:{userData:{isWeaponReady:()=>ready}},dataReady:()=>ready,mapReady:true,pendingLoadoutRequest:null,pendingLoadoutWeapon:null,armoryReturnToGame:true,armoryResumePending:false,id:'player',resultShown:false,settingsOpen:menu,entryGeneration:2,canvas:{focus(){}},pointerInputMode:'none',dragLook:false,suspended:false,startFallback(){context.dragLook=true;},pauseControls(){throw Error('unexpected pause/settings path');}});
 vm.runInContext(close,context);return{context,$,calls:()=>calls};
}
test('B closes the shop after purchase without opening settings, including cold resource load',async()=>{for(const ready of [true,false]){const h=harness({ready});await h.context.closeArmory();assert.equal(h.$('armory').hidden,true);assert.equal(h.$('overlay').hidden,true);assert.equal(h.context.settingsOpen,false);assert.equal(h.context.armoryResumePending,false);assert.equal(h.context.suspended,false);assert.equal(h.calls(),1);}});
test('a stale shop close cannot undo an explicit Esc cancellation',async()=>{const h=harness({ready:false});h.context.requestGamePointerLock=async()=>{h.context.entryGeneration++;h.context.settingsOpen=true;h.context.armoryResumePending=false;};await h.context.closeArmory();assert.equal(h.context.settingsOpen,true);assert.equal(h.context.armoryResumePending,false);});
test('shop equip uses the visible original clip clock instead of elapsed loading time',()=>{
 const fn=source.slice(source.indexOf('function ownWeaponDeadline('),source.indexOf('const dataReady='));
 const context=vm.createContext({performance:{now:()=>6000},state:{phase:'waiting',now:10000,players:[{id:'p',hp:100,weapon:'phantom',equipUntil:8000}]},id:'p',stateReceivedAt:6000,gun:{userData:{weapon:'phantom',previewWeapon:'phantom',previewStartedAt:5900}},WEAPONS:{phantom:{equip:1000,visualEquip:1000}}});
 vm.runInContext(fn,context);assert.equal(context.ownWeaponDeadline(6000).equipElapsed,.1);context.gun.userData.previewStartedAt=4000;assert.ok(context.ownWeaponDeadline(6000).equipElapsed>1);
});

test('purchase acknowledgement cannot resume the old gun before the authoritative weapon snapshot',async()=>{const h=harness();let waited=0;h.context.pendingLoadoutWeapon='phantom';h.context.gun.userData.weapon='vandal';h.context.setTimeout=fn=>{waited++;h.context.gun.userData.weapon='phantom';h.context.pendingLoadoutWeapon=null;fn();};await h.context.closeArmory();assert.equal(waited,1);assert.equal(h.context.gun.userData.weapon,'phantom');assert.equal(h.context.suspended,false);});

 test('an older B close cannot clear a newer shop transition',async()=>{const h=harness({ready:false});h.context.requestGamePointerLock=async()=>{h.context.entryGeneration++;h.context.armoryResumePending=true;};await h.context.closeArmory();assert.equal(h.context.armoryResumePending,true);});
 test('weapon loads after entering the arena cannot reopen the full-screen entrance',()=>{const fn=source.slice(source.indexOf('function updateLoadingScreen(){'),source.indexOf("if(new URL(location.href).searchParams.has('debug'))",source.indexOf('function updateLoadingScreen(){')));for(const entered of [false,true]){const h=harness({ready:false});Object.assign(h.context,{hasEnteredArena:entered,arenaPreparation:{state:{status:'ready',completed:20,total:20,weaponsReady:18,weaponCount:18}},gun:{userData:{loadingDiagnostics:{states:{arms:'ready',vandal:'ready',ghost:'ready',knife:'ready'}},isWeaponReady:()=>false}},bootLoaded:true,enemyTarget:null,state:{phase:'waiting'},connected:true,autoEntryRequested:false,entryPending:false,pointerUnlockPending:false,joining:false,shopPreview:()=>false,loadingScreen:{hidden:true},suspended:true});for(const id of ['loadingProgress','loadingMessage','loadingDetails','loadingContinue','loadingBack'])h.$(id).style={};vm.runInContext(fn,h.context);h.context.updateLoadingScreen();assert.equal(h.context.loadingScreen.hidden,entered);}});

 test('asset completion after the old 20s limit resumes without pause or Esc',async()=>{
 const h=harness({ready:false});let now=0,waits=0;h.context.performance={now:()=>now};h.context.gun.userData.isWeaponReady=()=>waits>=5;h.context.dataReady=()=>waits>=5;
 h.context.setTimeout=fn=>{now+=5000;waits++;fn();};await h.context.closeArmory();assert.equal(now,25000);assert.equal(h.context.armoryResumePending,false);assert.equal(h.context.suspended,false);assert.equal(h.context.dragLook,true);
 });
 test('resolved pointer-lock request without a surviving lock cannot leave a blank unplayable arena',async()=>{
 const h=harness();h.context.requestGamePointerLock=async()=> 'raw-requested';await h.context.closeArmory();assert.equal(h.context.dragLook,true);assert.equal(h.context.hasEnteredArena,true);assert.equal(h.context.armoryResumePending,false);
 });
 test('a surviving native pointer lock is kept during resource completion',async()=>{
 const h=harness();h.context.document.pointerLockElement=h.context.canvas;h.context.requestGamePointerLock=async()=> 'raw-requested';await h.context.closeArmory();assert.equal(h.context.dragLook,false);assert.equal(h.context.pointerInputMode,'raw-requested');
 });
 test('Esc during a delayed asset wait stays paused after the asset arrives',async()=>{
 const h=harness({ready:false});h.context.setTimeout=fn=>{h.context.entryGeneration++;h.context.settingsOpen=true;h.context.armoryResumePending=false;fn();};await h.context.closeArmory();assert.equal(h.context.settingsOpen,true);assert.equal(h.context.armoryResumePending,false);assert.equal(h.context.hasEnteredArena,undefined);
 });
 test('leaving during preparation cannot resume an obsolete room',async()=>{
 const h=harness({ready:false});h.context.setTimeout=fn=>{h.context.entryGeneration++;h.context.id=null;h.context.armoryResumePending=false;fn();};await h.context.closeArmory();assert.equal(h.context.id,null);assert.equal(h.context.hasEnteredArena,undefined);
 });
 test('already-entered audio retries cannot block weapon controls on Resume',async()=>{
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true});return nodes.get(id);};const canvas={focus(){}},audio=new Promise(()=>{});
 const c=vm.createContext({$,canvas,document:{pointerLockElement:canvas,querySelector:()=>({hidden:true})},entryPending:false,entryGeneration:1,hasEnteredArena:true,settingsOpen:false,suspended:false,enemyTarget:null,gun:{userData:{isWeaponReady:()=>true}},gameAudio:{unlock:()=>audio,diagnostics:{status:'loading'}},refreshPlayButton(){},id:'p',connected:true,dragLook:false,dataReady:()=>true,state:{phase:'waiting',players:[{id:'p',hp:100}]},ownWeaponDeadline:()=>({}),animateWeapon(){c.animated=true;}});
 const a=source.indexOf("$('play').onclick=async()=>{");vm.runInContext(source.slice(a,source.indexOf("document.addEventListener('pointerlockerror'",a)),c);
 let finished=false;c.$('play').onclick().then(()=>finished=true);await new Promise(r=>setImmediate(r));assert.equal(finished,true);assert.equal(c.entryPending,false);assert.equal(c.gun.visible,true);assert.equal(c.animated,true);
 });
