// UV sanity for models/*.glb: UV must be in metres (MATERIALS convention), so every triangle edge should map 1:1.
// Prints per file the share of triangles whose worst edge is stretched/compressed more than 1.5× — those show as seams or smeared texture.
// Usage: node tools/models/uvcheck.js [file.glb ...]   (default: all models/*.glb); exit 1 when any file has > 10 % bad triangles (wc.glb lathe bowl sits at ~9 %: rings of different radius cannot all be 1:1)
const fs=require('fs'), path=require('path');
function readGlb(file){ const b=fs.readFileSync(file); const jl=b.readUInt32LE(12), json=JSON.parse(b.toString('utf8',20,20+jl)), bin=b.slice(20+jl+8);
  const acc=i=>{ const a=json.accessors[i], v=json.bufferViews[a.bufferView], n={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}[a.componentType], k={SCALAR:1,VEC2:2,VEC3:3}[a.type]; return new n(bin.buffer,bin.byteOffset+(v.byteOffset||0),a.count*k); };
  return json.meshes.map(m=>{ const p=m.primitives[0]; return {name:m.name,pos:acc(p.attributes.POSITION),uv:acc(p.attributes.TEXCOORD_0),idx:acc(p.indices)}; }); }
function stats(file){ let tri=0, bad=0; for(const m of readGlb(file)){ const {pos,uv,idx}=m;
    for(let t=0;t<idx.length;t+=3){ let worst=1; for(let e=0;e<3;e++){ const a=idx[t+e], c=idx[t+(e+1)%3];
        const d3=Math.hypot(pos[a*3]-pos[c*3],pos[a*3+1]-pos[c*3+1],pos[a*3+2]-pos[c*3+2]), d2=Math.hypot(uv[a*2]-uv[c*2],uv[a*2+1]-uv[c*2+1]);
        if(d3<1e-6) continue; const r=d2/d3; worst=Math.max(worst,r,1/r); }
      tri++; if(worst>1.5) bad++; } }
  return {tri,bad,pct:100*bad/tri}; }
const files=process.argv.length>2?process.argv.slice(2):fs.readdirSync(path.join(__dirname,'../../models')).filter(f=>f.endsWith('.glb')).map(f=>path.join(__dirname,'../../models',f));
let fail=false; for(const f of files){ const s=stats(f); if(s.pct>10) fail=true; console.log(path.basename(f).padEnd(18), String(s.tri).padStart(6)+' tri', s.pct.toFixed(1).padStart(5)+' % stretched'); }
process.exit(fail?1:0);
