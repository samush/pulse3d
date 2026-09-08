// Bed 1.70×1.10×2.20 in room 3 (tasks/room3-master, revision 2026-09-08 after the reference render): upholstered base in two halves on
// short feet, split mattress 2×0.80 with a dome, flat padded headboard with a top rail, two large and two small pillows, blanket at the feet
// with a folded-back edge. Material names are ITEM_MATS keys. Pivot NW corner, headboard at z=0, metres.
// Usage: node tools/models/mbed.js  → models/mbed.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,piping,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
[[0.15,0.25],[1.55,0.25],[0.15,2.05],[1.55,2.05]].forEach(([x,z])=>add(cylinder(x,0,z,0.03,0.08,10),'dark'));           // feet
[0.02,0.86].forEach(x=>add(rbox(0.82,0.27,2.10,0.04,x,0.08,0.10,{m:2,step:0.2}),'kmat'));                                   // base in two halves 0.08–0.35
[0.02,0.86].forEach(x=>add(piping(x+0.003,0.103,0.814,2.094,0.04,0.34),'kmat'));                                                    // seam piping along the top edge of each half
add(rbox(1.70,0.75,0.08,0.02,0,0.35,0,{m:2,step:0.2}),'leather');                                                          // headboard 0.35–1.10, flat padded panel
add(rbox(1.70,0.05,0.10,0.015,0,1.05,0,{m:1,step:0.2}),'leather');                                                          // top rail, 2 cm proud of the panel
[0.05,0.86].forEach(x=>add(rbox(0.79,0.20,2.00,0.05,x,0.35,0.15,{m:2,step:0.15,crown:0.015}),'kmat'));                   // mattresses 0.35–0.55 (+ dome)
[0.10,0.90].forEach(x=>add(rbox(0.70,0.12,0.45,0.06,x,0.55,0.15,{m:2,step:0.12,crown:0.02}),'pillow'));                   // sleeping pillows
[0.30,0.95].forEach(x=>add(rbox(0.45,0.10,0.30,0.05,x,0.56,0.40,{m:2,step:0.1,crown:0.015}),'cover'));                    // small decorative pillows in front
add(rbox(1.60,0.06,1.30,0.03,0.05,0.55,0.85,{m:2,step:0.15,crown:0.01}),'cover');                                          // blanket at the feet
add(rbox(1.60,0.03,0.25,0.015,0.05,0.61,0.85,{m:1,step:0.15}),'cover');                                                     // folded-back edge
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/mbed.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
