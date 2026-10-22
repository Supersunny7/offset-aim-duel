import * as T from '/vendor/three.module.js';
import {WEAPONS} from '/weapons.mjs';
import {createReloadTimeline,createSourceReloadTimeline} from '/weapon-feel.mjs';

const EXTENDED_WEAPONS=['classic', 'shorty', 'frenzy', 'stinger', 'spectre', 'bucky', 'judge', 'bulldog', 'guardian', 'marshal', 'operator', 'ares', 'odin'];
export const OPPONENT_COMBAT_ANIMATIONS=['vandal-equip','vandal-reload','vandal-fire','ghost-equip','ghost-reload','ghost-fire','knife-equip','knife-fire','knife-secondary','phantom-equip','phantom-reload','phantom-fire','sheriff-equip','sheriff-reload','sheriff-fire'];

// Accepted shot events and snapshot deadlines are the only combat triggers.
export function createOpponentCombat(group,getMuzzle,switchLayer){
  const pending=[],seen=new Set(),fireStarts=new Map(),restoredSources=new Set();
  const reloadClock=createReloadTimeline(),ghostSourceClock=createSourceReloadTimeline();
  let reloadCoreWas=false,reloadFrame=null,returnBlend=null,lastRemaining=0,lastActionStartedAt=0;
  let needsSnapshot=true,snapshotRestores=0;
  let phase='idle',phaseWeapon=null,fire=null,knife=null,mechanicalKey=null,flashRemaining=0;
  const flash=new T.Mesh(new T.SphereGeometry(.045,6,4),new T.MeshBasicMaterial({color:0xffd48a,transparent:true,opacity:.9,depthWrite:false}));
  flash.name='Authoritative opponent muzzle flash';flash.visible=false;group.add(flash);
  function stopFire(state){
    fire=null;fireStarts.clear();
    if(state)for(const pool of Object.values(state.firePools))for(const action of pool)action.stop();
  }
  function cancel(state){
    pending.length=0;stopFire(state);needsSnapshot=true;restoredSources.clear();
    if(state){
      for(const name of [...Object.keys(state.actions).filter(name=>/-(upper|fire|fire-zoomed)$/.test(name)),...OPPONENT_COMBAT_ANIMATIONS,...EXTENDED_WEAPONS.flatMap(id=>['equip','reload','fire'].map(kind=>id+'-'+kind))])state.actions[name]?.stop();
      for(const model of Object.values(state.weaponModels))model.userData.updateAnimation?.(0,{visible:false,reloading:false});
    }
    reloadClock.reset();ghostSourceClock.reset();reloadCoreWas=false;reloadFrame=null;
    phase='idle';phaseWeapon=null;fire=null;knife=null;returnBlend=null;lastRemaining=0;lastActionStartedAt=0;mechanicalKey=null;flashRemaining=0;flash.visible=false;
  }
  // Return weights use action elapsed time, not mixer.fadeOut's frame-start
  // clock. At the ready deadline the blend is zero; pause dt=0 freezes it.
  function sampleReturn(state,dt,idle,serverNow=0){
    if(!returnBlend)return;
    returnBlend.age=returnBlend.at>0&&serverNow>0?Math.max(returnBlend.age,(serverNow-returnBlend.at)/1000):returnBlend.age+Math.max(0,dt);
    if(returnBlend.to!==state.actions[idle]){
      returnBlend.to.stop();switchLayer(state,'upper',idle,0);returnBlend.to=state.actions[idle];
    }
    const u=Math.min(1,returnBlend.age/returnBlend.duration);
    returnBlend.from.stopFading().setEffectiveWeight(1-u).setEffectiveTimeScale(0);
    returnBlend.to.stopFading().setEffectiveWeight(u);
    if(u>=1){returnBlend.from.stop();returnBlend=null;}
  }
  function beginReturn(state,idle,seconds,overshoot=0,serverNow=0){
    const from=state.actions[state.upper];
    from.setEffectiveTimeScale(0);from.time=from.getClip().duration;
    switchLayer(state,'upper',idle,0);
    returnBlend={from,to:state.actions[idle],duration:seconds,age:Math.max(0,overshoot),at:serverNow>0?serverNow-Math.max(0,overshoot)*1000:0};
    sampleReturn(state,0,idle,serverNow);
  }
  function startGunFire(state,event,elapsed=0){
    const pool=(event.ads??state.ads)&&state.firePools[event.weapon+'-zoomed']||state.firePools[event.weapon];if(!pool?.length)return;
    const next=pool.find(a=>a!==fire?.action)||pool[0];
    if(fire)fire.action.fadeOut(.06);
    next.stopFading().reset().setEffectiveTimeScale(event.startedAt>0?0:1).setEffectiveWeight(.55).fadeIn(.025).play();
    if(elapsed>0){next.stopFading().setEffectiveWeight(.55*Math.min(1,elapsed/.025));next.time=elapsed;}
    if(event.startedAt>0)fireStarts.set(next,event.startedAt);else fireStarts.delete(next);
    fire={action:next,age:elapsed,startedAt:event.startedAt,duration:next.getClip().duration,returning:false};
  }
  return {
    triggerFire(weapon,attack='primary',shotId,startedAt=null,ads=null){
      if(!WEAPONS[weapon])return false;
      if(startedAt>0&&restoredSources.has(weapon+'|'+attack+'|'+startedAt)){if(shotId!=null)seen.add(shotId);return false;}
      if(shotId!=null){if(seen.has(shotId))return false;seen.add(shotId);if(seen.size>256)seen.delete(seen.values().next().value);}
      pending.push({weapon,ads,attack:attack==='secondary'?'secondary':'primary',at:performance.now(),startedAt:Number.isFinite(startedAt)?startedAt:null});if(pending.length>8)pending.shift();return true;
    },
    syncSnapshot(snapshot,serverNow){
      const state=group.userData.native,weapon=snapshot?.weapon;if(!state||!WEAPONS[weapon]||!Number.isFinite(serverNow))return;
      if(phaseWeapon!==null&&phaseWeapon!==weapon)cancel(state);
      if(!needsSnapshot)return;needsSnapshot=false;if(snapshot.hp<=0||pending.length)return;
      phaseWeapon=weapon;snapshotRestores++;const idle=weapon+(snapshot.ads&&state.actions[weapon+'-alt-upper']?snapshot.crouch?'-alt-crouch-upper':'-alt-upper':snapshot.crouch?'-crouch-upper':'-upper');
      for(const name of [...Object.keys(state.actions).filter(name=>/-(upper|fire|fire-zoomed)$/.test(name)),...OPPONENT_COMBAT_ANIMATIONS,...['vandal','ghost','knife','phantom','sheriff'].flatMap(w=>[w+'-upper',w+'-crouch-upper'])])state.actions[name]?.stop();
      switchLayer(state,'upper',idle,0);state.actions[idle].reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
      const action=snapshot.hitboxAction,age=action?.at>0?(serverNow-action.at)/1000:-1;
      if(action?.weapon===weapon&&age>=0){
        lastActionStartedAt=action.at;
        if(weapon==='knife'&&['primary','secondary'].includes(action.kind)){
          const seconds=(action.kind==='secondary'?WEAPONS.knife.secondary.animationDuration:WEAPONS.knife.animationDuration)/1000;
          if(age<seconds+.065){pending.push({weapon,attack:action.kind,startedAt:action.at,at:performance.now(),snapshot:true});restoredSources.add(weapon+'|'+action.kind+'|'+action.at);}
        }else if(['reload','equip'].includes(action.kind)){
          const name=weapon+'-'+action.kind,native=state.actions[name],seconds=action.kind==='reload'&&weapon==='ghost'?native.getClip().duration:WEAPONS[weapon][action.kind]/1000;
          if(age<seconds+.055){switchLayer(state,'upper',name,0);native.stopFading().setEffectiveWeight(1).setEffectiveTimeScale(0);native.time=native.getClip().duration;phase=action.kind;
            if(age>=seconds){beginReturn(state,idle,.055,age-seconds,serverNow);phase='idle';}
            else{const weight=Math.min(1,age/.045);native.setEffectiveWeight(weight);state.actions[idle].play().stopFading().setEffectiveWeight(1-weight);native.time=action.kind==='reload'&&weapon==='ghost'?age:age/seconds*native.getClip().duration;}
          }
        }
      }
      if(phase==='idle'&&!returnBlend&&!pending.length&&weapon!=='knife'){
        for(const shot of snapshot.hitboxFire||[]){const clip=((shot.ads??snapshot.ads)&&state.firePools[weapon+'-zoomed']||state.firePools[weapon])?.[0]?.getClip(),elapsed=(serverNow-shot.at)/1000;if(shot.weapon!==weapon||elapsed<0||!clip||elapsed>=clip.duration+.08)continue;
          startGunFire(state,{weapon,ads:shot.ads,startedAt:shot.at},elapsed);restoredSources.add(weapon+'|primary|'+shot.at);phase='fire';
        }
      }
      flashRemaining=0;flash.visible=false;
    },
    isReturning(){return !!returnBlend;},
    reset(){
      const state=group.userData.native;cancel(state);seen.clear();
      if(state){state.upper=state.weapon+'-upper';state.actions[state.upper]?.reset().setEffectiveWeight(1).play();state.mixer.update(0);}
      Object.assign(group.userData.diagnostics,{combat:'idle',combatQueued:0,muzzleFlash:false});
    },
    before(dt,{weapon='vandal',dead=false,crouch=false,reloadRemaining=0,equipRemaining=0,serverNow=0,actionStartedAt=null,fireStartedAt=null}={}){
      const state=group.userData.native,idle=weapon+(state?.ads&&state.actions[weapon+'-alt-upper']?crouch?'-alt-crouch-upper':'-alt-upper':crouch?'-crouch-upper':'-upper');if(!state)return idle;
      flashRemaining=Math.max(0,flashRemaining-dt);
      if(dead){cancel(state);return idle;}
      if(phaseWeapon!==null&&phaseWeapon!==weapon)cancel(state);phaseWeapon=weapon;
      if(actionStartedAt>0){if(returnBlend&&lastActionStartedAt>0&&returnBlend.at>0)returnBlend.at+=actionStartedAt-lastActionStartedAt;lastActionStartedAt=actionStartedAt;}
      const now=performance.now();
      while(pending.length&&(pending[0].weapon!==weapon||(pending[0].startedAt===null&&now-pending[0].at>350)))pending.shift();
      const core=weapon!=='knife'&&reloadRemaining>0;
      if(core&&!reloadCoreWas){reloadClock.reset();ghostSourceClock.reset();}reloadCoreWas=core;reloadFrame=null;
      const desired=core?'reload':equipRemaining>0?'equip':null;
      sampleReturn(state,dt,idle,serverNow);
      if(desired){
        if(returnBlend){returnBlend.from.stop();returnBlend=null;}
        stopFire(state);knife=null;flashRemaining=0;
        const name=weapon+'-'+desired,action=state.actions[name];
        if(phase!==desired||state.upper!==name){switchLayer(state,'upper',name,.045);phase=desired;}
        const duration=WEAPONS[weapon][desired]/1000,remaining=desired==='reload'?reloadRemaining:equipRemaining,nativeDuration=action.getClip().duration,rate=nativeDuration/duration;lastRemaining=remaining;
        action.enabled=true;action.paused=false;
        if(actionStartedAt>0&&serverNow>=actionStartedAt){const weight=Math.min(1,(serverNow-actionStartedAt)/45);action.stopFading().setEffectiveWeight(weight);state.actions[idle].play().stopFading().setEffectiveWeight(1-weight);}
        if(desired==='reload'){
          const clock=weapon==='ghost'?ghostSourceClock.sample(nativeDuration,duration,{dt,mechanical:true,remaining}):reloadClock.sample(duration,remaining);
          reloadFrame={phase:clock.phase,sourceSeconds:clock.sourceSeconds,cosmetic:false};
          action.setEffectiveTimeScale(0);action.time=clock.phase*nativeDuration;
        }else{
          action.setEffectiveTimeScale(0);
          action.time=nativeDuration*T.MathUtils.clamp(1-remaining/duration,0,1);
        }
        return name;
      }
      // TP Ghost has its own 1.534s source clip, not the 2.517s FP animation.
      // Its short native tail is cosmetic and never delays an accepted shot.
      if(weapon==='ghost'&&phase==='reload'&&equipRemaining<=0&&!pending.length){
        const action=state.actions['ghost-reload'],nativeDuration=action.getClip().duration;
        const prior=action.time;
        const sourceAge=actionStartedAt>0&&serverNow>0?Math.max(0,(serverNow-actionStartedAt)/1000):null;
        const clock=sourceAge===null?ghostSourceClock.sample(nativeDuration,WEAPONS.ghost.reload/1000,{dt,mechanical:false,remaining:0}):{sourceSeconds:Math.min(nativeDuration,sourceAge),phase:Math.min(1,sourceAge/nativeDuration),finished:sourceAge>=nativeDuration};
        lastRemaining=Math.max(0,nativeDuration-prior);
        action.enabled=true;action.paused=false;action.setEffectiveTimeScale(0);action.time=clock.sourceSeconds;
        if(!clock.finished){reloadFrame={phase:clock.phase,sourceSeconds:clock.sourceSeconds,cosmetic:true};return 'ghost-reload';}
      }
      if(phase==='reload'||phase==='equip'){
        const seconds=phase==='reload'&&weapon==='ghost'?state.actions['ghost-reload'].getClip().duration:WEAPONS[weapon][phase]/1000;
        const overshoot=actionStartedAt>0&&serverNow>0?(serverNow-actionStartedAt)/1000-seconds:dt-lastRemaining;
        beginReturn(state,idle,.055,overshoot,serverNow);phase='idle';reloadClock.reset();ghostSourceClock.reset();}
      let event=pending[0]?.startedAt>serverNow&&serverNow>0?null:pending.shift();
      const elapsed=event?.startedAt!==null&&event?.startedAt!==undefined&&serverNow>0?Math.max(0,(serverNow-event.startedAt)/1000):Math.max(0,dt);
      const lifetime=weapon==='knife'?(event?.attack==='secondary'?WEAPONS.knife.secondary.animationDuration:WEAPONS.knife.animationDuration)/1000+.065:(state.firePools[weapon]?.[0]?.getClip().duration||0)+.08;
      if(event&&elapsed>=lifetime)event=null;
      if(event){
        if(returnBlend){returnBlend.from.stop();returnBlend.to.stopFading().setEffectiveWeight(1);returnBlend=null;}
        if(weapon==='knife'){
          const name=event.attack==='secondary'?'knife-secondary':'knife-fire';stopFire(state);switchLayer(state,'upper',name,.035);
          const action=state.actions[name];action.reset().setEffectiveWeight(1).play();
          const seconds=(event.attack==='secondary'?WEAPONS.knife.secondary.animationDuration:WEAPONS.knife.animationDuration)/1000;
          action.setEffectiveTimeScale(action.getClip().duration/seconds);phase='knife';
          knife={age:Math.max(0,elapsed-dt),startedAt:event.startedAt,seconds,contact:(event.attack==='secondary'?WEAPONS.knife.secondary.contact:WEAPONS.knife.contact)/1000,sourceContact:event.attack==='secondary'?3/116:5/41,attack:event.attack,snapshot:!!event.snapshot};
        }else{
          switchLayer(state,'upper',idle,.04);startGunFire(state,event,Math.max(0,elapsed-dt));state.weaponModels[weapon]?.userData.fire?.();flashRemaining=Math.max(0,.045-(event.startedAt!==null?elapsed:0));phase='fire';
        }
      }
      if(phase==='knife'&&knife){
        // Measured furthest-forward blade sample aligns with the shared contact
        // deadline. This is an engineered visual landmark, not a PSA marker.
        if(actionStartedAt>0)knife.startedAt=actionStartedAt;
        const knifeElapsed=knife.startedAt>0&&serverNow>0?Math.max(knife.age,(serverNow-knife.startedAt)/1000):knife.age+Math.max(0,dt);knife.age=Math.min(knife.seconds,knifeElapsed);
        const u=knife.age<=knife.contact?knife.sourceContact*knife.age/knife.contact:knife.sourceContact+(1-knife.sourceContact)*(knife.age-knife.contact)/(knife.seconds-knife.contact);
        const action=state.actions[state.upper];action.setEffectiveTimeScale(0);action.time=action.getClip().duration*u;
        if(knife.snapshot){const weight=Math.min(1,knife.age/.035);action.stopFading().setEffectiveWeight(1);state.actions[idle].play().stopFading().setEffectiveWeight(1-weight);}
        if(knife.age>=knife.seconds){beginReturn(state,idle,.065,knifeElapsed-knife.seconds,serverNow);knife=null;phase='idle';}
      }
      if(fire){if(fireStartedAt>0){const shift=fire.startedAt>0?fireStartedAt-fire.startedAt:0;if(shift)for(const [action,at] of fireStarts)fireStarts.set(action,at+shift);fire.startedAt=fireStartedAt;}if(fire.startedAt>0&&serverNow>0){fire.age=Math.max(0,(serverNow-fire.startedAt)/1000);fire.action.setEffectiveTimeScale(0);fire.action.time=Math.min(fire.duration,fire.age);}else fire.age+=dt;if(!fire.returning&&fire.age>=fire.duration){fire.action.fadeOut(.08);fire.returning=true;}if(fire.age>=fire.duration+.08){fire.action.stop();fire=null;phase='idle';}}
      if(serverNow>0)for(const [action,at] of fireStarts){
        const age=Math.max(0,(serverNow-at)/1000),duration=action.getClip().duration,nextAt=Math.min(...[...fireStarts.values()].filter(next=>next>at));
        const fade=Number.isFinite(nextAt)?Math.max(0,1-(serverNow-nextAt)/60):age>duration?Math.max(0,1-(age-duration)/.08):Math.min(1,age/.025);
        action.stopFading().setEffectiveWeight(.55*fade).setEffectiveTimeScale(0);action.time=Math.min(duration,age);
      }
      if(phase!=='knife')switchLayer(state,'upper',idle,.06);
      return state.upper;
    },
    after(dt,{weapon='vandal',dead=false,reloadRemaining=0,equipRemaining=0,serverNow=0,fireStartedAt=null}={}){
      const state=group.userData.native;if(!state)return;
      const mode=dead?'hidden':reloadFrame?'reload':weapon!=='knife'&&reloadRemaining>0?'reload':equipRemaining>0?'equip':'idle',key=weapon+':'+mode,entering=key!==mechanicalKey;mechanicalKey=key;
      for(const [kind,model] of Object.entries(state.weaponModels)){
        const visible=kind===weapon&&!dead,update=model.userData.updateAnimation?.bind(model.userData);if(!update)continue;
        if(!visible){update(0,{visible:false,reloading:false});continue;}
        const duration=mode==='reload'?WEAPONS[weapon].reload/1000:mode==='equip'?WEAPONS[weapon].equip/1000:0,remaining=mode==='reload'?reloadRemaining:equipRemaining;
        if(model.userData.sampleOpponentMechanics){model.userData.sampleOpponentMechanics(dt,{visible,mode,shotAge:serverNow>0&&fireStartedAt>0?Math.max(0,(serverNow-fireStartedAt)/1000):null,phase:mode==='reload'&&reloadFrame?reloadFrame.phase:duration?1-remaining/duration:0});continue;}
        const reloading=mode==='reload';update(0,{visible:true,reloading});if(entering&&mode==='equip')model.userData.equip?.();
        update(entering&&duration>0?Math.max(0,duration-remaining):Math.max(0,dt),{visible:true,reloading});
      }
      flash.visible=!dead&&weapon!=='knife'&&flashRemaining>0;
      if(flash.visible){group.updateWorldMatrix(true,true);flash.position.copy(group.worldToLocal(getMuzzle(group)));}
      Object.assign(group.userData.diagnostics,{combat:phase,returnBlend: returnBlend?{age:returnBlend.age,duration:returnBlend.duration}:null,reloadCosmetic:!!reloadFrame?.cosmetic,reloadSourceSeconds:reloadFrame?.sourceSeconds??null,reloadSourcePhase:reloadFrame?.phase??null,combatUpper:state.upper,combatQueued:pending.length,muzzleFlash:flash.visible,combatEvents:seen.size,snapshotRestores,mechanics:'GNTP shared deadline phase; Vandal equip/fire have no GNTP source'});
      group.userData.diagnostics.knifeAttack=knife?{attack:knife.attack,elapsed:knife.age,contact:knife.contact,sourceContact:knife.sourceContact}:null;
      group.userData.diagnostics.mechanicalPhase=state.weaponModels[weapon]?.userData.animationDiagnostics?.phase??null;
      group.userData.diagnostics.mechanicalActive=state.weaponModels[weapon]?.userData.animationDiagnostics?.active??null;
    }
  };
}
