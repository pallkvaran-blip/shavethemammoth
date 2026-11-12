// Shaving with the shears: holds the tool in front of the elf, and when the
// handles close finds every lock of hair between the blades, cuts each one as
// a blade reaches it, and lets the cut hair go.
import * as THREE from 'three';
import { U } from '../gfx/globals.js';
import { Shears } from './shears.js';
import { Clippings } from './clippings.js';

export class Shaving {
  constructor({ scene, mammoth, terrain, sound, a2c = true }) {
    this.mammoth = mammoth;
    this.terrain = terrain;
    this.sound = sound;
    this.shears = new Shears();
    this.shears.group.visible = false;
    scene.add(this.shears.group);
    this.clippings = new Clippings({ terrain, mammoth, a2c });
    scene.add(this.clippings.mesh);
    this.active = false;
    this.pending = [];
    this.ptr = 0;
    this.region = {};
    this.snips = 0;
    this.env = { eye: new THREE.Vector3(), origin: mammoth.group.position, pxScale: 1000, widthScale: 1, hairPx: 3.5, childMax: 12 };

    // What steel may not pass through: the mammoth (hide, toenails) and the snow.
    const body = mammoth.collider, sd = new Float32Array(4), nrm = [0, 0, 0];
    const OFF = 0.011;
    this.world = {
      body: (x, y, z) => body.dist(x, y, z),
      normal: (x, y, z, out) => body.normal(x, y, z, out),
      ground: (x, z) => terrain.height(x, z),
      // roughly how far the body is (cheap: only used to decide whether to look closer)
      near: (x, y, z) => { mammoth.sampler.sampleVolume(x, y, z, sd); return sd[3]; },
      // where a line from the eyes meets the hide (strictly, a surface 11 mm above it), within arm's reach
      hide: (camera, out) => {
        const e = camera.matrixWorld.elements;
        const ox = e[12], oy = e[13], oz = e[14], dx = -e[8], dy = -e[9], dz = -e[10];
        mammoth.sampler.sampleVolume(ox + dx * 0.2, oy + dy * 0.2, oz + dz * 0.2, sd);
        if (sd[3] > 0.32) return null;
        let t = 0.04;
        for (let i = 0; i < 40 && t < 0.4; i++) {
          const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
          const d = body.dist(x, y, z) - OFF;
          if (d < 0.001) {
            body.normal(x, y, z, nrm);
            out.t = t; out.x = x; out.y = y; out.z = z; out.off = OFF + d;
            out.nx = nrm[0]; out.ny = nrm[1]; out.nz = nrm[2];
            return out;
          }
          t += Math.max(d * 0.9, 0.003);
        }
        return null;
      },
    };
  }

  /** Take the shears in hand, or put them away. */
  setActive(on) {
    this.active = on;
    this.shears.group.visible = on;
    this.shears.poseReady = false;
    if (!on) {
      this.shears.squeeze(false);
      this.mammoth.furMats.uniforms.uShOn.value = 0;
    }
  }

  squeeze(on) {
    if (this.active) this.shears.squeeze(on);
  }

  /** Draw the shears once while the loading card is still up, so picking them up later is instant. */
  warm(camera, on) {
    if (this.active) return;
    this.shears.group.visible = on;
    if (on) this.shears.place(1, camera, { yawRate: 0, pitchRate: 0, moving: false, bob: 0 }, null);
  }

  /** How the coat is being drawn right now, so that cut hair can be drawn the same way. */
  _env(camera) {
    const u = this.mammoth.furMats.uniforms, e = this.env;
    e.eye.setFromMatrixPosition(camera.matrixWorld);
    e.pxScale = U.uPxScale.value;
    e.widthScale = this.mammoth.furMats.color.uniforms.uWidthScale.value;
    e.hairPx = u.uHairPx.value;
    e.childMax = u.uChildMax.value;
    return e;
  }

  /** Tell the coat where the blades are, so hair parts around them instead of passing through. */
  _tellCoat() {
    const r = this.shears.region(this.region), u = this.mammoth.furMats.uniforms;
    u.uShP.value.copy(r.pivot);
    u.uShN.value.copy(r.normal);
    u.uShA.value[0].copy(r.blades[0].a); u.uShA.value[1].copy(r.blades[1].a);
    u.uShC.value[0].copy(r.blades[0].c); u.uShC.value[1].copy(r.blades[1].c);
    u.uShOn.value = this.noPush ? 0 : 1;
    return r;
  }

  update(dt, camera, feel) {
    this.clippings.update(dt);
    if (!this.active) return;
    const sh = this.shears;
    this._env(camera);
    sh.place(dt, camera, feel, this.world);
    // a thick bunch of hair between the blades slows the stroke a little
    const drag = Math.min(0.8, (this.pending.length - this.ptr) / 450);
    for (const ev of sh.step(dt, drag)) {
      if (ev === 'start') this._begin();
      else if (ev === 'shut') {
        this._cut(0, true);
        this.sound.clack(1 - Math.min(0.6, this.pending.length / 500));
        this.snips++;
      } else if (ev === 'opening') this.sound.release();
    }
    if (sh.phase === 'closing') this._cut(sh.angle / 2, false);
    this._tellCoat();
    this.mammoth.flushCuts();
  }

  /** A stroke begins: work out what lies between the blades. */
  _begin() {
    const r = this.shears.region(this.region);
    this.pending = this.mammoth.findCuts(r);
    // each lock is cut when a blade reaches it: those furthest from the centre line first
    this.pending.sort((a, b) => Math.abs(b.phi) - Math.abs(a.phi));
    this.ptr = 0;
    // every cut lock falls as itself, up to a point; in a very thick bunch some are simply gone
    this.every = Math.max(1, Math.ceil(this.pending.length / 420));
    this.sound.slide(0.1);
    if (this.pending.length) this.sound.cut(this.pending.length);
  }

  /** Cut every pending lock a blade has reached (those at least `half` radians off the centre line). */
  _cut(half, all) {
    const r = this.region, p = this.pending;
    const n = r.normal, f = r.forward;
    // across the blades, with the same sign as phi
    const sx = n.y * f.z - n.z * f.y, sy = n.z * f.x - n.x * f.z, sz = n.x * f.y - n.y * f.x;
    while (this.ptr < p.length && (all || Math.abs(p[this.ptr].phi) >= half)) {
      const c = p[this.ptr++];
      if (this.mammoth.applyCut(c) <= 0) continue;
      if (this.ptr % this.every !== 0) continue;
      // the blade that reached it nudges it towards the middle
      const s = c.phi > 0 ? -0.12 : 0.12;
      this.clippings.spawn(c, this.env, sx * s, sy * s, sz * s);
    }
  }

  /** Dev: one complete stroke, at once. */
  snipNow(camera) {
    if (camera) this._env(camera);
    this._begin();
    this._cut(0, true);
    this._tellCoat();
    this.mammoth.flushCuts();
    this.snips++;
    return this.pending.length;
  }
}
