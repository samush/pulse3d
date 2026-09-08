// Modular sofa 2.0×0.85×0.88 in room 4 (revision 2026-09-08 after the Pinterest references): low seat block with r 60 mm edges on hidden feet,
// two back blocks sitting on the seat, no arms, piping along the seat top, two loose pillows. The chaise module is a separate item (models/chaise.glb).
// Local coords as in items.js: NW corner, back at z=0.88. Material names are coatings: upholstery (blocks), cushion (pillows), piping, metal (feet).
// Usage: node tools/models/sofa.js  → models/sofa.glb
const fs=require('fs'), path=require('path'), {rbox,piping,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
[[0.15,0.12],[1.85,0.12],[0.15,0.76],[1.85,0.76]].forEach(([x,z])=>add(cylinder(x,0,z,0.025,0.05,10),'metal'));   // feet hidden under the block
add(rbox(2.0,0.37,0.88,0.06,0,0.05,0,{m:2,step:0.2,crown:0.01}),'upholstery');                                    // seat block 0.05–0.42
add(piping(0.006,0.006,1.988,0.868,0.055,0.41),'piping');                                                          // seam along the seat top edge
[0,1.0].forEach(x=>add(rbox(1.0,0.30,0.28,0.05,x,0.42,0.60,{m:2,step:0.2,crown:0.01}),'upholstery'));            // two back blocks 0.42–0.72 on the seat
[0.20,1.10].forEach(x=>add(rbox(0.65,0.42,0.12,0.05,0,0,0,{m:2,step:0.12,crown:0.02}).rotateX(14*Math.PI/180).translate(x,0.42,0.42),'cushion')); // pillows leaning on the backs, top ≈0.83
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/sofa.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
