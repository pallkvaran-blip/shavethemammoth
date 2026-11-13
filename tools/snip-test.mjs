// Drives the real page with real input: picks up each tool in turn (number
// keys and the wheel), cuts at a foreleg with it, and reports how much was cut
// and any script errors.
//
// Without a graphics card a frame takes a second or more, so the test counts
// frames rather than seconds: every wait is "until the game has drawn n more
// frames", and the game advances a tenth of a second in each. The land is left
// undrawn (?bare), which is most of what makes a frame slow here.
//   node tools/snip-test.mjs            (needs `npm run dev` running; SHOTS=1 also saves pictures)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const base = process.env.BASE || 'http://localhost:5173/';
const shots = !!process.env.SHOTS;   // SHOTS=1 also saves pictures
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|Shader Error|GL_INVALID|INVALID_/.test(m.text())) errors.push(m.text().slice(0, 700)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').slice(0, 400)));
// start beside the right foreleg with the garden clippers, close enough for them to lie on the hide
await page.goto(base + '?q=low&strands=40000&adapt=5&stats&debug&sync&bare&tool=garden&elf=1.413,0.896,0.76,0.14', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 300000 });

let drawn = 0;
const started = Date.now();
/** Wait until the game has drawn n more frames. */
const frames = async (n) => {
  await page.evaluate((count) => new Promise((done) => { let k = 0; const tick = () => (++k > count ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
  drawn += n;
};
const state = () => page.evaluate(() => {
  const g = window.__game, s = g.shaving, t = s.tool;
  let bare = 0, short = 0;
  for (const c of g.mammoth.chunks) for (let i = 0; i < c.count; i++) { const v = c.arrays.iCut[i]; if (v < 0.001) bare++; else if (v < 0.006) short++; }
  return {
    tool: t.id, name: t.name, lit: [...document.querySelectorAll('[data-tool][aria-pressed="true"]')].map((b) => b.dataset.tool).join('+'),
    flat: t.lying > 0.5, reach: +(g.rig.reach * 100).toFixed(1), up: s.lowered === 0, snips: s.snips, cut: s.clippings.count, falling: s.clippings.active.length, missed: s.missed,
    mown: s.mown, power: +t.power.toFixed(2), load: +t.load.toFixed(2), bare, short,
    shorn: document.getElementById('progress').textContent,
  };
});
const say = (label, s) => console.log(`${label}: ${s.shorn} | ${s.name} (button lit: ${s.lit}), ${s.flat ? 'flat on the hide' : 'held free'}, eyes may come within ${s.reach} cm | snips ${s.snips}, locks cut ${s.cut} (${s.falling} falling), slipped out uncut ${s.missed}, taken by a motor ${s.mown}; locks down to stubble ${s.short}, to bare skin ${s.bare}`);
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
/** Hold the cut key and raise the eyes a little each frame: an electric tool run up the leg. Returns what it was doing part way. */
const runUp = async (n, rise) => {
  await page.evaluate(() => { window.__game.rig.pitch = -0.05; });
  await frames(2);
  await page.keyboard.down('Space');
  await frames(2);
  let mid = null;
  for (let i = 0; i < n; i++) {
    await page.evaluate((by) => { window.__game.rig.pitch += by; }, rise / n);
    await frames(1);
    if (i === Math.floor(n / 2)) mid = await state();
  }
  await frames(2);
  await page.keyboard.up('Space');
  await frames(11);   // (a motor takes a moment to run down)
  return mid;
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
check(now.snips > was.snips && now.cut > was.cut, 'holding the cut key with the garden clippers cuts hair');
check(now.missed === 0, 'good blades cut everything between them');

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

// ---- so does the wheel: one notch up is the tool before ----
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

// ---- electric shears: no stroke; they run while the key is held, and take what the comb is pushed through ----
await page.keyboard.press('Digit4');
await frames(7);
now = await state();
check(now.tool === 'electric' && now.lit === 'electric' && now.up, 'key 4 brings up the electric shears');
check(now.power === 0, 'their motor is off until the key is held');
await moveRound(0.6);
was = await state();
let mid = await runUp(12, 0.4);
now = await state();
say('electric shears', now);
check(mid.power > 0.9 && mid.flat, 'held, they run, lying on the hide');
check(now.mown > was.mown && now.short > was.short, 'run up the leg they leave a strip of stubble');
check(now.bare === was.bare, 'but nothing shaved to the skin');
check(now.power < 0.1, 'and they run down when the key is let go');
if (shots) await page.screenshot({ path: 'shots/snip_b.png', timeout: 300000 });

// ---- beard shaver, over the same strip: stubble down to bare skin ----
was = now;
await page.mouse.wheel(0, 120);
await frames(7);
now = await state();
check(now.tool === 'shaver' && now.lit === 'shaver' && now.up, 'one notch on is the beard shaver');
await moveRound(0);   // the same strip, from as close as the shaver allows
mid = await runUp(12, 0.5);
check(mid.power > 0.9 && mid.flat, 'held, it runs, lying on the hide');
// its strip is narrow, and in this sparse test coat may hold a lock or none: go over the breadth of the stubble, at once, to see what it does to it
await page.evaluate(() => {
  const { shaving: s, rig, camera } = window.__game;
  const yaw = rig.yaw;
  for (const off of [-0.16, -0.08, 0, 0.08, 0.16]) {
    rig.yaw = yaw + off; rig.pitch = -0.05;
    s._mouthAt.valid = false;
    for (let i = 0; i < 60; i++) {
      rig.pitch += 0.008; rig.update(1 / 60); camera.updateMatrixWorld(true);
      s.tool.away = 0; s.tool.place(1, camera, rig.feel, s.world);
      s.snipNow(camera);
    }
  }
  rig.yaw = yaw; rig.pitch = 0.14; rig.update(1 / 60); camera.updateMatrixWorld(true);
  s.tool.power = 0;
});
await frames(3);
now = await state();
say('beard shaver', now);
check(now.bare > was.bare, 'over the stubble it leaves bare skin');
check(now.short < was.short, 'which is to say there is less stubble than there was');
check(now.reach < 13, 'and the elf has come closer still');
if (shots) await page.screenshot({ path: 'shots/snip_c.png', timeout: 300000 });

// ---- the wheel goes round: past the last tool is the first; and changing twice before the hands are back up ends on the last choice ----
await page.mouse.wheel(0, 120);
await frames(7);
now = await state();
check(now.tool === 'scissors' && now.up, 'one more notch comes round to the small bad scissors');
await page.keyboard.press('Digit2');
await page.keyboard.press('Digit3');
await frames(9);
now = await state();
check(now.tool === 'garden' && now.lit === 'garden' && now.up, 'keys 2 and 3 in quick succession end on the garden clippers');
await frames(3);
now = await state();
check(now.reach > 24, 'and the elf has stepped back to their length');

console.log(`${drawn} frames in ${((Date.now() - started) / 1000).toFixed(0)} s: ${((Date.now() - started) / drawn / 1000).toFixed(1)} s per frame here`);
console.log('stats:', await page.$eval('#stats', (el) => el.textContent));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no script errors, every check passed');
await browser.close();
