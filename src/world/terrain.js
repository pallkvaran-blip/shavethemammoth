// The land: a snowy mammoth steppe. Gentle drifts around the mammoth, a trail
// of footprints leading to where it stands, wind-scoured patches of frozen
// grass, a frozen lake lying towards the sun and mountains on the far horizon.
//
// Heights are computed on the CPU (so other systems can ask for them) and
// laid out as nested meshes: finest around the feet, very fine around the
// mammoth, fine out to 50 m, then a radial sheet that runs to the mountains.
import * as THREE from 'three';
import { noise2, fbm2, ridged2, smoothstep, clamp } from './noise.js';
import { COMMON, SHADOWS, ATMOSPHERE } from '../gfx/glsl.js';
import { U, LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from '../gfx/globals.js';
import { makeDepthMaterial } from '../gfx/shadows.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

export const LAKE_LEVEL = -2.2;

export class Terrain {
  constructor({ sunAzimuth = -12, feet = [], snowDepth = 0.035 } = {}) {
    this.sunAz = (sunAzimuth * Math.PI) / 180;
    this.sx = Math.cos(this.sunAz); this.sz = Math.sin(this.sunAz);
    // the snow lies this far above the plane of the mammoth's soles (y = 0)
    this.snow = snowDepth;
    this.feet = feet;
    this.prints = [];
    // Where the mammoth stands now: each foot has sunk through the snow, which
    // fits closely round it and is pushed up into a low rim.
    for (const f of feet) {
      this.prints.push({ x: f.c[0], z: f.c[2], r: f.r + 0.045, inner: f.r - 0.012, depth: snowDepth + 0.022, rim: 0.014, rimR: f.r + 0.085, rimW: 0.045, standing: true });
    }
    // the trail it left walking in from behind
    const path = (s) => [-1.6 - s, 1.5 * Math.sin(s / 9.5) + 0.25 * Math.sin(s / 3.1)];
    const stride = 1.75;
    for (let s = 1.2, i = 0; s < 27; s += stride / 2, i++) {
      const [px, pz] = path(s), [qx, qz] = path(s + 0.1);
      let tx = qx - px, tz = qz - pz;
      const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
      const side = i % 2 === 0 ? 1 : -1;
      const fade = 1 - smoothstep(13, 26, s);
      // fore and hind prints nearly overlap
      for (const o of [0, 0.28]) {
        this.prints.push({ x: px - tz * side * 0.54 + tx * o, z: pz + tx * side * 0.54 + tz * o, r: 0.3, depth: 0.105 * fade, rim: 0.011 * fade });
      }
    }
    this.printBox = { minX: -30, maxX: 3, minZ: -4, maxZ: 4 };
  }

  macro(x, z) {
    const r = Math.hypot(x, z);
    // rolling steppe, flattening to a low rise where the mammoth stands
    let h = fbm2(x / 260 + 3.1, z / 260 - 1.7, 4) * 15 + fbm2(x / 64 + 5, z / 64 - 3, 3) * 2.2;
    h *= smoothstep(5, 70, r);
    h += 0.9 * Math.exp(-(r * r) / (38 * 38));

    // a shallow basin holding a frozen lake, out towards the sun
    const along = x * this.sx + z * this.sz, across = -x * this.sz + z * this.sx;
    const a = (along - 150) / 85, c = (across + 20) / 230;
    const basin = Math.exp(-(a * a + c * c));
    h = h * (1 - 0.85 * basin) - 5.2 * basin;

    if (r > 900) {
      // mountains ring the plain but leave the sunward side open
      const ang = Math.atan2(z, x);
      let d = Math.abs(ang - this.sunAz);
      if (d > Math.PI) d = 2 * Math.PI - d;
      const open = smoothstep(0.42, 1.25, d);
      const m = smoothstep(2600, 8800, r) * (0.18 + 0.82 * open);
      const warp = fbm2(x / 1900 + 11, z / 1900 - 5, 3) * 520;
      const ridge = ridged2((x + warp) / 2700 + 7.7, (z - warp) / 2700 + 2.2, 7, 2.13, 0.56);
      const big = 0.5 + 0.5 * fbm2(x / 5200 - 4, z / 5200 + 9, 3);
      const peak = Math.pow(ridge, 1.25);
      h += m * (110 + (peak * 1.55 + big * 0.45) * 1200 * (0.3 + 0.7 * big));
      // foothills
      h += smoothstep(1100, 4200, r) * (0.3 + 0.7 * open) * (0.5 + 0.5 * fbm2(x / 800, z / 800, 4)) * 110;
    }
    return h;
  }

  micro(x, z) {
    // wind-shaped drifts and ripples (sastrugi), stretched along the wind
    const wx = x * 0.94 + z * 0.34, wz = -x * 0.34 + z * 0.94;
    let h = fbm2(wx / 9, wz / 5, 3) * 0.16;
    h += noise2(wx / 2.6, wz / 0.9) * 0.022;
    h += noise2(wx / 0.7, wz / 0.33 + 4.0) * 0.008;
    return h;
  }

  /** How far footprints lower (or their rims raise) the snow. `trailOnly` leaves out the holes the mammoth is standing in. */
  printOffset(x, z, trailOnly = false) {
    const b = this.printBox;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return 0;
    let h = 0;
    for (const p of this.prints) {
      if (trailOnly && p.standing) continue;
      const dx = x - p.x, dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.45) continue;
      const d = Math.sqrt(d2);
      h -= p.depth * smoothstep(p.r, p.inner ?? p.r * 0.5, d);
      const k = (d - (p.rimR ?? p.r * 1.08)) / (p.rimW ?? 0.07);
      h += p.rim * Math.exp(-k * k);
    }
    return h;
  }

  /** Large-scale height relative to the mammoth's standing ground (which is y = 0). */
  land(x, z) {
    if (this.base === undefined) this.base = this.macro(0, 0);
    const r = Math.hypot(x, z);
    // level ground right under the mammoth so all four feet rest on it
    return (this.macro(x, z) - this.base) * smoothstep(1.2, 9, r);
  }

  /** Ground height. Returns the lake's surface where the land dips below it. */
  height(x, z) {
    const r = Math.hypot(x, z);
    const calm = 0.08 + 0.92 * smoothstep(1.5, 6, r);
    const h = this.land(x, z) + this.micro(x, z) * calm + this.printOffset(x, z) + this.snow;
    return Math.max(h, LAKE_LEVEL);
  }

  /** 0 = wind-scoured frozen grass, 1 = deep snow */
  cover(x, z) {
    const n = fbm2(x / 21 + 40, z / 21 - 13, 4) + 0.35 * fbm2(x / 5 + 9, z / 5, 2);
    const r = Math.hypot(x, z);
    // deeper snow where the mammoth stands (so the footprints read), patchier further out
    const near = 1 - smoothstep(6, 16, r);
    return clamp(smoothstep(-0.34, 0.02, n + 0.17 + near * 0.6), 0, 1);
  }

  isLake(x, z) {
    return this.land(x, z) - 0.012 < LAKE_LEVEL;
  }

  // ---- meshes ---------------------------------------------------------------

  /**
   * A regular grid of ground. With `seam`, the outer ring of vertices is
   * fitted to the edges of a coarser grid of that spacing (origin seam.x0,
   * seam.z0), so the two meshes meet without a step or a crack.
   */
  _gridMesh(x0, z0, x1, z1, step, bias, hole, seam) {
    const nx = Math.round((x1 - x0) / step) + 1, nz = Math.round((z1 - z0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const mask = new Float32Array(nx * nz * 4);
    const along = (a, b, t) => a + (b - a) * t;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * step, z = z0 + j * step;
        const k = i + j * nx;
        let h = this.height(x, z);
        if (seam && (i === 0 || i === nx - 1 || j === 0 || j === nz - 1)) {
          const cs = seam.step;
          if (i === 0 || i === nx - 1) {
            const a = seam.z0 + Math.floor((z - seam.z0) / cs + 1e-6) * cs;
            h = along(this.height(x, a), this.height(x, a + cs), Math.min(1, Math.max(0, (z - a) / cs)));
          } else {
            const a = seam.x0 + Math.floor((x - seam.x0) / cs + 1e-6) * cs;
            h = along(this.height(a, z), this.height(a + cs, z), Math.min(1, Math.max(0, (x - a) / cs)));
          }
        }
        pos[k * 3] = x; pos[k * 3 + 1] = h - bias; pos[k * 3 + 2] = z;
        this._mask(x, z, h, mask, k);
      }
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (hole) {
          const cx = x0 + (i + 0.5) * step, cz = z0 + (j + 0.5) * step;
          if (cx > hole.x0 && cx < hole.x1 && cz > hole.z0 && cz < hole.z1) continue;
        }
        const a = i + j * nx, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    let nrm;
    if (seam) {
      // Around the feet the mesh is too coarse to shade the holes they stand
      // in, so its normals leave those out and the shader works them out exactly.
      nrm = new Float32Array(nx * nz * 3);
      const e = step * 0.5;
      const hs = (x, z) => this.height(x, z) - (this.printOffset(x, z) - this.printOffset(x, z, true));
      for (let k = 0; k < nx * nz; k++) {
        const x = pos[k * 3], z = pos[k * 3 + 2];
        const hx = (hs(x + e, z) - hs(x - e, z)) / (2 * e), hz = (hs(x, z + e) - hs(x, z - e)) / (2 * e);
        const l = Math.hypot(hx, 1, hz);
        nrm[k * 3] = -hx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = -hz / l;
      }
    } else {
      nrm = this._gridNormals(pos, nx, nz);
    }
    return this._geometry(pos, nrm, mask, idx);
  }

  _gridNormals(pos, nx, nz) {
    const nrm = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = i + j * nx;
        const il = Math.max(0, i - 1), ir = Math.min(nx - 1, i + 1), jd = Math.max(0, j - 1), ju = Math.min(nz - 1, j + 1);
        const L = (il + j * nx) * 3, R = (ir + j * nx) * 3, D = (i + jd * nx) * 3, Uu = (i + ju * nx) * 3;
        const dx = pos[R] - pos[L], dz = pos[Uu + 2] - pos[D + 2];
        const hx = (pos[R + 1] - pos[L + 1]) / dx, hz = (pos[Uu + 1] - pos[D + 1]) / dz;
        const l = Math.hypot(hx, 1, hz);
        nrm[k * 3] = -hx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = -hz / l;
      }
    }
    return nrm;
  }

  _mask(x, z, h, mask, k) {
    const lake = h <= LAKE_LEVEL + 1e-4 ? 1 : 0;
    // shore: snow thins and ice shows as the land meets the lake
    const shore = 1 - smoothstep(0.0, 0.5, h - LAKE_LEVEL);
    mask[k * 4] = lake ? 1 : Math.max(this.cover(x, z), shore);
    mask[k * 4 + 1] = lake;
    mask[k * 4 + 2] = clamp(-this.printOffset(x, z, true) / 0.09, 0, 1);   // the holes being stood in are shaded in the shader
    mask[k * 4 + 3] = shore;
  }

  _geometry(pos, nrm, mask, idx) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 4));
    geo.setIndex(idx.length > 65535 * 3 || pos.length / 3 > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    geo.computeBoundingSphere();
    return geo;
  }

  _radialMesh(rInner, rOuter, growth, sectors) {
    const radii = [];
    for (let r = rInner; r < rOuter; r *= growth) radii.push(r);
    radii.push(rOuter);
    const rings = radii.length;
    const pos = new Float32Array(rings * sectors * 3);
    const nrm = new Float32Array(rings * sectors * 3);
    const mask = new Float32Array(rings * sectors * 4);
    for (let j = 0; j < rings; j++) {
      const r = radii[j];
      // sink slightly where the fine mesh overlaps, so the fine one always wins
      const bias = 0.14 * (1 - smoothstep(60, 120, r));
      for (let i = 0; i < sectors; i++) {
        const a = (i / sectors) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const k = i + j * sectors;
        const h = this.height(x, z);
        pos[k * 3] = x; pos[k * 3 + 1] = h - bias; pos[k * 3 + 2] = z;
        this._mask(x, z, h, mask, k);
      }
    }
    // normals from neighbours on the polar grid
    for (let j = 0; j < rings; j++) {
      const jl = Math.max(0, j - 1), jr = Math.min(rings - 1, j + 1);
      for (let i = 0; i < sectors; i++) {
        const il = (i + sectors - 1) % sectors, ir = (i + 1) % sectors;
        const k = i + j * sectors;
        const A = (il + j * sectors) * 3, B = (ir + j * sectors) * 3, C = (i + jl * sectors) * 3, D = (i + jr * sectors) * 3;
        const tx = pos[B] - pos[A], ty = pos[B + 1] - pos[A + 1], tz = pos[B + 2] - pos[A + 2];
        const rx = pos[D] - pos[C], ry = pos[D + 1] - pos[C + 1], rz = pos[D + 2] - pos[C + 2];
        // radial x tangential points up for this winding
        let nx = ry * tz - rz * ty, ny = rz * tx - rx * tz, nz = rx * ty - ry * tx;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const l = Math.hypot(nx, ny, nz) || 1;
        nrm[k * 3] = nx / l; nrm[k * 3 + 1] = ny / l; nrm[k * 3 + 2] = nz / l;
      }
    }
    const idx = [];
    for (let j = 0; j < rings - 1; j++) {
      for (let i = 0; i < sectors; i++) {
        const a = i + j * sectors, b = ((i + 1) % sectors) + j * sectors, c = a + sectors, d = b + sectors;
        idx.push(a, b, c, b, d, c);
      }
    }
    return this._geometry(pos, nrm, mask, idx);
  }

  async build(progress = () => {}, { detail = 1 } = {}) {
    this.material = makeTerrainMaterial();
    this.prints.filter((pr) => pr.standing).slice(0, 4).forEach((pr, i) => {
      const f = this.feet[i];
      this.material.uniforms.uFeet.value[i].set(f.c[0], f.c[2], f.r, pr.depth);
    });
    this.group = new THREE.Group();
    this.meshes = [];
    const depth = makeDepthMaterial({ side: THREE.DoubleSide });
    const add = (geo, name, far, near) => {
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.name = name;
      mesh.frustumCulled = false;
      mesh.userData.shadowMaterial = depth;
      mesh.userData.castNear = near; mesh.userData.castFar = far;
      if (far) mesh.layers.enable(LAYER_SHADOW_FAR);
      if (near) mesh.layers.enable(LAYER_SHADOW_NEAR);
      this.group.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };
    const fine = { x0: -28, z0: -7, x1: 7, z1: 7 };
    const s0 = detail >= 1 ? 0.05 : 0.08;
    progress(0.05, 'Laying snow');
    await tick();
    // The snow right around the feet, fine enough to hold the holes they stand
    // in. Its box sits on the coarser grid's lines, and its rim is fitted to
    // that grid, so the two join invisibly.
    const feetBox = { x0: -1.8, z0: -1.0, x1: 1.6, z1: 1.0 };
    add(this._gridMesh(feetBox.x0, feetBox.z0, feetBox.x1, feetBox.z1, detail >= 1 ? 0.01 : 0.0125, 0, null, { step: s0, x0: fine.x0, z0: fine.z0 }), 'ground-feet', false, true);
    await tick();
    add(this._gridMesh(fine.x0, fine.z0, fine.x1, fine.z1, s0, 0, feetBox), 'ground-fine', true, true);
    progress(0.45, 'Laying snow');
    await tick();
    const hole = { x0: fine.x0 + 0.6, z0: fine.z0 + 0.6, x1: fine.x1 - 0.6, z1: fine.z1 - 0.6 };
    add(this._gridMesh(-50, -50, 50, 50, detail >= 1 ? 0.25 : 0.4, 0.035, hole), 'ground-mid', true, true);
    progress(0.8, 'Raising mountains');
    await tick();
    add(this._radialMesh(38, 21000, detail >= 1 ? 1.024 : 1.036, detail >= 1 ? 640 : 448), 'ground-far', true, false);
    progress(1, 'Raising mountains');
    return this.group;
  }
}

// -----------------------------------------------------------------------------

const VERT = /* glsl */ `
attribute vec4 aMask;
varying vec3 vPosW;
varying vec3 vN;
varying vec4 vMask;
void main() {
  vPosW = position;
  vN = normal;
  vMask = aMask;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
${COMMON}
${SHADOWS}
${ATMOSPHERE}
varying vec3 vPosW;
varying vec3 vN;
varying vec4 vMask;
uniform vec4 uOccluders[12];  // spheres standing in for the mammoth: xyz, radius
uniform float uLakeLevel;
uniform vec4 uFeet[4];        // where the mammoth stands: x, z, radius of the foot, depth of the hole

// snow surface relief: wind-carved ridges (sastrugi) with soft drifts between
float ridgeN(vec2 p) { float n = vnoise(p); return 1.0 - abs(n * 2.0 - 1.0); }
float snowHeight(vec2 p) {
  vec2 w = vec2(p.x * 0.94 + p.y * 0.34, -p.x * 0.34 + p.y * 0.94);
  float patchy = smoothstep(0.3, 0.7, vnoise(w * vec2(0.12, 0.3) + 4.0));   // some areas smooth, some carved
  float h = vnoise(w * vec2(0.3, 0.8)) * 0.5;
  // long ridges running with the wind, each with a sharp crest
  float r1 = ridgeN(w * vec2(0.55, 5.2) + vec2(0.0, vnoise(w * vec2(0.4, 0.9)) * 0.9));
  h += r1 * r1 * 0.28 * (0.3 + 0.7 * patchy);
  float r2 = ridgeN(w * vec2(1.9, 15.0) + vec2(9.0, vnoise(w * vec2(1.3, 2.0)) * 0.7));
  h += r2 * r2 * 0.075 * patchy;
  h += vnoise(p * 31.0) * 0.018;
  return h;
}
float grain(vec2 p) {
  return vnoise(p * 85.0) * 0.6 + vnoise(p * 210.0 + 11.0) * 0.4;
}
// mountain relief the mesh is too coarse to carry: ridges, gullies, crags
float ridge(vec2 p) { return 1.0 - abs(vnoise(p) * 2.0 - 1.0); }
float crag(vec2 p) {
  float h = ridge(p / 560.0) * 130.0;
  p = mat2(0.8, 0.6, -0.6, 0.8) * p;
  h += ridge(p / 230.0 + 13.0) * 58.0;
  p = mat2(0.8, 0.6, -0.6, 0.8) * p;
  h += ridge(p / 92.0 + 5.0) * 22.0;
  p = mat2(0.8, 0.6, -0.6, 0.8) * p;
  h += ridge(p / 36.0 + 29.0) * 8.5;
  return h;
}
vec3 hash3(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float glitter(vec3 wp, vec3 N, vec3 H, float dist) {
  // glints stay about a pixel wide whatever the distance
  float lvl = log2(max(dist, 0.3) * 1.1);
  float l0 = floor(lvl), f = lvl - l0;
  float s = 0.0;
  for (int i = 0; i < 2; i++) {
    float cell = exp2(l0 + float(i)) * 0.0028;
    vec2 id = floor(wp.xz / cell);
    vec3 r = hash3(id + float(i) * 37.0);
    vec3 mn = normalize(N + (r - 0.5) * 1.1);
    float sp = pow(max(dot(mn, H), 0.0), 900.0);
    s += sp * (i == 0 ? 1.0 - f : f);
  }
  return s;
}
float sphereOcclusion(vec3 p, vec3 n) {
  float occ = 0.0;
  for (int i = 0; i < 12; i++) {
    vec3 d = uOccluders[i].xyz - p;
    float l2 = dot(d, d);
    float r2 = uOccluders[i].w * uOccluders[i].w;
    occ += max(0.0, dot(n, d) * inversesqrt(l2)) * r2 / (l2 + r2 * 0.5);
  }
  return clamp(1.0 - occ * 0.85, 0.22, 1.0);
}

void main() {
  vec3 V = cameraPosition - vPosW;
  float dist = length(V);
  V /= dist;
  vec3 Ng = normalize(vN);
  float footprint = max(length(dFdx(vPosW.xz)), length(dFdy(vPosW.xz)));   // metres per pixel
  float dither = ign(gl_FragCoord.xy);
  vec2 p = vPosW.xz;

  float cover = vMask.x;
  float ice = vMask.y;
  float tramp = vMask.z;

  // The holes the mammoth stands in: a steep wall of packed snow round each
  // foot and a low rim pushed up outside it. Shaded from the exact shape, as
  // the mesh is too coarse to carry it.
  vec2 holeSlope = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 d = p - uFeet[i].xy;
    float dd = length(d);
    float r = uFeet[i].z;
    if (dd < r + 0.3) {
      float a = r + 0.045, b = r - 0.012;                 // outer and inner edge of the wall
      float t = clamp((dd - a) / (b - a), 0.0, 1.0);
      float k = (dd - (r + 0.085)) / 0.045;
      float dh = -uFeet[i].w * 6.0 * t * (1.0 - t) / (b - a) - 0.014 * exp(-k * k) * 2.0 * k / 0.045;
      holeSlope += dh * d / max(dd, 1e-4);
      tramp = max(tramp, t * t * (3.0 - 2.0 * t) * min(1.0, uFeet[i].w / 0.09));
    }
  }
  Ng = normalize(vec3(Ng.x / Ng.y - holeSlope.x, 1.0, Ng.z / Ng.y - holeSlope.y));

  // ---- far relief ---------------------------------------------------------------
  float high = smoothstep(50.0, 300.0, vPosW.y) * smoothstep(400.0, 1500.0, dist);
  if (high > 0.001) {
    float e = max(footprint * 1.2, 7.0);
    float c0 = crag(p), cx = crag(p + vec2(e, 0.0)), cz = crag(p + vec2(0.0, e));
    Ng = normalize(Ng + vec3(-(cx - c0), 0.0, -(cz - c0)) / e * 0.7 * high);
  }
  float slope = 1.0 - Ng.y;

  // ---- near relief --------------------------------------------------------------
  float e = max(0.02, footprint * 1.5);
  float h0 = snowHeight(p), hx = snowHeight(p + vec2(e, 0.0)), hz = snowHeight(p + vec2(0.0, e));
  float reliefFade = 1.0 - smoothstep(0.15, 1.2, footprint);
  vec3 N = normalize(Ng + vec3(-(hx - h0), 0.0, -(hz - h0)) / e * 0.085 * reliefFade);
  float gFade = 1.0 - smoothstep(0.002, 0.012, footprint);
  if (gFade > 0.0) {
    float ge = 0.004;
    float g0 = grain(p), gx = grain(p + vec2(ge, 0.0)), gz = grain(p + vec2(0.0, ge));
    N = normalize(N + vec3(-(gx - g0), 0.0, -(gz - g0)) / ge * 0.0016 * gFade);
  }

  // ---- what the ground is made of -------------------------------------------------
  // snow: bright, faintly blue; old wind crust slightly greyer than fresh powder
  float crust = vnoise(p * 0.35 + 2.0);
  vec3 snowAlb = mix(vec3(0.84, 0.86, 0.90), vec3(0.92, 0.93, 0.95), crust);
  snowAlb *= 1.0 - 0.10 * tramp;
  // frozen ground and flattened dead grass where the wind has scoured the snow away
  float gn = vnoise(p * 3.0) * 0.6 + vnoise(p * 17.0 + 5.0) * 0.4;
  float fibres = vnoise(vec2(p.x * 60.0 + p.y * 14.0, p.y * 9.0));
  vec3 groundAlb = mix(vec3(0.115, 0.085, 0.050), vec3(0.34, 0.265, 0.13), gn * 0.75 + fibres * 0.25);
  // snow hangs on in the lee of every bump
  float coverN = cover + (h0 - 0.45) * 0.55 * (1.0 - cover) + (fibres - 0.5) * (1.0 - cover) * cover;
  coverN = smoothstep(0.0, 1.0, clamp(coverN, 0.0, 1.0));

  // mountainsides: rock where it is too steep to hold snow, in bands and streaks
  float strata = vnoise(vec2(vPosW.y * 0.045 + vnoise(p * 0.004) * 3.0, p.x * 0.002));
  float rockN = vnoise(p * 0.011) * 0.55 + vnoise(p * 0.047 + 3.0) * 0.45;
  float rocky = smoothstep(0.30, 0.52, slope + (rockN - 0.5) * 0.22 + (strata - 0.5) * 0.1) * high;
  vec3 rockAlb = mix(vec3(0.050, 0.047, 0.050), vec3(0.135, 0.115, 0.10), strata * 0.6 + rockN * 0.4);

  vec3 albedo = mix(groundAlb, snowAlb, coverN);
  albedo = mix(albedo, rockAlb, rocky);
  float snowy = coverN * (1.0 - rocky);

  // ---- lighting -------------------------------------------------------------------
  float vis = sunVisibility(vPosW + Ng * 0.012, 200.0, 0.012, 0.018, dither);
  float NL = dot(N, uSunDir);
  // snow scatters light under its surface: a soft terminator
  float diffuse = mix(max(NL, 0.0), clamp((NL + 0.18) / 1.18, 0.0, 1.0), snowy * 0.8);
  float occ = sphereOcclusion(vPosW, Ng);
  // the bottom of a footprint sees less sky
  vec3 amb = ambientLight(N) * occ * (1.0 - 0.4 * tramp);
  vec3 col = albedo * (uSunColor * diffuse * vis + amb);

  vec3 H = normalize(uSunDir + V);
  float NH = max(dot(N, H), 0.0);
  float fres = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 5.0);
  // crusted snow glares towards a low sun, and individual crystals flash
  float sheen = pow(NH, 48.0) * (0.035 + 0.5 * fres);
  float sparkle = glitter(vPosW, N, H, dist) * (1.0 - smoothstep(25.0, 90.0, dist));
  col += uSunColor * vis * snowy * (sheen * 0.9 + sparkle * 22.0) * step(0.0, NL);

  // ---- frozen lake ----------------------------------------------------------------
  if (ice > 0.001) {
    // wind keeps patches of the ice swept clean; the rest lies under drifted snow
    vec2 w = vec2(p.x * 0.94 + p.y * 0.34, -p.x * 0.34 + p.y * 0.94);
    float sweep = vnoise(w * vec2(0.035, 0.09)) * 0.6 + vnoise(w * vec2(0.11, 0.33) + 7.0) * 0.4;
    float bare = smoothstep(0.55, 0.72, sweep) * ice * 0.92;
    vec3 Ni = normalize(vec3((vnoise(p * 0.8) - 0.5) * 0.010, 1.0, (vnoise(p * 0.8 + 9.0) - 0.5) * 0.010));
    // pressure cracks: thin pale lines wandering through dark ice
    float cr = abs(vnoise(p * 0.21 + vnoise(p * 0.9) * 0.6) - 0.5);
    float cracks = (1.0 - smoothstep(0.0, 0.012, cr)) * 0.5;
    vec3 iceAlb = mix(vec3(0.020, 0.026, 0.036), vec3(0.42, 0.45, 0.50), cracks);
    vec3 iceCol = iceAlb * (uSunColor * max(dot(Ni, uSunDir), 0.0) * vis + ambientLight(Ni));
    vec3 R = reflect(-V, Ni);
    float F = 0.02 + 0.98 * pow(clamp(1.0 - dot(Ni, V), 0.0, 1.0), 5.0);
    // scuffed ice blurs the reflection: part horizon, part higher sky
    vec3 refl = mix(skyLut(normalize(vec3(R.x, max(R.y, 0.03), R.z))), skyLut(normalize(vec3(R.x, 0.45, R.z))), 0.55);
    float NHi = max(dot(Ni, H), 0.0);
    float sunSpec = pow(NHi, 3000.0) * 40.0 + pow(NHi, 260.0) * 1.2;
    iceCol = mix(iceCol, refl, F) + uSunColor * sunSpec * vis * F;
    col = mix(col, iceCol, bare);
  }

  col = applyAtmosphere(col, vPosW, cameraPosition);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeTerrainMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...U,
      uOccluders: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, -100, 0, 0)) },
      uLakeLevel: { value: LAKE_LEVEL },
      uFeet: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0.1, 0)) },
    },
    defines: { SHADOW_TAPS: 12, SHADOW_PENUMBRA: 1, SHADOW_PLANE_BIAS: 1 },
  });
}
