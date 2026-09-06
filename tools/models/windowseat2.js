// Window seat 0.60×0.65×1.702 in room 2 (tasks/realism-all/PLAN.md §9): body with a recessed plinth, two deep drawer fronts west (x=0) with bar handles
// 8 mm proud (inside size + 1 cm), mattress r 30 with a dome, two pillows at the towers. Slot names only. Pivot NW corner, back at the east wall, metres.
// Usage: node tools/models/windowseat2.js  → models/windowseat2.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
const L=1.702;
add(new THREE.BoxGeometry(0.53,0.05,L-0.10).translate(0.335,0.025,L/2),'paint');       // plinth, recessed 0.05 from the front
add(rbox(0.58,0.40,L,0.005,0.02,0.05,0,{m:1,step:0.3}),'paint');                       // body 0.05–0.45
[0.01,L/2+0.005].forEach(z=>{ const d=L/2-0.015;
  add(new THREE.BoxGeometry(0.02,0.38,d).translate(0.01,0.25,z+d/2),'paint');           // drawer front, 3 mm gap to the neighbour
  add(new THREE.CylinderGeometry(0.004,0.004,0.15,10).rotateX(Math.PI/2).translate(-0.004,0.25,z+d/2),'chrome'); // bar handle Ø8
  [z+d/2-0.065,z+d/2+0.065].forEach(zz=>add(new THREE.CylinderGeometry(0.003,0.003,0.006,8).rotateZ(Math.PI/2).translate(-0.002,0.25,zz),'chrome')); });
add(rbox(0.58,0.08,L-0.04,0.03,0.02,0.45,0.02,{m:2,step:0.1,crown:0.01}),'fabric');    // mattress 0.45–0.53
[0.05,L-0.35].forEach(z=>add(rbox(0.40,0.11,0.30,0.05,0.10,0.53,z,{m:2,step:0.1,crown:0.01}),'fabric')); // pillows, top ≤ 0.65
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/windowseat2.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
