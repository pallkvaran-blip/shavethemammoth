// Mortimer, as designed: his bones, the layers he is sculpted in (the bare
// head and neck, the beak, the body under the feathers, the wings, the legs,
// the ruff, the foundation of the toupee), what is painted on them, where his
// feathers lie and where what hair he has (not all of it his own) grows.
// Baking turns this into meshes, strands and feathers (bake.js); vulture.js
// dresses the result and brings it to life.
//
// (Arithmetic only: nothing here needs the page, so it can be baked on another
// thread.)
import { Sculpt, scatter } from './sculpt.js';
import { growStrands } from './strands.js';
import { growFeathers } from './feathers.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const near = (x, y, z, c, r) => { const d = Math.hypot(x - c[0], y - c[1], z - c[2]) / r; return d >= 1 ? 0 : (1 - d * d) * (1 - d * d); };
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---- where things are (he faces +z; his left is +x) ----
const TILT = 12.6;                                               // degrees his body leans forward
const BODY = [0, 0.2, -0.02];
const NECK = [[0, 0.3, 0.012], [0, 0.387, 0.06], [0, 0.442, 0.062]];
export const HEAD = [0, 0.458, 0.07];
export const EYE = [0.0185, 0.465, 0.098], EYE_R = 0.0086;
const BEAK = [[0, 0.4535, 0.1], [0, 0.449, 0.13], [0, 0.438, 0.152], [0, 0.4195, 0.159]];
export const RUFF = [0, 0.318, 0.012], RUFF_AXIS = [0, 0.969, -0.247];
export const RUG = [0.004, 0.489, 0.066], RUG_TILT = 12.6;
const FOOT = (s) => [s * 0.04, 0.012, 0.006];

const BONES = [
  { name: 'hips', at: [0, 0.12, -0.01] },
  { name: 'legL', parent: 'hips', at: [0.038, 0.115, 0] }, { name: 'legR', parent: 'hips', at: [-0.038, 0.115, 0] },
  { name: 'body', parent: 'hips', at: BODY },
  { name: 'wingL', parent: 'body', at: [0.07, 0.285, -0.02] }, { name: 'wingR', parent: 'body', at: [-0.07, 0.285, -0.02] },
  { name: 'tail', parent: 'body', at: [0, 0.11, -0.075] },
  { name: 'neck1', parent: 'body', at: [0, 0.32, 0.02] }, { name: 'neck2', parent: 'neck1', at: NECK[1] },
  { name: 'head', parent: 'neck2', at: [0, 0.445, 0.062] },
  { name: 'jaw', parent: 'head', at: [0, 0.44, 0.09] },
  { name: 'rug', parent: 'head', at: RUG },
];

function sculptVulture() {
  const L = {};
  // ---- bare skin: a neck with too much of it, and a head with none to spare ----
  const head = [
    { type: 'rc', a: NECK[0], b: NECK[1], r1: 0.027, r2: 0.021, bone: 'neck1', k: 0 },
    { type: 'rc', a: NECK[1], b: NECK[2], r1: 0.021, r2: 0.0195, bone: 'neck2', k: 0.012 },
    { type: 'sph', c: [0, 0.404, 0.083], r: 0.0105, bone: 'neck2', k: 0.012 },                       // a wattle, under the chin
    { type: 'ell', c: HEAD, r: [0.034, 0.034, 0.04], bone: 'head', k: 0.012 },
    { type: 'sph', c: [0, 0.4525, 0.103], r: 0.0172, bone: 'head', k: 0.008 },                       // the soft part the beak grows out of
    // lumps on the back of the skull (which the toupee is supposed to be hiding)
    { type: 'sph', c: [0.013, 0.482, 0.044], r: 0.0075, bone: 'head', k: 0.006 },
    { type: 'sph', c: [-0.012, 0.479, 0.04], r: 0.0068, bone: 'head', k: 0.006 },
    { type: 'sph', c: [0, 0.469, 0.034], r: 0.007, bone: 'head', k: 0.006 },
  ];
  for (const s of [1, -1]) {
    head.push({ type: 'ell', c: [s * 0.0185, 0.4762, 0.0995], r: [0.0138, 0.005, 0.0105], rot: [0, 0, s * -22], bone: 'head', k: 0.007 });   // a brow that has seen things
  }
  for (const s of [1, -1]) {
    head.push({ type: 'sph', c: [s * EYE[0], EYE[1], EYE[2] + 0.002], r: EYE_R + 0.0004, bone: 'head', k: 0.0028, cut: true });
  }
  L.head = new Sculpt(head, {
    k: 0.008, eps: 0.0005,
    // rings of loose skin down the neck, finer creases everywhere
    bump: (x, y, z) => {
      const along = y + z * 0.45, low = clamp01((0.447 - y) / 0.02);
      return 0.0011 * Math.sin(along * 640 + Math.sin(Math.atan2(x, z - 0.04) * 2) * 0.9) * low + 0.00028 * Math.sin(x * 1500 + y * 700) * Math.sin(z * 1300 - y * 900);
    },
  });

  // ---- the beak: long, and hooked over at the end. The lower half moves ----
  L.beak = new Sculpt([
    { type: 'rc', a: BEAK[0], b: BEAK[1], r1: 0.0152, r2: 0.0124, bone: 'head', k: 0 },
    { type: 'rc', a: BEAK[1], b: BEAK[2], r1: 0.0124, r2: 0.0084, bone: 'head', k: 0.006 },
    { type: 'rc', a: BEAK[2], b: BEAK[3], r1: 0.0084, r2: 0.0026, bone: 'head', k: 0.004 },
    { type: 'rc', a: [0, 0.4385, 0.097], b: [0, 0.4318, 0.139], r1: 0.0092, r2: 0.0046, bone: 'jaw', k: 0.0015 },
    { type: 'sph', c: [0.0088, 0.4558, 0.1175], r: 0.0027, bone: 'head', k: 0.0015, cut: true },
    { type: 'sph', c: [-0.0088, 0.4558, 0.1175], r: 0.0027, bone: 'head', k: 0.0015, cut: true },
  ], { k: 0.004 });

  // ---- under the feathers: a body that leans forward, hunched shoulders, the tops of the legs ----
  L.body = new Sculpt([
    { type: 'ell', c: BODY, r: [0.092, 0.122, 0.102], rot: [TILT, 0, 0], bone: 'body', k: 0 },
    { type: 'sph', c: [0, 0.235, 0.052], r: 0.058, bone: 'body', k: 0.03 },
    { type: 'sph', c: [0.056, 0.296, -0.012], r: 0.04, bone: 'body', k: 0.03 },
    { type: 'sph', c: [-0.056, 0.296, -0.012], r: 0.04, bone: 'body', k: 0.03 },
    { type: 'rc', a: [0.04, 0.15, 0], b: [0.039, 0.106, 0.003], r1: 0.034, r2: 0.0165, bone: 'legL', k: 0.02 },
    { type: 'rc', a: [-0.04, 0.15, 0], b: [-0.039, 0.106, 0.003], r1: 0.034, r2: 0.0165, bone: 'legR', k: 0.02 },
    { type: 'ell', c: [0, 0.102, -0.086], r: [0.05, 0.02, 0.04], rot: [-25, 0, 0], bone: 'tail', k: 0.02 },
  ], { k: 0.02 });
  L.wings = new Sculpt([1, -1].flatMap((s) => [
    { type: 'ell', c: [s * 0.08, 0.195, -0.044], r: [0.034, 0.13, 0.092], rot: [TILT, 0, s * 5.7], bone: s > 0 ? 'wingL' : 'wingR', k: 0 },
    { type: 'sph', c: [s * 0.072, 0.298, 0.006], r: 0.03, bone: s > 0 ? 'wingL' : 'wingR', k: 0.02 },
  ]), { k: 0.01 });

  // ---- legs: scaly, with feet that hold on ----
  const legs = [];
  for (const s of [1, -1]) {
    const bone = s > 0 ? 'legL' : 'legR', f = FOOT(s);
    legs.push(
      { type: 'rc', a: [s * 0.038, 0.112, 0.002], b: [f[0], 0.017, f[2]], r1: 0.0088, r2: 0.0078, bone, k: 0 },
      { type: 'sph', c: [f[0], 0.013, f[2]], r: 0.0108, bone, k: 0.006 },
    );
    for (const a of [-0.52, 0, 0.52, Math.PI]) {
      const len = a === 0 ? 0.044 : a === Math.PI ? 0.024 : 0.037, dx = Math.sin(a), dz = Math.cos(a);
      const mid = [f[0] + dx * len * 0.55, 0.0082, f[2] + dz * len * 0.55], tip = [f[0] + dx * len, 0.0058, f[2] + dz * len];
      legs.push(
        { type: 'rc', a: [f[0], 0.0095, f[2]], b: mid, r1: 0.0064, r2: 0.0054, bone, k: 0.004 },
        { type: 'rc', a: mid, b: tip, r1: 0.0054, r2: 0.0042, bone, k: 0.003 },
        { type: 'rc', a: tip, b: [tip[0] + dx * 0.0115, 0.0018, tip[2] + dz * 0.0115], r1: 0.0031, r2: 0.0009, bone, k: 0.0015 },      // a claw
      );
    }
  }
  legs.push({ type: 'box', c: [0, -0.02, 0], h: [0.12, 0.02, 0.12], bone: 'hips', k: 0.0006, cut: true });
  L.legs = new Sculpt(legs, { k: 0.004 });

  // ---- what the down of the ruff grows from, and the foundation of the toupee ----
  L.ruff = new Sculpt([{ type: 'tor', c: RUFF, R: 0.045, r: 0.02, axis: RUFF_AXIS, bone: 'body', k: 0 }], { k: 0.002 });
  L.rug = new Sculpt([{ type: 'ell', c: RUG, r: [0.037, 0.0105, 0.041], rot: [0, 0, RUG_TILT], bone: 'rug', k: 0 }], { k: 0.002 });
  return L;
}

// What is painted on his skin: a head the colour of something left out in the sun, blue about the eyes.
function paintHead(x, y, z, nx, ny, nz, out) {
  const ax = Math.abs(x);
  const eye = near(ax, y, z, [EYE[0] + 0.002, EYE[1], EYE[2] + 0.004], 0.019), crown = clamp01((y - 0.468) / 0.02), cere = near(x, y, z, [0, 0.4525, 0.108], 0.022);
  const low = clamp01((0.37 - y) / 0.06);
  let r = 1, g = 1, b = 1;
  r *= 1 + 0.1 * crown; g *= 1 - 0.22 * crown; b *= 1 - 0.2 * crown;                 // redder on top
  r *= 1 - 0.38 * eye; g *= 1 - 0.3 * eye; b *= 1 + 0.25 * eye;                      // blue-grey round the eyes
  r *= 1 + 0.12 * cere; g *= 1 + 0.5 * cere; b *= 1 + 0.1 * cere;                    // yellower where the beak begins
  r *= 1 + 0.06 * low; g *= 1 + 0.35 * low; b *= 1 + 0.4 * low;                      // paler down in the ruff
  out[0] = r; out[1] = g; out[2] = b;
  out[3] = 0.7;
}
// The beak: horn-coloured, darkening to the hook.
function paintBeak(x, y, z, nx, ny, nz, out) {
  const t = clamp01((z - 0.112) / 0.045), d = t * t * (3 - 2 * t), dark = d * 0.86 + 0.1 * clamp01((0.4325 - y) / 0.004);
  out[0] = 1 - dark; out[1] = 1 - dark * 1.02; out[2] = 1 - dark * 1.02; out[3] = 1;
}
// The feet: claws black.
function paintLegs(x, y, z, nx, ny, nz, out) {
  const s = x > 0 ? 1 : -1, f = FOOT(s), dx = x - f[0], dz = z - f[2], far = Math.hypot(dx, dz);
  const a = Math.atan2(dx, dz), len = Math.abs(a) < 0.25 ? 0.044 : Math.abs(a) > 2.4 ? 0.024 : 0.037;
  const claw = y < 0.02 ? clamp01((far - len + 0.0015) / 0.004) : 0;
  const k = 1 - 0.9 * claw;
  out[0] = k; out[1] = k; out[2] = k; out[3] = claw;
}

/** Points on the upper part of an egg-shaped block, for a wig to grow from: { p, n } as scatter gives them. */
function wigRoots(count, c, r, seed, from = -0.25) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const out = [];
  while (out.length < count) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    const d = [q * Math.cos(a), u, q * Math.sin(a)];
    if (d[1] < from) continue;
    out.push({ p: [c[0] + d[0] * r[0], c[1] + d[1] * r[1], c[2] + d[2] * r[2]], n: unit([d[0] / r[0], d[1] / r[1], d[2] / r[2]]) });
  }
  return out;
}
/** Where a wig's block is, in the frame of its stand (the stand's foot is the origin). */
export const WIG_BLOCK = { c: [0, 0.071, 0], r: [0.02, 0.023, 0.021] };

const CELL = { head: 0.0014, beak: 0.0012, body: 0.0036, wings: 0.0036, legs: 0.0013, ruff: 0.003, rug: 0.0022 };

/** Everything needed to bake him, and the wigs on his table (see bake.js). */
export function vultureRecipe() {
  const L = sculptVulture();
  const flesh = (x, y, z) => Math.min(L.head.within(x, y, z, 0.05), L.beak.within(x, y, z, 0.05));
  const trunk = (x, y, z) => Math.min(L.body.within(x, y, z, 0.05), L.wings.within(x, y, z, 0.05));
  const block = (x, y, z) => Math.hypot(x / WIG_BLOCK.r[0], (y - WIG_BLOCK.c[1]) / WIG_BLOCK.r[1], z / WIG_BLOCK.r[2]) * 0.02 - 0.02;
  // the long feathers of a folded wing: laid one over the next like a closed fan, their tips crossing over the tail
  const flight = (s) => () => {
    const roots = [];
    for (let i = 0; i < 12; i++) { const t = i / 11; roots.push({ p: [s * (0.112 - 0.014 * t), 0.222 - 0.09 * t, -0.052 - 0.05 * t], n: unit([s * 0.9, 0.12, -0.42]) }); }
    return growFeathers(roots, {
      seed: 71 + s, segments: 6, cup: 0.1,
      shape: (p, n, rnd, i) => { const t = i / 11; return { length: 0.105 + 0.075 * t + rnd() * 0.008, width: 0.036, dir: [-s * (0.05 + 0.12 * t), -1, -0.42 - 0.3 * t], lift: 0.05, curl: 0.06, roll: s * (0.42 - 0.22 * t), slim: 1 }; },
    });
  };
  const coverts = (s) => (data) => growFeathers(scatter(data.wings, 620, (x, y, z, nx) => (x * s > 0 && nx * s > -0.2 && y > 0.1 ? 1 : 0), 73 + s), {
    seed: 75 + s, segments: 4,
    shape: (p, n, rnd) => {
      const low = clamp01((0.27 - p[1]) / 0.13);
      return { length: 0.038 + 0.03 * low + rnd() * 0.012, width: 0.026 + 0.006 * low + rnd() * 0.004, dir: [0, -1, -0.42 - 0.2 * low], lift: 0.2 + rnd() * 0.1, curl: 0.2, roll: (rnd() - 0.5) * 0.3, slim: 0.2 + 0.4 * low };
    },
  });
  return {
    bones: BONES, layers: L, cells: CELL, skin: ['head'], paint: { head: paintHead, beak: paintBeak, legs: paintLegs }, thin: 0.006,
    hair: {
      // ---- feathers ----
      // the coat: small ones on the breast and the shoulders, larger down the back; none where a wing lies over it
      coat: (data) => growFeathers(scatter(data.body, 2300, (x, y, z) => (y > 0.1 && y < 0.345 && L.wings.within(x, y, z, 0.05) > 0.003 ? 1 : 0), 61), {
        seed: 63, segments: 4,
        shape: (p, n, rnd) => {
          const front = clamp01(n[2] * 1.5 + 0.2), legs = clamp01((0.16 - p[1]) / 0.04);
          return {
            length: 0.03 + 0.012 * (1 - front) + rnd() * 0.012, width: 0.022 + rnd() * 0.007,
            dir: [n[0] * 0.25 * front, -1, -0.34 * (1 - front) * (1 - legs) + 0.08 * front], lift: 0.28 + rnd() * 0.16 + 0.1 * front, curl: 0.28, roll: (rnd() - 0.5) * 0.4, slim: 0,
          };
        },
      }),
      covertsL: coverts(1), covertsR: coverts(-1),
      flightL: flight(1), flightR: flight(-1),
      // the tail: a fan, half open
      tail: () => {
        const roots = [];
        for (let i = -4; i <= 4; i++) roots.push({ p: [i * 0.0085, 0.104 - Math.abs(i) * 0.0012, -0.108 + Math.abs(i) * 0.002], n: unit([Math.sin(i * 0.2) * 0.3, 0.8, -0.55]) });
        return growFeathers(roots, {
          seed: 77, segments: 5, cup: 0.1,
          shape: (p, n, rnd, i) => { const k = i - 4; return { length: 0.118 - Math.abs(k) * 0.007, width: 0.04, dir: [Math.sin(k * 0.2), -0.5, -Math.cos(k * 0.2)], lift: 0.04, curl: -0.04, roll: k * 0.13, slim: 0.85 }; },
        });
      },
      // ---- down, hair, and hair that was somebody else's ----
      // the ruff: white down, standing out all round the foot of his neck
      ruff: (data) => growStrands(scatter(data.ruff, 9500, (x, y, z) => (flesh(x, y, z) > 0.002 ? 1 : 0), 65), {
        seed: 67, segments: 5, width: 0.00068, clump: 0.3, clumps: 420, frizz: 0.0042, curl: [0.0016, 80],
        body: (x, y, z) => Math.min(L.ruff.dist(x, y, z), flesh(x, y, z), trunk(x, y, z)),
        shape: (p, n, rnd) => ({ length: 0.02 + rnd() * 0.017, dir: [n[0] + (rnd() - 0.5) * 0.5, n[1] + (rnd() - 0.5) * 0.5 - 0.15, n[2] + (rnd() - 0.5) * 0.5], droop: 0.5, stiff: 0.55 }),
      }),
      // the toupee: ginger, combed across, with a wave at the front; fooling nobody
      rug: (data) => {
        const up = unit([-Math.sin((RUG_TILT * Math.PI) / 180), Math.cos((RUG_TILT * Math.PI) / 180), 0]);
        return growStrands(scatter(data.rug, 5200, (x, y, z, nx, ny, nz) => (nx * up[0] + ny * up[1] + nz * up[2] > -0.15 ? 1 : 0), 69), {
          seed: 79, segments: 7, width: 0.00056, clump: 0.72, clumps: 70, frizz: 0.0016, curl: [0.0016, 48], loft: 0.007,
          body: (x, y, z) => Math.min(L.rug.dist(x, y, z), flesh(x, y, z)),
          shape: (p, n, rnd) => {
            const front = clamp01((p[2] - RUG[2] - 0.012) / 0.02);
            // swept from his right to his left; the front of it up and back in a wave
            return front > 0.4
              ? { length: 0.03 + rnd() * 0.014, dir: [0.35, 0.75, 0.75], droop: 0, stiff: 0.9, bend: [0.5, 0.5, -1.5] }
              : { length: 0.03 + rnd() * 0.02, dir: [1, 0.3 + n[1] * 0.2, 0.12 + n[2] * 0.3], droop: 1.0, stiff: 0.35 };
          },
        });
      },
      // a few bristles on his head and neck, as on anything plucked
      bristles: (data) => growStrands(scatter(data.head, 420, (x, y, z) => (y > 0.345 && L.beak.within(x, y, z, 0.05) > 0.006 && near(Math.abs(x), y, z, EYE, 0.016) === 0 ? 1 : 0), 81), {
        seed: 83, segments: 3, width: 0.0003, clump: 0, clumps: 0, frizz: 0.0006,
        shape: (p, n, rnd) => ({ length: 0.0025 + rnd() * 0.004, dir: [n[0], n[1] - 0.4, n[2]], droop: 0.3, stiff: 0.8 }),
      }),
      // ---- the wigs on his table, each in the frame of its own stand ----
      // a ginger mop
      wigMop: () => growStrands(wigRoots(3600, WIG_BLOCK.c, WIG_BLOCK.r, 91, -0.1), {
        seed: 93, segments: 8, width: 0.0006, clump: 0.6, clumps: 60, frizz: 0.0022, curl: [0.0024, 50], loft: 0.006, body: block,
        shape: (p, n, rnd) => ({ length: 0.03 + rnd() * 0.022, dir: [n[0], 0.25, n[2]], droop: 1.5, stiff: 0.25 }),
      }),
      // a tall fair one, of the kind worn to the opera
      wigTower: () => growStrands(wigRoots(4200, WIG_BLOCK.c, WIG_BLOCK.r, 95, -0.2), {
        seed: 97, segments: 9, width: 0.0006, clump: 0.7, clumps: 46, frizz: 0.0014, curl: [0.0042, 30], loft: 0.004, body: block,
        shape: (p, n, rnd) => {
          const top = clamp01(n[1] * 1.4);
          return top > 0.35
            ? { length: 0.06 + rnd() * 0.03, dir: [n[0] * 0.25, 1, n[2] * 0.25 - 0.06], droop: 0.12, stiff: 0.9 }
            : { length: 0.028 + rnd() * 0.012, dir: [n[0], -0.1, n[2]], droop: 1.3, stiff: 0.3 };              // ringlets at the sides
        },
      }),
      // a black quiff, on the skull of somebody who haggled
      wigQuiff: () => growStrands(wigRoots(3000, [0, 0.074, -0.001], [0.0205, 0.021, 0.0225], 99, 0.05), {
        seed: 101, segments: 8, width: 0.0006, clump: 0.82, clumps: 34, frizz: 0.001, loft: 0.004,
        body: (x, y, z) => Math.hypot(x / 0.0205, (y - 0.074) / 0.021, (z + 0.001) / 0.0225) * 0.02 - 0.02,
        shape: (p, n, rnd) => {
          const front = clamp01((p[2] + 0.004) / 0.012);
          return { length: 0.026 + 0.022 * front + rnd() * 0.008, dir: [n[0] * 0.3, 0.55 + 0.3 * front, 0.5 + 0.5 * front], droop: 0, stiff: 0.9, bend: [0, 0.6 * front, -1.9 * front - 0.9] };
        },
      }),
    },
  };
}
