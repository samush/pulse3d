// Bed 1.70×1.10×2.82 in room 3 (tasks/room3-master, revision 2026-09-08 after the podium reference): solid dark-wood podium 0–0.30 running to
// the rug end (bench past the feet), mattress top flush with the window sill (0.56), two drawer fronts on the room side (local x=1.70, west after
// rot 180) north of the wardrobe, split mattress 2×0.80 with a dome, flat padded
// headboard with a top rail, two large and two small pillows, blanket at the feet with a folded-back edge. Material names are ITEM_MATS keys.
// Pivot NW corner, headboard at z=0, metres.
// Usage: node tools/models/mbed.js  → models/mbed.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,piping,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
add(rbox(1.676,0.30,2.82,0.006,0,0,0,{m:1,step:0.3}),'dark');                                                            // podium 0–0.30; drawer fronts fill the last 24 mm so the whole stays inside size
[0.70,1.75].forEach(z=>{ add(rbox(0.012,0.20,0.90,0.003,1.676,0.05,z,{m:1,step:0.3}),'dark');                              // drawer front, 12 mm proud; both north of the wardrobe (z<0.60)
  [[z,0.05],[z+0.85,0.05]].forEach(([zz,d])=>add(rbox(0.012,0.20,d,0.002,1.688,0.05,zz,{m:1,step:0.3}),'dark'));           // raised frame: two uprights…
  [0.05,0.20].forEach(y=>add(rbox(0.012,0.05,0.80,0.002,1.688,y,z+0.05,{m:1,step:0.3}),'dark')); });                       // …and two rails around a recessed field
add(rbox(1.70,0.80,0.08,0.02,0,0.30,0,{m:2,step:0.2}),'leather');                                                          // headboard 0.30–1.10, flat padded panel
add(rbox(1.70,0.05,0.10,0.015,0,1.05,0,{m:1,step:0.2}),'leather');                                                          // top rail, 2 cm proud of the panel
[0.05,0.86].forEach(x=>add(rbox(0.79,0.25,2.00,0.05,x,0.30,0.15,{m:2,step:0.15,crown:0.01}),'kmat'));                    // mattresses 0.30–0.55, dome to 0.56 = sill top
[0.10,0.90].forEach(x=>add(rbox(0.70,0.12,0.45,0.06,x,0.55,0.15,{m:2,step:0.12,crown:0.02}),'pillow'));                   // sleeping pillows
[0.30,0.95].forEach(x=>add(rbox(0.45,0.10,0.30,0.05,x,0.56,0.40,{m:2,step:0.1,crown:0.015}),'cover'));                    // small decorative pillows in front
add(rbox(1.60,0.06,1.30,0.03,0.05,0.55,0.85,{m:2,step:0.15,crown:0.01}),'cover');                                          // blanket at the feet
add(rbox(1.60,0.03,0.25,0.015,0.05,0.61,0.85,{m:1,step:0.15}),'cover');                                                     // folded-back edge
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/mbed.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
