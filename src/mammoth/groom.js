// Grooming: scatters hair strands over the body and gathers them into locks.
// Each strand is one GPU instance; the vertex shader grows it from these
// attributes, so cutting hair later is just a matter of editing its length.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const LONG_HAIR = 0.19; // strands longer than this get the many-segment ribbon
export const UNCUT = 10;       // cut length (metres) of a lock that has never met the shears

/**
 * @returns {{long: object, short: object}} instance attribute arrays per group
 */
export function generateGroom(body, { count = 240000, seed = 7, clumpSize = 11 } = {}) {
  const P = body.positions, N = body.normals, I = body.indices, FA = body.furA, FB = body.furB, FL = body.flow;
  const SI = body.skinIndex, SW = body.skinWeight;
  const rng = mulberry32(seed);
  const triCount = I.length / 3;

  // ---- area-weighted sampling, denser where the hair is short ------------
  const cdf = new Float64Array(triCount);
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
    const len = (FA[I[t * 3] * 4] + FA[I[t * 3 + 1] * 4] + FA[I[t * 3 + 2] * 4]) / 3;
    let wgt = 0;
    if (len > 0.012) wgt = area * Math.pow(clamp(0.5 / len, 1, 5), 0.62);
    total += wgt;
    cdf[t] = total;
  }

  const S = count;
  const root = new Float32Array(S * 3);
  const nrm = new Float32Array(S * 3);
  const sLen = new Float32Array(S), sLift = new Float32Array(S), sTone = new Float32Array(S), sRed = new Float32Array(S);
  const sClump = new Float32Array(S), sBreath = new Float32Array(S);
  const sFlow = new Float32Array(S * 3);
  const sTri = new Uint32Array(S);   // the triangle of hide each strand grows from
  const skinI = new Uint8Array(S * 4), skinW = new Uint8Array(S * 4);

  for (let s = 0; s < S; s++) {
    const r = rng() * total;
    let lo = 0, hi = triCount - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
    const ia = I[lo * 3], ib = I[lo * 3 + 1], ic = I[lo * 3 + 2];
    sTri[s] = lo;
    const su = Math.sqrt(rng()), r2 = rng();
    const b0 = 1 - su, b1 = su * (1 - r2), b2 = su * r2;
    for (let k = 0; k < 3; k++) {
      root[s * 3 + k] = P[ia * 3 + k] * b0 + P[ib * 3 + k] * b1 + P[ic * 3 + k] * b2;
      nrm[s * 3 + k] = N[ia * 3 + k] * b0 + N[ib * 3 + k] * b1 + N[ic * 3 + k] * b2;
    }
    const nl = Math.hypot(nrm[s * 3], nrm[s * 3 + 1], nrm[s * 3 + 2]) || 1;
    nrm[s * 3] /= nl; nrm[s * 3 + 1] /= nl; nrm[s * 3 + 2] /= nl;
    const f = (arr, k) => arr[ia * 4 + k] * b0 + arr[ib * 4 + k] * b1 + arr[ic * 4 + k] * b2;
    sLen[s] = f(FA, 0); sLift[s] = f(FA, 1); sTone[s] = f(FA, 2); sRed[s] = f(FA, 3);
    sClump[s] = f(FB, 0); sBreath[s] = f(FB, 1);
    for (let k = 0; k < 3; k++) sFlow[s * 3 + k] = FL[ia * 3 + k] * b0 + FL[ib * 3 + k] * b1 + FL[ic * 3 + k] * b2;
    const iv = b0 >= b1 && b0 >= b2 ? ia : b1 >= b2 ? ib : ic;
    // keep the two strongest bones
    let w0 = SW[iv * 4], w1 = SW[iv * 4 + 1];
    const sum = w0 + w1 || 1;
    skinI[s * 4] = SI[iv * 4]; skinI[s * 4 + 1] = SI[iv * 4 + 1];
    skinW[s * 4] = Math.round((w0 / sum) * 255); skinW[s * 4 + 1] = 255 - skinW[s * 4];
  }

  // ---- lock centres on a hash grid ----------------------------------------
  const CELL = 0.14;
  const grid = new Map();
  const key = (x, y, z) => ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);
  const centres = [];
  for (let s = 0; s < S; s++) {
    // long shaggy regions make fewer, bigger locks
    const p = 1 / (clumpSize * sClump[s] * sClump[s]);
    if (rng() < p) {
      centres.push(s);
      const k = key(Math.floor(root[s * 3] / CELL), Math.floor(root[s * 3 + 1] / CELL), Math.floor(root[s * 3 + 2] / CELL));
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(s);
    }
  }

  // per-lock direction and character
  const dirOf = new Float32Array(S * 3);
  const lockRand = new Float32Array(S * 4);
  const isCentre = new Uint8Array(S);
  const computeDir = (s, out) => {
    const nx = nrm[s * 3], ny = nrm[s * 3 + 1], nz = nrm[s * 3 + 2];
    const z = root[s * 3 + 2];
    // gravity projected onto the skin
    let fx = nx * ny, fy = ny * ny - 1, fz = nz * ny;
    // on the top line, comb backwards and outwards (a parting along the spine)
    const top = smooth(0.3, 0.95, ny);
    let cx = -1, cy = 0, cz = 0.75 * Math.tanh(z * 5);
    const cd = cx * nx + cy * ny + cz * nz;
    cx -= nx * cd; cy -= ny * cd; cz -= nz * cd;
    // where the hair is combed along a limb (the trunk), it follows the limb and lies flatter
    let wx = sFlow[s * 3], wy = sFlow[s * 3 + 1], wz = sFlow[s * 3 + 2];
    const wn = wx * nx + wy * ny + wz * nz;
    wx -= nx * wn; wy -= ny * wn; wz -= nz * wn;
    const combed = Math.min(1, Math.hypot(sFlow[s * 3], sFlow[s * 3 + 1], sFlow[s * 3 + 2]));
    fx = fx * (1 - 0.7 * combed) + wx * 1.5; fy = fy * (1 - 0.7 * combed) + wy * 1.5; fz = fz * (1 - 0.7 * combed) + wz * 1.5;
    const lift = (0.12 + sLift[s] * 0.95) * (1 - 0.45 * combed);
    // long hair is unruly; short hair lies in a consistent flow
    const jit = 0.1 + 0.2 * smooth(0.06, 0.4, sLen[s]);
    let dx = fx + cx * top * 0.9 + nx * lift + (rng() - 0.5) * jit;
    let dy = fy + cy * top * 0.9 + ny * lift + (rng() - 0.5) * jit;
    let dz = fz + cz * top * 0.9 + nz * lift + (rng() - 0.5) * jit;
    // never point into the skin
    const dn = dx * nx + dy * ny + dz * nz;
    if (dn < 0.08) { const add = 0.08 - dn; dx += nx * add; dy += ny * add; dz += nz * add; }
    const l = Math.hypot(dx, dy, dz) || 1;
    out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
  };
  const tmp = [0, 0, 0];
  for (const s of centres) {
    isCentre[s] = 1;
    computeDir(s, tmp);
    dirOf[s * 3] = tmp[0]; dirOf[s * 3 + 1] = tmp[1]; dirOf[s * 3 + 2] = tmp[2];
    lockRand[s * 4] = rng(); lockRand[s * 4 + 1] = rng(); lockRand[s * 4 + 2] = rng(); lockRand[s * 4 + 3] = rng();
  }

  // ---- assemble strands ---------------------------------------------------
  const groups = { long: [], short: [] };
  const order = [];
  for (let s = 0; s < S; s++) order.push(s);

  const make = (n) => ({
    count: n,
    iRoot: new Float32Array(n * 3), iOff: new Float32Array(n * 3), iDir: new Float32Array(n * 3), iNormal: new Float32Array(n * 3),
    iA: new Float32Array(n * 4), iB: new Float32Array(n * 4), iCol: new Uint8Array(n * 4),
    iSkinIdx: new Uint8Array(n * 4), iSkinWgt: new Uint8Array(n * 4),
    // shaving state: how many metres of each lock are left, and where it grows
    iCut: new Float32Array(n).fill(UNCUT), tri: new Uint32Array(n),
  });

  const strandClump = new Int32Array(S).fill(-1);
  for (let s = 0; s < S; s++) {
    if (isCentre[s]) { strandClump[s] = s; continue; }
    const x = root[s * 3], y = root[s * 3 + 1], z = root[s * 3 + 2];
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL), gz = Math.floor(z / CELL);
    let best = -1, bd = 1e9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const list = grid.get(key(gx + dx, gy + dy, gz + dz));
      if (!list) continue;
      for (const c of list) {
        const ddx = root[c * 3] - x, ddy = root[c * 3 + 1] - y, ddz = root[c * 3 + 2] - z;
        const d = ddx * ddx + ddy * ddy + ddz * ddz;
        if (d < bd && nrm[c * 3] * nrm[s * 3] + nrm[c * 3 + 1] * nrm[s * 3 + 1] + nrm[c * 3 + 2] * nrm[s * 3 + 2] > 0.35) { bd = d; best = c; }
      }
    }
    // a lock can only gather hair from within reach
    // (short hair only forms small tufts; otherwise its tips knit into a net)
    const reach = 0.005 + 0.26 * sLen[s];
    if (best >= 0 && bd < reach * reach) strandClump[s] = best;
  }

  for (let s = 0; s < S; s++) (sLen[s] >= LONG_HAIR ? groups.long : groups.short).push(s);

  const out = {};
  for (const name of ['long', 'short']) {
    const list = groups[name];
    const g = make(list.length);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const c = strandClump[s];
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
      let lr0, lr1, lr2, lr3;
      if (c >= 0) {
        g.iDir[i * 3] = dirOf[c * 3]; g.iDir[i * 3 + 1] = dirOf[c * 3 + 1]; g.iDir[i * 3 + 2] = dirOf[c * 3 + 2];
        g.iOff[i * 3] = root[s * 3] - root[c * 3]; g.iOff[i * 3 + 1] = root[s * 3 + 1] - root[c * 3 + 1]; g.iOff[i * 3 + 2] = root[s * 3 + 2] - root[c * 3 + 2];
        lr0 = lockRand[c * 4]; lr1 = lockRand[c * 4 + 1]; lr2 = lockRand[c * 4 + 2]; lr3 = lockRand[c * 4 + 3];
      } else {
        computeDir(s, tmp);
        g.iDir[i * 3] = tmp[0]; g.iDir[i * 3 + 1] = tmp[1]; g.iDir[i * 3 + 2] = tmp[2];
        lr0 = rng(); lr1 = rng(); lr2 = rng(); lr3 = rng();
      }
      g.tri[i] = sTri[s];
      g.iRoot[i * 3] = root[s * 3]; g.iRoot[i * 3 + 1] = root[s * 3 + 1]; g.iRoot[i * 3 + 2] = root[s * 3 + 2];
      g.iNormal[i * 3] = nrm[s * 3]; g.iNormal[i * 3 + 1] = nrm[s * 3 + 1]; g.iNormal[i * 3 + 2] = nrm[s * 3 + 2];

      const flyaway = r4 < 0.035;
      const len = sLen[s] * (0.72 + 0.42 * lr0 + 0.22 * (r1 - 0.5)) * (flyaway ? 0.8 : 1);
      const width = clamp(0.0055 + 0.024 * len, 0.0055, 0.019) * (0.8 + 0.4 * r2);
      const droop = clamp((0.22 + 0.78 * smooth(0.04, 0.55, len)) * (0.85 + 0.3 * lr1), 0, 0.97);
      const tight = (flyaway ? 0.1 + 0.3 * r3 : 0.42 + 0.38 * r3) * (0.45 + 0.55 * smooth(0.04, 0.22, len));
      // layer height: how far above the skin this strand rides
      const fluff = sLift[s] * (0.012 + 0.17 * len) * (0.2 + 1.0 * lr2 + 0.45 * r3) * (flyaway ? 1.5 : 1);
      g.iA[i * 4] = len; g.iA[i * 4 + 1] = width; g.iA[i * 4 + 2] = r1; g.iA[i * 4 + 3] = lr3;
      g.iB[i * 4] = droop; g.iB[i * 4 + 1] = tight; g.iB[i * 4 + 2] = fluff; g.iB[i * 4 + 3] = sBreath[s];
      g.iCol[i * 4] = Math.round(clamp(0.5 + 0.5 * sTone[s], 0, 1) * 255);
      g.iCol[i * 4 + 1] = Math.round(clamp(sRed[s], 0, 1) * 255);
      g.iCol[i * 4 + 2] = Math.round(lr1 * 255);
      g.iCol[i * 4 + 3] = Math.round(r2 * 255);
      g.iSkinIdx[i * 4] = skinI[s * 4]; g.iSkinIdx[i * 4 + 1] = skinI[s * 4 + 1];
      g.iSkinWgt[i * 4] = skinW[s * 4]; g.iSkinWgt[i * 4 + 1] = skinW[s * 4 + 1];
    }
    g.chunks = chunkStrands(g, make);
    out[name] = g;
  }
  out.lockCount = centres.length;
  return out;
}

const ATTRS = [['iRoot', 3], ['iOff', 3], ['iDir', 3], ['iNormal', 3], ['iA', 4], ['iB', 4], ['iCol', 4], ['iSkinIdx', 4], ['iSkinWgt', 4], ['iCut', 1], ['tri', 1]];

/**
 * A second copy of the strands, sorted into patches of hide about 40 cm
 * across. Each patch can then be drawn on its own: skipped when off screen,
 * and given many more hairs when the camera is close to it. Inside a patch
 * the strands keep their random order, so drawing only the first part of a
 * patch thins it evenly.
 */
function chunkStrands(g, make, cell = 0.4) {
  const n = g.count;
  const buckets = new Map();
  for (let i = 0; i < n; i++) {
    const kx = Math.floor(g.iRoot[i * 3] / cell) + 64, ky = Math.floor(g.iRoot[i * 3 + 1] / cell) + 64, kz = Math.floor(g.iRoot[i * 3 + 2] / cell) + 64;
    const key = kx | (ky << 8) | (kz << 16);
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(i);
  }
  // fold tiny patches into a neighbour so there are not hundreds of near-empty draws
  const lists = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  const merged = [];
  for (const list of lists) {
    const last = merged[merged.length - 1];
    if (last && (list.length < 220 || last.length < 220) && last.length + list.length < 2600) last.push(...list);
    else merged.push(list.slice());
  }
  const sorted = make(n);
  const orig = new Uint32Array(n);   // where each sorted strand sits in the unsorted arrays
  const chunks = [];
  let at = 0;
  for (const list of merged) {
    const start = at;
    let cx = 0, cy = 0, cz = 0, maxW = 0, maxL = 0;
    for (const i of list) {
      for (const [name, size] of ATTRS) {
        const src = g[name], dst = sorted[name];
        for (let k = 0; k < size; k++) dst[at * size + k] = src[i * size + k];
      }
      orig[at] = i;
      cx += g.iRoot[i * 3]; cy += g.iRoot[i * 3 + 1]; cz += g.iRoot[i * 3 + 2];
      maxW = Math.max(maxW, g.iA[i * 4 + 1]); maxL = Math.max(maxL, g.iA[i * 4]);
      at++;
    }
    const count = list.length;
    cx /= count; cy /= count; cz /= count;
    let r = 0;
    for (const i of list) r = Math.max(r, Math.hypot(g.iRoot[i * 3] - cx, g.iRoot[i * 3 + 1] - cy, g.iRoot[i * 3 + 2] - cz));
    const arrays = {};
    for (const [name, size] of ATTRS) arrays[name] = sorted[name].subarray(start * size, (start + count) * size);
    arrays.orig = orig.subarray(start, start + count);
    chunks.push({ count, arrays, center: [cx, cy, cz], rootRadius: r, maxLength: maxL, radius: r + maxL + 0.3, maxWidth: maxW });
  }
  return chunks;
}
