// Dev-only: clay render of the bare mammoth from four angles, to judge the sculpt.
import * as THREE from 'three';
import { buildMammothData, buildBodyGeometry, buildTuskGeometry } from '../src/mammoth/build.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setScissorTest(true);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9aa3ad);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x554433, 1.2));
const sun = new THREE.DirectionalLight(0xfff0dd, 2.2); sun.position.set(3, 6, 4); scene.add(sun);
const t0 = performance.now();
const data = await buildMammothData({ cell: +(q.get('cell') || 0.03) });
const geo = buildBodyGeometry(data.body);
const mode = q.get('mode') || 'clay';
let mat;
if (mode === 'len') {
  // visualise hair length
  const col = new Float32Array(data.body.positions.length);
  for (let i = 0; i < col.length / 3; i++) {
    const l = data.body.furA[i * 4];
    const c = new THREE.Color().setHSL(0.7 - Math.min(1, l / 0.8) * 0.7, 1, 0.5);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
} else if (mode === 'skin') {
  const col = new Float32Array(data.body.positions.length);
  for (let i = 0; i < col.length / 3; i++) {
    const b = data.body.skinIndex[i * 4];
    const c = new THREE.Color().setHSL((b * 0.381) % 1, 0.8, 0.3 + 0.4 * data.body.skinWeight[i * 4]);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
} else {
  mat = new THREE.MeshStandardMaterial({ color: 0x8a7868, roughness: 0.75, wireframe: mode === 'wire' });
}
scene.add(new THREE.Mesh(geo, mat));
const ivory = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.4 });
scene.add(new THREE.Mesh(buildTuskGeometry(data.anat.tusk, 1), ivory));
scene.add(new THREE.Mesh(buildTuskGeometry(data.anat.tusk, -1), ivory));
for (const s of [1, -1]) {
  const e = new THREE.Mesh(new THREE.SphereGeometry(data.anat.eye.radius, 16, 12), new THREE.MeshStandardMaterial({ color: 0x110804, roughness: 0.1 }));
  e.position.set(data.anat.eye.pos[0], data.anat.eye.pos[1], data.anat.eye.pos[2] * s); scene.add(e);
}
const grid = new THREE.GridHelper(10, 10, 0x444444, 0x666666); scene.add(grid);

const W = innerWidth, H = innerHeight;
const views = [
  { pos: [0.3, 1.7, 12], target: [0.3, 1.7, 0], ortho: true },   // side
  { pos: [14, 1.7, 0], target: [0, 1.7, 0], ortho: true },       // front
  { pos: [7.5, 2.6, 6.5], target: [0.8, 1.6, 0] },               // three-quarter
  { pos: [0.3, 14, 0.001], target: [0.3, 0, 0], ortho: true },   // top
];
if (q.get('view')) {
  const v = q.get('view').split(',').map(Number);
  views.length = 0; views.push({ pos: v.slice(0, 3), target: v.slice(3, 6) });
}
views.forEach((v, i) => {
  const single = views.length === 1;
  const vw = single ? W : W / 2, vh = single ? H : H / 2;
  const x = single ? 0 : (i % 2) * vw, y = single ? 0 : (1 - Math.floor(i / 2)) * vh;
  let cam;
  if (v.ortho) { const s = 3.6; cam = new THREE.OrthographicCamera(-s * vw / vh, s * vw / vh, s, -s, 0.1, 50); }
  else cam = new THREE.PerspectiveCamera(35, vw / vh, 0.1, 100);
  cam.position.set(...v.pos); cam.lookAt(...v.target);
  renderer.setViewport(x, y, vw, vh); renderer.setScissor(x, y, vw, vh);
  renderer.render(scene, cam);
});
window.__info = { ms: Math.round(performance.now() - t0), verts: data.body.positions.length / 3, tris: data.body.indices.length / 3 };
window.__shotReady = true;
