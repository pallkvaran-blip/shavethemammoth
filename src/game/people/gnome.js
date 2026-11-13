// Gnorman: a fat gnome, the mammoth's biggest fan and the only shop for a
// thousand miles. A fan on his hat (it turns), a foam finger on one hand, a
// team jersey under the beard, and a stall of things with edges.
//
// Built facing +z, standing at the origin. Metres: he is 30 cm to the eyes,
// which makes him a head taller than the elf, and he stands on a box to be
// sure of it.
import * as THREE from 'three';
import { Model, signTexture, plankTexture } from './model.js';
import { canvasTexture } from '../tool.js';

function jerseyTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e9dcc0' : '#8f3a1f'; g.fillRect(0, (i * h) / 8, w, h / 8 + 1); }
    // on the back, where the beard does not cover it
    g.fillStyle = '#f3ead4'; g.font = 'bold 54px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = '#3a1a0c'; g.lineWidth = 6;
    g.strokeText('#1 FAN', w * 0.25, h * 0.52); g.fillText('#1 FAN', w * 0.25, h * 0.52);
  }, true);
}

function fingerTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#2f62b8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f0e6'; g.font = 'bold 76px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('#1', w / 2, h / 2 + 4);
  }, true);
}

function stripes(a, b, n = 8) {
  const t = canvasTexture(128, 16, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect((i * w) / n, 0, w / n + 1, h); } }, true);
  return t;
}

export function buildGnome() {
  const M = new Model('gnome');
  const skinTone = M.mat(0xd9a07c, { rough: 0.6, sheen: 0.3 });
  const nose = M.mat(0xc9604a, { rough: 0.45, coat: 0.2 });
  const white = M.mat(0xf1ece2, { rough: 0.95 });
  const red = M.mat(0xb8281c, { rough: 0.8 });
  const jersey = M.mat(0xffffff, { rough: 0.85, map: jerseyTexture() });
  const blue = M.mat(0x2c3f66, { rough: 0.85 });
  const boot = M.mat(0x3a2414, { rough: 0.6, coat: 0.2 });
  const brass = M.mat(0xc9a13f, { rough: 0.35, metal: 1 });
  const dark = M.mat(0x0b0806, { rough: 0.2, coat: 1 });
  const foam = M.mat(0xffffff, { rough: 0.9, map: fingerTexture() });
  const grey = M.mat(0x8d9299, { rough: 0.4, metal: 0.8 });

  const all = M.group;
  // boots and legs
  for (const s of [-1, 1]) {
    M.ball(all, boot, 0.03, [s * 0.036, 0.018, 0.014], [1, 0.62, 1.5]);
    M.rod(all, blue, [s * 0.036, 0.03, 0], [s * 0.03, 0.075, 0], 0.021, 0.024);
  }
  // the belly: most of him
  const belly = M.ball(all, jersey, 0.088, [0, 0.132, 0], [1.08, 1, 1]);
  belly.rotation.y = Math.PI / 2;
  const belt = M.add(all, new THREE.TorusGeometry(0.09, 0.007, 8, 28), boot, 'belt');
  belt.rotation.x = Math.PI / 2; belt.position.y = 0.098;
  M.box(all, brass, [0.026, 0.02, 0.008], [0, 0.098, 0.092]);

  // the head turns to follow whoever comes by
  const head = new THREE.Group();
  head.position.set(0, 0.2, 0);
  all.add(head);
  M.ball(head, skinTone, 0.058, [0, 0.03, 0.004]);
  M.ball(head, nose, 0.025, [0, 0.026, 0.06], [1, 0.95, 1.05]);
  for (const s of [-1, 1]) {
    M.ball(head, nose, 0.019, [s * 0.036, 0.016, 0.04], [1, 0.8, 0.6]);        // cheeks
    M.ball(head, white, 0.0115, [s * 0.022, 0.048, 0.047]);                      // eyes
    M.ball(head, dark, 0.0052, [s * 0.021, 0.048, 0.0565]);
    M.ball(head, white, 0.014, [s * 0.024, 0.064, 0.046], [1.4, 0.45, 0.7]);     // brows
    M.ball(head, white, 0.02, [s * 0.021, 0.008, 0.054], [1.35, 0.6, 0.75]);     // moustache
    M.ball(head, skinTone, 0.016, [s * 0.058, 0.03, 0], [0.5, 1, 0.8]);          // ears
    M.ball(head, white, 0.03, [s * 0.04, -0.012, 0.022], [0.8, 1.1, 0.8]);       // whiskers
  }
  // the beard: down over the jersey to the belt
  const beard = M.add(head, new THREE.ConeGeometry(0.058, 0.15, 18), white, 'beard');
  beard.rotation.x = Math.PI - 0.3; beard.position.set(0, -0.058, 0.074); beard.scale.set(1.05, 1, 0.55);
  // the hat, and the fan on top of it
  const hat = new THREE.Group();
  hat.position.set(0, 0.07, -0.004); hat.rotation.x = -0.14;
  head.add(hat);
  const cone = M.add(hat, new THREE.ConeGeometry(0.06, 0.14, 20), red, 'hat');
  cone.position.y = 0.07;
  const brim = M.add(hat, new THREE.TorusGeometry(0.059, 0.008, 8, 24), red, 'hat-brim');
  brim.rotation.x = Math.PI / 2; brim.position.y = 0.004;
  const fan = new THREE.Group();
  fan.position.y = 0.145;
  hat.add(fan);
  M.ball(fan, brass, 0.008, [0, 0, 0]);
  M.rod(fan, brass, [0, -0.012, 0], [0, 0.002, 0], 0.003);
  for (let i = 0; i < 3; i++) {
    const blade = M.box(fan, grey, [0.05, 0.002, 0.016], [0.03, 0.003, 0]);
    const arm = new THREE.Group(); arm.rotation.y = (i * Math.PI * 2) / 3; blade.rotation.x = 0.35;
    fan.add(arm); arm.add(blade);
  }

  // arms: one hangs, the other holds the foam finger up and waves it
  M.rod(all, jersey, [-0.088, 0.168, 0], [-0.118, 0.105, 0.03], 0.02, 0.018);
  M.ball(all, skinTone, 0.02, [-0.12, 0.094, 0.034]);
  const arm = new THREE.Group();
  arm.position.set(0.088, 0.168, 0);
  all.add(arm);
  M.rod(arm, jersey, [0, 0, 0], [0.05, 0.065, 0.015], 0.02, 0.018);
  const finger = new THREE.Group();
  finger.position.set(0.056, 0.078, 0.018);
  arm.add(finger);
  M.box(finger, foam, [0.062, 0.056, 0.022], [0, 0.03, 0]);
  M.box(finger, foam, [0.022, 0.07, 0.022], [-0.004, 0.092, 0]);
  M.box(finger, foam, [0.02, 0.03, 0.022], [0.034, 0.03, 0]);

  let turn = 0, hello = 0;
  return {
    group: M.group, meshes: M.meshes, height: 0.3,
    /**
     * @param look     which way the visitor is, as an angle about y from the gnome's own forward (radians)
     * @param near     0 when nobody is about, 1 when someone is at the counter
     * @param pleased  0..1: just made a sale
     */
    update(dt, t, look, near, pleased = 0) {
      turn += (THREE.MathUtils.clamp(look, -1.1, 1.1) * near - turn) * Math.min(1, dt * 5);
      head.rotation.y = turn;
      head.rotation.z = Math.sin(t * 1.3) * 0.03;
      belly.scale.set(1.08 + Math.sin(t * 2.1) * 0.012, 1 + Math.sin(t * 2.1) * 0.012, 1 + Math.sin(t * 2.1) * 0.012);
      fan.rotation.y += dt * (5 + 16 * near + 60 * pleased);
      // a wave of the foam finger when someone turns up, and a bigger one for a sale
      hello += (Math.max(near, pleased) - hello) * Math.min(1, dt * 3);
      arm.rotation.z = Math.sin(t * (7 + 6 * pleased)) * (0.1 + 0.25 * pleased) * hello - 0.15 * hello;
      arm.rotation.x = -0.25 * hello;
    },
  };
}

/** The stall: a counter, an awning, a sign, a lamp, and some of the stock leaning against it. Customers stand at +z. */
export function buildStall() {
  const M = new Model('stall');
  const planks = plankTexture();
  const wood = M.mat(0xffffff, { rough: 0.8, map: planks });
  const post = M.mat(0x5d4028, { rough: 0.85 });
  const cloth = M.mat(0xffffff, { rough: 0.9, map: stripes('#f2ead8', '#a8261b', 10), side: THREE.DoubleSide });
  const board = M.mat(0xffffff, { rough: 0.75, map: signTexture([{ text: "GNORMAN'S", size: 64, style: 'bold' }, { text: 'sharp things & sundries', size: 30, style: 'italic' }]) });
  const rules = M.mat(0xffffff, { rough: 0.8, map: signTexture([{ text: 'GOLD ONLY', size: 34, style: 'bold' }, { text: 'no credit · no refunds', size: 22 }, { text: 'no hair · no haggling', size: 22 }, { text: 'no mammoths', size: 22 }], { w: 256, h: 192, ground: '#e7dcc2', ink: '#2a1a10' }) });
  const brass = M.mat(0xc9a13f, { rough: 0.35, metal: 1 });
  const glassy = M.mat(0x4d8f4a, { rough: 0.15, coat: 1 });
  const glow = M.mat(0x2a1a06, { rough: 0.4, emissive: 0xffb95a, glow: 14 });
  const iron = M.mat(0x2a2c30, { rough: 0.5, metal: 0.8 });
  const all = M.group;

  // the counter, and the box behind it that he stands on
  M.box(all, wood, [0.62, 0.21, 0.2], [0, 0.045, 0.1]);
  M.box(all, wood, [0.68, 0.012, 0.25], [0, 0.156, 0.1]);
  M.box(all, post, [0.2, 0.12, 0.16], [0, 0, -0.11]);
  const list = M.box(all, rules, [0.19, 0.14, 0.004], [-0.17, 0.08, 0.203]);
  list.rotation.z = 0.04;
  // four posts and the awning over them, lower at the front, with a valance
  for (const [x, z] of [[-0.33, 0.21], [0.33, 0.21], [-0.33, -0.25], [0.33, -0.25]]) M.rod(all, post, [x, -0.07, z], [x, z > 0 ? 0.5 : 0.6, z], 0.011);
  const awning = M.box(all, cloth, [0.78, 0.005, 0.6], [0, 0.565, -0.03]);
  awning.rotation.x = 0.2;
  const valance = M.box(all, cloth, [0.78, 0.05, 0.004], [0, 0.48, 0.262]);
  valance.rotation.x = -0.1;
  // the sign, up on the roof
  M.box(all, board, [0.52, 0.16, 0.012], [0, 0.71, -0.06]);
  for (const x of [-0.2, 0.2]) M.rod(all, post, [x, 0.58, -0.06], [x, 0.64, -0.06], 0.008);
  // a lamp at the corner: it is always nearly dark here
  M.rod(all, iron, [0.3, 0.5, 0.24], [0.3, 0.44, 0.24], 0.002);
  M.box(all, iron, [0.03, 0.006, 0.03], [0.3, 0.44, 0.24]);
  const lamp = M.ball(all, glow, 0.012, [0.3, 0.42, 0.24]);
  M.box(all, iron, [0.03, 0.004, 0.03], [0.3, 0.398, 0.24]);
  // stock: a bottle of the tonic, a crate, a ladder and a broom against the side
  M.rod(all, glassy, [0.2, 0.162, 0.13], [0.2, 0.205, 0.13], 0.014, 0.012);
  M.rod(all, glassy, [0.2, 0.205, 0.13], [0.2, 0.225, 0.13], 0.005);
  M.box(all, wood, [0.09, 0.07, 0.09], [0.05, 0.197, 0.12]).rotation.y = 0.3;
  M.box(all, brass, [0.05, 0.012, 0.03], [-0.08, 0.168, 0.14]);
  const ladder = new THREE.Group();
  ladder.position.set(0.42, 0, 0.05); ladder.rotation.z = 0.2;
  all.add(ladder);
  for (const z of [-0.05, 0.05]) M.rod(ladder, post, [0, -0.06, z], [0, 0.6, z], 0.008);
  for (let y = 0.07; y < 0.6; y += 0.085) M.rod(ladder, post, [0, y, -0.05], [0, y, 0.05], 0.006);
  const broom = new THREE.Group();
  broom.position.set(-0.43, 0, 0.1); broom.rotation.z = -0.16;
  all.add(broom);
  M.rod(broom, post, [0, 0.05, 0], [0, 0.46, 0], 0.006);
  M.box(broom, iron, [0.03, 0.09, 0.14], [0, 0.01, 0]);

  return { group: M.group, meshes: M.meshes, lamp, radius: 0.46 };
}
