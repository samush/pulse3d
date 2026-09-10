// Реалистичная визуализация закреплённого ракурса: чистый кадр сцены → Gemini → картинка в renders/.
//
//   node tools/render.js r4-door                 # кадр + генерация
//   node tools/render.js r4-door --frame-only    # только чистый кадр (без API, бесплатно)
//   node tools/render.js r4-door --note "вечер, шторы задёрнуты"
//   node tools/render.js --list                  # какие ракурсы есть (CAMS из app.js)
//
// Стиль и постоянные требования — renders/STYLE.md: общая часть плюс раздел «## <ракурс>», если он есть.
// Ключ: GEMINI_API_KEY в окружении (hub secrets set GEMINI_API_KEY, затем hub run claude).
// Модели и цена за картинку (2026-09): gemini-3.1-flash-image $0.067, -lite $0.034 (только 1K), gemini-3-pro-image $0.134.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.dirname(__dirname);
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const has = name => args.includes('--' + name);
const cam = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--note' && args[args.indexOf(a) - 1] !== '--model' && args[args.indexOf(a) - 1] !== '--size');

const MODEL = flag('model', 'gemini-3.1-flash-image');
const SIZE = flag('size', '2K');            // 1K дешевле у lite, 2K у flash стоит столько же, сколько 1K
const [W, H] = flag('viewport', '1280x960').split('x').map(Number);
const ASPECT = flag('aspect', '4:3');

(async () => {
  let browser;
  try { browser = await chromium.launch({ args: ['--allow-file-access-from-files'] }); }
  catch (e) { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] }); }
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForFunction(() => window.setView && window.VIZ && window.LIGHTING);
  const cams = await page.evaluate(() => CAMS.map(c => ({ id: c.id, label: c.label })));

  if (has('list') || !cam) {
    console.log(cams.map(c => '  ' + c.id.padEnd(12) + c.label).join('\n'));
    await browser.close(); process.exit(cam ? 0 : 1);
  }
  if (!cams.some(c => c.id === cam)) { console.error('нет такого ракурса: ' + cam + ' (--list покажет все)'); await browser.close(); process.exit(1); }

  // чистый кадр: материалы и светильники включены, аватар и панель убраны, снимается только канвас
  await page.evaluate(id => { VIZ.set(true); LIGHTING.set('lamps'); const a = document.getElementById('avatarOn'); a.checked = false; a.dispatchEvent(new Event('change')); setView(id);
    document.getElementById('ui').style.display = 'none'; document.querySelectorAll('.hint, .rl, #walkpad, #fpvhint, #camhint, #map').forEach(e => { e.style.display = 'none'; }); }, cam); // панель, мини-карта и подсказки лежат поверх канваса и попадают в скриншот области
  await page.waitForTimeout(2500); // PBR-двойники и тени успевают собраться
  const framePath = path.join(root, 'renders', 'frames', cam + '.png');
  fs.mkdirSync(path.dirname(framePath), { recursive: true });
  await page.locator('#c').screenshot({ path: framePath, timeout: 120000 });
  await browser.close();
  console.log('кадр: ' + path.relative(root, framePath));
  if (has('frame-only')) return;

  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.error('нет GEMINI_API_KEY: hub secrets set GEMINI_API_KEY, затем перезапустить агента через hub run claude'); process.exit(2); }

  const style = fs.readFileSync(path.join(root, 'renders', 'STYLE.md'), 'utf8');
  const section = style.split(/^## /m).find(s => s.startsWith(cam));            // «## <ракурс>» — заметки именно про этот вид
  const common = style.split(/^## /m)[0];
  const prompt = [common.trim(), section ? '\n' + section.trim() : '', flag('note', '') && '\nДополнительно: ' + flag('note', '')].filter(Boolean).join('\n');

  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: 'text', text: prompt }, { type: 'image', mime_type: 'image/png', data: fs.readFileSync(framePath).toString('base64') }],
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: ASPECT, image_size: SIZE },
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.output_image) { console.error('Gemini ' + res.status + ': ' + JSON.stringify(body).slice(0, 600)); process.exit(3); }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
  const dir = path.join(root, 'renders', cam); fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, stamp + '.jpg');
  fs.writeFileSync(out, Buffer.from(body.output_image.data, 'base64'));
  fs.writeFileSync(path.join(dir, stamp + '.json'), JSON.stringify({ cam, model: MODEL, size: SIZE, aspect: ASPECT, viewport: [W, H], note: flag('note', '') || undefined, prompt, frame: path.relative(root, framePath), at: new Date().toISOString() }, null, 1));
  console.log('готово: ' + path.relative(root, out) + '\nсравнить с кадром: ' + path.relative(root, framePath));
})();
