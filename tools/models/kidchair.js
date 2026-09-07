// Kids desk chair 0.55×0.85×0.55 (tasks/realism-all/PLAN.md §8), one file for kidchair (room 1) and kidchair2 (room 2): 5-star base with casters,
// gas lift with a plastic cover, rounded seat with a dome, back tilted 5° on the +x side (as the procedural build), two armrests. Pivot NW corner, metres.
// Usage: node tools/models/kidchair.js  → models/kidchair.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
const C=0.275;                                                                       // footprint centre
for(let k=0;k<5;k++){ const a=Math.PI+k*2*Math.PI/5;                                // one arm points to the front (−x)
  add(new THREE.BoxGeometry(0.24,0.025,0.03).translate(0.12,0.0425,0).rotateY(-a).translate(C,0,C),'plastic');
  add(new THREE.CylinderGeometry(0.02,0.02,0.02,12).rotateX(Math.PI/2).translate(0.23,0.02,0).rotateY(-a).translate(C,0,C),'plastic'); } // caster Ø40 at the arm tip
add(cylinder(C,0.045,C,0.024,0.30,16),'chrome');                                     // gas lift 0.045–0.345
add(cylinder(C,0.045,C,0.03,0.15,16),'plastic');                                     // lift cover
add(rbox(0.40,0.02,0.40,0.005,0.075,0.38,0.075,{m:1,step:0.2}),'plastic');           // seat plate
add(rbox(0.45,0.06,0.45,0.02,0.05,0.40,0.05,{m:2,step:0.1,crown:0.01}),'cushion');   // seat cushion 0.40–0.46
add(new THREE.BoxGeometry(0.05,0.12,0.06).translate(0.485,0.44,C),'plastic');        // back support
const tilt=5*Math.PI/180;                                                            // back 0.48–0.84, leans to +x, stays inside x ≤ 0.55
add(rbox(0.05,0.36,0.40,0.02,0,0,0,{m:2,step:0.1}).rotateZ(-tilt).translate(0.465,0.48,0.075),'cushion');
[0.0,0.50].forEach(z=>{ add(new THREE.BoxGeometry(0.03,0.20,0.03).translate(0.31,0.52,z+0.025),'plastic'); add(rbox(0.22,0.025,0.05,0.01,0.20,0.62,z,{m:1,step:0.1}),'plastic'); }); // armrests
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/kidchair.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
