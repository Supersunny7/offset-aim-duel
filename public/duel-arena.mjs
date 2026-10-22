import * as T from '/vendor/three.module.js';

// The playable solids are authored from the same layout as collision. All
// architectural trim sits within 20 mm of those surfaces; skyline is outside.
export function buildDuelArena(scene, layout) {
  const world = new T.Group();
  world.name = 'Foundry / symmetric duel courtyard';
  const bounds = layout.bounds || [-11, 11, -13, 13];
  const [xmin,xmax,zmin,zmax] = Array.isArray(bounds) ? bounds :
    [bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ];
  const boxes = layout.boxes || layout.BOXES || [];
  const colors = {
    wall: [0xd5d7cb,.94,0], floor: [0x8e9b97,.98,0],
    teal: [0x557b7e,.77,.12], deep: [0x334b50,.78,.12],
    steel: [0x6f8583,.58,.3], copper: [0xba8861,.68,.25],
    seam: [0x73847f,.98,0], light: [0xdedfd1,.8,0],
  };
  const mats = Object.fromEntries(Object.entries(colors).map(([key,[color,roughness,metalness]]) =>
    [key,new T.MeshStandardMaterial({color,roughness,metalness})]));
  mats.lamp=new T.MeshBasicMaterial({color:0xffdfaa});
  // Authored, deterministic material variation; no camera/post-processing changes.
  let seed=314159,textureCount=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function surfaceTexture(kind){
    if(typeof document==='undefined')return null;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.fillStyle=kind==='floor'?'#d9d8ce':kind==='metal'?'#d2d9d7':'#efe9d8';ctx.fillRect(0,0,512,512);
    for(let i=0;i<6000;i++){
      ctx.fillStyle=`rgba(${random()>.5?'255,255,245':'67,74,65'},${.02+random()*.035})`;
      ctx.fillRect(random()*512,random()*512,1+random()*3,1+random()*2);
    }
    if(kind==='floor'){
      ctx.strokeStyle='#bdc2b8';ctx.lineWidth=2;ctx.strokeRect(1,1,510,510);
      for(let i=0;i<30;i++){const x=random()*512,y=random()*512;ctx.strokeStyle='rgba(91,100,91,.10)';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+10+random()*30,y+random()*5);ctx.stroke();}
    }else if(kind==='metal'){
      for(let i=0;i<70;i++){ctx.fillStyle='rgba(47,66,69,.05)';ctx.fillRect(random()*512,random()*512,30+random()*100,.8);}
    }else{
      for(let i=0;i<24;i++){const x=random()*512;ctx.fillStyle='rgba(91,82,69,.045)';ctx.fillRect(x,400+random()*100,2+random()*3,50);}
    }
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
    tex.wrapS=tex.wrapT=T.RepeatWrapping;if(kind==='floor')tex.repeat.set(12,14);
    tex.anisotropy=4;textureCount++;return tex;
  }
  mats.floor.map=surfaceTexture('floor');
  mats.wall.map=surfaceTexture('plaster');mats.light.map=mats.wall.map;
  mats.teal.map=surfaceTexture('metal');mats.steel.map=mats.teal.map;
  mats.floor.color.set(0xb7b5a7);mats.wall.color.set(0xe1dccb);mats.light.color.set(0xe5e2d6);
  const cube = new T.BoxGeometry(1,1,1);
  const batches = new Map();
  const add = (w,h,d,x,y,z,mat='wall',rz=0) => {
    if (!batches.has(mat)) batches.set(mat,[]);
    batches.get(mat).push({w,h,d,x,y,z,rz});
  };
  const centerX=(xmin+xmax)/2, centerZ=(zmin+zmax)/2;
  const width=xmax-xmin, depth=zmax-zmin;
  add(width+1.2,.18,depth+1.2,centerX,-.09,centerZ,'floor');
  // Four sealed boundary walls. Their inside faces exactly equal layout bounds.
  const wallHeight=5;
  for (const x of [xmin-.3,xmax+.3]) {
    // Stack material bands as disjoint solids. Overlaying full-size boxes put
    // differently colored triangles on the same plane and flickered on recoil.
    add(.6,wallHeight-.87,depth+1.2,x,(.75+wallHeight-.12)/2,centerZ);
    add(.6,.75,depth+1.2,x,.375,centerZ,'teal');
    add(.6,.12,depth+1.2,x,wallHeight-.06,centerZ,'deep');
  }
  for (const z of [zmin-.3,zmax+.3]) {
    add(width,wallHeight-.87,.6,centerX,(.75+wallHeight-.12)/2,z);
    add(width,.75,.6,centerX,.375,z,'teal');
    add(width,.12,.6,centerX,wallHeight-.06,z,'deep');
  }
  // Thin side-wall bays, vents, fasteners and overhead service lines.
  for (const side of [-1,1]) {
    const edge=side<0?xmin:xmax;
    for(let z=zmin+2;z<zmax;z+=4.4) {
      add(.015,2.35,2.8,edge-side*.0075,2.2,z,'light');
      add(.018,2.45,.08,edge-side*.009,2.2,z-1.44,'steel');
      add(.018,2.45,.08,edge-side*.009,2.2,z+1.44,'steel');
      add(.018,.7,1.85,edge-side*.009,2.62,z,'teal');
      for(let j=0;j<5;j++) add(.02,.035,1.55,edge-side*.01,2.36+j*.12,z,'deep');
      add(.018,.06,.58,edge-side*.009,1.2,z+.62,'copper');
      // Static practical lights above head level: no pulsing or extra bloom.
      add(.012,.16,.54,edge-side*.006,3.47,z,'deep');
      add(.016,.065,.39,edge-side*.008,3.49,z,'lamp');
    }
    for(const y of [3.85,4.01])add(.018,.045,depth-.7,edge-side*.009,y,centerZ,'steel');
  }
  // End bays are unambiguously solid: no door handles or false openings.
  for(const side of [-1,1]) {
    const edge=side<0?zmin:zmax;
    for(const x of [-7,7]) {
      add(3.4,2.8,.015,x,2.2,edge-side*.0075,'teal');
      add(3.5,.08,.018,x,3.64,edge-side*.009,'copper');
      for(let j=0;j<7;j++)add(3.15,.025,.018,x,1+j*.34,edge-side*.009,'deep');
    }
    add(5.4,1.4,.015,0,3.15,edge-side*.0075,'deep');
    add(5.4,.055,.018,0,2.43,edge-side*.009,'copper');
  }

  // The rectangular collision silhouette stays intact: detail describes a
  // generator, side heat exchangers, shoulder cabinets and low steel crates.
  for(const b of boxes) {
    const base=b.kind==='core'?'deep':b.h<1.5?'teal':'wall';
    add(b.w,b.h-.26,b.d,b.x,(.14+b.h-.12)/2,b.z,base);
    add(b.w,.12,b.d,b.x,b.h-.06,b.z,'steel');
    add(b.w,.14,b.d,b.x,.07,b.z,'deep');
    for(const side of [-1,1]) {
      const face=b.z+side*(b.d/2+.006);
      const inset=Math.min(.25,b.w*.1);
      const panelH=Math.max(.3,b.h-.52);
      const blastScreen=b.kind==='baffle'||b.kind==='shoulder';
      add(b.w-inset*2,panelH,.012,b.x,b.h/2,face,
        blastScreen?'light':b.kind==='core'?'teal':'deep');
      for(const sx of [-1,1]) add(.045,panelH+.08,.016,b.x+sx*(b.w/2-inset),b.h/2,b.z+side*(b.d/2+.008),'steel');
      add(Math.min(1.2,b.w*.65),.045,.016,b.x,b.h*.76,b.z+side*(b.d/2+.008),'copper');
      if(b.kind==='core'||b.kind==='wing') {
        for(let j=0;j<7;j++) add(b.w-inset*3,.035,.016,b.x,.6+j*(panelH-.35)/7,b.z+side*(b.d/2+.008),'steel');
      }
      if(b.h<1.5) {
        for(const sx of [-1,1])add(.12,panelH,.016,b.x+sx*b.w*.24,b.h/2,b.z+side*(b.d/2+.008),'teal');
      }
      if(blastScreen) {
        // A visibly engineered blast screen, rather than a dark rectangular
        // shutter: two folded pale panels, inset V braces and corner bolts.
        // Rotated beams are bounded by endpoints well inside the face edge.
        const braceZ=b.z+side*(b.d/2+.009);
        const dx=b.w*.32,dy=b.h*.52;
        const braceLength=Math.hypot(dx,dy), angle=Math.atan2(dy,dx);
        for(const sx of [-1,1]) {
          add(braceLength,.08,.018,b.x+sx*dx/2,b.h/2,braceZ,'steel',-sx*angle);
          for(const sy of [-1,1])add(.055,.055,.018,
            b.x+sx*(b.w/2-.34),b.h/2+sy*(panelH/2-.12),braceZ,'copper');
        }
        add(.022,panelH-.1,.018,b.x,b.h/2,braceZ,'steel');
        add(b.w-.65,.07,.018,b.x,.29,braceZ,'copper');
      }
    }
    // Long-side paneling, flush with the shared obstacle footprint.
    for(const side of [-1,1]) {
      add(.012,b.h-.4,b.d-.3,b.x+side*(b.w/2+.006),b.h/2,b.z,
        b.kind==='core'?'copper':b.kind==='baffle'||b.kind==='shoulder'?'light':'teal');
      add(.016,.045,b.d-.4,b.x+side*(b.w/2+.008),b.h*.72,b.z,'steel');
      if(b.kind==='core') {
        for(let j=0;j<9;j++)add(.018,b.h-.75,.08,b.x+side*(b.w/2+.009),b.h/2,b.z-b.d/2+.3+j*(b.d-.6)/8,'deep');
      }
    }
  }
  // Low-contrast expansion joints and three route markings stay below feet.
  for(let x=xmin+1;x<xmax;x+=2.5)add(.014,.003,depth,x,.002,centerZ,'seam');
  for(let z=zmin+1;z<zmax;z+=2.5)add(width,.003,.014,centerX,.002,z,'seam');
  for(const s of [-1,1]) {
    for(const x of [-8.8,0,8.8]) {
      for(let j=0;j<3;j++)add(.35,.004,.075,x,.006,s*(9.9+j*.45),'copper');
    }
    for(const x of [-1.1,1.1])add(.06,.004,1.9,x,.006,s*11.3,'light');
    add(2.2,.004,.06,0,.006,s*12.2,'light');
  }
  // Skyline sits entirely beyond the sealed playable boundary, adding a
  // foundry silhouette without introducing unreachable ledges within the arena.
  for(const side of [-1,1]) {
    const x=side<0?xmin-4:xmax+4;
    add(5.2,6.5,7,x,3.25,-5,'teal');
    add(5.6,.25,7.4,x,6.6,-5,'deep');
    add(5.8,8.4,5,x+side*2,4.2,7,'wall');
    add(6.1,.22,5.3,x+side*2,8.5,7,'steel');
    add(3,.5,2.2,x+side*2,8.8,7,'deep');
    for(let j=0;j<3;j++)add(5.85,.3,.6,x+side*2,4.8+j*.95,7,'teal');
    // Sawtooth factory roofline and a structural frame outside the arena.
    for(let j=0;j<3;j++){
      add(5.2,.17,2.2,x,6.95+j*.08,-7.4+j*2.2,'steel',side*.10);
      add(.18,3.8,.18,x-side*2.4,5.3,-7.4+j*2.2,'deep');
    }
    for(const z of [-9,-1,9]){
      add(.2,4,.2,x-side*2.4,5.3,z,'copper');
      add(.22,.22,8,x-side*2.4,7.25,z+3,'deep');
    }
  }

  // Thin ground drainage details stay above the floor by only millimetres.
  for(const side of [-1,1])for(let z=-11;z<=11;z+=2){
    add(.28,.003,1.8,side*10.25,.009,z,'deep');
    for(let j=0;j<8;j++)add(.26,.003,.045,side*10.25,.013,z-.75+j*.2,'steel');
  }

  const transform=new T.Object3D();
  let instanceCount=0;
  for(const [mat,items] of batches) {
    const batch=new T.InstancedMesh(cube,mats[mat],items.length);
    batch.name=`Foundry ${mat} architectural batch`;
    items.forEach((b,i)=>{
      transform.position.set(b.x,b.y,b.z);
      transform.scale.set(b.w,b.h,b.d);
      transform.rotation.set(0,0,b.rz);
      transform.updateMatrix();batch.setMatrixAt(i,transform.matrix);
    });
    batch.castShadow=true;batch.receiveShadow=true;
    batch.instanceMatrix.needsUpdate=true;
    batch.computeBoundingBox();batch.computeBoundingSphere();
    world.add(batch);instanceCount+=items.length;
  }
  // Circular fan housings turn the center block into a recognisable machine.
  // Everything remains within the existing 20 mm decorative-skin contract.
  let authoredTriangles=0,authoredGeometries=0;
  const discGeometry=new T.CylinderGeometry(1,1,1,24),ringGeometry=new T.RingGeometry(.77,1,24);
  authoredGeometries+=2;
  function authored(geometry,material,name,position,scale,rotation){
    const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.position.set(...position);mesh.scale.set(...scale);if(rotation)mesh.rotation.set(...rotation);
    mesh.castShadow=false;mesh.receiveShadow=true;world.add(mesh);
    authoredTriangles+=(geometry.index?.count||geometry.attributes.position.count)/3;return mesh;
  }
  const core=boxes.find(b=>b.kind==='core');
  if(core)for(const side of [-1,1])for(const x of [-.68,.68]){
    const z=core.z+side*(core.d/2+.011);
    authored(discGeometry,mats.deep,'Recessed turbine', [core.x+x,1.55,z],[.47,.012,.47],[Math.PI/2,0,0]);
    authored(ringGeometry,mats.copper,'Turbine rim',[core.x+x,1.55,core.z+side*(core.d/2+.019)],[.49,.49,1],[0,side<0?Math.PI:0,0]);
    for(let j=0;j<5;j++){
      const a=j*Math.PI*2/5,mesh=authored(cube,mats.steel,'Turbine blade',[core.x+x+Math.cos(a)*.18,1.55+Math.sin(a)*.18,core.z+side*(core.d/2+.018)],[.25,.055,.002],[0,0,a+.45]);
    }
  }
  // Distant cylindrical vessels and curved pipe runs give the refinery depth.
  for(const side of [-1,1]){
    const x=side*(xmax+4.1);
    authored(discGeometry,mats.copper,'Round exhaust stack',[x,8.3,-5],[.65,4.2,.65]);
    for(const y of [6.4,8.1,10.25])authored(discGeometry,mats.deep,'Stack collar',[x,y,-5],[.71,.10,.71]);
    const tankX=side*(xmax+6.5);
    authored(discGeometry,mats.light,'Storage vessel',[tankX,8.3,7],[1.55,4.4,1.55]);
    for(const y of [6.2,8.3,10.45])authored(discGeometry,mats.teal,'Vessel band',[tankX,y,7],[1.57,.10,1.57]);
    const curve=new T.CatmullRomCurve3([new T.Vector3(x,5.3,-1),new T.Vector3(x,7.8,-1),new T.Vector3(x,8.5,0),new T.Vector3(x,8.5,3),new T.Vector3(tankX,8.5,5.4)]);
    const pipe=new T.TubeGeometry(curve,32,.16,8,false);authoredGeometries++;
    authored(pipe,mats.steel,'Refinery process pipe',[0,0,0],[1,1,1]);
  }
  // Map-scoped sky colour, without changing weapon lighting or camera state.
  const skyGeometry=new T.SphereGeometry(90,24,12),skyColors=[];
  for(let i=0;i<skyGeometry.attributes.position.count;i++){
    const t=T.MathUtils.clamp((skyGeometry.attributes.position.getY(i)+8)/70,0,1);
    const c=new T.Color(0xf1e6ce).lerp(new T.Color(0x8ebad4),t);skyColors.push(c.r,c.g,c.b);
  }
  skyGeometry.setAttribute('color',new T.Float32BufferAttribute(skyColors,3));authoredGeometries++;
  const sky=authored(skyGeometry,new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide,depthWrite:false,fog:false}),'Foundry morning sky',[0,0,0],[1,1,1]);sky.renderOrder=-100;sky.receiveShadow=false;
  const fill=new T.DirectionalLight(0xb5cfdb,.32);fill.name='Foundry cool world fill';fill.position.set(-12,10,-8);fill.layers.set(0);world.add(fill);
  let labelCount=0;
  // Labels identify routes and spawn ends. Canvas is optional for headless QA.
  function label(text,w,h,x,y,z,ry=0) {
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.fillStyle='#334b50';ctx.fillRect(0,0,1024,256);
    ctx.fillStyle='#dedfd1';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='700 92px sans-serif';ctx.fillText(text,512,130,950);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture}));
    m.name=`Foundry sign ${text}`;m.position.set(x,y,z);m.rotation.y=ry;world.add(m);labelCount++;
  }
  label('FOUNDRY / B',4.8,.9,0,3.15,zmin+.019);
  label('FOUNDRY / A',4.8,.9,0,3.15,zmax-.019,Math.PI);
  label('WEST / 01',2.3,.6,xmin+.019,3.45,0,Math.PI/2);
  label('EAST / 02',2.3,.6,xmax-.019,3.45,0,-Math.PI/2);
  for(const b of boxes.filter(b=>b.kind==='baffle'))for(const side of [-1,1]) {
    label('BLAST / 04',.85,.18,b.x+(side<0?-1:1)*(b.w/2-.8),.52,
      b.z+side*(b.d/2+.019),side<0?Math.PI:0);
  }
  for(const side of [-1,1]){
    label(side<0?'01  /  COOLING WORKS':'02  /  ASSEMBLY',3.4,.46,side<0?xmin+.019:xmax-.019,4.45,side<0?-5:5,side<0?Math.PI/2:-Math.PI/2);
    if(core)label('C-07   /   AIR HANDLING',2.3,.23,0,2.6,side*(core.d/2+.019),side<0?Math.PI:0);
  }
  world.userData.arenaMetrics={name:'Foundry',architectureInstances:instanceCount,
    architecturalBatches:batches.size,labels:labelCount,
    geometries:1+authoredGeometries+labelCount,materials:batches.size+labelCount+1,
    triangles:instanceCount*12+authoredTriangles+labelCount*2,materialTextures:textureCount,
    artRevision:'refinery-materials-2',maxSurfaceProjection:.02};
  scene.add(world);
  return world;
}
