import {ADS_VIEW_PROFILES} from './ads.mjs';
// Screen-space overlay measured against the user's 1920x1080 ADS reference.
// It does not move the camera ray or change weapon accuracy.
export function createAdsReticle(parent){
  const node=document.createElement('div');node.className='vandalAdsReticle';node.setAttribute('aria-hidden','true');
  node.innerHTML=`<svg viewBox="0 0 210 156" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="adsGoldTop"><stop stop-color="#fff77b"/><stop offset="1" stop-color="#fff77b" stop-opacity="0"/></linearGradient></defs><g stroke="#fff77b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M80 1H55L1 27V54 M130 1H155L209 27V54 M1 102V129L55 155H80 M209 102V129L155 155H130"/></g></svg>`;
  parent.append(node);
  const scope=document.createElement('div');scope.className='sniperScope';scope.setAttribute('aria-hidden','true');scope.innerHTML='<span class="scopeHorizontal"></span><span class="scopeVertical"></span><i></i>';parent.append(scope);
  const rim=document.createElement('div');rim.className='scopeRim';rim.innerHTML=`<svg viewBox="-960 -540 1920 1080" xmlns="http://www.w3.org/2000/svg"><defs><mask id="scopeBody"><rect x="-960" y="-540" width="1920" height="1080" fill="white"/><circle r="550" fill="black"/></mask><radialGradient id="scopeMetal"><stop offset="75%" stop-color="#131518"/><stop offset="85%" stop-color="#343332"/><stop offset="94%" stop-color="#17191b"/><stop offset="100%" stop-color="#44413c"/></radialGradient></defs><g class="marshalControls" fill="#272829" stroke="#4c4b47" stroke-width="4"><rect x="-870" y="-425" width="185" height="860" rx="24"/><rect x="685" y="-425" width="185" height="860" rx="24"/></g><g class="operatorControls" mask="url(#scopeBody)" fill="#202223" stroke="#474744" stroke-width="4"><path d="M465-505L960-365V475L505 455A655 655 0 0 0 465-505Z"/><path d="M-960-450H-710L-650-370V355L-780 460H-960Z"/><rect x="-940" y="-390" width="95" height="780" rx="9"/></g><circle r="620" fill="none" stroke="url(#scopeMetal)" stroke-width="140"/><circle r="550" fill="none" stroke="#080a0b" stroke-width="9"/><g stroke="#242728" fill="none"><path d="M-550 0H-388 M388 0H550 M0-550V-388 M0 388V550" stroke-width="8"/><path d="M-66 204H66 M-112 293H112 M-143 386H143" stroke-width="2"/></g></svg>`;scope.append(rim);
  let shotAt=-Infinity,shotWeapon=null;
  const clamp=x=>Math.max(0,Math.min(1,x));
  return {node,
    shot(weapon,now=performance.now()){shotAt=now;shotWeapon=weapon;},
    setAmount(amount,{scoped=false,weapon='vandal',now=performance.now()}={}){
      const alpha=clamp((amount-.35)/.65),age=Math.max(0,(now-shotAt)/1000);
      // Only Vandal has a measured gold-frame firing sample (+8–9%).
      // Attack age controls the HUD response, never camera yaw/pitch or the gun rig.
      const pulse=weapon===shotWeapon&&weapon==='vandal'&&age<.18?Math.sin(Math.PI*clamp(age/.025)/2)*Math.exp(-Math.max(0,age-.025)/.065):0;
      const profile=ADS_VIEW_PROFILES[weapon];node.style.width=`${profile?.frameWidthVh||19.6}vh`;node.style.height=`${profile?.frameHeightVh||14.7}vh`;
      scope.classList.toggle('marshalScope',scoped&&profile?.scopeKind==='marshal');scope.classList.toggle('operatorScope',scoped&&profile?.scopeKind==='operator');
      const measured=!!profile?.scopeRadiusVh;scope.style.setProperty('--scope-radius',`${profile?.scopeRadiusVh||34}${measured?'vh':'vmin'}`);
      scope.style.setProperty('--optic-scale',String((profile?.scopeRadiusVh||50.93)/50.93));
      node.style.opacity=String(scoped?0:alpha);node.style.transform=`translate(-50%,-50%) scale(${1+.085*pulse})`;
      scope.style.opacity=String(scoped?alpha:0);node.dataset.weapon=weapon;
    }
  };
}
