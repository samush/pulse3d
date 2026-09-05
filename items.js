// Предметы интерьера как данные. Каждый предмет — THREE.Group с постоянным id и userData
// {id, type, room, layer, pos:[x,z], rot, size:[w,h,d], fixed}. Детали строятся в локальных
// координатах предмета: x вправо 0..w, z вниз 0..d (при rot=0), y от чистового пола (y=0);
// pos — северо-западный угол предмета при rot=0, rot — градусы по часовой на виде сверху
// (та же конвенция, что у прямоугольников разметки). fixed:'wall' — предмет привязан к стене
// и при перестановке двигается только вдоль неё. Слои: kitchen/hall/laundry/kid — галочки в панели.
var furnGroup=new THREE.Group(), hallGroup=new THREE.Group(), laundryGroup=new THREE.Group(), kidGroup=new THREE.Group();
const LAYERS={kitchen:furnGroup,hall:hallGroup,laundry:laundryGroup,kid:kidGroup};
const ITEM_GROUPS={}; // id → группа
(function(){
  const M=c=>new THREE.MeshLambertMaterial({color:c});
  const mat={
    base:M(0x8c8c8c), upper:M(0xa4a4a4), top:M(0x6e6e6e), dark:M(0x4a4a4a), table:M(0x9a9a9a), chair:M(0x7e7e7e),
    sofa:M(0x8a8a8a), lamp:M(0xd8d8d8), body:M(0x9a9a9a), door:M(0xa8a8a8), hdark:M(0x5a5a5a), handle:M(0x3c3c3c),
    glass:M(0xc3cbd2), frame:M(0x2e2e2e), pouf:M(0x8a8683), led:new THREE.MeshBasicMaterial({color:0xfff1cf}),
    wbody:M(0xc9c9c9), wdoor:M(0x6f6f6f), wpanel:M(0x9c9c9c),
    kbody:M(0xdadad6), kleg:M(0xbdbdb8), kmat:M(0xf0ede6), knob:M(0x4a4a4a),
    rail:new THREE.MeshLambertMaterial({color:0xbfd7e6,transparent:true,opacity:0.35}),
  };
  const chair=(backEast)=>(b,g)=>{ // стул 0.42×0.42, спинка с запада или востока
    b(0,0.42,0.42,0.46,0,0.42,mat.chair);
    const bx=backEast?0.38:0; b(bx,bx+0.04,0.46,0.9,0,0.42,mat.chair);
    [[0.03,0.03],[0.35,0.03],[0.03,0.35],[0.35,0.35]].forEach(([x,z])=>b(x,x+0.04,0,0.42,z,z+0.04,mat.chair));
  };
  const KN=1.915; // северная стена кухни-гостиной 4
  const ITEMS=[
    // ---- кухня-гостиная 4 (эскиз .local/R1.jpg) ----
    {id:'kitchen',type:'кухонный блок',room:4,layer:'kitchen',pos:[8.23,KN],rot:0,size:[0.68,2.69,3.59],fixed:'wall',
     build(b,g){
       b(0,0.66,0,2.69,0,0.66,mat.base);            // колонна с холодильником
       b(0.66,0.68,0.3,2.0,0.02,0.64,mat.dark);      // дверь холодильника
       b(0,0.6,0.1,0.87,0.66,2.99,mat.base);         // нижние шкафы
       b(0,0.62,0.87,0.91,0.66,2.99,mat.top);        // столешница
       b(0.06,0.56,0.91,0.925,1.1,1.7,mat.dark);     // варочная панель
       b(0.1,0.5,0.905,0.93,2.2,2.65,mat.dark);      // мойка
       const f=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.3,8),mat.lamp); f.position.set(0.08,1.06,2.42); g.add(f); // смеситель
       b(0,0.36,1.45,2.69,0.66,2.99,mat.upper);      // навесные шкафы до потолка
       b(0,0.6,0,2.69,2.99,3.59,mat.base);           // пенал
       b(0.6,0.62,0.8,1.4,3.04,3.54,mat.dark);       // духовка
     }},
    {id:'table',type:'стол на 6 мест',room:4,layer:'kitchen',pos:[9.85,KN+0.04],rot:0,size:[0.8,0.76,1.8],
     build(b){ b(0,0.8,0.72,0.76,0,1.8,mat.table); [[0.05,0.05],[0.7,0.05],[0.05,1.7],[0.7,1.7]].forEach(([x,z])=>b(x,x+0.05,0,0.72,z,z+0.05,mat.table)); }},
    {id:'chair1',type:'стул',room:4,layer:'kitchen',pos:[9.54,KN+0.04+0.35-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(false)},
    {id:'chair2',type:'стул',room:4,layer:'kitchen',pos:[9.54,KN+0.04+0.94-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(false)},
    {id:'chair3',type:'стул',room:4,layer:'kitchen',pos:[9.54,KN+0.04+1.53-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(false)},
    {id:'chair4',type:'стул',room:4,layer:'kitchen',pos:[10.54,KN+0.04+0.35-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(true)},
    {id:'chair5',type:'стул',room:4,layer:'kitchen',pos:[10.54,KN+0.04+0.94-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(true)},
    {id:'chair6',type:'стул',room:4,layer:'kitchen',pos:[10.54,KN+0.04+1.53-0.21],rot:0,size:[0.42,0.9,0.42],attach:'table',build:chair(true)},
    {id:'lamp',type:'настенный светильник над столом',room:4,layer:'kitchen',pos:[10.23,KN],rot:0,size:[0.04,1.94,0.5],fixed:'wall',
     build(b,g){ b(0,0.04,1.9,1.94,0,0.5,mat.lamp); const sh=new THREE.Mesh(new THREE.ConeGeometry(0.13,0.16,16,1,true),mat.lamp); sh.position.set(0.02,1.82,0.5); g.add(sh); }},
    {id:'tv',type:'телевизор 58"',room:4,layer:'kitchen',pos:[11.85,KN+0.02],rot:0,size:[1.3,1.75,0.04],fixed:'wall',build(b){ b(0,1.3,1.0,1.75,0,0.04,mat.dark); }},
    {id:'console',type:'подвесная консоль под ТВ',room:4,layer:'kitchen',pos:[11.9,KN],rot:0,size:[1.2,0.75,0.38],fixed:'wall',build(b){ b(0,1.2,0.45,0.75,0,0.38,mat.base); }},
    {id:'sofa',type:'диван 2 м',room:4,layer:'kitchen',pos:[11.35,6.287-0.9],rot:0,size:[2.0,0.85,0.88],
     build(b){ b(0,2,0.1,0.42,0,0.88,mat.sofa); b(0,2,0.42,0.85,0.63,0.88,mat.sofa); b(0,0.15,0.42,0.6,0,0.88,mat.sofa); b(1.85,2,0.42,0.6,0,0.88,mat.sofa); }},
    // ---- коридор 5 (эскизы .local/R2_*) ----
    {id:'wardrobe',type:'шкаф в нише',room:5,layer:'hall',pos:[8.20,7.974-0.45],rot:0,size:[1.77,2.65,0.45],fixed:'wall',
     build(b){
       const W=1.77, D=0.45, t=0.02, mid=W/2, gap=0.004, H0=0.45, H1=1.95, H2=2.65;
       b(0,t,0,H2,0,D,mat.body); b(W-t,W,0,H2,0,D,mat.body); b(0,W,0,H2,D-t,D,mat.body); b(0,W,H2-t,H2,0,D,mat.body); // корпус
       b(t,W-t,0.02,0.04,0.05,D-t,mat.body); b(t,W-t,H0-t,H0,0,D-t,mat.body); b(t,W-t,0.04,H0-t,D-0.10,D-t,mat.hdark); // ниша под обувь
       b(t,mid-gap,H0,H1,0,t,mat.door); b(mid+gap,W-t,H0,H1,0,t,mat.door);                                              // дверцы
       b(mid-0.06,mid-0.045,1.0,1.3,-0.02,0,mat.handle); b(mid+0.045,mid+0.06,1.0,1.3,-0.02,0,mat.handle);
       b(t,W-t,H1,H1+t,0,D-t,mat.body); b(t,mid-gap,H1+t,H2-t,0,t,mat.door); b(mid+gap,W-t,H1+t,H2-t,0,t,mat.door);    // антресоли
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
    // ---- постирочная 7 ----
    {id:'washer',type:'стиральная и сушильная машины колонной',room:7,layer:'laundry',pos:[7.05,2.43],rot:0,size:[0.6,1.72,0.6],fixed:'wall',
     build(b,g){
       [[0,0.85],[0.87,1.72]].forEach(([y0,y1])=>{
         b(0,0.6,y0,y1,0,0.6,mat.wbody);
         const d=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.02,32),mat.wdoor); d.rotation.x=Math.PI/2; d.position.set(0.3,(y0+y1)/2-0.05,0.61); g.add(d);
         b(0.05,0.55,y1-0.12,y1-0.04,0.6,0.61,mat.wpanel);
       });
     }},
    // ---- детская 1 (эскизы .local/bed_*) ----
    {id:'kidbed',type:'кровать-платформа с лестницей и полкой хранения',room:1,layer:'kid',pos:[3.235,1.884],rot:0,size:[2.2,2.6,2.97],fixed:'wall',
     build(b){
       const PL=1.8, TOP=2.3, HF=2.2;
       b(1.0,2.2,PL-0.1,PL,0,2.0,mat.kbody);                                                    // платформа
       [[1.0,0],[2.12,0],[1.0,1.92],[2.12,1.92]].forEach(([x,z])=>b(x,x+0.08,0,PL-0.1,z,z+0.08,mat.kleg)); // ноги
       b(1.05,2.17,PL,PL+0.15,0.03,1.95,mat.kmat);                                              // матрас
       b(1.0,1.02,PL,TOP,0.6,2.0,mat.rail);                                                     // борт
       b(1.0,2.2,HF,TOP,2.0,2.97,mat.kbody); b(1.0,1.08,0,HF,2.89,2.97,mat.kleg);               // полка хранения над проходом и нога
       b(1.0,1.02,TOP,TOP+0.3,2.0,2.97,mat.rail); b(1.02,2.2,TOP,TOP+0.3,2.95,2.97,mat.rail);   // бортики полки
       const st=PL/3, L=1/3;
       for(let i=0;i<3;i++){ const x0=1.0-L*(3-i), x1=1.0-L*(2-i); b(x0,x1,0,st*(i+1),0,0.6,mat.kbody);
         for(let k=0;k<=i;k++) b((x0+x1)/2-0.03,(x0+x1)/2+0.03,st*k+st/2-0.03,st*k+st/2+0.03,0.6,0.62,mat.knob); }
     }},
  ];
  function buildItem(it){
    const g=new THREE.Group();
    g.userData={id:it.id,type:it.type,room:it.room,layer:it.layer,pos:it.pos.slice(),rot:it.rot||0,size:it.size.slice(),fixed:it.fixed||null,attach:it.attach||null};
    const b=(x0,x1,y0,y1,z0,z1,m)=>{ const mesh=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0),m); mesh.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2); g.add(mesh); return mesh; };
    it.build(b,g);
    poseGroup(g);
    LAYERS[it.layer].add(g); ITEM_GROUPS[it.id]=g;
    return g;
  }
  function poseGroup(g){ const u=g.userData; g.position.set(u.pos[0],0,u.pos[1]); g.rotation.y=-u.rot*Math.PI/180; }
  ITEMS.forEach(buildItem);
  window.ITEMS=ITEMS;
  // углы предмета на плане (вид сверху) с учётом поворота — для разметки, привязок и столкновений
  window.itemCorners=function(id){
    const u=ITEM_GROUPS[id].userData, a=u.rot*Math.PI/180, c=Math.cos(a), s=Math.sin(a), [x,z]=u.pos, [w,,d]=u.size;
    return [[0,0],[w,0],[w,d],[0,d]].map(([p,q])=>[x+p*c-q*s, z+p*s+q*c]);
  };
  // перестановка: новая опорная точка и/или поворот; детали едут вместе с группой, соседи не трогаются
  window.setItemPose=function(id,pos,rot){ const g=ITEM_GROUPS[id]; if(!g) return null; if(pos) g.userData.pos=pos.slice(); if(rot!=null) g.userData.rot=rot; poseGroup(g); g.updateMatrixWorld(true); return g; };
})();
Object.values(LAYERS).forEach(g=>scene.add(g));
document.getElementById('furn').addEventListener('change',e=>furnGroup.visible=e.target.checked);
document.getElementById('furnHall').addEventListener('change',e=>hallGroup.visible=e.target.checked);
document.getElementById('furnLaundry').addEventListener('change',e=>laundryGroup.visible=e.target.checked);
document.getElementById('furnKid').addEventListener('change',e=>kidGroup.visible=e.target.checked);
