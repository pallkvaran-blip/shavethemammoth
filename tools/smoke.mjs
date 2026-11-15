// Drives the real page (not shot mode) through its controls and reports any
// script errors. Slow in software rendering, so it uses a small window.
//   node tools/smoke.mjs            (needs `npm run dev` running)
import { launch } from './browser.mjs';

const base = process.env.BASE || 'http://localhost:5173/';
const browser = await launch();
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
// Keys that are held are held for so many frames as well as so long: without a graphics card a frame can take longer
// than the key would be held, and a key pressed and let go between two frames does nothing.
const frames = (n) => page.evaluate((count) => new Promise((done) => { let k = 0; const tick = () => (++k > count ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
const holdFor = async (key, n) => { await page.keyboard.down(key); await frames(n); await page.keyboard.up(key); await frames(1); };
const hold = async (key, ms, n = 2) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await frames(n); await page.keyboard.up(key); await frames(1); };
await page.goto(base + '?q=low&strands=20000&adapt=9&stats&sync&unlock&nosave&debug', { waitUntil: 'load' });
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
await step('walk', () => hold('KeyW', 1500), 1000);
await page.screenshot({ path: 'shots/smoke_elf.png', timeout: 300000 });
await step('key 1 (small bad scissors)', () => page.keyboard.press('Digit1'), 3000);
await step('snip', () => hold('Space', 1500), 1000);
await step('key 3 (garden clippers)', () => page.keyboard.press('Digit3'), 3000);
await step('key 4 (electric shears)', () => page.keyboard.press('Digit4'), 3000);
await step('run them', () => hold('Space', 2500), 1500);
await step('key 5 (beard shaver)', () => page.keyboard.press('Digit5'), 3000);
await step('run it', () => hold('Space', 2500), 1500);
// up the ladder and down it; then the pack
await holdFor('KeyR', 3);
const up = await page.evaluate(() => ({ height: +window.__game.rig.height.toFixed(2), ladder: !!window.__game.rig.ladder }));
console.log(`ok: R (up the ladder): on it ${up.ladder}, ${up.height} m up`);
if (!up.ladder || up.height <= 0) errors.push('R did not climb the ladder');
await page.screenshot({ path: 'shots/smoke_ladder.png', timeout: 300000 });
await holdFor('KeyF', 2);
// (the rest of the way down would take this machine minutes; tools/loop-test.mjs climbs all the way down)
await page.evaluate(() => { const { rig } = window.__game; rig.height = 0; rig.ladder = null; rig.onLift('away'); });
await step('T (the pack instead)', () => page.keyboard.press('KeyT'), 1000);
await holdFor('KeyR', 3);
const air = await page.evaluate(() => ({ height: +window.__game.rig.height.toFixed(2), lift: window.__game.rig.lift && window.__game.rig.lift.id }));
console.log(`ok: R (burn): in the air on the ${air.lift}, ${air.height} m up`);
if (!(air.height > 0)) errors.push('R did not burn the pack');
await page.screenshot({ path: 'shots/smoke_air.png', timeout: 300000 });
await holdFor('KeyF', 2);
await page.evaluate(() => { const { rig } = window.__game; rig.height = 0; rig.vy = 0; });
await step('Q (the best thing owned for picking hair up)', () => page.keyboard.press('KeyQ'), 3000);
await step('run it', () => hold('Space', 2500), 1500);
await step('Q (back to cutting)', () => page.keyboard.press('KeyQ'), 3000);
// the novelties: G takes one out, then the next, then puts them away; and one of them is used, in real frames
const inHand = () => page.evaluate(() => { const s = window.__game.shaving; return s.next || s.tool.id; });
const cutter = await inHand();
await step('G with no novelty to take out', () => page.keyboard.press('KeyG'), 800);
if ((await inHand()) !== cutter) errors.push('G took something out when there was nothing to take');
await page.evaluate(() => { const { game, rig } = window.__game; game.state.owned.add('feather'); game.state.owned.add('watch'); game.refresh(); rig.pos.x = 1.6; rig.pos.z = 1.15; rig.yaw = 0.8; rig.pitch = 0.25; });
await step('G (the feather)', () => page.keyboard.press('KeyG'), 3000);
if ((await inHand()) !== 'feather') errors.push('G did not take out the feather');
await page.keyboard.down('Space'); await page.waitForTimeout(2500); await frames(3);
const tickled = await page.evaluate(() => ({ on: window.__game.game.gags.on, progress: +window.__game.game.gags.progress.toFixed(2), label: document.querySelector('#aim span').textContent }));
await page.keyboard.up('Space'); await frames(1);
console.log('ok: tickle him');
console.log(`  the feather: "${tickled.label}", ${Math.round(tickled.progress * 100)}% of the way`);
if (!(tickled.progress > 0)) errors.push('holding the button with the feather on his leg did nothing');
await step('G (the next: the watch)', () => page.keyboard.press('KeyG'), 3000);
if ((await inHand()) !== 'watch') errors.push('G did not go on to the watch');
await step('G (after the last: the tool he was using)', () => page.keyboard.press('KeyG'), 3000);
if ((await inHand()) !== cutter) errors.push('G did not put the novelties away');
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
process.exitCode = errors.length ? 1 : 0;
