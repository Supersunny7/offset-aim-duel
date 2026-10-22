import {test} from 'node:test';import assert from 'node:assert/strict';
import {ADS_VIEW_PROFILES as P,scopeViewmodelOpacity,applyScopeViewmodelOpacity} from '../public/ads-view-profile.mjs';
test('saved-video profiles distinguish Guardian frame and Marshal optic; Operator is not mislabelled measured',()=>{
 assert.ok(P.guardian.frameHeightVh>19&&P.guardian.frameHeightVh<21);assert.ok(P.phantom.frameHeightVh>15&&P.phantom.frameHeightVh<17);assert.ok(P.marshal.scopeRadiusVh>50);assert.equal(P.operator.provisional,true);for(const id of ['guardian','phantom']){assert.ok(Math.abs(P[id].viewPitch)<.25);assert.ok(P[id].referenceSeconds>0);}assert.ok(P.guardian.viewOffsetY<0&&P.phantom.viewOffsetY<0);
});
test('scope transition hides smoothly and restores original hip material flags exactly',()=>{
 const material={opacity:.8,transparent:false,depthWrite:true},root={traverse(fn){fn({isMesh:true,material});}};
 for(const amount of [0,.4,.65])assert.equal(scopeViewmodelOpacity(amount,true),1);
 const middle=scopeViewmodelOpacity(.825,true);assert.ok(Math.abs(middle-.5)<1e-12);applyScopeViewmodelOpacity(root,middle);assert.ok(Math.abs(material.opacity-.4)<1e-12);assert.equal(material.transparent,true);assert.equal(material.depthWrite,true);
 applyScopeViewmodelOpacity(root,scopeViewmodelOpacity(1,true));assert.equal(material.opacity,0);applyScopeViewmodelOpacity(root,scopeViewmodelOpacity(0,false));assert.equal(material.opacity,.8);assert.equal(material.transparent,false);assert.equal(material.depthWrite,true);
 assert.equal(scopeViewmodelOpacity(1,false),1);
});

test('Operator world zoom never scales the first-person model and projection restores on failure',async()=>{
 const {renderScopedViewmodel,createADS,adsFov}=await import('../public/ads.mjs');const ads=createADS(),state={weapon:'operator',alive:true,playing:true,phase:'waiting'};ads.update(0,state);ads.toggle(state);ads.update(.25,state);
 const camera={fov:adsFov(74,ads.amount,ads.zoom),updateProjectionMatrix(){this.projectionFov=this.fov;}};camera.updateProjectionMatrix();
 for(const zoom of [2.5,5]){camera.fov=adsFov(74,1,zoom);camera.updateProjectionMatrix();const original=camera.fov;renderScopedViewmodel(camera,true,()=>assert.equal(camera.fov,74));assert.equal(camera.fov,original);assert.equal(camera.projectionFov,original);assert.throws(()=>renderScopedViewmodel(camera,true,()=>{throw Error('render');}));assert.equal(camera.fov,original);}
 camera.fov=74;renderScopedViewmodel(camera,false,()=>assert.equal(camera.fov,74));assert.equal(camera.fov,74);
});

test('actual perspective matrices give Operator 2x world change between scopes without 2x gun growth',async()=>{
 const {PerspectiveCamera,Vector3}=await import('three');const {renderScopedViewmodel,adsFov}=await import('../public/ads.mjs');
 const camera=new PerspectiveCamera(74,16/9,.05,100);camera.updateMatrixWorld(true);const world=[],gun=[];
 for(const zoom of [2.5,5]){camera.fov=adsFov(74,1,zoom);camera.updateProjectionMatrix();world.push(new Vector3(1,0,-10).project(camera).x);gun.push(renderScopedViewmodel(camera,true,()=>new Vector3(.1,-.1,-.5).project(camera).x));assert.equal(camera.fov,adsFov(74,1,zoom));}
 assert.ok(Math.abs(world[1]/world[0]-2)<1e-12);assert.ok(Math.abs(gun[1]-gun[0])<1e-12);
});

test('six rifle and SMG ADS fits retain separate frame sizes; Stinger uses the explicit receiver fit',()=>{for(const id of ['stinger','bulldog','guardian','phantom','ares','odin']){assert.ok(P[id].viewOffsetY<0);assert.ok(Math.abs(P[id].viewPitch)<.25);assert.equal(P[id].provisional,true);assert.ok(P[id].referenceSeconds>0);}assert.equal(P.stinger.frameWidthVh,17.69);assert.equal(P.bulldog.topFraction,.6241);assert.equal(P.ares.topFraction,.565);assert.equal(P.odin.provisional,true);});
