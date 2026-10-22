import {weaponRunSpeed,weaponShotInterval} from './weapons.mjs';

const freeze=Object.freeze;
// Table magnitudes are Wiki display degrees. Distribution, bloom ramp and the
// interpolation between movement states are this project's calibration model.
export const ACCURACY=freeze({
 vandal:freeze({hip:freeze({first:.25,max:1}),ads:freeze({first:.157,max:1.02}),crouch:.85,movement:freeze({crouch:.8,walk:3,run:6,air:10}),recoveryMs:375,bloomShots:6}),
 phantom:freeze({hip:freeze({first:.2,max:.9}),ads:freeze({first:.11,max:.91}),crouch:.85,movement:freeze({crouch:.8,walk:3,run:6,air:10}),recoveryMs:350,bloomShots:6}),
 sheriff:freeze({hip:freeze({first:.25,max:2.75}),crouch:.75,movement:freeze({crouch:.5,walk:1.2,run:3,air:7}),recoveryMs:500,bloomShots:6}),
 classic:Object.freeze({hip:Object.freeze({first:0.4,max:1.8}),crouch:0.75,movement:Object.freeze({crouch:0.5,walk:1.1,run:2.3,air:7}),recoveryMs:300,bloomShots:6,secondary:Object.freeze({first:1.9,max:5.78,crouch:0.9,movement:Object.freeze({crouch:0,walk:0.6,run:1.5,air:2.25})})}),
 shorty:Object.freeze({hip:Object.freeze({first:4,max:4}),crouch:0.85,movement:Object.freeze({crouch:0.5,walk:1,run:2,air:4}),recoveryMs:650,bloomShots:6}),
 frenzy:Object.freeze({hip:Object.freeze({first:0.65,max:1.7}),crouch:0.85,movement:Object.freeze({crouch:0.5,walk:0.8,run:2,air:7}),recoveryMs:350,bloomShots:6}),
 stinger:Object.freeze({hip:Object.freeze({first:0.65,max:1.5}),crouch:0.85,movement:Object.freeze({crouch:0.15,walk:1,run:2.5,air:10}),recoveryMs:450,bloomShots:6,ads:Object.freeze({first:0.35,max:2.74,crouch:0.75})}),
 spectre:Object.freeze({hip:Object.freeze({first:0.4,max:1.4}),crouch:0.85,movement:Object.freeze({crouch:0.15,walk:1,run:2.5,air:10}),recoveryMs:450,bloomShots:6,ads:Object.freeze({first:0.25,max:1.25,crouch:0.85})}),
 bucky:Object.freeze({hip:Object.freeze({first:3,max:3}),crouch:0.85,movement:Object.freeze({crouch:0.5,walk:1,run:2,air:4}),recoveryMs:1200,bloomShots:6}),
 judge:Object.freeze({hip:Object.freeze({first:2.5,max:4}),crouch:0.85,movement:Object.freeze({crouch:0.5,walk:1,run:2,air:4}),recoveryMs:650,bloomShots:6}),
 bulldog:Object.freeze({hip:Object.freeze({first:0.3,max:1.25}),crouch:0.85,movement:Object.freeze({crouch:0.8,walk:3,run:6,air:10}),recoveryMs:500,bloomShots:6,ads:Object.freeze({first:0.1,max:1.5,crouch:0.75})}),
 guardian:Object.freeze({hip:Object.freeze({first:0.1,max:1.58}),crouch:0.85,movement:Object.freeze({crouch:0.8,walk:3,run:6,air:10}),recoveryMs:500,bloomShots:6,ads:Object.freeze({first:0,max:1.48,crouch:0.85})}),
 marshal:Object.freeze({hip:Object.freeze({first:1,max:1}),crouch:0.9,movement:Object.freeze({crouch:7.5,walk:10,run:15,air:20}),recoveryMs:1100,bloomShots:6,ads:Object.freeze({first:0,max:0,crouch:0.9})}),
 operator:Object.freeze({hip:Object.freeze({first:5,max:5}),crouch:0.9,movement:Object.freeze({crouch:7.5,walk:10,run:15,air:15}),recoveryMs:1950,bloomShots:6,ads:Object.freeze({first:0,max:0,crouch:0.9})}),
 ares:Object.freeze({hip:Object.freeze({first:1,max:0.7}),crouch:0.6,movement:Object.freeze({crouch:0.4,walk:3,run:6.5,air:10}),recoveryMs:450,bloomShots:6,ads:Object.freeze({first:0.9,max:0.55,crouch:0.6}),tightensDuringFire:true}),
 odin:Object.freeze({hip:Object.freeze({first:0.8,max:1.3}),crouch:0.6,movement:Object.freeze({crouch:0.4,walk:3,run:6.5,air:10}),recoveryMs:450,bloomShots:6,ads:Object.freeze({first:0.79,max:1.36,crouch:0.6})}),
 ghost:freeze({hip:freeze({first:.3,max:1.65}),crouch:.75,movement:freeze({crouch:.5,walk:1.1,run:2.3,air:7}),recoveryMs:300,bloomShots:6})
});
export const LANDING_ACCURACY=freeze({degrees:7,durationMs:225});
export const ACCURACY_CALIBRATION=freeze({revision:'wiki-accuracy-1',angleDefinition:'cone half-angle; pending original-game distribution comparison',distribution:'uniform solid-angle cone; engineering choice',movementCurve:'piecewise linear; deadzone 27.5% of current weapon run speed; pending measurement',bloomCurve:'6-shot ramp; cadence hold then linear recovery; engineering choice',vandalRecovery:'375ms historical Wiki reference; full curve not published',ghostRecovery:'300ms retained engineering recovery window; not a Riot constant',phantomRecovery:'350ms historical Wiki patch reference; full curve not published',sheriffRecovery:'500ms engineering recovery window; pending measurement, not a Riot constant'});
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const speed=p=>Math.hypot(p.vx||0,p.vz||0);

export function rememberAccuracyMovement(p,input){
 if(p.crouch)p.accuracyMoveMode='crouch';
 else if(input.forward||input.back||input.left||input.right||p.accuracyMoveMode==='crouch')p.accuracyMoveMode=input.walk?'walk':'run';
 else if(speed(p)<.015)p.accuracyMoveMode='run';
}

export function recordAccuracyLanding(p,wasGrounded,now){
 if(wasGrounded===false&&p.grounded===true){p.landingUntil=now+LANDING_ACCURACY.durationMs;return true;}
 return false;
}

function movementError(p,profile){
 if(p.grounded===false)return {kind:'air',degrees:profile.movement.air,speed:speed(p),deadzoneSpeed:0};
 const run=weaponRunSpeed(p.weapon,p.ads),v=speed(p),deadzone=.275*run;
 const kind=p.crouch?'crouch':p.accuracyMoveMode==='walk'?'walk':'run';
 const target=run*(kind==='crouch'?.6:kind==='walk'?.52:1),cap=profile.movement[kind];
 const low=cap*clamp((v-deadzone)/(target-deadzone));
 // Pressing Shift/Crouch while still running must not instantly grant the
 // slower state's accuracy. Deceleration reaches its lower cap continuously.
 const extra=v>target&&target<run?(profile.movement.run-cap)*clamp((v-target)/(run-target)):0;
 return {kind,degrees:low+extra,speed:v,deadzoneSpeed:deadzone};
}

function bloomLevel(p,now){
 const old=p.accuracyState,profile=ACCURACY[p.weapon];
 if(!old||!profile||old.weapon!==p.weapon)return 0;
 const elapsed=Math.max(0,now-old.at),hold=old.holdMs;
 return clamp(old.level)*clamp((profile.recoveryMs-elapsed)/(profile.recoveryMs-hold));
}

export function previewAccuracy(p,now,attack="primary"){
 const profile=ACCURACY[p.weapon];
 if(!profile)return {weapon:p.weapon,mode:'melee',baseDegrees:0,bloomDegrees:0,movementDegrees:0,landingDegrees:0,totalDegrees:0,bloomLevel:0,movementMode:'none',revision:ACCURACY_CALIBRATION.revision};
 const mode=attack==='secondary'&&profile.secondary?'secondary':p.ads&&profile.ads?'ads':'hip',values=profile[mode],crouch=p.crouch?(values.crouch??profile.crouch):1,level=bloomLevel(p,now),movement=movementError(p,values.movement?{...profile,movement:values.movement}:profile);
 const base=values.first*crouch,bloom=(values.max-values.first)*crouch*level;
 const landing=p.grounded!==false&&now<(p.landingUntil||0)?LANDING_ACCURACY.degrees:0;
 return {weapon:p.weapon,mode,baseDegrees:base,bloomDegrees:bloom,movementDegrees:movement.degrees,landingDegrees:landing,totalDegrees:base+bloom+movement.degrees+landing,bloomLevel:level,movementMode:movement.kind,speed:movement.speed,deadzoneSpeed:movement.deadzoneSpeed,landingRemainingMs:Math.max(0,(p.landingUntil||0)-now),recoveryMs:profile.recoveryMs,revision:ACCURACY_CALIBRATION.revision};
}

export function commitAccuracyShot(p,now,attack="primary"){
 const result=previewAccuracy(p,now,attack),profile=ACCURACY[p.weapon];
 if(profile)p.accuracyState={weapon:p.weapon,at:now,holdMs:weaponShotInterval(p.weapon,p.ads),level:clamp(result.bloomLevel+1/profile.bloomShots)};
 return result;
}

export function shotRandom(seed){
 let state=seed>>>0;
 return ()=>{state=(state+0x6D2B79F5)|0;let t=Math.imul(state^(state>>>15),state|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}

export function sampleSpreadDirection(yaw,pitch,degrees,random){
 const radius=clamp(degrees,0,89)*Math.PI/180,c=1-random()*(1-Math.cos(radius)),s=Math.sqrt(Math.max(0,1-c*c)),phi=random()*Math.PI*2;
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),a=s*Math.cos(phi),b=s*Math.sin(phi);
 return {x:-sy*cp*c+cy*a+sy*sp*b,y:sp*c+cp*b,z:-cy*cp*c-sy*a+cy*sp*b};
}
