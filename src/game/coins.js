// Gold. Not the gold in the purse, which is a number: the gold that comes out
// of a mammoth when the right thing is done to the right part of him (see
// gags.js). It is thrown from wherever it comes from, turns over in the air,
// bounces off him and off the snow, and lies there shining until the elf
// walks over it, when it jumps into his pocket and becomes a number after all.
//
// His coins are the size he is: to an elf, each is a dinner plate.
import * as THREE from 'three';
import { patchStandardMaterial } from '../gfx/patch.js';
import { makeInstancedDepthMaterial } from '../gfx/shadows.js';
import { LAYER_SHADOW_NEAR } from '../gfx/globals.js';
import { canvasTexture } from './tool.js';

const MOST = 260;                 // coins that can be about at once
const R = 0.042, THICK = 0.0074;  // a coin: its radius, and how thick it is at the rim (metres)
const BALL = 0.024;               // what it is taken for while it is in the air (a tumbling coin is not flat for long)
const EGG = 0.066;                // an egg's half-length
const GRAVITY = 9.8;
const REACH = 0.46;               // how near the elf has to be to a coin on the snow to have it
const FLYING = 0, LYING = 1, TAKEN = 2;

const between = (a, b) => a + Math.random() * (b - a);

/** The face of a coin: a rim of dots, and him in the middle. White stands proud. */
function reliefTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = 'rgb(118,118,118)'; g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    g.fillStyle = 'rgb(200,200,200)';
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * 44, Math.sin(a) * 44, 2.6, 0, Math.PI * 2); g.fill(); }
    // a mammoth, as struck by somebody who had heard one described: a hump, a head, a trunk, a tusk
    g.fillStyle = 'rgb(235,235,235)';
    g.beginPath(); g.ellipse(-6, 2, 22, 15, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(2, -10, 13, 10, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(17, -6, 10, 11, 0.2, 0, Math.PI * 2); g.fill();
    g.fillRect(-22, 8, 8, 16); g.fillRect(-4, 8, 8, 16);
    g.lineWidth = 6; g.lineCap = 'round'; g.strokeStyle = 'rgb(235,235,235)';
    g.beginPath(); g.moveTo(24, 0); g.quadraticCurveTo(30, 16, 22, 24); g.stroke();
    g.lineWidth = 3; g.strokeStyle = 'rgb(255,255,255)';
    g.beginPath(); g.moveTo(20, 2); g.quadraticCurveTo(40, 14, 32, -8); g.stroke();
  }, false);
}

/** A coin: a disc with a raised rim, lying in the plane of x and z. */
function coinGeometry() {
  const rim = R * 0.84, dish = THICK * 0.34, half = THICK / 2;
  const profile = [[0, dish], [rim - 0.0018, dish], [rim, half], [R - 0.0009, half], [R, half - 0.0009], [R, -half + 0.0009], [R - 0.0009, -half], [rim, -half], [rim - 0.0018, -dish], [0, -dish]];
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  // (the picture on it is laid on from above, and shows through to the other side the right way round)
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * R), 0.5 + p.getZ(i) / (2 * R));
  return geo;
}

/** An egg, its fat end down the -y way. */
function eggGeometry() {
  const pts = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22, a = t * Math.PI, y = -Math.cos(a) * EGG;
    // (narrower towards the top: an egg, not a ball)
    pts.push(new THREE.Vector2(Math.sin(a) * EGG * 0.74 * (1 - 0.17 * (y / EGG)), y));
  }
  return new THREE.LatheGeometry(pts, 30);
}

export class Coins {
  /**
   * @param owed  (gold) => void: told how much gold is lying about, whenever that changes (so that it can be kept)
   */
  constructor({ scene, terrain, mammoth, rig, sound, state }) {
    Object.assign(this, { terrain, mammoth, rig, sound, state });
    const relief = reliefTexture();
    const gold = patchStandardMaterial(new THREE.MeshPhysicalMaterial({
      color: 0xffcf6a, metalness: 1, roughness: 0.3, bumpMap: relief, bumpScale: 1.6, envMapIntensity: 1.5,
    }), { key: 'gold', bias: 0.012, radius: 0.012, offset: 0.004 });
    const depth = makeInstancedDepthMaterial();
    const make = (geo, most, name) => {
      const mesh = new THREE.InstancedMesh(geo, gold, most);
      mesh.name = name; mesh.count = 0; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.shadowMaterial = depth;
      mesh.layers.enable(LAYER_SHADOW_NEAR);
      scene.add(mesh);
      return mesh;
    };
    this.mesh = make(coinGeometry(), MOST, 'gold');
    this.eggs = make(eggGeometry(), 4, 'golden egg');
    this.casters = [this.mesh, this.eggs];

    const N = MOST + 4;
    this.n = 0;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.spin = new Float32Array(N * 3);
    this.quat = new Float32Array(N * 4);
    this.what = new Uint8Array(N);          // FLYING, LYING, TAKEN
    this.egg = new Uint8Array(N);
    this.worth = new Float32Array(N);
    this.age = new Float32Array(N);
    this.from = new Float32Array(N * 3);    // where a coin being taken was lying
    this.due = [];                          // coins yet to come out: { at, origin, n, each, extra, opts }
    this.time = 0;
    this.moved = true;
    this.clinkIn = 0;
    this.taken = 0;                         // gold picked up since anyone last asked (see Gags)
    this.onTake = null;                     // told the gold in each coin as it is pocketed
    this.puffs = null;                      // where a glint comes from (see lift.js): gold catches the sun as it turns, and now and then as it lies
    this.glintIn = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._d = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._o = new THREE.Vector3(); this._dir = new THREE.Vector3(); this._g = [0, 0, 0];
  }

  /** Gold that has come out of him and not been picked up yet. */
  get lying() {
    let g = 0;
    for (let i = 0; i < this.n; i++) g += this.worth[i];
    for (const d of this.due) g += d.left;
    return g;
  }

  /**
   * Gold comes out. `origin(pos, dir)` is asked where from and which way, each time a coin leaves (what it comes out
   * of may be moving). opts: n coins, over so many seconds, at speeds between `fast[0]` and `fast[1]`, thrown as wide
   * as `spread` (0 = all one way, 1 = any way), turning over `tumble` times a second; `egg`: it is an egg.
   */
  spout(origin, gold, { n = Math.max(10, Math.min(40, Math.round(gold / 6))), over = 0.7, fast = [2, 4], spread = 0.35, tumble = 5, egg = false, delay = 0 } = {}) {
    gold = Math.round(gold);
    if (gold <= 0) return;
    n = Math.max(1, Math.min(n, gold));
    this.due.push({ origin, at: this.time + delay, every: n > 1 ? over / (n - 1) : 0, n, each: Math.floor(gold / n), extra: gold - Math.floor(gold / n) * n, left: gold, fast, spread, tumble, egg });
    this.state.owed = this.lying;
    this.state.dirty = true;
  }

  _add(x, y, z, vx, vy, vz, worth, egg, tumble) {
    // (no room: the oldest one lying about is pocketed for him, where it lies)
    if (this.n >= MOST) { let old = -1; for (let i = 0; i < this.n; i++) if (this.what[i] === LYING && (old < 0 || this.age[i] > this.age[old])) old = i; if (old < 0) old = 0; this._pocket(old); this._drop(old); }
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const a = Math.random() * Math.PI * 2, b = Math.acos(between(-1, 1)), w = tumble * Math.PI * 2 * between(0.6, 1.3);
    this.spin[i * 3] = Math.sin(b) * Math.cos(a) * w; this.spin[i * 3 + 1] = Math.cos(b) * w * 0.3; this.spin[i * 3 + 2] = Math.sin(b) * Math.sin(a) * w;
    this._q.set(between(-1, 1), between(-1, 1), between(-1, 1), between(-1, 1)).normalize();
    this.quat[i * 4] = this._q.x; this.quat[i * 4 + 1] = this._q.y; this.quat[i * 4 + 2] = this._q.z; this.quat[i * 4 + 3] = this._q.w;
    this.what[i] = FLYING; this.egg[i] = egg ? 1 : 0; this.worth[i] = worth; this.age[i] = 0;
    this.moved = true;
    return i;
  }

  _drop(i) {
    const last = --this.n;
    if (i !== last) {
      for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[last * 3 + k]; this.vel[i * 3 + k] = this.vel[last * 3 + k]; this.spin[i * 3 + k] = this.spin[last * 3 + k]; this.from[i * 3 + k] = this.from[last * 3 + k]; }
      for (let k = 0; k < 4; k++) this.quat[i * 4 + k] = this.quat[last * 4 + k];
      this.what[i] = this.what[last]; this.egg[i] = this.egg[last]; this.worth[i] = this.worth[last]; this.age[i] = this.age[last];
    }
    this.moved = true;
  }

  _pocket(i) {
    const gold = this.worth[i];
    this.worth[i] = 0;
    if (gold <= 0) return;
    this.taken += gold;
    this.state.earn(gold);
    this.state.owed = this.lying;
    if (this.onTake) this.onTake(gold, !!this.egg[i]);
  }

  /** Lay a coin flat on the snow where it is. */
  _settle(i) {
    const T = this.terrain, e = 0.03;
    let x = this.pos[i * 3], z = this.pos[i * 3 + 2];
    // (not where the elf cannot get at it: under one of the mammoth's feet, or in among the legs of a stall)
    const clear = (cx, cz, r) => { const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz); if (d < r) { const k = d > 1e-4 ? r / d : 0; x = cx + (d > 1e-4 ? dx * k : r); z = cz + dz * k; } };
    for (const f of this.mammoth.data.anat.feet) clear(f.c[0], f.c[2], f.r + 0.1);
    for (const o of this.rig.obstacles || []) clear(o.x, o.z, o.r + 0.16);
    this.pos[i * 3] = x; this.pos[i * 3 + 2] = z;
    const h = T.height(x, z);
    if (this.egg[i]) {
      // (an egg lies on its side)
      this.pos[i * 3 + 1] = h + EGG * 0.72;
      this._q.setFromAxisAngle(this._s.set(0, 0, 1), Math.PI / 2 + between(-0.12, 0.12)).premultiply(this._d.setFromAxisAngle(this._s.set(0, 1, 0), Math.random() * 6.283));
    } else {
      // as the snow lies there, and turned any way round; and as often as not stuck in it on its edge, at whatever slant it landed
      const nx = T.height(x - e, z) - T.height(x + e, z), nz = T.height(x, z - e) - T.height(x, z + e);
      const slant = Math.random() < 0.55 ? between(0.25, 1.15) : between(0, 0.12);
      this._q.setFromUnitVectors(this._s.set(0, 1, 0), this._p.set(nx, 2 * e, nz).normalize()).multiply(this._d.setFromAxisAngle(this._s.set(0, 1, 0), Math.random() * 6.283)).multiply(this._d.setFromAxisAngle(this._s.set(1, 0, 0), slant));
      this.pos[i * 3 + 1] = h + THICK * 0.5 + Math.sin(slant) * R * 0.72;
      if (slant > 0.2) { this.quat[i * 4] = this._q.x; this.quat[i * 4 + 1] = this._q.y; this.quat[i * 4 + 2] = this._q.z; this.quat[i * 4 + 3] = this._q.w; this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0; this.what[i] = LYING; return; }
      // (a coin on top of another lies on top of it)
      let on = 0;
      for (let k = 0; k < this.n; k++) if (k !== i && this.what[k] === LYING && !this.egg[k] && Math.hypot(this.pos[k * 3] - x, this.pos[k * 3 + 2] - z) < R * 1.5) on = Math.max(on, this.pos[k * 3 + 1] - T.height(this.pos[k * 3], this.pos[k * 3 + 2]) + THICK * 0.5);
      this.pos[i * 3 + 1] = h + THICK * 0.5 + on;
    }
    this.quat[i * 4] = this._q.x; this.quat[i * 4 + 1] = this._q.y; this.quat[i * 4 + 2] = this._q.z; this.quat[i * 4 + 3] = this._q.w;
    this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0;
    this.what[i] = LYING;
  }

  /** Gold that was left lying about when the game was last put down: in a heap, near where the elf comes down. */
  restore(gold, x = 1.95, z = 1.55) {
    gold = Math.round(gold);
    if (gold <= 0) return;
    const n = Math.max(1, Math.min(40, Math.round(gold / 8))), each = Math.floor(gold / n);
    for (let k = 0; k < n; k++) {
      const a = k * 2.399963, r = 0.035 * Math.sqrt(k);
      const i = this._add(x + Math.cos(a) * r, 0, z + Math.sin(a) * r, 0, 0, 0, each + (k === 0 ? gold - each * n : 0), false, 0);
      this._settle(i);
    }
    this.state.owed = this.lying;
  }

  /** All of it, gone (a new game). */
  clear() {
    this.n = 0; this.due.length = 0; this.taken = 0; this.moved = true;
    this.state.owed = 0;
  }

  update(dt, camera) {
    this.time += dt;
    this.clinkIn -= dt;
    // ---- what is still to come out ----
    for (let k = this.due.length - 1; k >= 0; k--) {
      const d = this.due[k];
      while (d.n > 0 && this.time >= d.at) {
        const o = this._o, dir = this._dir;
        d.origin(o, dir);
        dir.normalize();
        // thrown the way it is told to go, more or less
        const s = between(d.fast[0], d.fast[1]), w = d.spread;
        let vx = dir.x + between(-1, 1) * w, vy = dir.y + between(-1, 1) * w * 0.8, vz = dir.z + between(-1, 1) * w;
        const l = Math.hypot(vx, vy, vz) || 1;
        vx *= s / l; vy *= s / l; vz *= s / l;
        const worth = d.each + (d.extra > 0 ? 1 : 0);
        if (d.extra > 0) d.extra--;
        this._add(o.x, o.y, o.z, vx, vy, vz, worth, d.egg, d.tumble);
        d.left -= worth; d.n--; d.at += d.every;
      }
      if (d.n <= 0) this.due.splice(k, 1);
    }
    if (!this.n) { if (this.moved) this._draw(); return; }

    const T = this.terrain, body = this.mammoth.collider, g = this._g, rig = this.rig;
    // a glint, off one of them
    this.glintIn -= dt;
    if (this.glintIn <= 0 && this.puffs) {
      const i = Math.floor(Math.random() * this.n), i3 = i * 3;
      this.glintIn = this.what[i] === FLYING ? 0.012 : 0.09;
      if (this.what[i] !== TAKEN) this.puffs.emit('spark', this.pos[i3] + between(-0.02, 0.02), this.pos[i3 + 1] + between(0, 0.03), this.pos[i3 + 2] + between(-0.02, 0.02), this.vel[i3] * 0.5, this.vel[i3 + 1] * 0.5 + 0.05, this.vel[i3 + 2] * 0.5);
    }
    const elf = rig.mode === 'elf' && !rig.cine, ex = rig.pos.x, ez = rig.pos.z, low = rig.height < 0.7;
    let rang = 0;
    for (let i = this.n - 1; i >= 0; i--) {
      const i3 = i * 3, what = this.what[i];
      this.age[i] += dt;
      if (what === LYING) {
        // lying on the snow: his, as soon as he is near enough
        if (elf && low && this.age[i] > 0.35) {
          const dx = this.pos[i3] - ex, dz = this.pos[i3 + 2] - ez;
          if (dx * dx + dz * dz < REACH * REACH) { this.what[i] = TAKEN; this.age[i] = 0; this.from[i3] = this.pos[i3]; this.from[i3 + 1] = this.pos[i3 + 1]; this.from[i3 + 2] = this.pos[i3 + 2]; this.moved = true; }
        }
        continue;
      }
      this.moved = true;
      if (what === TAKEN) {
        // up off the snow and into his pocket, quickly
        const t = Math.min(1, this.age[i] / 0.24), e = t * t, eye = camera.position;
        this.pos[i3] = this.from[i3] + (eye.x - this.from[i3]) * e;
        this.pos[i3 + 1] = this.from[i3 + 1] + (eye.y - 0.075 - this.from[i3 + 1]) * e + Math.sin(t * Math.PI) * 0.05;
        this.pos[i3 + 2] = this.from[i3 + 2] + (eye.z - this.from[i3 + 2]) * e;
        if (t >= 1) {
          const egg = this.egg[i];
          this._pocket(i); this._drop(i);
          if (this.clinkIn <= 0 || egg) { this.clinkIn = 0.055; if (this.sound) { if (egg) this.sound.coin(6); else this.sound.clink(1); } }
        }
        continue;
      }
      // ---- in the air ----
      const r = this.egg[i] ? EGG * 0.8 : BALL;
      let vx = this.vel[i3], vy = this.vel[i3 + 1] - GRAVITY * dt, vz = this.vel[i3 + 2];
      let x = this.pos[i3] + vx * dt, y = this.pos[i3 + 1] + vy * dt, z = this.pos[i3 + 2] + vz * dt;
      let hit = 0;
      // off the mammoth: it does not pass through him, and does not stay on him
      if (this.age[i] > 0.1 && x > -3 && x < 4.8 && y < 3.7 && z > -1.5 && z < 1.5) {
        const d = body.dist(x, y, z);
        if (d < r) {
          body.normal(x, y, z, g);
          x += g[0] * (r - d); y += g[1] * (r - d); z += g[2] * (r - d);
          const vn = vx * g[0] + vy * g[1] + vz * g[2];
          if (vn < 0) { hit = -vn; vx -= 1.32 * vn * g[0]; vy -= 1.32 * vn * g[1]; vz -= 1.32 * vn * g[2]; vx *= 0.93; vy *= 0.93; vz *= 0.93; }
          // (on top of him it would lie for ever: it is helped off towards whichever side is nearer)
          if (g[1] > 0.55) { vz += (z >= 0 ? 1 : -1) * 2.4 * dt; vx += (g[0] >= 0 ? 1 : -1) * 0.6 * dt; }
        }
      }
      const floor = T.height(x, z) + (this.egg[i] ? EGG * 0.72 : THICK * 0.5 + 0.002);
      if (y < floor) {
        y = floor;
        const flat = Math.hypot(vx, vz);
        if (vy < -0.9 || flat > 0.7) {
          // it bounces, and loses most of its going each time
          hit = Math.max(hit, -vy);
          vy = -vy * (this.egg[i] ? 0.22 : 0.36); vx *= 0.62; vz *= 0.62;
          if (vy < 0.5) vy = 0;
          for (let k = 0; k < 3; k++) this.spin[i3 + k] *= 0.6;
        } else {
          this.pos[i3] = x; this.pos[i3 + 2] = z;
          this._settle(i);
          if (this.clinkIn <= 0 && this.sound && this.age[i] > 0.15) { this.clinkIn = 0.07; this.sound.clink(0.5); }
          continue;
        }
      }
      if (hit > 1 && this.clinkIn <= 0 && this.sound) { this.clinkIn = 0.05; rang++; this.sound.clink(Math.min(1, hit / 5)); }
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      // turning over as it goes
      const wx = this.spin[i3], wy = this.spin[i3 + 1], wz = this.spin[i3 + 2], w = Math.hypot(wx, wy, wz);
      if (w > 1e-4) {
        this._q.set(this.quat[i * 4], this.quat[i * 4 + 1], this.quat[i * 4 + 2], this.quat[i * 4 + 3]);
        this._q.premultiply(this._d.setFromAxisAngle(this._s.set(wx / w, wy / w, wz / w), w * dt));
        this.quat[i * 4] = this._q.x; this.quat[i * 4 + 1] = this._q.y; this.quat[i * 4 + 2] = this._q.z; this.quat[i * 4 + 3] = this._q.w;
      }
      // (anything that has got away under the land, or gone on for ever, is called lying where it is)
      if (this.age[i] > 14) this._settle(i);
    }
    if (this.moved) this._draw();
  }

  /** Where each one is, for the drawing of them. */
  _draw() {
    const M = this._m, q = this._q, s = this._s, p = this._p;
    let c = 0, e = 0;
    for (let i = 0; i < this.n; i++) {
      p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      q.set(this.quat[i * 4], this.quat[i * 4 + 1], this.quat[i * 4 + 2], this.quat[i * 4 + 3]);
      // (on its way into his pocket it dwindles)
      const k = this.what[i] === TAKEN ? 1 - 0.75 * Math.min(1, this.age[i] / 0.24) : 1;
      M.compose(p, q, s.set(k, k, k));
      if (this.egg[i]) { if (e < 4) this.eggs.setMatrixAt(e++, M); } else this.mesh.setMatrixAt(c++, M);
    }
    this.mesh.count = c; this.eggs.count = e;
    this.mesh.instanceMatrix.needsUpdate = true; this.eggs.instanceMatrix.needsUpdate = true;
    this.moved = false;
  }
}
