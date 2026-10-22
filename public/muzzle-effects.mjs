import {WEAPONS} from '/weapons.mjs';
import * as T from '/vendor/three.module.js';

// Local -Z is the barrel direction. Callers position/orient this root at the
// actual muzzle; animation only changes children, never that attachment.
export function createMuzzleFlash(){
 const root=new T.Group();root.name='Muzzle combustion';root.visible=false;
 const sphere=new T.SphereGeometry(1,10,7),tongueGeometry=new T.ConeGeometry(1,1,5,1);
 const softMaterial=(color,opacity,blending)=>new T.ShaderMaterial({
  uniforms:{tint:{value:new T.Color(color)},alpha:{value:opacity}},transparent:true,depthWrite:false,blending,
  vertexShader:'varying vec3 n; varying vec3 eye; void main(){vec4 p=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); eye=normalize(-p.xyz); gl_Position=projectionMatrix*p;}',
  fragmentShader:'uniform vec3 tint; uniform float alpha; varying vec3 n; varying vec3 eye; void main(){float soft=pow(abs(dot(normalize(n),normalize(eye))),1.6); gl_FragColor=vec4(tint,alpha*soft);}'
 });
 const coreMaterial=softMaterial(0xfff4ce,0,T.AdditiveBlending),haloMaterial=softMaterial(0xff9f37,0,T.AdditiveBlending),smokeMaterial=softMaterial(0xaaa297,0,T.NormalBlending);
 const tongueMaterial=new T.MeshBasicMaterial({color:0xffb452,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide});
 const core=new T.Mesh(sphere,coreMaterial),halo=new T.Mesh(sphere,haloMaterial),smoke=new T.Mesh(sphere,smokeMaterial);
 core.name='Warm white combustion core';halo.name='Soft combustion halo';smoke.name='Brief muzzle vapor';
 const tongues=Array.from({length:5},(_,i)=>{const mesh=new T.Mesh(tongueGeometry,tongueMaterial);mesh.name='Irregular flame tongue '+i;mesh.rotation.x=-Math.PI/2;root.add(mesh);return mesh;});
 root.add(core,halo,smoke);root.traverse(o=>{o.frustumCulled=false;});
 let born=-Infinity,weapon='vandal',size=1,disposed=false;
 const diagnostics={active:false,weapon:null,triggers:0,ageMs:0,flashMs:0,smokeMs:0,peakStrength:0,meshCount:8,geometryCount:2,materialCount:4};
 const random=(seed,i)=>{const v=Math.sin(seed*12.9898+i*78.233)*43758.5453;return v-Math.floor(v);};
 const zero=()=>{coreMaterial.uniforms.alpha.value=0;haloMaterial.uniforms.alpha.value=0;smokeMaterial.uniforms.alpha.value=0;tongueMaterial.opacity=0;};
 const effects={
  diagnostics,
  trigger({weapon:requested='vandal',seed=0,now=globalThis.performance?.now?.()??Date.now(),ads=false}={}){
   if(disposed||!(WEAPONS[requested]?.capacity>0)||!Number.isFinite(now))return false;
   weapon=requested;born=now;seed=Number.isFinite(seed)?seed:0;
   // Suppressor keeps Ghost flash substantially smaller and dimmer; ADS avoids
   // obscuring the aligned sight without changing the supplied muzzle position.
   size=(weapon==='ghost'?.34:weapon==='phantom'?.42:weapon==='sheriff'?.65:1)*(ads?.82:1);
   core.position.set(0,0,-.025*size);core.scale.set(.022*size,.019*size,.053*size);
   halo.position.set(0,0,-.048*size);halo.scale.set(.052*size,.046*size,.09*size);
   for(let i=0;i<tongues.length;i++){
    const angle=i*2.399963+random(seed,0)*Math.PI*2,radius=(.009+random(seed,i+1)*.016)*size;
    const tongue=tongues[i];tongue.position.set(Math.cos(angle)*radius,Math.sin(angle)*radius,-(.039+random(seed,i+6)*.036)*size);
    tongue.scale.set((.008+random(seed,i+11)*.008)*size,(.06+random(seed,i+16)*.065)*size,(.006+random(seed,i+21)*.005)*size);
    tongue.rotation.set(-Math.PI/2+(random(seed,i+26)-.5)*.4,(random(seed,i+31)-.5)*.4,angle);
    tongue.visible=weapon!=='ghost'||i<2;
   }
   diagnostics.weapon=weapon;diagnostics.triggers++;diagnostics.flashMs=weapon==='ghost'?24:43;diagnostics.smokeMs=weapon==='ghost'?95:135;diagnostics.peakStrength=weapon==='ghost'?.36:1;
   root.visible=true;effects.update(now);return true;
  },
  update(now=globalThis.performance?.now?.()??Date.now()){
   if(disposed||!Number.isFinite(now))return;
   const age=Math.max(0,now-born);diagnostics.ageMs=Number.isFinite(age)?age:0;
   if(age>=diagnostics.smokeMs||born===-Infinity){root.visible=false;diagnostics.active=false;zero();return;}
   root.visible=true;diagnostics.active=true;
   const flame=Math.pow(Math.max(0,1-age/diagnostics.flashMs),1.4)*diagnostics.peakStrength;
   coreMaterial.uniforms.alpha.value=flame;haloMaterial.uniforms.alpha.value=flame*.32;tongueMaterial.opacity=flame*.6;
   const puff=age/diagnostics.smokeMs,expansion=size*(.017+puff*.035);
   smoke.position.set(0,puff*.017*size,-(.05+puff*.085)*size);smoke.scale.set(expansion,expansion*.85,expansion*1.15);
   smokeMaterial.uniforms.alpha.value=Math.sin(Math.PI*puff)*.065*(weapon==='ghost'?.4:1);
  },
  clear(){born=-Infinity;root.visible=false;diagnostics.active=false;diagnostics.ageMs=0;zero();},
  dispose(){if(disposed)return;effects.clear();sphere.dispose();tongueGeometry.dispose();for(const material of [coreMaterial,haloMaterial,smokeMaterial,tongueMaterial])material.dispose();disposed=true;}
 };
 root.userData.effects=effects;return root;
}
