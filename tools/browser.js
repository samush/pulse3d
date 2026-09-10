// Запуск Chromium для Playwright: сборка из образа часто не совпадает с той, которую ждёт закреплённый playwright.
// Пробуем по очереди: штатный запуск, CHROMIUM_PATH, любой chromium-* в кэше playwright, путь облачного окружения.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

function candidates() {
  const out = [process.env.CHROMIUM_PATH];
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  try { fs.readdirSync(cache).filter(d => d.startsWith('chromium-')).sort().reverse()
    .forEach(d => ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'].forEach(f => out.push(path.join(cache, d, f)))); } catch (e) {}
  out.push('/opt/pw-browsers/chromium');
  return out.filter(p => p && fs.existsSync(p));
}

// возвращает браузер или бросает ошибку с текстом всех попыток — «браузер не нашёлся» не должно выглядеть как «тест прошёл»
async function launchChromium(opts = {}) {
  const errs = [];
  try { return await chromium.launch(opts); } catch (e) { errs.push('chromium.launch(): ' + e.message.split('\n')[0]); }
  for (const executablePath of candidates()) {
    try { return await chromium.launch({ ...opts, executablePath }); } catch (e) { errs.push(executablePath + ': ' + e.message.split('\n')[0]); }
  }
  throw new Error(errs.join('\n  '));
}
module.exports = { launchChromium };
