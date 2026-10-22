import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestGamePointerLock,createViewTrace} from '../public/look-input.mjs';
test('raw mouse is requested first and unsupported options fall back to regular lock',async()=>{
 const calls=[];assert.equal(await requestGamePointerLock({requestPointerLock:async options=>{calls.push(options);}}),'raw-requested');assert.deepEqual(calls,[{unadjustedMovement:true}]);
 calls.length=0;assert.equal(await requestGamePointerLock({requestPointerLock:async options=>{calls.push(options);if(options)throw Object.assign(Error('raw unavailable'),{name:'NotSupportedError'});}}),'adjusted-fallback');assert.deepEqual(calls,[{unadjustedMovement:true},undefined]);
});
test('security denial is not retried and legacy void-return lock remains compatible',async()=>{
 let calls=0;await assert.rejects(requestGamePointerLock({requestPointerLock(){calls++;throw Object.assign(Error('denied'),{name:'SecurityError'});}}),{name:'SecurityError'});assert.equal(calls,1);
 assert.equal(await requestGamePointerLock({requestPointerLock(){}}),'raw-requested');
});
test('view jump trace distinguishes mouse and network transitions and never clamps a legitimate flick',()=>{
 const reports=[],trace=createViewTrace({onJump:r=>reports.push(r)}),p={yaw:0,pitch:0,x:0,y:0,z:11};trace.record('frame',p,{},0);
 p.yaw=1.2;trace.record('mouse',p,{dx:-600,mode:'locked'},10);assert.equal(p.yaw,1.2);assert.equal(reports.at(-1).jump.kind,'mouse');
 p.x=3;trace.record('network',p,{resetMovement:true,resetAim:false},20);assert.equal(reports.at(-1).jump.kind,'network');assert.equal(reports.at(-1).jump.resetAim,false);
 assert.equal(trace.diagnostics.jumps,2);
});
test('angle wrapping, ordinary movement and bounded history do not manufacture a teleport',()=>{
 const trace=createViewTrace(),p={yaw:Math.PI-.01,pitch:0,x:0,z:0};trace.record('frame',p,{},0);p.yaw=-Math.PI+.01;trace.record('mouse',p,{},1);
 for(let i=0;i<500;i++){p.x+=.05;trace.record('network',p,{},i+2);}assert.equal(trace.diagnostics.jumps,0);assert.equal(trace.diagnostics.recent.length,8);
});
