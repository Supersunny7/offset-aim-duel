import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLookInput,createWeaponWheel} from '../public/look-input.mjs';
const fallback={enabled:true,locked:false},locked={enabled:true,locked:true};
const move=(x,y,buttons=0)=>({clientX:x,clientY:y,movementX:999,movementY:-999,buttons});
test('left fire and right ADS do not enable fallback camera look',()=>{
 const input=createLookInput();for(const buttons of [0,1,2,3])assert.equal(input.delta(move(400,300,buttons),fallback),null);
});
test('middle drag uses absolute screen deltas without the stale relative jump',()=>{
 const input=createLookInput();input.begin({button:1,clientX:100,clientY:100});
 assert.deepEqual(input.delta(move(110,80,4),fallback),[10,-20]);
 assert.deepEqual(input.delta(move(115,90,5),fallback),[5,10]);
 input.end({button:0});assert.deepEqual(input.delta(move(116,90,4),fallback),[1,0]);
 input.end({button:1});assert.equal(input.delta(move(900,900),fallback),null);
});
test('outside mouseup is repaired by event buttons and needs a fresh middle press',()=>{
 const input=createLookInput();input.begin({button:1,clientX:100,clientY:100});
 assert.equal(input.delta(move(200,200,1),fallback),null);
 assert.equal(input.delta(move(250,250,4),fallback),null);
});
test('blur pause and pointer cancellation reset drag and discard first lock delta',()=>{
 const input=createLookInput();input.begin({button:1,clientX:100,clientY:100});input.reset();
 assert.equal(input.delta(move(1000,1000,4),fallback),null);
 assert.equal(input.delta(move(1000,1000),locked),null);
 assert.deepEqual(input.delta({movementX:3,movementY:-2},locked),[3,-2]);
 assert.equal(input.delta(move(1,1),{enabled:false,locked:true}),null);
 assert.equal(input.delta(move(2000,2000),locked),null);
});
test('nonfinite relative mouse data never enters camera state',()=>{
 const input=createLookInput();input.delta(move(0,0),locked);
 assert.equal(input.delta({movementX:NaN,movementY:0},locked),null);
});

test('wheel wraps weapons in both directions and tolerates delayed equip snapshots',()=>{
 const wheel=createWeaponWheel(),e=deltaY=>({deltaY,deltaMode:0});
 assert.equal(wheel.next(e(100),'vandal',0),'ghost');
 assert.equal(wheel.next(e(100),'vandal',120),'knife','second notch uses requested equip before snapshot');
 assert.equal(wheel.next(e(100),'knife',240),'vandal');
 assert.equal(wheel.next(e(-100),'vandal',360),'knife');
 wheel.reset();assert.equal(wheel.next(e(-100),'ghost',500),'vandal');
});
test('wheel ignores zoom/nonfinite input, accumulates trackpad and clears paused fragments',()=>{
 const wheel=createWeaponWheel();const e=(deltaY,more={})=>({deltaY,deltaMode:0,...more});
 for(const deltaY of [NaN,Infinity,0])assert.equal(wheel.next(e(deltaY),'vandal',0),null);
 assert.equal(wheel.next(e(100,{ctrlKey:true}),'vandal',0),null);
 for(let t=0;t<3;t++)assert.equal(wheel.next(e(10),'vandal',t*20),null);
 assert.equal(wheel.next(e(10),'vandal',60),'ghost');
 assert.equal(wheel.next(e(500),'vandal',70),null,'one gesture cannot skip entire arsenal');
 wheel.reset();assert.equal(wheel.next(e(10),'vandal',80),null);wheel.reset();
 assert.equal(wheel.next(e(1,{deltaMode:1}),'vandal',100),'ghost');
 assert.equal(wheel.next(e(1,{deltaMode:2}),'ghost',300),'knife');
 assert.equal(wheel.next(e(100),'ghost',1000),'vandal','unacknowledged local equip survives slow snapshots');
 wheel.confirm('vandal');assert.equal(wheel.next(e(100),'vandal',1200),'ghost');
});

test('resize rebases middle drag without treating remapped coordinates as a camera turn',()=>{
 const input=createLookInput();input.begin({button:1,clientX:100,clientY:100});assert.deepEqual(input.delta(move(110,90,4),fallback),[10,-10]);
 input.rebase();assert.equal(input.delta(move(1200,700,4),fallback),null);assert.deepEqual(input.delta(move(1204,697,4),fallback),[4,-3]);assert.equal(input.diagnostics.rebases,1);
});
test('resize discards the first pointer-lock packet and retains subsequent real movement',()=>{
 const input=createLookInput();input.delta(move(0,0),locked);input.rebase();assert.equal(input.delta({movementX:1800,movementY:-900},locked),null);assert.deepEqual(input.delta({movementX:3,movementY:2},locked),[3,2]);
});
