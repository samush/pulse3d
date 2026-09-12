// Interior items as data. Each item is a THREE.Group with a permanent id and userData
// {id, type, room, layer, pos:[x,z], rot, size:[w,h,d], fixed}. Parts are built in item-local coords: x right 0..w,
// z down 0..d (at rot=0), y from the finished floor; pos is the north-west corner at rot=0, rot is degrees clockwise
// in top view (same as markup rectangles). fixed:'wall' moves only along its wall. Layers: kitchen/hall/laundry/kid (room 1)/kid2 (room 2)/master/bath (room 9)/bath2 (room 8)/wardrobe/balcony.
var furnGroup=new THREE.Group(), hallGroup=new THREE.Group(), laundryGroup=new THREE.Group(), kidGroup=new THREE.Group(), kid2Group=new THREE.Group(), masterGroup=new THREE.Group(), bathGroup=new THREE.Group(), bath2Group=new THREE.Group(), wardrobeGroup=new THREE.Group(), balconyGroup=new THREE.Group();
const LAYERS={kitchen:furnGroup,hall:hallGroup,laundry:laundryGroup,kid:kidGroup,kid2:kid2Group,master:masterGroup,bath:bathGroup,bath2:bath2Group,wardrobe:wardrobeGroup,balcony:balconyGroup};
const ITEM_GROUPS={}; // id → group
// Walk obstacles: one axis-aligned box per item mesh (bed legs block, the platform above the head does not).
// Kept apart from visibility layers: a hidden layer is still physically there.
const physGroup=new THREE.Group(); physGroup.visible=false;
const PHYS={}; // id → boxes
(function(){
  const M=c=>new THREE.MeshLambertMaterial({color:c});
  const mat={
    base:M(0x8c8c8c), upper:M(0xa4a4a4), top:M(0x6e6e6e), dark:M(0x4a4a4a), table:M(0x9a9a9a), chair:M(0x7e7e7e),
    sofa:M(0x8a8a8a), lamp:M(0xd8d8d8), body:M(0x9a9a9a), door:M(0xa8a8a8), hdark:M(0x5a5a5a), handle:M(0x3c3c3c),
    glass:M(0xc3cbd2), frame:M(0x2e2e2e), pouf:M(0x8a8683), led:new THREE.MeshBasicMaterial({color:0xfff1cf}), mirrorLed:new THREE.MeshBasicMaterial({color:0xfff1cf}), // mirrorLed: bathmirror backlight, own emitter for group g9.mirror (materials-lighting M3)
    wbody:M(0xc9c9c9), wdoor:M(0x6f6f6f), wpanel:M(0x9c9c9c),
    plastic:M(0xd8d8d8), ceramic:M(0xe6e6e6), acrylic:M(0xe9e9e9), leather:M(0x8f8f8f), mirror:M(0xc3cbd2), // realism-all §4 slots
    kbody:M(0xdadad6), kleg:M(0xbdbdb8), kmat:M(0xf0ede6), knob:M(0x4a4a4a),
    rail:new THREE.MeshLambertMaterial({color:0xbfd7e6,transparent:true,opacity:0.35}),
    cushion:M(0x9a9a9a), screen:M(0x2a2a2a), ring:M(0x2f2f2f), pillow:M(0xf7f5ef),
    gloss:new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:0.16,depthWrite:false}), // slanted highlight over a mirror: not a reflection, a cue that the plane is glass
    oak:M(0xc9a97a), hpl:M(0xe7e2d8), terra:M(0xc2704e), fabric:M(0xb8ab9a), rug:M(0xd9cfc0), ochre:M(0xd08a5a),
    tulle:new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:0.3,side:THREE.DoubleSide}),
    drape:new THREE.MeshLambertMaterial({color:0xb4b4b4,side:THREE.DoubleSide}), // opaque curtain fabric, both faces of a folded plane
  };
  // material slot = physical class for the visualization twin (B04); concept colours stay grey, MATERIALS[slot] gives roughness/metalness/emissive
  const SLOTS={chrome:['handle','knob','ring'],metal:['frame','kleg'],glass:['glass','rail'],fabric:['sofa','cushion','pouf','pillow','kmat','fabric','rug','tulle','drape'],emitter:['led','mirrorLed','gloss'],screen:['screen'],wood:['table'],cabinetPaint:['chair','base','upper','door','body','wbody','wdoor','wpanel','kbody'],plastic:['plastic'],ceramic:['ceramic'],acrylic:['acrylic'],leather:['leather'],mirror:['mirror']};
  Object.entries(SLOTS).forEach(([slot,keys])=>keys.forEach(k=>{ mat[k].userData.slot=slot; }));
  window.ITEM_MATS=mat;
  const chair=side=>(b,g)=>{ // chair 0.48×0.80×0.48 fallback and proxy (seat, back strip on side W/E/N/S, four legs); models/chair.glb replaces the meshes
    const bk={W:[0,0.04,0,0.48],E:[0.44,0.48,0,0.48],N:[0,0.48,0,0.04],S:[0,0.48,0.44,0.48]}[side], legs=[[0.03,0.03],[0.41,0.03],[0.03,0.41],[0.41,0.41]];
    b.phys(0,0.48,0.42,0.49,0,0.48); b.phys(bk[0],bk[1],0.46,0.8,bk[2],bk[3]); legs.forEach(([x,z])=>b.phys(x,x+0.04,0,0.42,z,z+0.04));
    b(0,0.48,0.42,0.46,0,0.48,mat.chair); b(0.03,0.45,0.46,0.49,0.03,0.45,mat.cushion); b(bk[0],bk[1],0.46,0.8,bk[2],bk[3],mat.chair);
    legs.forEach(([x,z])=>b(x,x+0.04,0,0.42,z,z+0.04,mat.chair));
  };
  // Loft bed shared by rooms 1 and 2: stair-chest along local z 0–0.5, platform x 1.4–2.6 × z 0–L, storage shelf above the passage z L–2.97.
  // Procedural on purpose (realism-all §0 rule: boxes + bevels): the 9 proxy boxes and the step/platform/post checks in check.js keep working for both beds.
  // puffed soft body: segmented box centred at the origin whose top (and a little of the bottom) bulges to the centre, edges stay thin; wave = quilt ripple height
  const puff=(w,d,h,wave=0)=>{ const geo=new THREE.BoxGeometry(w,0.02,d,Math.round(w*24),1,Math.round(d*24)), pa=geo.attributes.position, sm=t=>{ t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t); };
    for(let i=0;i<pa.count;i++){ const x=pa.getX(i), y=pa.getY(i), z=pa.getZ(i), f=sm((w/2-Math.abs(x))/(w*0.22))*sm((d/2-Math.abs(z))/(d*0.22)), r=wave*Math.sin(x*17)*Math.sin(z*13);
      pa.setY(i,y>0?y+h*f+r*f:y-h*0.3*f); } geo.computeVertexNormals(); return geo; };
  // bedding for both loft builds: two plump pillows propped at 35° against the head end, a puffed quilted duvet with its top edge rolled back
  const bedding=(b,x0,x1,y,z0,z1,headAtEnd,duvet=mat.cushion)=>{ const w=(x1-x0-0.03)/2, zh=headAtEnd?z1:z0, s=headAtEnd?-1:1, add=(geo,m)=>{ const o=new THREE.Mesh(geo,m); b.group.add(o); return o; };
    [x0,x0+w+0.03].forEach(px=>{ const geo=puff(w,0.48,0.15).translate(0,0.07,0.24).rotateX(-0.70); if(!headAtEnd) geo.rotateY(Math.PI); add(geo.translate(px+w/2,y,zh+s*0.40),mat.pillow); });
    const zf=headAtEnd?z0+0.08:z1-0.08, zk=zh+s*0.50, lo=Math.min(zf,zk), hi=Math.max(zf,zk), L=hi-lo, cz=(lo+hi)/2;                // duvet from the foot end up to the pillows
    add(puff(x1-x0,L,0.10,0.012).translate((x0+x1)/2,y+0.02,cz),duvet); add(puff(x1-x0-0.08,0.32,0.07).translate((x0+x1)/2,y+0.12,headAtEnd?hi-0.16:lo+0.16),duvet); };
  const kidBedBuild=(L,front,blanket,tread=0.28)=>b=>{
       const PL=1.8, TOP=2.3, HF=2.2, X0=5*tread, W=X0+1.2;                                           // L — platform length along z (2.00 in room 1, 1.85 in room 2); tread — step depth
       b.phys(0,X0,0,2.4,0,0.54); [[X0,0],[W-0.08,0],[X0,L-0.08],[W-0.08,L-0.08]].forEach(([x,z])=>b.phys(x,x+0.08,0,PL,z,z+0.08)); // stair-chest, legs
       b.phys(X0+0.08,W-0.08,0.10,0.14,L-0.08,L); b.phys(X0,W,PL-0.2,TOP+0.3,0,L+0.02); b.phys(X0,W,HF,TOP+0.3,L,2.97); b.phys(X0,X0+0.08,0,HF,2.89,2.97); // rail, platform with rails, shelf, post
       b.round(X0,W,PL-0.1,PL,0,L,0.01,mat.kbody);                                                // platform 0.10 with a 10 mm bevel, world x 4.235–5.435 (check.js reads its AABB)
       [[X0,0],[W-0.08,0],[X0,L-0.08],[W-0.08,L-0.08]].forEach(([x,z])=>b(x,x+0.08,0,PL-0.1,z,z+0.08,mat.kleg)); // legs 80×80
       b(X0+0.08,W-0.08,0.10,0.14,L-0.08,L,mat.kleg);                                               // lower rail between the south legs
       b(X0,X0+0.04,PL-0.2,PL-0.1,0,L,mat.kbody); b(X0,W,PL-0.2,PL-0.1,L-0.04,L,mat.kbody);       // apron on the west and south edges
       b(X0+0.01,X0+0.03,PL-0.11,PL-0.1,0,L,mat.led);                                             // M20: LED strip under the west edge
       b.round(X0+0.05,W-0.03,PL,PL+0.18,0.03,L-0.05,0.04,mat.kmat);                                 // mattress 0.18, edges r 40
       bedding(b,X0+0.05,W-0.03,PL+0.18,0.03,L-0.05,false,blanket);                                   // head at the stair side
       const bal=(x0,x1,z0,z1)=>b(x0,x1,PL-0.1,TOP-0.04,z0,z1,mat.kleg);                             // guard: 40×40 top rail on 20×20 balusters every 0.10
       b(X0,X0+0.04,TOP-0.04,TOP,0.5,L,mat.kbody); for(let z=0.5;z<L-0.03;z+=0.1) bal(X0+0.01,X0+0.03,z,z+0.02);      // west side, from the stair landing
       b(X0,W,TOP-0.04,TOP,L-0.04,L,mat.kbody); for(let x=X0+0.1;x<W-0.03;x+=0.1) bal(x,x+0.02,L-0.03,L-0.01);       // south side
       b(X0,W,HF,HF+0.04,L,2.97,mat.kbody); b(X0,X0+0.02,HF+0.04,HF+0.12,L,2.97,mat.kbody); b(X0,W,HF+0.04,TOP+0.2,2.95,2.97,mat.kbody); // storage shelf over the passage: slab, front lip, back panel
       b(X0,X0+0.08,0,HF,2.89,2.97,mat.kleg);                                                       // shelf post (check.js: clear of the door in room 2)
       b(X0-0.03,X0,1.38,1.42,2.91,2.95,mat.knob);                                                  // backpack hook on the post, 1.40
       for(let i=0;i<5;i++){ const x0=i*tread, x1=x0+tread, top=0.3*(i+1), cx=(x0+x1)/2;             // stair-chest: 5 steps 0.28 × 0.30 (check.js reads the step tops), one drawer per 0.30 row, fronts south
         b(x0,x1,0,top,0,0.5,mat.kbody);
         for(let j=0;j<=i;j++){ const y0=0.3*j; b(x0+0.004,x1-0.004,y0+0.015,y0+0.285,0.5,0.518,front); b(cx-0.06,cx+0.06,y0+0.235,y0+0.25,0.518,0.535,mat.knob); } // 3 mm gaps, bar handle
         b.round(x0,x1,top+0.885,top+0.915,0.02,0.05,0.01,front); }                                // handrail segments on the north wall, tread + 0.90
  };
  // Kids' loft bed variants A/B (tasks/kids-loft-beds/VARIANTS.md), one function for both rooms: same pos/size and the original nine PHYS boxes;
  // stairs S1 (7 equal rises to 1.80, the seventh is a 0.24 landing inside the old stair length), 3 storage sections instead of 15 drawers,
  // one continuous wall handrail, bed-side posts and the far post raised to carry a framed over-door tray whose 140 mm beams are its borders.
  // kind 'timber' (A): 80 mm wood posts and 200 mm rails, wood balusters, solid stair side panel. 'steel' (B): 50 mm steel posts and 150 mm beams inside
  // the same 80 mm corner zones, Ø12 rods on the platform guard, open stair side, wood only on treads, caps and the handrail. Load path and wall ties are a sketch for the maker, not a calculation.
  // stairs: 'S1' (seven equal rises inside R), 'ladder' (vertical ladder at the platform edge, floor under it free), 'gentle' (n rises, run extended by E
  // beyond the item at local x<0 — the pose and size stay, the extension carries its own proxy boxes; jog = tread setback from the wall on the extension)
  // F (.local/детская_лев.png): kind 'steel' + {stairs:'wood',guard:'glass'} — wood box RB..PL+0.22 instead of the rails, wood panels, guard = wood posts and cap with frosted glass,
  // steep timber ladder (22° off vertical) whose stringers continue as a handrail loop above the platform; bedding, over-door tray and PHYS as before
  const kidLoftBuild=(kind,L,R,o={})=>(b,g)=>{
    const stairs=o.stairs||'S1', E=stairs==='gentle'?o.E||0:0, N=stairs==='gentle'?o.n||8:7, JOG=o.jog||0, glass=o.guard==='glass';
    const PL=1.8, TOP=2.3, HF=2.2, W=R+1.2, steel=kind==='steel', ST=steel?mat.frame:mat.table, wood=mat.table, pnl=glass?wood:mat.kbody, front=mat.wdoor;
    const P=steel?0.05:0.08, po=(0.08-P)/2, RB=steel?1.65:1.60, TB=HF+0.14;                          // post/beam width inside the 80 mm zones, rail bottom, tray beam top
    if(stairs==='ladder'||stairs==='wood') b.phys(R-1.15,R,0,PL,0,0.54); else b.phys(-E,R,0,2.4,0,0.54); [[R,0],[W-0.08,0],[R,L-0.08],[W-0.08,L-0.08]].forEach(([x,z])=>b.phys(x,x+0.08,0,PL,z,z+0.08)); // PHYS as the original (check.js: 9 boxes); the gentle extension is inside the stairs box
    b.phys(R+0.08,W-0.08,0.10,0.14,L-0.08,L); b.phys(R,W,PL-0.2,TOP+0.3,0,L+0.02); b.phys(R,W,HF,TOP+0.3,L,2.97); b.phys(R,R+0.08,0,HF,2.89,2.97);
    const tube=(x0,y0,z0,x1,y1,z1,r,m)=>{ const d=new THREE.Vector3(x1-x0,y1-y0,z1-z0), len=d.length(), geo=new THREE.CylinderGeometry(r,r,len,12).translate(0,len/2,0), mesh=new THREE.Mesh(geo,m);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); mesh.position.set(x0,y0,z0); g.add(mesh); return mesh; }; // round bar between two local points
    // platform frame: four corner posts, the two bed-side posts and the far post rise to the tray beams; long rails west/east, end rails north/south
    [[R,0,PL],[W-0.08,0,PL],[R,L-0.08,TB],[W-0.08,L-0.08,TB],[R,2.89,TB]].forEach(([x,z,h])=>b(x+po,x+po+P,0,h,z+po,z+po+P,ST));
    const BX=glass?PL+0.06:PL, RM=glass?wood:ST, ro=glass?0:po, rw=glass?0.08:P;                       // F: the rails are a 210 mm wood band (1.65 to 60 mm over the platform), glass above it (user: .local/11.png)
    b(R+ro,R+ro+rw,RB,BX,0,L,RM); b(W-0.08+ro,W-0.08+ro+rw,RB,BX,0,L,RM); b(R,W,RB,BX,ro,ro+rw,RM); b(R,W,RB,BX,L-0.08+ro,L-0.08+ro+rw,RM);
    b(R+0.08,W-0.08,0.10,0.14,L-0.08,L,ST);                                                           // lower rail between the south posts
    b(R+0.08,W-0.08,1.70,1.72,0.08,L-0.08,pnl);                                                       // soffit panel: closes the frame from below, carries the recessed spot ceil2_3 in room 2
    for(let z=0.10;z<L-0.10;z+=0.12) b(R+0.08,W-0.08,1.78,PL,z,Math.min(z+0.09,L-0.10),wood);         // ventilated slats 90 mm with 30 mm gaps
    b(R+0.01,R+0.03,RB-0.01,RB,0,L,mat.led);                                                          // LED strip under the west rail
    b.round(R+0.05,W-0.03,PL,PL+0.18,0.03,L-0.05,0.04,mat.kmat); bedding(b,R+0.05,W-0.03,PL+0.18,0.03,L-0.05,true); // mattress 0.18; the head is away from the stairs, feet at the landing
    // guards to 2.30: wood cap, balusters 30x30 wood (A) or Ø12 rods (B) every 0.10; low boards along the walls so nothing falls behind the mattress
    const cap=(x0,x1,z0,z1)=>b(x0,x1,TOP-0.04,TOP,z0,z1,wood), bal=(x,z)=>steel?b(x-0.006,x+0.006,PL,TOP-0.04,z-0.006,z+0.006,ST):b(x-0.015,x+0.015,PL,TOP-0.04,z-0.015,z+0.015,wood);
    if(glass){ // F: 40 mm wood posts at the ladder gap and the corners, 10 mm frosted glass (mat.rail) between the box top and the cap
      cap(R,R+0.04,0.5,L); cap(R,W,L-0.04,L); [[R,0.5],[R,L-0.04],[W-0.04,L-0.04]].forEach(([x,z])=>b(x,x+0.04,BX,TOP-0.04,z,z+0.04,wood));
      b(R+0.015,R+0.025,BX,TOP-0.04,0.54,L-0.04,mat.rail); b(R+0.04,W-0.04,BX,TOP-0.04,L-0.025,L-0.015,mat.rail);
    } else { cap(R,R+0.04,0.5,L); for(let z=0.55;z<L-0.03;z+=0.1) bal(R+0.02,z); cap(R,W,L-0.04,L); for(let x=R+0.1;x<W-0.03;x+=0.1) bal(x,L-0.02); }
    b(R+0.08,W-0.08,PL,PL+0.30,0,0.02,pnl); b(W-0.02,W,PL,PL+0.30,0.02,L-0.08,pnl);
    if(stairs==='wood'){ // F: two 40×100 oak stringers 30° off vertical (as D) against the wall, six 30 mm treads 140 deep recessed between them, nothing above the platform (user);
      // handrail = Ø32 oak staple on the room side: a bar parallel to the stringer 100 mm above its outer edge, legs down into the stringer at both ends (.local/детский_лестиница.png)
      const th=30*Math.PI/180, xb=R-0.06-PL*Math.tan(th), len=PL/Math.cos(th), sx=y=>xb+Math.tan(th)*y;
      [0.04,0.42].forEach(z=>g.add(new THREE.Mesh(new THREE.BoxGeometry(0.10,len,0.04).rotateZ(-th).translate(sx(PL/2)+0.05,PL/2+0.05*Math.sin(th),z+0.02),wood)));
      for(let y=PL/7;y<PL-0.05;y+=PL/7) b(sx(y)+0.01,sx(y)+0.15,y-0.03,y,0.08,0.42,wood);
      const nx=-0.10*Math.cos(th), ny=0.10*Math.sin(th), y0=0.45, y1=PL-0.12, zc=0.44;                   // staple 100 mm above the stringer's outer edge, normal to the ladder plane (user: points up, not sideways)
      tube(sx(y0)+nx,y0+ny,zc,sx(y1)+nx,y1+ny,zc,0.016,wood); [y0,y1].forEach(y=>tube(sx(y)+0.02,y,zc,sx(y)+nx,y+ny,zc,0.016,wood));
    } else if(stairs==='ladder'){ // C: straight painted ladder to the platform level only, leaning 30°; wide flat stringers 40×240 with six treads 200×30 every 0.257 recessed between them,
      // so the stringer edges stand proud of each tread as a low kerb for a crawling child; neutral panel colour, not oak; floor under the platform edge stays free
      const th=30*Math.PI/180, xb=R-0.06-PL*Math.tan(th), len=PL/Math.cos(th), sx=y=>xb+Math.tan(th)*y;
      [0.02,0.48].forEach(z=>g.add(new THREE.Mesh(new THREE.BoxGeometry(0.24,len,0.04).rotateZ(-th).translate(sx(PL/2)+0.11,PL/2,z+0.02),pnl)));
      for(let y=PL/7;y<PL-0.05;y+=PL/7) b(sx(y)+0.01,sx(y)+0.21,y-0.03,y,0.06,0.48,pnl);
    } else {
    // stairs S1: rise h=1.80/7, six treads on step s, the seventh level is the 0.24 landing at 1.80 — the sit-down onto the mattress (+0.18) starts there;
    // D (gentle): N rises, treads on the run R+E from local x=-E, the treads on the extension step back JOG from the wall (room 2 wall jog)
    const h=PL/N, s=(R+E-0.24)/(N-1), X=i=>-E+i*s, zt=x0=>x0<-1e-6?JOG:0, tread=(x0,x1,y)=>b.round(x0,x1,y-0.03,y,zt(x0),0.50,0.004,wood); // 30 mm wood treads, 4 mm nose radius (check.js reads their tops)
    for(let i=1;i<N;i++){ const x0=X(i-1), y=i*h; b(x0,x0+s,0,y-0.03,zt(x0),0.50,pnl); tread(x0,x0+s,y); } b(R-0.24,R,0,PL-0.03,0,0.50,pnl); tread(R-0.24,R,PL);
    // storage, fronts south with a recessed grip at the top edge: low drawer under treads 1–2, two deep drawers under 3–4, doors under the rest; D adds a drawer pair under 5–6
    const fr=(x0,x1,y0,y1)=>{ b.round(x0+0.0015,x1-0.0015,y0+0.0015,y1-0.0015,0.50,0.518,0.001,front); b(x0+0.03,x1-0.03,y1-0.03,y1-0.018,0.505,0.518,mat.dark); };
    fr(X(0)+0.02,X(2)-0.02,0.03,h-0.04); fr(X(2)+0.02,X(4)-0.02,0.03,0.38); fr(X(2)+0.02,X(4)-0.02,0.41,3*h-0.04);
    const xd=N>7?X(6):X(4); if(N>7){ fr(X(4)+0.02,X(6)-0.02,0.03,0.38); fr(X(4)+0.02,X(6)-0.02,0.41,5*h-0.04); }
    const dm=(xd+R)/2, yd=(N>7?7:5)*h-0.04; fr(xd+0.02,dm-0.0015,0.03,yd); fr(dm+0.0015,R-0.02,0.03,yd); // two leaves: the swing stays clear of the first tread and the sofa/chair
    // open (south) side of the stairs: A — solid stepped panel 0.74 over each tread, the landing part rises to the guard top; B — open (user's choice, .local/stairs_01.png)
    if(!steel&&stairs!=='gentle'){ for(let i=1;i<N;i++){ const x0=X(i-1); b(x0,x0+s,i*h-0.03,i*h+0.74,0.52,0.54,pnl); } b(R-0.24,R,PL-0.03,TOP,0.52,0.54,pnl); } // D: open side, no stepped panel (user)
    // handrail: one Ø32 wood rail 60 mm off the north wall, 0.85 over the tread line, levelled past the landing to the guard; three wall brackets, no free ends
    const rz=0.06+JOG*(E?1:0), yA=h+0.85, yB=(N-1)*h+0.85, xB=R-0.24, xE=R+0.25; tube(X(0)+0.05,yA,rz,xB,yB,rz,0.016,wood); tube(xB,yB,rz,xE,yB,rz,0.016,wood);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.016,12,8).translate(xB,yB,rz),wood)); [[X(0)+0.05,yA],[xB,yB],[xE,yB]].forEach(([x,y])=>tube(x,y,0,x,y,rz,0.008,mat.frame));
    }
    // over-door tray: beams HF..TB on all four edges are the borders; west beam post to post, east beam along the door wall is not fixed into it,
    // the rear beam sits on the far post and is tied into the far wall (cover plate); floor panel and back panel
    b(R+po,R+po+P,HF,TB,L-0.08,2.97,ST); b(W-0.08+po,W-0.08+po+P,HF,TB,L-0.08,2.97,ST); b(R,W,HF,TB,L+po,L+po+P,ST); b(R,W,HF,TB,2.89+po,2.89+po+P,ST);
    b(R+0.08,W-0.08,HF,HF+0.018,L,2.89,pnl); b(R+0.08,W-0.08,TB,2.50,2.95,2.97,pnl);                 // floor and back panel; no divider inside (user: .local/stair_02.png)
    b(W-0.45,W-0.15,HF-0.02,TB,2.95,2.97,steel?ST:pnl);                                                // wall tie of the rear beam: removable cover (A) / steel plate (B)
  };
  const lathe=(g,pts,cx,cz,m,seg=32)=>{ const mesh=new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r,y)),seg).translate(cx,0,cz),m); g.add(mesh); return mesh; }; // profile [[r,y]…], y rising → faces outward; a profile that comes back down inside makes a closed shell
  // kitchen of room 4: A — run along the west wall, fridge column in the north corner; B — corner kitchen: short leg along the north wall
  // with the fridge column at its east end. Worktop 0.70 deep (2026-09-10, was 0.62). Layout along the worktop right to left
  // (north → south, local z): sink 0.70, worktop 0.60, hob 0.50 with four burners, worktop 0.43, appliance column 0.60
  // (dishwasher at the bottom, oven, microwave). Worktop and splashback share one HPL panel, fronts are matte HPL.
  const KD=0.70, KC=0.66, KP=0.63;            // worktop depth; carcass front (run fronts 20 mm, column doors 40 mm on top of it); plinth
  const KZ0=0.70, KZ1=2.99, KLX=[0.70,1.43];  // base run between the north element and the appliance column; x of B's short leg along the north wall
  const PX0=1.52, PX1=2.32;                   // H: x of the bar peninsula (0.80 wide), west edge 0.82 off the west run's worktop front (KD 0.70)
  const KSINK=[0.73,1.43], KHOB=[2.06,2.56];  // sink cut-out 0.70 and hob module 0.50 along z; the worktop strip x < 0.13 behind the bowl carries the mixer and the dispenser
  // worktop top at 0.75 (user 2026-09-11): base carcass 0.10–0.71, slab 0.712–0.75; columns and wall units keep their heights
  function kitchenBuild(b,g,mode){ const corner=mode!=='A', I=mode==='I', H=mode==='H'||I, G=mode==='G'||H, LX1=H?KLX[1]+0.35:KLX[1], F=mode==='F'||G, Z1=I?2.19:F?2.29:KZ1, HOB=G?[0.70,1.20]:F?[1.79,2.29]:KHOB, SINK=I?[1.39,2.09]:G?[1.49,2.19]:KSINK; // F: fridge column moved next to the appliance column (z 2.29–2.99), run shortened, hob beside the column; G: F with the hob at the corner and the sink 0.10 short of the column; H: short leg 0.35 longer (LX1); I: hob on the short leg under its own wall unit, fridge column 0.80 (z 2.19–2.99), wall units over corner and run as one 4-door block
     const gap=0.003, ugap=0.008, front=(y0,y1,z0,z1,m)=>b.round(KC,KC+0.02,y0+gap/2,y1-gap/2,z0+gap/2,z1-gap/2,0.001,m); // fronts face +x; carcasses sit behind them so the gaps read as dark lines; ugap on wall-unit doors — 3 mm vanishes in a render, 8 mm still shows how many doors there are
     const doors=(x0,x1,z0,z1,rows,m)=>rows.forEach(([y0,y1])=>b.round(x0,x1,y0+gap/2,y1-gap/2,z0,z1,0.002,m)); // 40 mm column doors, flush with the worktop edge
     /* proxy = pre-detail AABBs (realism-all A) */
     if(!corner) b.phys(0,KD+0.03,0,2.69,0,0.70);                                                                       // A: fridge column in the north corner
     else { b.phys(0,KC,0,0.75,0,0.70); b.phys(KLX[0],LX1,0,0.75,0,KD);                                              // B/F: blind corner base, short leg
       if(F){ b.phys(0,KD+0.03,0,2.69,Z1,KZ1); b.phys(0,0.36,1.45,2.69,0,0.70); }                                      // F: fridge column inside the run, corner wall unit up to the north wall
       if(H){ b.phys(KLX[1],PX1,0.71,0.75,0,KD); b.phys(PX0,PX1,0.71,0.75,KD,1.80); [[PX0,1.76],[PX1-0.04,1.76],[PX1-0.04,0.02]].forEach(([x,z])=>b.phys(x,x+0.04,0,0.71,z,z+0.04)); } // H: bar counter and its three posts
       else { b.phys(0,0.36,1.45,2.69,0,0.70); b.phys(0.36,KLX[1],1.45,2.69,0,0.36); b.phys(KLX[1],KLX[1]+0.80,0,2.69,0,KD+0.03); } } // B: corner wall unit, short-leg wall units, fridge column
     b.phys(0,KC,0.1,0.71,KZ0,Z1); b.phys(0,KD,0.71,0.75,KZ0,Z1); b.phys(KC,KC+0.024,0.1,0.71,KZ0,Z1);               // base run: carcass, worktop, fronts with handles
     if(I){ b.phys(0.90,1.40,0.745,0.765,0.08,0.60); b.phys(0.36,LX1,1.45,2.69,0,0.36); } else b.phys(0.08,0.60,0.745,0.765,HOB[0],HOB[1]); b.phys(0.13,0.57,0.56,0.77,SINK[0],SINK[1]);                      // hob and undermount bowl
     const mz=(SINK[0]+SINK[1])/2, sd=SINK[0]+0.09; // centre of the bowl, soap dispenser north of the mixer
     b.phys(0.05,0.33,0.74,1.13,mz-0.02,mz+0.02); b.phys(0.05,0.13,0.74,0.83,sd-0.02,sd+0.02);                                      // mixer and soap dispenser
     b.phys(0,0.36,1.45,2.69,KZ0,Z1); b.phys(0,KD+0.03,0,2.69,KZ1,3.59);                                               // wall units and the appliance column
     // ---- north end of the run
     if(!corner){ b(0,KC,0.1,2.69,0,0.70,mat.hdark); b(0,KP,0,0.1,0,0.70,mat.dark);                                     // A: fridge column 0.70, carcass and plinth
       doors(KC,KD,0.02,0.68,[[0.10,0.30],[0.30,2.00],[2.00,2.69]],mat.base);                                           // drawer below, fridge door, freezer above
       b.handle(KD,1.40,0.06,0.5,'y','x'); b.handle(KD,2.30,0.06,0.3,'y','x'); }
     else { b(0,KC,0.1,0.71,0,0.70,mat.hdark); b(0,KP,0,0.1,0,0.70,mat.dark); front(0.1,0.71,0,0.70,mat.base);          // B: blind corner base with a plain panel (the short leg blocks it)
       b(0,0.34,1.45,2.69,0,0.70,mat.hdark); if(!I) b.round(0.34,0.36,1.45+ugap/2,2.69-ugap/2,(F?0:0.36)+ugap/2,0.70-ugap/2,0.001,mat.upper); // corner wall unit: B a narrow door past the short-leg unit, F (no units on the short leg) a full 0.70 door up to the wall
       if(F&&!I) b.handle(0.36,1.50,0.60,0.16,'z','x');
       if(I){ b(0.36,LX1,1.45,2.69,0,0.34,mat.hdark); [[0.36,1.07],[1.07,LX1]].forEach(([x0,x1])=>{ b.round(x0+ugap/2,x1-ugap/2,1.45+ugap/2,2.69-ugap/2,0.34,0.36,0.001,mat.upper); b.handle((x0+x1)/2,1.50,0.36,0.16,'x','z'); }); } // I: wall unit over the short leg, the hob sits under it
       if(H){ // H (user 2026-09-11, .local/bar): the worktop runs on along the north wall to PX1 and bends into a peninsula 0.80×1.80 towards the room, 0.82 off the west run's worktop (user: 0.80) — one 40 mm slab on a slim 40×40 frame, open underneath
         const bar=polyXZ([[KLX[1],0.002],[PX1-0.002,0.002],[PX1-0.002,1.798],[PX0+0.002,1.798],[PX0+0.002,KD-0.002],[KLX[1],KD-0.002]]);
         g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(bar,{depth:0.036,bevelThickness:0.002,bevelSize:0.002,bevelSegments:1,curveSegments:2}).rotateX(Math.PI/2).translate(0,0.748,0),mat.top));
         b(0.02,LX1,0.75,1.45,0,0.02,mat.wpanel);                                                                      // splashback only behind the base unit: past it the wall stays bare (user 2026-09-11)
         [[PX0,1.76],[PX1-0.04,1.76],[PX1-0.04,0.02]].forEach(([x,z])=>b(x,x+0.04,0,0.71,z,z+0.04,mat.frame));             // posts: the two far corners and the east edge at the wall; the west side rests on the base unit
         b(LX1,PX1,0.67,0.71,0.02,0.06,mat.frame);                                                                        // rail under the top along the wall past the base unit
         b(PX0,PX0+0.04,0.67,0.71,KD,1.80,mat.frame); b(PX1-0.04,PX1,0.67,0.71,0.06,1.80,mat.frame); b(PX0,PX1,0.67,0.71,1.76,1.80,mat.frame); } // peninsula perimeter
       b(KLX[0],LX1,0.1,0.71,0.02,KC,mat.hdark); b(KLX[0],LX1,0,0.1,0.02,KP,mat.dark);                            // short leg along the north wall: base carcass and plinth, fronts face +z
       [[0.1,0.30],[0.30,0.50],[0.50,0.71]].forEach(([y0,y1])=>{ b.round(KLX[0]+gap/2,LX1-gap/2,y0+gap/2,y1-gap/2,KC,KC+0.02,0.001,mat.base); b.handle((KLX[0]+LX1)/2,y1-0.05,KC+0.02,0.2,'x','z'); }); // three drawers
       b(0.02,KLX[1],0.75,1.45,0,0.02,mat.wpanel);                                                                      // splashback of the short leg
       if(F){ b(0,KC,0.1,2.69,Z1,KZ1,mat.hdark); b(0,KP,0,0.1,Z1,KZ1,mat.dark);                                         // F: fridge column between the run and the appliance column, short leg stays worktop only (an island or bar may grow from it later)
         doors(KC,KD,Z1+0.02,KZ1-0.02,[[0.10,0.30],[0.30,2.00],[2.00,2.69]],mat.base); b.handle(KD,1.40,Z1+0.06,0.5,'y','x'); b.handle(KD,2.30,Z1+0.06,0.3,'y','x'); }
       else { b(0.36,KLX[1],1.45,2.69,0,0.34,mat.hdark); [[0.36,0.90],[0.90,KLX[1]]].forEach(([x0,x1])=>{ b.round(x0+ugap/2,x1-ugap/2,1.45+ugap/2,2.69-ugap/2,0.34,0.36,0.001,mat.upper); b.handle((x0+x1)/2,1.50,0.36,0.16,'x','z'); }); // B: wall units, 2 doors
         const FX=KLX[1], FW=0.80; b(FX,FX+FW,0.1,2.69,0,KC,mat.hdark); b(FX,FX+FW,0,0.1,0,KP,mat.dark);                // fridge column at the east end of the short leg
         doors(FX+0.02,FX+FW-0.02,KC,KD,[[0.10,0.30],[0.30,2.00],[2.00,2.69]],mat.base);
         b.handle(FX+0.07,1.40,KD,0.5,'y','z'); b.handle(FX+0.07,2.30,KD,0.3,'y','z'); } }
     // ---- base run: carcass, plinth, fronts
     b(0,KC,0.1,0.71,KZ0,Z1,mat.hdark); b(0,KP,0,0.1,KZ0,Z1,mat.dark);
     (I?[[KZ0,1.36,'drawers'],[1.36,2.19,'door']]:G?[[KZ0,1.20,'drawers2'],[1.20,1.46,'drawers'],[1.46,2.29,'door']]:F?[[KZ0,1.46,'door'],[1.46,1.79,'drawers'],[1.79,2.29,'drawers2']]:[[KZ0,1.46,'door'],[1.46,2.06,'drawers'],[2.06,2.56,'drawers2'],[2.56,KZ1,'door']]).forEach(([z0,z1,k])=>{
       if(k==='door'){ front(0.1,0.71,z0,z1,mat.base); b.handle(KC+0.02,0.64,(z0+z1)/2,0.16,'z','x'); }
       else { const ys=k==='drawers'?[0.1,0.30,0.50,0.71]:[0.1,0.40,0.71]; for(let i=0;i<ys.length-1;i++){ front(ys[i],ys[i+1],z0,z1,mat.base); b.handle(KC+0.02,ys[i+1]-0.05,(z0+z1)/2,0.2,'z','x'); } } });
     // ---- worktop 40 mm with the sink cut-out; L-shaped in the corner kitchen
     const sh=corner?polyXZ([[0.002,0.002],[KLX[1],0.002],[KLX[1],KD-0.002],[KD-0.002,KD-0.002],[KD-0.002,Z1-0.002],[0.002,Z1-0.002]])
                    :rrectXZ(0.002,KD-0.002,KZ0+0.002,Z1-0.002,0.002);
     sh.holes.push(rrectXZ(0.13,0.57,SINK[0],SINK[1],0.02));
     g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:0.036,bevelThickness:0.002,bevelSize:0.002,bevelSegments:1,curveSegments:2}).rotateX(Math.PI/2).translate(0,0.748,0),mat.top));
     b(0.13,0.57,0.56,0.57,SINK[0],SINK[1],mat.frame); [[0.13,0.14],[0.56,0.57]].forEach(([x0,x1])=>b(x0,x1,0.56,0.745,SINK[0],SINK[1],mat.frame));
     [[SINK[0],SINK[0]+0.01],[SINK[1]-0.01,SINK[1]]].forEach(([z0,z1])=>b(0.13,0.57,0.56,0.745,z0,z1,mat.frame)); // undermount bowl
     // ---- chrome mixer with a pull-down spout and a built-in soap dispenser beside it, both on the worktop strip behind the bowl
     const curve=new THREE.CatmullRomCurve3([[0.075,0.76],[0.075,1.00],[0.09,1.09],[0.19,1.12],[0.29,1.07],[0.31,0.99]].map(([x,y])=>new THREE.Vector3(x,y,mz)));
     g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,20,0.013,10),mat.handle));
     g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.02,16).translate(0.075,0.758,mz),mat.handle));           // base plate
     g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.021,0.017,0.08,12).translate(0.31,0.95,mz),mat.handle));           // pull-down spray head
     b(0.075,0.15,0.89,0.92,mz-0.011,mz+0.011,mat.handle);                                                                // lever
     g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.021,0.021,0.06,14).translate(0.075,0.775,sd),mat.handle));       // soap dispenser head
     g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.05,10).rotateZ(Math.PI/2).translate(0.105,0.795,sd),mat.handle)); // its spout over the bowl, north of the mixer
     // ---- splashback 20 mm: proud of the wall finish panel (15 mm off the wall face, app.js)
     b(0,0.02,0.75,1.45,corner?0:KZ0,Z1,mat.wpanel);
     // ---- hob: four burners on a 0.50 panel, hood under the wall units
     const HR=I?[0.92,1.38,0.08,0.60]:[0.08,0.60,HOB[0]+0.02,HOB[1]-0.02], BX=I?[1.03,1.27]:[0.235,0.455], BZ=I?[0.235,0.455]:[HOB[0]+0.13,HOB[1]-0.13]; // I: hob panel turned along x on the short leg
     b.round(HR[0],HR[1],0.748,0.758,HR[2],HR[3],0.001,mat.screen);
     BX.forEach(x=>BZ.forEach(z=>{ const r=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.002,24),mat.ring); r.position.set(x,0.759,z); g.add(r); }));
     if(I){ b(0.90,1.40,1.45,1.50,0.34,0.52,mat.frame); b.round(0.90,1.40,1.45,1.50,0.52,0.53,0.001,mat.dark); } else { b(0.34,0.52,1.45,1.50,HOB[0],HOB[1],mat.frame); b.round(0.52,0.53,1.45,1.50,HOB[0],HOB[1],0.001,mat.dark); }
     // ---- wall units over the run, 4 doors
     b(0,0.34,1.45,2.69,KZ0,Z1,mat.hdark);
     const U0=I?0.36:KZ0, UN=I?2:4; // I: two wide doors run from the short-leg unit to the fridge column (corner unit included)
     for(let i=0;i<UN;i++){ const z0=U0+i*(Z1-U0)/UN, z1=z0+(Z1-U0)/UN; b.round(0.34,0.36,1.45+ugap/2,2.69-ugap/2,z0+ugap/2,z1-ugap/2,0.001,mat.upper); b.handle(0.36,1.50,(z0+z1)/2,0.16,'z','x'); }
     // ---- appliance column: dishwasher, oven, microwave, cupboard on top
     b(0,KC,0.1,2.69,KZ1,3.59,mat.hdark); b(0,KP,0,0.1,KZ1,3.59,mat.dark);
     const pz=[KZ1+0.02,3.57], pc=(KZ1+3.59)/2;
     doors(KC,KD,pz[0],pz[1],[[0.10,0.92],[1.99,2.69]],mat.base);                                                         // dishwasher door and the cupboard above
     doors(KC,KD,pz[0],pz[1],[[0.95,1.55],[1.58,1.96]],mat.dark);                                                         // oven and microwave fronts
     b(KD,KD+0.005,1.05,1.45,pz[0]+0.06,pz[1]-0.06,mat.screen); b(KD,KD+0.005,1.64,1.90,pz[0]+0.08,pz[1]-0.08,mat.screen); // their glass
     [[0.87,0.4],[1.50,0.4],[1.91,0.4],[2.04,0.3]].forEach(([y,len])=>b.handle(KD,y,pc,len,'z','x'));
     function polyXZ(pts){ const sh=new THREE.Shape(); pts.forEach(([x,z],i)=>i?sh.lineTo(x,z):sh.moveTo(x,z)); return sh; }
     function rrectXZ(x0,x1,z0,z1,r){ const w=x1-x0,d=z1-z0; const sh=new THREE.Shape(); sh.moveTo(x0+r,z0); sh.lineTo(x1-r,z0); sh.absarc(x1-r,z0+r,r,-Math.PI/2,0,false); sh.lineTo(x1,z1-r); sh.absarc(x1-r,z1-r,r,0,Math.PI/2,false); sh.lineTo(x0+r,z1); sh.absarc(x0+r,z1-r,r,Math.PI/2,Math.PI,false); sh.lineTo(x0,z0+r); sh.absarc(x0+r,z0+r,r,Math.PI,Math.PI*1.5,false); return sh; }
  }
  const KN=1.915; // north wall of kitchen-living room 4
  const SOFA_E=13.455; // east edge of every sofa variant: against the east wall finish (15 mm off the wall face x 13.47)
  const CHAIR4={paint:'oakFurniture',cushion:'sofaWeave'}; // M2: dining chairs — oak frame (GLB material `paint`), seat pad in the sofa fabric
  // bar stools at the peninsula of kitchens H/I (models/stool.glb = chair.js with legs +0.08): three along the room side, one at the south end, tucked under the slab with the hoop backs out
  const STOOLS={stool1:[10.19,1.98,'E',-90],stool2:[10.19,2.46,'E',-90],stool3:[10.19,2.94,'E',-90],stool4:[9.80,3.42,'S',0]}; // tucked in: seats 0.33 under the slab, rear legs just past the frame rails, the row touching so the end stool fits between the far posts
  const stoolSpec=([x,z,side,rot])=>({pos:[x,z],size:[0.48,0.86,0.48],glb:'models/stool.glb',glbRot:rot,coat:CHAIR4,build:chair(side)});
  const CAB={cabinetPaint:'cabinetPaint'}; // M4: casework and desks — painted MDF on every cabinetPaint-slot detail (body, fronts, panels)
  const BED={cabinetPaint:'cabinetPaint',kmat:'curtainLinen',pillow:'curtainLinen',cushion:'curtainLinen',cover:'curtainLinen'}; // M4: beds and window seats — bedding in linen, not the sofa weave (kitchen.md rule 3)
  const KID_CHAIR={cushion:'sofaWeave',plastic:'plastic'}; // M4-1: desk chairs — seat pad as the dining chairs, plastic shell
  const PLASTIC={plastic:'plastic'}; // M4-1: lamp bodies, socket and switch frames (kitchen.md rule 6)
  // 2026-09-12: решётка вместо ящиков лежанки — воздух от радиатора под подоконником; рамка 0.04 и вертикальные прорези 0.02 с шагом ~0.09
  const airGrille=(b,x0,x1,y0,y1,z0,z1,m)=>{ const f=0.04, sw=0.02, L=z1-z0, n=Math.max(3,Math.round((L-0.07)/0.09)), rib=(L-n*sw)/(n+1);
    b(x0,x1,y0,y0+f,z0,z1,m); b(x0,x1,y1-f,y1,z0,z1,m);
    for(let i=0;i<=n;i++){ const a=z0+i*(rib+sw); b(x0,x1,y0+f,y1-f,a,a+rib,m); } };
  // ---- room 4 wall decor (.local/декор/, one picture = one variant): tv wall x 10.95–13.47 on the north wall, sofa wall x 10.96–13.47 on the south wall
  // (rot 180: local x runs east→west, so local x=0 is the viewer's left, as in the pictures). Boards 20 mm proud of the wall, LED = emissive strips on the wall
  // plane (ponytail: no light source, the glow is a visible line only); the proxy box lies inside the wall so the tv and a sofa back never clash with it
  const DEC={wood:mat.table,paint:mat.wbody,stone:mat.top,coat:{table:'oakFurniture',cabinetPaint:'cabinetPaint',top:'stoneCounter'},
    floorCoat:{table:'oakFloor',cabinetPaint:'cabinetPaint',top:'stoneCounter'}, // 2026-09-10: wood of the same tone as the floor board in front of the wall — tv D and every sofa variant
    boards:(b,x0,x1,y0,y1,n,m)=>{ const w=(x1-x0-0.004*(n-1))/n; for(let i=0;i<n;i++){ const x=x0+i*(w+0.004); b.round(x,x+w,y0,y1,0,0.02,0.002,m); } }, // n boards with 4 mm joints
    slats:(b,x0,x1,y0,y1,z1=0.02)=>{ b(x0,x1,y0,y1,0,z1*0.3,mat.dark); for(let x=x0+0.015;x+0.03<=x1+1e-6;x+=0.06) b(x,x+0.03,y0,y1,z1*0.3,z1,DEC.wood); }, // 30 mm slats on a 60 mm pitch over a dark backing
    glow:(b,x0,x1,y0,y1,z0=0)=>b(x0,x1,y0,y1,z0,z0+0.004,mat.led),
    shape:(b,sh,x,y,z0,z1,m)=>{ const o=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:z1-z0,bevelEnabled:false,curveSegments:24}).translate(x,y,z0),m); b.group.add(o); return o; },
    ellipse:(cx,cy,rx,ry)=>{ const sh=new THREE.Shape(); sh.absellipse(cx,cy,rx,ry,0,Math.PI*2,false,0); return sh; },
    art:(b,x0,x1,y0,y1)=>{ b(x0,x1,y0,y1,0.02,0.05,mat.frame); b(x0+0.02,x1-0.02,y0+0.02,y1-0.02,0.045,0.052,mat.pillow); }, // framed canvas 30 mm deep, face at z 0.052
    wall:(W,f)=>b=>{ b.phys(0,W,0,2.7,-0.02,0); f(b); }};
  const DECOR_TV={ // W 2.52, tv centre at local x 1.55 (tv A x 0.9–2.2, y 1.0–1.75; tv B x 0.77–2.33, y 0.925–1.825)
    A:b=>{ DEC.slats(b,0,0.40,0,2.60); DEC.boards(b,0.40,2.52,0,2.60,4,DEC.paint); DEC.glow(b,0,2.52,2.60,2.62); },                       // slat strip + painted boards, LED cove under the ceiling
    B:b=>{ for(let r=0;r<4;r++) DEC.boards(b,0,2.52,r*0.626,r*0.626+0.622,3,DEC.paint); DEC.glow(b,0,2.52,2.50,2.52); },              // 3×4 painted tiles, LED cove
    C:b=>{ DEC.boards(b,0.65,2.45,0,2.60,3,DEC.wood); DEC.glow(b,0.63,0.65,0,2.60); },                                                  // three wide oak boards, LED on the left edge
    D:b=>DEC.boards(b,0,2.10,0,2.70,5,DEC.wood),                                                                                        // oak boards, no light; one board narrower than the wall, west edge moved east (user 2026-09-11)
    E:b=>{ DEC.slats(b,0,0.50,0,2.70); DEC.shape(b,b.rrect(1.98,2.19,0.29),0.54,0.28,0,0.004,mat.led); DEC.shape(b,b.rrect(1.94,2.15,0.27),0.56,0.30,0.004,0.02,DEC.paint); }, // panel ends at x 2.52 = the east wall // rounded painted panel with a halo, slats on the left (mirrored: the wall ends at the tv side)
    F:b=>{ DEC.slats(b,0,2.52,0,2.70,0.012); const D=r=>{ const sh=new THREE.Shape(); sh.moveTo(2.52,1.4-r); sh.lineTo(1.5,1.4-r); sh.absarc(1.5,1.4,r,-Math.PI/2,Math.PI/2,true); sh.lineTo(2.52,1.4+r); sh.closePath(); return sh; };
      DEC.shape(b,D(0.97),0,0,0.012,0.016,mat.led); DEC.shape(b,D(0.95),0,0,0.016,0.02,mat.dark); [1.3,1.65,2.0].forEach(y=>b(0.03,0.45,y,y+0.025,0.012,0.27,DEC.wood)); }, // dark half-disc with a halo on a slat wall, three shelves on the left
    G:b=>{ DEC.slats(b,0,2.52,0,2.70,0.012); const ring=DEC.ellipse(1.55,1.45,0.95,0.97); ring.holes.push(DEC.ellipse(1.55,1.45,0.92,0.94)); DEC.shape(b,ring,0,0,0.012,0.016,mat.led);
      DEC.shape(b,DEC.ellipse(1.15,2.0,0.22,0.15),0,0,0.012,0.02,DEC.paint); b(2.0,2.28,1.95,1.975,0.012,0.22,DEC.wood); },            // LED ring on a slat wall, oval panel top-left, one shelf on the right
    H:b=>{ DEC.slats(b,0,2.52,0,2.70,0.012); b(0.58,2.48,0.30,2.45,0.012,0.02,DEC.stone); [[0.555,0.58],[2.48,2.505]].forEach(([x0,x1])=>DEC.glow(b,x0,x1,0.30,2.45,0.012)); DEC.glow(b,0.58,2.48,2.45,2.47,0.012); }}; // stone slab with LED on three edges over a slat wall
  const DECOR_SOFA={ // W 2.51, sofa back on the wall, top 0.68–0.9
    A:b=>DEC.boards(b,0,2.51,0,2.70,5,DEC.wood),                                                                                        // oak boards over the whole wall
    B:b=>{ b.round(0,0.55,0,2.70,0,0.02,0.002,DEC.wood); b.round(0.61,1.25,0,2.70,0,0.02,0.002,DEC.wood); DEC.glow(b,0.55,0.61,0,2.70); DEC.art(b,1.5,2.35,1.2,2.4); // two oak boards with a LED slot, relief picture on the painted part
      b.group.add(new THREE.Mesh(new THREE.RingGeometry(0.25,0.27,32,1,0,Math.PI).translate(1.925,1.7,0.053),mat.wpanel)); },
    C:b=>{ DEC.slats(b,0,0.95,0,2.70); DEC.glow(b,0.95,0.99,0,2.70); DEC.art(b,1.55,2.15,1.25,2.10); DEC.shape(b,DEC.ellipse(1.93,1.68,0.17,0.32),0,0,0.052,0.055,mat.dark); }}; // slat panel, LED slot, black-and-white picture
  const DEC_TV_W={D:2.10};   // a variant narrower than the wall: the panel keeps its east edge, pos shifts east by the difference
  Object.keys(DECOR_TV).forEach(k=>DECOR_TV[k]=DEC.wall(DEC_TV_W[k]||2.52,DECOR_TV[k])); Object.keys(DECOR_SOFA).forEach(k=>DECOR_SOFA[k]=DEC.wall(2.51,DECOR_SOFA[k]));
  const ITEMS=[
    // ---- kitchen-living room 4 (sketch .local/R1.jpg) ----
    {id:'kitchen',type:'кухонный блок',room:4,layer:'kitchen',pos:[8.23,KN],rot:0,size:[0.74,2.69,3.59],fixed:'wall',coat:{base:'oliveFront',upper:'beigeFront',hdark:'oliveFront',top:'hplWhite',wpanel:'hplWhite'}, // 2026-09-11: olive fronts and carcass sides, wall-unit doors in the beige of the floor tile, worktop and splashback one white HPL panel; plinth, hob and metal stay class twins
     build(b,g){ kitchenBuild(b,g,'A'); }},
    {id:'table',type:'стол на 6 мест',room:4,layer:'kitchen',pos:[9.85,KN+0.04],rot:0,size:[0.8,0.76,1.8],coat:{table:'oakFurniture'},
     build(b,g){ b.phys(0,0.8,0.72,0.76,0,1.8); b.phys(0.05,0.75,0.64,0.72,0.05,1.75); [[0.05,0.05],[0.7,0.05],[0.05,1.7],[0.7,1.7]].forEach(([x,z])=>b.phys(x,x+0.05,0,0.72,z,z+0.05)); // proxy = the old block AABBs (top, apron, legs)
       const r=0.004, sh=new THREE.Shape([[r,r],[0.8-r,r],[0.8-r,1.8-r],[r,1.8-r]].map(([x,y])=>new THREE.Vector2(x,y))); // tabletop 0.04 with a 4 mm bevel all round (UVs in metres from the shape)
       const top=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:0.04-2*r,bevelThickness:r,bevelSize:r,bevelSegments:2}).rotateX(Math.PI/2).translate(0,0.76-r,0),mat.table); g.add(top);
       [[0.08,0.10,0.10,1.70],[0.70,0.72,0.10,1.70],[0.10,0.70,0.08,0.10],[0.10,0.70,1.70,1.72]].forEach(([x0,x1,z0,z1])=>b(x0,x1,0.65,0.72,z0,z1,mat.table)); // apron rails 20×70, 30 mm in from the leg faces
       [[0.075,0.075],[0.725,0.075],[0.075,1.725],[0.725,1.725]].forEach(([x,z])=>{ const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.05/Math.SQRT2,0.035/Math.SQRT2,0.72,4).rotateY(Math.PI/4).translate(x,0.36,z),mat.table); g.add(leg); }); }}, // square legs tapering 50→35 mm
    {id:'chair1',type:'стул',room:4,layer:'kitchen',pos:[9.51,KN+0.04+0.35-0.24],rot:0,size:[0.48,0.8,0.48],attach:'table',coat:CHAIR4,glb:'models/chair.glb',glbRot:90,build:chair('W')},
    {id:'chair2',type:'стул',room:4,layer:'kitchen',pos:[9.51,KN+0.04+0.94-0.24],rot:0,size:[0.48,0.8,0.48],attach:'table',coat:CHAIR4,glb:'models/chair.glb',glbRot:90,build:chair('W')},
    {id:'chair3',type:'стул',room:4,layer:'kitchen',pos:[9.51,KN+0.04+1.53-0.24],rot:0,size:[0.48,0.8,0.48],attach:'table',coat:CHAIR4,glb:'models/chair.glb',glbRot:90,build:chair('W')},
    {id:'chair4',type:'стул',room:4,layer:'kitchen',pos:[10.51,KN+0.04+0.35-0.24],rot:0,size:[0.48,0.8,0.48],attach:'table',coat:CHAIR4,glb:'models/chair.glb',glbRot:-90,build:chair('E')},
    {id:'chair5',type:'стул',room:4,layer:'kitchen',pos:[10.51,KN+0.04+0.94-0.24],rot:0,size:[0.48,0.8,0.48],attach:'table',coat:CHAIR4,glb:'models/chair.glb',glbRot:-90,build:chair('E')},
    {id:'chair6',type:'стул',room:4,layer:'kitchen',pos:[10.51,KN+0.04+1.53-0.24],rot:0,size:[0.48,0.8,0.48],attach:'table',coat:CHAIR4,glb:'models/chair.glb',glbRot:-90,build:chair('E')},
    ...Object.entries(STOOLS).map(([id,st])=>Object.assign({id,type:'барный стул у стойки',room:4,layer:'kitchen',rot:0,hidden:true},stoolSpec(st))), // hidden until kitchen H/I shows them
    {id:'lamp',type:'настенный светильник над столом',room:4,layer:'kitchen',pos:[10.12,KN],rot:0,size:[0.26,1.94,0.63],fixed:'wall',coat:{plastic:'plastic'}, // size by the shade
     build(b,g){ /* proxy = pre-detail AABBs (realism-all A) */ b.phys(0.11,0.15,1.9,1.94,0,0.5); b.phys(0,0.26,1.74,1.9,0.37,0.63);
       b.round(0.08,0.18,1.86,1.94,0,0.012,0.002,mat.frame); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.49,10).rotateX(Math.PI/2).translate(0.13,1.92,0.012+0.245),mat.frame)); // wall plate and Ø12 arm
       g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.004,0.004,0.03,8).translate(0.13,1.905,0.5),mat.frame)); // drop to the shade
       g.add(new THREE.Mesh(new THREE.LatheGeometry([[0.012,0.16],[0.03,0.155],[0.07,0.09],[0.11,0.03],[0.13,0]].map(([r,y])=>new THREE.Vector2(r,y)),24).translate(0.13,1.74,0.5),mat.plastic)); // shade Ø0.26, open at the bottom
       g.add(new THREE.Mesh(new THREE.SphereGeometry(0.025,12,8).translate(0.13,1.80,0.5),mat.led)); // bulb
     }},
    {id:'ceil4_1',type:'точечный светильник Ø0.08 встроенный, рабочая зона кухни, северная треть столешницы',room:4,layer:'kitchen',pos:[9.21,2.41],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil4_2',type:'точечный светильник Ø0.08 встроенный, рабочая зона кухни, варочная и мойка',room:4,layer:'kitchen',pos:[9.21,3.66],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil4_3',type:'точечный светильник Ø0.08 встроенный, рабочая зона кухни, южная треть, духовка',room:4,layer:'kitchen',pos:[9.21,4.91],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil4_4',type:'точечный светильник Ø0.08 встроенный, над северной половиной стола',room:4,layer:'kitchen',pos:[10.21,2.31],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil4_5',type:'точечный светильник Ø0.08 встроенный, над южной половиной стола',room:4,layer:'kitchen',pos:[10.21,3.31],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil4_6',type:'точечный светильник Ø0.08 встроенный, общий свет, проход между столом и диваном',room:4,layer:'kitchen',pos:[11.06,4.16],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil4_7',type:'точечный светильник Ø0.08 встроенный, общий свет, центр гостиной у выхода на лоджию',room:4,layer:'kitchen',pos:[12.46,4.16],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil4_8',type:'точечный светильник Ø0.08 встроенный, над западной половиной дивана, 2700 K',room:4,layer:'kitchen',pos:[11.81,5.21],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil4_9',type:'точечный светильник Ø0.08 встроенный, над восточной половиной дивана, 2700 K',room:4,layer:'kitchen',pos:[12.81,5.21],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'led8',type:'LED-лента под передней кромкой верхних шкафов кухни, свет на фартук, 3000 K',room:4,layer:'kitchen',pos:[8.55,2.575],rot:0,size:[0.03,1.45,2.33],fixed:'wall',
     build(b){ b.led(0,0.03,1.43,1.45,0,2.33); }}, // profile hangs under the cabinet bottom (y 1.45), flush with the door fronts (x 8.59)
    {id:'tv',type:'телевизор 58"',room:4,layer:'kitchen',pos:[11.85,KN+0.02],rot:0,size:[1.3,1.75,0.04],fixed:'wall',build(b,g){ /* proxy = pre-detail AABBs (realism-all A) */ b.phys(0,1.3,1,1.75,0,0.04);
       b.round(0,1.3,1.0,1.75,0.008,0.028,0.002,mat.dark); b(0.008,1.292,1.008,1.742,0.028,0.031,mat.screen); // slim panel with an 8 mm bezel, screen 3 mm proud
       b(0.35,0.95,1.0,1.012,0.02,0.034,mat.frame); b(0.45,0.85,1.2,1.5,0,0.008,mat.frame); // bottom strip and wall bracket
     }},
    {id:'console',type:'подвесная консоль под ТВ',room:4,layer:'kitchen',pos:[11.9,KN],rot:0,size:[1.2,0.75,0.38],fixed:'wall',coat:{cabinetPaint:'hplWhite'}, // 2026-09-11: белый HPL, как столешница кухни
     build(b,g){ /* proxy = pre-detail AABBs (realism-all A) */ b.phys(0,1.2,0.45,0.75,0,0.38);
       b(0,1.2,0.45,0.73,0,0.36,mat.hdark); b.round(0,1.2,0.73,0.75,0,0.38,0.002,mat.base); // carcass under a 20 mm chamfered top (no shared top plane)
       [[0.0015,0.5985],[0.6015,1.1985]].forEach(([x0,x1])=>b.round(x0,x1,0.4515,0.7285,0.36,0.38,0.001,mat.base)); // two push-to-open fronts, 3 mm gaps
     }},
    {id:'sofa',type:'диван 2 м, низкий, без спинки и подлокотников, три большие подушки',room:4,layer:'kitchen',pos:[SOFA_E-2.0,6.287-0.9],rot:0,size:[2.0,0.87,0.88],glb:'models/sofa.glb',coat:{upholstery:'sofaWeaveLight',piping:'sofaWeaveLight',cushion:'sofaWeaveLight'}, // model by tools/models/sofa.js
     build(b){ b.phys(0,2,0.1,0.85,0,0.88); b(0,2,0.05,0.42,0,0.88,mat.sofa); [0.1,0.7,1.3].forEach(x=>b(x,x+0.6,0.42,0.87,0.60,0.78,mat.cushion)); }}, // fallback: seat block and three pillows
    {id:'decortv',type:'декор стены за ТВ',room:4,layer:'kitchen',pos:[10.95,KN],rot:0,size:[2.52,2.7,0.02],fixed:'wall',coat:DEC.coat,build:DECOR_TV.A},
    {id:'decorsofa',type:'декор стены за диваном',room:4,layer:'kitchen',pos:[13.47,6.287],rot:180,size:[2.51,2.7,0.06],fixed:'wall',coat:DEC.floorCoat,build:DECOR_SOFA.A},
    // ---- hallway 5 (sketches .local/R2_*) ----
    {id:'wardrobe',type:'шкаф в нише',room:5,layer:'hall',pos:[8.20,7.974-0.45],rot:0,size:[1.77,2.65,0.45],fixed:'wall',coat:{door:'cabinetPaint',body:'cabinetPaint'}, // M4-3: painted doors and visible carcass; shoe niche stays dark class
     build(b){ /* proxy = pre-detail AABBs (realism-all A) */ b.phys(0,0.02,0,2.65,0,0.45); b.phys(1.75,1.77,0,2.65,0,0.45); b.phys(0,1.77,0,2.65,0.43,0.45); b.phys(0,1.77,2.63,2.65,0,0.45); b.phys(0.02,1.75,0.02,0.04,0.05,0.43); b.phys(0.02,1.75,0.43,0.45,0,0.43); b.phys(0.02,1.75,0.04,0.43,0.35,0.43); b.phys(0.02,0.881,0.45,1.95,0,0.02); b.phys(0.889,1.75,0.45,1.95,0,0.02); b.phys(0.825,0.84,1,1.3,-0.02,0); b.phys(0.93,0.945,1,1.3,-0.02,0); b.phys(0.02,1.75,1.95,1.97,0,0.43); b.phys(0.02,0.881,1.97,2.63,0,0.02); b.phys(0.889,1.75,1.97,2.63,0,0.02); b.phys(0.825,0.84,2.07,2.23,-0.02,0); b.phys(0.93,0.945,2.07,2.23,-0.02,0);
       const W=1.77, D=0.45, t=0.02, mid=W/2, gap=0.004, H0=0.45, H1=1.95, H2=2.65, dg=0.005; // dg: зазор двери, 5 мм вместо 1.5 — Gemini рисовал на сплошном поле случайное число дверей
       b(0,t,0,H2,0,D,mat.body); b(W-t,W,0,H2,0,D,mat.body); b(0,W,0,H2,D-t,D,mat.body); b(0,W,H2-t,H2,0,D,mat.body); // body
       b(t,W-t,0.02,0.04,0.05,D-t,mat.body); b(t,W-t,H0-t,H0,0,D-t,mat.body); b(t,W-t,0.04,H0-t,D-0.10,D-t,mat.hdark); // shoe niche
       b(t,W-t,H0,H2,t,t+0.002,mat.dark); // тёмный фон сразу за фасадами (лицо двери — локальная z=0): каждый зазор читается линией, а не стыком одного цвета
       const door=(x0,x1,y0,y1)=>b.round(x0+dg,x1-dg,y0+dg,y1-dg,0,t,0.001,mat.door); // 10 mm gaps between the doors, 5 mm to the body
       door(t,mid-gap,H0,H1); door(mid+gap,W-t,H0,H1);                                                                // doors
       b(mid-0.02,mid-gap-0.001,H0+0.02,H1-0.02,0,0.003,mat.frame); b(mid+gap+0.001,mid+0.02,H0+0.02,H1-0.02,0,0.003,mat.frame); // flush vertical pull profiles along the meeting edge
       b(t,W-t,H1,H1+t,0,D-t,mat.body); door(t,mid-gap,H1+t,H2-t); door(mid+gap,W-t,H1+t,H2-t);                       // top cabinets
       b(mid-0.02,mid-gap-0.001,H1+0.04,H2-0.04,0,0.003,mat.frame); b(mid+gap+0.001,mid+0.02,H1+0.04,H2-0.04,0,0.003,mat.frame);
     }},
    {id:'entry',type:'полочка с ящиками и светильниками у входа',room:5,layer:'hall',pos:[6.346,7.03],rot:0,size:[0.325,1.85,0.4],fixed:'wall',coat:{door:'cabinetPaint',body:'cabinetPaint'},
     build(b){ /* proxy = pre-detail AABBs (realism-all A) */ b.phys(0,0.3,0.8,0.92,0,0.4); b.phys(0.3,0.315,0.81,0.91,0.01,0.195); b.phys(0.3,0.315,0.81,0.91,0.205,0.39); b.phys(0.315,0.325,0.855,0.865,0.07,0.14); b.phys(0.315,0.325,0.855,0.865,0.26,0.33);
       b.round(0,0.30,0.80,0.92,0,0.4,0.003,mat.body);                                                                  // shelf box with a 3 mm chamfer
       b.round(0.30,0.315,0.81,0.91,0.01,0.195,0.001,mat.door); b.round(0.30,0.315,0.81,0.91,0.205,0.39,0.001,mat.door);   // two drawer fronts, 10 mm gap between
       b(0.315,0.318,0.855,0.865,0.07,0.14,mat.handle); b(0.315,0.318,0.855,0.865,0.26,0.33,mat.handle);                 // flush finger pulls
       b.led(0.01,0.03,1.15,1.85,0.10,0.13); b.led(0.01,0.03,1.15,1.85,0.27,0.30);                                       // two vertical light profiles (they declare their own proxies)
     }},
    {id:'ceil5_1',type:'точечный светильник Ø0.08 встроенный, входная зона перед дверью, полочка и зеркало сбоку',room:5,layer:'hall',pos:[7.16,7.01],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil5_2',type:'точечный светильник Ø0.08 встроенный, середина северного участка коридора',room:5,layer:'hall',pos:[7.16,5.56],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil5_3',type:'точечный светильник Ø0.08 встроенный, у дверей комнат 1, 6 и 7',room:5,layer:'hall',pos:[7.16,4.36],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil5_4',type:'точечный светильник Ø0.08 встроенный, у двери на кухню и шкафа в нише',room:5,layer:'hall',pos:[9.26,6.96],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil5_5',type:'точечный светильник Ø0.08 встроенный, поворот к двери комнаты 2',room:5,layer:'hall',pos:[10.41,8.06],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil5_6',type:'точечный светильник Ø0.08 встроенный, у дверей комнаты 3 и санузла 9',room:5,layer:'hall',pos:[10.41,9.26],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'mirror',type:'зеркало',room:5,layer:'hall',pos:[6.346,6.05],rot:0,size:[0.025,2.4,0.9],fixed:'wall', // 2026-09-11: скруглённые углы и косой блик — прямоугольник без них Gemini принимает за дверь или картину
     build(b,g){ b.phys(0,0.025,0.15,2.40,0,0.9);
       const plate=(w,h,r,x,t,y0,z0,m)=>{ const o=new THREE.Mesh(new THREE.ExtrudeGeometry(b.rrect(w,h,r),{depth:t,bevelEnabled:false,curveSegments:16}).rotateY(Math.PI/2).translate(x,y0,z0+w),m); g.add(o); return o; }; // shape x → world −z, extrusion → world +x
       plate(0.90,2.25,0.09,0.010,0.010,0.15,0,mat.frame); plate(0.88,2.23,0.08,0.020,0.005,0.16,0.01,mat.mirror);  // backing board from the wallpaper plane, 5 mm glass in front (M3)
       [[0.26,0.45],[0.09,0.63]].forEach(([w,z])=>{ const gl=new THREE.Mesh(new THREE.PlaneGeometry(w,1.60),mat.gloss); gl.rotation.set(0,Math.PI/2,14*Math.PI/180); gl.position.set(0.0255,1.28,z); g.add(gl); }); }}, // две косые полосы блика под 14°: габарит подобран так, чтобы углы не вылезли за стекло
    {id:'pouf',type:'пуфик',room:5,layer:'hall',pos:[6.396,6.75],rot:0,size:[0.4,0.45,0.6],glb:'models/pouf.glb',
     build(b){ /* proxy = pre-detail AABBs (realism-all A) */ b.phys(0,0.4,0.12,0.45,0,0.6); b.phys(0.03,0.06,0,0.12,0.03,0.06); b.phys(0.34,0.37,0,0.12,0.03,0.06); b.phys(0.03,0.06,0,0.12,0.54,0.57); b.phys(0.34,0.37,0,0.12,0.54,0.57); b(0,0.4,0.12,0.45,0,0.6,mat.pouf); [[0.03,0.03],[0.34,0.03],[0.03,0.54],[0.34,0.54]].forEach(([x,z])=>b(x,x+0.03,0,0.12,z,z+0.03,mat.frame)); }},
    // ---- laundry 7 ----
    {id:'washer',type:'стиральная и сушильная машины колонной',room:7,layer:'laundry',pos:[7.05,2.43],rot:0,size:[0.6,1.72,0.6],fixed:'wall',coat:{plastic:'plastic',paint:'whiteEnamel'}, /* M4-3: control panel and white enamel body; glass door and chrome stay class twins */glb:'models/washer.glb',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all A) */ b.phys(0,0.6,0,0.85,0,0.6); b.phys(0.06,0.54,0.135,0.615,0.6,0.62); b.phys(0.05,0.55,0.73,0.81,0.6,0.61); b.phys(0,0.6,0.87,1.72,0,0.6); b.phys(0.06,0.54,1.005,1.485,0.6,0.62); b.phys(0.05,0.55,1.6,1.68,0.6,0.61);
       [[0,0.85],[0.87,1.72]].forEach(([y0,y1])=>{
         b(0,0.6,y0,y1,0,0.6,mat.wbody);
         const d=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.02,32),mat.wdoor); d.rotation.x=Math.PI/2; d.position.set(0.3,(y0+y1)/2-0.05,0.61); g.add(d);
         b(0.05,0.55,y1-0.12,y1-0.04,0.6,0.61,mat.wpanel);
       });
     }},
    {id:'ceil7_1',type:'точечный светильник Ø0.08 встроенный, постирочная, площадка перед машинами, 4000 K',room:7,layer:'laundry',pos:[7.46,3.41],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    // ---- kids room 1 (tasks/room1-kid/README.md, marks M1–M30) ----
    // Room box: x 0.896–5.445, z 1.874–4.864. Wall-mounted boxes sit 0.02–0.03 in front of the wall so they show over the wallpaper (0.015).
    {id:'kidbed',type:'кровать-чердак с лестницей-комодом и полкой хранения',room:1,layer:'kid',pos:[2.835,1.884],rot:0,size:[2.6,2.6,2.97],coat:BED,fixed:'wall',build:kidBedBuild(2.0,mat.wdoor,mat.cushion)},
    {id:'kiddesk',type:'стол прямой 1.94 × 0.80 вдоль южной стены, от западной стены до стойки кровати; стеллаж у окна стоит на его западном краю, столешница нависает над лежанкой на 0.20',room:1,layer:'kid',pos:[0.896,4.064],rot:0,size:[1.939,0.72,0.80],coat:CAB,fixed:'wall',
     build(b){ [[0,1.939,0.68,0.72,0,0.80],[0.02,0.04,0,0.68,0.22,0.78]].forEach(q=>b.phys(...q)); // proxy = mesh AABBs; 0.80 deep since 2026-09-09
       b.round(0,1.939,0.68,0.72,0,0.80,0.003,mat.kbody);                                          // worktop 0.04 с фаской 3 мм, одной плитой: 2026-09-12 убраны узкий выступ за стойкой кровати и торцевая щека
       b(0.02,0.04,0,0.68,0.22,0.78,mat.kbody);                                                    // west end panel starts behind the window seat (z 0.22), the pedestal carries the east end
       b(0.04,1.919,0.60,0.68,0.75,0.78,mat.kbody); }},                                            // apron along the wall
    {id:'kidped',type:'тумба с 3 ящиками под столом у самого восточного края, глубина 0.40 — не упирается в стойку кровати; фасады к комнате',room:1,layer:'kid',pos:[2.415,4.364],rot:0,size:[0.42,0.68,0.40],coat:CAB,
     build(b,g){ b.phys(0.02,0.40,0,0.68,0.02,0.40); [0.06,0.26,0.46].forEach(y=>b.phys(0.02,0.40,y,y+0.18,0,0.02)); // proxy = today's AABBs
       b(0.02,0.40,0.04,0.68,0.02,0.40,mat.kbody); [[0.05,0.05],[0.35,0.05],[0.05,0.35],[0.35,0.35]].forEach(([x,z])=>{ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.02,12).rotateX(Math.PI/2).translate(x,0.02,z),mat.knob); g.add(c); }); // body on 4 casters Ø40
       [0.045,0.245,0.445].forEach(y=>{ b(0.023,0.397,y,y+0.197,0,0.02,mat.wdoor); b(0.03,0.39,y+0.16,y+0.175,0.005,0.02,mat.dark); }); }}, // fronts with 3 mm gaps, finger groove instead of a handle (the chair sits right beside, handles would leave size)
    {id:'kidchair',type:'рабочее кресло, регулируемое, лицом к столу, сиденье на 0.30 под столешницей 0.80, 0.13 от лежанки',room:1,layer:'kid',pos:[1.59,4.37],rot:270,size:[0.55,0.85,0.55],coat:KID_CHAIR,glb:'models/kidchair.glb',
     build(b,g){
       [[0.05,0.50,0.42,0.47,0.05,0.50],[0.50,0.55,0.47,0.85,0.08,0.47],[0.25,0.30,0.03,0.42,0.25,0.30],[0.03,0.52,0,0.03,0.26,0.29],[0.26,0.29,0,0.03,0.03,0.52]].forEach(q=>b.phys(...q)); // proxy = today's AABBs (seat, back, lift, base)
       b(0.05,0.50,0.42,0.47,0.05,0.50,mat.cushion); b(0.50,0.55,0.47,0.85,0.08,0.47,mat.cushion);   // seat and back; rot 270 puts the back on the north side
       const c=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.39,10),mat.knob); c.position.set(0.275,0.225,0.275); g.add(c); // gas lift
       b(0.03,0.52,0,0.03,0.26,0.29,mat.knob); b(0.26,0.29,0,0.03,0.03,0.52,mat.knob);                // base cross
     }},
    {id:'kidshelf',type:'стеллаж узкий в северо-западном углу, фасадом к двери; 0.50 вдоль стены — на 0.10 уже, чтобы открыть окно; глубина 0.60 заподлицо с лежанкой',room:1,layer:'kid',pos:[0.896,2.374],rot:270,size:[0.50,2.70,0.60],coat:CAB,fixed:'wall',
     build(b){
       const W=0.50, D=0.57, t=0.02; // carcass 0.57 + fronts to 0.60: flush with the window seat (user, 2026-09-08)
       [[0,W,0,t,0,D],[0,W,2.68,2.7,0,D],[0,W,t,2.68,0,t],[0,t,t,2.68,t,D],[W-t,W,t,2.68,t,D],[0.023,0.477,0.023,0.877,D,D+0.018],[0.245,0.255,0.78,0.86,D+0.018,D+0.03],[0.023,0.477,2.003,2.677,D,D+0.018],[0.245,0.255,2.05,2.13,D+0.018,D+0.03]].forEach(q=>b.phys(...q)); [0.90,1.27,1.63,2.00].forEach(y=>b.phys(t,W-t,y-t,y,t,D)); // proxy = today's AABBs
       const p=0.018, bk=0.006;                                                                       // 18 mm panels, 6 mm back
       b(0,W,0,p,bk,D,mat.kbody); b(0,W,2.7-p,2.7,bk,D,mat.kbody); b(0,W,0,2.7,0,bk,mat.wpanel);        // bottom, top, oak back
       b(0,p,p,2.7-p,bk,D,mat.kbody); b(W-p,W,p,2.7-p,bk,D,mat.kbody);                                  // sides
       [0.90,1.27,1.63,2.00].forEach(y=>b(p,W-p,y-p,y,bk,D,mat.kbody));                                 // shelves: closed 0–0.9, open cells 0.9–2.0, attic 2.0–2.7
       b(p+0.003,W-p-0.003,p+0.003,0.90-p-0.003,D,D+0.018,mat.wpanel); b(W/2-0.005,W/2+0.005,0.78,0.86,D+0.018,D+0.03,mat.knob);   // lower door, 3 mm gaps, knob bar ≤ size
       b(p+0.003,W-p-0.003,2.0+0.003,2.7-p-0.003,D,D+0.018,mat.wpanel); b(W/2-0.005,W/2+0.005,2.05,2.13,D+0.018,D+0.03,mat.knob); // attic door
     }},
    {id:'kidshelf2',type:'стеллаж узкий с открытыми полками в юго-западном углу, от стола до потолка; 0.50 вдоль стены; глубина 0.60 заподлицо с лежанкой',room:1,layer:'kid',pos:[0.896,4.864],rot:270,size:[0.50,2.70,0.60],coat:CAB,fixed:'wall',
     build(b){
       const W=0.50, D=0.60, t=0.02, Y0=0.72; // 0.60 deep like the north tower and the window seat (user, 2026-09-08); it stands on the desk end
       [[0,W,Y0,Y0+t,0,D],[0,W,2.68,2.7,0,D],[0,W,Y0+t,2.68,0,t],[0,t,Y0+t,2.68,t,D],[W-t,W,Y0+t,2.68,t,D]].forEach(q=>b.phys(...q)); [1.20,1.70,2.20].forEach(y=>b.phys(t,W-t,y-t,y,t,D)); // proxy = today's AABBs
       const p=0.018, bk=0.006;                                                                   // 18 mm panels, 6 mm back
       b(0,W,Y0,Y0+p,bk,D,mat.kbody); b(0,W,2.7-p,2.7,bk,D,mat.kbody); b(0,W,Y0,2.7,0,bk,mat.wpanel); // bottom on the desk, top, oak back
       b(0,p,Y0+p,2.7-p,bk,D,mat.kbody); b(W-p,W,Y0+p,2.7-p,bk,D,mat.kbody);                        // sides
       [1.20,1.70,2.20].forEach(y=>b(p,W-p,y-p,y,bk,D,mat.kbody));                                  // 4 open cells
     }},
    {id:'kidshelf3',type:'полка над окном между стеллажами, одна открытая ячейка 1.99; глубина 0.60 в линию со стеллажами',room:1,layer:'kid',pos:[0.896,2.374],rot:0,size:[0.60,2.70,1.99],coat:CAB,fixed:'wall',
     build(b){ b.phys(0,0.60,2.30,2.32,0,1.99); b.phys(0,0.60,2.68,2.70,0,1.99); b.phys(0,0.02,2.32,2.68,0,1.99); // proxy = today's AABBs
       b(0.006,0.60,2.30,2.318,0,1.99,mat.kbody); b(0.006,0.60,2.682,2.70,0,1.99,mat.kbody); b(0,0.006,2.30,2.70,0,1.99,mat.wpanel); b(0.58,0.60,2.318,2.34,0,1.99,mat.kbody); }}, // 18 mm shelves, 6 mm back, front lip
    {id:'windowseat1',type:'лежанка у окна между стеллажами с решёткой радиатора и матрасиком, 1.89 × 0.60 (как в комнате 2)',room:1,layer:'kid',pos:[0.896,2.374],rot:0,size:[0.60,0.65,1.89],coat:BED,fixed:'wall',glb:'models/windowseat1.glb',
     build(b){ const L=1.89, D=0.60;
       [[0.02,0.55,0,0.05,0.05,L-0.05],[0,0.58,0.05,0.45,0,L],[0,0.58,0.45,0.53,0.02,L-0.02],[0.10,0.50,0.53,0.65,0.05,0.35],[0.10,0.50,0.53,0.65,L-0.35,L-0.05],[0.58,0.60,0.06,0.44,0.01,L-0.01]].forEach(q=>b.phys(...q)); // proxy = today's AABBs
       b(0.02,0.55,0,0.05,0.05,L-0.05,mat.dark); b(0,0.58,0.05,0.45,0,L,mat.body);
       airGrille(b,0.58,0.60,0.06,0.44,0.01,L-0.01,mat.wdoor);                                                               // front grille east: air from the radiator under the sill
       b(0,0.58,0.45,0.53,0.02,L-0.02,mat.kmat); [0.05,L-0.35].forEach(z=>b(0.10,0.50,0.53,0.65,z,z+0.30,mat.pillow)); }},   // mattress and two pillows at the shelf units // bottom, top, oak back over the window lintel
    {id:'kidsofa',type:'диванчик в нише под кроватью',room:1,layer:'kid',pos:[4.65,2.05],rot:0,size:[0.75,0.80,1.60],coat:{fabric:'sofaWeave'},glb:'models/kidsofa.glb',
     build(b){
       [[0,0.75,0.10,0.45,0,1.60],[0.60,0.75,0.45,0.80,0,1.60],[0,0.60,0.45,0.60,0,0.15],[0,0.60,0.45,0.60,1.45,1.60]].forEach(q=>b.phys(...q)); [[0.03,0.03],[0.69,0.03],[0.03,1.54],[0.69,1.54]].forEach(([x,z])=>b.phys(x,x+0.03,0,0.10,z,z+0.03)); // proxy = today's AABBs
       b(0,0.75,0.10,0.45,0,1.60,mat.sofa); b(0.60,0.75,0.45,0.80,0,1.60,mat.sofa);            // seat and back to the east wall
       b(0,0.60,0.45,0.60,0,0.15,mat.sofa); b(0,0.60,0.45,0.60,1.45,1.60,mat.sofa);              // armrests
       [[0.03,0.03],[0.69,0.03],[0.03,1.54],[0.69,1.54]].forEach(([x,z])=>b(x,x+0.03,0,0.10,z,z+0.03,mat.knob)); // legs
     }},
    {id:'kidrug',type:'ковёр моющийся',room:1,layer:'kid',pos:[2.15,2.60],rot:0,size:[1.60,0.01,1.70],coat:{wpanel:'rugPile'},
     build(b,g){ b.phys(0,1.6,0,0.01,0,1.7); g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(b.rrect(1.598,1.698,0.029),{depth:0.006,bevelThickness:0.001,bevelSize:0.001,bevelSegments:1,curveSegments:6}).rotateX(Math.PI/2).translate(0.001,0.007,0.001),mat.wpanel)); }}, // 8 mm rug, corners r 30, 1 mm bound edge
    {id:'projector',type:'проектор короткофокусный на потолке (throw ≈0.57, экран M13)',room:1,layer:'kid',pos:[2.15,3.235],rot:0,size:[0.30,2.70,0.25],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0,0.30,2.44,2.56,0,0.25); b.phys(0.02,0.06,2.47,2.53,-0.005,0); b.phys(0.13,0.17,2.56,2.70,0.105,0.145); // proxy = today's AABBs (body, lens, bracket)
       b.round(0,0.30,2.44,2.56,0,0.25,0.01,mat.plastic); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.006,20).rotateX(Math.PI/2).translate(0.045,2.50,0.003),mat.glass)); // body r 10, lens on the north face
       g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.14,10).translate(0.15,2.63,0.125),mat.frame)); b(0.10,0.20,2.69,2.70,0.075,0.175,mat.frame); }}, // ceiling bracket Ø24 with a plate
    {id:'screen',type:'кассета моторизованного экрана 1.70×0.96 под полкой (свёрнут)',room:1,layer:'kid',pos:[0.99,2.474],rot:0,size:[0.12,2.30,1.79],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0,0.12,2.18,2.30,0,1.79); b.phys(0.03,0.09,2.17,2.18,0.05,1.74); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.79,20).rotateX(Math.PI/2).translate(0.06,2.24,0.895),mat.plastic)); [0.005,1.785].forEach(z=>g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.056,0.056,0.01,20).rotateX(Math.PI/2).translate(0.06,2.24,z),mat.plastic))); // cassette Ø100 with end caps
       b(0.03,0.09,2.17,2.185,0.05,1.74,mat.frame); }},   // weighted bottom bar; ponytail: canvas not modelled, add a toggle when the cinema view is needed
    {id:'reveal1',type:'откосы окна: верх и боковины проёма от рамы до плоскости стены, без подоконника',room:1,layer:'kid',pos:[0.685,2.47],rot:0,size:[0.211,2.30,1.80],coat:{body:'whiteEnamel'},fixed:'wall',inWall:true, // lives in the wall thickness: room-bounds checks skip it
     build(b){ b(0,0.211,2.29,2.30,0,1.80,mat.body); b(0,0.211,0.55,2.30,0,0.012,mat.body); b(0,0.211,0.55,2.30,1.80-0.012,1.80,mat.body); }},
    {id:'curtain',type:'карниз с тюлем (блэкаут в проёме окна)',room:1,layer:'kid',pos:[0.911,2.474],rot:0,size:[0.05,2.30,1.79],coat:{tulle:'curtainLinen'},fixed:'wall',
     build(b,g){ b.phys(0.01,0.04,2.27,2.30,0,1.79); b.phys(0.015,0.025,0.75,2.26,0.05,1.74); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.01,1.79,12).rotateX(Math.PI/2).translate(0.025,2.285,0.895),mat.frame)); [0.05,0.895,1.74].forEach(z=>b(0,0.025,2.28,2.29,z-0.01,z+0.01,mat.frame)); // rod Ø20 on three brackets
       const pl=new THREE.PlaneGeometry(1.69,1.51,80,1).rotateY(Math.PI/2).translate(0,1.505,0.895), pp=pl.attributes.position; for(let i=0;i<pp.count;i++) pp.setX(i,0.025+0.018*Math.sin(pp.getZ(i)*2*Math.PI/0.14)); pl.computeVertexNormals(); g.add(new THREE.Mesh(pl,mat.tulle)); }}, // tulle 0.75–2.26 in 0.14 m waves
    {id:'kidlight',type:'потолочный светильник Ø0.50, 3000 K, диммер',room:1,layer:'kid',pos:[2.45,3.25],rot:0,size:[0.50,2.70,0.50],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0,0.50,2.66,2.70,0,0.50); g.add(new THREE.Mesh(new THREE.LatheGeometry([[0,2.70],[0.25,2.70],[0.25,2.675],[0.235,2.66],[0.21,2.66],[0.21,2.665],[0,2.665]].map(([r,y])=>new THREE.Vector2(r,y)),32).translate(0.25,0,0.25),mat.plastic)); g.add(new THREE.Mesh(new THREE.CircleGeometry(0.21,32).rotateX(Math.PI/2).translate(0.25,2.664,0.25),mat.led)); }}, // plafond Ø0.50 (lathe) with the emitter disc
    {id:'track',type:'трек с 2 спотами на галерейную стену',room:1,layer:'kid',pos:[1.90,4.22],rot:0,size:[2.20,2.70,0.06],fixed:'wall',
     build(b,g){ b.phys(0,2.2,2.67,2.70,0.015,0.045); [0.6,1.6].forEach(x=>b.phys(x,x+0.06,2.55,2.67,0,0.06)); b(0,2.2,2.67,2.70,0.015,0.045,mat.frame); [0.6,1.6].forEach(x=>{ g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.02,8).translate(x+0.03,2.66,0.03),mat.frame)); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.10,20).translate(x+0.03,2.60,0.03),mat.frame)); g.add(new THREE.Mesh(new THREE.CircleGeometry(0.025,20).rotateX(Math.PI/2).translate(x+0.03,2.549,0.03),mat.led)); }); }}, // track profile, two spots Ø60 on stems
    {id:'ceil1_1',type:'точечный светильник Ø0.08 встроенный, над столом (западная половина), 3000 K',room:1,layer:'kid',pos:[1.46,4.41],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'bra1',type:'бра над диванчиком, поворотное',room:1,layer:'kid',pos:[5.20,2.79],rot:0,size:[0.245,1.35,0.16],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0.195,0.215,1.20,1.30,0.03,0.13); b.phys(0.10,0.195,1.245,1.255,0.075,0.085); b.phys(0.02,0.14,1.19,1.31,0.02,0.14); b.round(0.20,0.215,1.20,1.30,0.03,0.13,0.004,mat.frame); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.12,10).rotateZ(Math.PI/2).translate(0.14,1.25,0.08),mat.frame)); // wall plate, arm Ø12
       g.add(new THREE.Mesh(new THREE.LatheGeometry([[0,1.31],[0.055,1.31],[0.065,1.29],[0.065,1.20],[0.06,1.20],[0.06,1.29],[0.05,1.30],[0,1.30]].map(([r,y])=>new THREE.Vector2(r,y)),24).translate(0.08,0,0.08),mat.plastic)); g.add(new THREE.Mesh(new THREE.CircleGeometry(0.05,24).rotateX(Math.PI/2).translate(0.08,1.205,0.08),mat.led)); }}, // shade (lathe) with the lamp disc
    {id:'bra2',type:'бра для чтения над изголовьем, плоское',room:1,layer:'kid',pos:[5.28,2.37],rot:0,size:[0.165,2.36,0.20],coat:PLASTIC,fixed:'wall',
     build(b){ b.phys(0.135,0.145,2.24,2.36,0,0.20); b.phys(0.02,0.135,2.27,2.33,0.02,0.18); b.round(0.135,0.145,2.24,2.36,0,0.20,0.004,mat.frame); b.round(0.02,0.135,2.27,2.33,0.02,0.18,0.01,mat.plastic); b(0.03,0.12,2.266,2.27,0.04,0.16,mat.led); }}, // wall plate, flat head r 10, emitter strip underneath
    {id:'sw1',type:'выключатель 2 клавиши: общий свет M15 + трек M16',room:1,layer:'kid',pos:[5.415,3.89],rot:0,size:[0.01,0.99,0.08],coat:PLASTIC,fixed:'wall',
     build(b){ b.plate(0,0.01,0.91,0.99,0,0.08,mat.plastic,{keys:2}); }},
    // sockets: flat boxes 0.08 × 0.08 × 0.01 on the wall, purpose in the caption; all with shutters
    {id:'sock1',type:'розетки 2+2 USB у стола, южный торец',room:1,layer:'kid',pos:[1.16,4.834],rot:0,size:[0.08,0.94,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.86,0.94,0,0.01,mat.plastic,{keys:2}); }},
    {id:'sock2',type:'розетки 2+2 USB у стола, восточный торец',room:1,layer:'kid',pos:[2.06,4.834],rot:0,size:[0.08,0.94,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.86,0.94,0,0.01,mat.plastic,{keys:2}); }},
    {id:'sock3',type:'розетка + USB в нише под кроватью, вывод HDMI от проектора',room:1,layer:'kid',pos:[5.415,3.69],rot:0,size:[0.01,0.44,0.08],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.01,0.36,0.44,0,0.08); }},
    {id:'sock4',type:'розетка у изголовья кровати (ночник, телефон)',room:1,layer:'kid',pos:[4.66,1.894],rot:0,size:[0.08,2.09,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,2.01,2.09,0,0.01); }},
    {id:'sock5',type:'розетка общего назначения (пылесос, увлажнитель), восточнее стойки кровати',room:1,layer:'kid',pos:[2.96,4.834],rot:0,size:[0.08,0.34,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.26,0.34,0,0.01); }},
    {id:'sock6',type:'розетка в потолке для проектора',room:1,layer:'kid',pos:[2.26,3.51],rot:0,size:[0.08,2.70,0.08],coat:PLASTIC,fixed:'wall',build(b){ b.phys(0,0.08,2.69,2.70,0,0.08); b.round(0,0.08,2.69,2.70,0,0.08,0.001,mat.plastic); b(0.012,0.068,2.6885,2.6905,0.012,0.068,mat.dark); }},
    {id:'sock7',type:'розетка в потолке для мотора экрана',room:1,layer:'kid',pos:[1.06,2.11],rot:0,size:[0.08,2.70,0.08],coat:PLASTIC,fixed:'wall',build(b){ b.phys(0,0.08,2.69,2.70,0,0.08); b.round(0,0.08,2.69,2.70,0,0.08,0.001,mat.plastic); b(0.012,0.068,2.6885,2.6905,0.012,0.068,mat.dark); }},
    // ---- kids room 2 (tasks/room2-kid/README.md, marks M1–M22; grey materials only) ----
    // Room box: x 11.067–14.774, z 6.518–9.614 (the 95 mm jog of the south wall east of x 13.477 was removed 2026-09-08 by the user). Door on the west wall z 6.75–7.65.
    {id:'kidbed2',type:'кровать-чердак с лестницей-комодом, платформа 1.85, полка над дверью',room:2,layer:'kid2',pos:[13.467,9.614],rot:180,size:[2.4,2.6,2.97],coat:BED,fixed:'wall',build:kidBedBuild(1.85,mat.wdoor,mat.cushion,0.24)}, // M12 LED is part of the bed; tread 0.24 keeps the stairs west of the niche (x 13.477)
    {id:'kiddesk2',type:'письменный стол под платформой, 1.65 × 0.75',room:2,layer:'kid2',pos:[11.067,7.85],rot:0,size:[0.75,0.72,1.65],coat:CAB,fixed:'wall',
     build(b){ b.phys(0,0.75,0.69,0.72,0,1.65); b.phys(0.02,0.73,0,0.69,0,0.02); b.phys(0.02,0.73,0,0.69,1.63,1.65); b.phys(0,0.05,0.62,0.69,0.02,1.63); // proxy = pre-detail mesh AABBs (realism-all C1)
       b.round(0,0.75,0.69,0.72,0,1.65,0.003,mat.body); [0,1.63].forEach(z=>b.round(0.02,0.73,0,0.69,z,z+0.02,0.002,mat.body));            // top with 3 mm chamfer on side panels
       b(0,0.05,0.62,0.64,0.02,1.63,mat.dark); b(0,0.05,0.67,0.69,0.02,1.63,mat.dark); b(0,0.01,0.64,0.67,0.02,1.63,mat.dark);              // cable channel: open slot towards the room
       [0.40,1.20].forEach(z=>{ b(0.01,0.30,0.66,0.69,z,z+0.03,mat.frame); b(0.01,0.04,0.40,0.66,z,z+0.03,mat.frame); }); }}, // top, side panels, cable channel at the wall
    {id:'kidchair2',type:'рабочее кресло детское, регулируемое',room:2,layer:'kid2',pos:[11.75,8.40],rot:0,size:[0.55,0.85,0.55],coat:KID_CHAIR,glb:'models/kidchair.glb',
     build(b,g){ b.phys(0.05,0.5,0.42,0.47,0.05,0.5); b.phys(0.5,0.55,0.47,0.85,0.08,0.47); b.phys(0.2512,0.2988,0.03,0.42,0.25,0.3); b.phys(0.03,0.52,0,0.03,0.26,0.29); b.phys(0.26,0.29,0,0.03,0.03,0.52); // proxy = pre-detail mesh AABBs (realism-all C1)
       b(0.05,0.50,0.42,0.47,0.05,0.50,mat.cushion); b(0.50,0.55,0.47,0.85,0.08,0.47,mat.cushion);
       const c=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.39,10),mat.knob); c.position.set(0.275,0.225,0.275); g.add(c);
       b(0.03,0.52,0,0.03,0.26,0.29,mat.knob); b(0.26,0.29,0,0.03,0.03,0.52,mat.knob); }},
    {id:'deskshelf2',type:'полка над столом под платформой',room:2,layer:'kid2',pos:[11.087,7.90],rot:0,size:[0.22,1.28,1.55],coat:CAB,fixed:'wall',
     build(b){ b.phys(0,0.22,1.25,1.28,0,1.55); [0.05,1.48].forEach(z=>b.phys(0,0.02,1.13,1.25,z,z+0.02)); // proxy = pre-detail mesh AABBs (realism-all C1)
       b.round(0,0.22,1.262,1.28,0,1.55,0.002,mat.body); b(0.205,0.22,1.24,1.262,0,1.55,mat.body);                                        // 18 mm shelf with a drop edge in front
       [0.05,1.48].forEach(z=>{ b(0,0.20,1.242,1.262,z,z+0.02,mat.frame); b(0,0.02,1.13,1.242,z,z+0.02,mat.frame); }); }},
    {id:'tower2n',type:'стеллаж-башня северная: низ шкаф со штангой, верх открытые ячейки',room:2,layer:'kid2',pos:[14.174,6.518],rot:0,size:[0.60,2.70,0.68],coat:CAB,fixed:'wall',
     build(b,g){ b.phys(0,0.6,0,0.02,0,0.68); b.phys(0,0.6,2.68,2.7,0,0.68); b.phys(0.58,0.6,0.02,2.68,0,0.68); b.phys(0.02,0.58,0.02,2.68,0,0.02); b.phys(0.02,0.58,0.02,2.68,0.66,0.68); [1.50,1.90,2.30].forEach(y=>b.phys(0.02,0.58,y-0.02,y,0.02,0.66)); b.phys(0,0.02,0.023,1.477,0.023,0.657); b.phys(-0.015,0,0.75,0.95,0.33,0.35); // proxy = pre-detail mesh AABBs (realism-all C1)
       const t=0.02, D=0.68;
       b(0,0.6,0,t,0,D,mat.body); b(0,0.6,2.7-t,2.7,0,D,mat.body); b(0.58,0.6,t,2.7-t,0,D,mat.body); b(0.02,0.58,t,2.7-t,0,t,mat.body); b(0.02,0.58,t,2.7-t,D-t,D,mat.body); // box, back at the east wall
       [1.50,1.90,2.30].forEach(y=>b(t,0.58,y-t,y,t,D-t,mat.body));                                  // shelves: closed 0–1.5, 3 open rows above
       b.round(0,t,0.023,1.477,0.023,D-0.023,0.001,mat.wdoor); b(0,0.003,0.75,0.95,D-0.044,D-0.024,mat.frame); // wardrobe door with 3 mm gaps, flush pull profile at the opening edge
       g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0125,0.0125,D-2*t-0.02,12).rotateX(Math.PI/2).translate(0.30,1.40,D/2),mat.handle)); }},
    {id:'tower2s',type:'стеллаж-башня южная: 2 ящика, открытые ячейки',room:2,layer:'kid2',pos:[14.174,8.90],rot:0,size:[0.60,2.70,0.619],coat:CAB,fixed:'wall',
     build(b){ b.phys(0,0.6,0,0.02,0,0.619); b.phys(0,0.6,2.68,2.7,0,0.619); b.phys(0.58,0.6,0.02,2.68,0,0.619); b.phys(0.02,0.58,0.02,2.68,0,0.02); b.phys(0.02,0.58,0.02,2.68,0.599,0.619); [0.90,1.35,1.80,2.25].forEach(y=>b.phys(0.02,0.58,y-0.02,y,0.02,0.599)); [0.03,0.46].forEach(y=>{ b.phys(0,0.02,y,y+0.41,0.023,0.596); b.phys(-0.015,0,y+0.2,y+0.22,0.2345,0.3845); }); // proxy = pre-detail mesh AABBs (realism-all C1)
       const t=0.02, D=0.619;
       b(0,0.6,0,t,0,D,mat.body); b(0,0.6,2.7-t,2.7,0,D,mat.body); b(0.58,0.6,t,2.7-t,0,D,mat.body); b(0.02,0.58,t,2.7-t,0,t,mat.body); b(0.02,0.58,t,2.7-t,D-t,D,mat.body);
       [0.90,1.35,1.80,2.25].forEach(y=>b(t,0.58,y-t,y,t,D-t,mat.body));                              // 4 open rows above the drawers
       [0.023,0.4515].forEach(y=>{ b.round(0,t,y,y+0.4255,0.023,D-0.023,0.001,mat.wdoor); b(0,0.003,y+0.395,y+0.415,D/2-0.10,D/2+0.10,mat.frame); }); }},
    {id:'windowseat2',type:'лежанка у окна с решёткой радиатора и матрасиком, 1.70 × 0.60',room:2,layer:'kid2',pos:[14.174,7.198],rot:0,size:[0.60,0.65,1.702],coat:BED,fixed:'wall',glb:'models/windowseat2.glb', // model by tools/models/windowseat2.js; the build below is proxy and fallback
     build(b){ b.phys(0.05,0.58,0,0.05,0.05,1.65); b.phys(0.02,0.6,0.05,0.45,0,1.702); b.phys(0,0.02,0.06,0.44,0.01,1.692); b.phys(0.02,0.6,0.45,0.53,0.02,1.682); [0.05,1.35].forEach(z=>b.phys(0.1,0.5,0.53,0.65,z,z+0.3)); // proxy = pre-detail mesh AABBs (realism-all C1)
       b(0.05,0.58,0,0.05,0.05,1.65,mat.dark); b(0.02,0.60,0.05,0.45,0,1.702,mat.body);
       airGrille(b,0,0.02,0.06,0.44,0.01,1.692,mat.wdoor);                                                                   // front grille west: air from the radiator under the sill
       b(0.02,0.60,0.45,0.53,0.02,1.682,mat.kmat); [0.05,1.35].forEach(z=>b(0.10,0.50,0.53,0.65,z,z+0.30,mat.pillow)); }},   // mattress and two pillows at the towers
    {id:'gymwall',type:'шведская стенка 0.80, в распор пол–потолок, 12 перекладин',room:2,layer:'kid2',pos:[12.55,6.538],rot:0,size:[0.80,2.70,0.15],coat:{table:'oakFurniture'},fixed:'wall',
     build(b,g){ b.phys(0,0.04,0,2.7,0.06,0.12); b.phys(0.76,0.8,0,2.7,0.06,0.12); for(let y=0.30;y<=2.50+1e-6;y+=0.20) b.phys(0.02,0.78,y-0.0175,y+0.0175,0.0725,0.1075); // proxy = pre-detail mesh AABBs (realism-all C1)
       [0,0.76].forEach(x=>{ b.round(x,x+0.04,0.02,2.68,0.06,0.12,0.004,mat.table); b(x-0.0,x+0.04,0,0.02,0.03,0.14,mat.frame); b(x,x+0.04,2.68,2.70,0.03,0.14,mat.frame); }); // wooden uprights 40×60 between steel pressure pads
       for(let y=0.30;y<=2.50+1e-6;y+=0.20) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,0.76,14).rotateZ(Math.PI/2).translate(0.40,y,0.09),mat.table)); }},
    {id:'pullup',type:'выносной турник шведской стенки, 2.35',room:2,layer:'kid2',pos:[12.50,6.538],rot:0,size:[0.90,2.36,0.55],fixed:'wall',
     build(b,g){ b.phys(0.02,0.05,2.32,2.36,0.02,0.55); b.phys(0.85,0.88,2.32,2.36,0.02,0.55); b.phys(0,0.9,2.323,2.357,0.513,0.547); // proxy = pre-detail mesh AABBs (realism-all C1)
       const tube=(a,c,r)=>g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(...a),new THREE.Vector3(...c)),1,r,10,false),mat.frame));
       [0.035,0.865].forEach(x=>{ b.round(x-0.03,x+0.03,2.26,2.36,0,0.02,0.003,mat.frame); tube([x,2.34,0.02],[x,2.34,0.53],0.0125); tube([x,2.05,0.02],[x,2.315,0.44],0.0125); }); // wall plates, arms Ø25 with a diagonal strut
       tube([0,2.34,0.53],[0.90,2.34,0.53],0.016); [0.15,0.60].forEach(x=>tube([x,2.34,0.53],[x+0.15,2.34,0.53],0.019)); }},
    {id:'kidrug2',type:'ковёр-мат перед шведской стенкой',room:2,layer:'kid2',pos:[12.30,7.10],rot:0,size:[1.60,0.02,2.00],
     build(b,g){ b.phys(0,1.6,0,0.02,0,2); // proxy = pre-detail mesh AABBs (realism-all C1)
       const W=1.588, D=1.988, r=0.04, sh=new THREE.Shape(); sh.moveTo(r,0); sh.lineTo(W-r,0); sh.absarc(W-r,r,r,-Math.PI/2,0,false); sh.lineTo(W,D-r); sh.absarc(W-r,D-r,r,0,Math.PI/2,false); sh.lineTo(r,D); sh.absarc(r,D-r,r,Math.PI/2,Math.PI,false); sh.lineTo(0,r); sh.absarc(r,r,r,Math.PI,Math.PI*1.5,false); // outline minus the 6 mm bevel
       g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:0.008,bevelThickness:0.006,bevelSize:0.006,bevelSegments:2,curveSegments:6}).rotateX(Math.PI/2).translate(0.006,0.014,0.006),mat.leather)); }},
    {id:'kidlight2',type:'потолочный светильник Ø0.45, диммер',room:2,layer:'kid2',pos:[12.675,7.975],rot:0,size:[0.45,2.70,0.45],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0,0.45,2.66,2.7,0,0.45); // proxy = pre-detail mesh AABBs (realism-all C1)
       lathe(g,[[0,2.662],[0.19,2.664],[0.222,2.68],[0.225,2.70],[0,2.70]],0.225,0.225,mat.plastic);                          // shallow dish flush with the ceiling
       g.add(new THREE.Mesh(new THREE.CircleGeometry(0.16,32).rotateX(Math.PI/2).translate(0.225,2.661,0.225),mat.led)); }},
    {id:'desklamp2',type:'настольная лампа, гибкая штанга',room:2,layer:'kid2',pos:[11.45,9.20],rot:0,size:[0.20,1.20,0.20],coat:PLASTIC,
     build(b,g){ b.phys(0.07,0.13,0.72,0.77,0.07,0.13); b.phys(0.088,0.112,0.77,1.13,0.088,0.112); b.phys(0.02,0.18,1.1,1.2,0.02,0.18); // proxy = pre-detail mesh AABBs (realism-all C1)
       g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.075,0.02,24).translate(0.10,0.73,0.10),mat.plastic));           // weighted base on the desk top
       const neck=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.10,0.74,0.10),new THREE.Vector3(0.10,1.16,0.10),new THREE.Vector3(0.12,1.16,0.12));
       g.add(new THREE.Mesh(new THREE.TubeGeometry(neck,24,0.006,10,false),mat.frame));                                       // gooseneck Ø12
       lathe(g,[[0.075,1.10],[0.08,1.105],[0.03,1.195],[0.02,1.20],[0.012,1.20],[0.012,1.19],[0.07,1.11],[0.065,1.10]],0.12,0.12,mat.plastic); // conical shade, open below
       g.add(new THREE.Mesh(new THREE.CircleGeometry(0.05,24).rotateX(Math.PI/2).translate(0.12,1.108,0.12),mat.led)); }},
    {id:'bra3',type:'бра над лежанкой на торце северной башни, поворотное',room:2,layer:'kid2',pos:[14.394,7.198],rot:0,size:[0.16,1.40,0.245],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0.03,0.13,1.25,1.35,0,0.02); b.phys(0.075,0.085,1.295,1.305,0.02,0.13); b.phys(0.02,0.14,1.24,1.36,0.105,0.225); // proxy = pre-detail mesh AABBs (realism-all C1)
       b.round(0.03,0.13,1.25,1.35,0,0.02,0.005,mat.plastic);                                                                  // wall plate on the tower end
       g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.09,10).rotateX(Math.PI/2).translate(0.08,1.30,0.065),mat.frame)); // swing arm Ø12 to the shade side
       g.add(new THREE.Mesh(new THREE.SphereGeometry(0.012,12,8).translate(0.08,1.30,0.105),mat.frame));                      // pivot on the shade
       lathe(g,[[0.04,1.24],[0.06,1.25],[0.06,1.35],[0.04,1.36],[0.012,1.36],[0.012,1.35],[0.05,1.342],[0.05,1.26],[0.04,1.25]],0.08,0.165,mat.plastic); // cylindrical shade, open below
       g.add(new THREE.Mesh(new THREE.CircleGeometry(0.045,24).rotateX(Math.PI/2).translate(0.08,1.248,0.165),mat.led)); }},
    {id:'bra4',type:'бра для чтения над изголовьем, плоское',room:2,layer:'kid2',pos:[11.59,9.349],rot:0,size:[0.16,2.36,0.245],coat:PLASTIC,fixed:'wall',
     build(b){ b.phys(0.03,0.13,2.24,2.36,0.235,0.245); b.phys(0.02,0.14,2.27,2.33,0.08,0.235); // proxy = pre-detail mesh AABBs (realism-all C1)
       b.round(0.03,0.13,2.24,2.36,0.235,0.245,0.004,mat.plastic); b.round(0.02,0.14,2.27,2.33,0.08,0.235,0.012,mat.plastic); b(0.035,0.125,2.266,2.271,0.09,0.20,mat.led); }},
    {id:'ceil2_1',type:'точечный светильник Ø0.08 встроенный, проход к лежанке между платформой и башнями',room:2,layer:'kid2',pos:[13.81,7.96],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil2_2',type:'точечный светильник Ø0.08 встроенный, входная зона у двери и шведская стенка',room:2,layer:'kid2',pos:[11.66,7.06],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil2_3',type:'мебельный врезной светильник Ø0.08 в плите платформы кровати над столом, 3500 K; едет за кроватью',room:2,layer:'kid2',pos:[11.66,8.56],rot:0,size:[0.08,1.7,0.08],attach:'kidbed2',
     build(b){ b.spot(0.04,0.04,0.04,1.7); }},
    {id:'reveal2',type:'откосы окна: верх и боковины проёма от рамы до плоскости стены, без подоконника',room:2,layer:'kid2',pos:[14.774,7.30],rot:0,size:[0.191,2.30,1.50],coat:{body:'whiteEnamel'},fixed:'wall',inWall:true, // lives in the wall thickness: room-bounds checks skip it
     build(b){ b(0,0.191,2.29,2.30,0,1.50,mat.body); b(0,0.191,0.55,2.30,0,0.012,mat.body); b(0,0.191,0.55,2.30,1.50-0.012,1.50,mat.body); }},
    {id:'blind2',type:'кассета рулонной блэкаут-шторы над окном',room:2,layer:'kid2',pos:[14.694,7.31],rot:0,size:[0.08,2.38,1.48],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0,0.08,2.3,2.38,0,1.48); b.phys(0.02,0.06,2.29,2.3,0.03,1.45); // proxy = pre-detail mesh AABBs (realism-all C1)
       g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.039,0.039,1.44,24).rotateX(Math.PI/2).translate(0.04,2.34,0.74),mat.plastic)); // cassette Ø78
       [0,1.46].forEach(z=>b.round(0,0.08,2.30,2.38,z,z+0.02,0.006,mat.plastic)); b(0.02,0.06,2.29,2.30,0.03,1.45,mat.frame); }},
    {id:'sw2',type:'выключатель у двери, 2 клавиши: общий свет M11 + LED M12',room:2,layer:'kid2',pos:[11.38,6.538],rot:0,size:[0.08,0.99,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.91,0.99,0,0.01,mat.plastic,{keys:2}); }},
    // sockets: flat boxes 0.08 × 0.08 × 0.01 on the wall, purpose in the caption
    {id:'sock9',type:'розетки 2+2 USB над столом',room:2,layer:'kid2',pos:[11.087,8.57],rot:0,size:[0.01,0.94,0.08],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.01,0.86,0.94,0,0.08,mat.plastic,{keys:2}); }},
    {id:'sock10',type:'блок ПК под столом: 3 розетки + RJ-45',room:2,layer:'kid2',pos:[11.087,9.22],rot:0,size:[0.01,0.34,0.08],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.01,0.26,0.34,0,0.08,mat.plastic); }},
    {id:'sock11',type:'розетка у изголовья (ночник)',room:2,layer:'kid2',pos:[11.38,9.584],rot:0,size:[0.08,2.09,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,2.01,2.09,0,0.01,mat.plastic); }},
    {id:'sock12',type:'розетка у лежанки (зарядка)',room:2,layer:'kid2',pos:[13.83,9.584],rot:0,size:[0.08,0.34,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.26,0.34,0,0.01,mat.plastic); }},
    {id:'sock13',type:'розетка у шведской стенки (увлажнитель)',room:2,layer:'kid2',pos:[12.23,6.538],rot:0,size:[0.08,0.34,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.26,0.34,0,0.01,mat.plastic); }},
    // ---- master bedroom 3 (tasks/room3-master/README.md, marks M1–M28; grey materials only) ----
    // Room box: x 10.021–14.76, z 9.777–13.144. Items are built as if against the north wall and turned 180° (rot 180, pos = SE corner): the composition faces north. Wall-mounted boxes sit 0.02–0.03 in front of the wall (wallpaper at 0.015).
    {id:'mbed',type:'кровать 160×200 на деревянном подиуме 2.015 вплотную к стене у окна (вырез под короб радиатора) и до стены с ТВ, матрас до кромки подоконника, два выдвижных ящика со стороны комнаты, мягкое изголовье; верх матраса вровень с подоконником',room:3,layer:'master',pos:[14.76,13.144],rot:180,size:[2.015,1.10,2.82],coat:Object.assign({dark:'oakFurniture'},BED), /* podium in the balcony-jamb oak */ fixed:'wall',glb:'models/mbed.glb', // model by tools/models/mbed.js; the build below is proxy and fallback
     build(b){
       b.phys(0,2.015,0,0.30,0,2.82); b.phys(0.275,1.875,0.30,0.55,0.1,2.1); b.phys(0,2.015,0.30,1.1,0,0.08); [[0.325,1.025],[1.125,1.825]].forEach(([x0,x1])=>b.phys(x0,x1,0.55,0.67,0.15,0.6)); b.phys(0.275,1.925,0.35,0.6,0.85,2.2); // proxy = pre-detail mesh AABBs; drawer fronts (12 mm) sit inside the podium box tolerance
       b(0.18,1.991,0,0.30,0,2.82,mat.dark); b(0,0.18,0,0.30,0,0.894,mat.dark); b(0,0.18,0,0.30,2.494,2.82,mat.dark); [0.70,1.75].forEach(z=>b(1.991,2.015,0.05,0.25,z,z+0.90,mat.dark)); // podium to the east wall (local x 0) with a notch for the radiator cover (x<0.18, z 0.894–2.494), drawers north of the wardrobe
       b(0.275,1.875,0.30,0.55,0.10,2.10,mat.kmat); b(0,2.015,0.30,1.10,0,0.08,mat.cushion);      // mattress ends at the sill edge (x 14.485; top 0.55 + dome = window sill 0.56), headboard wall to wall
       [[0.325,1.025],[1.125,1.825]].forEach(([x0,x1])=>b(x0,x1,0.55,0.67,0.15,0.60,mat.pillow));   // two pillows
       b(0.275,1.925,0.55,0.575,0.85,2.20,mat.cushion); b(1.90,1.925,0.35,0.55,0.85,2.20,mat.cushion); // blanket: thin sheet, drop only down the room side (the sill side is flush)
     }},
    {id:'mcab',type:'блок подвесных ящиков над изголовьем 2.015 (до ниши шкафа): два ряда, секция под кондиционер с решёткой',room:3,layer:'master',pos:[14.76,13.144],rot:180,size:[2.015,2.70,0.35],coat:{cabinetPaint:'oliveFront'},fixed:'wall',
     build(b,g){ const t=0.02, Y0=1.85, Y1=2.28, Y2=2.30, T=2.7, A0=0.40, A1=1.30, W=2.015, H=W/2;                             // rows 1.85–2.28 and 2.30–2.70; AC section x 0.40–1.30 (socket sock16), open below; W runs 0.10 past the bed edge
       b.phys(0,W,T-t,T,0,0.35); b.phys(0,W,Y1,Y2,0,0.35); b.phys(0,A0,Y0,Y0+t,0,0.35); b.phys(A1,W,Y0,Y0+t,0,0.35); b.phys(0,W,Y0,T,0,t); [0,A0,A1,W-t].forEach(x=>b.phys(x,x+t,Y0,T,t,0.35)); b.phys(H-0.01,H+0.01,Y2,T,t,0.35);
       const doors=[[0.003,A0-0.003,Y0+0.003,Y1-0.003],[A1+0.003,W-0.003,Y0+0.003,Y1-0.003],[0.003,H-0.003,Y2+0.003,T-0.003],[H+0.003,W-0.003,Y2+0.003,T-0.003]]; // doors 0.40 and 0.715 beside the AC, two doors above
       doors.forEach(([x0,x1,y0])=>{ b.phys(x0,x1,y0,y0+0.02,0.33,0.35); }); doors.forEach(([x0,x1,y0])=>{ const c=(x0+x1)/2; b.phys(c-0.05,c+0.05,y0,y0+0.02,0.35,0.365); }); b.phys(A0+t,A1-t,Y0+t,Y1-t,0.33,0.35); // proxy = mesh AABBs (realism-all D1)
       b(0,W,T-t,T,0,0.35,mat.body); b(0,W,Y1,Y2,0,0.35,mat.body); b(0,A0,Y0,Y0+t,0,0.35,mat.body); b(A1,W,Y0,Y0+t,0,0.35,mat.body); b(0,W,Y0,T,0,t,mat.body); // top, shelf between the rows, bottoms beside the AC, back
       [0,A0,A1,W-t].forEach(x=>b(x,x+t,Y0,T,t,0.35,mat.body)); b(H-0.01,H+0.01,Y2,T,t,0.35,mat.body);                                                     // section walls, divider of the upper row
       doors.forEach(([x0,x1,y0,y1])=>{ b.round(x0,x1,y0,y1,0.33,0.35,0.001,mat.wdoor); const c=(x0+x1)/2; b(c-0.05,c+0.05,y0,y0+0.02,0.347,0.3505,mat.frame); }); // doors with 3 mm gaps, flush pull profiles along the bottom edge
       for(let y=Y0+0.04;y<Y1-0.03;y+=0.04) g.add(new THREE.Mesh(new THREE.BoxGeometry(A1-A0-2*t,0.012,0.024).rotateX(-35*Math.PI/180).translate((A0+A1)/2,y+0.01,0.336),mat.wdoor)); }}, // louvre grille of the AC section
    {id:'mward',type:'шкаф 1.30 на два отделения для одежды, антресоль 1.40 в линию с блоком над кроватью; ниша-полка со стороны кровати 0.65–1.00, в 0.10 от края кровати',room:3,layer:'master',pos:[12.745,13.144],rot:180,size:[1.40,2.70,0.60],coat:{cabinetPaint:'oliveFront'},fixed:'wall',
     build(b0){ const o=0.10, b=(x0,x1,y0,y1,z0,z1,m)=>b0(x0+o,x1+o,y0,y1,z0,z1,m); b.phys=(x0,x1,y0,y1,z0,z1)=>b0.phys(x0+o,x1+o,y0,y1,z0,z1); b.round=(x0,x1,y0,y1,z0,z1,r,m)=>b0.round(x0+o,x1+o,y0,y1,z0,z1,r,m); // body sits 0.10 from the bed side; the top row runs to x=0 over the wider podium
       const W=1.30, t=0.02, N0=0.65, N1=1.00, NW=0.30, D=0.65, Y1=2.28, Y2=2.30, T=2.7;                                      // niche: height 0.65–1.00, 0.30 deep; divider at 0.65; shelf 2.28–2.30 under the top row
       b.phys(-o,-o+t,Y2,T,0.03,0.58); b.phys(-o,0,Y2,T,0.03,0.05); b(-o,-o+t,Y2,T,0.03,0.58,mat.body); b(-o,0,Y2,T,0.03,0.05,mat.body); // top-row extension: side panel and back
       b.phys(0,t,0,N0,0.03,0.58); b.phys(0,t,N1,T,0.03,0.58); b.phys(W-t,W,0,T,0.03,0.58); b.phys(-o,W,T-t,T,0.03,0.58); b.phys(0,W,0,t,0.03,0.58); b.phys(t,W-t,t,T-t,0.03,0.05); b.phys(D-0.01,D+0.01,t,T-t,0.03,0.58); b.phys(-o+t,W-t,Y1,Y2,0.03,0.58);
       b.phys(0,NW,N0,N0+t,0.03,0.58); b.phys(0,NW,N1-t,N1,0.03,0.58); b.phys(NW-t,NW,N0,N1,0.03,0.58);
       const doors=[[0.02,D-0.0015,0.02,Y1-0.003],[D+0.0015,W-0.02,0.02,Y1-0.003],[0.02-o,D-0.0015,Y2+0.003,T-0.02],[D+0.0015,W-0.02,Y2+0.003,T-0.02]]; // two wardrobe doors 0.63, two top-row doors (the bed-side one 0.10 wider)
       doors.forEach(([x0,x1,y0,y1])=>b.phys(x0,x1,y0,y1,0.58,0.60)); b.phys(D-0.0225,D-0.0025,1.0,1.3,0.6,0.62); b.phys(D+0.0025,D+0.0225,1.0,1.3,0.6,0.62); [0.02-o,D+0.0015].forEach(x0=>b.phys(x0+0.265,x0+0.365,Y2+0.003,Y2+0.023,0.6,0.62)); // proxy = mesh AABBs (realism-all D1)
       b(0,t,0,N0,0.03,0.58,mat.body); b(0,t,N1,T,0.03,0.58,mat.body);                                                         // bed-side panel above and below the niche
       b(W-t,W,0,T,0.03,0.58,mat.body); b(-o,W,T-t,T,0.03,0.58,mat.body); b(0,W,0,t,0.03,0.58,mat.body); b(t,W-t,t,T-t,0.03,0.05,mat.body); // body
       b(D-0.01,D+0.01,t,T-t,0.03,0.58,mat.body); b(-o+t,W-t,Y1,Y2,0.03,0.58,mat.body);                                           // divider between the two hanging compartments, shelf under the top row
       b(0,NW,N0,N0+t,0.03,0.58,mat.body); b(0,NW,N1-t,N1,0.03,0.58,mat.body); b(NW-t,NW,N0,N1,0.03,0.58,mat.body);           // niche shelf, ceiling and back
       doors.forEach(([x0,x1,y0,y1])=>b.round(x0,x1,y0,y1,0.58,0.60,0.001,mat.wdoor));                                          // doors, 3 mm gaps
       b(D-0.0225,D-0.0025,1.0,1.3,0.5975,0.6005,mat.frame); b(D+0.0025,D+0.0225,1.0,1.3,0.5975,0.6005,mat.frame);            // vertical pull profiles at the meeting edge
       [0.02-o,D+0.0015].forEach(x0=>b(x0+0.265,x0+0.365,Y2+0.003,Y2+0.023,0.5975,0.6005,mat.frame)); }},                       // top-row pulls along the bottom edge
    {id:'mtv',type:'телевизор 43" напротив изножья, центр на оси кровати, низ 1.22 (без консоли)',room:3,layer:'master',pos:[14.395,9.847],rot:180,size:[0.97,1.78,0.04],fixed:'wall',
     build(b){ b.phys(0,0.97,1.22,1.78,0,0.04); b.phys(0.02,0.95,1.24,1.76,0,0.005); // proxy = pre-detail mesh AABBs (realism-all D1)
       b.round(0,0.97,1.22,1.78,0.012,0.032,0.002,mat.dark); b(0.008,0.962,1.228,1.772,0.009,0.012,mat.screen); // slim panel with an 8 mm bezel, screen 3 mm proud towards the room (−z)
       b(0.25,0.72,1.22,1.232,0.006,0.02,mat.frame); b(0.3,0.67,1.35,1.65,0.032,0.04,mat.frame); }},
    {id:'vanity',type:'туалетный столик подвесной с рифлёным фасадом 1.00 и вторым ящиком ниже со стороны кровати',room:3,layer:'master',pos:[12.72,10.227],rot:180,size:[1.30,0.75,0.45],coat:CAB,fixed:'wall',
     build(b,g){ const flute=(x0,x1,y0,y1,z0)=>{ const sh=new THREE.Shape(), P=0.03, W=0.02, d=0.015, t=0.005; sh.moveTo(x0,0); for(let x=x0;x+W<=x1+1e-6;x+=P){ sh.lineTo(x,t); sh.lineTo(x,t+d); sh.lineTo(x+W,t+d); sh.lineTo(x+W,t); } sh.lineTo(x1,t); sh.lineTo(x1,0); sh.lineTo(x0,0); // comb profile in x–z: slats 0.02 on a 0.03 pitch, 15 mm proud of a 5 mm plate
         b.phys(x0,x1,y0,y1,z0,z0+t+d); g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:y1-y0,bevelEnabled:false}).rotateX(Math.PI/2).translate(0,y1,z0),mat.wdoor)); }; // one mesh per fluted front
       b.phys(0.30,1.30,0.58,0.73,0.05,0.45); b.phys(0.29,1.30,0.73,0.75,0.04,0.45); b.phys(0,0.60,0.38,0.55,0.05,0.45); b.phys(0,0.61,0.55,0.57,0.04,0.45); // proxy = mesh AABBs (realism-all D1); the fronts add theirs in flute()
       b(0.30,1.30,0.58,0.73,0.05,0.45,mat.body); b.round(0.29,1.30,0.73,0.75,0.04,0.45,0.003,mat.body); flute(0.31,1.29,0.585,0.725,0.03);   // console 1.00 on the wall, top 0.02 with 3 mm chamfer, fluted drawer front
       b(0,0.60,0.38,0.55,0.05,0.45,mat.body); b.round(0,0.61,0.55,0.57,0.04,0.45,0.003,mat.body); flute(0.01,0.59,0.385,0.545,0.03); }},     // second drawer 0.60 lower, offset 0.30 towards the bed
    {id:'vmirror',type:'зеркало круглое Ø1.10 с LED-подсветкой сзади, над столиком; низ 0.85',room:3,layer:'master',pos:[12.49,9.827],rot:180,size:[1.14,1.97,0.03],fixed:'wall',
     build(b,g){ b.phys(0,1.14,0.83,1.97,0.02,0.03); b.phys(0.02,1.12,0.85,1.95,0.009,0.03); b.phys(0.03,1.11,0.86,1.94,0.004,0.009); // proxy = mesh AABBs; size includes the 2 cm halo
       const disc=(d,x,y,z,t,m)=>{ const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(b.rrect(d,d,d/2),{depth:t,bevelEnabled:false,curveSegments:48}),m); mesh.position.set(x,y,z); g.add(mesh); }; // rrect with r = d/2 is a circle
       disc(1.14,0,0.83,0.02,0.01,mat.led); disc(1.10,0.02,0.85,0.009,0.021,mat.frame); disc(1.08,0.03,0.86,0.004,0.005,mat.mirror); }}, // 2026-09-12: радиус 55 см, центр на прежней высоте 1.40 // LED halo on the wall (emitter of g3.vanity via led9), metal backing, 5 mm glass facing the room
    {id:'vpouf',type:'пуфик у туалетного столика',room:3,layer:'master',pos:[12.02,10.681],rot:180,size:[0.40,0.45,0.40],glb:'models/vpouf.glb', // model by tools/models/vpouf.js
     build(b){ b.phys(0,0.4,0.35,0.45,0,0.4); [[0.03,0.03],[0.34,0.03],[0.03,0.34],[0.34,0.34]].forEach(([x,z])=>b.phys(x,x+0.03,0,0.35,z,z+0.03)); // proxy = pre-detail mesh AABBs (realism-all D1)
       b(0,0.4,0.35,0.45,0,0.4,mat.cushion); [[0.03,0.03],[0.34,0.03],[0.03,0.34],[0.34,0.34]].forEach(([x,z])=>b(x,x+0.03,0,0.35,z,z+0.03,mat.frame)); }},
    {id:'lmirror',type:'большое зеркало 0.65×1.95 в тонкой тёмной раме на южной стене между дверью санузла и шкафом (низ 0.02, в створе двери санузла 8)',room:3,layer:'master',pos:[11.33,13.124],rot:180,size:[0.65,1.97,0.03],fixed:'wall',
     build(b){ b.phys(0,0.65,0.02,1.97,0,0.03); b.round(0,0.65,0.02,1.97,0.005,0.025,0.003,mat.dark); b.round(0.02,0.63,0.04,1.95,0.025,0.03,0.002,mat.mirror); }}, // flat on the wall: the bath 8 door leaf swings along this wall
    {id:'mrug',type:'ковёр, короткий ворс',room:3,layer:'master',pos:[14.0,12.321],rot:180,size:[2.00,0.01,2.00],coat:{cushion:'rugPile'},
     build(b,g){ b.phys(0,2,0,0.01,0,2); // proxy = pre-detail mesh AABBs (realism-all D1)
       g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(b.rrect(1.998,1.998,0.04),{depth:0.006,bevelThickness:0.001,bevelSize:0.001,bevelSegments:1,curveSegments:6}).rotateX(Math.PI/2).translate(0.001,0.007,0.001),mat.cushion)); }},
    {id:'reveal3',type:'откосы окна: верх и боковины проёма от рамы до плоскости стены, без подоконника',room:3,layer:'master',pos:[14.76,10.35],rot:0,size:[0.205,2.30,2.20],coat:{body:'whiteEnamel'},fixed:'wall',inWall:true, // lives in the wall thickness: room-bounds checks skip it
     build(b){ b(0,0.205,2.29,2.30,0,2.20,mat.body); b(0,0.205,0.55,2.30,0,0.012,mat.body); b(0,0.205,0.55,2.30,2.20-0.012,2.20,mat.body); }},
    {id:'mcurtain',type:'потолочный карниз по восточной стене, шторы собраны у краёв',room:3,layer:'master',pos:[14.7,12.794],rot:180,size:[0.10,2.68,3.017],coat:{drape:'curtainLinen'},fixed:'wall',
     build(b,g){ b.phys(0.02,0.05,2.65,2.68,0,3.017); b.phys(0.02,0.08,1.15,2.64,0,0.15); b.phys(0.02,0.08,0.02,2.64,2.867,3.017); // proxy = pre-detail mesh AABBs (realism-all D1)
       b(0.02,0.05,2.65,2.68,0,3.017,mat.frame);                                                                        // ceiling track
       const fold=(z0,y0,y1)=>{ const pl=new THREE.PlaneGeometry(0.15,y1-y0,48,1).rotateY(Math.PI/2).translate(0,(y0+y1)/2,z0+0.075), p=pl.attributes.position; for(let i=0;i<p.count;i++) p.setX(i,0.05+0.028*Math.sin((p.getZ(i)-z0)*2*Math.PI/0.0167)); pl.computeVertexNormals(); g.add(new THREE.Mesh(pl,mat.drape)); };
       fold(0,1.15,2.64); fold(2.867,0.02,2.64); }}, // rail starts after the cabinet; north bundle hemmed above the headboard
    {id:'ceil3_1',type:'точечный светильник Ø0.08 встроенный, вход, пол у двери',room:3,layer:'master',pos:[10.76,10.56],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil3_2',type:'точечный светильник Ø0.08 встроенный, зона перед туалетным столиком',room:3,layer:'master',pos:[12.16,10.56],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil3_3',type:'точечный светильник Ø0.08 встроенный, юго-западный угол, ковёр',room:3,layer:'master',pos:[10.76,12.16],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'ceil3_4',type:'точечный светильник Ø0.08 встроенный, фасады шкафа и край кровати',room:3,layer:'master',pos:[12.16,12.16],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'bra5',type:'бра для чтения, западная сторона кровати',room:3,layer:'master',pos:[13.275,13.124],rot:180,size:[0.16,1.50,0.245],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0.03,0.13,1.3499999999999999,1.45,0,0.02); b.phys(0.075,0.085,1.395,1.4049999999999998,0.02,0.13); b.phys(0.02,0.14,1.3399999999999999,1.46,0.105,0.225); // proxy = pre-detail mesh AABBs (realism-all D1)
       b.round(0.03,0.13,1.3499999999999999,1.45,0,0.02,0.005,mat.plastic); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.09,10).rotateX(Math.PI/2).translate(0.08,1.4,0.065),mat.frame)); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.012,12,8).translate(0.08,1.4,0.105),mat.frame)); // plate, swing arm Ø12, pivot
       lathe(g,[[0.04,1.3399999999999999],[0.06,1.3499999999999999],[0.06,1.45],[0.04,1.46],[0.012,1.46],[0.012,1.45],[0.05,1.442],[0.05,1.3599999999999999],[0.04,1.3499999999999999]],0.08,0.165,mat.plastic); g.add(new THREE.Mesh(new THREE.CircleGeometry(0.045,24).rotateX(Math.PI/2).translate(0.08,1.3479999999999999,0.165),mat.led)); }},
    {id:'bra6',type:'бра для чтения, восточная сторона кровати',room:3,layer:'master',pos:[14.275,13.124],rot:180,size:[0.16,1.50,0.245],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0.03,0.13,1.3499999999999999,1.45,0,0.02); b.phys(0.075,0.085,1.395,1.4049999999999998,0.02,0.13); b.phys(0.02,0.14,1.3399999999999999,1.46,0.105,0.225); // proxy = pre-detail mesh AABBs (realism-all D1)
       b.round(0.03,0.13,1.3499999999999999,1.45,0,0.02,0.005,mat.plastic); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.09,10).rotateX(Math.PI/2).translate(0.08,1.4,0.065),mat.frame)); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.012,12,8).translate(0.08,1.4,0.105),mat.frame)); // plate, swing arm Ø12, pivot
       lathe(g,[[0.04,1.3399999999999999],[0.06,1.3499999999999999],[0.06,1.45],[0.04,1.46],[0.012,1.46],[0.012,1.45],[0.05,1.442],[0.05,1.3599999999999999],[0.04,1.3499999999999999]],0.08,0.165,mat.plastic); g.add(new THREE.Mesh(new THREE.CircleGeometry(0.045,24).rotateX(Math.PI/2).translate(0.08,1.3479999999999999,0.165),mat.led)); }},
    {id:'led4',type:'LED-лента под блоком ящиков, свет на изголовье',room:3,layer:'master',pos:[14.72,12.814],rot:180,size:[1.935,1.85,0.02],fixed:'wall',
     build(b){ b.led(0,1.935,1.84,1.85,0,0.02); }},
    {id:'led5',type:'LED-подсветка по нижней кромке ТВ',room:3,layer:'master',pos:[14.37,9.837],rot:180,size:[0.92,1.07,0.01],fixed:'wall',
     build(b){ b.led(0,0.92,1.06,1.07,0,0.01); }},
    {id:'sw3',type:'выключатель у двери, 2 клавиши: общий свет M13 + бра/LED',room:3,layer:'master',pos:[10.051,10.921],rot:180,size:[0.01,0.99,0.08],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.01,0.91,0.99,0,0.08,mat.plastic,{keys:2}); }},
    {id:'sw4',type:'проходной выключатель у кровати, 2 клавиши (над изголовьем)',room:3,layer:'master',pos:[13.205,13.124],rot:180,size:[0.08,1.24,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,1.16,1.24,0,0.01,mat.plastic,{keys:2}); }},
    // sockets: flat boxes 0.08 × 0.08 × 0.01 on the wall, purpose in the caption
    {id:'sock14',type:'розетки 2+2 USB у западного края изголовья (над изголовьем 1.10)',room:3,layer:'master',pos:[13.065,13.124],rot:180,size:[0.08,1.24,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,1.16,1.24,0,0.01,mat.plastic,{keys:2}); }},
    {id:'sock15',type:'розетка + USB у восточного края изголовья (над изголовьем 1.10)',room:3,layer:'master',pos:[14.385,13.124],rot:180,size:[0.08,1.24,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,1.16,1.24,0,0.01,mat.plastic); }},
    {id:'sock16',type:'розетка для кондиционера внутри секции (центр блока над кроватью)',room:3,layer:'master',pos:[13.91,13.124],rot:180,size:[0.08,2.18,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,2.10,2.18,0,0.01,mat.plastic); }},
    {id:'sock17',type:'медиаблок за телевизором (2 розетки + ТВ/RJ-45 + HDMI)',room:3,layer:'master',pos:[13.95,9.807],rot:180,size:[0.08,1.34,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,1.26,1.34,0,0.01,mat.plastic,{keys:2}); }},
    {id:'sock18',type:'розетки у консоли',room:3,layer:'master',pos:[13.95,9.807],rot:180,size:[0.08,0.39,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.31,0.39,0,0.01,mat.plastic); }},
    {id:'sock19',type:'розетки + USB у туалетного столика (фен, плойка)',room:3,layer:'master',pos:[12.62,9.807],rot:180,size:[0.08,0.94,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.86,0.94,0,0.01,mat.plastic,{keys:2}); }},
    {id:'sock20',type:'розетка общего назначения (увлажнитель, пылесос)',room:3,layer:'master',pos:[10.66,13.124],rot:180,size:[0.08,0.34,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.26,0.34,0,0.01,mat.plastic); }},
    // ---- bathroom 9 (tasks/bath9/README.md, marks M1–M18 mirrored across the door axis z 8.997; grey materials only) ----
    // Room box: x 8.172–9.872, z 8.122–9.872, door on the east wall z 8.55–9.25. Basin, mirror and towel rail on the north side,
    // cistern box and toilet on the south. Tiles follow PLAN.baths (north face at z 8.181, west at x 8.222, others wall+0.02), so wall-mounted parts start in front of them.
    // The passage strip x 8.872–9.872 × z 8.55–9.25 stays empty except the tub, which ends it (free depth ≥ 0.80, check.js).
    {id:'tub',type:'ванна акриловая каплевидная 1.60 вдоль западной стены: северный торец 0.45, выпуклая кромка расширяется к южному торцу 0.99 у короба и унитаза',room:9,layer:'bath',pos:[8.172,8.147],rot:0,size:[0.99,0.58,1.60],glb:'models/tub.glb',fixed:'wall',
     build(b,g){
       const L=1.60, W=0.05;
       // outer edge width from the wall: one monotone parabola 0.45 → 0.99, widest at the south end by the toilet (convex outline,
       // no humps); ≈0.895 at the passage strip edge, so the tub is the end of the passage (check.js: free depth to the tub ≥ 0.80)
       const wo=z=>0.45+0.5497*z-0.1326*z*z;
       const wi=z=>wo(z)-W;
       // one extruded polygon per z-slice between xl(z) and xr(z), lifted to y0..y1; slice edges at the strip edge and the
       // peak keep per-part boxes tight (walk collisions and the checks use per-part boxes)
       const slice=(z0,z1,xl,xr,y0,y1,m)=>{ const sh=new THREE.Shape(), n=8, zs=i=>z0+(z1-z0)*i/n;
         sh.moveTo(xl(z0),-z0); for(let i=0;i<=n;i++) sh.lineTo(xr(zs(i)),-zs(i)); for(let i=n;i>=0;i--) sh.lineTo(xl(zs(i)),-zs(i));
         const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:y1-y0,bevelEnabled:false}),m); mesh.rotation.x=-Math.PI/2; mesh.position.y=y0; g.add(mesh); };
       const edges=[0,0.403,1.103,1.30,1.45,L];
       for(let i=0;i<edges.length-1;i++){ const [z0,z1]=[edges[i],edges[i+1]]; b.phys(0,wo(z1),0,0.58,z0,z1);
         slice(z0,z1,wi,wo,0.12,0.58,mat.kmat);                                                       // curved shell wall
         slice(z0,z1,()=>W+0.01,wi,0.12,0.15,mat.kmat);                                               // bottom at 0.12
         slice(z0,z1,()=>0,wo,0,0.12,mat.body); }                                                    // blind apron under the rim
       b(0,W+0.01,0.12,0.58,0,L,mat.kmat); // wall side 1 cm thicker: its inner face must not share the tile plane at x0+0.05 b(W,wi(0),0.12,0.58,0,W,mat.kmat); b(W,wi(L),0.12,0.58,L-W,L,mat.kmat); // wall side and the two straight ends
       const d=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.005,16),mat.handle); d.position.set(0.25,0.152,1.45); g.add(d); // drain at the south end, by the mixer
     }},
    {id:'tubmixer',type:'смеситель ванны настенный, излив 0.20',room:9,layer:'bath',pos:[8.192,9.124],rot:0,size:[0.20,0.86,0.20],fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.05,0.75,0.85,0.02,0.18); b.phys(0.05,0.2,0.78,0.8,0.09,0.11); b.phys(0.05,0.1,0.85,0.86,0.09,0.11);
       const v=(x,y,z)=>new THREE.Vector3(x,y,z), cyl=(r,h,x,y,z,m,rot)=>{ const c=new THREE.CylinderGeometry(r,r,h,16); if(rot==='x') c.rotateZ(Math.PI/2); if(rot==='z') c.rotateX(Math.PI/2); g.add(new THREE.Mesh(c.translate(x,y,z),m)); };
       b.round(0,0.05,0.75,0.85,0.02,0.18,0.005,mat.handle); cyl(0.006,0.04,0.075,0.84,0.10,mat.handle);        // wall body and lever
       g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v(0.045,0.79,0.10),v(0.13,0.79,0.10),v(0.165,0.785,0.10),v(0.185,0.765,0.10)]),12,0.011,10),mat.handle)); // spout
     }}, // body, spout, lever
    {id:'shower',type:'душевая штанга 0.90 с лейкой, шланг к смесителю',room:9,layer:'bath',pos:[8.192,9.374],rot:0,size:[0.10,2.05,0.10],fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0.03,0.05,1.15,2.05,0.04,0.06); b.phys(0,0.03,1.15,1.18,0.03,0.07); b.phys(0,0.03,2.02,2.05,0.03,0.07); b.phys(0.03,0.1,1.98,2.02,0.02,0.08);
       const v=(x,y,z)=>new THREE.Vector3(x,y,z), cyl=(r,h,x,y,z,m,rot)=>{ const c=new THREE.CylinderGeometry(r,r,h,16); if(rot==='x') c.rotateZ(Math.PI/2); if(rot==='z') c.rotateX(Math.PI/2); g.add(new THREE.Mesh(c.translate(x,y,z),m)); };
       cyl(0.01,0.90,0.04,1.60,0.05,mat.handle); [1.165,2.035].forEach(y=>cyl(0.012,0.04,0.02,y,0.05,mat.handle,'x')); // rod and holders
       cyl(0.012,0.18,0.07,1.92,0.05,mat.handle); cyl(0.03,0.015,0.07,2.03,0.05,mat.handle);                          // hand shower on the top holder
     }}, // rod, two holders, hand shower on the top holder
    {id:'wcbox',type:'короб инсталляции 0.71×0.12 за унитазом, от торца ванны до восточной стены, верх 1.15 — полка; кнопка смыва на фасаде',room:9,layer:'bath',pos:[9.162,9.747],rot:0,size:[0.71,1.15,0.125],coat:{body:'tile6060',plastic:'plastic'}, /* M4-4: box tiled like the walls, flush plate plastic */ fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.71,0,1.15,0.005,0.125); b.phys(0.28,0.44,0.96,1.04,0,0.005);
       b.round(0,0.71,0,1.15,0.005,0.125,0.001,mat.body); b.round(0.28,0.44,0.96,1.04,0.001,0.005,0.001,mat.plastic); [[0.30,0.355],[0.365,0.42]].forEach(([x0,x1])=>b(x0,x1,0.98,1.02,0,0.0015,mat.dark)); // box, flush plate, two buttons proud of it
     }},                 // box, flush plate on the toilet axis (x 9.52)
    {id:'wc',type:'унитаз подвесной компактный 0.36×0.48, сиденье 0.42, фасад на север',room:9,layer:'bath',pos:[9.34,9.272],rot:0,size:[0.36,0.42,0.48],coat:{plastic:'plastic'},fixed:'wall',glb:'models/wc.glb',glbFacade:false,
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0.02,0.34,0.2,0.4,0.16,0.48); b.phys(0.02,0.34,0.2,0.4,0,0.32); b.phys(0.03,0.33,0.4,0.42,0.16,0.46); b.phys(0.03,0.33,0.4,0.42,0.01,0.31);
       const cyl=(r,h,y,m)=>{ const c=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),m); c.position.set(0.18,y,0.16); g.add(c); };
       b(0.02,0.34,0.20,0.40,0.16,0.48,mat.kmat); cyl(0.16,0.20,0.30,mat.kmat);                     // bowl: box at the back, round front to z 0
       b(0.03,0.33,0.40,0.42,0.16,0.46,mat.lamp); cyl(0.15,0.02,0.41,mat.lamp);                     // seat
     }},
    {id:'basin',type:'раковина подвесная 0.85×0.36 вдоль северной стены, чаша 0.60×0.30 глубиной 0.10',room:9,layer:'bath',pos:[8.90,8.181],rot:0,size:[0.85,0.85,0.36],fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.85,0.7,0.75,0,0.36); b.phys(0,0.125,0.75,0.85,0,0.36); b.phys(0.725,0.85,0.75,0.85,0,0.36); b.phys(0.125,0.725,0.75,0.85,0,0.03); b.phys(0.125,0.725,0.75,0.85,0.33,0.36); b.phys(0.4,0.45,0.75,0.754,0.155,0.205);
       const v=(x,y,z)=>new THREE.Vector3(x,y,z), cyl=(r,h,x,y,z,m,rot)=>{ const c=new THREE.CylinderGeometry(r,r,h,16); if(rot==='x') c.rotateZ(Math.PI/2); if(rot==='z') c.rotateX(Math.PI/2); g.add(new THREE.Mesh(c.translate(x,y,z),m)); };
       const sh=b.rrect(0.85,0.36,0.02); sh.holes.push(new THREE.Path(b.rrect(0.60,0.30,0.06).getPoints(6).map(q=>new THREE.Vector2(q.x+0.125,q.y+0.03)))); // slab outline with the bowl cut-out
       g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:0.13,bevelThickness:0.01,bevelSize:0.01,bevelOffset:-0.01,bevelSegments:2,curveSegments:4}).rotateX(Math.PI/2).translate(0,0.84,0),mat.ceramic)); // ceramic body 0.70–0.85, rounded edges
       b(0.125,0.725,0.75,0.76,0.03,0.33,mat.ceramic); cyl(0.025,0.004,0.425,0.762,0.18,mat.handle);              // bowl floor at 0.75 and the drain
     }},
    {id:'basindrawer',type:'ящик под раковиной 0.85×0.31×0.18, подвесной, push-to-open',room:9,layer:'bath',pos:[8.90,8.181],rot:0,size:[0.85,0.68,0.31],coat:{body:'cabinetPaint',wdoor:'cabinetPaint'},fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.85,0.5,0.68,0,0.29); b.phys(0.005,0.845,0.505,0.675,0.29,0.31);
       b(0,0.85,0.5,0.68,0,0.29,mat.body); b.round(0.0015,0.8485,0.5015,0.6785,0.29,0.31,0.001,mat.wdoor); // carcass, push-to-open front with 3 mm gaps
     }},            // body, front to the south
    {id:'bathmirror',type:'зеркало 0.96×1.20 прямоугольное со скруглёнными углами, LED-контур сзади; низ 1.10 — над корпусом смесителя',room:9,layer:'bath',pos:[8.795,8.185],rot:0,size:[0.96,2.30,0.02],fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.96,1.1,2.3,0,0.01); b.phys(0.01,0.95,1.11,2.29,0.01,0.02);
       const rr=(w,h,r)=>{ const s=new THREE.Shape(); s.moveTo(r,0); s.lineTo(w-r,0); s.quadraticCurveTo(w,0,w,r); s.lineTo(w,h-r); s.quadraticCurveTo(w,h,w-r,h); s.lineTo(r,h); s.quadraticCurveTo(0,h,0,h-r); s.lineTo(0,r); s.quadraticCurveTo(0,0,r,0); return s; };
       const plate=(w,h,r,x,y,z,m)=>{ const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(rr(w,h,r),{depth:0.01,bevelEnabled:false}),m); mesh.position.set(x,y,z); g.add(mesh); };
       plate(0.96,1.20,0.07,0,1.10,0,mat.mirrorLed); plate(0.94,1.18,0.06,0.01,1.11,0.01,mat.mirror); // LED halo behind (own emitter, group g9.mirror), glass in front (faces south)
     }},
    {id:'towelrail',type:'полотенцесушитель электрический 0.40×1.80 на простенке севернее двери, низ 0.45',room:9,layer:'bath',pos:[9.77,8.13],rot:0,size:[0.10,2.25,0.40],fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0.03,0.06,0.45,2.25,0.03,0.06); b.phys(0.03,0.06,0.45,2.25,0.34,0.37); b.phys(0.035,0.055,0.55,0.57,0.06,0.34); b.phys(0.035,0.055,0.65,0.67,0.06,0.34); b.phys(0.035,0.055,0.75,0.77,0.06,0.34); b.phys(0.035,0.055,0.85,0.87,0.06,0.34); b.phys(0.035,0.055,0.95,0.97,0.06,0.34); b.phys(0.035,0.055,1.05,1.07,0.06,0.34); b.phys(0.035,0.055,1.15,1.17,0.06,0.34); b.phys(0.035,0.055,1.25,1.27,0.06,0.34); b.phys(0.035,0.055,1.35,1.37,0.06,0.34); b.phys(0.035,0.055,1.45,1.47,0.06,0.34); b.phys(0.035,0.055,1.55,1.57,0.06,0.34); b.phys(0.035,0.055,1.65,1.67,0.06,0.34); b.phys(0.035,0.055,1.75,1.77,0.06,0.34); b.phys(0.035,0.055,1.85,1.87,0.06,0.34); b.phys(0.035,0.055,1.95,1.97,0.06,0.34); b.phys(0.035,0.055,2.05,2.07,0.06,0.34); b.phys(0.035,0.055,2.15,2.17,0.06,0.34); b.phys(0.06,0.1,0.55,0.58,0.03,0.06); b.phys(0.06,0.1,0.55,0.58,0.34,0.37); b.phys(0.06,0.1,1.1,1.13,0.03,0.06); b.phys(0.06,0.1,1.1,1.13,0.34,0.37); b.phys(0.06,0.1,1.6,1.63,0.03,0.06); b.phys(0.06,0.1,1.6,1.63,0.34,0.37); b.phys(0.06,0.1,2.15,2.18,0.03,0.06); b.phys(0.06,0.1,2.15,2.18,0.34,0.37);
       const v=(x,y,z)=>new THREE.Vector3(x,y,z), cyl=(r,h,x,y,z,m,rot)=>{ const c=new THREE.CylinderGeometry(r,r,h,16); if(rot==='x') c.rotateZ(Math.PI/2); if(rot==='z') c.rotateX(Math.PI/2); g.add(new THREE.Mesh(c.translate(x,y,z),m)); };
       [0.045,0.355].forEach(z=>cyl(0.015,1.80,0.045,1.35,z,mat.handle));                                        // two vertical collectors Ø30
       for(let y=0.55;y<2.2;y+=0.10) cyl(0.01,0.28,0.045,y+0.01,0.20,mat.handle,'z');                            // rungs Ø20 every 0.10
       [0.55,1.10,1.60,2.15].forEach(y=>[0.045,0.355].forEach(z=>cyl(0.012,0.04,0.08,y+0.015,z,mat.handle,'x'))); // wall brackets
     }},
    {id:'basinmixer',type:'смеситель раковины настенный, излив 0.18; ось чаши x 9.325',room:9,layer:'bath',pos:[9.275,8.185],rot:0,size:[0.14,1.09,0.20],fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.1,1,1.09,0,0.02); b.phys(0.04,0.06,1.035,1.055,0.02,0.18); b.phys(0.1,0.14,1.04,1.05,0,0.02);
       const v=(x,y,z)=>new THREE.Vector3(x,y,z), cyl=(r,h,x,y,z,m,rot)=>{ const c=new THREE.CylinderGeometry(r,r,h,16); if(rot==='x') c.rotateZ(Math.PI/2); if(rot==='z') c.rotateX(Math.PI/2); g.add(new THREE.Mesh(c.translate(x,y,z),m)); };
       b.round(0,0.10,1.00,1.09,0,0.02,0.003,mat.handle); cyl(0.006,0.05,0.115,1.045,0.012,mat.handle,'x');    // wall body and lever
       g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v(0.05,1.045,0.015),v(0.05,1.045,0.12),v(0.05,1.04,0.16),v(0.05,1.015,0.185)]),12,0.011,10),mat.handle)); // spout
     }}, // body, spout, lever
    // ceiling: three IP44 spots Ø0.08 and the extractor fan Ø0.12 above the cistern box
    {id:'spot1',type:'точечный светильник над ванной, IP44',room:9,layer:'bath',pos:[8.48,8.96],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'spot2',type:'точечный светильник над унитазом',room:9,layer:'bath',pos:[9.48,9.40],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'spot3',type:'точечный светильник перед зеркалом',room:9,layer:'bath',pos:[9.28,8.65],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'fan',type:'вентилятор вытяжки Ø0.12 в потолке над коробом',room:9,layer:'bath',pos:[9.31,9.58],rot:0,size:[0.12,2.70,0.12],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0,0.12,2.68,2.7,0,0.12); g.add(new THREE.Mesh(new THREE.TorusGeometry(0.055,0.005,8,24).rotateX(Math.PI/2).translate(0.06,2.695,0.06),mat.plastic)); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.004,24).translate(0.06,2.694,0.06),mat.dark)); [-0.03,-0.01,0.01,0.03].forEach(dx=>b(0.06+dx-0.003,0.06+dx+0.003,2.686,2.692,0.02,0.10,mat.plastic)); }}, // rim, dark intake, four grille bars
    // electrics: flat boxes 0.08 × 0.08 × 0.01
    {id:'sock21',type:'розетка IP44 + USB на фасаде короба инсталляции, h 1.00',room:9,layer:'bath',pos:[9.68,9.737],rot:0,size:[0.08,1.04,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.96,1.04,0,0.01,mat.plastic); }},
    {id:'sock22',type:'скрытый вывод для полотенцесушителя, h 0.45',room:9,layer:'bath',pos:[9.842,8.294],rot:0,size:[0.01,0.49,0.08],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.01,0.41,0.49,0,0.08,mat.plastic); }},
    {id:'sw5',type:'выключатель 2 клавиши в коридоре у двери санузла: свет + вытяжка; рядом терморегулятор тёплого пола',room:5,layer:'bath',pos:[10.038,8.414],rot:0,size:[0.01,0.99,0.08],fixed:'wall',coat:PLASTIC,build(b){ b.plate(0,0.01,0.91,0.99,0,0.08,mat.plastic,{keys:2}); }},
    // ---- bathroom 8 (tasks/bath8/README.md, marks M1–M21; grey materials only) ----
    // Room box: x 8.192–9.872, z 11.588–13.144 plus the bump x 9.098–9.872, z 11.384–11.588 (closed by wcbox8). Door on the east
    // wall z 12.20–13.00. The shower runs along the whole west wall (opposite the door); no basin in this room (iteration 2). Tiles follow PLAN.baths[1]: west at x 8.235, south at z 13.124, east at x 9.852; the north wall west
    // of the bump has no tile (z 11.588). The passage strip x 9.10–9.872 × z 12.20–13.00 must stay empty (check.js).
    // Shower floor: the real tray is 0.02 below the finished floor, but floor layers (0.001–0.009) would hide a mesh below 0,
    // so the tray is a darker plate at 0.010 — it reads as a different surface and never flickers with the floor.
    {id:'shower8',type:'душевая зона в уровень пола 0.81×1.54 вдоль западной стены, поддон из плитки на −0.02 с уклоном к трапу',room:8,layer:'bath2',pos:[8.235,11.588],rot:0,size:[0.813,0.01,1.536],coat:{top:'tile6060'},fixed:'wall',
     build(b){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.813,0.007,0.01,0,1.536); b(0,0.813,0.007,0.010,0,1.536,mat.top); }},
    {id:'drain8',type:'линейный трап 1.40×0.06 вдоль западной стены',room:8,layer:'bath2',pos:[8.25,11.65],rot:0,size:[0.06,0.012,1.40],fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.06,0.01,0.012,0,1.4);
       b(0,0.06,0.010,0.011,0,1.40,mat.frame); b(0.005,0.055,0.010,0.0112,0.005,1.395,mat.dark); for(let z=0.02;z<1.38;z+=0.07) b(0.005,0.055,0.0112,0.012,z,z+0.035,mat.handle); // frame, dark slot, grille bars
     }},
    {id:'curb8e',type:'бортик душа 0.05×0.05 по восточной кромке на всю длину; вход в душ с юга (z 12.45–13.12) переступается',room:8,layer:'bath2',pos:[9.048,11.588],rot:0,size:[0.05,0.05,1.536],coat:{top:'tile6060'},
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.05,0,0.05,0,1.536);
       b.round(0,0.05,0,0.05,0,1.536,0.005,mat.top); // tiled curb with softened edges
     }},
    {id:'glass8',type:'неподвижное стекло душа 0.86×2.05 на бортике со стороны унитаза (z 11.59–12.45)',room:8,layer:'bath2',pos:[9.088,11.588],rot:0,size:[0.01,2.10,0.862],
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.01,0.05,0.07,0,0.862); b.phys(0,0.01,0.07,2.1,0,0.862);
       b(0,0.01,0.05,0.07,0,0.862,mat.frame); b(0.001,0.009,0.07,2.10,0,0.862,mat.glass); b(0,0.01,2.08,2.10,0,0.862,mat.frame); // bottom profile, 8 mm glass, top clamp profile
     }},                     // profile, glass
    {id:'rain8',type:'верхний душ Ø0.25 заподлицо с потолком, над закрытой частью душа',room:8,layer:'bath2',pos:[8.52,11.95],rot:0,size:[0.25,2.70,0.25],fixed:'wall',
     build(b,g){ b.phys(0,0.25,2.68,2.7,0,0.25); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.125,0.125,0.008,40).translate(0.125,2.696,0.125),mat.handle)); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.105,0.105,0.004,40).translate(0.125,2.69,0.125),mat.frame)); g.add(new THREE.Mesh(new THREE.TorusGeometry(0.115,0.004,8,40).rotateX(Math.PI/2).translate(0.125,2.69,0.125),mat.handle)); }}, // chrome plate, dark nozzle field, rim
    {id:'mixer8',type:'термостат душа h 1.10 и ручная лейка h 1.60 в накладном коробе 0.08 (южная стена наружная); восточнее полки',room:8,layer:'bath2',pos:[8.90,13.044],rot:0,size:[0.15,1.70,0.08],coat:{body:'tile6060'},fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0.035,0.115,0.9,1.7,0.02,0.08); b.phys(0,0.15,1.06,1.14,0,0.02); b.phys(0.055,0.095,1.58,1.62,0,0.02); b.phys(0.065,0.085,1.38,1.62,-0.01,0);
       const v=(x,y,z)=>new THREE.Vector3(x,y,z), cyl=(r,h,x,y,z,m,rot)=>{ const c=new THREE.CylinderGeometry(r,r,h,16); if(rot==='x') c.rotateZ(Math.PI/2); if(rot==='z') c.rotateX(Math.PI/2); g.add(new THREE.Mesh(c.translate(x,y,z),m)); };
       b.round(0.035,0.115,0.9,1.7,0.02,0.08,0.005,mat.body);                                                   // surface-mounted pipe cover
       cyl(0.02,0.15,0.075,1.10,0.025,mat.handle,'x'); [0.03,0.12].forEach(x=>cyl(0.024,0.03,x,1.10,0.025,mat.handle,'x')); // thermostat bar with two knobs
       cyl(0.012,0.02,0.075,1.60,0.01,mat.handle,'z'); cyl(0.012,0.20,0.075,1.48,0.014,mat.handle); cyl(0.03,0.012,0.075,1.615,0.02,mat.handle,'z'); // holder, handset handle and head
     }}, // pipe cover, thermostat bar, holder, handset
    {id:'niche8',type:'накладная полка-ниша 0.60×0.10×0.30 на южной стене, открыта на север, LED по верхней кромке',room:8,layer:'bath2',pos:[8.30,13.024],rot:0,size:[0.60,1.35,0.10],coat:{body:'tile6060'},fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.6,1.05,1.07,0,0.1); b.phys(0,0.6,1.33,1.35,0,0.1); b.phys(0,0.02,1.07,1.33,0,0.1); b.phys(0.58,0.6,1.07,1.33,0,0.1); b.phys(0.02,0.58,1.07,1.33,0.08,0.1);
       [[0,0.6,1.05,1.07,0,0.10],[0,0.6,1.33,1.35,0,0.10],[0,0.02,1.07,1.33,0,0.10],[0.58,0.6,1.07,1.33,0,0.10],[0.02,0.58,1.07,1.33,0.08,0.10]].forEach(q=>b.round(...q,0.001,mat.body)); // bottom, top, sides, back
       b.led(0.02,0.58,1.32,1.33,0.005,0.02);                                                                    // strip under the top edge (declares its own proxy)
     }},                                                                     // LED strip under the top edge
    {id:'wcbox8',type:'выступ северной стены зашит заподлицо (z 11.588) на всю высоту, рама инсталляции внутри; кнопка смыва на оси',room:8,layer:'bath2',pos:[9.098,11.384],rot:0,size:[0.774,2.70,0.204],coat:{body:'tile6060',plastic:'plastic'},fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,0.774,0,2.7,0,0.204); b.phys(0.33,0.49,0.96,1.04,0.204,0.209);
       b.round(0,0.774,0,2.7,0,0.199,0.001,mat.body); b.round(0.33,0.49,0.96,1.04,0.199,0.203,0.001,mat.plastic); [[0.35,0.405],[0.415,0.47]].forEach(([x0,x1])=>b(x0,x1,0.98,1.02,0.2025,0.204,mat.dark)); // box, flush plate inside size, two buttons
     }},                    // box, flush plate on the toilet axis (x 9.51)
    {id:'wc8',type:'унитаз подвесной компактный 0.36×0.48, сиденье 0.42, фасад на юг',room:8,layer:'bath2',pos:[9.34,11.588],rot:0,size:[0.36,0.42,0.48],coat:{plastic:'plastic'},fixed:'wall',glb:'models/wc.glb',glbRot:180,glbFacade:false,
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0.02,0.34,0.2,0.4,0,0.32); b.phys(0.02,0.34,0.2,0.4,0.16,0.48); b.phys(0.03,0.33,0.4,0.42,0.02,0.32); b.phys(0.03,0.33,0.4,0.42,0.17,0.47);
       const cyl=(r,h,y,m)=>{ const c=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),m); c.position.set(0.18,y,0.32); g.add(c); };
       b(0.02,0.34,0.20,0.40,0,0.32,mat.kmat); cyl(0.16,0.20,0.30,mat.kmat);                                           // bowl: box at the back, round front to z 0.48
       b(0.03,0.33,0.40,0.42,0.02,0.32,mat.lamp); cyl(0.15,0.02,0.41,mat.lamp);                                        // seat
     }},
    {id:'towel8',type:'полотенцесушитель электрический 0.50×1.80 на южной стене у двери, низ 0.45',room:8,layer:'bath2',pos:[9.30,13.044],rot:0,size:[0.50,2.25,0.08],fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0.03,0.06,0.45,2.25,0.02,0.05); b.phys(0.44,0.47,0.45,2.25,0.02,0.05); b.phys(0.06,0.44,0.55,0.57,0.025,0.045); b.phys(0.06,0.44,0.65,0.67,0.025,0.045); b.phys(0.06,0.44,0.75,0.77,0.025,0.045); b.phys(0.06,0.44,0.85,0.87,0.025,0.045); b.phys(0.06,0.44,0.95,0.97,0.025,0.045); b.phys(0.06,0.44,1.05,1.07,0.025,0.045); b.phys(0.06,0.44,1.15,1.17,0.025,0.045); b.phys(0.06,0.44,1.25,1.27,0.025,0.045); b.phys(0.06,0.44,1.35,1.37,0.025,0.045); b.phys(0.06,0.44,1.45,1.47,0.025,0.045); b.phys(0.06,0.44,1.55,1.57,0.025,0.045); b.phys(0.06,0.44,1.65,1.67,0.025,0.045); b.phys(0.06,0.44,1.75,1.77,0.025,0.045); b.phys(0.06,0.44,1.85,1.87,0.025,0.045); b.phys(0.06,0.44,1.95,1.97,0.025,0.045); b.phys(0.06,0.44,2.05,2.07,0.025,0.045); b.phys(0.06,0.44,2.15,2.17,0.025,0.045); b.phys(0.03,0.06,0.55,0.58,0.05,0.08); b.phys(0.44,0.47,0.55,0.58,0.05,0.08); b.phys(0.03,0.06,1.1,1.13,0.05,0.08); b.phys(0.44,0.47,1.1,1.13,0.05,0.08); b.phys(0.03,0.06,1.6,1.63,0.05,0.08); b.phys(0.44,0.47,1.6,1.63,0.05,0.08); b.phys(0.03,0.06,2.15,2.18,0.05,0.08); b.phys(0.44,0.47,2.15,2.18,0.05,0.08);
       const v=(x,y,z)=>new THREE.Vector3(x,y,z), cyl=(r,h,x,y,z,m,rot)=>{ const c=new THREE.CylinderGeometry(r,r,h,16); if(rot==='x') c.rotateZ(Math.PI/2); if(rot==='z') c.rotateX(Math.PI/2); g.add(new THREE.Mesh(c.translate(x,y,z),m)); };
       [0.045,0.455].forEach(x=>cyl(0.015,1.80,x,1.35,0.035,mat.handle));                                        // two vertical collectors Ø30
       for(let y=0.55;y<2.2;y+=0.10) cyl(0.01,0.38,0.25,y+0.01,0.035,mat.handle,'x');                            // rungs Ø20 every 0.10
       [0.55,1.10,1.60,2.15].forEach(y=>[0.045,0.455].forEach(x=>cyl(0.012,0.03,x,y+0.015,0.065,mat.handle,'z'))); // wall brackets
     }},
    // ceiling: three spots Ø0.08, the extractor fan Ø0.12, hidden LED cove along the north and east walls
    {id:'spot4',type:'точечный светильник над входом в душ, IP65',room:8,layer:'bath2',pos:[8.62,12.75],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'spot5',type:'точечный светильник в центре комнаты (общий свет)',room:8,layer:'bath2',pos:[9.41,12.56],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'spot6',type:'точечный светильник над унитазом',room:8,layer:'bath2',pos:[9.48,11.91],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b){ b.spot(0.04,0.04,0.04); }},
    {id:'cove8',type:'скрытый LED-карниз по потолку: северная стена 1.62 и восточная до двери (z 11.59–12.15), h 2.62',room:8,layer:'bath2',pos:[8.235,11.588],rot:0,size:[1.637,2.65,0.562],fixed:'wall',
     build(b,g){ /* proxy = pre-detail AABBs (realism-all E) */ b.phys(0,1.617,2.55,2.62,0.02,0.06);  b.phys(1.577,1.617,2.55,2.62,0.06,0.562);
       b.round(0,1.617,2.55,2.62,0.02,0.06,0.001,mat.body); b.led(0,1.617,2.62,2.65,0,0.02);                   // north: shadow lip and the strip above it
       b.round(1.577,1.617,2.55,2.62,0.06,0.562,0.001,mat.body); b.led(1.617,1.637,2.62,2.65,0.06,0.562);          // east segment to the door
     }},                  // east segment to the door
    {id:'fan8',type:'вентилятор вытяжки Ø0.12 в потолке над унитазом',room:8,layer:'bath2',pos:[9.46,11.69],rot:0,size:[0.12,2.70,0.12],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0,0.12,2.68,2.7,0,0.12); g.add(new THREE.Mesh(new THREE.TorusGeometry(0.055,0.005,8,24).rotateX(Math.PI/2).translate(0.06,2.695,0.06),mat.plastic)); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.004,24).translate(0.06,2.694,0.06),mat.dark)); [-0.03,-0.01,0.01,0.03].forEach(dx=>b(0.06+dx-0.003,0.06+dx+0.003,2.686,2.692,0.02,0.10,mat.plastic)); }}, // rim, dark intake, four grille bars
    // electrics: flat boxes 0.08 × 0.08 × 0.01
    {id:'sock24',type:'скрытый вывод для полотенцесушителя, h 0.45',room:8,layer:'bath2',pos:[9.51,13.114],rot:0,size:[0.08,0.49,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.41,0.49,0,0.01,mat.plastic); }},
    {id:'sw6',type:'выключатель 2 клавиши (свет + вытяжка) и терморегулятор — в спальне 3 у двери санузла',room:3,layer:'bath2',pos:[10.041,12.06],rot:0,size:[0.01,0.99,0.08],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.01,0.91,0.99,0,0.08,mat.plastic,{keys:2}); }},
    // ---- walk-in closet 6 (tasks/wardrobe6/README.md, marks M1–M13; grey materials only) ----
    // Room box: x 5.565–6.885, z 1.874–3.894, door on the south wall x 6.10–6.885 (opens out into corridor 5).
    // Linear layout: the deep system (0.60) along the west wall, the 0.40 end shelf on the north wall, only flat parts
    // (peg board, mirror, socket) on the east wall. The passage x 6.165–6.885 × z 2.274–3.894 × 0–2.10 stays empty (check.js).
    // Sections A/B have no top board: the mezzanine floor at 2.00 is their top. Rods are cylinders along z, centre ≤ 2.00.
    {id:'wsecA',type:'секция A западной стены: две штанги 1.00 и 1.95 для коротких вещей, открытый каркас без дверей',room:6,layer:'wardrobe',pos:[5.565,1.874],rot:0,size:[0.60,2.00,0.90],coat:CAB,fixed:'wall',
     build(b,g){[[0,0.6,0,2,0,0.02],[0,0.6,0,2,0.88,0.9],[0.2875,0.3125,0.9875,1.0125,0.02,0.88],[0.2875,0.3125,1.9375,1.9625,0.02,0.88]].forEach(q=>b.phys(...q)); // proxy = today's AABBs (realism-all F1)
       
       b(0,0.60,0,2.00,0,0.018,mat.body); b(0,0.60,0,2.00,0.882,0.90,mat.body);                   // 18 mm sides, no back, floor 0–0.10 empty
       [1.00,1.95].forEach(y=>{ g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0125,0.0125,0.864,16).rotateX(Math.PI/2).translate(0.30,y,0.45),mat.handle)); [0.018,0.87].forEach(z=>b(0.28,0.32,y-0.02,y+0.02,z,z+0.012,mat.handle)); }); // chrome rods Ø25 on end holders
     }},
    {id:'wsecB',type:'секция B западной стены: длинная штанга 1.75 (пальто, платья), внизу пол 0–0.30 под сапоги и чемодан',room:6,layer:'wardrobe',pos:[5.565,2.774],rot:0,size:[0.60,2.00,0.70],coat:CAB,fixed:'wall',
     build(b,g){[[0,0.6,0,2,0,0.02],[0,0.6,0,2,0.68,0.7],[0.2875,0.3125,1.7375,1.7625,0.02,0.68]].forEach(q=>b.phys(...q)); // proxy = today's AABBs (realism-all F1)
       
       b(0,0.60,0,2.00,0,0.018,mat.body); b(0,0.60,0,2.00,0.682,0.70,mat.body);                   // 18 mm sides
       g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0125,0.0125,0.664,16).rotateX(Math.PI/2).translate(0.30,1.75,0.35),mat.handle)); [0.018,0.67].forEach(z=>b(0.28,0.32,1.73,1.77,z,z+0.012,mat.handle)); // chrome rod 1.75 on end holders
     }},
    {id:'wsecC',type:'секция C у двери: 6 ящиков 0.05–1.13 (верхний на защёлке — аптечка-2), 5 полок с шагом 0.31; глубина 0.50, чтобы не заходить в проём',room:6,layer:'wardrobe',pos:[5.565,3.474],rot:0,size:[0.50,2.70,0.42],coat:CAB,fixed:'wall',
     build(b){[[0,0.5,0,2.7,0,0.02],[0,0.5,0,2.7,0.4,0.42],[0.02,0.48,0.03,0.05,0.02,0.4],[0.02,0.48,0.05,0.07,0.02,0.4],[0.02,0.48,0.23,0.25,0.02,0.4],[0.02,0.48,0.41,0.43,0.02,0.4],[0.02,0.48,0.59,0.61,0.02,0.4],[0.02,0.48,0.77,0.79,0.02,0.4],[0.02,0.48,0.95,0.97,0.02,0.4],[0.02,0.48,1.13,1.15,0.02,0.4],[0.02,0.48,1.44,1.46,0.02,0.4],[0.02,0.48,1.75,1.77,0.02,0.4],[0.02,0.48,2.06,2.08,0.02,0.4],[0.02,0.48,2.37,2.39,0.02,0.4],[0.02,0.48,2.68,2.7,0.02,0.4],[0.48,0.5,0.055,0.225,0.02,0.4],[0.48,0.5,0.235,0.405,0.02,0.4],[0.48,0.5,0.415,0.585,0.02,0.4],[0.48,0.5,0.595,0.765,0.02,0.4],[0.48,0.5,0.775,0.945,0.02,0.4],[0.48,0.5,0.955,1.125,0.02,0.4]].forEach(q=>b.phys(...q)); // proxy = today's AABBs (realism-all F1)
       
       const p=0.018;
       b(0,0.50,0,2.70,0,p,mat.body); b(0,0.50,0,2.70,0.42-p,0.42,mat.body); b(p,0.5-p,2.7-p,2.70,p,0.42-p,mat.body); b(p,0.5-p,0.03,0.03+p,p,0.42-p,mat.body); // 18 mm sides, top, bottom
       for(let i=0;i<6;i++){ const y0=0.05+0.18*i; b(0.482,0.50,y0+0.0015,y0+0.1785,p,0.42-p,mat.door); b(0.497,0.5005,y0+0.14,y0+0.155,0.10,0.34,mat.dark); b(p,0.482,y0,y0+p,p,0.42-p,mat.body); } // drawer fronts with 3 mm gaps and a finger groove (push-to-open), bottoms
       for(let i=0;i<5;i++){ const y=1.13+0.31*i; b(p,0.5-p,y,y+p,p,0.42-p,mat.body); }        // shelves 1.13–2.68
     }},
    {id:'wmezz',type:'антресоль над секциями A и B: две полки 2.00–2.35 и 2.35–2.70 (сезонное, постельное, чемодан); верхняя — со стремянки',room:6,layer:'wardrobe',pos:[5.565,1.874],rot:0,size:[0.60,2.70,1.60],coat:CAB,fixed:'wall',
     build(b){[[0,0.6,2,2.7,0,0.02],[0,0.6,2,2.02,0.02,1.58],[0,0.6,2,2.7,1.58,1.6],[0,0.6,2.02,2.68,0.89,0.91],[0,0.6,2.35,2.37,0.02,1.58],[0,0.6,2.68,2.7,0.02,1.58]].forEach(q=>b.phys(...q)); // proxy = today's AABBs (realism-all F1)
       
       const p=0.018;
       b(0,0.60,2.00,2.70,0,p,mat.body); b(0,0.60,2.00,2.70,1.6-p,1.60,mat.body); b(0,0.60,2.02,2.68,0.891,0.909,mat.body); // 18 mm sides and the divider over the A/B joint
       [2.00,2.35,2.68].forEach(y=>b(0,0.60,y,y+p,p,1.6-p,mat.body)); b(0.58,0.60,2.018,2.06,p,0.891,mat.body); b(0.58,0.60,2.018,2.06,0.909,1.6-p,mat.body); // floor (top of A/B), middle shelf, top; front lips keep boxes from sliding
     }},
    {id:'wend',type:'торцевой стеллаж 0.72×0.40 на северной стене: инструмент внизу, 4 наклонные полки под обувь 0.45–1.25, закрытый шкафчик-аптечка 1.25–1.60, выше полки под сумки и коробки',room:6,layer:'wardrobe',pos:[6.17,1.874],rot:0,size:[0.715,2.70,0.40],coat:CAB,fixed:'wall',
     build(b){[[0,0.02,0,2.7,0,0.4],[0.02,0.695,0.03,0.05,0,0.4],[0.02,0.695,0.23,0.25,0,0.4],[0.02,0.695,0.43,0.45,0,0.4],[0.02,0.695,0.6041,0.7159,0.0235,0.3765],[0.02,0.695,0.8041,0.9159,0.0235,0.3765],[0.02,0.695,1.0041,1.1159,0.0235,0.3765],[0.02,0.695,1.23,1.25,0,0.4],[0.02,0.695,1.6,1.62,0,0.4],[0.02,0.695,1.97,1.99,0,0.4],[0.02,0.695,2.34,2.36,0,0.4],[0.02,0.695,2.68,2.7,0,0.4],[0.03,0.685,1.25,1.6,0.38,0.4],[0.36,0.42,1.3,1.32,0.4,0.41],[0.695,0.715,0,2.7,0,0.4]].forEach(q=>b.phys(...q)); // proxy = today's AABBs (realism-all F1)
       
       const p=0.018;
       b(0,p,0,2.70,0,0.40,mat.body); b(0.715-p,0.715,0,2.70,0,0.40,mat.body); b(p,0.715-p,2.7-p,2.70,0,0.40,mat.body); b(0,0.715,0,2.70,0,0.006,mat.wpanel); // 18 mm sides (0.715: the west side sits 0.005 off section B so the parts do not read as one block by float noise), top, 6 mm back
       [0.03,0.23,0.43,1.23,1.60,1.97,2.34].forEach(y=>b(p,0.715-p,y,y+p,0.006,0.40,mat.body));       // flat shelves: two tool tiers, cabinet floor/top, upper shelves
       [0.65,0.85,1.05].forEach(y=>{ const m=b(p,0.715-p,y,y+p,0.02,0.38,mat.body); m.rotation.x=0.26; b(p,0.715-p,y-0.03,y+0.005,0.362,0.378,mat.body); }); // shoe shelves tilted 15° with a heel lip at the low front edge
       b(0.03,0.685,1.25,1.60,0.38,0.398,mat.wdoor); b(0.33,0.45,1.30,1.315,0.394,0.40,mat.dark);        // medicine cabinet door 1.25–1.60, finger groove instead of a knob (size 0.40)
     }},
    {id:'wpeg',type:'перфопанель 0.60×0.80 для ручного инструмента на восточной стене у торца, вынос крючков ≤ 0.08',room:6,layer:'wardrobe',pos:[6.865,2.30],rot:0,size:[0.02,1.80,0.60],coat:CAB,fixed:'wall',
     build(b,g){ b.phys(0,0.02,1,1.8,0,0.6); b.round(0.002,0.02,1.00,1.80,0,0.60,0.002,mat.wpanel); for(let i=0;i<8;i++) for(let j=0;j<6;j++) g.add(new THREE.Mesh(new THREE.CircleGeometry(0.004,6).rotateY(-Math.PI/2).translate(0.0015,1.10+i*0.085,0.08+j*0.085),mat.dark)); }}, // peg board 0.60×0.80 with a 48-hole grid (≈200 triangles)
    {id:'wmirror',type:'зеркало ростовое 0.50×1.60 без рамы напротив длинной штанги',room:6,layer:'wardrobe',pos:[6.845,3.00],rot:0,size:[0.02,1.90,0.50],fixed:'wall',
     build(b){ b.phys(0,0.02,0.3,1.9,0,0.5); b.round(0.004,0.02,0.30,1.90,0,0.50,0.002,mat.frame); b.round(0,0.004,0.31,1.89,0.01,0.49,0.002,mat.mirror); }}, // frameless: 4 mm mirror glass on a backing board; backing ends at the wallpaper plane x 6.865 (M3)
    // hung on a hook 0.10 above the floor: a floor-standing step inside section B reads as furniture facing section C (layout.js passage rule)
    {id:'wstep',type:'складная стремянка 2 ступени на крючке у боковины секции B, низ 0.10 (разложенная 0.40×0.30×0.45)',room:6,layer:'wardrobe',pos:[5.60,2.794],rot:0,size:[0.40,0.58,0.12],fixed:'wall',
     build(b){ [[0,0.4,0.1,0.55,0.02,0.12],[0.18,0.22,0.55,0.58,0,0.02]].forEach(q=>b.phys(...q)); // proxy = today's AABBs (realism-all F1)
       [0.02,0.10].forEach(z=>[0,0.37].forEach(x=>b(x,x+0.03,0.10,0.55,z,z+0.02,mat.frame))); [0.25,0.45].forEach(y=>b(0.03,0.37,y,y+0.02,0.02,0.12,mat.hdark)); b(0.18,0.22,0.55,0.58,0,0.02,mat.handle); }}, // folded step: two frames, two treads, hook
    {id:'wlight',type:'линейный потолочный светильник 1.85×0.04 над проходом, 4000 K, от датчика движения M11',room:6,layer:'wardrobe',pos:[6.48,1.95],rot:0,size:[0.04,2.70,1.85],fixed:'wall',
     build(b){ b.phys(0,0.04,2.68,2.7,0,1.85); b(0,0.04,2.68,2.70,0,1.85,mat.frame); b(0.005,0.035,2.6795,2.68,0.01,1.84,mat.led); }}, // profile with the diffuser strip
    {id:'led6',type:'LED-лента под передней кромкой антресоли, свет вниз на штанги; включается вместе с M9',room:6,layer:'wardrobe',pos:[6.135,1.90],rot:0,size:[0.02,2.00,1.55],fixed:'wall',
     build(b){ b.phys(0,0.02,1.98,2,0,1.55); b(0,0.02,1.98,2.00,0,1.55,mat.frame); b(0.003,0.017,1.9795,1.98,0.005,1.545,mat.led); }}, // profile with the diffuser strip
    {id:'sw7',type:'датчик движения + выключатель в коридоре у двери гардеробной: свет M9+M10 от датчика, клавиша — принудительно',room:5,layer:'wardrobe',pos:[5.76,4.033],rot:0,size:[0.08,0.99,0.01],fixed:'wall',coat:PLASTIC,build(b){ b.plate(0,0.08,0.91,0.99,0,0.01,mat.plastic); }},
    {id:'sock25',type:'розетка у двери для пылесоса и утюга, h 0.30',room:6,layer:'wardrobe',pos:[6.875,3.55],rot:0,size:[0.01,0.34,0.08],fixed:'wall',build(b){ b.plate(0,0.01,0.26,0.34,0,0.08); }},
    // ---- loggia 10 (tasks/balcony10/README.md, marks M1–M13; grey materials only) ----
    // Room box: x 13.91–15.1, z 2.268–6.043; glazing on the east wall z 2.40–5.90, opening from the kitchen on the west wall z 3.353–4.971 (top 2.10).
    // South end: cantilevered desk and the IT shelf above it; north end: the shelving unit. Nothing else stands on the floor,
    // the opening zone x 13.91–14.4 × z of the opening stays clear (check.js).
    {id:'bdesk',type:'подвесной стол 1.19×0.80 во всю ширину у южного торца, верх 0.75, консоли к южной и западной стенам, уголок у стекла; под столом пусто',room:10,layer:'balcony',pos:[13.91,5.24],rot:0,size:[1.19,0.75,0.80],coat:{table:'oakFurnitureX'}, /* M4-3: 1.19 m top along x, grain along the long side */ fixed:'wall',
     build(b){[[0,0.05,0.66,0.71,0,0.75],[0,1.19,0.66,0.71,0.75,0.8],[0,1.19,0.71,0.75,0,0.8],[1.14,1.19,0.66,0.71,0.3,0.5]].forEach(q=>b.phys(...q)); // proxy = today's AABBs (realism-all F1)
       
       b.round(0,1.19,0.71,0.75,0,0.80,0.003,mat.table);                                             // top 0.04 with a 3 mm bevel
       b(0,1.19,0.66,0.71,0.75,0.80,mat.frame); b(0,1.19,0.70,0.71,0.70,0.75,mat.frame); b(0,0.05,0.66,0.71,0,0.75,mat.frame); b(0,0.05,0.70,0.71,0.05,0.75,mat.frame); b(1.14,1.19,0.66,0.71,0.30,0.50,mat.frame); // steel angle consoles under the top: south wall, west wall, bracket by the glass
     }},
    {id:'bchair',type:'стул 0.45 с прямой спинкой до 0.90, задвинут под стол на 0.24',room:10,layer:'balcony',pos:[14.28,5.00],rot:0,size:[0.45,0.90,0.45],coat:CHAIR4,glb:'models/bchair.glb',
     build(b){[[0,0.45,0.42,0.46,0,0.45],[0,0.45,0.46,0.9,0,0.04],[0.02,0.05,0,0.42,0.02,0.05],[0.02,0.05,0,0.42,0.4,0.43],[0.4,0.43,0,0.42,0.02,0.05],[0.4,0.43,0,0.42,0.4,0.43]].forEach(q=>b.phys(...q)); // proxy = today's AABBs (realism-all F1)
       
       b(0,0.45,0.42,0.46,0,0.45,mat.chair); b(0,0.45,0.46,0.90,0,0.04,mat.chair);                    // seat, straight back on the north side
       [[0.02,0.02],[0.40,0.02],[0.02,0.40],[0.40,0.40]].forEach(([x,z])=>b(x,x+0.03,0,0.42,z,z+0.03,mat.chair)); // legs
     }},
    {id:'itshelf',type:'полка-ИТ-хаб 1.19×0.60 над столом, плита 0.05 на 2.00–2.05, бортик 0.03 спереди, вырез 0.05×0.30 под кабели у южной стены; до потолка 0.65',room:10,layer:'balcony',pos:[13.91,5.44],rot:0,size:[1.19,2.08,0.60],coat:{body:'cabinetPaint'},fixed:'wall',
     build(b){[[0,0.05,1.95,2,0,0.55],[0,1.19,1.95,2,0.55,0.6],[0,1.19,2,2.05,0,0.55],[0,0.445,2,2.05,0.55,0.6],[0,1.19,2.05,2.08,0,0.03],[0.745,1.19,2,2.05,0.55,0.6]].forEach(q=>b.phys(...q)); // proxy = today's AABBs (realism-all F1)
       
       b.round(0,1.19,2.00,2.05,0,0.55,0.003,mat.body); b(0,0.445,2.00,2.05,0.55,0.60,mat.body); b(0.745,1.19,2.00,2.05,0.55,0.60,mat.body); // plate with the cable notch x 0.445–0.745 at the wall
       b.round(0,1.19,2.05,2.08,0,0.03,0.003,mat.body);                                               // front lip
       b(0,1.19,1.95,2.00,0.55,0.60,mat.frame); b(0,1.19,1.99,2.00,0.50,0.55,mat.frame); b(0,0.05,1.95,2.00,0,0.55,mat.frame); b(0,0.05,1.99,2.00,0.05,0.55,mat.frame); // steel angle consoles to the south and west walls
     }},
    {id:'bshelf',type:'стеллаж 1.08×0.40 у северного торца с зазорами 0.05 от стен (плинтус, поручень остекления), верх 2.05: 3 закрытых ящика по 0.25, выше 4 ряда открытых секций с перегородкой по центру; площадка 2.05–2.70 под ИТ-устройства',room:10,layer:'balcony',pos:[13.96,2.318],rot:0,size:[1.08,2.05,0.40],coat:{body:'cabinetPaint',wpanel:'cabinetPaint',door:'cabinetPaint'},fixed:'wall',
     build(b){ const W=1.08, p=0.018, c=W/2; // 1.08 wide: 0.05 off the west skirting and the glazing railing at x 15.06 (was 1.19 flush, clipped both)
       [[0,0.02,0,2.05,0,0.4],[0.02,W-0.02,0.005,0.245,0.38,0.4],[0.02,W-0.02,0.03,0.05,0,0.4],[0.02,W-0.02,0.255,0.495,0.38,0.4],[0.02,W-0.02,0.505,0.745,0.38,0.4],[0.02,W-0.02,0.75,0.77,0,0.4],[0.02,W-0.02,1.075,1.095,0,0.4],[0.02,W-0.02,1.4,1.42,0,0.4],[0.02,W-0.02,1.725,1.745,0,0.4],[0.02,W-0.02,2.03,2.05,0,0.4],[c-0.01,c+0.01,0.77,2.03,0,0.4],[W-0.02,W,0,2.05,0,0.4]].forEach(q=>b.phys(...q)); // proxy = today's AABBs (realism-all F1)
       b(0,p,0,2.05,0,0.40,mat.body); b(W-p,W,0,2.05,0,0.40,mat.body); b(p,W-p,2.05-p,2.05,0,0.40,mat.body); b(p,W-p,0.03,0.03+p,0,0.40,mat.body); b(p,W-p,0.05,2.05-p,0,0.006,mat.wpanel); // 18 mm sides, top, bottom, 6 mm back
       for(let i=0;i<3;i++){ const y0=0.25*i; b(p,W-p,y0+0.0315,y0+0.2485,0.382,0.40,mat.door); b(c-0.095,c+0.095,y0+0.20,y0+0.215,0.396,0.4005,mat.dark); b(p,W-p,y0+0.03,y0+0.03+p,0.006,0.382,mat.body); } // drawer fronts 0.03–0.75 with 3 mm gaps and finger grooves (push-to-open), bottoms
       [0.75,1.075,1.40,1.725].forEach(y=>b(p,W-p,y,y+p,0.006,0.40,mat.body));                     // open shelves, pitch 0.325
       b(c-0.009,c+0.009,0.75+p,2.05-p,0.006,0.40,mat.body);                                              // centre divider
     }},
    {id:'cable10',type:'кабель-канал 0.06×0.04 по западной стене на 2.23–2.27, выше проёма в кухню (2.10): питание и сеть между полкой и стеллажом',room:10,layer:'balcony',pos:[13.91,2.40],rot:0,size:[0.06,2.27,3.00],coat:PLASTIC,fixed:'wall',
     build(b){ b.phys(0,0.06,2.23,2.27,0,3); b.round(0,0.06,2.23,2.27,0,3.00,0.002,mat.plastic); b(0.0595,0.0602,2.2475,2.2525,0,3.00,mat.dark); }}, // trunking with a snap-on cover, seam line on the face
    // electrics: flat boxes 0.08 × 0.08 × 0.01
    {id:'sock26',type:'розеточный блок ИТ над полкой: 6 розеток + ввод Ethernet, отдельная линия, h 2.25',room:10,layer:'balcony',pos:[14.17,6.033],rot:0,size:[0.08,2.29,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,2.21,2.29,0,0.01,mat.plastic,{keys:3}); }},
    {id:'sock27',type:'розетки 2+2 USB над столешницей у восточного края, h 0.90',room:10,layer:'balcony',pos:[14.77,6.033],rot:0,size:[0.08,0.94,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.86,0.94,0,0.01,mat.plastic,{keys:2}); }},
    {id:'sock28',type:'розеточный блок над стеллажом: 4 розетки для площадки 2.05–2.70, h 2.25',room:10,layer:'balcony',pos:[14.17,2.268],rot:0,size:[0.08,2.29,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,2.21,2.29,0,0.01,mat.plastic,{keys:2}); }},
    {id:'sock29',type:'розетка в открытой секции стеллажа 0.75–1.075 (зарядки), h 1.00',room:10,layer:'balcony',pos:[14.77,2.268],rot:0,size:[0.08,1.04,0.01],coat:PLASTIC,fixed:'wall',build(b){ b.plate(0,0.08,0.96,1.04,0,0.01); }},
    {id:'led7',type:'LED-лента под передней кромкой ИТ-полки, свет на столешницу, 4000 K; выключатель на торце полки',room:10,layer:'balcony',pos:[13.95,5.44],rot:0,size:[1.11,2.00,0.02],fixed:'wall',
     build(b){ b.phys(0,1.11,1.98,2,0,0.02); b(0,1.11,1.98,2.00,0,0.02,mat.frame); b(0.005,1.105,1.9795,1.98,0.003,0.017,mat.led); }}, // profile with the diffuser strip
    {id:'blight',type:'линейный потолочный светильник 2.20×0.04 по оси лоджии от проёма до стула, 4000 K',room:10,layer:'balcony',pos:[14.48,2.90],rot:0,size:[0.04,2.70,2.20],fixed:'wall',
     build(b){ b.phys(0,0.04,2.68,2.7,0,2.2); b(0,0.04,2.68,2.70,0,2.20,mat.frame); b(0.005,0.035,2.6795,2.68,0.01,2.19,mat.led); }}, // profile with the diffuser strip
    {id:'sw8',type:'выключатель потолочного света на западной стене южнее проёма (проём до 4.971), h 0.95',room:10,layer:'balcony',pos:[13.91,5.02],rot:0,size:[0.01,0.99,0.08],fixed:'wall',build(b){ b.plate(0,0.01,0.91,0.99,0,0.08); }},
    {id:'blinds10',type:'рулонные солнцезащитные шторы: кассеты по верху остекления z 2.40–5.90 (собраны)',room:10,layer:'balcony',pos:[15.02,2.40],rot:0,size:[0.08,2.30,3.50],coat:PLASTIC,fixed:'wall',
     build(b,g){ b.phys(0,0.08,2.22,2.3,0,3.5); [[0.005,1.74],[1.76,3.495]].forEach(([z0,z1])=>{ g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,z1-z0,20).rotateX(Math.PI/2).translate(0.04,2.26,(z0+z1)/2),mat.plastic)); [z0,z1-0.01].forEach(z=>b(0.01,0.07,2.22,2.30,z,z+0.01,mat.frame)); }); }}, // two roller cassettes Ø80 with end brackets
  ];
  function makeB(g){ // detail helpers bound to a group; buildItem and the in-place variant rebuild (KIDBED) share them
    const b=(x0,x1,y0,y1,z0,z1,m)=>{ const w=x1-x0,h=y1-y0,d=z1-z0, geo=new THREE.BoxGeometry(w,h,d), uv=geo.attributes.uv, F=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]]; // UV in metres per face (±x,±y,±z), so VIZ pattern scale holds on items too
      for(let i=0;i<uv.count;i++){ const [a,c]=F[i>>2]; uv.setXY(i,uv.getX(i)*a,uv.getY(i)*c); }
      const mesh=new THREE.Mesh(geo,m); mesh.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2); g.add(mesh); return mesh; };
    b.group=g; b.phys=(x0,x1,y0,y1,z0,z1)=>g.userData.proxy.push([x0,x1,y0,y1,z0,z1]); // explicit collision box (local); declared → render meshes leave physics (B02)
    // ---- shared detail helpers (tasks/realism-all/PLAN.md §3); all coordinates local, UV in metres ----
    const rrect=(w,h,r)=>{ const sh=new THREE.Shape(); r=Math.min(r,w/2,h/2); sh.moveTo(r,0); sh.lineTo(w-r,0); sh.absarc(w-r,r,r,-Math.PI/2,0,false); sh.lineTo(w,h-r); sh.absarc(w-r,h-r,r,0,Math.PI/2,false); sh.lineTo(r,h); sh.absarc(r,h-r,r,Math.PI/2,Math.PI,false); sh.lineTo(0,r); sh.absarc(r,r,r,Math.PI,Math.PI*1.5,false); return sh; };
    b.rrect=rrect;
    b.round=(x0,x1,y0,y1,z0,z1,r,m)=>{ // box with all edges rounded by r: rounded-rect shape extruded along the thinnest axis with a bevel r
      const w=x1-x0,h=y1-y0,d=z1-z0, t=Math.min(w,h,d); r=Math.min(r,t/2-1e-4); const fine=r>=0.003, ex=(a,c)=>new THREE.ExtrudeGeometry(rrect(a-2*r,c-2*r,r),{depth:t-2*r,bevelThickness:r,bevelSize:r,bevelSegments:fine?2:1,curveSegments:fine?4:1}); // r < 3 mm reads as a chamfer: one segment is enough
      let geo; if(t===h) geo=ex(w,d).rotateX(Math.PI/2).translate(x0+r,y1-r,z0+r); else if(t===w) geo=ex(d,h).rotateY(-Math.PI/2).translate(x1-r,y0+r,z0+r); else geo=ex(w,h).translate(x0+r,y0+r,z0+r);
      const mesh=new THREE.Mesh(geo,m); g.add(mesh); return mesh; };
    b.plate=(x0,x1,y0,y1,z0,z1,m,o={})=>{ // wall plate of a socket/switch: 12 mm frame, keys recessed 2 mm on both faces; one proxy box for the whole item
      m=m||mat.plastic; const keys=o.keys||1, f=0.012, thinX=(x1-x0)<(z1-z0); b.phys(x0,x1,y0,y1,z0,z1); b.round(x0,x1,y0,y1,z0,z1,0.001,m);
      const [a0,a1]=thinX?[z0+f,z1-f]:[x0+f,x1-f], gap=0.001, kw=(a1-a0-gap*(keys-1))/keys;
      for(let i=0;i<keys;i++){ const k0=a0+i*(kw+gap), k1=k0+kw; if(thinX) b(x0-0.0005,x1+0.0005,y0+f,y1-f,k0,k1,mat.dark); else b(k0,k1,y0+f,y1-f,z0-0.0005,z1+0.0005,mat.dark); } // keys show through the frame on both faces
      return g; };
    b.spot=(cx,cz,r,y=2.70)=>{ // recessed ceiling spot: metal ring flush with the ceiling, emitter disc just above it
      b.phys(cx-r,cx+r,y-0.02,y,cz-r,cz+r); const ring=new THREE.Mesh(new THREE.TorusGeometry(r-0.005,0.005,8,24).rotateX(Math.PI/2).translate(cx,y-0.005,cz),mat.frame); g.add(ring);
      const disc=new THREE.Mesh(new THREE.CircleGeometry(r-0.008,24).rotateX(Math.PI/2).translate(cx,y-0.008,cz),mat.led); g.add(disc); return ring; };
    b.led=(x0,x1,y0,y1,z0,z1)=>{ // LED tape in an aluminium profile: the strip runs along the long axis and shows 0.5 mm on both faces
      b.phys(x0,x1,y0,y1,z0,z1); b(x0,x1,y0,y1,z0,z1,mat.frame); const w=x1-x0,h=y1-y0,d=z1-z0, L=Math.max(w,h,d), q=[x0,x1,y0,y1,z0,z1];
      [w,h,d].forEach((v,i)=>{ if(v===L) return; const c=(q[2*i]+q[2*i+1])/2; if(v===Math.min(w,h,d)){ q[2*i]-=0.0005; q[2*i+1]+=0.0005; } else { q[2*i]=c-v/4; q[2*i+1]=c+v/4; } });
      return b(q[0],q[1],q[2],q[3],q[4],q[5],mat.led); };
    b.handle=(x,y,z,len,axis='y',out='-z')=>{ // bar handle Ø8 standing 20 mm off the front point (x,y,z): `axis` bar direction, `out` front normal
      const o={x:[1,0,0],'-x':[-1,0,0],z:[0,0,1],'-z':[0,0,-1],y:[0,1,0]}[out], a={x:[1,0,0],y:[0,1,0],z:[0,0,1]}[axis], rot=geo=>axis==='x'?geo.rotateZ(Math.PI/2):axis==='z'?geo.rotateX(Math.PI/2):geo;
      const bar=new THREE.Mesh(rot(new THREE.CylinderGeometry(0.004,0.004,len,10)).translate(x+o[0]*0.02,y+o[1]*0.02,z+o[2]*0.02),mat.handle); g.add(bar);
      [-1,1].forEach(sg=>{ const e=len/2-0.012, st=new THREE.CylinderGeometry(0.003,0.003,0.02,8); if(out==='x'||out==='-x') st.rotateZ(Math.PI/2); else if(out!=='y') st.rotateX(Math.PI/2);
        st.translate(x+a[0]*sg*e+o[0]*0.01,y+a[1]*sg*e+o[1]*0.01,z+a[2]*sg*e+o[2]*0.01); g.add(new THREE.Mesh(st,mat.handle)); });
      return bar; };
    return b; }
  function buildItem(it){
    const g=new THREE.Group();
    g.userData={id:it.id,type:it.type,room:it.room,layer:it.layer,pos:it.pos.slice(),rot:it.rot||0,size:it.size.slice(),fixed:it.fixed||null,attach:it.attach||null,proxy:[]};
    it.build(makeB(g),g);
    LAYERS[it.layer].add(g); ITEM_GROUPS[it.id]=g;
    poseGroup(g);
    if(it.glb){ g.userData.glb=it.glb; g.userData.glbRot=it.glbRot||0; g.userData.glbFacade=it.glbFacade; } // glbFacade:false — no back to compare (toilet seat, symmetric tops)
    return g;
  }
  // GLB model of an item: the procedural build stays as fallback and proxy; on success its meshes are replaced by the model.
  // Material names inside the GLB are ITEM_MATS keys or slot names (fabric/wood/paint/metal; `paint` in a GLB is the cabinetPaint slot) → same grey concept materials, VIZ twins keep working.
  const GLB_MATS={fabric:mat.sofa,metal:mat.frame,wood:mat.table,paint:mat.chair,chrome:mat.handle,glass:mat.glass,plastic:mat.plastic,ceramic:mat.ceramic,acrylic:mat.acrylic,leather:mat.leather,mirror:mat.mirror,led:mat.led,upholstery:mat.sofa,piping:mat.sofa,cover:mat.cushion}; // slot or coating name in the GLB → grey concept material carrying that slot
  const slotMat=n=>{ if(mat[n]&&!GLB_MATS[n]) return mat[n]; if(!GLB_MATS[n]){ console.warn('glb: unknown material "'+n+'", grey used'); GLB_MATS[n]=M(0x8c8c8c); GLB_MATS[n].userData.slot=n; } return GLB_MATS[n]; };
  // Model checks on load (console warnings, never exceptions): metres, Box3 inside size ±1 cm, bottom at y=0, pivot at the NW corner,
  // facade like the procedural version (centroid of the top quarter offset from the footprint centre points the same way — back of a chair/sofa).
  // vertices of root's meshes in the frame of `frame` (the item group, or root itself when detached): bounding box and top-quarter centroid
  const scan=(root,h,frame)=>{ frame=frame||root; frame.updateMatrixWorld(true); root.updateMatrixWorld(true); const inv=new THREE.Matrix4().copy(frame.matrixWorld).invert(), v=new THREE.Vector3(), c=new THREE.Vector3(), bb=new THREE.Box3(); let n=0;
    root.traverse(o=>{ if(!o.isMesh) return; const p=o.geometry.attributes.position; for(let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).applyMatrix4(inv); bb.expandByPoint(v); if(v.y>0.75*h){ c.add(v); n++; } } });
    return {bb,top:n?c.divideScalar(n):null}; };
  function validateItemGlb(id,model,ref){ // ref: procedural group or its scan() {bb,top} computed before removal
    const g=ITEM_GROUPS[id], sz=g.userData.size, out=[], warn=m=>{ out.push(m); console.warn('glb '+id+': '+m); };
    if(ref&&ref.isObject3D) ref=scan(ref,sz[1]);
    const {bb,top:b}=scan(model,sz[1],model.parent||model), e=new THREE.Vector3(), floor=ref&&ref.bb.min.y>0.15?ref.bb.min.y:0; bb.getSize(e); // floor-standing items must touch y=0, wall-hung ones hang where the procedural version did // wall-hung items float like their procedural version
    const r=Math.max(e.x,e.y,e.z)/Math.max(...sz); if(r>2||r<0.5) warn('units: model extent '+e.toArray().map(v=>v.toFixed(2)).join('×')+' vs size '+sz.join('×')+' — not metres?');
    else{ if(bb.min.x<-0.01||bb.min.z<-0.01||bb.max.x>sz[0]+0.01||bb.max.y>sz[1]+0.01||bb.max.z>sz[2]+0.01) warn('outside size: '+[bb.min.x,bb.min.z,bb.max.x,bb.max.y,bb.max.z].map(v=>v.toFixed(3)).join(' ')+' vs '+sz.join('×')+' (pivot must be the NW corner)');
      if(Math.abs(bb.min.y-floor)>0.01) warn('bottom at y='+bb.min.y.toFixed(3)+', expected '+floor.toFixed(3)); }
    if(ref){ const a=ref.top, cx=sz[0]/2, cz=sz[2]/2;
      if(a&&b){ const ax=a.x-cx, az=a.z-cz, bx=b.x-cx, bz=b.z-cz, la=Math.hypot(ax,az), lb=Math.hypot(bx,bz);
        if(g.userData.glbFacade!==false&&la>0.02&&(lb<0.01||(ax*bx+az*bz)/(la*lb)<0.5)) warn('facade: back points to ('+bx.toFixed(2)+','+bz.toFixed(2)+'), procedural ('+ax.toFixed(2)+','+az.toFixed(2)+')'); } }
    return out;
  }
  window.validateItemGlb=validateItemGlb;
  const GLB_CACHE={}; // url → promise of the loaded scene; items sharing a file get clones with shared geometry (6 chairs = one geometry)
  const fetchGlb=url=>GLB_CACHE[url]||(GLB_CACHE[url]=new Promise((res,rej)=>{ if(typeof THREE.GLTFLoader!=='function') return rej(new Error('no GLTFLoader'));
    new THREE.GLTFLoader().load(url,gltf=>{ gltf.scene.traverse(o=>{ if(o.isMesh){ const name=o.material.name; o.userData.glbMat=name; o.material.dispose(); o.material=slotMat(name.split('#')[0]); } }); res(gltf.scene); },undefined,rej); })); // glbMat = coating name from the generator, survives clone() for M1a presets; 'slot#tag' = same material but its own mesh (BED3 moves podium parts apart)
  function loadItemGlb(id,url){
    const g=ITEM_GROUPS[id]; url=url||g.userData.glb;
    return fetchGlb(url).then(scene=>{
      if(g.userData.noGlb||g.userData.glb!==url) return; // a procedural variant is showing (DESK2 B) or another model was chosen meanwhile (ROOM4): keep it
      const model=scene.clone(), sz=g.userData.size, ref=scan(g,sz[1]);
      if(g.userData.glbRot){ const a=-g.userData.glbRot*Math.PI/180, cx=sz[0]/2, cz=sz[2]/2; model.rotation.y=a; model.position.set(cx-(cx*Math.cos(a)+cz*Math.sin(a)),0,cz-(-cx*Math.sin(a)+cz*Math.cos(a))); } // turn about the footprint centre, same sense as rot
      const old=g.children.slice(); g.add(model);
      g.userData.glbWarnings=validateItemGlb(id,model,ref);
      old.forEach(c=>{ g.remove(c); c.traverse(o=>{ if(o.isMesh) o.geometry.dispose(); }); }); // procedural fallback out, its geometry freed
      g.userData.glbLoaded=url;
      if(window.VIZ&&VIZ.adopt) VIZ.adopt(g);
      return true;
    },e=>{ VIZ.loadErrors=(VIZ.loadErrors||[]).concat(id+': '+url); return false; });
  }
  window.loadItemGlb=loadItemGlb;
  function poseGroup(g){ const u=g.userData; g.position.set(u.pos[0],0,u.pos[1]); g.rotation.y=-u.rot*Math.PI/180; g.updateMatrixWorld(true); rebuildPhys(g.userData.id); }
  const physMat=new THREE.MeshBasicMaterial({visible:false});
  function rebuildPhys(id){
    (PHYS[id]||[]).forEach(m=>{ physGroup.remove(m); m.geometry.dispose(); }); PHYS[id]=[];
    const g=ITEM_GROUPS[id], boxes=[]; if(g.userData.hidden) return; // variant «нет»: no collision, no layout warnings
    if(g.userData.proxy.length) g.userData.proxy.forEach(([x0,x1,y0,y1,z0,z1])=>boxes.push(new THREE.Box3(new THREE.Vector3(x0,y0,z0),new THREE.Vector3(x1,y1,z1)).applyMatrix4(g.matrixWorld)));
    else g.traverse(o=>{ if(o.isMesh) boxes.push(new THREE.Box3().setFromObject(o)); }); // fallback for simple block items
    boxes.forEach(bb=>{ const sz=new THREE.Vector3(); bb.getSize(sz);
      const m=new THREE.Mesh(new THREE.BoxGeometry(sz.x,sz.y,sz.z),physMat); bb.getCenter(m.position); m.userData.item=id; physGroup.add(m); PHYS[id].push(m); });
  }
  ITEMS.forEach(buildItem);
  window.addEventListener('DOMContentLoaded',()=>ITEMS.forEach(it=>{ if(it.glb) loadItemGlb(it.id); })); // after materials.js (VIZ, MATERIALS) ran
  physGroup.updateMatrixWorld(true);
  window.ITEMS=ITEMS;
  // fingerprint of the geometry and catalogue: saved poses/marks carry it, a mismatch is reported instead of applied silently (A05)
  window.SCENE_REV=(function(){ const s=JSON.stringify(PLAN)+ITEMS.map(i=>i.id+i.size.join()).join(); let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return (h>>>0).toString(16); })();
  // item corners on the plan (top view) with rotation — for markup, snapping and collisions
  window.itemCorners=function(id){
    const u=ITEM_GROUPS[id].userData, a=u.rot*Math.PI/180, c=Math.cos(a), s=Math.sin(a), [x,z]=u.pos, [w,,d]=u.size;
    return [[0,0],[w,0],[w,d],[0,d]].map(([p,q])=>[x+p*c-q*s, z+p*s+q*c]);
  };
  // move: new anchor and/or rotation; parts move with the group, neighbours are untouched
  // the one pose operation: group, physics, then dependants (markup binds, layout selection) via POSE_HOOKS (B02/B03)
  window.POSE_HOOKS=[];
  window.setItemPose=function(id,pos,rot){ const g=ITEM_GROUPS[id]; if(!g) return null; if(pos) g.userData.pos=pos.slice(); if(rot!=null) g.userData.rot=rot; poseGroup(g); physGroup.updateMatrixWorld(true); POSE_HOOKS.forEach(f=>f(id)); return g; };
  // ---- kids' loft bed variants (select #kidbed): original | timber (A) | steel (B). Rebuilds both beds in place: same pose and PHYS, lights and the
  // group's LED clone stay, materials are shared so only geometry is disposed. Wood details of A/B wear the oak coating; the rest follows BED.
  const KID_LOFT={kidbed:{L:2.0,R:1.4,tread:0.28,E:0.8,n:8},kidbed2:{L:1.85,R:1.2,tread:0.24,E:0.35,n:7}}; // gentle (D): room 1 run +0.80 with 8 rises; room 2 only +0.35 (socket sock12 at x 13.83) with 7 rises
  const KIDBED_VARIANTS={original:p=>kidBedBuild(p.L,mat.wdoor,mat.cushion,p.tread),timber:p=>kidLoftBuild('timber',p.L,p.R),steel:p=>kidLoftBuild('steel',p.L,p.R),
    ladder:p=>kidLoftBuild('steel',p.L,p.R,{stairs:'ladder'}),gentle:p=>kidLoftBuild('timber',p.L,p.R,{stairs:'gentle',E:p.E,n:p.n,jog:p.jog}),loft:p=>kidLoftBuild('steel',p.L,p.R,{stairs:'wood',guard:'glass'})};
  function rebuildItem(id,build,coat){ const g=ITEM_GROUPS[id]; let led=null;
    g.children.slice().forEach(o=>{ if(o.isGroup){ g.remove(o); g.userData.glbLoaded=null; return; } if(!o.isMesh) return; if(o.material.name&&o.material.name.startsWith('led:')) led=o.material; g.remove(o); o.geometry.dispose(); }); // GLB clones share geometry with their siblings: removed, not disposed
    g.userData.proxy=[]; g.userData.coat=coat; build(makeB(g),g); if(led) g.traverse(o=>{ if(o.isMesh&&o.material===mat.led) o.material=led; });
    if(window.VIZ) VIZ.adopt(g); setItemPose(id); }
  // one select per room (#bed1 → kidbed, #bed2 → kidbed2, default F); KIDBED.set(v) without id rebuilds both (check.js), KIDBED.variant is 'mixed' when the rooms differ
  window.KIDBED={value:{kidbed:'original',kidbed2:'original'},variants:Object.keys(KIDBED_VARIANTS),get variant(){ const v=KIDBED.value; return v.kidbed===v.kidbed2?v.kidbed:'mixed'; },
    set(v,id){ if(!KIDBED_VARIANTS[v]) return; (id?[id]:Object.keys(KID_LOFT)).forEach(id=>{ if(KIDBED.value[id]===v) return; KIDBED.value[id]=v;
      rebuildItem(id,KIDBED_VARIANTS[v](KID_LOFT[id]),v==='original'?undefined:Object.assign({table:'oakFurniture'},BED)); }); }};
  [['bed1','kidbed'],['bed2','kidbed2']].forEach(([sid,id])=>{ const KEY='pulse3d.'+sid, sel=document.getElementById(sid); if(!sel) return; let v=sel.value; try{ v=localStorage.getItem(KEY)||v; }catch(e){}
    if(KIDBED_VARIANTS[v]){ sel.value=v; KIDBED.set(v,id); } sel.addEventListener('change',()=>{ try{ localStorage.setItem(KEY,sel.value); }catch(e){} KIDBED.set(sel.value,id); }); });
  // ---- room 2 desk + chair variants (select #desk2): A — the original items (desk-pedestal, GLB chair); B (default, .local/детская_лев.png) — oak top on a black steel frame
  // with one drawer box, round upholstered tub chair on a cross base. Same pos/size, own proxy boxes; A reloads its GLB, B blocks the startup load (noGlb).
  const DESK2_B={
    kiddesk2:b=>{ const st=mat.frame, wood=mat.table; b.phys(0,0.75,0.64,0.72,0,1.65); b.phys(0.03,0.72,0,0.68,0.03,0.07); b.phys(0.03,0.72,0,0.68,1.58,1.62); b.phys(0.08,0.70,0.55,0.68,1.12,1.56);
      b.round(0,0.75,0.68,0.72,0,1.65,0.004,wood);                                                                             // 40 mm oak top, front edge at x 0.75
      [0.03,1.58].forEach(z=>{ [0.05,0.68].forEach(x=>b(x,x+0.04,0,0.68,z,z+0.04,st)); b(0.05,0.72,0.64,0.68,z,z+0.04,st); }); // two U-frames of 40×40 tube
      b(0.68,0.72,0.10,0.14,0.07,1.58,st);                                                                                     // front stretcher
      b.round(0.08,0.70,0.55,0.68,1.12,1.56,0.003,wood); b(0.70,0.705,0.63,0.65,1.18,1.50,mat.dark); },                        // drawer box under the top, recessed grip
    kidchair2:(b,g)=>{ const cx=0.275, cz=0.275; b.phys(0.075,0.475,0.02,0.045,0.075,0.475); b.phys(0.25,0.30,0.045,0.40,0.25,0.30); b.phys(0.025,0.525,0.40,0.47,0.025,0.525); b.phys(0.35,0.55,0.45,0.82,0.02,0.53);
      b(0.075,0.475,0.02,0.045,0.26,0.29,mat.frame); b(0.26,0.29,0.02,0.045,0.075,0.475,mat.frame); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.36,16).translate(cx,0.225,cz),mat.frame)); // cross base and column
      lathe(g,[[0,0.40],[0.23,0.40],[0.25,0.42],[0.25,0.46],[0.23,0.47],[0,0.47]],cx,cz,mat.cushion);                          // round seat pad Ø0.50
      const sh=new THREE.Shape(); sh.absarc(cx,-cz,0.27,-1.2,1.2,false); sh.absarc(cx,-cz,0.24,1.2,-1.2,true);                   // tub back: 30 mm shell over 137°, open towards the desk (-x)
      g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:0.37,bevelEnabled:false,curveSegments:16}).rotateX(-Math.PI/2).translate(0,0.45,0),mat.cushion)); } };
  window.DESK2={variant:'A',set(v){ if(v===DESK2.variant||!(v==='A'||v==='B')) return; DESK2.variant=v;
    ['kiddesk2','kidchair2'].forEach(id=>{ const it=ITEMS.find(i=>i.id===id), g=ITEM_GROUPS[id]; g.userData.noGlb=v==='B';
      rebuildItem(id,v==='B'?DESK2_B[id]:it.build,v==='B'?(id==='kiddesk2'?{table:'oakFurniture'}:{cushion:'sofaWeave'}):it.coat); if(v==='A'&&it.glb) loadItemGlb(id); }); }};
  // ---- room 4 variant selects (#k4*): 'none' hides the items (group invisible, physics dropped), 'A' = items.js as is, 'B' = own build/pos/size below
  const hideItem=(id,h)=>{ const g=ITEM_GROUPS[id]; g.visible=!h; g.userData.hidden=h; rebuildPhys(id); };
  ITEMS.forEach(it=>{ if(it.hidden) hideItem(it.id,true); }); // items that only a variant shows (bar stools)
  // sofa variants B–G (tools/models/sofa4.js): [w,h,d, chaise side E/W or null, chaise width, seat depth]; all keep A's SE corner (east edge SOFA_E, back on the south wall)
  const SOFA4={B:[2.40,0.78,1.60,'E',0.90,0.95,false],C:[2.60,0.87,1.85,'E',0.95,0.95],D:[2.60,0.87,1.85,'W',0.95,0.95],E:[2.50,0.90,1.55,'W',0.85,0.95,false],F:[2.20,0.68,0.95,null,0,0.95],G:[2.30,0.87,1.50,'E',0.80,0.95]}; // 7th = glbFacade:false (wrap-around back / leaning cushions confuse the validator)
  const sofaV=([w,h,d,side,cw,sd,facade],k)=>({pos:[+(SOFA_E-w).toFixed(3),6.287-d],size:[w,h,d],glb:'models/sofa'+k+'.glb',glbFacade:facade,coat:ITEMS.find(i=>i.id==='sofa').coat,build:b=>{ // fallback + proxy: seat run, chaise, back strip
    const x0=side==='W'?cw:0, x1=side==='E'?w-cw:w, c0=side==='W'?0:w-cw, c1=side==='W'?cw:w;
    b.phys(x0,x1,0.05,0.42,d-sd,d); if(side) b.phys(c0,c1,0.05,0.42,0,d); b.phys(0,w,0.42,h,d-0.2,d);
    b(x0,x1,0.05,0.42,d-sd,d,mat.sofa); if(side) b(c0,c1,0.05,0.42,0,d,mat.sofa); b(0,w,0.42,h,d-0.2,d,mat.cushion); }});
  const kitchenV=(mode,w,coat)=>({pos:[8.23,KN],size:[w,2.69,3.59],coat:Object.assign({},ITEMS.find(i=>i.id==='kitchen').coat,coat),build:(b,g)=>kitchenBuild(b,g,mode)});
  const led8V=L=>({pos:[8.55,2.575],size:[0.03,1.45,L],build(b){ b.led(0,0.03,1.43,1.45,0,L); }}), LED8_F=led8V(1.63), LED8_I=led8V(1.53); // F/G/H: the strip ends with the wall units at z 2.29; I: fridge column from 2.19
  const STOOL_ITEMS=Object.fromEntries(Object.entries(STOOLS).map(([id,st])=>[id,stoolSpec(st)]));
  const WOOD_UP={upper:'oakFurniture'}; // D/E (user 2026-09-10, .local/kitchen-wood): A/B as they are, wall-unit doors in oak
  // dining table B (.local/examples2): stadium-shaped oak top 0.90×1.80 on two round drums, same centre as A so the six chairs keep their places
  const TABLE_B={pos:[9.80,KN+0.04],size:[0.90,0.76,1.80],coat:{table:'oakFurniture'},build:(b,g)=>{
    b.phys(0,0.90,0.72,0.76,0,1.80); [0.45,1.35].forEach(z=>b.phys(0.26,0.64,0,0.72,z-0.19,z+0.19));
    g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(b.rrect(0.892,1.792,0.446),{depth:0.032,bevelThickness:0.004,bevelSize:0.004,bevelSegments:2,curveSegments:24}).rotateX(Math.PI/2).translate(0.004,0.756,0.004),mat.table));
    [0.45,1.35].forEach(z=>lathe(g,[[0,0],[0.19,0],[0.19,0.60],[0.16,0.66],[0.16,0.72],[0,0.72]],0.45,z,mat.table,24)); }};
  // dining tables C/D (user 2026-09-10): light pine, four chairs each, set off the north wall so the north chair stands 0.60 south of kitchen B's fridge column (z 2.645); same centre for both
  const PINE={table:'pineFurniture'}, ptop=(b,g,w,d,r,seg)=>g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(b.rrect(w-0.008,d-0.008,r),{depth:0.032,bevelThickness:0.004,bevelSize:0.004,bevelSegments:2,curveSegments:seg}).rotateX(Math.PI/2).translate(0.004,0.756,0.004),mat.table)); // 40 mm top with a 4 mm bevel, 0.72–0.76
  const TABLE_C={pos:[9.85,3.505],size:[0.80,0.76,1.00],coat:PINE,build:(b,g)=>{ b.phys(0,0.80,0.72,0.76,0,1.00); [[0.06,0.06],[0.70,0.06],[0.06,0.90],[0.70,0.90]].forEach(([x,z])=>b.phys(x,x+0.05,0,0.72,z,z+0.05));
    ptop(b,g,0.80,1.00,0.08,16); [[0.085,0.085],[0.715,0.085],[0.085,0.915],[0.715,0.915]].forEach(([x,z])=>lathe(g,[[0,0],[0.025,0],[0.02,0.72],[0,0.72]],x,z,mat.table,16)); }}; // round legs Ø50 tapering to Ø40 under the top
  const TABLE_D={pos:[9.80,3.555],size:[0.90,0.76,0.90],coat:PINE,build:(b,g)=>{ b.phys(0,0.90,0.72,0.76,0,0.90); b.phys(0.225,0.675,0,0.72,0.225,0.675);
    ptop(b,g,0.90,0.90,0.446,48); lathe(g,[[0,0],[0.225,0],[0.225,0.03],[0.14,0.66],[0.14,0.72],[0,0.72]],0.45,0.45,mat.table,48); }}; // conical drum Ø0.45 at the floor, Ø0.28 under the top
  const ch4=(x,z,side,rot)=>({pos:[x,z],size:[0.48,0.8,0.48],glb:'models/chair.glb',glbRot:rot,coat:CHAIR4,build:chair(side)}); // chairs tucked 0.15–0.17 under the top edge
  const SET_C={table:TABLE_C,chair1:ch4(9.52,3.515,'W',90),chair2:ch4(9.52,4.015,'W',90),chair3:ch4(10.50,3.515,'E',-90),chair4:ch4(10.50,4.015,'E',-90),chair5:null,chair6:null};
  const SET_D={table:TABLE_D,chair1:ch4(9.49,3.765,'W',90),chair2:ch4(10.53,3.765,'E',-90),chair3:ch4(10.01,3.245,'N',180),chair4:ch4(10.01,4.285,'S',0),chair5:null,chair6:null};
  const R4={table:{ids:['table','chair1','chair2','chair3','chair4','chair5','chair6'],V:{B:{items:{table:TABLE_B}},C:{items:SET_C},D:{items:SET_D}}},sofa:{ids:['sofa'],V:Object.fromEntries(Object.entries(SOFA4).map(([k,v])=>[k,sofaV(v,k)]))},
    kitchen:{ids:['kitchen','lamp','led8','stool1','stool2','stool3','stool4'],V:{B:{items:{kitchen:kitchenV('B',2.23),lamp:null}},D:{items:{kitchen:kitchenV('A',0.74,WOOD_UP)}},E:{items:{kitchen:kitchenV('B',2.23,WOOD_UP),lamp:null}},
      F:{items:{kitchen:kitchenV('F',1.43),led8:LED8_F}},G:{items:{kitchen:kitchenV('G',1.43),led8:LED8_F}},H:{items:Object.assign({kitchen:kitchenV('H',PX1),led8:LED8_F},STOOL_ITEMS),pick:{table:'none'}},I:{items:Object.assign({kitchen:kitchenV('I',PX1),led8:LED8_I},STOOL_ITEMS),pick:{table:'none'}}}}, // the peninsula stands where the dining sets are: H switches the table off // lamp over the table sits inside B's fridge column: hidden in B/E; F's wall units end at z 2.29, so the LED strip stops there too
   
    decortv:{ids:['decortv'],V:Object.fromEntries(Object.keys(DECOR_TV).map(k=>{ const w=DEC_TV_W[k]||2.52; return [k,{pos:[10.95+2.52-w,KN],size:[w,2.7,{F:0.27,G:0.22}[k]||0.02],coat:k==='D'?DEC.floorCoat:DEC.coat,build:DECOR_TV[k]}]; }))}, // F/G: shelves stand off the wall
    decorsofa:{ids:['decorsofa'],V:Object.fromEntries(Object.keys(DECOR_SOFA).map(k=>[k,{pos:[13.47,6.287],size:[2.51,2.7,0.06],coat:DEC.floorCoat,build:DECOR_SOFA[k]}]))},
    console:{ids:['console'],V:{B:{pos:[11.775,KN],size:[1.45,0.34,0.42],coat:{cabinetPaint:'hplWhite'},build:b=>{ b.phys(0,1.45,0,0.34,0,0.42); b.round(0,1.45,0,0.34,0,0.42,0.004,mat.wbody); }}}}, // B: floor plinth 0.34 high (user: +0.20), 250 mm longer than A, centred under the tv (.local/консоль.png)
    tv:{ids:['tv'],V:{B:{pos:[11.72,KN+0.02],size:[1.56,1.825,0.04],build:(b,g)=>{ ITEMS.find(i=>i.id==='tv').build(b,g); g.userData.proxy=[[0,1.56,0.925,1.825,0,0.04]]; // B: A scaled 1.2 (58" → 70") about the screen centre, still on the wall
      g.children.forEach(m=>{ if(!m.isMesh) return; m.geometry.translate(m.position.x-0.65,m.position.y-1.375,m.position.z).scale(1.2,1.2,1).translate(0.78,1.375,0); m.position.set(0,0,0); }); }}}}};
  // ---- room 3 vanity variants (select #m3vanity, one reference picture from .local/examples each): A — items.js as is (fluted
  // 1.00 console with a second drawer, round Ø0.90 mirror with a LED halo). Every variant keeps the pouf, hangs the console on
  // the north wall with its east edge at x 12.72 at least 0.40 deep, and centres the mirror over it. At rot 180 local x runs
  // east→west and local z = D is the wall, z = 0 the room side.
  const disc3=(b,g,d,x,y,z,t,m)=>{ const o=new THREE.Mesh(new THREE.ExtrudeGeometry(b.rrect(d,d,d/2),{depth:t,bevelEnabled:false,curveSegments:48}),m); o.position.set(x,y,z); g.add(o); return o; }; // rrect with r = d/2 is a circle
  const roundMirror=(D,y0,frame)=>(b,g)=>{ b.phys(0,D,y0,y0+D,0,0.03); disc3(b,g,D,0,y0,0.008,0.022,frame); disc3(b,g,D-0.04,0.02,y0+0.02,0.003,0.005,mat.mirror); }; // metal backing, 5 mm glass facing the room
  const VAN=(W,Y,D,coat,build,x)=>({pos:[x||12.72,10.227],size:[W,Y,D],coat,build}); // x — восточный край, по умолчанию 12.72
  // полукруглые зеркала (2026-09-12): a0 задаёт, куда смотрит выпуклая часть, box — габарит половины в локальных координатах
  const halfMirror=(r,a0,X,Y,box)=>(b,g)=>{ const arc=(R,z,t,m)=>{ const sh=new THREE.Shape(); sh.absarc(X,Y,R,a0,a0+Math.PI,false);
      const o=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:t,bevelEnabled:false,curveSegments:64}),m); o.position.z=z; g.add(o); };
    b.phys(box[0],box[1],box[2],box[3],0,0.03); arc(r,0.008,0.022,mat.frame); arc(r-0.02,0.003,0.005,mat.mirror); }; // подложка и стекло на 2 см меньше радиусом
  // прямоугольное зеркало со скруглёнными углами: подложка и стекло на 2 см меньше по каждой стороне
  const rectMirror=(W,H,r,y0)=>(b,g)=>{ b.phys(0,W,y0,y0+H,0,0.03);
    const plate=(w,h,x,y,z,t,m)=>{ const o=new THREE.Mesh(new THREE.ExtrudeGeometry(b.rrect(w,h,r),{depth:t,bevelEnabled:false,curveSegments:24}),m); o.position.set(x,y,z); g.add(o); };
    plate(W,H,0,y0,0.008,0.022,mat.frame); plate(W-0.04,H-0.04,0.02,y0+0.02,0.003,0.005,mat.mirror); };
  const VMIR=(W,Y,cx,build)=>({pos:[cx+W/2,9.827],size:[W,Y,0.03],build}); // cx — centre of the console in world x
  const VAN_V={ // one spec set, two selects: the console and the mirror are picked independently (#m3vtable, #m3vmirror)

    B:{items:{ // 17-47: slim floating console with one long drawer and a LED strip under it, rounded edges; since 2026-09-12 centred like A (11.92)
      vanity:VAN(1.20,0.76,0.42,CAB,b=>{ b.phys(0,1.20,0.58,0.76,0,0.42);
        b.round(0,1.20,0.72,0.76,0,0.42,0.02,mat.body); b.round(0.02,1.18,0.58,0.72,0.03,0.42,0.03,mat.body); b.led(0.10,1.10,0.565,0.575,0.30,0.34); },12.52)}},
    E:{items:{ // 17-49: round Ø0.75 mirror in a thin frame, over the centre of console A
      vmirror:VMIR(0.75,1.85,11.92,roundMirror(0.75,1.10,mat.frame))}},
    F:{items:{ // прямоугольник 1.20 × 1.50 со скруглёнными углами r 0.15, низ 0.80 над столиком (.local/mirrrow.png)
      vmirror:VMIR(1.20,2.30,11.92,rectMirror(1.20,1.50,0.15,0.80))}},
    G:{items:{ // полукруг R0.60 прямой стороной к входной двери (запад), прямая часть по левому краю столика A (x 11.42), выпуклость на восток
      vmirror:VMIR(0.60,2.00,11.72,halfMirror(0.60,Math.PI/2,0.60,1.40,[0,0.60,0.80,2.00]))}}};
  const R3={vtable:{ids:['vanity'],V:VAN_V},vmirror:{ids:['vmirror'],V:VAN_V},curtain:{ids:['mcurtain']},reveal:{ids:['reveal3']}}; // keys without V: only «нет»/A // spec() reads only its own id from items, so the same set serves both
  // a variant with its own glb reloads it after the procedural rebuild; loadItemGlb drops a model whose url is no longer userData.glb (fast switching)
  const spec=(V,it)=>V?(V.items?V.items[it.id]:V):it; // a variant is one spec for every id of the group, or items:{id:spec|null} (null = hidden)
  const COAT_HOOKS=[]; // colour selects re-apply their coating after a layout variant has rebuilt the item
  // one API per room: select id = <prefix><key>, saved under pulse3d.<prefix>.<key>
  function variantSelects(prefix,R){
    const API={value:{},set(key,v){ const r=R[key], V=r&&r.V&&r.V[v]; if(!r||!(v==='none'||v==='A'||V)||API.value[key]===v) return; const was=API.value[key]; API.value[key]=v;
      r.ids.forEach(id=>{ const it=ITEMS.find(i=>i.id===id), g=ITEM_GROUPS[id], src=spec(V,it)||it;
        if(V||(r.V&&r.V[was])){ g.userData.pos=src.pos.slice(); g.userData.size=src.size.slice(); g.userData.glb=src.glb; g.userData.glbRot=src.glbRot||0; g.userData.glbFacade=src.glbFacade; rebuildItem(id,src.build,src.coat); if(src.glb) loadItemGlb(id); if(window.LAY) LAY.rebase(id); }
        const sp=spec(V,it); hideItem(id,v==='none'||sp===null||(it.hidden&&(!sp||sp===it))); }); /* hidden items (bar stools) show only where a variant spells them out */ COAT_HOOKS.forEach(f=>f(r.ids)); if(V&&V.pick) Object.entries(V.pick).forEach(([k,x])=>API.pick(k,x)); }, // V.pick: a variant that forces another select (kitchen H hides the table)
      pick(key,v){ const sel=document.getElementById(prefix+key); if(sel){ sel.value=v; try{ localStorage.setItem('pulse3d.'+prefix+'.'+key,v); }catch(e){} } API.set(key,v); }};
    Object.keys(R).forEach(key=>{ const KEY='pulse3d.'+prefix+'.'+key, sel=document.getElementById(prefix+key); if(!sel) return; API.value[key]='A'; let v=sel.value; try{ v=localStorage.getItem(KEY)||v; }catch(e){}
      if([...sel.options].some(o=>o.value===v)){ sel.value=v; API.set(key,v); } sel.addEventListener('change',()=>{ try{ localStorage.setItem(KEY,sel.value); }catch(e){} API.set(key,sel.value); }); });
    return API; }
  window.ROOM4=variantSelects('k4',R4); window.ROOM3=variantSelects('m3',R3);
  window.KID1=variantSelects('r1',{sofa:{ids:['kidsofa']},rug:{ids:['kidrug']},curtain:{ids:['curtain']},reveal:{ids:['reveal1']}});
  window.KID2=variantSelects('r2',{rug:{ids:['kidrug2']},curtain:{ids:['blind2']},reveal:{ids:['reveal2']}});
  // ванна B (.local/11.png, .local/12.png): прямоугольная 0.70 × 1.60 с плоской кромкой, внутренняя чаша — стадион, глухой экран до пола
  const TUB_B={pos:[8.172,8.122],size:[0.99,0.58,1.625],build(b,g){
    const W=0.99, L=1.625, Y=0.58, rim=0.045, t=0.012, bot=0.15;                      // во всю нишу: от северной стены до короба инсталляции; кромка 45 мм, акрил 12 мм, дно 0.12–0.15
    const rr=(P,x0,y0,w,h,r)=>{ const p=new P(); r=Math.min(r,w/2,h/2);               // скруглённый прямоугольник со сдвигом: b.rrect строит только от (0,0)
      p.moveTo(x0+r,y0); p.lineTo(x0+w-r,y0); p.absarc(x0+w-r,y0+r,r,-Math.PI/2,0,false);
      p.lineTo(x0+w,y0+h-r); p.absarc(x0+w-r,y0+h-r,r,0,Math.PI/2,false);
      p.lineTo(x0+r,y0+h); p.absarc(x0+r,y0+h-r,r,Math.PI/2,Math.PI,false);
      p.lineTo(x0,y0+r); p.absarc(x0+r,y0+r,r,Math.PI,Math.PI*1.5,false); return p; };
    const rect=(i,r)=>[i,-L+i,W-2*i,L-2*i,r===undefined?(W-2*i)/2:r];                 // вписанный с отступом i; радиус по умолчанию — половина ширины, то есть стадион
    const face=(o,hole,y0,y1,m)=>{ const sh=rr(THREE.Shape,...o); if(hole) sh.holes.push(rr(THREE.Path,...hole)); // фигура в (x,-z), как slice() у ванны A
      const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:y1-y0,bevelEnabled:false,curveSegments:24}),m); mesh.rotation.x=-Math.PI/2; mesh.position.y=y0; g.add(mesh); };
    b.phys(0,W,0,Y,0,L);
    face(rect(0,0.02),rect(rim),0,Y-0.02,mat.body);                                   // экран до пола с вырезом под чашу
    face(rect(rim),rect(rim+t),bot,Y,mat.kmat);                                       // стенка чаши: снаружи вырез экрана, внутри сама чаша
    face(rect(rim+t),null,bot-0.03,bot,mat.kmat);                                     // дно 0.12–0.15
    face(rect(0,0.02),rect(rim),Y-0.02,Y,mat.kmat);                                   // плоская кромка по периметру
    const d=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.005,16),mat.handle); d.position.set(W/2,bot+0.002,L-0.20); g.add(d); }}; // слив у южного торца, под смесителем
  window.BATH9=variantSelects('b9',{mirror:{ids:['bathmirror']},basin:{ids:['basin','basindrawer','basinmixer']},wc:{ids:['wc']},box:{ids:['wcbox','sock21']},light:{ids:['spot1','spot2']},mlight:{ids:['spot3']},towel:{ids:['towelrail']},tub:{ids:['tub'],V:{B:TUB_B}}});
  window.BATH8=variantSelects('b8',{wc:{ids:['wc8']},box:{ids:['wcbox8']},light:{ids:['spot4','spot5','spot6','cove8']},towel:{ids:['towel8']},glass:{ids:['glass8']}}); // no basin or mirror in room 8 yet: those selects only offer «нет»
  // ---- colour selects (#k4kbase/#k4kupper, #m3wbase/#m3wupper): a coating over the item's own coat, no rebuild.
  // 'A' keeps what the item or its layout variant declares (so kitchen D/E keep their oak wall units); any other value overrides it until switched back.
  const DECL={}; // coat as declared before a colour override, dropped when a layout variant rebuilds the item
  const setCoat=(id,key,c)=>{ const g=ITEM_GROUPS[id]; if(!g) return; if(window.VIZ&&VIZ.coat) return VIZ.coat(id,key,c); // materials.js loads after this file
    const cur=g.userData.coat=Object.assign({},(ITEMS.find(i=>i.id===id)||{}).coat,g.userData.coat); cur[key]=c; };
  // одна палитра на все цветовые селекты: значение → покрытие COATINGS, 'A' — как объявил сам предмет; опции строит fill, в разметке селект пустой
  const PALETTE=[['A','как в проекте'],['olive','оливковый','oliveFront'],['sage','шалфей','sageFront'],['avocado','авокадо','avocadoFront'],['pistachio','фисташковый','pistachioFront'],['jade','нефрит','jadeFront'],
    ['mushroom','грибной','mushroomFront'],['cherry','вишня','cherryFront'],['walnut','ореховый','walnutFront'],['pine','сосна','pineFront'],['cream','кремовый','creamFront'],['white','белый','whiteFront'],['whiteoak','белёный дуб','whiteOakFront']];
  const PAL=Object.fromEntries(PALETTE.filter(p=>p[2]).map(p=>[p[0],p[2]]));
  function colorSelects(defs){ const recs=[];
    const fill=(sel,def)=>PALETTE.forEach(([v,name])=>{ const o=document.createElement('option'); o.value=v; o.textContent=name; o.defaultSelected=o.selected=(v===(def||'A')); sel.appendChild(o); });
    const paint=({d,sel})=>d.ids.forEach(id=>{ const g=ITEM_GROUPS[id]; if(!g) return;
      const base=DECL[id]||(DECL[id]=Object.assign({},(ITEMS.find(i=>i.id===id)||{}).coat,g.userData.coat));
      d.keys.forEach(k=>setCoat(id,k,sel.value==='A'?base[k]:PAL[sel.value])); });
    defs.forEach(d=>{ const sel=document.getElementById(d.sel); if(!sel) return; const KEY='pulse3d.'+d.sel; if(!sel.options.length) fill(sel,d.def);
      let v=sel.value; try{ v=localStorage.getItem(KEY)||v; }catch(e){} if([...sel.options].some(o=>o.value===v)) sel.value=v;
      const rec={d,sel}; recs.push(rec); paint(rec);
      sel.addEventListener('change',()=>{ try{ localStorage.setItem(KEY,sel.value); }catch(e){} paint(rec); }); });
    COAT_HOOKS.push(ids=>{ const hit=recs.filter(r=>r.d.ids.some(i=>ids.indexOf(i)>=0)); if(!hit.length) return;
      hit.forEach(r=>r.d.ids.forEach(i=>{ delete DECL[i]; })); hit.forEach(paint); }); }
  colorSelects([{sel:'k4kbase',ids:['kitchen'],keys:['base','hdark'],def:'sage'},{sel:'k4kupper',ids:['kitchen'],keys:['upper'],def:'A'},
    {sel:'m3wbase',ids:['mward'],keys:['cabinetPaint'],def:'sage'},{sel:'m3wupper',ids:['mcab'],keys:['cabinetPaint'],def:'mushroom'},
    {sel:'m3vcolor',ids:['vanity'],keys:['cabinetPaint'],def:'white'},
    {sel:'h5wbase',ids:['wardrobe'],keys:['body'],def:'whiteoak'},{sel:'h5wdoor',ids:['wardrobe'],keys:['door'],def:'whiteoak'},
    {sel:'r1desk',ids:['kiddesk','kidped'],keys:['cabinetPaint'],def:'cream'},{sel:'r1shelfa',ids:['kidshelf2'],keys:['cabinetPaint'],def:'cream'},
    {sel:'r1shelfb',ids:['kidshelf'],keys:['cabinetPaint'],def:'cream'},{sel:'r1shelfc',ids:['kidshelf3'],keys:['cabinetPaint'],def:'cream'},
    {sel:'r1chest',ids:['windowseat1'],keys:['cabinetPaint'],def:'cream'},
    {sel:'r2desk',ids:['kiddesk2','deskshelf2'],keys:['cabinetPaint'],def:'cream'},{sel:'r2shelfa',ids:['tower2n'],keys:['cabinetPaint'],def:'cream'},
    {sel:'r2shelfb',ids:['tower2s'],keys:['cabinetPaint'],def:'cream'},{sel:'r2chest',ids:['windowseat2'],keys:['cabinetPaint'],def:'cream'}]);
  (function(){ const KEY='pulse3d.desk2', sel=document.getElementById('desk2'); if(!sel) return; let v=sel.value; try{ v=localStorage.getItem(KEY)||v; }catch(e){}
    if(v==='A'||v==='B'){ sel.value=v; DESK2.set(v); } sel.addEventListener('change',()=>{ try{ localStorage.setItem(KEY,sel.value); }catch(e){} DESK2.set(sel.value); }); })();
})();
Object.values(LAYERS).forEach(g=>scene.add(g)); scene.add(physGroup);
document.getElementById('furn').addEventListener('change',e=>furnGroup.visible=e.target.checked);
document.getElementById('furnHall').addEventListener('change',e=>hallGroup.visible=e.target.checked);
document.getElementById('furnLaundry').addEventListener('change',e=>laundryGroup.visible=e.target.checked);
document.getElementById('furnKid').addEventListener('change',e=>kidGroup.visible=e.target.checked);
document.getElementById('furnKid2').addEventListener('change',e=>kid2Group.visible=e.target.checked);
document.getElementById('furnMaster').addEventListener('change',e=>masterGroup.visible=e.target.checked);
document.getElementById('furnBath').addEventListener('change',e=>bathGroup.visible=e.target.checked);
document.getElementById('furnBath2').addEventListener('change',e=>bath2Group.visible=e.target.checked);
document.getElementById('furnWardrobe').addEventListener('change',e=>wardrobeGroup.visible=e.target.checked);
document.getElementById('furnBalcony').addEventListener('change',e=>balconyGroup.visible=e.target.checked);
// room 3 bed podium length (select #bed3, default 'wall' since 2026-09-09): the GLB holds the 2.82 podium; the podium meshes scale from the headboard, the drawer fronts from the
// wardrobe edge (z 0.60) so the short variant keeps both drawers clear of it. Size and proxy follow, so physics and layout warnings stay honest.
(function(){
  const L0=2.82, WARD=0.60, NOTCH=2.494, KEY='pulse3d.bed3', sel=document.getElementById('bed3'); if(!sel) return;
  const LEN={normal:2.20,rug:L0,wall:+(13.144-(PLAN.rooms.find(r=>r.id===3).poly.reduce((m,p)=>Math.min(m,p[1]),1e9)+0.03)).toFixed(3)}; // to the finished north wall (30 mm of finish)
  function apply(){ const g=ITEM_GROUPS.mbed, L=LEN[sel.value]||L0;
    g.traverse(o=>{ if(!o.isMesh) return; const bb=o.geometry.boundingBox||o.geometry.computeBoundingBox()||o.geometry.boundingBox; if(o.userData.z0==null) o.userData.z0=o.position.z;
      if(bb.max.y+(o.position.y||0)>0.31) return; // podium and drawer parts live below 0.30 (unscaled y)
      if(bb.max.z<0.9) return; // wall strip south of the radiator cover: fixed
      const pivot=bb.min.z>2.4?NOTCH:bb.max.z-bb.min.z>2?0:WARD, f=Math.max(0,(L-pivot)/(L0-pivot)); o.visible=f>0; o.scale.z=f; o.position.z=pivot+(o.userData.z0-pivot)*f; }); // wall strip north of the cover grows from the cover end, drawers from the wardrobe edge
    g.userData.size[2]=L; g.userData.proxy[0][5]=L; setItemPose('mbed'); } // same pose: rebuilds physics and runs the pose hooks
  try{ const v=localStorage.getItem(KEY); if(v&&LEN[v]) sel.value=v; }catch(e){}
  sel.addEventListener('change',()=>{ try{ localStorage.setItem(KEY,sel.value); }catch(e){} apply(); });
  const t=setInterval(()=>{ const g=ITEM_GROUPS.mbed; if(g.userData.glbLoaded||(window.VIZ&&(VIZ.loadErrors||[]).some(s=>s.startsWith('mbed:')))){ clearInterval(t); apply(); } },200); // GLB replaces the fallback meshes, so scale after it lands
  window.BED3={apply,LEN};
})();
