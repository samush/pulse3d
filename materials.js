// Material library and the "Materials" control. Plan view draws the scene with flat unlit materials (outlines and
// dimensions); every 3D view is lit: real coatings are MeshStandardMaterial twins with color, roughness and bump
// maps, "materials off" gives neutral grey Standard twins that still take light and shadow (form check). Light
// schemes, shadows, environment and the image pipeline live in lighting.js. MATERIALS keeps pattern size in metres (UV in metres, so
// it holds on any surface), roughness and bump strength; maps are built from the color canvas, an optional `image`
// falls back to it on load error.
const MATERIALS={
  lam:      {name:'ламинат серый',        size:[1.9,1.9], rough:0.55, bump:0.35},
  white:    {name:'плитка белый мрамор, пол', size:[0.6,0.6], rough:0.25, bump:0.15},
  whiteWall:{name:'плитка белый мрамор, стены', size:[0.6,0.6], rough:0.25, bump:0.15},
  grey:     {name:'плитка серый мрамор',  size:[0.6,0.6], rough:0.3,  bump:0.15},
  wp:       {name:'обои под покраску',    size:[1.2,1.2], rough:0.92, bump:0.45, albedo:0.82},
  tile:     {name:'керамогранит 60×120, тёплый серо-бежевый', size:[0.6,1.2], rough:0.25, bump:0.12},
  board:    {name:'инженерная доска дуб', size:[2.0,2.0], rough:0.5, bump:0.35},
  wood:     {name:'дерево светлое, откосы; слот столов', size:[1.0,1.0], rough:0.6,  bump:0.3},
  woodFloor:{name:'дерево светлое, порог балкона', size:[1.0,1.0], rough:0.6, bump:0.3},
  plinth:   {name:'плинтус белый',        rough:0.7},
  frame:    {name:'дверная коробка белая', rough:0.7},
  wall:     {name:'стена',                rough:0.95},
  wallPaint:{name:'краска стен матовая, серо-бежевая', size:[1,1], rough:0.9, bump:0.15, albedo:0.9},
  facade:   {name:'фасад (камень, панели)', rough:0.85, bump:0.2, albedo:0.95},
  furniture:{name:'мебель (концепт)',     rough:0.8},
  // item material slots (items.js SLOTS): physical class of a detail, independent of its concept colour
  chrome:   {name:'хром (ручки, смесители)', rough:0.25, metal:0.9},
  metal:    {name:'металл окрашенный',    rough:0.45, metal:0.6},
  glass:    {name:'стекло, ограждения',   rough:0.05},
  fabric:   {name:'ткань, матрасы, ковры', rough:0.95},
  emitter:  {name:'светящаяся поверхность (LED)', rough:0.6, emissive:true},
  screen:   {name:'экран телевизора',     rough:0.15},
  cabinetPaint:{name:'крашеный МДФ (фасады, каркасы, стулья)', rough:0.45},
  plastic:  {name:'пластик (рамки розеток, корпуса ламп)', rough:0.4},
  ceramic:  {name:'керамика (сантехника)', rough:0.12},
  acrylic:  {name:'акрил (ванна)',        rough:0.2},
  leather:  {name:'кожа (изголовье, пуфы)', rough:0.6},
  mirror:   {name:'зеркало',              rough:0.02, metal:1}, // reflects the procedural room environment (VIZ only)
  ceiling:  {name:'потолок натяжной матовый', rough:0.9, albedo:0.95},
};
const VIZ={on:false,ready:false,mode:'basic',std:new Map(),neutral:new Map(),basic:new Map()}; // mode: basic (plan) | neutral | std (real coatings)
window.VIZ=VIZ; window.MATERIALS=MATERIALS;
(function(){
  const KEY='pulse3d.viz';
  // ---- maps from the color canvas: roughness = inverted brightness (lighter is smoother), normals — Sobel over height
  function lum(img){ const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const g=c.getContext('2d'); g.drawImage(img,0,0);
    const d=g.getImageData(0,0,c.width,c.height).data, L=new Float32Array(c.width*c.height); for(let i=0;i<L.length;i++) L[i]=(0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2])/255; return {w:c.width,h:c.height,L}; }
  function roughMap(img,base){ const {w,h,L}=lum(img); const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); const id=g.createImageData(w,h);
    for(let i=0;i<L.length;i++){ const v=Math.max(0,Math.min(1,base+(0.5-L[i])*0.5))*255; id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=v; id.data[i*4+3]=255; } g.putImageData(id,0,0); return c; }
  function normalMap(img,strength){ const {w,h,L}=lum(img); const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); const id=g.createImageData(w,h);
    const at=(x,y)=>L[((y+h)%h)*w+((x+w)%w)];
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const dx=(at(x+1,y)-at(x-1,y))*strength, dy=(at(x,y+1)-at(x,y-1))*strength; const n=new THREE.Vector3(-dx,-dy,1).normalize(); const i=(y*w+x)*4;
      id.data[i]=(n.x*0.5+0.5)*255; id.data[i+1]=(n.y*0.5+0.5)*255; id.data[i+2]=(n.z*0.5+0.5)*255; id.data[i+3]=255; } g.putImageData(id,0,0); return c; }
  function texLike(src,canvas){ const t=new THREE.CanvasTexture(canvas); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.copy(src.repeat); return t; }
  function stdFor(key,basic){ // PBR twin of a simple material; maps from the same image, same repeat
    const spec=MATERIALS[key]||MATERIALS.furniture; const m=new THREE.MeshStandardMaterial({color:basic.color?basic.color.clone():0xffffff,roughness:spec.rough,metalness:spec.metal||0,transparent:basic.transparent,opacity:basic.opacity,depthWrite:basic.depthWrite,side:basic.side,emissive:spec.emissive?basic.color.clone():0x000000});
    m.color.multiplyScalar(spec.albedo!=null?spec.albedo:0.85); // white paint/tile reflect ~85 %, otherwise ACES burns everything out
    if(basic.map&&basic.map.image){ m.map=basic.map; if(spec.bump){ m.roughnessMap=texLike(basic.map,roughMap(basic.map.image,spec.rough)); m.normalMap=texLike(basic.map,normalMap(basic.map.image,4)); m.normalScale=new THREE.Vector2(spec.bump,spec.bump); }
      if(spec.image){ new THREE.TextureLoader().load(spec.image,t=>{ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1/spec.size[0],1/spec.size[1]); t.encoding=THREE.sRGBEncoding; m.map=t; m.needsUpdate=true; },undefined,()=>{ VIZ.loadErrors=(VIZ.loadErrors||[]).concat(key+': '+spec.image); }); } }
    return m;
  }
  function neutralFor(basic){ // grey Standard twin without maps: same colour, transparency and sides, one roughness for every class
    const slot=basic.userData.slot, m=new THREE.MeshStandardMaterial({color:basic.color?basic.color.clone():0xffffff,roughness:0.8,metalness:0,transparent:basic.transparent,opacity:basic.opacity,depthWrite:basic.depthWrite,side:basic.side,emissive:slot==='emitter'?basic.color.clone():0x000000});
    m.color.multiplyScalar(0.85); return m;
  }
  function twins(k,b){ VIZ.std.set(b,stdFor(k,b)); VIZ.neutral.set(b,neutralFor(b)); }
  function prepare(){ // build the twins once
    if(VIZ.ready) return; VIZ.ready=true;
    const fm=window.finishMats||{};
    Object.entries(fm).forEach(([k,b])=>twins(k,b));
    twins('wall',wallMat); twins('ceiling',ceilMat);
    facadeMats.forEach(b=>twins('facade',b));
    Object.values(ITEM_GROUPS).forEach(g=>g.traverse(o=>{ if(o.isMesh&&!VIZ.std.has(o.material)) twins(o.material.userData.slot||'furniture',o.material); }));
    VIZ.std.forEach((s,b)=>VIZ.basic.set(s,b)); VIZ.neutral.forEach((s,b)=>VIZ.basic.set(s,b));
  }
  const NO_CAST=new Set([finishGroup,tileGroup,boardGroup]);
  function swap(root,mode){ // mode: 'basic' | 'neutral' | 'std'; any twin maps back to its basic first, so the source state does not matter
    const lit=mode!=='basic', cast=lit&&!NO_CAST.has(root)&&root!==ceilGroup; // ceiling never casts: it would block the neutral sun from above (L1 revisits for lamps)
    root.traverse(o=>{ if(!o.isMesh) return; const b=VIZ.basic.get(o.material)||o.material, m=mode==='std'?VIZ.std.get(b):mode==='neutral'?VIZ.neutral.get(b):b; if(m) o.material=m; o.castShadow=cast; o.receiveShadow=lit; }); }
  function apply(){ // effective state from the camera (plan is flat) and the two controls; light is applied here too, materials stay as chosen
    const lit=!controls.plan, mode=!lit?'basic':VIZ.on?'std':'neutral';
    if(lit) prepare();
    if(VIZ.ready){ [finishGroup,tileGroup,boardGroup,wallGroup,wallGroupR,facadeGroup,ceilGroup].forEach(g=>swap(g,mode)); Object.values(ITEM_GROUPS).forEach(g=>swap(g,mode)); }
    LIGHTING.apply(lit);
    // color maps are shared by the simple and PBR material: encoding is set once per texture by mode
    if(VIZ.ready){ const seen=new Set(); const enc=mode==='std'?THREE.sRGBEncoding:THREE.LinearEncoding;
      VIZ.std.forEach((s,b)=>{ [s.map,b.map].forEach(t=>{ if(t&&!seen.has(t)){ seen.add(t); if(t.encoding!==enc){ t.encoding=enc; t.needsUpdate=true; } } }); s.needsUpdate=true; b.needsUpdate=true; }); }
    renderer.compile&&renderer.compile(scene,camera);
    VIZ.mode=mode; VIZ.active=mode==='std';
  }
  VIZ.adopt=function(root){ // meshes added after prepare (GLB models): twins for their materials, then the current mode
    if(!VIZ.ready) return; root.traverse(o=>{ if(o.isMesh&&!VIZ.std.has(o.material)&&!VIZ.basic.has(o.material)){ const b=o.material; twins(b.userData.slot||'furniture',b); VIZ.basic.set(VIZ.std.get(b),b); VIZ.basic.set(VIZ.neutral.get(b),b); } }); swap(root,VIZ.mode); };
  VIZ.apply=apply;
  VIZ.set=function(on){ VIZ.on=!!on; try{ localStorage.setItem(KEY,VIZ.on?'1':'0'); }catch(e){} const cb=document.getElementById('mats'); if(cb) cb.checked=VIZ.on; apply(); };
  document.getElementById('mats').addEventListener('change',e=>VIZ.set(e.target.checked));
  let saved=null; try{ saved=localStorage.getItem(KEY); }catch(e){}
  if(saved==='1') VIZ.set(true); else apply();
})();
