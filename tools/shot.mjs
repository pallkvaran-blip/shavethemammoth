// Headless screenshot helper for visual checks.
//   node tools/shot.mjs <out.png> "<query string>" [width] [height] [timeoutMs]
// Needs a dev server (npm run dev) on port 5173, or pass BASE=http://host:port/.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const [out = 'shots/shot.png', query = '', w = '1280', h = '720', timeout = '240000'] = process.argv.slice(2);
const base = process.env.BASE || 'http://localhost:5173/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
const t0 = Date.now();
await page.goto(base + (query ? '?' + query : ''), { waitUntil: 'load' });
try {
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: +timeout });
} catch (e) {
  logs.push('[shot] timed out waiting for __shotReady');
}
await page.screenshot({ path: out, timeout: 300000 });
const info = await page.evaluate(() => window.__info || null);
console.log(logs.filter((l) => !/Download the|\[vite\]/.test(l)).join('\n'));
if (info) console.log('info:', JSON.stringify(info));
console.log(`saved ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close();
