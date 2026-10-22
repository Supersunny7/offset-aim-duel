import {WEAPONS} from './weapons.mjs';
import {advanceHitboxMotion} from './hitbox-motion.mjs';
import {move,RATE} from './shared.mjs';
export const FIXED_DT=1/RATE,MAX_MOVES=8,MAX_QUEUE=120;
const fields=['map','x','y','z','vx','vy','vz','grounded','crouch','jumpHeld','accuracyMoveMode'];
export function copyMovement(target,source){for(const k of fields)target[k]=source[k]??(k==='accuracyMoveMode'?'run':k==='grounded'?true:k==='crouch'||k==='jumpHeld'?false:0);return target;}
export function normalMove(command){if(!Number.isSafeInteger(command?.n)||command.n<=0||!Number.isFinite(command.yaw))return null;return {n:command.n,yaw:command.yaw%(Math.PI*2),forward:!!command.forward,back:!!command.back,left:!!command.left,right:!!command.right,walk:!!command.walk,crouch:!!command.crouch,jump:!!command.jump,ads:!!command.ads};}
export function queueMoves(player,commands,epoch,{adsAllowed=!!player.ads}={}){
 if(epoch!==player.spawnEpoch||!Array.isArray(commands)||commands.length>MAX_MOVES)return 0;
 player.moveMode=true;player.moveQueue??=[];player.moveReceived??=player.moveAck||0;let added=0;
 for(const raw of commands){const c=normalMove(raw);if(!c||c.n<=player.moveReceived)continue;if(c.n!==player.moveReceived+1||player.moveQueue.length>=MAX_QUEUE)break;c.movementWeapon=player.weapon;c.movementAds=!!WEAPONS[player.weapon]?.ads&&adsAllowed&&c.ads;player.moveQueue.push(c);player.moveReceived=c.n;added++;}
 if(added)player.moveStale=false;return added;
}
// Context is captured at simulation intent, never accepted as a client weapon ID.
function contextualMove(actor,c){
 const peers=actor.collisionPeers,weapon=actor.weapon,ads=actor.ads,changed=c.movementWeapon!=null&&c.movementWeapon!==weapon;
 const motion=changed&&actor.hitboxMotion?{...actor.hitboxMotion}:null;
 actor.weapon=c.movementWeapon??weapon;actor.ads=c.movementAds??ads;actor.collisionPeers=c.movementCollisionPeers??peers;move(actor,c,FIXED_DT);actor.weapon=weapon;actor.ads=ads;actor.collisionPeers=peers;
 // Historical speed belongs to the queued input; the published pose belongs
 // to the currently equipped weapon and must advance exactly once.
 if(changed){actor.hitboxMotion=motion;advanceHitboxMotion(actor,FIXED_DT);}
}
export function stepQueuedMove(player){const c=player.moveQueue?.shift();if(!c)return false;const aim=player.yaw;player.yaw=c.yaw;contextualMove(player,c);player.yaw=aim;player.moveAck=c.n;return true;}
export function createMovementPrediction(actor){
 let pending=[],outgoing=[],n=0,epoch=null,accumulator=0;
 const diagnostics={pending:0,ack:0,correction:0,maxCorrection:0,resets:0,steps:0};
 function reconcile(server,{reset=false}={}){
  const changed=epoch!==server.spawnEpoch;
  if(changed||reset||server.hp<=0){copyMovement(actor,server);epoch=server.spawnEpoch;n=server.moveAck||0;pending=[];outgoing=[];accumulator=0;diagnostics.resets++;diagnostics.ack=n;diagnostics.pending=0;return true;}
  const before={x:actor.x,y:actor.y||0,z:actor.z};pending=pending.filter(c=>c.n>(server.moveAck||0));outgoing=outgoing.filter(c=>c.n>(server.moveAck||0));copyMovement(actor,server);
  const yaw=actor.yaw;
  for(const c of pending){actor.yaw=c.yaw;contextualMove(actor,c);}actor.yaw=yaw;
  diagnostics.correction=Math.hypot(actor.x-before.x,actor.y-before.y,actor.z-before.z);diagnostics.maxCorrection=Math.max(diagnostics.maxCorrection,diagnostics.correction);diagnostics.pending=pending.length;diagnostics.ack=server.moveAck||0;return false;
 }
 function advance(seconds,intent,yaw,{enabled=true}={}){
  accumulator+=Math.min(Math.max(seconds,0),.1);let count=0;
  while(accumulator>=FIXED_DT&&count<6){accumulator-=FIXED_DT;count++;if(epoch===null)continue;if(pending.length>=MAX_QUEUE){accumulator=0;break;}
   const c=normalMove({n:++n,yaw,...(enabled?intent:{})});c.movementWeapon=actor.weapon;c.movementAds=!!actor.ads;c.movementCollisionPeers=actor.collisionPeers;actor.yaw=yaw;contextualMove(actor,c);pending.push(c);outgoing.push({...normalMove(c)});diagnostics.steps++;
  }
  diagnostics.pending=pending.length;return count;
 }
 function takeMoves(){return outgoing.splice(0,MAX_MOVES);}
 return {advance,reconcile,takeMoves,diagnostics,get epoch(){return epoch;},get pending(){return pending;}};
}
