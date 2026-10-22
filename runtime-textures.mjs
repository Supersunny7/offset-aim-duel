// Build-only lossless download optimization. No resampling, colour conversion,
// vertex edits, bone edits or animation retiming; originals remain in public/.
import {inflateSync,deflateSync} from 'node:zlib';
import {readGlb} from './runtime-vandal.mjs';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function pngChunk(type,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length,0);out.write(type,4,4,'ascii');data.copy(out,8);out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);return out;}
export function pngChunks(bytes){
 if(!bytes.subarray(0,8).equals(signature))throw Error('Expected original PNG');
 const chunks=[];let offset=8;
 while(offset<bytes.length){if(offset+12>bytes.length)throw Error('Truncated PNG chunk');const size=bytes.readUInt32BE(offset),end=offset+12+size;if(end>bytes.length)throw Error('Truncated PNG data');const full=bytes.subarray(offset,end),type=full.toString('ascii',4,8);if(crc32(full.subarray(4,-4))!==full.readUInt32BE(full.length-4))throw Error('PNG checksum mismatch');chunks.push({type,data:full.subarray(8,-4),full});offset=end;}
 if(chunks[0]?.type!=='IHDR'||chunks.at(-1)?.type!=='IEND'||!chunks.some(c=>c.type==='IDAT'))throw Error('PNG chunk contract mismatch');return chunks;
}
export function optimizePng(bytes){
 const chunks=pngChunks(bytes),header=chunks[0].data;
 // The supplied packs use non-interlaced 8-bit RGB/RGBA. Leave other encodings
 // alone rather than making assumptions about an arbitrary future asset.
 const channels=header[9]===2?3:header[9]===6?4:0;
 if(header[8]!==8||header[12]!==0||!channels)return bytes;
 const expected=(header.readUInt32BE(0)*channels+1)*header.readUInt32BE(4);
 if(expected>64*1024*1024||expected<1)throw Error('PNG exceeds build memory budget');
 const raw=inflateSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data)),{maxOutputLength:expected});
 if(raw.length!==expected)throw Error('PNG scanline size mismatch');
 const encoded=deflateSync(raw,{level:6});
 // Verify the entire original filtered scanline byte stream, including alpha.
 // We never decode/refilter pixels, so gamma/profile chunks and pixel values
 // remain exactly the original; only the DEFLATE representation changes.
 if(!inflateSync(encoded,{maxOutputLength:expected}).equals(raw))throw Error('PNG lossless verification failed');
 let inserted=false;const output=[signature];for(const c of chunks){if(c.type==='IDAT'){if(!inserted){output.push(pngChunk('IDAT',encoded));inserted=true;}}else output.push(c.full);}
 const result=Buffer.concat(output);return result.length<bytes.length?result:bytes;
}
function encodeGlb(json,bin){
 const text=Buffer.from(JSON.stringify(json)),jsonPad=Buffer.alloc((4-text.length%4)%4,32),binPad=Buffer.alloc((4-bin.length%4)%4),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
 header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+jsonPad.length+bin.length+binPad.length,8);header.writeUInt32LE(text.length+jsonPad.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(bin.length+binPad.length);binHeader.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,text,jsonPad,binHeader,bin,binPad]);
}
export function optimizeModelTextures(bytes){
 const {json,bin}=readGlb(bytes);
 if(json.buffers?.length!==1||json.buffers[0].uri)throw Error('Expected one internal model buffer');
 const imageViews=new Set((json.images||[]).map(i=>{if(i.bufferView===undefined||i.mimeType!=='image/png')throw Error('Expected embedded PNG');return i.bufferView;}));
 for(const a of json.accessors||[])if(imageViews.has(a.bufferView)||imageViews.has(a.sparse?.indices.bufferView)||imageViews.has(a.sparse?.values.bufferView))throw Error('Image view overlaps model accessor');
 const parts=[];let offset=0;let originalImages=0,runtimeImages=0;
 for(const [i,v]of json.bufferViews.entries()){
  if(v.buffer!==0)throw Error('Unexpected model buffer');
  const source=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);if(source.length!==v.byteLength)throw Error('Invalid model view');
  const data=imageViews.has(i)?optimizePng(source):source;
  if(imageViews.has(i)){originalImages+=source.length;runtimeImages+=data.length;}
  const padding=(4-offset%4)%4;if(padding){parts.push(Buffer.alloc(padding));offset+=padding;}
  v.byteOffset=offset;v.byteLength=data.length;parts.push(data);offset+=data.length;
 }
 json.buffers[0].byteLength=offset;
 const result=encodeGlb(json,Buffer.concat(parts));
 return{bytes:result.length<bytes.length?result:bytes,originalImages,runtimeImages,imageCount:imageViews.size};
}
export const RUNTIME_TEXTURE_MODELS=Object.freeze(['ghost','knife','phantom','sheriff','classic','shorty','frenzy','stinger','spectre','bucky','judge','bulldog','guardian','marshal','operator','ares','odin','jett-arms']);
