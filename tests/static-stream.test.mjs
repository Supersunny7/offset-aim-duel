import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {server,close} from '../server.mjs';
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
after(close);
const digest=b=>createHash('sha256').update(b).digest('hex');
function raw(path,encoding){return new Promise((resolve,reject)=>{
 http.get(origin+path,{headers:{'accept-encoding':encoding}},res=>{
  const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));res.on('error',reject);
 }).on('error',reject);
});}
test('parallel gzip and plain streaming preserve exact model bytes',async()=>{
 const expected=digest(await readFile(new URL('../public/assets/packs/odin.glb',import.meta.url)));
 const results=await Promise.all(['gzip','identity','gzip','identity'].map(x=>raw('/assets/packs/odin.glb',x)));
 for(const r of results){assert.equal(r.status,200);assert.equal(digest(r.headers['content-encoding']==='gzip'?gunzipSync(r.body):r.body),expected);}
});
test('aborted model download does not break subsequent health or static requests',async()=>{
 await new Promise((resolve,reject)=>{const req=http.get(origin+'/assets/packs/ascent-b.glb',res=>res.once('data',()=>{req.destroy();resolve();}));req.on('error',e=>e.code==='ECONNRESET'?resolve():reject(e));});
 const health=await fetch(origin+'/health');assert.equal((await health.json()).ok,true);
 assert.equal((await raw('/app.mjs','gzip')).status,200);
 assert.equal((await raw('/server-data/combat.json','identity')).status,404);
});
