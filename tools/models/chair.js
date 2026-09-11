// Dining chair 0.48×0.80×0.48 (room 4, reference .local/chair-hoop: modern hoop-back chair): four round legs Ø35 tapering to Ø25 and splayed 3°,
// the rear pair runs on to carry a bent-wood hoop 70×20 mm that wraps the back over 180° in plan, a curved upholstered back pad inside the hoop,
// a rounded seat pad 50 mm on a thin plywood shell. Back at z=0.48, pivot NW corner. Materials: `paint` (wood frame), `cushion` (seat and back pads).
// Usage: node tools/models/chair.js  → models/chair.glb (one file for chair1–6, rotated per item by glbRot)
//        node tools/models/chair.js stool → models/stool.glb: the same chair with legs 80 mm longer (seat 0.52, back 0.86) for the bar peninsula
const fs=require('fs'), path=require('path'), {THREE,rbox,toGlb}=require('./glb.js');
const UP=process.argv[2]==='stool'?0.08:0, parts=[], add=(geo,mat)=>parts.push({geo,mat:mat,lift:true}); // lift: everything but the legs moves up by UP
const W=0.48, CX=0.24, CZ=0.25, R=0.215;                                                                   // hoop: half-ring of mean radius R about the seat centre
const leg=(x,z,h,tilt)=>{ const g=new THREE.CylinderGeometry(0.0125,0.0175,h,12).translate(0,h/2,0); g.rotateX(tilt[1]).rotateZ(tilt[0]); return g.translate(x,0,z); }; // 3° splay outwards, foot at (x,z)
[[0.055,0.085],[W-0.055,0.085]].forEach(([x,z])=>parts.push({geo:leg(x,z,0.44+UP,[x<CX?0.05:-0.05,-0.05]),mat:'paint'}));        // front legs up to the seat shell
[[0.10,0.385],[W-0.10,0.385]].forEach(([x,z])=>parts.push({geo:leg(x,z,0.74+UP,[0,0.04]),mat:'paint'}));                          // rear legs lean back 2.3° and run on to meet the hoop at ±50°
[[0.055,W-0.055,0.03,0.07,0.09,0.11],[0.055,W-0.055,0.03,0.07,0.365,0.385]].forEach(([x0,x1,y0,y1,z0,z1])=>add(new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0).translate((x0+x1)/2,0.405,(z0+z1)/2),'paint')); // seat rails
add(rbox(0.44,0.012,0.42,0.005,0.02,0.428,0.04,{m:1,step:0.1}),'paint');                                    // plywood shell
add(rbox(0.42,0.05,0.40,0.02,0.03,0.44,0.05,{m:2,step:0.05,crown:0.01}),'cushion');                         // seat pad, domed 10 mm
const band=(r0,r1,a0,a1,y0,y1)=>{ const s=new THREE.Shape(); s.absarc(CX,CZ,r1,a0,a1,false); s.absarc(CX,CZ,r0,a1,a0,true);
  return new THREE.ExtrudeGeometry(s,{depth:y1-y0,bevelEnabled:false,curveSegments:24}).rotateX(Math.PI/2).translate(0,y1,0); };  // arc band in plan (shape y = z after rotateX), extruded from y1 down to y0
add(band(R-0.01,R+0.01,0.12,Math.PI-0.12,0.71,0.78),'paint');                                 // hoop: 20 mm thick, 70 mm tall, open to the front
add(band(R-0.05,R-0.01,Math.PI/4,Math.PI*0.75,0.64,0.775),'cushion');                                          // back pad inside the hoop over 90°
parts.forEach(p=>{ if(p.lift) p.geo.translate(0,UP,0); });
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/'+(UP?'stool':'chair')+'.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
