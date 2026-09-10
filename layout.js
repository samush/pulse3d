// Layout (plan): pick an item by click, drag it with the mouse or nudge it with the arrow keys (Enter confirms, Esc reverts),
// rotate, numeric editing, named variants.
// Variant = {name, poses:{id:{pos,rot}}} on top of the base layout from items.js; shared geometry and
// materials are not duplicated. Stored in localStorage['pulse3d.layout'].
// Uses ITEMS, ITEM_GROUPS, setItemPose, itemCorners, PLAN, controls, camera, canvas, THREE from app.js/items.js.
(function(){
  const LAY={on:false,sel:null,tool:null,variants:[],cur:0,hist:[],warn:[]};
  window.LAY=LAY;
  const ui=document.getElementById('lay'), card=document.getElementById('itCard'), btn=document.getElementById('layBtn');
  const KEY='pulse3d.layout', FORMAT=1, PASS=0.7; // PASS — minimum passage width, m
  const ray=new THREE.Raycaster(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const DIRS={N:'север',S:'юг',E:'восток',W:'запад'};
  // base layout: the pose the item has right after items.js — including the room-4 variant chosen at startup, whose anchor differs from ITEMS (wider sofa keeps its SE corner)
  const base={}; ITEMS.forEach(it=>{ const u=ITEM_GROUPS[it.id].userData; base[it.id]={pos:u.pos.slice(),rot:u.rot}; });
  // a room-4 variant switch redefines the item's own place: the base follows it and a pose saved for the old geometry is dropped
  LAY.rebase=id=>{ const u=ITEM_GROUPS[id].userData; base[id]={pos:u.pos.slice(),rot:u.rot}; const v=variant(); if(v.poses&&v.poses[id]){ delete v.poses[id]; persist(); } };

  // ---------- variants ----------
  function poseOf(id){ const u=ITEM_GROUPS[id].userData; return {pos:u.pos.slice(),rot:u.rot}; }
  function variant(){ return LAY.variants[LAY.cur]; }
  function applyVariant(i,save){ // save=false while loading: reading storage must not rewrite it (A04)
    LAY.cur=i; const v=variant();
    ITEMS.forEach(it=>{ const p=(v.poses&&v.poses[it.id])||base[it.id]; setItemPose(it.id,p.pos,p.rot); });
    LAY.hist=[]; select(LAY.sel&&LAY.sel.userData?LAY.sel.userData.id:null); refreshUI(); if(save!==false) persist();
  }
  function recordPose(id){ const v=variant(); if(v.locked) return; v.poses=v.poses||{}; v.poses[id]=poseOf(id); }
  function copyVariant(){ const v=variant(); const name=prompt('Название варианта',(v.name||'вариант')+' (копия)'); if(name==null) return; LAY.variants.push({name,poses:JSON.parse(JSON.stringify(v.poses||{}))}); applyVariant(LAY.variants.length-1); }
  function resetVariant(){ const v=variant(); if(v.locked) return; v.poses={}; applyVariant(LAY.cur); }
  function deleteVariant(){ if(variant().locked||LAY.variants.length<=1) return; if(!confirm('Удалить вариант «'+variant().name+'»?')) return; LAY.variants.splice(LAY.cur,1); applyVariant(Math.max(0,LAY.cur-1)); }

  // ---------- moving ----------
  function ensureEditable(){ if(!variant().locked) return; LAY.variants.push({name:'Вариант '+LAY.variants.length,poses:{}}); applyVariant(LAY.variants.length-1); setHint('«Исходная» только для чтения — создан вариант «'+variant().name+'»'); }
  function setPose(id,pos,rot){ // with history and attached items (chairs follow the table)
    ensureEditable();
    const before={id,pose:poseOf(id),att:[]};
    const u=ITEM_GROUPS[id].userData; const d=pos?[pos[0]-u.pos[0],pos[1]-u.pos[1]]:[0,0];
    setItemPose(id,pos||null,rot);
    ITEMS.filter(it=>it.attach===id).forEach(it=>{ before.att.push({id:it.id,pose:poseOf(it.id)}); const a=ITEM_GROUPS[it.id].userData; setItemPose(it.id,[a.pos[0]+d[0],a.pos[1]+d[1]],null); recordPose(it.id); });
    recordPose(id); LAY.hist.push(before); select(id); persist();
  }
  function undo(){ const h=LAY.hist.pop(); if(!h) return; setItemPose(h.id,h.pose.pos,h.pose.rot); recordPose(h.id); h.att.forEach(a=>{ setItemPose(a.id,a.pose.pos,a.pose.rot); recordPose(a.id); }); select(h.id); persist(); }
  // a wall-fixed item moves only along the nearest wall of its room
  function constrain(id,pos){
    const u=ITEM_GROUPS[id].userData; if(u.fixed!=='wall') return pos;
    const room=PLAN.rooms.find(r=>r.id===u.room); if(!room) return pos;
    const xs=room.poly.map(q=>q[0]), zs=room.poly.map(q=>q[1]);
    const c=itemCorners(id); const cx=(c[0][0]+c[2][0])/2, cz=(c[0][1]+c[2][1])/2;
    const d={W:cx-Math.min(...xs),E:Math.max(...xs)-cx,N:cz-Math.min(...zs),S:Math.max(...zs)-cz};
    const side=Object.keys(d).sort((a,b)=>d[a]-d[b])[0];
    return (side==='W'||side==='E')?[u.pos[0],pos[1]]:[pos[0],u.pos[1]];
  }
  LAY.setPose=setPose; LAY.undo=undo; LAY.constrain=constrain;
  POSE_HOOKS.push(id=>{ if(!LAY.sel||LAY.sel.userData.id!==id) return; if(fast){ highlight(); syncFields(); } else select(id); }); // selection frame and card follow a pose set from anywhere

  // ---------- live move: mouse drag or arrow keys, Enter confirms, Esc reverts ----------
  const NUDGE={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}; // top view: screen up is north (−z)
  let mv=null, drag=null, fast=false;
  function mvBegin(id){ if(mv&&mv.id===id) return; mvEnd(true);
    mv={id,from:poseOf(id),att:ITEMS.filter(it=>it.attach===id).map(it=>({id:it.id,pose:poseOf(it.id)}))}; }
  function mvLive(pos){ if(!mv) return; const u=ITEM_GROUPS[mv.id].userData, d=[pos[0]-u.pos[0],pos[1]-u.pos[1]];
    setItemPose(mv.id,pos,null);
    mv.att.forEach(a=>{ const p=ITEM_GROUPS[a.id].userData.pos; setItemPose(a.id,[p[0]+d[0],p[1]+d[1]],null); }); }
  // the whole move lands as one setPose: history, attached items and storage get one step, not one per keypress
  function mvEnd(commit){ const m=mv; if(!m) return; mv=null; drag=null; fast=false; const to=poseOf(m.id);
    setItemPose(m.id,m.from.pos,m.from.rot); m.att.forEach(a=>setItemPose(a.id,a.pose.pos,a.pose.rot));
    if(commit&&(to.pos[0]!==m.from.pos[0]||to.pos[1]!==m.from.pos[1])) setPose(m.id,to.pos,null); else select(m.id);
    setHint(commit?'Готово: '+m.id:'Отменено: '+m.id); }
  function syncFields(){ const u=LAY.sel&&LAY.sel.userData; if(!u) return;
    card.querySelectorAll('input[data-k=x],input[data-k=z]').forEach(el=>{ el.value=Math.round(u.pos[el.dataset.k==='x'?0:1]*1000)/1000; }); }
  function hitItem(e){ const ndc=new THREE.Vector2(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1)); ray.setFromCamera(ndc,camera);
    const hits=ray.intersectObjects(Object.values(ITEM_GROUPS).filter(g=>g.parent&&g.parent.visible),true).filter(h=>h.object.isMesh);
    let g=hits.length?hits[0].object:null; while(g&&!(g.userData&&g.userData.id)) g=g.parent; return g; }
  // app.js asks before it starts panning the plan: a press on an item grabs the item instead
  LAY.grab=e=>{ if(!LAY.on||!controls.plan||e.button!==0||e.shiftKey||LAY.tool==='move') return false;
    const g=hitItem(e), p=pick(e); if(!g||!p) return false;
    const id=g.userData.id; mvEnd(true); select(id); // a plain click must not open a pending move: the session starts on the first pointermove
    drag={id,off:[ITEM_GROUPS[id].userData.pos[0]-p[0],ITEM_GROUPS[id].userData.pos[1]-p[1]]};
    setHint(id+': тяните мышкой или стрелками · Enter — подтвердить · Esc — вернуть'); return true; };
  LAY.moving=()=>mv&&mv.id; LAY.commit=()=>mvEnd(true); LAY.cancel=()=>mvEnd(false);
  LAY.nudge=(id,dx,dz)=>{ const u=ITEM_GROUPS[id].userData; mvBegin(id); select(id); mvLive(constrain(id,[u.pos[0]+dx,u.pos[1]+dz])); };

  // ---------- warnings ----------
  function aabb(id){ const c=itemCorners(id); return [Math.min(...c.map(q=>q[0])),Math.min(...c.map(q=>q[1])),Math.max(...c.map(q=>q[0])),Math.max(...c.map(q=>q[1]))]; }
  function inPoly(p,poly){ let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const [xi,zi]=poly[i],[xj,zj]=poly[j]; if((zi>p[1])!==(zj>p[1])&&p[0]<(xj-xi)*(p[1]-zi)/(zj-zi)+xi) c=!c; } return c; }
  function warnings(id){
    const w=[]; const u=ITEM_GROUPS[id].userData; const c=itemCorners(id); const b=aabb(id);
    const room=PLAN.rooms.find(r=>r.id===u.room);
    if(room&&!c.every(q=>inPoly([Math.min(Math.max(q[0],b[0]+0.001),b[2]-0.001),Math.min(Math.max(q[1],b[1]+0.001),b[3]-0.001)],room.poly))) w.push('выходит за границы помещения '+u.room);
    ITEMS.filter(it=>it.id!==id&&it.attach!==id&&u.attach!==it.id&&!passive(it.id)&&!passive(id)).forEach(it=>{
      const o=aabb(it.id);
      const ox=Math.min(b[2],o[2])-Math.max(b[0],o[0]), oz=Math.min(b[3],o[3])-Math.max(b[1],o[1]);
      if(ox>0.005&&oz>0.005){ if(hits3d(id,it.id)) w.push('пересекается с '+it.id+' ('+it.type+')'); }
      else if(it.room===u.room&&onFloor(id)&&onFloor(it.id)){ const gap=minGap(id,it.id); if(gap!=null) w.push('проход до '+it.id+' '+gap.toFixed(2)+' м (< '+PASS+')'); }
    });
    return w;
  }
  const bbox=id=>new THREE.Box3().setFromObject(ITEM_GROUPS[id]);
  const passive=id=>{ const bb=bbox(id); return bb.min.y>=1.9||bb.max.y<=0.02; }; // hanging (above head) or flat (rug) items block nothing
  const onFloor=id=>bbox(id).min.y<0.05; // passage matters only between floor-standing items
  // narrowest corridor between parts of two items of the same room (a wall separates rooms, so no corridor across them) (below head height) that face each other along one axis;
  // per part, not per item box: the loft bed's box covers the empty space under it; diagonal corners are not a corridor
  function minGap(a,b){ let best=null; const P=id=>PHYS[id].map(m=>new THREE.Box3().setFromObject(m)).filter(x=>x.min.y<1.9);
    P(a).forEach(x=>P(b).forEach(y=>{ const ox=Math.min(x.max.x,y.max.x)-Math.max(x.min.x,y.min.x), oz=Math.min(x.max.z,y.max.z)-Math.max(x.min.z,y.min.z);
      const g=ox>0&&oz<=0.005?-oz:oz>0&&ox<=0.005?-ox:null; if(g==null||(best!=null&&g>=best)) return;
      // the gap rectangle in plan; a gap fully under a third item (a chair beside a pedestal under one desk) is not a corridor
      const r=ox>0?[Math.max(x.min.x,y.min.x),Math.min(x.max.x,y.max.x),Math.min(x.max.z,y.max.z),Math.max(x.min.z,y.min.z)]:[Math.min(x.max.x,y.max.x),Math.max(x.min.x,y.min.x),Math.max(x.min.z,y.min.z),Math.min(x.max.z,y.max.z)];
      const covered=g>0.15&&Object.keys(PHYS).some(id=>id!==a&&id!==b&&PHYS[id].some(m=>{ const c=new THREE.Box3().setFromObject(m); return c.min.y<1.9&&c.min.x<=r[0]+0.005&&c.max.x>=r[1]-0.005&&c.min.z<=r[2]+0.005&&c.max.z>=r[3]-0.005; }));
      if(g<=0.15||!covered) best=g; }));                                                              // touching parts stay one block even when something covers the seam
    return best!=null&&best>0.15&&best<PASS?best:null; }                                                 // touching parts (gap ≤ 0.15) mean one block, not a corridor
  // real overlap: per-mesh boxes (a sofa under a loft bed sits between the legs, a socket above a desk is fine)
  function hits3d(a,b){ const A=PHYS[a].map(m=>new THREE.Box3().setFromObject(m)), B=PHYS[b].map(m=>new THREE.Box3().setFromObject(m)); const e=0.005;
    return A.some(x=>B.some(y=>x.min.x<y.max.x-e&&x.max.x>y.min.x+e&&x.min.y<y.max.y-e&&x.max.y>y.min.y+e&&x.min.z<y.max.z-e&&x.max.z>y.min.z+e)); }
  LAY.warnings=warnings;

  // ---------- UI ----------
  function fmt(v){ return (Math.round(v*100)/100).toFixed(2); }
  function refreshUI(){
    const sel=ui.querySelector('[data-k=variant]');
    sel.innerHTML=LAY.variants.map((v,i)=>'<option value="'+i+'"'+(i===LAY.cur?' selected':'')+'>'+esc(v.name)+(v.locked?' (исходная)':'')+'</option>').join('');
    ui.querySelector('[data-a=reset]').disabled=!!variant().locked; ui.querySelector('[data-a=delvar]').disabled=!!variant().locked;
  }
  function select(id){
    LAY.sel=id?ITEM_GROUPS[id]:null; highlight(); renderCard();
  }
  let hl=null;
  function highlight(){
    if(hl){ scene.remove(hl); hl.geometry.dispose(); hl.material.dispose(); hl=null; }
    if(!LAY.sel) return;
    const bb=new THREE.Box3().setFromObject(LAY.sel);
    const g=new THREE.BoxGeometry(bb.max.x-bb.min.x+0.04,bb.max.y-bb.min.y+0.04,bb.max.z-bb.min.z+0.04);
    hl=new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:mv?0xd08000:0x2c5aa0,depthTest:false})); // orange = moved but not confirmed yet
    hl.position.set((bb.min.x+bb.max.x)/2,(bb.min.y+bb.max.y)/2,(bb.min.z+bb.max.z)/2); hl.renderOrder=30; scene.add(hl);
  }
  function renderCard(){
    const g=LAY.sel; if(!g){ card.hidden=true; return; }
    card.hidden=false; const u=g.userData; const ws=warnings(u.id); LAY.warn=ws;
    const num=(k,v,st)=>'<label>'+k+' <input type="number" step="'+(st||0.01)+'" data-k="'+v+'" value="'+(Math.round((v==='rot'?u.rot:v==='x'?u.pos[0]:u.pos[1])*1000)/1000)+'"'+(u.fixed==='wall'&&v==='rot'?' disabled':'')+'></label>';
    let h='<div class="mk-head"><b>'+u.id+'</b> <span>'+u.type+'</span></div>';
    h+='<div class="mk-row">Помещение '+u.room+' · '+fmt(u.size[0])+' × '+fmt(u.size[2])+' × '+fmt(u.size[1])+' м'+(u.fixed==='wall'?' · пристенный (только вдоль стены)':'')+(u.attach?' · привязан к '+u.attach:'')+'</div>';
    h+='<div class="mk-row">'+num('x','x')+num('z','z')+num('поворот°','rot',90)+'</div>';
    h+='<div class="mk-row mk-btns"><button data-a="move">Перенести</button>'+(u.fixed==='wall'?'':'<button data-a="rotl">↺ 90°</button><button data-a="rotr">↻ 90°</button>')+'<button data-a="undo" title="Ctrl+Z">Отменить</button></div>';
    h+='<div class="mk-row '+(ws.length?'mk-warn':'mk-dim')+'">'+(ws.length?'⚠ '+ws.join('; '):'без предупреждений')+'</div>';
    card.innerHTML=h;
    card.querySelectorAll('input').forEach(el=>el.addEventListener('change',()=>{ const v=parseFloat(el.value); if(isNaN(v)) return;
      if(el.dataset.k==='rot') setPose(u.id,null,((v%360)+360)%360); else { const pos=el.dataset.k==='x'?[v,u.pos[1]]:[u.pos[0],v]; setPose(u.id,constrain(u.id,pos),null); } }));
    card.querySelector('[data-a=move]').onclick=()=>{ LAY.tool='move'; setHint('Кликните новое место северо-западного угла '+u.id+' (Esc — отмена)'); };
    const rl=card.querySelector('[data-a=rotl]'); if(rl) rl.onclick=()=>setPose(u.id,null,(u.rot+270)%360);
    const rr=card.querySelector('[data-a=rotr]'); if(rr) rr.onclick=()=>setPose(u.id,null,(u.rot+90)%360);
    card.querySelector('[data-a=undo]').onclick=undo;
  }
  function setHint(t){ ui.querySelector('.mk-hint').textContent=t; }
  function describe(){ // variant text for the agent
    const v=variant(); const L=['Вариант расстановки «'+v.name+'», план v'+(PLAN.meta?PLAN.meta.version:1)+', метры, x → восток, z → юг; pos — северо-западный угол при rot=0, rot по часовой.'];
    ITEMS.forEach(it=>{ const u=ITEM_GROUPS[it.id].userData; const ch=(v.poses&&v.poses[it.id])?' (изменён)':''; L.push(it.id+' ('+it.type+'), помещение '+it.room+': pos '+fmt(u.pos[0])+', '+fmt(u.pos[1])+'; rot '+u.rot+'°; размер '+fmt(u.size[0])+'×'+fmt(u.size[2])+'×'+fmt(u.size[1])+ch); });
    return L.join('\n');
  }
  LAY.describe=describe; LAY.select=select; LAY.applyVariant=applyVariant; LAY.copyVariant=copyVariant;

  // ---------- persistence ----------
  function planVer(){ return PLAN.meta?PLAN.meta.version:1; }
  function dump(){ return {format:FORMAT,plan:planVer(),rev:SCENE_REV,cur:LAY.cur,variants:LAY.variants.filter(v=>!v.locked)}; }
  function validate(d){ const e=[]; if(!d||typeof d!=='object') return ['не объект']; if(d.format!==FORMAT) e.push('формат '+d.format);
    if(d.plan!==planVer()) e.push('план v'+d.plan+' вместо v'+planVer()+' — позы для другой геометрии');
    if(!Array.isArray(d.variants)) e.push('нет variants'); else d.variants.forEach((v,i)=>{ if(!v||typeof v.name!=='string'||(v.poses&&typeof v.poses!=='object')) e.push('вариант #'+(i+1)+' повреждён');
      else Object.entries(v.poses||{}).forEach(([id,p])=>{ if(!ITEM_GROUPS[id]) e.push('вариант «'+v.name+'»: неизвестный предмет '+id); else if(!p||!Array.isArray(p.pos)||p.pos.length!==2||!p.pos.every(Number.isFinite)||!Number.isFinite(p.rot)) e.push('вариант «'+v.name+'»: поза '+id+' повреждена'); }); });
    return e; }
  function persist(){ try{ if(LAY.badSave){ localStorage.setItem(KEY+'.bad',LAY.badSave); LAY.badSave=null; } localStorage.setItem(KEY,JSON.stringify(dump())); }catch(e){ setHint('Не удалось сохранить варианты: '+e.message); } }
  function restore(d,save){ LAY.variants=[{name:'Исходная',locked:true,poses:{}}].concat(d.variants.map(v=>({name:v.name,poses:v.poses||{}}))); applyVariant(Math.min(Math.max(0,(d.cur|0)),LAY.variants.length-1),save);
    LAY.revNote=d.rev&&d.rev!==SCENE_REV?'геометрия или предметы менялись после сохранения (rev '+d.rev+' → '+SCENE_REV+'), проверьте расстановку':null; if(LAY.revNote) setHint(LAY.revNote); }
  function loadLocal(){ let raw=null; try{ raw=localStorage.getItem(KEY); }catch(e){}
    LAY.variants=[{name:'Исходная',locked:true,poses:{}}];
    if(!raw){ applyVariant(0,false); return; }
    let d, err; try{ d=JSON.parse(raw); err=validate(d); }catch(e){ err=['не JSON']; }
    if(err.length){ LAY.badSave=raw; LAY.status='сохранённые варианты не подходят: '+err.join(', ')+' — оставлены в pulse3d.layout.bad'; applyVariant(0,false); setHint(LAY.status); return; }
    restore(d,false); LAY.status='восстановлено вариантов: '+d.variants.length; }
  function importText(t){ let d; try{ d=JSON.parse(t); }catch(e){ setHint('Импорт отклонён: не JSON'); return false; } const e=validate(d); if(e.length){ setHint('Импорт отклонён: '+e.join(', ')); return false; } restore(d); setHint('Импортировано вариантов: '+d.variants.length); return true; }
  LAY.dump=dump; LAY.validate=validate; LAY.importText=importText; LAY.exportText=()=>JSON.stringify(dump(),null,1); LAY.persist=persist;

  // ---------- events ----------
  function toggle(on){ LAY.on=on==null?!LAY.on:on; ui.hidden=!LAY.on; btn.classList.toggle('on',LAY.on); if(LAY.on){ if(!controls.plan) setView('top'); controls.lookDown(); if(window.MK&&MK.on) MK.toggle(false); setHint('Кликните предмет на плане'); } else { mvEnd(true); LAY.tool=null; select(null); } }
  LAY.toggle=toggle;
  btn.addEventListener('click',()=>toggle());
  ui.querySelector('[data-k=variant]').addEventListener('change',e=>applyVariant(parseInt(e.target.value)));
  ui.querySelector('[data-a=copy]').addEventListener('click',copyVariant);
  ui.querySelector('[data-a=reset]').addEventListener('click',resetVariant);
  ui.querySelector('[data-a=delvar]').addEventListener('click',deleteVariant);
  ui.querySelector('[data-a=export]').addEventListener('click',()=>{ const a=document.createElement('a'); a.href='data:application/json;charset=utf-8,'+encodeURIComponent(LAY.exportText()); a.download='pulse3d-layout.json'; document.body.appendChild(a); a.click(); a.remove(); setHint('Файл вариантов сохранён'); });
  ui.querySelector('[data-a=text]').addEventListener('click',()=>{ const t=describe(); const ta=ui.querySelector('.mk-text'); ta.hidden=false; ta.value=t; ta.focus(); ta.select(); if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(()=>setHint('Скопировано'),()=>setHint('Clipboard недоступен — текст выделен')); else setHint('Clipboard недоступен — текст выделен'); });
  ui.querySelector('[data-a=import]').addEventListener('change',e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>importText(String(r.result)); r.readAsText(f); e.target.value=''; });
  function pick(e){ const ndc=new THREE.Vector2(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1)); ray.setFromCamera(ndc,camera); const p=new THREE.Vector3(); return ray.ray.intersectPlane(plane,p)?[p.x,p.z]:null; }
  let dx0=0,dy0=0;
  canvas.addEventListener('pointerdown',e=>{dx0=e.clientX;dy0=e.clientY;});
  canvas.addEventListener('pointermove',e=>{ if(!drag) return; const p=pick(e); if(!p) return;
    let pos=[p[0]+drag.off[0],p[1]+drag.off[1]]; if(window.MK) pos=MK.snapPt(pos);
    mvBegin(drag.id); fast=true; mvLive(constrain(drag.id,pos)); fast=false; });
  canvas.addEventListener('pointerup',()=>{ if(!drag) return; const id=drag.id; drag=null; if(!mv) return; select(id); setHint(id+': Enter — подтвердить · Esc — вернуть'); });
  canvas.addEventListener('pointerup',e=>{
    if(!LAY.on||!controls.plan||e.button!==0||Math.hypot(e.clientX-dx0,e.clientY-dy0)>6) return;
    if(LAY.tool==='move'&&LAY.sel){ const p=pick(e); if(!p) return; const id=LAY.sel.userData.id; const snapped=window.MK?MK.snapPt(p):p; setPose(id,constrain(id,snapped),null); LAY.tool=null; setHint('Перенесено: '+id); return; }
    const ndc=new THREE.Vector2(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1)); ray.setFromCamera(ndc,camera);
    const hits=ray.intersectObjects(Object.values(ITEM_GROUPS).filter(g=>g.parent&&g.parent.visible),true).filter(h=>h.object.isMesh);
    let g=hits.length?hits[0].object:null; while(g&&!(g.userData&&g.userData.id)) g=g.parent;
    select(g?g.userData.id:null); if(g) setHint(g.userData.id+': тяните мышкой или стрелками (Shift — 1 см) · Enter — подтвердить · Esc — вернуть');
  });
  addEventListener('keydown',e=>{ if(!LAY.on) return; const inField=/INPUT|TEXTAREA|SELECT/.test(document.activeElement&&document.activeElement.tagName);
    if(e.key==='Escape'){ if(inField){document.activeElement.blur();return;} if(mv) mvEnd(false); else if(LAY.tool){ LAY.tool=null; setHint('Отменено'); } else select(null); return; }
    if(inField) return;
    if(e.key==='Enter'){ if(mv){ mvEnd(true); e.preventDefault(); } return; }
    const n=NUDGE[e.key];
    if(n&&LAY.sel){ const s=e.shiftKey?0.01:(window.MK?MK.step:0.05); LAY.nudge(LAY.sel.userData.id,n[0]*s,n[1]*s);
      setHint(LAY.sel.userData.id+': Enter — подтвердить · Esc — вернуть'); e.preventDefault(); return; }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ undo(); e.preventDefault(); } });
  loadLocal();
})();
