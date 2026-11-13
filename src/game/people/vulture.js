// Mortimer: a vulture, bald by nature and in the wig trade by vocation. He
// buys hair by the gram. He would rather you were dead, professionally
// speaking, but he is prepared to wait.
//
// A hunched black body, a bare pink neck out of a white ruff, a hooked beak,
// a monocle, and on his head an example of his own work. He stands on a stump
// behind a table with his scales and three wigs on stands (one stand is the
// skull of a previous customer). Built facing +z, at the origin.
import * as THREE from 'three';
import { Model, signTexture, plankTexture } from './model.js';

export function buildVulture() {
  const M = new Model('vulture');
  const feather = M.mat(0x17130f, { rough: 0.75, sheen: 0.6 });
  const wing = M.mat(0x0e0c0a, { rough: 0.7, sheen: 0.8 });
  const bare = M.mat(0xc46a62, { rough: 0.55, coat: 0.1 });
  const ruffMat = M.mat(0xece6da, { rough: 1 });
  const horn = M.mat(0xd8c9a0, { rough: 0.4, coat: 0.3 });
  const tip = M.mat(0x2a211a, { rough: 0.4, coat: 0.3 });
  const eye = M.mat(0xd8c25a, { rough: 0.2, coat: 1 });
  const dark = M.mat(0x050404, { rough: 0.2, coat: 1 });
  const gold = M.mat(0xd4a93a, { rough: 0.25, metal: 1 });
  const ginger = M.mat(0x8a4a22, { rough: 0.95, sheen: 0.5 });
  const leg = M.mat(0x9a8f86, { rough: 0.7 });
  const all = M.group;

  // legs and feet
  for (const s of [-1, 1]) {
    M.rod(all, leg, [s * 0.035, 0.11, 0], [s * 0.04, 0.012, 0.006], 0.008, 0.006);
    for (const a of [-0.5, 0, 0.5]) M.rod(all, leg, [s * 0.04, 0.008, 0.006], [s * 0.04 + Math.sin(a) * 0.035, 0.004, 0.006 + Math.cos(a) * 0.035], 0.005, 0.003);
    M.rod(all, leg, [s * 0.04, 0.008, 0.006], [s * 0.04, 0.004, -0.022], 0.005, 0.003);
  }
  // the body, hunched forward; wings folded down its sides; a fan of tail
  const body = new THREE.Group();
  body.position.set(0, 0.2, -0.02); body.rotation.x = 0.22;
  all.add(body);
  M.ball(body, feather, 0.1, [0, 0, 0], [0.92, 1.22, 1.02]);
  for (const s of [-1, 1]) M.ball(body, wing, 0.1, [s * 0.078, -0.01, -0.022], [0.36, 1.3, 0.95]).rotation.z = s * 0.1;
  M.ball(body, wing, 0.07, [0, -0.115, -0.07], [1, 0.35, 0.9]);
  // the ruff, and out of it the neck: it follows the customer about
  const ruff = M.add(all, new THREE.TorusGeometry(0.046, 0.03, 10, 22), ruffMat, 'ruff');
  ruff.rotation.x = Math.PI / 2 - 0.25; ruff.position.set(0, 0.318, 0.012);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; M.ball(all, ruffMat, 0.024, [Math.cos(a) * 0.052, 0.318 + Math.sin(a) * 0.012, 0.012 + Math.sin(a) * 0.05]); }
  const neck = new THREE.Group();
  neck.position.set(0, 0.325, 0.02);
  all.add(neck);
  M.rod(neck, bare, [0, 0, 0], [0, 0.062, 0.042], 0.023, 0.02);
  M.rod(neck, bare, [0, 0.062, 0.042], [0, 0.115, 0.04], 0.02, 0.018);
  for (const y of [0.03, 0.075]) { const r = M.add(neck, new THREE.TorusGeometry(0.0215, 0.0035, 6, 16), bare, 'wrinkle'); r.rotation.x = Math.PI / 2; r.position.set(0, y, y * 0.55); }
  const head = new THREE.Group();
  head.position.set(0, 0.13, 0.05);
  neck.add(head);
  M.ball(head, bare, 0.036, [0, 0, 0], [0.94, 0.94, 1.12]);
  // the beak: long, and hooked over at the end
  const beak = M.add(head, new THREE.ConeGeometry(0.017, 0.062, 12), horn, 'beak');
  beak.rotation.x = Math.PI / 2 + 0.25; beak.position.set(0, -0.012, 0.058);
  M.ball(head, tip, 0.008, [0, -0.026, 0.082], [0.8, 1.3, 0.9]);
  for (const s of [-1, 1]) {
    M.ball(head, eye, 0.0085, [s * 0.022, 0.008, 0.027]);
    M.ball(head, dark, 0.004, [s * 0.0245, 0.008, 0.0335]);
    M.ball(head, bare, 0.013, [s * 0.021, 0.02, 0.026], [1.2, 0.5, 1]).rotation.z = -s * 0.5;      // a brow that has seen things
  }
  // the monocle, on a chain
  const glass = M.add(head, new THREE.TorusGeometry(0.0125, 0.0018, 6, 20), gold, 'monocle');
  glass.position.set(0.024, 0.006, 0.034); glass.rotation.y = 0.5;
  M.rod(head, gold, [0.034, -0.004, 0.03], [0.03, -0.09, 0.0], 0.0008);
  // the toupee: ginger, askew, fooling nobody
  const rug = new THREE.Group();
  rug.position.set(0.004, 0.03, -0.004); rug.rotation.z = 0.22;
  head.add(rug);
  M.ball(rug, ginger, 0.037, [0, 0, 0], [1.05, 0.42, 1.15]);
  M.ball(rug, ginger, 0.025, [-0.02, 0.006, 0.022], [1.2, 0.4, 0.8]);

  let turn = 0, nod = 0;
  return {
    group: M.group, meshes: M.meshes, height: 0.47, rug,
    update(dt, t, look, near, pleased = 0) {
      turn += (THREE.MathUtils.clamp(look, -1, 1) * near - turn) * Math.min(1, dt * 3);
      neck.rotation.y = turn;
      // he looks you up and down; a sale gets a quick greedy nod
      nod += (pleased - nod) * Math.min(1, dt * 6);
      neck.rotation.x = Math.sin(t * 0.7) * 0.06 + 0.12 * near + Math.sin(t * 16) * 0.12 * nod;
      head.rotation.z = Math.sin(t * 0.45 + 1) * 0.12 * near;
      body.scale.setScalar(1 + Math.sin(t * 1.6) * 0.01);
    },
  };
}

/** His pitch: a stump to stand on, a table with the scales and the wigs, and a sign. Customers stand at +z. */
export function buildWigTable() {
  const M = new Model('wig-table');
  const wood = M.mat(0xffffff, { rough: 0.8, map: plankTexture('#5f4630') });
  const bark = M.mat(0x4a3626, { rough: 0.95 });
  const brass = M.mat(0xc9a13f, { rough: 0.3, metal: 1 });
  const bone = M.mat(0xe6dfcc, { rough: 0.6 });
  const dark = M.mat(0x0a0807, { rough: 0.5 });
  const board = M.mat(0xffffff, { rough: 0.75, map: signTexture([{ text: "MORTIMER'S", size: 60, style: 'bold' }, { text: 'fine toupees', size: 34, style: 'italic' }, { text: 'hair bought by the gram', size: 24 }], { ground: '#1d1a17', ink: '#d9c9a0' }) });
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
  // wigs on stands: a ginger mop, a tall blonde one, and a black quiff on the skull of somebody who haggled
  const wig = (x, colour, build, stand = null) => {
    const g = new THREE.Group();
    g.position.set(x, 0.157, 0.2);
    all.add(g);
    M.rod(g, wood, [0, 0, 0], [0, 0.055, 0], 0.004);
    if (stand) stand(g); else M.ball(g, wood, 0.022, [0, 0.07, 0], [0.9, 1.05, 0.95]);
    build(g, M.mat(colour, { rough: 0.95, sheen: 0.6 }));
    return g;
  };
  wig(-0.15, 0x8a4a22, (g, m) => { M.ball(g, m, 0.03, [0, 0.082, 0], [1.1, 0.75, 1.1]); for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283; M.ball(g, m, 0.014, [Math.cos(a) * 0.026, 0.066, Math.sin(a) * 0.026], [1, 1.6, 1]); } });
  wig(0.115, 0xd9b45a, (g, m) => { M.ball(g, m, 0.026, [0, 0.085, 0]); M.ball(g, m, 0.024, [0, 0.116, -0.004], [0.9, 1.3, 0.9]); M.ball(g, m, 0.017, [0, 0.148, -0.008], [0.9, 1.2, 0.9]); });
  wig(0.185, 0x141210, (g, m) => { M.ball(g, m, 0.024, [0, 0.086, -0.004], [1, 0.6, 1.1]); M.ball(g, m, 0.017, [0, 0.094, 0.018], [1, 0.9, 1.1]); }, (g) => {
    M.ball(g, bone, 0.021, [0, 0.068, 0], [0.95, 1, 1.05]);
    M.ball(g, bone, 0.012, [0, 0.058, 0.017], [1, 0.8, 1]);
    for (const s of [-1, 1]) M.ball(g, dark, 0.0058, [s * 0.008, 0.071, 0.017]);
  });
  // the sign, on a post beside the table
  M.rod(all, bark, [-0.3, -0.07, 0.1], [-0.3, 0.5, 0.1], 0.011);
  const sign = M.box(all, board, [0.4, 0.15, 0.012], [-0.3, 0.52, 0.11]);
  sign.rotation.y = 0.25;

  let tipped = 0;
  return {
    group: M.group, meshes: M.meshes, radius: 0.36,
    /** @param weighing 0..1: there is hair in the pan */
    update(dt, t, weighing) {
      tipped += (weighing - tipped) * Math.min(1, dt * 4);
      beam.rotation.z = -0.32 * tipped + Math.sin(t * 9) * 0.05 * tipped * (1 - tipped) * 4;
      for (const p of pans) p.rotation.z = -beam.rotation.z;
    },
  };
}
