// The governor that keeps the frames coming (see "keeping the frames coming" in src/main.js), tried against
// pretended machines. Nothing is really drawn; each frame is given a time stamp as if the machine had taken so
// long over it, and the test watches what the governor does with the detail.
//   node tools/pace-test.mjs        (needs the dev server on port 5173, or BASE=http://host:port/)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const base = process.env.BASE || 'http://localhost:5173/';
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

/**
 * One pretended machine. `cost(level, view)` is the milliseconds it takes over a frame at that step of detail;
 * the screen is redrawn every `screen` ms, and a frame is shown at the first redrawing after it is done.
 * `script` is run in the page: an array of [seconds, what to do then].
 */
async function machine(name, { screen = 1000 / 60, cost, seconds = 40, query = '', acts = [] }) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(({ screen, cost }) => {
    const P = WebGL2RenderingContext.prototype;
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'finish', 'readPixels']) P[n] = function () {};
    const costOf = new Function('level', 'view', 'return ' + cost);
    const sim = (window.__sim = { t: performance.now(), view: 1, log: [], frames: 0, on: false, slow: 0 });
    // (frames are run one after another as fast as the page can go, not at the screen's pace: the time they are told is pretended anyway)
    const queue = [], channel = new MessageChannel();
    channel.port1.onmessage = () => { const next = queue.shift(); if (next) next(); };
    const raf = (fn) => { queue.push(fn); channel.port2.postMessage(0); };
    window.requestAnimationFrame = (cb) => raf(() => {
      const g = window.__game, level = g ? g.level : 0;
      // (before the scene is there, the page is idle: a frame at every redrawing of the screen)
      const took = sim.on ? costOf(level, sim.view) : 1;
      const gap = Math.max(1, Math.ceil(took / screen - 1e-6)) * screen;
      sim.t += gap;
      if (sim.on) { sim.frames++; if (gap > screen * 1.01) sim.slow++; const last = sim.log[sim.log.length - 1]; if (!last || last[1] !== level) sim.log.push([+(sim.clock || 0).toFixed(1), level]); sim.clock = (sim.clock || 0) + gap / 1000; }
      cb(sim.t);
    });
  }, { screen, cost });
  await page.goto(base + '?debug&nolegend&nosave&unlock&q=low&strands=20000&bare&' + query, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('ready') && window.__game, null, { timeout: 600000 });
  await page.evaluate(() => { window.__sim.on = true; });
  let done = 0;
  for (const [at, act] of [...acts, [seconds, '']]) {
    await page.waitForFunction((t) => window.__sim.clock >= t, at, { polling: 100, timeout: 600000 });
    if (act) await page.evaluate(act);
    done = at;
  }
  const out = await page.evaluate(() => { const s = window.__sim, g = window.__game; return { log: s.log, level: g.level, levels: g.levels, pace: { gap: g.pace.gap, relax: g.pace.relax, backoff: g.pace.backoff }, frames: s.frames, slow: s.slow, stats: document.getElementById('stats')?.textContent || '' }; });
  await browser.close();
  out.changes = out.log.length - 1;
  out.errors = errors;
  console.log(`[${name}] ${out.frames} frames over ${done} s of its time; detail went ${out.log.map(([t, l]) => `${l}@${t}s`).join(' ')}; ends at ${out.level}, aiming every ${(out.pace.gap * 1000 * out.pace.relax).toFixed(1)} ms; ${out.slow} frames missed a redrawing${errors.length ? '; ERRORS ' + errors.join(' | ') : ''}`);
  return out;
}
const after = (out, t) => out.log.filter(([at]) => at >= t);

// what a step of detail costs, roughly as the real thing does: the first step takes a little off, the rest about an eighth each
const REL = 'view * (level === 0 ? 1 : 0.93 * Math.pow(0.88, level - 1))';

// 1. A machine with time to spare stays at full detail.
let r = await machine('quick machine', { cost: `9 * ${REL}`, seconds: 25 });
check('a quick machine keeps all its detail', r.level === 0 && r.changes === 0, `ends at ${r.level} after ${r.changes} changes`);
check('no errors in the page', r.errors.length === 0, r.errors.join(' | '));

// 2. A machine that takes 26 ms at full detail has to come down four or five steps to keep up with the screen, should get
//    there in a few seconds, and then should not keep hunting.
r = await machine('slow machine', { cost: `26 * ${REL}`, seconds: 150 });
const need = (() => { for (let l = 0; l < 10; l++) if (26 * (l === 0 ? 1 : 0.93 * Math.pow(0.88, l - 1)) <= 1000 / 60) return l; return 9; })();
const firstFit = r.log.find(([, l]) => l >= need);
check('a slow machine is brought down far enough to keep up', r.level >= need && r.level <= need + 1, `needs ${need}, ends at ${r.level}`);
check('and gets there quickly', firstFit && firstFit[0] < 8, firstFit ? `after ${firstFit[0]} s` : 'never');
check('and does not keep hunting', after(r, 30).length <= 10, `${after(r, 30).length} changes after the first half minute`);
check('trying a step up is left longer each time it fails', r.pace.backoff >= 40, `waits ${r.pace.backoff} s by the end`);
check('few frames are missed once it has settled', r.slow / r.frames < 0.12, `${(100 * r.slow / r.frames).toFixed(1)}% missed in all`);

// 3. A browser showing thirty frames a second (to save power) is not chased down to nothing: the detail stays.
r = await machine('thirty a second', { screen: 1000 / 30, cost: `12 * ${REL}`, seconds: 25 });
check('a screen shown at thirty a second keeps all its detail', r.level === 0 && r.changes === 0, `ends at ${r.level}, aiming every ${(r.pace.gap * 1000).toFixed(1)} ms`);

// 4. A machine that cannot keep up even with everything turned down settles for every other frame, with as much
//    detail as that allows.
r = await machine('hopeless machine', { cost: `70 * ${REL}`, seconds: 120 });
check('a machine that cannot keep up settles for a slower, even pace', r.pace.relax >= 2, `aiming every ${(r.pace.gap * 1000 * r.pace.relax).toFixed(1)} ms`);
check('and is not left with nothing', r.level < 9, `ends at ${r.level}`);

// 5. The view changes: heavy for a while (close to the coat), then light again. The detail comes down, and comes back.
r = await machine('view changes', { cost: `13 * ${REL}`, seconds: 200, acts: [[12, 'window.__sim.view = 2.2'], [50, 'window.__sim.view = 1']] });
const low = Math.max(...r.log.filter(([t]) => t > 12 && t < 50).map(([, l]) => l), 0);
check('a heavier view brings the detail down', low >= 4, `down to ${low}`);
check('and a lighter one brings it back', r.level <= 1, `ends at ${r.level}`);

// 6. A stumble now and then (a long frame every second or so) is not taken for a slow machine.
r = await machine('stumbles', { cost: `(Math.random() < 0.015 ? 120 : 9) * ${REL}`, seconds: 40 });
check('an odd long frame costs no detail', r.level === 0, `ends at ${r.level} after ${r.changes} changes`);

console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
