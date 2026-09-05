// Библиотека материалов и режим «Визуализация». В режиме плана сцена рисуется простыми материалами
// без света (контуры и размеры), в визуализации — MeshStandardMaterial с картами цвета, шероховатости
// и микрорельефа, ACES tone mapping, sRGB и тени от солнца. Описания материалов отделены от кода сцены:
// MATERIALS — размер рисунка в метрах (сохраняется на любой поверхности через UV в метрах),
// шероховатость и сила рельефа; карты строятся из канваса цвета (процедурно), внешние изображения
// можно указать полем `image` — при ошибке загрузки остаётся процедурная карта.
const MATERIALS={
  lam:      {name:'ламинат серый',        size:[1.9,1.9], rough:0.55, bump:0.35},
  white:    {name:'плитка белый мрамор, пол', size:[0.6,0.6], rough:0.25, bump:0.15},
  whiteWall:{name:'плитка белый мрамор, стены', size:[0.6,0.6], rough:0.25, bump:0.15},
  grey:     {name:'плитка серый мрамор',  size:[0.6,0.6], rough:0.3,  bump:0.15},
  wp:       {name:'обои под покраску',    size:[1.2,1.2], rough:0.92, bump:0.45, albedo:0.82},
  wood:     {name:'дерево светлое, откосы', size:[1.0,1.0], rough:0.6,  bump:0.3},
  plinth:   {name:'плинтус белый',        rough:0.7},
  frame:    {name:'дверная коробка белая', rough:0.7},
  wall:     {name:'стена',                rough:0.95},
  furniture:{name:'мебель (концепт)',     rough:0.8},
};
const VIZ={on:false,ready:false,std:new Map(),basic:new Map()};
window.VIZ=VIZ; window.MATERIALS=MATERIALS;
(function(){
  const KEY='pulse3d.viz';
  // ---- карты из канваса цвета: шероховатость = инверсия яркости (светлое глаже), нормали — Собель по высоте
  function lum(img){ const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const g=c.getContext('2d'); g.drawImage(img,0,0);
    const d=g.getImageData(0,0,c.width,c.height).data, L=new Float32Array(c.width*c.height); for(let i=0;i<L.length;i++) L[i]=(0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2])/255; return {w:c.width,h:c.height,L}; }
  function roughMap(img,base){ const {w,h,L}=lum(img); const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); const id=g.createImageData(w,h);
    for(let i=0;i<L.length;i++){ const v=Math.max(0,Math.min(1,base+(0.5-L[i])*0.5))*255; id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=v; id.data[i*4+3]=255; } g.putImageData(id,0,0); return c; }
  function normalMap(img,strength){ const {w,h,L}=lum(img); const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); const id=g.createImageData(w,h);
    const at=(x,y)=>L[((y+h)%h)*w+((x+w)%w)];
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const dx=(at(x+1,y)-at(x-1,y))*strength, dy=(at(x,y+1)-at(x,y-1))*strength; const n=new THREE.Vector3(-dx,-dy,1).normalize(); const i=(y*w+x)*4;
      id.data[i]=(n.x*0.5+0.5)*255; id.data[i+1]=(n.y*0.5+0.5)*255; id.data[i+2]=(n.z*0.5+0.5)*255; id.data[i+3]=255; } g.putImageData(id,0,0); return c; }
  function texLike(src,canvas){ const t=new THREE.CanvasTexture(canvas); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.copy(src.repeat); return t; }
  function stdFor(key,basic){ // PBR-двойник простого материала; карты — из той же картинки, масштаб — тот же repeat
    const spec=MATERIALS[key]||MATERIALS.furniture; const m=new THREE.MeshStandardMaterial({color:basic.color?basic.color.clone():0xffffff,roughness:spec.rough,metalness:0.0,transparent:basic.transparent,opacity:basic.opacity,depthWrite:basic.depthWrite,side:basic.side});
    m.color.multiplyScalar(spec.albedo!=null?spec.albedo:0.85); // белая краска/плитка отражают ~85 %, иначе при ACES всё выгорает
    if(basic.map&&basic.map.image){ m.map=basic.map; if(spec.bump){ m.roughnessMap=texLike(basic.map,roughMap(basic.map.image,spec.rough)); m.normalMap=texLike(basic.map,normalMap(basic.map.image,4)); m.normalScale=new THREE.Vector2(spec.bump,spec.bump); }
      if(spec.image){ new THREE.TextureLoader().load(spec.image,t=>{ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1/spec.size[0],1/spec.size[1]); t.encoding=THREE.sRGBEncoding; m.map=t; m.needsUpdate=true; },undefined,()=>{ VIZ.loadErrors=(VIZ.loadErrors||[]).concat(key+': '+spec.image); }); } }
    return m;
  }
  function prepare(){ // построить двойники один раз
    if(VIZ.ready) return; VIZ.ready=true;
    const fm=window.finishMats||{};
    Object.entries(fm).forEach(([k,b])=>{ VIZ.std.set(b,stdFor(k,b)); });
    VIZ.std.set(wallMat,stdFor('wall',wallMat));
    Object.values(ITEM_GROUPS).forEach(g=>g.traverse(o=>{ if(o.isMesh&&!VIZ.std.has(o.material)){ const b=o.material; const m=new THREE.MeshStandardMaterial({color:b.color.clone(),roughness:MATERIALS.furniture.rough,metalness:0,transparent:b.transparent,opacity:b.opacity,emissive:b.type==='MeshBasicMaterial'?b.color.clone():0x000000}); VIZ.std.set(b,m); } }));
    VIZ.std.forEach((s,b)=>VIZ.basic.set(s,b));
    // солнце с тенями поверх существующих источников
    sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); const sc=sun.shadow.camera; sc.left=-9; sc.right=9; sc.top=8; sc.bottom=-8; sc.near=1; sc.far=40; sun.shadow.bias=-0.0006; sun.shadow.normalBias=0.02;
    sun.target.position.set(cx,0,cz); scene.add(sun.target);
  }
  function swap(root,toStd){ root.traverse(o=>{ if(!o.isMesh) return; const m=toStd?VIZ.std.get(o.material):VIZ.basic.get(o.material); if(m) o.material=m; if(toStd){ o.castShadow=root!==finishGroup; o.receiveShadow=true; } else { o.castShadow=false; o.receiveShadow=false; } }); }
  function apply(){ // фактический вид: визуализация включена и не режим плана
    const on=VIZ.on&&!controls.plan;
    if(on) prepare();
    if(VIZ.ready){ [finishGroup,wallGroup,wallGroupR].forEach(g=>swap(g,on)); Object.values(ITEM_GROUPS).forEach(g=>swap(g,on)); }
    renderer.outputEncoding=on?THREE.sRGBEncoding:THREE.LinearEncoding;
    renderer.toneMapping=on?THREE.ACESFilmicToneMapping:THREE.NoToneMapping; renderer.toneMappingExposure=on?0.75:1.0;
    renderer.shadowMap.enabled=on; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    // карты цвета общие у простого и PBR-материала: кодировка задаётся по режиму один раз для каждой текстуры
    if(VIZ.ready){ const seen=new Set(); const enc=on?THREE.sRGBEncoding:THREE.LinearEncoding;
      VIZ.std.forEach((s,b)=>{ [s.map,b.map].forEach(t=>{ if(t&&!seen.has(t)){ seen.add(t); if(t.encoding!==enc){ t.encoding=enc; t.needsUpdate=true; } } }); s.needsUpdate=true; b.needsUpdate=true; }); }
    sun.intensity=on?0.9:0.55; if(hemiLight) hemiLight.intensity=on?0.45:1.0; // ACES + sRGB: суммарный свет ниже, чем в плоском режиме, иначе белые стены выгорают
    renderer.compile&&renderer.compile(scene,camera);
    VIZ.active=on;
  }
  const hemiLight=scene.children.find(o=>o.isHemisphereLight);
  VIZ.apply=apply;
  VIZ.set=function(on){ VIZ.on=!!on; try{ localStorage.setItem(KEY,VIZ.on?'1':'0'); }catch(e){} const cb=document.getElementById('viz'); if(cb) cb.checked=VIZ.on; apply(); };
  document.getElementById('viz').addEventListener('change',e=>VIZ.set(e.target.checked));
  ['vTop','vFP'].forEach(id=>document.getElementById(id).addEventListener('click',()=>setTimeout(apply,0)));
  let saved=null; try{ saved=localStorage.getItem(KEY); }catch(e){}
  if(saved==='1') VIZ.set(true); else apply();
})();
