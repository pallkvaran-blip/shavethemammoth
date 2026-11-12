// Drives the real page with real input: picks up the shears, holds the snip
// key at a foreleg, walks, and reports how much was cut and any script errors.
//   node tools/snip-test.mjs            (needs `npm run dev` running)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const base = process.env.BASE || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|Shader Error|GL_INVALID|INVALID_/.test(m.text())) errors.push(m.text().slice(0, 700)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').slice(0, 400)));
// start beside the right foreleg, close enough for the shears to lie on the hide
await page.goto(base + '?q=low&strands=40000&stats&debug&elf=1.413,0.896,0.76,0.14', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 300000 });
await page.waitForTimeout(3000);
const read = () => page.evaluate(() => { const g = window.__game, s = g.shaving; return `${document.getElementById('progress').textContent} | snips ${s.snips}, clippings ${s.clippings.count} (${s.clippings.active.length} falling), shears ${s.shears.lying > 0.5 ? 'flat on the hide' : 'held free'}`; });
console.log('before:', await read());
await page.screenshot({ path: 'shots/snip_a.png', timeout: 300000 });
for (let i = 0; i < 4; i++) {
  await page.keyboard.down('Space');
  await page.waitForTimeout(2500);
  if (i === 1) await page.screenshot({ path: 'shots/snip_b.png', timeout: 300000 });
  await page.keyboard.up('Space');
  await page.waitForTimeout(1500);
  console.log(`after hold ${i + 1}:`, await read());
}
await page.keyboard.down('KeyA'); await page.waitForTimeout(2500); await page.keyboard.up('KeyA');
await page.keyboard.down('Space'); await page.waitForTimeout(4000); await page.keyboard.up('Space');
await page.waitForTimeout(3000);
console.log('after stepping aside and cutting again:', await read());
await page.screenshot({ path: 'shots/snip_c.png', timeout: 300000 });
console.log('stats:', await page.$eval('#stats', (el) => el.textContent));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no script errors');
await browser.close();
