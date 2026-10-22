import {WEAPONS,equipElapsedAtPhase} from '../weapons.mjs';
/** Source seconds measured from the supplied reload recordings; phase from native FP hand motion.
 * Motion peaks are engineering synchronization cues, not authored contact-event metadata. */
export const WEAPON_AUDIO_TIMING=Object.freeze({
 phantom:{equipDuration:WEAPONS.phantom.visualEquip/1000,reloadDuration:WEAPONS.phantom.visualReload/1000,equip:[{phase:.5115/(WEAPONS.phantom.visualEquip/1000),offset:2.10,duration:.25,peak:.055,label:'original GN Bolt return / reload recording clack'}],reload:[
  {phase:.3149/(WEAPONS.phantom.visualReload/1000),offset:.005,duration:.45,peak:.025,label:'original magazine exit'},
  {phase:1.3755/(WEAPONS.phantom.visualReload/1000),offset:1.36,duration:.22,peak:.08,label:'original magazine return'},
  {phase:1.8893/(WEAPONS.phantom.visualReload/1000),offset:1.69,duration:.22,peak:.105,label:'original charging handle pull'},
  {phase:2.1213/(WEAPONS.phantom.visualReload/1000),offset:2.10,duration:.25,peak:.055,label:'original bolt return'}]},
 sheriff:{equipDuration:WEAPONS.sheriff.visualEquip/1000,reloadDuration:WEAPONS.sheriff.visualReload/1000,equip:[{phase:38/80,offset:.005,duration:.18,peak:.025,label:'original GN Hammer return / reload recording clack'}],reload:[
  {phase:.3478/(WEAPONS.sheriff.visualReload/1000),offset:.005,duration:.33,peak:.025,label:'original cylinder opening'},
  {phase:.95/(WEAPONS.sheriff.visualReload/1000),offset:.82,duration:.25,peak:.12,label:'cartridge handling / estimated contact'},
  {phase:1.6561/(WEAPONS.sheriff.visualReload/1000),offset:3.02,duration:.28,peak:.135,label:'original cylinder closing'}]},
 vandal:{equipDuration:WEAPONS.vandal.visualEquip/1000,reloadDuration:WEAPONS.vandal.reload/1000,equip:[{phase:.455,offset:1.40,duration:.16,peak:.06,label:'draw clack'}],reload:[
  {phase:.04,offset:.015,duration:.35,peak:.060,label:'magazine release'},
  {phase:.222,offset:.65,duration:.43,peak:.085,label:'magazine handling'},
  {phase:.46,offset:1.38,duration:.20,peak:.085,label:'magazine seating'},
  {phase:.676,offset:1.63,duration:.31,peak:.050,label:'bolt clack'}]},
 // GN Equip Slide returns to its actual bind at frame26/83. The same
 // provided reload recording has its 5ms RMS clack peak at1.330s, so this
 // short slice aligns that peak to the mechanical return, not late idle.
 ghost:{equipDuration:WEAPONS.ghost.visualEquip/1000,reloadDuration:WEAPONS.ghost.visualReload/1000,equip:[{phase:26/83,offset:1.24,duration:.16,peak:.09,label:'draw slide return'}],reload:[
  {phase:.191,offset:.11,duration:.34,peak:.010,label:'magazine release'},
  {phase:.31579,offset:.73,duration:.18,peak:.08,label:'magazine seating'},
  {phase:75/152,offset:1.24,duration:.16,peak:.09,label:'slide return (approximate contact)'}]}
});

/** Returns non-overlapping source slices. No timers, context, pitch shift, or asset mutation.
 * Durations/remaining are seconds. Late entry trims consumed sound rather than replaying it. */
export function planWeaponAudio(event,weapon,options={}){
 const config=WEAPON_AUDIO_TIMING[weapon];if(!config||!['equip','reload'].includes(event))return null;
 const requested=options.actionDuration??options.actualDuration;
 const duration=Number.isFinite(requested)&&requested>0?requested:config[event+'Duration'];
 const remaining=event==='reload'?options.reloadRemaining:options.equipRemaining;
 // Ghost preserves native source-time visuals after its mechanical ready deadline.
 const readyDuration=event==='reload'&&['ghost','phantom','sheriff'].includes(weapon)&&duration>WEAPONS[weapon].reload/1000+.001?WEAPONS[weapon].reload/1000:duration;
 const elapsed=Number.isFinite(remaining)?Math.max(0,readyDuration-Math.max(0,remaining)):0;
 const parts=config[event].map(p=>({...p,at:Math.max(0,(event==='equip'?equipElapsedAtPhase(weapon,p.phase)*duration/config.equipDuration:p.phase*duration)-p.peak)})).sort((a,b)=>a.at-b.at);
 return parts.map((p,i)=>{
  const end=Math.min(duration,parts[i+1]?.at??duration,p.at+p.duration);
  const consumed=Math.max(0,elapsed-p.at),length=end-p.at-consumed;
  return {label:p.label,at:Math.max(0,p.at-elapsed),offset:p.offset+consumed,duration:Math.max(0,length),fade:Math.min(.008,Math.max(0,length)/3),source:weapon+'.reload'};
 }).filter(p=>p.duration>.002);
}
