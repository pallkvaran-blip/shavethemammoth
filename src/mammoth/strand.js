// Where is a lock of hair, right now, in the world? The fur is shaped on the
// GPU, so to cut it we follow the same recipe here for the guide strand of
// each lock: leave the skin, bend under gravity and wind, gather into the
// lock, drape over the body, ride on the skeleton. It mirrors the vertex
// shader in furMaterial.js step by step (leaving out only each hair's own
// millimetre-scale kink), so a blade that looks as if it passes through a
// lock on screen really does.
import { U } from '../gfx/globals.js';

const fract = (x) => x - Math.floor(x);
const f32 = Math.fround;
function hash11(p) {
  p = f32(fract(f32(p * 0.1031)));
  p = f32(p * f32(p + 33.33));
  p = f32(p * f32(p + p));
  return fract(p);
}
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class StrandSampler {
  constructor({ volume, skeleton }) {
    this.vol = volume.data;
    this.nx = volume.res[0]; this.ny = volume.res[1]; this.nz = volume.res[2];
    const b = volume.bounds;
    this.min = b.min;
    this.inv = [1 / (b.max[0] - b.min[0]), 1 / (b.max[1] - b.min[1]), 1 / (b.max[2] - b.min[2])];
    this.skeleton = skeleton;
    this.noise = U.uNoise.value.image.data;
    this.M = new Float32Array(16);
    this.sd = new Float32Array(4);
    this.wind = [0, 0, 0];
    this.windRest = [0, 0, 0];   // the wind's push on the strand last set up, in the rest pose
    this.time = 0;
    this.breath = 0;
  }

  /** Call once per query batch with the current time and breathing offset. */
  begin(breath) {
    this.time = U.uTime.value;
    this.breath = breath;
    this.bones = this.skeleton.boneMatrices;
    const w = U.uWind.value;
    this.wx = w.x; this.wy = w.y; this.wBase = w.z; this.wGust = w.w;
  }

  // ---- the same noise and wind the shaders use --------------------------------
  vnoise(px, py) {
    const ix = Math.floor(px), iy = Math.floor(py);
    let fx = px - ix, fy = py - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const n = this.noise;
    const x0 = ix & 255, x1 = (ix + 1) & 255, y0 = iy & 255, y1 = (iy + 1) & 255;
    const a = n[(x0 + y0 * 256) * 4], b = n[(x1 + y0 * 256) * 4], c = n[(x0 + y1 * 256) * 4], d = n[(x1 + y1 * 256) * 4];
    return ((a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy) / 255;
  }

  windGust(x, z) {
    const px = x * 0.05 - this.wx * this.time * 0.42, py = z * 0.05 - this.wy * this.time * 0.42;
    const n = this.vnoise(px, py) * 0.65 + this.vnoise(px * 2.7 + 11.3, py * 2.7 + 11.3) * 0.35;
    return smoothstep(0.28, 0.8, n);
  }

  /** Horizontal push of the wind at a world position (same units as the shader's windPush). */
  windPush(x, y, z, phase, out) {
    const t = this.time;
    const g = this.windGust(x, z);
    const s = this.wBase + this.wGust * g;
    const flutter = Math.sin(t * (5.2 + phase * 3) + x * 2.1 + z * 1.7 + phase * 40);
    const sway = Math.sin(t * 1.35 + phase * 6.283 + (x * this.wx + z * this.wy) * 0.6);
    const k = s * (0.72 + 0.2 * sway + 0.11 * flutter * (0.4 + g));
    const c = s * 0.12 * Math.sin(t * 0.9 + phase * 17 + z * 0.8);
    out[0] = this.wx * k - this.wy * c; out[1] = 0; out[2] = this.wy * k + this.wx * c;
    return out;
  }

  /** Distance to the body and its gradient at a rest-pose point: rgb = gradient, a = metres. */
  sampleVolume(x, y, z, out) {
    const { nx, ny, nz, vol } = this;
    let u = (x - this.min[0]) * this.inv[0] * nx - 0.5;
    let v = (y - this.min[1]) * this.inv[1] * ny - 0.5;
    let w = (z - this.min[2]) * this.inv[2] * nz - 0.5;
    u = u < 0 ? 0 : u > nx - 1 ? nx - 1 : u; v = v < 0 ? 0 : v > ny - 1 ? ny - 1 : v; w = w < 0 ? 0 : w > nz - 1 ? nz - 1 : w;
    const x0 = Math.floor(u), y0 = Math.floor(v), z0 = Math.floor(w);
    const x1 = Math.min(nx - 1, x0 + 1), y1 = Math.min(ny - 1, y0 + 1), z1 = Math.min(nz - 1, z0 + 1);
    const fx = u - x0, fy = v - y0, fz = w - z0;
    const i000 = (x0 + nx * (y0 + ny * z0)) * 4, i100 = (x1 + nx * (y0 + ny * z0)) * 4;
    const i010 = (x0 + nx * (y1 + ny * z0)) * 4, i110 = (x1 + nx * (y1 + ny * z0)) * 4;
    const i001 = (x0 + nx * (y0 + ny * z1)) * 4, i101 = (x1 + nx * (y0 + ny * z1)) * 4;
    const i011 = (x0 + nx * (y1 + ny * z1)) * 4, i111 = (x1 + nx * (y1 + ny * z1)) * 4;
    for (let k = 0; k < 4; k++) {
      const a = vol[i000 + k] + (vol[i100 + k] - vol[i000 + k]) * fx;
      const b = vol[i010 + k] + (vol[i110 + k] - vol[i010 + k]) * fx;
      const c = vol[i001 + k] + (vol[i101 + k] - vol[i001 + k]) * fx;
      const d = vol[i011 + k] + (vol[i111 + k] - vol[i011 + k]) * fx;
      const e = a + (b - a) * fy, f = c + (d - c) * fy;
      out[k] = e + (f - e) * fz;
    }
    return out;
  }

  /** Prepare to trace guide i of a set of strand arrays. */
  setup(a, i) {
    const i3 = i * 3, i4 = i * 4;
    this.rx = a.iRoot[i3]; this.ry = a.iRoot[i3 + 1]; this.rz = a.iRoot[i3 + 2];
    this.ox = a.iOff[i3]; this.oy = a.iOff[i3 + 1]; this.oz = a.iOff[i3 + 2];
    this.n0x = a.iNormal[i3]; this.n0y = a.iNormal[i3 + 1]; this.n0z = a.iNormal[i3 + 2];
    const L = a.iA[i4], ss = a.iA[i4 + 2], cs = a.iA[i4 + 3];
    const droop = a.iB[i4];
    this.L = L;
    this.tight = Math.min(a.iB[i4 + 1], 0.97);
    this.layer = a.iB[i4 + 2];
    this.breathW = a.iB[i4 + 3];

    // skin matrix: one bone, or a blend of two
    const B = this.bones, M = this.M;
    const b0 = a.iSkinIdx[i4] * 16, w0 = a.iSkinWgt[i4] / 255, w1 = a.iSkinWgt[i4 + 1] / 255;
    for (let k = 0; k < 16; k++) M[k] = B[b0 + k] * w0;
    if (w1 > 0.004) {
      const b1 = a.iSkinIdx[i4 + 1] * 16;
      for (let k = 0; k < 16; k++) M[k] += B[b1 + k] * w1;
    }
    // root in the world, for the wind
    const rwx = M[0] * this.rx + M[4] * this.ry + M[8] * this.rz + M[12];
    const rwy = M[1] * this.rx + M[5] * this.ry + M[9] * this.rz + M[13];
    const rwz = M[2] * this.rx + M[6] * this.ry + M[10] * this.rz + M[14];
    const wv = this.windPush(rwx, rwy, rwz, cs, this.wind);
    // wind brought back into the rest pose: transpose(mat3(M)) * wind
    const wrx = M[0] * wv[0] + M[1] * wv[1] + M[2] * wv[2];
    const wry = M[4] * wv[0] + M[5] * wv[1] + M[6] * wv[2];
    const wrz = M[8] * wv[0] + M[9] * wv[1] + M[10] * wv[2];
    this.windRest[0] = wrx; this.windRest[1] = wry; this.windRest[2] = wrz;

    let dx = a.iDir[i3], dy = a.iDir[i3 + 1], dz = a.iDir[i3 + 2];
    let l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const wk = 0.55 + 0.5 * droop;
    let ex = dx * (1 - droop) + wrx * wk, ey = dy * (1 - droop) - droop + wry * wk, ez = dz * (1 - droop) + wrz * wk;
    l = Math.hypot(ex, ey, ez) || 1; ex /= l; ey /= l; ez /= l;
    this.p1x = dx * L * 0.36; this.p1y = dy * L * 0.36; this.p1z = dz * L * 0.36;
    this.p2x = this.p1x + ex * L * 0.64; this.p2y = this.p1y + ey * L * 0.64; this.p2z = this.p1z + ez * L * 0.64;

    // the lock's wave
    let ax, ay, az;
    if (Math.abs(dy) < 0.9) { ax = -dz; ay = 0; az = dx; }   // cross(d0, up)
    else { ax = 0; ay = dz; az = -dy; }                     // cross(d0, x)
    l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
    this.e1x = ax; this.e1y = ay; this.e1z = az;
    this.e2x = dy * az - dz * ay; this.e2y = dz * ax - dx * az; this.e2z = dx * ay - dy * ax;
    const cseed = fract(f32(ss * 13.37));
    const h1 = hash11(cseed * 91.3 + 1.7), h5 = hash11(cseed * 11.1 + 7.9);
    this.wAmp = (0.006 + 0.03 * L) * (0.5 + cs);
    this.f1 = 6.2831 * (0.8 + 1.1 * fract(f32(cs * 7.31))); this.f2 = 6.2831 * (0.6 + 1.2 * fract(f32(cs * 3.77)));
    this.ph1 = cs * 40 + h1 * 0.9; this.ph2 = cs * 71 + h5 * 0.7;
  }

  /**
   * World position of the prepared guide at parameter t (0 = root, 1 = the
   * tip of the uncut hair). Also leaves the rest-pose position in this.rest.
   */
  point(t, out) {
    const it = 1 - t, g = this.tight * t * (2 - t);
    const s1 = Math.sin(this.f1 * t + this.ph1) * this.wAmp * t, s2 = Math.sin(this.f2 * t + this.ph2) * this.wAmp * t;
    let x = this.rx + 2 * it * t * this.p1x + t * t * this.p2x - this.ox * g + this.e1x * s1 + this.e2x * s2;
    let y = this.ry + 2 * it * t * this.p1y + t * t * this.p2y - this.oy * g + this.e1y * s1 + this.e2y * s2;
    let z = this.rz + 2 * it * t * this.p1z + t * t * this.p2z - this.oz * g + this.e1z * s1 + this.e2z * s2;
    // drape over the body
    const sd = this.sampleVolume(x, y, z, this.sd);
    const h = this.layer * smoothstep(0, 0.3, t) + 0.004;
    const push = h - sd[3];
    if (push > 0) {
      const l = Math.hypot(sd[0], sd[1], sd[2]) || 1;
      x += (sd[0] / l) * push; y += (sd[1] / l) * push; z += (sd[2] / l) * push;
    }
    const br = this.breathW * this.breath;
    x += this.n0x * br; y += this.n0y * br; z += this.n0z * br;
    const M = this.M;
    out[0] = M[0] * x + M[4] * y + M[8] * z + M[12];
    out[1] = M[1] * x + M[5] * y + M[9] * z + M[13];
    out[2] = M[2] * x + M[6] * y + M[10] * z + M[14];
    return out;
  }
}
