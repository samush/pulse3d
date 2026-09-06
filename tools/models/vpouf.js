// Vanity pouf 0.4×0.45×0.4 in room 3 (tasks/realism-all/PLAN.md §10): leather block r 60 mm with a 10 mm dome, piping at mid-height, four Ø30 metal legs 0.12 (as pouf.js, own size).
// Usage: node tools/models/vpouf.js → models/vpouf.glb
const fs=require('fs'), path=require('path'), {rbox,piping,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
[[0.045,0.045],[0.355,0.045],[0.045,0.355],[0.355,0.355]].forEach(([x,z])=>add(cylinder(x,0,z,0.015,0.12),'metal'));
add(rbox(0.396,0.32,0.396,0.06,0.002,0.12,0.002,{m:3,step:0.05,crown:0.01}),'leather'); // dome tops out at 0.45
add(piping(0.002,0.002,0.396,0.396,0.06,0.28),'leather');
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/vpouf.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
