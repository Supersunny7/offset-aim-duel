import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACCURACY,commitAccuracyShot,previewAccuracy,recordAccuracyLanding,rememberAccuracyMovement,sampleSpreadDirection,shotRandom} from '../accuracy.mjs';
import {move,direction} from '../shared.mjs';
import {weaponShotInterval,weaponRunSpeed} from '../weapons.mjs';
import {createMovementPrediction,FIXED_DT,normalMove} from '../movement-net.mjs';
const actor=(weapon='vandal',extra={})=>({weapon,x:-8,z:10,y:0,yaw:0,pitch:0,vx:0,vz:0,grounded:true,crouch:false,ads:false,...extra});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} vs ${b}`);

test('independent first shots, ADS and crouch; movement is additive and airborne never becomes grounded accuracy',()=>{
 for(const [weapon,ads,crouch,expected] of [['vandal',false,false,.25],['vandal',true,false,.157],['vandal',false,true,.2125],['vandal',true,true,.13345],['ghost',false,false,.3],['ghost',false,true,.225]])near(previewAccuracy(actor(weapon,{ads,crouch}),1000).baseDegrees,expected);
 for(const weapon of ['vandal','ghost'])for(const kind of ['run','walk','crouch']){
  const p=actor(weapon,{accuracyMoveMode:kind,crouch:kind==='crouch'}),run=weaponRunSpeed(weapon),target=run*(kind==='walk'?.52:kind==='crouch'?.6:1);p.vx=target;
  const a=previewAccuracy(p,1000);near(a.movementDegrees,ACCURACY[weapon].movement[kind]);near(a.totalDegrees,a.baseDegrees+a.movementDegrees);
  p.vx=run*.275;near(previewAccuracy(p,1000).movementDegrees,0);
  p.grounded=false;p.vx=0;near(previewAccuracy(p,1000).movementDegrees,ACCURACY[weapon].movement.air);
 }
 near(previewAccuracy(actor('knife',{grounded:false,landingUntil:5000}),1000).totalDegrees,0);
});

test('accuracy changes continuously with actual speed; run-to-stop does not accidentally switch to walk and Shift does not grant instant full accuracy',()=>{
 const p=actor('vandal',{vx:5.4,accuracyMoveMode:'run'});rememberAccuracyMovement(p,{});assert.equal(p.accuracyMoveMode,'run');
 const errors=[5.4,4,2,1.485,0].map(v=>previewAccuracy({...p,vx:v},1000).movementDegrees);assert(errors.every((e,i)=>!i||e<=errors[i-1]));near(errors.at(-1),0);
 rememberAccuracyMovement(p,{forward:true,walk:true});near(previewAccuracy(p,1000).movementDegrees,6);
 p.vx=5.4*.52;near(previewAccuracy(p,1000).movementDegrees,3);
 p.crouch=true;assert(previewAccuracy(p,1000).movementDegrees<.8);p.vx=5.4*.6;near(previewAccuracy(p,1000).movementDegrees,.8);
});

test('landing adds 7 degrees until exactly 225ms, does not trigger at initial spawn, refreshes on another landing and is independent of weapon equip',()=>{
 const p=actor();assert.equal(recordAccuracyLanding(p,true,1000),false);assert.equal(p.landingUntil,undefined);
 assert.equal(recordAccuracyLanding(p,false,1000),true);assert.equal(p.landingUntil,1225);
 for(const t of [1000,1100,1224,1224.999])near(previewAccuracy(p,t).landingDegrees,7);
 for(const t of [1225,1226])near(previewAccuracy(p,t).landingDegrees,0);
 p.weapon='ghost';near(previewAccuracy(p,1100).landingDegrees,7);p.grounded=false;near(previewAccuracy(p,1100).landingDegrees,0);
 p.grounded=true;recordAccuracyLanding(p,false,1200);assert.equal(p.landingUntil,1425);
});

test('capped per-weapon bloom carries through ADS/crouch changes, gradually recovers and resets fully after the declared window',()=>{
 for(const weapon of ['vandal','ghost']){
  const p=actor(weapon),interval=weaponShotInterval(weapon);let a;
  for(let n=0;n<30;n++)a=commitAccuracyShot(p,1000+n*interval);
  near(a.baseDegrees+a.bloomDegrees,ACCURACY[weapon].hip.max);
  const last=p.accuracyState.at,mid=last+(interval+ACCURACY[weapon].recoveryMs)/2;
  assert(previewAccuracy(p,mid).bloomDegrees>0);assert(previewAccuracy(p,mid).bloomDegrees<a.bloomDegrees);
  near(previewAccuracy(p,last+ACCURACY[weapon].recoveryMs).bloomDegrees,0);
  if(weapon==='vandal'){p.ads=true;near(previewAccuracy(p,last).baseDegrees+previewAccuracy(p,last).bloomDegrees,1.02);}
  p.crouch=true;const v=previewAccuracy(p,last);near(v.baseDegrees+v.bloomDegrees,ACCURACY[weapon][p.ads?'ads':'hip'].max*ACCURACY[weapon].crouch);
  p.weapon='knife';near(previewAccuracy(p,last).totalDegrees,0);
 }
});

test('seeded direction samples stay normalized and inside the declared cone at any pitch, with no fixed left/right bias',()=>{
 for(const pitch of [-1.45,0,.5,1.45]){
  const center=direction(.73,pitch),random=shotRandom(123456),r=7*Math.PI/180;let mean={x:0,y:0,z:0};
  for(let n=0;n<12000;n++){const d=sampleSpreadDirection(.73,pitch,7,random);near(Math.hypot(d.x,d.y,d.z),1);assert(d.x*center.x+d.y*center.y+d.z*center.z>=Math.cos(r)-1e-12);for(const k of ['x','y','z'])mean[k]+=d[k]/12000;}
  const projected=mean.x*Math.cos(.73)-mean.z*Math.sin(.73);assert(Math.abs(projected)<.001);
 }
 const a=sampleSpreadDirection(0,.123,.25,shotRandom(42)),b=sampleSpreadDirection(0,.123,.25,shotRandom(42));assert.deepEqual(a,b);
 const c=sampleSpreadDirection(.5,.9,0,shotRandom(42));for(const k of ['x','y','z'])near(c[k],direction(.5,.9)[k]);
});

test('queued movement prediction replays the same accuracy movement mode and clients cannot supply accuracy state or spread seeds',()=>{
 const p=actor(),base={...p,spawnEpoch:1,moveAck:0,hp:100},prediction=createMovementPrediction(p);prediction.reconcile(base);
 prediction.advance(FIXED_DT*5,{right:true,walk:true},0);const before={x:p.x,vx:p.vx,mode:p.accuracyMoveMode};prediction.reconcile(base);near(p.x,before.x);near(p.vx,before.vx);assert.equal(p.accuracyMoveMode,before.mode);
 const command=normalMove({n:1,yaw:0,walk:true,landingUntil:999999,accuracyState:{level:0},randomSeed:1,accuracyMoveMode:'walk'});
 for(const k of ['landingUntil','accuracyState','randomSeed','accuracyMoveMode'])assert(!(k in command));
 const q=actor();for(let n=0;n<10;n++)move(q,{right:true},FIXED_DT);rememberAccuracyMovement(q,{});assert.equal(q.accuracyMoveMode,'run');
});
