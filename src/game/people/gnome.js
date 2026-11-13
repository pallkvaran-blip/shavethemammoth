// Gnorman: a fat gnome, the mammoth's biggest fan and the only shop for a
// thousand miles. A fan on his hat (it turns), a foam hand on one of his own,
// a team jersey with the beard down the front of it, and a stall of things
// with edges.
//
// He is sculpted (see sculpt.js): a face that is mostly nose, a belly that is
// mostly the rest of him, each thing he has on a layer of its own, all hung
// on bones. The beard, the moustache, the eyebrows and what hair he has left
// are hair (locks.js); the lettering on his back is knitted into the jersey
// stitch by stitch.
//
// Built facing +z, standing at the origin. Metres: he is 25 cm to the eyes,
// which makes him a head taller than the elf, and he stands on a box to be
// sure of it.
import * as THREE from 'three';
import { Model, signTexture, plankTexture, GOTHIC, HAND } from './model.js';
import { canvasTexture } from '../tool.js';
import { buildFigure } from './figure.js';
import { bakeFigure } from './bake.js';
import { folkMaterial } from './materials.js';
import { locksMesh } from './locks.js';
import { gnomeRecipe, browAt, sub, unit, EYE, EYE_R, HAT, BELLY, BELLY_R, BELT_Y, F_UP, F_ACROSS, foamAt } from './gnome.recipe.js';

function jerseyLettering() {
  return canvasTexture(512, 192, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = `700 172px ${HAND}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.strokeStyle = '#2a120a'; g.lineWidth = 26; g.strokeText('#1 FAN', w / 2, h * 0.54);
    g.fillStyle = '#f6edd6'; g.fillText('#1 FAN', w / 2, h * 0.54);
  }, true);
}

function foamLettering() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f4f0e6'; g.font = `700 176px ${HAND}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('#1', w / 2, h / 2 + 8);
  }, true);
}

export function buildGnome({ bare = false, baked = null } = {}) {
  const recipe = gnomeRecipe();
  const { data, far, hair } = baked || bakeFigure(recipe, { bare });
  const skin = folkMaterial('skin', { color: 0xd9a07c, a: [0.5, 1.2, 1.15, 0.6], roughness: 0.52, clearcoat: 0.12, clearcoatRoughness: 0.4 });
  const lettering = jerseyLettering(), number = foamLettering();
  lettering.wrapS = lettering.wrapT = number.wrapS = number.wrapT = THREE.ClampToEdgeWrapping;
  const back = (Math.PI / 2) * 0.09;                // how far round the jersey the middle of his back is
  const M = {
    head: skin, hand: skin,
    jersey: folkMaterial('knit', {
      color: 0x8f3a1f, second: 0xe9dcc0, a: [0.0026, 0.002, 22, 0.5], sheen: 0.6, sheenRoughness: 0.6, sheenColor: 0xf0c9a8,
      picture: { map: lettering, at: [back - 0.062, 0.004, 0], u: [0.124, 0, 0], v: [0, 0.0465, 0] },
    }),
    jerseyRib: folkMaterial('knit', { color: 0x7c3019, a: [0.002, 0.0017, 0, 0], b: [2, 0, 0, 0], sheen: 0.6, sheenRoughness: 0.6, sheenColor: 0xf0c9a8 }),
    trousers: folkMaterial('cloth', { color: 0x2c3f66, a: [0.0012, 0.5, 3, 0], sheen: 0.4, sheenRoughness: 0.6, sheenColor: 0x8fa6d6 }),
    belt: folkMaterial('leather', { color: 0x2a180c, a: [0.0008, 0.2, 0.7, 0], roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
    boots: folkMaterial('leather', { color: 0x4a2a14, a: [0.0009, 0.24, 0.8, 0], roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    hat: folkMaterial('felt', { color: 0xb8281c, a: [0.0009, 1, 0, 0], sheen: 0.8, sheenRoughness: 0.5, sheenColor: 0xff9a80 }),
    foam: folkMaterial('plain', {
      color: 0x2f62b8, a: [0.0016, 0.3, 0, 0], roughness: 0.95,
      picture: { map: number, at: foamAt(-0.034, 0.008), u: F_ACROSS.map((v) => v * 0.068), v: F_UP.map((v) => v * 0.068) },
    }),
  };
  const fig = buildFigure('gnome', recipe.bones, data, M, far);
  const { group, rig, B, meshes, hang } = fig;

  // ---- eyes: small, bright, and a long way back under the hat ----
  const eyeMat = folkMaterial('eye', { sculpted: false, color: 0xf0ebe0, second: 0x5a3516, a: [0.8, 0.38, 0, 0], roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const lidMat = folkMaterial('skin', { sculpted: false, color: 0xc98f72, a: [0, 0.6, 0.5, 0], roughness: 0.5 });
  const eyes = [1, -1].map((s) => {
    const e = fig.eye('head', [s * EYE[0], EYE[1], EYE[2]], EYE_R, eyeMat, lidMat, { under: 0.85 });
    e.ball.rotation.y = s * 0.06;
    return e;
  });

  // ---- brass: the buckle of his belt, and the fan on his hat ----
  const brass = folkMaterial('plain', { sculpted: false, color: 0xd2a53c, a: [0.003, 0.25, 0, 0], roughness: 0.3, metalness: 1 });
  const steel = folkMaterial('plain', { sculpted: false, color: 0xaeb4bc, a: [0.004, 0.2, 0, 0], roughness: 0.32, metalness: 1 });
  {
    const buckle = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.0125, 0.0026, 10, 4).rotateZ(Math.PI / 4), brass);
    frame.scale.set(1.2, 0.95, 1);
    const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.02, 8).rotateZ(Math.PI / 2), brass);
    prong.position.set(0.002, 0, 0.0015);
    buckle.add(frame, prong);
    const girth = Math.sqrt(1 - ((BELT_Y - BELLY[1]) / BELLY_R[1]) ** 2);
    hang('torso', buckle, [0, BELT_Y, BELLY[2] + BELLY_R[2] * girth + 0.006]);
    buckle.rotation.x = 0.36;                      // (it lies on the under side of the belly)
  }
  const spin = new THREE.Group();
  {
    const fan = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.003, 0.02, 10), brass);
    stem.position.y = 0.012;
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 20, 14), brass);
    hub.scale.y = 0.8; hub.position.y = 0.023;
    spin.position.y = 0.023;
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), steel);
      blade.scale.set(0.027, 0.0011, 0.0098); blade.position.x = 0.031; blade.rotation.x = 0.42;
      arm.add(blade);
      spin.add(arm);
    }
    fan.add(stem, hub, spin);
    hang('fan', fan, HAT[2]);
    fan.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...unit(sub(HAT[2], HAT[1]))));
  }

  // ---- hair: the beard, the moustache, the eyebrows, and what is left round the back ----
  const brows = [];
  let beard = null, tash = null;
  if (hair.beard) {
    const white = { root: 0xa6a092, tip: 0xf5f0e6, shine: 0xffffff };
    // (the beard goes with the chin it grows from, but what lies on the belly stays lying there when he turns his head)
    beard = fig.grow('torso', locksMesh(hair.beard, { colour: white, dense: 6, flex: 0.012, twist: { about: [0, 0], full: 0.186, least: 0.112, share: 0.12 } }));
    tash = fig.grow('head', locksMesh(hair.tash, { colour: white, dense: 5, flex: 0.006 }));
    for (const [s, strands] of [[1, hair.browL], [-1, hair.browR]]) {
      const pivot = fig.pivot('head', locksMesh(strands, { colour: white, dense: 4, flex: 0.005 }), browAt(s));
      brows.push({ pivot, side: s, y: pivot.position.y });
    }
    fig.grow('head', locksMesh(hair.nape, { colour: white, dense: 5 }));
  }

  fig.bound([0, 0.22, 0], 0.4);
  let turn = 0, hello = 0, blinkIn = 1.7, blink = 0;
  return {
    group, meshes, height: 0.3, rig, data, materials: M, see: fig.see,
    /**
     * @param look     which way the visitor is, as an angle about y from the gnome's own forward (radians)
     * @param near     0 when nobody is about, 1 when someone is at the counter
     * @param pleased  0..1: just made a sale
     */
    update(dt, t, look, near, pleased = 0) {
      turn += (THREE.MathUtils.clamp(look, -1.1, 1.1) * near - turn) * Math.min(1, dt * 5);
      B.head.rotation.y = turn;
      B.head.rotation.z = Math.sin(t * 1.3) * 0.03;
      if (beard) beard.material.uniforms.uTwistBy.value.x = turn;
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
      for (const b of brows) {
        b.pivot.position.y = b.y + 0.002 * near + 0.002 * pleased + 0.0006 * Math.sin(t * 2.6 + b.side);
        b.pivot.rotation.z = -b.side * (0.2 * near + 0.12 * pleased);       // (the inner ends go up: pleased to see you)
      }
      if (tash) tash.mesh.rotation.z = Math.sin(t * 2.3) * 0.012 + pleased * Math.sin(t * 19) * 0.03;
    },
  };
}

function stripes(a, b, n = 8) {
  return canvasTexture(128, 16, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect((i * w) / n, 0, w / n + 1, h); } }, true);
}

/** The stall: a counter, an awning, a sign, a lamp, and some of the stock leaning against it. Customers stand at +z. */
export function buildStall() {
  const M = new Model('stall');
  const planks = plankTexture();
  const wood = M.mat(0xffffff, { rough: 0.8, map: planks });
  const post = M.mat(0x5d4028, { rough: 0.85 });
  const cloth = M.mat(0xffffff, { rough: 0.9, map: stripes('#f2ead8', '#a8261b', 10), side: THREE.DoubleSide });
  const board = M.mat(0xffffff, { rough: 0.75, map: signTexture([{ text: 'Gnorman’s', size: 88, style: '700', font: GOTHIC }, { text: 'sharp things & sundries', size: 32, style: 'italic 500' }]) });
  const rules = M.mat(0xffffff, { rough: 0.8, map: signTexture([{ text: 'Gold only', size: 52, style: '700', font: GOTHIC }, { text: 'no credit · no refunds', size: 24, style: '500' }, { text: 'no hair · no haggling', size: 24, style: '500' }, { text: 'no mammoths', size: 24, style: '500' }], { w: 256, h: 192, ground: '#e7dcc2', ink: '#2a1a10' }) });
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
  // (canvas, not board: it hangs between its poles, and its front edge is cut in scallops, one to a stripe)
  {
    const W = 0.78, D = 0.6, sheet = new THREE.PlaneGeometry(W, D, 30, 16).rotateX(-Math.PI / 2);
    const p = sheet.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (W / 2), z = p.getZ(i) / (D / 2);
      const sag = (1 - z * z) * (0.022 + 0.01 * Math.cos(x * Math.PI)) + 0.004 * Math.sin(x * 9 + z * 5) * (1 - z * z);
      p.setY(i, -sag);
    }
    sheet.computeVertexNormals();
    const awning = M.add(all, sheet, cloth, 'awning');
    awning.position.set(0, 0.565, -0.03); awning.rotation.x = 0.2;
    const n = 10, w = W / n, drop = 0.022, edge = new THREE.Shape();
    edge.moveTo(-W / 2, 0);
    for (let i = 0; i < n; i++) edge.absarc(-W / 2 + (i + 0.5) * w, -drop, w / 2, Math.PI, Math.PI * 2, false);
    edge.lineTo(W / 2, 0);
    const scallops = new THREE.ShapeGeometry(edge, 10), uv = scallops.attributes.uv, q = scallops.attributes.position;
    for (let i = 0; i < q.count; i++) uv.setXY(i, q.getX(i) / W + 0.5, 0.5);
    const valance = M.add(all, scallops, cloth, 'valance');
    valance.position.set(0, 0.5045, 0.264); valance.rotation.x = -0.1;
  }
  // the sign, up on the roof
  M.box(all, board, [0.52, 0.16, 0.012], [0, 0.71, -0.06]);
  for (const x of [-0.2, 0.2]) M.rod(all, post, [x, 0.58, -0.06], [x, 0.64, -0.06], 0.008);
  // a lamp at the corner: it is always nearly dark here
  M.rod(all, iron, [0.3, 0.5, 0.24], [0.3, 0.44, 0.24], 0.002);
  M.box(all, iron, [0.03, 0.006, 0.03], [0.3, 0.44, 0.24]);
  const lamp = M.ball(all, glow, 0.012, [0.3, 0.42, 0.24]);
  M.box(all, iron, [0.03, 0.004, 0.03], [0.3, 0.398, 0.24]);
  // stock: a bottle of the tonic, a crate, a ladder and a broom against the side
  {
    const bottle = M.add(all, new THREE.LatheGeometry([[0, 0], [0.0138, 0], [0.0146, 0.003], [0.0146, 0.034], [0.0128, 0.042], [0.0062, 0.051], [0.005, 0.056], [0.005, 0.066], [0.0062, 0.0672], [0.0062, 0.07], [0, 0.07]].map(([r, y]) => new THREE.Vector2(r, y)), 28), glassy, 'tonic');
    bottle.position.set(0.2, 0.162, 0.13);
    const cork = M.add(all, new THREE.CylinderGeometry(0.0046, 0.0042, 0.009, 12), post, 'cork');
    cork.position.set(0.2, 0.2355, 0.13);
    const label = M.add(all, new THREE.CylinderGeometry(0.0149, 0.0149, 0.02, 24, 1, true, -1.0, 2.0), M.mat(0xffffff, { rough: 0.85, map: signTexture([{ text: 'Hair', size: 52, style: '700', font: GOTHIC }, { text: 'Tonic', size: 52, style: '700', font: GOTHIC }, { text: 'results not typical', size: 19, style: 'italic 500' }], { w: 256, h: 160, ground: '#e9dfc4', ink: '#3a1a10' }) }), 'label');
    label.position.set(0.2, 0.182, 0.13);
  }
  M.box(all, wood, [0.09, 0.07, 0.09], [-0.25, 0.197, 0.12]).rotation.y = 0.3;      // (to one side: nobody stands a crate in front of the shopkeeper)
  M.box(all, brass, [0.05, 0.012, 0.03], [-0.1, 0.168, 0.15]);
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
