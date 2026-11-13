// The rest of the comedy: what the mammoth does while he is being shaved, what
// he can be made to wear, the remarks at each milestone, the small honours,
// and the end.
import * as THREE from 'three';
import { Model } from './people/model.js';
import { canvasTexture } from './tool.js';

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (a, b) => a + Math.random() * (b - a);

const SAYS = {
  rumble: [
    'He sighs. It ruffles your hat.',
    'He shifts his weight. The ground considers its options.',
    'He looks down at you. He is not angry. He is disappointed.',
    'His stomach says something long and private.',
    'He is thinking about grass. He is always thinking about grass.',
    'He has seen empires of ice rise and fall. He has not seen anything like you.',
    'He flaps an ear. Somewhere behind you, weather happens.',
  ],
  fart: [
    'He did that on purpose.',
    'That was him. It will go on being him for some minutes.',
    'Ten thousand years of holding it in.',
    'The thong does nothing to help.',
    'Gnorman, downwind, takes off his hat.',
  ],
  fartNear: [
    'You were standing right behind him. You have only yourself to blame.',
    'Your eyebrows will grow back. Probably.',
    'There is a reason nobody shaves that end first.',
  ],
  sneeze: [
    'He sneezed. Bless him. You are wearing most of it.',
    'A sneeze. The snow in front of him is somebody else’s problem now.',
  ],
};

const MILESTONES = [
  [0.02, 'You have made a start. He has not noticed.'],
  [0.1, '<strong>A tenth of him is bald.</strong> He has noticed.'],
  [0.25, '<strong>A quarter gone.</strong> There is a draught, and he knows who to thank.'],
  [0.5, '<strong>Half a mammoth.</strong> From the right angle he is already an elephant.'],
  [0.75, '<strong>Three quarters.</strong> He is cold, and you are why.'],
  [0.9, '<strong>Nearly there.</strong> The legend is nearly you.'],
];

const FEATS = {
  sold: '<strong>First sale.</strong> You are now in the hair trade, like Mortimer, but alive.',
  kilo: '<strong>A kilo of mammoth sold.</strong> Somewhere a bald man is about to be very warm.',
  perched: '<strong>You are standing on a mammoth.</strong> Take a moment. He is.',
  thud: '<strong>Gravity: still undefeated.</strong>',
  high: '<strong>Higher than he is.</strong> The view is mostly mammoth.',
  rich: '<strong>A thousand gold in hand.</strong> Gnorman can smell it from here.',
};

function bands(a, b, n) {
  return canvasTexture(8, 128, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(0, (i * h) / n, w, h / n + 1); } }, true);
}

/** Things for him to wear. Each is built where it sits on him at rest, and rides on his head. */
function buildOutfit(mammoth) {
  const eye = mammoth.data.anat.eye, body = mammoth.collider, n = [0, 0, 0];
  const out = {};
  const onSkin = (from, dir, off) => {
    // walk in from outside until the hide is met, and stop a little short of it
    const p = new THREE.Vector3(...from), d = new THREE.Vector3(...dir).normalize();
    for (let i = 0; i < 200; i++) { const dist = body.dist(p.x, p.y, p.z); if (dist < off) break; p.addScaledVector(d, Math.min(0.2, Math.max((dist - off) * 0.8, 0.002))); }
    body.normal(p.x, p.y, p.z, n);
    return { p, n: new THREE.Vector3(n[0], n[1], n[2]).normalize() };
  };
  {
    // a party hat: on the crown of his head, on a slant, with elastic he cannot see
    const M = new Model('party-hat');
    const card = M.mat(0xffffff, { rough: 0.6, coat: 0.3, map: bands('#d9338a', '#f3e9d0', 9) }), fluff = M.mat(0xf3e9d0, { rough: 1 });
    const top = onSkin([1.95, 4.2, 0.12], [0, -1, 0], 0.02);
    const hat = new THREE.Group();
    hat.position.copy(top.p); hat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.n.clone().add(new THREE.Vector3(0.1, 0.5, 0.25)).normalize());
    M.group.add(hat);
    const cone = M.add(hat, new THREE.ConeGeometry(0.2, 0.55, 28, 1, true), card, 'hat');
    cone.position.y = 0.275; cone.material.side = THREE.DoubleSide;
    M.ball(hat, fluff, 0.055, [0, 0.56, 0]);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; M.ball(hat, fluff, 0.035, [Math.cos(a) * 0.2, 0.01, Math.sin(a) * 0.2]); }
    out.partyhat = M;
  }
  {
    // sunglasses: a lens over each eye, a bar across the brow, an arm back along each temple
    const M = new Model('sunglasses');
    const lens = M.mat(0x020203, { rough: 0.12, coat: 1 }), frame = M.mat(0x16171a, { rough: 0.35, coat: 0.6 });
    const brow = onSkin([eye.pos[0] + 1.2, eye.pos[1] + 0.16, 0], [-1, 0, 0], 0.035);
    for (const s of [-1, 1]) {
      const at = onSkin([eye.pos[0] + 0.25, eye.pos[1], s * (Math.abs(eye.pos[2]) + 0.8)], [-0.3, 0, -s], 0.05);
      const g = new THREE.Group();
      g.position.copy(at.p); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), at.n);
      M.group.add(g);
      M.ball(g, lens, 0.12, [0, 0, 0], [1.15, 0.9, 0.16]);
      const rim = M.add(g, new THREE.TorusGeometry(0.115, 0.014, 8, 28), frame, 'rim');
      rim.scale.set(1.15, 0.9, 1);
      M.rod(M.group, frame, [at.p.x + 0.05, at.p.y + 0.09, at.p.z], [brow.p.x, brow.p.y, brow.p.z * 0.2 + s * 0.05], 0.014);
      M.rod(M.group, frame, [at.p.x - 0.08, at.p.y + 0.04, at.p.z], [at.p.x - 0.75, at.p.y + 0.12, at.p.z + s * 0.1], 0.012);
    }
    out.shades = M;
  }
  // everything rides on his head
  const head = mammoth.bone('head'), r = mammoth.restPos('head');
  for (const M of Object.values(out)) {
    M.group.position.sub(new THREE.Vector3(r[0], r[1], r[2]));
    M.group.visible = false;
    head.add(M.group);
  }
  return out;
}

const NATURAL = { uRootColor: [0.011, 0.008, 0.007], uMidColor: [0.076, 0.047, 0.029], uLightColor: [0.185, 0.118, 0.07], uGingerColor: [0.25, 0.125, 0.058], uWoolColor: [0.165, 0.125, 0.092] };
// (the sun here is low and orange and takes most of the blue out of everything: the dye is bluer than it will look)
const PINK = { uRootColor: [0.035, 0.007, 0.035], uMidColor: [0.3, 0.06, 0.3], uLightColor: [0.72, 0.27, 0.78], uGingerColor: [0.75, 0.26, 0.72], uWoolColor: [0.44, 0.15, 0.44] };

export class Antics {
  constructor({ mammoth, rig, sound, hint, state, puffs, terrain, shaving }) {
    Object.assign(this, { mammoth, rig, sound, hint, state, puffs, terrain, shaving });
    this.outfit = buildOutfit(mammoth);
    this.casters = Object.values(this.outfit).flatMap((M) => M.meshes);
    this.next = { rumble: between(20, 40), fart: between(70, 130) };
    this.front = 0;                 // seconds the elf has stood in front of the trunk
    this.gas = 0;                   // seconds of it still coming out
    this.quiet = 6;                 // seconds before the next remark may be made (so they do not talk over one another)
    this.onBald = () => {};
    this.ready = () => true;        // (the end waits for anything else that has to be said first)
    this.hush = () => false;        // (and his remarks wait while the player is being told something that matters)
    this._v = new THREE.Vector3();
    this.dress();
    this.dye();
  }

  /** Show what he has been given to wear. */
  dress() {
    for (const [id, M] of Object.entries(this.outfit)) M.group.visible = this.state.worn.includes(id);
  }

  /** His colour: his own, or the other one. */
  dye() {
    const u = this.mammoth.furMats.uniforms, to = this.state.flags.pink ? PINK : NATURAL;
    for (const [name, c] of Object.entries(to)) if (u[name]) u[name].value.setRGB(c[0], c[1], c[2]);
  }

  say(html, seconds = 6) {
    if (this.quiet > 0 || this.hush()) return false;
    this.hint(html, seconds);
    this.quiet = seconds + 5;
    return true;
  }

  /** An honour, given once. */
  feat(id) {
    const done = this.state.flags.feats || (this.state.flags.feats = {});
    if (done[id] || !FEATS[id]) return;
    done[id] = true;
    this.state.dirty = true;
    this.hint(FEATS[id], 7);
    this.quiet = 10;
    this.sound.coin(2);
  }

  /** Where his rear is, in the world. */
  _rear(out) { return out.set(-2.2, 1.72, 0); }

  update(dt, { elf, busy }) {
    const s = this.state, rig = this.rig;
    this.quiet = Math.max(0, this.quiet - dt);
    if (rig.rattle > 0) rig.rattle = Math.max(0, rig.rattle - dt * 1.6);      // (a jolt dies away, whatever else is going on)
    // ---- gas, once started, takes a moment ----
    if (this.gas > 0) {
      this.gas -= dt;
      const p = this._rear(this._v);
      for (let i = 0, n = Math.round(dt * 90); i < n; i++) this.puffs.emit('gas', p.x, p.y + (Math.random() - 0.5) * 0.1, p.z + (Math.random() - 0.5) * 0.12, -between(0.8, 2.2), between(-0.1, 0.5), 0);
    }
    if (!elf || busy) return;

    // ---- what he does ----
    this.next.rumble -= dt; this.next.fart -= dt;
    const behind = rig.pos.x < -1.9 && Math.abs(rig.pos.z) < 1.3 && rig.pos.x > -4.5;
    if (behind) this.next.fart -= dt * 2.5;                      // (he knows)
    if (this.next.fart <= 0) {
      this.next.fart = between(90, 200);
      const big = Math.random() < 0.3;
      this.sound.fart(big);
      this.gas = big ? 1.6 : 0.7;
      rig.rattle = behind ? 1 : 0;
      this.quiet = 0;
      this.say(pick(behind ? SAYS.fartNear : SAYS.fart), 6);
      s.stats.farts = (s.stats.farts || 0) + 1;
    } else if (this.next.rumble <= 0) {
      this.next.rumble = between(35, 80);
      this.sound.rumble();
      if (Math.random() < 0.45) this.say(pick(SAYS.rumble), 5);
    }
    // stood in front of the trunk long enough, he sneezes on whoever it is
    const inFront = rig.pos.x > 2.5 && rig.pos.x < 4.2 && Math.abs(rig.pos.z) < 0.9 && rig.height < 1;
    this.front = inFront ? this.front + dt : 0;
    if (this.front > 9) {
      this.front = -25;
      this.sound.sneeze();
      this.sneezeIn = 0.72;
    }
    if (this.sneezeIn > 0) {
      this.sneezeIn -= dt;
      if (this.sneezeIn <= 0) {
        rig.rattle = 1;
        for (let i = 0; i < 60; i++) this.puffs.emit('snow', 2.85 + Math.random() * 0.2, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3, between(2, 6), between(0, 1.5), between(-1.5, 1.5));
        this.quiet = 0;
        this.say(pick(SAYS.sneeze), 6);
      }
    }

    // ---- how far he has got ----
    const shorn = this.mammoth.shorn, told = s.flags.told || (s.flags.told = {});
    for (const [at, line] of MILESTONES) {
      if (shorn >= at && !told[at]) {
        told[at] = true; s.dirty = true;
        if (at >= 0.1) this.sound.trumpet();
        this.quiet = 0;
        this.say(line, 8);
        break;
      }
    }
    if (shorn >= 0.985 && !s.flags.done && this.quiet <= 0 && this.ready()) { s.flags.done = true; s.dirty = true; this.onBald(); }

    // ---- honours ----
    if (s.stats.sold > 0) this.feat('sold');
    if (s.stats.sold >= 1000) this.feat('kilo');
    if (rig.perched && rig.height > 1.5) this.feat('perched');
    if (rig.height > 3.6) this.feat('high');
    if (s.gold >= 1000) this.feat('rich');
  }
}
