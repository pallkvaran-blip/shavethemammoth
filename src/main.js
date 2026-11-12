import * as THREE from 'three';
import { U, LAYER_SHADOW_NEAR, LAYER_SHADOW_FAR } from './gfx/globals.js';
import { SunShadow } from './gfx/shadows.js';
import { Post } from './gfx/post.js';
import { Sky } from './world/sky.js';
import { Terrain } from './world/terrain.js';
import { buildGrass } from './world/grass.js';
import { buildRocks } from './world/rocks.js';
import { buildSnowDust, Breath } from './world/particles.js';
import { Mammoth } from './mammoth/mammoth.js';
import { buildAnatomy } from './mammoth/anatomy.js';
import { CameraRig, VIEWS } from './controls.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
const shot = q.has('shot');   // dev: render a still and stop (see tools/shot.mjs)
const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// What each detail setting asks for. The scene then tunes itself further at
// run time (resolution and how much of the coat is drawn) to hold a steady
// frame rate on whatever graphics card it finds.
const PRESETS = {
  low: { strands: 110000, shadow: [2048, 1024], samples: 2, scale: 0.72, dpr: 1, furShadow: 0.4, grass: 0.55, dust: 0.4 },
  medium: { strands: 160000, shadow: [2048, 1024], samples: 4, scale: 0.86, dpr: 1, furShadow: 0.5, grass: 0.8, dust: 0.7 },
  high: { strands: 240000, shadow: [4096, 2048], samples: 4, scale: 1, dpr: 1.25, furShadow: 0.6, grass: 1, dust: 1 },
  ultra: { strands: 400000, shadow: [4096, 2048], samples: 4, scale: 1, dpr: 2, furShadow: 0.7, grass: 1, dust: 1 },
};
const ADAPT = [
  { scale: 1, fur: 1 }, { scale: 0.88, fur: 0.8 }, { scale: 0.78, fur: 0.64 },
  { scale: 0.68, fur: 0.5 }, { scale: 0.6, fur: 0.4 }, { scale: 0.52, fur: 0.33 },
];

const remembered = (() => { try { return localStorage.getItem('mammoth-detail'); } catch { return null; } })();
let qualityName = q.get('q') || (PRESETS[remembered] ? remembered : 'high');
if (!PRESETS[qualityName]) qualityName = 'high';
let Q = { ...PRESETS[qualityName] };
if (q.has('strands')) Q.strands = +q.get('strands');
if (q.has('msaa')) Q.samples = +q.get('msaa');

const setProgress = (p, label) => {
  const bar = $('bar'), text = $('status');
  if (bar) bar.style.transform = `scaleX(${Math.min(1, p).toFixed(3)})`;
  if (text && label) text.textContent = label;
};

async function start() {
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
  let adaptLevel = 0;
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
  const terrain = new Terrain({ sunAzimuth: azimuth, feet: anat.feet });
  scene.add(await terrain.build((p, l) => setProgress(0.05 + p * 0.3, l), { detail: 1 }));

  // keep the trail and the mammoth's own patch of ground clear
  const avoid = [{ x0: -30, x1: 4.5, z0: -3.2, z1: 3.2 }];
  setProgress(0.36, 'Scattering stones and grass');
  const rocks = buildRocks(terrain, { avoid });
  scene.add(rocks.group);
  const grass = buildGrass(terrain, { tufts: 11000, avoid });
  scene.add(grass);
  const dust = buildSnowDust({ count: 6000 });
  scene.add(dust);
  const breath = new Breath();
  scene.add(breath.points);

  // ---- mammoth --------------------------------------------------------------
  const mammoth = await Mammoth.create({ strands: Q.strands, cell: 0.025, a2c: Q.samples > 0 }, (p, l) => setProgress(0.38 + p * 0.58, l));
  mammoth.addTo(scene);
  mammoth.setFurDetail(1, Q.furShadow);
  if (q.has('nofur')) mammoth.furMeshes.forEach((f) => (f.visible = false));
  // rough stand-ins for the body, used to darken the snow beneath it
  const occ = terrain.material.uniforms.uOccluders.value;
  [[0.9, 1.95, 0, 1.05], [-0.9, 1.85, 0, 1.0], [2.1, 2.3, 0, 0.6], [2.7, 1.2, 0, 0.3],
    [1.0, 0.5, 0.57, 0.34], [1.0, 0.5, -0.57, 0.34], [-1.24, 0.5, 0.54, 0.33], [-1.24, 0.5, -0.54, 0.33]]
    .forEach((o, i) => occ[i].set(o[0], o[1], o[2], o[3]));

  // ---- shadows ----------------------------------------------------------------
  const shadowNear = new SunShadow(Q.shadow[0], Q.shadow[1], LAYER_SHADOW_NEAR, floatLinear);
  const shadowFar = new SunShadow(2048, 512, LAYER_SHADOW_FAR, floatLinear);
  const nearCasters = () => [...mammoth.casters, ...terrain.meshes.filter((m) => m.userData.castNear), ...rocks.meshes, grass];
  const farCasters = [...terrain.meshes.filter((m) => m.userData.castFar), ...rocks.meshes];
  const fitShadows = () => {
    shadowNear.fit(new THREE.Vector3(1.0, 1.45, 0), sky.sunDir, 4.8, 2.4, 160);
    shadowNear.bind(U.uShadowNear, U.uShadowNearMat, U.uShadowNearInfo);
    shadowFar.fit(new THREE.Vector3(0, 2, 0), sky.sunDir, 90, 22, 900);
    shadowFar.bind(U.uShadowFar, U.uShadowFarMat, U.uShadowFarInfo);
    shadowFar.render(renderer, scene, farCasters);   // the land's own shadows only change with the sun
  };
  fitShadows();

  post.matFinal.uniforms.uToneMap.value = { agx: 0, aces: 1, neutral: 2, film: 3 }[q.get('tm') || 'film'] ?? 3;
  post.matFinal.uniforms.uBloom.value = num('bloom', 0.06);
  post.matFinal.uniforms.uHueKeep.value = num('hue', 0.5);
  post.matFinal.uniforms.uSaturation.value = num('sat', 1.08);
  post.matFinal.uniforms.uContrast.value = num('con', 0.18);
  post.matFinal.uniforms.uRays.value = num('rays', 0.55);

  // ---- camera -----------------------------------------------------------------
  const rig = new CameraRig(camera, canvas, terrain, anat.feet);
  const startView = VIEWS[Math.min(VIEWS.length - 1, Math.max(0, num('view', 0) | 0))];
  if (q.has('cam')) {
    const c = q.get('cam').split(',').map(Number);
    rig.snap({ pos: c.slice(0, 3), target: c.slice(3, 6), fov: num('fov', 32) });
  } else if (shot || reducedMotion) {
    rig.snap(startView);
  } else {
    // open low and wide, then rise to meet the mammoth
    rig.snap({ pos: [17.5, 0.55, 8.2], target: [0.9, 2.3, 0], fov: 40 });
    rig.setView(startView, 6.5);
  }
  if (q.has('elf')) {
    // dev: start at snow level, e.g. ?elf=x,z,yaw,pitch
    rig.enterElf();
    const e = q.get('elf').split(',').map(Number);
    if (e.length >= 2 && !Number.isNaN(e[1])) rig.pos.set(e[0], 0, e[1]);
    if (e.length >= 4) { rig.yaw = e[2]; rig.pitch = e[3]; }
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- detail settings ----------------------------------------------------------
  let furBase = 1;
  const applyQuality = (name) => {
    qualityName = name;
    Q = { ...PRESETS[name] };
    try { localStorage.setItem('mammoth-detail', name); } catch { /* preference simply is not kept */ }
    post.setSamples(Q.samples);
    shadowNear.resize(Q.shadow[0], Q.shadow[1]);
    if (mammoth.strands < Q.strands) mammoth.growCoat(Q.strands);
    furBase = Math.min(1, Q.strands / mammoth.strands);
    dust.material.uniforms.uAmount.value = Q.dust;
    adaptLevel = 0;
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
  rig.onChange = (mode) => {
    if (mode === 'elf') {
      markView('elf');
      showHint('You are the size of an elf. <span class="desk"><kbd>W A S D</kbd> to walk, <kbd>Shift</kbd> to run, mouse to look, <kbd>Esc</kbd> to return.</span>', 9);
    } else {
      markView(-1);
    }
  };
  rig.orbit.addEventListener('start', () => markView(-1));
  $('detail').value = qualityName;
  $('detail').addEventListener('change', (e) => applyQuality(e.target.value));
  const sunInput = $('sun');
  sunInput.value = String(elevation);
  let sunPending = null;
  sunInput.addEventListener('input', (e) => { sunPending = parseFloat(e.target.value); });
  let showStats = q.has('stats');
  const statsEl = $('stats');
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code.startsWith('Digit')) {
      const i = +e.code.slice(5) - 1;
      if (i >= 0 && i < VIEWS.length) goView(i);
    } else if (e.code === 'KeyE') {
      rig.mode === 'elf' ? rig.leaveElf() : rig.enterElf();
    } else if (e.code === 'Escape' && rig.mode === 'elf') {
      rig.leaveElf();
    } else if (e.code === 'KeyH') {
      document.body.classList.toggle('bare');
    } else if (e.code === 'KeyP') {
      showStats = !showStats;
      statsEl.hidden = !showStats;
    }
  });
  statsEl.hidden = !showStats;

  setProgress(1, 'Ready');
  document.body.classList.add('ready');
  if (shot) { document.body.classList.add('instant'); $('loading').hidden = true; $('hud').hidden = !q.has('hud'); }
  else setTimeout(() => showHint('<span class="desk">Drag to look around, scroll to zoom. Keys <kbd>1</kbd>&ndash;<kbd>4</kbd> change the view, <kbd>H</kbd> hides these controls.</span>'), 5200);

  // ---- frame loop -----------------------------------------------------------------
  U.uTime.value = num('t', 0);
  mammoth.time = num('t', 0);
  const sunNDC = new THREE.Vector3(), viewDir = new THREE.Vector3();
  const mouth = new THREE.Vector3(), mouthDir = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const centre = new THREE.Vector3(0.5, 1.8, 0);
  let last = performance.now();
  let frames = 0;
  // frame-rate watchdog
  let wAcc = 0, wFrames = 0, goodStreak = 0, fps = 0, settle = 2.5;

  const frame = () => {
    const now = performance.now();
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = shot ? 1 / 30 : Math.min(0.1, rawDt);
    U.uTime.value += dt;

    if (sunPending !== null) { setSun(sunPending); sunPending = null; }

    if (!shot && document.visibilityState === 'visible' && rawDt < 0.5) {
      if (settle > 0) settle -= rawDt;
      else { wAcc += rawDt; wFrames++; }
      if (wAcc > 1.3) {
        const avg = wAcc / wFrames;
        fps = 1 / avg;
        wAcc = 0; wFrames = 0;
        if (avg > 1 / 26 && adaptLevel < ADAPT.length - 1) {
          // well below target: drop two notches at once
          adaptLevel = Math.min(ADAPT.length - 1, adaptLevel + (avg > 1 / 15 ? 2 : 1));
          goodStreak = 0; settle = 0.6; resize();
        } else if (avg < 1 / 55 && adaptLevel > 0) {
          if (++goodStreak >= 4) { adaptLevel--; goodStreak = 0; settle = 0.6; resize(); }
        } else {
          goodStreak = 0;
        }
      }
    }

    rig.update(dt);
    mammoth.update(dt);

    // fewer strands are needed the further away the mammoth is
    const dist = camera.position.distanceTo(centre);
    const far = THREE.MathUtils.clamp(10 / Math.max(dist, 0.1), 0.42, 1);
    const coat = furBase * ADAPT[adaptLevel].fur;
    mammoth.setFurDetail(THREE.MathUtils.clamp(coat * far, 0.05, 1), Q.furShadow * Math.min(1, coat * 1.4));

    // breath leaves the mouth, just behind the root of the trunk
    const head = mammoth.bone('head');
    head.localToWorld(mouth.set(0.72, -0.62, 0));
    mouthDir.set(0.75, -0.55, 0).applyQuaternion(head.getWorldQuaternion(tmpQ)).normalize();
    breath.update(dt, mouth, mouthDir, mammoth.exhaling);

    mammoth.useShadowCounts();
    grass.geometry.instanceCount = Math.min(grass.userData.shadowCount, Math.floor(grass.userData.total * Q.grass));
    shadowNear.render(renderer, scene, nearCasters());
    grass.geometry.instanceCount = Math.floor(grass.userData.total * Q.grass);
    mammoth.useMainCounts();

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
    post.finish(U.uTime.value);

    frames++;
    if (showStats && frames % 20 === 0) {
      statsEl.textContent = `${fps ? fps.toFixed(0) : '–'} fps · ${size.x}×${size.y} · ${(renderer.info.render.triangles / 1e6).toFixed(1)}M triangles · detail ${qualityName}${adaptLevel ? ' −' + adaptLevel : ''} · ${gpuName}`;
    }
    if (shot && frames === 2) {
      gl.finish();
      window.__info = { tris: renderer.info.render.triangles, calls: renderer.info.render.calls, strands: mammoth.strands, sun: sky.sunColor.toArray().map((v) => +v.toFixed(2)), meter: +meter.toFixed(3), exposure: +renderer.toneMappingExposure.toFixed(3), gpu: gpuName };
      window.__shotReady = true;
      return;
    }
    requestAnimationFrame(frame);
  };
  frame();
}

start().catch((err) => {
  console.error(err);
  const text = $('status');
  if (text) text.textContent = 'The scene could not start: ' + err.message;
});
