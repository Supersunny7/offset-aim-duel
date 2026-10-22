import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {WEAPONS} from '../weapons.mjs';
import {WEAPON_AUDIO_TIMING as profiles,planWeaponAudio} from '../public/weapon-audio-timing.mjs';
const ids=['classic','shorty','frenzy','stinger','spectre','bucky','judge','bulldog','guardian','marshal','operator','ares','odin'];
const evidence=new URL('./fixtures/',import.meta.url);
const reports=JSON.parse(fs.readFileSync(new URL('all-weapon-mechanical-audio-cues.json',evidence)));

test('new firearm cues come from original moving GN mechanics or documented FP fallback and measured recording peaks',()=>{
 for(const id of ids){const config=profiles[id],record=reports.find(r=>r.weapon===id);assert(config.nativeReloadClock);assert.equal(config.equip.length,1);assert(config.reload.length>=2);assert(config.equip[0].duration<=.18);
  for(const [event,items] of [['equip',[record.equip]],['reload',record.reload]]){
   for(const item of items){const p=item.cue;assert(item.landmark.sourceEntry.includes('/'));assert(item.landmark.maxMotionMetric>.001);assert(item.rms>0);assert(p.offset>=0&&p.offset+p.duration<=record.decodedDuration+.000002);assert(p.peak>=0&&p.peak<=p.duration);assert(Math.abs(p.offset+p.peak-item.audioPeakSeconds)<.000002);assert(Math.abs(p.phase*config[event+'Duration']-item.landmark.seconds)<.000002);}
   const segments=planWeaponAudio(event,id);assert(segments.length>0);for(const p of segments){assert.equal(p.source,id+'.reload');assert(p.offset+p.duration<=record.decodedDuration+.000002);assert(p.at+p.duration<=config[event+'Duration']+.000002);}
  }
 }
});

test('late entry trims consumed native sound, does not replay earlier cues, and honors partial ready budgets',()=>{
 for(const id of ids)for(const event of ['equip','reload']){
  const config=profiles[id],duration=config[event+'Duration'],ready=event==='reload'?WEAPONS[id].reload/1000:duration,options={actualDuration:duration,readyDuration:ready};
  const full=planWeaponAudio(event,id,options);
  for(const elapsed of [.15,.5,ready]){
   const late=planWeaponAudio(event,id,{...options,[event==='reload'?'reloadRemaining':'equipRemaining']:Math.max(0,ready-elapsed)});
   const expected=full.map(p=>{const consumed=Math.max(0,elapsed-p.at),length=p.duration-consumed;return{...p,at:Math.max(0,p.at-elapsed),offset:p.offset+consumed,duration:Math.max(0,length),fade:Math.min(.008,Math.max(0,length)/3)};}).filter(p=>p.duration>.002);
   assert.equal(late.length,expected.length,id+' '+event+' elapsed '+elapsed);for(let i=0;i<late.length;i++){assert.equal(late[i].source,expected[i].source);assert.equal(late[i].label,expected[i].label);for(const key of ['at','offset','duration','fade'])assert(Math.abs(late[i][key]-expected[i][key])<1e-9,id+' '+event+' '+key);}
  }
  if(event==='reload'&&['bucky','marshal'].includes(id))for(const budget of [.5,1,1.5])assert.deepEqual(planWeaponAudio(event,id,{...options,readyDuration:budget,reloadRemaining:budget}),full,'partial reload starts at native source time0');
 }
});

test('validated existing four timing profiles and plan behavior remain exactly unchanged',async()=>{
 const before=fs.readFileSync(new URL('weapon-audio-timing-before-full-armory.mjs',evidence),'utf8').replace("'../weapons.mjs'",JSON.stringify(new URL('../weapons.mjs',import.meta.url).href));
 const old=await import('data:text/javascript;base64,'+Buffer.from(before).toString('base64'));
 for(const id of ['vandal','ghost','phantom','sheriff']){assert.deepEqual(profiles[id],old.WEAPON_AUDIO_TIMING[id]);for(const event of ['equip','reload'])for(const actualDuration of [.7,1.5,3])for(const remaining of [undefined,0,.2,1,2]){const options={actualDuration,readyDuration:.5,equipRemaining:remaining,reloadRemaining:remaining};assert.deepEqual(planWeaponAudio(event,id,options),old.planWeaponAudio(event,id,options));}}
});

test('actual audio event scheduler uses each gun reload buffer for short equip cues and cancels previous voices',async()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/audio/manifest.json',import.meta.url))),sources=[],metadata=new WeakMap(),param={setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){}};
 class AudioContext{state='running';currentTime=20;destination={};resume(){return Promise.resolve();}createGain(){return{gain:{...param},connect(){},disconnect(){}};}createBufferSource(){const s={connect(){},disconnect(){},start(...args){s.args=args;},stop(){s.stopped=true;s.onended?.();}};sources.push(s);return s;}decodeAudioData(buffer){return Promise.resolve({duration:metadata.get(buffer).duration,numberOfChannels:1,asset:metadata.get(buffer).id});}}
 globalThis.AudioContext=AudioContext;
 globalThis.fetch=async url=>({ok:true,json:async()=>manifest,arrayBuffer:async()=>{const asset=manifest.assets.find(a=>a.url===url),buffer=new ArrayBuffer(1);metadata.set(buffer,{...asset,duration:asset.duration||1});return buffer;}});
 const code=fs.readFileSync(new URL('../public/game-audio.mjs',import.meta.url),'utf8').replace("'/weapon-audio-timing.mjs'",JSON.stringify(new URL('../public/weapon-audio-timing.mjs',import.meta.url).href)).replace("'/weapons.mjs'",JSON.stringify(new URL('../weapons.mjs',import.meta.url).href));
 const {createGameAudio}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')),audio=createGameAudio();await audio.unlock();assert.equal(audio.diagnostics.status,'ready');
 for(const id of ids){const start=sources.length;assert(audio.play('equip',{weapon:id,actualDuration:profiles[id].equipDuration}));assert.equal(sources.length-start,1);assert.equal(sources.at(-1).buffer.asset,id+'-reload');assert(sources.at(-1).args[2]<=.18);assert(audio.play('reload',{weapon:id,actualDuration:profiles[id].reloadDuration,readyDuration:WEAPONS[id].reload/1000}));assert(sources[start].stopped);for(const s of sources.slice(start+1)){assert.equal(s.buffer.asset,id+'-reload');assert(s.args[1]>=0&&s.args[1]+s.args[2]<=s.buffer.duration+.000002);}audio.stop('all');assert.equal(audio.diagnostics.active,0);}
 assert.deepEqual(audio.diagnostics.errors,[]);
});
