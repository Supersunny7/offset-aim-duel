// Optional debug-only measurements. Render timings are CPU submission/wait time,
// not GPU timer-query measurements. No forced GC or browser flags are used.
export function createFrameProfile({capacity=600,clock=()=>performance.now(),memory=()=>performance.memory}={}){
 const frames=new Array(capacity);let head=0,count=0,total=0,armed=false,previousAds=0,event=null,cached=null,cachedAt=-Infinity;
 const hitches=[],scopes=[];
 const rounded=value=>Math.round(value*100)/100;
 function record(frame){
  if(!frame.active){armed=false;previousAds=0;event=null;return;}
  if(!armed){armed=true;return;}
  if(!Number.isFinite(frame.intervalMs)||frame.intervalMs<=0)return;
  const row={at:frame.at,weapon:frame.weapon,ads:rounded(frame.ads||0),intervalMs:rounded(frame.intervalMs),updateMs:rounded(frame.updateMs),worldMs:rounded(frame.worldMs),viewmodelMs:rounded(frame.viewmodelMs),cpuMs:rounded(frame.cpuMs),programs:frame.programs};
  frames[head]=row;head=(head+1)%capacity;count=Math.min(capacity,count+1);total++;
  if(row.intervalMs>50||row.cpuMs>25){hitches.push(row);if(hitches.length>16)hitches.shift();}
  if(frame.scoped&&frame.ads>0&&previousAds===0){event={at:frame.at,weapon:frame.weapon,frames:0,startPrograms:frame.programs,maxPrograms:frame.programs,maxIntervalMs:0,maxCpuMs:0,maxUpdateMs:0,maxWorldMs:0,maxViewmodelMs:0};scopes.push(event);if(scopes.length>8)scopes.shift();}
  previousAds=frame.ads||0;
  if(event&&event.frames<45){event.frames++;for(const [target,source] of [['maxIntervalMs','intervalMs'],['maxCpuMs','cpuMs'],['maxUpdateMs','updateMs'],['maxWorldMs','worldMs'],['maxViewmodelMs','viewmodelMs']])event[target]=Math.max(event[target],row[source]);event.maxPrograms=Math.max(event.maxPrograms,frame.programs);}
 }
 function snapshot(){
  const now=clock();if(cached&&now-cachedAt<500)return cached;
  const rows=frames.slice(0,count),values=rows.map(r=>r.intervalMs).sort((a,b)=>a-b);
  const percentile=q=>values.length?values[Math.min(values.length-1,Math.ceil(values.length*q)-1)]:null;
  let heap=null;try{const m=memory();if(m&&[m.usedJSHeapSize,m.totalJSHeapSize,m.jsHeapSizeLimit].every(Number.isFinite))heap={source:'Chromium performance.memory; approximate, may include shared contexts',usedMiB:rounded(m.usedJSHeapSize/1048576),allocatedMiB:rounded(m.totalJSHeapSize/1048576),limitMiB:rounded(m.jsHeapSizeLimit/1048576)};}catch{}
  cached={source:'Unsmoothed RAF intervals; CPU render submission/wait timings',windowFrames:count,capacity,totalFrames:total,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:values.at(-1)??null,over50ms:values.filter(x=>x>50).length,last:rows.length?frames[(head-1+capacity)%capacity]:null,hitches:hitches.map(r=>({...r})),scopes:scopes.map(r=>({...r})),heap,actualVramBytes:null};cachedAt=now;return cached;
 }
 return {record,snapshot};
}
