// A lemming: what Gnorman hires out by the head to climb the mammoth and gnaw
// off what the elf has missed (see game/helpers.js). It is sculpted and baked
// the way the people are (bake.js), but there may be a hundred of them, so it
// is drawn many at once and has no bones to bend: a body, and a head that can
// nod on it. It stands on y = 0 and faces +z; five and a half centimetres from
// nose to rump, which is knee-high to an elf.
import { Sculpt } from './sculpt.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Where his head turns about (the back of the skull), and where his eyes are. */
export const NECK = [0, 0.0165, 0.0125];
export const EYES = [[0.0064, 0.0217, 0.0297], [-0.0064, 0.0217, 0.0297]], EYE_R = 0.0024;

const BONES = [{ name: 'body', parent: null, at: [0, 0.014, 0] }, { name: 'head', parent: 'body', at: NECK }];

function sculptLemming() {
  const body = [
    { type: 'ell', c: [0, 0.0152, -0.004], r: [0.0152, 0.0142, 0.0215], bone: 'body', k: 0 },
    { type: 'sph', c: [0, 0.0142, -0.0165], r: 0.0134, bone: 'body', k: 0.006 },                                        // the rump
    { type: 'sph', c: [0, 0.0152, 0.0105], r: 0.0124, bone: 'body', k: 0.006 },                                         // the shoulders
    { type: 'rc', a: [0, 0.012, -0.0265], b: [0, 0.0098, -0.0345], r1: 0.0027, r2: 0.0013, bone: 'body', k: 0.003 },    // what there is of a tail
  ];
  for (const s of [1, -1]) {
    body.push(
      { type: 'ell', c: [s * 0.0098, 0.0092, -0.0118], r: [0.0066, 0.0082, 0.0102], bone: 'body', k: 0.005 },           // a haunch
      { type: 'ell', c: [s * 0.0104, 0.0021, -0.0052], r: [0.0041, 0.0021, 0.0084], bone: 'body', k: 0.0022 },          // and the long foot under it
      { type: 'rc', a: [s * 0.0082, 0.0088, 0.0118], b: [s * 0.0084, 0.0029, 0.0148], r1: 0.0035, r2: 0.0029, bone: 'body', k: 0.003 },   // a foreleg
      { type: 'ell', c: [s * 0.0085, 0.0018, 0.0166], r: [0.0031, 0.0018, 0.0051], bone: 'body', k: 0.002 },            // and its paw
    );
  }
  const head = [
    { type: 'ell', c: [0, 0.0184, 0.0212], r: [0.0118, 0.0111, 0.0128], bone: 'head', k: 0 },
    { type: 'rc', a: [0, 0.0166, 0.0282], b: [0, 0.0153, 0.0362], r1: 0.0071, r2: 0.0046, bone: 'head', k: 0.005 },     // the muzzle
    { type: 'sph', c: [0, 0.0159, 0.0391], r: 0.0021, bone: 'head', k: 0.0014 },                                        // the nose on the end of it
  ];
  for (const s of [1, -1]) {
    head.push(
      { type: 'sph', c: [s * 0.0067, 0.0151, 0.0262], r: 0.0061, bone: 'head', k: 0.005 },                              // a cheek, full of something
      { type: 'leaf', a: [s * 0.0082, 0.0252, 0.0168], b: [s * 0.0112, 0.0312, 0.0152], r1: 0.0041, r2: 0.0035, t: 0.0017, t2: 0.0012, n: [s * -0.25, 0.2, 1], bone: 'head', k: 0.002 },   // an ear
    );
  }
  for (const [x, y, z] of EYES) head.push({ type: 'sph', c: [x, y, z + 0.0006], r: EYE_R + 0.0002, bone: 'head', k: 0.0008, cut: true });
  return { body: new Sculpt(body, { k: 0.004, eps: 0.0003 }), head: new Sculpt(head, { k: 0.004, eps: 0.0003 }) };
}

// His coat: tawny over the back and sides, with a dark saddle from the crown of his head to his shoulders, buff
// underneath and round the muzzle; and pink where there is no coat to speak of (feet, tail, nose, the insides of his ears).
const TAWNY = [0.34, 0.2, 0.085], DARK = [0.04, 0.028, 0.02], BUFF = [0.6, 0.5, 0.34], PINK = [0.7, 0.36, 0.3];
function coat(x, y, z, ny, out, head) {
  const ax = Math.abs(x);
  // how far up his side: 0 underneath, 1 on top
  const up = smooth(0.006, 0.019, y) * smooth(-0.5, 0.35, ny);
  // the saddle: dark on top, from between the ears back over the shoulders, and thinning out along the spine
  const saddle = smooth(0.0125, 0.0055, ax) * smooth(0.013, 0.02, y) * (head ? smooth(0.033, 0.025, z) : smooth(-0.03, 0.0, z) * 0.85 + 0.15);
  let r = BUFF[0] + (TAWNY[0] - BUFF[0]) * up, g = BUFF[1] + (TAWNY[1] - BUFF[1]) * up, b = BUFF[2] + (TAWNY[2] - BUFF[2]) * up;
  const d = saddle * up;
  r += (DARK[0] - r) * d; g += (DARK[1] - g) * d; b += (DARK[2] - b) * d;
  let bare = 0;
  if (head) {
    const muzzle = smooth(0.029, 0.036, z) * smooth(0.021, 0.016, y);
    r += (BUFF[0] - r) * muzzle; g += (BUFF[1] - g) * muzzle; b += (BUFF[2] - b) * muzzle;
    bare = Math.max(smooth(0.0372, 0.0388, z), smooth(0.0245, 0.0275, y) * smooth(0.0145, 0.0165, z) * smooth(0.006, 0.0085, ax) * 0.85);   // nose; ears
  } else {
    bare = Math.max(smooth(0.0052, 0.003, y), smooth(-0.0275, -0.0305, z));   // feet; tail
  }
  out[0] = r + (PINK[0] - r) * bare; out[1] = g + (PINK[1] - g) * bare; out[2] = b + (PINK[2] - b) * bare; out[3] = 1;
}

export function lemmingRecipe() {
  return {
    bones: BONES, layers: sculptLemming(), cells: { body: 0.0017, head: 0.0015 }, skin: [], thin: 0.004, weightRadius: 0.004,
    paint: {
      body: (x, y, z, nx, ny, nz, out) => coat(x, y, z, ny, out, false),
      head: (x, y, z, nx, ny, nz, out) => coat(x, y, z, ny, out, true),
    },
  };
}
