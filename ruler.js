// «Линейка» (button #rulerBtn): two clicks on any surface in any view; a click near a corner or an edge of the hit mesh sticks to it; the segment snaps to the world axis with the largest
// span (x/z — horizontal, y — vertical), the label shows whole centimetres. Measures live until the tool is switched off.
(function(){
  const btn=document.getElementById('rulerBtn'); if(!btn) return;
  const ray=new THREE.Raycaster(), grp=new THREE.Group(); scene.add(grp);
  const headMat=new THREE.MeshBasicMaterial({color:0xe02020,depthTest:false});
  const R=window.RULER={on:false,items:[],start:null,draft:null};
  const shown=o=>{ for(;o;o=o.parent) if(!o.visible||o===avatar||o===grp) return false; return true; }; // r128 raycaster ignores visibility: skip hidden layers, physics boxes, the avatar and our own arrows
  function pick(e){ ray.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1)),camera);
    const h=ray.intersectObjects(scene.children,true).find(h=>h.object.isMesh&&h.object.material.visible!==false&&shown(h.object)); return h?R.snapEdge(h.object,h.point.clone()):null; }
  // snap to the hit mesh's box: the nearest corner, else the nearest point of an edge, within SNAP metres (local bounding box → world, so rotated items keep their true edges)
  R.SNAP=0.05;
  R.snapEdge=(o,p)=>{ const g=o.geometry; if(!g.boundingBox) g.computeBoundingBox(); const {min,max}=g.boundingBox;
    const C=[0,1,2,3,4,5,6,7].map(i=>new THREE.Vector3(i&1?max.x:min.x,i&2?max.y:min.y,i&4?max.z:min.z).applyMatrix4(o.matrixWorld));
    let best=null, bd=R.SNAP; C.forEach(c=>{ const d=c.distanceTo(p); if(d<bd){ bd=d; best=c; } }); if(best) return best;
    C.forEach((c0,i)=>[1,2,4].forEach(bit=>{ if(i&bit) return; const c1=C[i|bit], q=new THREE.Vector3(), d=new THREE.Line3(c0,c1).closestPointToPoint(p,true,q).distanceTo(p); if(d<bd){ bd=d; best=q.clone(); } })); // 12 edges: each corner to its 3 neighbours with a higher bit
    return best||p; };
  R.snap=(a,b)=>{ const d=b.clone().sub(a), k=['x','y','z'].reduce((m,c)=>Math.abs(d[c])>Math.abs(d[m])?c:m,'x'), end=a.clone(); end[k]=b[k]; return {end,axis:k,cm:Math.round(Math.abs(d[k])*100)}; };
  function make(a,b){ const s=R.snap(a,b), g=new THREE.Group(), dir=s.end.clone().sub(a), L=dir.length(); dir.normalize();
    if(L>0){ const bar=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,L,8),headMat); bar.position.copy(a).addScaledVector(dir,L/2); bar.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir); g.add(bar); } // a rod, not a Line: WebGL draws lines 1 px wide
    if(L>0.12) [[a,dir.clone().negate()],[s.end,dir]].forEach(([p,d])=>{ const c=new THREE.Mesh(new THREE.ConeGeometry(0.02,0.08,12),headMat); c.position.copy(p).addScaledVector(d,-0.04); c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d); g.add(c); }); // arrow heads point outwards, tips on the end points
    g.traverse(o=>{ o.renderOrder=20; }); const el=document.createElement('div'); el.className='rl'; el.textContent=s.cm+' см'; document.body.appendChild(el); grp.add(g);
    return {g,el,mid:a.clone().add(s.end).multiplyScalar(0.5),axis:s.axis,cm:s.cm}; }
  const drop=m=>{ if(!m) return; grp.remove(m.g); m.el.remove(); m.g.traverse(o=>{ if(o.geometry) o.geometry.dispose(); }); };
  R.add=(a,b)=>{ const m=make(a,b); R.items.push(m); return m; };
  R.undo=()=>{ if(R.start){ drop(R.draft); R.draft=null; R.start=null; } else drop(R.items.pop()); };
  R.hint=()=>{ document.querySelector('.hint').textContent=R.start?'Линейка: клик — конец отрезка (Esc — отмена)':'Линейка: клик — начало отрезка · Backspace — убрать последний · Esc — выход'; };
  R.toggle=on=>{ R.on=on==null?!R.on:on; btn.classList.toggle('on',R.on);
    if(R.on){ if(window.MK&&MK.on) MK.toggle(false); if(window.LAY&&LAY.on) LAY.toggle(false); R.hint(); }
    else { R.start=null; drop(R.draft); R.draft=null; R.items.splice(0).forEach(drop); syncMode(); } };
  R.tick=()=>{ R.items.concat(R.draft||[]).forEach(m=>{ const v=m.mid.clone().project(camera); m.el.hidden=v.z>1; m.el.style.left=((v.x+1)/2*innerWidth)+'px'; m.el.style.top=((1-(v.y+1)/2)*innerHeight-10)+'px'; }); };
  let dx0=0,dy0=0;
  canvas.addEventListener('pointerdown',e=>{ dx0=e.clientX; dy0=e.clientY; });
  canvas.addEventListener('pointermove',e=>{ if(!R.on||!R.start) return; const p=pick(e); if(!p) return; drop(R.draft); R.draft=make(R.start,p); });
  canvas.addEventListener('pointerup',e=>{ if(!R.on||e.button!==0||Math.hypot(e.clientX-dx0,e.clientY-dy0)>6||(window.MK&&MK.on)||(window.LAY&&LAY.on)) return;
    const p=pick(e); if(!p) return;
    if(R.start){ drop(R.draft); R.draft=null; R.add(R.start,p); R.start=null; } else R.start=p; R.hint(); });
  addEventListener('keydown',e=>{ if(!R.on||/INPUT|TEXTAREA|SELECT/.test(document.activeElement&&document.activeElement.tagName)) return;
    if(e.key==='Escape'){ if(R.start) R.undo(); else R.toggle(false); }
    else if(e.key==='Backspace'||e.key==='Delete'||((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z')){ R.undo(); e.preventDefault(); } });
  btn.addEventListener('click',()=>R.toggle());
})();
