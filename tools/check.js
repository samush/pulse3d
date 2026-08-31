// Smoke-тест сцены: страница грузится без ошибок, PLAN согласован,
// скриншоты сохраняются в tools/out/. Гонять перед каждым пушем.
//
// Требует playwright (один раз на окружение: npm i --no-save playwright).
// Запуск:  node tools/check.js            — файл из рабочей копии
//          node tools/check.js <url>      — например, страница на Pages
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const root = path.dirname(__dirname);
  const url = process.argv[2] || 'file://' + path.join(root, 'index.html');
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  // в облачном окружении Claude Code хром лежит по фиксированному пути
  const browser = await chromium.launch().catch(() =>
    chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' }));
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
      geom: Math.round(shoelace(r.poly) * 10 + 1e-6) / 10,
    }));
    return { canvas: !!(c && c.width > 0), nRooms: rooms.length, rooms };
  });

  if (!report.canvas) problems.push('канвас сцены не создан');
  if (report.nRooms !== 10) problems.push('ожидалось 10 комнат, получено ' + report.nRooms);
  for (const r of report.rooms) {
    if (Math.abs(r.geom - r.stored) > 0.051) {
      problems.push(`комната ${r.id}: полигон даёт ${r.geom}, записано ${r.stored}`);
    }
  }

  await page.click('text=Сверху').catch(() => problems.push('нет кнопки «Сверху»'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, 'top.png') });
  await browser.close();

  if (problems.length) {
    console.error('ПРОВАЛ:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`ОК: ${url}\n  10 комнат, площади согласованы; скриншоты в tools/out/`);
})().catch(e => { console.error('ПРОВАЛ:', e.message); process.exit(1); });
