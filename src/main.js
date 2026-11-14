import * as THREE from 'three';
import { U, LAYER_SHADOW_NEAR, LAYER_SHADOW_FAR, LAYER_SHADOW_ELF } from './gfx/globals.js';
import { SunShadow } from './gfx/shadows.js';
import { Post } from './gfx/post.js';
import { Sky } from './world/sky.js';
import { Terrain } from './world/terrain.js';
import { buildGrass } from './world/grass.js';
import { buildRocks } from './world/rocks.js';
import { buildSnowDust, Breath } from './world/particles.js';
import { Mammoth } from './mammoth/mammoth.js';
import { buildAnatomy, SNOW_DEPTH } from './mammoth/anatomy.js';
import { CameraRig, VIEWS } from './controls.js';
import { Shaving, PUT_AWAY } from './game/shaving.js';
import { Sound } from './game/audio.js';
import { Game } from './game/game.js';
import { Hero } from './game/hero.js';
import { Lift } from './game/lift.js';
import { Antics } from './game/antics.js';
import { startBaking } from './game/people/bakery.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
const shot = q.has('shot');   // dev: render a still and stop (see tools/shot.mjs)
const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The game opens on its legend, one line at a time: the first on the dark while
// the scene is being made, the others over the opening shot. Any key or click
// skips it. (Dev stills and dev starts go without; ?legend=n holds line n.)
const legendLines = [...document.querySelectorAll('#legend p')];
const tellLegend = legendLines.length > 0 && (shot ? q.has('legend') : !q.has('cam') && !q.has('elf') && !q.has('nolegend'));
const began = performance.now();
/** Show line i of the legend (-1: none). Lines already told leave upwards. */
const say = (i) => legendLines.forEach((p, k) => { p.classList.toggle('on', k === i); p.classList.toggle('off', i < 0 || k < i); });
// (the listeners go on now, not when the scene is ready: the legend can be skipped while the scene is still being made)
const legend = { skipped: false, over: !tellLegend || shot, onSkip: null };
function skipLegend(e) {
  if (legend.over) return;
  if (e.type === 'keydown') {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(Shift|Control|Alt|Meta|Tab|CapsLock|F\d+)$/.test(e.key)) return;   // not meant for the game
    e.stopImmediatePropagation();   // this press only skips: it is not also a command
    e.preventDefault();
  }
  if (legend.skipped) return;
  legend.skipped = true;
  say(-1);
  if (legend.onSkip) legend.onSkip();
}
if (!legend.over) {
  say(0);
  window.addEventListener('keydown', skipLegend, true);
  $('loading').addEventListener('pointerdown', skipLegend);
}

// What each detail setting asks for. The scene then tunes itself further at
// run time (see ADAPT, and the frame loop) to keep the frames coming as fast
// as the screen shows them, on whatever graphics card it finds.
const PRESETS = {
  low: { children: 5, strands: 110000, shadow: [2048, 1024], samples: 2, scale: 0.72, dpr: 1, furShadow: 0.4, grass: 0.55, dust: 0.4, folk: 0.55 },
  medium: { children: 8, strands: 160000, shadow: [2048, 1024], samples: 4, scale: 0.86, dpr: 1, furShadow: 0.5, grass: 0.8, dust: 0.7, folk: 0.8 },
  high: { children: 12, strands: 240000, shadow: [4096, 2048], samples: 4, scale: 1, dpr: 1.25, furShadow: 0.6, grass: 1, dust: 1 },
  ultra: { children: 20, strands: 400000, shadow: [4096, 2048], samples: 4, scale: 1, dpr: 2, furShadow: 0.7, grass: 1, dust: 1 },
};
// What is given up, a step at a time, when the frames come too slowly. First
// what nobody sees: how much of the coat throws the shadow (`shade`), and how
// often the shadow of the whole mammoth is drawn afresh (every so many
// frames). Then a little at each step: how sharp the picture is (`scale`),
// how many locks the coat has (`fur`) and how many hairs a lock shows close
// to (`kids`).
const ADAPT = [
  { scale: 1, fur: 1, kids: 1, shade: 1, every: 1 },
  { scale: 1, fur: 1, kids: 1, shade: 0.8, every: 2 },
  { scale: 0.94, fur: 0.93, kids: 0.9, shade: 0.75, every: 2 },
  { scale: 0.88, fur: 0.85, kids: 0.8, shade: 0.7, every: 2 },
  { scale: 0.82, fur: 0.77, kids: 0.72, shade: 0.65, every: 2 },
  { scale: 0.76, fur: 0.69, kids: 0.64, shade: 0.6, every: 2 },
  { scale: 0.7, fur: 0.61, kids: 0.57, shade: 0.56, every: 2 },
  { scale: 0.64, fur: 0.54, kids: 0.5, shade: 0.56, every: 3 },
  { scale: 0.58, fur: 0.47, kids: 0.45, shade: 0.56, every: 3 },
  { scale: 0.52, fur: 0.4, kids: 0.42, shade: 0.56, every: 3 },
];
const LIGHTEST = ADAPT.length - 1;

const remembered = (() => { try { return localStorage.getItem('mammoth-detail'); } catch { return null; } })();
let qualityName = q.get('q') || (PRESETS[remembered] ? remembered : 'high');
if (!PRESETS[qualityName]) qualityName = 'high';
let Q = { ...PRESETS[qualityName] };
if (q.has('strands')) Q.strands = +q.get('strands');
if (q.has('msaa')) Q.samples = +q.get('msaa');

// The lettering: nothing is shown in it until it has arrived (or has had long enough to), and what is painted on signs
// and knitted into jerseys in the scene waits for it too.
const FACES = ['24px "Jacquard 24"', '500 24px "Grenze Gotisch"', '700 24px "Grenze Gotisch"', '16px "Grenze"', '500 16px "Grenze"', '600 16px "Grenze"', '700 16px "Grenze"', 'italic 16px "Grenze"', 'italic 500 16px "Grenze"', 'italic 600 16px "Grenze"'];
const lettering = (() => {
  const all = document.fonts && document.fonts.load ? Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => null))) : Promise.resolve();
  return Promise.race([all, new Promise((done) => setTimeout(done, 3500))]).then(() => { document.body.classList.add('fonts'); });
})();

const setProgress = (p, label) => {
  const bar = $('bar'), text = $('status');
  // (the rows of knitting are worked that far: whole stitches only)
  if (bar) bar.style.width = `${Math.round(Math.min(1, p) * Math.floor(bar.parentElement.clientWidth / 14)) * 14}px`;
  if (text && label) text.textContent = label;
};

/**
 * How often the screen is redrawn (seconds from one frame to the next), taken over a few frames before anything else
 * is asked of the page. Sixty times a second is usual; but a screen may be slower, and a browser that is saving power
 * may show only thirty, and there is no sense in giving up detail to chase frames that would never be shown.
 */
const measureScreen = () => new Promise((done) => {
  const stamps = [];
  let over = false;
  const finish = () => {
    if (over) return;
    over = true;
    const gaps = stamps.slice(1).map((t, i) => t - stamps[i]).filter((g) => g > 3 && g < 70).sort((a, b) => a - b);
    // (one of the shorter gaps, not the middle one: a page still opening stumbles, and a stumble only ever makes a gap longer)
    done(gaps.length >= 5 ? gaps[Math.floor(gaps.length * 0.2)] / 1000 : null);
  };
  const tick = (t) => { stamps.push(t); if (stamps.length < 13) requestAnimationFrame(tick); else finish(); };
  requestAnimationFrame(tick);
  setTimeout(finish, 600);   // (a page opened in the background is shown no frames at all)
});

async function start() {
  const screenGap = shot ? null : await measureScreen();
  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.info.autoReset = false;
  const gl = renderer.getContext();
  const floatLinear = !!gl.getExtension('OES_texture_float_linear');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(VIEWS[0].fov, 1, 0.08, 30000);
  const size = new THREE.Vector2();
  // How far the detail is turned down (an index into ADAPT). Looking on from outside and shaving from the snow ask
  // very different things of a graphics card, so each keeps its own, and both are remembered from one visit to the next.
  const keptLevels = (() => {
    try { const k = JSON.parse(localStorage.getItem('mammoth-pace') || 'null'); if (k && k.detail === qualityName) return { orbit: k.orbit | 0, elf: k.elf | 0 }; } catch { /* nothing kept */ }
    return { orbit: 0, elf: 0 };
  })();
  const levels = q.has('adapt') || shot || q.has('fixed') ? { orbit: num('adapt', 0) | 0, elf: num('adapt', 0) | 0 } : keptLevels;   // dev: ?adapt=9 starts at the lightest setting
  for (const k of ['orbit', 'elf']) levels[k] = Math.min(LIGHTEST, Math.max(0, levels[k]));
  let adaptLevel = levels.orbit;
  const post = new Post(renderer, { samples: Q.samples });
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const ratio = shot ? 1 : Math.min(window.devicePixelRatio || 1, Q.dpr) * Q.scale * ADAPT[adaptLevel].scale;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(size);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(size.x, size.y);
  };

  // the people of the place are sculpted while everything else loads (on threads of their own, where the page allows it;
  // ?nothreads keeps it here)
  const baking = startBaking(['elf', 'gnome', 'vulture'], { threads: !q.has('nothreads') });

  // ---- sky & sun ------------------------------------------------------------
  setProgress(0.02, 'Lighting the sky');
  const azimuth = num('az', 70);
  let elevation = num('el', 6.5);
  const sky = new Sky(renderer, { azimuth, elevation });
  scene.environment = sky.envMap.texture;
  scene.add(sky.mesh);
  scene.add(sky.makeLight());
  U.uFogParams.value.set(num('mist', 0.0007), 0.016, -2, num('haze', 0.000055));
  const up = new THREE.Vector3(0, 1, 0);
  const luma = (v) => 0.2126 * v.x + 0.7152 * v.y + 0.0722 * v.z;
  const updateExposure = () => {
    // meter off sunlit snow, so the picture holds as the sun climbs or sinks
    const snow = 0.9 * (luma(sky.sunColor) * Math.max(0, sky.sunDir.y) + luma(Sky.irradiance(sky.sh, up)) / Math.PI);
    renderer.toneMappingExposure = q.has('exp') ? num('exp', 0.34) : THREE.MathUtils.clamp(0.2 / snow, 0.1, 0.6);
    return snow;
  };
  const meter = updateExposure();

  // ---- land -----------------------------------------------------------------
  const anat = buildAnatomy();
  const terrain = new Terrain({ sunAzimuth: azimuth, feet: anat.feet, snowDepth: SNOW_DEPTH });
  const land = await terrain.build((p, l) => setProgress(0.05 + p * 0.3, l), { detail: 1 });
  scene.add(land);

  // keep the trail and the mammoth's own patch of ground clear
  const avoid = [{ x0: -30, x1: 4.5, z0: -3.2, z1: 3.2 }, { x0: -0.8, x1: 5.2, z0: 3.2, z1: 5.2 }];   // (and where the traders have set up)
  setProgress(0.36, 'Scattering stones and grass');
  const rocks = buildRocks(terrain, { avoid });
  scene.add(rocks.group);
  const grass = buildGrass(terrain, { tufts: 11000, avoid });
  grass.setShare(Q.grass);
  scene.add(grass);
  const dust = buildSnowDust({ count: 6000 });
  scene.add(dust);
  const breath = new Breath();
  scene.add(breath.points);
  // dev: ?bare leaves the land undrawn (it is still there to walk on). The tests of the tools
  // use it: without a graphics card most of a frame goes on snow, grass and stones.
  if (q.has('bare')) for (const o of [land, rocks.group, grass, dust]) o.visible = false;

  // ---- mammoth --------------------------------------------------------------
  await lettering;                                  // (his tattoos are lettered, and so are the traders' signs)
  const mammoth = await Mammoth.create({ strands: Q.strands, cell: 0.025, a2c: Q.samples > 0 }, (p, l) => setProgress(0.38 + p * 0.58, l));
  mammoth.addTo(scene);
  mammoth.setFurDetail(1, Q.furShadow);
  if (q.has('nofur')) mammoth.setCoatVisible(false);
  if (q.has('allhairs')) mammoth.allHairs = true;   // dev: see Mammoth.updateCoat
  // the tools, and the hair they cut
  const sound = new Sound();
  const shaving = new Shaving({ scene, mammoth, terrain, sound, a2c: Q.samples > 0, tool: q.get('tool') || 'scissors' });
  if (q.has('cutdisc')) {
    // dev: ?cutdisc=x,y,z,nx,ny,nz,radius[;...] shears everything crossing a disc
    for (const spec of q.get('cutdisc').split(';')) {
      const c = spec.split(',').map(Number);
      const normal = new THREE.Vector3(c[3], c[4], c[5]).normalize();
      const forward = new THREE.Vector3(1, 0, 0).cross(normal).normalize();
      if (forward.lengthSq() < 0.5) forward.set(0, 0, 1).cross(normal).normalize();
      const cuts = mammoth.findCuts({ pivot: new THREE.Vector3(c[0], c[1], c[2]), forward, normal, radius: c[6] });
      shaving.env.eye.set(c[0], c[1], c[2] + 0.5);
      cuts.forEach((cut, k) => { if (mammoth.applyCut(cut) > 0 && k % 2 === 0) shaving.clippings.spawn(cut, shaving.env); });
      console.info(`cutdisc: ${cuts.length} locks cut`);
    }
    mammoth.flushCuts();
  }
  if (q.has('shearsat')) {
    // dev: ?shearsat=x,y,z[,open] lays the chosen tool in the world to be looked at
    const c = q.get('shearsat').split(',').map(Number);
    shaving.tool.group.visible = true;
    shaving.tool.setAngle(shaving.tool.angle * (c[3] ?? 1));
    shaving.tool.group.matrix.makeRotationX(-0.25).setPosition(c[0], c[1], c[2]);
    shaving.tool.group.updateMatrixWorld(true);
  }
  // rough stand-ins for the body, used to darken the snow beneath it
  const occ = terrain.material.uniforms.uOccluders.value;
  [[0.9, 1.95, 0, 1.05], [-0.9, 1.85, 0, 1.0], [2.1, 2.3, 0, 0.6], [2.7, 1.2, 0, 0.3],
    [1.0, 0.5, 0.57, 0.34], [1.0, 0.5, -0.57, 0.34], [-1.24, 0.5, 0.54, 0.33], [-1.24, 0.5, -0.54, 0.33],
    // low on each foot, for the tight shadow where it meets the snow
    ...anat.feet.map((f) => [f.c[0], 0.11, f.c[2], f.r + 0.03])]
    .forEach((o, i) => occ[i].set(o[0], o[1], o[2], o[3]));

  // ---- shadows ----------------------------------------------------------------
  const shadowNear = new SunShadow(Q.shadow[0], Q.shadow[1], LAYER_SHADOW_NEAR, floatLinear);
  const shadowFar = new SunShadow(4096, 1024, LAYER_SHADOW_FAR, floatLinear);
  // a fine map that follows the elf: from down there, the mammoth's own map is far too coarse
  const elfShadowSize = () => (Q.shadow[0] >= 4096 ? [4096, 2048] : [2048, 1024]);
  const shadowElf = new SunShadow(...elfShadowSize(), LAYER_SHADOW_ELF, floatLinear);
  const elfCentre = new THREE.Vector3(), elfAhead = new THREE.Vector3();
  // (every tool that is showing, not only the one in hand: while the scene warms up all of them are drawn once)
  const toolCasters = () => Object.values(shaving.tools).filter((t) => t.group.visible).flatMap((t) => t.meshes);
  let game = null, hero = null, lifter = null, antics = null;
  // (what throws a shadow and has to be given its shadow material for it; the grass and the coat have meshes of their
  // own for the shadow maps, which need nothing done to them)
  const landNear = terrain.meshes.filter((m) => m.userData.castNear);
  const nearCasters = () => [...mammoth.casters, ...landNear, ...rocks.meshes, ...toolCasters(), ...(game ? game.casters : []), ...(hero ? hero.casters : []), ...(lifter ? lifter.casters : []), ...(antics ? antics.casters : [])];
  const farCasters = [...terrain.meshes.filter((m) => m.userData.castFar), ...rocks.meshes];
  // Where everything is, is worked out once a frame (in the frame loop), not once for every map and picture drawn.
  scene.matrixWorldAutoUpdate = false;
  let nearStale = true;   // the map that holds the whole mammoth must be drawn this frame, whatever its turn
  const fitShadows = () => {
    scene.updateMatrixWorld();
    shadowNear.fit(new THREE.Vector3(1.0, 1.45, 0), sky.sunDir, 4.8, 2.4, 160);
    shadowNear.bind(U.uShadowNear, U.uShadowNearMat, U.uShadowNearInfo);
    shadowFar.fit(new THREE.Vector3(0, 2, 0), sky.sunDir, 90, 22, 900);
    shadowFar.bind(U.uShadowFar, U.uShadowFarMat, U.uShadowFarInfo);
    shadowFar.render(renderer, scene, farCasters);   // the land's own shadows only change with the sun
    nearStale = true;
  };
  fitShadows();

  post.matFinal.uniforms.uToneMap.value = { agx: 0, aces: 1, neutral: 2, film: 3 }[q.get('tm') || 'film'] ?? 3;
  post.matFinal.uniforms.uBloom.value = num('bloom', 0.06);
  post.matFinal.uniforms.uHueKeep.value = num('hue', 0.5);
  post.matFinal.uniforms.uSaturation.value = num('sat', 1.08);
  post.matFinal.uniforms.uContrast.value = num('con', 0.18);
  post.matFinal.uniforms.uRays.value = num('rays', 0.22);

  // ---- camera -----------------------------------------------------------------
  const rig = new CameraRig(camera, canvas, terrain, anat.feet);
  rig.body = mammoth.sampler;
  const startView = VIEWS[Math.min(VIEWS.length - 1, Math.max(0, num('view', 0) | 0))];
  if (q.has('cam')) {
    if (shot) rig.orbit.minDistance = 0.02;   // dev stills may go as close as they like
    const c = q.get('cam').split(',').map(Number);
    rig.snap({ pos: c.slice(0, 3), target: c.slice(3, 6), fov: num('fov', 32) });
  } else if (shot || reducedMotion) {
    rig.snap(startView);
  } else {
    // open low and wide; once the scene is on screen, rise to meet the mammoth
    rig.snap({ pos: [17.5, 0.55, 8.2], target: [0.9, 2.3, 0], fov: 40 });
  }
  const intro = !q.has('cam') && !shot && !reducedMotion && !q.has('elf');
  resize();
  window.addEventListener('resize', resize);
  // ---- keeping the frames coming ---------------------------------------------------
  // The detail is turned down a step (ADAPT) when frames come slower than the screen shows them (or than sixty a
  // second, on a screen faster than that), and turned back up, warily, when they come easily again.
  const governed = !shot && !q.has('fixed');
  const pace = {
    gap: screenGap || 1 / 60,          // seconds from one redrawing of the screen to the next, as measured
    bins: new Float32Array(256), seen: 0,
    relax: 1,                          // aiming for every frame of the screen's (1), every other (2), ...
    acc: 0, n: 0, lost: 0, stumbles: 0, settle: 2.5,   // the stretch being averaged (and the stumbles in it: how long, how many)
    easy: 0, wait: 5, backoff: 5, raisedAt: -1e9, failedWhen: -1e9, failedAt: Infinity, floorMiss: 0, clock: 0,
    fps: 0, script: 0,
  };
  const aimFor = () => Math.max(pace.gap, 1 / 60) * pace.relax;
  const keepLevels = () => {
    if (!governed || q.has('adapt')) return;
    try { localStorage.setItem('mammoth-pace', JSON.stringify({ detail: qualityName, ...levels })); } catch { /* simply not kept */ }
  };
  const setLevel = (to) => {
    to = Math.min(LIGHTEST, Math.max(0, to));
    if (to === adaptLevel) return;
    const sharp = ADAPT[to].scale !== ADAPT[adaptLevel].scale;
    adaptLevel = to;
    pace.settle = 0.5; pace.acc = 0; pace.n = 0; pace.lost = pace.stumbles = 0;
    if (sharp) resize();
  };
  /** The gap between two frames (ms): the shortest that keeps turning up is how often the screen is redrawn. */
  const noteGap = (ms) => {
    if (!(ms > 3.5 && ms < 62)) return;
    const b = pace.bins;
    b[Math.floor(ms * 4)] += 1;
    if (++pace.seen % 40) return;
    for (let i = 14; i < 250; i++) {
      const n = b[i - 1] + b[i] + b[i + 1];
      if (n < 14 || b[i] < b[i - 1] || b[i] < b[i + 1]) continue;
      // (only ever a shorter gap than was thought: frames that come slowly say nothing about the screen)
      pace.gap = Math.min(pace.gap, ((i - 0.5) * b[i - 1] + (i + 0.5) * b[i] + (i + 1.5) * b[i + 1]) / n / 4000);
      break;
    }
  };
  /** Told the time since the frame before (seconds), every frame: decides whether the detail goes down or up a step. */
  const govern = (gap, view) => {
    pace.clock += Math.min(gap, 1);
    noteGap(gap * 1000);
    if (pace.settle > 0) { pace.settle -= Math.min(gap, 1); return; }   // (on a machine far too slow, a few frames are enough to know it)
    const g = Math.min(gap, 1.5);
    pace.acc += g; pace.n++;
    if (g > aimFor() * 2.5) { pace.lost += g; pace.stumbles++; }
    if (pace.acc < 0.7) return;
    // The usual gap over the stretch. A few gaps far longer than the rest are stumbles (the browser clearing up after
    // itself, something else on the machine) and say nothing about how much detail the graphics card can carry, so
    // they are left out; if a good part of the frames are that long, they are not stumbles but the pace.
    const span = pace.acc, few = pace.stumbles <= Math.max(2, pace.n * 0.2) && pace.stumbles < pace.n;
    const avg = few ? (span - pace.lost) / (pace.n - pace.stumbles) : span / pace.n;
    pace.fps = pace.n / span; pace.acc = 0; pace.n = 0; pace.lost = pace.stumbles = 0;
    const ratio = avg / aimFor();
    if (ratio > 1.08) {
      pace.easy = 0;
      if (adaptLevel < LIGHTEST) {
        // A step up was tried a moment ago, and this came of it: go back the one step, and leave it longer before
        // trying again from a view like this one.
        const tried = pace.clock - pace.raisedAt < 6;
        if (tried) { pace.backoff = Math.min(120, pace.backoff * 2); pace.failedAt = view; pace.failedWhen = pace.clock; }
        pace.wait = pace.backoff;
        pace.floorMiss = 0;
        setLevel(adaptLevel + (tried ? 1 : ratio > 2.4 ? 3 : ratio > 1.6 ? 2 : 1));
      } else if (++pace.floorMiss >= 3 && pace.relax < 4) {
        // With everything turned down it still cannot be done (or the browser is holding the frames back): aim for
        // the next pace down that a screen can show evenly, and have back whatever detail that leaves room for.
        pace.relax++; pace.floorMiss = 0; pace.wait = pace.backoff = 3;
      }
      return;
    }
    pace.floorMiss = 0;
    if (pace.relax > 1 && avg < Math.max(pace.gap, 1 / 60) * (pace.relax - 1) * 1.05) pace.relax--;   // the faster pace is being met after all
    // (the last step up has held: whatever made the one before it fail is past, and the next may be tried as soon)
    if (pace.backoff > 5 && pace.raisedAt > pace.failedWhen && pace.clock - pace.raisedAt > 6) pace.backoff = pace.wait = 5;
    if (ratio > 1.04 || adaptLevel === 0) { pace.easy = 0; return; }
    pace.easy += span;
    // Room for more is plain when frames come faster than is aimed for, or the graphics card says it is idle half the
    // time, or the view has become much lighter than the one a step up last failed from. Otherwise it can only be
    // tried, and trying costs a stumble, so it is tried seldom.
    const idle = timer && timer.ms >= 0 && (timer.ms + pace.script) < aimFor() * 1000 * 0.6;
    const lighter = view < pace.failedAt * 0.75;
    if (lighter && pace.backoff > 5) { pace.backoff = 5; pace.wait = Math.min(pace.wait, 5); }
    const need = ratio < 0.8 || (idle && pace.backoff <= 5) ? 1.4 : pace.wait;
    if (pace.easy >= need) {
      pace.easy = 0; pace.raisedAt = pace.clock; pace.wait = Math.max(pace.wait, 5);
      setLevel(adaptLevel - 1);
    }
  };
  // coming back to the tab: do not mistake the pause for a slow frame
  document.addEventListener('visibilitychange', () => { pace.settle = 1.5; pace.acc = 0; pace.n = 0; pace.lost = pace.stumbles = 0; if (document.visibilityState !== 'visible') { levels[rig.mode === 'elf' ? 'elf' : 'orbit'] = adaptLevel; keepLevels(); } });
  // How long the graphics card takes over a frame, where the browser will say. It is shown with the other numbers
  // (the P key), and taken as a hint that there is room for more detail; nothing depends on it.
  const timer = (() => {
    const ext = q.has('notimer') ? null : gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return null;
    const waiting = [], spare = [];
    let open = null, ms = -1, broken = false;
    return {
      begin() {
        if (broken || open || waiting.length > 3) return;
        try { open = spare.pop() || gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, open); } catch { broken = true; open = null; }
      },
      end() {
        if (broken) return;
        try {
          if (open) { gl.endQuery(ext.TIME_ELAPSED_EXT); waiting.push(open); open = null; }
          while (waiting.length && gl.getQueryParameter(waiting[0], gl.QUERY_RESULT_AVAILABLE)) {
            const query = waiting.shift();
            const t = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && t >= 0 && t < 5000) ms = ms < 0 ? t : ms + (t - ms) * 0.15;
            spare.push(query);
          }
        } catch { broken = true; }
      },
      get ms() { return broken ? -1 : ms; },
    };
  })();

  // ---- detail settings ----------------------------------------------------------
  let furBase = 1;
  const applyQuality = (name) => {
    qualityName = name;
    Q = { ...PRESETS[name] };
    try { localStorage.setItem('mammoth-detail', name); } catch { /* preference simply is not kept */ }
    post.setSamples(Q.samples);
    shadowNear.resize(Q.shadow[0], Q.shadow[1]);
    shadowElf.resize(...elfShadowSize());
    if (mammoth.strands < Q.strands) mammoth.growCoat(Q.strands);
    furBase = Math.min(1, Q.strands / mammoth.strands);
    dust.material.uniforms.uAmount.value = Q.dust;
    grass.setShare(Q.grass);
    // (a setting chosen by hand starts from all of itself, and is turned down again from there if it must be)
    adaptLevel = levels.orbit = levels.elf = 0;
    Object.assign(pace, { relax: 1, acc: 0, n: 0, lost: 0, stumbles: 0, settle: 1.5, easy: 0, wait: 5, backoff: 5, failedAt: Infinity, floorMiss: 0 });
    nearStale = true;
    keepLevels();
    resize();
  };
  furBase = Math.min(1, Q.strands / mammoth.strands);
  dust.material.uniforms.uAmount.value = Q.dust;

  const setSun = (el) => {
    elevation = el;
    sky.setSun(azimuth, el);
    scene.environment = sky.envMap.texture;
    sky.syncLight();
    fitShadows();
    updateExposure();
  };

  // ---- interface ----------------------------------------------------------------
  const hint = $('hint');
  let hintTimer = 0;
  const showHint = (html, seconds = 7) => {
    if (!hint) return;
    hint.innerHTML = html;
    hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('show'), seconds * 1000);
  };
  const viewButtons = [...document.querySelectorAll('[data-view]')];
  const elfButton = $('view-elf');
  const markView = (i) => {
    viewButtons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    elfButton?.setAttribute('aria-pressed', String(i === 'elf'));
  };
  const goView = (i) => { rig.setView(VIEWS[i]); markView(i); };
  viewButtons.forEach((b, i) => b.addEventListener('click', () => goView(i)));
  elfButton?.addEventListener('click', () => (rig.mode === 'elf' ? rig.leaveElf() : rig.enterElf()));
  const walk = $('walk');
  if (walk) {
    const go = (on) => (e) => { e.preventDefault(); on ? rig.keys.add('KeyW') : rig.keys.delete('KeyW'); };
    walk.addEventListener('pointerdown', go(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) walk.addEventListener(ev, go(false));
  }
  const snip = $('snip');
  if (snip) {
    const hold = (on) => (e) => { e.preventDefault(); shaving.squeeze(on); };
    snip.addEventListener('pointerdown', hold(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) snip.addEventListener(ev, hold(false));
  }
  for (const [id, code] of [['rise', 'KeyR'], ['sink', 'KeyF']]) {
    const b = $(id);
    if (!b) continue;
    const go = (on) => (e) => { e.preventDefault(); on ? rig.keys.add(code) : rig.keys.delete(code); };
    b.addEventListener('pointerdown', go(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, go(false));
  }
  const progressEl = $('progress');
  rig.onSqueeze = (on) => shaving.squeeze(on);
  rig.onStep = (run) => sound.step(run);

  // ---- the game: money, the traders, what is owned ---------------------------------
  // (dev stills and ?unlock have everything; ?gold=n sets the purse; ?fresh ignores a kept game; ?nosave keeps nothing)
  setProgress(0.97, 'Dressing the locals');
  const waitedFrom = performance.now();
  const baked = { elf: await baking.elf, gnome: await baking.gnome, vulture: await baking.vulture };
  const folkTimes = { ...baking.took, where: Object.values(baking.where).join(','), waited: Math.round(performance.now() - waitedFrom) };
  const dressFrom = performance.now();
  game = new Game({
    scene, terrain, mammoth, shaving, rig, sound, hint: showHint, storage: !shot && !q.has('nosave'), baked,
    dev: { unlock: shot || q.has('unlock'), gold: q.has('gold') ? num('gold', 0) : null, fresh: shot || q.has('fresh'), noscene: q.has('noscene') },
  });
  // the elf himself: seen from outside before the shaving starts, and whenever he has something new to show off
  hero = new Hero({ scene, camera, rig, shaving, terrain, mammoth, sound, baked: baked.elf });
  folkTimes.dressed = Math.round(performance.now() - dressFrom);
  game.hero = hero;
  // Everything the people are made of is got ready behind the loading card. They are left out of the picture when they
  // are not in it; one first drawn later would hold everything up while its materials were made.
  const folkToWarm = [];
  for (const root of [hero.elf.group, ...Object.values(game.people).flatMap((p) => p.parts.map((part) => part.group))]) {
    root.traverse((o) => { if (o.isMesh && o.frustumCulled) { o.frustumCulled = false; folkToWarm.push(o); } });
  }
  lifter = new Lift({ scene, rig, terrain, sound, hero });
  game.lifter = lifter;
  game.applyUpgrades();
  antics = new Antics({ mammoth, rig, sound, hint: showHint, state: game.state, puffs: lifter.puffs, terrain, shaving });
  game.antics = antics;
  // bald: the shaving stops, the camera goes round to his best side, and the legend is told to the end
  antics.ready = () => game.finds.pending() === 0;
  antics.hush = () => (game.tipIn ?? 0) > 4;
  antics.onBald = () => { if (rig.mode === 'elf') rig.leaveElf(false); goView(1); game.finale(); };
  { const heard = rig.onLift; rig.onLift = (what) => { heard(what); if (what === 'thud') antics.feat('thud'); }; }
  // dev: ?finale shows the end; ?wear=partyhat,shades dresses him; ?pink dyes him
  if (q.has('finale')) setTimeout(() => game.finale(), 0);
  if (q.has('wear')) { game.state.worn.push(...q.get('wear').split(',')); antics.dress(); }
  if (q.has('pink')) { game.state.flags.pink = true; antics.dye(); }
  if (!q.has('tool')) shaving.setTool(game.state.tool);

  // ---- which tool ---------------------------------------------------------------
  const toolButtons = [...document.querySelectorAll('[data-tool]')];
  const chooseTool = (id) => (id === 'sweep' ? game.toggleSweep() : game.choose(id));
  shaving.onTool = (tool) => {
    rig.reachGoal = tool.def.reach;
    if (rig.mode !== 'elf') rig.reach = rig.reachGoal;   // (while shaving, the elf steps in or back over a moment)
    game.refresh();
    if (rig.mode === 'elf') showHint(`<strong>${tool.name}.</strong> ${tool.def.blurb}`, 4);
  };
  rig.reachGoal = rig.reach = shaving.tool.def.reach;
  game.refresh();
  toolButtons.forEach((b) => b.addEventListener('click', () => chooseTool(b.dataset.tool)));
  rig.onWheel = (dir) => game.step(dir);
  $('prompt')?.addEventListener('click', () => game.interact());
  rig.onChange = (mode) => {
    const elf = mode === 'elf';
    // (each way of looking keeps the detail it last settled at)
    if (governed) { levels[elf ? 'orbit' : 'elf'] = adaptLevel; setLevel(levels[elf ? 'elf' : 'orbit']); pace.settle = 1; pace.easy = 0; keepLevels(); }
    nearStale = true;
    document.body.classList.toggle('elf', elf);
    shaving.setActive(elf);
    if (!elf && game.dialog) game.close();
    if (progressEl) progressEl.hidden = !elf;
    if ($('purse')) $('purse').hidden = !elf;
    if (elfButton) elfButton.textContent = elf ? 'Stop shaving' : 'Start shaving';
    if (elf) {
      if (!shot) sound.start();   // allowed now: this follows a click or a key press
      markView('elf');
      if (!game.arrive()) showHint(`<strong>${shaving.tool.name}.</strong> ${shaving.tool.def.sweep ? 'Look at the hair on the snow and hold the cut button to gather it.' : shaving.tool.def.motor ? 'Walk up to the mammoth, lay it flat against the hide, hold it on and push.' : 'Walk up to the mammoth and cut; lay the blades flat against the hide for a close shave.'} <span class="desk"><kbd>Left mouse</kbd> or <kbd>Space</kbd> cuts (hold to keep cutting), <kbd>Q</kbd> swaps to picking the hair up, <kbd>E</kbd> talks, <kbd>W A S D</kbd> walks, <kbd>Esc</kbd> stops.</span>`, 12);
    } else {
      markView(-1);
    }
  };
  rig.orbit.addEventListener('start', () => markView(-1));
  if (q.has('elf')) {
    // dev: start at snow level with a tool in hand, e.g. ?elf=x,z,yaw,pitch (and ?tool=scissors|sheep|garden|electric|shaver)
    rig.enterElf();
    const e = q.get('elf').split(',').map(Number);
    if (e.length >= 2 && !Number.isNaN(e[1])) rig.pos.set(e[0], 0, e[1]);
    if (e.length >= 4) { rig.yaw = e[2]; rig.pitch = e[3]; }
  }
  // dev: ?lift=<ladder or pack> has that to go up with, and ?up=<metres> starts that far off the snow on it
  if (q.has('lift')) { game.state.owned.add(q.get('lift')); game.use(q.get('lift')); }
  if (q.has('up') && rig.mode === 'elf') {
    rig.update(1 / 60);
    rig.keys.add('KeyR'); rig.update(1 / 60);
    rig.height = num('up', 1); rig.vy = 0;
    if (!q.has('burn')) rig.keys.delete('KeyR');
    rig.update(1 / 600);
    // (burning: a second of it, held at that height, so that a still shows what comes out of the pack)
    if (q.has('burn')) for (let i = 0; i < 30; i++) { rig.update(1 / 30); camera.updateMatrixWorld(true); hero.update(1 / 30); lifter.update(1 / 30); rig.height = num('up', 1); rig.vy = 0; }
  }
  $('detail').value = qualityName;
  $('detail').addEventListener('change', (e) => applyQuality(e.target.value));
  // starting again: asked twice, because it grows his coat back and takes everything bought
  const again = $('new-game');
  if (again) {
    let sure = 0;
    const calm = () => { clearTimeout(sure); sure = 0; again.classList.remove('sure'); again.textContent = 'New game'; };
    again.addEventListener('click', () => {
      if (!sure) {
        again.classList.add('sure'); again.textContent = 'Sure? Everything goes';
        sure = setTimeout(calm, 4000);
        return;
      }
      calm();
      game.restart();
      showHint('<strong>A new game.</strong> His coat is back, your gold is gone, and you have the small bad scissors.', 7);
    });
  }
  const sunInput = $('sun');
  sunInput.value = String(elevation);
  let sunPending = null;
  sunInput.addEventListener('input', (e) => { sunPending = parseFloat(e.target.value); });
  let showStats = q.has('stats');
  const statsEl = $('stats');
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    // a scene is playing: any key gets on with it (Esc still stops the shaving altogether)
    if (hero.playing && e.code !== 'Escape') { e.preventDefault(); hero.skip(); return; }
    // talking to someone: E or Esc ends it, and nothing else is a command
    if (game.dialog) { if (e.code === 'KeyE' || e.code === 'Escape') { e.preventDefault(); game.close(); } return; }
    if (e.code.startsWith('Digit')) {
      const i = +e.code.slice(5) - 1;
      // with a tool in hand the number keys change it; otherwise they change the view
      if (rig.mode === 'elf') game.chooseNumber(i);
      else if (i >= 0 && i < VIEWS.length) goView(i);
    } else if (e.code === 'KeyE') {
      // E starts the shaving; once down on the snow it talks to whoever is in front of the elf
      if (rig.mode === 'elf') game.interact(); else rig.enterElf();
    } else if (e.code === 'KeyQ' && rig.mode === 'elf') {
      game.toggleSweep();
    } else if (e.code === 'KeyT' && rig.mode === 'elf') {
      game.swapLift();
    } else if (e.code === 'Escape' && rig.mode === 'elf') {
      rig.leaveElf();
    } else if (e.code === 'KeyH') {
      document.body.classList.toggle('bare');
    } else if (e.code === 'KeyP') {
      showStats = !showStats;
      statsEl.hidden = !showStats;
    } else if (e.code === 'KeyM') {
      sound.setMuted(!sound.muted);
      showHint(sound.muted ? 'Sound off' : 'Sound on', 2);
    }
  });
  statsEl.hidden = !showStats;
  // (a click gets on with a scene that is playing, as any key does)
  window.addEventListener('pointerdown', () => { if (hero.playing) hero.skip(); });

  setProgress(0.985, 'Warming up');
  // Compile every shader now, including those for things not yet on screen
  // (the tools, the cut hair), so nothing stutters the first time it appears.
  try {
    renderer.setRenderTarget(post.hdr);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);
  } catch (err) {
    console.warn('shader warm-up skipped', err);
  }
  renderer.setRenderTarget(null);
  if (shot) { document.body.classList.add('instant'); $('loading').hidden = !tellLegend; $('hud').hidden = !q.has('hud'); }

  // ---- the opening --------------------------------------------------------------------
  let told = false, waiting = null;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  /** The legend is over (or was never told): the controls come up. */
  const endLegend = () => {
    if (told) return;
    told = true;
    legend.over = true;
    timers.forEach(clearTimeout);
    say(-1);
    document.body.classList.add('told');
    window.removeEventListener('keydown', skipLegend, true);
    if (!shot) {
      const s = game.state, back = game.resumed && (s.stats.picked > 0 || s.gold > 0);
      const first = back
        ? `<strong>Welcome back.</strong> ${s.gold} gold, and he is ${(mammoth.shorn * 100).toFixed(mammoth.shorn < 0.1 ? 1 : 0)}% shorn. Press <strong>Start shaving</strong> to carry on.`
        : 'All you have is a pair of <strong>small bad scissors</strong>. Press <strong>Start shaving</strong> to climb down and use them.';
      setTimeout(() => showHint(`${first} <span class="desk">Or drag to look around; <kbd>H</kbd> hides these controls, <kbd>M</kbd> mutes the sound.</span>`, 9), tellLegend ? 1500 : 5200);
    }
  };
  legend.onSkip = () => {
    if (waiting) { const open = waiting; waiting = null; open(); }                  // the scene was ready and only waiting for the first line
    else if (document.body.classList.contains('ready')) { endLegend(); if (intro) rig.setView(startView, 2.6); }
    // (otherwise the scene is still being made: it opens without the legend when it is ready)
  };
  const reveal = () => {
    setProgress(1, 'Ready');
    if (shot) {
      // dev stills: ?legend=1 is the first line on the dark, 2 and 3 the later lines over the scene, 4 the first line just after the scene appears
      const n = tellLegend ? num('legend', 1) : 0;
      if (n !== 1) document.body.classList.add('ready');
      if (n) say(n === 4 ? 0 : n - 1); else document.body.classList.add('told');
      return;
    }
    const open = () => {
      document.body.classList.add('ready');
      pace.settle = 1.5; pace.acc = 0; pace.n = 0; pace.lost = pace.stumbles = 0;
      const tell = tellLegend && !legend.skipped;
      if (intro) rig.setView(startView, tell ? 11 : 6.5);
      if (!tell) { endLegend(); return; }
      later(() => say(1), 1900);
      later(() => say(2), 6400);
      later(endLegend, 10400);
    };
    // however quickly the scene was made, the first line has the dark to itself for a moment
    const wait = tellLegend && !legend.skipped ? 2800 - (performance.now() - began) : 0;
    if (wait > 0) { waiting = open; later(() => { if (waiting) { waiting = null; open(); } }, wait); } else open();
  };

  if (q.has('debug')) window.__game = { shaving, mammoth, rig, sound, camera, renderer, PUT_AWAY, game, hero, lifter, antics, U, state: game.state, folkTimes, scene, sky, terrain, grass, rocks, post, shadowNear, shadowElf, shadowFar, nearCasters, pace, levels, get level() { return adaptLevel; }, dev: {} };   // dev: poke at the game from the console
  if (q.has('nopush')) shaving.noPush = true;                                      // dev: hair ignores the blades
  if (q.has('away')) shaving.pinned = num('away', 0);                              // dev: hold the tool part way put away (0 to 1)
  if (q.has('noclippings')) shaving.clippings.mesh.visible = false;

  // ---- frame loop -----------------------------------------------------------------
  U.uTime.value = num('t', 0);
  mammoth.time = num('t', 0);
  const sunNDC = new THREE.Vector3(), viewDir = new THREE.Vector3();
  const mouth = new THREE.Vector3(), mouthDir = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const centre = new THREE.Vector3(0.5, 1.8, 0);
  const inView = new THREE.Frustum(), viewMatrix = new THREE.Matrix4(), ball = new THREE.Sphere(), centreOf = new THREE.Vector3();
  let last = performance.now();
  let frames = 0;
  // dev: ?sync waits for the graphics side at the end of every frame. Without a graphics card
  // (the tests in tools/) frames would otherwise be queued faster than they can be drawn.
  const syncPixel = q.has('sync') ? new Uint8Array(4) : null;
  const breathe = (dt) => {
    // breath leaves the mouth, just behind the root of the trunk
    const head = mammoth.bone('head');
    head.localToWorld(mouth.set(0.72, -0.62, 0));
    mouthDir.set(0.75, -0.55, 0).applyQuaternion(head.getWorldQuaternion(tmpQ)).normalize();
    breath.update(dt, mouth, mouthDir, mammoth.exhaling);
  };
  if (q.has('snips') && rig.mode === 'elf') {
    // dev: ?snips=n takes n strokes at once from where the elf stands, turning by ?snipyaw between them
    for (let i = 0, n = num('snips', 1); i < n; i++) {
      rig.update(1 / 60);
      camera.updateMatrixWorld(true);
      mammoth.update(0);
      mammoth.sampler.begin(mammoth.furMats.uniforms.uBreath.value);
      // the coat's level of detail as the first frame will have it, so the cut hair matches
      U.uPxScale.value = size.y * 0.5 * camera.projectionMatrix.elements[5];
      mammoth.updateCoat(camera, U.uPxScale.value, Math.max(2, num('children', Q.children)));
      shaving.lowered = 0; shaving.tool.away = 0;
      shaving.tool.place(1, camera, rig.feel, shaving.world);
      const took = shaving.snipNow(camera);
      if (i < 4 || i === n - 1) console.info(shaving.tool.def.motor
        ? `pass ${i + 1}: ${took} locks taken, ${shaving.mown} so far, ${shaving.tool.name.toLowerCase()} ${shaving.tool.lying > 0.5 ? 'flat on the hide' : 'held free'}`
        : `snip ${i + 1}: ${took} locks between the blades, ${shaving.clippings.count} cut so far, ${shaving.tool.name.toLowerCase()} ${shaving.tool.lying > 0.5 ? 'flat on the hide' : 'held free'}`);
      rig.yaw += num('snipyaw', 0); rig.pitch += num('snippitch', 0);
    }
    rig.yaw -= num('snipyaw', 0) * num('snips', 1) * num('snipback', 0.5); rig.pitch -= num('snippitch', 0) * num('snips', 1) * num('snipback', 0.5);
  }
  // dev: ?bald (or ?bald=<metres left>) takes the whole coat off at once, to see what is under it
  if (q.has('bald')) mammoth.setHaircut(new Float32Array(mammoth.bodyCut.length).fill(num('bald', 0.0005) || 0.0005));
  // dev: ?shave=x,y,z,r[,metres left] takes the coat off within r of a point (several, separated by semicolons)
  if (q.has('shave')) {
    const P = mammoth.data.body.positions, cut = Float32Array.from(mammoth.bodyCut);
    for (const spec of q.get('shave').split(';')) {
      const [x, y, z, r, left = 0.0005] = spec.split(',').map(Number);
      for (let v = 0; v < cut.length; v++) if (Math.hypot(P[v * 3] - x, P[v * 3 + 1] - y, P[v * 3 + 2] - z) < r) cut[v] = Math.min(cut[v], left);
    }
    mammoth.setHaircut(cut);
  }
  if (q.has('open')) shaving.tool.setAngle(shaving.tool.def.open * num('open', 1));
  // dev: ?scene=<tool>&st=<seconds> shows the scene for getting that tool, stopped at that moment
  if (q.has('scene') && rig.mode === 'elf' && hero.celebrate(q.get('scene'))) { rig.update(0); hero.jump(num('st', 2.2)); rig.update(0); camera.updateMatrixWorld(true); }
  if (shot && rig.mode === 'elf') shaving.lowered = num('away', 0);   // dev stills: the tool is already up
  if (q.has('look')) { const l = q.get('look').split(',').map(Number); rig.yaw = l[0]; rig.pitch = l[1]; }   // dev: where to look after the snips
  for (let i = 0, n = num('warm', 0); i < n; i++) {
    U.uTime.value += 1 / 30; mammoth.update(1 / 30); breathe(1 / 30);
    mammoth.sampler.begin(mammoth.furMats.uniforms.uBreath.value);
    shaving.clippings.update(1 / 30);
  }

  let shadowTris = 0;
  const count = renderer.info.render;
  const folk = [hero.elf, game.gnome, game.vulture, game.table];
  const frame = (stamp) => {
    // The time is the one the browser gives the frame, which keeps step with the screen: taken off the clock instead,
    // it wavers by however long the page was busy, and everything that moves would then move unevenly.
    const from = performance.now();
    const now = stamp ?? from;
    const rawDt = Math.max(0.001, (now - last) / 1000);
    last = now;
    const dt = shot ? 1 / 30 : Math.min(0.1, rawDt);
    U.uTime.value += dt;

    if (sunPending !== null) { setSun(sunPending); sunPending = null; }

    // (dev: ?fixed holds the detail where it starts, however slow the frames)
    if (governed && document.visibilityState === 'visible') govern(rawDt, (mammoth.hairsDrawn || 0) / (ADAPT[adaptLevel].fur * ADAPT[adaptLevel].kids));
    const A = ADAPT[adaptLevel];

    rig.update(dt);
    mammoth.update(dt);
    // the tool in hand follows the eyes; cut hair falls
    camera.updateMatrixWorld(true);
    mammoth.sampler.begin(mammoth.furMats.uniforms.uBreath.value);
    shaving.update(dt, camera, rig.feel);
    game.update(dt);
    hero.update(dt);
    lifter.update(dt);
    if (frames < 3 && !shot) shaving.warm(camera, frames < 2);   // drawn once behind the loading card
    if (frames % 12 === 0) {
      sound.setWind(mammoth.sampler.windGust(camera.position.x, camera.position.z));
      if (progressEl && !progressEl.hidden) { const pct = mammoth.shorn * 100; progressEl.textContent = `Shorn ${pct.toFixed(pct < 1 ? 3 : pct < 10 ? 2 : 1)}%${game.finds.count ? ` · ${game.finds.count} of ${game.finds.total} found` : ''}`; }
    }

    // fewer strands are needed the further away the mammoth is
    const dist = camera.position.distanceTo(centre);
    const far = THREE.MathUtils.clamp(10 / Math.max(dist, 0.1), 0.42, 1);
    const coat = furBase * A.fur;
    mammoth.setFurDetail(THREE.MathUtils.clamp(coat * far, 0.05, 1), Q.furShadow * A.shade * Math.min(1, furBase * 1.4));
    // (and the people's hair goes the same way as his when the frames are slow)
    const folkHair = THREE.MathUtils.clamp((Q.folk ?? 1) * A.fur, 0.3, 1);
    // each of them is told how far off the eye is: at a distance fewer faces and fewer strands will do. (Looked out of,
    // the elf is only his own shadow, which never needs more than that.)
    const eye = camera.position;
    hero.elf.see(rig.mode === 'elf' && !hero.playing ? 99 : eye.distanceTo(hero.elf.group.position), folkHair);
    inView.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const who of ['gnome', 'vulture']) {
      const at = game.people[who], d = Math.hypot(eye.x - at.x, eye.y - at.y - 0.25, eye.z - at.z);
      // (out of the picture, a trader is only a shadow, and may cast it with fewer faces)
      game[who].see(d, folkHair, inView.intersectsSphere(ball.set(centreOf.set(at.x, at.y + 0.25, at.z), 0.6)));
      if (who === 'vulture') game.table.see(d, folkHair);
    }
    U.uPxScale.value = size.y * 0.5 * camera.projectionMatrix.elements[5];
    mammoth.updateCoat(camera, U.uPxScale.value, Math.max(2, num('children', Q.children) * A.kids));

    breathe(dt);

    // ---- the shadow maps -------------------------------------------------------------
    if (timer) timer.begin();
    scene.updateMatrixWorld();
    const casters = nearCasters();
    // (while the maps are drawn, only a share of each figure's hair is: see figure.js)
    for (const f of folk) f.shade(true);
    const before = count.triangles;
    // The map that holds the whole mammoth: every frame, or every second or third when frames are hard to come by.
    // (What the elf is working on has the map below, every frame. And while an ear flicks or the tail swings fast
    // enough that a shadow drawn late would sit where the thing no longer is, by more than the few millimetres the
    // shading allows for, this one is drawn as often as that takes.)
    let every = A.every;
    while (every > 1 && (mammoth.stir || 0) * (every - 1) * dt > 0.006) every--;
    if (nearStale || frames < 3 || shot || frames % every === 0) {
      shadowNear.render(renderer, scene, casters);
      nearStale = false;
    }
    if (rig.mode === 'elf' && !q.has('noelfshadow')) {
      // centred a little ahead of the elf, at about the height of its work
      camera.getWorldDirection(elfAhead); elfAhead.y = 0; elfAhead.normalize();
      elfCentre.copy(camera.position).addScaledVector(elfAhead, 0.45); elfCentre.y = terrain.height(elfCentre.x, elfCentre.z) + 0.5 + rig.height;
      shadowElf.fit(elfCentre, sky.sunDir, 1.3, 0.65, 70, true);
      shadowElf.bind(U.uShadowElf, U.uShadowElfMat, U.uShadowElfInfo);
      // (whatever casts into the mammoth's map casts into this one, but for the coat as a whole: this one has it patch by patch)
      for (const o of casters) { if (o.userData.shadowMaterial && !o.userData.nearOnly && o.layers.isEnabled(LAYER_SHADOW_NEAR)) o.layers.enable(LAYER_SHADOW_ELF); else o.layers.disable(LAYER_SHADOW_ELF); }
      shadowElf.render(renderer, scene, casters);
    } else {
      U.uShadowElfInfo.value.w = 0;
    }
    shadowTris += (count.triangles - before - shadowTris) * (frames < 5 ? 1 : 0.1);   // (the usual, since not every map is drawn every frame)
    for (const f of folk) f.shade(false);

    // where the sun sits on screen, for the light shafts
    sunNDC.copy(camera.position).addScaledVector(sky.sunDir, 1000).project(camera);
    const behind = sky.sunDir.dot(camera.getWorldDirection(viewDir)) < 0;
    post.sunUV.set(sunNDC.x * 0.5 + 0.5, sunNDC.y * 0.5 + 0.5);
    const off = Math.max(Math.abs(sunNDC.x), Math.abs(sunNDC.y));
    post.sunVisible = behind ? 0 : 1 - THREE.MathUtils.smoothstep(off, 1.0, 1.7);

    U.uPxScale.value = size.y * 0.5 * camera.projectionMatrix.elements[5];
    renderer.info.reset();
    renderer.setRenderTarget(post.hdr);
    renderer.clear();
    renderer.render(scene, camera);
    const pictureTris = count.triangles;
    post.finish(U.uTime.value);
    if (timer) timer.end();

    if (q.has('debugShadow')) {
      // dev: show a shadow map (?debugShadow=elf, or the mammoth's own by default)
      if (!window.__dbg) {
        window.__dbg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
          uniforms: { t: { value: null } }, depthTest: false,
          vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
          fragmentShader: 'uniform sampler2D t; varying vec2 v; void main(){ float d = texture2D(t, v).r; gl_FragColor = d > 0.999 ? vec4(0.25, 0.0, 0.0, 1.0) : vec4(vec3(fract(d * 400.0)), 1.0); }',
        }));
        window.__dbg.frustumCulled = false;
        window.__dbgScene = new THREE.Scene(); window.__dbgScene.add(window.__dbg);
      }
      window.__dbg.material.uniforms.t.value = (q.get('debugShadow') === 'elf' ? shadowElf : shadowNear).target.texture;
      renderer.setRenderTarget(null);
      renderer.render(window.__dbgScene, camera);
    }

    frames++;
    // the first frame compiles every shader; only lift the loading card once that is done
    if (frames === 2) { for (const o of folkToWarm) o.frustumCulled = true; reveal(); }
    pace.script += (performance.now() - from - pace.script) * (frames < 5 ? 1 : 0.1);
    if (showStats && frames % 20 === 0) {
      const busy = `${pace.script.toFixed(1)} ms of script${timer && timer.ms >= 0 ? `, ${timer.ms.toFixed(1)} ms of graphics` : ''}`;
      statsEl.textContent = `${pace.fps ? pace.fps.toFixed(0) : '–'} fps (aiming for ${Math.round(1 / aimFor())}) · ${busy} · ${size.x}×${size.y} · ${Math.round((mammoth.hairsDrawn || 0) / 1000)}k hairs · ${(pictureTris / 1e6).toFixed(1)}M triangles, and ${(shadowTris / 1e6).toFixed(1)}M for shadows · detail ${qualityName}${adaptLevel ? ' −' + adaptLevel : ''} · ${gpuName}`;
    }
    if (shot && frames === 2) {
      gl.finish();
      window.__info = { shorn: +(mammoth.shorn * 100).toFixed(3), clippings: shaving.clippings.count, tris: renderer.info.render.triangles, calls: renderer.info.render.calls, strands: mammoth.strands, hairs: mammoth.hairsDrawn, coatDraws: mammoth.coatDraws, sun: sky.sunColor.toArray().map((v) => +v.toFixed(2)), meter: +meter.toFixed(3), exposure: +renderer.toneMappingExposure.toFixed(3), gpu: gpuName, folk: folkTimes, loaded: Math.round(performance.now()) };
      window.__shotReady = true;
      return;
    }
    if (syncPixel) { gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel); }
    requestAnimationFrame(frame);
  };
  frame();
}

start().catch((err) => {
  console.error(err);
  const text = $('status');
  if (text) { text.textContent = 'The scene could not start: ' + err.message; text.classList.add('failed'); }
  document.body.classList.add('fonts');
});
