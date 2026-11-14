// What is asked to be drawn each frame, pass by pass and by kind of thing (after culling), and what a frame costs
// the processor. Nothing is really drawn (every draw call is turned into nothing), so it is quick and needs no
// graphics card; what it cannot say is how long a graphics card would take over it.
//   node tools/draw-count.mjs "<query>" [label] [frames] [script to run in the page first]
//   e.g. node tools/draw-count.mjs "q=high&tool=garden&elf=1.413,0.896,0.76,0.14" "shaving a leg"
// Needs the dev server on port 5173, or BASE=http://host:port/.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const [query = '', label = 'state', frames = '60', prep = ''] = process.argv.slice(2);
const base = process.env.BASE || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) }, deviceScaleFactor: 1 });
page.setDefaultTimeout(1800000);
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.addInitScript(() => {
  window.__cb = { n: 0, ms: 0, max: 0, list: [] }; window.__gl = { draws: 0, uniforms: 0, binds: 0 };
  const P = WebGL2RenderingContext.prototype;
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) { P[name] = function () { window.__gl.draws++; }; }
  for (const name of Object.getOwnPropertyNames(P)) {
    if (/^uniform/.test(name) && typeof P[name] === 'function') { const real = P[name]; P[name] = function (...a) { window.__gl.uniforms++; return real.apply(this, a); }; }
  }
  for (const name of ['bindTexture', 'useProgram', 'bindVertexArray', 'bindFramebuffer', 'activeTexture']) { const real = P[name]; P[name] = function (...a) { window.__gl.binds++; return real.apply(this, a); }; }
  for (const name of ['finish', 'readPixels']) { P[name] = function () {}; }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const t0 = performance.now(); cb(t); const d = performance.now() - t0; const c = window.__cb; c.n++; c.ms += d; if (d > c.max) c.max = d; c.list.push(d); });
});
const t0 = Date.now();
await page.goto(base + '?debug&nolegend&nosave&unlock&' + (process.env.ADAPT ? '' : 'fixed&') + query, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready') && window.__game, null, { timeout: 1800000 });
if (prep) await page.evaluate(prep);
const run = async (n) => { const from = await page.evaluate(() => window.__cb.n); await page.waitForFunction((to) => window.__cb.n >= to, from + n, { polling: 50, timeout: 1800000 }); };
await run(30);
await page.evaluate(() => {
  const g = window.__game, { mammoth, hero, game, renderer } = g;
  const folk = new Map();
  for (const [name, f] of [['elf', hero.elf], ['gnome', game.gnome], ['vulture', game.vulture], ['wig table', game.table], ['stall', game.stall]]) if (f) for (const m of f.meshes) folk.set(m, name);
  const land = new Set(g.terrain.meshes), rocks = new Set(g.rocks.meshes), rigid = new Set(mammoth.rigid);
  const kind = (o) => folk.get(o) || (o.name === 'fur' ? 'coat' : /^fur-shadow/.test(o.name) ? 'coat' : o === mammoth.body ? 'hide' : rigid.has(o) ? 'tusks etc' : /^grass/.test(o.name) ? 'grass' : rocks.has(o) ? 'rocks' : (land.has(o) || /^ground/.test(o.name)) ? 'land' : o.name || o.type);
  const passOf = (camera) => (camera === g.camera ? 'picture' : camera === g.shadowNear.camera ? 'shadow: mammoth' : camera === g.shadowElf.camera ? 'shadow: elf' : camera === g.shadowFar.camera ? 'shadow: land' : 'post');
  const stats = (window.__count = {});
  const real = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    const index = geometry.index, n = index ? index.count : geometry.attributes.position.count;
    let from = geometry.drawRange.start, to = Math.min(n, from + geometry.drawRange.count);
    if (group) { from = Math.max(from, group.start); to = Math.min(to, group.start + group.count); }
    let count = Math.max(0, to - from);
    const inst = geometry.isInstancedBufferGeometry ? (geometry._maxInstanceCount !== undefined ? Math.min(geometry.instanceCount, geometry._maxInstanceCount) : geometry.instanceCount) : object.isInstancedMesh ? object.count : 1;
    const tris = object.isMesh ? (count / 3) * inst : 0;
    const p = (stats[passOf(camera)] ||= { tris: 0, calls: 0, kinds: {} });
    p.tris += tris; p.calls++;
    const k = (p.kinds[kind(object)] ||= { tris: 0, calls: 0 });
    k.tris += tris; k.calls++;
    return real.apply(this, arguments);
  };
  window.__cb = { n: 0, ms: 0, max: 0, list: [] }; window.__gl = { draws: 0, uniforms: 0, binds: 0 };
});
await run(+frames);
const res = await page.evaluate(() => { const c = window.__cb, g = window.__gl; const s = [...c.list].sort((a, b) => a - b); return { frames: c.n, mean: c.ms / c.n, p50: s[s.length >> 1], p95: s[Math.floor(s.length * 0.95)], max: c.max, draws: g.draws / c.n, uniforms: g.uniforms / c.n, binds: g.binds / c.n, count: window.__count, stats: document.getElementById('stats')?.textContent || '', hairs: window.__game.mammoth.hairsDrawn }; });
console.log(`[${label}] ready after ${((Date.now() - t0) / 1000).toFixed(0)} s. Processor: ${res.mean.toFixed(2)} ms a frame (median ${res.p50.toFixed(2)}, p95 ${res.p95.toFixed(2)}, max ${res.max.toFixed(1)}); ${res.draws.toFixed(0)} draw calls, ${res.uniforms.toFixed(0)} uniform calls, ${res.binds.toFixed(0)} binds`);
let all = 0;
for (const [name, p] of Object.entries(res.count)) {
  all += p.tris / res.frames;
  if (name === 'post') continue;
  const kinds = Object.entries(p.kinds).filter(([, v]) => v.tris / res.frames > 1500).sort((a, b) => b[1].tris - a[1].tris).map(([k, v]) => `${k} ${(v.tris / res.frames / 1000).toFixed(0)}k/${(v.calls / res.frames).toFixed(0)}`).join(', ');
  console.log(`[${label}]   ${name}: ${(p.tris / res.frames / 1e6).toFixed(2)}M triangles a frame in ${(p.calls / res.frames).toFixed(0)} calls — ${kinds}`);
}
console.log(`[${label}]   all passes: ${(all / 1e6).toFixed(2)}M triangles a frame; ${Math.round(res.hairs / 1000)}k hairs${res.stats ? '; ' + res.stats : ''}`);
await browser.close();
