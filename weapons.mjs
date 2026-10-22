// The server and HUD share this catalog; damage and cadence are server-owned.
// Equip is the Wiki gameplay gate. visualEquip includes the settling tail.
// Ghost visualReload is the supplied source clip duration; reload remains the Wiki ready gate.
// Phase curves below match visible
// draw / upright / support-hand regrip / settle landmarks in the user video.
export const WEAPONS=Object.freeze({
 vandal:Object.freeze({label:'VANDAL',capacity:25,head:160,body:40,leg:34,interval:1000/9.75,reload:2500,equip:1000,visualEquip:1634,runSpeed:5.4,ads:Object.freeze({interval:1000/8.775,moveSpeed:4.104,zoom:1.25}),range:100,automatic:true}),
 phantom:Object.freeze({label:'PHANTOM',capacity:30,head:156,body:39,leg:33,falloff:20,far:Object.freeze({head:140,body:35,leg:29}),interval:1000/11,reload:2500,visualReload:2916.760878914771,equip:1000,visualEquip:1633.5000155782702,runSpeed:5.4,ads:Object.freeze({interval:1000/9.9,moveSpeed:4.104,zoom:1.25}),range:100,automatic:true,silenced:true}),
 sheriff:Object.freeze({label:'SHERIFF',capacity:6,head:159,body:55,leg:46,falloff:30,far:Object.freeze({head:145,body:50,leg:42}),interval:250,reload:2250,visualReload:2583.4394276749086,equip:1000,visualEquip:1316.872427983539,runSpeed:5.4,range:100,automatic:false}),
 ghost:Object.freeze({label:'GHOST',capacity:13,head:105,body:30,leg:25,falloff:30,far:Object.freeze({head:87,body:25,leg:21}),interval:1000/6.75,reload:1500,visualReload:2516.77558239523,equip:750,visualEquip:1000,runSpeed:5.73,range:100,automatic:false}),
 classic:Object.freeze({visualEquip:983.6065573770492,visualReload:2100.1301499171614,label:"CLASSIC",capacity:12,head:78,body:26,leg:22,damageBands:Object.freeze([Object.freeze({from:0,to:30,head:78,body:26,leg:22}),Object.freeze({from:30,to:50,head:66,body:22,leg:18})]),interval:148.14814814814815,reload:1750.0,equip:750.0,runSpeed:5.73,range:100,automatic:false,secondary:Object.freeze({kind:"shotgun",pellets:3,ammoCost:3,interval:450.45045045045043,automatic:false,range:100})}),
 shorty:Object.freeze({visualEquip:1466.8518787936096,visualReload:2650.103519668737,label:"SHORTY",capacity:2,head:22,body:11,leg:9,damageBands:Object.freeze([Object.freeze({from:0,to:7,head:22,body:11,leg:9}),Object.freeze({from:7,to:15,head:12,body:6,leg:5}),Object.freeze({from:15,to:50,head:6,body:3,leg:2})]),interval:333.3333333333333,reload:1750.0,equip:750.0,runSpeed:5.4,range:50,automatic:false,pellets:15}),
 frenzy:Object.freeze({visualEquip:1316.8724279835392,visualReload:1816.8168896610284,label:"FRENZY",capacity:15,head:78,body:26,leg:22,damageBands:Object.freeze([Object.freeze({from:0,to:20,head:78,body:26,leg:22}),Object.freeze({from:20,to:50,head:63,body:21,leg:17})]),interval:100.0,reload:1500.0,equip:1000.0,runSpeed:5.73,range:100,automatic:true}),
 stinger:Object.freeze({visualEquip:1350.200776322131,visualReload:2483.4436458702935,label:"STINGER",capacity:20,head:67,body:27,leg:22,damageBands:Object.freeze([Object.freeze({from:0,to:15,head:67,body:27,leg:22}),Object.freeze({from:15,to:50,head:57,body:23,leg:19})]),interval:62.5,reload:2250.0,equip:750.0,runSpeed:5.73,range:100,automatic:true,ads:Object.freeze({automatic:false,interval:118.04981702278361,moveSpeed:4.361,zoom:1.15,burst:Object.freeze({count:4,interval:55.55555555555556,cycleMs:472.14353163361665})})}),
 spectre:Object.freeze({visualEquip:1633.5000155782702,visualReload:2483.4436458702935,label:"SPECTRE",capacity:30,head:78,body:26,leg:22,damageBands:Object.freeze([Object.freeze({from:0,to:15,head:78,body:26,leg:22}),Object.freeze({from:15,to:30,head:66,body:22,leg:18}),Object.freeze({from:30,to:50,head:60,body:20,leg:17})]),interval:75.01875468867216,reload:2250.0,equip:750.0,runSpeed:5.73,range:100,automatic:true,silenced:true,ads:Object.freeze({interval:83.33333333333333,moveSpeed:4.361,zoom:1.15})}),
 bucky:Object.freeze({visualEquip:1316.8724279835392,visualReload:2150.1272995096606,label:"BUCKY",capacity:5,head:34,body:17,leg:14,damageBands:Object.freeze([Object.freeze({from:0,to:8,head:34,body:17,leg:14}),Object.freeze({from:8,to:12,head:26,body:13,leg:11}),Object.freeze({from:12,to:50,head:18,body:9,leg:7})]),interval:909.090909090909,reload:2500.0,equip:1000.0,runSpeed:5.06,range:50,automatic:false,pellets:15,secondary:Object.freeze({kind:"airburst",pellets:5,ammoCost:1,interval:909.090909090909,automatic:false,detonationDistance:7.5,range:57.5,canisterDamage:Object.freeze({head:40,body:20,leg:15})}),reloadPerRound:500}),
 judge:Object.freeze({visualEquip:1316.8724279835392,visualReload:2816.764027825516,label:"JUDGE",capacity:5,head:34,body:17,leg:14,damageBands:Object.freeze([Object.freeze({from:0,to:10,head:34,body:17,leg:14}),Object.freeze({from:10,to:15,head:20,body:10,leg:8}),Object.freeze({from:15,to:50,head:14,body:7,leg:5})]),interval:285.7142857142857,reload:2200.0,equip:1000.0,runSpeed:5.06,range:100,automatic:true,pellets:12}),
 bulldog:Object.freeze({visualEquip:1400.1937829225328,visualReload:2983.4254772423483,label:"BULLDOG",capacity:24,head:115,body:35,leg:29,damageBands:Object.freeze([Object.freeze({from:0,to:50,head:115,body:35,leg:29})]),interval:100.0,reload:2500.0,equip:1000.0,runSpeed:5.4,range:100,automatic:true,ads:Object.freeze({automatic:false,interval:158.32805573147562,moveSpeed:4.104,zoom:1.25,burst:Object.freeze({count:3,interval:75.00187504687617,cycleMs:475.05938242280286})})}),
 guardian:Object.freeze({visualEquip:1816.8168896610284,visualReload:3150.0873229491945,label:"GUARDIAN",capacity:12,head:195,body:65,leg:49,damageBands:Object.freeze([Object.freeze({from:0,to:50,head:195,body:65,leg:49})]),interval:190.47619047619048,reload:2500.0,equip:1000.0,runSpeed:5.4,range:100,automatic:false,ads:Object.freeze({interval:190.47619047619048,moveSpeed:4.104,zoom:1.5})}),
 marshal:Object.freeze({visualEquip:2150.1272995096606,visualReload:2316.7847864034743,label:"MARSHAL",capacity:5,head:202,body:101,leg:85,damageBands:Object.freeze([Object.freeze({from:0,to:50,head:202,body:101,leg:85})]),interval:666.6666666666666,reload:2500.0,equip:1250.0,runSpeed:5.4,range:100,automatic:false,reloadPerRound:500,ads:Object.freeze({interval:833.3333333333334,moveSpeed:4.86,zoom:3.5,scope:true})}),
 operator:Object.freeze({visualEquip:2316.7847864034743,visualReload:4483.3948970582815,label:"OPERATOR",capacity:5,head:255,body:150,leg:120,damageBands:Object.freeze([Object.freeze({from:0,to:50,head:255,body:150,leg:120})]),interval:1666.6666666666667,reload:3700.0,equip:1500.0,runSpeed:5.13,range:100,automatic:false,ads:Object.freeze({interval:1666.6666666666667,moveSpeed:3.694,zoom:2.5,scope:true,zoomLevels:Object.freeze([2.5,5])})}),
 ares:Object.freeze({visualEquip:1816.8168896610284,visualReload:4150.066285429142,label:"ARES",capacity:50,head:75,body:30,leg:25,damageBands:Object.freeze([Object.freeze({from:0,to:30,head:75,body:30,leg:25}),Object.freeze({from:30,to:50,head:70,body:28,leg:23})]),interval:76.92307692307692,reload:3250.0,equip:1250.0,runSpeed:5.13,range:100,automatic:true,ads:Object.freeze({interval:76.92307692307692,moveSpeed:3.899,zoom:1.15})}),
 odin:Object.freeze({visualEquip:2816.764027825516,visualReload:5983.379374931961,label:"ODIN",capacity:100,head:95,body:38,leg:32,damageBands:Object.freeze([Object.freeze({from:0,to:30,head:95,body:38,leg:32}),Object.freeze({from:30,to:50,head:77,body:31,leg:26})]),interval:83.33333333333333,reload:5000.0,equip:1250.0,runSpeed:5.13,range:100,automatic:true,ads:Object.freeze({interval:64.1025641025641,moveSpeed:3.899,zoom:1.15}),fireRateRamp:Object.freeze({fromRps:12,toRps:15.6,rampMs:1000,calibration:"linear 1s ramp is engineering; Wiki supplies endpoints only"})}),
 knife:Object.freeze({label:'KNIFE',capacity:-1,body:50,back:100,interval:500,contact:215,animationDuration:1900.143652,reload:0,equip:600,visualEquip:1650.164954,runSpeed:6.75,range:2,automatic:true,secondary:Object.freeze({body:75,back:150,interval:1000,contact:215,animationDuration:2150.127300,range:1.6})})
});
// Refreshed English Wiki tables. Reserve is reference information; this
// unlimited-ammo practice mode deliberately retains its existing reserve rule.
export const WEAPON_WIKI=Object.freeze({
 vandal:Object.freeze({url:'https://valorant.fandom.com/wiki/Vandal',reserve:50,penetration:'Medium',equipFast:600,equipInstant:200,damageTableMaxDistance:50}),
 phantom:Object.freeze({url:'https://valorant.fandom.com/wiki/Phantom',reserve:60,penetration:'Medium',equipFast:600,equipInstant:200,damageTableMaxDistance:50,silenced:true}),
 sheriff:Object.freeze({url:'https://valorant.fandom.com/wiki/Sheriff',reserve:24,penetration:'High',equipFast:600,equipInstant:200,damageTableMaxDistance:50}),
 ghost:Object.freeze({url:'https://valorant.fandom.com/wiki/Ghost',reserve:39,penetration:'Medium',equipFast:450,equipInstant:150,damageTableMaxDistance:50,silenced:true}),
 classic:Object.freeze({url:"https://valorant.fandom.com/wiki/Classic",reserve:36,penetration:"Low",equipFast:450.0,equipInstant:150.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Semi-Automatic"}),
 shorty:Object.freeze({url:"https://valorant.fandom.com/wiki/Shorty",reserve:6,penetration:"Low",equipFast:450.0,equipInstant:150.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Semi",patchSources:Object.freeze(["https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-12-09/"])}),
 frenzy:Object.freeze({url:"https://valorant.fandom.com/wiki/Frenzy",reserve:45,penetration:"Low",equipFast:450.0,equipInstant:150.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Auto"}),
 stinger:Object.freeze({url:"https://valorant.fandom.com/wiki/Stinger",reserve:60,penetration:"Low",equipFast:450.0,equipInstant:150.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Auto"}),
 spectre:Object.freeze({url:"https://valorant.fandom.com/wiki/Spectre",reserve:90,penetration:"Low",equipFast:450.0,equipInstant:150.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Fully automatic",silenced:true}),
 bucky:Object.freeze({url:"https://valorant.fandom.com/wiki/Bucky",reserve:10,penetration:"Low",equipFast:600.0,equipInstant:200.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Semi",patchSources:Object.freeze(["https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-12-09/"])}),
 judge:Object.freeze({url:"https://valorant.fandom.com/wiki/Judge",reserve:15,penetration:"Low",equipFast:600.0,equipInstant:200.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Auto",corrections:Object.freeze(["Wiki infobox7 conflicts with Wiki7.09 history and Riot7.09: use5.","Wiki run1 conflicts with12.09 history and Riot12.09: use2."]),patchSources:Object.freeze(["https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-12-09/","https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-7-09/"])}),
 bulldog:Object.freeze({url:"https://valorant.fandom.com/wiki/Bulldog",reserve:72,penetration:"Medium",equipFast:600.0,equipInstant:200.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Auto"}),
 guardian:Object.freeze({url:"https://valorant.fandom.com/wiki/Guardian",reserve:36,penetration:"High",equipFast:600.0,equipInstant:200.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Semi-automatic"}),
 marshal:Object.freeze({url:"https://valorant.fandom.com/wiki/Marshal",reserve:15,penetration:"Medium",equipFast:600.0,equipInstant:200.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Semi"}),
 operator:Object.freeze({url:"https://valorant.fandom.com/wiki/Operator",reserve:10,penetration:"High",equipFast:900.0,equipInstant:500.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Semi"}),
 ares:Object.freeze({url:"https://valorant.fandom.com/wiki/Ares",reserve:100,penetration:"High",equipFast:750.0,equipInstant:250.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Auto"}),
 odin:Object.freeze({url:"https://valorant.fandom.com/wiki/Odin",reserve:200,penetration:"High",equipFast:750.0,equipInstant:250.0,damageTableMaxDistance:50,verified:"2026-10-14",platform:"PC",fireMode:"Auto"}),
 knife:Object.freeze({url:'https://valorant.fandom.com/wiki/Melee',equipFast:300,equipInstant:0})
});
export const weaponDamageBands=id=>{const w=WEAPONS[id];if(!w||w.capacity<0)return [];if(w.damageBands)return w.damageBands.map(b=>({...b}));return w.far?[{from:0,to:w.falloff,head:w.head,body:w.body,leg:w.leg},{from:w.falloff,to:50,...w.far}]:[{from:0,to:50,head:w.head,body:w.body,leg:w.leg}];};
export const WEAPON_IDS=Object.freeze(Object.keys(WEAPONS));
export const isWeapon=id=>Object.hasOwn(WEAPONS,id);

// Wiki display integers are the damage contract. Knife facing is sampled at
// contact; the rear half-plane and rectangular leg proxy are game approximations.
export function hitDamage(id,part,distance,attack='primary',back=false){
 const w=WEAPONS[id];if(!w||!['head','body','leg'].includes(part))return 0;
 if(id==='knife'){const p=attack==='secondary'?w.secondary:w;return back?p.back:p.body;}
 if(attack==='secondary'&&w.secondary?.kind==='airburst'&&distance<w.secondary.detonationDistance)return w.secondary.canisterDamage[part];
 const measured=attack==='secondary'&&w.secondary?.kind==='airburst'?Math.max(0,distance-w.secondary.detonationDistance):distance;
 if(w.damageBands){const b=w.damageBands.find(b=>measured<=b.to)||w.damageBands.at(-1);return b[part];}
 const p=w.far&&distance>w.falloff?w.far:w;return p[part];
}
export function isBackstab(attacker,target){
 const dx=attacker.x-target.x,dz=attacker.z-target.z;
 return dx*(-Math.sin(target.yaw||0))+dz*(-Math.cos(target.yaw||0))<0;
}
export function applyDamage(target,damage){
 const hp=Math.max(0,target.hp),armor=Math.max(0,target.armor||0);
 const armorDamage=Math.min(armor,damage*.66),healthDamage=Math.min(hp,damage-armorDamage);
 target.armor=Math.max(0,armor-armorDamage);target.hp=Math.max(0,hp-healthDamage);
 return {armorDamage,healthDamage};
}

// [elapsed seconds, source clip phase]. These are visual landmarks measured
// from the supplied recordings, not inferred keypress or fire-ready markers.
const EQUIP_PHASES=Object.freeze({
 ghost:[[0,0],[.1,.088],[.15,.108],[.35,.196],[.4,.2],[.55,.3],[.65,.4],[.733,.539],[.783,.559],[.817,.618],[.867,.667],[1,1]],
 vandal:[[0,0],[.133,.167],[.466,.275],[.6,.35],[.903,.525],[1.1,.617],[1.2,.725],[1.3,.833],[1.634,1]],
 knife:[[0,0],[1.07,1]]
});
function interpolateEquip(weapon,value,inverse){
 const points=EQUIP_PHASES[weapon];if(!points){const duration=(WEAPONS[weapon]?.visualEquip||0)/1000;return duration>0?(inverse?Math.max(0,Math.min(1,value))*duration:Math.max(0,Math.min(1,value/duration))):0;}
 const a=inverse?1:0,b=inverse?0:1;
 if(!Number.isFinite(value)||value<=0)return 0;
 for(let i=1;i<points.length;i++)if(value<=points[i][a]){
  const left=points[i-1],right=points[i],t=(value-left[a])/(right[a]-left[a]);
  return left[b]+(right[b]-left[b])*t;
 }
 return points.at(-1)[b];
}
export const equipClipPhase=(weapon,elapsed)=>interpolateEquip(weapon,elapsed,false);
export const equipElapsedAtPhase=(weapon,phase)=>interpolateEquip(weapon,phase,true);

// Tactical native visual clock. Contact is a source-pose proxy, not an extracted engine notify.
export function knifeClipPhase(attack,elapsed){
 const spec=attack==='secondary'?WEAPONS.knife.secondary:WEAPONS.knife;
 return Math.max(0,Math.min(1,(Number(elapsed)||0)/(spec.animationDuration/1000)));
}

export const weaponShotInterval=(weapon,ads=false)=>{const w=WEAPONS[weapon]||WEAPONS.vandal;return ads&&w.ads?w.ads.interval:w.interval;};
export const weaponRunSpeed=(weapon,ads=false)=>{const w=WEAPONS[weapon]||WEAPONS.vandal;return ads&&w.ads?w.ads.moveSpeed:w.runSpeed;};

// This practice runtime uses unlimited reserves. Reference fast/instant equip and
// penetration do not enable those mechanics. New visual clip durations come from source PSA.
export const weaponReloadDuration=(id,ammo)=>{const w=WEAPONS[id];if(!w)return 0;if(w.reloadPerRound)return Math.max(0,w.capacity-Math.max(0,ammo))*w.reloadPerRound;return w.reload;};
export const weaponAttackSpec=(id,ads=false,attack="primary")=>{const w=WEAPONS[id];if(!w)return null;return attack==="secondary"&&w.secondary?{...w,...w.secondary}:ads&&w.ads?{...w,...w.ads}:w;};
// Alternate Bucky pellets start at the canister detonation point; the intact
// canister is one projectile. Classic secondary pellets leave simultaneously.
export const weaponAirburst=id=>id==='bucky'?Object.freeze({distance:7.5,pellets:5}):null;
