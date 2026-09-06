// Wall-hung toilet 0.36×0.42×0.48 (tasks/realism-all/PLAN.md §11): ceramic bowl as an elongated lathe (hollow inside), rear body at the wall,
// seat ring and closed lid in plastic. Back at z=0.48 (wall), front toward -z; wc8 turns it with glbRot 180. Shared by wc and wc8.
// Usage: node tools/models/wc.js → models/wc.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
const V=(r,y)=>new THREE.Vector2(r,y), EL=0.48/0.36*0.92; // plan ellipse: Ø0.34 across, stretched toward the front
const bowl=new THREE.LatheGeometry([V(0,0.20),V(0.09,0.20),V(0.14,0.26),V(0.165,0.33),V(0.17,0.39),V(0.17,0.40),V(0.13,0.40),V(0.12,0.36),V(0.10,0.29),V(0,0.28)],40).scale(1,1,EL).translate(0.18,0,0.245);
add(bowl,'ceramic');
add(rbox(0.30,0.18,0.14,0.02,0.03,0.22,0.34,{m:2,step:0.1}),'ceramic');                         // rear body up to the wall
const seat=new THREE.CylinderGeometry(0.175,0.175,0.012,40).scale(1,1,EL*0.98).translate(0.18,0.406,0.245); add(seat,'plastic'); // seat ring plate
add(new THREE.CylinderGeometry(0.172,0.172,0.008,40).scale(1,1,EL*0.98).translate(0.18,0.416,0.245),'plastic'); // closed oval lid, top at 0.42
add(new THREE.TorusGeometry(0.172,0.004,8,40).rotateX(Math.PI/2).scale(1,1,EL*0.98).translate(0.18,0.416,0.245),'plastic'); // rounded lid edge
add(new THREE.CylinderGeometry(0.012,0.012,0.30,10).rotateZ(Math.PI/2).translate(0.18,0.405,0.465),'chrome'); // hinge bar
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/wc.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
