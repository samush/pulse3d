// Визуализация закреплённого ракурса: кадр сцены → Gemini → пара «кадр + результат» в renders/<ракурс>/.
//
//   node tools/render.js --list | <ракурс> [--frame-only] [--reuse-frame] [--note "..."]
//   node tools/render.js <ракурс> --fix "<что должно быть>"    # правка предыдущего результата, до трёх на кадр
//
// Промпт — renders/STYLE.md, порядок работы — .claude/skills/render/SKILL.md, приёмы — docs/render-guide.md.
// Ключ GEMINI_API_KEY приходит из окружения (hub run claude).
const fs = require('fs');
const path = require('path');
const { launchChromium } = require('./browser');

const root = path.dirname(__dirname);
const args = process.argv.slice(2);
const VALUED = ['note', 'fix', 'model', 'size', 'viewport', 'aspect'];                       // флаги со значением: их аргумент — не имя ракурса
const flag = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const has = name => args.includes('--' + name);
const cam = args.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(args[i - 1].replace(/^--/, ''))));

const fix = flag('fix', '');
const MODEL = flag('model', fix ? 'gemini-3.1-flash-image' : 'gemini-3-pro-image');          // база — дорогая модель, правки — дешевле
const SIZE = flag('size', '2K');                                                            // 2K при 16:9 — 2048×1152, ближайшее к 1080p
const [W, H] = flag('viewport', '1920x1080').split('x').map(Number);
const ASPECT = flag('aspect', '16:9');
const MAX_FIXES = 3;

const framePath = cam ? path.join(root, 'renders', 'frames', cam + '.png') : '';
const dir = cam ? path.join(root, 'renders', cam) : '';
const pair = name => path.join(dir, cam + '-' + name);                                      // кадр и результат лежат рядом и листаются подряд

const rel = p => path.relative(root, p);
const readMeta = () => { try { return JSON.parse(fs.readFileSync(pair('render.json'), 'utf8')); } catch (e) { return null; } };
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
  await page.evaluate(id => { VIZ.set(true); LIGHTING.set('lamps'); const a = document.getElementById('avatarOn'); a.checked = false; a.dispatchEvent(new Event('change')); setView(id);
    document.getElementById('ui').style.display = 'none'; document.querySelectorAll('.hint, .rl, #walkpad, #fpvhint, #camhint, #map').forEach(e => { e.style.display = 'none'; }); }, cam);
  await page.waitForTimeout(2500); // PBR-двойники и тени успевают собраться
  fs.mkdirSync(path.dirname(framePath), { recursive: true });
  await page.locator('#c').screenshot({ path: framePath, timeout: 120000 });
  await browser.close();
  console.log('кадр: ' + rel(framePath));
  if (has('frame-only')) return;
  return send();
})();


// кадр (+ предыдущий результат, если это правка) и стиль → Gemini → renders/<ракурс>/
async function send() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.error('нет GEMINI_API_KEY: hub secrets set GEMINI_API_KEY, затем перезапустить агента через hub run claude'); process.exit(2); }

  const style = fs.readFileSync(path.join(root, 'renders', 'STYLE.md'), 'utf8');
  const shot = style.split(/^## /m).find(s => s.startsWith(cam));                            // «## <ракурс>» — заметки именно про этот вид
  const common = style.split(/^## /m)[0].trim();
  const meta = readMeta();
  const prev = pair('2-final.jpg');
  let input, prompt, fixes = meta ? meta.fixes || 0 : 0;

  if (fix) {
    if (!fs.existsSync(prev)) { console.error('нечего править: сначала базовый прогон без --fix'); process.exit(1); }
    if (fixes >= MAX_FIXES && !has('force')) { console.error('правок уже ' + fixes + ' из ' + MAX_FIXES + ': дальше --force или новый базовый прогон (модель уплывает от геометрии)'); process.exit(5); }
    fixes++;
    // правка, а не перегенерация: что менять — одной фразой, всё остальное сохраняется дословно; якорь геометрии идёт последним, от него наследуется кадрирование
    prompt = 'Image 1 is a photorealistic render to edit. Image 2 is the 3D scene it was made from — the geometry anchor: room shape, openings, camera and the placement of large furniture must match it.\n\n'
      + 'Keep everything else in image 1 exactly the same — same geometry, same camera, same materials, same lighting, same aspect ratio. Only fix: ' + fix + '\n\n'
      + (shot ? 'Shot notes: ' + shot.trim() + '\n\n' : '') + 'Style reminder: ' + common.split('\n\n').slice(3).join(' ').slice(0, 900);
    input = [{ type: 'text', text: prompt }, img(prev), img(framePath)];
    console.log('правка ' + fixes + '/' + MAX_FIXES + ' на ' + MODEL);
  } else {
    fixes = 0;
    prompt = [common, shot ? '\n## ' + shot.trim() : '', flag('note', '') && '\nAlso for this shot: ' + flag('note', '')].filter(Boolean).join('\n');
    input = [{ type: 'text', text: prompt }, img(framePath)];
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
  if (!res.ok || !out) { const dump = path.join(root, 'renders', 'frames', 'last-response.json'); fs.writeFileSync(dump, JSON.stringify(body, null, 1));
    console.error('Gemini ' + res.status + ': нет картинки в ответе, целиком в ' + rel(dump)); process.exit(3); }

  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(framePath, pair('1-frame.png'));                                           // пара: кадр и результат под одним именем
  fs.writeFileSync(prev, Buffer.from(out.data, 'base64'));
  fs.writeFileSync(pair('render.json'), JSON.stringify({ cam, model: MODEL, size: SIZE, aspect: ASPECT, viewport: [W, H], fixes, note: flag('note', '') || undefined, lastFix: fix || undefined, prompt, at: new Date().toISOString() }, null, 1));
  console.log('готово: ' + rel(prev) + '\nпара:   ' + rel(pair('1-frame.png')));
}
