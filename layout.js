// Layout (plan): pick an item by click, move, rotate, numeric editing, named variants.
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
  const base={}; ITEMS.forEach(it=>{ base[it.id]={pos:it.pos.slice(),rot:it.rot||0}; }); // base layout (immutable)

  // ---------- variants ----------
  function poseOf(id){ const u=ITEM_GROUPS[id].userData; return {pos:u.pos.slice(),rot:u.rot}; }
  function variant(){ return LAY.variants[LAY.cur]; }
  function applyVariant(i){
    LAY.cur=i; const v=variant();
    ITEMS.forEach(it=>{ const p=(v.poses&&v.poses[it.id])||base[it.id]; setItemPose(it.id,p.pos,p.rot); });
    LAY.hist=[]; select(LAY.sel&&LAY.sel.userData?LAY.sel.userData.id:null); refreshUI(); persist();
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

  // ---------- warnings ----------
  function aabb(id){ const c=itemCorners(id); return [Math.min(...c.map(q=>q[0])),Math.min(...c.map(q=>q[1])),Math.max(...c.map(q=>q[0])),Math.max(...c.map(q=>q[1]))]; }
  function inPoly(p,poly){ let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const [xi,zi]=poly[i],[xj,zj]=poly[j]; if((zi>p[1])!==(zj>p[1])&&p[0]<(xj-xi)*(p[1]-zi)/(zj-zi)+xi) c=!c; } return c; }
  function warnings(id){
    const w=[]; const u=ITEM_GROUPS[id].userData; const c=itemCorners(id); const b=aabb(id);
    const room=PLAN.rooms.find(r=>r.id===u.room);
    if(room&&!c.every(q=>inPoly([Math.min(Math.max(q[0],b[0]+0.001),b[2]-0.001),Math.min(Math.max(q[1],b[1]+0.001),b[3]-0.001)],room.poly))) w.push('выходит за границы помещения '+u.room);
    ITEMS.filter(it=>it.id!==id&&it.attach!==id&&u.attach!==it.id).forEach(it=>{
      const o=aabb(it.id), ou=ITEM_GROUPS[it.id].userData;
      const ox=Math.min(b[2],o[2])-Math.max(b[0],o[0]), oz=Math.min(b[3],o[3])-Math.max(b[1],o[1]);
      const yOverlap=!(u.size[1]<=0||ou.size[1]<=0)&&true; // heights: hanging items (bottom above 1.9) do not block floor-standing ones
      const lowA=lowEdge(id), lowB=lowEdge(it.id);
      if(ox>0.005&&oz>0.005&&!(lowA>=1.9||lowB>=1.9)) w.push('пересекается с '+it.id+' ('+it.type+')');
      else if(ox>-PASS&&oz>-PASS&&(ox<=0.005||oz<=0.005)&&!(lowA>=1.9||lowB>=1.9)){ const gap=Math.max(-ox,-oz); if(gap>0.005&&gap<PASS) w.push('проход до '+it.id+' '+gap.toFixed(2)+' м (< '+PASS+')'); }
    });
    return w;
  }
  function lowEdge(id){ const bb=new THREE.Box3().setFromObject(ITEM_GROUPS[id]); return bb.min.y; }
  LAY.warnings=warnings;

  // ---------- UI ----------
  function fmt(v){ return (Math.round(v*100)/100).toFixed(2); }
  function refreshUI(){
    const sel=ui.querySelector('[data-k=variant]');
    sel.innerHTML=LAY.variants.map((v,i)=>'<option value="'+i+'"'+(i===LAY.cur?' selected':'')+'>'+v.name+(v.locked?' (исходная)':'')+'</option>').join('');
    ui.querySelector('[data-a=reset]').disabled=!!variant().locked; ui.querySelector('[data-a=delvar]').disabled=!!variant().locked;
  }
  function select(id){
    LAY.sel=id?ITEM_GROUPS[id]:null; highlight(); renderCard();
  }
  let hl=null;
  function highlight(){
    if(hl){ scene.remove(hl); hl=null; }
    if(!LAY.sel) return;
    const bb=new THREE.Box3().setFromObject(LAY.sel);
    const g=new THREE.BoxGeometry(bb.max.x-bb.min.x+0.04,bb.max.y-bb.min.y+0.04,bb.max.z-bb.min.z+0.04);
    hl=new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:0x2c5aa0,depthTest:false}));
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
  function dump(){ return {format:FORMAT,plan:PLAN.meta?PLAN.meta.version:1,cur:LAY.cur,variants:LAY.variants.filter(v=>!v.locked)}; }
  function validate(d){ const e=[]; if(!d||typeof d!=='object') return ['не объект']; if(d.format!==FORMAT) e.push('формат '+d.format);
    if(!Array.isArray(d.variants)) e.push('нет variants'); else d.variants.forEach((v,i)=>{ if(!v||typeof v.name!=='string'||(v.poses&&typeof v.poses!=='object')) e.push('вариант #'+(i+1)+' повреждён');
      else Object.entries(v.poses||{}).forEach(([id,p])=>{ if(!ITEM_GROUPS[id]) e.push('вариант «'+v.name+'»: неизвестный предмет '+id); else if(!p||!Array.isArray(p.pos)||p.pos.length!==2||!p.pos.every(Number.isFinite)||!Number.isFinite(p.rot)) e.push('вариант «'+v.name+'»: поза '+id+' повреждена'); }); });
    return e; }
  function persist(){ try{ localStorage.setItem(KEY,JSON.stringify(dump())); }catch(e){ setHint('Не удалось сохранить варианты: '+e.message); } }
  function restore(d){ LAY.variants=[{name:'Исходная',locked:true,poses:{}}].concat(d.variants.map(v=>({name:v.name,poses:v.poses||{}}))); applyVariant(Math.min(Math.max(0,(d.cur|0)),LAY.variants.length-1)); }
  function loadLocal(){ let d=null; try{ const raw=localStorage.getItem(KEY); if(raw) d=JSON.parse(raw); }catch(e){} if(d&&!validate(d).length) restore(d); else { LAY.variants=[{name:'Исходная',locked:true,poses:{}}]; applyVariant(0); } }
  function importText(t){ let d; try{ d=JSON.parse(t); }catch(e){ setHint('Импорт отклонён: не JSON'); return false; } const e=validate(d); if(e.length){ setHint('Импорт отклонён: '+e.join(', ')); return false; } restore(d); setHint('Импортировано вариантов: '+d.variants.length); return true; }
  LAY.dump=dump; LAY.validate=validate; LAY.importText=importText; LAY.exportText=()=>JSON.stringify(dump(),null,1); LAY.persist=persist;

  // ---------- events ----------
  function toggle(on){ LAY.on=on==null?!LAY.on:on; ui.hidden=!LAY.on; btn.classList.toggle('on',LAY.on); if(LAY.on){ if(!controls.plan) setView('top'); controls.lookDown(); if(window.MK&&MK.on) MK.toggle(false); setHint('Кликните предмет на плане'); } else { LAY.tool=null; select(null); } }
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
  canvas.addEventListener('pointerup',e=>{
    if(!LAY.on||!controls.plan||e.button!==0||Math.hypot(e.clientX-dx0,e.clientY-dy0)>6) return;
    if(LAY.tool==='move'&&LAY.sel){ const p=pick(e); if(!p) return; const id=LAY.sel.userData.id; const snapped=window.MK?MK.snapPt(p):p; setPose(id,constrain(id,snapped),null); LAY.tool=null; setHint('Перенесено: '+id); return; }
    const ndc=new THREE.Vector2(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1)); ray.setFromCamera(ndc,camera);
    const hits=ray.intersectObjects(Object.values(ITEM_GROUPS).filter(g=>g.parent&&g.parent.visible),true).filter(h=>h.object.isMesh);
    let g=hits.length?hits[0].object:null; while(g&&!(g.userData&&g.userData.id)) g=g.parent;
    select(g?g.userData.id:null); if(g) setHint(g.userData.id+': перенос — кнопка или поля, поворот — кнопки');
  });
  addEventListener('keydown',e=>{ if(!LAY.on) return; const inField=/INPUT|TEXTAREA|SELECT/.test(document.activeElement&&document.activeElement.tagName);
    if(e.key==='Escape'){ if(inField){document.activeElement.blur();return;} if(LAY.tool){ LAY.tool=null; setHint('Отменено'); } else select(null); }
    if(inField) return; if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ undo(); e.preventDefault(); } });
  ['vTop','vFP'].forEach(id=>document.getElementById(id).addEventListener('click',()=>{ if(LAY.on&&!controls.plan) toggle(false); }));
  loadLocal();
})();
