// Interior items as data. Each item is a THREE.Group with a permanent id and userData
// {id, type, room, layer, pos:[x,z], rot, size:[w,h,d], fixed}. Parts are built in item-local coords: x right 0..w,
// z down 0..d (at rot=0), y from the finished floor; pos is the north-west corner at rot=0, rot is degrees clockwise
// in top view (same as markup rectangles). fixed:'wall' moves only along its wall. Layers: kitchen/hall/laundry/kid/master.
var furnGroup=new THREE.Group(), hallGroup=new THREE.Group(), laundryGroup=new THREE.Group(), kidGroup=new THREE.Group(), masterGroup=new THREE.Group();
const LAYERS={kitchen:furnGroup,hall:hallGroup,laundry:laundryGroup,kid:kidGroup,master:masterGroup};
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
  const chair=(backEast)=>(b,g)=>{ // chair 0.42×0.42, back on the west or east side
    b(0,0.42,0.42,0.46,0,0.42,mat.chair); b(0.03,0.39,0.46,0.49,0.03,0.39,mat.cushion); // seat cushion
    const bx=backEast?0.38:0; b(bx,bx+0.04,0.46,0.9,0,0.42,mat.chair);
    [[0.03,0.03],[0.35,0.03],[0.03,0.35],[0.35,0.35]].forEach(([x,z])=>b(x,x+0.04,0,0.42,z,z+0.04,mat.chair));
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
     build(b){ b(0,0.8,0.72,0.76,0,1.8,mat.table); b(0.05,0.75,0.64,0.72,0.05,1.75,mat.table); [[0.05,0.05],[0.7,0.05],[0.05,1.7],[0.7,1.7]].forEach(([x,z])=>b(x,x+0.05,0,0.72,z,z+0.05,mat.table)); }}, // apron under the tabletop
    {id:'chair1',type:'стул',room:4,layer:'kitchen',pos:[9.54,KN+0.04+0.35-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(false)},
    {id:'chair2',type:'стул',room:4,layer:'kitchen',pos:[9.54,KN+0.04+0.94-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(false)},
    {id:'chair3',type:'стул',room:4,layer:'kitchen',pos:[9.54,KN+0.04+1.53-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(false)},
    {id:'chair4',type:'стул',room:4,layer:'kitchen',pos:[10.54,KN+0.04+0.35-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(true)},
    {id:'chair5',type:'стул',room:4,layer:'kitchen',pos:[10.54,KN+0.04+0.94-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(true)},
    {id:'chair6',type:'стул',room:4,layer:'kitchen',pos:[10.54,KN+0.04+1.53-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(true)},
    {id:'lamp',type:'настенный светильник над столом',room:4,layer:'kitchen',pos:[10.12,KN],rot:0,size:[0.26,1.94,0.63],fixed:'wall', // size by the shade
     build(b,g){ b(0.11,0.15,1.9,1.94,0,0.5,mat.lamp); const sh=new THREE.Mesh(new THREE.ConeGeometry(0.13,0.16,16,1,true),mat.lamp); sh.position.set(0.13,1.82,0.5); g.add(sh); }},
    {id:'tv',type:'телевизор 58"',room:4,layer:'kitchen',pos:[11.85,KN+0.02],rot:0,size:[1.3,1.75,0.04],fixed:'wall',build(b){ b(0,1.3,1.0,1.75,0,0.04,mat.dark); b(0.03,1.27,1.03,1.72,0.035,0.04,mat.screen); }}, // frame and screen
    {id:'console',type:'подвесная консоль под ТВ',room:4,layer:'kitchen',pos:[11.9,KN],rot:0,size:[1.2,0.75,0.38],fixed:'wall',build(b){ b(0,1.2,0.45,0.75,0,0.38,mat.base); }},
    {id:'sofa',type:'диван 2 м',room:4,layer:'kitchen',pos:[11.35,6.287-0.9],rot:0,size:[2.0,0.85,0.88],
     build(b){ b(0,2,0.1,0.42,0,0.88,mat.sofa); b(0,2,0.42,0.85,0.63,0.88,mat.sofa); b(0,0.15,0.42,0.6,0,0.88,mat.sofa); b(1.85,2,0.42,0.6,0,0.88,mat.sofa);
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
    {id:'kidbed',type:'кровать-чердак с лестницей-комодом и полкой хранения',room:1,layer:'kid',pos:[2.835,1.884],rot:0,size:[2.6,2.6,2.97],fixed:'wall',
     build(b){
       const PL=1.8, TOP=2.3, HF=2.2, X0=1.4, W=2.6;
       b(X0,W,PL-0.1,PL,0,2.0,mat.kbody);                                                          // platform, world x 4.235–5.435
       [[X0,0],[W-0.08,0],[X0,1.92],[W-0.08,1.92]].forEach(([x,z])=>b(x,x+0.08,0,PL-0.1,z,z+0.08,mat.kleg)); // legs
       b(X0+0.08,W-0.08,0.10,0.14,1.92,2.0,mat.kleg);                                               // lower rail between the south legs
       b(X0,X0+0.04,PL-0.2,PL-0.1,0,2.0,mat.kbody); b(X0,W,PL-0.2,PL-0.1,1.96,2.0,mat.kbody);       // apron on the west and south edges
       b(X0+0.01,X0+0.03,PL-0.11,PL-0.1,0,2.0,mat.led);                                             // M20: LED strip under the west edge
       b(X0+0.05,W-0.03,PL,PL+0.18,0.03,1.95,mat.kmat);                                             // mattress 1.80–1.98
       b(X0+0.15,W-0.13,PL+0.18,PL+0.28,0.1,0.5,mat.pillow);                                        // pillow
       b(X0+0.1,W-0.15,PL+0.18,PL+0.24,0.8,1.9,mat.terra);                                          // blanket at the feet
       b(X0,X0+0.02,PL,TOP,0.5,2.0,mat.rail); b(X0,W,PL,HF,2.0,2.02,mat.rail);                      // west and south rails
       b(X0,W,HF,TOP,2.0,2.97,mat.kbody); b(X0,X0+0.08,0,HF,2.89,2.97,mat.kleg);                    // storage shelf above the passage and its post
       b(X0,X0+0.02,TOP,TOP+0.3,2.0,2.97,mat.rail); b(X0+0.02,W,TOP,TOP+0.3,2.95,2.97,mat.rail);    // shelf rails
       b(X0-0.03,X0,1.38,1.42,2.91,2.95,mat.knob);                                                  // backpack hook on the post, 1.40
       for(let i=0;i<5;i++){ const x0=i*0.28, x1=x0+0.28, top=0.3*(i+1);                             // stair-chest: 5 steps 0.28 × 0.30, drawer fronts south
         b(x0,x1,0,top,0,0.5,mat.kbody); b(x0+0.01,x1-0.01,0.02,top-0.02,0.5,0.52,mat.oak);
         b((x0+x1)/2-0.075,(x0+x1)/2+0.075,top-0.07,top-0.05,0.52,0.54,mat.knob);
         b(x0,x1,top+0.885,top+0.915,0.02,0.05,mat.oak); }                                          // handrail segments on the north wall, tread + 0.90
     }},
    {id:'kiddesk',type:'угловой стол: вдоль окна 2.39 м и вдоль южной стены 1.23 м',room:1,layer:'kid',pos:[0.896,2.474],rot:0,size:[1.234,0.72,2.39],fixed:'wall',
     build(b){
       b(0,0.45,0.68,0.72,0,2.39,mat.hpl); b(0.45,1.234,0.68,0.72,1.79,2.39,mat.hpl);                 // worktop: west wing (depth 0.45, like the shelf unit) and south wing (depth 0.60)
       b(0.02,0.43,0,0.68,0,0.02,mat.kbody); b(1.214,1.234,0,0.68,1.81,2.37,mat.kbody);               // end panels: north (at the shelf unit) and east
       b(0.05,0.43,0,0.68,0.98,1.0,mat.kbody);                                                        // middle support under the west wing, clear of the chair
       b(0.10,0.20,0.72,0.725,0.59,1.19,mat.knob);                                                     // vent grille over the radiator, 0.60 × 0.10
     }},
    {id:'kidped',type:'тумба с 3 ящиками у торца стола, столешница вровень',room:1,layer:'kid',pos:[2.13,4.364],rot:0,size:[0.42,0.72,0.50],fixed:'wall',
     build(b){ b(0.02,0.40,0,0.68,0.02,0.50,mat.kbody); b(0,0.42,0.68,0.72,0,0.50,mat.hpl);
       [0.06,0.26,0.46].forEach(y=>{ b(0.02,0.40,y,y+0.18,0,0.02,mat.oak); b(0.135,0.285,y+0.11,y+0.13,-0.015,0,mat.knob); }); }}, // drawer fronts to the room
    {id:'kidchair',type:'рабочее кресло, регулируемое',room:1,layer:'kid',pos:[1.30,3.60],rot:0,size:[0.55,0.85,0.55],
     build(b,g){
       b(0.05,0.50,0.42,0.47,0.05,0.50,mat.terra); b(0.50,0.55,0.47,0.85,0.08,0.47,mat.terra);      // seat and back, faces the window
       const c=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.39,10),mat.knob); c.position.set(0.275,0.225,0.275); g.add(c); // gas lift
       b(0.03,0.52,0,0.03,0.26,0.29,mat.knob); b(0.26,0.29,0,0.03,0.03,0.52,mat.knob);                // base cross
     }},
    {id:'kidshelf',type:'стеллаж узкий в углу, фасадом к двери',room:1,layer:'kid',pos:[0.896,2.474],rot:270,size:[0.60,2.70,0.43],fixed:'wall',
     build(b){
       const W=0.60, D=0.40, t=0.02;
       b(0,W,0,t,0,D,mat.kbody); b(0,W,2.7-t,2.7,0,D,mat.kbody); b(0,W,t,2.7-t,0,t,mat.oak);           // bottom, top, oak back
       b(0,t,t,2.7-t,t,D,mat.kbody); b(W-t,W,t,2.7-t,t,D,mat.kbody);                                  // sides
       [0.90,1.27,1.63,2.00].forEach(y=>b(t,W-t,y-t,y,t,D,mat.kbody));                                 // shelves: closed 0–0.9, open cells 0.9–2.0, attic 2.0–2.7
       b(t+0.003,W-t-0.003,t+0.003,0.90-t-0.003,D,D+0.018,mat.oak); b(W/2-0.005,W/2+0.005,0.78,0.86,D+0.018,D+0.03,mat.knob);   // lower door
       b(t+0.003,W-t-0.003,2.0+0.003,2.7-t-0.003,D,D+0.018,mat.oak); b(W/2-0.005,W/2+0.005,2.05,2.13,D+0.018,D+0.03,mat.knob); // attic door
     }},
    {id:'kidshelf2',type:'стеллаж узкий с открытыми полками в юго-западном углу, от стола до потолка',room:1,layer:'kid',pos:[0.896,4.864],rot:270,size:[0.60,2.70,0.25],fixed:'wall',
     build(b){
       const W=0.60, D=0.25, t=0.02, Y0=0.72; // shallow: 0.20 of the desk stays usable in front of it
       b(0,W,Y0,Y0+t,0,D,mat.kbody); b(0,W,2.7-t,2.7,0,D,mat.kbody); b(0,W,Y0+t,2.7-t,0,t,mat.oak);   // bottom on the desk, top, oak back
       b(0,t,Y0+t,2.7-t,t,D,mat.kbody); b(W-t,W,Y0+t,2.7-t,t,D,mat.kbody);                        // sides
       [1.20,1.70,2.20].forEach(y=>b(t,W-t,y-t,y,t,D,mat.kbody));                                  // 4 open cells
     }},
    {id:'kidshelf3',type:'полка над окном между стеллажами, одна открытая ячейка',room:1,layer:'kid',pos:[0.896,2.474],rot:0,size:[0.40,2.70,1.79],fixed:'wall',
     build(b){ b(0,0.40,2.30,2.32,0,1.79,mat.kbody); b(0,0.40,2.68,2.70,0,1.79,mat.kbody); b(0,0.02,2.32,2.68,0,1.79,mat.oak); }}, // bottom, top, oak back over the window lintel
    {id:'kidsofa',type:'диванчик в нише под кроватью',room:1,layer:'kid',pos:[4.65,2.05],rot:0,size:[0.75,0.80,1.60],
     build(b){
       b(0,0.75,0.10,0.45,0,1.60,mat.fabric); b(0.60,0.75,0.45,0.80,0,1.60,mat.fabric);            // seat and back to the east wall
       b(0,0.60,0.45,0.60,0,0.15,mat.fabric); b(0,0.60,0.45,0.60,1.45,1.60,mat.fabric);              // armrests
       [[0.03,0.03],[0.69,0.03],[0.03,1.54],[0.69,1.54]].forEach(([x,z])=>b(x,x+0.03,0,0.10,z,z+0.03,mat.knob)); // legs
     }},
    {id:'kidrug',type:'ковёр моющийся',room:1,layer:'kid',pos:[2.15,2.60],rot:0,size:[1.60,0.01,1.70],
     build(b){ b(0,1.6,0,0.01,0,1.7,mat.rug); }},
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
    {id:'sock5',type:'розетка общего назначения (пылесос, увлажнитель)',room:1,layer:'kid',pos:[2.56,4.834],rot:0,size:[0.08,0.34,0.01],fixed:'wall',build(b){ b(0,0.08,0.26,0.34,0,0.01,mat.lamp); }},
    {id:'sock6',type:'розетка в потолке для проектора',room:1,layer:'kid',pos:[2.26,3.51],rot:0,size:[0.08,2.70,0.08],fixed:'wall',build(b){ b(0,0.08,2.69,2.70,0,0.08,mat.lamp); }},
    {id:'sock7',type:'розетка в потолке для мотора экрана',room:1,layer:'kid',pos:[1.06,2.11],rot:0,size:[0.08,2.70,0.08],fixed:'wall',build(b){ b(0,0.08,2.69,2.70,0,0.08,mat.lamp); }},
    // ---- master bedroom 3 (tasks/room3-master/README.md, marks M1–M28; grey materials only) ----
    // Room box: x 10.021–14.76, z 9.777–13.144. Items are built as if against the north wall and turned 180° (rot 180, pos = SE corner): the composition faces north. Wall-mounted boxes sit 0.02–0.03 in front of the wall (wallpaper at 0.015).
    {id:'mbed',type:'кровать 160×200 с мягким изголовьем',room:3,layer:'master',pos:[14.76,13.144],rot:180,size:[1.70,1.10,2.20],fixed:'wall',
     build(b){
       b(0.05,1.65,0,0.10,0.05,2.15,mat.dark); b(0,1.7,0.10,0.35,0,2.2,mat.body);                 // plinth inset 0.05, frame; east side touches the wall under the window
       b(0.05,1.65,0.35,0.55,0.10,2.10,mat.kmat); b(0,1.7,0.35,1.10,0,0.08,mat.cushion);           // mattress (top 0.55 = window sill), headboard
       [[0.12,0.82],[0.88,1.58]].forEach(([x0,x1])=>b(x0,x1,0.55,0.67,0.15,0.60,mat.pillow));       // two pillows
       b(0.10,1.60,0.55,0.61,0.85,2.15,mat.cushion);                                               // blanket at the feet
     }},
    {id:'mnight',type:'подвесная тумба у кровати, западная',room:3,layer:'master',pos:[13.06,13.144],rot:180,size:[0.50,0.58,0.40],fixed:'wall',
     build(b){ b(0,0.5,0.40,0.58,0.02,0.38,mat.body); b(0.01,0.49,0.41,0.57,0.38,0.40,mat.wdoor); b(0.175,0.325,0.48,0.50,0.40,0.415,mat.handle); }}, // one drawer
    {id:'mcab',type:'блок подвесных ящиков над изголовьем, восточная секция под кондиционер',room:3,layer:'master',pos:[14.76,13.144],rot:180,size:[2.40,2.70,0.35],fixed:'wall',
     build(b){
       const t=0.02;
       b(0,2.4,2.7-t,2.7,0,0.35,mat.body); b(0.9,2.4,1.85,1.85+t,0,0.35,mat.body); b(0.9,2.4,1.85+t,2.7-t,0,t,mat.body); // top, bottom and back of the 3 door sections; AC section has neither
       [0,0.9,1.4,1.9,2.38].forEach(x=>b(x,x+t,1.85+t,2.7-t,t,0.35,mat.body));                     // section walls
       for(let i=0;i<3;i++){ const x0=0.9+i*0.5+t+0.003; b(x0,x0+0.5-2*t-0.006,1.85+t+0.003,2.7-t-0.003,0.33,0.35,mat.wdoor); b(x0+0.2,x0+0.25,2.1,2.12,0.35,0.365,mat.handle); } // doors
       for(let y=1.89;y<2.66;y+=0.04) b(0.02,0.88,y,y+0.02,0.33,0.35,mat.wdoor);                   // louvred front of the AC section, open bottom
     }},
    {id:'mward',type:'шкаф на две двери для повседневных вещей',room:3,layer:'master',pos:[12.36,13.144],rot:180,size:[1.00,2.70,0.60],fixed:'wall',
     build(b){
       b(0,0.02,0,2.7,0.03,0.58,mat.body); b(0.98,1.0,0,2.7,0.03,0.58,mat.body); b(0,1.0,2.68,2.7,0.03,0.58,mat.body); b(0,1.0,0,0.02,0.03,0.58,mat.body); b(0.02,0.98,0.02,2.68,0.03,0.05,mat.body); // body
       b(0.02,0.496,0.02,2.68,0.58,0.60,mat.wdoor); b(0.504,0.98,0.02,2.68,0.58,0.60,mat.wdoor);   // two doors
       b(0.46,0.475,1.0,1.3,0.60,0.62,mat.handle); b(0.525,0.54,1.0,1.3,0.60,0.62,mat.handle);      // vertical bar handles
     }},
    {id:'mtv',type:'телевизор 43" напротив изножья, центр на оси кровати',room:3,layer:'master',pos:[14.395,9.847],rot:180,size:[0.97,1.63,0.04],fixed:'wall',
     build(b){ b(0,0.97,1.07,1.63,0,0.04,mat.dark); b(0.02,0.95,1.09,1.61,0,0.005,mat.screen); }},
    {id:'mconsole',type:'подвесная консоль под ТВ, два ящика',room:3,layer:'master',pos:[14.51,10.127],rot:180,size:[1.20,0.60,0.35],fixed:'wall',
     build(b){ b(0,1.2,0.42,0.60,0.02,0.33,mat.body); [0.01,0.605].forEach(x=>{ b(x,x+0.585,0.43,0.59,0,0.02,mat.wdoor); b(x+0.22,x+0.37,0.50,0.52,-0.015,0,mat.handle); }); }},
    {id:'vanity',type:'туалетный столик с плоским ящиком',room:3,layer:'master',pos:[11.9,10.227],rot:180,size:[1.00,0.75,0.45],fixed:'wall',
     build(b){ b(0,1.0,0.72,0.75,0,0.45,mat.body); b(0.03,0.97,0.62,0.72,0.05,0.43,mat.body); b(0.04,0.96,0.63,0.71,0.03,0.05,mat.wdoor);
       b(0,0.03,0,0.72,0.05,0.43,mat.body); b(0.97,1.0,0,0.72,0.05,0.43,mat.body); }},                // side panels
    {id:'vmirror',type:'зеркало над туалетным столиком',room:3,layer:'master',pos:[11.8,9.827],rot:180,size:[0.80,1.80,0.03],fixed:'wall',
     build(b){ b(0,0.8,0.80,1.80,0.01,0.03,mat.frame); b(0.02,0.78,0.82,1.78,0,0.01,mat.glass); }},
    {id:'vpouf',type:'пуфик у туалетного столика',room:3,layer:'master',pos:[11.6,10.681],rot:180,size:[0.40,0.45,0.40],
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
    {id:'led4',type:'LED-лента под блоком ящиков, свет на изголовье',room:3,layer:'master',pos:[14.72,12.814],rot:180,size:[2.32,1.85,0.02],fixed:'wall',
     build(b){ b(0,2.32,1.84,1.85,0,0.02,mat.led); }},
    {id:'bra7',type:'бра у зеркала, левое',room:3,layer:'master',pos:[10.97,10.022],rot:180,size:[0.16,1.60,0.245],fixed:'wall',
     build(b,g){ b(0.03,0.13,1.45,1.55,0.225,0.245,mat.handle); b(0.075,0.085,1.495,1.505,0.115,0.225,mat.handle); const s=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.12,16),mat.lamp); s.position.set(0.08,1.50,0.08); g.add(s); }},
    {id:'bra8',type:'бра у зеркала, правое',room:3,layer:'master',pos:[12.0,10.022],rot:180,size:[0.16,1.60,0.245],fixed:'wall',
     build(b,g){ b(0.03,0.13,1.45,1.55,0.225,0.245,mat.handle); b(0.075,0.085,1.495,1.505,0.115,0.225,mat.handle); const s=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.12,16),mat.lamp); s.position.set(0.08,1.50,0.08); g.add(s); }},
    {id:'led5',type:'LED-подсветка по нижней кромке ТВ',room:3,layer:'master',pos:[14.37,9.837],rot:180,size:[0.92,1.07,0.01],fixed:'wall',
     build(b){ b(0,0.92,1.06,1.07,0,0.01,mat.led); }},
    {id:'sw3',type:'выключатель у двери, 2 клавиши: общий свет M13 + бра/LED',room:3,layer:'master',pos:[10.051,10.921],rot:180,size:[0.01,0.99,0.08],fixed:'wall',build(b){ b(0,0.01,0.91,0.99,0,0.08,mat.lamp); }},
    {id:'sw4',type:'проходной выключатель у кровати, 2 клавиши',room:3,layer:'master',pos:[12.56,13.124],rot:180,size:[0.08,0.89,0.01],fixed:'wall',build(b){ b(0,0.08,0.81,0.89,0,0.01,mat.lamp); }},
    // sockets: flat boxes 0.08 × 0.08 × 0.01 on the wall, purpose in the caption
    {id:'sock14',type:'розетки 2+2 USB над тумбой',room:3,layer:'master',pos:[12.85,13.124],rot:180,size:[0.08,0.74,0.01],fixed:'wall',build(b){ b(0,0.08,0.66,0.74,0,0.01,mat.lamp); }},
    {id:'sock15',type:'розетка + USB у восточного края изголовья (над изголовьем 1.10)',room:3,layer:'master',pos:[14.6,13.124],rot:180,size:[0.08,1.24,0.01],fixed:'wall',build(b){ b(0,0.08,1.16,1.24,0,0.01,mat.lamp); }},
    {id:'sock16',type:'розетка для кондиционера внутри секции',room:3,layer:'master',pos:[14.35,13.124],rot:180,size:[0.08,2.34,0.01],fixed:'wall',build(b){ b(0,0.08,2.26,2.34,0,0.01,mat.lamp); }},
    {id:'sock17',type:'медиаблок за телевизором (2 розетки + ТВ/RJ-45 + HDMI)',room:3,layer:'master',pos:[13.95,9.807],rot:180,size:[0.08,1.34,0.01],fixed:'wall',build(b){ b(0,0.08,1.26,1.34,0,0.01,mat.lamp); }},
    {id:'sock18',type:'розетки у консоли',room:3,layer:'master',pos:[13.95,9.807],rot:180,size:[0.08,0.39,0.01],fixed:'wall',build(b){ b(0,0.08,0.31,0.39,0,0.01,mat.lamp); }},
    {id:'sock19',type:'розетки + USB у туалетного столика (фен, плойка)',room:3,layer:'master',pos:[11.96,9.807],rot:180,size:[0.08,0.94,0.01],fixed:'wall',build(b){ b(0,0.08,0.86,0.94,0,0.01,mat.lamp); }},
    {id:'sock20',type:'розетка общего назначения (увлажнитель, пылесос)',room:3,layer:'master',pos:[10.66,13.124],rot:180,size:[0.08,0.34,0.01],fixed:'wall',build(b){ b(0,0.08,0.26,0.34,0,0.01,mat.lamp); }},
  ];
  function buildItem(it){
    const g=new THREE.Group();
    g.userData={id:it.id,type:it.type,room:it.room,layer:it.layer,pos:it.pos.slice(),rot:it.rot||0,size:it.size.slice(),fixed:it.fixed||null,attach:it.attach||null};
    const b=(x0,x1,y0,y1,z0,z1,m)=>{ const mesh=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0),m); mesh.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2); g.add(mesh); return mesh; };
    it.build(b,g);
    LAYERS[it.layer].add(g); ITEM_GROUPS[it.id]=g;
    poseGroup(g);
    return g;
  }
  function poseGroup(g){ const u=g.userData; g.position.set(u.pos[0],0,u.pos[1]); g.rotation.y=-u.rot*Math.PI/180; g.updateMatrixWorld(true); rebuildPhys(g.userData.id); }
  const physMat=new THREE.MeshBasicMaterial({visible:false});
  function rebuildPhys(id){
    (PHYS[id]||[]).forEach(m=>physGroup.remove(m)); PHYS[id]=[];
    ITEM_GROUPS[id].traverse(o=>{ if(!o.isMesh) return; const bb=new THREE.Box3().setFromObject(o); const sz=new THREE.Vector3(); bb.getSize(sz);
      const m=new THREE.Mesh(new THREE.BoxGeometry(sz.x,sz.y,sz.z),physMat); bb.getCenter(m.position); m.userData.item=id; physGroup.add(m); PHYS[id].push(m); });
  }
  ITEMS.forEach(buildItem);
  physGroup.updateMatrixWorld(true);
  window.ITEMS=ITEMS;
  // item corners on the plan (top view) with rotation — for markup, snapping and collisions
  window.itemCorners=function(id){
    const u=ITEM_GROUPS[id].userData, a=u.rot*Math.PI/180, c=Math.cos(a), s=Math.sin(a), [x,z]=u.pos, [w,,d]=u.size;
    return [[0,0],[w,0],[w,d],[0,d]].map(([p,q])=>[x+p*c-q*s, z+p*s+q*c]);
  };
  // move: new anchor and/or rotation; parts move with the group, neighbours are untouched
  window.setItemPose=function(id,pos,rot){ const g=ITEM_GROUPS[id]; if(!g) return null; if(pos) g.userData.pos=pos.slice(); if(rot!=null) g.userData.rot=rot; poseGroup(g); physGroup.updateMatrixWorld(true); return g; };
})();
Object.values(LAYERS).forEach(g=>scene.add(g)); scene.add(physGroup);
document.getElementById('furn').addEventListener('change',e=>furnGroup.visible=e.target.checked);
document.getElementById('furnHall').addEventListener('change',e=>hallGroup.visible=e.target.checked);
document.getElementById('furnLaundry').addEventListener('change',e=>laundryGroup.visible=e.target.checked);
document.getElementById('furnKid').addEventListener('change',e=>kidGroup.visible=e.target.checked);
document.getElementById('furnMaster').addEventListener('change',e=>masterGroup.visible=e.target.checked);
