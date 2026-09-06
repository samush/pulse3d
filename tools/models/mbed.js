// Bed 1.70×1.10×2.20 in room 3 (tasks/realism-all/PLAN.md §10): plinth inset 0.05, frame r 10, tufted leather headboard (dimple grid 0.25 with buttons),
// mattress r 50 with a dome and piping, two pillows r 60, blanket at the feet with a folded-back edge. Material names are ITEM_MATS keys. Pivot NW corner, headboard at z=0, metres.
// Usage: node tools/models/mbed.js  → models/mbed.glb
const fs=require('fs'), path=require('path'), {THREE,rbox,piping,toGlb}=require('./glb.js');
const parts=[], add=(geo,mat)=>parts.push({geo,mat});
add(new THREE.BoxGeometry(1.60,0.10,2.10).translate(0.85,0.05,1.10),'dark');                   // plinth
add(rbox(1.70,0.25,2.20,0.01,0,0.10,0,{m:1,step:0.3}),'body');                                  // frame 0.10–0.35
const hb=rbox(1.70,0.75,0.08,0.03,0,0.35,0,{m:2,step:0.055}), hp=hb.attributes.position, hn=hb.attributes.normal; // headboard 0.35–1.10
const BX=[0.35,0.60,0.85,1.10,1.35], BY=[0.60,0.85];                                            // tufting grid 0.25
for(let i=0;i<hp.count;i++){ if(hn.getZ(i)<0.5) continue; const x=hp.getX(i), y=hp.getY(i); let d=0; BX.forEach(bx=>BY.forEach(by=>{ d+=Math.exp(-((x-bx)**2+(y-by)**2)/0.0016); })); hp.setZ(i,hp.getZ(i)-0.012*Math.min(d,1)); } // dimples on the front face
hb.computeVertexNormals(); add(hb,'leather');
BX.forEach(bx=>BY.forEach(by=>add(new THREE.SphereGeometry(0.011,10,6).translate(bx,by,0.070),'leather'))); // buttons in the dimples
add(rbox(1.60,0.20,2.00,0.05,0.05,0.35,0.10,{m:2,step:0.15,crown:0.015}),'kmat');             // mattress 0.35–0.55 (+ dome)
add(piping(0.05,0.10,1.60,2.00,0.05,0.45),'kmat');
[0.12,0.88].forEach(x=>add(rbox(0.70,0.12,0.45,0.06,x,0.55,0.15,{m:2,step:0.12,crown:0.02}),'pillow')); // pillows
add(rbox(1.50,0.06,1.30,0.03,0.10,0.55,0.85,{m:2,step:0.15,crown:0.01}),'cushion');           // blanket at the feet
add(rbox(1.50,0.03,0.25,0.015,0.10,0.61,0.85,{m:1,step:0.15}),'cushion');                       // folded-back edge
const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/mbed.glb'); fs.writeFileSync(out,buf);
console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles');
