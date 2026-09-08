// Modular sofa 2.0×0.85×0.88 in room 4 (revision 2026-09-08 after .local/sofa_00.png): low seat block with r 60 mm edges on hidden feet,
// no back blocks and no arms, piping along the seat top, three big plump pillows leaning on the wall behind (back edge at z=0.88).
// Local coords as in items.js: NW corner, back at z=0.88. Material names are coatings: upholstery (block), cushion (pillows), piping, metal (feet).
// Usage: node tools/models/sofa.js  → models/sofa.glb
const fs=require('fs'), path=require('path'), {rbox,piping,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
[[0.15,0.12],[1.85,0.12],[0.15,0.76],[1.85,0.76]].forEach(([x,z])=>add(cylinder(x,0,z,0.025,0.05,10),'metal'));   // feet hidden under the block
add(rbox(2.0,0.37,0.88,0.06,0,0.05,0,{m:2,step:0.2,crown:0.01}),'upholstery');                                    // seat block 0.05–0.42
add(piping(0.006,0.006,1.988,0.868,0.055,0.41),'piping');                                                          // seam along the seat top edge
[0.10,0.70,1.30].forEach(x=>add(rbox(0.60,0.44,0.18,0.06,0,0,0,{m:2,step:0.12,crown:0.035}).rotateX(14*Math.PI/180).translate(x,0.42,0.58),'cushion')); // pillows 0.60×0.44×0.18 leaning 14° on the wall, top ≈0.85
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/sofa.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
