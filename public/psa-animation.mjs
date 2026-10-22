import * as THREE from '/vendor/three.module.js';

export function createNativeBoneClip(model, source) {
  if(source.format!=='three-bone-tracks-v1')throw new Error('Unsupported native bone animation');
  const times=Array.from({length:source.frames},(_,i)=>i/source.fps),tracks=[],matched=[];
  for(const t of source.tracks){
    const bone=model.getObjectByName(t.bone);if(!bone?.isBone)continue;
    tracks.push(new THREE.VectorKeyframeTrack(`${bone.uuid}.position`,times,t.positions));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.uuid}.quaternion`,times,t.quaternions));
    matched.push(t.bone);
  }
  const clip=new THREE.AnimationClip(source.name,source.duration,tracks);clip.userData={matchedBones:matched,missingBones:[]};return clip;
}

// Supplied PSA keys use centimeters. ActorX stores child rotations conjugated,
// but keeps the root rotation unconjugated. FBXLoader keeps source local units.
export function createPsaClip(model, data, { positionScale = 0.01, relative = true, includeRoot = false } = {}) {
  if (data.format !== 'actorx-psa-v1' || !data.clips?.length) throw new Error('Unsupported PSA JSON');
  const source = data.clips[0], tracks = [], missing = [], matched = [];
  const times = Array.from({ length: source.frames }, (_, frame) => frame / source.fps);
  for (const track of source.tracks) {
    const bone = model.getObjectByName(track.bone);
    if (!bone?.isBone) { missing.push(track.bone); continue; }
    if (track.parent < 0 && !includeRoot) continue;
    const sourcePosition = new THREE.Vector3().fromArray(track.positions);
    const convert = (offset) => {
      const q = new THREE.Quaternion().fromArray(track.quaternions, offset).normalize();
      if (track.parent >= 0) q.conjugate();
      return q;
    };
    const firstRotation = convert(0), inverseFirst = firstRotation.clone().invert();
    const positions = [], rotations = [], p = new THREE.Vector3();
    const restPosition = bone.position.clone(), restRotation = bone.quaternion.clone();
    let previous = null;
    for (let frame = 0; frame < source.frames; frame++) {
      p.fromArray(track.positions, frame * 3);
      const q = convert(frame * 4);
      if (relative) {
        p.sub(sourcePosition).multiplyScalar(positionScale).add(restPosition);
        q.premultiply(inverseFirst).premultiply(restRotation);
      } else p.multiplyScalar(positionScale);
      if (previous && previous.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      positions.push(p.x, p.y, p.z); rotations.push(q.x, q.y, q.z, q.w); previous = q.clone();
    }
    // UUID avoids collisions when an agent and weapon both contain Root/Skeleton.
    tracks.push(new THREE.VectorKeyframeTrack(`${bone.uuid}.position`, times, positions));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.uuid}.quaternion`, times, rotations));
    matched.push(track.bone);
  }
  const clip = new THREE.AnimationClip(source.name, source.duration, tracks);
  clip.userData = { matchedBones: matched, missingBones: missing, sourceEntry: data.sourceEntry };
  return clip;
}

export async function loadPsaClip(model, url, options) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PSA animation HTTP ${response.status}: ${url}`);
  return createPsaClip(model, await response.json(), options);
}
