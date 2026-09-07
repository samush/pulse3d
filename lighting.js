// Light schemes and the image pipeline of the 3D view (materials-lighting M0). The neutral scheme is a fixed
// hemisphere + directional "sun" with shadows, nothing follows the camera; it exists to judge materials, not to
// depict the apartment's light. The interior scheme (lamps of the apartment) is added in L1. Plan view stays
// unlit and linear so its flat colours read as authored; the sRGB + ACES + constant-exposure pipeline applies to
// every lit 3D combination and never changes per material, room or texture.
const LIGHTING={scheme:'neutral',lit:false,exposure:0.75,schemes:['neutral','lamps']};
window.LIGHTING=LIGHTING;
const hemi=new THREE.HemisphereLight(0xffffff,0xa8a49c,1.0); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,0.55); sun.position.set(-6,14,-8); scene.add(sun);
(function(){
  // decided in M0 (PLAN §13): legacy light model — r128 MeshLambertMaterial keeps the π factor on direct light whatever the flag says
  renderer.physicallyCorrectLights=false;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); const sc=sun.shadow.camera; sc.left=-9; sc.right=9; sc.top=8; sc.bottom=-8; sc.near=1; sc.far=40; sun.shadow.bias=-0.0006; sun.shadow.normalBias=0.02;
  sun.target.position.set(cx,0,cz); scene.add(sun.target);
  // neutral scheme: the lit pipeline (ACES + sRGB) needs less light than the linear concept, otherwise white walls burn out.
  // lamps scheme: no sun, only an explicit weak fill standing in for bounced light — the lamps themselves come in L1
  const NEUTRAL={lit:{sun:0.9,hemi:0.45},flat:{sun:0.55,hemi:1.0}}, LAMPS={sun:0,hemi:0.15};
  const KEY='pulse3d.light';
  let env=null;
  function environment(){ // procedural room for reflections (mirror, chrome, glass) and ambient IBL: grey box, light ceiling, bright window; prefiltered once
    if(env) return env;
    const s=new THREE.Scene(), Bm=c=>new THREE.MeshBasicMaterial({color:c,side:THREE.BackSide});
    s.add(new THREE.Mesh(new THREE.BoxGeometry(8,3,8),Bm(0x8a8a8a))); const ceil=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshBasicMaterial({color:0xd8d8d8})); ceil.rotation.x=Math.PI/2; ceil.position.y=1.49; s.add(ceil);
    const win=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.6),new THREE.MeshBasicMaterial({color:0xffffff})); win.position.set(0,0.2,-3.99); s.add(win);
    const pm=new THREE.PMREMGenerator(renderer); env=pm.fromScene(s,0.04).texture; pm.dispose(); return env;
  }
  LIGHTING.environment=environment;
  LIGHTING.apply=function(lit){ // lit = 3D view with the fixed pipeline; false = plan view (flat, linear, no shadows)
    LIGHTING.lit=lit=!!lit; const n=!lit?NEUTRAL.flat:LIGHTING.scheme==='lamps'?LAMPS:NEUTRAL.lit;
    sun.intensity=n.sun; hemi.intensity=n.hemi;
    renderer.outputEncoding=lit?THREE.sRGBEncoding:THREE.LinearEncoding;
    renderer.toneMapping=lit?THREE.ACESFilmicToneMapping:THREE.NoToneMapping; renderer.toneMappingExposure=LIGHTING.exposure;
    renderer.shadowMap.enabled=lit;
    scene.environment=lit?environment():null;
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
