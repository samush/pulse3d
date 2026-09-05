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
    browser = await chromium.launch();
  } catch (e1) {
    const alt = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
    try {
      browser = await chromium.launch({ executablePath: alt });
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
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => {
    // необязательный внешний шрифт может не грузиться в оффлайне — не ошибка сцены
    const src = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && !/fonts\.googleapis|fonts\.gstatic|favicon\.ico/.test(src + m.text())) {
      problems.push('console: ' + m.text() + (src ? ' @ ' + src : ''));
    }
  });

  await page.goto(url);
  await page.waitForTimeout(3500);
  await page.evaluate(() => { try { localStorage.removeItem('pulse3d.marks'); localStorage.removeItem('pulse3d.layout'); localStorage.removeItem('pulse3d.viz'); } catch (e) {} }); // чистый старт разметки, вариантов и режима
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
      furnitureMin: Math.min(...[furnGroup, hallGroup, laundryGroup, kidGroup].map(minY)),
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
  await page.click('text=От первого лица').catch(() => problems.push('нет кнопки «От первого лица»'));
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
  if (await page.evaluate(() => !!camera.isOrthographicCamera)) problems.push('после «От первого лица» камера осталась ортографической');
  else if (walk.moved < 0.3) problems.push('прогулка: шаг вперёд не сдвинул человечка (' + walk.moved.toFixed(2) + ' м)');
  await page.screenshot({ path: path.join(outDir, 'walk.png') });
  // T11: визуализация — PBR-материалы, тени, масштаб рисунка в метрах, геометрия не меняется; замер кадров в обоих режимах
  const fps = async () => page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else r(Math.round(n / 1.5)); }; requestAnimationFrame(f); }));
  const planJson = await page.evaluate(() => JSON.stringify(PLAN));
  await page.evaluate(() => { controls.setFPV(10.6, 3.9, Math.PI / 2 + 0.25); });
  const fpsPlain = await fps();
  await page.screenshot({ path: path.join(outDir, 'viz-off.png') });
  await page.click('#viz'); await page.waitForTimeout(800);
  const viz = await page.evaluate((pj) => {
    const floor = finishGroup.children.find(o => o.geometry && o.geometry.type === 'ShapeGeometry');
    const sofa = ITEM_GROUPS.sofa.children[0];
    const lam = floor.material;
    return { std: lam.isMeshStandardMaterial && sofa.material.isMeshStandardMaterial, shadows: renderer.shadowMap.enabled && sun.castShadow && sofa.castShadow,
      maps: !!(lam.roughnessMap && lam.normalMap), scale: Math.abs(lam.map.repeat.x - 1 / MATERIALS.lam.size[0]) < 1e-9 && Math.abs(lam.roughnessMap.repeat.x - lam.map.repeat.x) < 1e-9,
      tone: renderer.toneMapping === THREE.ACESFilmicToneMapping && renderer.outputEncoding === THREE.sRGBEncoding, geom: JSON.stringify(PLAN) === pj && Math.abs(ITEM_GROUPS.sofa.userData.pos[0] - 11.35) < 1e-9 };
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
  await page.reload(); await page.waitForTimeout(2500);
  const vizKept = await page.evaluate(() => { const ok = VIZ.on && document.getElementById('viz').checked; VIZ.set(false); return ok; });
  if (!viz.std) problems.push('визуализация: материалы не PBR');
  if (!viz.shadows) problems.push('визуализация: тени не включены');
  if (!viz.maps || !viz.scale) problems.push('визуализация: карты шероховатости/рельефа отсутствуют или масштаб не совпадает');
  if (!viz.tone) problems.push('визуализация: tone mapping / sRGB не включены');
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
    const kids = ITEMS.filter(it => it.layer === 'kid'), bb = o => new THREE.Box3().setFromObject(o);
    const room = PLAN.rooms.find(r => r.id === 1), xs = room.poly.map(q => q[0]), zs = room.poly.map(q => q[1]);
    const inside = kids.filter(it => { const b = bb(ITEM_GROUPS[it.id]); return b.min.x < Math.min(...xs) - 0.001 || b.max.x > Math.max(...xs) + 0.001 || b.min.z < Math.min(...zs) - 0.001 || b.max.z > Math.max(...zs) + 0.001; }).map(it => it.id);
    const plat = new THREE.Box3(new THREE.Vector3(4.235, 1.7, 1.884), new THREE.Vector3(5.435, 1.8, 3.884));
    const hitPlat = kids.filter(it => it.id !== 'kidbed' && bb(ITEM_GROUPS[it.id]).intersectsBox(plat)).map(it => it.id);
    const warn = kids.map(it => [it.id, LAY.warnings(it.id)]).filter(([, w]) => w.length).map(([id, w]) => id + ': ' + w.join('; '));
    const tops = ITEM_GROUPS.kidbed.children.map(o => bb(o)).filter(b => b.min.y < 0.001 && b.max.y <= 1.51 && b.max.z - b.min.z > 0.4).map(b => Math.round(b.max.y * 100) / 100).sort();
    const sofaTop = bb(ITEM_GROUPS.kidsofa).max.y;
    return { n: kids.length, inside, hitPlat, warn, tops, sofaTop, bedPos: ITEM_GROUPS.kidbed.userData.pos };
  });
  if (kid.n < 22) problems.push('комната 1: предметов слоя kid ' + kid.n + ' (< 22)');
  if (kid.inside.length) problems.push('комната 1: предметы вне помещения: ' + kid.inside.join(', '));
  if (kid.hitPlat.length) problems.push('комната 1: пересекают платформу кровати: ' + kid.hitPlat.join(', '));
  if (kid.sofaTop > 1.7) problems.push('комната 1: диванчик выше низа платформы: ' + kid.sofaTop);
  if (kid.warn.length) problems.push('комната 1: предупреждения расстановки:\n    ' + kid.warn.join('\n    '));
  if (kid.tops.join() !== '0.3,0.6,0.9,1.2,1.5') problems.push('комната 1: ступени не 5 × 0.30: ' + kid.tops.join());
  if (Math.abs(kid.bedPos[0] + 1.4 - 4.235) > 1e-9) problems.push('комната 1: платформа кровати сдвинулась: pos.x=' + kid.bedPos[0]);
  // screenshots of room 1: plan, from the door, from the desk to the gallery wall, from under the bed to the window
  await page.evaluate(() => { setView('top'); controls.lookDown(); const hh = 2.4; controls.r = hh / TAN22; controls.target.set(3.17 - ((PANEL_W - MAP_W) / 2) * (2 * hh / innerHeight), 0, 3.37); controls.apply(); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, 'room1-top.png') });
  for (const [name, x, z, th] of [['room1-door', 4.5, 4.55, -Math.PI / 2 + 0.45], ['room1-gallery', 1.9, 3.0, Math.PI * 0.3], ['room1-bed', 4.95, 3.3, -Math.PI / 2 - 0.15]]) {
    await page.evaluate(([x, z, th]) => controls.setFPV(x, z, th), [x, z, th]); await page.waitForTimeout(300);
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
