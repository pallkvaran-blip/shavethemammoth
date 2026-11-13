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
page.setDefaultTimeout(300000);   // (a click waits for two frames, and without a graphics card a frame takes seconds)
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|Shader Error|GL_INVALID|INVALID_/.test(m.text())) errors.push(m.text().slice(0, 600)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const step = async (name, fn, wait = 2500) => {
  await fn();
  await page.waitForTimeout(wait);
  console.log(`ok: ${name}`);
};
await page.goto(base + '?q=low&strands=20000&adapt=5&stats&sync&unlock&nosave&debug', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 240000 });
// the legend is told over the opening shot; the controls come up when it ends
const lines = await page.$$eval('#legend p', (ps) => ps.map((p) => p.textContent));
console.log(`legend: ${lines.length} lines, ending "${lines[lines.length - 1]}"`);
await page.waitForFunction(() => document.body.classList.contains('told'), null, { timeout: 60000 });
console.log('ok: the legend was told and the controls came up');
await page.waitForTimeout(2500);
await step('view 2', () => page.click('#view-1'));
await step('sun to 18 degrees', () => page.$eval('#sun', (el) => { el.value = '18'; el.dispatchEvent(new Event('input', { bubbles: true })); }), 4000);
await page.screenshot({ path: 'shots/smoke_sun18.png', timeout: 300000 });
await step('sun to 3 degrees', () => page.$eval('#sun', (el) => { el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true })); }), 4000);
await page.screenshot({ path: 'shots/smoke_sun3.png', timeout: 300000 });
await step('detail medium (regrows the coat)', () => page.selectOption('#detail', 'medium'), 6000);
await step('detail low', () => page.selectOption('#detail', 'low'), 4000);
await step('key 3', () => page.keyboard.press('Digit3'), 4000);
await step('choose the shears', () => page.click('#tool-sheep'), 800);
await step("elf's-eye view", () => page.click('#view-elf'), 3000);
await step('walk', async () => { await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW'); }, 1000);
await page.screenshot({ path: 'shots/smoke_elf.png', timeout: 300000 });
await step('key 1 (small bad scissors)', () => page.keyboard.press('Digit1'), 3000);
await step('snip', async () => { await page.keyboard.down('Space'); await page.waitForTimeout(1500); await page.keyboard.up('Space'); }, 1000);
await step('key 3 (garden clippers)', () => page.keyboard.press('Digit3'), 3000);
await step('key 4 (electric shears)', () => page.keyboard.press('Digit4'), 3000);
await step('run them', async () => { await page.keyboard.down('Space'); await page.waitForTimeout(2500); await page.keyboard.up('Space'); }, 1500);
await step('key 5 (beard shaver)', () => page.keyboard.press('Digit5'), 3000);
await step('run it', async () => { await page.keyboard.down('Space'); await page.waitForTimeout(2500); await page.keyboard.up('Space'); }, 1500);
// up the ladder and down it; then the pack. (Counted in frames, not seconds: without a graphics card a frame can
// take longer than a key would be held, and a key pressed and let go between two frames does nothing.)
const frames = (n) => page.evaluate((count) => new Promise((done) => { let k = 0; const tick = () => (++k > count ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
const holdFor = async (key, n) => { await page.keyboard.down(key); await frames(n); await page.keyboard.up(key); await frames(1); };
await holdFor('KeyR', 5);
const up = await page.evaluate(() => ({ height: +window.__game.rig.height.toFixed(2), ladder: !!window.__game.rig.ladder }));
console.log(`ok: R (up the ladder): on it ${up.ladder}, ${up.height} m up`);
if (!up.ladder || up.height <= 0) errors.push('R did not climb the ladder');
await page.screenshot({ path: 'shots/smoke_ladder.png', timeout: 300000 });
await holdFor('KeyF', 12);
const down = await page.evaluate(() => ({ height: +window.__game.rig.height.toFixed(2), ladder: !!window.__game.rig.ladder }));
console.log(`ok: F (down again): ${down.height} m up, ladder ${down.ladder ? 'still standing' : 'put away'}`);
await step('T (the pack instead)', () => page.keyboard.press('KeyT'), 1000);
await holdFor('KeyR', 5);
const air = await page.evaluate(() => ({ height: +window.__game.rig.height.toFixed(2), lift: window.__game.rig.lift && window.__game.rig.lift.id }));
console.log(`ok: R (burn): in the air on the ${air.lift}, ${air.height} m up`);
if (!(air.height > 0)) errors.push('R did not burn the pack');
await page.screenshot({ path: 'shots/smoke_air.png', timeout: 300000 });
await holdFor('KeyF', 8);
await step('Q (the best thing owned for picking hair up)', () => page.keyboard.press('KeyQ'), 3000);
await step('run it', async () => { await page.keyboard.down('Space'); await page.waitForTimeout(2500); await page.keyboard.up('Space'); }, 1500);
await step('Q (back to cutting)', () => page.keyboard.press('KeyQ'), 3000);
// the traders: walk up to each (placed there, to save a long slow walk) and talk
for (const [who, name] of [['gnome', 'Gnorman'], ['vulture', 'Mortimer']]) {
  await page.evaluate((w) => { const { rig, game } = window.__game, at = game.people[w]; rig.pos.x = at.front[0]; rig.pos.z = at.front[1]; rig.yaw = Math.atan2(-(at.x - rig.pos.x), -(at.z - rig.pos.z)); rig.pitch = 0.15; }, who);
  await page.waitForFunction(() => !document.getElementById('prompt').hidden, null, { timeout: 120000 });
  await step(`E talks to ${name}`, () => page.keyboard.press('KeyE'), 3000);
  const open = await page.evaluate(() => ({ who: window.__game.game.dialog, rows: document.querySelectorAll('#dialog li').length, text: document.querySelector('#dialog h2')?.textContent }));
  console.log(`  dialog: ${open.text} (${open.rows} things for sale)`);
  if (open.who !== who) errors.push(`E did not open ${name}'s dialog`);
  if (who === 'gnome') await page.screenshot({ path: 'shots/smoke_shop.png', timeout: 300000 });
  await step('E again leaves', () => page.keyboard.press('KeyE'), 2000);
}
await step('leave elf view', () => page.keyboard.press('Escape'), 3000);
const left = await page.evaluate(() => window.__game.rig.mode);
if (left === 'elf') errors.push('Escape did not leave the elf view');
await step('hide controls', () => page.keyboard.press('KeyH'), 800);
await step('show controls', () => page.keyboard.press('KeyH'), 800);
const stats = await page.$eval('#stats', (el) => el.textContent);
console.log('stats:', stats);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no script errors');
await browser.close();
