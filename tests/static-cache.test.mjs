import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,stat,rm,utimes} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {createStaticDelivery} from '../static-assets.mjs';
await mkdir(new URL('./.artifacts/',import.meta.url),{recursive:true});
const fixture=await mkdtemp(new URL('./.artifacts/static-cache-test-',import.meta.url));
await mkdir(fixture+'/.static-gzip');
const original=Buffer.from('original animation data\n'.repeat(1000));
await writeFile(fixture+'/animation.json',original);const info=await stat(fixture+'/animation.json'),compressed=gzipSync(original);
await writeFile(fixture+'/.static-gzip/asset.gz',compressed);
const entry={size:original.length,mtimeMs:info.mtimeMs,sha256:createHash('sha256').update(original).digest('hex'),gzip:'asset.gz',gzipSize:compressed.length};
await writeFile(fixture+'/.static-gzip/manifest.json',JSON.stringify({'animation.json':entry}));
const deliver=await createStaticDelivery(fixture);
const server=http.createServer((req,res)=>deliver(req,res,'animation.json',{'.json':'application/json'}).catch(()=>res.destroy()));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
after(async()=>{await new Promise(r=>server.close(r));await rm(fixture,{recursive:true});});
function request(headers={},method='GET'){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/',method,headers},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end();});}
test('precompressed animation content is byte-exact and repeat fetch transfers no body',async()=>{
 const r=await request({'accept-encoding':'gzip'});assert.equal(r.status,200);assert.equal(r.headers['x-static-encoding'],'precompressed-gzip');assert.deepEqual(gunzipSync(r.body),original);assert.equal(+r.headers['content-length'],compressed.length);
 const repeat=await request({'accept-encoding':'gzip','if-none-match':r.headers.etag});assert.equal(repeat.status,304);assert.equal(repeat.body.length,0);
 const identity=await request({'accept-encoding':'gzip;q=0'});assert.deepEqual(identity.body,original);assert.equal(identity.headers['content-encoding'],undefined);assert.equal(identity.headers.etag,r.headers.etag);
 const head=await request({'accept-encoding':'gzip'},'HEAD');assert.equal(head.body.length,0);assert.equal(+head.headers['content-length'],compressed.length);
});
test('updated source never serves stale precompressed data and accepts current validators only',async()=>{
 const oldTag=`W/"${entry.sha256}"`,changed=Buffer.from('new original animation, changed length');await writeFile(fixture+'/animation.json',changed);
 const response=await request({'accept-encoding':'gzip','if-none-match':oldTag});assert.equal(response.status,200);assert.equal(response.headers['x-static-encoding'],'dynamic-gzip');assert.notEqual(response.headers.etag,oldTag);assert.deepEqual(gunzipSync(response.body),changed);
});
test('immutable same-build artifacts retain precompression when hosts rewrite archive mtimes',async()=>{
 await writeFile(fixture+'/animation.json',original);
 await utimes(fixture+'/animation.json',new Date(entry.mtimeMs),new Date(entry.mtimeMs+86400000));
 const archivedDelivery=await createStaticDelivery(fixture,{deploymentArtifact:true});
 const archived=http.createServer((req,res)=>archivedDelivery(req,res,'animation.json',{'.json':'application/json'}).catch(()=>res.destroy()));
 await new Promise(r=>archived.listen(0,'127.0.0.1',r));
 try{const response=await fetch(`http://127.0.0.1:${archived.address().port}`);assert.equal(response.headers.get('x-static-encoding'),'precompressed-gzip');assert.deepStrictEqual(Buffer.from(await response.arrayBuffer()),original);}finally{await new Promise(r=>archived.close(r));}
});
