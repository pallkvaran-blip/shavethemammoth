// What the novelties do. Each of the things in the "Remedies and novelties"
// part of Gnorman's stall works once, on one part of the mammoth: held in the
// hand like a tool (their looks are in tools/novelties.js), pointed at the
// right place, and used by holding the cut button. Something then happens to
// him, he says what he thinks of it, and gold comes out of him somewhere it
// has no business coming out of (coins.js), for the elf to pick up.
//
// The game steps outside the elf for a moment to show where the gold is
// coming from, since it is seldom anywhere he could see from where he stands.
import * as THREE from 'three';
import { ITEMS } from './catalog.js';
import { TRUNK_POINTS } from '../mammoth/anatomy.js';
import { needleGeometry } from './tools/novelties.js';
import { patchStandardMaterial } from '../gfx/patch.js';

const between = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const $ = (id) => document.getElementById(id);

// ---- where each thing is used, and what the player is told about it ----------------------------
// need: said when the thing is in hand and is not pointed at the right place; go: when it is.
const PLACES = {
  leg: { need: 'One of his legs', go: 'tickle' },
  trunk: { need: 'The end of his trunk', go: '' },
  belly: { need: 'His belly: stand under him and look up', go: 'scratch' },
  nails: { need: 'His toenails', go: 'paint' },
  front: { need: 'Stand in front of him, where he can see you', go: '' },
  hide: { need: 'Any part of him', go: '' },
  tusk: { need: 'One of his tusks', go: 'polish' },
  coat: { need: 'Any part of him with hair on it', go: 'spray' },
};

// The cards he is dealt, in order: number, name, and a picture (drawn in a box of 60 by 70, in ink).
const CARDS = [
  { no: '0', name: 'The Fool', art: '<path d="M14 52 30 10 46 52Z" fill="none" stroke-width="3"/><circle cx="30" cy="8" r="4.5"/><path d="M12 52h36" stroke-width="5"/><circle cx="20" cy="64" r="3.5" fill="none" stroke-width="2"/><circle cx="29" cy="64" r="3.5" fill="none" stroke-width="2"/><path d="M22.5 61.5 40 54M27 61 40 58" stroke-width="2"/>' },
  { no: 'XVI', name: 'The Tower', art: '<path d="M20 68V22h-4v-8h6v4h5v-4h6v4h5v-4h6v8h-4v46Z" fill="none" stroke-width="3"/><path d="M27 34h6v9h-6z"/><path d="M48 68 60 26M54 68 66 26M50.5 59h6M52.5 51h6M55 42h6M57.5 33h6" stroke-width="2" transform="translate(-9 0)"/><path d="M8 4 16 16 10 17 18 30" fill="none" stroke-width="2.5"/>' },
  { no: '?', name: 'The Elephant', art: '<ellipse cx="26" cy="38" rx="19" ry="13" fill="none" stroke-width="3"/><circle cx="46" cy="28" r="10" fill="none" stroke-width="3"/><path d="M53 34c5 8 3 20-3 24" fill="none" stroke-width="4" stroke-linecap="round"/><path d="M47 35c6 4 12 3 14-3" fill="none" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="39" cy="27" rx="5" ry="8" fill="none" stroke-width="2.5"/><circle cx="49" cy="25" r="1.6"/><path d="M13 49v14M22 51v12M32 51v12M40 48v15" stroke-width="5" stroke-linecap="round"/><path d="M3 16l4 3M6 9l3 4M60 8l-3 5M66 15l-5 3" stroke-width="2" stroke-linecap="round"/>' },
];

// ---- the things themselves -----------------------------------------------------------------------
// where: one of PLACES. reach: how far off it works (metres from the eyes). takes: seconds of holding it there.
// during: [share of the way through, what he says]. Then `after`: what happens when it has worked, as [seconds, what].
const GAGS = {
  feather: {
    where: 'leg', reach: 0.8, takes: 3.4, doing: 'tickling',
    during: [[0.12, 'Hee.'], [0.45, 'Stop that. Hee hee.'], [0.8, 'STOP. Hee hee hee. I mean it.']],
    after: (g) => [
      [0, () => { g.say('HEE HEE HEE! Stop! Things are falling out of me!'); g.pose({ shudder: 1, flap: 1, wag: 1 }); g.sound.trumpet(); }],
      [0.5, () => { g.pay('coat', { n: 30, over: 1.6, fast: [0.6, 1.8], spread: 0.5 }); g.watch('side', 3.8); }],
      [2.3, () => g.pose({ shudder: 0, flap: 0, wag: 0 })],
      [3.4, () => g.tell('<strong>Loose change,</strong> shaken out of his coat. It is lying all round him: walk over it.')],
    ],
  },
  nosespray: {
    where: 'trunk', reach: 1.05, takes: 1.3, doing: 'spraying', go: 'Hold to squirt',
    during: [[0.5, 'What is... oh.']],
    after: (g) => [
      [0, () => { g.say('Ah... ah... AH...'); g.pose({ trunk: 0.35, nod: 0.22, ears: 0.5 }, 3); g.sound.sneeze(); g.away(); }],
      [0.74, () => {
        g.pose({ trunk: 1, nod: -0.2, ears: 1, shudder: 1 }, 14);
        g.rig.rattle = 1;
        g.pay('trunk', { over: 0.35, fast: [2.6, 5.2], spread: 0.25 });
        g.blast();
        g.watch('trunk', 3);
      }],
      [1.5, () => g.pose({ trunk: 0, nod: 0, ears: 0, shudder: 0 }, 3)],
      [1.7, () => g.say('Excuse me. Keep the change.')],
      [3.2, () => g.tell('<strong>He sneezed money.</strong> It went a long way. It is in front of him, on the snow.')],
    ],
  },
  scratcher: {
    where: 'belly', reach: 1.8, takes: 4.2, doing: 'rubbing',
    during: [[0.1, 'Ooh.'], [0.4, 'Left a bit. Left a bit.'], [0.75, 'There. THERE.']],
    after: (g) => [
      [0, () => { g.say('Ohhh. Ten thousand years I have had that itch.'); g.pose({ tail: 1, wag: 0.4 }, 5); }],
      [0.9, () => { g.sound.fart(true); g.gas(0.5); g.pay('rear', { over: 1.3, fast: [1.4, 3.2], spread: 0.3 }); g.watch('rear', 3.6); }],
      [2.6, () => g.say('I do beg your pardon. ...Was that money?')],
      [3.4, () => g.pose({ tail: 0, wag: 0 }, 3)],
      [3.9, () => g.tell('<strong>Gold has come out of his bottom.</strong> It is behind him. Nobody is going to judge you.')],
    ],
  },
  varnish: {
    where: 'nails', reach: 0.6, takes: 3.2, doing: 'painting',
    during: [[0.2, 'That is cold. What is it?'], [0.7, 'Is it red? Tell me it is red.']],
    after: (g) => [
      [0, () => { g.paintNails(true); g.say('Harlot Red! I feel twenty thousand again.'); g.pose({ nod: 0.14, ears: 0.6, wag: 0.6 }, 4); }],
      [1.1, () => { g.sound.kiss(); g.pay('mouth', { over: 0.7, fast: [1.4, 2.6], spread: 0.3 }); g.watch('nails', 3.4); }],
      [2.6, () => g.pose({ nod: 0, ears: 0, wag: 0 }, 3)],
      [3.6, () => g.tell('<strong>He blew you a kiss.</strong> There was money in it. It is on the snow in front of him.')],
    ],
  },
  tarot: {
    where: 'front', reach: 9, takes: 7.5, doing: 'reading', go: 'Hold to deal',
    during: [[0.06, null, 0], [0.12, 'The Fool. Small, with scissors. I see.'], [0.38, null, 1], [0.45, 'The Tower. Something tall, brought low.'], [0.7, null, 2], [0.78, 'The Elephant. That is not a real card.']],
    after: (g) => [
      [0.4, () => { g.say('...It is a real card, isn’t it.'); g.pose({ droop: 1 }, 2); }],
      [1.9, () => { g.pay('tears', { n: 16, over: 2.6, fast: [0.3, 0.9], spread: 0.25, tumble: 2 }); g.watch('face', 4.2); g.spread(false); }],
      [4.8, () => g.pose({ droop: 0 }, 2)],
      [5.2, () => g.tell('<strong>He wept.</strong> It was gold. It is under his chin. That is how he has always paid for things.')],
    ],
  },
  plunger: {
    where: 'trunk', reach: 0.95, takes: 3, doing: 'pumping', go: 'Hold to pump',
    during: [[0.2, 'What are you... mmf.'], [0.6, 'MMMF.']],
    after: (g) => [
      [0, () => {
        g.sound.cork(); g.tool('popped', 1);
        g.pose({ ears: 1, shudder: 1, nod: 0.12 }, 16);
        g.pay('ears', { over: 0.7, fast: [2.2, 4.2], spread: 0.3 });
        g.watch('front', 3.4);
      }],
      [0.5, () => g.say('POP. My ears! I can hear the sea. I can hear Norway.')],
      [1.2, () => g.away()],
      [1.8, () => g.pose({ shudder: 0, nod: 0 }, 4)],
      [3, () => g.pose({ ears: 0 }, 3)],
      [3.8, () => g.tell('<strong>It came out of his ears.</strong> Both of them. Either side of his head, on the snow.')],
    ],
  },
  needles: {
    where: 'hide', reach: 3.2, count: 5, go: 'Press to throw one',
    each: ['Ow.', 'Ow!', 'Is this medicine? It does not feel like medicine.', 'Ooh.'],
    after: (g) => [
      [0.35, () => { g.say('My back! Ten thousand years of it. GONE.'); g.pose({ nod: 0.2, tail: 0.5, ears: 0.7 }, 5); g.away(); }],
      [1.5, () => { g.sound.trumpet(); g.pay('spout', { n: 40, over: 1.6, fast: [5, 7.6], spread: 0.13 }); g.watch('spout', 4.2); }],
      [3.2, () => g.say('And that will be the blowhole. I did not know I had one.')],
      [4.6, () => g.pose({ nod: 0, tail: 0, ears: 0 }, 3)],
      [5.4, () => g.tell('<strong>Gold came out of the top of his head.</strong> It has rolled off him on every side.')],
    ],
  },
  polish: {
    where: 'tusk', reach: 1.9, takes: 3.8, doing: 'rubbing',
    during: [[0.15, 'Careful. Those are original.'], [0.6, 'Ooh, that is coming up nicely.']],
    after: (g) => [
      [0, () => { g.shineTusks(true); g.say('Look at that. You could eat your dinner off that.'); g.pose({ nod: 0.1 }, 3); }],
      [1.1, () => { g.sound.chaching(); g.pay('tusk', { n: 36, over: 1.5, fast: [0.6, 1.9], spread: 0.35 }); g.watch('tusk', 3.8); }],
      [2.7, () => g.say('Jackpot. They have never done that before.')],
      [3.6, () => g.pose({ nod: 0 }, 3)],
      [4.4, () => g.tell('<strong>His tusk paid out.</strong> In front of him, between the two of them.')],
    ],
  },
  watch: {
    where: 'front', reach: 9, takes: 6, doing: 'swinging', go: 'Hold to swing it',
    during: [[0.1, 'I am not getting sleepy.'], [0.45, 'I am getting... a bit sleepy.'], [0.8, 'Cluck.']],
    after: (g) => [
      [0, () => { g.say('Buk. Buk buk. BUKAWK.'); g.pose({ droop: 0.6, tail: 1, wag: 0.3 }, 3); g.sound.cluck(); }],
      [1.4, () => { g.sound.cork(); g.pay('rear', { n: 1, egg: true, fast: [0.9, 1.4], spread: 0.1, tumble: 1.2 }); g.watch('egg', 3.8); g.away(); }],
      [3.2, () => { g.pose({ droop: 0, tail: 0, wag: 0 }, 3); g.say('What? Why is everybody looking at me? Whose egg is that?'); }],
      [4.6, () => g.tell('<strong>He has laid an egg.</strong> A gold one. It is behind him and it is yours.')],
    ],
  },
  depil: {
    where: 'coat', reach: 1.25, seconds: 4.5, doing: 'spraying', go: 'Hold to spray: keep it moving',
    lines: ['That tingles.', 'It tingles a great deal. Is it meant to?'],
    after: (g) => [
      [0.2, () => { g.say('I can feel a draught. A very particular draught.'); g.away(); }],
      [1.6, () => g.tell('<strong>The can is empty,</strong> and so is that part of him. What fell off is yours to pick up.')],
    ],
  },
};

/** Where the camera stands to watch each place the gold comes out of. */
const SHOTS = {
  rear: { pos: [-4.7, 1.0, 2.1], target: [-2.4, 1.1, 0], fov: 40 },
  egg: { pos: [-4.5, 0.55, 1.7], target: [-2.75, 0.75, 0], fov: 46 },
  side: { pos: [0.3, 1.25, 5.7], target: [0, 1.45, 0], fov: 44 },
  trunk: { pos: [5.9, 0.75, 2.7], target: [3.3, 0.85, 0], fov: 42 },
  nails: { pos: [2.55, 0.16, 1.55], target: [1.3, 0.62, 0.5], fov: 55 },
  face: { pos: [5.6, 2.05, 2.9], target: [2.45, 2.15, 0.3], fov: 28, aside: true },
  front: { pos: [5.9, 3.7, 0.5], target: [1.9, 2.45, 0], fov: 40, aside: true },
  spout: { pos: [6.2, 1.6, 5.4], target: [1.5, 2.9, 0], fov: 42 },
  tusk: { pos: [7.4, 1.5, 2.2], target: [4.0, 1.6, 0.2], fov: 36 },
};

export class Gags {
  constructor({ scene, mammoth, terrain, rig, shaving, sound, state, hint, coins, says, helpers, hero = null, puffs = null }) {
    Object.assign(this, { scene, mammoth, terrain, rig, shaving, sound, state, hint, coins, says, helpers, hero, puffs });
    this.id = null;              // which of them is in hand
    this.on = false;             // it is pointed at the right place
    this.progress = 0;           // how far through using it (0..1)
    this.said = 0;               // how many of its `during` lines he has said
    this.left = 1;               // what is left in a can
    this.thrown = 0;             // needles thrown
    this.flying = [];            // needles in the air: { mesh, from, to, t }
    this.stuck = [];             // needles in him: { mesh, site, off, n0, q0 }
    this.acts = [];              // what is still to happen: [seconds from now, what], soonest first
    this.want = { tail: 0, wag: 0, ears: 0, flap: 0, nod: 0, turn: 0, trunk: 0, curl: 0, shudder: 0, droop: 0 };
    this.rate = 6;               // how quickly he takes up a pose
    this.shot = null;            // the camera is outside the elf: { t, long, cam, fov }
    this.gasFor = 0; this.sparkle = 0; this.sprayIn = 0; this.stripIn = 0; this.soundIn = 0; this.pumps = 0;
    this.done = null;            // the thing that has just worked (and is to be put away)
    this.paying = null;          // the thing whose consequences are being played out at this moment (see _finish)
    this.onUsed = () => {};      // told when one of them has been used up
    this.time = 0;
    this.fuss = null; this.fussed = 0;   // what he is doing about being tickled, or talked to sleep, and when he was last given cause
    this.el = $('aim');
    this.cards = $('spread');
    this._hit = {}; this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._m = new THREE.Matrix4();
    this._p = [0, 0, 0]; this._n = [0, 0, 0]; this._tip = new THREE.Vector3(); this._at = new THREE.Vector3(); this._one = new THREE.Vector3(1, 1, 1);
    this._label = ''; this._ok = null; this._pct = -1;

    // his tusks, as lines of balls (for telling whether one is being pointed at): where they are when he stands at rest
    const T = mammoth.data.anat.tusk;
    this.tusks = [1, -1].map((side) => {
      const curve = new THREE.CatmullRomCurve3(T.points.map((q) => new THREE.Vector3(q[0], q[1], q[2] * side)), false, 'centripetal');
      const balls = [];
      for (let i = 0; i <= 36; i++) { const t = i / 36, p = curve.getPointAt(t); balls.push({ p, r: T.baseRadius * (0.035 + 0.965 * Math.pow(1 - t, 0.62)) * (1 - 0.1 * t), t }); }
      return { side, balls, tip: curve.getPointAt(1), before: curve.getPointAt(0.94) };
    });

    // needles: five to throw, of steel with copper handles
    const { shaft, handle } = needleGeometry();
    const steel = patchStandardMaterial(new THREE.MeshPhysicalMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.22 }), { key: 'needle', bias: 0.01 });
    const copper = patchStandardMaterial(new THREE.MeshPhysicalMaterial({ color: 0xd08a4e, metalness: 1, roughness: 0.35 }), { key: 'needle', bias: 0.01 });
    this.needles = Array.from({ length: 5 }, () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(shaft, steel), new THREE.Mesh(handle, copper));
      g.visible = false;
      g.matrixAutoUpdate = false;
      scene.add(g);
      return g;
    });

    // what was done to him before the game was put down still shows
    const fx = this.state.flags.fx || {};
    if (fx.nails) this.paintNails(true, false);
    if (fx.tusks) this.shineTusks(true, false);
  }

  // ---- parts of him --------------------------------------------------------------------------

  /** A point given where it is when he stands at rest, as it is now: it goes with the bone named. */
  _on(bone, x, y, z, out) {
    const r = this.mammoth.restPos(bone);
    return this.mammoth.bone(bone).localToWorld(out.set(x - r[0], y - r[1], z - r[2]));
  }

  /** The end of his trunk. */
  trunkTip(out) { const a = TRUNK_POINTS[8]; return this._on('trunk7', a[0], a[1], 0, out); }

  /** Where gold comes out, and which way it is thrown: each fills (pos, dir). */
  _outlet(name) {
    const side = this.rig.pos.z >= 0 ? 1 : -1;        // (the side of him the elf is on)
    let k = 0;
    switch (name) {
      case 'rear': return (p, d) => { p.set(-2.31, 1.6, 0); d.set(-1, 0.28, 0); };      // (under where his tail joins him: that part of him keeps still)
      case 'spout': return (p, d) => { this._on('head', 1.93, 3.34, 0, p); d.set(0.04, 1, 0); };
      case 'tears': return (p, d) => { const s = k++ % 2 ? -side : side; this._on('head', 2.35, 2.33, 0.52 * s, p); d.set(0.5, -0.6, 0.5 * s); };
      case 'trunk': return (p, d) => { const a = TRUNK_POINTS[7], b = TRUNK_POINTS[8]; this._on('trunk7', a[0], a[1], 0, this._w); this._on('trunk7', b[0], b[1], 0, p); d.copy(p).sub(this._w).normalize(); d.y += 0.25; p.addScaledVector(d, 0.06); };
      case 'ears': return (p, d) => { const s = k++ % 2 ? -1 : 1; this._on(s > 0 ? 'ear_R' : 'ear_L', 1.74, 2.42, 0.6 * s, p); d.set(0.15, 0.45, s); };
      case 'tusk': return (p, d) => { const t = this.tusks[side > 0 ? 0 : 1]; this._on('head', t.tip.x, t.tip.y, t.tip.z, p); d.copy(t.tip).sub(t.before).normalize(); d.y += 0.6; };
      case 'mouth': return (p, d) => { this._on('head', 2.32, 1.76, 0.24 * side, p); d.set(0.6, 0.15, side); };      // (the corner of his mouth: his trunk is in the way of the front of it)
      case 'coat': return (p, d) => { const s = k++ % 2 ? -1 : 1; p.set(between(-1.7, 1.3), between(1.35, 2.3), s * between(0.9, 1.0)); d.set(between(-0.3, 0.3), 0.5, s); };
      default: return (p, d) => { p.set(3, 1, 0); d.set(1, 1, 0); };
    }
  }

  // ---- what a thing that has worked can do (see `after`, above) ----------------------------------

  say(line) { this.says.blurt(line); }
  tell(html) { if (!this.shot) this.hint(html, 9); else this.later = html; }
  pose(to, rate = 6) { Object.assign(this.want, to); this.rate = rate; }
  tool(key, value) { const t = this.shaving.tools[this.paying || this.done || this.id]; if (t) t[key] = value; }
  gas(seconds) { this.gasFor = seconds; }

  /** The gold for the thing that has just worked, out of the place named. */
  pay(from, opts) {
    const item = ITEMS[this.paying || this.done];
    if (item) this.coins.spout(this._outlet(from), item.pays || 0, opts);
  }

  /** A sneeze: the snow in front of his trunk goes with it. */
  blast() {
    if (!this.puffs) return;
    const p = this.trunkTip(this._v);
    for (let i = 0; i < 70; i++) this.puffs.emit('snow', p.x + between(0.1, 0.5), p.y + between(-0.1, 0.25), p.z + between(-0.2, 0.2), between(2, 7), between(-0.2, 1.6), between(-1.6, 1.6));
  }

  /** The thing in hand has been used up: it is put away, and the tool that was in hand before it comes back. */
  away() {
    const sh = this.shaving, id = sh.next || sh.tool.id;
    if (sh.tools[id].def.gag && !this.state.owns(id)) sh.setTool(this.state.tool);
  }

  /** Step outside the elf to look at the place named, for so many seconds. */
  watch(name, seconds) {
    const s = SHOTS[name];
    if (!s || this.rig.mode !== 'elf' || this.rig.cine || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    const side = name === 'front' || this.rig.pos.z >= 0 ? 1 : -1;       // from the side of him the elf is on
    const cam = { pos: new THREE.Vector3(), target: new THREE.Vector3(s.target[0], s.target[1], s.target[2] * side), fov: s.fov };
    this.shot = { t: 0, long: seconds, fov: this.rig.camera.fov, cam };
    // from where it has been worked out the thing is best seen; or, if the elf is standing in the way of that, from a little further round
    const E = this._w.set(this.rig.pos.x, this.terrain.height(this.rig.pos.x, this.rig.pos.z) + 0.1 + this.rig.height, this.rig.pos.z);
    const dx = s.pos[0] - s.target[0], dz = (s.pos[2] - s.target[2]) * side;
    for (const turn of [0, 0.42, -0.42, 0.84, -0.84]) {
      const c = Math.cos(turn), sn = Math.sin(turn);
      cam.pos.set(cam.target.x + dx * c - dz * sn, s.pos[1], cam.target.z + dx * sn + dz * c);
      const line = this._v.copy(cam.target).sub(cam.pos), along = Math.min(1, Math.max(0, this._tip.copy(E).sub(cam.pos).dot(line) / line.lengthSq()));
      if (this._tip.copy(cam.pos).addScaledVector(line, along).distanceTo(E) > 0.55) break;
    }
    cam.pos.y += this.terrain.height(cam.pos.x, cam.pos.z);
    this.rig.cine = this.shot.cam;
    this.says.aside = !!s.aside;
    this.shaving.hide(true);
    if (this.hero) this.hero.outside = true;
    document.body.classList.add('cine', 'gag');
  }

  /** Any key or click while the camera is out there: back to the elf. */
  skip() { if (this.shot && this.shot.t > 0.7) this.shot.t = this.shot.long; }

  _unwatch() {
    const s = this.shot;
    if (!s) return;
    this.shot = null;
    if (this.rig.cine === s.cam) this.rig.cine = null;
    this.rig.camera.fov = this.rig.mode === 'elf' ? s.fov : this.rig.camera.fov;
    this.rig.camera.updateProjectionMatrix();
    this.shaving.hide(false);
    this.says.aside = false;
    if (this.hero) this.hero.outside = false;
    document.body.classList.remove('cine', 'gag');
    if (this.later) { this.hint(this.later, 9); this.later = null; }
  }

  /** His toenails, painted (or as they were). */
  paintNails(on, keep = true) {
    const m = this.mammoth.horn;
    if (!m) return;
    if (!m.userData.plain) m.userData.plain = { color: m.color.clone(), roughness: m.roughness, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness, bumpScale: m.bumpScale };
    const p = m.userData.plain;
    if (on) { m.color.set(0xd1102a); m.roughness = 0.16; m.clearcoat = 1; m.clearcoatRoughness = 0.07; m.bumpScale = p.bumpScale * 0.3; } else { m.color.copy(p.color); m.roughness = p.roughness; m.clearcoat = p.clearcoat; m.clearcoatRoughness = p.clearcoatRoughness; m.bumpScale = p.bumpScale; }
    if (keep) { (this.state.flags.fx || (this.state.flags.fx = {})).nails = on; this.state.dirty = true; }
  }

  /** His tusks, brought up to a shine (or as they were). */
  shineTusks(on, keep = true) {
    const m = this.mammoth.ivory;
    if (!m) return;
    if (!m.userData.plain) m.userData.plain = { color: m.color.clone(), roughness: m.roughness, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness, bumpScale: m.bumpScale, env: m.envMapIntensity };
    const p = m.userData.plain;
    if (on) { m.color.set(0xfffaf0); m.roughness = 0.12; m.clearcoat = 1; m.clearcoatRoughness = 0.04; m.bumpScale = p.bumpScale * 0.35; m.envMapIntensity = 1.6; if (keep) this.sparkle = 7; } else { m.color.copy(p.color); m.roughness = p.roughness; m.clearcoat = p.clearcoat; m.clearcoatRoughness = p.clearcoatRoughness; m.bumpScale = p.bumpScale; m.envMapIntensity = p.env; }
    if (keep) { (this.state.flags.fx || (this.state.flags.fx = {})).tusks = on; this.state.dirty = true; }
  }

  /** The cards laid out across the foot of the screen (or cleared away). */
  spread(on) {
    const el = this.cards;
    if (!el) return;
    if (!on) { el.classList.remove('show'); clearTimeout(this._cleared); this._cleared = setTimeout(() => { el.hidden = true; }, 500); return; }
    clearTimeout(this._cleared);
    if (!el.firstChild) el.innerHTML = CARDS.map((c) => `<div class="tarot"><div class="back"></div><div class="face"><b>${c.no}</b><svg viewBox="0 0 60 70" aria-hidden="true">${c.art}</svg><span>${c.name}</span></div></div>`).join('');
    for (const c of el.children) c.classList.remove('up');
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
  }

  /** Turn card i face up. */
  turn(i) {
    const el = this.cards;
    if (!el || !el.children[i]) return;
    el.children[i].classList.add('up');
    this.sound.flick();
  }

  /** A new coat: everything is as it was before any of them were used. */
  reset() {
    this.paintNails(false); this.shineTusks(false);
    for (const n of this.needles) n.visible = false;
    this.stuck.length = 0; this.flying.length = 0; this.thrown = 0;
    this.acts.length = 0; this.progress = 0; this.said = 0; this.left = 1; this.done = null; this.pumps = 0;
    for (const id of Object.keys(GAGS)) { const t = this.shaving.tools[id]; if (t) Object.assign(t, { popped: 0, pump: 0, dealt: 0, fling: 0, count: GAGS[id].count }); }
    this.spread(false);
    Object.keys(this.want).forEach((k) => { this.want[k] = 0; });
  }

  // ---- pointing it ---------------------------------------------------------------------------

  /** Whether the thing in hand is pointed at the place it is for. Fills this._at with the spot, where there is one. */
  _find(G, camera, world) {
    const e = camera.matrixWorld.elements, ox = e[12], oy = e[13], oz = e[14], dx = -e[8], dy = -e[9], dz = -e[10];
    const at = this._at;
    switch (G.where) {
      case 'leg': case 'belly': case 'nails': case 'hide': case 'coat': {
        const h = world.hide(camera, this._hit, G.reach);
        if (!h) return false;
        at.set(h.x, h.y, h.z);
        if (G.where === 'leg') return h.y < 1.25 && Math.abs(h.z) > 0.2 && h.x < 1.6;
        if (G.where === 'belly') return h.ny < -0.25 && h.y > 0.9 && h.y < 1.65 && h.x > -1.55 && h.x < 1.45 && Math.abs(h.z) < 0.95;
        if (G.where === 'nails') {
          if (h.y > 0.17) return false;
          for (const f of this.mammoth.data.anat.feet) { const fx = h.x - f.c[0], fz = h.z - f.c[2]; if (Math.hypot(fx, fz) < f.r + 0.09 && Math.abs(Math.atan2(fz, fx)) < 1.5) return true; }
          return false;
        }
        return true;
      }
      case 'trunk': {
        const t = this.trunkTip(at), tx = t.x - ox, ty = t.y - oy, tz = t.z - oz, far = Math.hypot(tx, ty, tz);
        return far < G.reach && (tx * dx + ty * dy + tz * dz) / far > 0.8;
      }
      case 'front': {
        // in front of him, not under his chin, and looking up at his face
        const p = this.rig.pos, fx = p.x - 2.4;
        if (fx < 0.7 || fx > 6.5 || Math.abs(p.z) > 0.7 * fx + 1.3) return false;
        const h = this._on('head', 2.3, 2.3, 0, at), tx = h.x - ox, ty = h.y - oy, tz = h.z - oz, far = Math.hypot(tx, ty, tz);
        return (tx * dx + ty * dy + tz * dz) / far > 0.78;
      }
      case 'tusk': {
        // the ball along either tusk that the line from the eyes passes nearest to
        let best = null, bd = 1e9, bs = 0;
        const head = this.mammoth.bone('head'), r = this.mammoth.restPos('head'), v = this._v;
        for (const tusk of this.tusks) for (const b of tusk.balls) {
          head.localToWorld(v.set(b.p.x - r[0], b.p.y - r[1], b.p.z - r[2]));
          const s = (v.x - ox) * dx + (v.y - oy) * dy + (v.z - oz) * dz;
          if (s < 0.05 || s > G.reach) continue;
          const d = Math.hypot(v.x - ox - dx * s, v.y - oy - dy * s, v.z - oz - dz * s) - b.r;
          if (d < bd) { bd = d; best = b; bs = s; at.copy(v); }
        }
        if (!best || bd > 0.05) return false;
        // (the near side of it)
        at.addScaledVector(this._w.set(ox - at.x, oy - at.y, oz - at.z).normalize(), best.r);
        return true;
      }
      default: return false;
    }
  }

  /** Before the thing in hand is put where it goes: is it pointed at the right place? (A pole is told where to reach.) */
  aim(dt, tool, camera, world) {
    const id = tool.id, G = GAGS[id];
    if (this.id !== id) { this.id = id; this.progress = 0; this.said = 0; this.pumps = 0; }
    if (!G || this.done === id || !this.state.owns(id) || tool.away > 0.5) { this.on = false; tool.aim = null; return; }
    this.on = this._find(G, camera, world);
    if (tool.def.pole) tool.aim = this.on ? this._tip.copy(this._at) : null;
  }

  /** The thing in hand, each frame: used, if it is being held down in the right place. */
  use(dt, tool, camera, world) {
    const id = tool.id, G = GAGS[id];
    if (!G || this.done === id || !this.state.owns(id)) { this._show(null); return; }
    const going = this.on && tool.on && !this.shot;
    const P = PLACES[G.where];
    let pct = this.progress;

    if (id === 'needles') {
      // one for each press of the button
      tool.count = G.count - this.thrown;
      tool.fling = Math.max(0, (tool.fling || 0) - dt / 0.3);
      if (going && !this._held && this.thrown < G.count && !tool.fling) {
        const n = this.needles[this.thrown++], h = this._hit;
        const from = new THREE.Vector3().setFromMatrixPosition(tool.group.matrixWorld);
        this.flying.push({ mesh: n, from, to: new THREE.Vector3(h.x, h.y, h.z), t: 0, long: Math.max(0.09, from.distanceTo(this._at) / 14) });
        tool.fling = 1;
        this.sound.whoosh();
      }
      this._held = tool.on;
      pct = this.thrown / G.count;
    } else if (id === 'depil') {
      tool.spraying = going || (tool.on && this.left > 0) ? 1 : 0;
      if (tool.on && this.left > 0) {
        this.left = Math.max(0, this.left - dt / G.seconds);
        this._spray(dt, tool, camera, going);
        if (going && this.said < 1) { this.said = 1; this.say(G.lines[0]); }
        if (this.left < 0.45 && this.said === 1) { this.said = 2; this.say(G.lines[1]); }
        if (this.left <= 0) this._finish(id);
      }
      pct = 1 - this.left;
    } else {
      tool[G.doing] = going ? 1 : 0;
      if (going) {
        this.progress = Math.min(1, this.progress + dt / G.takes);
        this._busy(dt, id, tool);
        // what he says as it goes on
        while (G.during && this.said < G.during.length && this.progress >= G.during[this.said][0]) {
          const [, line, card] = G.during[this.said++];
          if (line) this.say(line);
          if (card !== undefined) { if (card === 0) this.spread(true); setTimeout(() => this.turn(card), card === 0 ? 350 : 0); }
        }
        if (id === 'tarot') tool.dealt = this.said >= 5 ? 3 : this.said >= 3 ? 2 : this.said >= 1 ? 1 : 0;
        if (this.progress >= 1) this._finish(id);
      } else if (!tool.on && id !== 'tarot') {
        this.progress = Math.max(0, this.progress - dt * 0.08);       // (left off, it has to be worked up to again, a little)
      }
      pct = this.progress;
    }
    this._show(this.done === id ? null : this.on ? (G.go || `Hold to ${P.go}`) : P.need, this.on, pct);
  }

  /** What using the thing in hand looks and sounds like while it goes on. */
  _busy(dt, id, tool) {
    this.soundIn -= dt;
    if (id === 'nosespray') {
      this.sprayIn -= dt;
      if (this.sprayIn <= 0 && this.puffs) {
        this.sprayIn = 0.03;
        const n = tool.def.nozzle, p = this._v.set(n[0], n[1], n[2]).applyMatrix4(tool.group.matrixWorld), t = this._at;
        const l = p.distanceTo(t) || 1;
        this.puffs.emit('mist', p.x, p.y, p.z, ((t.x - p.x) / l) * 2.2, ((t.y - p.y) / l) * 2.2, ((t.z - p.z) / l) * 2.2);
      }
      if (this.soundIn <= 0) { this.soundIn = 0.11; this.sound.hiss(0.1, 5200); }
    } else if (id === 'plunger') {
      const was = this.pumps;
      this.pumps = this.progress * 3;
      tool.pump = this.pumps % 1;
      if (Math.floor(this.pumps + 0.75) !== Math.floor(was + 0.75)) this.sound.shlup();
    } else if (id === 'scratcher' || id === 'polish') {
      if (this.soundIn <= 0) { this.soundIn = id === 'polish' ? 0.19 : 0.13; this.sound.scritch(id === 'polish' ? 0.5 : 1); }
      if (id === 'polish' && this.puffs && Math.random() < dt * 14) this.puffs.emit('spark', this._tip.x + between(-0.05, 0.05), this._tip.y + between(-0.05, 0.05), this._tip.z + between(-0.05, 0.05), 0, 0.1, 0);
    } else if (id === 'feather') {
      if (this.soundIn <= 0) { this.soundIn = 0.16; this.sound.scritch(0.25); }
      this.want.shudder = 0.5 * this.progress; this.rate = 8; this.fuss = 'shudder'; this.fussed = this.time;
    } else if (id === 'varnish') {
      if (this.soundIn <= 0) { this.soundIn = 0.36; this.sound.swish('broom'); }
    } else if (id === 'watch') {
      if (this.soundIn <= 0) { this.soundIn = 0.42; this.sound.tick(); }
      this.want.droop = 0.5 * this.progress; this.rate = 3; this.fuss = 'droop'; this.fussed = this.time;
    }
  }

  /** The can: spray leaves it; and where the spray lands on him, the hair lets go. */
  _spray(dt, tool, camera, onHim) {
    this.sprayIn -= dt; this.soundIn -= dt; this.stripIn -= dt;
    const n = tool.def.nozzle, p = this._v.set(n[0], n[1], n[2]).applyMatrix4(tool.group.matrixWorld);
    const e = camera.matrixWorld.elements;
    if (this.soundIn <= 0) { this.soundIn = 0.1; this.sound.hiss(0.13, 3400); }
    if (this.sprayIn <= 0 && this.puffs) {
      this.sprayIn = 0.022;
      // towards where the eyes are looking (or just out in front, when that is nothing)
      const t = onHim ? this._at : this._w.set(e[12] - e[8] * 1.1, e[13] - e[9] * 1.1, e[14] - e[10] * 1.1);
      const l = p.distanceTo(t) || 1, s = 4.2;
      this.puffs.emit('mist', p.x, p.y, p.z, ((t.x - p.x) / l) * s, ((t.y - p.y) / l) * s + 0.2, ((t.z - p.z) / l) * s);
      if (onHim) this.puffs.emit('fizz', this._at.x + between(-0.2, 0.2), this._at.y + between(-0.2, 0.2), this._at.z + between(-0.2, 0.2), this._hit.nx * 0.3, 0.1, this._hit.nz * 0.3);
    }
    if (onHim && this.stripIn <= 0) {
      this.stripIn = 0.09;
      this.helpers.strip(this._at.x, this._at.y, this._at.z, 0.3, camera);
    }
  }

  /** It has worked. */
  _finish(id) {
    const G = GAGS[id], tool = this.shaving.tools[id];
    if (!G || this.done === id) return;
    this.done = id;
    this.on = false;
    if (tool) { tool.aim = null; for (const k of ['rubbing', 'tickling', 'spraying', 'painting', 'pumping', 'swinging', 'reading']) tool[k] = 0; }
    this.state.spend(id);
    this.onUsed(id);
    this._show(null);
    this.fuss = null;
    const base = this.time;
    // (each thing that is to happen knows which of them it is happening for, should another have been used meanwhile)
    for (const [at, what] of G.after(this)) this.acts.push([base + at, () => { const was = this.paying; this.paying = id; try { what(); } finally { this.paying = was; } }]);
    // (whatever else happens, it is not still in his hand a moment later)
    this.acts.push([base + 1.3, () => this.away()]);
    this.acts.sort((a, b) => a[0] - b[0]);
  }

  /** Dev, and the tests: the thing has worked, wherever the elf is and whatever he is holding. */
  finish(id) {
    if (!GAGS[id]) return false;
    this.state.owned.add(id);
    if (id === 'tarot') { this.spread(true); for (let i = 0; i < 3; i++) this.turn(i); }
    this.id = id;
    this._finish(id);
    return true;
  }

  /** What is written under the middle of the screen while one of them is in hand. */
  _show(label, ok = false, pct = 0) {
    const el = this.el;
    if (!el) return;
    if (!label || this.shot) { if (this._label !== '') { this._label = ''; el.hidden = true; } return; }
    if (label !== this._label) { this._label = label; el.querySelector('span').textContent = label; el.hidden = false; }
    if (ok !== this._ok) { this._ok = ok; el.classList.toggle('ok', ok); }
    const p = Math.round(pct * 100);
    if (p !== this._pct) { this._pct = p; el.style.setProperty('--p', String(pct)); }
  }

  // ---- every frame ---------------------------------------------------------------------------------

  update(dt, camera) {
    this.time += dt;
    const rig = this.rig, m = this.mammoth;
    // nothing of the kind in hand: nothing is written about it
    const held = rig.mode === 'elf' && this.shaving.active && this.shaving.tool.def.gag && !this.shaving.next;
    if (!held) { this._show(null); if (this.cards && !this.cards.hidden && this.done !== 'tarot' && !this.acts.length) this.spread(false); }

    // ---- what is due to happen ----
    while (this.acts.length && this.acts[0][0] <= this.time) this.acts.shift()[1]();
    if (!this.acts.length && this.done) this.done = null;

    // (left alone again, he stops squirming)
    if (this.fuss && this.time - this.fussed > 0.2) { this.want[this.fuss] = 0; this.fuss = null; }
    // ---- he takes up whatever pose he has been given cause to ----
    const P = m.pose, k = Math.min(1, dt * this.rate);
    for (const key of Object.keys(this.want)) P[key] += (this.want[key] - P[key]) * k;

    // ---- the camera, outside ----
    if (this.shot) {
      const s = this.shot;
      s.t += dt;
      if (rig.mode !== 'elf' || rig.cine !== s.cam || s.t >= s.long) this._unwatch();
    }

    // ---- gas; the gleam on a tusk just polished ----
    if (this.gasFor > 0 && this.puffs) {
      this.gasFor -= dt;
      const p = this._v.set(-2.25, 1.66, 0);
      for (let i = 0, n = Math.round(dt * 90); i < n; i++) this.puffs.emit('gas', p.x, p.y + between(-0.05, 0.05), p.z + between(-0.06, 0.06), -between(0.8, 2.2), between(-0.1, 0.5), 0);
    }
    if (this.sparkle > 0 && this.puffs) {
      this.sparkle -= dt;
      if (Math.random() < dt * 26) {
        const t = this.tusks[Math.random() < 0.5 ? 0 : 1], b = t.balls[Math.floor(Math.random() * t.balls.length)];
        const p = this._on('head', b.p.x, b.p.y, b.p.z, this._v);
        this.puffs.emit('spark', p.x + between(-1, 1) * b.r, p.y + between(-1, 1) * b.r, p.z + between(-1, 1) * b.r, 0, 0, 0);
      }
    }

    // ---- needles: in the air, and in him ----
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / f.long;
      const t = Math.min(1, f.t), g = f.mesh;
      const dir = this._v.copy(f.to).sub(f.from).normalize();
      this._q.setFromUnitVectors(this._w.set(1, 0, 0), dir);
      // (it goes in a little way)
      const p = this._w.copy(f.from).lerp(f.to, t).addScaledVector(dir, 0.012 * t);
      g.matrix.compose(p, this._q, this._one);
      g.matrixWorld.copy(g.matrix); g.updateMatrixWorld(true);
      g.visible = true;
      if (f.t >= 1) {
        this.flying.splice(i, 1);
        this._stick(g, p, this._q);
        this.sound.pop();
        const G = GAGS.needles, n = this.stuck.length;
        if (n >= G.count) this._finish('needles'); else if (G.each[n - 1]) this.say(G.each[n - 1]);
        this.want.shudder = 0.6; this.rate = 12;
        this.acts.push([this.time + 0.3, () => { this.want.shudder = 0; }]);
        this.acts.sort((a, b) => a[0] - b[0]);
      }
    }
    if (this.stuck.length) {
      const H = this.helpers, pos = this._p, nrm = this._n;
      for (const s of this.stuck) {
        // it rides on the hide: where its place on him has got to, and turned as that has turned
        H._where(s.site, pos, nrm);
        this._q.setFromUnitVectors(this._v.set(s.n0[0], s.n0[1], s.n0[2]), this._w.set(nrm[0], nrm[1], nrm[2]));
        const p = this._v.set(s.off[0], s.off[1], s.off[2]).applyQuaternion(this._q).add(this._w.set(pos[0], pos[1], pos[2]));
        s.mesh.matrix.compose(p, this._q.multiply(s.q0), this._one);
        s.mesh.matrixWorld.copy(s.mesh.matrix); s.mesh.updateMatrixWorld(true);
      }
    }
  }

  /** A needle has arrived: from now on it goes where that part of him goes. */
  _stick(mesh, p, q) {
    const H = this.helpers, pos = this._p, nrm = this._n;
    const M = H.sites();
    let best = 0, bd = 1e9;
    for (let s = 0; s < M.S; s++) {
      H._where(s, pos, nrm);
      const d = (pos[0] - p.x) ** 2 + (pos[1] - p.y) ** 2 + (pos[2] - p.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    H._where(best, pos, nrm);
    this.stuck.push({ mesh, site: best, off: [p.x - pos[0], p.y - pos[1], p.z - pos[2]], n0: [nrm[0], nrm[1], nrm[2]], q0: q.clone() });
  }
}
