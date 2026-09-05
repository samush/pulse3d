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
  const before = await page.evaluate(() => ({ t: controls.target.toArray(), th: controls.theta, ph: controls.phi }));
  await page.mouse.move(700, 500); await page.mouse.down(); await page.mouse.move(760, 540, { steps: 4 }); await page.mouse.up();
  const plan = await page.evaluate((b) => {
    const px = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return [v.x * innerWidth / 2, v.y * innerHeight / 2]; };
    const dx = (y) => { const a = px(cx, y, cz), c = px(cx + 1, y, cz); return Math.hypot(c[0] - a[0], c[1] - a[1]); };
    return { ortho: !!camera.isOrthographicCamera, m0: dx(0), m25: dx(2.5),
      moved: controls.target.distanceTo(new THREE.Vector3().fromArray(b.t)), tilt: Math.abs(controls.theta - b.th) + Math.abs(controls.phi - b.ph) };
  }, before);
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
    MK.marks.slice().forEach(m => MK.remove(m)); MK.toggle(false);
    return out;
  }, expPt);
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
  if (await page.evaluate(() => !!camera.isOrthographicCamera)) problems.push('после «От первого лица» камера осталась ортографической');
  else if (walk.moved < 0.3) problems.push('прогулка: шаг вперёд не сдвинул человечка (' + walk.moved.toFixed(2) + ' м)');
  await page.screenshot({ path: path.join(outDir, 'walk.png') });
  await browser.close();

  if (problems.length) {
    console.error('ПРОВАЛ:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`ОК: ${url}\n  10 комнат, площади согласованы; сверху и прогулка (${walk.moved.toFixed(2)} м) работают; скриншоты в tools/out/`);
})().catch(e => { console.error('ПРОВАЛ:', e.message); process.exit(1); });
