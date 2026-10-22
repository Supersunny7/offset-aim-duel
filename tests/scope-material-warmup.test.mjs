import test from 'node:test';
import assert from 'node:assert/strict';
import {warmScopeMaterialVariant,applyScopeViewmodelOpacity} from '../public/ads.mjs';
import {warmArenaGraphics,withCanvasWarmup} from '../public/arena-preparation.mjs';
import {PerspectiveCamera} from 'three';
test('shared and nested material variants restore exact original flags without cloning or posing',()=>{
 const opaque={opacity:.9,transparent:false,depthWrite:true},glass={opacity:.4,transparent:true,depthWrite:false};
 const root={traverse:fn=>fn({isMesh:true,material:[opaque,glass]})};
 for(const fail of [false,true]){
  const draw=()=>{assert.equal(opaque.transparent,true);assert.equal(opaque.opacity,.45);assert.equal(glass.opacity,.2);if(fail)throw Error('draw failed');return 7;};
  if(fail)assert.throws(()=>warmScopeMaterialVariant([root,root],draw),/draw failed/);else assert.equal(warmScopeMaterialVariant([root,root],draw),7);
  assert.deepEqual([opaque.opacity,opaque.transparent,opaque.depthWrite,glass.opacity,glass.transparent,glass.depthWrite],[.9,false,true,.4,true,false]);
 }
 applyScopeViewmodelOpacity(root,.5);applyScopeViewmodelOpacity(root,1);assert.equal(opaque.opacity,.9);assert.equal(opaque.transparent,false);assert.equal(glass.opacity,.4);
});
test('canvas pipeline draw is limited to one pixel and restores scissor on failure',()=>{
 for(const fail of [false,true]){
  let rect={x:12,y:7,z:800,w:600},enabled=false;
  const renderer={getScissor:target=>target.copy(rect),getScissorTest:()=>enabled,setScissor:(x,y,z,w)=>rect={x,y,z,w},setScissorTest:v=>enabled=v};
  const draw=()=>{assert.deepEqual(rect,{x:0,y:0,z:1,w:1});assert.equal(enabled,true);if(fail)throw Error('draw');};
  if(fail)assert.throws(()=>withCanvasWarmup(renderer,draw),/draw/);else withCanvasWarmup(renderer,draw);
  assert.deepEqual(rect,{x:12,y:7,z:800,w:600});assert.equal(enabled,false);
 }
});
test('buffer warm draw uses world/FP passes then restores renderer state',async()=>{
 const camera=new PerspectiveCamera(),node={visible:false,frustumCulled:true,isMesh:true},scene={traverse:fn=>fn(node)},target={texture:{colorSpace:'none'},dispose(){this.disposed=true;}},passes=[];
 let selected='original';const renderer={outputColorSpace:'srgb',autoClear:false,shadowMap:{autoUpdate:true},compileAsync:async()=>{},getRenderTarget:()=>selected,setRenderTarget:t=>selected=t,clearDepth(){},render:(s,c)=>{assert.equal(target.texture.colorSpace,'srgb');passes.push([c.layers.mask,renderer.autoClear,renderer.shadowMap.autoUpdate]);}};
 await warmArenaGraphics(renderer,scene,camera,{createRenderTarget:()=>target,scopeVariant:draw=>draw()});
 assert.deepEqual(passes,[[1,true,true],[2,false,false]]);assert.equal(camera.layers.mask,1);assert.equal(renderer.autoClear,false);assert.equal(renderer.shadowMap.autoUpdate,true);assert.equal(node.visible,false);assert.equal(node.frustumCulled,true);assert.equal(selected,'original');assert(target.disposed);
});
test('opaque and fading FP programs compile with the restored canvas target',async()=>{
 const material={opacity:1,transparent:false,depthWrite:true},mesh={visible:false,frustumCulled:true,isMesh:true,material},scene={traverse:fn=>fn(mesh)},camera=new PerspectiveCamera(),compiles=[];
 let selected=null;const renderer={autoClear:true,outputColorSpace:'srgb',shadowMap:{autoUpdate:true},getRenderTarget:()=>selected,setRenderTarget:t=>selected=t,clearDepth(){},render(){},compileAsync:async(s,c)=>compiles.push({canvas:selected===null,alpha:material.opacity,mask:c.layers.mask})};
 await warmArenaGraphics(renderer,scene,camera,{createRenderTarget:()=>({texture:{},dispose(){}}),scopeVariant:draw=>warmScopeMaterialVariant([scene],draw)});
 assert.deepEqual(compiles,[{canvas:true,alpha:1,mask:1},{canvas:true,alpha:1,mask:2},{canvas:true,alpha:.5,mask:2},{canvas:true,alpha:1,mask:2}]);assert.equal(material.opacity,1);assert.equal(material.transparent,false);assert.equal(mesh.visible,false);
});
