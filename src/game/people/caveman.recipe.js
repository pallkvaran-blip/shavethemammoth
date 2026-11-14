// A cave man, as designed: his bones, the two layers he is sculpted in (his
// own hide, and somebody else's), what is painted on his skin, and where his
// hair grows. Baking turns this into meshes and strands (bake.js); caveman.js
// dresses the result, hands him a spear and sets him running.
//
// He is sculpted the size the elf is, a little over twenty centimetres to the
// top of his head, because that is the size everything about the sculpting was
// worked out for; and he is stood in the world eight times that size (see
// caveman.js), which makes him one metre seventy and a good deal wider than he
// ought to be. Short in the leg, long in the arm, no neck to speak of, a brow
// like a shelf and a jaw like a drawer.
//
// (Arithmetic only: nothing here needs the page, so it can be baked on another
// thread.)
import { Sculpt, scatter } from './sculpt.js';
import { growStrands } from './strands.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const near = (x, y, z, c, r) => { const d = Math.hypot(x - c[0], y - c[1], z - c[2]) / r; return d >= 1 ? 0 : (1 - d * d) * (1 - d * d); };

// how far out from straight down his arms hang when he is sculpted
export const ARM = (26 * Math.PI) / 180;
export const SHOULDER = [0.0385, 0.158, 0], UPPER = 0.045, FORE = 0.041, HAND = 0.013;
const armPoint = (s, d) => [s * (SHOULDER[0] + Math.sin(ARM) * d), SHOULDER[1] - Math.cos(ARM) * d, 0];
export const HIP = [0.0175, 0.094, 0], KNEE = [0.0195, 0.0505, 0.002], ANKLE = [0.0195, 0.0125, 0];
export const EYE = [0.0086, 0.1888, 0.0182], EYE_R = 0.0037;
export const HEIGHT = 0.2075;

const BONES = (() => {
  const b = [
    { name: 'hips', at: [0, 0.097, 0] },
    { name: 'spine', parent: 'hips', at: [0, 0.111, 0] },
    { name: 'chest', parent: 'spine', at: [0, 0.134, 0] },
    { name: 'neck', parent: 'chest', at: [0, 0.165, 0.002] },
    { name: 'head', parent: 'neck', at: [0, 0.1745, 0.004] },
    { name: 'jaw', parent: 'head', at: [0, 0.1795, 0.008] },
  ];
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    b.push({ name: 'arm' + side, parent: 'chest', at: [s * SHOULDER[0], SHOULDER[1], 0] });
    b.push({ name: 'fore' + side, parent: 'arm' + side, at: armPoint(s, UPPER) });
    b.push({ name: 'hand' + side, parent: 'fore' + side, at: armPoint(s, UPPER + FORE) });
    b.push({ name: 'thigh' + side, parent: 'hips', at: [s * HIP[0], HIP[1], HIP[2]] });
    b.push({ name: 'shin' + side, parent: 'thigh' + side, at: [s * KNEE[0], KNEE[1], KNEE[2]] });
    b.push({ name: 'foot' + side, parent: 'shin' + side, at: [s * ANKLE[0], ANKLE[1], ANKLE[2]] });
  }
  return b;
})();

function sculptCaveman() {
  const L = {};
  const skin = [
    // ---- the head: a low skull, a shelf of brow, a muzzle, and a great deal of jaw ----
    { type: 'ell', c: [0, 0.1905, 0.001], r: [0.0205, 0.0185, 0.0222], bone: 'head', k: 0 },
    { type: 'ell', c: [0, 0.1825, 0.011], r: [0.0178, 0.0125, 0.0158], bone: 'head', k: 0.008 },
    { type: 'ell', c: [0, 0.1935, 0.0192], r: [0.0178, 0.0042, 0.0062], bone: 'head', k: 0.005 },
    { type: 'sph', c: [0.0128, 0.1832, 0.0162], r: 0.0072, bone: 'head', k: 0.006 },
    { type: 'sph', c: [-0.0128, 0.1832, 0.0162], r: 0.0072, bone: 'head', k: 0.006 },
    { type: 'ell', c: [0, 0.1722, 0.0105], r: [0.0172, 0.0098, 0.0162], bone: 'jaw', k: 0.006 },
    { type: 'sph', c: [0, 0.1672, 0.0212], r: 0.0064, bone: 'jaw', k: 0.006 },
    // the nose: broad, and broken at least once
    { type: 'rc', a: [0.0004, 0.1905, 0.0225], b: [-0.0004, 0.1822, 0.0312], r1: 0.0042, r2: 0.0061, bone: 'head', k: 0.005 },
    { type: 'sph', c: [0.0052, 0.1808, 0.0276], r: 0.0036, bone: 'head', k: 0.003 },
    { type: 'sph', c: [-0.0052, 0.1808, 0.0276], r: 0.0036, bone: 'head', k: 0.003 },
    { type: 'sph', c: [0.0031, 0.1789, 0.0312], r: 0.0015, bone: 'head', k: 0.001, cut: true },
    { type: 'sph', c: [-0.0031, 0.1789, 0.0312], r: 0.0015, bone: 'head', k: 0.001, cut: true },
    // lips, and the slit between them
    { type: 'ell', c: [0, 0.1764, 0.0262], r: [0.0102, 0.0025, 0.0042], bone: 'head', k: 0.003 },
    { type: 'ell', c: [0, 0.1722, 0.0258], r: [0.0092, 0.0028, 0.0044], bone: 'jaw', k: 0.003 },
    { type: 'ell', c: [0, 0.1743, 0.0282], r: [0.0088, 0.0011, 0.0052], bone: 'head', k: 0.0012, cut: true },
    // sockets for the eyes, well back under the brow
    { type: 'sph', c: [EYE[0], EYE[1], EYE[2] + 0.0028], r: EYE_R + 0.0004, bone: 'head', k: 0.003, cut: true },
    { type: 'sph', c: [-EYE[0], EYE[1], EYE[2] + 0.0028], r: EYE_R + 0.0004, bone: 'head', k: 0.003, cut: true },
    // ears
    { type: 'ell', c: [0.0212, 0.1868, 0.0015], r: [0.003, 0.0064, 0.0048], rot: [0, -18, 6], bone: 'head', k: 0.003 },
    { type: 'ell', c: [-0.0212, 0.1868, 0.0015], r: [0.003, 0.0064, 0.0048], rot: [0, 18, -6], bone: 'head', k: 0.003 },
    // what neck there is
    { type: 'rc', a: [0, 0.159, 0.0005], b: [0, 0.1765, 0.003], r1: 0.0135, r2: 0.0118, bone: 'neck', k: 0.008 },
    // ---- the trunk: a barrel, with a belly hung on the front of it ----
    { type: 'ell', c: [0, 0.1462, 0.0008], r: [0.0348, 0.0232, 0.0258], bone: 'chest', k: 0.01 },
    { type: 'ell', c: [0.0165, 0.1492, 0.0162], r: [0.0158, 0.0118, 0.0095], bone: 'chest', k: 0.008 },
    { type: 'ell', c: [-0.0165, 0.1492, 0.0162], r: [0.0158, 0.0118, 0.0095], bone: 'chest', k: 0.008 },
    { type: 'ell', c: [0, 0.1195, 0.0062], r: [0.0302, 0.0262, 0.0268], bone: 'spine', k: 0.012 },
    { type: 'ell', c: [0, 0.0995, 0.0005], r: [0.0282, 0.0172, 0.0235], bone: 'hips', k: 0.01 },
    { type: 'sph', c: [0, 0.1085, 0.0318], r: 0.0016, bone: 'spine', k: 0.002, cut: true },
  ];
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const sh = armPoint(s, 0), el = armPoint(s, UPPER), wr = armPoint(s, UPPER + FORE), hd = armPoint(s, UPPER + FORE + HAND);
    skin.push(
      // arms: a shoulder like a boulder, and a forearm thicker than is decent
      { type: 'sph', c: [s * 0.0372, 0.1585, 0], r: 0.0128, bone: 'arm' + side, k: 0.008 },
      { type: 'rc', a: sh, b: el, r1: 0.0112, r2: 0.0092, bone: 'arm' + side, k: 0.008 },
      { type: 'ell', c: [(sh[0] + el[0]) / 2 + s * 0.001, (sh[1] + el[1]) / 2, 0.003], r: [0.0098, 0.0165, 0.0102], rot: [0, 0, s * 26], bone: 'arm' + side, k: 0.006 },
      { type: 'rc', a: el, b: wr, r1: 0.0094, r2: 0.0068, bone: 'fore' + side, k: 0.006 },
      { type: 'ell', c: [el[0] + (wr[0] - el[0]) * 0.3, el[1] + (wr[1] - el[1]) * 0.3, 0.0005], r: [0.0092, 0.0142, 0.0094], rot: [0, 0, s * 26], bone: 'fore' + side, k: 0.005 },
      // a fist
      { type: 'ell', c: hd, r: [0.0074, 0.0098, 0.0068], rot: [0, 0, s * 26], bone: 'hand' + side, k: 0.005 },
      { type: 'sph', c: [hd[0] - s * 0.002, hd[1] + 0.003, 0.0068], r: 0.0036, bone: 'hand' + side, k: 0.003 },
      // legs: short, bowed, and under all of that
      { type: 'rc', a: [s * HIP[0], HIP[1], HIP[2]], b: [s * KNEE[0], KNEE[1], KNEE[2]], r1: 0.0152, r2: 0.0112, bone: 'thigh' + side, k: 0.009 },
      { type: 'sph', c: [s * KNEE[0], KNEE[1], KNEE[2] + 0.0025], r: 0.0108, bone: 'shin' + side, k: 0.006, hold: 0.6 },
      { type: 'rc', a: [s * KNEE[0], KNEE[1], KNEE[2]], b: [s * ANKLE[0], ANKLE[1] + 0.003, ANKLE[2]], r1: 0.0102, r2: 0.0068, bone: 'shin' + side, k: 0.006 },
      { type: 'ell', c: [s * KNEE[0], 0.0365, -0.0042], r: [0.0086, 0.0135, 0.0092], bone: 'shin' + side, k: 0.005 },
      // feet: bare, flat and wide, with toes that have been stood on by things
      { type: 'ell', c: [s * 0.0202, 0.0062, 0.0105], r: [0.0098, 0.0066, 0.0205], bone: 'foot' + side, k: 0.005 },
      { type: 'sph', c: [s * 0.0195, 0.0072, -0.0045], r: 0.0078, bone: 'foot' + side, k: 0.005 },
      // (the great toe is the inside one)
      ...[-0.0068, -0.0018, 0.0032, 0.0078].map((dx, i) => ({ type: 'sph', c: [s * (0.0202 + dx), 0.0042, 0.0298 - Math.abs(i - 1) * 0.0018], r: i === 0 ? 0.0041 : 0.0032, bone: 'foot' + side, k: 0.0022 })),
    );
  }
  // (he stands on the snow, not in it)
  skin.push({ type: 'box', c: [0, -0.02, 0.008], h: [0.08, 0.02, 0.08], bone: 'hips', k: 0.0006, cut: true });
  L.skin = new Sculpt(skin, { k: 0.006, eps: 0.0005 });

  // ---- the pelt: over one shoulder, round the middle, and down to the knee where it has not been torn off ----
  const strap = [1, -1].map((s) => armPoint(s, 0));
  L.pelt = new Sculpt([
    { type: 'ell', c: [0, 0.1215, 0.0052], r: [0.0338, 0.0298, 0.0305], bone: 'spine', k: 0, uv: { r: 0.033 } },
    { type: 'ell', c: [0, 0.1448, 0.0012], r: [0.0378, 0.0222, 0.0292], bone: 'chest', k: 0.008, uv: { r: 0.036 } },
    { type: 'rc', a: [0, 0.106, 0.001], b: [0, 0.079, 0.001], r1: 0.031, r2: 0.0338, bone: 'hips', k: 0.008, uv: { ref: [0, 0, 1] } },
    // the strap of it, over his left shoulder
    { type: 'ell', c: [strap[0][0] - 0.011, 0.1612, -0.001], r: [0.0122, 0.0098, 0.0225], rot: [0, 0, -24], bone: 'chest', k: 0.008, uv: false },
    // cut away: his right shoulder and that side of his chest, his neck, the holes his arms come through, and everything below the hem
    { type: 'box', c: [-0.036, 0.1665, 0], h: [0.034, 0.0225, 0.06], rot: [0, 0, -38], bone: 'chest', k: 0.004, cut: true },
    { type: 'sph', c: [0, 0.1695, 0.003], r: 0.0162, bone: 'chest', k: 0.004, cut: true },
    { type: 'sph', c: [strap[0][0] + 0.006, 0.1525, 0], r: 0.0142, bone: 'chest', k: 0.004, cut: true },
    { type: 'sph', c: [strap[1][0] - 0.004, 0.1525, 0], r: 0.0158, bone: 'chest', k: 0.004, cut: true },
    { type: 'box', c: [0, 0.056, 0], h: [0.07, 0.0215, 0.07], rot: [4, 0, 7], bone: 'hips', k: 0.003, cut: true },
    // (and it is hollow at the hem: there is a cave man in it)
    { type: 'rc', a: [0, 0.07, 0.001], b: [0, 0.094, 0.001], r1: 0.0315, r2: 0.027, bone: 'hips', k: 0.003, cut: true },
  ], { k: 0.006, bump: (x, y, z) => 0.0009 * Math.sin(x * 420 + Math.sin(y * 310) * 2) * Math.sin(z * 380 + y * 260) });
  return L;
}

// What is painted on his skin: weather, mostly. Red where the blood is near, dirt where it has not been washed, which is everywhere.
function paintSkin(x, y, z, nx, ny, nz, out) {
  const ax = Math.abs(x);
  const nose = near(x, y, z, [0, 0.1822, 0.031], 0.011), cheek = near(ax, y, z, [0.0135, 0.1822, 0.019], 0.011);
  const ear = near(ax, y, z, [0.0225, 0.187, 0.002], 0.008), knee = near(ax, y, z, [KNEE[0], KNEE[1], 0.01], 0.014), knuckle = clamp01((0.062 - y) / 0.01) * clamp01((ax - 0.05) / 0.01);
  const lips = near(x, y, z, [0, 0.1743, 0.027], 0.01) * clamp01((z - 0.0225) / 0.003);
  const mouth = near(x, y, z, [0, 0.1743, 0.0275], 0.0105) * clamp01(1 - Math.abs(y - 0.1743) / 0.0011) * clamp01((0.0312 - z) / 0.0012);
  const socket = near(ax, y, z, [EYE[0], EYE[1], EYE[2] + 0.004], 0.0085);
  let r = 1, g = 1, b = 1;
  const red = Math.min(1, nose * 0.9 + cheek * 0.5 + ear * 0.6 + knee * 0.35 + knuckle * 0.3 + lips * 0.4);
  r *= 1 + 0.1 * red; g *= 1 - 0.3 * red; b *= 1 - 0.34 * red;
  // grime: on whatever faces down or lies in a fold, and up his shins from the ground
  const low = clamp01((0.05 - y) / 0.05), grime = Math.min(1, 0.55 * low + 0.25 * clamp01(-ny) + 0.5 * socket);
  r *= 1 - 0.3 * grime; g *= 1 - 0.36 * grime; b *= 1 - 0.42 * grime;
  r = r * (1 - mouth) + 0.16 * mouth; g = g * (1 - mouth) + 0.04 * mouth; b = b * (1 - mouth) + 0.04 * mouth;
  // under his hair and his beard the skin is the colour of them
  const scalp = clamp01((y - 0.193) / 0.006) * clamp01((0.019 - z) / 0.006);
  const chin = clamp01((0.1795 - y) / 0.004) * clamp01((y - 0.159) / 0.005) * clamp01((z + 0.004) / 0.008) * (1 - lips);
  const dark = Math.min(1, scalp + chin * 0.85);
  r *= 1 - 0.62 * dark; g *= 1 - 0.74 * dark; b *= 1 - 0.82 * dark;
  out[0] = r; out[1] = g; out[2] = b; out[3] = 0;
}

// The pelt: darker along what was the animal's back, and scuffed pale where it rubs.
function paintPelt(x, y, z, nx, ny, nz, out) {
  const back = clamp01(-z / 0.02) * 0.3, worn = 0.25 * clamp01((Math.sin(x * 260 + z * 190) + Math.sin(y * 330 - x * 140)) * 0.5);
  const k = 1 - back + worn * 0.4;
  out[0] = k; out[1] = k * (1 - 0.05 * worn); out[2] = k * (1 - 0.1 * worn); out[3] = 1;
}

const CELL = { skin: 0.0015, pelt: 0.002 };

/** Everything needed to bake him (see bake.js). */
export function cavemanRecipe() {
  const L = sculptCaveman();
  const body = (x, y, z) => Math.min(L.skin.dist(x, y, z), L.pelt.dist(x, y, z));
  return {
    bones: BONES, layers: L, cells: CELL, skin: ['skin'], paint: { skin: paintSkin, pelt: paintPelt },
    hair: {
      // the hair of his head: all of it, as it grew, to the shoulders and in his eyes
      mane: (data) => growStrands(scatter(data.skin, 3000, (x, y, z, nx, ny) => {
        if (y < 0.186 || ny < -0.55) return 0;
        const ax = Math.abs(x);
        if (z > 0.0165 && y < 0.2005) return 0;                       // (his face)
        if (ax > 0.0195 && y < 0.1915 && z > -0.004) return 0;        // (his ears stick out of it)
        return clamp01((y - 0.186) / 0.006);
      }, 17), {
        seed: 23, segments: 6, width: 0.00062, clump: 0.6, clumps: 130, frizz: 0.0022, curl: [0.0011, 190], loft: 0.0035,
        body,
        shape: (p, n, rnd) => {
          const front = p[2] > 0.008, long = 0.02 + rnd() * 0.02;
          // out from the scalp, and then down: over the brow at the front, to the shoulders behind
          return front
            ? { length: 0.01 + rnd() * 0.012, dir: [n[0] * 1.2 + (rnd() - 0.5) * 0.5, 0.25, 1], droop: 1.5, stiff: 0.35 }
            : { length: long, dir: [n[0] * 1.3, 0.2 + n[1] * 0.5, n[2] * 1.2 - 0.2], droop: 1.6, stiff: 0.25 };
        },
      }),
      // his beard: from the cheekbones down, and as long as it has had time to get
      beard: (data) => growStrands(scatter(data.skin, 2300, (x, y, z, nx, ny, nz) => {
        if (y > 0.1832 || y < 0.1608 || z < -0.003) return 0;
        const ax = Math.abs(x);
        if (y > 0.1705 && y < 0.1785 && ax < 0.0088 && z > 0.0235) return 0;      // (not on his lips)
        if (y > 0.1785 && ax < 0.0105 && z > 0.02) return y < 0.1802 && ax > 0.002 ? 1 : 0;   // a moustache, under his nose
        if (y > 0.179) return ax > 0.0125 ? 0.8 : 0;                             // (up his cheeks, in front of his ears)
        return nz > -0.5 ? 1 : 0.3;
      }, 29), {
        seed: 31, segments: 5, width: 0.00062, clump: 0.55, clumps: 80, frizz: 0.002, curl: [0.0009, 240], loft: 0.004,
        body,
        shape: (p, n, rnd) => ({ length: (p[1] > 0.1785 ? 0.006 : 0.012 + rnd() * 0.016), dir: [n[0] * 0.8 + (rnd() - 0.5) * 0.3, -0.75, 0.55 + n[2] * 0.4], droop: 0.9, stiff: 0.5 }),
      }),
      // one eyebrow, the whole width of him
      brow: (data) => growStrands(scatter(data.skin, 420, (x, y, z) => (Math.abs(y - 0.1948) < 0.0026 && z > 0.02 && Math.abs(x) < 0.0165 ? 1 : 0), 37), {
        seed: 41, segments: 3, width: 0.00045, clump: 0.2, clumps: 30, frizz: 0.0005,
        body: (x, y, z) => L.skin.dist(x, y, z),
        shape: (p, n, rnd) => ({ length: 0.003 + rnd() * 0.0028, dir: [Math.sign(p[0]) * 0.8 + (rnd() - 0.5) * 0.4, 0.3 + rnd() * 0.4, 0.8], droop: 0.2, stiff: 0.9 }),
      }),
      // the fur of the pelt: in three lots, so that each can go with the part of him it lies on when he bends
      ...Object.fromEntries([['furChest', 0.1335, 1, 2000, 43], ['furSpine', 0.1045, 0.1335, 2400, 44], ['furHips', -1, 0.1045, 1800, 45]].map(([name, lo, hi, count, seed]) => [name, (data) => growStrands(scatter(data.pelt, count, (x, y) => (y >= lo && y < hi ? 1 : 0), seed), {
        seed: seed + 4, segments: 3, width: 0.0007, clump: 0.5, clumps: Math.round(count / 18), frizz: 0.0012,
        body,
        shape: (p, n, rnd) => ({ length: 0.0055 + rnd() * 0.0048, dir: [n[0] + (rnd() - 0.5) * 0.4, n[1] - 0.75, n[2] + (rnd() - 0.5) * 0.4], droop: 0.7, stiff: 0.55 }),
      })])),
      // and what grows on the rest of him: his chest, his forearms, his shins (each lot goes with its own bone)
      ...Object.fromEntries([
        ['fuzzChest', 700, (x, y, z, nx, ny, nz) => (y > 0.132 && y < 0.158 && nz > 0.15 && Math.abs(x) < 0.031 ? 1 : 0)],
        ['fuzzForeL', 300, (x, y) => (x > 0.047 && y < 0.118 && y > 0.078 ? 1 : 0)],
        ['fuzzForeR', 300, (x, y) => (x < -0.047 && y < 0.118 && y > 0.078 ? 1 : 0)],
        ['fuzzShinL', 320, (x, y) => (x > 0 && y < 0.048 && y > 0.016 ? 1 : 0)],
        ['fuzzShinR', 320, (x, y) => (x < 0 && y < 0.048 && y > 0.016 ? 1 : 0)],
      ].map(([name, count, where], i) => [name, (data) => growStrands(scatter(data.skin, count, where, 53 + i), {
        seed: 59 + i, segments: 3, width: 0.00032, clump: 0.2, clumps: Math.round(count / 12), frizz: 0.0006, curl: [0.0005, 300],
        body,
        shape: (p, n, rnd) => ({ length: 0.0016 + rnd() * 0.002, dir: [n[0] + (rnd() - 0.5) * 0.6, n[1] - 0.5, n[2] + (rnd() - 0.5) * 0.6], droop: 0.3, stiff: 0.8 }),
      })])),
    },
  };
}
