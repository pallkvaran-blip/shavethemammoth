// Dry steppe grass standing through the snow: tufts of curved blades that
// sway in the wind and glow when the low sun is behind them.
import * as THREE from 'three';
import { COMMON, SHADOWS, ATMOSPHERE } from '../gfx/glsl.js';
import { U, LAYER_SHADOW_NEAR, LAYER_SHADOW_ELF } from '../gfx/globals.js';
import { mulberry32, smoothstep } from './noise.js';

const VERT = /* glsl */ `
${COMMON}
attribute vec3 iPos;
attribute vec4 iLean;     // lean direction (xz), height, width
attribute vec4 iVar;      // seed, colour variation, tuft tone, stiffness
uniform float uPxScale;
varying float vT;
varying float vSide;
varying vec3 vPosW;
varying vec4 vVar;
varying vec3 vTuftN;
void main() {
  float t = position.y;
  float h = iLean.z;
  vec3 wind = windPush(iPos, iVar.x) * (1.0 - 0.6 * iVar.w);
  vec2 lean = iLean.xy + wind.xz * 0.55;
  float droop = dot(lean, lean);
  vec3 P1 = vec3(lean.x * 0.18, 0.55, lean.y * 0.18) * h;
  vec3 P2 = vec3(lean.x, 1.0 - 0.38 * min(droop, 1.5), lean.y) * h;
  float it = 1.0 - t;
  vec3 p = 2.0 * it * t * P1 + t * t * P2;
  vec3 tan = normalize(2.0 * it * P1 + 2.0 * t * (P2 - P1));
  // a faint flutter along the blade
  p.xz += wind.xz * 0.02 * sin(uTime * 9.0 + iVar.x * 50.0 + t * 6.0) * t;
  vec3 posW = iPos + p;
  #ifdef DEPTH_PASS
    vec3 toEye = uSunDir;
    float width = iLean.w * 1.6;
  #else
    vec3 toEye = normalize(cameraPosition - posW);
    float pxPerM = uPxScale / max(-(viewMatrix * vec4(posW, 1.0)).z, 0.05);
    float width = max(iLean.w, 1.25 / pxPerM);     // never thinner than about a pixel
  #endif
  vec3 side = normalize(cross(tan, toEye) + vec3(1e-5, 0.0, 0.0));
  width *= 1.0 - 0.85 * t * t;
  posW += side * (position.x * width);
  vT = t;
  vSide = position.x * 2.0;
  vPosW = posW;
  vVar = iVar;
  vTuftN = normalize(vec3(lean.x * 0.6, 1.0, lean.y * 0.6));
  gl_Position = projectionMatrix * viewMatrix * vec4(posW, 1.0);
}`;

const FRAG = /* glsl */ `
${COMMON}
${SHADOWS}
${ATMOSPHERE}
varying float vT;
varying float vSide;
varying vec3 vPosW;
varying vec4 vVar;
varying vec3 vTuftN;
void main() {
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = uSunDir;
  // straw: dark and damp at the base, bleached towards the tip
  vec3 base = mix(vec3(0.085, 0.060, 0.032), vec3(0.36, 0.275, 0.125), smoothstep(0.0, 0.55, vT));
  base = mix(base, vec3(0.56, 0.46, 0.25), smoothstep(0.5, 1.0, vT) * 0.6);
  // tufts differ: some greyer, some russet
  base = mix(base, base * vec3(1.15, 0.85, 0.62), smoothstep(0.55, 1.0, vVar.z));
  base = mix(base, vec3(dot(base, vec3(0.333))) * vec3(0.95, 0.97, 0.92), smoothstep(0.45, 0.0, vVar.z) * 0.55);
  base *= 0.75 + 0.5 * vVar.y;

  float dither = ign(gl_FragCoord.xy);
  float vis = sunVisibility(vPosW + vec3(0.0, 0.01, 0.0), 26.0, 0.02, 0.03, dither);
  vec3 N = normalize(vTuftN);
  float NL = dot(N, L);
  float diffuse = clamp((NL + 0.55) / 1.55, 0.0, 1.0);
  float edge = 0.7 + 0.3 * sqrt(max(0.0, 1.0 - vSide * vSide));
  vec3 col = base * uSunColor * diffuse * vis * edge;
  // thin dry blades let the sun through
  float back = pow(clamp(dot(-V, L), 0.0, 1.0), 2.5);
  col += base * vec3(1.25, 1.0, 0.6) * uSunColor * back * vis * 1.25 * smoothstep(0.1, 0.6, vT);
  // a dry sheen along the blade
  vec3 H = normalize(L + V);
  col += uSunColor * 0.03 * pow(clamp(dot(N, H), 0.0, 1.0), 14.0) * vis;
  float ao = mix(0.3, 1.0, smoothstep(0.0, 0.5, vT));
  col += base * ambientLight(N) * ao;
  col = applyAtmosphere(col, vPosW, cameraPosition);
  gl_FragColor = vec4(col, 1.0);
}`;

const FRAG_DEPTH = /* glsl */ `
void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }`;

export function buildGrass(terrain, { tufts = 9000, radius = 60, seed = 21, avoid = [] } = {}) {
  const rng = mulberry32(seed);
  const blades = [];
  const segs = 4;
  let placed = 0, tries = 0;
  while (placed < tufts && tries < tufts * 40) {
    tries++;
    // more tufts near the middle of the scene, thinning with distance
    const r = radius * Math.pow(rng(), 0.7);
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (terrain.isLake(x, z)) continue;
    const cover = terrain.cover(x, z);
    // grass shows where the wind has kept the snow thin; only stragglers elsewhere
    const chance = 0.035 + 0.965 * Math.pow(1 - cover, 1.4);
    if (rng() > chance) continue;
    let blocked = false;
    for (const b of avoid) {
      if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) { blocked = true; break; }
    }
    if (blocked) continue;
    if (terrain.printOffset(x, z) < -0.01) continue;
    placed++;
    const exposed = 1 - cover;
    const tone = rng();
    const tuftR = 0.04 + rng() * 0.13 + exposed * 0.06;
    // far tufts get fewer, slightly wider blades
    const thin = Math.min(1, Math.max(0.4, 1.35 - r / 42));
    const n = Math.round((7 + rng() * 16 + exposed * 12) * thin);
    const tuftH = (0.14 + rng() * 0.3) * (0.75 + 0.6 * exposed);
    const tuftLean = [(rng() - 0.5) * 0.35 + 0.12, (rng() - 0.5) * 0.35 + 0.05];   // combed a little by the prevailing wind
    for (let i = 0; i < n; i++) {
      const ba = rng() * Math.PI * 2, br = tuftR * Math.sqrt(rng());
      const bx = x + Math.cos(ba) * br, bz = z + Math.sin(ba) * br;
      const by = terrain.height(bx, bz) - 0.02;
      // blades splay outwards from the middle of the tuft
      const splay = 0.25 + 0.75 * rng();
      const lx = Math.cos(ba) * splay * (br / tuftR) * 0.55 + tuftLean[0] + (rng() - 0.5) * 0.3;
      const lz = Math.sin(ba) * splay * (br / tuftR) * 0.55 + tuftLean[1] + (rng() - 0.5) * 0.3;
      const h = tuftH * (0.45 + 0.75 * rng());
      const w = (0.0035 + 0.0045 * rng()) / Math.sqrt(thin);
      blades.push({ d: Math.hypot(bx, bz), a: [bx, by, bz, lx, lz, h, w, rng(), rng(), tone, rng()] });
    }
  }
  // The blades are drawn tile by tile, so that the tiles outside the picture (or outside a shadow map) are not drawn;
  // and within a tile, those nearest the middle of the scene come first. Both the share of the grass that is drawn at
  // lower detail and the part of it that casts a shadow are "everything within so far of the middle", which is then
  // the first so-many blades of each tile.
  const SHADOW_WITHIN = 26, REACH = 1.0;
  const count = blades.length;
  const distances = Float32Array.from(blades, (b) => b.d).sort();

  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs; pos.push(-0.5, t, 0, 0.5, t, 0); }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const blade = new THREE.Float32BufferAttribute(pos, 3), bladeIndex = new THREE.Uint16BufferAttribute(idx, 1);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...U },
    defines: { SHADOW_TAPS: 4 }, side: THREE.DoubleSide,
  });
  const depth = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG_DEPTH, uniforms: { ...U },
    defines: { DEPTH_PASS: 1 }, side: THREE.DoubleSide,
  });
  material.index0AttributeName = 'position';
  depth.index0AttributeName = 'position';

  const group = new THREE.Group();
  group.name = 'grass';
  /** The blades in `list` as tiles of `size` metres, each a mesh with material `mat`. */
  const tiles = (list, size, mat, name, order) => {
    const byTile = new Map();
    for (const b of list) {
      const key = Math.floor(b.a[0] / size) + 4096 * Math.floor(b.a[2] / size);
      let own = byTile.get(key);
      if (!own) byTile.set(key, (own = []));
      own.push(b);
    }
    const out = [];
    for (const own of byTile.values()) {
      own.sort((p, q) => p.d - q.d);
      const n = own.length;
      const iPos = new Float32Array(n * 3), iLean = new Float32Array(n * 4), iVar = new Float32Array(n * 4);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      own.forEach((b, i) => {
        const a = b.a;
        iPos[i * 3] = a[0]; iPos[i * 3 + 1] = a[1]; iPos[i * 3 + 2] = a[2];
        iLean[i * 4] = a[3]; iLean[i * 4 + 1] = a[4]; iLean[i * 4 + 2] = a[5]; iLean[i * 4 + 3] = a[6];
        iVar[i * 4] = a[7]; iVar[i * 4 + 1] = a[8]; iVar[i * 4 + 2] = a[9]; iVar[i * 4 + 3] = a[10];
        for (let k = 0; k < 3; k++) { if (a[k] < lo[k]) lo[k] = a[k]; if (a[k] > hi[k]) hi[k] = a[k]; }
      });
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', blade);
      geo.setIndex(bladeIndex);
      geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
      geo.setAttribute('iLean', new THREE.InstancedBufferAttribute(iLean, 4));
      geo.setAttribute('iVar', new THREE.InstancedBufferAttribute(iVar, 4));
      geo.instanceCount = n;
      // (the ball round the tile is measured from its middle, where its mesh is put: the shaders take no notice of
      // where that is, but three.js draws the near tiles first for it)
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + REACH);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.position.set((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = order;
      group.add(mesh);
      out.push({ mesh, d: Float32Array.from(own, (b) => b.d) });
    }
    return out;
  };
  // in the picture (drawn after what stands on the snow and before the snow itself); and, in smaller tiles, since
  // a shadow map takes in only a narrow strip of the land, the blades near enough the middle to cast a shadow
  const seen = tiles(blades, 10, material, 'grass', 15);
  const cast = tiles(blades.filter((b) => b.d < SHADOW_WITHIN), 5, depth, 'grass-shadow', 0);
  for (const t of cast) { t.mesh.layers.set(LAYER_SHADOW_NEAR); t.mesh.layers.enable(LAYER_SHADOW_ELF); }
  /** How many of a tile's blades lie within `far` of the middle of the scene. */
  const within = (tile, far) => {
    let a = 0, b = tile.d.length;
    while (a < b) { const m = (a + b) >> 1; if (tile.d[m] < far) a = m + 1; else b = m; }
    return a;
  };
  /** Draw this share of the grass (1 = all of it): the rest, furthest from the middle, is left out. */
  group.setShare = (share) => {
    const far = share >= 1 ? Infinity : distances[Math.max(0, Math.floor(count * share))];
    let drawn = 0;
    for (const t of [...seen, ...cast]) {
      const n = within(t, far);
      t.mesh.geometry.instanceCount = n;
      t.mesh.visible = n > 0;
      if (t.mesh.name === 'grass') drawn += n;
    }
    group.userData.drawn = drawn;
  };
  group.userData.total = count;
  group.setShare(1);
  return group;
}
