// Shaving with the shears: holds the tool in front of the elf, and when the
// handles close finds every lock of hair between the blades, cuts each one as
// a blade reaches it, and sends the cut hair tumbling.
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
    this.clippings = new Clippings({ terrain, sampler: mammoth.sampler, uniforms: mammoth.furMats.uniforms, a2c });
    scene.add(this.clippings.mesh);
    this.active = false;
    this.pending = [];
    this.ptr = 0;
    this.region = {};
    this.snips = 0;
    // what the blades may not pass through: the mammoth's body and the snow
    const sd = new Float32Array(4);
    this.world = {
      distance: (x, y, z, out) => {
        mammoth.sampler.sampleVolume(x, y, z, out);
        return Math.min(out[3], y - terrain.height(x, z));
      },
      // where a line from the eyes meets the hide (strictly, a surface 11 mm above it), within arm's reach
      hide: (camera, out) => {
        const e = camera.matrixWorld.elements;
        const ox = e[12], oy = e[13], oz = e[14], dx = -e[8], dy = -e[9], dz = -e[10];
        let t = 0.04;
        for (let i = 0; i < 28 && t < 0.4; i++) {
          mammoth.sampler.sampleVolume(ox + dx * t, oy + dy * t, oz + dz * t, sd);
          const d = sd[3] - 0.011;
          if (d < 0.0015) {
            const l = Math.hypot(sd[0], sd[1], sd[2]) || 1;
            out.t = t; out.x = ox + dx * t; out.y = oy + dy * t; out.z = oz + dz * t;
            out.nx = sd[0] / l; out.ny = sd[1] / l; out.nz = sd[2] / l;
            return out;
          }
          t += Math.max(d * 0.9, 0.004);
        }
        return null;
      },
    };
  }

  /** Take the shears in hand, or put them away. */
  setActive(on) {
    this.active = on;
    this.shears.group.visible = on;
    if (!on) this.shears.squeeze(false);
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

  update(dt, camera, feel) {
    this.clippings.update(dt);
    if (!this.active) return;
    const sh = this.shears;
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
    this.mammoth.flushCuts();
  }

  /** A stroke begins: work out what lies between the blades. */
  _begin() {
    const r = this.shears.region(this.region);
    this.pending = this.mammoth.findCuts(r);
    // each lock is cut when a blade reaches it: those furthest from the centre line first
    this.pending.sort((a, b) => Math.abs(b.phi) - Math.abs(a.phi));
    this.ptr = 0;
    // one falling tuft per lock, up to a point; beyond that, each stands for several
    this.every = Math.max(1, Math.ceil(this.pending.length / 240));
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
      // the blade that reached it shoves it towards the middle, and the closing wedge squeezes it forwards
      const s = c.phi > 0 ? -0.3 : 0.3;
      this.clippings.spawn(c, sx * s + f.x * 0.2, sy * s + f.y * 0.2 + 0.05, sz * s + f.z * 0.2, Math.sqrt(this.every));
    }
  }

  /** Dev: one complete stroke, at once. */
  snipNow() {
    this._begin();
    this._cut(0, true);
    this.mammoth.flushCuts();
    this.snips++;
    return this.pending.length;
  }
}
