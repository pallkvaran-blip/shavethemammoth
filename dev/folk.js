// A quiet place to look at the people: one figure (or all of them) on bare snow, under the game's own sky, sun and
// shadows, without the mammoth. For working on them, and for stills.
//   /dev/folk.html?who=elf&cam=0.35,0.16,0.5,0,0.12,0&fov=30
// who = elf | gnome | vulture | all;  el, az = the sun;  t = seconds to run before the still;  pose values for the
// elf: lift, two, strain, buzz, sad, proud, walk, carry;  bare = no hair or feathers;  turn = degrees to turn the figure
import * as THREE from 'three';
import { U, LAYER_SHADOW_NEAR } from '../src/gfx/globals.js';
import { Post } from '../src/gfx/post.js';
import { Sky } from '../src/world/sky.js';
import { SunShadow } from '../src/gfx/shadows.js';
import { patchStandardMaterial } from '../src/gfx/patch.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) && q.get(k) !== '' ? +q.get(k) : d);
const log = (s) => { document.getElementById('log').textContent += s + '\n'; console.info(s); };

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NoToneMapping;
const gl = renderer.getContext();
const floatLinear = !!gl.getExtension('OES_texture_float_linear');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(num('fov', 30), 1, 0.01, 30000);
const post = new Post(renderer, { samples: num('msaa', 4) });
const size = new THREE.Vector2();
const resize = () => {
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.getDrawingBufferSize(size);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.setSize(size.x, size.y);
};
resize();
addEventListener('resize', resize);

const sky = new Sky(renderer, { azimuth: num('az', 70), elevation: num('el', 6.5) });
scene.environment = sky.envMap.texture;
scene.add(sky.mesh);
scene.add(sky.makeLight());
U.uFogParams.value.set(0.0007, 0.016, -2, 0.000055);
const luma = (v) => 0.2126 * v.x + 0.7152 * v.y + 0.0722 * v.z;
const snowLight = 0.9 * (luma(sky.sunColor) * Math.max(0, sky.sunDir.y) + luma(Sky.irradiance(sky.sh, new THREE.Vector3(0, 1, 0))) / Math.PI);
renderer.toneMappingExposure = q.has('exp') ? num('exp', 0.34) : THREE.MathUtils.clamp(0.2 / snowLight, 0.1, 0.6);
post.matFinal.uniforms.uToneMap.value = 3;
post.matFinal.uniforms.uBloom.value = 0.06;
post.matFinal.uniforms.uHueKeep.value = 0.5;
post.matFinal.uniforms.uSaturation.value = 1.08;
post.matFinal.uniforms.uContrast.value = 0.18;
post.matFinal.uniforms.uRays.value = 0;

// snow to stand on
const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), patchStandardMaterial(new THREE.MeshPhysicalMaterial({ color: 0xe9edf2, roughness: 0.92, metalness: 0 }), { key: 'dev-snow' }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const shadow = new SunShadow(4096, 2048, LAYER_SHADOW_NEAR, floatLinear);

const figures = [];
const t0 = performance.now();
const who = q.get('who') || 'elf';
const place = (fig, x) => { fig.group.position.x = x; fig.group.rotation.y = (num('turn', 0) * Math.PI) / 180; scene.add(fig.group); figures.push(fig); };
if (who === 'elf' || who === 'all') {
  const { buildElf } = await import('../src/game/people/elf.js');
  const elf = buildElf({ bare: q.has('bare') });
  for (const k of ['lift', 'two', 'strain', 'buzz', 'sad', 'proud', 'walk', 'carry', 'lookYaw', 'lookPitch']) if (q.has(k)) elf.want[k] = num(k, 0);
  elf.settle();
  place(elf, who === 'all' ? -0.35 : 0);
}
if (who === 'gnome' || who === 'all') {
  const { buildGnome } = await import('../src/game/people/gnome.js');
  place(buildGnome({ bare: q.has('bare') }), 0);
}
if (who === 'vulture' || who === 'all') {
  const { buildVulture } = await import('../src/game/people/vulture.js');
  place(buildVulture({ bare: q.has('bare') }), who === 'all' ? 0.4 : 0);
}
// (for finding out which part of a material is doing what: ?fa=<layer>:x,y,z,w sets its first four numbers)
if (q.has('fa')) { const [name, v] = q.get('fa').split(':'); for (const f of figures) if (f.materials && f.materials[name]) f.materials[name].userData.folk.uFolkA.value.fromArray(v.split(',').map(Number)); }
// (?far draws them as they are drawn from a long way off: fewer faces, fewer strands)
if (q.has('far')) for (const f of figures) if (f.see) f.see(num('far', 99) || 99);
const built = performance.now() - t0;
let tris = 0;
scene.traverse((o) => { if (o.isMesh && o.geometry.index) tris += o.geometry.index.count / 3; });
log(`${who}: built in ${built.toFixed(0)} ms, ${Math.round(tris / 1000)}k triangles`);
{ const { meshLayer } = await import('../src/game/people/sculpt.js'); for (const l of meshLayer.log) console.info(`  layer: grid ${l.grid.toFixed(0)} surface ${l.surface.toFixed(0)} points ${l.points.toFixed(0)} faces ${l.faces.toFixed(0)} ms, ${l.verts} verts ${l.tris} tris`); }

const cam = (q.get('cam') || '0.3,0.16,0.55,0,0.11,0').split(',').map(Number);
camera.position.set(cam[0], cam[1], cam[2]);
camera.lookAt(cam[3], cam[4], cam[5]);
camera.updateMatrixWorld(true);

let time = num('t', 0), frames = 0;
const casters = () => figures.flatMap((f) => f.meshes);
const frame = () => {
  const dt = 1 / 30;
  time += dt;
  U.uTime.value = time;
  for (const f of figures) f.update(dt, time, 0, 1, 0);
  scene.updateMatrixWorld(true);
  shadow.fit(new THREE.Vector3(0, 0.25, 0), sky.sunDir, 1.1, 0.6, 60);
  shadow.bind(U.uShadowNear, U.uShadowNearMat, U.uShadowNearInfo);
  shadow.render(renderer, scene, casters());
  U.uPxScale.value = size.y * 0.5 * camera.projectionMatrix.elements[5];
  post.sunVisible = 0;
  renderer.setRenderTarget(post.hdr);
  renderer.clear();
  renderer.render(scene, camera);
  post.finish(time);
  frames++;
  if (frames === 3) { gl.finish(); window.__info = { built: Math.round(built), tris: Math.round(tris) }; window.__shotReady = true; if (!q.has('live')) return; }
  requestAnimationFrame(frame);
};
frame();
