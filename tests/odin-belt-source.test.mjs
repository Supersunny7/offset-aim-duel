import assert from 'node:assert/strict';import test from 'node:test';import fs from 'node:fs';import * as T from 'three';
const read=name=>JSON.parse(fs.readFileSync(new URL('../public/assets/packs/animations/'+name+'.json',import.meta.url)));
const fire=read('odin-fire-source-belt'),mechanical=read('odin-fire-source-delta'),idle=read('odin-idlepose');
test('Odin belt correction preserves original Fire timing and every non-cartridge mechanical channel',()=>{
 assert.equal(fire.sourceSHA256,mechanical.sourceSHA256);assert.equal(fire.frames,mechanical.frames);assert.equal(fire.fps,mechanical.fps);assert.equal(fire.duration,mechanical.duration);
 for(const track of mechanical.tracks.filter(t=>!/^Bullet\d*$/.test(t.bone)))assert.deepEqual(fire.tracks.find(t=>t.bone===track.bone),track);
 assert.equal(fire.beltReferenceEntry,'Animations/Weapon Animations/Odin/GN_Core_HMG_S0_IdleAdd.psa');
});
test('Odin authored feed goes into the receiver and returns near its original held belt',()=>{
 const tracks=fire.tracks.filter(t=>/^Bullet\d*$/.test(t.bone));assert.equal(tracks.length,6);
 for(const track of tracks){
  const reference=idle.tracks.find(t=>t.bone===track.bone),held=new T.Vector3(...reference.positions),start=new T.Vector3(...track.positions),end=new T.Vector3(...track.positions.slice(-3));
  assert(start.x<held.x,'cartridge feeds toward receiver, not outward');assert(end.distanceTo(held)<.003,'source endpoint must join the held belt');
  const angle=new T.Quaternion(...track.quaternions.slice(-4)).normalize().angleTo(new T.Quaternion(...reference.quaternions).normalize());assert(angle<.025,'no doubled held curl at source endpoint');
 }
});
