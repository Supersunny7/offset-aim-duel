export const OPPONENT_LIFECYCLE_ANIMATIONS=['hit-body','hit-head','death-body','death-head'];

export function createOpponentLifecycle(group){
  const seen=new Set(),pending=[];
  let epoch=null,dead=false,deathPart='body',deathAction=null,deathBaseY=0,hit=null,deathStart=[],deathPose=[];
  const stopHit=state=>{hit=null;for(const n of ['hit-body','hit-head'])state?.actions[n]?.stop();};
  function reset(){
    const state=group.userData.native;stopHit(state);
    for(const n of ['death-body','death-head'])state?.actions[n]?.stop();
    pending.length=0;seen.clear();epoch=null;dead=false;deathPart='body';deathAction=null;deathStart=[];deathPose=[];
    if(state){
      state.mixer.stopAllAction();state.lower='idle-lower';state.upper=state.weapon+'-upper';state.dead=false;
      state.actions[state.lower].reset().setEffectiveWeight(1).play();state.actions[state.upper].reset().setEffectiveWeight(1).play();state.mixer.update(0);
      state.animationPose=Object.values(state.bones).map(bone=>({bone,position:bone.position.clone(),quaternion:bone.quaternion.clone()}));
      state.display.visible=true;state.display.position.set(0,0,0);
    }
    Object.assign(group.userData.diagnostics,{lifecycle:'alive',deathPart:null,deathTime:0,hitReaction:null});
  }
  return {reset,
    triggerHit(part='body',shotId,lethal=false){
      if(shotId!=null){if(seen.has(shotId))return false;seen.add(shotId);if(seen.size>256)seen.delete(seen.values().next().value);}
      const p=part==='head'?'head':'body';if(lethal)deathPart=p;else pending.push(p);if(pending.length>4)pending.shift();return true;
    },
    before(dt,{dead:nextDead=false,crouch=false,spawnEpoch,respawnAt=0,serverNow=0,deathPart:authoritativePart}={}){
      const state=group.userData.native;if(!state)return false;
      if(!nextDead&&epoch!==null&&spawnEpoch!==undefined&&epoch!==spawnEpoch){
        reset();group.userData.combat?.reset();state.mixer.stopAllAction();state.lower='idle-lower';state.upper=state.weapon+'-upper';
        state.actions[state.lower].reset().setEffectiveWeight(1).play();state.actions[state.upper].reset().setEffectiveWeight(1).play();
      }
      if(spawnEpoch!==undefined)epoch=spawnEpoch;
      if(nextDead){
        if(!dead&&['head','body'].includes(authoritativePart))deathPart=authoritativePart;
        if(!dead){
          // Save the displayed standing/crouched pose before entering a full-body clip.
          deathStart=Object.values(state.bones).map(b=>({b,p:b.position.clone(),q:b.quaternion.clone()}));deathPose=[];state.deathFootTargets=state.feet.map(b=>b.getWorldPosition(b.position.clone()));
          group.userData.combat?.reset();stopHit(state);pending.length=0;deathBaseY=state.display.position.y;state.mixer.stopAllAction();deathAction=state.actions['death-'+deathPart];deathAction.reset().setEffectiveWeight(1).play();dead=true;
        }
        const elapsed=respawnAt>0&&serverNow>0?Math.max(0,(serverNow-(respawnAt-2000))/1000):Math.max(0,(deathAction.time||0)+dt);
        for(const {b,p,q} of deathPose){b.position.copy(p);b.quaternion.copy(q);}
        deathAction.enabled=true;deathAction.paused=false;deathAction.time=Math.min(deathAction.getClip().duration-1e-6,elapsed+(crouch?(deathPart==='head'?.3:.5):0));state.mixer.update(0);
        deathPose=Object.values(state.bones).map(b=>({b,p:b.position.clone(),q:b.quaternion.clone()}));
        const u=Math.min(1,elapsed/.12),blend=u*u*(3-2*u);
        if(blend<1)for(let i=0;i<deathPose.length;i++){const {b,p,q}=deathPose[i],start=deathStart[i];b.position.copy(start.p).lerp(p,blend);b.quaternion.copy(start.q).slerp(q,blend);}
        state.display.position.set(0,deathBaseY,0);state.display.visible=true;
        for(const h of Object.values(state.weaponHolders))h.visible=false;
        Object.assign(group.userData.diagnostics,{lifecycle:'dead',deathBlend:blend,deathPart,deathTime:deathAction.time,deathDuration:deathAction.getClip().duration,hitReaction:null});return true;
      }
      if(dead){deathAction?.stop();dead=false;deathAction=null;deathPart='body';state.lower='idle-lower';state.upper=state.weapon+'-upper';state.actions[state.lower].reset().setEffectiveWeight(1).play();state.actions[state.upper].reset().setEffectiveWeight(1).play();group.userData.combat?.reset();}
      const next=pending.shift();if(next){stopHit(state);const a=state.actions['hit-'+next];a.reset().setEffectiveWeight(0).play();hit={action:a,part:next,age:0,duration:Math.min(.4,a.getClip().duration)};}
      if(hit){hit.age+=Math.max(0,dt);hit.action.setEffectiveWeight(.3*Math.min(1,hit.age/.025)*Math.max(0,Math.min(1,(hit.duration-hit.age)/.1)));if(hit.age>=hit.duration){hit.action.stop();hit=null;}}
      Object.assign(group.userData.diagnostics,{lifecycle:'alive',deathPart:null,deathTime:0,hitReaction:hit?.part||null});return false;
    }
  };
}
