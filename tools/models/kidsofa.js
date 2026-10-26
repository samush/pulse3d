// Kids sofa 0.75×0.80×1.60 under the loft bed, concept 2026-10-26: low mattress base almost on the floor, big rounded
// arm rolls at both z ends, back bolster on the east side (x=0.75), one wide seat pad with piping, hidden pucks for feet.
// Pivot NW corner, metres. Material names are coatings: upholstery, cushion, piping, metal.
// Usage: node tools/models/kidsofa.js  → models/kidsofa.glb
const fs=require('fs'), path=require('path'), {rbox,piping,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
[[0.07,0.12],[0.66,0.12],[0.07,1.48],[0.66,1.48]].forEach(([x,z])=>add(cylinder(x,0,z,0.015,0.05),'metal'));
add(rbox(0.73,0.30,1.60,0.06,0.01,0.04,0,{m:1,step:0.15}),'upholstery');                 // base mattress 0.04–0.34
add(rbox(0.16,0.44,1.12,0.05,0.59,0.34,0.24,{m:1,step:0.15}),'upholstery');              // back bolster between the arms, 0.34–0.78
[0,1.36].forEach(z=>add(rbox(0.64,0.34,0.24,0.10,0.02,0.33,z,{m:2,step:0.15}),'upholstery')); // big rounded arm rolls
add(rbox(0.54,0.12,1.08,0.05,0.03,0.34,0.26,{crown:0.015}),'cushion');                   // seat pad between the arms
add(piping(0.025,0.26,0.54,1.08,0.03,0.445),'piping');
const tilt=10*Math.PI/180;                                                               // back cushion leans on the bolster
add(rbox(0.11,0.28,1.06,0.05,0,0,0,{m:2,crown:0.01}).rotateZ(-tilt).translate(0.50,0.46,0.27),'cushion');
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/kidsofa.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
