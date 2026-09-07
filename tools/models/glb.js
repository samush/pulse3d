// Item model toolkit for node: geometry helpers on top of the vendored three.min.js and a minimal GLB writer.
// Parts {geo, mat} are merged per material name (one mesh per slot), UVs are rewritten in metres (MATERIALS convention).
const THREE=require('../../three.min.js');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// rounded box w×h×d with edge radius r, min corner at (x0,y0,z0); m grid segments per rounded quarter, flat parts ~step metres
function rbox(w,h,d,r,x0,y0,z0,{m=2,step=0.06,crown=0,fold=0}={}){
  const seg=s=>2*m+Math.max(1,Math.ceil((s-2*r)/step));
  const g=new THREE.BoxGeometry(w,h,d,seg(w),seg(h),seg(d)), p=g.attributes.position, n=g.attributes.normal, v=new THREE.Vector3(), q=new THREE.Vector3(), dir=new THREE.Vector3();
  const H=[w/2,h/2,d/2], S=[seg(w),seg(h),seg(d)];
  // grid parameter → pre-rounding coordinate: m segments sweep each rounded quarter, the rest is spread over the flat part
  const remap=(c,i)=>{ const u=(c/H[i]+1)/2, s=S[i], k=s-2*m; if(u*s<m-1e-9) return -H[i]+r*Math.sin(u*s/m*Math.PI/2); if(u*s>s-m+1e-9) return H[i]-r*Math.sin((1-u)*s/m*Math.PI/2); return -(H[i]-r)+(u*s-m)/k*2*(H[i]-r); };
  // same parameter unrolled by arc length: a face owns 45° of the rounded edge (the neighbour face the other 45°), the arc from the flat edge is r·atan(t/r)
  const unroll=(c,i)=>{ const u=(c/H[i]+1)/2, s=S[i], k=s-2*m; if(u*s<m-1e-9) return -(H[i]-r)-r*Math.atan(1-Math.sin(u*s/m*Math.PI/2)); if(u*s>s-m+1e-9) return (H[i]-r)+r*Math.atan(1-Math.sin((1-u)*s/m*Math.PI/2)); return -(H[i]-r)+(u*s-m)/k*2*(H[i]-r); };
  const uv=new Float32Array(p.count*2); // UV from the unfolded box coordinate per original face: continuous across the rounded edge, metres
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i); const ux=unroll(v.x,0)+x0+w/2, uy=unroll(v.y,1)+y0+h/2, uz=unroll(v.z,2)+z0+d/2; v.set(remap(v.x,0),remap(v.y,1),remap(v.z,2));
    const nx=Math.abs(n.getX(i)), ny=Math.abs(n.getY(i)), nz=Math.abs(n.getZ(i));
    if(ny>=nx&&ny>=nz){ uv[i*2]=ux; uv[i*2+1]=uz; } else if(nz>=nx){ uv[i*2]=ux; uv[i*2+1]=uy; } else { uv[i*2]=uz; uv[i*2+1]=uy; }
    q.set(clamp(v.x,-H[0]+r,H[0]-r),clamp(v.y,-H[1]+r,H[1]-r),clamp(v.z,-H[2]+r,H[2]-r));
    dir.subVectors(v,q); if(dir.lengthSq()<1e-12) dir.fromBufferAttribute(n,i); dir.normalize();
    v.copy(q).addScaledVector(dir,r);
    if(dir.y>0.2&&(crown||fold)){ const fx=Math.cos(Math.PI*v.x/w), fz=Math.cos(Math.PI*v.z/d); let dy=crown*fx*fz*dir.y; // soft dome, fading on the rounded edges
      if(fold){ const front=clamp((-v.z+d/2-r)/0.12,0,1); [-0.25,0.25].forEach(c=>{ dy-=fold*(1-front)*(v.z<-d/2+r+0.12?1:0)*Math.exp(-Math.pow((v.x-c*w)/0.03,2)); }); } // two shallow creases near the front edge
      v.y+=dy; }
    p.setXYZ(i,v.x+x0+w/2,v.y+y0+h/2,v.z+z0+d/2); n.setXYZ(i,dir.x,dir.y,dir.z);
  }
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2)); g.userData.metricUV=true;
  return g; // analytic normals kept: the dome is too shallow to change them visibly, recomputing would flat-shade
}
// closed rounded-rectangle curve in the XZ plane at height y — piping path along a cushion seam
class RRect extends THREE.Curve{ constructor(x0,z0,w,d,r,y){ super(); Object.assign(this,{x0,z0,w,d,r,y}); }
  getPoint(t,o=new THREE.Vector3()){ const {x0,z0,w,d,r,y}=this, L=2*(w+d)-8*r+2*Math.PI*r, s=t*L, arc=Math.PI*r/2;
    const segs=[[w-2*r,0],[arc,1],[d-2*r,2],[arc,3],[w-2*r,4],[arc,5],[d-2*r,6],[arc,7]]; let acc=0;
    for(const [len,k] of segs){ if(s<=acc+len+1e-9){ const u=(s-acc)/len;
      if(k===0) return o.set(x0+r+u*(w-2*r),y,z0); if(k===1) return o.set(x0+w-r+r*Math.sin(u*Math.PI/2),y,z0+r-r*Math.cos(u*Math.PI/2));
      if(k===2) return o.set(x0+w,y,z0+r+u*(d-2*r)); if(k===3) return o.set(x0+w-r+r*Math.cos(u*Math.PI/2),y,z0+d-r+r*Math.sin(u*Math.PI/2));
      if(k===4) return o.set(x0+w-r-u*(w-2*r),y,z0+d); if(k===5) return o.set(x0+r-r*Math.sin(u*Math.PI/2),y,z0+d-r+r*Math.cos(u*Math.PI/2));
      if(k===6) return o.set(x0,y,z0+d-r-u*(d-2*r)); return o.set(x0+r-r*Math.cos(u*Math.PI/2),y,z0+r-r*Math.sin(u*Math.PI/2)); } acc+=len; }
    return o.set(x0+r,y,z0); } }
const piping=(x0,z0,w,d,r,y,radius=0.003)=>new THREE.TubeGeometry(new RRect(x0,z0,w,d,r,y),Math.round(2*(w+d)/0.03),radius,5,true);
const cylinder=(cx,y0,cz,radius,h,seg=12)=>new THREE.CylinderGeometry(radius,radius,h,seg).translate(cx,y0+h/2,cz);
// UVs in metres. Parametric surfaces (cylinder, tube, torus, lathe) unroll their native 0..1 UV by circumference/length, so the pattern
// runs around them without seams; rbox brings its own; anything else is projected along the dominant normal axis.
function metricUV(g){ if(g.userData.metricUV) return g; const uv=g.attributes.uv, P=g.parameters||{}, T=g.type;
  if(T==='CylinderGeometry'){ const sideVerts=(P.radialSegments+1)*((P.heightSegments||1)+1), r=Math.max(P.radiusTop,P.radiusBottom);
    for(let i=0;i<uv.count;i++){ if(i<sideVerts) uv.setXY(i,uv.getX(i)*2*Math.PI*r,uv.getY(i)*P.height); else uv.setXY(i,(uv.getX(i)-0.5)*2*r,(uv.getY(i)-0.5)*2*r); } return g; }
  if(T==='TubeGeometry'){ const L=P.path.getLength(); for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*L,uv.getY(i)*2*Math.PI*P.radius); return g; }
  if(T==='TorusGeometry'){ for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*2*Math.PI*P.radius,uv.getY(i)*2*Math.PI*P.tube); return g; }
  if(T==='LatheGeometry'){ const pts=P.points, arc=[0]; for(let j=1;j<pts.length;j++) arc[j]=arc[j-1]+pts[j].distanceTo(pts[j-1]); // u by the ring at this vertex's own radius, v by profile length
    for(let i=0;i<uv.count;i++){ const j=i%pts.length; uv.setXY(i,(uv.getX(i)-0.5)*2*Math.PI*pts[j].x,arc[j]); } return g; }
  const p=g.attributes.position, n=g.attributes.normal, out=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){ const nx=Math.abs(n.getX(i)), ny=Math.abs(n.getY(i)), nz=Math.abs(n.getZ(i)), x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    if(ny>=nx&&ny>=nz){ out[i*2]=x; out[i*2+1]=z; } else if(nz>=nx){ out[i*2]=x; out[i*2+1]=y; } else { out[i*2]=z; out[i*2+1]=y; } }
  g.setAttribute('uv',new THREE.BufferAttribute(out,2)); return g; }
function merge(geos){ const out=new THREE.BufferGeometry(); ['position','normal','uv'].forEach(k=>{ const arrs=geos.map(g=>g.attributes[k].array); const a=new Float32Array(arrs.reduce((s,x)=>s+x.length,0)); let o=0; arrs.forEach(x=>{ a.set(x,o); o+=x.length; }); out.setAttribute(k,new THREE.BufferAttribute(a,geos[0].attributes[k].itemSize)); });
  const idx=new Uint32Array(geos.reduce((s,g)=>s+g.index.count,0)); let o=0, base=0; geos.forEach(g=>{ for(let i=0;i<g.index.count;i++) idx[o++]=g.index.getX(i)+base; base+=g.attributes.position.count; }); out.setIndex(new THREE.BufferAttribute(idx,1)); return out; }
// parts [{geo,mat}] → GLB Buffer; one indexed mesh per material name
function toGlb(parts){
  const byMat={}; parts.forEach(p=>{ const g=p.geo; if(!g.index){ const n=g.attributes.position.count; g.setIndex(new THREE.BufferAttribute(Uint32Array.from({length:n},(_,i)=>i),1)); } if(!g.attributes.normal) g.computeVertexNormals(); metricUV(g); (byMat[p.mat]=byMat[p.mat]||[]).push(g); });
  const bin=[], views=[], accessors=[], meshes=[], nodes=[], materials=[]; let off=0;
  const acc=(arr,type,count,mm,ct=5126)=>{ const b=Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength), pad=(4-b.length%4)%4; views.push({buffer:0,byteOffset:off,byteLength:b.length}); bin.push(b,Buffer.alloc(pad)); off+=b.length+pad; accessors.push(Object.assign({bufferView:views.length-1,componentType:ct,count,type},mm||{})); return accessors.length-1; };
  Object.entries(byMat).forEach(([name,geos],i)=>{ const g=merge(geos); g.computeBoundingBox(); const bb=g.boundingBox;
    materials.push({name,pbrMetallicRoughness:{baseColorFactor:[0.55,0.55,0.55,1],metallicFactor:0,roughnessFactor:0.9}});
    const a={POSITION:acc(g.attributes.position.array,'VEC3',g.attributes.position.count,{min:bb.min.toArray(),max:bb.max.toArray()}),NORMAL:acc(g.attributes.normal.array,'VEC3',g.attributes.normal.count),TEXCOORD_0:acc(g.attributes.uv.array,'VEC2',g.attributes.uv.count)};
    meshes.push({name,primitives:[{attributes:a,indices:acc(g.index.array,'SCALAR',g.index.count,null,5125),material:i}]}); nodes.push({name,mesh:i}); });
  const json={asset:{version:'2.0',generator:'pulse3d tools/models/glb.js'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,accessors,bufferViews:views,buffers:[{byteLength:off}]};
  let js=Buffer.from(JSON.stringify(json)); const jp=(4-js.length%4)%4; js=Buffer.concat([js,Buffer.alloc(jp,0x20)]); const bb=Buffer.concat(bin);
  const h=Buffer.alloc(12); h.write('glTF',0); h.writeUInt32LE(2,4); h.writeUInt32LE(12+8+js.length+8+bb.length,8);
  const jh=Buffer.alloc(8); jh.writeUInt32LE(js.length,0); jh.writeUInt32LE(0x4E4F534A,4); const bh=Buffer.alloc(8); bh.writeUInt32LE(bb.length,0); bh.writeUInt32LE(0x004E4942,4);
  return {buf:Buffer.concat([h,jh,js,bh,bb]),triangles:Object.values(byMat).flat().reduce((s,g)=>s+g.index.count/3,0)};
}
module.exports={THREE,rbox,piping,cylinder,toGlb};
