import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameProfile} from '../public/frame-profile.mjs';
const row=(overrides={})=>({active:true,at:100,intervalMs:16.7,updateMs:2,worldMs:1,viewmodelMs:1,cpuMs:4,weapon:'operator',ads:0,scoped:true,programs:8,...overrides});
test('monitor histories stay bounded during a long session',()=>{
 const p=createFrameProfile({memory:()=>null});p.record(row());for(let i=0;i<5000;i++)p.record(row({intervalMs:60,ads:i%2}));const s=p.snapshot();assert.equal(s.totalFrames,5000);assert.equal(s.windowFrames,600);assert.equal(s.hitches.length,16);assert.equal(s.scopes.length,8);
});
test('raw intervals retain a bounded window and are not smoothed',()=>{
 const p=createFrameProfile({capacity:3,memory:()=>null});p.record(row());
 for(const ms of [12,20,90,16])p.record(row({intervalMs:ms}));
 const s=p.snapshot();assert.equal(s.totalFrames,4);assert.equal(s.windowFrames,3);assert.equal(s.p50Ms,20);assert.equal(s.p95Ms,90);assert.equal(s.maxMs,90);assert.equal(s.last.intervalMs,16);assert.equal(s.hitches.length,1);
});
test('inactive/hidden gaps do not become synthetic gameplay hitches',()=>{
 const p=createFrameProfile({memory:()=>null});p.record(row());p.record(row());p.record(row({active:false,intervalMs:2000}));p.record(row({intervalMs:3000}));p.record(row());
 assert.equal(p.snapshot().totalFrames,2);assert.equal(p.snapshot().hitches.length,0);
});
test('scope window identifies CPU submission phase and new programs',()=>{
 const p=createFrameProfile({memory:()=>null});p.record(row());p.record(row({ads:.1}));p.record(row({ads:.8,intervalMs:80,viewmodelMs:60,cpuMs:63,programs:11}));
 const s=p.snapshot();assert.equal(s.scopes.length,1);assert.equal(s.scopes[0].startPrograms,8);assert.equal(s.scopes[0].maxPrograms,11);assert.equal(s.scopes[0].maxViewmodelMs,60);assert.equal(s.scopes[0].maxIntervalMs,80);
});
test('heap availability and units remain explicit; snapshot is immutable across future records',()=>{
 let now=0;const p=createFrameProfile({clock:()=>now,memory:()=>({usedJSHeapSize:1048576,totalJSHeapSize:2097152,jsHeapSizeLimit:4194304})});p.record(row());p.record(row({ads:.1}));const first=p.snapshot();assert.equal(first.heap.usedMiB,1);assert.equal(first.actualVramBytes,null);
 p.record(row({ads:.8,programs:12}));assert.equal(first.scopes[0].maxPrograms,8);now=501;assert.equal(p.snapshot().scopes[0].maxPrograms,12);
 const unavailable=createFrameProfile({memory:()=>{throw Error('not supported');}});assert.equal(unavailable.snapshot().heap,null);
});
