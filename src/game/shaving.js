// Shaving: holds whichever tool the elf has in hand in front of its eyes, and
// when the handles close finds every lock of hair between the blades, cuts
// each one as a blade reaches it, and lets the cut hair go. An electric tool
// has no stroke: while it runs, whatever comes into its mouth is cut.
import * as THREE from 'three';
import { U } from '../gfx/globals.js';
import { Tool, bladeBack, rngFrom } from './tool.js';
import { buildSmallScissors } from './tools/scissors.js';
import { buildSheepShears } from './tools/sheep.js';
import { buildGardenClippers } from './tools/garden.js';
import { buildElectricShears } from './tools/electric.js';
import { buildBeardShaver } from './tools/shaver.js';
import { buildSweepers } from './tools/sweepers.js';
import { Clippings } from './clippings.js';

/** The tools in the order of the number keys: by hand first, smallest to largest, then the electric ones. */
export const TOOL_ORDER = ['scissors', 'sheep', 'garden', 'electric', 'shaver'];

const ease = (t) => t * t * (3 - 2 * t);
/** Seconds to put a tool away, and to bring the next one up. */
export const PUT_AWAY = 0.15, BRING_UP = 0.24;
const STILL = { yawRate: 0, pitchRate: 0, moving: false, bob: 0 };

export class Shaving {
  constructor({ scene, mammoth, terrain, sound, a2c = true, tool = 'garden' }) {
    this.mammoth = mammoth;
    this.terrain = terrain;
    this.sound = sound;
    this.tools = {};
    const defs = [buildSmallScissors, buildSheepShears, buildGardenClippers, buildElectricShears, buildBeardShaver].map((build) => build());
    for (const def of [...defs, ...buildSweepers()]) {
      const t = new Tool(def);
      t.def.backAt = (u) => bladeBack(t.def.blade, u);
      this.tools[t.id] = t;
      scene.add(t.group);
    }
    this.onHair = () => 0;       // asked to put grams of hair in the sack; answers how many fitted
    this.room = () => Infinity;  // how many grams the sack will still take
    this.onFull = () => {};      // told when hair had to be left for want of room
    this._end = new THREE.Vector3();
    this.reachMore = 1;          // how much further the vacuums reach than they were made to (an upgrade)
    this.tool = this.tools[tool] || this.tools.garden;
    this.next = null;         // the tool being changed to, while the one in hand is being put away
    this.lowered = 0;         // 0 = tool up in front of the eyes, 1 = drawn back out of sight
    this.onTool = () => {};   // told when a different tool is in hand
    this.clippings = new Clippings({ terrain, mammoth, a2c });
    scene.add(this.clippings.mesh);
    this.clippings.onTake = (grams) => { if (this.onHair(grams) > 0) this.sound.pop(); };
    this.active = false;
    this.showing = null;      // a tool taken out of the elf's hands to be shown off (see present)
    this.pending = [];
    this.ptr = 0;
    this.region = {};
    this.snips = 0;
    this.missed = 0;
    this.mown = 0;            // locks taken by the electric tools
    this.cutRate = 0;         // locks a second going through the one that is running
    this._found = [];
    this._phase = 0;
    this._mouthAt = { p: new THREE.Vector3(), valid: false };   // where the mouth was a frame ago
    this.rnd = rngFrom(8086);
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
      // where a line from the eyes meets the hide (strictly, a surface 11 mm above it), within `reach`
      hide: (camera, out, reach = 0.4) => {
        const e = camera.matrixWorld.elements;
        const ox = e[12], oy = e[13], oz = e[14], dx = -e[8], dy = -e[9], dz = -e[10];
        mammoth.sampler.sampleVolume(ox + dx * reach * 0.5, oy + dy * reach * 0.5, oz + dz * reach * 0.5, sd);
        if (sd[3] > reach * 0.5 + 0.12) return null;
        let t = 0.03;
        for (let i = 0; i < 40 && t < reach; i++) {
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

  /** Take a tool in hand, or put it away. */
  setActive(on) {
    this.active = on;
    for (const t of Object.values(this.tools)) t.group.visible = false;
    this.tool.reset();
    this.tool.group.visible = on;
    this.next = null; this.lowered = on ? 1 : 0;      // it comes up into view
    this.pending = []; this.ptr = 0;
    this._quiet(this.tool);
    if (!on) this.mammoth.furMats.uniforms.uShOn.value = 0;
  }

  /** A tool that was running is put down: its motor stops. */
  _quiet(tool) {
    this._mouthAt.valid = false;
    this.cutRate = 0;
    if (tool.def.motor) this.sound.motor(tool.def.voice, 0, 0, 0);
  }

  /** Change to another tool. With one in hand, it is drawn back out of sight and the other brought up. */
  setTool(id) {
    if (!this.tools[id] || (id === this.tool.id && !this.next)) return;
    if (!this.active) { this._take(id); return; }
    this.next = id === this.tool.id ? null : id;
  }

  _take(id) {
    const was = this.tool;
    was.group.visible = false;
    was.reset();
    this._quiet(was);
    this.tool = this.tools[id];
    this.tool.reset();
    this.tool.group.visible = this.active;
    this.next = null;
    this.pending = []; this.ptr = 0;
    this.onTool(this.tool);
  }

  squeeze(on) {
    if (this.active) this.tool.squeeze(on && !this.next && !this.showing);
  }

  /** Have this tool in hand at once, with no putting away of the last. */
  take(id) {
    if (this.tools[id] && id !== this.tool.id) this._take(id); else this.next = null;
  }

  /**
   * A scene wants a tool to show off: it leaves the elf's hands and stays
   * wherever the scene puts it (its group's matrix) until unpresent().
   */
  present(id) {
    for (const t of Object.values(this.tools)) t.group.visible = false;
    this.tool.squeeze(false);
    this._quiet(this.tool);
    this.next = null; this.pending = []; this.ptr = 0;
    this.showing = this.tools[id];
    this.showing.reset();
    this.showing.group.visible = true;
    this.mammoth.furMats.uniforms.uShOn.value = 0;
  }

  unpresent() {
    if (!this.showing) return;
    this.showing.group.visible = false;
    this.showing.reset();
    this.showing = null;
    this.tool.reset();
    this.tool.group.visible = this.active;
    this.lowered = this.active ? 1 : 0;      // it comes up into view
  }

  /** Draw every tool once while the loading card is still up, so picking one up later is instant. */
  warm(camera, on) {
    if (this.active) return;
    for (const t of Object.values(this.tools)) {
      t.group.visible = on;
      if (on) t.place(1, camera, STILL, null);
    }
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

  /** Tell the coat where the blades are and how they are shaped, so hair parts around them instead of passing through. */
  _tellCoat() {
    const def = this.tool.def, b = def.blade;
    const r = this.tool.region(this.region), u = this.mammoth.furMats.uniforms;
    u.uShP.value.copy(r.pivot);
    u.uShN.value.copy(r.normal);
    u.uShA.value[0].copy(r.blades[0].a); u.uShA.value[1].copy(r.blades[1].a);
    u.uShC.value[0].copy(r.blades[0].c); u.uShC.value[1].copy(r.blades[1].c);
    u.uShB.value.set(b.from, b.to, b.back0, b.back1);
    u.uShX.value.set(b.exp, b.edge, def.pivotClear, Math.min(0.004, 0.5 * b.back0));
    u.uShD.value.set(def.part.above, def.part.below, Math.max(0.002, def.lie.tip - 0.002));
    u.uShT.value = b.point ?? 0.0012;
    // while a tool is on its way up or down, the hair lets go of it
    u.uShOn.value = this.noPush || def.sweep ? 0 : 1 - ease(Math.min(1, this.lowered * 1.5));
    return r;
  }

  update(dt, camera, feel) {
    this.clippings.update(dt);
    if (this.showing) { this.mammoth.flushCuts(); return; }
    if (!this.active) return;
    // changing tools: the hands draw one back out of sight and come up with the other
    if (this.pinned != null) {
      this.lowered = this.pinned;                 // dev: hold the tool part way put away
    } else if (this.next) {
      this.lowered = Math.min(1, this.lowered + dt / PUT_AWAY);
      if (this.lowered >= 1) this._take(this.next);
    } else if (this.lowered > 0) {
      this.lowered = Math.max(0, this.lowered - dt / BRING_UP);
    }
    const sh = this.tool, voice = sh.def.voice;
    this.camera = camera;
    sh.away = ease(this.lowered);
    this._env(camera);
    sh.place(dt, camera, feel, this.world);
    // a thick bunch of hair between the blades slows the stroke a little
    const drag = Math.min(0.8, (this.pending.length - this.ptr) / 450);
    for (const ev of sh.step(dt, drag)) {
      if (ev === 'start') this._begin();
      else if (ev === 'catch') this.sound.stick(voice);
      else if (ev === 'shut') {
        this._cut(0, true);
        this.sound.clack(voice, 1 - Math.min(0.6, this.pending.length / 500));
        this.snips++;
      } else if (ev === 'opening') this.sound.release(voice);
      else if (ev === 'on' || ev === 'off') this.sound.switch(voice, ev === 'on');
      else if (ev === 'stroke') this.sound.swish(voice);
      else if (ev === 'sweep') this._sweep(sh);
    }
    if (sh.def.sweep && sh.def.motor) this._suck(sh);
    if (sh.phase === 'closing') this._cut(sh.angle / 2, false);
    if (sh.def.motor && !sh.def.sweep) this._mow(dt, sh);
    this._tellCoat();
    this.mammoth.flushCuts();
  }

  /** A stroke begins: work out what lies between the blades. */
  _begin() {
    const r = this.tool.region(this.region);
    r.backAt = this.tool.def.backAt;
    this.pending = this.mammoth.findCuts(r);
    // each lock is cut when a blade reaches it: those furthest from the centre line first
    this.pending.sort((a, b) => Math.abs(b.phi) - Math.abs(a.phi));
    this.ptr = 0;
    // every cut lock falls as itself, up to a point; in a very thick bunch some are simply gone
    this.every = Math.max(1, Math.ceil(this.pending.length / 420));
    this.sound.slide(this.tool.def.voice, 0.1);
    if (this.pending.length) this.sound.cut(this.pending.length, this.tool.def.voice);
  }

  /** Cut every pending lock a blade has reached (those at least `half` radians off the centre line). */
  _cut(half, all) {
    const r = this.region, p = this.pending, how = this.tool.def.cut;
    const n = r.normal, f = r.forward;
    // across the blades, with the same sign as phi
    const sx = n.y * f.z - n.z * f.y, sy = n.z * f.x - n.x * f.z, sz = n.x * f.y - n.y * f.x;
    while (this.ptr < p.length && (all || Math.abs(p[this.ptr].phi) >= half)) {
      const c = p[this.ptr++];
      // poor blades: the hair folds over between them and slips out uncut...
      if (how.chance < 1 && this.rnd() > how.chance) { this.missed++; continue; }
      // ...and what they do cut, they chew off at uneven lengths
      if (how.ragged > 0) {
        const was = c.to * c.L, len = c.len + how.ragged * this.rnd();
        if (len > was - 0.004) { this.missed++; continue; }
        c.len = len; c.from = len / c.L; c.removed = was - len;
      }
      const off = this.mammoth.applyCut(c);
      if (off <= 0) continue;
      if (this.ptr % this.every !== 0) { this.clippings.credit(this.grams(off)); continue; }
      // the blade that reached it nudges it towards the middle
      const s = c.phi > 0 ? -0.12 : 0.12;
      this.clippings.spawn(c, this.env, sx * s, sy * s, sz * s, this.grams(off));
    }
  }

  /** Grams of hair in a length of lock (fewer, thicker locks at lower detail weigh the same in all). */
  grams(metres) { return metres * 240000 / this.mammoth.strands; }

  /**
   * Where a sweeper is aimed: the patch of snow the elf is looking at, no
   * further off than the tool reaches (`ahead`). Looking level or up, that is
   * the snow that far in front of its feet.
   */
  _aim(sh, out) {
    const e = this.camera.matrixWorld.elements, ahead = sh.def.sweep.ahead * (sh.def.motor ? this.reachMore : 1);
    const fx = -e[8], fy = -e[9], fz = -e[10], flat = Math.hypot(fx, fz) || 1;
    const high = e[13] - this.terrain.height(e[12], e[14]);
    const d = fy < -0.05 ? Math.min(ahead, (high / -fy) * flat) : ahead;
    const x = e[12] + (fx / flat) * d, z = e[14] + (fz / flat) * d;
    return out.set(x, this.terrain.height(x, z) + 0.01, z);
  }

  /** One stroke of a broom, or one grab: everything round where it is aimed goes in the sack. */
  _sweep(sh) {
    // (a broom takes what is under its head; hands take what the eyes are on)
    const p = sh.def.level ? sh.end(this._end) : this._aim(sh, this._end), s = sh.def.sweep;
    const got = this.clippings.gather(p.x, p.y, p.z, s.radius, { room: this.room() });
    if (got > 0) this.onHair(got);
    if (this.clippings.missed) this.onFull();
  }

  /** A vacuum, running: hair round where it is aimed, and round the nozzle itself, is drawn up it. */
  _suck(sh) {
    const s = sh.def.sweep, more = this.reachMore;
    if (sh.power > 0.5) {
      let full = false;
      if (!sh.def.level) {
        const p = this._aim(sh, this._end);
        this.clippings.gather(p.x, p.y, p.z, s.radius * more, { pull: s.pull * more, room: this.room() });
        full = this.clippings.missed;
      }
      sh.end(this._end);
      this.clippings.gather(this._end.x, this._end.y, this._end.z, s.radius * more * (sh.def.level ? 1 : 0.6), { pull: s.pull * more, room: this.room() });
      if (full || this.clippings.missed) this.onFull();
    }
    this.clippings.sink.copy(sh.end(this._end));
    this.sound.motor(sh.def.voice, sh.power, Math.min(1, this.clippings.inFlight / 20), 0);
  }

  /**
   * An electric tool takes whatever is in its mouth, every frame it runs. It
   * can only cut so much a second (def.motor.rate, in locks of full-length
   * hair at High detail; a lock already cut short costs a fraction of that).
   * Pushed faster than that through long hair it bogs down: its note sags,
   * and what it could not get to is left standing behind it.
   */
  _mow(dt, sh, unhurried = false) {
    const m = sh.def.motor;
    const scale = this.mammoth.strands / 240000;       // fewer, thicker locks at lower detail: the same hide a second
    const perSecond = m.rate * scale;
    let cut = 0, starved = 0, spent = 0;
    if (sh.power > 0.6 && dt > 0) {
      sh.budget = unhurried ? Infinity : Math.min(sh.budget + perSecond * dt, perSecond * 0.12 + 1);
      const r = sh.mouth(this.region), last = this._mouthAt;
      const tx = r.pivot.x, ty = r.pivot.y, tz = r.pivot.z;
      // moved a long way since the last frame: take what lay between here and there as well
      const steps = last.valid ? Math.min(8, Math.max(1, Math.ceil(last.p.distanceTo(r.pivot) / (0.7 * (r.to - r.from))))) : 1;
      let shown = 0;
      for (let s = 1; s <= steps; s++) {
        const k = s / steps;
        if (steps > 1) r.pivot.set(last.p.x + (tx - last.p.x) * k, last.p.y + (ty - last.p.y) * k, last.p.z + (tz - last.p.z) * k);
        // held in the air, it also trims hair that hangs into it from further off (looked for a few locks at a time)
        r.cross = sh.lying < 0.5 && s === steps;
        r.stride = 6;
        if (r.cross) r.phase = this._phase = (this._phase + 1) % r.stride;
        for (const c of this.mammoth.findMouth(r, this._found)) {
          const cost = c.removed > m.long ? 1 : m.light;
          if (sh.budget < cost) { starved++; continue; }
          sh.budget -= cost; spent += cost;
          const off = this.mammoth.applyCut(c);
          if (off <= 0) continue;
          cut++;
          // what comes off falls as itself (a few locks a frame; the trimmings of stubble are dust, though they weigh something)
          if (c.removed > 0.012 && shown < 6) {
            shown++;
            this.clippings.spawn(c, this.env, -r.forward.x * 0.05 + r.normal.x * 0.05, -r.forward.y * 0.05 + r.normal.y * 0.05, -r.forward.z * 0.05 + r.normal.z * 0.05, this.grams(off));
          } else this.clippings.credit(this.grams(off));
        }
      }
      last.p.set(tx, ty, tz); last.valid = true;
    } else {
      this._mouthAt.valid = false;
    }
    const full = starved > 0 ? 1 : Math.min(1, spent / Math.max(1e-6, perSecond * Math.max(dt, 1e-3)));
    sh.load += (full - sh.load) * Math.min(1, dt * (full > sh.load ? 16 : 5));
    this.cutRate += (cut / Math.max(dt, 1e-3) / Math.max(scale, 0.05) - this.cutRate) * Math.min(1, dt * 10);
    this.mown += cut;
    this.sound.motor(sh.def.voice, sh.power, sh.load, this.cutRate);
    return cut;
  }

  /** Dev: one complete stroke, at once (for an electric tool: as much as it would take in a twentieth of a second, unhurried). */
  snipNow(camera) {
    if (camera) this._env(camera);
    if (this.tool.def.motor) {
      const sh = this.tool;
      sh.power = 1;
      const n = this._mow(0.05, sh, true);
      sh.budget = 0;
      this._tellCoat();
      this.mammoth.flushCuts();
      return n;
    }
    this._begin();
    this._cut(0, true);
    this._tellCoat();
    this.mammoth.flushCuts();
    this.snips++;
    return this.pending.length;
  }
}
