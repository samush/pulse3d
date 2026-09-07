// Light schemes and the image pipeline of the 3D view (materials-lighting M0, L1). The neutral scheme is a fixed
// hemisphere + directional "sun" with shadows, nothing follows the camera; it exists to judge materials, not to
// depict the apartment's light. The lamps scheme (L1) is the apartment's own fixtures: LIGHTS lists every source
// per tasks/materials-lighting/lighting-plan.md, each parented to its item group so setItemPose moves light and
// target together; a group (one switch key) drives the intensity of its sources and the emissive of its diffusers.
// Plan view stays unlit and linear so its flat colours read as authored; the sRGB + ACES + constant-exposure
// pipeline applies to every lit 3D combination and never changes per material, room or texture.
const LIGHTING={scheme:'neutral',lit:false,exposure:0.75,schemes:['neutral','lamps'],groups:{},lights:[]};
window.LIGHTING=LIGHTING;
const hemi=new THREE.HemisphereLight(0xffffff,0xa8a49c,1.0); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,0.55); sun.position.set(-6,14,-8); scene.add(sun);
// Source catalogue (L1: rooms 4 and 9; L2: the rest). World coordinates as in lighting-plan.md §3; `to` omitted = straight down.
// `w` is the relative weight of the plan, `k` colour temperature; `shadow` marks the 1024 shadow-map sources of the first reference.
const LIGHTS=[
  {id:'ceil4_1',item:'ceil4_1',group:'g4.work',type:'spot',at:[9.25,2.68,2.45],to:[8.6,0.9,2.45],k:3000,w:1.0},
  {id:'ceil4_2',item:'ceil4_2',group:'g4.work',type:'spot',at:[9.25,2.68,3.70],to:[8.6,0.9,3.70],k:3000,w:1.0,shadow:true},
  {id:'ceil4_3',item:'ceil4_3',group:'g4.work',type:'spot',at:[9.25,2.68,4.95],to:[8.6,0.9,4.95],k:3000,w:1.0},
  {id:'led8a',item:'led8',group:'g4.splash',type:'point',at:[8.6,1.43,2.8],k:3000,w:0.3,distance:1.5},
  {id:'led8b',item:'led8',group:'g4.splash',type:'point',at:[8.6,1.43,4.6],k:3000,w:0.3,distance:1.5},
  {id:'ceil4_4',item:'ceil4_4',group:'g4.table',type:'spot',at:[10.25,2.68,2.35],k:3000,w:0.8,angle:0.45},
  {id:'ceil4_5',item:'ceil4_5',group:'g4.table',type:'spot',at:[10.25,2.68,3.35],k:3000,w:0.8,angle:0.45},
  {id:'lamp',item:'lamp',group:'g4.table',type:'point',at:[10.25,1.80,2.42],k:2700,w:0.4,distance:3},
  {id:'ceil4_6',item:'ceil4_6',group:'g4.main',type:'spot',at:[11.10,2.68,4.20],k:3000,w:1.0},
  {id:'ceil4_7',item:'ceil4_7',group:'g4.main',type:'spot',at:[12.50,2.68,4.20],k:3000,w:1.0},
  {id:'ceil4_8',item:'ceil4_8',group:'g4.sofa',type:'spot',at:[11.85,2.68,5.25],to:[11.85,0.45,5.85],k:2700,w:0.7,angle:0.45,shadow:true},
  {id:'ceil4_9',item:'ceil4_9',group:'g4.sofa',type:'spot',at:[12.85,2.68,5.25],to:[12.85,0.45,5.85],k:2700,w:0.7,angle:0.45},
  {id:'spot1',item:'spot1',group:'g9.main',type:'spot',at:[8.52,2.68,9.00],k:3000,w:1.0},
  {id:'spot2',item:'spot2',group:'g9.main',type:'spot',at:[9.52,2.68,9.44],k:3000,w:0.8},
  {id:'spot3',item:'spot3',group:'g9.main',type:'spot',at:[9.32,2.68,8.69],to:[9.32,1.0,8.35],k:3000,w:1.0,shadow:true},
  {id:'bathmirror',item:'bathmirror',group:'g9.mirror',type:'point',at:[9.275,1.70,8.19],k:3000,w:0.4,distance:1.5},
  // room 1 (L2-1): kidlight stays the general light; no source above the loft platform (a lying child's eye is at y 2.1-2.3)
  {id:'kidlight',item:'kidlight',group:'g1.main',type:'spot',at:[2.70,2.66,3.50],k:3000,w:1.0,angle:0.8,shadow:true},
  {id:'ceil1_1',item:'ceil1_1',group:'g1.desk',type:'spot',at:[1.50,2.68,4.45],k:3000,w:0.8},
  {id:'tracka',item:'track',group:'g1.track',type:'spot',at:[2.53,2.55,4.25],to:[2.53,1.6,4.86],k:3000,w:0.6,angle:0.35,penumbra:0.6,distance:4},
  {id:'trackb',item:'track',group:'g1.track',type:'spot',at:[3.53,2.55,4.25],to:[3.53,1.6,4.86],k:3000,w:0.6,angle:0.35,penumbra:0.6,distance:4},
  {id:'bra1',item:'bra1',group:'g1.sofa',type:'spot',at:[5.28,1.20,2.87],to:[4.9,0.5,2.9],k:2700,w:0.5,angle:0.6,distance:4},
  {id:'bra2',item:'bra2',group:'g1.read',type:'spot',at:[5.36,2.27,2.47],to:[4.9,1.9,2.5],k:2700,w:0.4,angle:0.6,distance:4},
  {id:'kidbed',item:'kidbed',group:'g1.bed',type:'point',at:[4.255,1.69,2.88],k:3000,w:0.3,distance:2},
  // room 2 (L2-1): kidlight2 stays; the desk under the platform is lit only from ceil2_3 (in the platform slab) and the desk lamp
  {id:'kidlight2',item:'kidlight2',group:'g2.main',type:'spot',at:[12.905,2.66,8.195],k:3000,w:1.0,angle:0.8,shadow:true},
  {id:'ceil2_1',item:'ceil2_1',group:'g2.main',type:'spot',at:[13.85,2.68,8.00],k:3000,w:0.7},
  {id:'ceil2_2',item:'ceil2_2',group:'g2.main',type:'spot',at:[11.70,2.68,7.10],k:3000,w:0.8},
  {id:'ceil2_3',item:'ceil2_3',group:'g2.desk',type:'spot',at:[11.70,1.69,8.60],k:3500,w:0.7,angle:0.7,distance:4},
  {id:'desklamp2',item:'desklamp2',group:'g2.desk',type:'spot',at:[11.55,1.11,9.30],to:[11.4,0.72,8.7],k:3500,w:0.4,angle:0.6,distance:4},
  {id:'bra3',item:'bra3',group:'g2.seat',type:'spot',at:[14.47,1.25,7.37],to:[14.5,0.65,7.9],k:2700,w:0.5,angle:0.6,distance:4},
  {id:'bra4',item:'bra4',group:'g2.read',type:'spot',at:[11.67,2.27,9.50],to:[12.0,1.9,9.3],k:2700,w:0.4,angle:0.6,distance:4},
  {id:'kidbed2',item:'kidbed2',group:'g2.bed',type:'point',at:[12.247,1.69,8.69],k:3000,w:0.3,distance:2},
  // room 3 (L2-1): mlight replaced by a 2x2 grid over the free floor (L0g removed the plafond); nothing above the bed
  {id:'ceil3_1',item:'ceil3_1',group:'g3.main',type:'spot',at:[10.80,2.68,10.60],k:3000,w:1.0,shadow:true},
  {id:'ceil3_2',item:'ceil3_2',group:'g3.main',type:'spot',at:[12.20,2.68,10.60],k:3000,w:1.0},
  {id:'ceil3_3',item:'ceil3_3',group:'g3.main',type:'spot',at:[10.80,2.68,12.20],k:3000,w:1.0},
  {id:'ceil3_4',item:'ceil3_4',group:'g3.main',type:'spot',at:[12.20,2.68,12.20],k:3000,w:1.0},
  {id:'bra5',item:'bra5',group:'g3.read',type:'spot',at:[13.41,1.35,12.96],to:[13.41,0.7,12.3],k:2700,w:0.4,angle:0.6,distance:4},
  {id:'bra6',item:'bra6',group:'g3.read',type:'spot',at:[14.41,1.35,12.96],to:[14.41,0.7,12.3],k:2700,w:0.4,angle:0.6,distance:4},
  {id:'led4',item:'led4',group:'g3.head',type:'point',at:[13.91,1.84,12.82],k:2700,w:0.3,distance:1.5},
  {id:'bra7',item:'bra7',group:'g3.vanity',type:'spot',at:[11.40,1.45,9.94],to:[12.1,1.3,10.4],k:3000,w:0.5,angle:0.6,distance:4},
  {id:'bra8',item:'bra8',group:'g3.vanity',type:'spot',at:[12.80,1.45,9.94],to:[12.1,1.3,10.4],k:3000,w:0.5,angle:0.6,distance:4},
  {id:'led5',item:'led5',group:'g3.tv',type:'point',at:[13.91,1.06,9.83],k:3000,w:0.2,distance:1.5},
  // room 5 (L2-2): a new line of recessed points along the route; the mirror is lit from the side by entry's profiles and ceil5_1, never head-on
  {id:'ceil5_1',item:'ceil5_1',group:'g5.entry',type:'spot',at:[7.20,2.68,7.05],k:3000,w:1.0,shadow:true},
  {id:'entrya',item:'entry',group:'g5.entry',type:'point',at:[6.36,1.50,7.15],k:3000,w:0.3,distance:1.5},
  {id:'entryb',item:'entry',group:'g5.entry',type:'point',at:[6.36,1.50,7.32],k:3000,w:0.3,distance:1.5},
  {id:'ceil5_2',item:'ceil5_2',group:'g5.north',type:'spot',at:[7.20,2.68,5.60],k:3000,w:1.0},
  {id:'ceil5_3',item:'ceil5_3',group:'g5.north',type:'spot',at:[7.20,2.68,4.40],k:3000,w:1.0},
  {id:'ceil5_4',item:'ceil5_4',group:'g5.corr',type:'spot',at:[9.30,2.68,7.00],k:3000,w:1.0},
  {id:'ceil5_5',item:'ceil5_5',group:'g5.corr',type:'spot',at:[10.45,2.68,8.10],k:3000,w:0.8},
  {id:'ceil5_6',item:'ceil5_6',group:'g5.corr',type:'spot',at:[10.45,2.68,9.30],k:3000,w:0.8},
  // rooms 6 and 7 (L2-2): the wardrobe keeps its 4000 K linear light + rail LED; the laundry gets one wide recessed point
  {id:'wlighta',item:'wlight',group:'g6.main',type:'spot',at:[6.50,2.68,2.40],k:4000,w:0.8,angle:0.8},
  {id:'wlightb',item:'wlight',group:'g6.main',type:'spot',at:[6.50,2.68,3.35],k:4000,w:0.8,angle:0.8},
  {id:'led6a',item:'led6',group:'g6.rail',type:'point',at:[6.14,1.98,2.30],k:4000,w:0.3,distance:1.5},
  {id:'led6b',item:'led6',group:'g6.rail',type:'point',at:[6.14,1.98,3.05],k:4000,w:0.3,distance:1.5},
  {id:'ceil7_1',item:'ceil7_1',group:'g7.main',type:'spot',at:[7.50,2.68,3.45],k:4000,w:1.0,angle:0.8},
];
window.LIGHTS=LIGHTS;
(function(){
  // decided in M0 (PLAN §13): legacy light model — r128 MeshLambertMaterial keeps the π factor on direct light whatever the flag says
  renderer.physicallyCorrectLights=false;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); const sc=sun.shadow.camera; sc.left=-9; sc.right=9; sc.top=8; sc.bottom=-8; sc.near=1; sc.far=40; sun.shadow.bias=-0.0006; sun.shadow.normalBias=0.02;
  sun.target.position.set(cx,0,cz); scene.add(sun.target);
  // neutral scheme: the lit pipeline (ACES + sRGB) needs less light than the linear concept, otherwise white walls burn out.
  // lamps scheme: no sun, an explicit weak fill standing in for bounced light, and the LIGHTS catalogue
  const NEUTRAL={lit:{sun:0.9,hemi:0.45},flat:{sun:0.55,hemi:1.0}}, LAMPS={sun:0,hemi:0.15};
  const KELVIN={2700:0xffa957,3000:0xffb46b,3500:0xffc489,4000:0xffd1a3}; // sRGB black-body approximations (lighting-plan.md §1), converted once
  const BASE={spot:1.8,point:1.2}; // intensity of weight 1.0 in the legacy light model; tuned on the kitchen and bath 9 frames
  const KEY='pulse3d.light';
  const envs={};
  function environment(scheme){ // procedural room for reflections (mirror, chrome, glass) and ambient IBL, prefiltered once per scheme:
    scheme=scheme||LIGHTING.scheme; if(envs[scheme]) return envs[scheme]; // neutral — grey box, light ceiling, bright window; lamps — dim warm box without a window (bounced lamp light, not daylight)
    const lamps=scheme==='lamps', s=new THREE.Scene(), Bm=c=>new THREE.MeshBasicMaterial({color:c,side:THREE.BackSide});
    s.add(new THREE.Mesh(new THREE.BoxGeometry(8,3,8),Bm(lamps?0x2a2826:0x8a8a8a))); const ceil=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshBasicMaterial({color:lamps?0x4a4640:0xd8d8d8})); ceil.rotation.x=Math.PI/2; ceil.position.y=1.49; s.add(ceil);
    if(!lamps){ const win=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.6),new THREE.MeshBasicMaterial({color:0xffffff})); win.position.set(0,0.2,-3.99); s.add(win); }
    const pm=new THREE.PMREMGenerator(renderer); envs[scheme]=pm.fromScene(s,0.04).texture; pm.dispose(); s.traverse(o=>{ if(o.isMesh){ o.geometry.dispose(); o.material.dispose(); } }); return envs[scheme];
  }
  LIGHTING.environment=environment;
  // ---- catalogue → THREE lights inside the item groups; diffusers of a group share one emitter material (the shared ITEM_MATS.led is cloned per group)
  const ledByGroup={}, emitters={}; // group → Set of concept emitter materials whose twins follow the switch
  LIGHTS.forEach(L=>{
    const g=ITEM_GROUPS[L.item]; if(!g){ console.warn('lighting: item "'+L.item+'" missing for '+L.id); return; }
    const l=L.type==='point'?new THREE.PointLight(0xffffff,0,L.distance||3):new THREE.SpotLight(0xffffff,0,L.distance||6,L.angle||0.55,L.penumbra!=null?L.penumbra:0.5);
    l.color.set(KELVIN[L.k]||0xffffff).convertSRGBToLinear(); l.name=L.id; l.userData={group:L.group,w:L.w,type:L.type,shadow:!!L.shadow};
    g.updateMatrixWorld(true); l.position.copy(g.worldToLocal(new THREE.Vector3(...L.at))); g.add(l);
    if(l.isSpotLight){ const to=L.to||[L.at[0],0,L.at[2]]; l.target.position.copy(g.worldToLocal(new THREE.Vector3(...to))); g.add(l.target); }
    if(L.shadow){ l.shadow.mapSize.set(1024,1024); l.shadow.camera.near=0.15; l.shadow.camera.far=L.distance||6; l.shadow.bias=-0.0005; l.shadow.normalBias=0.02; }
    LIGHTING.lights.push(l); if(!(L.group in LIGHTING.groups)) LIGHTING.groups[L.group]=true;
    const set=emitters[L.group]||(emitters[L.group]=new Set());
    g.traverse(o=>{ if(!o.isMesh||!o.material.userData||o.material.userData.slot!=='emitter') return;
      if(o.material===ITEM_MATS.led){ let m=ledByGroup[L.group]; if(!m){ m=ITEM_MATS.led.clone(); m.name='led:'+L.group; ledByGroup[L.group]=m; } o.material=m; }
      set.add(o.material); });
  });
  LIGHTING.emitters=g=>[...(emitters[g]||[])];
  function sync(){ // sources and diffusers from scheme × group state; a source off has no shadow pass either
    const lamps=LIGHTING.lit&&LIGHTING.scheme==='lamps';
    LIGHTING.lights.forEach(l=>{ const on=lamps&&LIGHTING.groups[l.userData.group]!==false; l.intensity=on?BASE[l.userData.type]*l.userData.w:0; l.castShadow=on&&l.userData.shadow; l.visible=on; }); // hidden lights leave the shaders: the neutral scheme and switched-off groups do not pay for the whole catalogue
    if(window.VIZ&&VIZ.ready) Object.entries(emitters).forEach(([g,set])=>{ const on=!lamps||LIGHTING.groups[g]!==false; set.forEach(b=>VIZ.twins(b).forEach(m=>{ m.emissiveIntensity=on?1:0; })); }); // neutral scheme: every diffuser glows, as before L1
  }
  LIGHTING.group=function(id,on){ if(!(id in LIGHTING.groups)) return; LIGHTING.groups[id]=on!==false; sync(); }; // one switch key: intensity + emissive of its own group only
  LIGHTING.apply=function(lit){ // lit = 3D view with the fixed pipeline; false = plan view (flat, linear, no shadows)
    LIGHTING.lit=lit=!!lit; const lamps=lit&&LIGHTING.scheme==='lamps', n=!lit?NEUTRAL.flat:lamps?LAMPS:NEUTRAL.lit;
    sun.intensity=n.sun; hemi.intensity=n.hemi; sun.castShadow=!lamps; // a sun at 0 would still render its 2048 shadow map
    renderer.outputEncoding=lit?THREE.sRGBEncoding:THREE.LinearEncoding;
    renderer.toneMapping=lit?THREE.ACESFilmicToneMapping:THREE.NoToneMapping; renderer.toneMappingExposure=LIGHTING.exposure;
    renderer.shadowMap.enabled=lit;
    scene.environment=lit?environment():null;
    sync();
  };
  LIGHTING.set=function(scheme){ // user choice, remembered; re-applies the current view state
    if(!LIGHTING.schemes.includes(scheme)) scheme='neutral';
    LIGHTING.scheme=scheme; try{ localStorage.setItem(KEY,scheme); }catch(e){}
    const sel=document.getElementById('light'); if(sel) sel.value=scheme; LIGHTING.apply(LIGHTING.lit);
  };
  document.getElementById('light').addEventListener('change',e=>LIGHTING.set(e.target.value));
  let saved=null; try{ saved=localStorage.getItem(KEY); }catch(e){}
  LIGHTING.set(saved||'neutral');
})();
