import * as T from '/vendor/three.module.js';
import {GLTFLoader} from '/vendor/addons/loaders/GLTFLoader.js';
import {WEAPONS} from '/weapons.mjs';
import {mergeGeometries} from '/vendor/addons/utils/BufferGeometryUtils.js';

const loader=new GLTFLoader();
const base='/assets/packs/';
const plainName=o=>(o.name||'').replace(/[ .]/g,'_');

export function disposeImportedWeapon(root){
  if(!root)return;root.removeFromParent();const resources=new Set();
  root.traverse(o=>{if(!o.isMesh)return;resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const value of Object.values(m))if(value?.isTexture)resources.add(value);}});
  for(const resource of resources)resource.dispose();
}

// Hidden spare meshes must never contribute to normalization or muzzle placement.
export function visibleBounds(root) {
  root.updateMatrixWorld(true);
  const bounds=new T.Box3();
  root.traverseVisible(o=>{
    if(!o.isMesh)return;
    o.geometry.computeBoundingBox();
    if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();bounds.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}
    else bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  return bounds;
}
function report(root,source) {
  let meshes=0,triangles=0,skinnedMeshes=0;
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverseVisible(o=>{if(!o.isMesh)return;meshes++;skinnedMeshes+=o.isSkinnedMesh?1:0;geometries.add(o.geometry);triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}
  });
  const bounds=visibleBounds(root),size=bounds.getSize(new T.Vector3());
  return {source,meshes,skinnedMeshes,triangles:Math.round(triangles),geometries:geometries.size,materials:materials.size,textures:textures.size,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},size:size.toArray()};
}
function setupMaterials(root,viewmodel=false) {
  root.traverse(o=>{if(!o.isMesh)return;o.castShadow=!viewmodel;o.receiveShadow=!viewmodel;o.frustumCulled=!viewmodel;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      // Exported normal maps and roughness are kept, never replaced by grey placeholders.
      if(m.map)m.map.colorSpace=T.SRGBColorSpace;
      if(m.transparent){m.depthWrite=false;m.alphaTest=Math.max(m.alphaTest||0,.04);}
    }
  });
}
function socketFromMuzzle(root,bounds) {
  const candidates=[];
  root.traverse(o=>{if(/^Muzzle(?:_\d+)?$/.test(o.name))candidates.push(o.getWorldPosition(new T.Vector3()));});
  // Once oriented, forward is -Z. The silencer socket is ahead of the pistol's socket.
  const point=candidates.sort((a,b)=>a.z-b.z)[0]||new T.Vector3(bounds.getCenter(new T.Vector3()).x,bounds.max.y-.025,bounds.min.z);
  // Ghost pack reuses a Classic silencer armature: its named socket is ~8 cm
  // behind the actual silencer tip. Clamp to the measured rendered tip.
  if(point.z>bounds.min.z+.025)point.z=bounds.min.z-.005;
  const socket=new T.Object3D();socket.name='ImportedMuzzleSocket';socket.position.copy(root.worldToLocal(point.clone()));root.add(socket);return socket;
}

export async function loadImportedWeapon(kind,{viewmodel=true,length}={}) {
  if(!WEAPONS[kind])throw new Error('Unknown imported weapon: '+kind);
  const gltf=await loader.loadAsync(base+kind+'.glb');
  const asset=gltf.scene;
  if(kind==='ghost')asset.traverse(o=>{if(o.isMesh)o.visible=/GN_Luger_S0_Skelmesh|GN_Silencer_S0_Skelmesh/.test(plainName(o));});
  const root=new T.Group();root.name='Imported '+kind;root.add(asset);
  if(!['ghost','knife','vandal'].includes(kind)){
    // New source GLBs preserve their genuine GN armature, original grip origin,
    // materials and (Phantom) original bone-parented magazine. No normalization
    // or copy-named legacy weapon is used; legacy branches below are unchanged.
    asset.rotation.y=Math.PI/2;root.updateMatrixWorld(true);setupMaterials(root,viewmodel);
    const bounds=visibleBounds(root),nativeMuzzle=asset.getObjectByName('Muzzle');
    if(!nativeMuzzle?.isBone)throw Error(kind+' original muzzle bone missing');
    const point=nativeMuzzle.getWorldPosition(new T.Vector3());
    if(kind==='phantom'){
      const suppressor=asset.getObjectByName('Phantom_Source_Suppressor');
      // Preserve original bore height/axis, move the emitter to the actual tip.
      if(suppressor)point.z=visibleBounds(suppressor).min.z-.003;
      else if(point.z>bounds.min.z+.025)point.z=bounds.min.z-.003;
    }
    const muzzle=new T.Object3D();muzzle.name=kind+' native animated muzzle emitter';
    muzzle.position.copy(nativeMuzzle.worldToLocal(point.clone()));nativeMuzzle.add(muzzle);
    const reflex=asset.getObjectByName('Reflex');
    const sight=reflex?root.worldToLocal(reflex.getWorldPosition(new T.Vector3())):new T.Vector3(0,bounds.max.y-.028,Math.max(bounds.min.z+.14,-.25));
    const barrel=asset.getObjectByName('Barrel');
    const bore=barrel?root.worldToLocal(nativeMuzzle.getWorldPosition(new T.Vector3())).sub(root.worldToLocal(barrel.getWorldPosition(new T.Vector3()))).normalize():new T.Vector3(0,0,-1);
    Object.assign(root.userData,{imported:true,kind,model:asset,muzzle,nativeGrip:true,nativeSight:sight,nativeBore:bore,assetDiagnostics:report(root,kind+'.glb')});
    return {root,muzzle,clips:gltf.animations,diagnostics:root.userData.assetDiagnostics};
  }
  if(kind==='ghost'){
    // GN Luger is already in metres with its authored grip at the origin.
    // Preserve this source frame for FP and TP; centering needs a manual
    // TP compensation and changes the authored grip/weapon proportions.
    asset.rotation.y=Math.PI/2;root.updateMatrixWorld(true);setupMaterials(root,viewmodel);
    const bounds=visibleBounds(root),muzzle=socketFromMuzzle(root,bounds);
    Object.assign(root.userData,{imported:true,kind,muzzle,nativeGrip:true,assetDiagnostics:report(root,kind+'.glb')});
    return {root,muzzle,clips:gltf.animations,diagnostics:root.userData.assetDiagnostics};
  }
  if(kind==='knife'){
    // Keep the original metre scale and GN Root/grip origin for FP. The FP
    // socket supplies the authored pose; an extra upright/centred transform
    // would rotate the blade away from the hand and shift the handle.
    root.updateMatrixWorld(true);const original=visibleBounds(root),size=original.getSize(new T.Vector3());
    root.scale.setScalar(length?length/size.y:1);
    // TP now calibrates its own hand socket against these same native grip
    // units. Do not move the mesh origin or introduce an upright world basis.
    root.updateMatrixWorld(true);setupMaterials(root,viewmodel);
    if(viewmodel)root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){
      // The browser viewmodel has no baked reflection probe. Retain the source
      // DF/normal/ORM maps while allowing a diffuse share on dark metal faces.
      // DF is the pack's dark diffuse layer, authored alongside a separate
      // grey RGB specular layer. Its glTF specularTexture samples alpha, but
      // this PNG's alpha is uniformly 1: retain RGB as specular colour instead.
      // Without a reflection probe the metallic-only share disappears. Use a
      // bounded diffuse calibration, keeping the authored map and normal detail.
      if(m.specularIntensityMap){m.specularColorMap=m.specularIntensityMap;m.specularColorMap.colorSpace=T.SRGBColorSpace;m.specularIntensityMap=null;}
      m.color.setRGB(3,3,3);m.metalness=.05;m.roughness=.75;
      // A low, texture-shaped ambient reflection floor for this camera-attached
      // object. It has no world probe; dark DF alone loses the blade entirely
      // when its normal faces the ground. This uses the supplied metal response
      // rather than washing the grip and blade with an untextured grey colour.
      m.emissiveMap=m.specularColorMap;m.emissive.setRGB(1,1,1);m.emissiveIntensity=.30;
      m.aoMapIntensity=.65;m.needsUpdate=true;
    }});
    const bounds=visibleBounds(root),muzzle=new T.Object3D();muzzle.position.copy(root.worldToLocal(new T.Vector3(bounds.getCenter(new T.Vector3()).x,bounds.max.y,0)));root.add(muzzle);
    root.userData={imported:true,kind,muzzle,nativeGrip:true,assetDiagnostics:report(root,kind+'.glb')};return {root,muzzle,clips:gltf.animations,diagnostics:root.userData.assetDiagnostics};
  }
  // The GLBs have metre units. Pistols/rifle forward is +X, knife tip is +Y.
  if(kind==='knife')asset.rotation.x=-Math.PI/2;else asset.rotation.y=Math.PI/2;
  root.updateMatrixWorld(true);
  let bounds=visibleBounds(root),size=bounds.getSize(new T.Vector3());
  const desired=length||(kind==='knife'?.43:kind==='ghost'?.59:.88);
  root.scale.setScalar(desired/size.z);
  root.updateMatrixWorld(true);bounds=visibleBounds(root);
  const center=bounds.getCenter(new T.Vector3());
  // Keep stock/handle behind the anchor, muzzle forward; no whole-gun midpoint at the eye.
  const offset=new T.Vector3(-center.x,-center.y,-bounds.max.z);
  asset.position.add(offset.divideScalar(root.scale.x));
  root.updateMatrixWorld(true);bounds=visibleBounds(root);
  setupMaterials(root,viewmodel);
  const muzzle=socketFromMuzzle(root,bounds);
  root.userData.imported=true;root.userData.kind=kind;root.userData.muzzle=muzzle;
  root.userData.assetDiagnostics=report(root,kind+'.glb');
  return {root,muzzle,clips:gltf.animations,diagnostics:root.userData.assetDiagnostics};
}

export async function loadImportedJett({height=1.8}={}) {
  const gltf=await loader.loadAsync(base+'jett.glb');
  const root=new T.Group();root.name='Imported Jett';root.add(gltf.scene);
  // Exported body is X-forward: width spans source Y (GLB Z), not source X.
  gltf.scene.rotation.y=Math.PI/2;root.updateMatrixWorld(true);
  let bounds=visibleBounds(root);root.scale.setScalar(height/bounds.getSize(new T.Vector3()).y);
  root.updateMatrixWorld(true);bounds=visibleBounds(root);
  const c=bounds.getCenter(new T.Vector3());
  gltf.scene.position.add(new T.Vector3(-c.x,-bounds.min.y,-c.z).divideScalar(root.scale.x));
  root.updateMatrixWorld(true);setupMaterials(root);
  const bones={};root.traverse(o=>{if(o.isBone){bones[o.name]=o;o.userData.restQuaternion=o.quaternion.clone();o.userData.restPosition=o.position.clone();}});
  root.userData.imported=true;root.userData.bones=bones;root.userData.assetDiagnostics=report(root,'jett.glb');
  return {root,bones,clips:gltf.animations,diagnostics:root.userData.assetDiagnostics};
}

function geometryPart(source,start,count,matrix) {
  const part=new T.BufferGeometry();
  for(const key of ['position','normal','uv']) {
    const a=source.attributes[key];
    if(a)part.setAttribute(key,new T.BufferAttribute(a.array.slice(start*a.itemSize,(start+count)*a.itemSize),a.itemSize,a.normalized));
  }
  if(!part.attributes.normal)part.computeVertexNormals();
  if(!part.attributes.uv)part.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(count*2),2));
  part.applyMatrix4(matrix);return part;
}
export function mergeStaticMap(scene) {
  scene.updateMatrixWorld(true);
  const batches=new Map();
  scene.traverseVisible(o=>{
    if(!o.isMesh||o.isSkinnedMesh)return;
    const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
    const groups=geometry.groups.length?geometry.groups:[{start:0,count:geometry.attributes.position.count,materialIndex:0}];
    for(const group of groups){const mat=Array.isArray(o.material)?o.material[group.materialIndex]:o.material;if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(geometryPart(geometry,group.start,group.count,o.matrixWorld));}
    geometry.dispose();
  });
  const root=new T.Group();root.name='Ascent B material batches';
  for(const [material,parts] of batches){const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());if(!geometry)throw new Error('Incompatible map geometry attributes');const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}
  return root;
}

export async function loadImportedAscentB({merge=true,offset=[0,0,0],scale=1}={}) {
  const gltf=await loader.loadAsync(base+'ascent-b.glb');
  const original=report(gltf.scene,'ascent-b.glb');
  const root=merge?mergeStaticMap(gltf.scene):gltf.scene;
  root.scale.setScalar(scale);root.position.fromArray(offset);root.updateMatrixWorld(true);setupMaterials(root);
  // Blender's custom additive map shader exports every surface as emissive.
  // Ordinary architectural surfaces use their exported albedo under scene lights.
  const converted=new Map();root.traverse(o=>{if(!o.isMesh)return;const standard=material=>{if(!converted.has(material))converted.set(material,new T.MeshStandardMaterial({name:material.name,map:material.map,color:material.color,roughness:.9,metalness:0,side:T.DoubleSide}));return converted.get(material);};o.material=Array.isArray(o.material)?o.material.map(standard):standard(o.material);});
  const diagnostics=report(root,'ascent-b.glb');diagnostics.original=original;
  root.userData.assetDiagnostics=diagnostics;
  // Rendering this map is not a collision implementation: use the separately exported
  // triangle/grid server data with exactly the same offset and scale before gameplay.
  return {root,diagnostics,sourceTransform:{offset,scale},collisionRequired:true};
}

// Read-only navigation probe for integration: downward floor hit and capsule-height
// clearance. Full authoritative movement/shooting still need matching server triangles.
export function probeMapFloor(root,x,z,{top=50,height=1.8,minFloor=0,maxFloor=6}={}) {
  root.updateMatrixWorld(true);
  const ray=new T.Raycaster(new T.Vector3(x,top,z),new T.Vector3(0,-1,0));
  const hits=ray.intersectObject(root,true);
  for(const hit of hits){if(!hit.face||hit.point.y<minFloor||hit.point.y>maxFloor)continue;const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);if(normal.y<.65)continue;
    const floor=hit.point.y,ceiling=hits.filter(h=>h.point.y>floor+.05&&h.point.y<floor+height).length>0;
    if(!ceiling)return {x,y:floor,z,normal:normal.toArray(),object:hit.object.name};
  }
  return null;
}
