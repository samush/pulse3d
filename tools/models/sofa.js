// Sofa 2.0×0.85×0.88 (tasks/realism-living/PLAN.md §3): frame with 15 mm bevel, arms 30 mm, 4 legs Ø0.04, seat cushions 0.14 r 50 mm with a dome,
// back cushions tilted 8° r 60 mm, piping Ø6 mm, shallow creases at the front edge. Local coords as in items.js: NW corner, back at z=0.88.
// Usage: node tools/models/sofa.js  → models/sofa.glb
const fs=require('fs'), path=require('path'), {rbox,piping,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
[[0.08,0.08],[1.92,0.08],[0.08,0.8],[1.92,0.8]].forEach(([x,z])=>add(cylinder(x,0,z,0.02,0.1),'metal'));
add(rbox(2,0.32,0.88,0.015,0,0.1,0,{m:1,step:0.15}),'fabric');          // frame
add(rbox(2,0.43,0.25,0.015,0,0.42,0.63,{m:1,step:0.15}),'fabric');      // back
[0,1.85].forEach(x=>add(rbox(0.15,0.18,0.88,0.03,x,0.42,0,{m:2,step:0.15}),'fabric')); // arms
[0.17,1.01].forEach(x=>{                                                // seat cushions, 20 mm seam between them
  add(rbox(0.82,0.14,0.57,0.05,x,0.42,0.05,{crown:0.015,fold:0.004}),'fabric');
  add(piping(x,0.05,0.82,0.57,0.05,0.49),'fabric');
  const tilt=8*Math.PI/180, at=g=>g.rotateX(tilt).translate(x,0.565,0.48); // back cushion leans on the back, top ≈0.83
  add(at(rbox(0.82,0.28,0.11,0.06,0,0,0,{m:2,crown:0.01})),'fabric');
  add(at(piping(0,0,0.82,0.28,0.06,-0.055).rotateX(-Math.PI/2)),'fabric');
});
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/sofa.glb'); fs.writeFileSync(out,buf);
console.log(out, (buf.length/1024).toFixed(0)+' KB', triangles+' triangles');
