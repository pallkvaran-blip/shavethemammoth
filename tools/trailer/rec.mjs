// Records a shot of the game for the trailer, frame by frame: the page's clock is replaced by one that moves on a
// twenty-fourth of a second each time it is asked, so however long a frame takes to draw (seconds, without a graphics
// card) the film runs at the right speed.
//   node tools/trailer/rec.mjs <shot name> [out dir]        (needs `npm run dev` running; shots are in shots.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../browser.mjs';
import { SHOTS } from './shots.mjs';

const [name, out = 'trailer/frames'] = process.argv.slice(2);
const shot = SHOTS[name];
if (!shot) { console.error(`no such shot: ${name}. There are: ${Object.keys(SHOTS).join(', ')}`); process.exit(1); }
const W = +(process.env.W || 1280), H = +(process.env.H || 720), FPS = 24;
const dir = path.join(out, name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.setDefaultTimeout(900000);
page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
await page.addInitScript((fps) => {
  let vt = 0, waiting = [], id = 0;
  window.__hold = false;
  const run = () => { vt += 1000 / fps; const now = waiting; waiting = []; for (const w of now) w.fn(vt); };
  window.requestAnimationFrame = (fn) => {
    waiting.push({ fn, id: ++id });
    if (!window.__hold && waiting.length === 1) setTimeout(() => { if (!window.__hold) run(); }, 0);
    return id;
  };
  window.cancelAnimationFrame = (i) => { waiting = waiting.filter((w) => w.id !== i); };
  window.__step = run;
}, FPS);
const base = process.env.BASE || 'http://localhost:5173/';
const t0 = Date.now();
await page.goto(`${base}?q=high&fixed&adapt=0&debug&nosave&fresh&unlock&noscene&nodev&${shot.query}`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready') && window.__game, null, { timeout: 900000 });
await page.evaluate(() => { window.__hold = true; });
await page.waitForTimeout(300);
// what a shot's director may use
await page.evaluate(`(() => {
  const g = window.__game, T = g.camera.position.constructor;
  const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const mix = (a, b, k) => a + (b - a) * k;
  window.__d = {
    g, ease, mix,
    /** the camera, looking on from outside: where it is, what it looks at, how wide */
    cam(p, t, fov) { g.rig.orbit.enableDamping = false; g.rig.orbit.minDistance = 0.02; g.camera.position.set(p[0], p[1], p[2]); g.rig.orbit.target.set(t[0], t[1], t[2]); if (fov) { g.camera.fov = fov; g.camera.updateProjectionMatrix(); } },
    /** the same, moving from one to another over the shot (k: 0 to 1) */
    dolly(a, b, k) { const m = (i) => mix(a[i], b[i], k); this.cam([m(0), m(1), m(2)], [m(3), m(4), m(5)], mix(a[6], b[6], k)); },
    /** the elf: where he stands and which way he looks */
    elf(x, z, yaw, pitch) { g.rig.pos.x = x; g.rig.pos.z = z; g.rig.yaw = yaw; g.rig.pitch = pitch; },
  };
  window.__direct = ${shot.direct ? shot.direct.toString() : '() => {}'};
  window.__before = ${shot.before ? shot.before.toString() : '() => {}'};
})()`);
await page.evaluate(() => window.__before(window.__d));
const n = Math.round(shot.seconds * FPS), warm = shot.warm ?? 3;
for (let i = -warm; i < n; i++) {
  const url = await page.evaluate(([i, n, fps]) => {
    window.__direct(window.__d, Math.max(0, i), Math.max(0, i) / fps, Math.max(0, i) / Math.max(1, n - 1));
    window.__step();
    return i < 0 ? '' : document.querySelector('canvas').toDataURL('image/jpeg', 0.93);
  }, [i, n, FPS]);
  if (i >= 0) fs.writeFileSync(path.join(dir, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  if (i === 0 || i === n - 1 || i % 24 === 0) console.log(`${name}: frame ${i + 1} of ${n}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();
