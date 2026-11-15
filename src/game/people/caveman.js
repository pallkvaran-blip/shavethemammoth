// A cave man. A metre seventy of him, most of it across; hair to his
// shoulders, a beard to his chest, one eyebrow, somebody else's fur over one
// shoulder, bare feet, and a spear with a flint on the end of it that he knows
// which way round to hold. He can run, stop, level the spear at something a
// great deal bigger than he is and jab at it, think better of it, be sorry,
// and walk away. That is the whole of what is asked of him (see raid.js).
//
// He is sculpted like the others (see sculpt.js, and caveman.recipe.js for
// the design), but at the size the elf is, and stood in the world eight times
// larger. His legs are driven by the turn of a wheel (a stride is once round
// it); his arms go wherever the spear is, which is where the rest of him has
// decided it should be.
import * as THREE from 'three';
import { buildFigure } from './figure.js';
import { bakeFigure } from './bake.js';
import { folkMaterial } from './materials.js';
import { locksMesh } from './locks.js';
import { cavemanRecipe, ARM, SHOULDER, UPPER, FORE, HAND, HIP, KNEE, ANKLE, EYE, EYE_R, HEIGHT } from './caveman.recipe.js';

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const SIZE = 4.8;                       // how many times the size he was sculpted he stands: a metre, less than a third of the mammoth
const SPEAR = 0.262, GRIP = 0.118;            // the spear's length, and how far from its butt the hand at the back holds it (as sculpted)
const THIGH = Math.hypot(HIP[0] - KNEE[0], HIP[1] - KNEE[1], HIP[2] - KNEE[2]), SHIN = Math.hypot(KNEE[1] - ANKLE[1], KNEE[2] - ANKLE[2]);

/** The four of them: what each looks like, and how big he is beside the others. */
export const TRIBE = [
  { name: 'Ug', size: 1.06, skin: 0xb07a58, hair: { root: 0x140b06, tip: 0x4a2c16, shine: 0xc9a27a }, pelt: 0x5b3a21, mane: true, beard: true },
  { name: 'Thag', size: 0.98, skin: 0xc08d6c, hair: { root: 0x3a1206, tip: 0xb5521c, shine: 0xffc48a }, pelt: 0x6e5236, mane: true, beard: false },
  { name: 'Grok', size: 1.02, skin: 0x9a6a4c, hair: { root: 0x3c3a38, tip: 0xa9a59c, shine: 0xffffff }, pelt: 0x3f2c1c, mane: false, beard: true },
  { name: 'Little Nug', size: 0.74, skin: 0xc79676, hair: { root: 0x4a3312, tip: 0xc79a4a, shine: 0xffe6b0 }, pelt: 0x7a5a36, mane: true, beard: false },
];

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3(), _g = new THREE.Vector3();
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qu = new THREE.Quaternion(), _fk = new THREE.Quaternion(), _eu = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * @param look   one of TRIBE (or the like)
 * @param scale  how many times the size he was sculpted (SIZE in the game; 1 to look at him the size he was made)
 */
export function buildCaveman({ bare = false, baked = null, look = TRIBE[0], scale = SIZE } = {}) {
  const recipe = cavemanRecipe();
  const { data, far, hair } = baked || bakeFigure(recipe, { bare });
  const size = scale * (look.size || 1);
  const skin = folkMaterial('skin', { color: look.skin, a: [0, 0.5, 0.7, 0.35], roughness: 0.6, clearcoat: 0.05, clearcoatRoughness: 0.6 });
  const M = {
    skin,
    pelt: folkMaterial('felt', { color: look.pelt, a: [0.0011, 1.3, 0, 0], sheen: 0.5, sheenRoughness: 0.7, sheenColor: 0xa98a66 }),
  };
  const fig = buildFigure('caveman', recipe.bones, data, M, far);
  const { group, rig, B, meshes, hang } = fig;
  group.scale.setScalar(size);

  // ---- eyes: small, close together, and a long way back ----
  const eyeMat = folkMaterial('eye', { sculpted: false, color: 0xefe8da, second: 0x4a321c, a: [0.7, 0.34, 0, 0], roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const lidMat = folkMaterial('skin', { sculpted: false, color: new THREE.Color(look.skin).multiplyScalar(0.8), a: [0, 0.6, 0.35, 0], roughness: 0.55 });
  const eyes = [1, -1].map((s) => fig.eye('head', [s * EYE[0], EYE[1], EYE[2]], EYE_R, eyeMat, lidMat, { under: 0.7 }));

  // ---- hair: on his head, his chin, his brow, the pelt, and most of the rest of him ----
  const wide = (strands) => strands.width * size;       // (a hair is as much thicker as he is bigger)
  if (hair.mane) {
    const colour = look.hair, dull = { root: new THREE.Color(look.pelt).multiplyScalar(0.35), tip: new THREE.Color(look.pelt).multiplyScalar(1.5), shine: 0xd9c4a0 };
    if (look.mane !== false) fig.grow('head', locksMesh(hair.mane, { colour, dense: 5, width: wide(hair.mane), flex: 0.05 }));
    if (look.beard !== false) fig.grow('head', locksMesh(hair.beard, { colour, dense: 5, width: wide(hair.beard), flex: 0.035 }));
    fig.grow('head', locksMesh(hair.brow, { colour, dense: 3, width: wide(hair.brow), flex: 0.004 }));
    for (const [name, bone] of [['furChest', 'chest'], ['furSpine', 'spine'], ['furHips', 'hips']]) fig.grow(bone, locksMesh(hair[name], { colour: dull, dense: 4, width: wide(hair[name]), flex: 0.02, gloss: 0.6 }));
    for (const [name, bone] of [['fuzzChest', 'chest'], ['fuzzForeL', 'foreL'], ['fuzzForeR', 'foreR'], ['fuzzShinL', 'shinL'], ['fuzzShinR', 'shinR']]) fig.grow(bone, locksMesh(hair[name], { colour, dense: 2, width: wide(hair[name]), flex: 0.006, gloss: 0.5 }));
  }

  // ---- the spear: an ash pole, a flint the shape of a leaf, and the sinew that keeps the one on the other ----
  const spear = new THREE.Group();
  spear.name = 'spear';
  group.add(spear);
  {
    const wood = folkMaterial('plain', { sculpted: false, color: 0x6a4a2a, a: [0.0012, 0.5, 0, 0], roughness: 0.75 });
    const flint = folkMaterial('plain', { sculpted: false, color: 0x2c2d31, a: [0.0006, 0.5, 0, 0], roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.25, flatShading: true });
    const sinew = folkMaterial('plain', { sculpted: false, color: 0xcdb58a, a: [0.0004, 0.6, 0, 0], roughness: 0.8 });
    const shaft = new THREE.CylinderGeometry(0.00155, 0.0019, SPEAR, 9, 12);
    shaft.translate(0, SPEAR / 2, 0);
    // (not turned on a lathe: it has the bends it grew with)
    const sp = shaft.attributes.position;
    for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); sp.setX(i, sp.getX(i) + 0.0011 * Math.sin(y * 31)); sp.setZ(i, sp.getZ(i) + 0.0008 * Math.sin(y * 23 + 1)); }
    shaft.computeVertexNormals();
    const head = new THREE.OctahedronGeometry(1, 1);
    const hp = head.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      // a leaf: widest a third of the way up, knapped to a point, flat
      const y = hp.getY(i), k = y > -0.4 ? 1 - 0.55 * ((y + 0.4) / 1.4) ** 1.6 : 0.62;
      hp.setXYZ(i, hp.getX(i) * 0.0064 * k * (1 + 0.12 * Math.sin(i * 12.9898)), y * 0.0172 + 0.004, hp.getZ(i) * 0.0021 * k);
    }
    head.computeVertexNormals();
    const tip = new THREE.Mesh(head, flint);
    tip.position.y = SPEAR + 0.0085;
    const bind = new THREE.Mesh(new THREE.CylinderGeometry(0.0029, 0.0025, 0.0125, 10, 6), sinew);
    bind.position.y = SPEAR - 0.003;
    { const bp = bind.geometry.attributes.position; for (let i = 0; i < bp.count; i++) { const k = 1 + 0.12 * Math.sin(bp.getY(i) * 2400); bp.setX(i, bp.getX(i) * k); bp.setZ(i, bp.getZ(i) * k); } bind.geometry.computeVertexNormals(); }
    spear.add(new THREE.Mesh(shaft, wood), tip, bind);
    hang('hips', spear, [0, 0, 0]);          // (pinned for its shadow and its place among his parts; it is then taken off that bone and put where his hands are)
    group.add(spear);
  }

  // ---- how he holds himself ----
  // go: moving (0 standing .. 1); gait: 0 a walk .. 1 a run; level: the spear held in both hands and pointed; jab: thrusting it;
  // crouch: knees bent, feet apart; shame: all of him let down; shout: his mouth open; wave: his free hand up; lookYaw, lookPitch: where his head is turned
  const pose = { go: 0, gait: 1, level: 0, jab: 0, crouch: 0, shame: 0, shout: 0, wave: 0, lookYaw: 0, lookPitch: 0 };
  const want = { ...pose };
  const home = {};
  for (const b of rig.list) home[b.name] = b.position.clone();
  let phase = Math.random() * 6.283, blinkIn = 1 + Math.random() * 3, blink = 0, jabAt = Math.random() * 6.283, sway = Math.random() * 6.283;
  const state = { speed: 0, heading: 0, phase: 0 };
  const rest = (name) => rig.rest[name];
  const restDir = (a, b) => new THREE.Vector3().subVectors(rest(b), rest(a)).normalize();
  const U0 = { L: restDir('armL', 'foreL'), R: restDir('armR', 'foreR') }, F0 = { L: restDir('foreL', 'handL'), R: restDir('foreR', 'handR') };
  const A = UPPER, Bn = FORE + HAND * 0.9;
  const G = new THREE.Vector3(), D = new THREE.Vector3(), G2 = new THREE.Vector3();

  /** One leg at a point of its stride (u: 0..1 round the wheel): how far forward the thigh is, and how bent the knee. */
  const stride = (u, gait, out) => {
    const st = lerp(0.6, 0.38, gait), tf = lerp(0.42, 0.9, gait), tb = lerp(0.3, 0.62, gait), fold = lerp(0.85, 1.75, gait);
    if (u < st) { const k = u / st; out[0] = lerp(tf, -tb, k); out[1] = 0.22 + 0.24 * Math.sin(Math.PI * k) * (0.5 + 0.5 * gait); }      // on the ground: it goes back under him
    else { const k = (u - st) / (1 - st); out[0] = lerp(-tb, tf, smooth(k)); out[1] = 0.22 + fold * Math.pow(Math.sin(Math.PI * Math.pow(k, 0.8)), 1.3); }   // in the air: folded, and brought forward
    return out;
  };
  const leg = [0, 0], other = [0, 0];

  /** Turn an arm so that its hand is at a point (in the world): the shoulder and the elbow are turned, the elbow kept towards `pole`. */
  const reach = (side, target, pole, weight, fk) => {
    const sh = B['arm' + side], el = B['fore' + side], scaleNow = group.scale.x;
    const a = A * scaleNow, b = Bn * scaleNow;
    sh.parent.getWorldQuaternion(_qp);
    const S = sh.getWorldPosition(_v);
    const d = _t.copy(target).sub(S);
    const far = Math.min(a + b - 0.002 * scaleNow, Math.max(Math.abs(a - b) + 0.002 * scaleNow, d.length()));
    d.normalize();
    const cosA = (a * a + far * far - b * b) / (2 * a * far), up = a * Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const p = _p.copy(pole).addScaledVector(d, -pole.dot(d));
    if (p.lengthSq() < 1e-8) p.set(0, -1, 0).addScaledVector(d, d.y);
    p.normalize();
    const e = _e.copy(d).multiplyScalar(a * cosA).addScaledVector(p, up).normalize();             // shoulder to elbow
    // the shoulder: from where the upper arm would point if it were left alone, to where it must
    _r.setFromUnitVectors(_w.copy(U0[side]).applyQuaternion(_qp), e);
    _qu.copy(_r).multiply(_qp);
    _q.copy(_qp).invert().multiply(_qu);
    if (weight < 1) sh.quaternion.copy(fk.sh).slerp(_q, weight); else sh.quaternion.copy(_q);
    sh.updateMatrixWorld(true);
    // the elbow: from wherever that has put it, the forearm goes to the hand
    sh.getWorldQuaternion(_qu);
    const E = el.getWorldPosition(_w), f = _f.copy(S).addScaledVector(d, far).sub(E).normalize();
    _r.setFromUnitVectors(_g.copy(F0[side]).applyQuaternion(_qu), f);
    _q.copy(_qu).invert().multiply(_r).multiply(_qu);
    if (weight < 1) el.quaternion.copy(fk.el).slerp(_q, weight); else el.quaternion.copy(_q);
  };
  const fkL = { sh: new THREE.Quaternion(), el: new THREE.Quaternion() };
  const poleR = new THREE.Vector3(), poleL = new THREE.Vector3(), handAt = new THREE.Vector3();

  const apply = (t) => {
    const go = pose.go, gait = pose.gait, run = go * gait, walk = go * (1 - gait), level = pose.level, shame = pose.shame, crouch = pose.crouch * (1 - go);
    // ---- legs ----
    const u = ((phase / 6.283185) % 1 + 1) % 1;
    stride(u, gait, leg); stride((u + 0.5) % 1, gait, other);
    let reachDown = 0;
    for (const [side, s, L] of [['L', 1, leg], ['R', -1, other]]) {
      const th = L[0] * go + 0.36 * crouch + 0.05 * shame, kn = L[1] * go + 0.74 * crouch + 0.12 * shame;
      B['thigh' + side].rotation.set(-th, s * (0.1 * crouch), s * (0.05 + 0.2 * crouch + 0.03 * (1 - go)));
      B['shin' + side].rotation.set(kn, 0, 0);
      // the foot: flat on the snow while it is down, toes down as it leaves, toes up as it lands
      const lift = go * Math.max(0, kn - 0.5);
      B['foot' + side].rotation.set(th - kn + 0.35 * lift, 0, -s * 0.2 * crouch);
      reachDown = Math.max(reachDown, THIGH * Math.cos(th) + SHIN * Math.cos(th - kn));
    }
    // (whichever leg reaches further down is the one he stands on: his hips are that far up, and a little further at a run, when neither is)
    const bounce = run * 0.0055 * Math.abs(Math.sin(phase)) + walk * 0.0015 * Math.abs(Math.sin(phase));
    B.hips.position.set(home.hips.x + 0.002 * walk * Math.sin(phase), home.hips.y - (THIGH + SHIN - reachDown) * (1 - 0.35 * run) + bounce - 0.0015 * shame, home.hips.z);
    // ---- the trunk ----
    const lean = 0.42 * run + 0.1 * walk + 0.3 * crouch + 0.16 * level * (1 - go);
    B.hips.rotation.set(lean * 0.35, 0.12 * go * Math.sin(phase), 0.03 * walk * Math.sin(phase));
    B.spine.rotation.set(lean * 0.35 + 0.16 * shame, -0.2 * go * Math.sin(phase) + 0.12 * level * (1 - go), 0);
    B.chest.rotation.set(lean * 0.3 + 0.22 * shame + 0.012 * Math.sin(t * 2.4 + sway) * (1 - go), -0.12 * go * Math.sin(phase) + 0.14 * level * (1 - go), 0);
    // ---- the head: on a neck that does not turn far ----
    B.neck.rotation.set(-lean * 0.45 + 0.2 * shame - pose.lookPitch * 0.4, pose.lookYaw * 0.4, 0);
    B.head.rotation.set(-lean * 0.4 + 0.42 * shame - pose.lookPitch * 0.6 + 0.03 * run * Math.sin(phase * 2), pose.lookYaw * 0.6, 0.06 * shame * Math.sin(sway) + 0.03 * Math.sin(t * 0.7 + sway) * (1 - go));
    B.jaw.rotation.x = pose.shout * (0.34 + 0.16 * Math.sin(t * 11 + sway)) + 0.05 * shame;
    for (const e of eyes) { e.shut(blink > 0 ? 1 : Math.max(0.3 + 0.12 * pose.shout, 0.66 * shame)); e.ball.rotation.x = 0.35 * shame - 0.2 * pose.lookPitch; }
    group.updateMatrixWorld(true);

    // ---- the spear, and the arms that have hold of it ----
    // three ways of holding it: over his shoulder at a run, levelled in both hands, and stood on its butt like a staff
    const wStaff = Math.max(shame, 1 - Math.max(go, level)) * (1 - level), wLevel = level, wOver = Math.max(0, 1 - wLevel - wStaff);
    const thrust = pose.jab * Math.max(0, Math.sin(t * 7.5 + jabAt)) * 0.03, shake = run * 0.006 * Math.sin(phase * 2 + 1);
    G.set(0, 0, 0); D.set(0, 0, 0);
    G.x += wOver * -0.044 + wLevel * -0.036 + wStaff * -0.052;
    G.y += wOver * (0.2 + shake) + wLevel * (0.128 - 0.02 * crouch) + wStaff * (0.118 - 0.012 * shame);
    G.z += wOver * -0.004 + wLevel * (-0.004 + thrust) + wStaff * 0.03;
    D.x += wOver * 0.02 + wLevel * 0.2 + wStaff * (0.03 + 0.1 * shame);
    D.y += wOver * 0.13 + wLevel * 0.2 + wStaff * 1;
    D.z += wOver * 1 + wLevel * 1 + wStaff * (-0.1 - 0.3 * shame);
    D.normalize();
    // (it goes with the lean of him)
    G.z += lean * 0.03; G.y -= lean * 0.008;
    const grip = lerp(GRIP, 0.105, wStaff);
    spear.position.copy(G).addScaledVector(D, -grip);
    // (stood on the snow, its butt is on the snow)
    if (wStaff > 0.5 && spear.position.y < 0.001) spear.position.y = 0.001;
    spear.quaternion.setFromUnitVectors(UP, D);
    spear.updateMatrixWorld(true);
    // his right hand is always on it; his left takes it further along when it is levelled, and otherwise swings, or hangs, or waves
    group.getWorldQuaternion(_fk);
    poleR.set(-0.8, -0.7, -0.5).applyQuaternion(_fk); poleL.set(0.9, -0.8, -0.1).applyQuaternion(_fk);
    reach('R', group.localToWorld(handAt.copy(spear.position).addScaledVector(D, grip)), poleR, 1, null);
    const swing = go * (0.2 + 0.75 * Math.sin(phase + Math.PI)) * (0.5 + 0.5 * gait), wave = pose.wave;
    // (how far out from straight down it hangs is reckoned from how it was sculpted: ARM out already)
    fkL.sh.setFromEuler(_eu.set(-swing - 0.25 * run + 0.1 * shame - 2.3 * wave, 0, 0.2 + 0.08 * (1 - go) - 0.06 * shame + 0.45 * wave - ARM));
    fkL.el.setFromEuler(_eu.set(-(0.35 + 1.2 * run + 0.3 * walk + 0.35 * wave * (1 + 0.6 * Math.sin(t * 9))) , 0, 0.5 * wave * Math.sin(t * 9)));
    reach('L', group.localToWorld(G2.copy(spear.position).addScaledVector(D, grip + 0.058)), poleL, smooth(clamp01(level * 1.4 - 0.2)), fkL);
    B.handR.rotation.set(0, 0, 0); B.handL.rotation.set(0, 0, 0.2 * wave * Math.sin(t * 9));
    group.updateMatrixWorld(true);
  };

  const bald = look.mane === false;
  return {
    group, meshes, height: HEIGHT * size, size, look, want, pose, state, rig, B, data, materials: M, spear, bald,
    see: (dist, quality, inView) => fig.see(dist / size, quality, inView), shade: fig.shade,
    /** A point over his head (in the world), for whatever he has to say to hang from. */
    over(out) { return B.head.getWorldPosition(out).add(_v.set(0, 0.052 * size, 0)); },
    /** Jump straight to the pose asked for. */
    settle(t = 0) { Object.assign(pose, want); apply(t); },
    /** dt: seconds; t: the time; state.speed is how fast he is going over the ground (metres a second), which is what turns his legs. */
    update(dt, t) {
      const k = (rate) => Math.min(1, dt * rate);
      pose.go += (want.go - pose.go) * k(7);
      pose.gait += (want.gait - pose.gait) * k(4);
      pose.level += (want.level - pose.level) * k(want.level > pose.level ? 7 : 3.2);
      pose.jab += (want.jab - pose.jab) * k(5);
      pose.crouch += (want.crouch - pose.crouch) * k(6);
      pose.shame += (want.shame - pose.shame) * k(2.6);
      pose.shout += (want.shout - pose.shout) * k(9);
      pose.wave += (want.wave - pose.wave) * k(6);
      pose.lookYaw += (want.lookYaw - pose.lookYaw) * k(4.5);
      pose.lookPitch += (want.lookPitch - pose.lookPitch) * k(4.5);
      // a stride is as long as his legs: at a run about three metres for a full-sized one, at a walk half that
      const long = lerp(1.35, 2.9, pose.gait) * (size / SIZE);
      phase += (dt * state.speed * 6.283185) / long;
      state.phase = phase;
      blinkIn -= dt;
      if (blinkIn <= 0) { blink = 0.12; blinkIn = 1.5 + Math.random() * 3.5; }
      blink = Math.max(0, blink - dt);
      apply(t);
    },
  };
}
