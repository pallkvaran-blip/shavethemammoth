// Gnorman again, from a cast (cast.js): sculpted elsewhere, from a picture of
// the Gnorman in gnome.js drawn over at a far higher finish. He is the same
// gnome, in the same hat, and does the same things at the same moments; what
// is new is how much there is to look at on him.
//
// The cast brings his body and everything on it in one piece, with pictures
// for its colour and its creases. What it cannot bring is put on him here, as
// it is on the others: eyes that are balls with lids that shut, the fan on his
// hat, and his beard, moustache, eyebrows and what hair he has as hair. The
// cast has all four of those too, but as a lump painted to look like hair:
// they stay, as the mass of it, and real strands grow out of them.
//
// Facing +z, standing at the origin, the size the other Gnorman is.
import * as THREE from 'three';
import { buildFigure } from './figure.js';
import { castMaterial, folkMaterial } from './materials.js';
import { locksMesh, rootSkin } from './locks.js';
import { scatter } from './sculpt.js';
import { growStrands } from './strands.js';
import { distanceTo } from './cast.js';
import { hatFan, jerseyLettering } from './gnome.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** His hair, grown on the cast: { beard, tash, browL, browR, nape }, each strands and what the bones do with their roots. */
function growHair(cast, body) {
  const A = cast.A, keepOut = distanceTo(cast);
  // (hair grows where the cast is hair)
  const hairy = (a, b, c) => (A.regb[a * 4 + 2] + A.regb[b * 4 + 2] + A.regb[c * 4 + 2]) / 3;
  const grown = (roots, opts) => ({ strands: growStrands(roots, { body: keepOut, ...opts }), skin: rootSkin(roots, body) });
  const inTash = (x, y, z) => y > 0.193 && y < 0.2185 && z > 0.034 && Math.abs(x) < 0.074;
  const inBrow = (x, y, z) => y > 0.2495 && y < 0.2665 && z > 0.028 && Math.abs(x) < 0.05;
  const brow = (s) => grown(scatter(body, 900, (x, y, z, nx, ny, nz, a, b, c) => (inBrow(x, y, z) && x * s > 0 ? hairy(a, b, c) : 0), 55 + s), {
    seed: 25 + s, segments: 5, width: 0.0006, clump: 0.3, clumps: 40, frizz: 0.001, loft: 0.002,
    shape: (p, n, rnd) => ({ length: 0.01 + rnd() * 0.009, dir: [s * (0.9 + rnd() * 0.5), 0.05 + rnd() * 0.3, 0.8], droop: 0.35, stiff: 0.8 }),
  });
  return {
    // the beard: the cast has the shape of it, down to his belt; this is the hair on that shape, lying the way it falls
    beard: grown(scatter(body, 15000, (x, y, z, nx, ny, nz, a, b, c) => (z > -0.004 && y < 0.224 && !inTash(x, y, z) && !inBrow(x, y, z) ? hairy(a, b, c) : 0), 51), {
      seed: 21, segments: 8, width: 0.00074, clump: 0.55, clumps: 260, frizz: 0.0022, curl: [0.0016, 60], loft: 0.0045,
      shape: (p, n, rnd) => {
        // (shorter at the point of it, so that it stops where the cast's beard stops and his buckle can be seen)
        const low = clamp01((p[1] - 0.118) / 0.05);
        return {
          length: (0.011 + rnd() * 0.012) * (0.45 + 0.55 * low),
          dir: [n[0] * 0.45 + (rnd() - 0.5) * 0.25, -1, n[2] * 0.45 + 0.05],
          droop: 0.9, stiff: 0.35,
        };
      },
    }),
    // the moustache: two wings from under his nose, along the roll of it and turned up at the ends
    tash: grown(scatter(body, 4200, (x, y, z, nx, ny, nz, a, b, c) => (inTash(x, y, z) ? hairy(a, b, c) : 0), 53), {
      seed: 23, segments: 7, width: 0.00078, clump: 0.75, clumps: 30, frizz: 0.0012, loft: 0.003,
      shape: (p, n, rnd) => {
        const s = Math.sign(p[0]) || 1, out = clamp01(Math.abs(p[0]) / 0.06);
        return { length: 0.014 + rnd() * 0.01, dir: [s, -0.3 + 0.25 * out, 0.25 * n[2]], droop: 0.15, stiff: 0.8, bend: [s * 0.1, 0.3 + 0.9 * out, -0.2] };
      },
    }),
    browL: brow(1), browR: brow(-1),
    // and what hair he has left: round the back from ear to ear, and a tuft over each ear
    nape: grown(scatter(body, 4200, (x, y, z, nx, ny, nz, a, b, c) => ((z <= -0.004 || y >= 0.224) && !inBrow(x, y, z) ? hairy(a, b, c) : 0), 57), {
      seed: 27, segments: 6, width: 0.00072, clump: 0.5, clumps: 110, frizz: 0.002, curl: [0.0018, 60], loft: 0.004,
      shape: (p, n, rnd) => ({ length: 0.012 + rnd() * 0.012, dir: [n[0] * 0.7, -0.8 - rnd() * 0.3, n[2] * 0.7], droop: 1.0, stiff: 0.3 }),
    }),
  };
}

/**
 * @param cast  from loadCast('gnorman')
 */
export function buildGnomeCast(cast, { bare = false } = {}) {
  const A = cast.A;
  const body = { position: A.position, normal: A.normal, uv: A.uv, shade: A.shade, tint: A.tint, regb: A.regb, limb: A.limb, index: A.index, skinIndex: A.skinIndex, skinWeight: A.skinWeight };
  const at = Object.fromEntries(cast.bones.map((b) => [b.name, b.at]));
  // his jumper is knitted here as the other Gnorman's is, in the same wool, with the same words across the back of it
  const lettering = jerseyLettering();
  lettering.wrapS = lettering.wrapT = THREE.ClampToEdgeWrapping;
  const back = -(Math.PI / 2) * 0.09;                // (where the middle of his back is, in metres round him)
  const M = {
    body: castMaterial(cast.pictures, {
      knit: { color: 0x8f3a1f, second: 0xe9dcc0, stitch: [0.0026, 0.002], stripe: 22, share: 0.5, start: 0.77 },
      arms: { L: [at.armL, at.handL], R: [at.armR, at.handR] }, cuff: 0.013,
      // (read from behind, so it runs from his left to his right: backwards, the way the knitting is counted)
      picture: { map: lettering, at: [back + 0.058, 0.1475, 0], u: [-0.116, 0, 0], v: [0, 0.0435, 0] },
    }),
  };
  const fig = buildFigure('gnome', cast.bones, { body }, M, null);
  const { group, rig, B, meshes, hang } = fig;

  // ---- eyes: real ones, in front of the painted ones ----
  const eyeMat = folkMaterial('eye', { sculpted: false, color: 0xf0ebe0, second: 0x5a3516, a: [0.8, 0.38, 0, 0], roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const E = cast.eye;
  // (his eyelids are the colour the cast is round his eyes)
  const lidColour = new THREE.Color().setRGB(E.lid[0], E.lid[1], E.lid[2], THREE.SRGBColorSpace).multiplyScalar(1.28);
  const lidMat = folkMaterial('skin', { sculpted: false, color: lidColour, a: [0, 0.6, 0.5, 0], roughness: 0.5 });
  const eyes = [1, -1].map((s) => {
    const e = fig.eye('head', [s * E.at[0], E.at[1], E.at[2]], E.r, eyeMat, lidMat, { under: 0.95, open: -0.62 });       // (heavy lids)
    e.ball.rotation.y = s * 0.06;
    return e;
  });

  // ---- the fan on his hat ----
  const brass = folkMaterial('plain', { sculpted: false, color: 0xd2a53c, a: [0.003, 0.25, 0, 0], roughness: 0.3, metalness: 1 });
  const steel = folkMaterial('plain', { sculpted: false, color: 0xaeb4bc, a: [0.004, 0.2, 0, 0], roughness: 0.32, metalness: 1 });
  const spin = hatFan(hang, cast.hatTip, [0.08, 0.99, -0.06], brass, steel);

  // ---- hair, on the lumps the cast has for hair, and going with his bones as they do ----
  if (!bare) {
    const white = { root: 0x8f8a80, tip: 0xf2ede2, shine: 0xffffff };
    const hair = growHair(cast, body);
    const wear = (h, opts) => fig.wear(locksMesh(h.strands, { colour: white, skin: { skeleton: rig.skeleton, ...h.skin }, ...opts }));
    wear(hair.beard, { dense: 6, flex: 0.012 });
    wear(hair.tash, { dense: 5, flex: 0.006 });
    wear(hair.browL, { dense: 4, flex: 0.005 });
    wear(hair.browR, { dense: 4, flex: 0.005 });
    wear(hair.nape, { dense: 5 });
  }

  fig.bound([0, 0.22, 0], 0.4);
  const rest = { browL: B.browL.position.y, browR: B.browR.position.y };
  let turn = 0, hello = 0, blinkIn = 1.7, blink = 0;
  return {
    group, meshes, height: 0.3, rig, data: { body }, materials: M, see: fig.see, shade: fig.shade,
    /** As the other Gnorman's (gnome.js): which way the visitor is, how near, and how pleased he is with a sale. */
    update(dt, t, look, near, pleased = 0) {
      turn += (THREE.MathUtils.clamp(look, -1.1, 1.1) * near - turn) * Math.min(1, dt * 5);
      B.head.rotation.y = turn;
      B.head.rotation.z = Math.sin(t * 1.3) * 0.03;
      // he breathes; when he has made a sale, he shakes
      const swell = Math.sin(t * 2.1) * 0.012 + pleased * Math.sin(t * 21) * 0.008;
      B.torso.scale.set(1 + swell, 1 + swell * 0.4, 1 + swell);
      B.head.scale.set(1 / (1 + swell), 1 / (1 + swell * 0.4), 1 / (1 + swell));
      B.hat2.rotation.z = Math.sin(t * 1.7) * 0.035 + pleased * Math.sin(t * 17) * 0.05;
      spin.rotation.y += dt * (5 + 16 * near + 60 * pleased);
      // a wave of the foam hand when someone turns up, and a bigger one for a sale
      hello += (Math.max(near, pleased) - hello) * Math.min(1, dt * 3);
      B.armL.rotation.z = Math.sin(t * (7 + 6 * pleased)) * (0.1 + 0.25 * pleased) * hello - 0.15 * hello;
      B.armL.rotation.x = -0.25 * hello;
      B.armR.rotation.x = Math.sin(t * 2.1) * 0.03 - 0.12 * pleased;
      // the face: what can be seen of it
      blinkIn -= dt;
      if (blinkIn <= 0) { blink = 0.12; blinkIn = 2 + Math.random() * 4; }
      blink = Math.max(0, blink - dt);
      for (const e of eyes) e.shut(blink > 0 ? 1 : 0.42 - 0.2 * near + 0.25 * pleased);
      for (const [name, side] of [['browL', 1], ['browR', -1]]) {
        B[name].position.y = rest[name] + 0.002 * near + 0.002 * pleased + 0.0006 * Math.sin(t * 2.6 + side);
        B[name].rotation.z = -side * (0.2 * near + 0.12 * pleased);       // (the inner ends go up: pleased to see you)
      }
      B.tash.rotation.z = Math.sin(t * 2.3) * 0.012 + pleased * Math.sin(t * 19) * 0.03;
    },
  };
}
