import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Quaternion} from 'three';

const load=name=>JSON.parse(fs.readFileSync(new URL('../public/assets/packs/animations/'+name,import.meta.url)));
for(const weapon of ['ares','odin'])test(weapon+' original Fire deltas preserve the magazine and native muzzle sockets',()=>{
 const index=load(weapon+'-native-index.json'),old=load(index.gn.fire),idle=load(index.gn.idlepose),fire=load(weapon+'-fire-source-delta.json');
 assert.equal(fire.sourceSHA256,old.sourceSHA256);assert.equal(fire.sourceEntry,old.sourceEntry);
 assert.equal(fire.frames,old.frames);assert.equal(fire.fps,old.fps);assert.equal(fire.duration,old.duration);
 for(const track of fire.tracks){assert.equal(track.positions.length,fire.frames*3);assert.equal(track.quaternions.length,fire.frames*4);assert.ok([...track.positions,...track.quaternions].every(Number.isFinite));}
 for(const name of ['Magazine_Main','Muzzle']){
  const t=fire.tracks.find(t=>t.bone===name),rest=idle.tracks.find(t=>t.bone===name);
  for(let frame=0;frame<fire.frames;frame++){
   const distance=Math.hypot(...t.positions.slice(frame*3,frame*3+3).map((v,k)=>v-rest.positions[k]));
   assert.ok(distance<1e-6,name+' must not collapse to the origin while firing');
   const q=new Quaternion().fromArray(t.quaternions,frame*4).normalize(),r=new Quaternion().fromArray(rest.quaternions).normalize();
   assert.ok(q.angleTo(r)<1e-5,name+' must keep its source orientation');
  }
 }
 // The real moving mechanisms must survive conversion, rather than freezing
 // all GN bones to conceal the incorrect absolute-pose interpretation.
 const moving=fire.tracks.some(t=>t.positions.some((v,i)=>Math.abs(v-t.positions[i%3])>1e-5)||t.quaternions.some((v,i)=>Math.abs(v-t.quaternions[i%4])>1e-4));
 assert.equal(moving,true);
});
