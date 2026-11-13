// Sculpting for the people of the place, the way the mammoth's body is made:
// a figure is a set of layers (skin, a jumper, a boot...), each a smooth blend
// of simple solids with pieces carved out of it, turned into a fine mesh when
// the game starts. Because every solid belongs to a bone, the same description
// gives the surface, how it bends, and where on it a pattern runs.
//
// What comes out of here for each layer: positions and smooth normals; how
// much of the sky each point can see (so creases are dark without any light
// having to find them); how thin the flesh is there (so ears glow when the sun
// is behind them); which bones move it; a colour or mask painted on by rule;
// and a pair of coordinates in metres round and along whatever limb it is on,
// for knitting to follow.
import * as THREE from 'three';
import { compilePrims, primDist, primParam, smin, smax } from '../../mammoth/sdf.js';
import { surfaceNets, orientOutward } from '../../mammoth/mesher.js';

/** One layer of a figure: solids added and cut, in the order given. */
export class Sculpt {
  /**
   * @param shapes  primitives as in mammoth/sdf.js, each with `k` (how softly it joins what is already there),
   *                `bone`, and optionally `cut: true` (carve it out instead), `uv: {...}` (see coordsOf)
   * @param k       the blend radius for shapes that do not give one
   * @param bump    (x, y, z) => metres to add to the distance near the surface: folds, wrinkles
   */
  constructor(shapes, { k = 0.004, bump = null, eps = 0.0006 } = {}) {
    this.prims = compilePrims(shapes.map((p) => ({ k, ...p })));
    this.solids = this.prims.filter((o) => !o.src.cut);
    this.bump = bump;
    this.eps = eps;
    let any = false;
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const o of this.solids) {
      any = true;
      const c = [o.bx, o.by, o.bz];
      for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], c[a] - o.br); max[a] = Math.max(max[a], c[a] + o.br); }
    }
    this.bounds = any ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
  }

  dist(x, y, z) {
    const prims = this.prims;
    let d = 1e9;
    for (let i = 0; i < prims.length; i++) {
      const o = prims[i];
      const dx = x - o.bx, dy = y - o.by, dz = z - o.bz;
      const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - o.br;
      if (o.src.cut) {
        if (lb > o.k || d > 1e8) continue;
        d = smax(d, -primDist(o, x, y, z), o.k);
      } else {
        if (lb >= d + o.k) continue;
        d = smin(d, primDist(o, x, y, z), o.k);
      }
    }
    if (this.bump && d < 0.01 && d > -0.01) d += this.bump(x, y, z);
    return d;
  }

  grad(x, y, z, out, h = this.eps) {
    const gx = this.dist(x + h, y, z) - this.dist(x - h, y, z);
    const gy = this.dist(x, y + h, z) - this.dist(x, y - h, z);
    const gz = this.dist(x, y, z + h) - this.dist(x, y, z - h);
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    out[0] = gx / l; out[1] = gy / l; out[2] = gz / l;
    return out;
  }

  /** The distance, if the point is within `reach` of where this layer is at all; otherwise just `reach` (cheaply). */
  within(x, y, z, reach) {
    const b = this.bounds;
    if (x < b.min[0] - reach || x > b.max[0] + reach || y < b.min[1] - reach || y > b.max[1] + reach || z < b.min[2] - reach || z > b.max[2] + reach) return reach;
    return this.dist(x, y, z);
  }

  /** The solids near a point, and how strongly each holds it. Returns how many were written. */
  influences(x, y, z, radius, outIndex, outWeight) {
    const prims = this.solids;
    let n = 0;
    for (let i = 0; i < prims.length; i++) {
      const o = prims[i];
      const dx = x - o.bx, dy = y - o.by, dz = z - o.bz;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - o.br >= radius) continue;
      const d = primDist(o, x, y, z);
      if (d >= radius) continue;
      const u = 1 - Math.max(d, 0) / radius;
      outIndex[n] = i;
      outWeight[n] = u * u * u * (o.src.hold ?? 1);
      n++;
    }
    return n;
  }

  /** The solid a point of the surface belongs to most (index into this.solids). */
  owner(x, y, z) {
    const prims = this.solids;
    let best = 0, bd = 1e9;
    for (let i = 0; i < prims.length; i++) {
      const o = prims[i];
      if (o.src.uv === false) continue;
      const dx = x - o.bx, dy = y - o.by, dz = z - o.bz;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - o.br >= bd) continue;
      const d = primDist(o, x, y, z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
}

const _ref = [0, 0, 0], _axis = [0, 0, 0];

/**
 * Where a point is on a solid, in metres: v along its axis, u round it. A
 * round cone's axis is its own; anything else turns about `uv.axis` (up, if
 * not given) through its middle. `uv.ref` is the direction u is measured
 * from (so the seam, opposite it, can be put out of sight), `uv.r` the radius
 * the distance round is reckoned at, `uv.v0` where v starts from (to carry on
 * from the solid before), and `uv.flip` runs v the other way.
 * Returns the angle too (out[2]), for unwrapping across a triangle.
 */
export function coordsOf(o, x, y, z, out) {
  const uv = o.src.uv || {};
  let ax, ay, az, px, py, pz, len = 1, r;
  if (o.t === 2 || o.t === 5) {
    len = Math.sqrt(o.l2);
    ax = o.bax / len; ay = o.bay / len; az = o.baz / len;
    px = x - o.ax; py = y - o.ay; pz = z - o.az;
    r = uv.r ?? Math.max(o.r1, o.r2);
  } else {
    const a = uv.axis || [0, 1, 0];
    ax = a[0]; ay = a[1]; az = a[2];
    px = x - o.cx; py = y - o.cy; pz = z - o.cz;
    r = uv.r ?? (o.t === 0 ? o.r : o.t === 1 ? Math.max(o.rx, o.rz) : o.t === 3 ? o.R + o.r : Math.max(o.hx, o.hz));
  }
  const along = px * ax + py * ay + pz * az;
  // across the axis
  const qx = px - ax * along, qy = py - ay * along, qz = pz - az * along;
  // a frame round the axis, starting from the reference direction
  const rf = uv.ref || (Math.abs(ay) > 0.9 ? [0, 0, 1] : [0, 1, 0]);
  let ex = rf[0], ey = rf[1], ez = rf[2];
  const dot = ex * ax + ey * ay + ez * az;
  ex -= ax * dot; ey -= ay * dot; ez -= az * dot;
  const el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
  ex /= el; ey /= el; ez /= el;
  const fx = ay * ez - az * ey, fy = az * ex - ax * ez, fz = ax * ey - ay * ex;
  const angle = Math.atan2(qx * fx + qy * fy + qz * fz, qx * ex + qy * ey + qz * ez);
  out[0] = angle * r;
  out[1] = (uv.v0 || 0) + (uv.flip ? -along : along);
  out[2] = angle;
  out[3] = r;
  return out;
}

/**
 * Sample a layer on a lattice. Only the blocks of the lattice that some solid could reach are looked at, and of those
 * only the ones the surface passes near are sampled point by point: a figure is mostly air.
 */
function sampleSparse(sculpt, bounds, cell, block = 4) {
  const nx = Math.ceil((bounds.max[0] - bounds.min[0]) / cell) + 1, ny = Math.ceil((bounds.max[1] - bounds.min[1]) / cell) + 1, nz = Math.ceil((bounds.max[2] - bounds.min[2]) / cell) + 1;
  const grid = new Float32Array(nx * ny * nz).fill(1);
  const ox = bounds.min[0], oy = bounds.min[1], oz = bounds.min[2], size = block * cell;
  const bx = Math.ceil(nx / block), by = Math.ceil(ny / block), bz = Math.ceil(nz / block);
  const flag = new Uint8Array(bx * by * bz);
  const half = size * Math.sqrt(3) * 0.5;
  for (const o of sculpt.solids) {
    const r = o.br + o.k + half + cell * 2;
    const x0 = Math.max(0, Math.floor((o.bx - r - ox) / size)), x1 = Math.min(bx - 1, Math.floor((o.bx + r - ox) / size));
    const y0 = Math.max(0, Math.floor((o.by - r - oy) / size)), y1 = Math.min(by - 1, Math.floor((o.by + r - oy) / size));
    const z0 = Math.max(0, Math.floor((o.bz - r - oz) / size)), z1 = Math.min(bz - 1, Math.floor((o.bz + r - oz) / size));
    for (let k = z0; k <= z1; k++) for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const cx = ox + (i + 0.5) * size - o.bx, cy = oy + (j + 0.5) * size - o.by, cz = oz + (k + 0.5) * size - o.bz;
      if (cx * cx + cy * cy + cz * cz <= r * r) flag[i + bx * (j + by * k)] = 1;
    }
  }
  const threshold = half * 1.6 + cell * 2;
  for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
    if (!flag[i + bx * (j + by * k)]) continue;
    const dc = sculpt.dist(ox + (i + 0.5) * size, oy + (j + 0.5) * size, oz + (k + 0.5) * size);
    const far = Math.abs(dc) > threshold;
    const ex = Math.min((i + 1) * block, nx), ey = Math.min((j + 1) * block, ny), ez = Math.min((k + 1) * block, nz);
    for (let z = k * block; z < ez; z++) for (let y = j * block; y < ey; y++) {
      let idx = i * block + nx * (y + ny * z);
      for (let x = i * block; x < ex; x++, idx++) grid[idx] = far ? dc : sculpt.dist(ox + x * cell, oy + y * cell, oz + z * cell);
    }
  }
  return { grid, nx, ny, nz, origin: [ox, oy, oz], cell };
}

/**
 * Turn a layer into a mesh.
 * @param cell       the size of the mesh's faces, metres
 * @param rig        from makeRig: whose bones the layer's solids name
 * @param occluder   (x, y, z) => distance to everything that could shade this layer (default: the layer itself)
 * @param buried     (x, y, z) => distance to whatever might cover it (other layers); faces well inside are left out
 * @param paint      (x, y, z, nx, ny, nz, out) => fills out[0..3] for each point (a colour, or masks; the material decides)
 * @param weightRadius how far a bone's hold reaches beyond its own solids
 */
export function meshLayer(sculpt, { cell = 0.0015, rig = null, occluder = null, buried = null, paint = null, weightRadius = 0.012, ao = [0.003, 0.008, 0.018, 0.035], thin = 0.006 } = {}) {
  const T0 = performance.now();
  const b = sculpt.bounds, pad = cell * 3;
  const bounds = { min: b.min.map((v) => v - pad), max: b.max.map((v) => v + pad) };
  const raw = surfaceNets(sampleSparse(sculpt, bounds, cell));
  const T1 = performance.now();
  const P = raw.positions, n = P.length / 3;
  const N = new Float32Array(n * 3), g = [0, 0, 0];
  // onto the true surface, and its normal there
  for (let i = 0; i < n; i++) {
    let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const d = sculpt.dist(x, y, z);
    sculpt.grad(x, y, z, g);
    x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    N[i * 3] = g[0]; N[i * 3 + 1] = g[1]; N[i * 3 + 2] = g[2];
  }
  orientOutward(raw, N);

  // faces nothing will ever see (skin under a jumper) are left out
  let I = raw.indices;
  if (buried) {
    const deep = new Uint8Array(n);
    for (let i = 0; i < n; i++) deep[i] = buried(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) < -cell * 1.2 ? 1 : 0;
    const keep = [];
    for (let t = 0; t < I.length; t += 3) if (!(deep[I[t]] && deep[I[t + 1]] && deep[I[t + 2]])) keep.push(I[t], I[t + 1], I[t + 2]);
    I = Uint32Array.from(keep);
  }

  const T2 = performance.now();
  // what each point needs to know about itself
  const occ = occluder || ((x, y, z) => sculpt.dist(x, y, z));
  const shade = new Float32Array(n * 2), tint = new Float32Array(n * 4).fill(1);
  const owner = new Int32Array(n);
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const idx = new Int32Array(64), wgt = new Float32Array(64), per = new Map(), out4 = [1, 1, 1, 1];
  const used = new Uint8Array(n);
  for (let t = 0; t < I.length; t++) used[I[t]] = 1;
  for (let i = 0; i < n; i++) {
    if (!used[i]) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    // how much of the sky it sees: probes out along the normal, each asking how near anything is
    let dark = 0, scale = 1;
    for (const h of ao) { dark += Math.max(0, h - occ(x + nx * h, y + ny * h, z + nz * h)) / h * scale; scale *= 0.7; }
    shade[i * 2] = Math.max(0, 1 - dark * 0.55);
    shade[i * 2 + 1] = Math.min(1, Math.max(0, 1 + sculpt.dist(x - nx * thin, y - ny * thin, z - nz * thin) / thin));
    owner[i] = sculpt.owner(x, y, z);
    if (paint) { out4[0] = out4[1] = out4[2] = out4[3] = 1; paint(x, y, z, nx, ny, nz, out4); tint[i * 4] = out4[0]; tint[i * 4 + 1] = out4[1]; tint[i * 4 + 2] = out4[2]; tint[i * 4 + 3] = out4[3]; }
    if (rig) {
      const m = sculpt.influences(x, y, z, weightRadius, idx, wgt);
      per.clear();
      for (let k = 0; k < m; k++) { const bone = rig.index.get(sculpt.solids[idx[k]].bone) ?? 0; per.set(bone, (per.get(bone) || 0) + wgt[k]); }
      if (!per.size) per.set(rig.index.get(sculpt.solids[owner[i]].bone) ?? 0, 1);
      const top = [...per.entries()].sort((a, c) => c[1] - a[1]).slice(0, 4);
      let sum = 0;
      for (const e of top) sum += e[1];
      top.forEach((e, k) => { skinIndex[i * 4 + k] = e[0]; skinWeight[i * 4 + k] = e[1] / sum; });
    }
  }

  const T3 = performance.now();
  // Round-and-along coordinates. Each face takes them all from one solid, and
  // unwrapped from its first corner, so a pattern never smears across a face;
  // where neighbouring faces disagree the points between them are doubled, and
  // that line is a seam, as it would be in the knitting.
  const c = [0, 0, 0, 0];
  const key = new Map();
  const pos = [], nor = [], uv = [], sh = [], col = [], si = [], sw = [], index = [];
  const emit = (i, o, turn) => {
    const k = i * 4096 + o * 8 + (turn + 2);
    let v = key.get(k);
    if (v !== undefined) return v;
    v = pos.length / 3;
    key.set(k, v);
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    coordsOf(sculpt.solids[o], x, y, z, c);
    pos.push(x, y, z); nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
    uv.push(c[0] + turn * 2 * Math.PI * c[3], c[1]);
    sh.push(shade[i * 2], shade[i * 2 + 1]);
    col.push(tint[i * 4], tint[i * 4 + 1], tint[i * 4 + 2], tint[i * 4 + 3]);
    si.push(skinIndex[i * 4], skinIndex[i * 4 + 1], skinIndex[i * 4 + 2], skinIndex[i * 4 + 3]);
    sw.push(skinWeight[i * 4], skinWeight[i * 4 + 1], skinWeight[i * 4 + 2], skinWeight[i * 4 + 3]);
    return v;
  };
  for (let t = 0; t < I.length; t += 3) {
    const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
    const o = owner[i0] === owner[i1] || owner[i0] === owner[i2] ? owner[i0] : owner[i1] === owner[i2] ? owner[i1] : owner[i0];
    const solid = sculpt.solids[o];
    const a0 = coordsOf(solid, P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2], c)[2];
    const a1 = coordsOf(solid, P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2], c)[2];
    const a2 = coordsOf(solid, P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2], c)[2];
    const turn = (a) => (a - a0 > Math.PI ? -1 : a - a0 < -Math.PI ? 1 : 0);
    index.push(emit(i0, o, 0), emit(i1, o, turn(a1)), emit(i2, o, turn(a2)));
  }
  meshLayer.log.push({ grid: T1 - T0, surface: T2 - T1, points: T3 - T2, faces: performance.now() - T3, verts: n, tris: index.length / 3 });
  return {
    position: new Float32Array(pos), normal: new Float32Array(nor), uv: new Float32Array(uv), shade: new Float32Array(sh), tint: new Float32Array(col),
    skinIndex: new Uint16Array(si), skinWeight: new Float32Array(sw), index: new Uint32Array(index),
  };
}

meshLayer.log = [];

/**
 * The bones of a figure. `spec` lists them root first: { name, parent, at: [x, y, z] } where `at` is where the
 * joint is when the figure stands at rest. Returns the bones by name and the skeleton they make.
 */
export function makeRig(spec) {
  const bones = {}, list = [], index = new Map(), rest = {};
  for (const b of spec) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bones[b.name] = bone; rest[b.name] = new THREE.Vector3(...b.at);
    index.set(b.name, list.length);
    list.push(bone);
  }
  const root = new THREE.Group();
  root.name = 'bones';
  for (const b of spec) {
    const bone = bones[b.name];
    if (b.parent) { bones[b.parent].add(bone); bone.position.copy(rest[b.name]).sub(rest[b.parent]); } else { root.add(bone); bone.position.copy(rest[b.name]); }
  }
  root.updateMatrixWorld(true);
  return { bones, list, index, rest, root, skeleton: new THREE.Skeleton(list) };
}

const DEPTH_VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
}`;
let skinnedDepth = null;
/** What a skinned mesh casts its shadow with (the shadow has to bend when it does). */
export function skinnedDepthMaterial() {
  if (!skinnedDepth) {
    skinnedDepth = new THREE.ShaderMaterial({
      vertexShader: DEPTH_VERT, fragmentShader: 'void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }', side: THREE.DoubleSide,
    });
  }
  return skinnedDepth;
}

/** A mesh of one layer, hung on the figure's bones. */
export function layerMesh(data, material, rig, name = '') {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
  geo.setAttribute('aShade', new THREE.BufferAttribute(data.shade, 2));
  geo.setAttribute('aTint', new THREE.BufferAttribute(data.tint, 4));
  geo.setIndex(new THREE.BufferAttribute(data.index, 1));
  let mesh;
  if (rig) {
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(data.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(data.skinWeight, 4));
    mesh = new THREE.SkinnedMesh(geo, material);
    mesh.bind(rig.skeleton, new THREE.Matrix4());
  } else {
    mesh = new THREE.Mesh(geo, material);
  }
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.userData.shadowMaterial = skinnedDepthMaterial();
  return mesh;
}

/**
 * Points scattered over a layer's surface, for things to grow from: `want(x, y, z, nx, ny, nz)` says how thickly
 * (0 for not at all, 1 for as thick as it gets). Returns up to `count` of { p: [x, y, z], n: [nx, ny, nz] }.
 */
export function scatter(data, count, want, seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const P = data.position, N = data.normal, I = data.index;
  // how much each face would like, and so where to throw the dice
  const tris = I.length / 3, share = new Float32Array(tris);
  let total = 0;
  for (let t = 0; t < tris; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const mx = (P[a] + P[b] + P[c]) / 3, my = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, mz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
    const w = area * Math.max(0, want(mx, my, mz, N[a], N[a + 1], N[a + 2]));
    total += w; share[t] = total;
  }
  const out = [];
  if (total <= 0) return out;
  for (let k = 0; k < count; k++) {
    const r = rnd() * total;
    let lo = 0, hi = tris - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (share[mid] < r) lo = mid + 1; else hi = mid; }
    const a = I[lo * 3] * 3, b = I[lo * 3 + 1] * 3, c = I[lo * 3 + 2] * 3;
    let u = rnd(), v = rnd();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    const n = [N[a] * w + N[b] * u + N[c] * v, N[a + 1] * w + N[b + 1] * u + N[c + 1] * v, N[a + 2] * w + N[b + 2] * u + N[c + 2] * v];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    out.push({ p: [P[a] * w + P[b] * u + P[c] * v, P[a + 1] * w + P[b + 1] * u + P[c + 1] * v, P[a + 2] * w + P[b + 2] * u + P[c + 2] * v], n: [n[0] / l, n[1] / l, n[2] / l] });
  }
  return out;
}
