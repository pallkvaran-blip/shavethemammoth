// The elf, as designed: his bones, the layers he is sculpted in (skin, and
// each thing he has on), what is painted on his skin, and where his hair
// grows and how. Baking turns this into meshes and strands (bake.js); elf.js
// dresses the result and brings it to life.
//
// (Arithmetic only: nothing here needs the page, so it can be baked on another
// thread.)
import { Sculpt, scatter } from './sculpt.js';
import { growStrands } from './strands.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const near = (x, y, z, c, r) => { const d = Math.hypot(x - c[0], y - c[1], z - c[2]) / r; return d >= 1 ? 0 : (1 - d * d) * (1 - d * d); };

// how far out from straight down his arms hang when he is sculpted (so that sleeves are not stuck to his sides)
export const ARM = (48 * Math.PI) / 180;
const SH = [0.04, 0.119, 0], UPPER = 0.043, FORE = 0.04, HAND = 0.011;
const armPoint = (s, d) => [s * (SH[0] + Math.sin(ARM) * d), SH[1] - Math.cos(ARM) * d, 0];
export const EYE = [0.0172, 0.1845, 0.0302], EYE_R = [0.012, 0.0106];       // (his left eye is the bigger)
// (the hat flops over to his right: his left hand is the one that holds things up, and they are not to be hidden by it)
const HAT = [[0, 0.197, -0.007], [-0.005, 0.245, -0.017], [-0.028, 0.281, -0.023], [-0.062, 0.297, -0.027]];
export const CURL = (() => {
  // the toe of a boot: up, over and back on itself
  const pts = [];
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * Math.PI * 1.55, r = 0.0088 * (1 - 0.42 * (i / 6)); pts.push([0, 0.0135 + r * Math.sin(a) + 0.0088, 0.034 + r * Math.cos(a)]); }
  return pts;
})();

const BONES = (() => {
  const b = [
    { name: 'hips', at: [0, 0.066, 0] },
    { name: 'legL', parent: 'hips', at: [0.019, 0.064, 0] }, { name: 'legR', parent: 'hips', at: [-0.019, 0.064, 0] },
    { name: 'torso', parent: 'hips', at: [0, 0.07, 0] },
    { name: 'tail', parent: 'torso', at: [-0.02, 0.131, 0.02] },
    { name: 'head', parent: 'torso', at: [0, 0.136, 0] },
    { name: 'jaw', parent: 'head', at: [0, 0.158, 0.0] },
    { name: 'cornerL', parent: 'head', at: [0.0165, 0.1475, 0.036] }, { name: 'cornerR', parent: 'head', at: [-0.0165, 0.1475, 0.036] },
    { name: 'earL', parent: 'head', at: [0.043, 0.176, -0.002] }, { name: 'earR', parent: 'head', at: [-0.043, 0.176, -0.002] },
    { name: 'hat1', parent: 'head', at: HAT[0] }, { name: 'hat2', parent: 'hat1', at: HAT[1] }, { name: 'hat3', parent: 'hat2', at: HAT[2] },
  ];
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    b.push({ name: 'arm' + side, parent: 'torso', at: [s * SH[0], SH[1], 0] });
    b.push({ name: 'fore' + side, parent: 'arm' + side, at: armPoint(s, UPPER) });
    b.push({ name: 'hand' + side, parent: 'fore' + side, at: armPoint(s, UPPER + FORE + HAND) });
  }
  return b;
})();

function sculptElf() {
  const L = {};
  // ---- skin: the head, what shows of the neck, and the belly ----
  const head = [
    { type: 'ell', c: [0, 0.172, -0.002], r: [0.047, 0.043, 0.045], bone: 'head', k: 0 },
    { type: 'ell', c: [0, 0.153, 0.007], r: [0.037, 0.027, 0.034], bone: 'head', k: 0.014 },
    { type: 'rc', a: [0, 0.126, 0], b: [0, 0.146, 0.002], r1: 0.015, r2: 0.014, bone: 'head', k: 0.008 },
    // brow, cheeks, chin
    { type: 'ell', c: [0.0172, 0.1975, 0.036], r: [0.0125, 0.0042, 0.0065], rot: [0, 0, -8], bone: 'head', k: 0.011 },
    { type: 'ell', c: [-0.0172, 0.1975, 0.036], r: [0.0125, 0.0042, 0.0065], rot: [0, 0, 8], bone: 'head', k: 0.011 },
    { type: 'ell', c: [0.0245, 0.156, 0.024], r: [0.017, 0.0155, 0.015], bone: 'head', k: 0.009 },
    { type: 'ell', c: [-0.0245, 0.156, 0.024], r: [0.017, 0.0155, 0.015], bone: 'head', k: 0.009 },
    { type: 'sph', c: [0, 0.137, 0.025], r: 0.0105, bone: 'jaw', k: 0.009 },
    // the nose: long, with a knob on the end and a wing either side of it
    { type: 'rc', a: [0, 0.176, 0.038], b: [0, 0.1625, 0.084], r1: 0.0088, r2: 0.0062, bone: 'head', k: 0.007 },
    { type: 'sph', c: [0, 0.1605, 0.0885], r: 0.0094, bone: 'head', k: 0.004 },
    { type: 'sph', c: [0.0066, 0.158, 0.081], r: 0.0048, bone: 'head', k: 0.003 },
    { type: 'sph', c: [-0.0066, 0.158, 0.081], r: 0.0048, bone: 'head', k: 0.003 },
    { type: 'sph', c: [0.0046, 0.1546, 0.0845], r: 0.0021, bone: 'head', k: 0.0012, cut: true },
    { type: 'sph', c: [-0.0046, 0.1546, 0.0845], r: 0.0021, bone: 'head', k: 0.0012, cut: true },
    // lips, and the pads at the corners of the mouth that a grin is made with
    { type: 'ell', c: [0, 0.1515, 0.0405], r: [0.0135, 0.0032, 0.0045], bone: 'head', k: 0.003 },
    { type: 'ell', c: [0, 0.1432, 0.0395], r: [0.0115, 0.0036, 0.005], bone: 'jaw', k: 0.003 },
    { type: 'sph', c: [0.0178, 0.1482, 0.0335], r: 0.0052, bone: 'cornerL', k: 0.004, hold: 2.5 },
    { type: 'sph', c: [-0.0178, 0.1482, 0.0335], r: 0.0052, bone: 'cornerR', k: 0.004, hold: 2.5 },
    // sockets for the eyes, with a fold of lid above and below each
    ...[1, -1].map((s, i) => ({ type: 'sph', c: [s * EYE[0], EYE[1], EYE[2] + 0.0035], r: EYE_R[i] + 0.0003, bone: 'head', k: 0.0035, cut: true })),
    // the mouth: a slit that turns up at the ends, and deepens to a dark hollow behind the tooth
    { type: 'ell', c: [0, 0.1466, 0.041], r: [0.0105, 0.0019, 0.0062], bone: 'head', k: 0.0014, cut: true },
    { type: 'ell', c: [0.0125, 0.1486, 0.0372], r: [0.0074, 0.0017, 0.0056], rot: [0, 0, 20], bone: 'head', k: 0.0014, cut: true },
    { type: 'ell', c: [-0.0125, 0.1486, 0.0372], r: [0.0074, 0.0017, 0.0056], rot: [0, 0, -20], bone: 'head', k: 0.0014, cut: true },
    // and a dimple where each end of it runs into the cheek
    { type: 'sph', c: [0.0205, 0.1512, 0.0335], r: 0.0026, bone: 'head', k: 0.003, cut: true },
    { type: 'sph', c: [-0.0205, 0.1512, 0.0335], r: 0.0026, bone: 'head', k: 0.003, cut: true },
  ];
  // ears: one long blade from the side of the head up and back to a point, its top edge bowed, dished on the side that faces forward
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const base = [s * 0.04, 0.1745, -0.002], tip = [s * 0.126, 0.2165, -0.013];
    const at = (t, fwd = 0) => base.map((v, k) => v + (tip[k] - v) * t + (k === 2 ? fwd : 0));
    const bone = 'ear' + side;
    head.push(
      { type: 'leaf', a: at(0.06), b: at(0.975), r1: 0.0176, r2: 0.003, t: 0.0041, t2: 0.0023, n: [0, 0, 1], bend: s * 0.0034, curl: -0.003, bone, k: 0.007, hold: 1.6 },
      { type: 'sph', c: [s * 0.0495, 0.1665, -0.002], r: 0.0066, bone, k: 0.007 },
      { type: 'ell', c: at(0.36, 0.0054), r: [0.03, 0.0082, 0.0036], rot: [0, s * -7, s * 26], bone, k: 0.004, cut: true },
    );
  }
  L.head = new Sculpt(head, { k: 0.006, eps: 0.0005 });
  L.belly = new Sculpt([
    { type: 'ell', c: [0, 0.0815, 0.007], r: [0.0345, 0.03, 0.0345], bone: 'torso', k: 0 },
    { type: 'sph', c: [0, 0.0745, 0.0415], r: 0.003, bone: 'torso', k: 0.0025, cut: true },
  ], { k: 0.004 });

  // ---- the jumper: knitted, too short, with ribbing at the hem, the cuffs and the neck ----
  const arm = (s) => [armPoint(s, 0), armPoint(s, UPPER), armPoint(s, UPPER + FORE - 0.004)];
  L.jumper = new Sculpt([
    { type: 'ell', c: [0, 0.108, 0], r: [0.0415, 0.034, 0.0375], bone: 'torso', k: 0, uv: { r: 0.04 } },
    { type: 'ell', c: [0, 0.1235, 0], r: [0.037, 0.017, 0.031], bone: 'torso', k: 0.01, uv: { r: 0.04 } },
    ...[1, -1].flatMap((s) => {
      const [a, b, c] = arm(s), side = s > 0 ? 'L' : 'R';
      return [
        { type: 'rc', a, b, r1: 0.0125, r2: 0.0112, bone: 'arm' + side, k: 0.009, uv: { ref: [0, 1, 0] } },
        { type: 'rc', a: b, b: c, r1: 0.0112, r2: 0.0102, bone: 'fore' + side, k: 0.006, uv: { ref: [0, 1, 0], v0: UPPER } },
      ];
    }),
    // it stops well short of where a jumper should
    { type: 'box', c: [0, 0.066, 0], h: [0.07, 0.0235, 0.07], bone: 'torso', k: 0.0025, cut: true },
  ], { k: 0.006, bump: (x, y, z) => 0.0006 * Math.sin(y * 420 + Math.sin(x * 190 + z * 130) * 1.6) * Math.sin(Math.atan2(x, z) * 5 + y * 60) });
  L.jumperRib = new Sculpt([
    { type: 'tor', c: [0, 0.0915, 0.0005], R: 0.0352, r: 0.0058, s: [1.1, 1, 1], bone: 'torso', k: 0, uv: { r: 0.04 } },
    ...[1, -1].map((s) => {
      const p = armPoint(s, UPPER + FORE - 0.003);
      return { type: 'tor', c: p, R: 0.0098, r: 0.0036, rot: [0, 0, s * (90 - 48)], bone: 'fore' + (s > 0 ? 'L' : 'R'), k: 0, uv: { axis: [s * Math.sin(ARM), -Math.cos(ARM), 0], r: 0.011 } };
    }),
  ], { k: 0.002 });

  // ---- shorts, stockings, boots ----
  L.shorts = new Sculpt([
    { type: 'ell', c: [0, 0.067, 0], r: [0.037, 0.0205, 0.032], bone: 'hips', k: 0, uv: { r: 0.036 } },
    { type: 'rc', a: [0.019, 0.064, 0], b: [0.0205, 0.05, 0], r1: 0.0135, r2: 0.0128, bone: 'legL', k: 0.006 },
    { type: 'rc', a: [-0.019, 0.064, 0], b: [-0.0205, 0.05, 0], r1: 0.0135, r2: 0.0128, bone: 'legR', k: 0.006 },
    { type: 'box', c: [0.0205, 0.039, 0], h: [0.02, 0.0085, 0.03], bone: 'legL', k: 0.0012, cut: true },
    { type: 'box', c: [-0.0205, 0.039, 0], h: [0.02, 0.0085, 0.03], bone: 'legR', k: 0.0012, cut: true },
  ], { k: 0.005 });
  L.stockings = new Sculpt([1, -1].flatMap((s) => [
    { type: 'rc', a: [s * 0.0195, 0.057, 0], b: [s * 0.021, 0.022, 0], r1: 0.0098, r2: 0.0086, bone: s > 0 ? 'legL' : 'legR', k: 0, uv: { ref: [0, 0, 1], flip: true } },
  ]), { k: 0.002 });
  const boot = (s) => {
    const bone = s > 0 ? 'legL' : 'legR', x = s * 0.021;
    const out = [
      { type: 'ell', c: [x, 0.0098, 0.011], r: [0.0128, 0.0096, 0.0245], bone, k: 0 },
      { type: 'rc', a: [x, 0.027, 0], b: [x, 0.012, 0.001], r1: 0.0108, r2: 0.0118, bone, k: 0.005 },
      { type: 'tor', c: [x, 0.0282, 0], R: 0.0104, r: 0.003, bone, k: 0.0015 },
      { type: 'ell', c: [x, 0.0026, 0.0108], r: [0.0138, 0.0036, 0.0258], bone, k: 0.0012 },
    ];
    for (let i = 0; i < CURL.length - 1; i++) {
      const a = CURL[i], b = CURL[i + 1];
      out.push({ type: 'rc', a: [x, a[1], a[2]], b: [x, b[1], b[2]], r1: 0.0052 - i * 0.00042, r2: 0.0052 - (i + 1) * 0.00042, bone, k: i ? 0.002 : 0.005 });
    }
    return out;
  };
  L.boots = new Sculpt([...boot(1), ...boot(-1), { type: 'box', c: [0, -0.02, 0.01], h: [0.08, 0.02, 0.08], bone: 'hips', k: 0.0006, cut: true }], { k: 0.003 });

  // ---- mittens, scarf, hat ----
  L.mittens = new Sculpt([1, -1].flatMap((s) => {
    const side = s > 0 ? 'L' : 'R', p = armPoint(s, UPPER + FORE + HAND), w = armPoint(s, UPPER + FORE + 0.0015);
    const ax = [s * Math.sin(ARM), -Math.cos(ARM), 0];
    return [
      { type: 'ell', c: p, r: [0.0118, 0.0142, 0.0102], rot: [0, 0, s * 48], bone: 'hand' + side, k: 0, uv: { axis: ax, r: 0.012 } },
      { type: 'rc', a: [p[0] - s * 0.001, p[1] + 0.004, 0.006], b: [p[0] + s * 0.001, p[1] + 0.001, 0.0148], r1: 0.0052, r2: 0.0044, bone: 'hand' + side, k: 0.004, uv: false },
      { type: 'tor', c: w, R: 0.0098, r: 0.0034, rot: [0, 0, s * (90 - 48)], bone: 'hand' + side, k: 0.002, uv: { axis: ax, r: 0.011 } },
    ];
  }), { k: 0.004 });
  L.scarf = new Sculpt([
    { type: 'tor', c: [0, 0.1295, 0.002], R: 0.0228, r: 0.0094, rot: [-8, 0, 4], s: [1.04, 1, 0.98], bone: 'torso', k: 0, uv: { r: 0.03 } },
    { type: 'tor', c: [0.002, 0.1372, 0.0005], R: 0.0196, r: 0.0072, rot: [-4, 0, -9], bone: 'torso', k: 0.004, uv: { r: 0.03 } },
    // the end that hangs down his front
    { type: 'ell', c: [-0.0215, 0.108, 0.034], r: [0.0092, 0.027, 0.0034], rot: [14, 10, 6], bone: 'tail', k: 0.006, uv: { axis: [0, 1, 0], r: 0.03 } },
    { type: 'sph', c: [-0.019, 0.1275, 0.0235], r: 0.0092, bone: 'torso', k: 0.006, uv: false },
  ], { k: 0.004 });
  let run = 0;
  const hat = HAT.slice(0, 3).map((a, i) => {
    const b = HAT[i + 1], v0 = run;
    run += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    return { type: 'rc', a, b, r1: [0.0405, 0.027, 0.0152][i], r2: [0.027, 0.0152, 0.0062][i], bone: 'hat' + (i + 1), k: i ? 0.012 : 0, uv: { ref: [0, 0, 1], v0, r: 0.03 } };
  });
  L.hat = new Sculpt([...hat, { type: 'box', c: [0, 0.158, -0.004], h: [0.07, 0.037, 0.07], rot: [-11, 0, 0], bone: 'hat1', k: 0.002, cut: true }], { k: 0.01 });
  L.hatRib = new Sculpt([{ type: 'tor', c: [0, 0.1975, -0.0075], R: 0.0402, r: 0.0082, rot: [-11, 0, 0], s: [1.03, 1, 1.02], bone: 'hat1', k: 0, uv: { r: 0.045 } }], { k: 0.002 });
  L.bobble = new Sculpt([{ type: 'sph', c: HAT[3], r: 0.0105, bone: 'hat3', k: 0, uv: false }], { k: 0.002 });
  return L;
}

// What is painted on his skin: where the blood shows, and where the freckles are allowed.
function paintSkin(x, y, z, nx, ny, nz, out) {
  const ax = Math.abs(x);
  const nose = near(x, y, z, [0, 0.1605, 0.0885], 0.016), cheek = near(ax, y, z, [0.0255, 0.156, 0.03], 0.02);
  const ear = clamp01((ax - 0.05) / 0.06), lips = near(x, y, z, [0, 0.1475, 0.041], 0.016) * clamp01((z - 0.03) / 0.008);
  const mouth = near(x, y - Math.abs(x) * 0.16, z, [0, 0.1466, 0.04], 0.0185) * clamp01(1 - Math.abs(y - Math.abs(x) * 0.16 - 0.1466) / 0.0016) * clamp01((0.0445 - z) / 0.0015);
  const socket = near(ax, y, z, [EYE[0] + 0.001, EYE[1], EYE[2] + 0.009], 0.0145) * 0.7;
  let r = 1, g = 1, b = 1;
  const red = Math.min(1, nose * 1.1 + cheek * 0.55 + ear * 0.5 + lips * 0.45);
  r *= 1 + 0.16 * red; g *= 1 - 0.36 * red; b *= 1 - 0.4 * red;
  // a little shadow in the sockets and under the brow, and the inside of the mouth is dark
  const dim = 1 - 0.22 * socket;
  r *= dim; g *= dim * (1 - 0.05 * socket); b *= dim * (1 - 0.06 * socket);
  r = r * (1 - mouth) + 0.2 * mouth; g = g * (1 - mouth) + 0.045 * mouth; b = b * (1 - mouth) + 0.045 * mouth;
  // under his hair the skin is the colour of his hair (seen from any way off, hair is mostly the shade under it)
  const scalp = clamp01((y - 0.163) / 0.012) * clamp01((0.019 - z) / 0.01) * clamp01((0.0495 - ax) / 0.004);
  r *= 1 - 0.58 * scalp; g *= 1 - 0.83 * scalp; b *= 1 - 0.95 * scalp;
  out[0] = r; out[1] = g; out[2] = b;
  // freckles across the nose and the cheeks, and the tops of his ears
  out[3] = Math.min(1, near(ax, y, z, [0.02, 0.168, 0.036], 0.03) + near(x, y, z, [0, 0.172, 0.05], 0.024) + ear * 0.5) * (1 - mouth) * (1 - nose * 0.6);
}


const CELL = { head: 0.0013, belly: 0.0018, jumper: 0.0017, jumperRib: 0.0014, shorts: 0.0018, stockings: 0.0014, boots: 0.0014, mittens: 0.0014, scarf: 0.0015, hat: 0.0018, hatRib: 0.0015, bobble: 0.002 };

/** Where an eyebrow turns about (s = 1 for his left). */
export const browAt = (s) => [s * EYE[0], EYE[1] + EYE_R[s > 0 ? 0 : 1] + 0.0012, EYE[2] + 0.0105];

/** Everything needed to bake him (see bake.js). */
export function elfRecipe() {
  const L = sculptElf();
  const brow = (s) => (data) => {
    const i = s > 0 ? 0 : 1, c = browAt(s);
    const roots = scatter(data.head, 620, (x, y, z) => {
      const u = (x - c[0]) * s;                  // along the brow, outwards
      return Math.abs(u) < 0.0125 && Math.abs(y - c[1] + u * 0.1) < 0.0024 && z > 0.03 ? 1 : 0;
    }, 21 + i);
    return growStrands(roots, {
      seed: 5 + i, segments: 4, width: 0.0004, clump: 0.25, clumps: 40, frizz: 0.0006,
      body: (x, y, z) => Math.min(L.head.dist(x, y, z), L.hatRib.dist(x, y, z) + 0.0005),
      shape: (p, n, rnd) => ({ length: 0.0038 + rnd() * 0.0036, dir: [s * (0.9 + rnd() * 0.4), 0.15 + rnd() * 0.35, 0.75], droop: 0.1, stiff: 0.95 }),
    });
  };
  return {
    bones: BONES, layers: L, cells: CELL, skin: ['head', 'belly'], paint: { head: paintSkin, belly: paintSkin },
    hair: {
      // what shows under the hat: round the back and the sides, below the brim; and a tuft in the middle of the forehead
      scalp: (data) => growStrands(scatter(data.head, 5600, (x, y, z, nx, ny) => {
        if (y < 0.16 || y > 0.2 || ny < -0.5) return 0;
        const ax = Math.abs(x);
        if (z > 0.034 && ax < 0.012 && y > 0.1945) return 1;
        if (z > 0.021 || ax > 0.047) return 0;
        return clamp01((y - 0.16) / 0.014) * (z < 0 ? 1 : 0.85);
      }, 11), {
        seed: 3, segments: 7, width: 0.00042, clump: 0.55, clumps: 260, frizz: 0.0018, curl: [0.0012, 380],
        body: (x, y, z) => Math.min(L.head.dist(x, y, z), L.hat.dist(x, y, z) + 0.0012, L.hatRib.dist(x, y, z) + 0.0008, L.scarf.dist(x, y, z), L.jumper.dist(x, y, z)),
        shape: (p, n, rnd) => {
          if (p[2] > 0.03) return { length: 0.007 + rnd() * 0.008, dir: [0.9 + rnd() * 0.5, -0.25 - rnd() * 0.3, 0.55], droop: 0.5, stiff: 0.6 };   // the tuft: swept to one side
          const side = Math.abs(p[0]) > 0.03;
          // out from under the hat like straw from a scarecrow, then down
          return side
            ? { length: 0.013 + rnd() * 0.014, dir: [Math.sign(p[0]) * 1.2, -0.15 - rnd() * 0.5, -0.45 + n[2] * 0.5], droop: 0.9, stiff: 0.45 }
            : { length: 0.016 + rnd() * 0.02, dir: [n[0] * 0.9, -0.55 - rnd() * 0.3, n[2] * 1.1], droop: 1.2, stiff: 0.3 };
        },
      }),
      // eyebrows: thick, and a law unto themselves. They stick out from under the brim of his hat
      browL: brow(1), browR: brow(-1),
      // the bobble: yarn ends standing out in every direction
      bobble: (data) => growStrands(scatter(data.bobble, 2600, () => 1, 31), {
        seed: 9, segments: 4, width: 0.0006, clump: 0.35, clumps: 300, frizz: 0.0016,
        shape: (p, n, rnd) => ({ length: 0.007 + rnd() * 0.004, dir: [n[0], n[1], n[2]], droop: 0.15, stiff: 0.8 }),
      }),
      // the scarf ends in tassels
      fringe: (data) => growStrands(scatter(data.scarf, 700, (x, y) => (y < 0.0855 && x < -0.008 ? 1 : 0), 41), {
        seed: 13, segments: 4, width: 0.0006, clump: 0.85, clumps: 9, frizz: 0.0007,
        shape: (p, n, rnd) => ({ length: 0.009 + rnd() * 0.003, dir: [n[0] * 0.2, -1, n[2] * 0.2 + 0.1], droop: 0.6, stiff: 0.5 }),
      }),
    },
  };
}
