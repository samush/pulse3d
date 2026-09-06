// Washer and dryer stacked, 0.6×1.72×0.6 (tasks/realism-all/PLAN.md §7): enamel bodies r 10 mm, porthole ring + glass, control strip with a knob. Front at z=0.6.
// Usage: node tools/models/washer.js → models/washer.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
[[0,0.85],[0.87,1.72]].forEach(([y0,y1])=>{
  add(rbox(0.6,y1-y0,0.58,0.01,0,y0,0,{m:1,step:0.2}),'paint');                                     // body, 20 mm short of the front plane
  const cy=(y0+y1)/2-0.05;
  add(new THREE.TorusGeometry(0.215,0.012,10,40).translate(0.3,cy,0.588),'plastic');               // porthole rim, 0.576–0.600
  add(new THREE.CylinderGeometry(0.205,0.205,0.02,40).rotateX(Math.PI/2).translate(0.3,cy,0.58),'plastic');
  add(new THREE.SphereGeometry(0.2,32,16,0,Math.PI*2,0,Math.PI/2).scale(1,0.09,1).rotateX(Math.PI/2).translate(0.3,cy,0.58),'glass'); // convex door glass, bulging 18 mm
  add(rbox(0.5,0.08,0.015,0.003,0.05,y1-0.12,0.58,{m:1,step:0.1}),'plastic');                       // control strip
  add(new THREE.CylinderGeometry(0.02,0.02,0.015,20).rotateX(Math.PI/2).translate(0.5,y1-0.08,0.5925),'chrome'); // knob, flush with the front plane
});
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/washer.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
