import {HITBOX_SKELETON as skeleton} from '/hitbox-skeleton-data.mjs';
import {HITBOX_COMBAT_SKELETON as combat} from '/hitbox-combat-skeleton-data.mjs';
import {HITBOX_MOTION as motion} from '/hitbox-motion-data.mjs';

// Browser data is mutable by design. Shared simulation reads these same module
// objects; the Node server imports the complete root files and never this loader.
const weapons=new Set(['vandal','ghost','knife','phantom','sheriff','classic','shorty','frenzy','stinger','spectre','bucky','judge','bulldog','guardian','marshal','operator','ares','odin']);
const pending=new Map(),errors=new Map(),loaded=new Set(['vandal','ghost','knife']);
let decodedBytes=0;
export function isBrowserHitboxReady(weapon){return loaded.has(weapon)&&!!skeleton.clips[weapon+'|idle-lower']&&!!motion[weapon+'|idle-lower'];}
export function browserHitboxDataStatus(){return{loaded:[...loaded],pending:[...pending.keys()],errors:Object.fromEntries(errors),decodedBytes};}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function validateDataset(add,base,weapon){
 if(!add||!same(add.names,base.names)||!Array.isArray(add.pool)||!add.clips)throw Error('Hitbox rig contract mismatch: '+weapon);
 for(const v of add.pool)if(!Array.isArray(v)||v.length!==7||!v.every(Number.isFinite))throw Error('Invalid hitbox transform: '+weapon);
 const expected=base===skeleton?[15,30]:[4];
 if(!expected.includes(Object.keys(add.clips).length))throw Error('Incomplete hitbox curves: '+weapon);
 for(const[key,clip]of Object.entries(add.clips)){
  if(!(key.startsWith(weapon+'|')||key.startsWith(weapon+'-ads|'))||base.clips[key]||!Array.isArray(clip.frames)||!clip.frames.length)throw Error('Invalid hitbox key: '+key);
  for(const frame of clip.frames)if(frame.length!==base.names.length||frame.some(i=>!Number.isInteger(i)||i<0||i>=add.pool.length))throw Error('Invalid hitbox pool index: '+key);
 }
 if(base===skeleton){
  for(const k of['parents','baseQuaternion','basePosition','sole'])if(!same(add[k],base[k]))throw Error('Incompatible hitbox bind: '+k);
  for(const suffix of['-upper','-crouch-upper'])if(!Number.isFinite(add.headTopOffsets?.[weapon+suffix]))throw Error('Missing native head offset: '+weapon);
 }else{
  if(!add.fire?.[weapon]?.tracks?.length)throw Error('Missing hitbox fire curves: '+weapon);
  for(const[id,clip]of Object.entries(add.fire)){
   if(![weapon,weapon+'-ads'].includes(id)||!(clip.duration>0)||!Number.isFinite(clip.duration)||!clip.tracks?.length)throw Error('Invalid fire variant: '+id);
   for(const t of clip.tracks){const width=t.property==='position'?3:t.property==='quaternion'?4:0;if(!width||!base.names.includes(t.name)||!Array.isArray(t.times)||!t.times.length||t.values.length!==t.times.length*width||!t.times.every(Number.isFinite)||!t.values.every(Number.isFinite)||t.times.some((v,i)=>v<0||(i&&v<t.times[i-1])))throw Error('Invalid fire source track: '+id);}
  }
 }
}
function mergeDataset(base,add){
 const offset=base.pool.length;
 // Rebase chunk-local indices; baseline legacy indices remain untouched.
 for(const v of add.pool)base.pool.push(v);
 for(const[key,clip]of Object.entries(add.clips))base.clips[key]={...clip,frames:clip.frames.map(f=>f.map(i=>i+offset))};
 if(base===skeleton)Object.assign(base.headTopOffsets,add.headTopOffsets);
 else Object.assign(base.fire,add.fire);
}
export function ensureBrowserHitboxData(weapon){
 if(!weapons.has(weapon))return Promise.reject(Error('Unsupported hitbox weapon: '+weapon));
 if(isBrowserHitboxReady(weapon))return Promise.resolve(true);
 if(pending.has(weapon))return pending.get(weapon);
 errors.delete(weapon);
 const promise=(async()=>{
  const response=await fetch('/assets/browser-hitbox/'+weapon+'.json');
  if(!response.ok)throw Error('Hitbox '+weapon+': HTTP '+response.status);
  const text=await response.text(),chunk=JSON.parse(text);
  if(chunk.format!=='aim-duel-browser-hitbox-v1'||chunk.weapon!==weapon)throw Error('Hitbox chunk identity mismatch');
  validateDataset(chunk.skeleton,skeleton,weapon);validateDataset(chunk.combat,combat,weapon);
  if(Object.keys(chunk.motion||{}).length!==Object.keys(chunk.skeleton.clips).length)throw Error('Incomplete hitbox motion: '+weapon);
  for(const[key,clip]of Object.entries(chunk.motion)){
   if(!(key.startsWith(weapon+'|')||key.startsWith(weapon+'-ads|'))||motion[key]||!Number.isFinite(clip.duration)||clip.duration<=0||!clip.frames?.length)throw Error('Invalid motion curve: '+key);
   for(const frame of clip.frames)for(const v of Object.values(frame))if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))throw Error('Invalid motion transform: '+key);
  }
  // Everything validates first; all three stores publish in one synchronous turn.
  mergeDataset(skeleton,chunk.skeleton);mergeDataset(combat,chunk.combat);Object.assign(motion,chunk.motion);
  decodedBytes+=text.length;loaded.add(weapon);return true;
 })().catch(error=>{errors.set(weapon,String(error.message||error));throw error;}).finally(()=>pending.delete(weapon));
 pending.set(weapon,promise);return promise;
}
