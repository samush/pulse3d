// Bed 1.74×1.10×2.82 in room 3 (tasks/room3-master, revision 2026-09-09 after the radiator cover): solid dark-wood podium 0–0.30 running to
// the rug end (bench past the feet), mattress top flush with the window sill (0.56), two drawer fronts on the room side (local x=1.74, west after
// rot 180) north of the wardrobe, split mattress 2×0.80 with a dome, flat padded
// headboard with a top rail, two large and two small pillows, blanket at the feet with a folded-back edge. Material names are ITEM_MATS keys.
// Pivot NW corner, headboard at z=0, metres. Local x=0 is the front of the radiator cover: the mattress sits flush with it, the podium is 0.14 wider on the room side.
// Usage: node tools/models/mbed.js  → models/mbed.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,piping,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
add(rbox(1.716,0.30,2.82,0.006,0,0,0,{m:1,step:0.3}),'dark');                                                            // podium 0–0.30; drawer fronts fill the last 24 mm so the whole stays inside size
[0.70,1.75].forEach(z=>{ add(rbox(0.012,0.20,0.90,0.003,1.716,0.05,z,{m:1,step:0.3}),'dark');                              // drawer front, 12 mm proud; both north of the wardrobe (z<0.60)
  [[z,0.05],[z+0.85,0.05]].forEach(([zz,d])=>add(rbox(0.012,0.20,d,0.002,1.728,0.05,zz,{m:1,step:0.3}),'dark'));           // raised frame: two uprights…
  [0.05,0.20].forEach(y=>add(rbox(0.012,0.05,0.80,0.002,1.728,y,z+0.05,{m:1,step:0.3}),'dark')); });                       // …and two rails around a recessed field
add(rbox(1.74,0.80,0.08,0.02,0,0.30,0,{m:2,step:0.2}),'leather');                                                          // headboard 0.30–1.10, flat padded panel
add(rbox(1.74,0.05,0.10,0.015,0,1.05,0,{m:1,step:0.2}),'leather');                                                          // top rail, 2 cm proud of the panel
[0,0.81].forEach(x=>add(rbox(0.79,0.25,2.00,0.05,x,0.30,0.15,{m:2,step:0.15,crown:0.01}),'kmat'));                    // mattresses 0.30–0.55, dome to 0.56 = sill top
[0.05,0.85].forEach(x=>add(rbox(0.70,0.12,0.45,0.06,x,0.55,0.15,{m:2,step:0.12,crown:0.02}),'pillow'));                   // sleeping pillows
[0.25,0.90].forEach(x=>add(rbox(0.45,0.10,0.30,0.05,x,0.56,0.40,{m:2,step:0.1,crown:0.015}),'cover'));                    // small decorative pillows in front
add(rbox(1.65,0.025,1.35,0.01,0,0.55,0.85,{m:1,step:0.15,crown:0.005}),'cover');                                           // blanket: a thin sheet over the mattress, 5 cm past the room side and the foot; flush with the cover side
add(rbox(0.025,0.20,1.35,0.01,1.625,0.35,0.85,{m:1,step:0.15}),'cover');                                                    // side drop hanging 20 cm down the room side only
add(rbox(1.65,0.20,0.025,0.01,0,0.35,2.175,{m:1,step:0.15}),'cover');                                                       // foot drop
add(rbox(1.65,0.02,0.25,0.01,0,0.575,0.85,{m:1,step:0.15}),'cover');                                                        // folded-back edge
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/mbed.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
