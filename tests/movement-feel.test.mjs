import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {stepHorizontalVelocity,stepOpponentDisplay} from '../movement-feel.mjs';
import {move,playerHitboxes,rayBox,rayHitbox} from '../shared.mjs';
import {WEAPONS} from '../weapons.mjs';

test('ground release reduces slide while keeping weapon top speed and airborne control',async()=>{
 const rows=[];
 for(const weapon of ['vandal','ghost','knife']){
  const speed=WEAPONS[weapon].runSpeed;
  const p={x:9,z:5,y:0,yaw:0,vx:0,vz:-speed,vy:0,grounded:true,weapon};
  let slide=0,stop95=0;
  for(let i=1;i<=60;i++){const z=p.z;move(p,{},1/60);slide+=Math.abs(z-p.z);if(!stop95&&Math.abs(p.vz)<speed*.05)stop95=i*1000/60;}
  assert(slide<.04);assert(stop95<=1000/30+.001);assert.equal(p.vz,0);
  const running={vx:0,vz:0,grounded:true};for(let i=0;i<60;i++)stepHorizontalVelocity(running,speed,0,1/60);
  assert(Math.abs(running.vx-speed)<1e-10);
  const air={vx:speed,vz:0,grounded:false};stepHorizontalVelocity(air,0,0,1/60);
  assert(Math.abs(air.vx-speed*Math.exp(-.5))<1e-10);
  rows.push({weapon,slideMetres:slide,stop95ms:stop95});
 }
 const out=new URL('./.artifacts/movement/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('movement-measurements.json',out),JSON.stringify(rows,null,2));
});

test('reversal is responsive and diagonal release does not leave an unpressed-axis tail',()=>{
 const reverse={vx:5.4,vz:0,grounded:true};stepHorizontalVelocity(reverse,-5.4,0,1/60);assert(reverse.vx<0);
 const diagonal={vx:3.8183766184,vz:-3.8183766184,grounded:true};
 for(let i=0;i<4;i++)stepHorizontalVelocity(diagonal,0,-5.4,1/60);
 assert.equal(diagonal.vx,0);assert(Math.abs(diagonal.vz)<=5.4);
});

test('stopped snapshot drives foot movement from display trajectory; paused frame stays fixed',()=>{
 let current={x:0,y:0,z:0};const target={x:.15,y:0,z:0,vx:0,vz:0};
 const first=stepOpponentDisplay(current,target,1/60);assert(first.vx>0);assert.equal(first.vx,(first.x-current.x)*60);
 current=first;for(let i=0;i<60;i++)current=stepOpponentDisplay(current,target,1/60);
 assert(Math.abs(current.x-target.x)<1e-8);assert(Math.abs(current.vx)<1e-6);
 const paused=stepOpponentDisplay(current,{x:5,y:1,z:2},0);assert.equal(paused.x,current.x);assert.equal(paused.vx,0);
});

test('debug bounds enclose authoritative curved shapes for standing, crouched and airborne',()=>{
 for(const [crouch,y] of [[false,0],[true,0],[false,1]]){
  const boxes=playerHitboxes({x:7,z:4,y,crouch});assert.equal(boxes.filter(b=>b.part==='head').length,1);assert.equal(boxes.filter(b=>b.part==='leg').length,6);
  for(const box of boxes){
   const origin={x:(box.min.x+box.max.x)/2,y:(box.min.y+box.max.y)/2,z:8},d={x:0,y:0,z:-1};
   const surface=rayHitbox(origin,d,box);assert(Number.isFinite(surface));assert(surface>=rayBox(origin,d,box.min,box.max)-1e-10);
   assert.equal(rayBox({...origin,x:box.max.x+.001},d,box.min,box.max),Infinity);
  }
 }
});
