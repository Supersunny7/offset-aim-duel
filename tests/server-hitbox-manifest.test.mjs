import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('server animation tables match their original source revisions',()=>{
 const root=new URL('../',import.meta.url),manifest=JSON.parse(readFileSync(new URL('server-data/manifest.json',root)));
 const hash=path=>createHash('sha256').update(readFileSync(new URL(path,root))).digest('hex');
 for(const [name,entry] of Object.entries(manifest)){
  assert.equal(hash(entry.source),entry.sourceSha256,`Run tools/build-server-hitboxes.py after editing ${entry.source}`);
  assert.equal(hash(`server-data/${name}.json`),entry.sha256);
 }
});
