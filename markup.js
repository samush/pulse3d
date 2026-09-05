// Режим «Разметка» (план): точка, отрезок, прямоугольник по клику на плоскость чистового пола.
// Метки живут в памяти (сохранение — T08), у каждой постоянный ID M1, M2, …; карточка справа даёт
// численное редактирование, перенос, удаление и текст задания для агента. Использует глобальные
// scene, camera, controls, canvas, PLAN, ORG, THREE из app.js.
(function(){
  const MK={marks:[],sel:null,tool:null,draft:[],hist:[],next:1,step:0.05,snap:true};
  window.MK=MK;
  const group=new THREE.Group(); scene.add(group);
  const ui=document.getElementById('mk'), card=document.getElementById('mkCard');
  const btn=document.getElementById('mkBtn');
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0); // чистовой пол y=0
  const ray=new THREE.Raycaster();
  const DIRS={N:'север',S:'юг',E:'восток',W:'запад'};

  // ---------- геометрия помещений ----------
  function inPoly(p,poly){
    let c=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const [xi,zi]=poly[i],[xj,zj]=poly[j];
      if((zi>p[1])!==(zj>p[1]) && p[0]<(xj-xi)*(p[1]-zi)/(zj-zi)+xi) c=!c;
    }
    return c;
  }
  function roomAt(p){ const r=PLAN.rooms.find(r=>inPoly(p,r.poly)); return r?r.id:null; }
  function edges(room){ // осепараллельные рёбра комнаты: {ax:'x'|'z', v, lo, hi}
    const out=[]; const p=room.poly;
    for(let i=0;i<p.length;i++){
      const a=p[i], b=p[(i+1)%p.length];
      if(Math.abs(a[0]-b[0])<1e-6) out.push({ax:'x',v:a[0],lo:Math.min(a[1],b[1]),hi:Math.max(a[1],b[1])});
      else if(Math.abs(a[1]-b[1])<1e-6) out.push({ax:'z',v:a[1],lo:Math.min(a[0],b[0]),hi:Math.max(a[0],b[0])});
    }
    return out;
  }
  // расстояния от точки до ближайшей стены комнаты в четырёх направлениях
  function wallDist(p,roomId){
    const room=PLAN.rooms.find(r=>r.id===roomId); if(!room) return null;
    const d={N:null,S:null,W:null,E:null};
    edges(room).forEach(e=>{
      if(e.ax==='z' && e.lo-0.01<=p[0] && p[0]<=e.hi+0.01){
        if(e.v<=p[1]+1e-6){ const v=p[1]-e.v; if(d.N==null||v<d.N) d.N=v; }
        if(e.v>=p[1]-1e-6){ const v=e.v-p[1]; if(d.S==null||v<d.S) d.S=v; }
      }
      if(e.ax==='x' && e.lo-0.01<=p[1] && p[1]<=e.hi+0.01){
        if(e.v<=p[0]+1e-6){ const v=p[0]-e.v; if(d.W==null||v<d.W) d.W=v; }
        if(e.v>=p[0]-1e-6){ const v=e.v-p[0]; if(d.E==null||v<d.E) d.E=v; }
      }
    });
    return d;
  }
  // привязка: шаг сетки от origin, затем стены/углы комнаты и края мебели ближе 15 см.
  // Последняя привязка к мебели запоминается в MK.lastBind = {item, side} и попадает в метку.
  function snapPt(p){
    let x=ORG[0]+Math.round((p[0]-ORG[0])/MK.step)*MK.step, z=ORG[1]+Math.round((p[1]-ORG[1])/MK.step)*MK.step;
    MK.lastBind=null;
    if(MK.snap){
      const rid=roomAt(p); const room=PLAN.rooms.find(r=>r.id===rid);
      if(room) edges(room).forEach(e=>{
        if(e.ax==='x' && Math.abs(p[0]-e.v)<0.15 && e.lo-0.15<=p[1] && p[1]<=e.hi+0.15) x=e.v;
        if(e.ax==='z' && Math.abs(p[1]-e.v)<0.15 && e.lo-0.15<=p[0] && p[0]<=e.hi+0.15) z=e.v;
      });
      if(typeof ITEMS!=='undefined') ITEMS.forEach(it=>{ // края предметов по осевому габариту: W/E — грань по x, N/S — по z
        const c=itemCorners(it.id); const bx=[Math.min(...c.map(q=>q[0])),Math.min(...c.map(q=>q[1])),Math.max(...c.map(q=>q[0])),Math.max(...c.map(q=>q[1]))];
        const nearZ=bx[1]-0.15<=p[1]&&p[1]<=bx[3]+0.15, nearX=bx[0]-0.15<=p[0]&&p[0]<=bx[2]+0.15;
        if(nearZ&&Math.abs(p[0]-bx[0])<0.15){x=bx[0];MK.lastBind={item:it.id,side:'W'};}
        if(nearZ&&Math.abs(p[0]-bx[2])<0.15){x=bx[2];MK.lastBind={item:it.id,side:'E'};}
        if(nearX&&Math.abs(p[1]-bx[1])<0.15){z=bx[1];MK.lastBind={item:it.id,side:'N'};}
        if(nearX&&Math.abs(p[1]-bx[3])<0.15){z=bx[3];MK.lastBind={item:it.id,side:'S'};}
      });
    }
    return [Math.round(x*1000)/1000, Math.round(z*1000)/1000];
  }
  // где сейчас край предмета, к которому привязана метка; null, если предмета нет
  function bindEdge(bind){
    if(!bind||typeof ITEM_GROUPS==='undefined'||!ITEM_GROUPS[bind.item]) return null;
    const c=itemCorners(bind.item); const xs=c.map(q=>q[0]), zs=c.map(q=>q[1]);
    return {W:Math.min(...xs),E:Math.max(...xs),N:Math.min(...zs),S:Math.max(...zs)}[bind.side];
  }
  // настенная точка: стена комнаты, угол отсчёта, расстояние вдоль стены → координата; и обратно
  function wallSpec(m){ // {side:'N'|'S'|'W'|'E', from:'W'|'E'|'N'|'S', dist, h} → пересчёт из pts[0]
    const ids=rooms(m); const rid=ids.length===1?ids[0]:null; if(rid==null) return null;
    const room=PLAN.rooms.find(r=>r.id===rid); const xs=room.poly.map(q=>q[0]), zs=room.poly.map(q=>q[1]);
    return {room:rid,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
  }
  function wallToPoint(m){ const w=m.wall, b=wallSpec(m); if(!w||!b) return null;
    const along=w.side==='N'||w.side==='S';
    const x=along?(w.from==='E'?b.maxX-w.dist:b.minX+w.dist):(w.side==='W'?b.minX:b.maxX);
    const z=along?(w.side==='N'?b.minZ:b.maxZ):(w.from==='S'?b.maxZ-w.dist:b.minZ+w.dist);
    return [Math.round(x*1000)/1000,Math.round(z*1000)/1000];
  }
  function pointToWall(m,side,from){ const b=wallSpec(m); if(!b) return null; const p=m.pts[0];
    const along=side==='N'||side==='S';
    const dist=along?(from==='E'?b.maxX-p[0]:p[0]-b.minX):(from==='S'?b.maxZ-p[1]:p[1]-b.minZ);
    return {side,from,dist:Math.round(dist*1000)/1000,h:m.y0||0};
  }
  function cell(p){ // старый адрес клетки: D7+26
    const cx=Math.floor(p[0]-ORG[0]+1e-9), cz=Math.floor(p[1]-ORG[1]+1e-9);
    const dx=Math.floor(((p[0]-ORG[0])-cx)*10+1e-6), dz=Math.floor(((p[1]-ORG[1])-cz)*10+1e-6);
    return String.fromCharCode(65+cx)+(cz+1)+'+'+dx+dz;
  }
  function rectCorners(m){ // 4 угла прямоугольника: опорная точка — северо-западный угол, поворот по часовой (вид сверху)
    const a=m.rot*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
    const [x,z]=m.pts[0];
    return [[0,0],[m.w,0],[m.w,m.d],[0,m.d]].map(([u,v])=>[x+u*c-v*s, z+u*s+v*c]);
  }
  function pick(e){ // экранная точка → точка на полу
    const ndc=new THREE.Vector2(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1));
    ray.setFromCamera(ndc,camera);
    const p=new THREE.Vector3(); return ray.ray.intersectPlane(plane,p)?[p.x,p.z]:null;
  }

  // ---------- отрисовка ----------
  const matPt=new THREE.MeshBasicMaterial({color:0xd32f2f}), matSel=new THREE.MeshBasicMaterial({color:0x2c5aa0});
  const matLine=new THREE.LineBasicMaterial({color:0xd32f2f}), matLineSel=new THREE.LineBasicMaterial({color:0x2c5aa0});
  const matBox=new THREE.MeshBasicMaterial({color:0xd32f2f,transparent:true,opacity:0.18,depthWrite:false});
  const matBoxSel=new THREE.MeshBasicMaterial({color:0x2c5aa0,transparent:true,opacity:0.22,depthWrite:false});
  function label(text,x,z,y){
    const c=document.createElement('canvas'); c.width=128; c.height=48; const g=c.getContext('2d');
    g.font='bold 30px system-ui,sans-serif'; g.textAlign='center'; g.textBaseline='middle';
    g.fillStyle='rgba(255,255,255,0.85)'; g.fillRect(0,0,128,48); g.fillStyle='#26282c'; g.fillText(text,64,24);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));
    sp.scale.set(0.6,0.225,1); sp.position.set(x,y,z); sp.renderOrder=20; return sp;
  }
  function redraw(){
    while(group.children.length) group.remove(group.children[0]);
    MK.marks.forEach(m=>{
      const sel=m===MK.sel, y=m.y0||0;
      if(m.type==='point'){
        const d=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.02,20),sel?matSel:matPt);
        d.position.set(m.pts[0][0],y+0.01,m.pts[0][1]); group.add(d);
        group.add(label(m.id,m.pts[0][0],m.pts[0][1],y+0.4));
      } else if(m.type==='seg'){
        const g=new THREE.BufferGeometry().setFromPoints(m.pts.map(p=>new THREE.Vector3(p[0],y+0.02,p[1])));
        group.add(new THREE.Line(g,sel?matLineSel:matLine));
        m.pts.forEach(p=>{const d=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.02,16),sel?matSel:matPt); d.position.set(p[0],y+0.01,p[1]); group.add(d);});
        const mid=[(m.pts[0][0]+m.pts[1][0])/2,(m.pts[0][1]+m.pts[1][1])/2];
        group.add(label(m.id+' '+segLen(m).toFixed(2)+' м',mid[0],mid[1],y+0.4));
      } else {
        const h=Math.max(0.02,(m.y1||0)-(m.y0||0));
        const b=new THREE.Mesh(new THREE.BoxGeometry(m.w,h,m.d),sel?matBoxSel:matBox);
        b.geometry.translate(m.w/2,h/2,m.d/2); b.rotation.y=-m.rot*Math.PI/180; b.position.set(m.pts[0][0],y,m.pts[0][1]); group.add(b);
        const e=new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry),sel?matLineSel:matLine); e.rotation.copy(b.rotation); e.position.copy(b.position); group.add(e);
        const c=rectCorners(m); const cx=(c[0][0]+c[2][0])/2, cz=(c[0][1]+c[2][1])/2;
        group.add(label(m.id,cx,cz,y+h+0.3));
        const a=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.02,16),sel?matSel:matPt); a.position.set(m.pts[0][0],y+0.02,m.pts[0][1]); group.add(a); // опорная точка
      }
    });
    MK.draft.forEach(p=>{const d=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.02,16),matSel); d.position.set(p[0],0.02,p[1]); group.add(d);});
  }
  function segLen(m){ return Math.hypot(m.pts[1][0]-m.pts[0][0], m.pts[1][1]-m.pts[0][1]); }

  // ---------- модель ----------
  function add(m){ m.id='M'+(MK.next++); m.name=m.name||''; m.y0=m.y0||0; if(m.y1==null) m.y1=m.type==='rect'?0.9:0; m.dir=m.dir||'S'; if(MK.lastBind&&!m.bind) m.bind=MK.lastBind; MK.lastBind=null; MK.marks.push(m); MK.hist.push({op:'add',m}); select(m); return m; }
  function remove(m){ const i=MK.marks.indexOf(m); if(i<0) return; MK.marks.splice(i,1); MK.hist.push({op:'del',m,i}); if(MK.sel===m) select(null); else redraw(); }
  function undo(){
    const u=MK.hist.pop(); if(!u) return;
    if(u.op==='add'){ const i=MK.marks.indexOf(u.m); if(i>=0) MK.marks.splice(i,1); if(MK.sel===u.m) MK.sel=null; }
    else if(u.op==='del'){ MK.marks.splice(u.i,0,u.m); }
    else if(u.op==='edit'){ Object.assign(u.m,u.prev); }
    select(MK.sel);
  }
  function edit(m,patch){ const prev={}; Object.keys(patch).forEach(k=>prev[k]=JSON.parse(JSON.stringify(m[k]))); MK.hist.push({op:'edit',m,prev}); Object.assign(m,patch); select(m); }
  function select(m){ MK.sel=m; redraw(); renderCard(); persist(); }
  function rooms(m){ // помещения под меткой; для прямоугольника — по углам
    const pts=m.type==='rect'?rectCorners(m):m.pts;
    const ids=[...new Set(pts.map(roomAt))];
    return ids;
  }
  MK.add=add; MK.remove=remove; MK.undo=undo; MK.edit=edit; MK.select=select; MK.pickPoint=pick; MK.rooms=rooms; MK.cell=cell; MK.snapPt=snapPt;
  MK.addPoint=(p)=>add({type:'point',pts:[p]});
  MK.addSeg=(a,b)=>add({type:'seg',pts:[a,b]});
  MK.addRect=(a,w,d,rot)=>add({type:'rect',pts:[a],w,d,rot:rot||0});

  // ---------- текст для агента ----------
  function fmt(v){ return (Math.round(v*100)/100).toFixed(2); }
  function describe(m){
    const ids=rooms(m); const roomTxt=ids.length===1&&ids[0]!=null?('помещение '+ids[0]):ids.every(i=>i==null)?'вне квартиры':('пересекает границу помещений '+ids.map(i=>i==null?'вне квартиры':i).join(' и '));
    const L=['Метка '+m.id+(m.name?' — '+m.name:'')+', '+roomTxt+'.'];
    L.push('План v'+(PLAN.meta?PLAN.meta.version:1)+', метры, origin '+ORG.join(', ')+', x → восток, z → юг, высоты от чистового пола.');
    const p=m.pts[0];
    if(m.type==='point'){
      L.push('Точка: x='+fmt(p[0])+', z='+fmt(p[1])+' (клетка '+cell(p)+'), высота '+fmt(m.y0)+' м.');
      if(m.wall) L.push('Настенная: стена '+DIRS[m.wall.side]+' помещения '+(ids[0])+', отсчёт от угла '+DIRS[m.wall.from]+' — '+fmt(m.wall.dist)+' м вдоль стены, центр на высоте '+fmt(m.wall.h)+' м над чистовым полом.');
    } else if(m.type==='seg'){
      const q=m.pts[1];
      L.push('Отрезок: от x='+fmt(p[0])+', z='+fmt(p[1])+' до x='+fmt(q[0])+', z='+fmt(q[1])+'; длина '+fmt(segLen(m))+' м; высота '+fmt(m.y0)+' м.');
    } else {
      L.push('Прямоугольник: опорная точка — северо-западный угол x='+fmt(p[0])+', z='+fmt(p[1])+' (клетка '+cell(p)+'); ширина '+fmt(m.w)+' м (вдоль x), глубина '+fmt(m.d)+' м (вдоль z); поворот '+m.rot+'° по часовой вокруг опорной точки; фасад на '+DIRS[m.dir]+'.');
      L.push('Высота: основание '+fmt(m.y0)+' м, верх '+fmt(m.y1)+' м над чистовым полом.');
    }
    const rid=ids.length===1?ids[0]:null;
    const wd=rid!=null?wallDist(m.type==='rect'?p:m.pts[0],rid):null;
    if(wd){ L.push('Расстояния от '+(m.type==='rect'?'опорной точки':'точки')+' до стен помещения: '+['N','S','W','E'].filter(k=>wd[k]!=null).map(k=>DIRS[k]+' '+fmt(wd[k])+' м').join(', ')+'.'); }
    if(m.bind){ const e=bindEdge(m.bind); L.push('Привязка: '+(e==null?'предмет '+m.bind.item+' отсутствует — привязка потеряна':'к краю предмета '+m.bind.item+' со стороны '+DIRS[m.bind.side]+(m.conflict?' (предмет сдвинулся после разметки — метка оставлена на месте)':''))+'.'); }
    const near=itemsAt(m); if(near.length) L.push('Предметы в этом месте (по контуру на плане): '+near.map(i=>i.id+' ('+i.type+')').join(', ')+'.');
    L.push('Шаг сетки при разметке: '+Math.round(MK.step*100)+' см'+(MK.snap?', привязка к стенам включена':'')+'.');
    return L.join('\n');
  }
  // предметы, чей контур на плане пересекает метку (точка/концы отрезка/прямоугольник) — по осевым габаритам
  function itemsAt(m){
    if(typeof ITEMS==='undefined') return [];
    const pts=m.type==='rect'?rectCorners(m):m.pts;
    const box=pts.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[1e9,1e9,-1e9,-1e9]);
    return ITEMS.filter(it=>{ const c=itemCorners(it.id); const ib=c.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[1e9,1e9,-1e9,-1e9]);
      return ib[0]<=box[2]+1e-6&&ib[2]>=box[0]-1e-6&&ib[1]<=box[3]+1e-6&&ib[3]>=box[1]-1e-6; });
  }
  MK.itemsAt=itemsAt;
  MK.describe=describe;

  // ---------- карточка ----------
  function renderCard(){
    const m=MK.sel;
    if(!m){ card.hidden=true; return; }
    card.hidden=false;
    const ids=rooms(m), p=m.pts[0];
    const val=v=>{ const virt={px:p[0],pz:p[1],qx:m.pts[1]&&m.pts[1][0],qz:m.pts[1]&&m.pts[1][1]}; const x=v in virt?virt[v]:m[v]; return x==null?'':(typeof x==='number'?Math.round(x*1000)/1000:x); };
    const num=(k,v,st)=>'<label>'+k+' <input type="number" step="'+(st||0.01)+'" data-k="'+v+'" value="'+val(v)+'"></label>';
    let h='<div class="mk-head"><b>'+m.id+'</b> <input data-k="name" placeholder="название" value="'+(m.name||'').replace(/"/g,'&quot;')+'"></div>';
    h+='<div class="mk-row">'+(ids.length===1&&ids[0]!=null?'Помещение '+ids[0]:ids.every(i=>i==null)?'Вне квартиры':'Пересекает: '+ids.map(i=>i==null?'вне':i).join(', '))+' · клетка '+cell(p)+'</div>';
    h+='<div class="mk-row">'+num('x','px')+num('z','pz')+'</div>';
    if(m.type==='seg'){ h+='<div class="mk-row">'+num('x₂','qx')+num('z₂','qz')+'<span>длина '+fmt(segLen(m))+' м</span></div>'; }
    if(m.type==='rect'){
      h+='<div class="mk-row">'+num('ширина','w')+num('глубина','d')+num('поворот°','rot',1)+'</div>';
      h+='<div class="mk-row">'+num('низ','y0')+num('верх','y1')+'<label>фасад <select data-k="dir">'+Object.keys(DIRS).map(k=>'<option value="'+k+'"'+(m.dir===k?' selected':'')+'>'+DIRS[k]+'</option>').join('')+'</select></label></div>';
    } else h+='<div class="mk-row">'+num('высота','y0')+'</div>';
    if(m.type==='point'){
      const w=m.wall||{};
      h+='<div class="mk-row"><label><input type="checkbox" data-k="wallOn"'+(m.wall?' checked':'')+'> на стене</label>'
        +(m.wall?'<label>стена <select data-k="wallSide">'+['N','S','W','E'].map(k=>'<option value="'+k+'"'+(w.side===k?' selected':'')+'>'+DIRS[k]+'</option>').join('')+'</select></label>'
        +'<label>от угла <select data-k="wallFrom">'+((w.side==='N'||w.side==='S')?['W','E']:['N','S']).map(k=>'<option value="'+k+'"'+(w.from===k?' selected':'')+'>'+DIRS[k]+'</option>').join('')+'</select></label>'
        +'<label>вдоль <input type="number" step="0.01" data-k="wallDist" value="'+(Math.round(w.dist*1000)/1000)+'"></label>':'')+'</div>';
    }
    if(m.bind) h+='<div class="mk-row mk-dim">привязка: '+m.bind.item+' / '+DIRS[m.bind.side]+(m.conflict?' — <b>предмет сдвинулся</b>':'')+(bindEdge(m.bind)==null?' — <b>предмета нет</b>':'')+' <button data-a="unbind">снять</button></div>';
    const rid=ids.length===1?ids[0]:null; const wd=rid!=null?wallDist(p,rid):null;
    if(wd) h+='<div class="mk-row mk-dim">до стен: '+['N','S','W','E'].filter(k=>wd[k]!=null).map(k=>DIRS[k]+' '+fmt(wd[k])).join(' · ')+'</div>';
    h+='<div class="mk-row mk-btns"><button data-a="copy">Скопировать для агента</button><button data-a="move">Перенести</button><button data-a="del">Удалить</button></div>';
    h+='<textarea class="mk-text" hidden readonly></textarea>';
    card.innerHTML=h;
    card.querySelectorAll('input,select').forEach(el=>el.addEventListener('change',()=>{
      const k=el.dataset.k, v=el.type==='number'?parseFloat(el.value):el.value;
      if(k==='wallOn'){ if(el.checked){ const b=wallSpec(m); if(!b){ el.checked=false; setHint('Точка не в одном помещении — настенную привязку задать нельзя'); return; }
          const d={N:p[1]-b.minZ,S:b.maxZ-p[1],W:p[0]-b.minX,E:b.maxX-p[0]}; const side=Object.keys(d).sort((a,c)=>d[a]-d[c])[0]; // ближайшая стена
          const w=pointToWall(m,side,(side==='N'||side==='S')?'W':'N'); edit(m,{wall:w,pts:[wallToPoint({...m,wall:w})]}); } else edit(m,{wall:null}); return; }
      if(k==='wallSide'||k==='wallFrom'||k==='wallDist'){ const w=Object.assign({},m.wall); if(k==='wallSide'){ w.side=v; w.from=(v==='N'||v==='S')?'W':'N'; Object.assign(w,pointToWall(m,w.side,w.from)); } if(k==='wallFrom'){ Object.assign(w,pointToWall(m,w.side,v)); } if(k==='wallDist'){ if(isNaN(v)) return; w.dist=v; } const np=wallToPoint({...m,wall:w}); edit(m,{wall:w,pts:np?[np]:m.pts}); return; }
      if(k==='px'||k==='pz'||k==='qx'||k==='qz'){ if(isNaN(v)) return; const pts=JSON.parse(JSON.stringify(m.pts)); const i=k[0]==='q'?1:0; pts[i][k[1]==='x'?0:1]=v; edit(m,{pts}); return; }
      if(el.type==='number'&&(isNaN(v)||((k==='w'||k==='d')&&v<=0))){ renderCard(); return; }
      const patch={}; patch[k]=v; if(k==='y1'&&v<m.y0) patch.y0=v; if(k==='y0'&&m.type==='rect'&&v>m.y1) patch.y1=v; if(k==='y0'&&m.wall) patch.wall=Object.assign({},m.wall,{h:v}); edit(m,patch);
    }));
    card.querySelector('[data-a=del]').onclick=()=>remove(m);
    const ub=card.querySelector('[data-a=unbind]'); if(ub) ub.onclick=()=>edit(m,{bind:null,conflict:null});
    card.querySelector('[data-a=move]').onclick=()=>{ MK.tool='move'; MK.draft=[]; setHint('Кликните новое место опорной точки '+m.id+' (Esc — отмена)'); };
    card.querySelector('[data-a=copy]').onclick=()=>copy(describe(m));
  }
  function copy(text){
    const ta=card.querySelector('.mk-text');
    const show=()=>{ ta.hidden=false; ta.value=text; ta.focus(); ta.select(); setHint('Clipboard недоступен — текст выделен, скопируйте вручную'); };
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(()=>{ ta.hidden=false; ta.value=text; setHint('Скопировано'); },show); else show();
  }
  function setHint(t){ ui.querySelector('.mk-hint').textContent=t; }

  // ---------- сохранение: localStorage + файл ----------
  const KEY='pulse3d.marks', FORMAT=1;
  function planVer(){ return PLAN.meta?PLAN.meta.version:1; }
  function dump(){ return {format:FORMAT,plan:planVer(),next:MK.next,marks:MK.marks.map(m=>{const c=Object.assign({},m); delete c.conflict; return c;})}; }
  function validate(d){ // список ошибок формата; пустой — данные пригодны
    const err=[]; if(!d||typeof d!=='object') return ['не объект'];
    if(d.format!==FORMAT) err.push('формат '+d.format+' вместо '+FORMAT);
    if(!Array.isArray(d.marks)) err.push('нет списка marks');
    else d.marks.forEach((m,i)=>{
      const ok=m&&/^M\d+$/.test(m.id)&&['point','seg','rect'].includes(m.type)&&Array.isArray(m.pts)&&m.pts.length===(m.type==='seg'?2:1)
        &&m.pts.every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite))&&(m.type!=='rect'||(m.w>0&&m.d>0&&Number.isFinite(m.rot)));
      if(!ok) err.push('метка #'+(i+1)+' повреждена');
    });
    return err;
  }
  function restore(d,source){ // подставить данные; вернуть текст статуса
    MK.marks=d.marks.map(m=>Object.assign({},m)); MK.next=Math.max(d.next||1,...MK.marks.map(m=>parseInt(m.id.slice(1))+1),1); MK.hist=[]; MK.sel=null;
    const notes=[]; if(d.plan!==planVer()) notes.push('план v'+d.plan+' → v'+planVer()+': координаты оставлены как есть, проверьте метки');
    let moved=0; MK.marks.forEach(m=>{ if(m.bind){ const e=bindEdge(m.bind); const p=m.pts[0]; const cur=(m.bind.side==='W'||m.bind.side==='E')?p[0]:p[1];
      if(e==null){ m.conflict='предмета нет'; moved++; } else if(Math.abs(e-cur)>0.001){ m.conflict='предмет сдвинулся'; moved++; } } });
    if(moved) notes.push('привязок с конфликтом: '+moved+' (метки не перенесены)');
    redraw(); renderCard(); MK.status=source+': '+MK.marks.length+' меток'+(notes.length?'; '+notes.join('; '):''); setHint(MK.status); return MK.status;
  }
  function persist(){ if(MK.noPersist) return; try{ localStorage.setItem(KEY,JSON.stringify(dump())); MK.saveError=null; }catch(e){ MK.saveError=e.message; setHint('Не удалось сохранить в браузере: '+e.message+' — экспортируйте файл'); } }
  function loadLocal(){ let raw=null; try{ raw=localStorage.getItem(KEY); }catch(e){ return; } if(!raw) return; let d; try{ d=JSON.parse(raw); }catch(e){ MK.status='сохранённая разметка повреждена, оставлена нетронутой'; return; }
    const err=validate(d); if(err.length){ MK.status='сохранённая разметка не подходит: '+err.join(', '); return; } restore(d,'восстановлено'); }
  function exportText(){ return JSON.stringify(dump(),null,1); }
  function importText(text){ let d; try{ d=JSON.parse(text); }catch(e){ setHint('Импорт отклонён: не JSON'); return false; }
    const err=validate(d); if(err.length){ setHint('Импорт отклонён: '+err.join(', ')+' — текущая разметка сохранена'); return false; } restore(d,'импорт'); persist(); return true; }
  MK.dump=dump; MK.validate=validate; MK.restore=restore; MK.exportText=exportText; MK.importText=importText; MK.persist=persist; MK.loadLocal=loadLocal;
  ui.querySelector('[data-a=export]').addEventListener('click',()=>{
    const text=exportText(); const a=document.createElement('a'); a.href='data:application/json;charset=utf-8,'+encodeURIComponent(text); a.download='pulse3d-marks.json'; document.body.appendChild(a); a.click(); a.remove();
    setHint('Файл разметки: '+MK.marks.length+' меток, план v'+planVer());
  });
  ui.querySelector('[data-a=import]').addEventListener('change',e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>importText(String(r.result)); r.onerror=()=>setHint('Файл не прочитан — текущая разметка сохранена'); r.readAsText(f); e.target.value=''; });

  // ---------- инструменты и события ----------
  const toolHint={point:'Кликните точку на плане',seg:'Кликните начало отрезка',rect:'Кликните первый угол прямоугольника',move:''};
  function setTool(t){ MK.tool=t; MK.draft=[]; ui.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('on',b.dataset.tool===t)); setHint(t?toolHint[t]:'Выберите инструмент или метку'); redraw(); }
  MK.setTool=setTool;
  function toggle(on){
    MK.on=on==null?!MK.on:on;
    ui.hidden=!MK.on; btn.classList.toggle('on',MK.on);
    if(MK.on){ if(!controls.plan) setView('top'); setTool(null); } else { setTool(null); select(null); }
  }
  MK.toggle=toggle;
  btn.addEventListener('click',()=>toggle());
  ui.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(MK.tool===b.dataset.tool?null:b.dataset.tool)));
  ui.querySelector('[data-a=undo]').addEventListener('click',undo);
  ui.querySelector('[data-k=step]').addEventListener('change',e=>{MK.step=parseFloat(e.target.value);});
  ui.querySelector('[data-k=snap]').addEventListener('change',e=>{MK.snap=e.target.checked;});

  let dx0=0,dy0=0;
  canvas.addEventListener('pointerdown',e=>{dx0=e.clientX;dy0=e.clientY;});
  canvas.addEventListener('pointerup',e=>{
    if(!MK.on||!controls.plan||e.button!==0||Math.hypot(e.clientX-dx0,e.clientY-dy0)>6) return;
    const raw=pick(e); if(!raw) return;
    const p=snapPt(raw);
    if(MK.tool==='point'){ add({type:'point',pts:[p]}); return; }
    if(MK.tool==='seg'){ MK.draft.push(p); if(MK.draft.length===2){ add({type:'seg',pts:MK.draft.slice()}); MK.draft=[]; setHint(toolHint.seg); } else { setHint('Кликните конец отрезка (Esc — отмена)'); redraw(); } return; }
    if(MK.tool==='rect'){ MK.draft.push(p); if(MK.draft.length===2){ const [a,b]=MK.draft; const x0=Math.min(a[0],b[0]),z0=Math.min(a[1],b[1]); const w=Math.abs(b[0]-a[0]),d=Math.abs(b[1]-a[1]); MK.draft=[]; if(w<0.02||d<0.02){ setHint('Слишком маленький прямоугольник — кликните первый угол заново'); redraw(); return; } add({type:'rect',pts:[[x0,z0]],w,d,rot:0}); setHint(toolHint.rect); } else { setHint('Кликните противоположный угол (Esc — отмена)'); redraw(); } return; }
    if(MK.tool==='move'&&MK.sel){ const pts=JSON.parse(JSON.stringify(MK.sel.pts)); const d=[p[0]-pts[0][0],p[1]-pts[0][1]]; pts.forEach(q=>{q[0]+=d[0];q[1]+=d[1];}); edit(MK.sel,{pts}); setTool(null); return; }
    // без инструмента — выбор ближайшей метки (до 0.3 м)
    let best=null,bd=0.3;
    MK.marks.forEach(m=>{ const pts=m.type==='rect'?rectCorners(m).concat([m.pts[0]]):m.pts; pts.forEach(q=>{ const dd=Math.hypot(q[0]-raw[0],q[1]-raw[1]); if(dd<bd){bd=dd;best=m;} }); if(m.type==='rect'&&inPoly(raw,rectCorners(m))){best=m;bd=0;} });
    select(best);
  });
  addEventListener('keydown',e=>{
    if(!MK.on) return;
    const inField=/INPUT|TEXTAREA|SELECT/.test(document.activeElement&&document.activeElement.tagName);
    if(e.key==='Escape'){ if(inField){document.activeElement.blur();return;} if(MK.draft.length||MK.tool){ setTool(null); } else select(null); }
    if(inField) return;
    if((e.key==='Delete'||e.key==='Backspace')&&MK.sel){ remove(MK.sel); e.preventDefault(); }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ undo(); e.preventDefault(); }
    if(e.key==='1') setTool('point'); if(e.key==='2') setTool('seg'); if(e.key==='3') setTool('rect');
  });
  // выход из плана выключает разметку, метки остаются
  ['vTop','vFP'].forEach(id=>document.getElementById(id).addEventListener('click',()=>{ if(MK.on&&!controls.plan) toggle(false); }));
  group.visible=true;
  loadLocal();
})();
