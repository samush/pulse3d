// Loggia chair 0.45×0.90×0.45 (tasks/realism-all/PLAN.md §12), a straight-back variant of chair.js: plywood seat 15 mm with a 3 mm chamfer, cushion 40 mm domed,
// rails 30×30, round legs Ø35, the rear legs run on as vertical posts to 0.90, flat back panel 15 mm at 0.55–0.88. Back at z=0 (north, as the procedural build), pivot NW corner.
// Usage: node tools/models/bchair.js  → models/bchair.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,cylinder,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
const R=0.0175, X=[0.035,0.415];
X.forEach(x=>add(cylinder(x,0,0.415,R,0.415),'paint'));                                        // front legs (south)
X.forEach(x=>add(cylinder(x,0,0.035,R,0.90),'paint'));                                         // rear legs + posts, one piece
const rail=(w,h,d,x,y,z)=>new THREE.BoxGeometry(w,h,d).translate(x+w/2,y+h/2,z+d/2);
[0.035,0.415].forEach(z=>add(rail(0.345,0.03,0.03,0.0525,0.385,z-0.015),'paint'));            // rails along x
X.forEach(x=>add(rail(0.03,0.03,0.315,x-0.015,0.385,0.0675),'paint'));                          // rails along z
add(rbox(0.43,0.015,0.43,0.003,0.01,0.415,0.01,{m:1,step:0.1}),'paint');                       // plywood seat
add(rbox(0.39,0.04,0.39,0.015,0.03,0.43,0.03,{m:2,step:0.05,crown:0.008}),'fabric');           // cushion
add(rbox(0.35,0.33,0.015,0.004,0.05,0.55,0.02,{m:1,step:0.1}),'paint');                        // back panel between the posts
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/bchair.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
