// Smoke-тест сцены: страница грузится без ошибок, PLAN согласован,
// скриншоты сохраняются в tools/out/. Гонять перед каждым пушем.
//
// Требует playwright и Chromium (один раз на окружение):
//   npm i --no-save playwright && npx playwright install chromium
//   (системные библиотеки, нужен root: npx playwright install-deps chromium)
// Запуск:  node tools/check.js            — файл из рабочей копии
//          node tools/check.js <url>      — например, страница на Pages
// Проверяет: загрузку без ошибок страницы, 10 помещений и их площади, вид «Сверху»,
// переход в прогулку и движение вперёд. Скриншоты: default.png, top.png, walk.png.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const root = path.dirname(__dirname);
  const url = process.argv[2] || 'file://' + path.join(root, 'index.html');
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  // в облачном окружении Claude Code хром лежит по фиксированному пути; обе ошибки запуска сохраняем —
  // без браузера smoke-тест не выполнен, а не «прошёл»
  let browser;
  try {
    browser = await chromium.launch({ args: ['--allow-file-access-from-files'] }); // GLB models load over XHR from file:// too
  } catch (e1) {
    const alt = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
    try {
      browser = await chromium.launch({ executablePath: alt, args: ['--allow-file-access-from-files'] });
    } catch (e2) {
      console.error('ПРОВАЛ: браузер не запустился, проверка сцены НЕ выполнена.\n' +
        '  1) chromium.launch(): ' + e1.message.split('\n')[0] + '\n' +
        '  2) ' + alt + ': ' + e2.message.split('\n')[0] + '\n' +
        '  Установка: npm i --no-save playwright && npx playwright install chromium\n' +
        '  Системные библиотеки (root): npx playwright install-deps chromium');
      process.exit(2);
    }
  }
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const problems = [];
  // materials-lighting M0: MATERIALS is an object literal, so a duplicate key silently overwrites the first one — check the source text
  for (const name of ['MATERIALS', 'COATINGS']) { const src = fs.readFileSync(path.join(root, 'materials.js'), 'utf8').match(new RegExp('const ' + name + '=\\{([\\s\\S]*?)\\n\\};'))[1];
    const keys = [...src.matchAll(/^\s*([A-Za-z_]\w*)\s*:/gm)].map(m => m[1]), dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dup.length) problems.push('материалы: дубли ключей ' + name + ': ' + dup.join(', ')); }
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => {
    // необязательный внешний шрифт может не грузиться в оффлайне — не ошибка сцены
    const src = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && !/fonts\.googleapis|fonts\.gstatic|favicon\.ico|models\/absent\.glb|textures\/absent\//.test(src + m.text())) {
      problems.push('console: ' + m.text() + (src ? ' @ ' + src : ''));
    }
  });

  await page.goto(url);
  await page.waitForTimeout(3500);
  await page.evaluate(() => { try { localStorage.removeItem('pulse3d.marks'); localStorage.removeItem('pulse3d.layout'); localStorage.removeItem('pulse3d.viz'); localStorage.removeItem('pulse3d.light'); } catch (e) {} }); // чистый старт разметки, вариантов и режима
  await page.screenshot({ path: path.join(outDir, 'default.png') });

  const report = await page.evaluate(() => {
    const c = document.getElementById('c');
    const shoelace = p => {
      let a = 0;
      for (let i = 0; i < p.length; i++) {
        const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length];
        a += x1 * z2 - x2 * z1;
      }
      return Math.abs(a) / 2;
    };
    const rooms = (typeof PLAN === 'undefined' ? [] : PLAN.rooms).map(r => ({
      id: r.id,
      stored: r.area,
      geom: Math.round(shoelace(r.poly) * 1000) / 1000,
    }));
    return { canvas: !!(c && c.width > 0), nRooms: rooms.length, rooms };
  });

  // высоты от чистового пола (y=0): отделка пола у нуля, плинтус 0–0.1, потолок H, дверная перемычка 2.1,
  // мебель не утоплена — нижняя грань всех предметов ≥ 0
  const hts = await page.evaluate(() => {
    const bb = o => new THREE.Box3().setFromObject(o);
    const minY = g => g.children.reduce((m, o) => Math.min(m, bb(o).min.y), Infinity);
    const floor = finishGroup.children.find(o => o.geometry && o.geometry.type === 'ShapeGeometry');
    let plinth = null; finishGroup.traverse(o => { if (!plinth && o.isMesh && o.geometry.type === 'BoxGeometry' && Math.abs(bb(o).max.y - bb(o).min.y - 0.1) < 1e-3) plinth = o; });
    const ceil = ceilGroup.children[0];
    return {
      floor: floor ? bb(floor).min.y : null,
      plinth: plinth ? [bb(plinth).min.y, bb(plinth).max.y] : null,
      ceil: ceil ? bb(ceil).min.y : null,
      furnitureMin: Math.min(...[furnGroup, hallGroup, laundryGroup, kidGroup, kid2Group, masterGroup, bathGroup, bath2Group].map(minY)),
      doorTop: (() => { let n = 0; finishGroup.traverse(o => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && Math.abs(bb(o).max.y - 2.17) < 0.02) n++; }); return n; })(),
    };
  });
  if (hts.floor == null || hts.floor < 0 || hts.floor > 0.02) problems.push('отделка пола не у чистового пола: y=' + hts.floor);
  if (!hts.plinth || Math.abs(hts.plinth[0]) > 0.01 || Math.abs(hts.plinth[1] - 0.1) > 0.01) problems.push('плинтус не 0–0.1: ' + JSON.stringify(hts.plinth));
  if (hts.ceil == null || Math.abs(hts.ceil - 2.7) > 0.01) problems.push('потолок не на 2.7: ' + hts.ceil);
  if (hts.furnitureMin < -0.001) problems.push('мебель утоплена ниже пола: min y=' + hts.furnitureMin);
  if (!hts.doorTop) problems.push('дверные коробки: верх перемычки не на 2.1+0.07');

  // ползунок «Стены»: настенная отделка гаснет и прячется вместе со стенами, пол остаётся; съёмная стена и её коробка согласованы
  const vis = await page.evaluate(() => {
    const set = v => { const s = document.getElementById('wop'); s.value = v; s.dispatchEvent(new Event('input')); };
    const floor = finishGroup.children.find(o => o.geometry && o.geometry.type === 'ShapeGeometry');
    const wp = window.wallFinMats[0];
    set(50); const half = { wall: wallMat.opacity, wp: wp.opacity, fin: window.wallFin.visible };
    set(0);  const off = { walls: wallGroup.visible, fin: window.wallFin.visible, floor: floor.visible && finishGroup.visible };
    const k = document.getElementById('kwall'); k.checked = true; k.dispatchEvent(new Event('change'));
    const kOn0 = { wallR: wallGroupR.visible, frame: window.kitchenFrame.visible && window.wallFin.visible };
    set(100); const kOn100 = { wallR: wallGroupR.visible, frame: window.kitchenFrame.visible && window.wallFin.visible };
    k.checked = false; k.dispatchEvent(new Event('change'));
    const kOff = { wallR: wallGroupR.visible, frame: window.kitchenFrame.visible };
    return { half, off, kOn0, kOn100, kOff, back: wallMat.opacity };
  });
  if (Math.abs(vis.half.wall - 0.5) > 0.01 || Math.abs(vis.half.wp - 0.5) > 0.01 || !vis.half.fin) problems.push('стены 50%: отделка не следует за стенами ' + JSON.stringify(vis.half));
  if (vis.off.walls || vis.off.fin || !vis.off.floor) problems.push('стены 0%: ' + JSON.stringify(vis.off));
  if (vis.kOn0.wallR || vis.kOn0.frame) problems.push('стены 0% + съёмная стена включена: стена/коробка видны');
  if (!vis.kOn100.wallR || !vis.kOn100.frame) problems.push('стены 100% + съёмная стена включена: стена/коробка скрыты');
  if (vis.kOff.wallR || vis.kOff.frame) problems.push('съёмная стена выключена: стена/коробка видны');
  if (Math.abs(vis.back - 1) > 0.01) problems.push('стены не вернулись к 100%');

  if (!report.canvas) problems.push('канвас сцены не создан');
  if (report.nRooms !== 10) problems.push('ожидалось 10 комнат, получено ' + report.nRooms);
  for (const r of report.rooms) {
    if (Math.abs(r.geom - r.stored) > 0.06) { // размеры БТИ округлены до см — ±0.05 м² это шум
      problems.push(`комната ${r.id}: полигон даёт ${r.geom}, записано ${r.stored}`);
    }
  }

  await page.click('text=Сверху').catch(() => problems.push('нет кнопки «Сверху»'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, 'top.png') });
  // режим плана: ортографическая камера, метр на полу и на высоте 2.5 м занимает одинаково пикселей,
  // перетаскивание сдвигает цель и не меняет наклон
  // ЛКМ в чистом плане вращает (изометрия), при включённой разметке — сдвигает без наклона
  const th0 = await page.evaluate(() => controls.theta);
  await page.mouse.move(700, 500); await page.mouse.down(); await page.mouse.move(760, 540, { steps: 4 }); await page.mouse.up();
  if (await page.evaluate((t) => Math.abs(controls.theta - t) < 1e-6, th0)) problems.push('план: ЛКМ не вращает сцену');
  await page.click('#mkBtn'); await page.waitForTimeout(100);
  const before = await page.evaluate(() => ({ t: controls.target.toArray(), th: controls.theta, ph: controls.phi }));
  await page.mouse.move(700, 500); await page.mouse.down(); await page.mouse.move(760, 540, { steps: 4 }); await page.mouse.up();
  const plan = await page.evaluate((b) => {
    const px = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return [v.x * innerWidth / 2, v.y * innerHeight / 2]; };
    const dx = (y) => { const a = px(cx, y, cz), c = px(cx + 1, y, cz); return Math.hypot(c[0] - a[0], c[1] - a[1]); };
    return { ortho: !!camera.isOrthographicCamera, m0: dx(0), m25: dx(2.5),
      moved: controls.target.distanceTo(new THREE.Vector3().fromArray(b.t)), tilt: Math.abs(controls.theta - b.th) + Math.abs(controls.phi - b.ph) };
  }, before);
  await page.evaluate(() => MK.toggle(false)); // разметка была включена для проверки сдвига
  // разметка: клик ставит точку ровно в спроецированную координату, зум/сдвиг её не меняют,
  // отрезок между известными точками имеет верную длину, текст для агента содержит поворот и шаг
  await page.click('#mkBtn'); await page.click('[data-tool=point]');
  const expPt = await page.evaluate(() => MK.snapPt(MK.pickPoint({ clientX: 700, clientY: 450 })));
  await page.mouse.click(700, 450); await page.waitForTimeout(100);
  await page.mouse.move(640, 420); await page.mouse.wheel(0, -300); await page.mouse.down(); await page.mouse.move(700, 470, { steps: 3 }); await page.mouse.up();
  const mk = await page.evaluate((exp) => {
    const p = MK.marks[0] && MK.marks[0].pts[0];
    const seg = MK.addSeg([9, 4], [12, 8]);
    const rect = MK.addRect([1.5, 2.5], 1.2, 0.45, 90); MK.edit(rect, { y1: 0.9 });
    const txt = MK.describe(rect);
    const out = { pt: p && Math.abs(p[0] - exp[0]) < 1e-6 && Math.abs(p[1] - exp[1]) < 1e-6, len: Math.abs(Math.hypot(3, 4) - Math.hypot(seg.pts[1][0] - seg.pts[0][0], seg.pts[1][1] - seg.pts[0][1])) < 1e-9,
      txt: /поворот 90°/.test(txt) && /Шаг сетки/.test(txt) && /помещение 1/.test(txt) && /x=1\.50, z=2\.50/.test(txt) };
    // T08: привязка к краю дивана, настенная точка, экспорт → импорт, отказ битого файла
    const sp = MK.snapPt([11.40, 5.6]); const bm = MK.addPoint(sp);
    out.bind = !!(bm.bind && bm.bind.item === 'sofa' && bm.bind.side === 'W' && Math.abs(sp[0] - 11.35) < 1e-6);
    const wm = MK.addPoint([2.5, 1.95]); wm.wall = { side: 'N', from: 'W', dist: 1.604, h: 1.2 }; MK.edit(wm, { y0: 1.2 });
    out.wall = /стена север помещения 1.*1\.60 м вдоль стены.*1\.20 м/.test(MK.describe(wm));
    const dumpText = MK.exportText(); const ids = MK.marks.map(m => m.id).join();
    MK.marks.slice().forEach(m => MK.remove(m));
    out.reject = !MK.importText('{bad') && !MK.importText(JSON.stringify({ format: 9, marks: [] })) && MK.marks.length === 0;
    out.roundtrip = MK.importText(dumpText) && MK.marks.map(m => m.id).join() === ids && MK.marks.find(m => m.id === bm.id).bind.item === 'sofa';
    MK.marks.slice().forEach(m => MK.remove(m)); MK.toggle(false);
    return out;
  }, expPt);
  // T08: метки переживают перезагрузку страницы с теми же ID
  const idsBefore = await page.evaluate(() => { MK.addPoint([3, 3]); MK.addRect([12, 3], 1, 0.5, 0); return MK.marks.map(m => m.id).join(); });
  await page.reload(); await page.waitForTimeout(2500);
  const persisted = await page.evaluate((ids) => { const ok = MK.marks.map(m => m.id).join() === ids && MK.marks[1].type === 'rect' && MK.marks[1].w === 1; MK.marks.slice().forEach(m => MK.remove(m)); return ok; }, idsBefore);
  if (!persisted) problems.push('разметка: метки не восстановились после перезагрузки');
  // audit 2026-09-06 G0: A01 — IDs stay unique after reload; A02 — imported item ID is text, not HTML; A04 — corrupted saves survive a load
  await page.evaluate(() => { MK.marks.slice().forEach(m => MK.remove(m)); MK.addPoint([3, 3]); });
  await page.reload(); await page.waitForTimeout(2500);
  const g0 = await page.evaluate(() => {
    const out = {};
    const m2 = MK.addPoint([4, 4]); out.uniqId = m2.id !== MK.marks[0].id && !MK.validate(MK.dump()).length;
    window.__pwned = false;
    const bad = { id: 'M7', type: 'point', pts: [[3, 3]], bind: { item: '<img src=x onerror="window.__pwned=true">', side: 'W' } };
    out.imp = MK.importText(JSON.stringify({ format: 1, plan: PLAN.meta.version, marks: [bad] }));
    MK.toggle(true); MK.select(MK.marks[0]);
    out.noImg = !document.querySelector('#mkCard img') && document.querySelector('#mkCard').textContent.includes('<img') && !window.__pwned;
    MK.marks.slice().forEach(m => MK.remove(m)); MK.toggle(false);
    try { localStorage.setItem('pulse3d.layout', '{bad'); localStorage.setItem('pulse3d.marks', '{bad'); } catch (e) {}
    return out;
  });
  await page.reload(); await page.waitForTimeout(2500);
  const g0b = await page.evaluate(() => {
    const kept = localStorage.getItem('pulse3d.layout') === '{bad' && localStorage.getItem('pulse3d.marks') === '{bad' && !!LAY.badSave && !!MK.badSave;
    LAY.setPose('sofa', [ITEM_GROUPS.sofa.userData.pos[0] + 0.1, ITEM_GROUPS.sofa.userData.pos[1]], null); MK.addPoint([3, 3]);
    const backed = localStorage.getItem('pulse3d.layout.bad') === '{bad' && localStorage.getItem('pulse3d.marks.bad') === '{bad' && !LAY.validate(JSON.parse(localStorage.getItem('pulse3d.layout'))).length;
    LAY.variants.splice(LAY.cur, 1); LAY.applyVariant(0); MK.marks.slice().forEach(m => MK.remove(m));
    localStorage.removeItem('pulse3d.layout.bad'); localStorage.removeItem('pulse3d.marks.bad');
    return { kept, backed };
  });
  if (!g0.uniqId) problems.push('разметка: после перезагрузки ID новой метки повторяется (A01)');
  if (!g0.imp || !g0.noImg) problems.push('разметка: ID предмета из импорта вставлен как HTML (A02)');
  if (!g0b.kept) problems.push('сохранения: повреждённый localStorage перезаписан при загрузке (A04)');
  if (!g0b.backed) problems.push('сохранения: повреждённая строка не сохранена в *.bad перед перезаписью (A04)');
  // A05: a variant saved for another plan version is a conflict, poses stay; a changed geometry fingerprint is reported but applied
  const a05 = await page.evaluate(() => {
    const p0 = ITEM_GROUPS.sofa.userData.pos.slice(); const doc = v => JSON.stringify({ format: 1, plan: v, cur: 1, variants: [{ name: 'чужой', poses: { sofa: { pos: [1, 1], rot: 0 } } }] });
    const rejected = !LAY.importText(doc(999)) && ITEM_GROUPS.sofa.userData.pos.join() === p0.join() && LAY.variants.length === 1;
    const ok = LAY.importText(JSON.stringify({ ...JSON.parse(doc(PLAN.meta.version)), rev: 'deadbeef' })); const noted = !!LAY.revNote && ITEM_GROUPS.sofa.userData.pos.join() === '1,1';
    LAY.variants.splice(1); LAY.applyVariant(0); return { rejected, ok, noted, rev: typeof SCENE_REV === 'string' && LAY.dump().rev === SCENE_REV };
  });
  if (!a05.rejected) problems.push('расстановка: вариант для другого плана применён без конфликта (A05)');
  if (!a05.ok || !a05.noted || !a05.rev) problems.push('расстановка: fingerprint геометрии не сохраняется или не сообщается (A05)');
  // A03: walk + visualization → «Разметка» button must land in plan with flat materials, whatever path led there
  await page.click('#vFP'); await page.waitForTimeout(200);
  await page.evaluate(() => VIZ.set(true)); await page.waitForTimeout(300);
  await page.click('#mkBtn'); await page.waitForTimeout(200);
  const a03 = await page.evaluate(() => { const out = { plan: controls.plan, mk: MK.on, viz: VIZ.active, shadows: renderer.shadowMap.enabled, wall: wallGroup.children[0].material.type, pref: VIZ.on };
    MK.toggle(false); setView('door'); out.back = VIZ.active && renderer.shadowMap.enabled && !document.getElementById('walkpad').hidden; VIZ.set(false); setView('top'); return out; });
  if (!a03.plan || !a03.mk || a03.viz || a03.shadows || a03.wall !== 'MeshBasicMaterial') problems.push('режимы: разметка из прогулки с визуализацией оставила PBR/тени (A03): ' + JSON.stringify(a03));
  if (!a03.pref || !a03.back) problems.push('режимы: предпочтение визуализации потеряно или программный setView не вернул её (A03)');
  // A06: selecting the same mark / item many times must not grow GPU resources
  const a06 = await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r)); const mem = () => ({ g: renderer.info.memory.geometries, t: renderer.info.memory.textures });
    MK.toggle(true); const m = MK.addRect([3, 3], 1, 0.5, 0); const m2 = MK.addSeg([4, 4], [5, 4]);
    for (let i = 0; i < 5; i++) { MK.select(m); await frame(); MK.select(m2); await frame(); }
    const b0 = mem();
    for (let i = 0; i < 30; i++) { MK.select(m); await frame(); MK.select(m2); await frame(); MK.edit(m, { w: 1 + i * 0.01 }); await frame(); }
    const b1 = mem(); MK.marks.slice().forEach(k => MK.remove(k)); MK.toggle(false);
    LAY.toggle(true); for (let i = 0; i < 3; i++) { LAY.select('sofa'); await frame(); LAY.select(null); await frame(); }
    const c0 = mem(); for (let i = 0; i < 30; i++) { LAY.select('sofa'); await frame(); LAY.select('table'); await frame(); } LAY.select(null); await frame(); const c1 = mem(); LAY.toggle(false);
    return { dg: b1.g - b0.g, dt: b1.t - b0.t, lg: c1.g - c0.g };
  });
  if (a06.dg > 0 || a06.dt > 0 || a06.lg > 0) problems.push('ресурсы: выбор метки/предмета накапливает geometries/textures (A06): ' + JSON.stringify(a06));
  // G1: one pose operation notifies dependants; explicit proxy boxes; material slots
  const g1 = await page.evaluate(() => {
    const out = {}; window.prompt = () => 'g1';
    const ext = id => { const bb = new THREE.Box3(); PHYS[id].forEach(m => bb.union(new THREE.Box3().setFromObject(m))); const s = new THREE.Vector3(); bb.getSize(s); return [s.x, s.y, s.z].map(v => Math.round(v * 1000) / 1000); };
    out.sofaOne = PHYS.sofa.length === 1 && ext('sofa').join() === '2,0.75,0.88';
    setItemPose('sofa', null, 90); out.sofaRot = ext('sofa').join() === '0.88,0.75,2'; setItemPose('sofa', null, 0);
    out.bedFew = PHYS.kidbed.length === 9 && PHYS.tub.length === 5 && ITEM_GROUPS.kidbed.children.length > 20;
    out.gltf = typeof THREE.GLTFLoader === 'function'; // realism-living step 2: vendored loader r128
    out.living = PHYS.table.length === 6 && PHYS.chair1.length === 6 && PHYS.sofa.length === 1 && ext('table').join() === '0.8,0.76,1.8' && ext('chair1').join() === '0.42,0.9,0.42'; // realism-living step 1: fixed proxies
    const p0 = ITEM_GROUPS.sofa.userData.pos.slice(); MK.toggle(true);
    const m = MK.addPoint([p0[0], p0[1] + 0.2]); MK.edit(m, { bind: { item: 'sofa', side: 'W' } });
    const c0 = !m.conflict; setItemPose('sofa', [p0[0] + 0.3, p0[1]]); const c1 = m.conflict === 'предмет сдвинулся'; setItemPose('sofa', p0); const c2 = !m.conflict;
    LAY.copyVariant(); LAY.setPose('sofa', [p0[0] + 0.5, p0[1]], null); const c3 = !!m.conflict; LAY.applyVariant(0); const c4 = !m.conflict;
    LAY.variants.splice(1); LAY.applyVariant(0); MK.marks.slice().forEach(k => MK.remove(k)); MK.toggle(false);
    out.hooks = c0 && c1 && c2 && c3 && c4;
    VIZ.set(true); setView('door');
    const std = k => VIZ.std.get(ITEM_MATS[k]);
    out.slots = std('handle').metalness > 0.5 && std('cushion').roughness > 0.9 && std('led').emissive.getHex() !== 0 && std('body').metalness === 0;
    out.slots2 = std('table').roughness === MATERIALS.wood.rough && std('chair').roughness === MATERIALS.cabinetPaint.rough; // realism-living step 7: wood/cabinetPaint slots
    const tg = ITEM_GROUPS.table, tbb = new THREE.Box3().setFromObject(tg), ts = new THREE.Vector3(); tbb.getSize(ts); const kinds = {}; tg.children.forEach(o => { kinds[o.geometry.type] = (kinds[o.geometry.type] || 0) + 1; });
    const rail = tg.children.find(o => o.geometry.type === 'BoxGeometry'), ruv = rail.geometry.attributes.uv; let umax = 0; for (let i = 0; i < ruv.count; i++) umax = Math.max(umax, ruv.getX(i), ruv.getY(i));
    out.table = kinds.ExtrudeGeometry === 1 && kinds.CylinderGeometry === 4 && kinds.BoxGeometry === 4 && ts.x <= 0.801 && ts.y <= 0.761 && ts.z <= 1.801 && Math.abs(umax - 1.6) < 1e-6 && Math.abs(tbb.min.y) < 1e-6; // bevelled top, tapered legs, rails; UV in metres (rail 1.6 m long)
    VIZ.set(false); setView('top');
    return out;
  });
  // realism-living step 3: a GLB that fails to load leaves the procedural item and its proxy, error noted in VIZ.loadErrors
  const glbFallback = await page.evaluate(async () => { const n0 = ITEM_GROUPS.sofa.children.length, ok = await loadItemGlb('sofa', 'models/absent.glb');
    return ok === false && ITEM_GROUPS.sofa.children.length === n0 && PHYS.sofa.length === 1 && (VIZ.loadErrors || []).some(s => /sofa: models\/absent/.test(s)); });
  // realism-living step 5: the sofa GLB replaced the procedural build — grey slot materials, no validation warnings, extent = size, proxy untouched
  const sofaGlb = await page.evaluate(async () => { const g = ITEM_GROUPS.sofa; for (let i = 0; i < 100 && !g.userData.glbLoaded && !(VIZ.loadErrors || []).some(s => /^sofa:/.test(s)); i++) await new Promise(r => setTimeout(r, 100));
    const bb = new THREE.Box3().setFromObject(g), s = new THREE.Vector3(); bb.getSize(s); const mats = new Set(), names = []; g.traverse(o => { if (o.isMesh) { mats.add(o.material); names.push(o.userData.glbMat); } });
    return { loaded: !!g.userData.glbLoaded, warn: (g.userData.glbWarnings || []).join('|'), size: [s.x, s.y, s.z].map(v => Math.round(v * 100) / 100).join(), slots: [...new Set([...mats].map(m => m.userData.slot))].sort().join(), grey: [...mats].every(m => m.isMeshLambertMaterial && m.color.r === m.color.g && m.color.g === m.color.b), boxes: PHYS.sofa.length, names: [...new Set(names)].sort().join() }; });
  if (sofaGlb.loaded && sofaGlb.names !== 'cushion,metal,piping,upholstery') problems.push('glb: sofa — имена покрытий в userData.glbMat: ' + sofaGlb.names + ' (materials-lighting M1b)');
  if (!sofaGlb.loaded) problems.push('glb: models/sofa.glb не загрузился: ' + JSON.stringify(sofaGlb));
  else { if (sofaGlb.warn) problems.push('glb: sofa — предупреждения валидации: ' + sofaGlb.warn);
    if (sofaGlb.size !== '2,0.85,0.88' || sofaGlb.slots !== 'fabric,metal' || !sofaGlb.grey || sofaGlb.boxes !== 1) problems.push('glb: sofa — габарит/слоты/серый/proxy не сошлись: ' + JSON.stringify(sofaGlb)); }
  // realism-all stage A: proxies for the remaining room 4/5/7 items repeat the old mesh AABBs (count + union extent)
  const proxA = await page.evaluate(() => { const ext = id => { const bb = new THREE.Box3(); PHYS[id].forEach(m => bb.union(new THREE.Box3().setFromObject(m))); const s = new THREE.Vector3(); bb.getSize(s); return [s.x, s.y, s.z].map(v => Math.round(v * 1000) / 1000).join(); };
    const want = { kitchen: [19, '0.68,2.69,3.59'], tv: [1, '1.3,0.75,0.04'], console: [1, '1.2,0.3,0.38'], lamp: [2, '0.26,0.2,0.63'], wardrobe: [16, '1.77,2.65,0.47'], entry: [7, '0.325,1.05,0.4'], pouf: [5, '0.4,0.45,0.6'], washer: [6, '0.6,1.72,0.62'] };
    return Object.entries(want).filter(([id, [n, e]]) => PHYS[id].length !== n || ext(id) !== e).map(([id]) => id + ':' + PHYS[id].length + ':' + ext(id)); });
  if (proxA.length) problems.push('proxy: этап A — число боксов/габарит не сошлись: ' + proxA.join(' '));
  // realism-all stage C: proxies for the room 2 items repeat the old mesh AABBs (count + union extent)
  const proxC = await page.evaluate(() => { const ext = id => { const bb = new THREE.Box3(); PHYS[id].forEach(m => bb.union(new THREE.Box3().setFromObject(m))); const s = new THREE.Vector3(); bb.getSize(s); return [s.x, s.y, s.z].map(v => Math.round(v * 1000) / 1000).join(); };
    const want = { kidbed2: [9, '2.4,2.6,2.97'], kiddesk2: [4, '0.75,0.72,1.65'], kidchair2: [5, '0.52,0.85,0.49'], deskshelf2: [3, '0.22,0.15,1.55'], tower2n: [10, '0.615,2.7,0.68'], tower2s: [13, '0.615,2.7,0.619'], windowseat2: [9, '0.615,0.65,1.702'], gymwall: [14, '0.8,2.7,0.06'], pullup: [3, '0.9,0.04,0.53'], kidrug2: [1, '1.6,0.02,2'], kidlight2: [1, '0.45,0.04,0.45'], desklamp2: [3, '0.16,0.48,0.16'], bra3: [3, '0.12,0.12,0.225'], bra4: [2, '0.12,0.12,0.165'], blind2: [2, '0.08,0.09,1.48'] };
    return Object.entries(want).filter(([id, [n, e]]) => PHYS[id].length !== n || ext(id) !== e || !ITEM_GROUPS[id].userData.proxy.length).map(([id]) => id + ':' + PHYS[id].length + ':' + ext(id)); });
  if (proxC.length) problems.push('proxy: этап C — число боксов/габарит не сошлись: ' + proxC.join(' '));
  // realism-all stage A: kitchen detailed — fronts with gaps, sink bowl under the worktop, mixer; all inside size, proxies unchanged
  const kitchenA = await page.evaluate(() => { const g = ITEM_GROUPS.kitchen, bb = new THREE.Box3().setFromObject(g).applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()), s = g.userData.size; let n = 0, tri = 0; g.traverse(o => { if (o.isMesh) { n++; tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    return { fit: bb.min.x >= -0.001 && bb.min.y >= -0.001 && bb.min.z >= -0.001 && bb.max.x <= s[0] + 0.001 && bb.max.y <= s[1] + 0.001 && bb.max.z <= s[2] + 0.001, n, tri: Math.round(tri), boxes: PHYS.kitchen.length }; });
  if (!kitchenA.fit || kitchenA.n < 40 || kitchenA.tri > 6000 || kitchenA.boxes !== 19) problems.push('кухня: детали вне size, мало мешей, дорого или proxy изменился: ' + JSON.stringify(kitchenA));
  // realism-all stage C: detailed room 2 items stay inside size (+1 mm); plates carry one proxy box equal to the item
  const fitC = await page.evaluate(() => { const fit = id => { const g = ITEM_GROUPS[id], bb = new THREE.Box3().setFromObject(g), inv = new THREE.Matrix4().copy(g.matrixWorld).invert(); bb.applyMatrix4(inv); const s = g.userData.size; return bb.min.x >= -0.001 && bb.min.y >= -0.001 && bb.min.z >= -0.001 && bb.max.x <= s[0] + 0.001 && bb.max.y <= s[1] + 0.001 && bb.max.z <= s[2] + 0.001; };
    const ids = ['tower2n', 'tower2s', 'kiddesk2', 'deskshelf2', 'gymwall', 'pullup', 'kidrug2', 'kidlight2', 'desklamp2', 'bra3', 'bra4', 'blind2', 'sw2', 'sock9', 'sock10', 'sock11', 'sock12', 'sock13'];
    const bad = ids.filter(id => !fit(id)); ['sw2', 'sock9', 'sock10', 'sock11', 'sock12', 'sock13'].forEach(id => { if (PHYS[id].length !== 1) bad.push(id + ':phys'); }); return bad; });
  if (fitC.length) problems.push('этап C: детали вне size или proxy розеток не один бокс: ' + fitC.join(' '));
  // realism-all stage A: tv, console, lamp, wardrobe, entry detailed — inside size, proxy counts as before
  const cabA = await page.evaluate(() => { const fit = id => { const g = ITEM_GROUPS[id], bb = new THREE.Box3().setFromObject(g).applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()), s = g.userData.size; return bb.min.x >= -0.001 && bb.min.y >= -0.001 && bb.min.z >= -0.001 && bb.max.x <= s[0] + 0.001 && bb.max.y <= s[1] + 0.001 && bb.max.z <= s[2] + 0.001; };
    return Object.entries({ tv: 1, console: 1, lamp: 2, wardrobe: 16, entry: 7 }).filter(([id, n]) => !fit(id) || PHYS[id].length !== n).map(([id]) => id); });
  if (cabA.length) problems.push('этап A: детали вне size или proxy изменился: ' + cabA.join(' '));
  // realism-all stage C: windowseat2 GLB replaced the procedural build — slot materials, no validation warnings, extent = size, 9 proxy boxes kept
  const wsGlb = await page.evaluate(async () => { const g = ITEM_GROUPS.windowseat2; for (let i = 0; i < 100 && !g.userData.glbLoaded && !(VIZ.loadErrors || []).some(s => /^windowseat2:/.test(s)); i++) await new Promise(r => setTimeout(r, 100));
    const bb = new THREE.Box3().setFromObject(g), s = new THREE.Vector3(); bb.getSize(s); const mats = new Set(); g.traverse(o => { if (o.isMesh) mats.add(o.material); });
    return { loaded: !!g.userData.glbLoaded, warn: (g.userData.glbWarnings || []).join('|'), size: [s.x, s.y, s.z].map(v => Math.round(v * 100) / 100).join(), slots: [...new Set([...mats].map(m => m.userData.slot))].sort().join(), boxes: PHYS.windowseat2.length }; });
  if (!wsGlb.loaded) problems.push('glb: models/windowseat2.glb не загрузился: ' + JSON.stringify(wsGlb));
  else if (wsGlb.warn || wsGlb.size !== '0.61,0.65,1.7' || wsGlb.slots !== 'cabinetPaint,chrome,fabric' || wsGlb.boxes !== 9) problems.push('glb: windowseat2 — предупреждения/габарит/слоты/proxy не сошлись: ' + JSON.stringify(wsGlb));
  // realism-all stage A: pouf and washer GLB loaded without warnings, proxies as before
  const glbA = await page.evaluate(async () => { const ids = ['pouf', 'washer']; for (let i = 0; i < 100 && !ids.every(id => ITEM_GROUPS[id].userData.glbLoaded || (VIZ.loadErrors || []).some(s => s.startsWith(id + ':'))); i++) await new Promise(r => setTimeout(r, 100));
    return ids.filter(id => !ITEM_GROUPS[id].userData.glbLoaded || (ITEM_GROUPS[id].userData.glbWarnings || []).length || PHYS[id].length !== { pouf: 5, washer: 6 }[id]).map(id => id + ':' + JSON.stringify(ITEM_GROUPS[id].userData.glbWarnings)); });
  if (glbA.length) problems.push('glb: этап A — пуф/стиралка не загрузились чисто: ' + glbA.join(' '));
  // realism-all stage D: proxies for the room 3 items repeat the old mesh AABBs (count + union extent)
  const proxD = await page.evaluate(() => { const ext = id => { const bb = new THREE.Box3(); PHYS[id].forEach(m => bb.union(new THREE.Box3().setFromObject(m))); const s = new THREE.Vector3(); bb.getSize(s); return [s.x, s.y, s.z].map(v => Math.round(v * 1000) / 1000).join(); };
    const want = { mbed: [7, '1.7,1.1,2.2'], mcab: [31, '1.7,0.85,0.365'], mward: [13, '1,2.7,0.59'], mtv: [2, '0.97,0.56,0.04'], mconsole: [5, '1.2,0.18,0.345'], vanity: [5, '1,0.75,0.45'], vmirror: [3, '1.14,0.59,0.025'], vpouf: [5, '0.4,0.45,0.4'], mrug: [1, '2,0.01,2'], mcurtain: [3, '0.06,2.66,3.017'], bra5: [3, '0.12,0.12,0.225'], bra6: [3, '0.12,0.12,0.225'], bra7: [3, '0.12,0.12,0.225'], bra8: [3, '0.12,0.12,0.225'] };
    return Object.entries(want).filter(([id, [n, e]]) => PHYS[id].length !== n || ext(id) !== e || !ITEM_GROUPS[id].userData.proxy.length).map(([id]) => id + ':' + PHYS[id].length + ':' + ext(id)); });
  if (proxD.length) problems.push('proxy: этап D — число боксов/габарит не сошлись: ' + proxD.join(' '));
  // realism-all stage D: detailed room 3 items stay inside size (+1 mm); plates and LED strips carry one proxy box equal to the item
  const fitD = await page.evaluate(() => { const fit = id => { const g = ITEM_GROUPS[id], bb = new THREE.Box3().setFromObject(g), inv = new THREE.Matrix4().copy(g.matrixWorld).invert(); bb.applyMatrix4(inv); const s = g.userData.size; return bb.min.x >= -0.001 && bb.min.y >= -0.001 && bb.min.z >= -0.001 && bb.max.x <= s[0] + 0.001 && bb.max.y <= s[1] + 0.001 && bb.max.z <= s[2] + 0.001; };
    const one = ['sw3', 'sw4', 'sw6', 'sock14', 'sock15', 'sock16', 'sock17', 'sock18', 'sock19', 'sock20', 'led4', 'led5'], ids = ['mcab', 'mward', 'mconsole', 'vanity', 'vmirror', 'mtv', 'mrug', 'mcurtain', 'bra5', 'bra6', 'bra7', 'bra8'].concat(one);
    const bad = ids.filter(id => !fit(id)); one.forEach(id => { if (PHYS[id].length !== 1) bad.push(id + ':phys'); }); return bad; });
  if (fitD.length) problems.push('этап D: детали вне size или proxy розеток/LED не один бокс: ' + fitD.join(' '));
  // realism-all stage E: procedural bath items stay inside size
  const fitE = await page.evaluate(() => ['basin', 'basindrawer', 'basinmixer', 'tubmixer', 'mixer8', 'shower', 'bathmirror', 'towelrail', 'towel8', 'wcbox', 'wcbox8', 'niche8', 'curb8e', 'drain8', 'glass8', 'cove8', 'fan', 'fan8', 'rain8', 'sock21', 'sock22', 'sock24'].filter(id => { const g = ITEM_GROUPS[id], bb = new THREE.Box3().setFromObject(g).applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()), s = g.userData.size; return !(bb.min.x >= -0.001 && bb.min.y >= -0.001 && bb.min.z >= -0.001 && bb.max.x <= s[0] + 0.001 && bb.max.y <= s[1] + 0.001 && bb.max.z <= s[2] + 0.001); }));
  if (fitE.length) problems.push('этап E: детали вне size: ' + fitE.join(' '));
  // realism-all stage E: tub GLB loaded without warnings, its 5 proxy boxes untouched
  const tubE = await page.evaluate(async () => { const g = ITEM_GROUPS.tub; for (let i = 0; i < 100 && !g.userData.glbLoaded && !(VIZ.loadErrors || []).some(s => s.startsWith('tub:')); i++) await new Promise(r => setTimeout(r, 100));
    return { loaded: !!g.userData.glbLoaded, warn: (g.userData.glbWarnings || []).join('|'), boxes: PHYS.tub.length }; });
  if (!tubE.loaded || tubE.warn || tubE.boxes !== 5) problems.push('glb: tub — ' + JSON.stringify(tubE));
  // realism-all stage E: wc and wc8 share one GLB (3 geometries), loaded without warnings, proxies as before
  const wcE = await page.evaluate(async () => { const ids = ['wc', 'wc8']; for (let i = 0; i < 100 && !ids.every(id => ITEM_GROUPS[id].userData.glbLoaded || (VIZ.loadErrors || []).some(s => s.startsWith(id + ':'))); i++) await new Promise(r => setTimeout(r, 100));
    const geos = new Set(); ids.forEach(id => ITEM_GROUPS[id].traverse(o => { if (o.isMesh) geos.add(o.geometry); }));
    return { ok: ids.every(id => ITEM_GROUPS[id].userData.glbLoaded && !(ITEM_GROUPS[id].userData.glbWarnings || []).length && PHYS[id].length === 4), geos: geos.size, warn: ids.map(id => (ITEM_GROUPS[id].userData.glbWarnings || []).join('|')).join(';') }; });
  if (!wcE.ok || wcE.geos !== 3) problems.push('glb: wc/wc8 — загрузка/общая geometry/proxy не сошлись: ' + JSON.stringify(wcE));
  // realism-all stage E: proxies for the bath 8/9 items (old mesh AABBs; towel rails as one union box), fittings on the shared helpers
  const proxE = await page.evaluate((want) => { const ext = id => { const bb = new THREE.Box3(); PHYS[id].forEach(m => bb.union(new THREE.Box3().setFromObject(m))); const s = new THREE.Vector3(); bb.getSize(s); return [s.x, s.y, s.z].map(v => Math.round(v * 1000) / 1000).join(); };
    return Object.entries(want).filter(([id, [n, e]]) => PHYS[id].length !== n || (e && ext(id) !== e) || !ITEM_GROUPS[id].userData.proxy.length).map(([id]) => id + ':' + PHYS[id].length + ':' + ext(id)); }, {"wc": [4, "0.32,0.22,0.48"], "wc8": [4, "0.32,0.22,0.48"], "basin": [6, "0.85,0.15,0.36"], "basindrawer": [2, "0.85,0.18,0.31"], "basinmixer": [3, "0.14,0.09,0.18"], "tubmixer": [3, "0.2,0.11,0.16"], "mixer8": [4, "0.15,0.8,0.09"], "shower": [4, "0.1,0.9,0.06"], "bathmirror": [2, "0.96,1.2,0.02"], "towelrail": [27, "0.07,1.8,0.34"], "towel8": [27, "0.44,1.8,0.06"], "wcbox": [2, "0.71,1.15,0.125"], "wcbox8": [2, "0.774,2.7,0.209"], "niche8": [6, "0.6,0.3,0.1"], "curb8e": [1, "0.05,0.05,1.536"], "shower8": [1, "0.813,0.003,1.536"], "drain8": [1, "0.06,0.002,1.4"], "glass8": [2, "0.01,2.05,0.862"], "cove8": [4, "1.637,0.1,0.562"], "sock21": [1, null], "sock22": [1, null], "sock24": [1, null], "spot1": [1, "0.08,0.02,0.08"], "spot2": [1, "0.08,0.02,0.08"], "spot3": [1, "0.08,0.02,0.08"], "spot4": [1, "0.08,0.02,0.08"], "spot5": [1, "0.08,0.02,0.08"], "spot6": [1, "0.08,0.02,0.08"], "fan": [1, "0.12,0.02,0.12"], "fan8": [1, "0.12,0.02,0.12"], "rain8": [1, "0.25,0.02,0.25"]});
  if (proxE.length) problems.push('proxy: этап E — число боксов/габарит не сошлись: ' + proxE.join(' '));
  // realism-all stage D: mbed and vpouf GLBs replaced the procedural builds — no validation warnings, extent = size, slots, proxies kept
  const glbD = await page.evaluate(async () => { const want = { mbed: ['1.7,1.1,2.2', 'cabinetPaint,fabric,leather', 7], vpouf: ['0.4,0.45,0.4', 'leather,metal', 5] }, bad = [];
    for (const [id, [size, slots, boxes]] of Object.entries(want)) { const g = ITEM_GROUPS[id]; for (let i = 0; i < 100 && !g.userData.glbLoaded && !(VIZ.loadErrors || []).some(s => s.startsWith(id + ':')); i++) await new Promise(r => setTimeout(r, 100));
      const bb = new THREE.Box3().setFromObject(g), s = new THREE.Vector3(); bb.getSize(s); const mats = new Set(); g.traverse(o => { if (o.isMesh) mats.add(o.material); });
      const got = { loaded: !!g.userData.glbLoaded, warn: (g.userData.glbWarnings || []).join('|'), size: [s.x, s.y, s.z].map(v => Math.round(v * 100) / 100).join(), slots: [...new Set([...mats].map(m => m.userData.slot).filter(Boolean))].sort().join(), boxes: PHYS[id].length };
      if (!got.loaded || got.warn || got.size !== size || got.slots !== slots || got.boxes !== boxes) bad.push(id + ' ' + JSON.stringify(got)); } return bad; });
  if (glbD.length) problems.push('glb: этап D — модели не загрузились или предупреждения/габарит/слоты/proxy не сошлись: ' + glbD.join('; '));
  // realism-all stage A: shared helpers — plate/round keep the item inside size with one proxy box; new slots reach VIZ
  const helpers = await page.evaluate(() => { const fit = id => { const g = ITEM_GROUPS[id], bb = new THREE.Box3().setFromObject(g), inv = new THREE.Matrix4().copy(g.matrixWorld).invert(); bb.applyMatrix4(inv); const s = g.userData.size; return bb.min.x >= -0.001 && bb.min.y >= -0.001 && bb.min.z >= -0.001 && bb.max.x <= s[0] + 0.001 && bb.max.y <= s[1] + 0.001 && bb.max.z <= s[2] + 0.001; };
    const n = id => { let k = 0; ITEM_GROUPS[id].traverse(o => { if (o.isMesh) k++; }); return k; };
    return { sw5: fit('sw5') && PHYS.sw5.length === 1 && n('sw5') === 3, sw7: fit('sw7') && PHYS.sw7.length === 1 && n('sw7') === 2, mirror: fit('mirror') && PHYS.mirror.length === 1 && n('mirror') === 2, slots: ['plastic', 'ceramic', 'acrylic', 'leather', 'mirror'].every(k => ITEM_MATS[k].userData.slot === k && MATERIALS[k]) }; });
  Object.entries(helpers).forEach(([k, ok]) => { if (!ok) problems.push('helpers: «' + k + '» вне size, число боксов/мешей или слот не сошлись (realism-all §3/§4)'); });
  // realism-all stage B: kids room 1 — explicit proxies for every item, box count fixed so detailing never changes walk/layout
  const stageB = await page.evaluate(() => { const want = { kidbed: 9, kiddesk: 4, kidped: 4, kidchair: 5, kidshelf: 13, kidshelf2: 8, kidshelf3: 3, windowseat1: 9, kidsofa: 8, kidrug: 1, projector: 3, screen: 2, curtain: 2, kidlight: 1, track: 3, bra1: 3, bra2: 2, sw1: 1, sock1: 1, sock2: 1, sock3: 1, sock4: 1, sock5: 1, sock6: 1, sock7: 1 };
    return Object.entries(want).filter(([id, n]) => PHYS[id].length !== n).map(([id, n]) => id + ' ' + PHYS[id].length + '≠' + n); });
  if (stageB.length) problems.push('proxy: детская 1 — число боксов изменилось (realism-all §8): ' + stageB.join(', '));
  // realism-all stage F: closet 6 and loggia 10 — explicit proxies, box count fixed
  const stageF = await page.evaluate(() => { const want = {wsecA:  4,  wsecB:  3,  wsecC:  21,  wmezz:  6,  wend:  15,  wpeg:  1,  wmirror:  1,  wboard:  2,  wstep:  2,  wlight:  1,  led6:  1,  sock25:  1,  bdesk:  4,  bchair:  6,  itshelf:  6,  bshelf:  12,  cable10:  1,  sock26:  1,  sock27:  1,  sock28:  1,  sock29:  1,  led7:  1,  blight:  1,  sw8:  1,  blinds10:  1};
    return Object.entries(want).filter(([id, n]) => PHYS[id].length !== n).map(([id, n]) => id + ' ' + PHYS[id].length + '≠' + n); });
  if (stageF.length) problems.push('proxy: гардеробная 6 / лоджия 10 — число боксов изменилось (realism-all §12): ' + stageF.join(', '));
  // realism-all stage F: every item of closet 6 and loggia 10 stays inside its size (1 mm procedural, 1 cm GLB), plates carry the plastic slot
  const stageFFit = await page.evaluate(() => { const ids = ITEMS.filter(it => it.layer === 'wardrobe' || it.layer === 'balcony').map(it => it.id);
    const bad = ids.filter(id => { const g = ITEM_GROUPS[id], tol = g.userData.glbLoaded ? 0.011 : 0.0011, bb = new THREE.Box3().setFromObject(g).applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()), s = g.userData.size; return !(bb.min.x >= -tol && bb.min.y >= -tol && bb.min.z >= -tol && bb.max.x <= s[0] + tol && bb.max.y <= s[1] + tol && bb.max.z <= s[2] + tol); });
    const slot = id => { const set = new Set(); ITEM_GROUPS[id].traverse(o => { if (o.isMesh) set.add(o.material.userData.slot || 'furniture'); }); return [...set].sort().join(); };
    return { n: ids.length, bad, sock25: slot('sock25') === 'furniture,plastic' && PHYS.sock25.length === 1, rods: slot('wsecA') === 'cabinetPaint,chrome', mirror: slot('wmirror') === 'metal,mirror', sw8: slot('sw8') === 'furniture,plastic' && PHYS.sw8.length === 1, blinds: slot('blinds10') === 'metal,plastic' }; });
  if (stageFFit.n !== 26 || stageFFit.bad.length) problems.push('гардеробная/лоджия: предметы вне size (realism-all §0): ' + stageFFit.bad.join(', '));
  if (!stageFFit.sock25 || !stageFFit.rods || !stageFFit.mirror || !stageFFit.sw8 || !stageFFit.blinds) problems.push('гардеробная: розетка/штанги/зеркало без нужных слотов (realism-all §12): ' + JSON.stringify(stageFFit));
  // realism-all stage B: every detailed item of room 1 stays inside its size (1 mm procedural, 1 cm GLB), rug corners rounded, plates carry the plastic slot
  const stageBFit = await page.evaluate(() => { const ids = ITEMS.filter(it => it.room === 1 && it.layer === 'kid').map(it => it.id);
    const bad = ids.filter(id => { const g = ITEM_GROUPS[id], tol = g.userData.glbLoaded ? 0.011 : 0.0011, bb = new THREE.Box3().setFromObject(g).applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()), s = g.userData.size; return !(bb.min.x >= -tol && bb.min.y >= -tol && bb.min.z >= -tol && bb.max.x <= s[0] + tol && bb.max.y <= s[1] + tol && bb.max.z <= s[2] + tol); });
    const slot = id => { const set = new Set(); ITEM_GROUPS[id].traverse(o => { if (o.isMesh) set.add(o.material.userData.slot || 'furniture'); }); return [...set].sort().join(); };
    return { n: ids.length, bad, rug: ITEM_GROUPS.kidrug.children[0].geometry.type === 'ExtrudeGeometry', sw1: slot('sw1') === 'furniture,plastic' && PHYS.sw1.length === 1, curtain: slot('curtain') === 'fabric,metal', bed: ITEM_GROUPS.kidbed.children.length > 50 }; });
  if (stageBFit.n !== 26 || stageBFit.bad.length) problems.push('детская 1: предметы вне size (realism-all §0): ' + stageBFit.bad.join(', '));
  if (!stageBFit.rug || !stageBFit.sw1 || !stageBFit.curtain || !stageBFit.bed) problems.push('детская 1: ковёр/выключатель/тюль/кровать не детализированы (realism-all §8): ' + JSON.stringify(stageBFit));
  // realism-all stage B: kidsofa/kidchair/windowseat1 GLBs replaced the procedural builds — no validation warnings, grey materials, proxies untouched
  const stageBGlb = await page.evaluate(async () => { const ids = ['kidsofa', 'kidchair', 'kidchair2', 'windowseat1', 'bchair']; for (let i = 0; i < 100 && !ids.every(id => ITEM_GROUPS[id].userData.glbLoaded || (VIZ.loadErrors || []).some(s => s.startsWith(id + ':'))); i++) await new Promise(r => setTimeout(r, 100));
    return ids.map(id => { const g = ITEM_GROUPS[id], mats = new Set(); g.traverse(o => { if (o.isMesh) mats.add(o.material); }); const s = new THREE.Vector3(); new THREE.Box3().setFromObject(g).getSize(s);
      return { id, loaded: !!g.userData.glbLoaded, warn: (g.userData.glbWarnings || []).join('|'), grey: [...mats].every(m => m.isMeshLambertMaterial && Math.max(m.color.r, m.color.g, m.color.b) - Math.min(m.color.r, m.color.g, m.color.b) <= 0.08), fits: [s.x, s.y, s.z].every((v, i) => v <= g.userData.size[i] + 0.011 && v >= g.userData.size[i] * 0.85), boxes: PHYS[id].length }; }); });
  const chairShared = await page.evaluate(() => { const geos = id => { const set = new Set(); ITEM_GROUPS[id].traverse(o => { if (o.isMesh) set.add(o.geometry); }); return set; }; const a = geos('kidchair'), b = geos('kidchair2'); return a.size > 0 && a.size === b.size && [...a].every(g => b.has(g)); });
  if (!chairShared) problems.push('glb: kidchair и kidchair2 не делят geometry одного файла models/kidchair.glb (realism-all §2)');
  stageBGlb.forEach(r => { if (!r.loaded || r.warn || !r.grey || !r.fits || r.boxes !== { kidsofa: 8, kidchair: 5, kidchair2: 5, windowseat1: 9, bchair: 6 }[r.id]) problems.push('glb: ' + r.id + ' — загрузка/валидация/серый/габарит/proxy не сошлись (realism-all §8): ' + JSON.stringify(r)); });
  // realism-living step 6: six chairs from one GLB — every chair loaded without warnings, one shared geometry per material, back on the table side
  const chairGlb = await page.evaluate(async () => { const ids = [1, 2, 3, 4, 5, 6].map(i => 'chair' + i); for (let i = 0; i < 100 && !ids.every(id => ITEM_GROUPS[id].userData.glbLoaded); i++) await new Promise(r => setTimeout(r, 100));
    const geos = new Set(), sizes = new Set(); let warn = ''; ids.forEach(id => { const g = ITEM_GROUPS[id]; warn += (g.userData.glbWarnings || []).join('|'); g.traverse(o => { if (o.isMesh) geos.add(o.geometry); }); const s = new THREE.Vector3(); new THREE.Box3().setFromObject(g).getSize(s); sizes.add([s.x, s.y, s.z].map(v => Math.round(v * 100) / 100).join()); });
    const fits = [...sizes].every(t => { const [x, y, z] = t.split(',').map(Number); return Math.abs(x - 0.42) <= 0.03 && Math.abs(y - 0.9) <= 0.03 && Math.abs(z - 0.42) <= 0.03; }); // model fills its size within 3 cm
    const backX = id => { const g = ITEM_GROUPS[id], inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), v = new THREE.Vector3(); let sx = 0, n = 0; g.traverse(o => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv); if (v.y > 0.7) { sx += v.x; n++; } } }); return sx / n; };
    return { loaded: ids.every(id => ITEM_GROUPS[id].userData.glbLoaded), warn, geos: geos.size, sizes: [...sizes].join(';'), west: backX('chair1') < 0.1, east: backX('chair4') > 0.32, boxes: PHYS.chair1.length, fits }; });
  if (!chairGlb.loaded || chairGlb.warn || chairGlb.geos !== 2 || !chairGlb.fits || !chairGlb.west || !chairGlb.east || chairGlb.boxes !== 6) problems.push('glb: стулья — загрузка/общая geometry/габарит/сторона спинки/proxy не сошлись: ' + JSON.stringify(chairGlb));
  // realism-living step 4: model validation — warnings for wrong units, offset pivot, floating bottom and a back on the wrong side; none for a correct model
  const glbCheck = await page.evaluate(() => {
    const box = (w, h, d, x, y, z, s = 1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d)); m.position.set(x, y, z); m.scale.setScalar(s); const r = new THREE.Group(); r.add(m); return r; };
    const good = new THREE.Group(); good.add(box(2, 0.42, 0.88, 1, 0.21, 0.44).children[0]); good.add(box(2, 0.43, 0.25, 1, 0.635, 0.755).children[0]); // seat block + back at z=size[2]
    const front = new THREE.Group(); front.add(box(2, 0.42, 0.88, 1, 0.21, 0.44).children[0]); front.add(box(2, 0.43, 0.25, 1, 0.635, 0.125).children[0]);
    const v = (m) => validateItemGlb('sofa', m, ITEM_GROUPS.sofa).join('|');
    return { good: v(good) === '', units: /units/.test(v(box(200, 85, 88, 100, 42.5, 44))), pivot: /outside/.test(v(box(2, 0.85, 0.88, 0, 0.425, 0.44))), floor: /bottom/.test(v(box(2, 0.75, 0.88, 1, 0.475, 0.44))), facade: /facade/.test(v(front)) };
  });
  Object.entries(glbCheck).forEach(([k, ok]) => { if (!ok) problems.push('glb: проверка модели «' + k + '» не сработала (realism-living §9.4)'); });
  if (!glbFallback) problems.push('glb: при ошибке загрузки предмет не остался процедурным или ошибка не записана в VIZ.loadErrors');
  if (!g1.sofaOne || !g1.sofaRot) problems.push('proxy: диван не один бокс или не следует за поворотом (B02)');
  if (!g1.bedFew) problems.push('proxy: кровать-чердак/ванна не используют явные боксы (B02)');
  if (!g1.gltf) problems.push('GLTFLoader.js не подключён (THREE.GLTFLoader)');
  if (!g1.living) problems.push('proxy: стол/стул/диван — число боксов не 6/6/1 или габарит изменился (realism-living §2)');
  if (!g1.hooks) problems.push('поза: метка с привязкой не получила/не сняла конфликт при переносе (B02/B03)');
  if (!g1.slots) problems.push('материалы: слоты предметов не различаются в визуализации (B04)');
  if (!g1.slots2) problems.push('материалы: слоты wood/paint не дошли до стола/стула (realism-living §9.7)');
  if (!g1.table) problems.push('стол: фаска/ножки/рейки/габарит/UV в метрах не сошлись (realism-living §9.7)');
  if (!mk.bind) problems.push('разметка: привязка к краю дивана не сработала');
  if (!mk.wall) problems.push('разметка: описание настенной точки неверно');
  if (!mk.reject) problems.push('разметка: битый импорт не отклонён или стёр метки');
  if (!mk.roundtrip) problems.push('разметка: экспорт→импорт не сохранил ID и привязки');
  // предметы: перенос дивана двигает все его детали на ту же дельту, соседи на месте; поворот стола меняет контур
  const items = await page.evaluate(() => {
    const bbs = id => { const L = []; ITEM_GROUPS[id].traverse(o => { if (o.isMesh) L.push(new THREE.Box3().setFromObject(o)); }); return L; };
    const ids = ITEMS.map(i => i.id), uniq = new Set(ids).size === ids.length;
    const sofa0 = bbs('sofa'), tv0 = bbs('tv').map(b => b.clone());
    const pos0 = ITEM_GROUPS.sofa.userData.pos.slice();
    setItemPose('sofa', [pos0[0] - 0.5, pos0[1] - 0.3]);
    const sofa1 = bbs('sofa');
    const moved = sofa1.every((b, i) => Math.abs(b.min.x - sofa0[i].min.x + 0.5) < 1e-6 && Math.abs(b.min.z - sofa0[i].min.z + 0.3) < 1e-6 && Math.abs(b.min.y - sofa0[i].min.y) < 1e-6);
    const tvSame = bbs('tv').every((b, i) => b.equals(tv0[i]));
    setItemPose('sofa', pos0);
    const c0 = itemCorners('table'); setItemPose('table', null, 90); const c1 = itemCorners('table'); setItemPose('table', null, 0);
    const ext = c => [Math.max(...c.map(p => p[0])) - Math.min(...c.map(p => p[0])), Math.max(...c.map(p => p[1])) - Math.min(...c.map(p => p[1]))];
    const e0 = ext(c0), e1 = ext(c1);
    return { uniq, moved, tvSame, rotated: Math.abs(e0[0] - e1[1]) < 1e-6 && Math.abs(e0[1] - e1[0]) < 1e-6, n: ids.length };
  });
  // T09: варианты расстановки — стулья едут за столом, копия варианта изолирована, предупреждение о пересечении
  const lay = await page.evaluate(() => {
    window.prompt = () => 'проверка';
    const c0 = ITEM_GROUPS.chair1.userData.pos.slice();
    LAY.setPose('table', [ITEM_GROUPS.table.userData.pos[0] + 0.3, ITEM_GROUPS.table.userData.pos[1]], null);
    const follow = Math.abs(ITEM_GROUPS.chair1.userData.pos[0] - c0[0] - 0.3) < 1e-9; LAY.undo(); LAY.variants.splice(LAY.cur, 1); LAY.applyVariant(0); // editing "Base" creates a variant — drop it
    const sofa0 = ITEM_GROUPS.sofa.userData.pos.slice(); const n0 = LAY.variants.length;
    LAY.copyVariant(); const vi = LAY.cur; LAY.setPose('sofa', [8.4, 3.0], null);
    const overlap = LAY.warnings('sofa').some(w => /kitchen/.test(w));
    LAY.applyVariant(0); const orig = ITEM_GROUPS.sofa.userData.pos.join() === sofa0.join();
    LAY.applyVariant(vi); const kept = ITEM_GROUPS.sofa.userData.pos.join() === '8.4,3';
    LAY.variants.splice(vi, 1); LAY.applyVariant(0);
    return { follow, overlap, orig, kept, cleaned: LAY.variants.length === n0 };
  });
  if (!lay.follow) problems.push('расстановка: стулья не поехали за столом');
  if (!lay.overlap) problems.push('расстановка: нет предупреждения о пересечении с кухней');
  if (!lay.orig || !lay.kept) problems.push('расстановка: варианты не изолированы');
  // review 2026-09-05: editing "Base" creates a variant and is saved; card fields in mm; modes are mutually exclusive;
  // "on wall" for a new point and unbinding do not crash; import validates all fields and duplicate IDs
  const rev = await page.evaluate(() => {
    const out = {};
    LAY.applyVariant(0); LAY.setPose('sofa', [10.75, ITEM_GROUPS.sofa.userData.pos[1]], null);
    const d = LAY.dump(); out.fork = !LAY.variants[LAY.cur].locked && d.variants.length === 1 && Math.abs(d.variants[0].poses.sofa.pos[0] - 10.75) < 1e-9;
    LAY.variants.splice(LAY.cur, 1); LAY.applyVariant(0);
    LAY.toggle(true); LAY.select('sofa'); out.mm = Math.abs(parseFloat(document.querySelector('#itCard [data-k=x]').value) - 11.35) < 1e-9;
    LAY.tool = 'move'; MK.toggle(true); out.excl = MK.on && !LAY.on && LAY.tool == null; LAY.toggle(true); out.excl2 = LAY.on && !MK.on; LAY.toggle(false);
    const wm = MK.addPoint([3, 3]);
    try { MK.edit(wm, { wall: { side: 'N', from: 'W', dist: 1, h: 1.2 } }); MK.edit(wm, { bind: null, conflict: null }); MK.undo(); MK.undo(); out.wallEdit = !wm.wall; } catch (e) { out.wallEdit = false; out.err = e.message; }
    MK.marks.slice().forEach(m => MK.remove(m)); MK.addPoint([4, 4]); MK.addPoint([5, 5]);
    const bad = m => !MK.importText(JSON.stringify({ format: 1, plan: PLAN.meta.version, marks: [m] }));
    const pt = { id: 'M99', type: 'point', pts: [[3, 3]], y0: 0, y1: 0, dir: 'S' };
    out.reject = bad({ ...pt, name: 123 }) && bad({ ...pt, wall: { side: 'X' } }) && bad({ ...pt, bind: { item: 5 } }) && MK.marks.length === 2
      && !MK.importText(JSON.stringify({ format: 1, plan: PLAN.meta.version, marks: [pt, pt] })) && MK.marks.length === 2 && MK.importText(JSON.stringify({ format: 1, plan: PLAN.meta.version, marks: [pt] })) && MK.marks[0].name === '';
    MK.marks.slice().forEach(m => MK.remove(m)); MK.toggle(false);
    return out;
  });
  if (!rev.fork) problems.push('расстановка: правка «Исходной» не создала сохраняемый вариант');
  if (!rev.mm) problems.push('расстановка: поле x округлено не до мм');
  if (!rev.excl || !rev.excl2) problems.push('режимы: разметка и расстановка включены одновременно');
  if (!rev.wallEdit) problems.push('разметка: «на стене»/снятие привязки у новой точки: ' + (rev.err || 'история не откатилась'));
  if (!rev.reject) problems.push('разметка: импорт принял битые поля/повтор ID или стёр метки');

  // T12: детали не выходят за согласованный габарит предмета (pos/size) — допуск 3 см (ручки на фасаде)
  const fit = await page.evaluate(() => ITEMS.filter(it => { const u = ITEM_GROUPS[it.id].userData; if (u.rot) return false; const bb = new THREE.Box3().setFromObject(ITEM_GROUPS[it.id]);
    const t = 0.03; return !(bb.min.x >= u.pos[0] - t && bb.max.x <= u.pos[0] + u.size[0] + t && bb.min.z >= u.pos[1] - t && bb.max.z <= u.pos[1] + u.size[2] + t && bb.min.y >= -t && bb.max.y <= u.size[1] + t); }).map(it => it.id));
  if (fit.length) problems.push('предметы вышли за свой габарит: ' + fit.join(', '));

  // L0g: recessed ceiling spots exist with an emitter disc and a proxy each; mlight is gone; the fingerprint moved with the catalogue
  const l0g = await page.evaluate(() => { const ids = ITEMS.filter(it => /^ceil\d+_\d+$/.test(it.id)).map(it => it.id);
    const emit = ids.every(id => { const s = new Set(); ITEM_GROUPS[id].traverse(o => { if (o.isMesh && o.material.userData) s.add(o.material.userData.slot); }); return s.has('emitter') && PHYS[id].length === 1; });
    return { n: ids.length, emit, gone: !ITEM_GROUPS.mlight && !ITEMS.some(it => it.id === 'mlight'), led8: !!ITEM_GROUPS.led8 }; });
  if (l0g.n !== 24 || !l0g.emit || !l0g.gone || !l0g.led8) problems.push('L0g: потолочные точки ' + JSON.stringify(l0g));
  if (!items.uniq) problems.push('предметы: ID не уникальны');
  if (!items.moved) problems.push('предметы: перенос дивана не сдвинул все детали');
  if (!items.tvSame) problems.push('предметы: перенос дивана задел телевизор');
  if (!items.rotated) problems.push('предметы: поворот стола на 90° не поменял контур');

  if (!mk.pt) problems.push('разметка: точка не совпала с координатой клика после зума и сдвига');
  if (!mk.len) problems.push('разметка: длина отрезка неверна');
  if (!mk.txt) problems.push('разметка: текст для агента без поворота/шага/помещения/координат');

  if (!plan.ortho) problems.push('вид сверху не ортографический');
  if (Math.abs(plan.m0 - plan.m25) > 0.5) problems.push(`план: метр на полу ${plan.m0.toFixed(1)}px, на 2.5 м ${plan.m25.toFixed(1)}px`);
  if (plan.moved < 0.05) problems.push('план: перетаскивание не сдвинуло цель');
  if (plan.tilt > 1e-6) problems.push('план: перетаскивание наклонило камеру');

  // прогулка: переход в режим и шаг вперёд стрелкой должны сдвинуть человечка
  await page.click('text=Экскурсия').catch(() => problems.push('нет кнопки «Экскурсия»'));
  await page.waitForTimeout(300);
  const walk = await page.evaluate(async () => {
    if (typeof controls === 'undefined' || !controls.fpv) return { fpv: false, moved: 0 };
    const p0 = controls.pos.clone();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
    await new Promise(r => setTimeout(r, 600));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }));
    return { fpv: true, moved: controls.pos.distanceTo(p0) };
  });
  if (!walk.fpv) problems.push('режим прогулки не включился');
  // T10: мебель — препятствие во всех способах движения, скрытый слой тоже; под кроватью проход свободен;
  // после перестановки препятствия обновляются
  const col = await page.evaluate(async () => {
    const walkTo = async (x, z, theta, ms) => { controls.setFPV(x, z, theta); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' })); await new Promise(r => setTimeout(r, ms)); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' })); return controls.pos.clone(); };
    const sofaN = ITEM_GROUPS.sofa.userData.pos[1];               // северный край дивана
    const a = await walkTo(12.3, 4.6, 0, 1500);                    // на юг к дивану
    const stopped = a.z < sofaN - 0.25 && a.z > sofaN - 0.6;
    controls.setFPV(12.3, 4.6, 0); moveFPV(new THREE.Vector3(0, 0, 3)); const big = controls.pos.z < sofaN - 0.25; // «большой шаг» колесом
    furnGroup.visible = false; const h = await walkTo(12.3, 4.6, 0, 1500); furnGroup.visible = true; const hidden = h.z < sofaN - 0.25;
    const u = await walkTo(4.8, 4.4, Math.PI, 1500);              // под кроватью между ногами на север — до диванчика kidsofa
    const sofaS = ITEM_GROUPS.kidsofa.userData.pos[1] + ITEM_GROUPS.kidsofa.userData.size[2]; const under = u.z > sofaS && u.z < sofaS + 0.6;
    const p0 = ITEM_GROUPS.sofa.userData.pos.slice(); setItemPose('sofa', [8.4, 4.6]); const m = await walkTo(12.3, 4.6, 0, 1500); setItemPose('sofa', p0); const moved = m.z > sofaN;
    return { stopped, big, hidden, under, moved, z: a.z.toFixed(2) };
  });
  if (!col.stopped) problems.push('столкновения: стрелка не остановила перед диваном (z=' + col.z + ')');
  if (!col.big) problems.push('столкновения: большой шаг прошёл сквозь диван');
  if (!col.hidden) problems.push('столкновения: скрытый слой мебели пропускает');
  if (!col.under) problems.push('столкновения: под кроватью нет прохода');
  if (!col.moved) problems.push('столкновения: после переноса дивана препятствие осталось');
  if (await page.evaluate(() => !!camera.isOrthographicCamera)) problems.push('после «Экскурсии» камера осталась ортографической');
  else if (walk.moved < 0.3) problems.push('прогулка: шаг вперёд не сдвинул человечка (' + walk.moved.toFixed(2) + ' м)');
  await page.screenshot({ path: path.join(outDir, 'walk.png') });
  // T11: визуализация — PBR-материалы, тени, масштаб рисунка в метрах, геометрия не меняется; замер кадров в обоих режимах
  const fps = async () => page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else r(Math.round(n / 1.5)); }; requestAnimationFrame(f); }));
  const planJson = await page.evaluate(() => JSON.stringify(PLAN));
  await page.evaluate(() => { controls.setFPV(10.6, 3.9, Math.PI / 2 + 0.25); });
  const fpsPlain = await fps();
  await page.screenshot({ path: path.join(outDir, 'viz-off.png') });
  // the figure can be hidden in the walk without leaving it
  const av = await page.evaluate(() => { const on = () => avatar.visible; const a = on(); document.getElementById('avatarOn').click(); const b = on(); document.getElementById('avatarOn').click(); return [a, b, on(), controls.fpv]; });
  if (av.join() !== 'true,false,true,true') problems.push('галочка «Человечек» не прячет фигуру в экскурсии: ' + av.join());
  await page.click('#mats'); await page.waitForTimeout(800);
  const viz = await page.evaluate((pj) => {
    const floor = finishGroup.children.find(o => o.geometry && o.geometry.type === 'ShapeGeometry');
    let sofa; ITEM_GROUPS.sofa.traverse(o => { if (!sofa && o.isMesh) sofa = o; }); // first mesh, whether procedural or the GLB model
    const lam = floor.material;
    return { std: lam.isMeshStandardMaterial && sofa.material.isMeshStandardMaterial, shadows: renderer.shadowMap.enabled && sun.castShadow && sofa.castShadow,
      maps: !!(lam.roughnessMap && lam.normalMap), scale: Math.abs(lam.map.repeat.x - 1 / MATERIALS.lam.size[0]) < 1e-9 && Math.abs(lam.roughnessMap.repeat.x - lam.map.repeat.x) < 1e-9,
      tone: renderer.toneMapping === THREE.ACESFilmicToneMapping && renderer.outputEncoding === THREE.sRGBEncoding,
      pipe: LIGHTING.lit && renderer.toneMappingExposure === LIGHTING.exposure && !renderer.physicallyCorrectLights && scene.environment === LIGHTING.environment() && !camera.children.some(o => o.isLight) && sun.target.parent === scene, // M0: one fixed pipeline, fixed neutral light, nothing follows the camera
      geom: JSON.stringify(PLAN) === pj && Math.abs(ITEM_GROUPS.sofa.userData.pos[0] - 11.35) < 1e-9 };
  }, planJson);
  const fpsViz = await fps();
  // review 2026-09-05: wall slider drives the PBR twins and does not hide the balcony threshold; ceiling returns after plan
  const wop = await page.evaluate(() => {
    const set = v => { const s = document.getElementById('wop'); s.value = v; s.dispatchEvent(new Event('input')); };
    set(50); const half = Math.abs(VIZ.std.get(wallMat).opacity - 0.5) < 1e-9 && Math.abs(VIZ.std.get(finishMats.wp).opacity - 0.5) < 1e-9;
    set(0); const floorKept = finishMats.woodFloor.opacity === 1 && VIZ.std.get(finishMats.woodFloor).opacity === 1 && finishMats.wood.opacity === 0; set(100);
    const cb = document.getElementById('ceil'); cb.checked = true; cb.dispatchEvent(new Event('change'));
    const c0 = ceilGroup.visible; setView('top'); const c1 = ceilGroup.visible; controls.setFPV(10.6, 3.9, Math.PI / 2 + 0.25); const c2 = ceilGroup.visible; cb.checked = false; cb.dispatchEvent(new Event('change'));
    return { half, floorKept, ceil: c0 && !c1 && c2 };
  });
  if (!wop.half) problems.push('визуализация: PBR-стены не следуют ползунку прозрачности');
  if (!wop.floorKept) problems.push('стены 0%: порог балкона исчез');
  if (!wop.ceil) problems.push('потолок не восстановился после режима плана');
  await page.screenshot({ path: path.join(outDir, 'viz-on.png') });
  // materials-lighting M0: materials × light are independent; every 3D combination is lit, plan stays flat, glass keeps its transparency
  const combos = await page.evaluate(() => {
    const wall = () => wallGroup.children[0].material, floor = () => finishGroup.children.find(o => o.geometry && o.geometry.type === 'ShapeGeometry').material, glass = () => { let g; glassGroup.traverse(o => { if (!g && o.isMesh && o.material.transparent) g = o; }); return g; }, gm0 = glass().material, out = {};
    setView('door'); const ceilM = () => ceilGroup.children[0].material;
    for (const mats of [true, false]) for (const scheme of ['neutral', 'lamps']) { VIZ.set(mats); LIGHTING.set(scheme); const w = wall();
      out[(mats ? 'real' : 'neutral') + '-' + scheme] = w.isMeshStandardMaterial && floor().isMeshStandardMaterial && (mats ? !!floor().map : !floor().map) && ceilM().isMeshStandardMaterial && renderer.shadowMap.enabled && renderer.outputEncoding === THREE.sRGBEncoding && (scheme === 'lamps' ? sun.intensity === 0 : sun.intensity > 0) && glass().material.transparent && glass().material.opacity === gm0.opacity && VIZ.active === mats && LIGHTING.scheme === scheme; }
    setView('top'); out.plan = wall().isMeshBasicMaterial && !renderer.shadowMap.enabled && VIZ.on === false && LIGHTING.scheme === 'lamps'; // prefs survive the plan
    setView('door'); out.back = VIZ.mode === 'neutral' && sun.intensity === 0; VIZ.set(true); return out; });
  Object.entries(combos).forEach(([k, ok]) => { if (!ok) problems.push('материалы × свет: комбинация «' + k + '» не сошлась (materials-lighting M0 §3)'); });
  // materials-lighting M0: whatever the load order (GLBs finish after the controls were toggled), every mesh of every swapped group carries the twin of the current mode
  const twinsOk = await page.evaluate(() => { const groups = [finishGroup, tileGroup, boardGroup, wallGroup, wallGroupR, facadeGroup, ceilGroup, ...Object.values(ITEM_GROUPS)], bad = [], glb = Object.values(ITEM_GROUPS).filter(g => g.userData.glbLoaded).length;
    const pass = (mode) => groups.forEach(g => g.traverse(o => { if (!o.isMesh) return; const b = VIZ.basic.get(o.material) || o.material, want = mode === 'std' ? VIZ.std.get(b) : mode === 'neutral' ? VIZ.neutral.get(b) : b; if (o.material !== want && !(mode === 'std' && o.material.userData.coating && VIZ.basic.get(o.material) === b)) bad.push(mode + ':' + (g.userData.id || g.name || '?') + ':' + o.material.type); }));
    setView('door'); VIZ.set(true); pass('std'); VIZ.set(false); pass('neutral'); setView('top'); pass('basic'); VIZ.set(true); setView('door'); pass('std'); setView('top'); // leaves materials on for the reload check below
    return { bad: bad.slice(0, 8), n: bad.length, glb }; });
  if (twinsOk.n || twinsOk.glb < 15) problems.push('материалы: меши не в материале текущего режима (' + twinsOk.n + ', GLB ' + twinsOk.glb + '): ' + twinsOk.bad.join(' '));
  // materials-lighting M1a: coatings — every preset names a known class and existing local files; presets are not assigned by default
  const coatSpec = await page.evaluate(() => Object.entries(COATINGS).map(([k, s]) => [k, s.class in MATERIALS, s.dir, s.maps || ['color', 'normal', 'rough']]));
  coatSpec.forEach(([k, cls, dir, maps]) => { if (!cls) problems.push('покрытия: ' + k + ' ссылается на неизвестный класс'); maps.forEach(f => { if (!fs.existsSync(path.join(root, dir, f + '.jpg'))) problems.push('покрытия: ' + k + ' — нет файла ' + dir + '/' + f + '.jpg'); }); });
  // M1a: a coating on one item does not touch its neighbour sharing the concept material; equal coatings share one twin; unknown coating and missing file fall back with a note; finishes and the wall slider follow
  const coat = await page.evaluate(async () => {
    const wait = async f => { for (let i = 0; i < 100 && !f(); i++) await new Promise(r => setTimeout(r, 100)); return !!f(); };
    await wait(() => ['kidchair', 'kidchair2', 'sock1'].every(id => ITEM_GROUPS[id].userData.glbLoaded)); // chairs without a default coating (room 4 chairs carry one since M2)
    setView('door'); VIZ.set(true); LIGHTING.set('neutral');
    const mesh = id => { let m; ITEM_GROUPS[id].traverse(o => { if (!m && o.isMesh && (VIZ.basic.get(o.material) || o.material) === ITEM_MATS.plastic) m = o; }); return m; };
    const a = mesh('kidchair'), b = mesh('kidchair2'), b0 = b.material, std = VIZ.std.get(ITEM_MATS.plastic), out = {}, ready = m => !!(m.map && m.map.image && m.map.image.width > 0);
    VIZ.coat('kidchair', 'plastic', 'oakFurniture'); out.loaded = await wait(() => ready(a.material));
    out.own = a.material !== std && a.material.userData.coating === 'oakFurniture' && VIZ.basic.get(a.material) === ITEM_MATS.plastic; out.neighbour = b.material === b0; // b0: the twin the item wears by its own coat (M4-1 gives the chairs `plastic`)
    out.maps = out.loaded && !!(a.material.normalMap && a.material.roughnessMap) && a.material.roughness === 1 && a.material.map.encoding === THREE.sRGBEncoding && a.material.normalMap.encoding === THREE.LinearEncoding && Math.abs(a.material.color.r - (COATINGS.oakFurniture.tint || [1])[0]) < 1e-6; // albedo map: colour is the tint scale, never the concept grey
    out.repeat = out.loaded && Math.abs(a.material.map.repeat.x - 1 / 1.83) < 1e-9 && Math.abs(a.material.map.rotation - (COATINGS.oakFurniture.rotation || 0) * Math.PI / 180) < 1e-9;
    VIZ.coat('kidchair2', 'plastic', 'oakFurniture'); out.shared = b.material === a.material; VIZ.coat('kidchair2', 'plastic', null); out.back = b.material === std;
    VIZ.coat('kidchair2', 'plastic', 'nosuch'); out.unknown = mesh('kidchair2').material === std && VIZ.loadErrors.includes('coating: nosuch'); VIZ.coat('kidchair2', 'plastic', null);
    COATINGS.brokenTest = { class: 'wood', dir: 'textures/absent', size: [1, 1] }; const n0 = ITEM_GROUPS.sock1.children.length; VIZ.coat('sock1', 'plastic', 'brokenTest'); const m4 = mesh('sock1').material;
    out.broken = await wait(() => VIZ.loadErrors.some(s => /textures\/absent\/color/.test(s))) && m4.isMeshStandardMaterial && !m4.map && !m4.normalMap && ITEM_GROUPS.sock1.children.length === n0 && mesh('sock1').material === m4; VIZ.coat('sock1', 'plastic', null); delete COATINGS.brokenTest;
    const prevBoard = VIZ.finishCoat.board; VIZ.coatFinish('board', 'oakFloor'); let bm; boardGroup.traverse(o => { if (!bm && o.isMesh) bm = o.material; }); out.finish = !!bm && bm.userData.coating === 'oakFloor' && await wait(() => ready(bm));
    VIZ.coatFinish('wall', 'wallPaint'); const set = v => { const sl = document.getElementById('wop'); sl.value = v; sl.dispatchEvent(new Event('input')); }; set(50); const wv = VIZ.variants.get(wallMat).get('wallPaint');
    out.fade = Math.abs(wv.opacity - 0.5) < 1e-9 && wv.color.getHex() !== 0xffffff && !wv.map && !!wv.normalMap; set(100); VIZ.coatFinish('wall', null); VIZ.coatFinish('board', prevBoard);
    out.neutral = (VIZ.set(false), a.material === VIZ.neutral.get(ITEM_MATS.plastic)); VIZ.set(true); // coating never leaks into the neutral mode
    const cycle = () => { for (let i = 0; i < 3; i++) { VIZ.coat('kidchair', 'plastic', 'oakFurniture'); VIZ.set(false); VIZ.set(true); VIZ.coat('kidchair', 'plastic', null); VIZ.coatFinish('board', 'oakFloor'); VIZ.coatFinish('board', null); VIZ.coatFinish('board', prevBoard); renderer.render(scene, camera); } };
    const mem = () => JSON.stringify(renderer.info.memory) + '|' + VIZ.textures.size + '|' + [...VIZ.variants.values()].reduce((n, m) => n + m.size, 0);
    cycle(); const m1 = mem(); cycle(); out.stable = mem() === m1; out.mem = m1; LIGHTING.set('lamps'); return out; }); // lamps: the reload check below expects it
  Object.entries(coat).forEach(([k, ok]) => { if (k !== 'mem' && !ok) problems.push('покрытия: «' + k + '» не сошлось (materials-lighting M1a): ' + coat.mem); });
  // materials-lighting M2: room 4 reference — every listed surface wears its coating, neighbours in other rooms sharing the concept material do not; three fixed views on/off
  const m2 = await page.evaluate(async () => {
    setView('door'); VIZ.set(true); LIGHTING.set('neutral'); const wait = async f => { for (let i = 0; i < 100 && !f(); i++) await new Promise(r => setTimeout(r, 100)); return !!f(); };
    const on = (id, test) => { const set = new Set(); ITEM_GROUPS[id].traverse(o => { if (o.isMesh && test(o)) set.add(o.material.userData.coating || 'class'); }); return [...set].sort().join(); };
    const key = k => o => (VIZ.basic.get(o.material) || o.material) === ITEM_MATS[k], glb = n => o => o.userData.glbMat === n;
    const out = { fronts: on('kitchen', key('base')) === 'cabinetPaint' && on('kitchen', key('upper')) === 'cabinetPaint' && on('console', key('base')) === 'cabinetPaint',
      stone: on('kitchen', key('top')) === 'stoneCounter' && on('kitchen', key('wpanel')) === 'stoneSplash', carcass: on('kitchen', key('hdark')) === 'class' && on('kitchen', key('handle')) === 'class',
      oak: on('table', key('table')) === 'oakFurniture' && ['chair1', 'chair6'].every(id => on(id, glb('paint')) === 'oakFurniture'), pads: on('chair1', glb('cushion')) === 'sofaWeave',
      sofa: ['upholstery', 'piping', 'cushion'].every(n => on('sofa', glb(n)) === 'sofaWeave'), lamp: on('lamp', key('plastic')) === 'plastic',
      other: ITEMS.filter(it => !it.coat && ITEM_GROUPS[it.id]).every(it => on(it.id, () => true) === 'class') }; // items without a coat of their own share concept materials with room 4 but stay class twins
    let bm, tm, pm; boardGroup.traverse(o => { if (!bm && o.isMesh) bm = o.material; }); tileGroup.traverse(o => { if (!tm && o.isMesh && (VIZ.basic.get(o.material) || o.material) === finishMats.tile) tm = o.material; }); [finishGroup, wallGroup, wallGroupR].forEach(g => g.traverse(o => { if (!pm && o.isMesh && (VIZ.basic.get(o.material) || o.material) === finishMats.wallPaint) pm = o.material; }));
    out.finishBoard = bm.userData.coating === 'oakFloor'; out.finishTile = !!tm && tm.userData.coating === 'tile60120' && tm.roughness === 0.35 && !tm.roughnessMap; out.finishWall = !!pm && pm.userData.coating === 'wallPaint' && !pm.roughnessMap && !!pm.normalMap;
    out.loaded = await wait(() => [bm, tm].every(m => m.map && m.map.image && m.map.image.width > 0));
    let sp; ITEM_GROUPS.kitchen.traverse(o => { if (!sp && o.isMesh && (VIZ.basic.get(o.material) || o.material) === ITEM_MATS.wpanel) sp = o; }); const sb = new THREE.Box3().setFromObject(sp); out.splash = sb.max.x - ITEM_GROUPS.kitchen.userData.pos[0] > 0.019; // proud of the 15 mm wall finish
    return out; });
  Object.entries(m2).forEach(([k, ok]) => { if (!ok) problems.push('кухня 4: «' + k + '» не сошлось (materials-lighting M2, kitchen.md)'); });
  await page.evaluate(() => { document.getElementById('avatarOn').checked = false; document.getElementById('avatarOn').dispatchEvent(new Event('change')); document.getElementById('ceil').checked = true; document.getElementById('ceil').dispatchEvent(new Event('change')); });
  for (const [k, v] of Object.entries({ A: [12.6, 1.6, 5.6, 8.6, 1.2, 2.6], B: [9.8, 1.5, 3.0, 12.6, 0.8, 6.0], C: [11.0, 1.4, 3.0, 8.6, 0.95, 3.4] })) for (const on of [true, false]) {
    await page.evaluate(([v, on]) => { VIZ.set(on); controls.setPose(...v); }, [v, on]); await page.waitForTimeout(on ? 1500 : 400); await page.screenshot({ path: path.join(outDir, 'm2-' + k + (on ? '-on' : '-off') + '.png') }); }
  // materials-lighting M4-1: rooms 1 and 2 — casework painted, bedding linen, chair pads and the kids sofa in the sofa weave, rug pile, tulle linen, gym wall oak, plastic on lamps/sockets; metal, LED and chrome stay class
  const m41 = await page.evaluate(async () => {
    ['kidchair', 'kidchair2', 'sock1'].forEach(id => { ITEM_GROUPS[id].userData.coat = null; }); VIZ.set(false); VIZ.set(true); LIGHTING.set('neutral'); const wait = async f => { for (let i = 0; i < 100 && !f(); i++) await new Promise(r => setTimeout(r, 100)); return !!f(); }; // drop the M1a overrides, back to the ITEMS coats
    const loaded = await wait(() => ['kidchair', 'kidchair2', 'windowseat1', 'windowseat2', 'kidsofa'].every(id => ITEM_GROUPS[id].userData.glbLoaded));
    const on = (id, test) => { const set = new Set(); ITEM_GROUPS[id].traverse(o => { if (o.isMesh && test(o)) set.add(o.material.userData.coating || 'class'); }); return [...set].sort().join(); };
    const key = k => o => (VIZ.basic.get(o.material) || o.material) === ITEM_MATS[k], glb = n => o => o.userData.glbMat === n, cab = o => ['kbody', 'body', 'wdoor', 'wpanel'].some(k => key(k)(o));
    let tulle; ITEM_GROUPS.curtain.traverse(o => { if (!tulle && o.isMesh && (VIZ.basic.get(o.material) || o.material) === ITEM_MATS.tulle) tulle = o.material; });
    return { loaded,
      casework: ['kidbed', 'kiddesk', 'kidped', 'kidshelf', 'kidbed2', 'tower2n', 'deskshelf2'].every(id => on(id, cab) === 'cabinetPaint') && on('windowseat1', glb('wdoor')) === 'cabinetPaint' && on('windowseat2', glb('paint')) === 'cabinetPaint',
      bedding: ['kmat', 'pillow', 'cushion'].every(k => on('kidbed', key(k)) === 'curtainLinen') && on('kidbed2', key('kmat')) === 'curtainLinen' && on('windowseat2', glb('kmat')) === 'curtainLinen' && on('windowseat1', glb('pillow')) === 'curtainLinen',
      chairs: ['kidchair', 'kidchair2'].every(id => on(id, glb('cushion')) === 'sofaWeave' && on(id, glb('plastic')) === 'plastic' && on(id, glb('chrome')) === 'class'),
      sofa: ['upholstery', 'piping', 'cushion'].every(n => on('kidsofa', glb(n)) === 'sofaWeave'), rug: on('kidrug', key('wpanel')) === 'rugPile',
      tulle: on('curtain', key('tulle')) === 'curtainLinen' && !!tulle && tulle.transparent && tulle.opacity < 0.5, gym: on('gymwall', key('table')) === 'oakFurniture' && on('gymwall', key('frame')) === 'class',
      plastic: ['bra1', 'kidlight2', 'sock1', 'sock9'].every(id => on(id, key('plastic')) === 'plastic') && on('bra1', key('led')) === 'class' && on('kidbed', key('kleg')) === 'class' };
  });
  Object.entries(m41).forEach(([k, ok]) => { if (!ok) problems.push('комнаты 1–2: «' + k + '» не сошлось (materials-lighting M4-1)'); });
  for (const [name, x, z, th] of [['room1-door', 4.5, 4.55, -Math.PI / 2 + 0.45], ['room1-gallery', 1.9, 3.0, Math.PI * 0.3], ['room1-bed', 4.95, 3.3, -Math.PI / 2 - 0.15], ['room2-door', 11.9, 7.35, Math.PI / 2 + 0.15], ['room2-desk', 12.0, 8.8, Math.PI * 0.75], ['room2-gym', 14.0, 8.1, -Math.PI * 0.75]]) for (const on of [true, false]) {
    await page.evaluate(([x, z, th, on]) => { VIZ.set(on); controls.setFPV(x, z, th); }, [x, z, th, on]); await page.waitForTimeout(on ? 1500 : 400); await page.screenshot({ path: path.join(outDir, 'm4-1-' + name + (on ? '-on' : '-off') + '.png') }); }
  await page.evaluate(() => { document.getElementById('avatarOn').checked = true; document.getElementById('avatarOn').dispatchEvent(new Event('change')); document.getElementById('ceil').checked = false; document.getElementById('ceil').dispatchEvent(new Event('change')); VIZ.set(true); LIGHTING.set('lamps'); setView('top'); });
  await page.reload(); await page.waitForTimeout(2500);
  const vizKept = await page.evaluate(() => { const ok = VIZ.on && document.getElementById('mats').checked && LIGHTING.scheme === 'lamps' && document.getElementById('light').value === 'lamps'; VIZ.set(false); LIGHTING.set('neutral'); return ok; });
  if (!viz.std) problems.push('визуализация: материалы не PBR');
  // materials-lighting M3: every mirror-slot glass sits in front of its finish (mirrors.md), the mirror twin carries its own env map
  // (not scene.environment), the map is prefiltered once whatever the toggles, its intensity follows the light scheme, bathmirror halo is its own emitter
  const mir = await page.evaluate(() => {
    const box = (id, pick) => { const g = ITEM_GROUPS[id], b = new THREE.Box3(); g.updateMatrixWorld(true); g.traverse(o => { if (o.isMesh && pick(o)) b.expandByObject(o); }); return b; };
    const isM = o => o.material.userData.slot === 'mirror', near = (a, b) => Math.abs(a - b) < 2e-3;
    const ids = []; Object.values(ITEM_GROUPS).forEach(g => g.traverse(o => { if (o.isMesh && isM(o) && !ids.includes(g.userData.id)) ids.push(g.userData.id); }));
    const gm = box('mirror', isM), gv = box('vmirror', isM), gb = box('bathmirror', isM), gw = box('wmirror', isM), hb = box('bathmirror', o => o.material === ITEM_MATS.mirrorLed), vb = box('vmirror', o => !isM(o));
    const geom = { mirror: near(gm.min.x, 6.366) && near(gm.max.x, 6.371), vmirror: near(gv.max.z, 9.823) && near(gv.min.z, 9.818) && near(vb.min.z, 9.797), bathmirror: near(gb.min.z, 8.195) && near(gb.max.z, 8.205) && near(hb.min.z, 8.185),
      wmirror: near(gw.min.x, 6.845) && near(gw.max.x, 6.849), halo: ITEM_MATS.mirrorLed.userData.slot === 'emitter' && ITEM_MATS.led !== ITEM_MATS.mirrorLed };
    let haloElsewhere = 0; Object.values(ITEM_GROUPS).forEach(g => { if (g.userData.id !== 'bathmirror') g.traverse(o => { if (o.isMesh && o.material === ITEM_MATS.mirrorLed) haloElsewhere++; }); });
    setView('door'); VIZ.set(true); const std = VIZ.std.get(ITEM_MATS.mirror), neu = VIZ.neutral.get(ITEM_MATS.mirror), halo = VIZ.std.get(ITEM_MATS.mirrorLed);
    const env = { own: !!std.envMap && std.envMap === VIZ.mirrorEnv() && std.envMap !== scene.environment && std.envMap !== LIGHTING.environment(), pbr: std.metalness === 1 && std.roughness >= 0.04 && std.roughness <= 0.10,
      neutral: !neu.envMap && neu.metalness === 0, halo: halo.emissive.getHex() !== 0 };
    const i0 = std.envMapIntensity; LIGHTING.set('lamps'); const i1 = std.envMapIntensity; env.dims = i1 < i0 && i0 === 1;
    VIZ.set(false); VIZ.set(true); setView('top'); setView('door'); LIGHTING.set('neutral'); const builds = VIZ.mirrorEnvBuilds();
    VIZ.set(false); setView('top'); return { ids: ids.sort(), geom, haloElsewhere, env, builds };
  });
  if (mir.ids.join() !== 'bathmirror,mirror,vmirror,wmirror') problems.push('зеркала: слот mirror у ' + mir.ids.join(',') + ' (mirrors.md: bathmirror, mirror, vmirror, wmirror)');
  Object.entries(mir.geom).forEach(([k, ok]) => { if (!ok) problems.push('зеркала: ' + k + ' — стекло/подложка не по mirrors.md (materials-lighting M3)'); });
  if (mir.haloElsewhere) problems.push('зеркала: mirrorLed используется вне bathmirror (' + mir.haloElsewhere + ')');
  Object.entries(mir.env).forEach(([k, ok]) => { if (!ok) problems.push('зеркала: env-карта — ' + k + ' (materials-lighting M3 §5)'); });
  if (mir.builds !== 1) problems.push('зеркала: PMREM зеркала собрана ' + mir.builds + ' раз (нужно 1)');
  for (const [name, x, z, tx, tz] of [['m3-bath9-front', 9.3, 9.45, 9.27, 8.2], ['m3-bath9-tub', 8.45, 9.4, 9.27, 8.2], ['m3-bath9-side', 9.75, 8.4, 8.9, 8.2], ['m3-hall5-door', 7.3, 7.4, 6.37, 6.5], ['m3-hall5-north', 6.62, 5.3, 6.37, 6.6], ['m3-hall5-south', 6.62, 7.7, 6.37, 6.3]]) {
    await page.evaluate(([x, z, tx, tz]) => { VIZ.set(true); document.getElementById('avatarOn').checked = false; controls.setFPV(x, z, Math.atan2(tx - x, tz - z)); }, [x, z, tx, tz]); await page.waitForTimeout(300); // figure hidden: it stands in front of the glass
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  }
  await page.evaluate(() => { document.getElementById('avatarOn').checked = true; VIZ.set(false); setView('top'); });
  // materials-lighting L1: apartment lamps — catalogue sources live in their item groups and follow the pose, one group = intensity + emissive
  // of its own diffusers only, sun off in the lamps scheme, environment per scheme, a wall blocks light while a doorway lets it through
  const l1 = await page.evaluate(() => {
    setView('door'); VIZ.set(true); LIGHTING.set('lamps'); const out = {}, L = LIGHTING.lights, by = n => L.find(l => l.name === n);
    out.catalogue = L.length === LIGHTS.length && LIGHTS.every(s => by(s.id) && by(s.id).parent === ITEM_GROUPS[s.item]) && L.every(l => !l.isSpotLight || l.target.parent === l.parent);
    out.on = L.every(l => l.intensity > 0) && sun.intensity === 0 && !sun.castShadow && L.filter(l => l.castShadow).length === 3;
    out.env = scene.environment === LIGHTING.environment('lamps') && LIGHTING.environment('neutral') !== LIGHTING.environment('lamps');
    const w = o => { scene.updateMatrixWorld(true); return o.getWorldPosition(new THREE.Vector3()); };
    const s3 = by('spot3'), p0 = w(s3), t0 = w(s3.target), pose = ITEM_GROUPS.spot3.userData.pos.slice();
    setItemPose('spot3', [pose[0] + 0.3, pose[1]]); const p1 = w(s3), t1 = w(s3.target); setItemPose('spot3', pose);
    out.pose = Math.abs(p1.x - p0.x - 0.3) < 1e-6 && Math.abs(t1.x - t0.x - 0.3) < 1e-6 && Math.abs(p1.z - p0.z) < 1e-6 && Math.abs(w(s3).x - p0.x) < 1e-6;
    const led = g => LIGHTING.emitters(g).map(b => VIZ.std.get(b));
    LIGHTING.group('g4.sofa', false);
    out.group = by('ceil4_8').intensity === 0 && !by('ceil4_8').castShadow && by('ceil4_9').intensity === 0 && by('ceil4_7').intensity > 0 && led('g4.sofa').length > 0 && led('g4.sofa').every(m => m.emissiveIntensity === 0) && led('g4.main').every(m => m.emissiveIntensity === 1) && !led('g4.sofa').some(m => led('g4.main').includes(m));
    out.ledSplit = !LIGHTING.emitters('g4.main').includes(ITEM_MATS.led) && LIGHTING.emitters('g9.mirror').includes(ITEM_MATS.mirrorLed);
    LIGHTING.group('g4.sofa', true); out.back = by('ceil4_8').intensity > 0 && by('ceil4_8').castShadow && led('g4.sofa').every(m => m.emissiveIntensity === 1);
    LIGHTING.set('neutral'); out.neutral = L.every(l => l.intensity === 0 && !l.castShadow) && sun.castShadow && led('g4.sofa').every(m => m.emissiveIntensity === 1); LIGHTING.set('lamps');
    // control spot in bath 9 pointing east at the door: the probe behind the wall (z 8.2) stays dark, the probe in the doorway (z 8.9) is lit
    Object.keys(LIGHTING.groups).forEach(g => LIGHTING.group(g, false));
    const ctl = new THREE.SpotLight(0xffffff, 3, 4, 0.9, 0.2); ctl.position.set(9.5, 1.5, 8.9); ctl.target.position.set(10.5, 1.2, 8.9); ctl.castShadow = true; ctl.shadow.mapSize.set(1024, 1024); ctl.shadow.camera.near = 0.15; ctl.shadow.camera.far = 4; scene.add(ctl); scene.add(ctl.target);
    const rt = new THREE.WebGLRenderTarget(4, 4), cam = new THREE.PerspectiveCamera(10, 1, 0.05, 5), px = new Uint8Array(4 * 4 * 4);
    const probe = z => { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })); p.position.set(10.3, 1.2, z); p.rotation.y = -Math.PI / 2; p.receiveShadow = true; scene.add(p); // faces west, towards the light; the camera looks at it from the west too
      cam.position.set(10.05, 1.2, z); cam.lookAt(10.3, 1.2, z); renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, 4, 4, px); renderer.setRenderTarget(null); scene.remove(p); p.geometry.dispose(); p.material.dispose();
      let s = 0; for (let i = 0; i < 16; i++) s += px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]; return s / (16 * 3 * 255); };
    const lit = probe(8.9), dark = probe(8.2); scene.remove(ctl); scene.remove(ctl.target); ctl.dispose(); rt.dispose();
    Object.keys(LIGHTING.groups).forEach(g => LIGHTING.group(g, true));
    out.wall = { lit: +lit.toFixed(3), dark: +dark.toFixed(3), ok: lit > 0.25 && lit > 3 * dark };
    LIGHTING.set('neutral'); VIZ.set(false); setView('top'); return out;
  });
  ['catalogue', 'on', 'env', 'pose', 'group', 'ledSplit', 'back', 'neutral'].forEach(k => { if (!l1[k]) problems.push('свет: ' + k + ' — не по materials-lighting L1 (§6, lighting.js)'); });
  if (!l1.wall.ok) problems.push('свет: стена не перекрывает источник (за стеной ' + l1.wall.dark + ', в проёме ' + l1.wall.lit + ')');
  // L1 frames: kitchen from the door, from the work zone to the sofa, the work zone itself, the evening scene (only table + sofa), bath 9 in front of the mirror
  for (const [name, x, z, tx, tz, off] of [['l1-kitchen-door', 12.6, 5.6, 8.6, 2.6], ['l1-kitchen-sofa', 9.0, 3.0, 12.5, 5.8], ['l1-kitchen-work', 10.8, 4.9, 8.6, 3.3], ['l1-kitchen-evening', 12.6, 5.6, 8.6, 2.6, 'g4.work,g4.splash,g4.main'], ['l1-bath9-front', 9.3, 9.45, 9.27, 8.2]]) {
    await page.evaluate(([x, z, tx, tz, off]) => { VIZ.set(true); LIGHTING.set('lamps'); document.getElementById('avatarOn').checked = false; const cb = document.getElementById('ceil'); cb.checked = true; cb.dispatchEvent(new Event('change'));
      Object.keys(LIGHTING.groups).forEach(g => LIGHTING.group(g, !(off || '').split(',').includes(g))); controls.setFPV(x, z, Math.atan2(tx - x, tz - z)); }, [x, z, tx, tz, off]); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  }
  await page.evaluate(() => { document.getElementById('avatarOn').checked = true; const cb = document.getElementById('ceil'); cb.checked = false; cb.dispatchEvent(new Event('change')); LIGHTING.set('neutral'); VIZ.set(false); setView('top'); });
  if (!viz.shadows) problems.push('визуализация: тени не включены');
  if (!viz.maps || !viz.scale) problems.push('визуализация: карты шероховатости/рельефа отсутствуют или масштаб не совпадает');
  if (!viz.tone) problems.push('визуализация: tone mapping / sRGB не включены');
  if (!viz.pipe) problems.push('свет: пайплайн/нейтральная схема не зафиксированы (materials-lighting M0, lighting.js)');
  if (!viz.geom) problems.push('визуализация: изменилась геометрия или позы');
  if (!vizKept) problems.push('визуализация: режим не восстановился после перезагрузки');
  // T12: сквозной сценарий — метка → текст для агента → размещение предмета по числам из текста → вариант → перезагрузка → прогулка
  await page.click('#vTop'); await page.waitForTimeout(300);
  const scen = await page.evaluate(() => {
    window.prompt = () => 'по метке';
    const m = MK.addRect([12.2, 2.6], 2.0, 0.88, 0); MK.edit(m, { name: 'место под диван', y1: 0.85 });
    const text = MK.describe(m);
    const mx = /x=([\d.]+), z=([\d.]+)/.exec(text), mr = /поворот (\d+)°/.exec(text); // так же читает агент
    LAY.copyVariant(); LAY.setPose('sofa', [parseFloat(mx[1]), parseFloat(mx[2])], parseInt(mr[1]));
    const u = ITEM_GROUPS.sofa.userData;
    return { placed: Math.abs(u.pos[0] - 12.2) < 1e-9 && Math.abs(u.pos[1] - 2.6) < 1e-9 && u.rot === 0, variant: LAY.variants[LAY.cur].name, warn: LAY.warnings('sofa') };
  });
  await page.reload(); await page.waitForTimeout(2500);
  const scen2 = await page.evaluate(async () => {
    const u = ITEM_GROUPS.sofa.userData; const kept = LAY.variants[LAY.cur].name === 'по метке' && Math.abs(u.pos[1] - 2.6) < 1e-9 && MK.marks.some(k => k.name === 'место под диван');
    controls.setFPV(13.0, 4.4, Math.PI); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' })); await new Promise(r => setTimeout(r, 1500)); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }));
    const stopped = controls.pos.z > 2.6 + 0.88 + 0.25 && controls.pos.z < 2.6 + 0.88 + 0.7; // уперся в южный край дивана на новом месте
    LAY.variants.splice(LAY.cur, 1); LAY.applyVariant(0); MK.marks.slice().forEach(k => MK.remove(k));
    return { kept, stopped, z: controls.pos.z.toFixed(2) };
  });
  if (!scen.placed) problems.push('сценарий: предмет не встал по координатам из текста метки');
  if (!scen2.kept) problems.push('сценарий: вариант или метка не восстановились после перезагрузки');
  if (!scen2.stopped) problems.push('сценарий: прогулка не упёрлась в диван на новом месте (z=' + scen2.z + ')');
  // room1-kid: all kid-layer items sit inside room 1, none intersects the loft platform (kidsofa goes under it),
  // the layout gives no warnings (overlaps, passage door→desk ≥ 0.7), the stair-chest has 5 steps of 0.30
  const kid = await page.evaluate(() => {
    const kids = ITEMS.filter(it => it.layer === 'kid' && it.room === 1), bb = o => new THREE.Box3().setFromObject(o);
    const room = PLAN.rooms.find(r => r.id === 1), xs = room.poly.map(q => q[0]), zs = room.poly.map(q => q[1]);
    const inside = kids.filter(it => { const b = bb(ITEM_GROUPS[it.id]); return b.min.x < Math.min(...xs) - 0.001 || b.max.x > Math.max(...xs) + 0.001 || b.min.z < Math.min(...zs) - 0.001 || b.max.z > Math.max(...zs) + 0.001; }).map(it => it.id);
    const plat = new THREE.Box3(new THREE.Vector3(4.235, 1.7, 1.884), new THREE.Vector3(5.435, 1.8, 3.884));
    const hitPlat = kids.filter(it => it.id !== 'kidbed' && bb(ITEM_GROUPS[it.id]).intersectsBox(plat)).map(it => it.id);
    const warn = kids.map(it => [it.id, LAY.warnings(it.id)]).filter(([, w]) => w.length).map(([id, w]) => id + ': ' + w.join('; '));
    const tops = ITEM_GROUPS.kidbed.children.map(o => bb(o)).filter(b => b.min.y < 0.001 && b.max.y <= 1.51 && b.max.z - b.min.z > 0.4).map(b => Math.round(b.max.y * 100) / 100).sort();
    const sofaTop = bb(ITEM_GROUPS.kidsofa).max.y;
    const colored = []; kids.forEach(it => ITEM_GROUPS[it.id].traverse(o => { if (!o.isMesh) return; const bm = VIZ.basic.get(o.material) || o.material; if (bm.isMeshBasicMaterial || bm.transparent) return; const c = bm.color; if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 0.08 && !colored.includes(it.id)) colored.push(it.id); }));
    const desk = bb(ITEM_GROUPS.kiddesk), seat = bb(ITEM_GROUPS.windowseat1), shelfN = bb(ITEM_GROUPS.kidshelf), shelfS = bb(ITEM_GROUPS.kidshelf2), win = PLAN.windows[0];
    const deskStraight = desk.max.z - desk.min.z <= 0.61 && desk.max.z > 4.86 && desk.max.x - desk.min.x > 2.1;
    const chair = bb(ITEM_GROUPS.kidchair), ped = bb(ITEM_GROUPS.kidped), chairIn = chair.max.z - desk.min.z >= 0.25, pedEnd = desk.max.x - ped.max.x < 0.025;
    const seatOk = seat.min.z >= shelfN.max.z - 0.001 && seat.max.z <= desk.min.z + 0.001 && seat.max.x <= 1.52;
    const windowFree = shelfN.max.z <= win.z0 - 0.09 && shelfS.min.z >= win.z1 + 0.09;
    return { n: kids.length, inside, hitPlat, warn, tops, sofaTop, bedPos: ITEM_GROUPS.kidbed.userData.pos, colored, deskStraight, seatOk, windowFree, chairIn, pedEnd };
  });
  if (kid.n < 24) problems.push('комната 1: предметов слоя kid ' + kid.n + ' (< 24)');
  if (kid.inside.length) problems.push('комната 1: предметы вне помещения: ' + kid.inside.join(', '));
  if (kid.hitPlat.length) problems.push('комната 1: пересекают платформу кровати: ' + kid.hitPlat.join(', '));
  if (kid.sofaTop > 1.7) problems.push('комната 1: диванчик выше низа платформы: ' + kid.sofaTop);
  if (kid.warn.length) problems.push('комната 1: предупреждения расстановки:\n    ' + kid.warn.join('\n    '));
  if (kid.tops.join() !== '0.3,0.6,0.9,1.2,1.5') problems.push('комната 1: ступени не 5 × 0.30: ' + kid.tops.join());
  if (Math.abs(kid.bedPos[0] + 1.4 - 4.235) > 1e-9) problems.push('комната 1: платформа кровати сдвинулась: pos.x=' + kid.bedPos[0]);
  if (kid.colored.length) problems.push('комната 1: цветные материалы у ' + kid.colored.join(', '));
  if (!kid.deskStraight) problems.push('комната 1: стол не прямой вдоль южной стены');
  if (!kid.chairIn || !kid.pedEnd) problems.push('комната 1: кресло не задвинуто под стол или тумба не у края стола');
  if (!kid.seatOk) problems.push('комната 1: лежанка не между стеллажом и столом у окна');
  if (!kid.windowFree) problems.push('комната 1: стеллажи не отступают от окна на 0.10');
  // screenshots of room 1: plan, from the door, from the desk to the gallery wall, from under the bed to the window
  await page.evaluate(() => { setView('top'); controls.lookDown(); const hh = 2.4; controls.r = hh / TAN22; controls.target.set(3.17 - ((PANEL_W - MAP_W) / 2) * (2 * hh / innerHeight), 0, 3.37); controls.apply(); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, 'room1-top.png') });
  for (const [name, x, z, th] of [['room1-door', 4.5, 4.55, -Math.PI / 2 + 0.45], ['room1-gallery', 1.9, 3.0, Math.PI * 0.3], ['room1-bed', 4.95, 3.3, -Math.PI / 2 - 0.15]]) {
    await page.evaluate(([x, z, th]) => controls.setFPV(x, z, th), [x, z, th]); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  }
  // room2-kid: kid items of room 2 inside the room (niche: south wall 9.519 east of 13.477), desk fully under the platform,
  // shelf post clear of the door opening, open door leaf (x ≤ 11.97, z 7.65–7.70) clear of the bed legs, pull-up bar under
  // the ceiling, no overlaps, grey materials
  const r2 = await page.evaluate(() => {
    const its = ITEMS.filter(it => it.layer === 'kid2' && it.room === 2), bb = o => new THREE.Box3().setFromObject(o);
    const inside = its.filter(it => { const b = bb(ITEM_GROUPS[it.id]); const zs = b.min.x > 13.477 ? 9.519 : 9.614; return b.min.x < 11.066 || b.max.x > 14.775 || b.min.z < 6.517 || b.max.z > zs + 0.001; }).map(it => it.id);
    const parts = ITEM_GROUPS.kidbed2.children.map(o => bb(o));
    const plat = parts.filter(b => Math.abs(b.min.y - 1.7) < 0.01 && b.max.x - b.min.x > 1.1)[0];
    const desk = bb(ITEM_GROUPS.kiddesk2), lamp = bb(ITEM_GROUPS.desklamp2);
    const deskUnder = plat && desk.min.x >= plat.min.x - 0.001 && desk.max.x <= plat.max.x + 0.001 && desk.min.z >= plat.min.z - 0.001 && desk.max.z <= plat.max.z + 0.001 && Math.max(desk.max.y, lamp.max.y) < 1.7;
    const post = parts.filter(b => b.max.y > 2.1 && b.min.y < 0.01 && b.max.x - b.min.x < 0.1)[0];
    const postClear = post && (post.max.z <= 6.75 || post.min.z >= 7.65);
    const leaf = new THREE.Box3(new THREE.Vector3(11.067, 0, 7.65), new THREE.Vector3(11.97, 2.0, 7.70));
    const leafHit = parts.some(b => b.min.y < 1.7 && b.intersectsBox(leaf));
    const bar = bb(ITEM_GROUPS.pullup).max.y;
    const overlap = its.map(it => [it.id, LAY.warnings(it.id).filter(w => /пересекается|границы/.test(w))]).filter(([, w]) => w.length).map(([id, w]) => id + ': ' + w.join('; '));
    const colored = []; its.forEach(it => ITEM_GROUPS[it.id].traverse(o => { if (!o.isMesh) return; const bm = VIZ.basic.get(o.material) || o.material; if (bm.isMeshBasicMaterial || bm.transparent) return; const c = bm.color; if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 0.08 && !colored.includes(it.id)) colored.push(it.id); }));
    return { n: its.length, inside, deskUnder, postClear, leafHit, bar, overlap, colored, platLen: plat ? plat.max.z - plat.min.z : null };
  });
  if (r2.n < 21) problems.push('комната 2: предметов слоя kid ' + r2.n + ' (< 21)');
  if (r2.inside.length) problems.push('комната 2: предметы вне помещения: ' + r2.inside.join(', '));
  if (!r2.deskUnder) problems.push('комната 2: стол не целиком под платформой или выше 1.70');
  if (!r2.postClear) problems.push('комната 2: ножка полки кровати в дверном проёме');
  if (r2.leafHit) problems.push('комната 2: открытая створка двери упирается в кровать');
  if (Math.abs(r2.platLen - 1.85) > 0.01) problems.push('комната 2: платформа не 1.85: ' + r2.platLen);
  if (r2.bar > 2.7) problems.push('комната 2: турник выше потолка');
  if (r2.overlap.length) problems.push('комната 2: пересечения в расстановке:\n    ' + r2.overlap.join('\n    '));
  if (r2.colored.length) problems.push('комната 2: цветные материалы у ' + r2.colored.join(', '));
  await page.evaluate(() => { setView('top'); controls.lookDown(); const hh = 2.2; controls.r = hh / TAN22; controls.target.set(12.92 - ((PANEL_W - MAP_W) / 2) * (2 * hh / innerHeight), 0, 8.07); controls.apply(); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, 'room2-top.png') });
  for (const [name, x, z, th] of [['room2-door', 11.9, 7.35, Math.PI / 2 + 0.15], ['room2-desk', 12.0, 8.8, Math.PI * 0.75], ['room2-gym', 14.0, 8.1, -Math.PI * 0.75]]) {
    await page.evaluate(([x, z, th]) => controls.setFPV(x, z, th), [x, z, th]); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  }
  // room3-master: items inside room 3, bed against the east wall, cabinets clear of the window, vanity/pouf clear of the door
  // swing, console above the rug, no overlaps in the layout, every material grey
  const m3 = await page.evaluate(() => {
    const its = ITEMS.filter(it => it.layer === 'master'), bb = o => new THREE.Box3().setFromObject(o);
    const room = PLAN.rooms.find(r => r.id === 3), xs = room.poly.map(q => q[0]), zs = room.poly.map(q => q[1]);
    const inside = its.filter(it => { const b = bb(ITEM_GROUPS[it.id]); return b.min.x < Math.min(...xs) - 0.001 || b.max.x > Math.max(...xs) + 0.001 || b.min.z < Math.min(...zs) - 0.001 || b.max.z > Math.max(...zs) + 0.001; }).map(it => it.id);
    const bed = bb(ITEM_GROUPS.mbed), win = PLAN.windows.find(w => w.x > 14.9 && w.z0 > 10);
    const cab = [bb(ITEM_GROUPS.mcab), bb(ITEM_GROUPS.mward)].some(b => b.min.z < win.z1 + 0.1 && b.max.z > win.z0 - 0.1 && b.max.x > 14.7);
    const door = ['vanity', 'vpouf'].filter(id => { const b = bb(ITEM_GROUPS[id]); return b.min.x < 10.82 && b.max.z > 12.2 && b.min.z < 13.0; });
    const console_ = bb(ITEM_GROUPS.mconsole).min.y, rugTop = bb(ITEM_GROUPS.mrug).max.y;
    const overlap = its.map(it => [it.id, LAY.warnings(it.id).filter(w => /пересекается|границы/.test(w))]).filter(([, w]) => w.length).map(([id, w]) => id + ': ' + w.join('; '));
    const colored = []; its.forEach(it => ITEM_GROUPS[it.id].traverse(o => { if (!o.isMesh) return; const bm = VIZ.basic.get(o.material) || o.material; if (bm.isMeshBasicMaterial) return; const c = bm.color; if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 0.08 && !colored.includes(it.id)) colored.push(it.id); }));
    return { n: its.length, inside, bedEast: bed.max.x, cab, door, consoleLow: console_, rugTop, overlap, colored, tv: (bb(ITEM_GROUPS.mtv).min.x + bb(ITEM_GROUPS.mtv).max.x) / 2 };
  });
  if (m3.n < 26) problems.push('комната 3: предметов слоя master ' + m3.n + ' (< 26)');
  if (m3.inside.length) problems.push('комната 3: предметы вне помещения: ' + m3.inside.join(', '));
  if (Math.abs(m3.bedEast - 14.76) > 0.01) problems.push('комната 3: кровать не у восточной стены: x1=' + m3.bedEast.toFixed(3));
  if (m3.cab) problems.push('комната 3: блок ящиков/шкаф заходит на окно');
  if (m3.door.length) problems.push('комната 3: в зоне створки двери: ' + m3.door.join(', '));
  if (m3.consoleLow < m3.rugTop) problems.push('комната 3: консоль ниже ковра');
  if (Math.abs(m3.tv - 13.91) > 0.02) problems.push('комната 3: ТВ не на оси кровати: x=' + m3.tv.toFixed(2));
  if (m3.overlap.length) problems.push('комната 3: пересечения в расстановке:\n    ' + m3.overlap.join('\n    '));
  if (m3.colored.length) problems.push('комната 3: цветные материалы у ' + m3.colored.join(', '));
  await page.evaluate(() => { setView('top'); controls.lookDown(); const hh = 2.4; controls.r = hh / TAN22; controls.target.set(12.39 - ((PANEL_W - MAP_W) / 2) * (2 * hh / innerHeight), 0, 11.46); controls.apply(); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, 'room3-top.png') });
  for (const [name, x, z, th] of [['room3-door', 10.9, 11.9, Math.PI / 2 + 0.25], ['room3-tv', 13.6, 12.3, Math.PI - 0.15], ['room3-south', 14.2, 10.5, -0.55]]) {
    await page.evaluate(([x, z, th]) => controls.setFPV(x, z, th), [x, z, th]); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  }
  // bath9: door 0.70 at z 8.55–9.25 (plan + tile cutout agree), the passage strip x 8.872–9.872 × z 8.55–9.25 × 0–2.10 is
  // free of every part box except the tub, which ends the passage (free depth from the east wall to the tub ≥ 0.80), toilet axis ≥ 0.35 from the tub rim and the east wall, items inside room 9
  // (the corridor switch inside room 5), no layout warnings, grey materials
  const b9 = await page.evaluate(() => {
    const its = ITEMS.filter(it => it.layer === 'bath'), bb = o => new THREE.Box3().setFromObject(o);
    const door = PLAN.doors[5], bath = PLAN.baths[0];
    const doorOk = door[2] === 'v' && Math.abs(door[3] - 0.7) < 1e-9 && Math.abs(door[1] - 0.35 - 8.55) < 1e-9 && bath.dz0 === 8.55 && bath.dz1 === 9.25;
    const inside = its.filter(it => { const r = PLAN.rooms.find(q => q.id === it.room), xs = r.poly.map(q => q[0]), zs = r.poly.map(q => q[1]); const b = bb(ITEM_GROUPS[it.id]);
      return b.min.x < Math.min(...xs) - 0.001 || b.max.x > Math.max(...xs) + 0.001 || b.min.z < Math.min(...zs) - 0.001 || b.max.z > Math.max(...zs) + 0.001; }).map(it => it.id);
    const strip = new THREE.Box3(new THREE.Vector3(8.872, 0, 8.55), new THREE.Vector3(9.872, 2.1, 9.25));
    const inStrip = its.filter(it => it.room === 9 && it.id !== 'tub' && PHYS[it.id].some(m => { const b = bb(m); const e = 1e-6; return b.min.x < strip.max.x - e && b.max.x > strip.min.x + e && b.min.z < strip.max.z - e && b.max.z > strip.min.z + e && b.min.y < strip.max.y; })).map(it => it.id);
    const wc = bb(ITEM_GROUPS.wc), tub = bb(ITEM_GROUPS.tub), axis = (wc.min.x + wc.max.x) / 2;
    const tubDepth = 9.872 - Math.max(...PHYS.tub.map(m => bb(m)).filter(b => b.min.z < strip.max.z && b.max.z > strip.min.z).map(b => b.max.x));
    const warn = its.map(it => [it.id, LAY.warnings(it.id)]).filter(([, w]) => w.length).map(([id, w]) => id + ': ' + w.join('; '));
    const colored = []; its.forEach(it => ITEM_GROUPS[it.id].traverse(o => { if (!o.isMesh) return; const bm = VIZ.basic.get(o.material) || o.material; if (bm.isMeshBasicMaterial || bm.transparent) return; const c = bm.color; if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 0.08 && !colored.includes(it.id)) colored.push(it.id); }));
    return { n: its.length, doorOk, inside, inStrip, axisTub: axis - tub.max.x, axisWall: 9.872 - axis, wcFront: wc.max.z, tubDepth, warn, colored };
  });
  if (b9.n < 17) problems.push('санузел 9: предметов слоя bath ' + b9.n + ' (< 17)');
  if (!b9.doorOk) problems.push('санузел 9: дверь не 0.70 на z 8.55–9.25 или вырез плитки не совпал');
  if (b9.inside.length) problems.push('санузел 9: предметы вне помещения: ' + b9.inside.join(', '));
  if (b9.inStrip.length) problems.push('санузел 9: в полосе прохода: ' + b9.inStrip.join(', '));
  if (b9.tubDepth < 0.8) problems.push('санузел 9: от двери до ванны ' + b9.tubDepth.toFixed(2) + ' (< 0.80)');
  if (b9.axisTub < 0.35 || b9.axisWall < 0.35) problems.push('санузел 9: ось унитаза ближе 0.35: до ванны ' + b9.axisTub.toFixed(3) + ', до стены ' + b9.axisWall.toFixed(3));
  if (b9.warn.length) problems.push('санузел 9: предупреждения расстановки:\n    ' + b9.warn.join('\n    '));
  if (b9.colored.length) problems.push('санузел 9: цветные материалы у ' + b9.colored.join(', '));
  await page.evaluate(() => { setView('top'); controls.lookDown(); const hh = 1.4; controls.r = hh / TAN22; controls.target.set(9.03 - ((PANEL_W - MAP_W) / 2) * (2 * hh / innerHeight), 0, 9.0); controls.apply(); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, 'bath9-top.png') });
  for (const [name, x, z, th] of [['bath9-door', 9.8, 8.85, -Math.PI / 2 + 0.3], ['bath9-basin', 9.6, 9.0, Math.PI - 0.35], ['bath9-tub', 8.6, 8.9, Math.PI / 2 + 0.1]]) {
    await page.evaluate(([x, z, th]) => controls.setFPV(x, z, th), [x, z, th]); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  }
  // bath8: shower along the whole west wall, glass on the toilet side, no basin; the passage strip x 9.10–9.872 × z 12.20–13.00 × 0–2.10 is free of every part box of room 8 (tolerance 1e-6),
  // toilet axis ≥ 0.35 from the east wall, no layout warnings (corners inside the polygon with the bump), grey materials
  const b8 = await page.evaluate(() => {
    const its = ITEMS.filter(it => it.layer === 'bath2' && it.room === 8), bb = o => new THREE.Box3().setFromObject(o);
    const strip = new THREE.Box3(new THREE.Vector3(9.10, 0, 12.20), new THREE.Vector3(9.872, 2.1, 13.00)), e = 1e-6;
    const inStrip = its.filter(it => PHYS[it.id].some(m => { const b = bb(m); return b.min.x < strip.max.x - e && b.max.x > strip.min.x + e && b.min.z < strip.max.z - e && b.max.z > strip.min.z + e && b.min.y < strip.max.y; })).map(it => it.id);
    const wc = bb(ITEM_GROUPS.wc8), axis = (wc.min.x + wc.max.x) / 2;
    const warn = its.concat(ITEMS.filter(it => it.id === 'sw6')).map(it => [it.id, LAY.warnings(it.id)]).filter(([, w]) => w.length).map(([id, w]) => id + ': ' + w.join('; '));
    const colored = []; its.forEach(it => ITEM_GROUPS[it.id].traverse(o => { if (!o.isMesh) return; const bm = VIZ.basic.get(o.material) || o.material; if (bm.isMeshBasicMaterial || bm.transparent) return; const c = bm.color; if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 0.08 && !colored.includes(it.id)) colored.push(it.id); }));
    const tray = bb(ITEM_GROUPS.shower8), curbTop = bb(ITEM_GROUPS.curb8e).max.y, glass = bb(ITEM_GROUPS.glass8), glassTop = glass.max.y, glassEast = Math.max(glass.max.x, bb(ITEM_GROUPS.curb8e).max.x);
    const wcSide = glass.min.z <= 11.589 && glass.max.z >= 12.4 && wc.max.z <= glass.max.z, showerLen = tray.max.z - tray.min.z;
    return { n: its.length, inStrip, axisWall: 9.872 - axis, wcFront: wc.max.z, warn, colored, trayLow: tray.min.y, trayHigh: tray.max.y, curbTop, glassTop, glassEast, wcSide, showerLen, basin: !!ITEM_GROUPS.basin8 };
  });
  if (b8.n < 16) problems.push('санузел 8: предметов слоя bath ' + b8.n + ' (< 16)');
  if (b8.basin) problems.push('санузел 8: раковины быть не должно');
  if (b8.showerLen < 1.53) problems.push('санузел 8: душ не вдоль всей западной стены: ' + b8.showerLen.toFixed(2));
  if (!b8.wcSide) problems.push('санузел 8: стекло не закрывает душ со стороны унитаза');
  if (b8.inStrip.length) problems.push('санузел 8: в полосе прохода: ' + b8.inStrip.join(', '));
  if (b8.axisWall < 0.35) problems.push('санузел 8: ось унитаза ближе 0.35 к стене: ' + b8.axisWall.toFixed(3));
  if (b8.wcFront > 12.2) problems.push('санузел 8: унитаз заходит в полосу прохода: z ' + b8.wcFront.toFixed(3));
  if (b8.trayLow < 0.0065 || b8.trayHigh > 0.02) problems.push('санузел 8: поддон душа не между отделкой пола и 0.02: ' + b8.trayLow + '–' + b8.trayHigh);
  if (Math.abs(b8.curbTop - 0.05) > 1e-6 || Math.abs(b8.glassTop - 2.1) > 1e-6 || b8.glassEast > 9.10 + 1e-6) problems.push('санузел 8: бортик/стекло не по ТЗ (0.05 / 2.10 / x ≤ 9.10)');
  if (b8.warn.length) problems.push('санузел 8: предупреждения расстановки:\n    ' + b8.warn.join('\n    '));
  if (b8.colored.length) problems.push('санузел 8: цветные материалы у ' + b8.colored.join(', '));
  await page.evaluate(() => { setView('top'); controls.lookDown(); const hh = 1.4; controls.r = hh / TAN22; controls.target.set(9.03 - ((PANEL_W - MAP_W) / 2) * (2 * hh / innerHeight), 0, 12.26); controls.apply(); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, 'bath8-top.png') });
  for (const [name, x, z, th] of [['bath8-door', 9.8, 12.6, -Math.PI / 2 + 0.3], ['bath8-wc', 9.6, 12.75, -Math.PI / 2 - 0.55], ['bath8-shower', 8.7, 12.8, Math.PI / 2 - 0.1]]) {
    await page.evaluate(([x, z, th]) => controls.setFPV(x, z, th), [x, z, th]); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  }
  // wardrobe6: the passage x 6.165–6.885 × z 2.274–3.894 × 0–2.10 holds no part box thicker than 0.03 (peg board, mirror,
  // door brackets and the socket are flat on the walls), section C stays west of the door opening (x ≤ 6.10), every rod ≤ 2.00,
  // items inside room 6 (the corridor switch inside room 5), no layout warnings, grey materials
  const w6 = await page.evaluate(() => {
    const its = ITEMS.filter(it => it.layer === 'wardrobe'), bb = o => new THREE.Box3().setFromObject(o);
    const inside = its.filter(it => { const r = PLAN.rooms.find(q => q.id === it.room), xs = r.poly.map(q => q[0]), zs = r.poly.map(q => q[1]); const b = bb(ITEM_GROUPS[it.id]);
      return b.min.x < Math.min(...xs) - 0.001 || b.max.x > Math.max(...xs) + 0.001 || b.min.z < Math.min(...zs) - 0.001 || b.max.z > Math.max(...zs) + 0.001; }).map(it => it.id);
    const strip = new THREE.Box3(new THREE.Vector3(6.165, 0, 2.274), new THREE.Vector3(6.885, 2.1, 3.894));
    const inStrip = its.filter(it => it.room === 6 && PHYS[it.id].some(m => { const b = bb(m); const e = 1e-6; const thin = Math.min(b.max.x - b.min.x, b.max.z - b.min.z) <= 0.03;
      return !thin && b.min.x < strip.max.x - e && b.max.x > strip.min.x + e && b.min.z < strip.max.z - e && b.max.z > strip.min.z + e && b.min.y < strip.max.y; })).map(it => it.id);
    const secC = bb(ITEM_GROUPS.wsecC).max.x;
    const rods = []; ['wsecA', 'wsecB'].forEach(id => ITEM_GROUPS[id].traverse(o => { if (o.isMesh && o.geometry.type === 'CylinderGeometry') rods.push(bb(o).max.y); }));
    const warn = its.map(it => [it.id, LAY.warnings(it.id)]).filter(([, w]) => w.length).map(([id, w]) => id + ': ' + w.join('; '));
    const colored = []; its.forEach(it => ITEM_GROUPS[it.id].traverse(o => { if (!o.isMesh) return; const bm = VIZ.basic.get(o.material) || o.material; if (bm.isMeshBasicMaterial || bm.transparent) return; const c = bm.color; if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 0.08 && !colored.includes(it.id)) colored.push(it.id); }));
    return { n: its.length, inside, inStrip, secC, rods, warn, colored };
  });
  if (w6.n < 13) problems.push('гардеробная 6: предметов слоя wardrobe ' + w6.n + ' (< 13)');
  if (w6.inside.length) problems.push('гардеробная 6: предметы вне помещения: ' + w6.inside.join(', '));
  if (w6.inStrip.length) problems.push('гардеробная 6: в проходе: ' + w6.inStrip.join(', '));
  if (w6.secC > 6.10 + 1e-9) problems.push('гардеробная 6: секция C заходит в проём двери, x1 ' + w6.secC.toFixed(3));
  if (w6.rods.length !== 3 || w6.rods.some(y => y > 2.0)) problems.push('гардеробная 6: штанги ' + w6.rods.map(y => y.toFixed(3)).join(', ') + ' (нужно 3, верх ≤ 2.00)');
  if (w6.warn.length) problems.push('гардеробная 6: предупреждения расстановки:\n    ' + w6.warn.join('\n    '));
  if (w6.colored.length) problems.push('гардеробная 6: цветные материалы у ' + w6.colored.join(', '));
  await page.evaluate(() => { setView('top'); controls.lookDown(); const hh = 1.4; controls.r = hh / TAN22; controls.target.set(6.225 - ((PANEL_W - MAP_W) / 2) * (2 * hh / innerHeight), 0, 2.884); controls.apply(); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, 'wardrobe6-top.png') });
  for (const [name, x, z, th] of [['wardrobe6-door', 6.6, 4.5, Math.PI - 0.15], ['wardrobe6-end', 6.55, 3.2, 0.2]]) {
    await page.evaluate(([x, z, th]) => controls.setFPV(x, z, th), [x, z, th]); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  }
  // balcony10: nothing under the desk below its consoles (0.66) except the chair, the IT shelf plate and the shelving unit top at 2.05
  // (0.65 to the ceiling), the cable duct above the kitchen opening (≥ 2.10), the opening zone x 13.91–14.4 × z of PLAN.openings.balcony free of
  // floor-standing parts, items inside room 10, no layout warnings, grey materials
  const b10 = await page.evaluate(() => {
    const its = ITEMS.filter(it => it.layer === 'balcony'), bb = o => new THREE.Box3().setFromObject(o);
    const inside = its.filter(it => { const r = PLAN.rooms.find(q => q.id === it.room), xs = r.poly.map(q => q[0]), zs = r.poly.map(q => q[1]); const b = bb(ITEM_GROUPS[it.id]);
      return b.min.x < Math.min(...xs) - 0.001 || b.max.x > Math.max(...xs) + 0.001 || b.min.z < Math.min(...zs) - 0.001 || b.max.z > Math.max(...zs) + 0.001; }).map(it => it.id);
    const hit = (box, m) => { const b = bb(m); const e = 1e-6; return b.min.x < box.max.x - e && b.max.x > box.min.x + e && b.min.z < box.max.z - e && b.max.z > box.min.z + e && b.min.y < box.max.y - e && b.max.y > box.min.y + e; };
    const under = new THREE.Box3(new THREE.Vector3(13.91, 0, 5.24), new THREE.Vector3(15.1, 0.66, 6.043));
    const underDesk = its.filter(it => it.id !== 'bchair' && PHYS[it.id].some(m => hit(under, m))).map(it => it.id);
    const plate = bb(ITEM_GROUPS.itshelf.children[0]).max.y, shelfTop = bb(ITEM_GROUPS.bshelf).max.y, lip = bb(ITEM_GROUPS.itshelf).max.y;
    const duct = bb(ITEM_GROUPS.cable10);
    const op = PLAN.openings.find(o => o.tag === 'balcony'); const zone = new THREE.Box3(new THREE.Vector3(13.91, 0, op.z0), new THREE.Vector3(14.4, 0.05, op.z1));
    const inZone = its.filter(it => PHYS[it.id].some(m => hit(zone, m))).map(it => it.id);
    const warn = its.map(it => [it.id, LAY.warnings(it.id)]).filter(([, w]) => w.length).map(([id, w]) => id + ': ' + w.join('; '));
    const colored = []; its.forEach(it => ITEM_GROUPS[it.id].traverse(o => { if (!o.isMesh) return; const bm = VIZ.basic.get(o.material) || o.material; if (bm.isMeshBasicMaterial || bm.transparent) return; const c = bm.color; if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 0.08 && !colored.includes(it.id)) colored.push(it.id); }));
    const swZ = bb(ITEM_GROUPS.sw8).min.z;
    return { n: its.length, inside, underDesk, plate, shelfTop, lip, ductMin: duct.min.y, ductZ: [duct.min.z, duct.max.z], op: [op.z0, op.z1], swZ, inZone, warn, colored };
  });
  if (b10.n < 13) problems.push('лоджия 10: предметов слоя balcony ' + b10.n + ' (< 13)');
  if (b10.inside.length) problems.push('лоджия 10: предметы вне помещения: ' + b10.inside.join(', '));
  if (b10.underDesk.length) problems.push('лоджия 10: под столом ниже 0.66: ' + b10.underDesk.join(', '));
  if (Math.abs(b10.plate - 2.05) > 1e-6 || Math.abs(b10.shelfTop - 2.05) > 1e-6 || b10.lip > 2.08 + 1e-6) problems.push('лоджия 10: верх полки/стеллажа не 2.05: ' + [b10.plate, b10.shelfTop, b10.lip].map(v => v.toFixed(3)).join(', '));
  if (b10.ductMin < 2.1 || b10.ductZ[0] > b10.op[0] || b10.ductZ[1] < b10.op[1]) problems.push('лоджия 10: кабель-канал не выше проёма: низ ' + b10.ductMin.toFixed(2) + ', z ' + b10.ductZ.map(v => v.toFixed(2)).join('–'));
  if (b10.inZone.length) problems.push('лоджия 10: в зоне проёма: ' + b10.inZone.join(', '));
  if (Math.abs(b10.op[0] - 3.353) > 1e-9 || Math.abs(b10.op[1] - 4.971) > 1e-9 || b10.swZ < b10.op[1]) problems.push('лоджия 10: проём не 3.353–4.971 по плану или выключатель sw8 в проёме: ' + b10.op.join('–') + ', sw8 z ' + b10.swZ.toFixed(3));
  if (b10.warn.length) problems.push('лоджия 10: предупреждения расстановки:\n    ' + b10.warn.join('\n    '));
  if (b10.colored.length) problems.push('лоджия 10: цветные материалы у ' + b10.colored.join(', '));
  await page.evaluate(() => { setView('top'); controls.lookDown(); const hh = 2.1; controls.r = hh / TAN22; controls.target.set(14.5 - ((PANEL_W - MAP_W) / 2) * (2 * hh / innerHeight), 0, 4.15); controls.apply(); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, 'balcony10-top.png') });
  for (const [name, x, z, th] of [['balcony10-desk', 14.3, 3.9, 0.15], ['balcony10-shelf', 14.6, 4.7, Math.PI + 0.1]]) {
    await page.evaluate(([x, z, th]) => controls.setFPV(x, z, th), [x, z, th]); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  }
  // floor-tile: one mesh in tileGroup at TILE=0.0075, contour area 22.21 (Gauss, without sills; includes the removable wall footprint), sills come from PLAN.doors
  // (bath 9 sill follows doors[5]), the checkbox toggles tileGroup only, visualization gives the tile a MeshStandardMaterial
  const ft = await page.evaluate(() => {
    const meshes = []; tileGroup.traverse(o => { if (o.isMesh) meshes.push(o); });
    const area = p => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
    const y = meshes.length ? new THREE.Box3().setFromObject(meshes[0]).min.y : -1;
    const d5 = PLAN.doors[5], s5 = TILE_SILLS[5], sillOk = Math.abs(Math.min(...s5.map(q => q[1])) - (d5[1] - d5[3] / 2)) < 1e-9 && Math.abs(Math.min(...s5.map(q => q[0])) - d5[0]) < 1e-9;
    const cb = document.getElementById('tileFloor'), fin0 = finishGroup.visible;
    cb.checked = false; cb.dispatchEvent(new Event('change')); const hid = !tileGroup.visible && finishGroup.visible === fin0;
    cb.checked = true; cb.dispatchEvent(new Event('change')); const shown = tileGroup.visible;
    const fin = document.getElementById('finish'); fin.checked = false; fin.dispatchEvent(new Event('change')); const tileKept = tileGroup.visible && !finishGroup.visible; fin.checked = true; fin.dispatchEvent(new Event('change'));
    VIZ.set(true); setView('fpv'); VIZ.apply && VIZ.apply(); const std = meshes[0].material.type; VIZ.set(false);
    return { n: meshes.length, area: area(TILE_POLY), y, sillOk, toggle: hid && shown && tileKept, std, sills: TILE_SILLS.length };
  });
  if (ft.n !== 1) problems.push('плитка: мешей в tileGroup ' + ft.n + ' (нужен 1)');
  if (Math.abs(ft.area - 22.21) > 0.05) problems.push('плитка: площадь контура ' + ft.area.toFixed(2) + ' (ожидалось 22.21)');
  if (Math.abs(ft.y - 0.0075) > 1e-6) problems.push('плитка: высота меша ' + ft.y + ' (нужно 0.0075)');
  if (!ft.sillOk || ft.sills !== 7) problems.push('плитка: пороги не по PLAN.doors (санузел 9) или их не 7');
  if (!ft.toggle) problems.push('плитка: галочка «Плитка пол» не переключает слой или трогает отделку');
  if (ft.std !== 'MeshStandardMaterial') problems.push('плитка: в визуализации материал ' + ft.std);
  await page.evaluate(() => { setView('top'); controls.lookDown(); const hh = 7; controls.r = hh / TAN22; controls.target.set(8.2 - ((PANEL_W - MAP_W) / 2) * (2 * hh / innerHeight), 0, 7.4); controls.apply(); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, 'tile-top.png') });
  await page.evaluate(() => { const hh = 1.6; controls.r = hh / TAN22; controls.target.set(10.3 - ((PANEL_W - MAP_W) / 2) * (2 * hh / innerHeight), 0, 5.8); document.getElementById('kwall').checked = false; document.getElementById('kwall').dispatchEvent(new Event('change')); controls.apply(); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, 'tile-joint.png') }); await page.evaluate(() => { document.getElementById('kwall').checked = true; document.getElementById('kwall').dispatchEvent(new Event('change')); });
  await page.evaluate(() => controls.setFPV(7.0, 7.0, Math.PI / 2 - 0.5)); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'tile-walk.png') });
  // loggia 10: black frame grid and railing on the floor-to-ceiling glazing, grey paint on the walls, porcelain tile on the floor
  const lg = await page.evaluate(() => {
    const frames = []; glassGroup.traverse(o => { if (o.isMesh && o.material === loggiaFrameMat) frames.push(o); });
    const bars = frames.filter(m => m.geometry.parameters.height > 0.9 && m.geometry.parameters.depth < 0.02).length;
    const floor = [], walls = []; finishGroup.traverse(o => { if (!o.isMesh) return; const b = new THREE.Box3().setFromObject(o); if (b.min.x > 13.9 && b.max.x < 15.11 && b.min.z > 2.26 && b.max.z < 6.05) { const bm = VIZ.basic.get(o.material) || o.material; if (b.max.y < 0.02) floor.push(bm); else if (bm === finishMats.wallPaint) walls.push(o); } });
    return { frames: frames.length, bars, floorTile: floor.length === 1 && floor[0] === finishMats.tile, walls: walls.length };
  });
  if (lg.frames < 30 || lg.bars < 25) problems.push('лоджия 10: рам ' + lg.frames + ', прутьев ' + lg.bars + ' (ожидалось ≥30 и ≥25)');
  if (!lg.floorTile) problems.push('лоджия 10: пол не керамогранит');
  if (lg.walls < 3) problems.push('лоджия 10: крашеных стеновых панелей ' + lg.walls + ' (< 3)');
  await page.evaluate(() => { setView('fpv'); controls.setFPV(14.45, 4.7, Math.PI / 2 + 0.3); }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'balcony10-glazing.png') });
  // floor layer 3: oak board over the living zone of room 4 (x 10.36–13.47) and the loggia, its own checkbox, PBR twin in visualization
  const bd = await page.evaluate(() => {
    const meshes = []; boardGroup.traverse(o => { if (o.isMesh) meshes.push(o); });
    const b = new THREE.Box3().setFromObject(boardGroup);
    const cb = document.getElementById('boardFloor'); cb.checked = false; cb.dispatchEvent(new Event('change')); const hid = !boardGroup.visible && tileGroup.visible; cb.checked = true; cb.dispatchEvent(new Event('change'));
    VIZ.set(true); setView('fpv'); VIZ.apply && VIZ.apply(); const std = meshes[0].material.type; VIZ.set(false);
    const frost = []; glassGroup.traverse(o => { if (o.isMesh && o.material === loggiaFrostMat) frost.push(o); });
    return { n: meshes.length, box: [b.min.x, b.max.x, b.min.z, b.max.z, b.min.y], hid, shown: boardGroup.visible, std, frost: frost.length };
  });
  if (bd.n !== 2) problems.push('покрытие: мешей ' + bd.n + ' (нужно 2)');
  if (Math.abs(bd.box[0] - 10.36) > 1e-6 || Math.abs(bd.box[1] - 15.1) > 1e-6 || Math.abs(bd.box[2] - 1.915) > 1e-6 || Math.abs(bd.box[3] - 6.287) > 1e-6) problems.push('покрытие: контур ' + bd.box.slice(0, 4).map(v => v.toFixed(3)).join(' '));
  if (Math.abs(bd.box[4] - 0.009) > 1e-6) problems.push('покрытие: высота ' + bd.box[4]);
  if (!bd.hid || !bd.shown) problems.push('покрытие: галочка не переключает слой или трогает плитку');
  if (bd.std !== 'MeshStandardMaterial') problems.push('покрытие: в визуализации материал ' + bd.std);
  if (bd.frost !== 3) problems.push('лоджия 10: матовых вставок ' + bd.frost + ' (нужно 3)');
  await page.evaluate(() => { setView('top'); controls.lookDown(); const hh = 2.6; controls.r = hh / TAN22; controls.target.set(12.7 - ((PANEL_W - MAP_W) / 2) * (2 * hh / innerHeight), 0, 4.1); controls.apply(); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, 'board-top.png') });
  await page.evaluate(() => { setView('fpv'); controls.setFPV(11.2, 5.6, Math.PI / 2 - 0.9); }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'board-walk.png') });
  // facade: one cladding mesh per outer face with windows (west, north, two east faces), holes equal the windows on that face, follows the walls slider and gets a PBR twin
  const fc = await page.evaluate(() => {
    const meshes = []; facadeGroup.traverse(o => { if (o.isMesh) meshes.push(o); });
    const holes = meshes.reduce((n, m) => n + m.geometry.parameters.shapes.holes.length, 0);
    const wop = document.getElementById('wop'); wop.value = 0; wop.dispatchEvent(new Event('input')); const hid = !facadeGroup.visible; wop.value = 100; wop.dispatchEvent(new Event('input'));
    VIZ.set(true); setView('fpv'); VIZ.apply && VIZ.apply(); const std = meshes[0].material.type; VIZ.set(false);
    return { n: meshes.length, holes, hid, std, shown: facadeGroup.visible };
  });
  if (fc.n !== 4) problems.push('фасад: мешей ' + fc.n + ' (нужно 4: запад, север, восток 15.249 и 14.801)');
  if (fc.holes !== 4) problems.push('фасад: вырезов под окна ' + fc.holes + ' (нужно 4)');
  if (!fc.hid || !fc.shown) problems.push('фасад: не следует за ползунком «Стены»');
  if (fc.std !== 'MeshStandardMaterial') problems.push('фасад: в визуализации материал ' + fc.std);
  for (const [name, x, z, th] of [['facade-west', -4.5, 3.4, Math.PI / 2 + 0.35], ['facade-east', 20.0, 6.5, -Math.PI / 2 - 0.3], ['facade-north', 8.0, -6.0, 0.0]]) {
    await page.evaluate(([x, z, th]) => { setView('fpv'); controls.setFPV(x, z, th); }, [x, z, th]); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  }
  console.log(`  кадров/с: план ${fpsPlain}, визуализация ${fpsViz} (viewport 1400×1000, прогулка в кухне)`);
  await browser.close();

  if (problems.length) {
    console.error('ПРОВАЛ:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`ОК: ${url}\n  10 комнат, площади согласованы; сверху и прогулка (${walk.moved.toFixed(2)} м) работают; скриншоты в tools/out/`);
})().catch(e => { console.error('ПРОВАЛ:', e.message); process.exit(1); });
