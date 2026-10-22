import {WEAPONS} from '../weapons.mjs';
const firearm=weapon=>WEAPONS[weapon]?.capacity>0;
/** Prediction-aware attack audio plus separately deduplicated impact/kill layers. */
export function planConfirmedGunSound(message,{own=false,predicted=false,predictedAudioPlayed=false,audible=true}={}) {
  const weapon=message.weapon||'vandal';
  if(message.type!=='shot'||!firearm(weapon)||!audible)return null;
  // A predicted animation does not prove WebAudio actually played a gunshot.
  if(own&&predicted&&predictedAudioPlayed)return null;
  return {event:'fire',weapon,eventId:message.shotId!=null?`fire:${message.id}:${message.shotId}`:null};
}

export function planCombatFeedback(message, ownId) {
  const own=ownId!=null&&message.id===ownId,weapon=message.weapon||'vandal';
  // Knife wind-up and contact share a serial, so include event type.
  const eventId=message.shotId!=null?`${message.type||'shot'}:${message.id}:${message.shotId}`:null;
  // All firearm hits, including lethal headshots, use the selected impact.
  // The gunshot is a separate, prediction-aware layer; blade feedback stays separate.
  const sound=own&&message.damage>0?(firearm(weapon)?(message.armorDamage>0?'shield-hit':'body-hit'):'knife-hit'):null;
  const volume=1.25;
  const sounds=sound?[{sound,eventId,volume}]:[];
  // The kill banner is additional to impact, never a replacement for the attack.
  // Its own identity avoids the WebAudio hit de-duplicator swallowing this layer.
  if(sound&&message.killed)sounds.push({sound:'kill',eventId:eventId?eventId+':kill':null,volume:1});
  return {own,weapon,eventId,sound,volume,sounds};
}

export function createCombatFeedbackPlanner({limit=512}={}) {
  const seen=new Set();
  return {
    plan(message,ownId){
      const result=planCombatFeedback(message,ownId);
      if(result.eventId&&seen.has(result.eventId))return null;
      if(result.eventId){seen.add(result.eventId);if(seen.size>limit)seen.delete(seen.values().next().value);}
      return result;
    },
    clear(){seen.clear();}
  };
}
