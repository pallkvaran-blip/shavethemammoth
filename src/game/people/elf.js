// The elf: the legend himself, and the one the player is. Twenty centimetres
// of him to the top of the head, most of it head; ears like the wings of a
// small aircraft, a nose that arrives before he does, one tooth, a pot belly
// his jumper has given up covering, striped stockings, curly boots with bells
// on, and a hat a good deal taller than its owner thinks it is.
//
// He is sculpted, not assembled (see sculpt.js): skin, and each thing he has
// on, is a blend of soft solids meshed fine when the game starts and hung on
// one set of bones, so that he bends where he bends. His clothes are knitted
// stitch by stitch in their materials; his hair, his eyebrows and the bobble
// on his hat are hair (see locks.js).
//
// Built facing +z, standing at the origin, with the eyes 17 cm up (where the
// camera is when the player looks out of them). He can stand about, hold a
// thing up over his head in one hand or two, strain under it, be shaken by
// it, be disappointed in it, and walk on the spot.
import * as THREE from 'three';
import { Sculpt, meshLayer, makeRig, layerMesh, scatter } from './sculpt.js';
import { folkMaterial } from './materials.js';
import { growLocks } from './locks.js';
import { makeDepthMaterial } from '../../gfx/shadows.js';
import { LAYER_SHADOW_NEAR } from '../../gfx/globals.js';

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const near = (x, y, z, c, r) => { const d = Math.hypot(x - c[0], y - c[1], z - c[2]) / r; return d >= 1 ? 0 : (1 - d * d) * (1 - d * d); };

// how far out from straight down his arms hang when he is sculpted (so that sleeves are not stuck to his sides)
const ARM = (48 * Math.PI) / 180;
const SH = [0.04, 0.119, 0], UPPER = 0.043, FORE = 0.04, HAND = 0.011;
const armPoint = (s, d) => [s * (SH[0] + Math.sin(ARM) * d), SH[1] - Math.cos(ARM) * d, 0];
const EYE = [0.0172, 0.1845, 0.0302], EYE_R = [0.012, 0.0106];       // (his left eye is the bigger)
// (the hat flops over to his right: his left hand is the one that holds things up, and they are not to be hidden by it)
const HAT = [[0, 0.197, -0.007], [-0.005, 0.245, -0.017], [-0.028, 0.281, -0.023], [-0.062, 0.297, -0.027]];
const CURL = (() => {
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

export function buildElf({ bare = false } = {}) {
  const rig = makeRig(BONES);
  const B = rig.bones;
  const L = sculptElf();
  const all = Object.values(L);
  const everything = (x, y, z) => { let d = 0.04; for (const l of all) { const v = l.within(x, y, z, 0.04); if (v < d) d = v; } return d; };
  const clothes = all.filter((l) => l !== L.head && l !== L.belly);
  const covered = (x, y, z) => { let d = 0.01; for (const l of clothes) { const v = l.within(x, y, z, 0.01); if (v < d) d = v; } return d; };

  const skin = folkMaterial('skin', { color: 0xe6bca8, a: [1, 1, 1, 0.5], roughness: 0.48, clearcoat: 0.1, clearcoatRoughness: 0.45 });
  const mustard = { color: 0xc8962a, sheen: 0.7, sheenRoughness: 0.55, sheenColor: 0xf0cf7a };
  const M = {
    head: skin, belly: skin,
    jumper: folkMaterial('knit', { ...mustard, a: [0.0025, 0.0019, 0, 0] }),
    jumperRib: folkMaterial('knit', { ...mustard, color: 0xb98722, a: [0.0019, 0.0016, 0, 0], b: [2, 0, 0, 0] }),
    shorts: folkMaterial('cloth', { color: 0x3c6a37, a: [0.0011, 0.55, 3.2, 0], sheen: 0.5, sheenRoughness: 0.6, sheenColor: 0x9fc48f }),
    stockings: folkMaterial('knit', { color: 0x6a3da3, second: 0xefe6d2, a: [0.0017, 0.0014, 6, 0.5], b: [2, 0, 0, 0], sheen: 0.5, sheenRoughness: 0.6, sheenColor: 0xc9b3ee }),
    boots: folkMaterial('leather', { color: 0x6a3d1c, a: [0.00075, 0.22, 0.8, 0], roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    mittens: folkMaterial('knit', { color: 0xb2241c, a: [0.0019, 0.0015, 0, 0], sheen: 0.7, sheenRoughness: 0.55, sheenColor: 0xff8f7a }),
    scarf: folkMaterial('knit', { color: 0x1c8782, a: [0.0023, 0.0018, 0, 0], b: [2, 0, 0, 0], sheen: 0.7, sheenRoughness: 0.55, sheenColor: 0x7fe0d8 }),
    hat: folkMaterial('knit', { color: 0xd8601b, second: 0xf1e3c6, a: [0.0025, 0.0019, 8, 0.5], sheen: 0.7, sheenRoughness: 0.55, sheenColor: 0xffc08a }),
    hatRib: folkMaterial('knit', { color: 0xf1e3c6, a: [0.0021, 0.0017, 0, 0], b: [2, 0, 0, 0], sheen: 0.6, sheenRoughness: 0.6, sheenColor: 0xffffff }),
    bobble: folkMaterial('felt', { color: 0xf1e3c6, a: [0.0007, 1, 0, 0], sheen: 0.8, sheenRoughness: 0.6 }),
  };
  const CELL = { head: 0.0011, belly: 0.0016, jumper: 0.0015, jumperRib: 0.0013, shorts: 0.0016, stockings: 0.0013, boots: 0.0011, mittens: 0.0013, scarf: 0.0014, hat: 0.0016, hatRib: 0.0014, bobble: 0.0016 };

  const group = new THREE.Group();
  group.name = 'elf';
  group.add(rig.root);
  const meshes = [], data = {};
  for (const [name, layer] of Object.entries(L)) {
    const isSkin = name === 'head' || name === 'belly';
    data[name] = meshLayer(layer, { cell: CELL[name], rig, occluder: everything, buried: isSkin ? covered : null, paint: isSkin ? paintSkin : null, thin: 0.007 });
    const mesh = layerMesh(data[name], M[name], rig, name);
    mesh.layers.enable(LAYER_SHADOW_NEAR);
    group.add(mesh);
    meshes.push(mesh);
  }

  // ---- things that are simply made and hung on a bone: eyes, lids, a tooth, bells ----
  const depth = makeDepthMaterial();
  const hang = (bone, mesh, at) => {
    const r = rig.rest[bone];
    mesh.position.set(at[0] - r.x, at[1] - r.y, at[2] - r.z);
    mesh.userData.shadowMaterial = depth;
    mesh.layers.enable(LAYER_SHADOW_NEAR);
    mesh.frustumCulled = false;
    B[bone].add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const eyeMat = folkMaterial('eye', { sculpted: false, color: 0xf3efe6, second: 0x5d7d3a, a: [0.66, 0.3, 0, 0], roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const lidMat = folkMaterial('skin', { sculpted: false, color: 0xcf9c88, a: [0, 0.6, 0.35, 0], roughness: 0.5 });
  const eyes = [1, -1].map((s, i) => {
    const r = EYE_R[i];
    const ball = hang('head', new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), eyeMat), [s * EYE[0], EYE[1], EYE[2]]);
    ball.geometry.rotateX(Math.PI / 2);                                         // (a sphere's poles are up and down; an eye's are front and back)
    ball.rotation.y = -s * 0.1;                                                 // not quite agreed on where to look
    // the upper lid: a cap that comes down over the top of the eye
    const lid = hang('head', new THREE.Mesh(new THREE.SphereGeometry(r + 0.0007, 32, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), lidMat), [s * EYE[0], EYE[1], EYE[2]]);
    const under = hang('head', new THREE.Mesh(new THREE.SphereGeometry(r + 0.0006, 32, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), lidMat), [s * EYE[0], EYE[1], EYE[2]]);
    under.rotation.x = -(Math.PI - 0.62);
    return { ball, lid, side: s, r };
  });
  const tooth = hang('head', new THREE.Mesh(new THREE.BoxGeometry(0.0074, 0.0092, 0.0036, 3, 3, 2), folkMaterial('plain', { sculpted: false, color: 0xf2ecd9, a: [0.004, 0.2, 0, 0], roughness: 0.3, clearcoat: 0.6 })), [0.0018, 0.1428, 0.0438]);
  {
    // (round its corners off)
    const p = tooth.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const k = 1 - 0.18 * (Math.abs(v.x / 0.0037) ** 2 * Math.abs(v.y / 0.0046) ** 2); p.setXYZ(i, v.x * k, v.y * k, v.z * k); }
    tooth.geometry.computeVertexNormals();
  }
  const brass = folkMaterial('plain', { sculpted: false, color: 0xd9ae3d, a: [0.002, 0.3, 0, 0], roughness: 0.28, metalness: 1 });
  for (const s of [1, -1]) {
    const tip = CURL[CURL.length - 1];
    hang(s > 0 ? 'legL' : 'legR', new THREE.Mesh(new THREE.SphereGeometry(0.0046, 20, 14), brass), [s * 0.021, tip[1] - 0.001, tip[2] - 0.0005]);
  }
  // (a pack goes on his back)
  const back = new THREE.Group();
  back.position.set(0, 0.102 - rig.rest.torso.y, -0.037);
  B.torso.add(back);

  // ---- hair: what shows under the hat, the eyebrows, the bobble, the fringe of the scarf ----
  const brows = [];
  if (!bare) {
    const ginger = { root: 0x5a2208, tip: 0xd2702a, shine: 0xffd9a0 };
    const scalp = scatter(data.head, 5600, (x, y, z, nx, ny, nz) => {
      // round the back and the sides, below the brim of the hat; and a tuft in the middle of the forehead
      if (y < 0.16 || y > 0.2 || ny < -0.5) return 0;
      const ax = Math.abs(x);
      if (z > 0.034 && ax < 0.012 && y > 0.1945) return 1;
      if (z > 0.021 || ax > 0.047) return 0;
      return clamp01((y - 0.16) / 0.014) * (z < 0 ? 1 : 0.85);
    }, 11);
    const hair = growLocks(scalp, {
      seed: 3, segments: 7, width: 0.00042, colour: ginger, clump: 0.55, clumps: 260, frizz: 0.0018, curl: [0.0012, 380], dense: 5,
      body: (x, y, z) => Math.min(L.head.dist(x, y, z), L.hat.dist(x, y, z) + 0.0012, L.hatRib.dist(x, y, z) + 0.0008, L.scarf.dist(x, y, z), L.jumper.dist(x, y, z)),
      shape: (p, n, rnd) => {
        if (p[2] > 0.03) return { length: 0.007 + rnd() * 0.008, dir: [0.9 + rnd() * 0.5, -0.25 - rnd() * 0.3, 0.55], droop: 0.5, stiff: 0.6 };   // the tuft: swept to one side
        const side = Math.abs(p[0]) > 0.03;
        // out from under the hat like straw from a scarecrow, then down
        return side
          ? { length: 0.013 + rnd() * 0.014, dir: [Math.sign(p[0]) * 1.2, -0.15 - rnd() * 0.5, -0.45 + n[2] * 0.5], droop: 0.9, stiff: 0.45 }
          : { length: 0.016 + rnd() * 0.02, dir: [n[0] * 0.9, -0.55 - rnd() * 0.3, n[2] * 1.1], droop: 1.2, stiff: 0.3 };
      },
    });
    hair.mesh.position.sub(rig.rest.head);
    B.head.add(hair.mesh);
    meshes.push(hair.mesh);
    // eyebrows: thick, and a law unto themselves. They stick out from under the brim of his hat
    for (const s of [1, -1]) {
      const i = s > 0 ? 0 : 1, c = [s * EYE[0], EYE[1] + EYE_R[i] + 0.0012, EYE[2] + 0.0105];
      const roots = scatter(data.head, 620, (x, y, z) => {
        const u = (x - c[0]) * s;                  // along the brow, outwards
        return Math.abs(u) < 0.0125 && Math.abs(y - c[1] + u * 0.1) < 0.0024 && z > 0.03 ? 1 : 0;
      }, 21 + i);
      const brow = growLocks(roots, {
        seed: 5 + i, segments: 4, width: 0.0004, colour: ginger, clump: 0.25, clumps: 40, frizz: 0.0006, flex: 0.004,
        body: (x, y, z) => Math.min(L.head.dist(x, y, z), L.hatRib.dist(x, y, z) + 0.0005),
        shape: (p, n, rnd) => ({ length: 0.0038 + rnd() * 0.0036, dir: [s * (0.9 + rnd() * 0.4), 0.15 + rnd() * 0.35, 0.75], droop: 0.1, stiff: 0.95 }),
      });
      const pivot = new THREE.Group();
      pivot.position.set(c[0] - rig.rest.head.x, c[1] - rig.rest.head.y, c[2] - rig.rest.head.z);
      brow.mesh.position.set(-c[0], -c[1], -c[2]);
      pivot.add(brow.mesh);
      B.head.add(pivot);
      meshes.push(brow.mesh);
      brows.push({ pivot, side: s, y: pivot.position.y });
    }
    // the bobble: yarn ends standing out in every direction
    const tuft = scatter(data.bobble, 2600, () => 1, 31);
    const bobble = growLocks(tuft, {
      seed: 9, segments: 4, width: 0.0006, colour: { root: 0xa89a7c, tip: 0xfaf1dc, shine: 0xffffff }, clump: 0.35, clumps: 300, frizz: 0.0016, dense: 5,
      shape: (p, n, rnd) => ({ length: 0.007 + rnd() * 0.004, dir: [n[0], n[1], n[2]], droop: 0.15, stiff: 0.8 }),
    });
    bobble.mesh.position.sub(rig.rest.hat3);
    B.hat3.add(bobble.mesh);
    meshes.push(bobble.mesh);
    // the scarf ends in tassels
    const hemline = scatter(data.scarf, 700, (x, y, z) => (y < 0.0855 && x < -0.008 ? 1 : 0), 41);
    const fringe = growLocks(hemline, {
      seed: 13, segments: 4, width: 0.0006, colour: { root: 0x0f5550, tip: 0x2aa39c, shine: 0xb8fff8 }, clump: 0.85, clumps: 9, frizz: 0.0007,
      shape: (p, n, rnd) => ({ length: 0.009 + rnd() * 0.003, dir: [n[0] * 0.2, -1, n[2] * 0.2 + 0.1], droop: 0.6, stiff: 0.5 }),
    });
    fringe.mesh.position.sub(rig.rest.tail);
    B.tail.add(fringe.mesh);
    meshes.push(fringe.mesh);
  }

  // ---- how he holds himself ----
  // every pose is a set of angles; he eases from the one he is in towards the one asked for
  const pose = { lift: 0, two: 0, strain: 0, buzz: 0, sad: 0, proud: 0, walk: 0, carry: 0, lookYaw: 0, lookPitch: 0 };
  const want = { ...pose };
  let blinkIn = 2.4, blink = 0, step = 0, twitch = 0, twitchIn = 3.1;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const rest = (name) => rig.rest[name];
  const home = {};
  for (const b of rig.list) home[b.name] = b.position.clone();
  const blushBase = new THREE.Color(0xe6bca8);

  const apply = (t) => {
    const lift = smooth(clamp01(pose.lift)), two = pose.two, strain = pose.strain, buzz = pose.buzz, sad = pose.sad, proud = pose.proud;
    const shake = strain * Math.sin(t * 31) + buzz * Math.sin(t * 173);
    // knees: he sinks under a weight, rises on his toes when pleased with himself
    const sink = strain * (0.012 + 0.003 * Math.sin(t * 23)) - proud * lift * 0.004;
    B.hips.position.set(home.hips.x + buzz * 0.0012 * Math.sin(t * 191), home.hips.y - sink + buzz * 0.001 * Math.sin(t * 157), home.hips.z + buzz * 0.0012 * Math.sin(t * 211));
    B.hips.rotation.z = strain * 0.05 * Math.sin(t * 2.3) + shake * 0.006;
    const stride = pose.walk * Math.sin(step);
    for (const [name, s] of [['legL', 1], ['legR', -1]]) {
      const leg = B[name];
      leg.rotation.x = -s * stride * 0.7;
      // (the hips came down; the feet stay on the snow, so the legs splay)
      leg.rotation.z = s * (strain * 0.5 + 0.02) + strain * 0.08 * Math.sin(t * 27 + s);
      leg.position.y = home[name].y + sink * 0.25;
      leg.scale.y = 1 - sink * 9;
    }
    // the middle
    B.torso.rotation.x = -0.06 * proud * lift + 0.12 * sad + strain * 0.05 * Math.sin(t * 3.1) + pose.walk * 0.06;
    B.torso.rotation.z = strain * 0.04 * Math.sin(t * 2.3 + 1);
    const breath = 1 + 0.012 * Math.sin(t * 2.1) + strain * 0.02 * Math.sin(t * 9);
    B.torso.scale.set(breath, 1, breath);
    B.tail.rotation.z = 0.1 * Math.sin(t * 3.3) + 0.05 * Math.sin(t * 7.1);
    B.tail.rotation.x = -0.12 + 0.1 * Math.sin(t * 2.7);
    // the head
    B.head.scale.set(1 / breath, 1, 1 / breath);
    B.head.rotation.y = pose.lookYaw;
    B.head.rotation.x = -pose.lookPitch - 0.18 * proud * lift + 0.3 * sad + shake * 0.01;
    B.head.rotation.z = 0.06 * Math.sin(t * 0.9) * (1 - strain) + 0.16 * sad + shake * 0.012;
    for (const [name, s] of [['earL', 1], ['earR', -1]]) {
      const up = 0.12 * proud * lift - 0.85 * sad - 0.25 * strain + 0.08 * Math.sin(t * 1.7 + s) + twitch * 0.35 * (s > 0 ? 1 : 0.4) + buzz * 0.25 * Math.sin(t * 61 + s);
      B[name].rotation.z = s * up;
      B[name].rotation.y = s * (0.3 * sad);
    }
    B.hat1.rotation.z = 0.05 * Math.sin(t * 1.9) + shake * 0.03;
    B.hat2.rotation.z = 0.12 * Math.sin(t * 2.3 + 1) + 0.3 * sad + shake * 0.06;
    B.hat3.rotation.z = 0.2 * Math.sin(t * 2.9 + 2) + 0.3 * sad + shake * 0.1;
    // the face: the corners of the mouth go up for a grin and down for the other thing; the jaw drops under a weight
    const grin = 0.35 + 0.65 * proud * lift - 1.5 * sad - 1.1 * strain;
    for (const [name, s] of [['cornerL', 1], ['cornerR', -1]]) {
      B[name].position.set(home[name].x + s * 0.0012 * Math.max(0, grin) + s * 0.001 * strain, home[name].y + 0.0034 * grin, home[name].z - 0.001 * Math.abs(grin));
    }
    B.jaw.rotation.x = 0.1 * strain + 0.05 * proud * lift + buzz * 0.05 * Math.sin(t * 97);
    tooth.position.y = 0.1428 - rest('head').y - 0.0006 * strain + buzz * 0.0012 * Math.sin(t * 97);
    for (const e of eyes) {
      // lids: down for a blink, half way for effort or gloom
      const shut = blink > 0 ? 1 : Math.max(0.3, 0.55 * sad, 0.75 * strain);
      e.lid.rotation.x = -0.92 + 1.1 * shut;
      e.ball.rotation.x = 0.25 * sad - 0.12 * proud * lift;
      e.ball.scale.setScalar(1 + 0.03 * strain);
    }
    for (const b of brows) {
      b.pivot.rotation.z = b.side * (0.34 * sad - 0.32 * strain + 0.1 * proud * lift);
      b.pivot.position.y = b.y + 0.0022 * proud * lift - 0.0016 * strain + 0.0012 * sad;
    }
    // he goes red in the face
    skin.color.copy(blushBase).multiply(_c.setRGB(1 + 0.06 * strain, 1 - 0.2 * strain, 1 - 0.22 * strain));
    // the arms
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const shoulder = B['arm' + side], elbow = B['fore' + side], hand = B['hand' + side];
      const lifting = s > 0 || two > 0.5;           // the one hand always; the other only when it takes two
      const swing = s * stride * 0.6;
      const tremble = strain * 0.05 * Math.sin(t * 29 + s * 2) + buzz * 0.03 * Math.sin(t * 181 + s);
      let out, fwd = 0, bendZ = 0, bendX = 0, wrist = 0;
      if (lifting) {
        // up from the side to over the head: straight up for one hand, a little apart for two
        const top = Math.PI - (two > 0.5 ? 0.3 : 0.1);
        const down = 0.28 + pose.carry * 0.25;
        const bend = strain * (0.5 + 0.1 * Math.sin(t * 2.3));          // the elbows give under a weight
        out = down + (top - down) * lift - bend * 0.35;
        fwd = -pose.carry * (1 - lift) * 0.9 + swing * (1 - lift) - 0.12 * lift * (two > 0.5 ? 0 : 1);
        bendZ = -bend * 0.9 - 0.25 * (1 - lift) * pose.carry;
        bendX = -pose.carry * (1 - lift) * 0.8;
        wrist = bend * 0.5;
      } else {
        // the other fist goes on the hip when the first goes up
        out = 0.28 + 0.5 * lift * (1 - sad);
        fwd = swing * (1 - lift);
        bendZ = -1.5 * lift * (1 - sad);
      }
      shoulder.rotation.set(fwd, 0, s * (out - ARM) + tremble);
      elbow.rotation.set(bendX, 0, s * bendZ);
      hand.rotation.z = s * wrist;
    }
    group.updateMatrixWorld(true);
  };
  const _c = new THREE.Color();

  return {
    group, meshes, height: 0.2, eye: 0.17, back,
    want, pose, rig, layers: L, data, materials: M,
    /** Where a hand is (world): 'R', 'L', or 'both' for the point midway between them. ('R' is the one he lifts things with.) */
    hand(which, out = _v) {
      if (which === 'both') return B.handL.getWorldPosition(out).add(B.handR.getWorldPosition(_w)).multiplyScalar(0.5);
      return B[which === 'L' ? 'handR' : 'handL'].getWorldPosition(out);
    },
    /** Jump straight to the pose asked for (no easing). */
    settle() { Object.assign(pose, want); apply(0); },
    update(dt, t) {
      // ease towards what is asked (quickly for a shake or a lift, slowly for a mood)
      const k = (rate) => Math.min(1, dt * rate);
      pose.lift += (want.lift - pose.lift) * k(want.lift > pose.lift ? 9 : 5);
      pose.two = want.two;
      pose.strain += (want.strain - pose.strain) * k(4);
      pose.buzz += (want.buzz - pose.buzz) * k(10);
      pose.sad += (want.sad - pose.sad) * k(3);
      pose.proud += (want.proud - pose.proud) * k(4);
      pose.walk += (want.walk - pose.walk) * k(8);
      pose.carry += (want.carry - pose.carry) * k(8);
      pose.lookYaw += (want.lookYaw - pose.lookYaw) * k(5);
      pose.lookPitch += (want.lookPitch - pose.lookPitch) * k(5);
      step += dt * 9 * pose.walk;
      blinkIn -= dt;
      if (blinkIn <= 0) { blink = 0.11; blinkIn = 1.8 + Math.random() * 3.5; }
      blink = Math.max(0, blink - dt);
      twitchIn -= dt;
      if (twitchIn <= 0) { twitch = 1; twitchIn = 2.5 + Math.random() * 4; }
      twitch = Math.max(0, twitch - dt * 5);
      apply(t);
    },
  };
}
