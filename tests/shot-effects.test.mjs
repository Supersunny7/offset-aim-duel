import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
const code=fs.readFileSync(new URL('../public/shot-effects.mjs',import.meta.url),'utf8')
 .replace("'/vendor/three.module.js'",JSON.stringify(new URL('../node_modules/three/build/three.module.js',import.meta.url).href))
 .replace("'/shared.mjs'",JSON.stringify(new URL('../shared.mjs',import.meta.url).href))
 .replace("'/weapons.mjs'",JSON.stringify(new URL('../weapons.mjs',import.meta.url).href));
const {createShotEffects,resolveShotVisual}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const origin={x:0,y:1.62,z:2},impactEnd={x:0,y:1.62,z:1.6};

test('collapsed near-wall visual trail preserves confirmed contact but cannot invent a wall hit',()=>{
 const scene=new T.Scene(),fx=createShotEffects(scene),start={x:0,y:1.62,z:1.5};
 fx.shot({origin,start,end:start,impactEnd,now:0});
 assert.equal(fx.diagnostics.tracers,0);assert.equal(fx.diagnostics.marks,1);
 assert.deepEqual(fx.diagnostics.lastImpact.normal,[0,0,1]);
 assert.equal(fx.diagnostics.sparks,1);assert.equal(fx.diagnostics.dust,1);
 fx.clear();
 for(const options of [{damage:40},{impactEnd:{x:0,y:1.62,z:1.8}},{map:'ascent'}]){
  fx.shot({origin,start,end:start,impactEnd,now:0,...options});assert.equal(fx.diagnostics.marks,0);
 }
 fx.clear();assert.equal(fx.diagnostics.created,fx.diagnostics.disposed);
});

test('Ghost hides trails from the opponent while retaining local trails and confirmed wall impacts',()=>{
 const scene=new T.Scene(),fx=createShotEffects(scene);
 fx.shot({origin,start:origin,end:impactEnd,weapon:'ghost',local:false,now:0});
 assert.equal(fx.diagnostics.tracers,0);assert.equal(fx.diagnostics.marks,1);fx.clear();
 for(const options of [{weapon:'ghost',local:true},{weapon:'vandal',local:false}]){
  fx.shot({origin,start:origin,end:impactEnd,now:0,...options});assert.equal(fx.diagnostics.tracers,1);fx.clear();
 }
});

test('crater shader fades with lifetime and returns all allocated resources on clear',()=>{
 const scene=new T.Scene(),fx=createShotEffects(scene);
 for(let i=0;i<60;i++)fx.shot({origin,start:origin,end:impactEnd,now:0});
 assert.equal(fx.diagnostics.marks,48);
 const mark=scene.children.find(o=>o.name==='Chipped bullet crater');assert(mark?.material.isShaderMaterial);
 assert.equal(mark.material.depthWrite,false);assert.equal(mark.material.depthTest,true);
 fx.update(5400);assert.equal(mark.material.opacity,.4);assert.equal(mark.material.uniforms.alpha.value,.4);
 fx.update(6000);assert.equal(scene.children.length,0);assert.equal(fx.diagnostics.created,fx.diagnostics.disposed);
 fx.clear();fx.clear();assert.equal(scene.children.length,0);
});


test('delayed confirmation anchors visual trail to rendered muzzle while retaining authoritative endpoint',()=>{
 for(const delayMs of [0,60,90,180]){
  const muzzle={x:5.13*delayMs/1000,y:1.4,z:1.1},endpoint={x:0,y:1.62,z:-10};
  const visual=resolveShotVisual({muzzle,end:endpoint,eye:{x:muzzle.x,y:1.62,z:2},forward:{x:0,y:0,z:-1}});
  assert.deepEqual(visual.start.toArray(),[muzzle.x,muzzle.y,muzzle.z]);assert.deepEqual(visual.end.toArray(),[0,1.62,-10]);assert.equal(visual.drawTracer,true);
 }
});

test('muzzle beyond close endpoint suppresses backward trail without dropping confirmed wall impact',()=>{
 const muzzle={x:0,y:1.62,z:1.5},visual=resolveShotVisual({muzzle,end:impactEnd,eye:origin,forward:{x:0,y:0,z:-1}});
 assert.equal(visual.drawTracer,false);assert.equal(visual.reason,'muzzle past endpoint');
 const scene=new T.Scene(),fx=createShotEffects(scene);fx.shot({start:visual.start,end:visual.end,drawTracer:visual.drawTracer,origin,impactEnd,now:0});
 assert.equal(fx.diagnostics.tracers,0);assert.equal(fx.diagnostics.marks,1);assert.equal(fx.diagnostics.sparks,1);fx.clear();
});

test('turning away or switching weapons suppresses late local trails but preserves their endpoints',()=>{
 for(const options of [{forward:{x:0,y:0,z:1}},{enabled:false}]){
  const result=resolveShotVisual({muzzle:{x:.1,y:1.4,z:1.8},end:impactEnd,eye:origin,forward:{x:0,y:0,z:-1},...options});assert.equal(result.drawTracer,false);assert.deepEqual(result.end.toArray(),[impactEnd.x,impactEnd.y,impactEnd.z]);
 }
});
