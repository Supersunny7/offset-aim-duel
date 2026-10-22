import {stat,readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import {resolve,extname} from 'node:path';
const compressible=new Set(['.html','.css','.js','.mjs','.json','.glb','.fbx']);
export async function createStaticDelivery(root){
 let manifest={};try{manifest=JSON.parse(await readFile(resolve(root,'.static-gzip/manifest.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 return async function deliver(req,res,file,mime){
  const path=resolve(root,file),info=await stat(path),entry=manifest[file.replaceAll('\\','/')];
  const fresh=entry&&entry.size===info.size&&Math.abs(entry.mtimeMs-info.mtimeMs)<1;
  // Weak ETags describe decoded content, consistently across gzip and identity.
  const etag=`W/"${fresh?entry.sha256:`${info.size}-${info.mtimeMs}`}"`;
  const acceptsGzip=(req.headers['accept-encoding']||'').split(',').some(s=>/^gzip(?:\s*;|\s*$)/i.test(s.trim())&&!/;\s*q=0(?:\.0*)?(?:\s*;|\s*$)/i.test(s));
  const zip=acceptsGzip&&compressible.has(extname(file));let precompressed=false,zippedPath;
  if(zip&&fresh){zippedPath=resolve(root,'.static-gzip',entry.gzip);try{precompressed=(await stat(zippedPath)).size===entry.gzipSize;}catch(e){if(e.code!=='ENOENT')throw e;}}
  const headers={'Content-Type':mime[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=0, must-revalidate','Vary':'Accept-Encoding','ETag':etag,'X-Static-Encoding':precompressed?'precompressed-gzip':zip?'dynamic-gzip':'identity'};
  if((req.headers['if-none-match']||'').split(',').some(tag=>tag.trim()==='*'||tag.trim().replace(/^W\//,'')===etag.replace(/^W\//,''))){res.writeHead(304,headers);res.end();return;}
  if(zip)headers['Content-Encoding']='gzip';
  if(precompressed||!zip)headers['Content-Length']=String(precompressed?entry.gzipSize:info.size);
  res.writeHead(200,headers);if(req.method==='HEAD'){res.end();return;}
  const stream=createReadStream(precompressed?zippedPath:path);
  await pipeline(...(zip&&!precompressed?[stream,createGzip(),res]:[stream,res]));
 };
}
