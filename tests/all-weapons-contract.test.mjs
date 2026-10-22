import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {WEAPONS,WEAPON_WIKI,weaponDamageBands,hitDamage,applyDamage,weaponShotInterval,weaponRunSpeed,weaponReloadDuration,weaponAttackSpec} from '../weapons.mjs';
import {previewAccuracy,commitAccuracyShot} from '../accuracy.mjs';

test('new armory contains the supplied17 firearms and retains the5 established weapon specifications',()=>{
 // Capture of validated production specifications before the armory expansion.
 const baseline={vandal:'9ed2f5506e0c83a161c485e506d68391eb21872bb3f9ea87dcd4bb7ace6c5d3a',phantom:'ddc4c05bf796b8e4bed83e52891c924e5bc10448da77161eeee1c556e3d58ded',sheriff:'b846237b396d4ce6a563f7c128911b80a985ca7e92b2c84bb1a365b2aacca8f2',ghost:'dc932eae2c0761e76810986cc36399fe3e04e911184b94aded2152556db3fe9f',knife:'1e46848ea0ed72550bfa5aa87e4ae32214a92e430a2a15d7c5bb8b3c1054464a'};
 for(const [id,hash] of Object.entries(baseline))assert.equal(createHash('sha256').update(JSON.stringify(WEAPONS[id])).digest('hex'),hash,id);
 assert.equal(Object.keys(WEAPONS).length,18);
 assert.equal(WEAPONS.outlaw,undefined,'no source model must not expose an invented gun');
 for(const [id,w] of Object.entries(WEAPONS))if(id!=='knife'){
  assert.ok(w.capacity>0&&w.interval>0&&w.reload>0&&w.equip>0,id);
  assert.match(WEAPON_WIKI[id].url,/^https:\/\/valorant\.fandom\.com\/wiki\//);
 }
 assert.equal(WEAPONS.classic.automatic,false);assert.equal(WEAPONS.guardian.automatic,false);
 assert.equal(WEAPONS.spectre.automatic,true);
});

test('range changes distinguish three-band guns instead of applying one far damage everywhere',()=>{
 assert.deepEqual([5,20,40].map(d=>hitDamage('spectre','body',d)),[26,22,20]);
 assert.deepEqual([5,10,30].map(d=>hitDamage('shorty','body',d)),[11,6,3]);
 assert.deepEqual([5,10,30].map(d=>hitDamage('bucky','body',d)),[17,13,9]);
 assert.deepEqual([5,12,30].map(d=>hitDamage('judge','body',d)),[17,10,7]);
 assert.equal(hitDamage('spectre','body',15),26,'existing exact-boundary near-inclusive contract');
 assert.equal(hitDamage('spectre','body',15.001),22);
 assert.equal(weaponDamageBands('shorty').length,3);
 assert.equal(hitDamage('classic','head',40),66);
});

test('fully armored lethality differentiates Guardian, Marshal and Operator',()=>{
 const target=()=>({hp:100,armor:50});
 let p=target();applyDamage(p,hitDamage('guardian','head',40));assert.equal(p.hp,0);
 p=target();applyDamage(p,hitDamage('marshal','body',40));assert.ok(p.hp>0);
 p=target();applyDamage(p,hitDamage('operator','body',40));assert.equal(p.hp,0);
 p=target();for(let i=0;i<4;i++)applyDamage(p,hitDamage('bulldog','body',40));assert.ok(p.hp>0);
 applyDamage(p,hitDamage('bulldog','body',40));assert.equal(p.hp,0);
});

test('alternate shot contracts preserve shotgun counts, airburst range and timed ADS bursts',()=>{
 assert.equal(weaponAttackSpec('classic',false,'secondary').pellets,3);
 assert.equal(weaponAttackSpec('classic',false,'secondary').ammoCost,3);
 assert.equal(WEAPONS.shorty.pellets,15);assert.equal(WEAPONS.judge.pellets,12);
 assert.equal(hitDamage('bucky','body',5,'secondary'),20,'intact canister');
 assert.equal(hitDamage('bucky','body',10,'secondary'),17,'falloff measured from7.5m detonation');
 assert.equal(hitDamage('bucky','body',20,'secondary'),9);
 assert.equal(WEAPONS.stinger.ads.burst.count,4);assert.equal(WEAPONS.bulldog.ads.burst.count,3);
 assert.ok(WEAPONS.stinger.ads.burst.interval<WEAPONS.stinger.ads.interval);
 assert.ok(WEAPONS.stinger.ads.burst.cycleMs>3*WEAPONS.stinger.ads.burst.interval);
 assert.equal(WEAPONS.judge.capacity,5,'explicit Wiki update history and Riot7.09 correction');
});

test('single-round reload and weapon movement/scoped cadence use their distinct gates',()=>{
 assert.equal(weaponReloadDuration('bucky',4),500);assert.equal(weaponReloadDuration('bucky',0),2500);
 assert.equal(weaponReloadDuration('marshal',3),1000);
 assert.equal(weaponReloadDuration('operator',0),3700);
 assert.equal(weaponRunSpeed('operator',true),3.694);
 assert.equal(weaponRunSpeed('shorty'),5.4);
 assert.equal(weaponShotInterval('marshal',true),1000/1.2);
 assert.deepEqual(WEAPONS.operator.ads.zoomLevels,[2.5,5]);
});

test('stationary scoped snipers have zero spread but retain airborne penalties; Ares tightens when firing',()=>{
 const p=id=>({weapon:id,ads:true,grounded:true,vx:0,vz:0});
 for(const id of ['marshal','operator','guardian']){
  const a=p(id);assert.equal(previewAccuracy(a,0).totalDegrees,0);
  a.grounded=false;assert.ok(previewAccuracy(a,0).totalDegrees>0,id);
 }
 const a=p('ares'),before=previewAccuracy(a,0).totalDegrees;
 commitAccuracyShot(a,0);assert.ok(previewAccuracy(a,50).totalDegrees<before);
 const c=p('classic');c.ads=false;
 assert.equal(previewAccuracy(c,0).baseDegrees,.4);
 assert.equal(previewAccuracy(c,0,'secondary').baseDegrees,1.9);
 c.grounded=false;assert.equal(previewAccuracy(c,0,'secondary').movementDegrees,2.25);
});
