import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';
const source=fs.readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
test('Esc toggles settings once per press; keyup and held repeat cannot reopen it',()=>{
 const handlers=[],nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,onclick:()=>{c.resume++;}});return nodes.get(id);};
 const c=vm.createContext({$,document:{querySelector:()=>$('settingsFields'),addEventListener:(type,fn)=>handlers.push([type,fn])},id:'p',resultShown:false,settingsOpen:false,resume:0,openSettings(){c.settingsOpen=true;}});
 const start=source.indexOf('let escapeDownHandled=false;');vm.runInContext(source.slice(start,source.indexOf("$('loadingContinue').onclick",start)),c);
 const press=repeat=>handlers.find(([type])=>type==='keydown')[1]({code:'Escape',repeat,preventDefault(){},stopImmediatePropagation(){}}),up=()=>handlers.find(([type])=>type==='keyup')[1]({code:'Escape'});
 press(false);up();assert.equal(c.settingsOpen,true);press(true);up();assert.equal(c.settingsOpen,true);press(false);up();assert.equal(c.settingsOpen,false);assert.equal(c.resume,1);
});
test('shop movement keys are tracked and released while weapon combat shortcuts remain blocked',()=>{
 const handlers=[];const c=vm.createContext({document:{addEventListener:(type,fn)=>handlers.push([type,fn])},$:()=>({hidden:false}),movementKeys:new Set(['KeyW','KeyA','KeyS','KeyD','Space','KeyC','ShiftLeft','ControlLeft']),canMove:()=>true,keys:{},sendInput(){c.sent++;},sent:0});
 const start=source.indexOf("document.addEventListener('keydown',e=>{if(!$('armory').hidden)");vm.runInContext(source.slice(start,source.indexOf('function sendInput(',start)),c);
 const down=code=>handlers.find(([type])=>type==='keydown')[1]({code,repeat:false,target:{matches:()=>false},preventDefault(){}});
 down('KeyW');assert.equal(c.keys.KeyW,true);assert.equal(c.sent,1);down('KeyR');assert.equal(c.keys.KeyR,undefined);handlers.find(([type])=>type==='keyup')[1]({code:'KeyW'});assert.equal(c.keys.KeyW,false);
});
test('opening/closing shop preserves held movement but clears held fire; settings reset clears both',()=>{
 const c=vm.createContext({movementKeys:new Set(['KeyW']),keys:{KeyW:true,KeyF:true},weaponWheel:{reset(){}},resetAimRecoil(){},flash:{userData:{effects:{clear(){}}}},aimRecoil:0,kick:0,pendingEjections:[],fire:true,secondaryFire:true,rightMouse:true,middleMouse:true,lookInput:{reset(){}},ads:{reset(){}}});
 vm.runInContext(source.slice(source.indexOf('function resetControls('),source.indexOf('function pauseControls(')),c);c.resetControls({keepMovement:true});assert.equal(c.keys.KeyW,true);assert.equal(c.keys.KeyF,undefined);assert.equal(c.fire,false);c.resetControls();assert.equal(c.keys.KeyW,undefined);
});
