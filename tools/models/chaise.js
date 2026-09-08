// Chaise module 0.90×0.85×0.80 of the room 4 sofa (2026-09-08): seat block continuing the sofa seat northwards, low arm block on the
// east side (towards the balcony wall), one pillow against the arm, hidden feet. NW corner, the sofa touches the south face (z=0.80).
// Material names are the sofa coatings: upholstery, cushion, piping, metal. Usage: node tools/models/chaise.js  → models/chaise.glb
const fs=require('fs'), path=require('path'), {rbox,piping,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
[[0.12,0.12],[0.78,0.12],[0.12,0.68],[0.78,0.68]].forEach(([x,z])=>add(cylinder(x,0,z,0.025,0.05,10),'metal'));
add(rbox(0.90,0.37,0.80,0.06,0,0.05,0,{m:2,step:0.2,crown:0.01}),'upholstery');                                   // seat block 0.05–0.42
add(piping(0.006,0.006,0.888,0.788,0.055,0.41),'piping');
add(rbox(0.20,0.22,0.80,0.05,0.70,0.42,0,{m:2,step:0.2,crown:0.01}),'upholstery');                                // arm block 0.42–0.64 on the east edge
add(rbox(0.12,0.42,0.55,0.05,0,0,0,{m:2,step:0.12,crown:0.02}).rotateZ(-14*Math.PI/180).translate(0.53,0.42,0.12),'cushion'); // pillow leaning on the arm
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/chaise.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
