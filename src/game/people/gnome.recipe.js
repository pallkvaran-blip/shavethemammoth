// Gnorman, as designed: his bones, the layers he is sculpted in, what is
// painted on his skin, and where his hair grows and how. Baking turns this
// into meshes and strands (bake.js); gnome.js dresses the result and brings it
// to life.
//
// (Arithmetic only: nothing here needs the page, so it can be baked on another
// thread.)
import { Sculpt, scatter } from './sculpt.js';
import { growStrands } from './strands.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const near = (x, y, z, c, r) => { const d = Math.hypot(x - c[0], y - c[1], z - c[2]) / r; return d >= 1 ? 0 : (1 - d * d) * (1 - d * d); };
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---- where things are ----
const HEAD = [0, 0.232, 0.002];
export const EYE = [0.0235, 0.2465, 0.046], EYE_R = 0.0098;
export const HAT = [[0, 0.252, -0.003], [0.004, 0.33, -0.012], [0.016, 0.402, -0.017]], HAT_TILT = -12;
export const BELLY = [0, 0.132, 0.004], BELLY_R = [0.096, 0.088, 0.092], BELT_Y = 0.098;
const ARM_L = [[0.082, 0.17, 0], [0.112, 0.2, 0.008], [0.134, 0.229, 0.015]];       // shoulder, elbow, wrist: up, with the foam hand on the end of it
const ARM_R = [[-0.082, 0.17, 0], [-0.11, 0.132, 0.012], [-0.119, 0.104, 0.03]];    // hanging
// the foam hand: flat, facing forward, leaning out a little
export const F_LEAN = 20, F_UP = [Math.sin((F_LEAN * Math.PI) / 180), Math.cos((F_LEAN * Math.PI) / 180), 0], F_ACROSS = [F_UP[1], -F_UP[0], 0];
export const foamAt = (across, up, z = 0) => [ARM_L[2][0] + F_ACROSS[0] * across + F_UP[0] * up, ARM_L[2][1] + F_ACROSS[1] * across + F_UP[1] * up, ARM_L[2][2] + 0.002 + z];

const BONES = [
  { name: 'hips', at: [0, 0.075, 0] },
  { name: 'legL', parent: 'hips', at: [0.037, 0.078, 0] }, { name: 'legR', parent: 'hips', at: [-0.037, 0.078, 0] },
  { name: 'torso', parent: 'hips', at: [0, 0.085, 0] },
  { name: 'head', parent: 'torso', at: [0, 0.2, 0] },
  { name: 'hat1', parent: 'head', at: HAT[0] }, { name: 'hat2', parent: 'hat1', at: HAT[1] }, { name: 'fan', parent: 'hat2', at: HAT[2] },
  { name: 'armL', parent: 'torso', at: ARM_L[0] }, { name: 'foreL', parent: 'armL', at: ARM_L[1] }, { name: 'handL', parent: 'foreL', at: ARM_L[2] },
  { name: 'armR', parent: 'torso', at: ARM_R[0] }, { name: 'foreR', parent: 'armR', at: ARM_R[1] }, { name: 'handR', parent: 'foreR', at: ARM_R[2] },
];

// the top edge of the beard: under the lip, up across the cheeks to the ears
const beardLine = (ax) => 0.19 + 0.9 * ax;
const inBeard = (x, y, z) => {
  const ax = Math.abs(x);
  if (z < -0.014 || y < 0.168 || y > beardLine(ax)) return 0;
  if (ax < 0.015 && y > 0.1895 && z > 0.044) return 0;        // (not on the lip)
  return 1;
};
// what hair he has: round the back, from ear to ear, under the hat
const inHair = (x, y, z) => (y > 0.2 && y < 0.262 && z < 0.012 && Math.abs(x) < 0.0595 ? 1 : 0);

function sculptGnome() {
  const L = {};
  // ---- skin: a head, and one fist (the other hand is inside the foam one) ----
  const head = [
    { type: 'ell', c: HEAD, r: [0.06, 0.057, 0.058], bone: 'head', k: 0 },
    { type: 'rc', a: [0, 0.165, 0], b: [0, 0.2, 0.002], r1: 0.034, r2: 0.034, bone: 'head', k: 0.012 },
    { type: 'sph', c: [0, 0.19, 0.03], r: 0.024, bone: 'head', k: 0.014 },
    // the nose: a bridge, and then a great deal of nose
    { type: 'rc', a: [0, 0.25, 0.05], b: [0, 0.234, 0.064], r1: 0.011, r2: 0.016, bone: 'head', k: 0.008 },
    { type: 'sph', c: [0, 0.2265, 0.069], r: 0.0265, bone: 'head', k: 0.008 },
    // a lower lip, which is all of his mouth that anyone has seen in years
    { type: 'ell', c: [0, 0.1975, 0.054], r: [0.013, 0.0055, 0.0075], bone: 'head', k: 0.004 },
  ];
  for (const s of [1, -1]) {
    head.push(
      { type: 'sph', c: [s * 0.035, 0.217, 0.037], r: 0.0235, bone: 'head', k: 0.012 },                                   // a cheek
      { type: 'sph', c: [s * 0.019, 0.2185, 0.061], r: 0.0115, bone: 'head', k: 0.005 },                                   // a wing of the nose
      { type: 'ell', c: [s * 0.023, 0.2555, 0.048], r: [0.021, 0.0075, 0.0095], rot: [0, 0, s * -6], bone: 'head', k: 0.01 },   // a brow
      // an ear: round, and standing well out
      { type: 'leaf', a: [s * 0.054, 0.221, 0.002], b: [s * 0.083, 0.241, -0.007], r1: 0.016, r2: 0.0125, t: 0.0046, t2: 0.0034, n: [s * -0.4, 0, 1], bend: s * 0.002, bone: 'head', k: 0.008 },
    );
  }
  for (const s of [1, -1]) {
    head.push(
      { type: 'sph', c: [s * 0.0105, 0.206, 0.0715], r: 0.0042, bone: 'head', k: 0.002, cut: true },                       // a nostril
      { type: 'sph', c: [s * EYE[0], EYE[1], EYE[2] + 0.0035], r: EYE_R + 0.0003, bone: 'head', k: 0.003, cut: true },     // a socket
      { type: 'ell', c: [s * 0.0672, 0.2315, 0.0015], r: [0.009, 0.0034, 0.0115], axis: [s * -0.4, 0, 1], bone: 'head', k: 0.003, cut: true },   // the hollow of the ear
    );
  }
  L.head = new Sculpt(head, { k: 0.008, eps: 0.0005 });
  const fist = [ARM_R[2][0] - 0.003, ARM_R[2][1] - 0.014, ARM_R[2][2] + 0.008];
  L.hand = new Sculpt([
    { type: 'sph', c: fist, r: 0.0205, bone: 'handR', k: 0 },
    ...[-1.5, -0.5, 0.5, 1.5].map((i) => ({ type: 'sph', c: [fist[0] + i * 0.0085, fist[1] - 0.0125, fist[2] + 0.0115], r: 0.0072, bone: 'handR', k: 0.004 })),
    { type: 'rc', a: [fist[0] + 0.015, fist[1] + 0.004, fist[2] + 0.011], b: [fist[0] + 0.007, fist[1] - 0.008, fist[2] + 0.021], r1: 0.0075, r2: 0.0066, bone: 'handR', k: 0.004 },
  ], { k: 0.004 });

  // ---- the jersey: the team's stripes, round a belly; plain at the neck and the cuffs ----
  const round = { r: 0.09, ref: [1, 0, 0] };                 // (the seam down his right side, under the arm)
  L.jersey = new Sculpt([
    { type: 'ell', c: BELLY, r: BELLY_R, bone: 'torso', k: 0, uv: round },
    { type: 'ell', c: [0, 0.172, 0], r: [0.08, 0.036, 0.062], bone: 'torso', k: 0.022, uv: { ...round, v0: 0.172 - BELLY[1] } },
    { type: 'rc', a: ARM_L[0], b: ARM_L[1], r1: 0.0245, r2: 0.0215, bone: 'armL', k: 0.012, uv: { ref: [0, 0, 1] } },
    { type: 'rc', a: ARM_L[1], b: ARM_L[2], r1: 0.0215, r2: 0.0195, bone: 'foreL', k: 0.008, uv: { ref: [0, 0, 1], v0: dist(ARM_L[0], ARM_L[1]) } },
    { type: 'rc', a: ARM_R[0], b: ARM_R[1], r1: 0.0245, r2: 0.0215, bone: 'armR', k: 0.012, uv: { ref: [0, 0, 1] } },
    { type: 'rc', a: ARM_R[1], b: ARM_R[2], r1: 0.0215, r2: 0.0195, bone: 'foreR', k: 0.008, uv: { ref: [0, 0, 1], v0: dist(ARM_R[0], ARM_R[1]) } },
    // (tucked in at the belt)
    { type: 'box', c: [0, BELT_Y - 0.06, 0], h: [0.13, 0.06, 0.13], bone: 'torso', k: 0.002, cut: true },
  ], { k: 0.01 });
  L.jerseyRib = new Sculpt([
    { type: 'tor', c: [0, 0.198, 0.003], R: 0.043, r: 0.0085, rot: [6, 0, 0], bone: 'torso', k: 0, uv: { r: 0.045 } },
    ...[[ARM_L, 'foreL'], [ARM_R, 'foreR']].map(([A, bone]) => {
      const axis = unit(sub(A[2], A[1]));
      return { type: 'tor', c: A[2], R: 0.0185, r: 0.0056, axis, bone, k: 0, uv: { axis, r: 0.02 } };
    }),
  ], { k: 0.002 });

  // ---- below the belt: the under side of the belly, and what there is of his legs ----
  L.trousers = new Sculpt([
    { type: 'ell', c: BELLY, r: BELLY_R.map((v) => v - 0.0015), bone: 'torso', k: 0, uv: { r: 0.09 } },
    { type: 'rc', a: [0.037, 0.082, 0], b: [0.038, 0.042, 0.002], r1: 0.031, r2: 0.027, bone: 'legL', k: 0.014 },
    { type: 'rc', a: [-0.037, 0.082, 0], b: [-0.038, 0.042, 0.002], r1: 0.031, r2: 0.027, bone: 'legR', k: 0.014 },
    { type: 'box', c: [0, BELT_Y + 0.104, 0], h: [0.13, 0.1, 0.13], bone: 'torso', k: 0.002, cut: true },
  ], { k: 0.008 });
  const girth = Math.sqrt(1 - ((BELT_Y - BELLY[1]) / BELLY_R[1]) ** 2);
  L.belt = new Sculpt([
    { type: 'tor', c: [0, BELT_Y, BELLY[2]], R: BELLY_R[2] * girth + 0.001, r: 0.0045, s: [BELLY_R[0] / BELLY_R[2], 2.4, 1], bone: 'torso', k: 0, uv: { r: 0.09 } },
  ], { k: 0.002 });
  const boot = (s) => {
    const bone = s > 0 ? 'legL' : 'legR', x = s * 0.038;
    return [
      { type: 'ell', c: [x, 0.018, 0.018], r: [0.03, 0.02, 0.046], bone, k: 0 },
      { type: 'sph', c: [x, 0.0215, 0.045], r: 0.0235, bone, k: 0.01 },                                  // a toe like a doorknob
      { type: 'rc', a: [x, 0.048, 0], b: [x, 0.022, 0.002], r1: 0.0285, r2: 0.03, bone, k: 0.01 },
      { type: 'tor', c: [x, 0.05, 0], R: 0.028, r: 0.0052, bone, k: 0.002 },
      { type: 'ell', c: [x, 0.004, 0.018], r: [0.032, 0.0062, 0.049], bone, k: 0.0015 },
    ];
  };
  L.boots = new Sculpt([...boot(1), ...boot(-1), { type: 'box', c: [0, -0.03, 0.01], h: [0.12, 0.03, 0.12], bone: 'hips', k: 0.0008, cut: true }], { k: 0.004 });

  // ---- the hat: tall, red, pulled down to his eyebrows ----
  const tilt = (HAT_TILT * Math.PI) / 180, up = [0, Math.cos(tilt), Math.sin(tilt)];
  const brimAt = [HAT[0][0], HAT[0][1] + 0.002, HAT[0][2]];
  L.hat = new Sculpt([
    { type: 'rc', a: HAT[0], b: HAT[1], r1: 0.0625, r2: 0.037, bone: 'hat1', k: 0, uv: { ref: [0, 0, 1], r: 0.05 } },
    { type: 'rc', a: HAT[1], b: HAT[2], r1: 0.037, r2: 0.0095, bone: 'hat2', k: 0.02, uv: { ref: [0, 0, 1], r: 0.05, v0: dist(HAT[0], HAT[1]) } },
    { type: 'tor', c: brimAt, R: 0.0605, r: 0.0088, rot: [HAT_TILT, 0, 0], bone: 'hat1', k: 0.006, uv: { r: 0.065 } },
    { type: 'box', c: brimAt.map((v, a) => v - up[a] * 0.055), h: [0.1, 0.05, 0.1], rot: [HAT_TILT, 0, 0], bone: 'hat1', k: 0.003, cut: true },
  ], {
    k: 0.01,
    // it has been sat on: creased round, more so towards the top
    bump: (x, y, z) => 0.0011 * Math.sin(y * 105 + Math.sin(Math.atan2(x, z) * 3) * 1.4) * clamp01((y - 0.285) / 0.05),
  });

  // ---- the foam hand: one finger up, as big as his head ----
  L.foam = new Sculpt([
    { type: 'box', c: foamAt(0, 0.04), h: [0.036, 0.033, 0.0135], rot: [0, 0, -F_LEAN], round: 0.012, bone: 'handL', k: 0 },
    { type: 'box', c: foamAt(-0.014, 0.108), h: [0.0135, 0.042, 0.0125], rot: [0, 0, -F_LEAN], round: 0.012, bone: 'handL', k: 0.008 },
    { type: 'box', c: foamAt(-0.046, 0.034), h: [0.0115, 0.021, 0.012], rot: [0, 0, -F_LEAN + 14], round: 0.0105, bone: 'handL', k: 0.008 },
    ...[0.008, 0.021, 0.033].map((a) => ({ type: 'sph', c: foamAt(a, 0.074), r: 0.0125, bone: 'handL', k: 0.006 })),
  ], { k: 0.006 });
  return L;
}

// What is painted on his skin: where the blood shows (most places), and the colour of his beard under his beard.
function paintGnome(x, y, z, nx, ny, nz, out) {
  const ax = Math.abs(x);
  const nose = Math.min(1, 1.5 * near(x, y, z, [0, 0.2265, 0.069], 0.055)), cheek = near(ax, y, z, [0.035, 0.217, 0.039], 0.045);
  const ear = clamp01((ax - 0.058) / 0.02), lip = near(x, y, z, [0, 0.1975, 0.056], 0.014);
  let r = 1, g = 1, b = 1;
  const red = Math.min(1, nose + cheek * 0.85 + ear * 0.6 + lip * 0.7);
  r *= 1 + 0.1 * red; g *= 1 - 0.44 * red; b *= 1 - 0.48 * red;
  const socket = near(ax, y, z, [EYE[0], EYE[1], EYE[2] + 0.008], 0.0135) * 0.6;
  r *= 1 - 0.2 * socket; g *= 1 - 0.25 * socket; b *= 1 - 0.26 * socket;
  // (seen from any way off, a beard is mostly the shade of what is under it)
  const beard = clamp01((beardLine(ax) - y) / 0.009) * clamp01((z + 0.02) / 0.008) * clamp01((y - 0.162) / 0.006) * (ax < 0.015 && y > 0.1895 && z > 0.044 ? 0 : 1);
  const hair = clamp01((0.016 - z) / 0.008) * clamp01((y - 0.196) / 0.008) * clamp01((0.0595 - ax) / 0.002);
  const white = Math.max(beard * (1 - Math.min(1, nose * 1.6)), hair) * 0.9;
  r += (1.15 - r) * white; g += (2.0 - g) * white; b += (3.2 - b) * white;
  out[0] = r; out[1] = g; out[2] = b;
  out[3] = (1 - white) * (nose * 0.6 + cheek * 0.5);            // (where the skin shines, and has the odd blotch)
}


const CELL = { head: 0.0015, hand: 0.0015, jersey: 0.0023, jerseyRib: 0.0016, trousers: 0.0026, belt: 0.0016, boots: 0.002, hat: 0.0022, foam: 0.0022 };

// (the same list in another order, the same every time: roots from two places mixed, so that a share of them is a fair share)
function shuffled(list, seed) {
  let s = seed >>> 0 || 1;
  for (let i = list.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((s / 4294967296) * (i + 1)), t = list[i];
    list[i] = list[j]; list[j] = t;
  }
  return list;
}

/** Where an eyebrow turns about (s = 1 for his left). */
export const browAt = (s) => [s * 0.023, 0.2575, 0.0565];

/** Everything needed to bake him (see bake.js). */
export function gnomeRecipe() {
  const L = sculptGnome();
  const clothes = (x, y, z) => Math.min(L.jersey.within(x, y, z, 0.05), L.jerseyRib.within(x, y, z, 0.05), L.belt.within(x, y, z, 0.05), L.foam.within(x, y, z, 0.05));
  const brow = (s) => (data) => {
    const c = browAt(s);
    const roots = scatter(data.head, 760, (x, y, z) => { const u = (x - c[0]) * s; return Math.abs(u) < 0.02 && Math.abs(y - c[1] + u * 0.08) < 0.0048 && z > 0.04 ? 1 : 0; }, 55 + s);
    return growStrands(roots, {
      seed: 25 + s, segments: 5, width: 0.0006, clump: 0.3, clumps: 40, frizz: 0.001,
      body: (x, y, z) => Math.min(L.head.dist(x, y, z), L.hat.within(x, y, z, 0.05) + 0.0006),
      shape: (p, n, rnd) => ({ length: 0.011 + rnd() * 0.01, dir: [s * (0.75 + rnd() * 0.5), 0.1 + rnd() * 0.3, 1], droop: 0.35, stiff: 0.8 }),
    });
  };
  return {
    bones: BONES, layers: L, cells: CELL, skin: ['head', 'hand'], paint: { head: paintGnome },
    hair: {
      // the beard: from under his nose to his belt, lying on the belly as on a shelf. Thickest in the middle, where it
      // has furthest to go; and none of it rooted where his collar is
      beard: (data) => growStrands(shuffled([
        ...scatter(data.head, 6000, (x, y, z) => (clothes(x, y, z) < 0.0015 ? 0 : inBeard(x, y, z) * (1 + 3 * clamp01(1 - Math.abs(x) / 0.03))), 51),
        // (he has no neck, and his chin is down inside his collar: in the middle the beard comes out over the top of it)
        ...scatter(data.jersey, 3000, (x, y, z) => (y > 0.168 && z > 0.04 && Math.abs(x) < 0.046 && L.head.dist(x, y, z) > 0.0006 ? 1 + 2 * clamp01((y - 0.168) / 0.02) : 0), 52),
      ], 59), {
        seed: 21, segments: 10, width: 0.00074, clump: 0.6, clumps: 150, frizz: 0.003, curl: [0.0022, 52], loft: 0.012,
        body: (x, y, z) => Math.min(L.head.dist(x, y, z), clothes(x, y, z)),
        shape: (p, n, rnd) => {
          const ax = Math.abs(p[0]), mid = 1 - clamp01(ax / 0.052);
          return {
            length: 0.04 + 0.036 * mid + rnd() * 0.02,
            dir: [n[0] * 0.75 + Math.sign(p[0]) * 0.12 * (1 - mid) + (rnd() - 0.5) * 0.7 * mid, -0.8, 0.45 * Math.max(n[2], 0) + 0.3 + 0.35 * mid],
            droop: 1.5, stiff: 0.25,
          };
        },
      }),
      // the moustache: two wings from under the nose, turned up at the ends
      tash: (data) => growStrands(scatter(data.head, 2600, (x, y, z) => (y > 0.1995 && y < 0.2135 && Math.abs(x) > 0.0008 && Math.abs(x) < 0.03 && z > 0.05 ? 1 : 0), 53), {
        seed: 23, segments: 8, width: 0.00078, clump: 0.82, clumps: 16, frizz: 0.0016, loft: 0.006,
        body: (x, y, z) => L.head.dist(x, y, z),
        shape: (p, n, rnd) => {
          const s = Math.sign(p[0]) || 1;
          return { length: 0.05 + rnd() * 0.022, dir: [s, -0.5, 0.42], droop: 0, stiff: 0.9, bend: [s * 0.25, 1.9, -0.45] };
        },
      }),
      // eyebrows: they have got out from under the hat, and are making for the open
      browL: brow(1), browR: brow(-1),
      // and what hair he has left: round the back, from ear to ear
      nape: (data) => growStrands(scatter(data.head, 3000, (x, y, z) => inHair(x, y, z), 57), {
        seed: 27, segments: 6, width: 0.00072, clump: 0.5, clumps: 90, frizz: 0.002, curl: [0.0018, 60], loft: 0.005,
        body: (x, y, z) => Math.min(L.head.dist(x, y, z), L.hat.within(x, y, z, 0.05) + 0.001, L.jersey.within(x, y, z, 0.05), L.jerseyRib.within(x, y, z, 0.05)),
        shape: (p, n, rnd) => ({ length: 0.03 + rnd() * 0.028, dir: [n[0] * 0.9, -0.7 - rnd() * 0.3, n[2] * 0.9], droop: 1.1, stiff: 0.3 }),
      }),
    },
  };
}
