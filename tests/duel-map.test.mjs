import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {DUEL_MAP} from '../map-collision.mjs';
import {blocked,move,trace,eyeHeight} from '../shared.mjs';

test('Foundry is rotationally fair and all spawn pairs are safe and initially occluded',()=>{
 for(const b of DUEL_MAP.boxes){assert(DUEL_MAP.boxes.some(q=>q.x===-b.x&&q.z===-b.z&&q.w===b.w&&q.d===b.d&&q.h===b.h));assert(blocked(b.x,b.z,0,1.8,'duel'));}
 for(const p of DUEL_MAP.spawns)assert(!blocked(p.x,p.z,0,1.8,'duel'));
 for(const a of DUEL_MAP.spawns.filter((_,i)=>i%2===0))for(const b of DUEL_MAP.spawns.filter((_,i)=>i%2===1)){
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  assert(trace({x:a.x,y:1.62,z:a.z},{x:dx/length,y:0,z:dz/length},null,'duel').distance<length,'no spawn-to-spawn free shot');
 }
});

test('Foundry walkable space connects both spawns and each inner/outer flank without jumping',()=>{
 const step=.25,key=(x,z)=>`${x},${z}`;const start=[0,44],seen=new Set([key(...start)]),queue=[start];
 for(let n=0;n<queue.length;n++){const [x,z]=queue[n];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=z+dz,k=key(a,b);if(!seen.has(k)&&!blocked(a*step,b*step,0,1.8,'duel')){seen.add(k);queue.push([a,b]);}}}
 for(const [x,z] of [[0,-11],[-3,0],[3,0],[-9,0],[9,0]])assert(seen.has(key(Math.round(x/step),Math.round(z/step))),'all planned routes reachable');
});

test('Foundry movement and hitscan stop at the same baffle; low cover supports landing',()=>{
 const p={map:'duel',weapon:'vandal',x:0,z:11,y:0,yaw:0,hp:100,grounded:true};
 for(let n=0;n<180;n++)move(p,{forward:true},1/60);
 assert(p.z>=7.9+.32-.01,'cannot walk through south baffle');
 assert(Math.abs(trace({x:0,y:1.62,z:11},{x:0,y:0,z:-1},null,'duel').distance-3.1)<1e-9);
 const low={...p,x:5,z:6.5,y:1.3,vy:0,vx:0,vz:0,grounded:false};
 for(let n=0;n<60;n++)move(low,{},1/60);
 assert.equal(low.y,1.05);assert(low.grounded);
 assert(!blocked(5,6.5,1.05,1.8,'duel'));
});

test('actual Foundry rendered cover faces and boundary height match authoritative surfaces within trim allowance',async()=>{
 const code=fs.readFileSync(new URL('../public/duel-arena.mjs',import.meta.url),'utf8').replace("'/vendor/three.module.js'",JSON.stringify(new URL('../node_modules/three/build/three.module.js',import.meta.url).href));
 const {buildDuelArena}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const world=buildDuelArena(new T.Scene(),DUEL_MAP);world.updateMatrixWorld(true);
 const ray=new T.Raycaster();let count=0;
 for(const b of DUEL_MAP.boxes)for(const axis of ['x','z'])for(const sign of [-1,1]){
  const o=new T.Vector3(b.x,b.h*.5,b.z);o[axis]+=sign*((axis==='x'?b.w:b.d)/2+.25);
  const d=new T.Vector3();d[axis]=-sign;ray.set(o,d);const hit=ray.intersectObject(world,true)[0];assert(hit);
  assert(Math.abs(hit.distance-trace(o,d,null,'duel').distance)<=.021,`cover ${b.id} ${axis}/${sign}`);count++;
 }
 for(const [x,z,dx,dz] of [[10.5,0,1,0],[-10.5,0,-1,0],[0,12.5,0,1],[0,-12.5,0,-1]]){
  const o=new T.Vector3(x,4.9,z),d=new T.Vector3(dx,0,dz);ray.set(o,d);assert(Math.abs(ray.intersectObject(world,true)[0].distance-trace(o,d,null,'duel').distance)<1e-6,'float32 instance matrices preserve boundary within 1 micrometre');count++;
 }
 assert.equal(count,40);assert(world.userData.arenaMetrics.architecturalBatches<=10);
});

test('Foundry gun and knife confirmed impacts use new geometry, not legacy boxes',async()=>{
 const code=fs.readFileSync(new URL('../public/shot-effects.mjs',import.meta.url),'utf8')
 .replace("'/vendor/three.module.js'",JSON.stringify(new URL('../node_modules/three/build/three.module.js',import.meta.url).href))
 .replace("'/shared.mjs'",JSON.stringify(new URL('../shared.mjs',import.meta.url).href))
 .replace("'/weapons.mjs'",JSON.stringify(new URL('../weapons.mjs',import.meta.url).href));
 const {trainingImpact,createShotEffects}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const event={map:'duel',origin:{x:0,y:1.62,z:9},end:{x:0,y:1.62,z:7.9},damage:0};
 assert(trainingImpact(event));assert.equal(trainingImpact({...event,map:'training'}),null);
 const fx=createShotEffects(new T.Scene());fx.shot({...event,start:event.origin,weapon:'ghost',now:0});assert.equal(fx.diagnostics.marks,1);
 assert(fx.meleeImpact({...event,weapon:'knife',attack:'primary',id:'a',shotId:1,now:1}));assert.equal(fx.diagnostics.marks,2);fx.clear();assert.equal(fx.diagnostics.created,fx.diagnostics.disposed);
});
