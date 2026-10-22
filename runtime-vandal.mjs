// Only loadVandal's replaced source materials are removed. Authored model data
// and the external textures actually rendered by the game remain unchanged.
export function readGlb(bytes){
 if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error('Expected GLB 2');
 const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString());
 const offset=20+length;if(bytes.readUInt32LE(offset+4)!==0x004e4942)throw Error('Expected internal BIN');
 return {json,bin:bytes.subarray(offset+8,offset+8+bytes.readUInt32LE(offset))};
}
export function stripReplacedVandalTextures(bytes){
 const {json:j,bin}=readGlb(bytes);
 if(j.buffers?.length!==1||j.buffers[0].uri||j.extensionsRequired?.length||j.meshes.some(m=>m.primitives.some(p=>p.extensions)))throw Error('Unexpected Vandal layout');
 const removed=new Set((j.images||[]).map(i=>i.bufferView));if(removed.has(undefined))throw Error('Expected embedded images');
 const map=new Map(),views=[],chunks=[];let offset=0;
 for(const [i,v]of j.bufferViews.entries())if(!removed.has(i)){
  if(v.buffer!==0)throw Error('Unexpected buffer');
  const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
  map.set(i,views.length);views.push({...v,byteOffset:offset});chunks.push(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));offset+=v.byteLength;
 }
 const remap=x=>{if(!map.has(x))throw Error('Image view used by model accessor');return map.get(x);};
 for(const a of j.accessors){if(a.bufferView!==undefined)a.bufferView=remap(a.bufferView);if(a.sparse){a.sparse.indices.bufferView=remap(a.sparse.indices.bufferView);a.sparse.values.bufferView=remap(a.sparse.values.bufferView);}}
 for(const m of j.meshes)for(const p of m.primitives)delete p.material;
 for(const key of ['materials','images','textures','samplers'])delete j[key];
 j.bufferViews=views;j.buffers[0].byteLength=offset;
 const json=Buffer.from(JSON.stringify(j)),jsonPad=Buffer.alloc((4-json.length%4)%4,32),binary=Buffer.concat(chunks),binPad=Buffer.alloc((4-binary.length%4)%4);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+jsonPad.length+binary.length+binPad.length,8);header.writeUInt32LE(json.length+jsonPad.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length+binPad.length,0);binHeader.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,json,jsonPad,binHeader,binary,binPad]);
}
