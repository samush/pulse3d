// Kids desk chair 0.55×0.85×0.55, one file for kidchair (room 1) and kidchair2 (room 2), concept 2026-10-26 (.local render):
// white plastic frame, grey mesh back with a Y-shaped white brace, grey crowned seat, flip armrests, 5-star white base with twin casters.
// Pivot NW corner, metres; back on the +x side as the procedural build.
// Usage: node tools/models/kidchair.js  → models/kidchair.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
const C=0.275;                                                                        // footprint centre
for(let k=0;k<5;k++){ const a=Math.PI+k*2*Math.PI/5;                                  // one arm points to the front (−x)
  add(rbox(0.22,0.035,0.045,0.012,0.02,0.02,-0.0225).rotateY(-a).translate(C,0,C),'plastic');
  [-0.017,0.017].forEach(dz=>add(new THREE.CylinderGeometry(0.019,0.019,0.012,12).rotateX(Math.PI/2).translate(0.225,0.019,dz).rotateY(-a).translate(C,0,C),'plastic')); } // twin casters at the arm tip
add(cylinder(C,0.05,C,0.022,0.32,16),'chrome');                                       // gas lift 0.05–0.37
add(cylinder(C,0.05,C,0.03,0.17,16),'plastic');                                       // white lift cover
add(new THREE.TorusGeometry(0.155,0.011,8,24).rotateX(Math.PI/2).translate(C,0.185,C),'plastic'); // footrest ring
add(rbox(0.40,0.025,0.40,0.008,0.075,0.385,0.075,{m:1,step:0.2}),'plastic');          // seat pan
add(rbox(0.46,0.07,0.44,0.025,0.045,0.405,0.055,{m:2,step:0.1,crown:0.012}),'cushion'); // crowned grey seat 0.40–0.48
add(new THREE.BoxGeometry(0.05,0.14,0.07).translate(0.49,0.46,C),'plastic');          // back support bracket
const tilt=6*Math.PI/180, bk=g=>g.rotateZ(-tilt).translate(0.455,0.48,0.075);         // back leans to +x, top stays under 0.85
add(bk(rbox(0.035,0.37,0.40,0.016,0,0,0,{m:1,step:0.1})),'plastic');                  // white back frame
add(bk(rbox(0.022,0.31,0.33,0.01,-0.004,0.03,0.035,{m:2,step:0.1})),'cushion');       // grey mesh panel inset
add(bk(new THREE.BoxGeometry(0.014,0.15,0.028).translate(-0.012,0.095,0.20)),'plastic'); // Y brace: stem
[0.55,-0.55].forEach(a=>add(bk(new THREE.BoxGeometry(0.014,0.15,0.028).rotateX(a).translate(-0.012,0.235,0.20+(a>0?0.05:-0.05))),'plastic')); // Y brace: arms
[0.015,0.475].forEach(z=>{ add(new THREE.BoxGeometry(0.03,0.18,0.03).translate(0.33,0.53,z+0.03),'plastic'); add(rbox(0.20,0.025,0.06,0.012,0.22,0.62,z,{m:1,step:0.1}),'cushion'); }); // armrest posts and grey pads
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/kidchair.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
