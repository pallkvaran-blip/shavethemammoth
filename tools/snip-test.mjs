// Drives the real page with real input: picks up each tool in turn (number
// keys and the wheel), holds the snip key at a foreleg, walks, and reports how
// much was cut and any script errors.
//
// Without a graphics card a frame takes seconds (about ten, in software), so
// the test counts frames rather than seconds: every wait is "until the game
// has drawn n more frames", and the game advances a tenth of a second in each.
// It takes about ten minutes that way; with a graphics card, a few seconds.
//   node tools/snip-test.mjs            (needs `npm run dev` running; SHOTS=1 also saves pictures)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const base = process.env.BASE || 'http://localhost:5173/';
const shots = !!process.env.SHOTS;   // SHOTS=1 also saves pictures (slow without a graphics card)
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|Shader Error|GL_INVALID|INVALID_/.test(m.text())) errors.push(m.text().slice(0, 700)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').slice(0, 400)));
// start beside the right foreleg with the garden clippers, close enough for them to lie on the hide
await page.goto(base + '?q=low&strands=40000&adapt=5&stats&debug&sync&tool=garden&elf=1.413,0.896,0.76,0.14', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 300000 });

let drawn = 0;
const started = Date.now();
/** Wait until the game has drawn n more frames. */
const frames = async (n) => {
  await page.evaluate((count) => new Promise((done) => { let k = 0; const tick = () => (++k > count ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
  drawn += n;
};
const state = () => page.evaluate(() => {
  const g = window.__game, s = g.shaving;
  return {
    tool: s.tool.id, name: s.tool.name, lit: [...document.querySelectorAll('[data-tool][aria-pressed="true"]')].map((b) => b.dataset.tool).join('+'),
    flat: s.tool.lying > 0.5, reach: +(g.rig.reach * 100).toFixed(1), up: s.lowered === 0, snips: s.snips, cut: s.clippings.count, falling: s.clippings.active.length, missed: s.missed,
    shorn: document.getElementById('progress').textContent,
  };
});
const say = (label, s) => console.log(`${label}: ${s.shorn} | ${s.name} (button lit: ${s.lit}), ${s.flat ? 'flat on the hide' : 'held free'}, eyes may come within ${s.reach} cm | snips ${s.snips}, locks cut ${s.cut} (${s.falling} falling), slipped out uncut ${s.missed}`);
const check = (ok, what) => { if (!ok) errors.push('CHECK FAILED: ' + what); console.log(`  ${ok ? 'ok' : 'FAILED'}: ${what}`); };
const hold = async (key, n) => { await page.keyboard.down(key); await frames(n); await page.keyboard.up(key); };
/** Stand the elf a little further round the leg (so each tool meets uncut hair), facing it; it then walks up as close as the tool allows. */
const moveRound = async (turn) => {
  await page.evaluate((by) => {
    const g = window.__game, rig = g.rig;
    const foot = g.mammoth.data.anat.feet.reduce((a, b) => (Math.hypot(a.c[0] - rig.pos.x, a.c[2] - rig.pos.z) < Math.hypot(b.c[0] - rig.pos.x, b.c[2] - rig.pos.z) ? a : b));
    const at = Math.atan2(rig.pos.z - foot.c[2], rig.pos.x - foot.c[0]) + by, d = foot.r + 0.45;
    rig.pos.x = foot.c[0] + Math.cos(at) * d; rig.pos.z = foot.c[2] + Math.sin(at) * d;
    rig.yaw = Math.atan2(-(foot.c[0] - rig.pos.x), -(foot.c[2] - rig.pos.z)); rig.pitch = 0.14;
  }, turn);
  await hold('KeyW', 4);
};

await frames(2);
let was = await state();
say('before', was);
if (shots) await page.screenshot({ path: 'shots/snip_a.png', timeout: 300000 });

// ---- garden clippers ----
await hold('Space', 7);
await frames(2);
let now = await state();
say('garden clippers', now);
check(now.snips > was.snips && now.cut > was.cut, 'holding the snip key with the garden clippers cuts hair');
check(now.missed === 0, 'good blades cut everything between them');
if (shots) await page.screenshot({ path: 'shots/snip_b.png', timeout: 300000 });

// ---- the number keys change tool; a shorter one lets the elf step in closer ----
was = now;
await page.keyboard.press('Digit2');
await frames(7);
now = await state();
check(now.tool === 'sheep' && now.lit === 'sheep' && now.up, 'key 2 brings up the shears and lights their button');
await moveRound(0.6);
await hold('Space', 7);
await frames(2);
now = await state();
say('shears', now);
check(now.snips > was.snips && now.cut > was.cut, 'the shears cut hair');
check(now.reach < 20, 'with the shears the elf may come closer than with the clippers');

// ---- so does the wheel: one notch up is the next smaller tool ----
was = now;
await page.mouse.move(240, 135);
await page.mouse.wheel(0, -120);
await frames(7);
now = await state();
check(now.tool === 'scissors' && now.lit === 'scissors' && now.up, 'one notch of the wheel brings up the small bad scissors');
await moveRound(0.6);
await hold('Space', 9);
await frames(2);
now = await state();
say('small bad scissors', now);
check(now.snips > was.snips, 'the small bad scissors snip');
// their bite is so small that a few strokes meet only a lock or two: take thirty strokes at once along the leg to see how they cut
const bad = await page.evaluate(() => {
  const { shaving: s, rig, camera } = window.__game;
  const cut0 = s.clippings.count, missed0 = s.missed, yaw = rig.yaw;
  let between = 0;
  rig.yaw -= 0.3;
  for (let i = 0; i < 30; i++) {
    rig.yaw += 0.02; rig.update(1 / 60); camera.updateMatrixWorld(true);
    s.tool.away = 0; s.tool.place(1, camera, rig.feel, s.world);
    between += s.snipNow(camera);
  }
  rig.yaw = yaw; rig.update(1 / 60); camera.updateMatrixWorld(true);
  return { between, cut: s.clippings.count - cut0, missed: s.missed - missed0 };
});
console.log(`  thirty strokes along the leg: ${bad.between} locks came between the blades (counting each time), ${bad.cut} were cut, ${bad.missed} slipped out`);
check(bad.cut > 0 && bad.missed > 0, 'bad scissors cut some of what they bite and let the rest slip out');
if (shots) await page.screenshot({ path: 'shots/snip_c.png', timeout: 300000 });

// ---- changing twice before the hands are back up ends on the last choice ----
was = await state();
await page.mouse.wheel(0, 120);
await page.mouse.wheel(0, 120);
await frames(8);
now = await state();
check(now.tool === 'garden' && now.lit === 'garden' && now.up, 'two notches back, at once, ends on the garden clippers');
await moveRound(0.6);
await hold('Space', 7);
await frames(2);
now = await state();
say('further round the leg, garden clippers again', now);
check(now.snips > was.snips && now.cut > was.cut, 'the clippers cut again after the change');
check(now.reach > 24, 'and the elf has stepped back to their length');

console.log(`${drawn} frames in ${((Date.now() - started) / 1000).toFixed(0)} s: ${((Date.now() - started) / drawn / 1000).toFixed(1)} s per frame here`);
console.log('stats:', await page.$eval('#stats', (el) => el.textContent));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no script errors, every check passed');
await browser.close();
