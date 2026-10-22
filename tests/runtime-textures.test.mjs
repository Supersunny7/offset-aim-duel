import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync,gzipSync,gunzipSync} from 'node:zlib';
import http from 'node:http';
import {readGlb} from '../runtime-vandal.mjs';
import {pngChunks,optimizePng,RUNTIME_TEXTURE_MODELS} from '../runtime-textures.mjs';
const root=new URL('../',import.meta.url),read=name=>readFileSync(new URL(name,root));
const view=(bin,v)=>bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
let checkedImages=0;
for(const id of RUNTIME_TEXTURE_MODELS)test(id+' preserves every non-image byte, material and original filtered pixel byte',()=>{
 const original=read('public/assets/packs/'+id+'.glb'),runtime=read('.static-runtime/'+id+'.glb'),a=readGlb(original),b=readGlb(runtime);
 assert(runtime.length<=original.length);assert(gzipSync(runtime).length<gzipSync(original).length);
 for(const key of Object.keys(a.json).filter(k=>!['buffers','bufferViews'].includes(k)))assert.deepEqual(b.json[key],a.json[key],id+' '+key);
 assert.equal(b.json.bufferViews.length,a.json.bufferViews.length);
 const imageViews=new Set(a.json.images.map(i=>i.bufferView));
 for(const [i,old]of a.json.bufferViews.entries()){
  const next=b.json.bufferViews[i],x={...old},y={...next};delete x.byteOffset;delete y.byteOffset;
  if(imageViews.has(i)){
   delete x.byteLength;delete y.byteLength;
   const source=pngChunks(view(a.bin,old)),output=pngChunks(view(b.bin,next));
   const nonImage=chunks=>chunks.filter(c=>c.type!=='IDAT').map(c=>({type:c.type,data:c.data}));assert.deepEqual(nonImage(source),nonImage(output),'all PNG colour/profile/header metadata');
   const raw=chunks=>inflateSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data)));assert.deepEqual(raw(source),raw(output),'entire filtered RGB/RGBA scanlines');checkedImages++;
  }else assert.deepEqual(view(a.bin,old),view(b.bin,next),'geometry/animation view '+i);
  assert.deepEqual(x,y,'view metadata '+i);
 }
});
test('invalid PNG checksum fails closed rather than producing a changed texture',()=>{
 const{json,bin}=readGlb(read('public/assets/packs/odin.glb')),source=Buffer.from(view(bin,json.bufferViews[json.images[0].bufferView]));source[30]^=1;assert.throws(()=>optimizePng(source),/checksum/);
 assert(checkedImages>80);
});
test('public original URL serves derived model, gzip validators and zero-byte 304',async()=>{
 process.env.NODE_ENV='production';const {server,close}=await import('../server.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const fetchRaw=(id,etag)=>new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port:server.address().port,path:'/assets/packs/'+id+'.glb',headers:{'accept-encoding':'gzip',...(etag?{'if-none-match':etag}:{})}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on('error',reject));
 try{for(const id of ['ghost','odin','operator']){const r=await fetchRaw(id);assert.equal(r.status,200);assert.equal(r.headers['x-static-encoding'],'precompressed-gzip');assert.deepEqual(gunzipSync(r.body),read('.static-runtime/'+id+'.glb'));const again=await fetchRaw(id,r.headers.etag);assert.equal(again.status,304);assert.equal(again.body.length,0);}}finally{await close();}
});
