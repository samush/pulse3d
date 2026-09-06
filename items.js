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
    glass:M(0xc3cbd2), frame:M(0x2e2e2e), pouf:M(0x8a8683), led:new THREE.MeshBasicMaterial({color:0xfff1cf}),
    wbody:M(0xc9c9c9), wdoor:M(0x6f6f6f), wpanel:M(0x9c9c9c),
    kbody:M(0xdadad6), kleg:M(0xbdbdb8), kmat:M(0xf0ede6), knob:M(0x4a4a4a),
    rail:new THREE.MeshLambertMaterial({color:0xbfd7e6,transparent:true,opacity:0.35}),
    cushion:M(0x9a9a9a), screen:M(0x2a2a2a), ring:M(0x2f2f2f), pillow:M(0xf7f5ef),
    oak:M(0xc9a97a), hpl:M(0xe7e2d8), terra:M(0xc2704e), fabric:M(0xb8ab9a), rug:M(0xd9cfc0), ochre:M(0xd08a5a),
    tulle:new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:0.3,side:THREE.DoubleSide}),
  };
  // material slot = physical class for the visualization twin (B04); concept colours stay grey, MATERIALS[slot] gives roughness/metalness/emissive
  const SLOTS={chrome:['handle','knob','ring'],metal:['frame','kleg'],glass:['glass','rail'],fabric:['sofa','cushion','pouf','pillow','kmat','fabric','rug','tulle'],emitter:['led'],screen:['screen'],wood:['table'],paint:['chair']};
  Object.entries(SLOTS).forEach(([slot,keys])=>keys.forEach(k=>{ mat[k].userData.slot=slot; }));
  window.ITEM_MATS=mat;
  const chair=(backEast)=>(b,g)=>{ // chair 0.42×0.42, back on the west or east side
    const bx=backEast?0.38:0;
    b.phys(0,0.42,0.42,0.49,0,0.42); b.phys(bx,bx+0.04,0.46,0.9,0,0.42); [[0.03,0.03],[0.35,0.03],[0.03,0.35],[0.35,0.35]].forEach(([x,z])=>b.phys(x,x+0.04,0,0.42,z,z+0.04)); // proxy = today's AABBs, so detailing never changes walk/layout
    b(0,0.42,0.42,0.46,0,0.42,mat.chair); b(0.03,0.39,0.46,0.49,0.03,0.39,mat.cushion); // seat cushion
    b(bx,bx+0.04,0.46,0.9,0,0.42,mat.chair);
    [[0.03,0.03],[0.35,0.03],[0.03,0.35],[0.35,0.35]].forEach(([x,z])=>b(x,x+0.04,0,0.42,z,z+0.04,mat.chair));
  };
  // Loft bed shared by rooms 1 and 2: stair-chest along local z 0–0.5, platform x 1.4–2.6 × z 0–L, storage shelf above the passage z L–2.97
  const kidBedBuild=(L,front,blanket,tread=0.28)=>b=>{
       const PL=1.8, TOP=2.3, HF=2.2, X0=5*tread, W=X0+1.2;                                           // L — platform length along z (2.00 in room 1, 1.85 in room 2); tread — step depth
       b.phys(0,X0,0,2.4,0,0.54); [[X0,0],[W-0.08,0],[X0,L-0.08],[W-0.08,L-0.08]].forEach(([x,z])=>b.phys(x,x+0.08,0,PL,z,z+0.08)); // stair-chest, legs
       b.phys(X0+0.08,W-0.08,0.10,0.14,L-0.08,L); b.phys(X0,W,PL-0.2,TOP+0.3,0,L+0.02); b.phys(X0,W,HF,TOP+0.3,L,2.97); b.phys(X0,X0+0.08,0,HF,2.89,2.97); // rail, platform with rails, shelf, post
       b(X0,W,PL-0.1,PL,0,L,mat.kbody);                                                          // platform, world x 4.235–5.435
       [[X0,0],[W-0.08,0],[X0,L-0.08],[W-0.08,L-0.08]].forEach(([x,z])=>b(x,x+0.08,0,PL-0.1,z,z+0.08,mat.kleg)); // legs
       b(X0+0.08,W-0.08,0.10,0.14,L-0.08,L,mat.kleg);                                               // lower rail between the south legs
       b(X0,X0+0.04,PL-0.2,PL-0.1,0,L,mat.kbody); b(X0,W,PL-0.2,PL-0.1,L-0.04,L,mat.kbody);       // apron on the west and south edges
       b(X0+0.01,X0+0.03,PL-0.11,PL-0.1,0,L,mat.led);                                             // M20: LED strip under the west edge
       b(X0+0.05,W-0.03,PL,PL+0.18,0.03,L-0.05,mat.kmat);                                             // mattress 1.80–1.98
       b(X0+0.15,W-0.13,PL+0.18,PL+0.28,0.1,0.5,mat.pillow);                                        // pillow
       b(X0+0.1,W-0.15,PL+0.18,PL+0.24,0.8,L-0.1,blanket);                                          // blanket at the feet
       b(X0,X0+0.02,PL,TOP,0.5,L,mat.rail); b(X0,W,PL,HF,L,L+0.02,mat.rail);                      // west and south rails
       b(X0,W,HF,TOP,L,2.97,mat.kbody); b(X0,X0+0.08,0,HF,2.89,2.97,mat.kleg);                    // storage shelf above the passage and its post
       b(X0,X0+0.02,TOP,TOP+0.3,L,2.97,mat.rail); b(X0+0.02,W,TOP,TOP+0.3,2.95,2.97,mat.rail);    // shelf rails
       b(X0-0.03,X0,1.38,1.42,2.91,2.95,mat.knob);                                                  // backpack hook on the post, 1.40
       for(let i=0;i<5;i++){ const x0=i*tread, x1=x0+tread, top=0.3*(i+1);                             // stair-chest: 5 steps 0.28 × 0.30, drawer fronts south
         b(x0,x1,0,top,0,0.5,mat.kbody); b(x0+0.01,x1-0.01,0.02,top-0.02,0.5,0.52,front);
         b((x0+x1)/2-0.075,(x0+x1)/2+0.075,top-0.07,top-0.05,0.52,0.54,mat.knob);
         b(x0,x1,top+0.885,top+0.915,0.02,0.05,front); }                                          // handrail segments on the north wall, tread + 0.90
  };
  const KN=1.915; // north wall of kitchen-living room 4
  const ITEMS=[
    // ---- kitchen-living room 4 (sketch .local/R1.jpg) ----
    {id:'kitchen',type:'кухонный блок',room:4,layer:'kitchen',pos:[8.23,KN],rot:0,size:[0.68,2.69,3.59],fixed:'wall',
     build(b,g){
       b(0,0.66,0,2.69,0,0.66,mat.base);            // fridge column
       b(0.66,0.68,0.3,2.0,0.02,0.64,mat.dark);      // fridge door
       b(0,0.6,0.1,0.87,0.66,2.99,mat.base);         // base cabinets
       b(0,0.62,0.87,0.91,0.66,2.99,mat.top);        // countertop
       b(0.06,0.56,0.91,0.925,1.1,1.7,mat.dark);     // cooktop
       b(0.1,0.5,0.905,0.93,2.2,2.65,mat.dark);      // sink
       const f=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.3,8),mat.lamp); f.position.set(0.08,1.06,2.42); g.add(f); // faucet
       b(0,0.36,1.45,2.69,0.66,2.99,mat.upper);      // wall cabinets up to the ceiling
       b(0,0.6,0,2.69,2.99,3.59,mat.base);           // tall cabinet
       b(0.6,0.62,0.8,1.4,3.04,3.54,mat.dark);       // oven
       [0.9,1.5,2.1,2.7].forEach(z=>b(0.6,0.615,0.79,0.8,z,z+0.15,mat.handle));   // base cabinet handles (bars)
       b(0.6,0.615,1.5,1.52,3.1,3.48,mat.handle);                                  // tall cabinet handle
       [[0.2,1.25],[0.42,1.25],[0.2,1.55],[0.42,1.55]].forEach(([x,z])=>{ const r=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.004,24),mat.ring); r.position.set(x,0.927,z); g.add(r); }); // burners
     }},
    {id:'table',type:'стол на 6 мест',room:4,layer:'kitchen',pos:[9.85,KN+0.04],rot:0,size:[0.8,0.76,1.8],
     build(b,g){ b.phys(0,0.8,0.72,0.76,0,1.8); b.phys(0.05,0.75,0.64,0.72,0.05,1.75); [[0.05,0.05],[0.7,0.05],[0.05,1.7],[0.7,1.7]].forEach(([x,z])=>b.phys(x,x+0.05,0,0.72,z,z+0.05)); // proxy = the old block AABBs (top, apron, legs)
       const r=0.004, sh=new THREE.Shape([[r,r],[0.8-r,r],[0.8-r,1.8-r],[r,1.8-r]].map(([x,y])=>new THREE.Vector2(x,y))); // tabletop 0.04 with a 4 mm bevel all round (UVs in metres from the shape)
       const top=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:0.04-2*r,bevelThickness:r,bevelSize:r,bevelSegments:2}).rotateX(Math.PI/2).translate(0,0.76-r,0),mat.table); g.add(top);
       [[0.08,0.10,0.10,1.70],[0.70,0.72,0.10,1.70],[0.10,0.70,0.08,0.10],[0.10,0.70,1.70,1.72]].forEach(([x0,x1,z0,z1])=>b(x0,x1,0.65,0.72,z0,z1,mat.table)); // apron rails 20×70, 30 mm in from the leg faces
       [[0.075,0.075],[0.725,0.075],[0.075,1.725],[0.725,1.725]].forEach(([x,z])=>{ const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.05/Math.SQRT2,0.035/Math.SQRT2,0.72,4).rotateY(Math.PI/4).translate(x,0.36,z),mat.table); g.add(leg); }); }}, // square legs tapering 50→35 mm
    {id:'chair1',type:'стул',room:4,layer:'kitchen',pos:[9.54,KN+0.04+0.35-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',glb:'models/chair.glb',glbRot:90,build:chair(false)},
    {id:'chair2',type:'стул',room:4,layer:'kitchen',pos:[9.54,KN+0.04+0.94-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',glb:'models/chair.glb',glbRot:90,build:chair(false)},
    {id:'chair3',type:'стул',room:4,layer:'kitchen',pos:[9.54,KN+0.04+1.53-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',glb:'models/chair.glb',glbRot:90,build:chair(false)},
    {id:'chair4',type:'стул',room:4,layer:'kitchen',pos:[10.54,KN+0.04+0.35-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',glb:'models/chair.glb',glbRot:-90,build:chair(true)},
    {id:'chair5',type:'стул',room:4,layer:'kitchen',pos:[10.54,KN+0.04+0.94-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',glb:'models/chair.glb',glbRot:-90,build:chair(true)},
    {id:'chair6',type:'стул',room:4,layer:'kitchen',pos:[10.54,KN+0.04+1.53-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',glb:'models/chair.glb',glbRot:-90,build:chair(true)},
    {id:'lamp',type:'настенный светильник над столом',room:4,layer:'kitchen',pos:[10.12,KN],rot:0,size:[0.26,1.94,0.63],fixed:'wall', // size by the shade
     build(b,g){ b(0.11,0.15,1.9,1.94,0,0.5,mat.lamp); const sh=new THREE.Mesh(new THREE.ConeGeometry(0.13,0.16,16,1,true),mat.lamp); sh.position.set(0.13,1.82,0.5); g.add(sh); }},
    {id:'tv',type:'телевизор 58"',room:4,layer:'kitchen',pos:[11.85,KN+0.02],rot:0,size:[1.3,1.75,0.04],fixed:'wall',build(b){ b(0,1.3,1.0,1.75,0,0.04,mat.dark); b(0.03,1.27,1.03,1.72,0.035,0.04,mat.screen); }}, // frame and screen
    {id:'console',type:'подвесная консоль под ТВ',room:4,layer:'kitchen',pos:[11.9,KN],rot:0,size:[1.2,0.75,0.38],fixed:'wall',build(b){ b(0,1.2,0.45,0.75,0,0.38,mat.base); }},
    {id:'sofa',type:'диван 2 м',room:4,layer:'kitchen',pos:[11.35,6.287-0.9],rot:0,size:[2.0,0.85,0.88],glb:'models/sofa.glb',
     build(b){ b.phys(0,2,0.1,0.85,0,0.88); b(0,2,0.1,0.42,0,0.88,mat.sofa); b(0,2,0.42,0.85,0.63,0.88,mat.sofa); b(0,0.15,0.42,0.6,0,0.88,mat.sofa); b(1.85,2,0.42,0.6,0,0.88,mat.sofa);
       [[0.17,0.98],[1.02,1.83]].forEach(([x0,x1])=>{ b(x0,x1,0.42,0.52,0.05,0.62,mat.cushion); b(x0,x1,0.52,0.82,0.55,0.66,mat.cushion); }); }}, // seat and back cushions with a seam in the middle
    // ---- hallway 5 (sketches .local/R2_*) ----
    {id:'wardrobe',type:'шкаф в нише',room:5,layer:'hall',pos:[8.20,7.974-0.45],rot:0,size:[1.77,2.65,0.45],fixed:'wall',
     build(b){
       const W=1.77, D=0.45, t=0.02, mid=W/2, gap=0.004, H0=0.45, H1=1.95, H2=2.65;
       b(0,t,0,H2,0,D,mat.body); b(W-t,W,0,H2,0,D,mat.body); b(0,W,0,H2,D-t,D,mat.body); b(0,W,H2-t,H2,0,D,mat.body); // body
       b(t,W-t,0.02,0.04,0.05,D-t,mat.body); b(t,W-t,H0-t,H0,0,D-t,mat.body); b(t,W-t,0.04,H0-t,D-0.10,D-t,mat.hdark); // shoe niche
       b(t,mid-gap,H0,H1,0,t,mat.door); b(mid+gap,W-t,H0,H1,0,t,mat.door);                                              // doors
       b(mid-0.06,mid-0.045,1.0,1.3,-0.02,0,mat.handle); b(mid+0.045,mid+0.06,1.0,1.3,-0.02,0,mat.handle);
       b(t,W-t,H1,H1+t,0,D-t,mat.body); b(t,mid-gap,H1+t,H2-t,0,t,mat.door); b(mid+gap,W-t,H1+t,H2-t,0,t,mat.door);    // top cabinets
       b(mid-0.06,mid-0.045,H1+0.12,H1+0.28,-0.02,0,mat.handle); b(mid+0.045,mid+0.06,H1+0.12,H1+0.28,-0.02,0,mat.handle);
     }},
    {id:'entry',type:'полочка с ящиками и светильниками у входа',room:5,layer:'hall',pos:[6.346,7.03],rot:0,size:[0.325,1.85,0.4],fixed:'wall',
     build(b){
       b(0,0.30,0.80,0.92,0,0.4,mat.body);
       b(0.30,0.315,0.81,0.91,0.01,0.195,mat.door); b(0.30,0.315,0.81,0.91,0.205,0.39,mat.door);
       b(0.315,0.325,0.855,0.865,0.07,0.14,mat.handle); b(0.315,0.325,0.855,0.865,0.26,0.33,mat.handle);
       b(0.01,0.03,1.15,1.85,0.10,0.13,mat.led); b(0.01,0.03,1.15,1.85,0.27,0.30,mat.led);
     }},
    {id:'mirror',type:'зеркало',room:5,layer:'hall',pos:[6.346,6.05],rot:0,size:[0.025,2.4,0.9],fixed:'wall',
     build(b){ b(0,0.02,0.15,2.40,0,0.9,mat.frame); b(0.02,0.025,0.17,2.38,0.02,0.88,mat.glass); }},
    {id:'pouf',type:'пуфик',room:5,layer:'hall',pos:[6.396,6.75],rot:0,size:[0.4,0.45,0.6],
     build(b){ b(0,0.4,0.12,0.45,0,0.6,mat.pouf); [[0.03,0.03],[0.34,0.03],[0.03,0.54],[0.34,0.54]].forEach(([x,z])=>b(x,x+0.03,0,0.12,z,z+0.03,mat.frame)); }},
    // ---- laundry 7 ----
    {id:'washer',type:'стиральная и сушильная машины колонной',room:7,layer:'laundry',pos:[7.05,2.43],rot:0,size:[0.6,1.72,0.6],fixed:'wall',
     build(b,g){
       [[0,0.85],[0.87,1.72]].forEach(([y0,y1])=>{
         b(0,0.6,y0,y1,0,0.6,mat.wbody);
         const d=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.02,32),mat.wdoor); d.rotation.x=Math.PI/2; d.position.set(0.3,(y0+y1)/2-0.05,0.61); g.add(d);
         b(0.05,0.55,y1-0.12,y1-0.04,0.6,0.61,mat.wpanel);
       });
     }},
    // ---- kids room 1 (tasks/room1-kid/README.md, marks M1–M30) ----
    // Room box: x 0.896–5.445, z 1.874–4.864. Wall-mounted boxes sit 0.02–0.03 in front of the wall so they show over the wallpaper (0.015).
    {id:'kidbed',type:'кровать-чердак с лестницей-комодом и полкой хранения',room:1,layer:'kid',pos:[2.835,1.884],rot:0,size:[2.6,2.6,2.97],fixed:'wall',build:kidBedBuild(2.0,mat.wdoor,mat.cushion)},
    {id:'kiddesk',type:'стол прямой 2.14 × 0.60 вдоль южной стены, от западной стены за стойку кровати (вырез под стойку); стеллаж у окна стоит на его западном краю',room:1,layer:'kid',pos:[0.896,4.264],rot:0,size:[2.139,0.72,0.60],fixed:'wall',
     build(b){ b(0,1.939,0.68,0.72,0,0.60,mat.kbody); b(1.939,2.139,0.68,0.72,0,0.505,mat.kbody);   // worktop; past the bed post (x 2.835–2.915, z 4.774–4.854) only the front 0.505
       b(0.02,0.04,0,0.68,0.02,0.58,mat.kbody); b(2.119,2.139,0,0.68,0.02,0.505,mat.kbody); }},     // end panels (the pedestal carries the east end)
    {id:'kidped',type:'тумба с 3 ящиками под столом у самого восточного края, глубина 0.40 — не упирается в стойку кровати; фасады к комнате',room:1,layer:'kid',pos:[2.615,4.364],rot:0,size:[0.42,0.68,0.40],
     build(b){ b(0.02,0.40,0,0.68,0.02,0.40,mat.kbody);
       [0.06,0.26,0.46].forEach(y=>b(0.02,0.40,y,y+0.18,0,0.02,mat.wdoor)); }},                   // push-to-open fronts, no handles (the chair sits right beside)
    {id:'kidchair',type:'рабочее кресло, регулируемое, лицом к столу, сиденье на 0.26 под столешницей, 0.13 от лежанки',room:1,layer:'kid',pos:[1.59,4.57],rot:270,size:[0.55,0.85,0.55],
     build(b,g){
       b(0.05,0.50,0.42,0.47,0.05,0.50,mat.cushion); b(0.50,0.55,0.47,0.85,0.08,0.47,mat.cushion);   // seat and back; rot 270 puts the back on the north side
       const c=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.39,10),mat.knob); c.position.set(0.275,0.225,0.275); g.add(c); // gas lift
       b(0.03,0.52,0,0.03,0.26,0.29,mat.knob); b(0.26,0.29,0,0.03,0.03,0.52,mat.knob);                // base cross
     }},
    {id:'kidshelf',type:'стеллаж узкий в северо-западном углу, фасадом к двери; 0.50 вдоль стены — на 0.10 уже, чтобы открыть окно',room:1,layer:'kid',pos:[0.896,2.374],rot:270,size:[0.50,2.70,0.43],fixed:'wall',
     build(b){
       const W=0.50, D=0.40, t=0.02;
       b(0,W,0,t,0,D,mat.kbody); b(0,W,2.7-t,2.7,0,D,mat.kbody); b(0,W,t,2.7-t,0,t,mat.wpanel);           // bottom, top, oak back
       b(0,t,t,2.7-t,t,D,mat.kbody); b(W-t,W,t,2.7-t,t,D,mat.kbody);                                  // sides
       [0.90,1.27,1.63,2.00].forEach(y=>b(t,W-t,y-t,y,t,D,mat.kbody));                                 // shelves: closed 0–0.9, open cells 0.9–2.0, attic 2.0–2.7
       b(t+0.003,W-t-0.003,t+0.003,0.90-t-0.003,D,D+0.018,mat.wpanel); b(W/2-0.005,W/2+0.005,0.78,0.86,D+0.018,D+0.03,mat.knob);   // lower door
       b(t+0.003,W-t-0.003,2.0+0.003,2.7-t-0.003,D,D+0.018,mat.wpanel); b(W/2-0.005,W/2+0.005,2.05,2.13,D+0.018,D+0.03,mat.knob); // attic door
     }},
    {id:'kidshelf2',type:'стеллаж узкий с открытыми полками в юго-западном углу, от стола до потолка; 0.50 вдоль стены',room:1,layer:'kid',pos:[0.896,4.864],rot:270,size:[0.50,2.70,0.25],fixed:'wall',
     build(b){
       const W=0.50, D=0.25, t=0.02, Y0=0.72; // shallow: 0.20 of the desk stays usable in front of it
       b(0,W,Y0,Y0+t,0,D,mat.kbody); b(0,W,2.7-t,2.7,0,D,mat.kbody); b(0,W,Y0+t,2.7-t,0,t,mat.wpanel);   // bottom on the desk, top, oak back
       b(0,t,Y0+t,2.7-t,t,D,mat.kbody); b(W-t,W,Y0+t,2.7-t,t,D,mat.kbody);                        // sides
       [1.20,1.70,2.20].forEach(y=>b(t,W-t,y-t,y,t,D,mat.kbody));                                  // 4 open cells
     }},
    {id:'kidshelf3',type:'полка над окном между стеллажами, одна открытая ячейка 1.99',room:1,layer:'kid',pos:[0.896,2.374],rot:0,size:[0.40,2.70,1.99],fixed:'wall',
     build(b){ b(0,0.40,2.30,2.32,0,1.99,mat.kbody); b(0,0.40,2.68,2.70,0,1.99,mat.kbody); b(0,0.02,2.32,2.68,0,1.99,mat.wpanel); }},
    {id:'windowseat1',type:'лежанка у окна между стеллажами с 2 глубокими ящиками и матрасиком, 1.89 × 0.60 (как в комнате 2)',room:1,layer:'kid',pos:[0.896,2.374],rot:0,size:[0.60,0.65,1.89],fixed:'wall',
     build(b){ const L=1.89, D=0.60; b(0.02,0.55,0,0.05,0.05,L-0.05,mat.dark); b(0,0.58,0.05,0.45,0,L,mat.body);
       [0.01,L/2+0.005].forEach(z=>{ b(0.58,0.60,0.06,0.44,z,z+L/2-0.015,mat.wdoor); b(0.60,0.615,0.24,0.26,z+0.39,z+0.54,mat.handle); }); // deep drawers, fronts east
       b(0,0.58,0.45,0.53,0.02,L-0.02,mat.kmat); [0.05,L-0.35].forEach(z=>b(0.10,0.50,0.53,0.65,z,z+0.30,mat.pillow)); }},   // mattress and two pillows at the shelf units // bottom, top, oak back over the window lintel
    {id:'kidsofa',type:'диванчик в нише под кроватью',room:1,layer:'kid',pos:[4.65,2.05],rot:0,size:[0.75,0.80,1.60],
     build(b){
       b(0,0.75,0.10,0.45,0,1.60,mat.sofa); b(0.60,0.75,0.45,0.80,0,1.60,mat.sofa);            // seat and back to the east wall
       b(0,0.60,0.45,0.60,0,0.15,mat.sofa); b(0,0.60,0.45,0.60,1.45,1.60,mat.sofa);              // armrests
       [[0.03,0.03],[0.69,0.03],[0.03,1.54],[0.69,1.54]].forEach(([x,z])=>b(x,x+0.03,0,0.10,z,z+0.03,mat.knob)); // legs
     }},
    {id:'kidrug',type:'ковёр моющийся',room:1,layer:'kid',pos:[2.15,2.60],rot:0,size:[1.60,0.01,1.70],
     build(b){ b(0,1.6,0,0.01,0,1.7,mat.wpanel); }},
    {id:'projector',type:'проектор короткофокусный на потолке (throw ≈0.57, экран M13)',room:1,layer:'kid',pos:[2.15,3.235],rot:0,size:[0.30,2.70,0.25],fixed:'wall',
     build(b,g){ b(0,0.30,2.44,2.56,0,0.25,mat.kbody); b(0.02,0.06,2.47,2.53,-0.005,0,mat.knob); const c=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.14,8),mat.knob); c.position.set(0.15,2.63,0.125); g.add(c); }}, // body, lens to the west, bracket
    {id:'screen',type:'кассета моторизованного экрана 1.70×0.96 под полкой (свёрнут)',room:1,layer:'kid',pos:[0.99,2.474],rot:0,size:[0.12,2.30,1.79],fixed:'wall',
     build(b){ b(0,0.12,2.18,2.30,0,1.79,mat.kbody); b(0.03,0.09,2.17,2.18,0.05,1.74,mat.knob); }},   // ponytail: canvas not modelled, add a toggle when the cinema view is needed
    {id:'curtain',type:'карниз с тюлем (блэкаут в проёме окна)',room:1,layer:'kid',pos:[0.911,2.474],rot:0,size:[0.05,2.30,1.79],fixed:'wall',
     build(b){ b(0.01,0.04,2.27,2.30,0,1.79,mat.kbody); b(0.015,0.025,0.75,2.26,0.05,1.74,mat.tulle); }},
    {id:'kidlight',type:'потолочный светильник Ø0.50, 3000 K, диммер',room:1,layer:'kid',pos:[2.45,3.25],rot:0,size:[0.50,2.70,0.50],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,0.04,32),mat.lamp); c.position.set(0.25,2.68,0.25); g.add(c); }},
    {id:'track',type:'трек с 2 спотами на галерейную стену',room:1,layer:'kid',pos:[1.90,4.22],rot:0,size:[2.20,2.70,0.06],fixed:'wall',
     build(b){ b(0,2.2,2.67,2.70,0.015,0.045,mat.knob); [0.6,1.6].forEach(x=>b(x,x+0.06,2.55,2.67,0,0.06,mat.knob)); }},
    {id:'bra1',type:'бра над диванчиком, поворотное',room:1,layer:'kid',pos:[5.20,2.79],rot:0,size:[0.245,1.35,0.16],fixed:'wall',
     build(b,g){ b(0.195,0.215,1.20,1.30,0.03,0.13,mat.knob); b(0.10,0.195,1.245,1.255,0.075,0.085,mat.knob); const s=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.12,16),mat.lamp); s.position.set(0.08,1.25,0.08); g.add(s); }},
    {id:'bra2',type:'бра для чтения над изголовьем, плоское',room:1,layer:'kid',pos:[5.28,2.37],rot:0,size:[0.165,2.36,0.20],fixed:'wall',
     build(b){ b(0.135,0.145,2.24,2.36,0,0.20,mat.knob); b(0.02,0.135,2.27,2.33,0.02,0.18,mat.lamp); }},
    {id:'sw1',type:'выключатель 2 клавиши: общий свет M15 + трек M16',room:1,layer:'kid',pos:[5.415,3.89],rot:0,size:[0.01,0.99,0.08],fixed:'wall',
     build(b){ b(0,0.01,0.91,0.99,0,0.08,mat.lamp); }},
    // sockets: flat boxes 0.08 × 0.08 × 0.01 on the wall, purpose in the caption; all with shutters
    {id:'sock1',type:'розетки 2+2 USB у стола, южный торец',room:1,layer:'kid',pos:[1.16,4.834],rot:0,size:[0.08,0.94,0.01],fixed:'wall',build(b){ b(0,0.08,0.86,0.94,0,0.01,mat.lamp); }},
    {id:'sock2',type:'розетки 2+2 USB у стола, восточный торец',room:1,layer:'kid',pos:[2.06,4.834],rot:0,size:[0.08,0.94,0.01],fixed:'wall',build(b){ b(0,0.08,0.86,0.94,0,0.01,mat.lamp); }},
    {id:'sock3',type:'розетка + USB в нише под кроватью, вывод HDMI от проектора',room:1,layer:'kid',pos:[5.415,3.69],rot:0,size:[0.01,0.44,0.08],fixed:'wall',build(b){ b(0,0.01,0.36,0.44,0,0.08,mat.lamp); }},
    {id:'sock4',type:'розетка у изголовья кровати (ночник, телефон)',room:1,layer:'kid',pos:[4.66,1.894],rot:0,size:[0.08,2.09,0.01],fixed:'wall',build(b){ b(0,0.08,2.01,2.09,0,0.01,mat.lamp); }},
    {id:'sock5',type:'розетка общего назначения (пылесос, увлажнитель), восточнее стойки кровати',room:1,layer:'kid',pos:[2.96,4.834],rot:0,size:[0.08,0.34,0.01],fixed:'wall',build(b){ b(0,0.08,0.26,0.34,0,0.01,mat.lamp); }},
    {id:'sock6',type:'розетка в потолке для проектора',room:1,layer:'kid',pos:[2.26,3.51],rot:0,size:[0.08,2.70,0.08],fixed:'wall',build(b){ b(0,0.08,2.69,2.70,0,0.08,mat.lamp); }},
    {id:'sock7',type:'розетка в потолке для мотора экрана',room:1,layer:'kid',pos:[1.06,2.11],rot:0,size:[0.08,2.70,0.08],fixed:'wall',build(b){ b(0,0.08,2.69,2.70,0,0.08,mat.lamp); }},
    // ---- kids room 2 (tasks/room2-kid/README.md, marks M1–M22; grey materials only) ----
    // Room box: x 11.067–14.774, z 6.518–9.614, niche: south wall at z 9.519 east of x 13.477. Door on the west wall z 6.75–7.65.
    {id:'kidbed2',type:'кровать-чердак с лестницей-комодом, платформа 1.85, полка над дверью',room:2,layer:'kid2',pos:[13.467,9.614],rot:180,size:[2.4,2.6,2.97],fixed:'wall',build:kidBedBuild(1.85,mat.wdoor,mat.cushion,0.24)}, // M12 LED is part of the bed; tread 0.24 keeps the stairs west of the niche (x 13.477)
    {id:'kiddesk2',type:'письменный стол под платформой, 1.65 × 0.75',room:2,layer:'kid2',pos:[11.067,7.85],rot:0,size:[0.75,0.72,1.65],fixed:'wall',
     build(b){ b(0,0.75,0.69,0.72,0,1.65,mat.body); b(0.02,0.73,0,0.69,0,0.02,mat.body); b(0.02,0.73,0,0.69,1.63,1.65,mat.body); b(0,0.05,0.62,0.69,0.02,1.63,mat.dark); }}, // top, side panels, cable channel at the wall
    {id:'kidchair2',type:'рабочее кресло детское, регулируемое',room:2,layer:'kid2',pos:[11.75,8.40],rot:0,size:[0.55,0.85,0.55],
     build(b,g){ b(0.05,0.50,0.42,0.47,0.05,0.50,mat.cushion); b(0.50,0.55,0.47,0.85,0.08,0.47,mat.cushion);
       const c=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.39,10),mat.knob); c.position.set(0.275,0.225,0.275); g.add(c);
       b(0.03,0.52,0,0.03,0.26,0.29,mat.knob); b(0.26,0.29,0,0.03,0.03,0.52,mat.knob); }},
    {id:'deskshelf2',type:'полка над столом под платформой',room:2,layer:'kid2',pos:[11.087,7.90],rot:0,size:[0.22,1.28,1.55],fixed:'wall',
     build(b){ b(0,0.22,1.25,1.28,0,1.55,mat.body); [0.05,1.48].forEach(z=>b(0,0.02,1.13,1.25,z,z+0.02,mat.body)); }},
    {id:'tower2n',type:'стеллаж-башня северная: низ шкаф со штангой, верх открытые ячейки',room:2,layer:'kid2',pos:[14.174,6.518],rot:0,size:[0.60,2.70,0.68],fixed:'wall',
     build(b){ const t=0.02, D=0.68;
       b(0,0.6,0,t,0,D,mat.body); b(0,0.6,2.7-t,2.7,0,D,mat.body); b(0.58,0.6,t,2.7-t,0,D,mat.body); b(0.02,0.58,t,2.7-t,0,t,mat.body); b(0.02,0.58,t,2.7-t,D-t,D,mat.body); // box, back at the east wall
       [1.50,1.90,2.30].forEach(y=>b(t,0.58,y-t,y,t,D-t,mat.body));                                  // shelves: closed 0–1.5, 3 open rows above
       b(0,t,t+0.003,1.50-t-0.003,t+0.003,D-t-0.003,mat.wdoor); b(-0.015,0,0.75,0.95,D/2-0.01,D/2+0.01,mat.handle); // wardrobe door on the west face
     }},
    {id:'tower2s',type:'стеллаж-башня южная: 2 ящика, открытые ячейки',room:2,layer:'kid2',pos:[14.174,8.90],rot:0,size:[0.60,2.70,0.619],fixed:'wall',
     build(b){ const t=0.02, D=0.619;
       b(0,0.6,0,t,0,D,mat.body); b(0,0.6,2.7-t,2.7,0,D,mat.body); b(0.58,0.6,t,2.7-t,0,D,mat.body); b(0.02,0.58,t,2.7-t,0,t,mat.body); b(0.02,0.58,t,2.7-t,D-t,D,mat.body);
       [0.90,1.35,1.80,2.25].forEach(y=>b(t,0.58,y-t,y,t,D-t,mat.body));                              // 4 open rows above the drawers
       [0.03,0.46].forEach(y=>{ b(0,t,y,y+0.41,t+0.003,D-t-0.003,mat.wdoor); b(-0.015,0,y+0.2,y+0.22,D/2-0.075,D/2+0.075,mat.handle); }); // drawer fronts west
     }},
    {id:'windowseat2',type:'лежанка у окна с 2 глубокими ящиками и матрасиком, 1.70 × 0.60',room:2,layer:'kid2',pos:[14.174,7.198],rot:0,size:[0.60,0.65,1.702],fixed:'wall',
     build(b){ b(0.05,0.58,0,0.05,0.05,1.65,mat.dark); b(0.02,0.60,0.05,0.45,0,1.702,mat.body);
       [0.01,0.862].forEach(z=>{ b(0,0.02,0.06,0.44,z,z+0.83,mat.wdoor); b(-0.015,0,0.24,0.26,z+0.34,z+0.49,mat.handle); }); // deep drawers, fronts west
       b(0.02,0.60,0.45,0.53,0.02,1.682,mat.kmat); [0.05,1.35].forEach(z=>b(0.10,0.50,0.53,0.65,z,z+0.30,mat.pillow)); }},   // mattress and two pillows at the towers
    {id:'gymwall',type:'шведская стенка 0.80, в распор пол–потолок, 12 перекладин',room:2,layer:'kid2',pos:[12.55,6.538],rot:0,size:[0.80,2.70,0.15],fixed:'wall',
     build(b,g){ b(0,0.04,0,2.7,0.06,0.12,mat.lamp); b(0.76,0.80,0,2.7,0.06,0.12,mat.lamp);
       for(let y=0.30;y<=2.50+1e-6;y+=0.20){ const r=new THREE.Mesh(new THREE.CylinderGeometry(0.0175,0.0175,0.76,12),mat.body); r.rotation.z=Math.PI/2; r.position.set(0.40,y,0.09); g.add(r); } }},
    {id:'pullup',type:'выносной турник шведской стенки, 2.35',room:2,layer:'kid2',pos:[12.50,6.538],rot:0,size:[0.90,2.36,0.55],fixed:'wall',
     build(b,g){ b(0.02,0.05,2.32,2.36,0.02,0.55,mat.lamp); b(0.85,0.88,2.32,2.36,0.02,0.55,mat.lamp);
       const r=new THREE.Mesh(new THREE.CylinderGeometry(0.017,0.017,0.90,12),mat.body); r.rotation.z=Math.PI/2; r.position.set(0.45,2.34,0.53); g.add(r); }},
    {id:'kidrug2',type:'ковёр-мат перед шведской стенкой',room:2,layer:'kid2',pos:[12.30,7.10],rot:0,size:[1.60,0.02,2.00],
     build(b){ b(0,1.6,0,0.02,0,2.0,mat.wpanel); }},
    {id:'kidlight2',type:'потолочный светильник Ø0.45, диммер',room:2,layer:'kid2',pos:[12.675,7.975],rot:0,size:[0.45,2.70,0.45],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.225,0.225,0.04,32),mat.lamp); c.position.set(0.225,2.68,0.225); g.add(c); }},
    {id:'desklamp2',type:'настольная лампа, гибкая штанга',room:2,layer:'kid2',pos:[11.45,9.20],rot:0,size:[0.20,1.20,0.20],
     build(b,g){ b(0.07,0.13,0.72,0.77,0.07,0.13,mat.knob); const a=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.36,8),mat.knob); a.position.set(0.10,0.95,0.10); g.add(a);
       const s=new THREE.Mesh(new THREE.ConeGeometry(0.08,0.10,16,1,true),mat.lamp); s.position.set(0.10,1.15,0.10); g.add(s); }},
    {id:'bra3',type:'бра над лежанкой на торце северной башни, поворотное',room:2,layer:'kid2',pos:[14.394,7.198],rot:0,size:[0.16,1.40,0.245],fixed:'wall',
     build(b,g){ b(0.03,0.13,1.25,1.35,0,0.02,mat.handle); b(0.075,0.085,1.295,1.305,0.02,0.13,mat.handle); const s=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.12,16),mat.lamp); s.position.set(0.08,1.30,0.165); g.add(s); }},
    {id:'bra4',type:'бра для чтения над изголовьем, плоское',room:2,layer:'kid2',pos:[11.59,9.349],rot:0,size:[0.16,2.36,0.245],fixed:'wall',
     build(b){ b(0.03,0.13,2.24,2.36,0.235,0.245,mat.knob); b(0.02,0.14,2.27,2.33,0.08,0.235,mat.lamp); }},
    {id:'blind2',type:'кассета рулонной блэкаут-шторы над окном',room:2,layer:'kid2',pos:[14.694,7.31],rot:0,size:[0.08,2.38,1.48],fixed:'wall',
     build(b){ b(0,0.08,2.30,2.38,0,1.48,mat.body); b(0.02,0.06,2.29,2.30,0.03,1.45,mat.knob); }},
    {id:'sw2',type:'выключатель у двери, 2 клавиши: общий свет M11 + LED M12',room:2,layer:'kid2',pos:[11.38,6.538],rot:0,size:[0.08,0.99,0.01],fixed:'wall',build(b){ b(0,0.08,0.91,0.99,0,0.01,mat.lamp); }},
    // sockets: flat boxes 0.08 × 0.08 × 0.01 on the wall, purpose in the caption
    {id:'sock9',type:'розетки 2+2 USB над столом',room:2,layer:'kid2',pos:[11.087,8.57],rot:0,size:[0.01,0.94,0.08],fixed:'wall',build(b){ b(0,0.01,0.86,0.94,0,0.08,mat.lamp); }},
    {id:'sock10',type:'блок ПК под столом: 3 розетки + RJ-45',room:2,layer:'kid2',pos:[11.087,9.22],rot:0,size:[0.01,0.34,0.08],fixed:'wall',build(b){ b(0,0.01,0.26,0.34,0,0.08,mat.lamp); }},
    {id:'sock11',type:'розетка у изголовья (ночник)',room:2,layer:'kid2',pos:[11.38,9.584],rot:0,size:[0.08,2.09,0.01],fixed:'wall',build(b){ b(0,0.08,2.01,2.09,0,0.01,mat.lamp); }},
    {id:'sock12',type:'розетка у лежанки (зарядка), в нише',room:2,layer:'kid2',pos:[13.83,9.489],rot:0,size:[0.08,0.34,0.01],fixed:'wall',build(b){ b(0,0.08,0.26,0.34,0,0.01,mat.lamp); }},
    {id:'sock13',type:'розетка у шведской стенки (увлажнитель)',room:2,layer:'kid2',pos:[12.23,6.538],rot:0,size:[0.08,0.34,0.01],fixed:'wall',build(b){ b(0,0.08,0.26,0.34,0,0.01,mat.lamp); }},
    // ---- master bedroom 3 (tasks/room3-master/README.md, marks M1–M28; grey materials only) ----
    // Room box: x 10.021–14.76, z 9.777–13.144. Items are built as if against the north wall and turned 180° (rot 180, pos = SE corner): the composition faces north. Wall-mounted boxes sit 0.02–0.03 in front of the wall (wallpaper at 0.015).
    {id:'mbed',type:'кровать 160×200 с мягким изголовьем',room:3,layer:'master',pos:[14.76,13.144],rot:180,size:[1.70,1.10,2.20],fixed:'wall',
     build(b){
       b(0.05,1.65,0,0.10,0.05,2.15,mat.dark); b(0,1.7,0.10,0.35,0,2.2,mat.body);                 // plinth inset 0.05, frame; east side touches the wall under the window
       b(0.05,1.65,0.35,0.55,0.10,2.10,mat.kmat); b(0,1.7,0.35,1.10,0,0.08,mat.cushion);           // mattress (top 0.55 = window sill), headboard
       [[0.12,0.82],[0.88,1.58]].forEach(([x0,x1])=>b(x0,x1,0.55,0.67,0.15,0.60,mat.pillow));       // two pillows
       b(0.10,1.60,0.55,0.61,0.85,2.15,mat.cushion);                                               // blanket at the feet
     }},
    {id:'mcab',type:'блок подвесных ящиков над изголовьем: 2 дверцы + секция под кондиционер',room:3,layer:'master',pos:[14.76,13.144],rot:180,size:[1.70,2.70,0.35],fixed:'wall',
     build(b){
       const t=0.02;
       b(0,1.7,2.7-t,2.7,0,0.35,mat.body); b(0.9,1.7,1.85,1.85+t,0,0.35,mat.body); b(0.9,1.7,1.85+t,2.7-t,0,t,mat.body); // top, bottom and back of the 2 door sections; AC section has neither
       [0,0.9,1.3,1.68].forEach(x=>b(x,x+t,1.85+t,2.7-t,t,0.35,mat.body));                         // section walls
       for(let i=0;i<2;i++){ const x0=0.9+i*0.4+t+0.003; b(x0,x0+0.4-2*t-0.006,1.85+t+0.003,2.7-t-0.003,0.33,0.35,mat.wdoor); b(x0+0.15,x0+0.2,2.1,2.12,0.35,0.365,mat.handle); } // doors
       for(let y=1.89;y<2.66;y+=0.04) b(0.02,0.88,y,y+0.02,0.33,0.35,mat.wdoor);                   // louvred front of the AC section, open bottom
     }},
    {id:'mward',type:'шкаф на две двери, вплотную к кровати; ниша-полка со стороны кровати 0.45–0.80',room:3,layer:'master',pos:[13.06,13.144],rot:180,size:[1.00,2.70,0.60],fixed:'wall',
     build(b){
       const N0=0.45, N1=0.80, NW=0.30;                                                                // niche: height 0.45–0.80, 0.30 deep into the wardrobe
       b(0,0.02,0,N0,0.03,0.58,mat.body); b(0,0.02,N1,2.7,0.03,0.58,mat.body);                       // bed-side panel above and below the niche
       b(0.98,1.0,0,2.7,0.03,0.58,mat.body); b(0,1.0,2.68,2.7,0.03,0.58,mat.body); b(0,1.0,0,0.02,0.03,0.58,mat.body); b(0.02,0.98,0.02,2.68,0.03,0.05,mat.body); // body
       b(0,NW,N0,N0+0.02,0.03,0.58,mat.body); b(0,NW,N1-0.02,N1,0.03,0.58,mat.body); b(NW-0.02,NW,N0,N1,0.03,0.58,mat.body); // niche shelf, ceiling and back
       b(0.02,0.496,0.02,2.68,0.58,0.60,mat.wdoor); b(0.504,0.98,0.02,2.68,0.58,0.60,mat.wdoor);   // two doors
       b(0.46,0.475,1.0,1.3,0.60,0.62,mat.handle); b(0.525,0.54,1.0,1.3,0.60,0.62,mat.handle);      // vertical bar handles
     }},
    {id:'mtv',type:'телевизор 43" напротив изножья, центр на оси кровати',room:3,layer:'master',pos:[14.395,9.847],rot:180,size:[0.97,1.63,0.04],fixed:'wall',
     build(b){ b(0,0.97,1.07,1.63,0,0.04,mat.dark); b(0.02,0.95,1.09,1.61,0,0.005,mat.screen); }},
    {id:'mconsole',type:'подвесная консоль под ТВ, два ящика',room:3,layer:'master',pos:[14.51,10.127],rot:180,size:[1.20,0.60,0.35],fixed:'wall',
     build(b){ b(0,1.2,0.42,0.60,0.02,0.33,mat.body); [0.01,0.605].forEach(x=>{ b(x,x+0.585,0.43,0.59,0,0.02,mat.wdoor); b(x+0.22,x+0.37,0.50,0.52,-0.015,0,mat.handle); }); }},
    {id:'vanity',type:'туалетный столик с плоским ящиком',room:3,layer:'master',pos:[12.6,10.227],rot:180,size:[1.00,0.75,0.45],fixed:'wall',
     build(b){ b(0,1.0,0.72,0.75,0,0.45,mat.body); b(0.03,0.97,0.62,0.72,0.05,0.43,mat.body); b(0.04,0.96,0.63,0.71,0.03,0.05,mat.wdoor);
       b(0,0.03,0,0.72,0.05,0.43,mat.body); b(0.97,1.0,0,0.72,0.05,0.43,mat.body); }},                // side panels
    {id:'vmirror',type:'зеркало полукруглое Ø1.10, отдельно на стене над столиком',room:3,layer:'master',pos:[12.65,9.827],rot:180,size:[1.10,1.52,0.03],fixed:'wall',
     build(b,g){ const half=(r,m,z)=>{ const d=new THREE.Mesh(new THREE.CircleGeometry(r,48,0,Math.PI),m); d.rotation.y=Math.PI; d.position.set(0.55,0.95,z); g.add(d); };
       half(0.57,mat.frame,0.025); half(0.55,mat.glass,0.01); b(-0.02,1.12,0.93,0.95,0.005,0.03,mat.frame); }}, // flat bottom edge 0.20 above the worktop
    {id:'vpouf',type:'пуфик у туалетного столика',room:3,layer:'master',pos:[12.3,10.681],rot:180,size:[0.40,0.45,0.40],
     build(b){ b(0,0.4,0.35,0.45,0,0.4,mat.cushion); [[0.03,0.03],[0.34,0.03],[0.03,0.34],[0.34,0.34]].forEach(([x,z])=>b(x,x+0.03,0,0.35,z,z+0.03,mat.frame)); }},
    {id:'mrug',type:'ковёр, короткий ворс',room:3,layer:'master',pos:[14.0,12.321],rot:180,size:[2.00,0.01,2.00],
     build(b){ b(0,2,0,0.01,0,2,mat.wpanel); }},
    {id:'mcurtain',type:'потолочный карниз по восточной стене, шторы собраны у краёв',room:3,layer:'master',pos:[14.7,12.794],rot:180,size:[0.10,2.68,3.017],fixed:'wall',
     build(b){ b(0.02,0.05,2.65,2.68,0,3.017,mat.body); b(0.02,0.08,1.15,2.64,0,0.15,mat.wpanel); b(0.02,0.08,0.02,2.64,2.867,3.017,mat.wpanel); }}, // rail starts after the cabinet; north bundle hemmed above the headboard
    {id:'mlight',type:'потолочный светильник Ø0.50, диммер',room:3,layer:'master',pos:[12.65,11.671],rot:180,size:[0.50,2.70,0.50],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,0.04,32),mat.lamp); c.position.set(0.25,2.68,0.25); g.add(c); }},
    {id:'bra5',type:'бра для чтения, западная сторона кровати',room:3,layer:'master',pos:[13.49,13.124],rot:180,size:[0.16,1.50,0.245],fixed:'wall',
     build(b,g){ b(0.03,0.13,1.35,1.45,0,0.02,mat.handle); b(0.075,0.085,1.395,1.405,0.02,0.13,mat.handle); const s=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.12,16),mat.lamp); s.position.set(0.08,1.40,0.165); g.add(s); }},
    {id:'bra6',type:'бра для чтения, восточная сторона кровати',room:3,layer:'master',pos:[14.49,13.124],rot:180,size:[0.16,1.50,0.245],fixed:'wall',
     build(b,g){ b(0.03,0.13,1.35,1.45,0,0.02,mat.handle); b(0.075,0.085,1.395,1.405,0.02,0.13,mat.handle); const s=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.12,16),mat.lamp); s.position.set(0.08,1.40,0.165); g.add(s); }},
    {id:'led4',type:'LED-лента под блоком ящиков, свет на изголовье',room:3,layer:'master',pos:[14.72,12.814],rot:180,size:[1.62,1.85,0.02],fixed:'wall',
     build(b){ b(0,1.62,1.84,1.85,0,0.02,mat.led); }},
    {id:'bra7',type:'бра у зеркала, левое',room:3,layer:'master',pos:[11.48,10.022],rot:180,size:[0.16,1.60,0.245],fixed:'wall',
     build(b,g){ b(0.03,0.13,1.45,1.55,0.225,0.245,mat.handle); b(0.075,0.085,1.495,1.505,0.115,0.225,mat.handle); const s=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.12,16),mat.lamp); s.position.set(0.08,1.50,0.08); g.add(s); }},
    {id:'bra8',type:'бра у зеркала, правое',room:3,layer:'master',pos:[12.88,10.022],rot:180,size:[0.16,1.60,0.245],fixed:'wall',
     build(b,g){ b(0.03,0.13,1.45,1.55,0.225,0.245,mat.handle); b(0.075,0.085,1.495,1.505,0.115,0.225,mat.handle); const s=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.12,16),mat.lamp); s.position.set(0.08,1.50,0.08); g.add(s); }},
    {id:'led5',type:'LED-подсветка по нижней кромке ТВ',room:3,layer:'master',pos:[14.37,9.837],rot:180,size:[0.92,1.07,0.01],fixed:'wall',
     build(b){ b(0,0.92,1.06,1.07,0,0.01,mat.led); }},
    {id:'sw3',type:'выключатель у двери, 2 клавиши: общий свет M13 + бра/LED',room:3,layer:'master',pos:[10.051,10.921],rot:180,size:[0.01,0.99,0.08],fixed:'wall',build(b){ b(0,0.01,0.91,0.99,0,0.08,mat.lamp); }},
    {id:'sw4',type:'проходной выключатель у кровати, 2 клавиши (над изголовьем)',room:3,layer:'master',pos:[13.42,13.124],rot:180,size:[0.08,1.24,0.01],fixed:'wall',build(b){ b(0,0.08,1.16,1.24,0,0.01,mat.lamp); }},
    // sockets: flat boxes 0.08 × 0.08 × 0.01 on the wall, purpose in the caption
    {id:'sock14',type:'розетки 2+2 USB у западного края изголовья (над изголовьем 1.10)',room:3,layer:'master',pos:[13.28,13.124],rot:180,size:[0.08,1.24,0.01],fixed:'wall',build(b){ b(0,0.08,1.16,1.24,0,0.01,mat.lamp); }},
    {id:'sock15',type:'розетка + USB у восточного края изголовья (над изголовьем 1.10)',room:3,layer:'master',pos:[14.6,13.124],rot:180,size:[0.08,1.24,0.01],fixed:'wall',build(b){ b(0,0.08,1.16,1.24,0,0.01,mat.lamp); }},
    {id:'sock16',type:'розетка для кондиционера внутри секции',room:3,layer:'master',pos:[14.35,13.124],rot:180,size:[0.08,2.34,0.01],fixed:'wall',build(b){ b(0,0.08,2.26,2.34,0,0.01,mat.lamp); }},
    {id:'sock17',type:'медиаблок за телевизором (2 розетки + ТВ/RJ-45 + HDMI)',room:3,layer:'master',pos:[13.95,9.807],rot:180,size:[0.08,1.34,0.01],fixed:'wall',build(b){ b(0,0.08,1.26,1.34,0,0.01,mat.lamp); }},
    {id:'sock18',type:'розетки у консоли',room:3,layer:'master',pos:[13.95,9.807],rot:180,size:[0.08,0.39,0.01],fixed:'wall',build(b){ b(0,0.08,0.31,0.39,0,0.01,mat.lamp); }},
    {id:'sock19',type:'розетки + USB у туалетного столика (фен, плойка)',room:3,layer:'master',pos:[12.8,9.807],rot:180,size:[0.08,0.94,0.01],fixed:'wall',build(b){ b(0,0.08,0.86,0.94,0,0.01,mat.lamp); }},
    {id:'sock20',type:'розетка общего назначения (увлажнитель, пылесос)',room:3,layer:'master',pos:[10.66,13.124],rot:180,size:[0.08,0.34,0.01],fixed:'wall',build(b){ b(0,0.08,0.26,0.34,0,0.01,mat.lamp); }},
    // ---- bathroom 9 (tasks/bath9/README.md, marks M1–M18 mirrored across the door axis z 8.997; grey materials only) ----
    // Room box: x 8.172–9.872, z 8.122–9.872, door on the east wall z 8.55–9.25. Basin, mirror and towel rail on the north side,
    // cistern box and toilet on the south. Tiles follow PLAN.baths (north face at z 8.181, west at x 8.222, others wall+0.02), so wall-mounted parts start in front of them.
    // The passage strip x 8.872–9.872 × z 8.55–9.25 stays empty except the tub, which ends it (free depth ≥ 0.80, check.js).
    {id:'tub',type:'ванна акриловая каплевидная 1.60 вдоль западной стены: северный торец 0.45, выпуклая кромка расширяется к южному торцу 0.99 у короба и унитаза',room:9,layer:'bath',pos:[8.172,8.147],rot:0,size:[0.99,0.58,1.60],fixed:'wall',
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
         slice(z0,z1,()=>W,wi,0.12,0.15,mat.kmat);                                                    // bottom at 0.12
         slice(z0,z1,()=>0,wo,0,0.12,mat.body); }                                                    // blind apron under the rim
       b(0,W,0.12,0.58,0,L,mat.kmat); b(W,wi(0),0.12,0.58,0,W,mat.kmat); b(W,wi(L),0.12,0.58,L-W,L,mat.kmat); // wall side and the two straight ends
       const d=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.005,16),mat.handle); d.position.set(0.25,0.152,1.45); g.add(d); // drain at the south end, by the mixer
     }},
    {id:'tubmixer',type:'смеситель ванны настенный, излив 0.20',room:9,layer:'bath',pos:[8.192,9.124],rot:0,size:[0.20,0.86,0.20],fixed:'wall',
     build(b){ b(0,0.05,0.75,0.85,0.02,0.18,mat.lamp); b(0.05,0.20,0.78,0.80,0.09,0.11,mat.lamp); b(0.05,0.10,0.85,0.86,0.09,0.11,mat.handle); }}, // body, spout, lever
    {id:'shower',type:'душевая штанга 0.90 с лейкой, шланг к смесителю',room:9,layer:'bath',pos:[8.192,9.374],rot:0,size:[0.10,2.05,0.10],fixed:'wall',
     build(b){ b(0.03,0.05,1.15,2.05,0.04,0.06,mat.lamp); [1.15,2.02].forEach(y=>b(0,0.03,y,y+0.03,0.03,0.07,mat.lamp)); b(0.03,0.10,1.98,2.02,0.02,0.08,mat.lamp); }}, // rod, two holders, hand shower on the top holder
    {id:'wcbox',type:'короб инсталляции 0.71×0.12 за унитазом, от торца ванны до восточной стены, верх 1.15 — полка; кнопка смыва на фасаде',room:9,layer:'bath',pos:[9.162,9.747],rot:0,size:[0.71,1.15,0.125],fixed:'wall',
     build(b){ b(0,0.71,0,1.15,0.005,0.125,mat.body); b(0.28,0.44,0.96,1.04,0,0.005,mat.lamp); }},                 // box, flush plate on the toilet axis (x 9.52)
    {id:'wc',type:'унитаз подвесной компактный 0.36×0.48, сиденье 0.42, фасад на север',room:9,layer:'bath',pos:[9.34,9.272],rot:0,size:[0.36,0.42,0.48],fixed:'wall',
     build(b,g){
       const cyl=(r,h,y,m)=>{ const c=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),m); c.position.set(0.18,y,0.16); g.add(c); };
       b(0.02,0.34,0.20,0.40,0.16,0.48,mat.kmat); cyl(0.16,0.20,0.30,mat.kmat);                     // bowl: box at the back, round front to z 0
       b(0.03,0.33,0.40,0.42,0.16,0.46,mat.lamp); cyl(0.15,0.02,0.41,mat.lamp);                     // seat
     }},
    {id:'basin',type:'раковина подвесная 0.85×0.36 вдоль северной стены, чаша 0.60×0.30 глубиной 0.10',room:9,layer:'bath',pos:[8.90,8.181],rot:0,size:[0.85,0.85,0.36],fixed:'wall',
     build(b,g){
       b(0,0.85,0.70,0.75,0,0.36,mat.kmat);                                                          // slab, bowl floor at 0.75
       b(0,0.125,0.75,0.85,0,0.36,mat.kmat); b(0.725,0.85,0.75,0.85,0,0.36,mat.kmat);               // rim around the bowl 0.125–0.725 × 0.03–0.33
       b(0.125,0.725,0.75,0.85,0,0.03,mat.kmat); b(0.125,0.725,0.75,0.85,0.33,0.36,mat.kmat);
       const d=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.004,16),mat.handle); d.position.set(0.425,0.752,0.18); g.add(d); // drain
     }},
    {id:'basindrawer',type:'ящик под раковиной 0.85×0.31×0.18, подвесной, push-to-open',room:9,layer:'bath',pos:[8.90,8.181],rot:0,size:[0.85,0.68,0.31],fixed:'wall',
     build(b){ b(0,0.85,0.50,0.68,0,0.29,mat.body); b(0.005,0.845,0.505,0.675,0.29,0.31,mat.wdoor); }},            // body, front to the south
    {id:'bathmirror',type:'зеркало 0.96×1.20 прямоугольное со скруглёнными углами, LED-контур сзади; низ 1.10 — над корпусом смесителя',room:9,layer:'bath',pos:[8.795,8.185],rot:0,size:[0.96,2.30,0.02],fixed:'wall',
     build(b,g){
       const rr=(w,h,r)=>{ const s=new THREE.Shape(); s.moveTo(r,0); s.lineTo(w-r,0); s.quadraticCurveTo(w,0,w,r); s.lineTo(w,h-r); s.quadraticCurveTo(w,h,w-r,h); s.lineTo(r,h); s.quadraticCurveTo(0,h,0,h-r); s.lineTo(0,r); s.quadraticCurveTo(0,0,r,0); return s; };
       const plate=(w,h,r,x,y,z,m)=>{ const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(rr(w,h,r),{depth:0.01,bevelEnabled:false}),m); mesh.position.set(x,y,z); g.add(mesh); };
       plate(0.96,1.20,0.07,0,1.10,0,mat.led); plate(0.94,1.18,0.06,0.01,1.11,0.01,mat.glass);      // light halo behind, glass in front (faces south)
     }},
    {id:'towelrail',type:'полотенцесушитель электрический 0.40×1.80 на простенке севернее двери, низ 0.45',room:9,layer:'bath',pos:[9.77,8.13],rot:0,size:[0.10,2.25,0.40],fixed:'wall',
     build(b){
       [0.03,0.34].forEach(z=>b(0.03,0.06,0.45,2.25,z,z+0.03,mat.lamp));                              // two vertical collectors
       for(let y=0.55;y<2.2;y+=0.10) b(0.035,0.055,y,y+0.02,0.06,0.34,mat.lamp);                     // rungs every 0.10
       [0.55,1.10,1.60,2.15].forEach(y=>[0.03,0.34].forEach(z=>b(0.06,0.10,y,y+0.03,z,z+0.03,mat.handle))); // wall brackets
     }},
    {id:'basinmixer',type:'смеситель раковины настенный, излив 0.18; ось чаши x 9.325',room:9,layer:'bath',pos:[9.275,8.185],rot:0,size:[0.14,1.09,0.20],fixed:'wall',
     build(b){ b(0,0.10,1.00,1.09,0,0.02,mat.lamp); b(0.04,0.06,1.035,1.055,0.02,0.18,mat.lamp); b(0.10,0.14,1.04,1.05,0,0.02,mat.handle); }}, // body, spout, lever
    // ceiling: three IP44 spots Ø0.08 and the extractor fan Ø0.12 above the cistern box
    {id:'spot1',type:'точечный светильник над ванной, IP44',room:9,layer:'bath',pos:[8.48,8.96],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.02,24),mat.lamp); c.position.set(0.04,2.69,0.04); g.add(c); }},
    {id:'spot2',type:'точечный светильник над унитазом',room:9,layer:'bath',pos:[9.48,9.40],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.02,24),mat.lamp); c.position.set(0.04,2.69,0.04); g.add(c); }},
    {id:'spot3',type:'точечный светильник перед зеркалом',room:9,layer:'bath',pos:[9.28,8.65],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.02,24),mat.lamp); c.position.set(0.04,2.69,0.04); g.add(c); }},
    {id:'fan',type:'вентилятор вытяжки Ø0.12 в потолке над коробом',room:9,layer:'bath',pos:[9.31,9.58],rot:0,size:[0.12,2.70,0.12],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.02,24),mat.wpanel); c.position.set(0.06,2.69,0.06); g.add(c); }},
    // electrics: flat boxes 0.08 × 0.08 × 0.01
    {id:'sock21',type:'розетка IP44 + USB на фасаде короба инсталляции, h 1.00',room:9,layer:'bath',pos:[9.68,9.737],rot:0,size:[0.08,1.04,0.01],fixed:'wall',build(b){ b(0,0.08,0.96,1.04,0,0.01,mat.lamp); }},
    {id:'sock22',type:'скрытый вывод для полотенцесушителя, h 0.45',room:9,layer:'bath',pos:[9.842,8.294],rot:0,size:[0.01,0.49,0.08],fixed:'wall',build(b){ b(0,0.01,0.41,0.49,0,0.08,mat.lamp); }},
    {id:'sw5',type:'выключатель 2 клавиши в коридоре у двери санузла: свет + вытяжка; рядом терморегулятор тёплого пола',room:5,layer:'bath',pos:[10.038,8.414],rot:0,size:[0.01,0.99,0.08],fixed:'wall',build(b){ b(0,0.01,0.91,0.99,0,0.08,mat.lamp); }},
    // ---- bathroom 8 (tasks/bath8/README.md, marks M1–M21; grey materials only) ----
    // Room box: x 8.192–9.872, z 11.588–13.144 plus the bump x 9.098–9.872, z 11.384–11.588 (closed by wcbox8). Door on the east
    // wall z 12.20–13.00. The shower runs along the whole west wall (opposite the door); no basin in this room (iteration 2). Tiles follow PLAN.baths[1]: west at x 8.235, south at z 13.124, east at x 9.852; the north wall west
    // of the bump has no tile (z 11.588). The passage strip x 9.10–9.872 × z 12.20–13.00 must stay empty (check.js).
    // Shower floor: the real tray is 0.02 below the finished floor, but floor layers (0.001–0.009) would hide a mesh below 0,
    // so the tray is a darker plate at 0.010 — it reads as a different surface and never flickers with the floor.
    {id:'shower8',type:'душевая зона в уровень пола 0.81×1.54 вдоль западной стены, поддон из плитки на −0.02 с уклоном к трапу',room:8,layer:'bath2',pos:[8.235,11.588],rot:0,size:[0.813,0.01,1.536],fixed:'wall',
     build(b){ b(0,0.813,0.007,0.010,0,1.536,mat.top); }},
    {id:'drain8',type:'линейный трап 1.40×0.06 вдоль западной стены',room:8,layer:'bath2',pos:[8.25,11.65],rot:0,size:[0.06,0.012,1.40],fixed:'wall',
     build(b){ b(0,0.06,0.010,0.012,0,1.40,mat.handle); }},
    {id:'curb8e',type:'бортик душа 0.05×0.05 по восточной кромке на всю длину; вход в душ с юга (z 12.45–13.12) переступается',room:8,layer:'bath2',pos:[9.048,11.588],rot:0,size:[0.05,0.05,1.536],
     build(b){ b(0,0.05,0,0.05,0,1.536,mat.kmat); }},
    {id:'glass8',type:'неподвижное стекло душа 0.86×2.05 на бортике со стороны унитаза (z 11.59–12.45)',room:8,layer:'bath2',pos:[9.088,11.588],rot:0,size:[0.01,2.10,0.862],
     build(b){ b(0,0.01,0.05,0.07,0,0.862,mat.frame); b(0,0.01,0.07,2.10,0,0.862,mat.glass); }},                     // profile, glass
    {id:'rain8',type:'верхний душ Ø0.25 заподлицо с потолком, над закрытой частью душа',room:8,layer:'bath2',pos:[8.52,11.95],rot:0,size:[0.25,2.70,0.25],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.125,0.125,0.02,32),mat.lamp); c.position.set(0.125,2.69,0.125); g.add(c); }},
    {id:'mixer8',type:'термостат душа h 1.10 и ручная лейка h 1.60 в накладном коробе 0.08 (южная стена наружная); восточнее полки',room:8,layer:'bath2',pos:[8.90,13.044],rot:0,size:[0.15,1.70,0.08],fixed:'wall',
     build(b){ b(0.035,0.115,0.90,1.70,0.02,0.08,mat.body); b(0,0.15,1.06,1.14,0,0.02,mat.lamp); b(0.055,0.095,1.58,1.62,0,0.02,mat.lamp); b(0.065,0.085,1.38,1.62,-0.01,0.0,mat.lamp); }}, // pipe cover, thermostat bar, holder, handset
    {id:'niche8',type:'накладная полка-ниша 0.60×0.10×0.30 на южной стене, открыта на север, LED по верхней кромке',room:8,layer:'bath2',pos:[8.30,13.024],rot:0,size:[0.60,1.35,0.10],fixed:'wall',
     build(b){ b(0,0.6,1.05,1.07,0,0.10,mat.body); b(0,0.6,1.33,1.35,0,0.10,mat.body); b(0,0.02,1.07,1.33,0,0.10,mat.body); b(0.58,0.6,1.07,1.33,0,0.10,mat.body); b(0.02,0.58,1.07,1.33,0.08,0.10,mat.body); // bottom, top, sides, back
       b(0.02,0.58,1.32,1.33,0.005,0.02,mat.led); }},                                                                     // LED strip under the top edge
    {id:'wcbox8',type:'выступ северной стены зашит заподлицо (z 11.588) на всю высоту, рама инсталляции внутри; кнопка смыва на оси',room:8,layer:'bath2',pos:[9.098,11.384],rot:0,size:[0.774,2.70,0.204],fixed:'wall',
     build(b){ b(0,0.774,0,2.70,0,0.204,mat.body); b(0.33,0.49,0.96,1.04,0.204,0.209,mat.lamp); }},                    // box, flush plate on the toilet axis (x 9.51)
    {id:'wc8',type:'унитаз подвесной компактный 0.36×0.48, сиденье 0.42, фасад на юг',room:8,layer:'bath2',pos:[9.34,11.588],rot:0,size:[0.36,0.42,0.48],fixed:'wall',
     build(b,g){
       const cyl=(r,h,y,m)=>{ const c=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),m); c.position.set(0.18,y,0.32); g.add(c); };
       b(0.02,0.34,0.20,0.40,0,0.32,mat.kmat); cyl(0.16,0.20,0.30,mat.kmat);                                           // bowl: box at the back, round front to z 0.48
       b(0.03,0.33,0.40,0.42,0.02,0.32,mat.lamp); cyl(0.15,0.02,0.41,mat.lamp);                                        // seat
     }},
    {id:'towel8',type:'полотенцесушитель электрический 0.50×1.80 на южной стене у двери, низ 0.45',room:8,layer:'bath2',pos:[9.30,13.044],rot:0,size:[0.50,2.25,0.08],fixed:'wall',
     build(b){
       [0.03,0.44].forEach(x=>b(x,x+0.03,0.45,2.25,0.02,0.05,mat.lamp));                                                // two vertical collectors
       for(let y=0.55;y<2.2;y+=0.10) b(0.06,0.44,y,y+0.02,0.025,0.045,mat.lamp);                                       // rungs every 0.10
       [0.55,1.10,1.60,2.15].forEach(y=>[0.03,0.44].forEach(x=>b(x,x+0.03,y,y+0.03,0.05,0.08,mat.handle)));            // wall brackets
     }},
    // ceiling: three spots Ø0.08, the extractor fan Ø0.12, hidden LED cove along the north and east walls
    {id:'spot4',type:'точечный светильник над входом в душ, IP65',room:8,layer:'bath2',pos:[8.62,12.75],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.02,24),mat.lamp); c.position.set(0.04,2.69,0.04); g.add(c); }},
    {id:'spot5',type:'точечный светильник в центре комнаты (общий свет)',room:8,layer:'bath2',pos:[9.41,12.56],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.02,24),mat.lamp); c.position.set(0.04,2.69,0.04); g.add(c); }},
    {id:'spot6',type:'точечный светильник над унитазом',room:8,layer:'bath2',pos:[9.48,11.91],rot:0,size:[0.08,2.70,0.08],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.02,24),mat.lamp); c.position.set(0.04,2.69,0.04); g.add(c); }},
    {id:'cove8',type:'скрытый LED-карниз по потолку: северная стена 1.62 и восточная до двери (z 11.59–12.15), h 2.62',room:8,layer:'bath2',pos:[8.235,11.588],rot:0,size:[1.637,2.65,0.562],fixed:'wall',
     build(b){ b(0,1.617,2.55,2.62,0.02,0.06,mat.body); b(0,1.617,2.62,2.65,0,0.02,mat.led);                            // north: shadow profile lip and the strip above it
       b(1.577,1.617,2.55,2.62,0.06,0.562,mat.body); b(1.617,1.637,2.62,2.65,0.06,0.562,mat.led); }},                  // east segment to the door
    {id:'fan8',type:'вентилятор вытяжки Ø0.12 в потолке над унитазом',room:8,layer:'bath2',pos:[9.46,11.69],rot:0,size:[0.12,2.70,0.12],fixed:'wall',
     build(b,g){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.02,24),mat.wpanel); c.position.set(0.06,2.69,0.06); g.add(c); }},
    // electrics: flat boxes 0.08 × 0.08 × 0.01
    {id:'sock24',type:'скрытый вывод для полотенцесушителя, h 0.45',room:8,layer:'bath2',pos:[9.51,13.114],rot:0,size:[0.08,0.49,0.01],fixed:'wall',build(b){ b(0,0.08,0.41,0.49,0,0.01,mat.lamp); }},
    {id:'sw6',type:'выключатель 2 клавиши (свет + вытяжка) и терморегулятор — в спальне 3 у двери санузла',room:3,layer:'bath2',pos:[10.041,12.06],rot:0,size:[0.01,0.99,0.08],fixed:'wall',build(b){ b(0,0.01,0.91,0.99,0,0.08,mat.lamp); }},
    // ---- walk-in closet 6 (tasks/wardrobe6/README.md, marks M1–M13; grey materials only) ----
    // Room box: x 5.565–6.885, z 1.874–3.894, door on the south wall x 6.10–6.885 (opens out into corridor 5).
    // Linear layout: the deep system (0.60) along the west wall, the 0.40 end shelf on the north wall, only flat parts
    // (peg board, mirror, socket) on the east wall. The passage x 6.165–6.885 × z 2.274–3.894 × 0–2.10 stays empty (check.js).
    // Sections A/B have no top board: the mezzanine floor at 2.00 is their top. Rods are cylinders along z, centre ≤ 2.00.
    {id:'wsecA',type:'секция A западной стены: две штанги 1.00 и 1.95 для коротких вещей, открытый каркас без дверей',room:6,layer:'wardrobe',pos:[5.565,1.874],rot:0,size:[0.60,2.00,0.90],fixed:'wall',
     build(b,g){
       b(0,0.60,0,2.00,0,0.02,mat.body); b(0,0.60,0,2.00,0.88,0.90,mat.body);                     // sides, no back, floor 0–0.10 empty
       [1.00,1.95].forEach(y=>{ const r=new THREE.Mesh(new THREE.CylinderGeometry(0.0125,0.0125,0.86,12),mat.dark); r.rotation.x=Math.PI/2; r.position.set(0.30,y,0.45); g.add(r); }); // rods
     }},
    {id:'wsecB',type:'секция B западной стены: длинная штанга 1.75 (пальто, платья), внизу пол 0–0.30 под сапоги и чемодан',room:6,layer:'wardrobe',pos:[5.565,2.774],rot:0,size:[0.60,2.00,0.70],fixed:'wall',
     build(b,g){
       b(0,0.60,0,2.00,0,0.02,mat.body); b(0,0.60,0,2.00,0.68,0.70,mat.body);                     // sides
       const r=new THREE.Mesh(new THREE.CylinderGeometry(0.0125,0.0125,0.66,12),mat.dark); r.rotation.x=Math.PI/2; r.position.set(0.30,1.75,0.35); g.add(r); // rod 1.75
     }},
    {id:'wsecC',type:'секция C у двери: 6 ящиков 0.05–1.13 (верхний на защёлке — аптечка-2), 5 полок с шагом 0.31; глубина 0.50, чтобы не заходить в проём',room:6,layer:'wardrobe',pos:[5.565,3.474],rot:0,size:[0.50,2.70,0.42],fixed:'wall',
     build(b){
       b(0,0.50,0,2.70,0,0.02,mat.body); b(0,0.50,0,2.70,0.40,0.42,mat.body); b(0.02,0.48,2.68,2.70,0.02,0.40,mat.body); b(0.02,0.48,0.03,0.05,0.02,0.40,mat.body); // sides, top, bottom
       for(let i=0;i<6;i++){ const y0=0.05+0.18*i; b(0.48,0.50,y0+0.005,y0+0.175,0.02,0.40,mat.door); b(0.02,0.48,y0,y0+0.02,0.02,0.40,mat.body); } // drawer fronts (push-to-open) and bottoms
       for(let i=0;i<5;i++){ const y=1.13+0.31*i; b(0.02,0.48,y,y+0.02,0.02,0.40,mat.body); }   // shelves 1.13–2.68
     }},
    {id:'wmezz',type:'антресоль над секциями A и B: две полки 2.00–2.35 и 2.35–2.70 (сезонное, постельное, чемодан); верхняя — со стремянки',room:6,layer:'wardrobe',pos:[5.565,1.874],rot:0,size:[0.60,2.70,1.60],fixed:'wall',
     build(b){
       b(0,0.60,2.00,2.70,0,0.02,mat.body); b(0,0.60,2.00,2.70,1.58,1.60,mat.body); b(0,0.60,2.02,2.68,0.89,0.91,mat.body); // sides and the divider over the A/B joint
       [2.00,2.35,2.68].forEach(y=>b(0,0.60,y,y+0.02,0.02,1.58,mat.body));                          // floor (top of A/B), middle shelf, top
     }},
    {id:'wend',type:'торцевой стеллаж 0.72×0.40 на северной стене: инструмент внизу, 4 наклонные полки под обувь 0.45–1.25, закрытый шкафчик-аптечка 1.25–1.60, выше полки под сумки и коробки',room:6,layer:'wardrobe',pos:[6.17,1.874],rot:0,size:[0.715,2.70,0.40],fixed:'wall',
     build(b){
       b(0,0.02,0,2.70,0,0.40,mat.body); b(0.695,0.715,0,2.70,0,0.40,mat.body); b(0.02,0.695,2.68,2.70,0,0.40,mat.body); // sides (0.715: the west side sits 0.005 off section B so the parts do not read as one block by float noise), top
       [0.03,0.23,0.43,1.23,1.60,1.97,2.34].forEach(y=>b(0.02,0.695,y,y+0.02,0,0.40,mat.body));       // flat shelves: two tool tiers, cabinet floor/top, upper shelves
       [0.65,0.85,1.05].forEach(y=>{ const m=b(0.02,0.695,y,y+0.02,0.02,0.38,mat.body); m.rotation.x=0.26; }); // shoe shelves tilted 15°, front low
       b(0.03,0.685,1.25,1.60,0.38,0.40,mat.wdoor); b(0.36,0.42,1.30,1.32,0.40,0.41,mat.handle);       // medicine cabinet door 1.25–1.60 with a knob
     }},
    {id:'wpeg',type:'перфопанель 0.60×0.80 для ручного инструмента на восточной стене у торца, вынос крючков ≤ 0.08',room:6,layer:'wardrobe',pos:[6.865,2.30],rot:0,size:[0.02,1.80,0.60],fixed:'wall',
     build(b){ b(0,0.02,1.00,1.80,0,0.60,mat.wpanel); }},
    {id:'wmirror',type:'зеркало ростовое 0.50×1.60 без рамы напротив длинной штанги',room:6,layer:'wardrobe',pos:[6.865,3.00],rot:0,size:[0.02,1.90,0.50],fixed:'wall',
     build(b){ b(0,0.02,0.30,1.90,0,0.50,mat.glass); }},
    {id:'wboard',type:'держатель гладильной доски: две скобы на внутренней стороне двери (доска 1.20×0.35 висит 0.50–1.70)',room:6,layer:'wardrobe',pos:[6.30,3.874],rot:0,size:[0.40,1.20,0.02],fixed:'wall',
     build(b){ [0,0.36].forEach(x=>b(x,x+0.04,1.10,1.20,0,0.02,mat.handle)); }},
    // hung on a hook 0.10 above the floor: a floor-standing step inside section B reads as furniture facing section C (layout.js passage rule)
    {id:'wstep',type:'складная стремянка 2 ступени на крючке у боковины секции B, низ 0.10 (разложенная 0.40×0.30×0.45)',room:6,layer:'wardrobe',pos:[5.60,2.794],rot:0,size:[0.40,0.58,0.12],fixed:'wall',
     build(b){ b(0,0.40,0.10,0.55,0.02,0.12,mat.hdark); b(0.18,0.22,0.55,0.58,0,0.02,mat.handle); }},
    {id:'wlight',type:'линейный потолочный светильник 1.85×0.04 над проходом, 4000 K, от датчика движения M11',room:6,layer:'wardrobe',pos:[6.48,1.95],rot:0,size:[0.04,2.70,1.85],fixed:'wall',
     build(b){ b(0,0.04,2.68,2.70,0,1.85,mat.led); }},
    {id:'led6',type:'LED-лента под передней кромкой антресоли, свет вниз на штанги; включается вместе с M9',room:6,layer:'wardrobe',pos:[6.135,1.90],rot:0,size:[0.02,2.00,1.55],fixed:'wall',
     build(b){ b(0,0.02,1.98,2.00,0,1.55,mat.led); }},
    {id:'sw7',type:'датчик движения + выключатель в коридоре у двери гардеробной: свет M9+M10 от датчика, клавиша — принудительно',room:5,layer:'wardrobe',pos:[5.76,4.033],rot:0,size:[0.08,0.99,0.01],fixed:'wall',build(b){ b(0,0.08,0.91,0.99,0,0.01,mat.lamp); }},
    {id:'sock25',type:'розетка у двери для пылесоса и утюга, h 0.30',room:6,layer:'wardrobe',pos:[6.875,3.55],rot:0,size:[0.01,0.34,0.08],fixed:'wall',build(b){ b(0,0.01,0.26,0.34,0,0.08,mat.lamp); }},
    // ---- loggia 10 (tasks/balcony10/README.md, marks M1–M13; grey materials only) ----
    // Room box: x 13.91–15.1, z 2.268–6.043; glazing on the east wall z 2.40–5.90, opening from the kitchen on the west wall z 3.353–4.971 (top 2.10).
    // South end: cantilevered desk and the IT shelf above it; north end: the shelving unit. Nothing else stands on the floor,
    // the opening zone x 13.91–14.4 × z of the opening stays clear (check.js).
    {id:'bdesk',type:'подвесной стол 1.19×0.80 во всю ширину у южного торца, верх 0.75, консоли к южной и западной стенам, уголок у стекла; под столом пусто',room:10,layer:'balcony',pos:[13.91,5.24],rot:0,size:[1.19,0.75,0.80],fixed:'wall',
     build(b){
       b(0,1.19,0.71,0.75,0,0.80,mat.table);                                                         // top 0.04
       b(0,1.19,0.66,0.71,0.75,0.80,mat.dark); b(0,0.05,0.66,0.71,0,0.75,mat.dark); b(1.14,1.19,0.66,0.71,0.30,0.50,mat.dark); // angle consoles 0.05 right under the top: south wall, west wall, bracket by the glass
     }},
    {id:'bchair',type:'стул 0.45 с прямой спинкой до 0.90, задвинут под стол на 0.24',room:10,layer:'balcony',pos:[14.28,5.00],rot:0,size:[0.45,0.90,0.45],
     build(b){
       b(0,0.45,0.42,0.46,0,0.45,mat.chair); b(0,0.45,0.46,0.90,0,0.04,mat.chair);                    // seat, straight back on the north side
       [[0.02,0.02],[0.40,0.02],[0.02,0.40],[0.40,0.40]].forEach(([x,z])=>b(x,x+0.03,0,0.42,z,z+0.03,mat.chair)); // legs
     }},
    {id:'itshelf',type:'полка-ИТ-хаб 1.19×0.60 над столом, плита 0.05 на 2.00–2.05, бортик 0.03 спереди, вырез 0.05×0.30 под кабели у южной стены; до потолка 0.65',room:10,layer:'balcony',pos:[13.91,5.44],rot:0,size:[1.19,2.08,0.60],fixed:'wall',
     build(b){
       b(0,1.19,2.00,2.05,0,0.55,mat.body); b(0,0.445,2.00,2.05,0.55,0.60,mat.body); b(0.745,1.19,2.00,2.05,0.55,0.60,mat.body); // plate with the cable notch x 0.445–0.745 at the wall
       b(0,1.19,2.05,2.08,0,0.03,mat.body);                                                           // front lip
       b(0,1.19,1.95,2.00,0.55,0.60,mat.dark); b(0,0.05,1.95,2.00,0,0.55,mat.dark);                   // consoles to the south and west walls
     }},
    {id:'bshelf',type:'стеллаж 1.19×0.40 у северного торца, верх 2.05: 3 закрытых ящика по 0.25, выше 4 ряда открытых секций с перегородкой по центру; площадка 2.05–2.70 под ИТ-устройства',room:10,layer:'balcony',pos:[13.91,2.268],rot:0,size:[1.19,2.05,0.40],fixed:'wall',
     build(b){
       b(0,0.02,0,2.05,0,0.40,mat.body); b(1.17,1.19,0,2.05,0,0.40,mat.body); b(0.02,1.17,2.03,2.05,0,0.40,mat.body); b(0.02,1.17,0.03,0.05,0,0.40,mat.body); // sides, top, bottom
       for(let i=0;i<3;i++){ const y0=0.25*i; b(0.02,1.17,y0+0.005,y0+0.245,0.38,0.40,mat.door); } // drawer fronts 0–0.75, push-to-open
       [0.75,1.075,1.40,1.725].forEach(y=>b(0.02,1.17,y,y+0.02,0,0.40,mat.body));                    // open shelves, pitch 0.325
       b(0.585,0.605,0.77,2.03,0,0.40,mat.body);                                                     // centre divider x 14.505
     }},
    {id:'cable10',type:'кабель-канал 0.06×0.04 по западной стене на 2.23–2.27, выше проёма в кухню (2.10): питание и сеть между полкой и стеллажом',room:10,layer:'balcony',pos:[13.91,2.40],rot:0,size:[0.06,2.27,3.00],fixed:'wall',
     build(b){ b(0,0.06,2.23,2.27,0,3.00,mat.wpanel); }},
    // electrics: flat boxes 0.08 × 0.08 × 0.01
    {id:'sock26',type:'розеточный блок ИТ над полкой: 6 розеток + ввод Ethernet, отдельная линия, h 2.25',room:10,layer:'balcony',pos:[14.17,6.033],rot:0,size:[0.08,2.29,0.01],fixed:'wall',build(b){ b(0,0.08,2.21,2.29,0,0.01,mat.lamp); }},
    {id:'sock27',type:'розетки 2+2 USB над столешницей у восточного края, h 0.90',room:10,layer:'balcony',pos:[14.77,6.033],rot:0,size:[0.08,0.94,0.01],fixed:'wall',build(b){ b(0,0.08,0.86,0.94,0,0.01,mat.lamp); }},
    {id:'sock28',type:'розеточный блок над стеллажом: 4 розетки для площадки 2.05–2.70, h 2.25',room:10,layer:'balcony',pos:[14.17,2.268],rot:0,size:[0.08,2.29,0.01],fixed:'wall',build(b){ b(0,0.08,2.21,2.29,0,0.01,mat.lamp); }},
    {id:'sock29',type:'розетка в открытой секции стеллажа 0.75–1.075 (зарядки), h 1.00',room:10,layer:'balcony',pos:[14.77,2.268],rot:0,size:[0.08,1.04,0.01],fixed:'wall',build(b){ b(0,0.08,0.96,1.04,0,0.01,mat.lamp); }},
    {id:'led7',type:'LED-лента под передней кромкой ИТ-полки, свет на столешницу, 4000 K; выключатель на торце полки',room:10,layer:'balcony',pos:[13.95,5.44],rot:0,size:[1.11,2.00,0.02],fixed:'wall',
     build(b){ b(0,1.11,1.98,2.00,0,0.02,mat.led); }},
    {id:'blight',type:'линейный потолочный светильник 2.20×0.04 по оси лоджии от проёма до стула, 4000 K',room:10,layer:'balcony',pos:[14.48,2.90],rot:0,size:[0.04,2.70,2.20],fixed:'wall',
     build(b){ b(0,0.04,2.68,2.70,0,2.20,mat.led); }},
    {id:'sw8',type:'выключатель потолочного света на западной стене южнее проёма (проём до 4.971), h 0.95',room:10,layer:'balcony',pos:[13.91,5.02],rot:0,size:[0.01,0.99,0.08],fixed:'wall',build(b){ b(0,0.01,0.91,0.99,0,0.08,mat.lamp); }},
    {id:'blinds10',type:'рулонные солнцезащитные шторы: кассеты по верху остекления z 2.40–5.90 (собраны)',room:10,layer:'balcony',pos:[15.02,2.40],rot:0,size:[0.08,2.30,3.50],fixed:'wall',
     build(b){ b(0,0.08,2.22,2.30,0,3.50,mat.wpanel); }},
  ];
  function buildItem(it){
    const g=new THREE.Group();
    g.userData={id:it.id,type:it.type,room:it.room,layer:it.layer,pos:it.pos.slice(),rot:it.rot||0,size:it.size.slice(),fixed:it.fixed||null,attach:it.attach||null,proxy:[]};
    const b=(x0,x1,y0,y1,z0,z1,m)=>{ const w=x1-x0,h=y1-y0,d=z1-z0, geo=new THREE.BoxGeometry(w,h,d), uv=geo.attributes.uv, F=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]]; // UV in metres per face (±x,±y,±z), so VIZ pattern scale holds on items too
      for(let i=0;i<uv.count;i++){ const [a,c]=F[i>>2]; uv.setXY(i,uv.getX(i)*a,uv.getY(i)*c); }
      const mesh=new THREE.Mesh(geo,m); mesh.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2); g.add(mesh); return mesh; };
    b.phys=(x0,x1,y0,y1,z0,z1)=>g.userData.proxy.push([x0,x1,y0,y1,z0,z1]); // explicit collision box (local); declared → render meshes leave physics (B02)
    it.build(b,g);
    LAYERS[it.layer].add(g); ITEM_GROUPS[it.id]=g;
    poseGroup(g);
    if(it.glb){ g.userData.glb=it.glb; g.userData.glbRot=it.glbRot||0; }
    return g;
  }
  // GLB model of an item: the procedural build stays as fallback and proxy; on success its meshes are replaced by the model.
  // Material names inside the GLB are ITEM_MATS keys or slot names (fabric/wood/paint/metal) → same grey concept materials, VIZ twins keep working.
  const GLB_MATS={fabric:mat.sofa,metal:mat.frame,wood:mat.table,paint:mat.chair}; // slot name in the GLB → grey concept material carrying that slot
  const slotMat=n=>{ if(!GLB_MATS[n]){ console.warn('glb: unknown material "'+n+'", grey used'); GLB_MATS[n]=M(0x8c8c8c); GLB_MATS[n].userData.slot=n; } return GLB_MATS[n]; };
  // Model checks on load (console warnings, never exceptions): metres, Box3 inside size ±1 cm, bottom at y=0, pivot at the NW corner,
  // facade like the procedural version (centroid of the top quarter offset from the footprint centre points the same way — back of a chair/sofa).
  // vertices of root's meshes in the frame of `frame` (the item group, or root itself when detached): bounding box and top-quarter centroid
  const scan=(root,h,frame)=>{ frame=frame||root; frame.updateMatrixWorld(true); root.updateMatrixWorld(true); const inv=new THREE.Matrix4().copy(frame.matrixWorld).invert(), v=new THREE.Vector3(), c=new THREE.Vector3(), bb=new THREE.Box3(); let n=0;
    root.traverse(o=>{ if(!o.isMesh) return; const p=o.geometry.attributes.position; for(let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).applyMatrix4(inv); bb.expandByPoint(v); if(v.y>0.75*h){ c.add(v); n++; } } });
    return {bb,top:n?c.divideScalar(n):null}; };
  function validateItemGlb(id,model,ref){ // ref: procedural group or its scan().top computed before removal
    const g=ITEM_GROUPS[id], sz=g.userData.size, out=[], warn=m=>{ out.push(m); console.warn('glb '+id+': '+m); };
    const {bb,top:b}=scan(model,sz[1],model.parent||model), e=new THREE.Vector3(); bb.getSize(e);
    const r=Math.max(e.x,e.y,e.z)/Math.max(...sz); if(r>2||r<0.5) warn('units: model extent '+e.toArray().map(v=>v.toFixed(2)).join('×')+' vs size '+sz.join('×')+' — not metres?');
    else{ if(bb.min.x<-0.01||bb.min.z<-0.01||bb.max.x>sz[0]+0.01||bb.max.y>sz[1]+0.01||bb.max.z>sz[2]+0.01) warn('outside size: '+[bb.min.x,bb.min.z,bb.max.x,bb.max.y,bb.max.z].map(v=>v.toFixed(3)).join(' ')+' vs '+sz.join('×')+' (pivot must be the NW corner)');
      if(Math.abs(bb.min.y)>0.01) warn('bottom at y='+bb.min.y.toFixed(3)+', expected 0'); }
    if(ref){ const a=ref.isObject3D?scan(ref,sz[1]).top:ref, cx=sz[0]/2, cz=sz[2]/2;
      if(a&&b){ const ax=a.x-cx, az=a.z-cz, bx=b.x-cx, bz=b.z-cz, la=Math.hypot(ax,az), lb=Math.hypot(bx,bz);
        if(la>0.02&&(lb<0.01||(ax*bx+az*bz)/(la*lb)<0.5)) warn('facade: back points to ('+bx.toFixed(2)+','+bz.toFixed(2)+'), procedural ('+ax.toFixed(2)+','+az.toFixed(2)+')'); } }
    return out;
  }
  window.validateItemGlb=validateItemGlb;
  const GLB_CACHE={}; // url → promise of the loaded scene; items sharing a file get clones with shared geometry (6 chairs = one geometry)
  const fetchGlb=url=>GLB_CACHE[url]||(GLB_CACHE[url]=new Promise((res,rej)=>{ if(typeof THREE.GLTFLoader!=='function') return rej(new Error('no GLTFLoader'));
    new THREE.GLTFLoader().load(url,gltf=>{ gltf.scene.traverse(o=>{ if(o.isMesh){ const name=o.material.name; o.material.dispose(); o.material=slotMat(name); } }); res(gltf.scene); },undefined,rej); }));
  function loadItemGlb(id,url){
    const g=ITEM_GROUPS[id]; url=url||g.userData.glb;
    return fetchGlb(url).then(scene=>{
      const model=scene.clone(), sz=g.userData.size, ref=scan(g,sz[1]).top;
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
    const g=ITEM_GROUPS[id], boxes=[];
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
