// Визуализация закреплённого ракурса: кадр сцены → Gemini → чистовик в render/final/.
//
//   node tools/render.js --list | <ракурс> [--frame-only] [--reuse-frame] [--note "..."]
//   node tools/render.js <ракурс> --fix "<что должно быть>"    # правка предыдущего результата, до трёх на кадр
//   node tools/render.js <ракурс> --set sofa=G,k4kbase=sage,h5tile=B --ref r4-door --as dining-1   # any select by id; bare key = room 4
//   node tools/render.js <ракурс> --wide                        # исходная камера пресета, широкий угол под потолком
//   node tools/render.js <ракурс> --film                        # пасмурный свет, зерно и несовершенства съёмки (раздел «## film» в STYLE.md)
//
// Промпт — render/STYLE.md, порядок работы — .claude/skills/render/SKILL.md, приёмы — docs/render-guide.md.
// Ключ GEMINI_API_KEY приходит из окружения (hub run claude).
const fs = require('fs');
const path = require('path');
const { launchChromium } = require('./browser');

const root = path.dirname(__dirname);
const args = process.argv.slice(2);
const VALUED = ['note', 'fix', 'model', 'size', 'viewport', 'aspect', 'set', 'ref', 'as'];                       // флаги со значением: их аргумент — не имя ракурса
const flag = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const has = name => args.includes('--' + name);
const cam = args.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(args[i - 1].replace(/^--/, ''))));

const fix = flag('fix', '');
const MODEL = flag('model', fix ? 'gemini-3.1-flash-image' : 'gemini-3-pro-image');          // база — дорогая модель, правки — дешевле
const SIZE = flag('size', '2K');                                                            // 2K при 16:9 — 2048×1152, ближайшее к 1080p
const [W, H] = flag('viewport', '1920x1080').split('x').map(Number);
const ASPECT = flag('aspect', '16:9');
const MAX_FIXES = 3;
const SET = flag('set', '');   // селекты в кадре: table=none,sofa=G (комната 4) или полный id — k4kbase=sage,h5tile=B
const REF = flag('ref', '');   // готовый рендер другого ракурса — эталон материалов и палитры
const AS = flag('as', '');   // имя варианта: без него результат зовётся именем ракурса
const LABELS = has('labels');
const FILM = has('film');   // «как снято на телефон в пасмурный день»: включается только по явной просьбе
const PHOTO = !has('wide');   // по умолчанию высота глаз и нормальный объектив; --wide — исходная камера пресета под потолком

const DIR = { frames: path.join(root, 'render', 'frames'), final: path.join(root, 'render', 'final'), wip: path.join(root, 'render', 'wip'), meta: path.join(root, 'render', '.meta') };
const base = cam ? cam + (AS ? '-' + AS : '') : '';
const framePath = cam ? path.join(DIR.frames, cam + '.png') : '';
const factsPath = cam ? path.join(DIR.frames, cam + '.facts.json') : '';

const rel = p => path.relative(root, p);
const readMeta = () => { try { return JSON.parse(fs.readFileSync(path.join(DIR.meta, base + '.json'), 'utf8')); } catch (e) { return null; } };
const img = p => ({ type: 'image', mime_type: p.endsWith('.png') ? 'image/png' : 'image/jpeg', data: fs.readFileSync(p).toString('base64') });

(async () => {
  if (cam && (fix || has('reuse-frame')) && fs.existsSync(framePath)) { console.log('кадр (готовый): ' + rel(framePath)); return send(); }
  const browser = await launchChromium({ args: ['--allow-file-access-from-files'] }); // GLB грузятся по XHR и с file://
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForFunction(() => window.setView && window.VIZ && window.LIGHTING);
  const cams = await page.evaluate(() => CAMS.map(c => ({ id: c.id, label: c.label })));

  if (has('list') || !cam) { console.log(cams.map(c => '  ' + c.id.padEnd(12) + c.label).join('\n')); await browser.close(); process.exit(cam ? 0 : 1); }
  if (!cams.some(c => c.id === cam)) { console.error('нет такого ракурса: ' + cam + ' (--list покажет все)'); await browser.close(); process.exit(1); }

  // чистый кадр: материалы и светильники включены, аватар и весь оверлей убраны, снимается только канвас
  if (SET) await page.evaluate(pairs => pairs.forEach(([k, v]) => { const sel = document.getElementById(k) || document.getElementById('k4' + k); if (!sel) throw new Error('нет селекта ' + k); sel.value = v; sel.dispatchEvent(new Event('change')); }), SET.split(',').map(p => p.split('=')));   // any select by id (h5tile, k4kbase…); a bare key is room 4
  await page.evaluate(id => { VIZ.set(true); LIGHTING.set('lamps'); const a = document.getElementById('avatarOn'); a.checked = false; a.dispatchEvent(new Event('change')); setView(id);
    document.getElementById('ui').style.display = 'none'; document.querySelectorAll('.hint, .rl, #walkpad, #fpvhint, #camhint, #map').forEach(e => { e.style.display = 'none'; }); }, cam);
  if (PHOTO) await page.evaluate(() => { controls.pos.y = 1.55; controls.phi = Math.PI / 2 + 0.03; persp.fov = 60; persp.updateProjectionMatrix(); controls.apply(); });
  await page.waitForTimeout(SET ? 5000 : 2500); // PBR-двойники и тени успевают собраться, у сменённого варианта — ещё и GLB

  // размеры сцены в метрах: без них модель делает из маленькой комнаты зал
  const facts = await page.evaluate(([id, labels, photo]) => {
    const c = CAMS.find(c => c.id === id), room = PLAN.rooms.find(r => r.id === +id.match(/^r(\d+)/)[1]);
    const xs = room.poly.map(p => p[0]), zs = room.poly.map(p => p[1]), m2 = n => Math.round(n * 100) / 100;
    const v = new THREE.Vector3(), seen = [], ray = new THREE.Raycaster();
    const walls = wallGroup.children.concat(wallGroupR.visible ? wallGroupR.children : []);
    const behindWall = p => { const dir = p.clone().sub(camera.position), len = dir.length(); ray.set(camera.position, dir.normalize()); ray.far = len - 0.15;
      return ray.intersectObjects(walls, true).length > 0; };   // предмет соседней комнаты попадает в кадр только через проём
    Object.entries(ITEM_GROUPS).forEach(([iid, g]) => {
      if (!g.visible || !g.parent || !g.parent.visible || g.userData.hidden) return;
      const bb = new THREE.Box3().setFromObject(g); if (bb.isEmpty()) return;
      bb.getCenter(v); const d = v.distanceTo(camera.position); if (d > 14) return;
      const p = v.clone().project(camera); if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return;
      const it = ITEMS.find(i => i.id === iid) || {}, [w, h, dp] = g.userData.size;
      if (Math.max(w, dp) < 0.4 || /^(led|cable|sock|ceil|switch)/.test(iid)) return; // мелочь и проводка масштаб не задают
      if (it.room !== room.id && (Math.max(w, dp) < 0.8 || behindWall(v))) return; // из соседней комнаты — только крупное и только если видно через проём
      let doors = 0;
      if (/шкаф|гардероб|пенал/i.test(it.type || '')) g.traverse(o => { const bb = o.isMesh && (o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox));
        if (!bb) return; const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
        if (sz <= 0.035 && sy >= 0.4 && sx >= 0.25 && sx <= 1.2) doors++; }); // фасад: тонкий по глубине, широкий по фронту — боковины и задняя стенка не считаются
      let slot = /зеркал/i.test(it.type || '');   // у PBR-двойника слот в userData может не сохраниться, тип надёжнее
      g.traverse(o => { if (o.isMesh && o.material.userData && o.material.userData.slot === 'mirror') slot = true; });
      seen.push({ id: iid, type: it.type || '', doors, w: m2(w), h: m2(h), d: m2(dp), face: m2(Math.max(w, dp)), dist: m2(d), mirror: !!slot, sx: (p.x + 1) / 2, sy: (1 - p.y) / 2 });
    });
    seen.sort((a, b) => a.dist - b.dist);
    if (labels) seen.filter(o => o.mirror || /зеркал|шкаф|порог/i.test(o.type)).forEach(o => {
      const el = document.createElement('div'); el.textContent = (o.mirror ? 'MIRROR ' : /шкаф/i.test(o.type) ? 'WARDROBE ' : '') + o.face + '×' + o.h + ' m' + (o.doors ? ', ' + o.doors + ' doors' : '');
      el.style.cssText = 'position:fixed;transform:translate(-50%,-50%);z-index:99;background:#fff;color:#000;font:600 15px/1.2 system-ui;padding:3px 7px;border:2px solid #000;border-radius:4px';
      el.style.left = o.sx * innerWidth + 'px'; el.style.top = o.sy * innerHeight + 'px'; el.className = 'rlabel'; document.body.appendChild(el);
    });
    if (photo) { const c2 = { camY: 1.55, tilt: 2, fov: 60 }; return { labels, photo, room: [m2(Math.max(...xs) - Math.min(...xs)), m2(Math.max(...zs) - Math.min(...zs))], area: room.area, ...c2, items: seen.slice(0, 12) }; }
    return { labels, room: [m2(Math.max(...xs) - Math.min(...xs)), m2(Math.max(...zs) - Math.min(...zs))], area: room.area,
      camY: m2(c.pos[1]), tilt: Math.round((c.phi - Math.PI / 2) * 180 / Math.PI), fov: c.fov, items: seen.slice(0, 12) };
  }, [cam, LABELS, PHOTO]);
  fs.writeFileSync(factsPath, JSON.stringify(facts));
  fs.mkdirSync(path.dirname(framePath), { recursive: true });
  const clip = await page.evaluate(() => { const r = document.getElementById('c').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await page.screenshot({ path: framePath, clip, timeout: 300000 }); // page screenshot with a clip: a locator screenshot waits for the canvas to be «stable», which never happens on a software GL
  await browser.close();
  console.log('кадр: ' + rel(framePath));
  if (has('frame-only')) return;
  return send();
})();


// кадр (+ предыдущий результат, если это правка) и стиль → Gemini → render/final/
async function send() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.error('нет GEMINI_API_KEY: hub secrets set GEMINI_API_KEY, затем перезапустить агента через hub run claude'); process.exit(2); }

  const style = fs.readFileSync(path.join(root, 'render', 'STYLE.md'), 'utf8');
  const shot = style.split(/^## /m).find(s => s.startsWith(cam));                            // «## <ракурс>» — заметки именно про этот вид
  const common = style.split(/^## /m)[0].trim();
  const film = FILM ? '\n' + ((style.split(/^## /m).find(s => s.startsWith('film')) || '').replace(/^film\s*/, '').trim() || 'Re-shoot as an ordinary photograph on an overcast day: soft cool daylight, uneven exposure, visible fine grain, no studio gloss.') : '';   // раздел «## film» в STYLE.md; fallback — если его удалили
  const meta = readMeta();
  let facts = null; try { facts = JSON.parse(fs.readFileSync(factsPath, 'utf8')); } catch (e) {}
  const scale = facts ? 'Real dimensions of this shot, in metres — respect them, the room is small: floor '
    + facts.room.join(' × ') + ' (' + facts.area + ' m²), ceiling 2.70. The camera stands ' + facts.camY
    + ' m above the floor, tilted ' + facts.tilt + '° down, with a ' + facts.fov
    + (facts.photo ? '° field of view — an eye-level photograph on a normal lens, no wide-angle stretching and no barrel distortion. Objects in frame, width × height × depth: '
      : '° field of view — a wide-angle shot taken high in a small room, so keep furniture large relative to the walls and do not stretch the space into a hall. Objects in frame, width × height × depth: ')
    + facts.items.map(o => o.id + ' ' + o.w + '×' + o.h + '×' + o.d + (o.mirror ? ' (a wall mirror, not a door or a window)' : o.doors ? ' (' + o.doors + ' doors across that width, so each leaf is ' + Math.round(o.w / o.doors * 100) + ' cm wide)' : '')).join('; ') + '.'
    + (facts.labels ? ' The white boxed captions drawn on the reference are notes to you, naming what an ambiguous shape really is and how big it is; render those objects as real objects and put no text, caption or label anywhere in the photograph.' : '') : '';
  const refPath = REF && (fs.existsSync(REF) ? REF : path.join(DIR.final, REF + '.jpg'));
  if (REF && !fs.existsSync(refPath)) { console.error('нет эталона ' + rel(refPath) + ': сначала отрендерить ' + REF); process.exit(1); }
  const prev = path.join(DIR.final, base + '.jpg');
  let input, prompt, fixes = meta ? meta.fixes || 0 : 0;

  if (fix) {
    if (!fs.existsSync(prev)) { console.error('нечего править: сначала базовый прогон без --fix'); process.exit(1); }
    if (fixes >= MAX_FIXES && !has('force')) { console.error('правок уже ' + fixes + ' из ' + MAX_FIXES + ': дальше --force или новый базовый прогон (модель уплывает от геометрии)'); process.exit(5); }
    fixes++;
    // правка, а не перегенерация: что менять — одной фразой, всё остальное сохраняется дословно; якорь геометрии идёт последним, от него наследуется кадрирование
    prompt = 'Image 1 is a photorealistic render to edit. Image 2 is the 3D scene it was made from — the geometry anchor: room shape, openings, camera and the placement of large furniture must match it.\n\n'
      + 'Keep everything else in image 1 exactly the same — same geometry, same camera, same materials, same lighting, same aspect ratio. Only fix: ' + fix + '\n\n'
      + (shot ? 'Shot notes: ' + shot.trim() + '\n\n' : '') + (scale ? scale + '\n\n' : '') + 'Style reminder: ' + common.split('\n\n').slice(3).join(' ').slice(0, 900) + film;
    input = [{ type: 'text', text: prompt }, img(prev), img(framePath)];   // якорь последним: от него наследуется кадрирование
    console.log('правка ' + fixes + '/' + MAX_FIXES + ' на ' + MODEL);
  } else {
    fixes = 0;
    const refNote = REF ? '\nImage 1 is a finished render of the same flat from another angle. Copy its finishes exactly: the same cabinet colour and fronts, the same floor, worktop, backsplash, wall paint, textiles and light temperature. It is a material reference only — take no geometry from it. The last image is the 3D scene for this shot and the only source of geometry, camera and furniture placement.' : '';
    prompt = [common, shot ? '\n## ' + shot.trim() : '', scale, refNote, film, flag('note', '') && '\nAlso for this shot: ' + flag('note', '')].filter(Boolean).join('\n');
    input = [{ type: 'text', text: prompt }].concat(REF ? [img(refPath)] : []).concat([img(framePath)]);
    console.log('база на ' + MODEL + ', ' + SIZE + ' ' + ASPECT);
  }

  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input, response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: ASPECT, image_size: SIZE } }),
  });
  const body = await res.json();
  // картинка приходит либо в output_image, либо шагом model_output — берём первый image, какой есть
  const out = body.output_image || (body.steps || []).flatMap(st => st.content || []).find(c => c.type === 'image' && c.data);
  if (res.status === 429) { console.error('Gemini 429: у image-моделей нет бесплатного тарифа — включить биллинг в проекте ключа (https://aistudio.google.com/apikey), кадр уже снят, повтор с --reuse-frame'); process.exit(4); }
  if (!res.ok || !out) { const dump = path.join(DIR.frames, 'last-response.json'); fs.writeFileSync(dump, JSON.stringify(body, null, 1));
    console.error('Gemini ' + res.status + ': нет картинки в ответе, целиком в ' + rel(dump)); process.exit(3); }

  Object.values(DIR).forEach(d => fs.mkdirSync(d, { recursive: true }));
  if (fs.existsSync(prev)) {                                                                 // вытесненный чистовик уезжает в wip, а не пропадает
    const st = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    fs.renameSync(prev, path.join(DIR.wip, base + '-' + st + '.jpg'));
  }
  fs.writeFileSync(prev, Buffer.from(out.data, 'base64'));
  fs.writeFileSync(path.join(DIR.meta, base + '.json'), JSON.stringify({ cam, model: MODEL, size: SIZE, aspect: ASPECT, viewport: [W, H], set: SET || undefined, ref: REF || undefined, film: FILM || undefined, fixes, note: flag('note', '') || undefined, lastFix: fix || undefined, prompt, at: new Date().toISOString() }, null, 1));
  console.log('готово: ' + rel(prev) + '\nкадр:   ' + rel(framePath));
}
