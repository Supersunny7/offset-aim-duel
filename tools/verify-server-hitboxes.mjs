import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('server-data/manifest.json',root)));
for(const [name,entry] of Object.entries(manifest)){
 const hash=file=>createHash('sha256').update(readFileSync(new URL(file,root))).digest('hex');
 assert.equal(hash(entry.source),entry.sourceSha256,`Rebuild stale ${name} data`);
 assert.equal(hash(`server-data/${name}.json`),entry.sha256);
 // Each source import gets its own process so validation does not inflate runtime memory.
 const check=`import assert from 'node:assert/strict';import fs from 'node:fs';const original=await import(${JSON.stringify(new URL(entry.source,root).href)});const data=JSON.parse(fs.readFileSync(new URL(${JSON.stringify(new URL(`server-data/${name}.json`,root).href)})));for(const key of ${JSON.stringify(entry.exports)})assert.deepStrictEqual(data[key],original[key]);console.log(${JSON.stringify(name+' exact equality passed')});`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',check],{encoding:'utf8',maxBuffer:4096});
 if(result.status!==0)throw Error(result.stderr||`Failed ${name}`);
 process.stdout.write(result.stdout);
}
