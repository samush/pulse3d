// Kids sofa 0.75×0.80×1.60 under the loft bed (tasks/realism-all/PLAN.md §8): frame r 15, back on the east side (x=0.75), arms at both z ends r 30,
// seat cushion r 40 with a dome and piping, back cushion tilted 8°, 4 legs Ø30. Pivot NW corner, metres.
// Usage: node tools/models/kidsofa.js  → models/kidsofa.glb
const fs=require('fs'), path=require('path'), {rbox,piping,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
[[0.05,0.05],[0.70,0.05],[0.05,1.55],[0.70,1.55]].forEach(([x,z])=>add(cylinder(x,0,z,0.015,0.1),'metal'));
add(rbox(0.75,0.32,1.60,0.015,0,0.10,0,{m:1,step:0.15}),'fabric');                 // frame 0.10–0.42
add(rbox(0.15,0.38,1.60,0.015,0.60,0.42,0,{m:1,step:0.15}),'fabric');              // back to the wall, 0.42–0.80
[0,1.45].forEach(z=>add(rbox(0.60,0.18,0.15,0.03,0,0.42,z,{m:2,step:0.15}),'fabric')); // arms
add(rbox(0.55,0.13,1.28,0.04,0.03,0.42,0.16,{crown:0.012}),'fabric');              // seat cushion between the arms
add(piping(0.03,0.16,0.55,1.28,0.04,0.485),'fabric');
const tilt=8*Math.PI/180;                                                          // back cushion leans on the back, top ≈0.78
add(rbox(0.10,0.26,1.28,0.05,0,0,0,{m:2,crown:0.008}).rotateZ(-tilt).translate(0.49,0.52,0.16),'fabric');
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/kidsofa.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
