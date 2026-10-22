import test from 'node:test';
import assert from 'node:assert/strict';
import {playerHitboxes,rayHitbox,trace,direction} from '../shared.mjs';

test('head side whitespace and hair no longer register; face remains a headshot',()=>{
 const target={x:7,z:-8,y:0,hp:100,weapon:'vandal'};
 assert.equal(trace({x:7,y:1.62,z:8},direction(0,0),target).part,'head');
 for(const [x,y] of [[7.18,1.62],[7,1.78],[6.82,1.62]])assert.equal(trace({x,y,z:8},direction(0,0),target).part,null);
 assert.equal(trace({x:7.28,y:1.08,z:8},direction(0,0),target).part,null);
});

test('standing leg gap misses while left and right calves remain hittable',()=>{
 const target={x:7,z:-8,y:0,hp:100,weapon:'vandal'};
 assert.equal(trace({x:7,y:.35,z:8},direction(0,0),target).part,null);
 for(const x of [6.8,7.17])assert.equal(trace({x,y:.35,z:8},direction(0,0),target).part,'leg');
});

test('canonical stand/crouch weapon profiles translate and rotate with the actor',()=>{
 for(const weapon of ['vandal','ghost','knife'])for(const crouch of [false,true]){
  const base=playerHitboxes({x:0,z:0,y:0,weapon,crouch});
  const rotated=playerHitboxes({x:4,z:7,y:1,weapon,crouch,yaw:Math.PI/2});
  assert.equal(base.length,rotated.length);
  for(let i=0;i<base.length;i++)for(const point of base[i].kind==='ellipsoid'?['center']:['a','b']){
   const p=base[i][point],q=rotated[i][point];
   assert(Math.abs(q.x-(4+p.z))<1e-12);assert(Math.abs(q.z-(7-p.x))<1e-12);assert(Math.abs(q.y-(1+p.y))<1e-12);
  }
 }
});

test('curved ray intersection handles caps, tangency, parallel, inside and non-unit rays',()=>{
 const capsule={kind:'capsule',a:{x:0,y:0,z:0},b:{x:0,y:1,z:0},radius:.1};
 assert(Math.abs(rayHitbox({x:0,y:2,z:0},{x:0,y:-1,z:0},capsule)-.9)<1e-12);
 assert(Math.abs(rayHitbox({x:1,y:.5,z:0},{x:-2,y:0,z:0},capsule)-.45)<1e-12);
 assert.equal(rayHitbox({x:.11,y:2,z:0},{x:0,y:-1,z:0},capsule),Infinity);
 assert.equal(rayHitbox({x:0,y:.5,z:0},{x:1,y:0,z:0},capsule),0);
 const ellipsoid={kind:'ellipsoid',center:{x:0,y:0,z:0},radii:{x:.1,y:.2,z:.1}};
 assert(Math.abs(rayHitbox({x:0,y:1,z:0},{x:0,y:-1,z:0},ellipsoid)-.8)<1e-12);
 assert.equal(rayHitbox({x:.101,y:1,z:0},{x:0,y:-1,z:0},ellipsoid),Infinity);
});
