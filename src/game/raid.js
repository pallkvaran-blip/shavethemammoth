// The cave men. Gnorman hires them out as hunters: four of them come running
// over the snow with spears, surround the front of the mammoth and jab at
// him; he tells them that pointing is rude; they see that it is, say sorry,
// and go home. Nothing else comes of it. He does not give refunds.
//
// It is played as a scene: the game steps outside the elf and watches from
// wherever the thing can best be seen, and what anybody says is written over
// their head. The men themselves are in people/caveman.js.
import * as THREE from 'three';
import { buildCaveman, TRIBE } from './people/caveman.js';

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const DEG = Math.PI / 180;

// where they end up: round the front of him, clear of his tusks. Angles are from straight ahead of him, towards his right.
const FRONT = [2.5, 0], RING = 3.75;
const STANDS = [-17, 13, -47, 41];           // Ug in the middle, Thag beside him, Grok out on one wing and the little one on the other
const LATE = [0, 0.25, 0.45, 1.25];          // seconds each is behind the first to arrive (short legs)
const ARRIVE = 4.3, FROM = 21;               // when the first of them gets there, and from how far off they come (metres)

// What is said, by the visit. him: the mammoth; men: one line each, in the order of TRIBE; bye: the mammoth, to their backs.
const SCRIPT = [
  { him: 'Excuse me. Pointing is rude.', men: ['...You’re right.', 'That was uncalled for.', 'We do apologise.', 'Sorry, Mr Mammoth.'], bye: 'Mind how you go.' },
  { him: 'You again. We have talked about this.', men: ['We have.', 'It’s the elf. He keeps paying us.', 'He’s right, though. Again.', 'Sorry, Mr Mammoth.'], bye: 'Lovely to see you. Off you go.' },
  { him: 'Still rude.', men: ['Still sorry.', 'Force of habit.', 'It’s more of a gesture, really.', 'I brought you a pebble.'], bye: 'That is very kind. Go home.' },
];
const CRIES = ['RAAAGH!', 'MEAT!', 'OOGA!', 'Wait for me!'];

// the scene, in seconds
const T = { speak: 7.3, doubt: 8.5, sorry: 10.4, each: 1.55, leave: 16.6, bye: 17.4, end: 20.6 };

/** Where the camera is for each part of it: [from this second, where it stands, what it looks at (or 'men': the middle of them), its angle]. */
const SHOTS = [
  [0, [10.8, 1.15, 6.6], 'men', 42],
  [4.5, [10.6, 0.95, -0.9], [2.7, 2.15, 0.1], 36],
  [T.speak - 0.15, [7.0, 2.45, 2.3], [2.35, 2.3, 0], 26],
  [T.sorry - 0.5, [2.0, 4.4, 0.6], [5.9, 0.9, -0.2], 44],          // (from over his head: what he sees of them)
  [T.leave + 0.4, [1.2, 1.5, 8.8], [7.2, 1.25, -1.2], 40],
];

/** Labels for what people say, each hung over somebody's head (the mammoth has his own: see says.js). */
class Labels {
  constructor(n) {
    const hud = document.getElementById('hud');
    this.list = [];
    if (!hud) return;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'talk';
      el.hidden = true;
      el.dataset.tail = 'down';
      el.innerHTML = '<div class="note"><p class="line"></p><p class="who"></p><i class="tail" aria-hidden="true"></i></div>';
      hud.appendChild(el);
      this.list.push({ el, note: el.firstChild, left: 0, w: 0, h: 0, at: null });
    }
    this._v = new THREE.Vector3();
  }

  /** Label i says this, for so long, over the point `at(out)` gives. */
  say(i, line, who, at, seconds = 2.6, loud = false) {
    const L = this.list[i];
    if (!L) return;
    L.el.querySelector('.line').textContent = line;
    L.el.querySelector('.who').textContent = who;
    L.el.classList.toggle('loud', loud);
    L.el.hidden = false;
    L.w = L.note.offsetWidth; L.h = L.note.offsetHeight;
    L.left = seconds; L.at = at;
    L.note.style.setProperty('--tilt', `${(Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.4)}deg`);
    L.el.classList.remove('show');
    requestAnimationFrame(() => { if (L.left > 0) L.el.classList.add('show'); });
  }

  clear() { for (const L of this.list) { L.left = 0; L.el.classList.remove('show'); L.el.hidden = true; } }

  update(dt, camera) {
    const W = window.innerWidth, H = window.innerHeight, bars = document.body.classList.contains('cine') ? H * 0.11 : 0;
    for (const L of this.list) {
      if (L.left <= 0) continue;
      L.left -= dt;
      if (L.left <= 0) { L.el.classList.remove('show'); const el = L.el; setTimeout(() => { if (L.left <= 0) el.hidden = true; }, 260); continue; }
      const v = L.at(this._v).project(camera);
      if (v.z > 1) { L.el.style.transform = 'translate3d(-999px, -999px, 0)'; continue; }
      const ax = (v.x * 0.5 + 0.5) * W, ay = (0.5 - v.y * 0.5) * H;
      const x = Math.min(W - L.w - 12, Math.max(12, ax - L.w / 2)), y = Math.min(H - bars - L.h - 26, Math.max(bars + 8, ay - L.h - 18));
      L.el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      const at = Math.round(Math.min(L.w - 26, Math.max(26, ax - x)));
      L.el.style.setProperty('--at', `${at}px`);
      L.note.style.setProperty('--ox', `${at}px`); L.note.style.setProperty('--oy', '100%');
    }
  }
}

export class Raid {
  /**
   * @param baking   () => a promise of the cave man, baked (he is not baked until somebody hires him)
   * @param casters  the list of what throws shadows: his parts are added to it
   * @param stage    (on) => void: told when the scene needs more of the snow in front of the mammoth to take shadows, and when it no longer does
   */
  constructor({ scene, mammoth, terrain, rig, sound, state, gags, says, shaving, hint, hero = null, baking, casters, stage = () => {} }) {
    Object.assign(this, { scene, mammoth, terrain, rig, sound, state, gags, says, shaving, hint, hero, baking, casters, stage });
    this.men = null;             // the four of them, once they have been made
    this.play = null;            // the scene under way: { t, cine, script, shot, said, ... }
    this.lingering = false;      // the scene is over, and they are still to be seen walking off
    this.labels = new Labels(TRIBE.length);
    this.time = 0;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
    this.cam = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40 };
    this.onMade = () => {};      // told when the four of them exist
    this.quality = 1;            // how much of their hair there is room to draw (see main.js)
    this.games = 0;              // how many times the game has been begun again
  }

  get playing() { return !!this.play; }

  /** Have him baked, if he has not been (it takes some seconds, on another thread: best begun before anybody asks for him). */
  prepare() { return this._baked || (this._baked = this.baking()); }

  /** Make the four of them (once): this is what takes a moment the first time they are hired. */
  async _make() {
    if (this.men) return this.men;
    if (!this._making) {
      this._making = this.prepare().then((baked) => {
        this.men = TRIBE.map((look, i) => {
          const c = buildCaveman({ baked, look });
          c.group.visible = false;
          this.scene.add(c.group);
          this.casters.push(...c.meshes);
          // where he stands at the end of his run, which way he came from, and when he gets there
          const a = STANDS[i] * DEG, x = FRONT[0] + Math.cos(a) * RING, z = FRONT[1] + Math.sin(a) * RING;
          c.stand = { x, z, face: Math.atan2(2.4 - x, 0 - z) };
          c.index = i;
          return c;
        });
        this.onMade(this.men);
        return this.men;
      });
    }
    return this._making;
  }

  /** Somebody has paid for cave men. */
  start() {
    if (this.play || this.pending) return false;
    this.pending = true;
    if (!this.men) this.hint('<strong>Cave men.</strong> They are on their way. You will hear them before you see them.', 5);
    // (if the game is begun again while they are being made, nobody is waiting for them any more)
    const game = this.games;
    this._make().then(() => { this.pending = false; if (game === this.games) this._begin(); }, (err) => { this.pending = false; console.warn('the cave men could not come', err); });
    return true;
  }

  _begin() {
    const rig = this.rig, visit = this.state.stats.raids || 0;
    this.state.stats.raids = visit + 1;
    this.state.dirty = true;
    // the way they come: from in front of him and a little to his left, where there is nothing in the way but snow
    let bearing = -16 * DEG;
    for (const turn of [0, 14, -14, 28, -28, 42]) {
      const b = (-16 + turn) * DEG;
      let wet = false;
      for (let d = 6; d <= FROM + 4; d += 2) if (this.terrain.isLake && this.terrain.isLake(FRONT[0] + Math.cos(b) * d, Math.sin(b) * d)) { wet = true; break; }
      if (!wet) { bearing = b; break; }
    }
    for (const c of this.men) {
      const along = bearing + (STANDS[c.index] * DEG - bearing) * 0.25, far = FROM + c.index * 1.1;
      c.from = { x: c.stand.x + Math.cos(along) * far, z: c.stand.z + Math.sin(along) * far };
      c.arrive = ARRIVE + LATE[c.index];
      c.away = null;
      c.group.visible = true;
      Object.assign(c.want, { go: 1, gait: 1, level: 0, jab: 0, crouch: 0, shame: 0, shout: 1, wave: 0, lookYaw: 0, lookPitch: 0 });
      c.settle(0);
      this._put(c, 0);
    }
    const cine = rig.mode === 'elf' && !rig.cine && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.play = { t: 0, cine, script: SCRIPT[Math.min(visit, SCRIPT.length - 1)], shot: -1, said: {}, fov: rig.camera.fov };
    this.lingering = false;
    this.stage(true);
    this.gags.pose({ ears: 0.7, nod: 0.06 }, 3);
    if (cine) {
      rig.cine = this.cam;
      this.shaving.hide(true);
      if (this.hero) this.hero.outside = true;
      document.body.classList.add('cine', 'raid');
      this._shoot(0);
    }
    this.sound.warcry();
  }

  /** Where one of them is at a moment of the scene: running in, standing, or walking off. */
  _put(c, t) {
    const g = c.group, s = c.stand;
    let x, z, face, speed = 0;
    if (t < c.arrive) {
      // running in: flat out, and pulling up over the last fifth of the time (by which he has a tenth of the way to go)
      const k = clamp01(t / c.arrive), late = Math.max(0, k - 0.8);
      const far = (k - late * late / 0.4) / 0.9, pace = (1 - late / 0.2) / 0.9;
      x = c.from.x + (s.x - c.from.x) * far; z = c.from.z + (s.z - c.from.z) * far;
      face = Math.atan2(s.x - c.from.x, s.z - c.from.z);
      let d = s.face - face;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      face += d * smooth(span(t, c.arrive - 0.5, c.arrive));
      speed = (Math.hypot(s.x - c.from.x, s.z - c.from.z) / c.arrive) * pace;
    } else if (t < T.leave + c.index * 0.3) {
      x = s.x; z = s.z; face = s.face;
    } else {
      // home: he turns his back, and goes the way he came, at a walk
      const since = t - (T.leave + c.index * 0.3), turn = smooth(clamp01(since / 1.0));
      const back = Math.atan2(c.from.x - s.x, c.from.z - s.z);
      let d = back - s.face;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      face = s.face + d * turn;
      speed = 1.25 * (c.size / 8.2) * smooth(clamp01((since - 0.5) / 0.8));
      if (!c.away) c.away = { d: 0 };
      c.away.d += speed * this._dt;
      const l = Math.hypot(c.from.x - s.x, c.from.z - s.z) || 1;
      x = s.x + ((c.from.x - s.x) / l) * c.away.d; z = s.z + ((c.from.z - s.z) / l) * c.away.d;
    }
    g.position.set(x, this.terrain.height(x, z), z);
    g.rotation.y = face;
    c.state.speed = speed;
  }

  /** The camera, for the part of the scene that time t is in. */
  _shoot(t) {
    let i = 0;
    while (i + 1 < SHOTS.length && t >= SHOTS[i + 1][0]) i++;
    const [, pos, at, fov] = SHOTS[i], cam = this.cam;
    cam.pos.set(pos[0], pos[1] + this.terrain.height(pos[0], pos[2]), pos[2]);
    if (at === 'men') {
      // (the middle of them, as they come)
      cam.target.set(0, 0, 0);
      for (const c of this.men) cam.target.add(c.group.position);
      cam.target.multiplyScalar(1 / this.men.length);
      cam.target.y += 1.05;
      // ...drawing back towards him as they arrive, so that he is in the picture when they get there
      const k = smooth(span(t, 2.2, 4.4));
      cam.target.x += (4.6 - cam.target.x) * k * 0.55; cam.target.z += (0 - cam.target.z) * k * 0.4;
    } else cam.target.set(at[0], at[1], at[2]);
    cam.fov = fov;
    this.play.shot = i;
  }

  /** Any key or click: get on with it. */
  skip() { if (this.play && this.play.cine && this.play.t > 1) this._end(true); }

  _end(cut = false) {
    const p = this.play;
    if (!p) return;
    this.play = null;
    this.labels.clear();
    if (p.cine) {
      if (this.rig.cine === this.cam) this.rig.cine = null;
      if (this.rig.mode === 'elf') { this.rig.camera.fov = p.fov; this.rig.camera.updateProjectionMatrix(); }
      this.shaving.hide(false);
      if (this.hero) this.hero.outside = false;
      document.body.classList.remove('cine', 'raid');
    }
    this.gags.pose({ ears: 0, nod: 0, turn: 0 }, 3);
    if (cut) { for (const c of this.men) c.group.visible = false; this.stage(false); } else this.lingering = true;
    this.hint('<strong>The cave men have gone home.</strong> They said sorry. Gnorman does not give refunds.', 8);
  }

  update(dt, camera) {
    this.time += dt;
    this._dt = dt;
    const p = this.play;
    if (!p && !this.lingering) return;
    const men = this.men, t = p ? (p.t += dt) : T.end + (this.after = (this.after || 0) + dt);
    if (p) this.after = 0;

    // ---- each of them ----
    for (const c of men) {
      const w = c.want;
      if (t < c.arrive) {
        Object.assign(w, { go: 1, gait: 1, shout: 1, level: smooth(span(t, c.arrive - 0.45, c.arrive)), crouch: 0 });
      } else if (t < T.speak + 0.35) {
        Object.assign(w, { go: 0, level: 1, jab: 1, crouch: 1, shout: 1, lookPitch: 0.35 });
      } else if (t < T.doubt + c.index * 0.18) {
        Object.assign(w, { jab: 0, shout: 0, lookPitch: 0.4 });                    // (stopped, mid-jab, looking up at him)
      } else if (t < T.sorry + c.index * T.each) {
        // they look at one another
        const side = c.index % 2 ? 1 : -1, glance = Math.sin((t - T.doubt) * 2.1 + c.index * 1.7);
        Object.assign(w, { level: 0.5, crouch: 0.25, lookPitch: 0.1, lookYaw: 0.75 * side * (glance > 0 ? 1 : -0.6) });
      } else if (t < T.leave + c.index * 0.3) {
        Object.assign(w, { level: 0, crouch: 0, shame: 0.75, lookYaw: 0, lookPitch: 0.25, wave: 0 });
      } else {
        Object.assign(w, { go: 1, gait: 0, level: 0, crouch: 0, shame: 1, lookPitch: 0, lookYaw: 0, wave: c.index === 3 && t > T.bye + 0.6 && t < T.bye + 2.6 ? 1 : 0 });
      }
      if (c.group.visible) {
        this._put(c, t);
        c.update(dt, this.time + c.index);
        // a foot comes down
        const beat = Math.floor(c.state.phase / Math.PI);
        if (beat !== c.beat) {
          c.beat = beat;
          if (c.state.speed > 0.3) this.sound.thump(Math.min(1, 9 / Math.max(3, camera.position.distanceTo(c.group.position))) * (c.state.speed > 2 ? 1 : 0.45));
        }
        c.see(camera.position.distanceTo(c.group.position) * 2.2, this.quality ?? 1, true);
      }
    }

    if (p) {
      // ---- what is said, and when ----
      const once = (key, at, what) => { if (!p.said[key] && t >= at) { p.said[key] = true; what(); } };
      men.forEach((c, i) => once('cry' + i, 0.5 + i * 0.75, () => { this.labels.say(i, CRIES[i], c.look.name, (out) => c.over(out), 1.7, true); }));
      once('cry', 2.6, () => this.sound.warcry());
      once('him', T.speak, () => { this.says.blurt(p.script.him); this.gags.pose({ ears: 0.2, nod: -0.16, turn: 0 }, 4); });
      men.forEach((c, i) => once('sorry' + i, T.sorry + i * T.each, () => { this.labels.say(i, p.script.men[i], c.look.name, (out) => c.over(out), T.each + 0.9); this.sound.mutter(2 + Math.round(p.script.men[i].split(' ').length / 2), i === 3 ? 2.9 : 1.9 + i * 0.15); }));
      once('bye', T.bye, () => { this.says.blurt(p.script.bye); this.gags.pose({ nod: -0.05, ears: 0 }, 3); });
      // ---- the camera ----
      if (p.cine) {
        if (this.rig.mode !== 'elf' || this.rig.cine !== this.cam) { this._end(true); return; }
        const was = p.shot;
        this._shoot(t);
        // (the camera has gone up over his head to look at them: what he said is not left hanging among them)
        if (p.shot !== was && p.shot === 3) this.says.hush();
      }
      if (t >= T.end) this._end(false);
    } else if (this.after > 26 || men.every((c) => c.away && c.away.d > 34)) {
      // they are out of sight, or as good as
      for (const c of men) c.group.visible = false;
      this.lingering = false;
      this.stage(false);
    }
    this.labels.update(dt, camera);
  }

  /** A new game: nobody is coming. */
  reset() {
    this.games++;
    if (this.play) this._end(true);
    if (this.men) for (const c of this.men) c.group.visible = false;
    if (this.lingering) { this.lingering = false; this.stage(false); }
    this.labels.clear();
  }
}
