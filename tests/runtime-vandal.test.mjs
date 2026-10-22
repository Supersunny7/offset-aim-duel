import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readGlb,stripReplacedVandalTextures} from '../runtime-vandal.mjs';
const source=readFileSync(new URL('../public/assets/packs/vandal.glb',import.meta.url));
const derived=stripReplacedVandalTextures(source),a=readGlb(source),b=readGlb(derived);
test('download-only Vandal retains every node, skin, animation, mesh and accessor',()=>{
 for(const key of ['nodes','skins','animations','scenes','scene'])assert.deepStrictEqual(b.json[key],a.json[key],key);
 const meshes=structuredClone(a.json.meshes);for(const mesh of meshes)for(const primitive of mesh.primitives)delete primitive.material;
 assert.deepStrictEqual(b.json.meshes,meshes);
 assert.equal(b.json.accessors.length,a.json.accessors.length);
 for(let i=0;i<a.json.accessors.length;i++){
  const x={...a.json.accessors[i]},y={...b.json.accessors[i]},vx=a.json.bufferViews[x.bufferView],vy=b.json.bufferViews[y.bufferView];
  assert.deepStrictEqual(a.bin.subarray(vx.byteOffset||0,(vx.byteOffset||0)+vx.byteLength),b.bin.subarray(vy.byteOffset||0,(vy.byteOffset||0)+vy.byteLength));
  delete x.bufferView;delete y.bufferView;assert.deepStrictEqual(x,y);
 }
 assert.equal(derived.readUInt32LE(8),derived.length);
});
test('only materials replaced by loadVandal and their embedded texture bytes are omitted',()=>{
 assert.equal(b.json.materials,undefined);assert.equal(b.json.images,undefined);
 assert(derived.length<source.length/10);
 const loader=readFileSync(new URL('../public/vandal.mjs',import.meta.url),'utf8');assert(loader.includes('o.material=material'));
});
test('derived Vandal loads as a valid skinned GLB with its original muzzle and magazine bones',async()=>{
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const gltf=await new GLTFLoader().parseAsync(derived.buffer.slice(derived.byteOffset,derived.byteOffset+derived.byteLength),'');
 assert(gltf.scene.getObjectByName('Muzzle'));assert(gltf.scene.getObjectByName('Magazine_Main'));
 let meshes=0;gltf.scene.traverse(o=>{if(o.isSkinnedMesh){meshes++;assert(o.skeleton.bones.length>0);assert(o.geometry.attributes.position.count>0);}});assert(meshes>0);
});
test('production delivery selects the compact derived file, preserving validators and decoded bytes',async()=>{
 process.env.NODE_ENV='production';
 const {server,close}=await import('../server.mjs');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const origin=`http://127.0.0.1:${server.address().port}`,response=await fetch(origin+'/assets/packs/vandal.glb');
  // This test runs in a release checkout after prepare-static-assets.mjs.
  const exists=await import('node:fs').then(fs=>fs.existsSync(new URL('../.static-runtime/vandal.glb',import.meta.url)));
  const body=Buffer.from(await response.arrayBuffer());assert.deepStrictEqual(body,exists?derived:source);
  if(exists)assert.equal(response.headers.get('x-static-encoding'),'precompressed-gzip');
  const cached=await fetch(origin+'/assets/packs/vandal.glb',{headers:{'if-none-match':response.headers.get('etag')}});assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);
 }finally{close();}
});
