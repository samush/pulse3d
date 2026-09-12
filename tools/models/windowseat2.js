// Window seat 0.60×0.65×1.702 in room 2 (tasks/realism-all/PLAN.md §9): body with a recessed plinth, a radiator grille west (x=0), mattress r 30 with a dome, two pillows at the towers. Material names: paint/chrome slots, kmat (mattress), pillow. Pivot NW corner, back at the east wall, metres.
// Usage: node tools/models/windowseat2.js  → models/windowseat2.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
const L=1.702;
// решётка: рамка 0.04 сверху и снизу, вертикальные рёбра с прорезями 0.02 (шаг ~0.09)
const grille=(cx,y0,y1,z0,z1,m)=>{ const f=0.04, sw=0.02, D=z1-z0, n=Math.round((D-0.07)/0.09), rib=(D-n*sw)/(n+1);
  [[y0+f/2,f],[y1-f/2,f]].forEach(([cy,h])=>add(new THREE.BoxGeometry(0.02,h,D).translate(cx,cy,(z0+z1)/2),m));
  for(let i=0;i<=n;i++){ const a=z0+i*(rib+sw); add(new THREE.BoxGeometry(0.02,y1-y0-2*f,rib).translate(cx,(y0+y1)/2,a+rib/2),m); } };
add(new THREE.BoxGeometry(0.53,0.05,L-0.10).translate(0.335,0.025,L/2),'paint');       // plinth, recessed 0.05 from the front
add(rbox(0.58,0.40,L,0.005,0.02,0.05,0,{m:1,step:0.3}),'paint');                       // body 0.05–0.45
grille(0.01,0.06,0.44,0.01,L-0.01,'paint');                                            // front grille west instead of drawers: air from the radiator under the sill
add(rbox(0.58,0.08,L-0.04,0.03,0.02,0.45,0.02,{m:2,step:0.1,crown:0.01}),'kmat');      // mattress 0.45–0.53
[0.05,L-0.35].forEach(z=>add(rbox(0.40,0.11,0.30,0.05,0.10,0.53,z,{m:2,step:0.1,crown:0.01}),'pillow')); // pillows, top ≤ 0.65
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/windowseat2.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
