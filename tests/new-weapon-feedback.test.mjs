import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {planWeaponAudio} from '../public/weapon-audio-timing.mjs';
import {WEAPONS} from '../weapons.mjs';

const source=fs.readFileSync(new URL('../public/weapon-feel.mjs',import.meta.url),'utf8')
 .replace("'/vendor/three.module.js'",JSON.stringify(new URL('../node_modules/three/build/three.module.js',import.meta.url).href))
 .replace("'/weapons.mjs'",JSON.stringify(new URL('../weapons.mjs',import.meta.url).href));
const {createAimRecoil}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

function simulate(weapon,fps){
 const recoil=createAimRecoil();let pitch=0,now=0;
 for(let shot=0;shot<WEAPONS[weapon].capacity;shot++){
  const at=shot*WEAPONS[weapon].interval;recoil.shot(at,weapon);
  while(now<(shot+1)*WEAPONS[weapon].interval){pitch+=recoil.consume(now);now+=1000/fps;}
 }
 const finish=now+1000;pitch+=recoil.consume(finish);const released=pitch;
 for(let at=finish;at<finish+2000;at+=1000/fps)pitch+=recoil.consume(at);
 assert.equal(pitch,released,'release and empty magazine must not move aim back');
 assert.equal(recoil.consume(finish-100),0,'stale RAF cannot reverse consumed aim');
 recoil.reset();pitch+=recoil.consume(finish+2100);
 assert.equal(pitch,released,'reload/equip reset only clears feedback state');
 return pitch;
}
test('new gun recoil keeps actual aim after empty/release at low and high FPS',()=>{
 for(const w of ['phantom','sheriff']){
  const reference=simulate(w,240);assert(reference>0&&reference<.08,'bounded vertical aim lift');
  for(const fps of [20,60,120])assert(Math.abs(simulate(w,fps)-reference)<1e-9,'frame rate changes aim lift');
 }
});
test('existing Vandal recoil and no Ghost/knife camera lift are preserved',()=>{
 assert(Math.abs(simulate('vandal',60)-.075)<1e-8);
 for(const w of ['ghost','knife']){const r=createAimRecoil();for(let n=0;n<20;n++){r.shot(n*100,w);assert.equal(r.consume(n*100+99),0);}}
});
test('new burst retains previous aim and allows deliberate mouse correction',()=>{
 for(const w of ['phantom','sheriff']){
  const r=createAimRecoil();r.shot(0,w);r.shot(100,w);let pitch=r.consume(1000),old=pitch;
  r.shot(2000,w);pitch+=r.consume(3000);assert(pitch>=old,'new burst must not snap aim down');
  const correction=pitch;pitch-=correction;pitch+=r.consume(3100);assert(Math.abs(pitch)<1e-12,'mouse can return aim without feedback pulling it away');
 }
});
test('Sheriff equip audio peak coincides with original GN hammer settling frame',()=>{
 const gn=JSON.parse(fs.readFileSync(new URL('../public/assets/packs/animations/sheriff-equip.json',import.meta.url)));
 const expected=38/gn.fps,plan=planWeaponAudio('equip','sheriff');
 assert(Math.abs(plan[0].at+.025-expected)<1e-9,'sound peak must use source seconds');
 assert(expected<.658436214,'late half-duration cue removed');
});
test('new-gun late equip/reload entry trims elapsed source audio and does not replay past contacts',()=>{
 for(const w of ['phantom','sheriff'])for(const event of ['equip','reload']){
  const sourceDuration=WEAPONS[w][event==='equip'?'visualEquip':'visualReload']/1000;
  const gate=WEAPONS[w][event]/1000;
  const full=planWeaponAudio(event,w,{actualDuration:sourceDuration});
  const elapsed=event==='equip'?.8:1.8;
  const late=planWeaponAudio(event,w,{actualDuration:sourceDuration,[event+'Remaining']:(event==='equip'?sourceDuration:gate)-elapsed});
  for(const p of late){const original=full.find(f=>f.label===p.label);assert(original);assert(original.at+original.duration>elapsed);assert(Math.abs(p.at-Math.max(0,original.at-elapsed))<1e-9);assert(p.offset>=original.offset);}
  assert(late.every(p=>p.at>=0&&p.duration>0));
  if(event==='equip')assert.equal(planWeaponAudio(event,w,{actualDuration:sourceDuration,equipRemaining:0}).length,0);
 }
});
