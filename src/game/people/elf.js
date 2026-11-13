// The elf: the legend himself, and the one the player is. Twenty centimetres
// of him to the top of the head, most of it head; ears like the wings of a
// small aircraft, a nose that arrives before he does, one tooth, a pot belly
// his jumper has given up covering, striped stockings, curly boots with bells
// on, and a hat a good deal taller than its owner thinks it is.
//
// Built facing +z, standing at the origin, with the eyes 17 cm up (where the
// camera is when the player looks out of them). He can stand about, hold a
// thing up over his head in one hand or two, strain under it, be shaken by
// it, be disappointed in it, and walk on the spot.
import * as THREE from 'three';
import { Model } from './model.js';
import { canvasTexture } from '../tool.js';

/** Bands of two colours along the length of a rod, a cone or a hat. */
function bands(a, b, n) {
  return canvasTexture(8, 128, (g, w, h) => {
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(0, (i * h) / n, w, h / n + 1); }
  }, true);
}

function knitTexture(base, dark) {
  return canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = dark; g.globalAlpha = 0.35; g.lineWidth = 1;
    for (let y = 0; y < h; y += 4) for (let x = (y / 4) % 2 ? 0 : 2; x < w; x += 4) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y + 3); g.lineTo(x + 4, y); g.stroke(); }
    g.globalAlpha = 1;
  }, true);
}

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function buildElf() {
  const M = new Model('elf');
  const skinTone = M.mat(0xe2b08a, { rough: 0.55, sheen: 0.3 });
  const blush = M.mat(0xd98572, { rough: 0.6 });
  const noseTip = M.mat(0xcf5b47, { rough: 0.4, coat: 0.3 });
  const white = M.mat(0xf4f0e6, { rough: 0.35, coat: 0.5 });
  const dark = M.mat(0x0b0806, { rough: 0.2, coat: 1 });
  const mouthMat = M.mat(0x5a1c18, { rough: 0.6 });
  const brow = M.mat(0x7a3b16, { rough: 0.9 });
  const hair = M.mat(0xc2581c, { rough: 0.9, sheen: 0.5 });
  const knit = knitTexture('#c99a2e', '#7d5a12');
  knit.repeat.set(3, 3);
  const jumper = M.mat(0xffffff, { rough: 0.95, map: knit, sheen: 0.4 });
  const hem = M.mat(0x9a7420, { rough: 0.95 });
  const shorts = M.mat(0x3f6b3a, { rough: 0.9 });
  const stocking = M.mat(0xffffff, { rough: 0.9, map: bands('#6b3fa0', '#efe6d2', 9) });
  const boot = M.mat(0x5a3418, { rough: 0.55, coat: 0.25 });
  const brass = M.mat(0xd4a93a, { rough: 0.3, metal: 1 });
  const scarfMat = M.mat(0x1f8a86, { rough: 0.95, sheen: 0.4 });
  const mitten = M.mat(0xb3261e, { rough: 0.95, sheen: 0.4 });
  const hatMat = M.mat(0xffffff, { rough: 0.95, map: bands('#d9661f', '#f0e2c4', 7), sheen: 0.3 });
  const cream = M.mat(0xf0e2c4, { rough: 1 });

  const all = M.group;
  // everything above the snow hangs from here, so that he can sink at the knees, rise on his toes, or be shaken
  const hips = new THREE.Group();
  all.add(hips);

  // ---- legs: spindly, in stockings, ending in boots that curl ----
  const curlPts = [];
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 1.6, r = 0.0085 * (1 - 0.4 * (i / 10)); curlPts.push(new THREE.Vector3(0, r * Math.sin(a), r * Math.cos(a))); }
  const curlGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curlPts), 16, 0.0034, 8, false);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.018, 0.064, 0);
    hips.add(leg);
    M.rod(leg, stocking, [0, 0.004, 0], [s * 0.003, -0.046, 0], 0.0085, 0.0075);
    M.ball(leg, boot, 0.0135, [s * 0.003, -0.052, 0.01], [1, 0.8, 1.9]);
    M.rod(leg, boot, [s * 0.003, -0.05, 0.0], [s * 0.003, -0.038, 0], 0.0105, 0.0098);       // the top of the boot
    const curl = M.add(leg, curlGeo, boot, 'toe');
    curl.position.set(s * 0.003, -0.0465, 0.034);
    const end = curlPts[curlPts.length - 1];
    M.ball(leg, brass, 0.0042, [s * 0.003, -0.0465 + end.y, 0.034 + end.z]);                  // the bell
    legs.push(leg);
  }
  M.ball(hips, shorts, 0.03, [0, 0.064, 0], [1.14, 0.64, 0.98]);

  // ---- the middle: a belly, and a jumper that stops short of it ----
  const torso = new THREE.Group();
  torso.position.set(0, 0.066, 0);
  hips.add(torso);
  M.ball(torso, skinTone, 0.032, [0, 0.015, 0.008], [1.06, 0.92, 1.04]);
  M.ball(torso, dark, 0.0026, [0, 0.006, 0.0405]);                                             // the belly button
  const chest = M.ball(torso, jumper, 0.036, [0, 0.038, 0], [1.1, 1, 0.98]);
  const hemRing = M.add(torso, new THREE.TorusGeometry(0.0345, 0.0052, 8, 26), hem, 'hem');
  hemRing.rotation.x = Math.PI / 2; hemRing.position.set(0, 0.021, 0.001); hemRing.scale.set(1.1, 0.98, 1);
  // the scarf, one end of it loose in the wind
  const scarf = M.add(torso, new THREE.TorusGeometry(0.024, 0.0085, 10, 22), scarfMat, 'scarf');
  scarf.rotation.x = Math.PI / 2; scarf.position.set(0, 0.066, 0.002);
  const tail = new THREE.Group();
  tail.position.set(-0.02, 0.064, 0.016);
  torso.add(tail);
  M.box(tail, scarfMat, [0.014, 0.05, 0.005], [0, -0.025, 0]);
  M.box(tail, cream, [0.014, 0.006, 0.0055], [0, -0.05, 0]);

  // ---- the head ----
  const head = new THREE.Group();
  head.position.set(0, 0.068, 0);
  torso.add(head);
  M.ball(head, skinTone, 0.044, [0, 0.036, 0], [1.08, 0.96, 1]);
  const cheeks = [];
  for (const s of [-1, 1]) cheeks.push(M.ball(head, blush, 0.014, [s * 0.027, 0.02, 0.029], [1, 0.8, 0.6]));
  const snout = M.add(head, new THREE.ConeGeometry(0.0108, 0.052, 14), skinTone, 'nose');
  snout.rotation.x = Math.PI / 2 + 0.1; snout.position.set(0, 0.03, 0.062);
  M.ball(head, noseTip, 0.0088, [0, 0.0268, 0.089]);
  // eyes: not the same size, and not quite agreed on where to look
  const eyes = [];
  for (const [s, r] of [[-1, 0.0128], [1, 0.0106]]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.0175, 0.051, 0.033);
    head.add(eye);
    M.ball(eye, white, r, [0, 0, 0]);
    const pupil = M.ball(eye, dark, r * 0.42, [-s * 0.003, 0, r * 0.82]);
    const lid = M.ball(eye, skinTone, r * 1.06, [0, r * 0.2, 0.0002], [1, 1, 1]);
    lid.visible = false;
    const b = new THREE.Group();
    b.position.set(0, r + 0.0065, 0.004);
    eye.add(b);
    M.rod(b, brow, [-0.009, 0, 0], [0.009, 0, 0], 0.0026);
    eyes.push({ eye, pupil, lid, brow: b, side: s });
  }
  // the mouth: a grin with one tooth in it (it turns over when he is let down)
  const mouth = M.add(head, new THREE.TorusGeometry(0.0155, 0.0027, 8, 18, Math.PI), mouthMat, 'mouth');
  mouth.position.set(0, 0.0165, 0.0395); mouth.rotation.set(-0.25, 0, Math.PI);
  const tooth = M.box(head, white, [0.0072, 0.0095, 0.004], [0.002, 0.0045, 0.0445]);
  // ears
  const earGeo = new THREE.ConeGeometry(0.017, 0.082, 12);
  earGeo.translate(0, 0.041, 0);
  const innerGeo = new THREE.ConeGeometry(0.0095, 0.06, 10);
  innerGeo.translate(0, 0.03, 0);
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.043, 0.04, -0.002);
    head.add(ear);
    const lobe = M.add(ear, earGeo, skinTone, 'ear');
    lobe.scale.set(1, 1, 0.3);
    const inner = M.add(ear, innerGeo, blush, 'ear-inside');
    inner.scale.set(1, 1, 0.2); inner.position.set(0, 0.004, 0.0042);
    ears.push({ ear, side: s });
  }
  // a tuft of ginger at the back, and the hat on top of it all
  for (const [x, y, z] of [[-0.02, 0.03, -0.036], [0.018, 0.026, -0.038], [0, 0.02, -0.042], [0.03, 0.04, -0.028], [-0.031, 0.042, -0.027]]) M.ball(head, hair, 0.012, [x, y, z], [1, 1.3, 0.8]);
  const hat = new THREE.Group();
  hat.position.set(0, 0.066, -0.006); hat.rotation.x = -0.2;
  head.add(hat);
  const rim = M.add(hat, new THREE.TorusGeometry(0.039, 0.0085, 8, 24), cream, 'hat-rim');
  rim.rotation.x = Math.PI / 2;
  const seg = (parent, r0, r1, h, y, lean) => {
    const g = new THREE.Group();
    g.position.y = y; g.rotation.z = lean;
    parent.add(g);
    const m = M.add(g, new THREE.CylinderGeometry(r1, r0, h, 16), hatMat, 'hat');
    m.position.y = h / 2;
    return g;
  };
  const hat1 = seg(hat, 0.04, 0.027, 0.05, 0, 0.12);
  const hat2 = seg(hat1, 0.027, 0.015, 0.046, 0.048, 0.5);
  const hat3 = seg(hat2, 0.015, 0.006, 0.042, 0.044, 0.75);
  M.ball(hat3, cream, 0.0125, [0, 0.048, 0]);

  // ---- arms: short ones, ending in mittens ----
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.04, 0.052, 0);
    torso.add(shoulder);
    M.ball(shoulder, jumper, 0.0115, [0, 0, 0]);
    M.rod(shoulder, jumper, [0, 0, 0], [0, -0.044, 0], 0.0098, 0.0088);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.044, 0);
    shoulder.add(elbow);
    M.ball(elbow, jumper, 0.009, [0, 0, 0]);
    M.rod(elbow, jumper, [0, 0, 0], [0, -0.04, 0], 0.0088, 0.0082);
    M.rod(elbow, hem, [0, -0.034, 0], [0, -0.042, 0], 0.0096, 0.0096);                          // a cuff
    const hand = new THREE.Group();
    hand.position.set(0, -0.05, 0);
    elbow.add(hand);
    M.ball(hand, mitten, 0.0125, [0, 0, 0], [1, 1.1, 0.9]);
    M.ball(hand, mitten, 0.0056, [-s * 0.009, 0.003, 0.006]);                                   // the thumb
    arms.push({ shoulder, elbow, hand, side: s });
  }

  // ---- how he holds himself ----
  // every pose is a set of angles; he eases from the one he is in towards the one asked for
  const pose = { lift: 0, two: 0, strain: 0, buzz: 0, sad: 0, proud: 0, walk: 0, carry: 0, lookYaw: 0, lookPitch: 0 };
  const want = { ...pose };
  let blinkIn = 2.4, blink = 0, step = 0, twitch = 0, twitchIn = 3.1;
  const _v = new THREE.Vector3();

  const apply = (t, dt) => {
    const lift = smooth(clamp01(pose.lift)), two = pose.two, strain = pose.strain, buzz = pose.buzz, sad = pose.sad, proud = pose.proud;
    const shake = strain * Math.sin(t * 31) + buzz * Math.sin(t * 173);
    // knees: he sinks under a weight, rises on his toes when pleased with himself
    const sink = strain * (0.012 + 0.003 * Math.sin(t * 23)) - proud * lift * 0.004;
    hips.position.set(buzz * 0.0012 * Math.sin(t * 191), -sink + buzz * 0.001 * Math.sin(t * 157), buzz * 0.0012 * Math.sin(t * 211));
    hips.rotation.z = strain * 0.05 * Math.sin(t * 2.3) + shake * 0.006;
    const stride = pose.walk * Math.sin(step);
    legs.forEach((leg, i) => {
      const s = i ? 1 : -1;
      leg.rotation.x = s * stride * 0.7;
      // (the hips came down; the feet stay on the snow, so the legs splay)
      leg.rotation.z = s * (strain * 0.5 + 0.04) + strain * 0.08 * Math.sin(t * 27 + i * 2);
      leg.position.y = 0.064 + sink * 0.25;
      leg.scale.y = 1 - sink * 9;
    });
    // the middle
    torso.rotation.x = -0.06 * proud * lift + 0.12 * sad + strain * 0.05 * Math.sin(t * 3.1) + pose.walk * 0.06;
    torso.rotation.z = strain * 0.04 * Math.sin(t * 2.3 + 1);
    const breath = 1 + 0.018 * Math.sin(t * 2.1) + strain * 0.03 * Math.sin(t * 9);
    chest.scale.set(1.1 * breath, breath, 0.98 * breath);
    tail.rotation.z = 0.35 + 0.22 * Math.sin(t * 3.3) + 0.1 * Math.sin(t * 7.1);
    tail.rotation.x = 0.2 * Math.sin(t * 2.7);
    // the head
    head.rotation.y = pose.lookYaw;
    head.rotation.x = -pose.lookPitch - 0.18 * proud * lift + 0.3 * sad + shake * 0.01;
    head.rotation.z = 0.06 * Math.sin(t * 0.9) * (1 - strain) + 0.16 * sad + shake * 0.012;
    ears.forEach(({ ear, side }) => {
      const up = 0.3 + 0.12 * proud * lift - 0.85 * sad - 0.25 * strain + 0.1 * Math.sin(t * 1.7 + side) + twitch * 0.35 * (side > 0 ? 1 : 0.4) + buzz * 0.25 * Math.sin(t * 61 + side);
      ear.rotation.z = -side * (Math.PI / 2 - up);
      ear.rotation.y = side * (-0.25 + 0.3 * sad);
    });
    hat1.rotation.z = 0.12 + 0.05 * Math.sin(t * 1.9) + shake * 0.03;
    hat2.rotation.z = 0.5 + 0.12 * Math.sin(t * 2.3 + 1) + 0.3 * sad + shake * 0.06;
    hat3.rotation.z = 0.75 + 0.2 * Math.sin(t * 2.9 + 2) + 0.3 * sad + shake * 0.1;
    // the face
    const frown = sad > 0.5 || strain > 0.6;
    mouth.rotation.z = frown ? 0 : Math.PI;
    mouth.position.y = frown ? 0.007 : 0.0165;
    mouth.scale.setScalar(frown ? 0.7 : 1 + 0.15 * proud * lift);
    tooth.position.y = (frown ? 0.0035 : 0.0045) + buzz * 0.0016 * Math.sin(t * 97);
    tooth.visible = !(strain > 0.6);
    for (const e of eyes) {
      e.brow.rotation.z = e.side * (0.25 * sad - 0.3 * strain + 0.12 * proud * lift);
      e.brow.position.y = (e.side < 0 ? 0.0193 : 0.0171) + 0.003 * proud * lift - 0.002 * strain;
      e.lid.visible = blink > 0 || strain > 0.75;
      e.pupil.scale.setScalar(1 + 0.5 * strain + 0.25 * buzz * Math.sin(t * 43));
    }
    cheeks.forEach((c) => c.scale.set(1 + 0.25 * strain, 0.8 + 0.25 * strain, 0.6));
    blush.color.setRGB(0.85 + 0.1 * strain, 0.52 - 0.27 * strain, 0.45 - 0.25 * strain);
    // the arms
    arms.forEach(({ shoulder, elbow, hand, side }, i) => {
      const lifting = side > 0 || two > 0.5;           // the right hand always; the left only when it takes two
      const swing = -side * stride * 0.6;
      const tremble = strain * 0.05 * Math.sin(t * 29 + i * 2) + buzz * 0.03 * Math.sin(t * 181 + i);
      if (lifting) {
        // up from the side to over the head: straight up for one hand, a little apart for two
        const top = Math.PI - (two > 0.5 ? 0.3 : 0.1);
        const down = 0.28 + pose.carry * 0.25;
        const bend = strain * (0.5 + 0.1 * Math.sin(t * 2.3));          // the elbows give under a weight
        shoulder.rotation.z = side * (down + (top - down) * lift - bend * 0.35) + tremble;
        shoulder.rotation.x = -pose.carry * (1 - lift) * 0.9 + swing * (1 - lift) - 0.12 * lift * (two > 0.5 ? 0 : 1);
        elbow.rotation.z = side * (-bend * 0.9 - 0.25 * (1 - lift) * pose.carry);
        elbow.rotation.x = -pose.carry * (1 - lift) * 0.8;
        hand.rotation.z = side * bend * 0.5;
      } else {
        // the other fist goes on the hip when the first goes up
        shoulder.rotation.z = side * (0.28 + 0.5 * lift * (1 - sad)) + tremble;
        shoulder.rotation.x = swing * (1 - lift);
        elbow.rotation.z = -side * 1.5 * lift * (1 - sad);
        elbow.rotation.x = 0;
        hand.rotation.z = 0;
      }
    });
    all.updateMatrixWorld(true);
  };

  return {
    group: M.group, meshes: M.meshes, height: 0.2, eye: 0.17,
    want, pose,
    /** Where a hand is (world): 'R', 'L', or 'both' for the point midway between them. */
    hand(which, out = _v) {
      if (which === 'both') {
        const a = arms[0].hand.getWorldPosition(new THREE.Vector3()), b = arms[1].hand.getWorldPosition(out);
        return out.add(a).multiplyScalar(0.5);
      }
      return arms[which === 'L' ? 0 : 1].hand.getWorldPosition(out);
    },
    /** Jump straight to the pose asked for (no easing). */
    settle() { Object.assign(pose, want); apply(0, 0); },
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
      apply(t, dt);
    },
  };
}
