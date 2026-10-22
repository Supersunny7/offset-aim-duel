// Keep free mouse look and the browser fallback drag as distinct input paths.
export async function requestGamePointerLock(canvas){
 try{await canvas.requestPointerLock({unadjustedMovement:true});return 'raw-requested';}
 catch(error){
  // An unsupported raw-input option may still allow normal pointer lock.
  // Security/user-denial errors belong to the existing drag fallback.
  if(error?.name!=='NotSupportedError')throw error;
  await canvas.requestPointerLock();return 'adjusted-fallback';
 }
}

export function createViewTrace({onJump=()=>{}}={}){
 let previous=null,events=[],lastJump=null,jumps=0;
 const angle=d=>Math.atan2(Math.sin(d),Math.cos(d));
 return {
  record(kind,actor,detail={},now=performance.now()){
   const e={t:Math.round(now),kind,yaw:actor.yaw,pitch:actor.pitch,x:actor.x,y:actor.y||0,z:actor.z,...detail};
   if(![e.yaw,e.pitch,e.x,e.y,e.z].every(Number.isFinite))return;
   const rotation=previous?Math.hypot(angle(e.yaw-previous.yaw),e.pitch-previous.pitch):0;
   const displacement=previous?Math.hypot(e.x-previous.x,e.y-previous.y,e.z-previous.z):0;
   // Flag for investigation only. Legitimate flicks/respawns are not clamped.
   if(rotation>.6||displacement>.75){lastJump={...e,rotation,displacement};jumps++;}
   if(kind!=='frame'||rotation>1e-6||displacement>1e-6){events.push(e);if(events.length>128)events.shift();}
   previous=e;
   if(lastJump===null)return;
   if(lastJump.t===e.t&&lastJump.kind===e.kind&&(rotation>.6||displacement>.75))onJump({jump:lastJump,events:events.slice(-32)});
  },
  get diagnostics(){return {jumps,lastJump,recent:events.slice(-8)};}
 };
}

export function createLookInput(){
  let dragging=false,last=null,prime=true,rebases=0,lastDelta=null;
  const record=(delta,mode)=>{lastDelta={x:delta[0],y:delta[1],mode};return delta;};
  return {
    reset(){dragging=false;last=null;prime=true;lastDelta=null;},
    rebase(){last=null;prime=true;lastDelta=null;rebases++;},
    begin(e){if(e.button===1){dragging=true;last=[e.clientX,e.clientY];}},
    end(e){if(e.button===1){dragging=false;last=null;}},
    delta(e,{enabled,locked}){
      if(!enabled){this.reset();return null;}
      if(locked){
        if(prime){prime=false;return null;}
        const x=e.movementX,y=e.movementY;
        return Number.isFinite(x)&&Number.isFinite(y)?record([x,y],'locked'):null;
      }
      prime=true;
      if(!dragging)return null;
      // Mouseup can occur outside the document. The next event repairs that state.
      if(!(e.buttons&4)){dragging=false;last=null;return null;}
      const point=[e.clientX,e.clientY],previous=last;
      if(!point.every(Number.isFinite)){last=null;return null;}
      last=point;if(!previous||!previous.every(Number.isFinite))return null;
      return record([point[0]-previous[0],point[1]-previous[1]],'drag');
    },
    get diagnostics(){return {dragging,primed:prime,rebases,lastDelta};}
  };
}

// Movement epochs also change after network stalls. Only a new life/round owns
// authoritative aim; a position reconciliation must preserve current mouse aim.
export function reconcileAimSnapshot(actor,server,{first=false,respawn=false,newRound=false}={}){
  if(!first&&!respawn&&!newRound)return false;
  if(!Number.isFinite(server.yaw)||!Number.isFinite(server.pitch))return false;
  actor.yaw=server.yaw;actor.pitch=server.pitch;return true;
}

// Normalize wheel notches and trackpad fragments without retaining an input queue.
export function createWeaponWheel(){
 const defaultOrder=['vandal','ghost','knife'];let sum=0,lastEvent=-Infinity,lastSwitch=-Infinity,selected=null;
 return {
  reset(){sum=0;lastEvent=lastSwitch=-Infinity;selected=null;},
  select(weapon,now){sum=0;selected=weapon;lastSwitch=now;},
  confirm(weapon){if(selected===weapon)selected=null;},
  next(event,current,now,loadoutOrder=defaultOrder){
   const order=[...new Set(loadoutOrder)];if(!order.length)return null;
   if(event.ctrlKey||!Number.isFinite(event.deltaY)||!event.deltaY)return null;
   const delta=event.deltaY*(event.deltaMode===1?40:event.deltaMode===2?800:1);
   if(now-lastEvent>180||Math.sign(sum)!==Math.sign(delta))sum=0;
   lastEvent=now;
   if(now-lastSwitch<90){sum=0;return null;}
   sum+=delta;if(Math.abs(sum)<40)return null;
   const step=Math.sign(sum);sum=0;
   const base=selected||current,index=order.indexOf(base);
   selected=order[((index<0?0:index)+step+order.length)%order.length];lastSwitch=now;
   return selected;
  }
 };
}
