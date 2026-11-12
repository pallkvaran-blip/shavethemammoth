// Drives the real page (not shot mode) through its controls and reports any
// script errors. Slow in software rendering, so it uses a small window.
//   node tools/smoke.mjs            (needs `npm run dev` running)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const base = process.env.BASE || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 520, height: 300 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|Shader Error|GL_INVALID|INVALID_/.test(m.text())) errors.push(m.text().slice(0, 600)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const step = async (name, fn, wait = 2500) => {
  await fn();
  await page.waitForTimeout(wait);
  console.log(`ok: ${name}`);
};
await page.goto(base + '?q=low&strands=20000&stats', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 240000 });
await page.waitForTimeout(4000);
await step('view 2', () => page.click('#view-1'));
await step('sun to 18 degrees', () => page.$eval('#sun', (el) => { el.value = '18'; el.dispatchEvent(new Event('input', { bubbles: true })); }), 4000);
await page.screenshot({ path: 'shots/smoke_sun18.png', timeout: 300000 });
await step('sun to 3 degrees', () => page.$eval('#sun', (el) => { el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true })); }), 4000);
await page.screenshot({ path: 'shots/smoke_sun3.png', timeout: 300000 });
await step('detail medium (regrows the coat)', () => page.selectOption('#detail', 'medium'), 6000);
await step('detail low', () => page.selectOption('#detail', 'low'), 4000);
await step('key 3', () => page.keyboard.press('Digit3'), 4000);
await step("elf's-eye view", () => page.click('#view-elf'), 3000);
await step('walk', async () => { await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW'); }, 1000);
await page.screenshot({ path: 'shots/smoke_elf.png', timeout: 300000 });
await step('leave elf view', () => page.keyboard.press('KeyE'), 3000);
await step('hide controls', () => page.keyboard.press('KeyH'), 800);
await step('show controls', () => page.keyboard.press('KeyH'), 800);
const stats = await page.$eval('#stats', (el) => el.textContent);
console.log('stats:', stats);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no script errors');
await browser.close();
