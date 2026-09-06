// Window seat 0.60×0.65×1.89 in room 1 (tasks/realism-all/PLAN.md §8): body with a recessed plinth, two deep drawer fronts east (x=0.60) with bar handles,
// mattress r 30 with a dome, two pillows at the ends. Material names are ITEM_MATS keys, so the concept shades stay. Pivot NW corner, metres.
// Usage: node tools/models/windowseat1.js  → models/windowseat1.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
const L=1.89;
add(new THREE.BoxGeometry(0.53,0.05,L-0.10).translate(0.285,0.025,L/2),'dark');       // plinth, recessed 0.05
add(rbox(0.58,0.40,L,0.005,0,0.05,0,{m:1,step:0.3}),'body');                          // body 0.05–0.45
[0.01,L/2+0.005].forEach(z=>{ const d=L/2-0.015;
  add(new THREE.BoxGeometry(0.02,0.38,d).translate(0.59,0.25,z+d/2),'wdoor');          // drawer front, 3 mm gap to the neighbour
  add(new THREE.CylinderGeometry(0.004,0.004,0.15,10).rotateX(Math.PI/2).translate(0.604,0.25,z+0.465),'handle'); // bar handle Ø8, 8 mm proud — inside size 0.60 + 1 cm
  [z+0.40,z+0.53].forEach(zz=>add(new THREE.CylinderGeometry(0.003,0.003,0.006,8).rotateZ(Math.PI/2).translate(0.602,0.25,zz),'handle')); });
add(rbox(0.58,0.08,L-0.04,0.03,0,0.45,0.02,{m:2,step:0.1,crown:0.01}),'kmat');       // mattress 0.45–0.53
[0.05,L-0.35].forEach(z=>add(rbox(0.40,0.11,0.30,0.05,0.10,0.53,z,{m:2,step:0.1,crown:0.01}),'pillow')); // pillows, top ≤ 0.65
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/windowseat1.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
