// Sofa variants B–G for room 4 (select #k4sofa, ROOM4 in items.js), references from the user's session 2026-09-09.
// Same local frame as sofa.js: pivot NW corner, x east, back against the south wall at z=D, front towards the TV (−z).
// The room is seen from the north, so "left in the photo" = east (wall corner), "right in the photo" = west (towards the hallway door).
// Material names are coatings/slots: upholstery (blocks), cushion (loose cushions), piping, metal (feet), wood (tray).
// Usage: node tools/models/sofa4.js  → models/sofa{B..G}.glb, prints the size [w,h,d] for items.js
const fs=require('fs'), path=require('path'), {THREE,rbox,piping,cylinder,toGlb}=require('./glb.js');
const PI=Math.PI, rad=a=>a*PI/180;
// slab w×d×h at (x0,y0,z0) with per-corner plan radii {nw,ne,se,sw} (0 = square); the r bevel rounds every edge.
// A radius of d/2 on both corners of one side makes that side a semicircle (D-shaped end module).
function slab(w,d,h,x0,y0,z0,{nw=0,ne=0,se=0,sw=0,r=0.035}={}){
  const i=r, W=w-2*i, D=d-2*i, R=v=>Math.max(v-i,0), s=new THREE.Shape(), arc=(cx,cy,rr,a0,a1,x,y)=>rr>0?s.absarc(cx,cy,rr,a0,a1,false):s.lineTo(x,y);
  // shape (x,y) = plan (x,z): y=0 is the north edge; drawn counter-clockwise, extruded down then rotated so the extrusion runs along world y
  s.moveTo(R(sw),0); s.lineTo(W-R(se),0); arc(W-R(se),R(se),R(se),-PI/2,0,W,0); s.lineTo(W,D-R(ne)); arc(W-R(ne),D-R(ne),R(ne),0,PI/2,W,D);
  s.lineTo(R(nw),D); arc(R(nw),D-R(nw),R(nw),PI/2,PI,0,D); s.lineTo(0,R(sw)); arc(R(sw),R(sw),R(sw),PI,1.5*PI,0,0);
  return new THREE.ExtrudeGeometry(s,{depth:h-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:3,curveSegments:20}).rotateX(PI/2).translate(x0+i,y0+h-r,z0+i);
}
const roll=(len,rr,cx,cy,cz,alongZ)=>{ const g=new THREE.CylinderGeometry(rr,rr,len,20); return alongZ?g.rotateX(PI/2).translate(cx,cy,cz):g.rotateZ(PI/2).translate(cx,cy,cz); }; // bolster cushion lying on the seat
const feet=(add,pts,h=0.05)=>pts.forEach(([x,z])=>add(cylinder(x,0,z,0.025,h,10),'metal'));
const VARIANTS={
  // B — rounded modular (photo 1): chaise at the east wall, a low curved back wrapping around the chaise, two bolsters along the back of the seats
  B(add){ const W=2.40, D=1.60; feet(add,[[0.15,0.75],[1.35,0.75],[1.6,0.15],[2.25,0.15],[2.25,1.45],[0.15,1.45]]);
    add(rbox(1.50,0.37,0.95,0.08,0,0.05,0.65,{m:3,step:0.2,crown:0.01}),'upholstery');                                   // two-seat block 0.05–0.42
    add(rbox(0.90,0.37,1.60,0.08,1.50,0.05,0,{m:3,step:0.2,crown:0.01}),'upholstery');                                    // chaise block, front corners rounded like the seats
    add(slab(2.40,0.20,0.36,0,0.42,1.40,{r:0.05}),'upholstery');                                                          // straight back along the wall 0.42–0.78
    add(slab(0.20,1.25,0.36,2.20,0.42,0.15,{r:0.05,nw:0.10}),'upholstery');                                               // back wraps the chaise: outer east side to 0.15 from the front
    [0.10,0.80].forEach(x=>add(roll(0.66,0.11,x+0.33,0.53,1.28,false),'cushion'));                                        // bolsters on the seats, top 0.64
    add(piping(0.006,0.656,1.488,0.938,0.08,0.41),'piping'); add(piping(1.506,0.006,0.888,1.588,0.08,0.41),'piping');   // seams along the block tops
    return [W,0.78,D]; },
  // C — sectional from the top-view photo, corner at the east wall: three modules along the wall, corner, D-shaped return module pointing into the room,
  // low back along the wall and the outer side of the return, one big back cushion at the far end, two bolsters in the corner, oak tray on the middle module.
  // D — the same mirrored (mirror=true): corner at the west end, towards the hallway door.
  C(add,mirror){ const W=2.60, D=1.85, X=(x0,w)=>mirror?W-x0-w:x0, Cx=x=>mirror?W-x:x, sw=o=>mirror?{nw:o.ne,ne:o.nw,se:o.sw,sw:o.se,r:o.r}:o;
    feet(add,[[0.15,1.0],[0.9,1.0],[1.7,1.0],[2.45,1.0],[0.15,1.7],[1.7,1.7],[2.45,1.7],[1.8,0.15],[2.45,0.15]].map(([x,z])=>[Cx(x),z]));
    [[0,0.85],[0.85,0.80]].forEach(([x,w])=>add(rbox(w,0.37,0.95,0.07,X(x,w),0.05,0.90,{m:3,step:0.2,crown:0.01}),'upholstery')); // modules 1–2 along the wall
    add(rbox(0.95,0.37,0.95,0.07,X(1.65,0.95),0.05,0.90,{m:3,step:0.2,crown:0.01}),'upholstery');                            // corner module
    add(slab(0.95,0.92,0.37,X(1.65,0.95),0.05,0,sw({nw:0.47,ne:0.47,r:0.06})),'upholstery');                                  // D-shaped return, semicircle to the north
    add(slab(2.60,0.20,0.32,0,0.42,1.65,{r:0.05}),'upholstery');                                                             // back along the wall 0.42–0.74
    add(slab(0.20,1.25,0.32,X(2.40,0.20),0.42,0.40,{r:0.05}),'upholstery');                                                  // back on the outer side of the return
    add(rbox(0.75,0.44,0.16,0.05,0,0,0,{m:2,step:0.12,crown:0.03}).rotateX(rad(12)).translate(X(0.08,0.75),0.42,1.42),'cushion'); // big back cushion on module 1, top ≈0.86
    add(roll(0.55,0.12,Cx(1.95),0.54,1.52,false),'cushion'); add(roll(0.50,0.12,Cx(2.27),0.54,1.05,true),'cushion');          // two bolsters in the corner
    add(rbox(0.60,0.03,0.42,0.005,X(0.95,0.60),0.42,1.10,{m:1,step:0.2}),'wood');                                             // oak tray on the middle module
    [[0.006,0.906,0.838,0.938],[0.856,0.906,0.788,0.938]].forEach(([x,z,w,d])=>add(piping(X(x,w),z,w,d,0.07,0.41),'piping'));
    return [W,0.87,D]; },
  D(add){ return VARIANTS.C(add,true); },
  // E — grey three-seater with a chaise on the west (photo 3): slim frame on black steel legs, three seat cushions, back cushions on a low back, flat arm on the chaise side
  E(add){ const W=2.50, D=1.55; [[0.08,0.65],[0.08,1.45],[0.80,1.45],[1.65,1.45],[2.42,1.45],[2.42,0.68],[0.80,0.08]].forEach(([x,z])=>add(cylinder(x,0,z,0.012,0.17,10),'metal'));
    add(rbox(2.50,0.20,0.95,0.03,0,0.17,0.60,{m:2,step:0.2}),'upholstery');                                               // seat frame 0.17–0.37
    add(rbox(0.85,0.20,0.60,0.03,0,0.17,0,{m:2,step:0.2}),'upholstery');                                                   // chaise frame forward of the seats
    add(rbox(2.30,0.30,0.16,0.04,0.20,0.37,0.79,{m:2,step:0.2}),'upholstery');                                             // low back 0.37–0.67 behind the cushions
    add(rbox(0.20,0.28,0.95,0.03,0,0.37,0.60,{m:2,step:0.2}),'upholstery');                                                // flat arm on the chaise end, top 0.65
    const seats=[[0.22,0.80],[1.04,0.71],[1.77,0.71]];                                                                       // [x, width]: 0.22–1.02, 1.04–1.75, 1.77–2.48
    seats.forEach(([x,w])=>{ add(rbox(w,0.12,0.64,0.04,x,0.37,0.12,{m:2,step:0.15,crown:0.02}),'cushion'); add(piping(x+0.006,0.126,w-0.012,0.628,0.04,0.43),'piping'); }); // seat cushions 0.37–0.49
    add(rbox(0.61,0.12,0.62,0.04,0.22,0.37,0.04,{m:2,step:0.15,crown:0.02}),'cushion');                                    // chaise cushion in front of the arm
    seats.forEach(([x,w])=>add(rbox(w,0.40,0.16,0.05,0,0,0,{m:2,step:0.12,crown:0.025}).rotateX(rad(10)).translate(x,0.49,0.63),'cushion')); // back cushions to 0.89
    return [W,0.90,D]; },
  // F — boxy modular two-seater (photo 4): thick square arms, low straight back, two plump seat cushions, no chaise
  F(add){ const W=2.20, D=0.95; feet(add,[[0.15,0.12],[2.05,0.12],[0.15,0.83],[2.05,0.83]],0.03);
    add(rbox(2.20,0.30,0.95,0.04,0,0.03,0,{m:2,step:0.2}),'upholstery');                                                   // base 0.03–0.33
    [0,1.95].forEach(x=>add(rbox(0.25,0.32,0.95,0.05,x,0.33,0,{m:2,step:0.2}),'upholstery'));                              // arms to 0.65
    add(rbox(1.70,0.35,0.22,0.05,0.25,0.33,0.73,{m:2,step:0.2}),'upholstery');                                             // back to 0.68
    [0.27,1.11].forEach(x=>{ add(rbox(0.82,0.16,0.68,0.06,x,0.33,0.03,{m:2,step:0.15,crown:0.03}),'cushion'); add(piping(x+0.006,0.036,0.808,0.668,0.06,0.41),'piping'); }); // seat cushions 0.33–0.49 (+dome)
    return [W,0.68,D]; },
  // G — low bouclé modular (photo 5): chaise at the east wall, seat module, shorter middle module with a small pad; square back cushions lean on the wall
  G(add){ const W=2.30, D=1.50; feet(add,[[0.15,0.65],[0.75,0.65],[0.15,1.4],[1.4,1.4],[2.15,1.4],[1.6,0.15],[2.15,0.15]]);
    add(rbox(0.85,0.37,0.95,0.06,0,0.05,0.55,{m:3,step:0.2,crown:0.01}),'upholstery');                                    // seat module 0.05–0.42
    add(rbox(0.65,0.37,0.95,0.06,0.85,0.05,0.55,{m:3,step:0.2,crown:0.01}),'upholstery');                                 // middle module
    add(rbox(0.80,0.37,1.50,0.06,1.50,0.05,0,{m:3,step:0.2,crown:0.01}),'upholstery');                                    // chaise
    add(rbox(0.40,0.10,0.40,0.04,0.975,0.42,0.80,{m:2,step:0.1,crown:0.015}),'cushion');                                  // small pad on the middle module
    [[0.08,0.70],[1.55,0.70]].forEach(([x,w])=>add(rbox(w,0.44,0.15,0.05,0,0,0,{m:2,step:0.12,crown:0.03}).rotateX(rad(12)).translate(x,0.42,1.26),'cushion')); // back cushions lean 12°, top edge at z 1.50, ≈0.86 high
    add(rbox(0.15,0.44,0.60,0.05,0,0,0,{m:2,step:0.12,crown:0.03}).rotateZ(rad(-12)).translate(2.06,0.42,0.30),'cushion'); // side cushion leaning out to the east edge x 2.30
    [[0.006,0.556,0.838,0.938],[0.856,0.556,0.638,0.938],[1.506,0.006,0.788,1.488]].forEach(([x,z,w,d])=>add(piping(x,z,w,d,0.06,0.41),'piping'));
    return [W,0.87,D]; }
};
Object.keys(VARIANTS).forEach(k=>{ const parts=[], add=(geo,mat)=>parts.push({geo,mat}); const size=VARIANTS[k](add);
  const {buf,triangles}=toGlb(parts); const out=path.join(__dirname,'../../models/sofa'+k+'.glb'); fs.writeFileSync(out,buf);
  console.log(out,(buf.length/1024).toFixed(0)+' KB',triangles+' triangles','size',JSON.stringify(size)); });
