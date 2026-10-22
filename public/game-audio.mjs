import {planWeaponAudio} from '/weapon-audio-timing.mjs';
import {WEAPONS} from '/weapons.mjs';
/** Selected, decoded recordings. Call unlock() directly from the play button gesture. */
export function createGameAudio({volume=.65}={}) {
  let context=null,master=null,manifest=null,loading=null,muted=false;
  let listener={x:0,y:0,z:0,yaw:0};
  const buffers=new Map(),pending=new Map(),voices=new Set(),confirmedFeedback=new Set(),confirmedGunfire=new Set();
  const voiceKeys=new WeakMap(),voiceStarts=new WeakMap();
  const diagnostics={volume,muted:false,status:'locked',contextState:'none',loaded:0,expected:0,bytes:0,played:0,lastEvent:null,events:{},skipped:0,errors:[],unsupported:[],active:0};
  diagnostics.remappedEvents={'vandal.equip':'vandal.reload','ghost.equip':'ghost.reload'};
  diagnostics.feedback=[];diagnostics.cancelledPendingAttacks=0;diagnostics.rejectedFeedback=0;
  const fail=(event,error)=>{const item={event,message:String(error?.message||error)};diagnostics.errors.push(item);if(diagnostics.errors.length>20)diagnostics.errors.shift();};
  const applyVolume=()=>{if(master)master.gain.setTargetAtTime(muted?0:volume,context.currentTime,.012);};
  const load=id=>{
    if(buffers.has(id))return Promise.resolve(buffers.get(id));
    if(pending.has(id))return pending.get(id);
    const asset=manifest?.assets.find(a=>a.id===id);
    if(!asset)return Promise.resolve(null);
    const task=(async()=>{
      try{
        const response=await fetch(asset.url);if(!response.ok)throw new Error('HTTP '+response.status);
        const encoded=await response.arrayBuffer();diagnostics.bytes+=encoded.byteLength;
        const decoded=await context.decodeAudioData(encoded);
        if(!decoded.duration||!decoded.numberOfChannels)throw new Error('Empty decoded recording');
        buffers.set(id,decoded);diagnostics.loaded=buffers.size;return decoded;
      }catch(error){fail(id,error);return null;}finally{pending.delete(id);}
    })();pending.set(id,task);return task;
  };
  async function unlock(){
    try{
      if(!context){
        const AudioClass=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!AudioClass)throw new Error('Web Audio unavailable');
        context=new AudioClass();master=context.createGain();master.gain.value=muted?0:volume;master.connect(context.destination);
        context.onstatechange=()=>diagnostics.contextState=context.state;
      }
      // resume precedes fetch/await, preserving the original trusted user gesture.
      await context.resume();diagnostics.contextState=context.state;
      if(['partial','failed'].includes(diagnostics.status))loading=null;
      if(!loading)loading=(async()=>{
        diagnostics.status='loading';
        try{
          const response=await fetch('/assets/audio/manifest.json');if(!response.ok)throw new Error('Audio manifest HTTP '+response.status);
          manifest=await response.json();diagnostics.expected=manifest.assets.length;diagnostics.unsupported=[...(manifest.unavailable||[])].filter(key=>!Object.hasOwn(diagnostics.remappedEvents,key));
          await Promise.all(manifest.assets.map(asset=>load(asset.id)));
          diagnostics.status=diagnostics.loaded===diagnostics.expected?'ready':'partial';return diagnostics;
        }catch(error){fail('manifest',error);diagnostics.status='failed';return diagnostics;}
      })();
      return await loading;
    }catch(error){fail('unlock',error);diagnostics.status='failed';return diagnostics;}
  }
  function resolveEvent(event,{weapon,variant}={}){
    if(event==='equip'&&WEAPONS[weapon]?.capacity>0)return weapon+'.reload';
    if(event==='melee'||event==='fire'&&weapon==='knife')return variant==='heavy'||variant==='secondary'?'knife.heavy':'knife.light';
    if(['fire','reload','equip','light','heavy','hit'].includes(event)&&weapon)return weapon+'.'+event;
    return event;
  }
  function play(event,options={}){
    if(!context||context.state!=='running'||!manifest){diagnostics.skipped++;return false;}
    const key=resolveEvent(event,options),variants=manifest.events[key];
    // Reject cross-family routing at the playback boundary, even if a caller
    // accidentally chooses the wrong confirmation event. Never fall back to a blade for a gun.
    const gunImpact=['body-hit','shield-hit'].includes(key),bladeImpact=['knife-hit','knife-wall'].includes(key);
    if(options.weapon&&(gunImpact&&!(WEAPONS[options.weapon]?.capacity>0)||bladeImpact&&options.weapon!=='knife')){
      diagnostics.skipped++;diagnostics.rejectedFeedback++;return false;
    }
    // Optional server-event identity prevents replay of hit confirmations. Gunfire
    // remains independent, including prediction and authoritative acknowledgement.
    const feedbackId=['kill','headshot','body-hit','shield-hit','knife-hit','knife-wall'].includes(key)&&options.eventId!=null?String(options.eventId):null;
    if(feedbackId&&confirmedFeedback.has(feedbackId)){diagnostics.skipped++;return false;}
    const fireId=key.endsWith('.fire')&&options.eventId!=null?String(options.eventId):null;
    if(fireId&&confirmedGunfire.has(fireId)){diagnostics.skipped++;return false;}
    if(!variants?.length){diagnostics.skipped++;if(!diagnostics.unsupported.includes(key))diagnostics.unsupported.push(key);return false;}
    const index=Number.isInteger(options.variant)?Math.max(0,Math.min(variants.length-1,options.variant-(key==='kill'?1:0))):0;
    let assetId=variants[index],buffer=buffers.get(assetId);
    if(!buffer){assetId=manifest.fallbackEvents?.[key]?.[0];buffer=buffers.get(assetId);}
    if(!buffer){diagnostics.skipped++;return false;}
    try{
      if(key.endsWith('.reload'))for(const voice of voices)if(voiceKeys.get(voice)===key)try{voice.stop();}catch{}
      // Distance follows world units (metres); local UI/kill feedback is unpositioned.
      const p=options.position;
      const px=Array.isArray(p)?p[0]:p?.x,py=Array.isArray(p)?p[1]:p?.y,pz=Array.isArray(p)?p[2]:p?.z;
      const dx=(px??listener.x)-listener.x,dy=(py??listener.y)-listener.y,dz=(pz??listener.z)-listener.z;
      const distance=Math.max(0,options.distance??(p?Math.hypot(dx,dy,dz):0));
      if(distance>70){diagnostics.skipped++;return false;}
      const planned=planWeaponAudio(event,options.weapon,options);
      const melee=key==='knife.light'||key==='knife.heavy';
      const contact=(key==='knife.heavy'?WEAPONS.knife.secondary.contact:WEAPONS.knife.contact)/1000,peak=key==='knife.heavy'?.080:.040;
      const segments=planned??[{at:melee?Math.max(0,contact-peak):0,offset:0,duration:buffer.duration,fade:0,label:melee?'native blade contact (estimated)':event}];
      const start=context.currentTime;
      diagnostics.scheduled=[];
      for(const segment of segments){
      const duration=Math.min(segment.duration,buffer.duration-segment.offset);if(duration<=0)continue;
      const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;
      const level=Math.max(0,Math.min(2,options.volume??1))/(1+(distance/12)**2),when=start+segment.at;
      gain.gain.setValueAtTime(level,when);
      if(segment.fade){gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(level,when+Math.min(.003,segment.fade));gain.gain.setValueAtTime(level,when+duration-segment.fade);gain.gain.linearRampToValueAtTime(0,when+duration);}
      source.connect(gain);
      let panner=null;
      if(p&&context.createStereoPanner){panner=context.createStereoPanner();const lateral=dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw);panner.pan.value=Math.max(-.95,Math.min(.95,lateral/Math.max(2,distance)));gain.connect(panner);panner.connect(master);}else gain.connect(master);
      if(voices.size>=24){const oldest=voices.values().next().value;try{oldest.stop();}catch{}}
      voices.add(source);voiceKeys.set(source,key);voiceStarts.set(source,when);diagnostics.active=voices.size;
      source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();panner?.disconnect();diagnostics.active=voices.size;};
      source.start(when,segment.offset,duration);
      diagnostics.scheduled.push({event,key,label:segment.label,offset:segment.offset,duration,delay:segment.at,when});
      }
      if(feedbackId&&segments.length){confirmedFeedback.add(feedbackId);if(confirmedFeedback.size>512)confirmedFeedback.delete(confirmedFeedback.values().next().value);}
      if(fireId&&segments.length){confirmedGunfire.add(fireId);if(confirmedGunfire.size>512)confirmedGunfire.delete(confirmedGunfire.values().next().value);}
      if(['kill','headshot','body-hit','shield-hit','knife-hit','knife-wall'].includes(key)&&segments.length){
        diagnostics.feedback.push({event:key,weapon:options.weapon??null,eventId:feedbackId,assetId,at:start,volume:options.volume??1});
        if(diagnostics.feedback.length>16)diagnostics.feedback.shift();
      }
      diagnostics.played++;diagnostics.lastEvent=key;diagnostics.lastTrigger=event;diagnostics.lastAssetId=assetId;diagnostics.lastSource=manifest.assets.find(a=>a.id===assetId)?.origin||'provided recording';diagnostics.timingApproximate=!!planned||melee;diagnostics.events[key]=(diagnostics.events[key]||0)+1;return segments.length>0;
    }catch(error){fail(key,error);return false;}
  }
  return {
    unlock,play,diagnostics,
    clearFeedbackHistory(){confirmedFeedback.clear();confirmedGunfire.clear();diagnostics.feedback.length=0;},
    cancelPendingAttacks(weapon){
      if(!context)return;
      const keys=weapon==='knife'?['knife.light','knife.heavy']:[weapon+'.fire'];
      for(const voice of voices)if(keys.includes(voiceKeys.get(voice))&&voiceStarts.get(voice)>context.currentTime){
        try{voice.stop();diagnostics.cancelledPendingAttacks++;}catch{}
      }
    },
    stop(event,options={}){const key=resolveEvent(event,options);for(const voice of voices)if(event==='all'||voiceKeys.get(voice)===key)try{voice.stop();}catch{}},
    stopReload(weapon){for(const voice of voices){const key=voiceKeys.get(voice);if(key?.endsWith('.reload')&&(!weapon||key===weapon+'.reload'))try{voice.stop();}catch{}}},
    setVolume(value){volume=Math.max(0,Math.min(1,Number(value)||0));diagnostics.volume=volume;applyVolume();},
    setMuted(value){muted=!!value;diagnostics.muted=muted;applyVolume();},
    setListener(position,yaw=0){listener={x:position?.x||0,y:position?.y||0,z:position?.z||0,yaw:Number(yaw)||0};},
    getVolume(){return volume;},getMuted(){return muted;},
    dispose(){for(const voice of voices)try{voice.stop();}catch{}voices.clear();context?.close().catch(error=>fail('close',error));}
  };
}
