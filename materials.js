// Material library and the "Materials" control. Plan view draws the scene with flat unlit materials (outlines and
// dimensions); every 3D view is lit: real coatings are MeshStandardMaterial twins with color, roughness and bump
// maps, "materials off" gives neutral grey Standard twins that still take light and shadow (form check). Light
// schemes, shadows, environment and the image pipeline live in lighting.js. MATERIALS keeps pattern size in metres (UV in metres, so
// it holds on any surface), roughness and bump strength; maps are built from the color canvas, an optional `image`
// falls back to it on load error.
const MATERIALS={
  lam:      {name:'ламинат серый',        size:[1.9,1.9], rough:0.55, bump:0.35},
  vinyl:    {name:'кварцвинил серый, доска 0.18×1.20', size:[1.2,1.2], rough:0.45, bump:0.12},
  white:    {name:'плитка белый мрамор, пол', size:[0.6,0.6], rough:0.25, bump:0.15},
  whiteWall:{name:'плитка белый мрамор, стены', size:[0.6,0.6], rough:0.25, bump:0.15},
  grey:     {name:'плитка серый мрамор',  size:[0.6,0.6], rough:0.3,  bump:0.15},
  wp:       {name:'обои под покраску',    size:[1.2,1.2], rough:0.92, bump:0.45, albedo:0.82},
  tile:     {name:'керамогранит 60×120, ровный тёмный кашемир со швами, матовый', size:[0.6,1.2], rough:0.82, bump:0.03}, // matte: the glossy 0.3 threw lamp hotspots on the floor (user, 2026-09-09)
  tileLight:{name:'керамогранит 60×120, тёплый карамельный, матовый', size:[0.6,1.2], rough:0.85, bump:0.06}, // no photo coating: plain colour and the grout grid come from the concept canvas, like the bath tiles
  bathWall: {name:'плитка санузлов 60×30 горизонтально, белый мрамор со швами', size:[0.6,0.3], rough:0.3, bump:0.06},
  bathFloor:{name:'плитка санузлов 30×60 на полу, белый мрамор со швами', size:[0.3,0.6], rough:0.3, bump:0.06},
  plaster:  {name:'гипсокартон крашеный, матовый белый', size:[1,1], rough:0.9},
  greyWall: {name:'плитка санузлов 60×30 горизонтально, серый мрамор со швами', size:[0.6,0.3], rough:0.3, bump:0.06}, // no photo coating: the concept canvas keeps the grout grid the tile6060 map lacks
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
  mirror:   {name:'зеркало',              rough:0.06, metal:1}, // own neutral env map (VIZ.mirrorEnv), not scene.environment — materials-lighting M3
  ceiling:  {name:'потолок натяжной матовый', rough:0.9, albedo:0.95},
};
// Coatings (materials-lighting M1a): a real surface finish on top of a class. `class` names the MATERIALS entry (physical
// class), `dir` the local texture set (textures/MANIFEST.md: color = sRGB albedo, normal = OpenGL linear, rough = absolute
// roughness), `size` the metres one map covers, `rotation` degrees of the pattern, `maps` which files to use (default all
// three), `color` a plain sRGB hex used when the set has no albedo, `tint` linear RGB multipliers over the albedo map
// (a scale, not a recolour: >1 lightens a set authored dark), `rough` an explicit roughness when the rough map is dropped. Nothing is assigned by default: VIZ.coat / VIZ.coatFinish
// (M2, M4) choose the coating per item detail or finish; without one the twin stays the grey concept material.
const COATINGS={
  oakFloor:    {name:'дуб, доска пола',      class:'wood',   dir:'textures/oakFloor',     size:[1.2,1.2], tint:[0.9,0.86,0.82]},
  oakFurniture:{name:'дуб, шпон мебели',     class:'wood',   dir:'textures/oakFurniture', size:[1.83,1.83], tint:[0.74,0.7,0.66]}, // grain along V = along legs/posts and the table length (z); muted against the reference
  oakFurnitureX:{name:'дуб, шпон мебели, волокна по x', class:'wood', dir:'textures/oakFurniture', size:[1.83,1.83], rotation:90, tint:[0.74,0.7,0.66]}, // M4: horizontal parts elongated along x (loggia desk); own texture object, oakFurniture keeps rotation 0
  pineFurniture:{name:'сосна, мебель светлая', class:'wood', dir:'textures/oakFurniture', size:[1.83,1.83], tint:[1.25,1.16,0.98]}, // 2026-09-10: dining tables C/D — the oak set lightened towards pine, no own texture set
  cabinetPaint:{name:'крашеный МДФ, матовая эмаль', class:'cabinetPaint', size:[1,1], maps:[], color:0xd6cdbf, rough:0.42}, // 2026-09-09: no PaintedWood maps — the grain read as a strange texture; flat matte enamel like the reference wardrobe
  whiteEnamel: {name:'белая эмаль, техника',    class:'cabinetPaint', size:[1,1], maps:[], color:0xeeece8, rough:0.38}, // M4-3: washer/dryer body — the cabinetPaint set is beige, appliances are white
  wallPaint:   {name:'краска стен, тёплая светлая', class:'wallPaint', dir:'textures/wallPaint', size:[1,1], maps:['normal'], rough:0.9, color:0xe6ddd0, normalScale:0.08}, // Paint004 rough map gives glossy blotches under the environment; flat 0.9 instead,
  sofaWeave:   {name:'обивочная ткань, плетение', class:'fabric', dir:'textures/sofaWeave',   size:[0.4,0.4], tint:[1.9,1.8,1.65]}, // Fabric030 is authored dark grey; scaled to the light greige of the reference
  sofaWeaveLight:{name:'обивка дивана, светлая, крупное плетение', class:'fabric', dir:'textures/sofaWeave', size:[0.22,0.22], tint:[2.45,2.36,2.22]}, // 2026-09-10: same set for the room 4 sofa — half the pattern size so the weave reads from the room, lighter than the chair pads
  rugPile:     {name:'ковёр, ворс',           class:'fabric', dir:'textures/rugPile',      size:[1.7,1.7]},
  curtainLinen:{name:'штора, лён',            class:'fabric', dir:'textures/curtainLinen', size:[0.5,0.5]},
  stoneCounter:{name:'камень столешницы',     class:'facade', dir:'textures/stoneCounter', size:[1.5,1.5], maps:['color','normal'], rough:0.3, tint:[0.62,0.6,0.58]}, // Marble024 rough map is polished (0.11); §4.3: no excessive gloss, darker than the splash
  stoneSplash: {name:'камень фартука, гранит', class:'facade', dir:'textures/stoneSplash', size:[0.8,0.8], tint:[0.85,0.85,0.85]}, // 0.8 m per map: grain readable from the table without shouting
  tile6060:    {name:'плитка 600×600',        class:'white',  dir:'textures/tile6060',     size:[0.6,0.6], maps:['color','normal'], rough:0.35}, // rough maps of both tile sets are mirror-polished (0.07); §4.3 range 0.25–0.55
  tile60120:   {name:'керамогранит 600×1200', class:'tile',   dir:'textures/tile60120',    size:[1.2,1.2], maps:['color','normal'], rough:0.35},
  tile6060grey:{name:'плитка 600×600, серая',  class:'grey',   dir:'textures/tile6060',     size:[0.6,0.6], maps:['color','normal'], rough:0.35, tint:[0.42,0.41,0.4]}, // M4-4: same set as tile6060 (shared textures), darkened to the grey marble of the bath west walls
  plastic:     {name:'пластик матовый',       class:'plastic', dir:'textures/plastic',     size:[0.5,0.5], maps:['normal','rough'], normalScale:0.3},
  hplPanel:    {name:'HPL-плита, столешница и фартук', class:'facade', size:[1,1], maps:[], color:0xb3aea7, rough:0.45}, // 2026-09-10: kitchen 4 — one panel and one tone for worktop and splashback, no texture set for HPL
  hplFront:    {name:'HPL-плита, матовый фасад', class:'facade', size:[1,1], maps:[], color:0xd0cac1, rough:0.62},       // matte fronts of the same family, a shade lighter than the worktop
};
const VIZ={on:false,ready:false,mode:'basic',std:new Map(),neutral:new Map(),basic:new Map(),variants:new Map(),textures:new Map(),finishCoat:{board:'oakFloor',wallPaint:'wallPaint',wood:'oakFloor',woodFloor:'oakFloor',white:'tile6060',whiteWall:'tile6060',grey:'tile6060grey'},loadErrors:[]}; // finishCoat: global coating per finish key (M2: oak boards, 60×120 stone, wall paint, oak jambs; M4: 60×60 tiles of rooms 7/8/9) // mode: basic (plan) | neutral | std (real coatings); variants: basic → Map(coating → twin)
window.VIZ=VIZ; window.MATERIALS=MATERIALS; window.COATINGS=COATINGS;
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
  let mirrorEnvRT=null, mirrorEnvBuilds=0;
  function mirrorEnv(){ // neutral room stand-in for mirrors: light ceiling, dark floor, two soft strip lights, no window; prefiltered once, temporaries freed
    if(mirrorEnvRT) return mirrorEnvRT.texture;
    const s=new THREE.Scene(), Bm=c=>new THREE.MeshBasicMaterial({color:c,side:THREE.BackSide}), Fm=c=>new THREE.MeshBasicMaterial({color:c});
    s.add(new THREE.Mesh(new THREE.BoxGeometry(8,2.8,8),Bm(0x8c8a86)));
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(8,8),Fm(0x3a3936)); floor.rotation.x=-Math.PI/2; floor.position.y=-1.39; s.add(floor);
    const ceil=new THREE.Mesh(new THREE.PlaneGeometry(8,8),Fm(0xcfcdc8)); ceil.rotation.x=Math.PI/2; ceil.position.y=1.39; s.add(ceil);
    [-1.6,1.6].forEach(z=>{ const strip=new THREE.Mesh(new THREE.PlaneGeometry(3.2,0.28),Fm(0xfff4e0)); strip.rotation.x=Math.PI/2; strip.position.set(0,1.38,z); s.add(strip); });
    const pm=new THREE.PMREMGenerator(renderer); mirrorEnvRT=pm.fromScene(s,0.06); pm.dispose(); mirrorEnvBuilds++;
    s.traverse(o=>{ if(o.isMesh){ o.geometry.dispose(); o.material.dispose(); } });
    return mirrorEnvRT.texture;
  }
  VIZ.mirrorEnv=mirrorEnv; VIZ.mirrorEnvBuilds=()=>mirrorEnvBuilds;
  VIZ.mirrorEnvIntensity={neutral:1.0,lamps:0.5,illusion:0.5}; // per light scheme: with lamps off the mirror must not stay a bright picture; 0.5 chosen in L1 on the bath 9 frame
  function stdFor(key,basic){ // PBR twin of a simple material; maps from the same image, same repeat
    const spec=MATERIALS[key]||MATERIALS.furniture; const m=new THREE.MeshStandardMaterial({color:basic.color?basic.color.clone():0xffffff,roughness:spec.rough,metalness:spec.metal||0,transparent:basic.transparent,opacity:basic.opacity,depthWrite:basic.depthWrite,side:basic.side,emissive:spec.emissive?basic.color.clone():0x000000});
    m.color.multiplyScalar(spec.albedo!=null?spec.albedo:0.85); // white paint/tile reflect ~85 %, otherwise ACES burns everything out
    if(key==='mirror'){ m.envMap=mirrorEnv(); m.color.set(0xf2f4f6); Object.defineProperty(m,'envMapIntensity',{get:()=>{ const v=VIZ.mirrorEnvIntensity[LIGHTING.scheme]; return v==null?1:v; }}); } // explicit map, light neutral tint; intensity read per frame, so LIGHTING.set alone is enough
    if(basic.map&&basic.map.image){ m.map=basic.map; if(spec.bump){ m.roughnessMap=texLike(basic.map,roughMap(basic.map.image,spec.rough)); m.normalMap=texLike(basic.map,normalMap(basic.map.image,4)); m.normalScale=new THREE.Vector2(spec.bump,spec.bump); }
      if(spec.image){ new THREE.TextureLoader().load(spec.image,t=>{ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1/spec.size[0],1/spec.size[1]); t.encoding=THREE.sRGBEncoding; m.map=t; m.needsUpdate=true; },undefined,()=>{ VIZ.loadErrors=(VIZ.loadErrors||[]).concat(key+': '+spec.image); }); } }
    return m;
  }
  // ---- coatings: one texture object per (file, size, rotation), one Standard twin per (basic material, coating); shared by every mesh using both
  function texture(url,spec,srgb){ const key=url+'|'+spec.size.join('x')+'|'+(spec.rotation||0); let t=VIZ.textures.get(key); if(t) return t;
    t=new THREE.TextureLoader().load(url,undefined,undefined,()=>{ VIZ.loadErrors.push(url); t.userData.failed=true; t.dispatchEvent({type:'failed'}); }); t.userData={}; // r128 Texture has no userData of its own
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1/spec.size[0],1/spec.size[1]); t.center.set(0.5,0.5); t.rotation=(spec.rotation||0)*Math.PI/180;
    t.encoding=srgb?THREE.sRGBEncoding:THREE.LinearEncoding; t.userData.key=key; VIZ.textures.set(key,t); return t; } // encoding fixed once here; coating maps are never shared with the flat concept
  function variant(basic,coating){ // twin of `basic` wearing `coating`; unknown coating → the plain class twin, noted once
    const spec=COATINGS[coating]; if(!spec){ if(!VIZ.loadErrors.includes('coating: '+coating)){ VIZ.loadErrors.push('coating: '+coating); console.warn('coating "'+coating+'" unknown, class twin used'); } return VIZ.std.get(basic); }
    let vs=VIZ.variants.get(basic); if(!vs){ vs=new Map(); VIZ.variants.set(basic,vs); } if(vs.has(coating)) return vs.get(coating);
    const cls=MATERIALS[spec.class]||MATERIALS.furniture, maps=spec.maps||['color','normal','rough'];
    const m=new THREE.MeshStandardMaterial({roughness:maps.includes('rough')?1:(spec.rough!=null?spec.rough:cls.rough),metalness:spec.metal!=null?spec.metal:(cls.metal||0),transparent:basic.transparent,opacity:basic.opacity,depthWrite:basic.depthWrite,side:basic.side});
    if(maps.includes('color')){ m.color.set(0xffffff); if(spec.tint) m.color.setRGB(...spec.tint); } else if(spec.color!=null) m.color.set(spec.color).convertSRGBToLinear(); else { m.color.copy(basic.color).multiplyScalar(cls.albedo!=null?cls.albedo:0.85); } // albedo map or an sRGB hex converted once; never the map darkened by the concept grey
    const put=(file,prop,srgb)=>{ const t=texture(spec.dir+'/'+file+'.jpg',spec,srgb); m[prop]=t; const drop=()=>{ if(m[prop]===t){ m[prop]=null; if(prop==='map'&&spec.color!=null) m.color.set(spec.color).convertSRGBToLinear(); m.needsUpdate=true; } }; if(t.userData.failed) drop(); else t.addEventListener('failed',drop); }; // a failed file leaves the flat preset, the model stays
    if(maps.includes('color')) put('color','map',true); if(maps.includes('normal')){ put('normal','normalMap',false); const ns=spec.normalScale!=null?spec.normalScale:1; m.normalScale.set(ns,ns); } if(maps.includes('rough')) put('rough','roughnessMap',false);
    m.userData.coating=coating; vs.set(coating,m); VIZ.basic.set(m,basic); return m;
  }
  const ITEM_KEYS=new Map(); // concept material → its ITEM_MATS key, so an item override can name a detail material ('pillow') and not only a class ('fabric')
  function coatingFor(group,basic,mesh){ // item override by GLB material name, then ITEM_MATS key, then slot, then '*'; a value of null cancels
    const c=group.userData.coat||(ITEMS_BY_ID[group.userData.id]||{}).coat; if(!c) return null;
    if(!ITEM_KEYS.size) Object.entries(ITEM_MATS).forEach(([k,m])=>ITEM_KEYS.set(m,k));
    const gm=mesh.userData.glbMat, key=ITEM_KEYS.get(basic), slot=basic.userData.slot||'furniture';
    return (gm&&gm in c)?c[gm]:(key&&key in c)?c[key]:(slot in c)?c[slot]:c['*']||null; }
  let ITEMS_BY_ID={}; const FINISH_KEYS=new Map(); // basic finish material → finishMats key
  function neutralFor(basic){ // grey Standard twin without maps: same colour, transparency and sides, one roughness for every class
    const slot=basic.userData.slot, m=new THREE.MeshStandardMaterial({color:basic.color?basic.color.clone():0xffffff,roughness:0.8,metalness:0,transparent:basic.transparent,opacity:basic.opacity,depthWrite:basic.depthWrite,side:basic.side,emissive:slot==='emitter'?basic.color.clone():0x000000});
    m.color.multiplyScalar(0.85); return m;
  }
  function twins(k,b){ VIZ.std.set(b,stdFor(k,b)); VIZ.neutral.set(b,neutralFor(b)); }
  function prepare(){ // build the twins once
    if(VIZ.ready) return; VIZ.ready=true;
    const fm=window.finishMats||{}; Object.entries(fm).forEach(([k,b])=>FINISH_KEYS.set(b,k)); FINISH_KEYS.set(wallMat,'wall'); FINISH_KEYS.set(ceilMat,'ceiling'); FINISH_KEYS.set(ceilSlabMat,'ceiling'); facadeMats.forEach(b=>FINISH_KEYS.set(b,'facade'));
    (window.ITEMS||[]).forEach(it=>{ ITEMS_BY_ID[it.id]=it; });
    Object.entries(fm).forEach(([k,b])=>twins(k,b));
    twins('wall',wallMat); twins('ceiling',ceilMat); twins('ceiling',ceilSlabMat);
    facadeMats.forEach(b=>twins('facade',b));
    Object.values(ITEM_GROUPS).forEach(g=>g.traverse(o=>{ if(o.isMesh&&!VIZ.std.has(o.material)) twins(o.material.userData.slot||'furniture',o.material); }));
    VIZ.std.forEach((s,b)=>VIZ.basic.set(s,b)); VIZ.neutral.forEach((s,b)=>VIZ.basic.set(s,b));
  }
  const NO_CAST=new Set([finishGroup,tileGroup,boardGroup]);
  function swap(root,mode){ // mode: 'basic' | 'neutral' | 'std'; any twin maps back to its basic first, so the source state does not matter
    const lit=mode!=='basic', cast=lit&&!NO_CAST.has(root)&&root!==ceilGroup; // ceiling never casts: it would block the neutral sun from above (L1 revisits for lamps)
    const item=root.userData&&root.userData.id!=null&&ITEM_GROUPS[root.userData.id]===root; // item groups take per-item coatings, finish groups the global finish coating
    root.traverse(o=>{ if(!o.isMesh) return; const b=VIZ.basic.get(o.material)||o.material; let m=mode==='std'?VIZ.std.get(b):mode==='neutral'?VIZ.neutral.get(b):b;
      if(mode==='std'&&m){ const c=item?coatingFor(root,b,o):VIZ.finishCoat[FINISH_KEYS.get(b)]; if(c) m=variant(b,c); }
      if(m) o.material=m; o.castShadow=cast; o.receiveShadow=lit; }); }
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
  VIZ.twins=b=>[VIZ.std.get(b),VIZ.neutral.get(b),...(VIZ.variants.get(b)||new Map()).values()].filter(Boolean); // every lit twin of a concept material (wall slider)
  VIZ.coat=function(id,key,coating){ // item override: key = ITEM_MATS key, slot name or '*'; coating = COATINGS key or null; only this item is re-swapped
    const g=ITEM_GROUPS[id]; if(!g) return; const c=g.userData.coat=Object.assign({},(ITEMS_BY_ID[id]||{}).coat,g.userData.coat); c[key]=coating; if(VIZ.ready&&VIZ.mode==='std') swap(g,'std'); };
  VIZ.coatFinish=function(key,coating){ VIZ.finishCoat[key]=coating; if(VIZ.ready&&VIZ.mode==='std') [finishGroup,tileGroup,boardGroup,wallGroup,wallGroupR,facadeGroup,ceilGroup].forEach(g=>swap(g,'std')); }; // finish key of finishMats, 'wall', 'facade' or 'ceiling'
  VIZ.set=function(on){ VIZ.on=!!on; try{ localStorage.setItem(KEY,VIZ.on?'1':'0'); }catch(e){} const cb=document.getElementById('mats'); if(cb) cb.checked=VIZ.on; apply(); };
  document.getElementById('mats').addEventListener('change',e=>VIZ.set(e.target.checked));
  let saved=null; try{ saved=localStorage.getItem(KEY); }catch(e){}
  if(saved==='1') VIZ.set(true); else apply();
})();
