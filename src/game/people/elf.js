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
import { buildFigure } from './figure.js';
import { bakeFigure } from './bake.js';
import { folkMaterial } from './materials.js';
import { locksMesh } from './locks.js';
import { elfRecipe, browAt, ARM, EYE, EYE_R, CURL } from './elf.recipe.js';

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function buildElf({ bare = false, baked = null } = {}) {
  const recipe = elfRecipe();
  const { data, hair } = baked || bakeFigure(recipe, { bare });
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
  const fig = buildFigure('elf', recipe.bones, data, M);
  const { group, rig, B, meshes, hang } = fig;

  // ---- things that are simply made and hung on a bone: eyes, lids, a tooth, bells ----
  const eyeMat = folkMaterial('eye', { sculpted: false, color: 0xf3efe6, second: 0x5d7d3a, a: [0.66, 0.3, 0, 0], roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const lidMat = folkMaterial('skin', { sculpted: false, color: 0xcf9c88, a: [0, 0.6, 0.35, 0], roughness: 0.5 });
  const eyes = [1, -1].map((s, i) => {
    const e = fig.eye('head', [s * EYE[0], EYE[1], EYE[2]], EYE_R[i], eyeMat, lidMat);
    e.ball.rotation.y = -s * 0.1;                                               // not quite agreed on where to look
    return { ...e, side: s };
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
  if (hair.scalp) {
    const ginger = { root: 0x5a2208, tip: 0xd2702a, shine: 0xffd9a0 };
    fig.grow('head', locksMesh(hair.scalp, { colour: ginger, dense: 5 }));
    for (const [s, strands] of [[1, hair.browL], [-1, hair.browR]]) {
      const pivot = fig.pivot('head', locksMesh(strands, { colour: ginger, flex: 0.004 }), browAt(s));
      brows.push({ pivot, side: s, y: pivot.position.y });
    }
    fig.grow('hat3', locksMesh(hair.bobble, { colour: { root: 0xa89a7c, tip: 0xfaf1dc, shine: 0xffffff }, dense: 5 }));
    fig.grow('tail', locksMesh(hair.fringe, { colour: { root: 0x0f5550, tip: 0x2aa39c, shine: 0xb8fff8 } }));
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
    want, pose, rig, data, materials: M, detail: fig.detail,
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
