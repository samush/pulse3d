// Chair 0.42×0.9×0.42 (tasks/realism-living/PLAN.md §3): plywood seat 15 mm with 3 mm chamfer, cushion 40 mm domed +8 mm, rails 30×30 under the seat,
// round legs Ø35, rear legs run on as back posts tilted 4°, back panel 15 mm curved in plan (R 0.6 m), height 0.55–0.88. Back at z=0.42, pivot NW corner.
// Usage: node tools/models/chair.js  → models/chair.glb (one file for chair1–6, rotated per item by glbRot)
const fs=require('fs'), path=require('path'), {THREE,rbox,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
const tilt=4*Math.PI/180, R=0.0175, X=[0.035,0.385];
X.forEach(x=>add(cylinder(x,0,0.04,R,0.415),'paint'));                                        // front legs
X.forEach(x=>add(cylinder(x,0,0.331,R,0.88/Math.cos(tilt)-0.0013).translate(-x,0,-0.331).rotateX(tilt).translate(x,0.0013,0.331),'paint')); // rear legs + posts, one piece; lifted so the tilted cap stays above the floor
const rail=(w,h,d,x,y,z)=>new THREE.BoxGeometry(w,h,d).translate(x+w/2,y+h/2,z+d/2);
[0.04,0.36].forEach(z=>add(rail(0.315,0.03,0.03,0.0525,0.385,z-0.015),'paint'));               // rails along x
X.forEach(x=>add(rail(0.03,0.03,0.285,x-0.015,0.385,0.0575),'paint'));                          // rails along z
add(rbox(0.40,0.015,0.40,0.003,0.01,0.415,0.01,{m:1,step:0.1}),'paint');                       // plywood seat
add(rbox(0.36,0.04,0.36,0.015,0.03,0.43,0.03,{m:2,step:0.05,crown:0.008}),'fabric');           // cushion
const phi=Math.asin(0.19/0.6), s=new THREE.Shape(); s.absarc(0.21,-0.2556,0.6,Math.PI/2-phi,Math.PI/2+phi,false); s.absarc(0.21,-0.2556,0.615,Math.PI/2+phi,Math.PI/2-phi,true);
const panel=new THREE.ExtrudeGeometry(s,{depth:0.33,bevelEnabled:false,curveSegments:12}).rotateX(Math.PI/2).translate(0,0.88,0); // arc band in plan, extruded down to 0.55
add(panel.translate(0,-0.415,-0.331).rotateX(tilt).translate(0,0.415,0.331),'paint');            // same lean as the posts
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/chair.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
