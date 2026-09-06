// Teardrop acrylic tub 0.99×0.58×1.60 along the west wall (tasks/realism-all/PLAN.md §11): same outline as the procedural build
// (wall edge at x=0, convex outer edge wo(z)), 50 mm shell as a ring with a rounded rim, basin floor at 0.12, chrome drain. Proxy stays procedural.
// Usage: node tools/models/tub.js → models/tub.glb
const fs=require('fs'), path=require('path'), {THREE,toGlb}=require('./glb.js');
const L=1.60, W=0.05, wo=z=>0.45+0.5497*z-0.1326*z*z, N=32;
const outline=(inset)=>{ const p=new THREE.Path(); const z0=inset, z1=L-inset; p.moveTo(inset,-z0); for(let i=0;i<=N;i++){ const z=z0+(z1-z0)*i/N; p.lineTo(wo(z)-inset,-z); } p.lineTo(inset,-z1); p.closePath(); return p; }; // shape y = -z, see rotateX below
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
const shell=new THREE.Shape(); shell.curves=outline(0).curves; shell.holes.push(outline(W));
add(new THREE.ExtrudeGeometry(shell,{depth:0.58-0.04,bevelThickness:0.02,bevelSize:0.02,bevelOffset:-0.02,bevelSegments:3,curveSegments:1}).rotateX(-Math.PI/2).translate(0,0.02,0),'acrylic'); // ring wall, rounded rim and base
const floor=new THREE.Shape(); floor.curves=outline(W-0.002).curves;
add(new THREE.ExtrudeGeometry(floor,{depth:0.02,bevelEnabled:false}).rotateX(-Math.PI/2).translate(0,0.10,0),'acrylic');           // basin floor 0.10–0.12
add(new THREE.CylinderGeometry(0.03,0.03,0.004,24).translate(0.22,0.122,1.25),'chrome');                                             // drain
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/tub.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
