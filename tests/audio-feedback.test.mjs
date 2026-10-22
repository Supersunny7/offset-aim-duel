import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCombatFeedbackPlanner,planConfirmedGunSound} from '../public/combat-feedback.mjs';

const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/audio/manifest.json',import.meta.url)));
const code=fs.readFileSync(new URL('../public/game-audio.mjs',import.meta.url),'utf8')
  .replace("'/weapon-audio-timing.mjs'",JSON.stringify(new URL('../public/weapon-audio-timing.mjs',import.meta.url).href))
  .replace("'/weapons.mjs'",JSON.stringify(new URL('../weapons.mjs',import.meta.url).href));
const {createGameAudio}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
async function setup(){
  const sources=[],contexts=[],urls=[];
  const param={setValueAtTime(){},setTargetAtTime(){},linearRampToValueAtTime(){}};
  globalThis.AudioContext=class{
    state='running';currentTime=10;destination={};
    constructor(){contexts.push(this);}
    resume(){return Promise.resolve();}close(){return Promise.resolve();}
    createGain(){return {gain:{...param},connect(){},disconnect(){}};}
    createBufferSource(){const s={connect(){},disconnect(){},start(when){this.when=when;},stop(){this.stopped=true;this.onended?.();}};sources.push(s);return s;}
    decodeAudioData(data){const url=urls[new DataView(data).getUint32(0)];return Promise.resolve({duration:manifest.assets.find(a=>a.url===url).duration,numberOfChannels:1,url});}
  };
  globalThis.fetch=async url=>({ok:true,json:async()=>manifest,arrayBuffer:async()=>{const b=new ArrayBuffer(4);new DataView(b).setUint32(0,urls.push(url)-1);return b;}});
  const audio=createGameAudio();await audio.unlock();return {audio,sources,clock:contexts[0]};
}

test('shipped hit routing preserves firearm/blade boundaries and single lethal confirmation',async()=>{
  const {audio,sources}=await setup(),planner=createCombatFeedbackPlanner();
  for(const weapon of ['vandal','ghost','knife'])for(const part of ['body','head'])for(const killed of [false,true]){
    const message={type:weapon==='knife'?'melee-hit':'shot',id:'self',shotId:sources.length+1,weapon,part:weapon==='knife'?'body':part,damage:30,armorDamage:10,killed};
    const f=planner.plan(message,'self');assert(f.sound);assert(audio.play(f.sound,{weapon,eventId:f.eventId}));
    assert.equal(planner.plan(message,'self'),null);
    assert.equal(audio.play(f.sound,{weapon,eventId:f.eventId}),false);
    const url=sources.at(-1).buffer.url;
    assert.equal(url,weapon==='knife'?'/assets/audio/hit-reference.wav':'/assets/audio/shield-hit.wav');
  }
  const count=sources.length;
  for(const weapon of ['vandal','ghost'])for(const event of ['knife-hit','knife-wall'])assert.equal(audio.play(event,{weapon}),false);
  for(const event of ['body-hit','shield-hit'])assert.equal(audio.play(event,{weapon:'knife'}),false);
  assert.equal(sources.length,count);assert.equal(audio.diagnostics.rejectedFeedback,6);
  audio.dispose();
});

test('switch cancels future blade sounds while preserving started swing and gunfire tails',async()=>{
  const {audio,sources,clock}=await setup();
  audio.play('fire',{weapon:'vandal'});const gun=sources.at(-1);
  audio.play('melee',{weapon:'knife',variant:'primary'});const light=sources.at(-1);
  audio.play('melee',{weapon:'knife',variant:'secondary'});const heavy=sources.at(-1);
  assert(light.when>clock.currentTime);assert(heavy.when>clock.currentTime);
  audio.cancelPendingAttacks('knife');assert(light.stopped);assert(heavy.stopped);assert(!gun.stopped);
  assert.equal(audio.diagnostics.cancelledPendingAttacks,2);
  audio.play('melee',{weapon:'knife'});const begun=sources.at(-1);
  clock.currentTime=begun.when+.01;audio.cancelPendingAttacks('knife');assert(!begun.stopped);
  audio.cancelPendingAttacks('vandal');assert(!gun.stopped);
  audio.dispose();
});

test('feedback trace is bounded, contains resolved asset identity, and clears with room lifecycle',async()=>{
  const {audio}=await setup();
  for(let i=0;i<25;i++)assert(audio.play('body-hit',{weapon:'ghost',eventId:'shot:self:'+i,volume:1.25}));
  assert.equal(audio.diagnostics.feedback.length,16);
  assert.equal(audio.diagnostics.feedback[0].eventId,'shot:self:9');
  assert.equal(audio.diagnostics.feedback.at(-1).assetId,'body-hit');
  audio.clearFeedbackHistory();assert.equal(audio.diagnostics.feedback.length,0);
  assert(audio.play('body-hit',{weapon:'ghost',eventId:'shot:self:24'}));
  audio.dispose();
});

test('Vandal and Ghost lethal head/body shots retain gunshot, selected impact and one kill voice',async()=>{
  for(const weapon of ['vandal','ghost'])for(const part of ['body','head'])for(const predicted of [false,true]){
    const {audio,sources}=await setup(),planner=createCombatFeedbackPlanner();
    const m={type:'shot',id:'self',shotId:1,weapon,part,damage:160,killed:true};
    if(predicted)assert(audio.play('fire',{weapon}));
    const fire=planConfirmedGunSound(m,{own:true,predicted,predictedAudioPlayed:predicted});
    if(fire)assert(audio.play(fire.event,fire));
    const feedback=planner.plan(m,'self');
    assert.equal(feedback.sound,'body-hit');
    for(const layer of feedback.sounds)assert(audio.play(layer.sound,{weapon,eventId:layer.eventId,volume:layer.volume}));
    assert.deepEqual(sources.map(s=>s.buffer.url),[`/assets/audio/${weapon}-fire.mp3`,'/assets/audio/body-hit.wav','/assets/audio/kill-1.mp3']);
    assert(sources.every(s=>!s.stopped),'impact must not stop the gunshot tail');
    if(fire)assert.equal(audio.play(fire.event,fire),false);
    assert.equal(audio.play(feedback.sound,{weapon,eventId:feedback.eventId}),false);
    assert.equal(audio.play('kill',{weapon,eventId:feedback.sounds[1].eventId}),false);
    assert.equal(sources.length,3);
    audio.dispose();
  }
});

test('Ghost nonlethal and lethal headshots both use selected firearm impact',async()=>{
  const {audio,sources}=await setup(),planner=createCombatFeedbackPlanner();
  for(const [shotId,killed,armorDamage,expected] of [[1,false,50,'shield-hit'],[2,true,0,'body-hit']]){
    const m={type:'shot',id:'self',shotId,weapon:'ghost',part:'head',damage:105,armorDamage,killed};
    const fire=planConfirmedGunSound(m,{own:true});assert(audio.play(fire.event,fire));
    const f=planner.plan(m,'self');assert.equal(f.sound,expected);
    for(const layer of f.sounds)assert(audio.play(layer.sound,{weapon:'ghost',eventId:layer.eventId,volume:layer.volume}));
  }
  assert.deepEqual(sources.map(s=>s.buffer.url),['/assets/audio/ghost-fire.mp3','/assets/audio/shield-hit.wav','/assets/audio/ghost-fire.mp3','/assets/audio/body-hit.wav','/assets/audio/kill-1.mp3']);
  assert(sources.every(s=>!s.stopped));audio.dispose();
});

test('missing predicted audio is repaired by confirmation without requiring weapon animation',async()=>{
  const {audio,sources}=await setup();
  const m={type:'shot',id:'self',shotId:8,weapon:'ghost',part:'head',damage:105,killed:true};
  const fire=planConfirmedGunSound(m,{own:true,predicted:true,predictedAudioPlayed:false});
  assert(fire);assert(audio.play(fire.event,fire));assert.equal(audio.play(fire.event,fire),false);
  assert.equal(planConfirmedGunSound(m,{own:true,predicted:true,predictedAudioPlayed:true}),null);
  assert.equal(planConfirmedGunSound(m,{own:true,audible:false}),null);
  assert.equal(planConfirmedGunSound({...m,weapon:'knife'}),null);
  audio.clearFeedbackHistory();assert(audio.play(fire.event,fire));
  assert.equal(sources.length,2);audio.dispose();
});

test('light and heavy knife kills preserve swing, knife contact and exactly one kill voice',async()=>{
  for(const attack of ['primary','secondary']){
    const {audio,sources,clock}=await setup(),planner=createCombatFeedbackPlanner();
    assert(audio.play('melee',{weapon:'knife',variant:attack}));
    const swing=sources[0];clock.currentTime=swing.when+.01;
    const m={type:'melee-hit',id:'self',shotId:10,weapon:'knife',attack,part:'body',damage:150,killed:true};
    const feedback=planner.plan(m,'self');
    assert.deepEqual(feedback.sounds.map(s=>s.sound),['knife-hit','kill']);
    for(const layer of feedback.sounds)assert(audio.play(layer.sound,{weapon:'knife',eventId:layer.eventId,volume:layer.volume}));
    assert.equal(sources.length,3);assert(!swing.stopped);
    assert.equal(sources[1].buffer.url,'/assets/audio/hit-reference.wav');
    assert.equal(sources[2].buffer.url,'/assets/audio/kill-1.mp3');
    assert.equal(planner.plan(m,'self'),null);
    for(const layer of feedback.sounds)assert.equal(audio.play(layer.sound,{weapon:'knife',eventId:layer.eventId}),false);
    assert.equal(sources.length,3);audio.dispose();
  }
});
