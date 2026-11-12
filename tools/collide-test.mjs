// Checks that no part of the shears can end up inside the mammoth or the snow.
// Puts the elf in a few thousand places around the feet, the legs and the
// trunk, looking in all directions with the blades at all angles, lets the
// hands settle, and measures how far any part of the tool is inside anything.
//   node tools/collide-test.mjs            (needs `npm run dev` running)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const base = process.env.BASE || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(base + '?q=low&strands=20000&debug&elf', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready') && window.__game, null, { timeout: 300000 });

const result = await page.evaluate(() => {
  const { shaving, rig, camera, mammoth } = window.__game;
  const sh = shaving.shears, world = shaving.world;
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const feet = mammoth.data.anat.feet;
  const measure = () => {
    const S = sh._poseSamples(), e = sh.group.matrix.elements;
    let body = 1e9, snow = 1e9;
    for (let k = 0; k < S.length; k += 4) {
      const x = e[0] * S[k] + e[4] * S[k + 1] + e[8] * S[k + 2] + e[12];
      const y = e[1] * S[k] + e[5] * S[k + 1] + e[9] * S[k + 2] + e[13];
      const z = e[2] * S[k] + e[6] * S[k + 1] + e[10] * S[k + 2] + e[14];
      body = Math.min(body, world.body(x, y, z) - S[k + 3]);
      snow = Math.min(snow, y - world.ground(x, z) - S[k + 3]);
    }
    return [body, snow];
  };
  const out = { poses: 0, worstBody: 1e9, worstSnow: 1e9, bodyBad: 0, snowBad: 0, flat: 0, at: null, ms: 0 };
  const t0 = performance.now();
  const N = 3000;
  for (let i = 0; i < N; i++) {
    let x, z;
    if (i % 5 === 4) {            // around the trunk
      x = 2.1 + rnd() * 1.2; z = (rnd() - 0.5) * 1.2;
    } else {                       // around a foot
      const f = feet[i % 4], a = rnd() * Math.PI * 2, d = f.r + 0.1 + rnd() * 0.45;
      x = f.c[0] + Math.cos(a) * d; z = f.c[2] + Math.sin(a) * d;
    }
    rig.pos.set(x, 0, z);
    const f = feet[i % 4];
    rig.yaw = Math.atan2(-(f.c[0] - x), -(f.c[2] - z)) + (rnd() - 0.5) * (i % 3 === 0 ? 6.28 : 1.4);
    rig.pitch = -1.1 + rnd() * 2.4;
    sh.setAngle(rnd() * 0.7);
    sh.poseReady = false;
    rig.update(1 / 60);
    camera.updateMatrixWorld(true);
    // the hands settle over a few frames, with a small turn of the head between them
    for (let s = 0; s < 14; s++) {
      if (s === 6) { rig.yaw += (rnd() - 0.5) * 0.3; rig.pitch += (rnd() - 0.5) * 0.3; rig.update(1 / 60); camera.updateMatrixWorld(true); }
      sh.place(1 / 60, camera, rig.feel, world);
      const [b, sn] = measure();
      // measured every frame, not just at rest: nothing may dip in on the way
      if (b < out.worstBody) { out.worstBody = b; out.at = { x: +rig.pos.x.toFixed(3), z: +rig.pos.z.toFixed(3), yaw: +rig.yaw.toFixed(3), pitch: +rig.pitch.toFixed(3), angle: +sh.angle.toFixed(2), frame: s }; }
      if (sn < out.worstSnow) out.worstSnow = sn;
      if (b < -0.0005) out.bodyBad++;
      if (sn < -0.0005) out.snowBad++;
    }
    if (sh.lying > 0.5) out.flat++;
    out.poses++;
  }
  out.ms = Math.round(performance.now() - t0);
  out.worstBody = +(out.worstBody * 1000).toFixed(2);
  out.worstSnow = +(out.worstSnow * 1000).toFixed(2);
  return out;
});
console.log(`${result.poses} poses (${result.flat} with the shears lying on the hide), ${(result.ms / result.poses / 14 * 1000).toFixed(0)} microseconds per frame of hand placement`);
console.log(`closest any part of the tool came to the hide: ${result.worstBody} mm (negative = inside); frames more than 0.5 mm inside: ${result.bodyBad}`);
console.log(`closest any part came to the snow: ${result.worstSnow} mm; frames more than 0.5 mm inside: ${result.snowBad}`);
console.log('worst case at', JSON.stringify(result.at));
await browser.close();
