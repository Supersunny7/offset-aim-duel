import {EQUIPMENT,AGENTS} from './equipment-catalog.mjs';

export const EQUIPMENT_SLOTS=Object.freeze(['primary','sidearm','melee']);
export const DEFAULT_LOADOUT=Object.freeze({primary:'vandal',sidearm:'ghost',melee:'knife',hero:'jett',skins:Object.freeze({primary:'default',sidearm:'default',melee:'default'})});
export const equipmentById=Object.fromEntries(EQUIPMENT.map(w=>[w.id,w]));
export function readyWeapon(id,slot){const item=equipmentById[id];return !!item?.ready&&(!slot||item.slot===slot);}
export function normalizeLoadout(value){
 const result={...DEFAULT_LOADOUT,skins:{...DEFAULT_LOADOUT.skins}};
 if(!value||typeof value!=='object')return result;
 for(const slot of EQUIPMENT_SLOTS)if(readyWeapon(value[slot],slot))result[slot]=value[slot];
 if(AGENTS.some(a=>a.id===value.hero&&a.ready))result.hero=value.hero;
 return result;
}
export function loadoutOrder(value){const loadout=normalizeLoadout(value);return EQUIPMENT_SLOTS.map(slot=>loadout[slot]);}
export function canEquipLoadout(player,id){return readyWeapon(id)&&EQUIPMENT_SLOTS.some(slot=>player.loadout?.[slot]===id);}
// Reject the whole request before changing anything. Pending assets never become combat weapons.
export function planLoadoutChange(current,request){
 const loadout=normalizeLoadout(current);
 if(!request||typeof request!=='object')return {error:'Invalid loadout.'};
 if(request.weapon!==undefined){
  const slot=request.equipmentSlot;
  if(!EQUIPMENT_SLOTS.includes(slot)||!readyWeapon(request.weapon,slot))return {error:'This equipment is unavailable or does not belong in this slot.'};
  if(request.skin!==undefined&&request.skin!=='default')return {error:'This skin is not available yet.'};
  loadout[slot]=request.weapon;loadout.skins[slot]='default';
 }
 if(request.hero!==undefined){if(!AGENTS.some(a=>a.id===request.hero&&a.ready))return {error:'This agent is not available yet.'};loadout.hero=request.hero;}
 if(request.weapon===undefined&&request.hero===undefined)return {error:'Select a weapon or an agent.'};
 return {loadout};
}
export function readLoadoutPreference(storage){try{const raw=JSON.parse(storage.getItem('offset:loadout-v1'));return {loadout:normalizeLoadout(raw?.loadout),weapon:readyWeapon(raw?.weapon)?raw.weapon:'vandal'};}catch{return {loadout:normalizeLoadout(null),weapon:'vandal'};}}
export function saveLoadoutPreference(storage,player){try{storage.setItem('offset:loadout-v1',JSON.stringify({loadout:normalizeLoadout(player.loadout),weapon:player.weapon}));}catch{}}
