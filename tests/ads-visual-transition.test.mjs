import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createADS,ADS_TIMING,adsFov} from '../public/ads.mjs';
import {createAdsReticle} from '../public/ads-reticle.mjs';
import {WEAPONS} from '../weapons.mjs';
const state=weapon=>({weapon,alive:true,playing:true,reloading:false,equipping:false,phase:'waiting'});
const advance=(ads,s,seconds,hz)=>{for(let t=0;t<seconds-1e-10;t+=1/hz)ads.update(Math.min(1/hz,seconds-t),s);};
test('all ADS weapons finish finite transitions at 30/60/144Hz, reverse continuously and cancel on reload/death',()=>{
 for(const [weapon,w] of Object.entries(WEAPONS)){if(!w.ads)continue;
  for(const hz of [30,60,144]){const ads=createADS(),s=state(weapon);ads.update(0,s);ads.toggle(s);advance(ads,s,ADS_TIMING.enter,hz);assert.equal(ads.amount,1,weapon+' enter '+hz);
   assert.ok(Math.abs(adsFov(74,1,ads.zoom)-adsFov(74,1,w.ads.zoom))<1e-10);
   ads.reset();const before=ads.amount;ads.update(0,s);assert.equal(ads.amount,before);advance(ads,s,ADS_TIMING.exit,hz);assert.ok(ads.amount<1e-12);
   ads.toggle(s);advance(ads,s,.1,hz);const mid=ads.amount;ads.reset();ads.update(0,s);assert.equal(ads.amount,mid);advance(ads,s,.04,hz);assert.ok(ads.amount<mid);
   ads.toggle(s);ads.update(0,s);const again=ads.amount;ads.update(.001,s);assert.ok(ads.amount>=again);
   ads.update(.001,{...s,reloading:true});assert.equal(ads.requested,false);ads.update(0,{...s,alive:false});assert.equal(ads.amount,0);
  }
 }
});
test('Operator zoom level and sensitivity follow one smooth timeline; weapon switch cannot carry zoom',()=>{
 const ads=createADS(),s=state('operator');ads.update(0,s);ads.toggle(s);advance(ads,s,.25,60);assert.equal(ads.zoom,2.5);ads.toggle(s);assert.equal(ads.zoom,2.5);
 ads.update(.08,s);assert.ok(ads.zoom>2.5&&ads.zoom<5);assert.equal(ads.sensitivityScale,1/ads.zoom);advance(ads,s,.08,60);assert.equal(ads.zoom,5);
 ads.toggle(s);advance(ads,s,.05,60);assert.equal(ads.requested,false);ads.toggle(s);advance(ads,s,.16,60);assert.equal(ads.zoom,2.5,'re-enter returns to first scope level');
 ads.update(0,state('guardian'));assert.equal(ads.amount,0);assert.equal(ads.zoom,1.5);assert.equal(ads.sensitivityScale,1);
});
test('recorded Vandal reticle pulse is centered, weapon-specific, and does not duplicate events',()=>{
 const old=globalThis.document;globalThis.document={createElement:()=>({style:{setProperty(k,v){this[k]=v;}},dataset:{},classList:{toggle(){}},setAttribute(){},append(){}})};
 try{const children=[],r=createAdsReticle({append:n=>children.push(n)});r.setAmount(1,{weapon:'vandal',now:0});assert.equal(r.node.style.transform,'translate(-50%,-50%) scale(1)');r.shot('vandal',100);r.setAmount(1,{weapon:'vandal',now:125});assert.equal(r.node.style.transform,'translate(-50%,-50%) scale(1.085)');r.setAmount(1,{weapon:'vandal',now:400});assert.equal(r.node.style.transform,'translate(-50%,-50%) scale(1)');r.setAmount(1,{weapon:'phantom',now:125});assert.equal(r.node.style.transform,'translate(-50%,-50%) scale(1)');r.setAmount(1,{weapon:'operator',scoped:true,now:125});assert.equal(r.node.style.opacity,'0');assert.equal(children[1].style.opacity,'1');
 }finally{globalThis.document=old;}
});
