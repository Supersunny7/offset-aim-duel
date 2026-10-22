import {weaponAttackSpec,hitDamage} from './weapons.mjs';
import {direction,trace} from './shared.mjs';
import {sampleSpreadDirection} from './accuracy.mjs';

// All pellets use one authoritative snapshot and RNG stream. The canister must
// reach its detonation point before its pellets exist; walls never get bypassed.
export function traceVolley(p,origin,target,map,accuracy,random,attack='primary'){
 const spec=weaponAttackSpec(p.weapon,p.ads,attack),axis=direction(p.yaw,p.pitch),hits=[];
 let launch=origin,offset=0;
 if(spec.kind==='airburst'){
  const near=trace(origin,axis,target,map);
  if(near.distance<=spec.detonationDistance){
   return [{...near,origin,end:{x:origin.x+axis.x*near.distance,y:origin.y+axis.y*near.distance,z:origin.z+axis.z*near.distance},damage:near.part?hitDamage(p.weapon,near.part,near.distance,attack):0}];
  }
  offset=spec.detonationDistance;launch={x:origin.x+axis.x*offset,y:origin.y+axis.y*offset,z:origin.z+axis.z*offset};
 }
 for(let i=0;i<(p.lastPelletCount||spec.pellets||1);i++){
  const d=sampleSpreadDirection(p.yaw,p.pitch,accuracy.totalDegrees,random),hit=trace(launch,d,target,map),distance=Math.min(hit.distance,Math.max(0,spec.range-offset));
  hits.push({...hit,distance:hit.distance+offset,origin:launch,end:{x:launch.x+d.x*distance,y:launch.y+d.y*distance,z:launch.z+d.z*distance},damage:hit.part&&hit.distance+offset<=spec.range?hitDamage(p.weapon,hit.part,hit.distance+offset,attack):0});
 }
 return hits;
}
