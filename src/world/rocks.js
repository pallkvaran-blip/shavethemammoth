// Frost-split boulders scattered across the steppe, snow lying on their tops.
import * as THREE from 'three';
import { noise2, fbm2, mulberry32, smoothstep } from './noise.js';
import { patchStandardMaterial } from '../gfx/patch.js';
import { makeDepthMaterial } from '../gfx/shadows.js';
import { LAYER_SHADOW_NEAR, LAYER_SHADOW_FAR } from '../gfx/globals.js';

// cheap 3D-ish noise from two 2D lookups
const n3 = (x, y, z) => 0.5 * (noise2(x + z * 0.71, y - z * 0.37) + noise2(y * 0.83 + 11.3, z + x * 0.59 + 4.1));

function makeRockGeometry(seed, detail) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const rng = mulberry32(seed);
  const ox = rng() * 50, oy = rng() * 50, oz = rng() * 50;
  const sx = 0.8 + rng() * 0.5, sy = 0.5 + rng() * 0.35, sz = 0.75 + rng() * 0.5;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // lumpy overall shape, with flatter fracture planes cut into it
    let r = 1 + 0.42 * n3(v.x * 1.1 + ox, v.y * 1.1 + oy, v.z * 1.1 + oz);
    r += 0.12 * n3(v.x * 3.1 + ox, v.y * 3.1 + oy, v.z * 3.1 + oz);
    const facet = Math.abs(n3(v.x * 2.0 + oz, v.y * 2.0 + ox, v.z * 2.0 + oy));
    r -= 0.24 * smoothstep(0.3, 0.0, facet);
    r += 0.03 * n3(v.x * 9 + ox, v.y * 9 + oy, v.z * 9 + oz);
    v.multiplyScalar(r);
    pos.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  // icosahedron vertices are duplicated per face; merge normals by position so shading is smooth
  geo.computeVertexNormals();
  const key = (i) => `${Math.round(pos.getX(i) * 4096)},${Math.round(pos.getY(i) * 4096)},${Math.round(pos.getZ(i) * 4096)}`;
  const acc = new Map();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let a = acc.get(k);
    if (!a) acc.set(k, (a = [0, 0, 0]));
    a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i);
  }
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    // keep a little of the faceting: blend the smooth normal with the face normal
    const nx = a[0] / l * 0.8 + nrm.getX(i) * 0.2, ny = a[1] / l * 0.8 + nrm.getY(i) * 0.2, nz = a[2] / l * 0.8 + nrm.getZ(i) * 0.2;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(i, nx / nl, ny / nl, nz / nl);
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // grey gneiss with rusty and pale lichen blotches
    const m = 0.5 + 0.5 * n3(x * 2.3 + ox, y * 2.3, z * 2.3 + oz);
    const lichen = smoothstep(0.55, 0.8, 0.5 + 0.5 * n3(x * 5 + 7, y * 5 + oy, z * 5));
    const rust = smoothstep(0.6, 0.85, 0.5 + 0.5 * n3(x * 1.4 + 31, y * 1.4, z * 1.4 + ox));
    let r = 0.065 + 0.085 * m, g = 0.062 + 0.078 * m, b = 0.062 + 0.074 * m;
    r += rust * 0.07; g += rust * 0.025;
    r = r + (0.26 - r) * lichen * 0.5; g = g + (0.27 - g) * lichen * 0.5; b = b + (0.19 - b) * lichen * 0.5;
    // snow settles on anything facing up, thicker in the hollows
    const snow = smoothstep(0.7, 0.9, ny / nl + 0.14 * n3(x * 3 + 5, y * 3, z * 3 + 9));
    r = r + (0.9 - r) * snow; g = g + (0.92 - g) * snow; b = b + (0.96 - b) * snow;
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function buildRocks(terrain, { seed = 5, count = 46, avoid = [] } = {}) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'rocks';
  const material = patchStandardMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.8 }), { key: 'rock' });
  const depth = makeDepthMaterial();
  const big = [makeRockGeometry(11, 5), makeRockGeometry(29, 5)];
  const small = [makeRockGeometry(3, 4), makeRockGeometry(17, 4), makeRockGeometry(41, 4), makeRockGeometry(57, 4)];
  const meshes = [];
  const place = (x, z, size, geo) => {
    const mesh = new THREE.Mesh(geo, material);
    const y = terrain.height(x, z);
    mesh.position.set(x, y - size * 0.22, z);
    mesh.scale.setScalar(size);
    mesh.rotation.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5);
    mesh.userData.shadowMaterial = depth;
    mesh.layers.enable(LAYER_SHADOW_NEAR);
    mesh.layers.enable(LAYER_SHADOW_FAR);
    mesh.updateMatrixWorld(true);
    group.add(mesh);
    meshes.push(mesh);
  };
  // a few large erratics placed for the main views
  for (const [x, z, s, g] of [[-12.5, -18, 1.6, 0], [-16, -21.5, 0.8, 1], [19, 13, 1.9, 1], [8.5, -17, 1.25, 0], [-6, 15, 1.0, 1], [31, -9, 2.3, 0]]) {
    if (!terrain.isLake(x, z)) place(x, z, s, big[g]);
  }
  let n = 0, tries = 0;
  while (n < count && tries < count * 30) {
    tries++;
    const r = 7 + 110 * Math.pow(rng(), 1.6), a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (terrain.isLake(x, z)) continue;
    if (avoid.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) continue;
    // stones gather where the snow is thin
    if (rng() > 0.25 + 0.75 * (1 - terrain.cover(x, z))) continue;
    const size = 0.12 + 0.55 * Math.pow(rng(), 2.2) + (r > 40 ? 0.3 * rng() : 0);
    place(x, z, size, small[Math.floor(rng() * small.length)]);
    n++;
  }
  return { group, meshes };
}
