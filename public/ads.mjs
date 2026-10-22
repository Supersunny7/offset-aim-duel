// Visual timeline only. Server damage, movement and fire gates stay authoritative.
import {WEAPONS} from '../weapons.mjs';
export const ADS_ZOOM=WEAPONS.vandal.ads.zoom;
// Vandal visible source-frame windows: enter 233–251ms, exit 200ms.
// Other weapons share provisional visual timing, not claimed Riot clip timings.
export const ADS_TIMING=Object.freeze({enter:.250,exit:.217,zoom:.160});
export const adsEase=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function adsFov(hipFov,amount,zoom=ADS_ZOOM){return 2*Math.atan(Math.tan(hipFov*Math.PI/360)/(1+(zoom-1)*amount))*180/Math.PI;}
export function createADS(){
 let requested=false,amount=0,phase=0,currentWeapon='vandal',zoomIndex=0,zoomFrom=ADS_ZOOM,zoomCurrent=ADS_ZOOM,zoomTarget=ADS_ZOOM,zoomAge=ADS_TIMING.zoom;
 const allowed=s=>!!WEAPONS[s.weapon]?.ads&&s.alive&&s.playing&&!s.reloading&&!s.equipping&&['active','waiting'].includes(s.phase);
 const baseZoom=()=>WEAPONS[currentWeapon]?.ads?.zoom||ADS_ZOOM;
 const setZoom=(value,immediate=false)=>{zoomFrom=zoomCurrent;zoomTarget=value;zoomAge=immediate?ADS_TIMING.zoom:0;if(immediate)zoomCurrent=value;};
 return {
  toggle(s){if(!allowed(s)){requested=false;return false;}currentWeapon=s.weapon;const levels=WEAPONS[s.weapon].ads.zoomLevels||[WEAPONS[s.weapon].ads.zoom];if(requested&&zoomIndex<levels.length-1){zoomIndex++;setZoom(levels[zoomIndex]);}else{requested=!requested;zoomIndex=0;if(requested)setZoom(levels[0],phase===0);}return requested;},
  reset(immediate=false){requested=false;zoomIndex=0;if(immediate){phase=amount=0;setZoom(baseZoom(),true);}},
  update(dt,s){
   dt=Number.isFinite(dt)?Math.max(0,dt):0;
   if(currentWeapon!==s.weapon){requested=false;zoomIndex=0;currentWeapon=s.weapon;phase=amount=0;setZoom(baseZoom(),true);}
   if(!allowed(s))requested=false;
   if(!WEAPONS[s.weapon]?.ads||!s.alive)phase=0;
   else phase=Math.max(0,Math.min(1,phase+(requested?dt/ADS_TIMING.enter:-dt/ADS_TIMING.exit)));
   amount=adsEase(phase);zoomAge=Math.min(ADS_TIMING.zoom,zoomAge+dt);zoomCurrent=zoomFrom+(zoomTarget-zoomFrom)*adsEase(zoomAge/ADS_TIMING.zoom);
   if(phase===0){zoomIndex=0;setZoom(baseZoom(),true);}
   return amount;
  },
  get zoom(){return zoomCurrent;},get requested(){return requested;},get amount(){return amount;},get sensitivityScale(){return 1/(1+(zoomCurrent-1)*amount);}
 };
}

// Measured saved frames from the user's fteRz6Y59AA reference. These are
// visual fits, not gameplay values or edits to original skeleton/PSA keys.
export const ADS_VIEW_PROFILES=Object.freeze({
 stinger:Object.freeze({frameWidthVh:17.69,frameHeightVh:13.06,topFraction:.5963,viewOffsetY:-.08901282696641337,viewPitch:-.09796260244817696,viewTranslationY:.07495758160734865,viewTranslationZ:.13594940274179929,provisional:true,referenceSeconds:82}),
 bulldog:Object.freeze({frameWidthVh:21.1,frameHeightVh:15.93,topFraction:.6241,viewOffsetY:-.09273199120299858,viewPitch:-0.1473023034920141,viewTranslationY:0.0932677506572288,viewTranslationZ:0.0813969579769856,referenceSeconds:120.4,provisional:true}),
 ares:Object.freeze({frameWidthVh:17.7,frameHeightVh:13.1,topFraction:.565,viewOffsetY:-.10118744931497876,viewPitch:-0.08224677565039377,viewTranslationY:0.08278451732869448,viewTranslationZ:0.09287349544239958,referenceSeconds:346.2,provisional:true}),
 // Rechecked paused video at377.4s: Odin is ADS; receiver fit is approximate.
 odin:Object.freeze({frameWidthVh:19.6,frameHeightVh:14.7,topFraction:.600,viewOffsetY:-.14319435077013049,viewPitch:-0.10467164407560826,viewTranslationY:0.13160043261700338,viewTranslationZ:0.12028420031134958,referenceSeconds:377.4,provisional:true}),
 phantom:Object.freeze({frameWidthVh:21.0,frameHeightVh:15.66,topFraction:.590,viewOffsetY:-0.07988663462823231,viewPitch:-0.0835658537320448,viewTranslationY:0.066258592256,viewTranslationZ:0.18841263950397436,referenceSeconds:165.4,provisional:true}),
 guardian:Object.freeze({frameWidthVh:27.13,frameHeightVh:19.63,topFraction:.660,viewOffsetY:-0.1690260861087659,viewPitch:-0.15313315368743147,viewTranslationY:0.17577406591451947,viewTranslationZ:0.19099422180572276,referenceSeconds:180.6,provisional:true}),
 marshal:Object.freeze({scopeRadiusVh:50.93,scopeKind:'marshal'}),
 operator:Object.freeze({scopeRadiusVh:52.05,scopeKind:'operator',lensMeasured:true,referenceSeconds:267.551128,provisional:true})
});
export function scopeViewmodelOpacity(amount,scoped){return scoped?1-Math.max(0,Math.min(1,(amount-.65)/.35)):1;}
const materialCache=new WeakMap();
// Only scope transitions touch alpha. Hip restores exact original material flags.
export function applyScopeViewmodelOpacity(root,opacity){
 if(!root)return;let entries=materialCache.get(root);
 if(!entries){if(opacity===1)return;const seen=new Set();entries=[];root.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m&&!seen.has(m)){seen.add(m);entries.push({m,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite});}});materialCache.set(root,entries);}
 for(const entry of entries){const {m}=entry,transparent=opacity<1||entry.transparent;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.opacity=entry.opacity*opacity;m.depthWrite=entry.depthWrite;}
}

// Scope magnification belongs to the world. Keeping the fading first-person
// model at its hip projection prevents it ballooning into the lens at 2.5x/5x.
export function renderScopedViewmodel(camera,scoped,draw){
 if(!scoped||camera.fov===74)return draw();
 const worldFov=camera.fov;camera.fov=74;camera.updateProjectionMatrix();
 try{return draw();}finally{camera.fov=worldFov;camera.updateProjectionMatrix();}
}

// Video-derived attachments on original GN Root. Not original resource meshes.
export const REFERENCE_OPTIC_FITS=Object.freeze({
  "bulldog": {
    "seconds": 120.4,
    "triangleY": 0.6666666666666666,
    "width": 0.21296296296296297,
    "position": [
      0.00001410149710577319,
      0.1461704735168637,
      0.09962047293607706
    ],
    "quaternion": [
      0.07358444189944878,
      -0.00014294946907966724,
      -0.0019374091876934478,
      0.9972870980422015
    ],
    "scale": [
      0.5177025893874115,
      0.517702589396211,
      0.5177025893962051
    ],
    "receiverDepth": 0.15153078990657787,
    "triangleDepth": 0.10415887187187475
  },
  "guardian": {
    "seconds": 180.6,
    "triangleY": 0.7055555555555556,
    "width": 0.26666666666666666,
    "position": [
      0.000051374273235977883,
      0.1663933157068661,
      -0.17938779892715917
    ],
    "quaternion": [
      0.07649164579976513,
      -0.00014817236017332925,
      -0.0019314114414181553,
      0.9970683405953872
    ],
    "scale": [
      0.7712062881474314,
      0.7712062881447835,
      0.7712062881447851
    ],
    "receiverDepth": 0.35170536928608204,
    "triangleDepth": 0.14869730129276845
  },
  "phantom": {
    "seconds": 165.4,
    "triangleY": 0.6533827618164968,
    "width": 0.19462465245597776,
    "position": [
      0.00007316853016180691,
      0.16451885493716276,
      -0.19927660618832063
    ],
    "quaternion": [
      0.04176982328471754,
      -0.00008382367244934138,
      -0.002004632759901126,
      0.9991252455442478
    ],
    "scale": [
      0.46675977130357044,
      0.46675977130351853,
      0.4667597713035186
    ],
    "receiverDepth": 0.24634685798978553,
    "triangleDepth": 0.10275798491104524
  },
  "ares": {
    "seconds": 346.2,
    "triangleY": 0.6367006487488415,
    "width": 0.17145505097312327,
    "position": [
      -5.3446695694438305e-12,
      0.1650543885359906,
      0.03748833846468587
    ],
    "quaternion": [
      0.0411117973238581,
      1.8445291797938921e-9,
      2.99144532977327e-8,
      0.9991545526698065
    ],
    "scale": [
      0.3162569703522734,
      0.3162569703526783,
      0.3162569703526784
    ],
    "receiverDepth": 0.08039177136016684,
    "triangleDepth": 0.07271058865462629
  },
  "odin": {
    "seconds": 377.4,
    "triangleY": 0.6348470806302131,
    "width": 0.17794253938832252,
    "position": [
      -4.419503742688568e-9,
      0.15971654793001153,
      -0.08051394986654394
    ],
    "quaternion": [
      0.05231193427216019,
      5.38027001371087e-9,
      1.1417581036177434e-7,
      0.9986307934029934
    ],
    "scale": [
      0.5893497167675368,
      0.5893497167675367,
      0.5893497167675366
    ],
    "receiverDepth": 0.2545358014552449,
    "triangleDepth": 0.13055729195744523
  }
});
