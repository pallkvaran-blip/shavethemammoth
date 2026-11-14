// Mortimer: a vulture, bald by nature and in the wig trade by vocation. He
// buys hair by the gram. He would rather you were dead, professionally
// speaking, but he is prepared to wait.
//
// He is sculpted (see sculpt.js) and feathered (feathers.js): a hunched dark
// body under a coat of overlapping feathers, the long ones of his folded wings
// crossed over a fan of tail; a bare wrinkled neck out of a ruff of white
// down; a hooked beak; a monocle on a chain; and on his head an example of his
// own work. He stands on a stump behind a table with his scales and three
// wigs on stands (one stand is the skull of a previous customer). Built facing
// +z, at the origin.
import * as THREE from 'three';
import { Model, signTexture, plankTexture, GOTHIC } from './model.js';
import { buildFigure } from './figure.js';
import { bakeFigure } from './bake.js';
import { folkMaterial } from './materials.js';
import { locksMesh } from './locks.js';
import { plumesMesh } from './plumes.js';
import { patchStandardMaterial } from '../../gfx/patch.js';
import { LAYER_SHADOW_NEAR } from '../../gfx/globals.js';
import { vultureRecipe, EYE, EYE_R, WIG_BLOCK } from './vulture.recipe.js';

const WIG_HAIR = {
  wigMop: { root: 0x4a2410, tip: 0xb5642a, shine: 0xffd9a0 },
  wigTower: { root: 0xa07a2c, tip: 0xf7e2a0, shine: 0xffffff },
  wigQuiff: { root: 0x050404, tip: 0x241d18, shine: 0x9fb4e0 },
};

export function buildVulture({ bare = false, baked = null } = {}) {
  const recipe = vultureRecipe();
  const { data, far, hair } = baked || bakeFigure(recipe, { bare });
  const skin = folkMaterial('skin', { color: 0xc8736a, a: [0.35, 1.6, 1.2, 0.3], roughness: 0.56, clearcoat: 0.08, clearcoatRoughness: 0.5 });
  const under = folkMaterial('plain', { color: 0x0f0c0a, a: [0.004, 0.5, 0, 0], roughness: 0.95 });
  const M = {
    head: skin,
    beak: folkMaterial('plain', { color: 0xdccca0, a: [0.006, 0.18, 0, 0], roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
    body: under, wings: under,
    legs: folkMaterial('leather', { color: 0x8c8176, a: [0.0017, 0.6, 0.3, 0], roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.5 }),
    ruff: folkMaterial('felt', { color: 0xd9d2c4, a: [0.001, 1, 0, 0] }),
    rug: folkMaterial('cloth', { color: 0x5a2d14, a: [0.0012, 0.6, 0, 0] }),
  };
  const fig = buildFigure('vulture', recipe.bones, data, M, far);
  const { group, rig, B, meshes, hang } = fig;

  // ---- eyes: yellow, unblinking for longer than is comfortable ----
  const eyeMat = folkMaterial('eye', { sculpted: false, color: 0xe9dfc2, second: 0xc9a52c, a: [0.86, 0.34, 0, 0], roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const lidMat = folkMaterial('skin', { sculpted: false, color: 0x9a6a72, a: [0, 1, 0.6, 0], roughness: 0.55 });
  const eyes = [1, -1].map((s) => {
    const e = fig.eye('head', [s * EYE[0], EYE[1], EYE[2]], EYE_R, eyeMat, lidMat, { under: 0.7 });
    e.ball.rotation.y = s * 0.3;                      // (set at the corners of his head: he looks at you with one, then the other)
    for (const lid of [e.lid, e.low]) lid.rotation.y = s * 0.3;
    return e;
  });

  // ---- the monocle, on a chain ----
  const gold = folkMaterial('plain', { sculpted: false, color: 0xd9b043, a: [0.003, 0.2, 0, 0], roughness: 0.25, metalness: 1 });
  {
    const eyeglass = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.0118, 0.0013, 10, 36), gold);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0112, 32), patchStandardMaterial(new THREE.MeshPhysicalMaterial({
      color: 0xdfeaf0, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, depthWrite: false,
    }), { key: 'folk-lens' }));
    eyeglass.add(rim, lens);
    hang('head', eyeglass, [EYE[0] + 0.0042, EYE[1] - 0.0008, EYE[2] + 0.0092]);
    // (glass casts no shadow, and is not drawn when shadows are)
    lens.userData.shadowMaterial = undefined;
    lens.layers.disable(LAYER_SHADOW_NEAR);
    meshes.splice(meshes.indexOf(lens), 1);
    eyeglass.rotation.y = 0.3;
    // the chain: links, hanging in a curve from the rim to somewhere in his ruff
    const from = new THREE.Vector3(EYE[0] + 0.0148, EYE[1] - 0.006, EYE[2] + 0.005), to = new THREE.Vector3(0.036, 0.345, 0.03);
    const n = 30, link = new THREE.TorusGeometry(0.00165, 0.00042, 5, 10), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), next = new THREE.Vector3();
    const point = (t, out) => out.lerpVectors(from, to, t).add(new THREE.Vector3(0.012, -0.03, 0.006).multiplyScalar(4 * t * (1 - t)));
    // (all the links are one mesh: thirty things to draw would be thirty times the bother for something this small)
    const per = link.attributes.position.count, lp = link.attributes.position, ln = link.attributes.normal, li = link.index;
    const pos = new Float32Array(n * per * 3), nor = new Float32Array(n * per * 3), idx = new Uint16Array(n * li.count);
    const one = new THREE.Object3D(), v = new THREE.Vector3(), turn = new THREE.Matrix3();
    for (let i = 0; i < n; i++) {
      point((i + 0.5) / n, at); point((i + 1) / n, next);
      one.position.copy(at);
      one.quaternion.setFromUnitVectors(up, next.sub(at).normalize());
      one.rotateY(i % 2 ? Math.PI / 2 : 0);
      one.updateMatrix();
      turn.setFromMatrix4(one.matrix);
      for (let k = 0; k < per; k++) {
        v.fromBufferAttribute(lp, k).applyMatrix4(one.matrix).toArray(pos, (i * per + k) * 3);
        v.fromBufferAttribute(ln, k).applyMatrix3(turn).toArray(nor, (i * per + k) * 3);
      }
      for (let k = 0; k < li.count; k++) idx[i * li.count + k] = li.getX(k) + i * per;
    }
    const links = new THREE.BufferGeometry();
    links.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    links.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    links.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * per * 2), 2));
    links.setIndex(new THREE.BufferAttribute(idx, 1));
    const chain = new THREE.Mesh(links, gold);
    hang('head', chain, [0, 0, 0]);
    chain.position.set(-rig.rest.head.x, -rig.rest.head.y, -rig.rest.head.z);
  }

  // ---- feathers; down; a toupee ----
  if (hair.coat) {
    const coat = { base: 0x16110d, edge: 0x6a5540, shaft: 0x6b5a48, shine: 0x8fa0c8 };
    const wing = { base: 0x0d0b09, edge: 0x4a3c2e, shaft: 0x5a4c3e, shine: 0x9fb0d8 };
    fig.grow('body', plumesMesh(hair.coat, { colour: coat }));
    fig.grow('wingL', plumesMesh(hair.covertsL, { colour: wing }));
    fig.grow('wingR', plumesMesh(hair.covertsR, { colour: wing }));
    fig.grow('wingL', plumesMesh(hair.flightL, { colour: wing, flex: 0.004 }));
    fig.grow('wingR', plumesMesh(hair.flightR, { colour: wing, flex: 0.004 }));
    fig.grow('tail', plumesMesh(hair.tail, { colour: wing, flex: 0.004 }));
    fig.grow('body', locksMesh(hair.ruff, { colour: { root: 0xb4ad9f, tip: 0xfbf8f1, shine: 0xffffff }, dense: 6, flex: 0.01 }));
    fig.grow('rug', locksMesh(hair.rug, { colour: { root: 0x4a2410, tip: 0xb5642a, shine: 0xffd9a0 }, dense: 5, flex: 0.01 }));
    fig.grow('head', locksMesh(hair.bristles, { colour: { root: 0x120e0c, tip: 0x2c241e, shine: 0x9a9088 }, dense: 1, flex: 0.003 }));
  }

  fig.bound([0, 0.26, 0], 0.42);
  let turn = 0, nod = 0, blinkIn = 3, blink = 0;
  return {
    group, meshes, height: 0.47, rug: B.rug, rig, data, materials: M, see: fig.see, shade: fig.shade,
    update(dt, t, look, near, pleased = 0) {
      turn += (THREE.MathUtils.clamp(look, -1, 1) * near - turn) * Math.min(1, dt * 3);
      // he looks you up and down; a sale gets a quick greedy nod
      nod += (pleased - nod) * Math.min(1, dt * 6);
      const bob = Math.sin(t * 0.7) * 0.06 + 0.12 * near + Math.sin(t * 16) * 0.12 * nod;
      B.neck1.rotation.set(bob * 0.6, turn * 0.55, 0);
      B.neck2.rotation.set(bob * 0.4, turn * 0.3, 0);
      B.head.rotation.set(-bob * 0.25, turn * 0.15, Math.sin(t * 0.45 + 1) * 0.12 * near);
      B.body.scale.setScalar(1 + Math.sin(t * 1.6) * 0.01);
      // the beak works when there is money in it; the wings settle; the toupee has a life of its own
      B.jaw.rotation.x = 0.03 + 0.05 * near * Math.max(0, Math.sin(t * 5.3)) * Math.max(0, Math.sin(t * 0.8)) + 0.22 * nod * Math.abs(Math.sin(t * 16));
      for (const [name, s] of [['wingL', 1], ['wingR', -1]]) B[name].rotation.z = s * (0.015 * Math.sin(t * 1.1 + s) + 0.1 * nod * Math.abs(Math.sin(t * 8)));
      B.tail.rotation.x = Math.sin(t * 1.3) * 0.03 - 0.08 * nod;
      B.rug.rotation.z = Math.sin(t * 0.9) * 0.015 + nod * Math.sin(t * 16) * 0.09;
      B.rug.rotation.x = nod * Math.sin(t * 16 + 1) * 0.06;
      blinkIn -= dt;
      if (blinkIn <= 0) { blink = 0.14; blinkIn = 3 + Math.random() * 6; }
      blink = Math.max(0, blink - dt);
      for (const e of eyes) e.shut(blink > 0 ? 1 : 0.38 + 0.12 * near - 0.2 * pleased);
    },
  };
}

/** His pitch: a stump to stand on, a table with the scales and the wigs, and a sign. Customers stand at +z. */
export function buildWigTable({ baked = null } = {}) {
  const M = new Model('wig-table');
  const wood = M.mat(0xffffff, { rough: 0.8, map: plankTexture('#5f4630') });
  const bark = M.mat(0x4a3626, { rough: 0.95 });
  const brass = M.mat(0xc9a13f, { rough: 0.3, metal: 1 });
  const bone = M.mat(0xe6dfcc, { rough: 0.6 });
  const dark = M.mat(0x0a0807, { rough: 0.5 });
  const board = M.mat(0xffffff, { rough: 0.75, map: signTexture([{ text: 'Mortimer’s', size: 78, style: '700', font: GOTHIC }, { text: 'fine toupees', size: 31, style: 'italic 500' }, { text: 'hair bought by the gram', size: 23, style: '500' }], { ground: '#1d1a17', ink: '#d9c9a0' }) });
  const all = M.group;

  // the stump he stands on, behind the table
  const stump = M.add(all, new THREE.CylinderGeometry(0.075, 0.095, 0.16, 14), bark, 'stump');
  stump.position.set(0, 0.02, -0.05);
  // the table
  M.box(all, wood, [0.44, 0.014, 0.2], [0, 0.15, 0.2]);
  for (const [x, z] of [[-0.2, 0.12], [0.2, 0.12], [-0.2, 0.28], [0.2, 0.28]]) M.rod(all, wood, [x, -0.06, z], [x, 0.145, z], 0.009);
  // the scales: a post, a beam that tips, two pans
  M.rod(all, brass, [0, 0.157, 0.2], [0, 0.26, 0.2], 0.006, 0.004);
  M.ball(all, brass, 0.014, [0, 0.16, 0.2], [1.6, 0.5, 1.6]);
  const beam = new THREE.Group();
  beam.position.set(0, 0.258, 0.2);
  all.add(beam);
  M.rod(beam, brass, [-0.07, 0, 0], [0.07, 0, 0], 0.003);
  const pans = [];
  for (const s of [-1, 1]) {
    const pan = new THREE.Group();
    pan.position.set(s * 0.07, 0, 0);
    beam.add(pan);
    for (const a of [0, 2.1, 4.2]) M.rod(pan, brass, [0, 0, 0], [Math.cos(a) * 0.026, -0.06, Math.sin(a) * 0.026], 0.0007);
    const dish = M.add(pan, new THREE.CylinderGeometry(0.03, 0.022, 0.008, 18), brass, 'pan');
    dish.position.y = -0.064;
    pans.push(pan);
  }
  // wigs on stands: a ginger mop, a tall fair one, and a black quiff on the skull of somebody who haggled
  const strands = baked ? baked.hair : (() => { const h = vultureRecipe().hair; return { wigMop: h.wigMop(), wigTower: h.wigTower(), wigQuiff: h.wigQuiff() }; })();
  const wigs = [];
  const wig = (x, name, stand = null) => {
    const g = new THREE.Group();
    g.position.set(x, 0.157, 0.2);
    all.add(g);
    M.rod(g, wood, [0, 0, 0], [0, 0.052, 0], 0.004);
    M.ball(g, wood, 0.009, [0, 0.003, 0], [1.6, 0.5, 1.6]);
    if (stand) stand(g); else M.ball(g, wood, 0.0195, WIG_BLOCK.c, [WIG_BLOCK.r[0] / 0.0195 * 0.95, WIG_BLOCK.r[1] / 0.0195 * 0.95, WIG_BLOCK.r[2] / 0.0195 * 0.95]);
    if (strands && strands[name]) {
      const locks = locksMesh(strands[name], { colour: WIG_HAIR[name], dense: 5, flex: 0.008 });
      locks.bound();
      g.add(locks.mesh);
      M.meshes.push(locks.mesh);
      wigs.push(locks);
    }
    return g;
  };
  wig(-0.15, 'wigMop');
  wig(0.115, 'wigTower');
  wig(0.185, 'wigQuiff', (g) => {
    M.ball(g, bone, 0.0205, [0, 0.07, 0], [0.95, 1, 1.05]);
    M.ball(g, bone, 0.012, [0, 0.059, 0.016], [1, 0.8, 1]);
    for (const s of [-1, 1]) M.ball(g, dark, 0.0058, [s * 0.008, 0.072, 0.0165]);
  });
  // the sign, on a post beside the table
  M.rod(all, bark, [-0.3, -0.07, 0.1], [-0.3, 0.5, 0.1], 0.011);
  const sign = M.box(all, board, [0.4, 0.15, 0.012], [-0.3, 0.52, 0.11]);
  sign.rotation.y = 0.25;

  M.castAsOne();
  let tipped = 0;
  return {
    group: M.group, meshes: M.meshes, radius: 0.36,
    /** How far off the eye is (see figure.js): fewer strands to a wig at a distance. */
    see(dist, quality = 1) { const f = Math.min(1, 2.2 / Math.max(dist, 0.01)) * (dist > 6 ? 0.6 : 1) * quality; for (const w of wigs) w.detail(f); },
    /** Round the drawing of the shadow maps (see figure.js): a share of each wig's hair casts its shadow. */
    shade(on) { for (const w of wigs) w.shade(on); },
    /** @param weighing 0..1: there is hair in the pan */
    update(dt, t, weighing) {
      tipped += (weighing - tipped) * Math.min(1, dt * 4);
      beam.rotation.z = -0.32 * tipped + Math.sin(t * 9) * 0.05 * tipped * (1 - tipped) * 4;
      for (const p of pans) p.rotation.z = -beam.rotation.z;
    },
  };
}
