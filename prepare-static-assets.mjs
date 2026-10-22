// Build-time work only: never make the free runtime recompress large models.
import {readdir,mkdir,stat,writeFile} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import {resolve,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url)),out=resolve(root,'.static-gzip');
const compressible=new Set(['.html','.css','.js','.mjs','.json','.glb','.fbx']);
const files=[];
async function scan(folder){for(const e of await readdir(folder,{withFileTypes:true})){const path=resolve(folder,e.name);if(e.isDirectory())await scan(path);else if(compressible.has(extname(path)))files.push(path);}}
await mkdir(out,{recursive:true});await scan(resolve(root,'public'));
for(const name of await readdir(root))if(name.endsWith('.mjs')&&!/^hitbox-.*(?:data|additions)\.mjs$/.test(name))files.push(resolve(root,name));
for(const file of ['build/three.module.min.js','build/three.core.min.js',...['loaders/FBXLoader.js','loaders/GLTFLoader.js','utils/BufferGeometryUtils.js','libs/fflate.module.js','curves/NURBSCurve.js','curves/NURBSUtils.js'].map(f=>'examples/jsm/'+f)])files.push(resolve(root,'node_modules/three',file));
const manifest={};let index=0,originalBytes=0,gzipBytes=0;
async function worker(){while(index<files.length){const file=files[index++],key=relative(root,file).replaceAll('\\','/'),info=await stat(file),digest=createHash('sha256');
 const name=createHash('sha256').update(key).digest('hex')+'.gz';
 await pipeline(createReadStream(file),new Transform({transform(chunk,encoding,cb){digest.update(chunk);cb(null,chunk);}}),createGzip({level:6}),createWriteStream(resolve(out,name)));
 const zipped=await stat(resolve(out,name));manifest[key]={size:info.size,mtimeMs:info.mtimeMs,sha256:digest.digest('hex'),gzip:name,gzipSize:zipped.size};originalBytes+=info.size;gzipBytes+=zipped.size;
}}
await Promise.all([worker(),worker()]);
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest));
console.log(JSON.stringify({staticAssets:Object.keys(manifest).length,originalBytes,gzipBytes,phase:'build-only'}));
