// The woolly mammoth, described in metres. +X is forward (towards the trunk),
// +Y is up, Z is sideways. A big bull: about 3.2 m at the head and shoulder.
//
// Every primitive belongs to a bone and carries grooming data:
//   len   hair length in metres (lenB = length at the far end of a round cone)
//   lift  how far the hair stands off the skin (0 = lies flat, 1 = stands up)
//   tone  -1..1 darker/lighter than the base coat
//   red   0..1 extra ginger in the coat
//   clump lock size multiplier
//   comb  0..1 how strongly the hair is combed along the limb (round cones only)

const fur = (len, extra = {}) => ({ len, ...extra });

function mirror(list) {
  // duplicate primitives across the Z axis; bone names get _R / _L
  const out = [];
  for (const p of list) {
    for (const s of [1, -1]) {
      const q = { ...p, name: (p.name || '') + (s > 0 ? '_R' : '_L') };
      if (p.bone && p.sided) q.bone = p.bone + (s > 0 ? '_R' : '_L');
      if (p.c) q.c = [p.c[0], p.c[1], p.c[2] * s];
      if (p.a) q.a = [p.a[0], p.a[1], p.a[2] * s];
      if (p.b) q.b = [p.b[0], p.b[1], p.b[2] * s];
      if (p.rot) q.rot = [p.rot[0] * s, p.rot[1] * s, p.rot[2]];
      out.push(q);
    }
  }
  return out;
}

export const TRUNK_POINTS = [
  // centreline of the trunk, from the face down to the curled tip: [x, y, radius]
  [2.47, 2.04, 0.275],
  [2.66, 1.66, 0.238],
  [2.77, 1.26, 0.202],
  [2.81, 0.88, 0.170],
  [2.79, 0.56, 0.142],
  [2.71, 0.33, 0.118],
  [2.58, 0.21, 0.098],
  [2.45, 0.22, 0.082],
  [2.37, 0.31, 0.068],
];

export function buildAnatomy() {
  const prims = [];

  // ---- torso -------------------------------------------------------------
  prims.push(
    { name: 'barrel', type: 'ell', c: [0.12, 2.02, 0], r: [1.45, 0.80, 0.90], rot: [0, 0, 7], k: 0.4, bone: 'spine', fur: fur(0.52, { lift: 0.3, clump: 1.2 }) },
    { name: 'hump', type: 'ell', c: [0.78, 2.52, 0], r: [0.64, 0.56, 0.52], rot: [0, 0, -8], k: 0.42, bone: 'spine', fur: fur(0.44, { lift: 0.42, tone: 0.2, red: 0.45 }) },
    { name: 'neck', type: 'ell', c: [1.36, 2.20, 0], r: [0.52, 0.56, 0.54], k: 0.36, bone: 'neck', fur: fur(0.46, { lift: 0.4, tone: 0.1, red: 0.3 }) },
    { name: 'pelvis', type: 'ell', c: [-1.18, 1.90, 0], r: [0.88, 0.72, 0.80], rot: [0, 0, 14], k: 0.42, bone: 'spine', fur: fur(0.48, { lift: 0.3 }) },
    { name: 'rump', type: 'sph', c: [-1.74, 1.76, 0], r: 0.50, k: 0.36, bone: 'spine', fur: fur(0.42, { lift: 0.3 }) },
    { name: 'belly', type: 'ell', c: [-0.12, 1.80, 0], r: [1.32, 0.55, 0.84], k: 0.38, bone: 'spine', fur: fur(0.78, { lift: 0.15, tone: -0.25, clump: 1.5 }) },
    { name: 'chest', type: 'ell', c: [1.10, 1.80, 0], r: [0.56, 0.62, 0.66], k: 0.34, bone: 'spine', fur: fur(0.66, { lift: 0.25, tone: -0.15, clump: 1.4 }) },
  );

  // ---- head --------------------------------------------------------------
  prims.push(
    { name: 'skull', type: 'ell', c: [1.98, 2.42, 0], r: [0.47, 0.60, 0.46], rot: [0, 0, -14], k: 0.3, bone: 'head', fur: fur(0.26, { lift: 0.4, tone: 0.05 }) },
    { name: 'dome', type: 'sph', c: [1.93, 2.85, 0], r: 0.335, k: 0.3, bone: 'head', fur: fur(0.40, { lift: 0.62, tone: 0.25, red: 0.5 }) },
    { name: 'face', type: 'rc', a: [2.22, 2.56, 0], b: [2.46, 2.04, 0], r1: 0.35, r2: 0.285, k: 0.22, bone: 'head', fur: fur(0.11, { lenB: 0.07, lift: 0.3, tone: -0.08 }) },
    { name: 'jaw', type: 'rc', a: [1.88, 1.99, 0], b: [2.25, 1.67, 0], r1: 0.34, r2: 0.13, k: 0.22, bone: 'head', fur: fur(0.50, { lenB: 0.34, lift: 0.2, tone: -0.2, clump: 1.3 }) },
  );
  prims.push(...mirror([
    { name: 'socket', type: 'rc', a: [2.18, 2.23, 0.255], b: [2.45, 1.77, 0.30], r1: 0.21, r2: 0.138, k: 0.16, bone: 'head', fur: fur(0.10, { lenB: 0.05, lift: 0.3, tone: -0.1 }) },
    { name: 'brow', type: 'sph', c: [2.23, 2.48, 0.345], r: 0.135, k: 0.14, bone: 'head', fur: fur(0.07, { lift: 0.3, tone: -0.1 }) },
    { name: 'cheek', type: 'sph', c: [2.02, 2.20, 0.32], r: 0.26, k: 0.22, bone: 'head', fur: fur(0.32, { lift: 0.3 }) },
  ]));

  // ---- trunk -------------------------------------------------------------
  for (let i = 0; i < TRUNK_POINTS.length - 1; i++) {
    const [x0, y0, r0] = TRUNK_POINTS[i];
    const [x1, y1, r1] = TRUNK_POINTS[i + 1];
    const t0 = i / (TRUNK_POINTS.length - 1), t1 = (i + 1) / (TRUNK_POINTS.length - 1);
    prims.push({
      name: 'trunk' + i, type: 'rc', a: [x0, y0, 0], b: [x1, y1, 0], r1: r0, r2: r1, k: i === 0 ? 0.16 : 0.07,
      bone: 'trunk' + i,
      fur: fur(0.085 - 0.06 * t0, { lenB: 0.085 - 0.06 * t1, lift: 0.1, tone: -0.15, comb: 1 }),
    });
  }

  // ---- ears, tail --------------------------------------------------------
  prims.push(...mirror([
    { name: 'ear', type: 'ell', c: [1.69, 2.52, 0.50], r: [0.185, 0.25, 0.05], rot: [10, -28, -12], k: 0.07, bone: 'ear', sided: true, fur: fur(0.15, { lift: 0.35 }) },
  ]));
  prims.push(
    { name: 'tail0', type: 'rc', a: [-2.02, 1.93, 0], b: [-2.27, 1.52, 0], r1: 0.105, r2: 0.062, k: 0.12, bone: 'tail0', fur: fur(0.26, { lenB: 0.34, lift: 0.2, tone: -0.2 }) },
    { name: 'tail1', type: 'rc', a: [-2.27, 1.52, 0], b: [-2.31, 1.10, 0], r1: 0.062, r2: 0.04, k: 0.05, bone: 'tail1', fur: fur(0.34, { lenB: 0.5, lift: 0.15, tone: -0.3 }) },
  );

  // ---- legs --------------------------------------------------------------
  const legFur = { lift: 0.25, tone: -0.2 };
  prims.push(...mirror([
    // front
    { name: 'shoulder', type: 'ell', c: [0.98, 1.90, 0.52], r: [0.45, 0.62, 0.36], k: 0.3, bone: 'spine', fur: fur(0.58, { lift: 0.3, tone: -0.05, clump: 1.3 }) },
    { name: 'foreUpper', type: 'rc', a: [0.98, 1.65, 0.56], b: [0.94, 1.05, 0.57], r1: 0.31, r2: 0.245, k: 0.22, bone: 'foreUpper', sided: true, fur: fur(0.5, { lenB: 0.32, ...legFur, clump: 1.2 }) },
    { name: 'foreLower', type: 'rc', a: [0.94, 1.05, 0.57], b: [0.98, 0.42, 0.57], r1: 0.245, r2: 0.205, k: 0.1, bone: 'foreLower', sided: true, fur: fur(0.26, { lenB: 0.16, ...legFur }) },
    { name: 'foreFoot', type: 'rc', a: [0.98, 0.42, 0.57], b: [1.02, 0.15, 0.57], r1: 0.205, r2: 0.258, k: 0.08, bone: 'foreFoot', sided: true, fur: fur(0.14, { lenB: 0.085, ...legFur }) },
    // hind
    { name: 'thigh', type: 'ell', c: [-1.28, 1.56, 0.50], r: [0.52, 0.68, 0.38], rot: [0, 0, 8], k: 0.3, bone: 'spine', fur: fur(0.55, { lift: 0.3, tone: -0.1, clump: 1.3 }) },
    { name: 'hindUpper', type: 'rc', a: [-1.22, 1.40, 0.53], b: [-1.08, 0.95, 0.54], r1: 0.34, r2: 0.25, k: 0.22, bone: 'hindUpper', sided: true, fur: fur(0.46, { lenB: 0.30, ...legFur, clump: 1.2 }) },
    { name: 'hindLower', type: 'rc', a: [-1.08, 0.95, 0.54], b: [-1.26, 0.42, 0.54], r1: 0.25, r2: 0.20, k: 0.1, bone: 'hindLower', sided: true, fur: fur(0.25, { lenB: 0.16, ...legFur }) },
    { name: 'hindFoot', type: 'rc', a: [-1.26, 0.42, 0.54], b: [-1.22, 0.15, 0.54], r1: 0.20, r2: 0.248, k: 0.08, bone: 'hindFoot', sided: true, fur: fur(0.14, { lenB: 0.085, ...legFur }) },
  ]));

  // ---- skeleton ----------------------------------------------------------
  const bones = [
    { name: 'root', parent: null, pos: [0, 0, 0] },
    { name: 'spine', parent: 'root', pos: [0, 2.0, 0] },
    { name: 'neck', parent: 'spine', pos: [1.25, 2.25, 0] },
    { name: 'head', parent: 'neck', pos: [1.62, 2.38, 0] },
    { name: 'ear_R', parent: 'head', pos: [1.80, 2.56, 0.44] },
    { name: 'ear_L', parent: 'head', pos: [1.80, 2.56, -0.44] },
    { name: 'tail0', parent: 'spine', pos: [-2.02, 1.93, 0] },
    { name: 'tail1', parent: 'tail0', pos: [-2.27, 1.52, 0] },
  ];
  for (let i = 0; i < TRUNK_POINTS.length - 1; i++) {
    bones.push({ name: 'trunk' + i, parent: i === 0 ? 'head' : 'trunk' + (i - 1), pos: [TRUNK_POINTS[i][0], TRUNK_POINTS[i][1], 0] });
  }
  for (const [s, sz] of [['_R', 1], ['_L', -1]]) {
    bones.push(
      { name: 'foreUpper' + s, parent: 'spine', pos: [0.98, 1.70, 0.56 * sz] },
      { name: 'foreLower' + s, parent: 'foreUpper' + s, pos: [0.94, 1.05, 0.57 * sz] },
      { name: 'foreFoot' + s, parent: 'foreLower' + s, pos: [0.98, 0.42, 0.57 * sz] },
      { name: 'hindUpper' + s, parent: 'spine', pos: [-1.22, 1.45, 0.53 * sz] },
      { name: 'hindLower' + s, parent: 'hindUpper' + s, pos: [-1.08, 0.95, 0.54 * sz] },
      { name: 'hindFoot' + s, parent: 'hindLower' + s, pos: [-1.26, 0.42, 0.54 * sz] },
    );
  }

  // ---- tusks: centreline control points for the right side (mirrored) ------
  const tusk = {
    points: [
      [2.26, 2.06, 0.262],
      [2.44, 1.70, 0.315],
      [2.72, 1.24, 0.47],
      [3.16, 0.90, 0.74],
      [3.72, 0.86, 0.98],
      [4.22, 1.16, 0.99],
      [4.50, 1.68, 0.76],
      [4.46, 2.18, 0.44],
      [4.24, 2.50, 0.20],
    ],
    baseRadius: 0.088,
  };

  const eye = { pos: [2.285, 2.385, 0.47], radius: 0.031 };

  const feet = [
    { c: [1.02, 0, 0.57], r: 0.258 },
    { c: [1.02, 0, -0.57], r: 0.258 },
    { c: [-1.22, 0, 0.54], r: 0.248 },
    { c: [-1.22, 0, -0.54], r: 0.248 },
  ];

  const bounds = { min: [-2.75, -0.06, -1.3], max: [3.2, 3.45, 1.3] };

  return { prims, bones, tusk, eye, feet, bounds };
}
