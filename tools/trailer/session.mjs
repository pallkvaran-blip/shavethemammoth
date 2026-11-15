// Records several shots of the game in one sitting, frame by frame, for the gifs (see rec.mjs for how the clock is
// held; here it is also possible to let time pass without drawing it, which costs nothing).
//   node tools/trailer/session.mjs <session> [out dir]      (needs `npm run dev` running; sessions are in gifshots.mjs)
//   W, H: the picture's size (890 x 500); FPS (12); Q: the detail (high)
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../browser.mjs';
import { SESSIONS } from './gifshots.mjs';

const [name, out = 'trailer/frames'] = process.argv.slice(2);
const session = SESSIONS[name];
if (!session) { console.error(`no such session: ${name}. There are: ${Object.keys(SESSIONS).join(', ')}`); process.exit(1); }
const W = +(process.env.W || 890), H = +(process.env.H || 500), FPS = +(process.env.FPS || 12), Q = process.env.Q || 'high';

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
await page.goto(`${base}?q=${Q}&fixed&adapt=${process.env.ADAPT || 0}${process.env.STRANDS ? `&strands=${process.env.STRANDS}` : ""}&debug&nosave&fresh&nodev&${session.query}`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready') && window.__game, null, { timeout: 900000 });
await page.evaluate(() => { window.__hold = true; });
await page.waitForTimeout(300);
console.log(`${name}: the scene is made, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await page.evaluate(`(() => {
  const g = window.__game;
  const draw = g.renderer.render.bind(g.renderer);
  g.renderer.render = (...a) => (window.__blind ? undefined : draw(...a));      // (time can pass unseen)
  const mix = (a, b, k) => a + (b - a) * k;
  window.__d = {
    g, mix,
    /** the camera, looking on from outside: where it is, what it looks at, how wide */
    cam(p, t, fov) { g.rig.orbit.enableDamping = false; g.rig.orbit.minDistance = 0.02; g.camera.position.set(p[0], p[1], p[2]); g.rig.orbit.target.set(t[0], t[1], t[2]); if (fov) { g.camera.fov = fov; g.camera.updateProjectionMatrix(); } },
    dolly(a, b, k) { const m = (i) => mix(a[i], b[i], k); this.cam([m(0), m(1), m(2)], [m(3), m(4), m(5)], mix(a[6], b[6], k)); },
    /** the elf: where he stands and which way he looks */
    elf(x, z, yaw, pitch) { g.rig.pos.x = x; g.rig.pos.z = z; g.rig.yaw = yaw; g.rig.pitch = pitch; },
    /** which way to face, standing at (x, z), to look at (tx, tz) */
    towards(x, z, tx, tz) { return Math.atan2(x - tx, z - tz); },
    keys(...on) { g.rig.keys.clear(); for (const k of on) g.rig.keys.add(k); },
  };
  window.__segs = [${session.segments.map((s) => `{ setup: ${s.setup ? s.setup.toString() : '() => {}'}, direct: ${s.direct ? s.direct.toString() : '() => {}'}, after: ${s.after ? s.after.toString() : '() => {}'} }`).join(',\n')}];
})()`);
for (const [n, seg] of session.segments.entries()) {
  const dir = path.join(out, `${name}-${seg.name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate((n) => window.__segs[n].setup(window.__d), n);
  const skip = seg.skip || 0;
  for (let i = -skip; i < seg.frames; i++) {
    const url = await page.evaluate(([n, i, frames]) => {
      window.__blind = i < -1;                 // (the last frame before the shot is drawn, so that everything is where it should be)
      window.__segs[n].direct(window.__d, i, Math.max(0, i) / Math.max(1, frames - 1));
      window.__step();
      return i < 0 ? '' : document.querySelector('canvas').toDataURL('image/jpeg', 0.97);
    }, [n, i, seg.frames]);
    if (i >= 0) fs.writeFileSync(path.join(dir, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  }
  await page.evaluate((n) => { window.__segs[n].after(window.__d); window.__d.keys(); window.__d.g.shaving.squeeze(false); }, n);
  console.log(`${name}-${seg.name}: ${seg.frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();
