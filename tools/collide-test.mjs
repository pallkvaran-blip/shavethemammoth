// Checks that no part of any tool can end up inside the mammoth or the snow.
// With each tool in turn, puts the elf in a few thousand places around the
// feet, the legs and the trunk, looking in all directions with the blades at
// all angles, lets the hands settle, and measures how far any part of the tool
// is inside anything. Every so often it also puts the tool away as the game
// does when changing tools, and checks that none of it is still in view at the
// moment it is swapped for the next.
//   node tools/collide-test.mjs            (needs `npm run dev` running)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const base = process.env.BASE || 'http://localhost:5173/';
const POSES = +(process.env.POSES || 3000);   // per tool
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(base + '?q=low&strands=20000&adapt=5&debug&sync&bare&elf', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready') && window.__game, null, { timeout: 300000 });

const results = await page.evaluate(async (N) => {
  const { shaving, rig, camera, mammoth, PUT_AWAY } = window.__game;
  const ease = (t) => t * t * (3 - 2 * t);
  const world = shaving.world;
  const feet = mammoth.data.anat.feet;
  const all = [];
  for (const id of Object.keys(shaving.tools)) {
    // take the tool up at once (no lowering of the hands), and stand as close as it allows
    shaving._take(id);
    shaving.lowered = 0;
    const sh = shaving.tool;
    sh.away = 0;
    rig.reach = rig.reachGoal = sh.def.reach;
    let seed = 12345;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
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
    // how many parts of the tool can be seen (a part counts if any of it is inside the view),
    // and how many of those are below the surface of the snow
    const inView = () => {
      const S = sh._poseSamples(), e = sh.group.matrix.elements, v = camera.matrixWorldInverse.elements;
      const tanY = Math.tan((camera.fov * Math.PI) / 360), tanX = tanY * camera.aspect;
      let n = 0, sunk = 0;
      for (let k = 0; k < S.length; k += 4) {
        const x = e[0] * S[k] + e[4] * S[k + 1] + e[8] * S[k + 2] + e[12];
        const y = e[1] * S[k] + e[5] * S[k + 1] + e[9] * S[k + 2] + e[13];
        const z = e[2] * S[k] + e[6] * S[k + 1] + e[10] * S[k + 2] + e[14];
        const cx = v[0] * x + v[4] * y + v[8] * z + v[12], cy = v[1] * x + v[5] * y + v[9] * z + v[13], cz = v[2] * x + v[6] * y + v[10] * z + v[14];
        const r = S[k + 3], d = -cz + r;            // how far ahead its far side is
        if (d > camera.near && Math.abs(cy) - r < d * tanY && Math.abs(cx) - r < d * tanX) {
          n++;
          if (y - world.ground(x, z) - r < -0.0005) sunk++;
        }
      }
      return [n, sunk];
    };
    const out = { tool: sh.name, parts: sh.samples.length / 4, poses: 0, worstBody: 1e9, worstSnow: 1e9, bodyBad: 0, snowBad: 0, flat: 0, at: null, ms: 0, swaps: 0, seenBefore: 0, swapsSeen: 0, seenMost: 0, sunkSeen: 0, pitches: [] };
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      let x, z;
      if (i % 5 === 4) {            // around the trunk
        x = 2.1 + rnd() * 1.2; z = (rnd() - 0.5) * 1.2;
      } else {                       // around a foot, from right against it to a couple of tool lengths away
        const f = feet[i % 4], a = rnd() * Math.PI * 2, d = f.r + 0.4 * sh.def.reach + rnd() * (sh.def.reach + 0.25);
        x = f.c[0] + Math.cos(a) * d; z = f.c[2] + Math.sin(a) * d;
      }
      rig.pos.set(x, 0, z);
      const f = feet[i % 4];
      rig.yaw = Math.atan2(-(f.c[0] - x), -(f.c[2] - z)) + (rnd() - 0.5) * (i % 3 === 0 ? 6.28 : 1.4);
      rig.pitch = -1.1 + rnd() * 2.4;
      sh.setAngle(rnd() * sh.def.open * 1.08);   // (a sprung tool overshoots a little as it flies open)
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
      if (i % 6 === 0) {
        // put it away as the game does when changing tools: is any of it still in view when the next one takes its place?
        if (inView()[0] > 0) out.seenBefore++;
        for (let lowered = 0; lowered < 1;) {
          lowered = Math.min(1, lowered + 1 / 60 / PUT_AWAY);
          sh.away = ease(lowered);
          sh.place(1 / 60, camera, rig.feel, world);
          const [b] = measure();
          if (b < out.worstBody) { out.worstBody = b; out.at = { x: +rig.pos.x.toFixed(3), z: +rig.pos.z.toFixed(3), yaw: +rig.yaw.toFixed(3), pitch: +rig.pitch.toFixed(3), angle: +sh.angle.toFixed(2), puttingAway: +lowered.toFixed(2) }; }
          if (b < -0.0005) out.bodyBad++;
          // put away, a tool may pass through the snow at the elf's feet, but never where it could be seen doing so
          if (inView()[1] > 0) out.sunkSeen++;
        }
        const [seen] = inView();
        out.swaps++;
        if (seen > 0) { out.swapsSeen++; out.seenMost = Math.max(out.seenMost, seen); if (out.pitches.length < 12) out.pitches.push(+rig.pitch.toFixed(2)); }
        sh.away = 0;
      }
    }
    out.ms = Math.round(performance.now() - t0);
    out.worstBody = +(out.worstBody * 1000).toFixed(2);
    out.worstSnow = +(out.worstSnow * 1000).toFixed(2);
    all.push(out);
  }
  return all;
}, POSES);
let bad = 0;
for (const r of results) {
  console.log(`\n${r.tool} (${r.parts} parts): ${r.poses} poses (${r.flat} lying on the hide), ${(r.ms / r.poses / 14 * 1000).toFixed(0)} microseconds per frame of hand placement`);
  console.log(`  closest any part came to the hide: ${r.worstBody} mm (negative = inside); frames more than 0.5 mm inside: ${r.bodyBad}`);
  console.log(`  closest any part came to the snow: ${r.worstSnow} mm; frames more than 0.5 mm inside: ${r.snowBad}`);
  console.log('  nearest miss at', JSON.stringify(r.at));
  console.log(`  put away ${r.swaps} times (in view beforehand in ${r.seenBefore}): still partly in view at the swap in ${r.swapsSeen}${r.swapsSeen ? `, at most ${r.seenMost} of its ${r.parts} parts, looking up by ${r.pitches.join(', ')} rad` : ''}; frames with a part in view below the snow: ${r.sunkSeen}`);
  bad += r.bodyBad + r.snowBad;
}
console.log(bad ? `\nFAILED: ${bad} frames with a tool inside something` : '\nno tool was ever inside the mammoth or the snow');
await browser.close();
