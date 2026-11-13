// A cutting tool held in first person: two halves that close on each other.
//
// This file holds what every such tool has in common: how it is held in front
// of the eyes or laid along the hide, how a stroke runs, how every part of it
// is kept out of anything solid, and the wedge between its blades that a
// stroke cuts. What a particular tool looks like, how big it is and how well
// it cuts comes from a definition; see src/game/tools/.
import * as THREE from 'three';
import { patchStandardMaterial } from '../gfx/patch.js';
import { makeDepthMaterial } from '../gfx/shadows.js';
import { LAYER_SHADOW_NEAR } from '../gfx/globals.js';

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

export function rngFrom(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function canvasTexture(w, h, draw, srgb) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function lathe(profile, segments = 22) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/**
 * Skin a row of cross-sections with flat-shaded faces (edges stay crisp).
 *   frameAt(u)   -> { x, z, a }: where the centre line is at station u, and which way it heads
 *   sectionAt(u) -> { pts: [[across, up], ...], ... }: the corners of the section there
 *   want(A, B, k) picks which faces to build (k = which side of the section)
 */
export function loft(stations, frameAt, sectionAt, want = () => true, caps = true, uvScale = [9, 34]) {
  const rings = stations.map((u) => {
    const c = frameAt(u), sec = sectionAt(u);
    // across = sideways in the plane of the blades, turning with the centre line
    const wx = Math.sin(c.a), wz = Math.cos(c.a);
    return { ...sec, u, pts: sec.pts.map(([w, y]) => [c.x + wx * w, y, c.z + wz * w]), across: sec.pts.map(([w]) => w) };
  });
  const n = rings[0].pts.length;
  const pos = [], uv = [];
  const tri = (a, b, c, ua, ub, uc, centre) => {
    // wind every face so that it looks outwards from the middle of the piece
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - centre[0], my = (a[1] + b[1] + c[1]) / 3 - centre[1], mz = (a[2] + b[2] + c[2]) / 3 - centre[2];
    if (nx * mx + ny * my + nz * mz >= 0) { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); }
    else { pos.push(...a, ...c, ...b); uv.push(...ua, ...uc, ...ub); }
  };
  const mid = (r) => {
    const m = [0, 0, 0];
    for (const p of r.pts) { m[0] += p[0] / n; m[1] += p[1] / n; m[2] += p[2] / n; }
    return m;
  };
  const st = (r, k) => [r.u * uvScale[0], r.across[k] * uvScale[1] + r.pts[k][1] * uvScale[1]];   // streaks run the length of the steel
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    const ma = mid(A), mb = mid(B);
    const centre = [(ma[0] + mb[0]) / 2, (ma[1] + mb[1]) / 2, (ma[2] + mb[2]) / 2];
    for (let k = 0; k < n; k++) {
      if (!want(A, B, k)) continue;
      const k2 = (k + 1) % n;
      tri(A.pts[k], A.pts[k2], B.pts[k], st(A, k), st(A, k2), st(B, k), centre);
      tri(A.pts[k2], B.pts[k2], B.pts[k], st(A, k2), st(B, k2), st(B, k), centre);
    }
  }
  if (caps) {
    for (const r of [rings[0], rings[rings.length - 1]]) {
      // a cap faces away from the rest of the piece
      const inward = r === rings[0] ? mid(rings[1]) : mid(rings[rings.length - 2]);
      for (let k = 1; k < n - 1; k++) tri(r.pts[0], r.pts[k], r.pts[k + 1], st(r, 0), st(r, k), st(r, k + 1), inward);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();   // not indexed: every face keeps its own normal
  return geo;
}

// ---- surfaces shared by the tools ---------------------------------------------------

const steelCache = new Map();
/**
 * Steel: a roughness/relief map (fine grinding lines, scratches, pits) and a
 * colour map (worn bright in places, rust in others). `rust` 0..1 and `tone`
 * (the base grey) make it anything from well kept to neglected.
 */
export function steelTextures({ seed = 20240, tone = '#979ca3', rust = 0.3 } = {}) {
  const key = `${seed}-${tone}-${rust}`;
  if (steelCache.has(key)) return steelCache.get(key);
  const rnd = rngFrom(seed);
  const rough = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const y = rnd() * h, v = 128 + (rnd() - 0.5) * 90;
      g.strokeStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.12})`;
      g.lineWidth = 0.3 + rnd() * 0.7;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (rnd() - 0.5) * 3); g.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w, y = rnd() * h, l = 20 + rnd() * 90, a = (rnd() - 0.5) * 1.2;
      g.strokeStyle = `rgba(215,215,215,${0.25 + rnd() * 0.35})`;
      g.lineWidth = 0.5 + rnd() * 0.7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(200,200,200,${rnd() * 0.3})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 1.5);
    }
    // rust is rough
    for (let i = 0; i < 60 * rust; i++) {
      const x = rnd() * w, y = rnd() * h, r = 4 + rnd() * 16;
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      c.addColorStop(0, `rgba(240,240,240,${0.3 + rnd() * 0.4})`); c.addColorStop(1, 'rgba(240,240,240,0)');
      g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, false);
  const body = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = tone; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, r = 14 + rnd() * 50;
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      const light = rnd() < 0.55;
      c.addColorStop(0, light ? `rgba(200,204,210,${0.1 + rnd() * 0.18})` : `rgba(60,64,70,${0.12 + rnd() * 0.2})`);
      c.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 500; i++) {
      const y = rnd() * h;
      g.strokeStyle = rnd() < 0.5 ? `rgba(215,218,224,${0.015 + rnd() * 0.035})` : `rgba(60,63,68,${0.015 + rnd() * 0.035})`;
      g.lineWidth = 0.3 + rnd() * 0.6;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (rnd() - 0.5) * 2); g.stroke();
    }
    // rust: small spots when well kept, spreading blotches when not
    for (let i = 0; i < 150 * rust; i++) {
      const x = rnd() * w, y = rnd() * h, r = (1.5 + rnd() * 6) * (0.7 + 2.2 * rust * rnd());
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      const deep = rnd() < 0.4;
      c.addColorStop(0, deep ? `rgba(72,34,16,${0.4 + rnd() * 0.4})` : `rgba(128,66,28,${0.35 + rnd() * 0.4})`);
      c.addColorStop(1, 'rgba(118,62,28,0)');
      g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, true);
  const out = { rough, body };
  steelCache.set(key, out);
  return out;
}

let woodCache = null;
export function woodTexture() {
  if (woodCache) return woodCache;
  const rnd = rngFrom(977);
  // grain runs up the canvas, which is along the handle
  woodCache = canvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = '#8c5f36'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = rnd() * w, bw = 10 + rnd() * 40;
      const c = g.createLinearGradient(x - bw, 0, x + bw, 0);
      const tone = rnd() < 0.5 ? '70,42,18' : '200,150,92';
      c.addColorStop(0, `rgba(${tone},0)`); c.addColorStop(0.5, `rgba(${tone},${0.12 + rnd() * 0.18})`); c.addColorStop(1, `rgba(${tone},0)`);
      g.fillStyle = c; g.fillRect(x - bw, 0, bw * 2, h);
    }
    for (let i = 0; i < 240; i++) {
      let x = rnd() * w;
      g.strokeStyle = rnd() < 0.7 ? `rgba(58,34,14,${0.1 + rnd() * 0.3})` : `rgba(214,170,112,${0.08 + rnd() * 0.16})`;
      g.lineWidth = 0.5 + rnd() * 1.4;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 32) { x += (rnd() - 0.5) * 3; g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 900; i++) {   // open pores
      g.fillStyle = `rgba(48,28,12,${0.15 + rnd() * 0.3})`;
      g.fillRect(rnd() * w, rnd() * h, 0.8, 3 + rnd() * 9);
    }
  }, true);
  return woodCache;
}

/** The parts of one tool: a group, its two moving halves, and every mesh in it. */
export class Kit {
  /** @param nearer how much nearer the eye the tool is drawn than it is (metres), see below */
  constructor(name, nearer) {
    this.group = new THREE.Group();
    this.group.name = name;
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
    this.upper = new THREE.Group();
    this.lower = new THREE.Group();
    this.group.add(this.upper, this.lower);
    this.meshes = [];
    this.depth = makeDepthMaterial();
    // Steel hides the hair lying against it. The tool is drawn as if it were a
    // little nearer the eye than it is, so that any hair within a few
    // centimetres in front of it is covered by it, and no strand can be seen
    // passing through a blade or a handle. Hair further in front still hangs
    // across it as it should.
    const inFront = `{
      float zv = mvPosition.z;                                  // depth from the eye (negative)
      float zb = min(zv + ${nearer.toFixed(3)}, -0.02);          // nearer, but never through the near plane
      gl_Position.z = (projectionMatrix[2][2] * zb + projectionMatrix[3][2]) * (zv / zb);
    }`;
    this.patch = (m) => patchStandardMaterial(m, { key: `tool-${nearer.toFixed(3)}`, bias: 0.03, extraVertex: inFront });
  }

  add(parent, geo, mat, name) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.userData.shadowMaterial = this.depth;
    mesh.layers.enable(LAYER_SHADOW_NEAR);
    parent.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  /**
   * Two halves, the second turned over on the first, as scissors are made.
   * makeHalf(i) builds half i in its own frame: +x along the blade from the
   * pivot, +z towards its cutting edge, its flat face on y = -halfThick.
   */
  halves(makeHalf, halfThick) {
    const a = makeHalf(0); a.position.y = halfThick; this.upper.add(a);
    const b = makeHalf(1); b.position.y = halfThick;
    const flip = new THREE.Group(); flip.rotation.x = Math.PI; flip.add(b); this.lower.add(flip);
    return [a, b];
  }
}

// the tool's own axes (x along the blades, y up, z right) seen from the eyes, which look down -z
const BASE = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)));
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AHEAD = new THREE.Vector3(0, 0, -1);
const _qa = new THREE.Quaternion();

export class Tool {
  /**
   * @param def  see src/game/tools/*.js for what a definition holds
   */
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.group = def.kit.group;
    this.upper = def.kit.upper;
    this.lower = def.kit.lower;
    this.meshes = def.kit.meshes;

    this.angle = def.open;
    this.phase = 'open';
    this.timer = 0;
    this.squeezing = false;
    this.kick = 0;
    this.stall = 0;
    this.catchAt = -1;
    this.sway = new THREE.Vector2();
    this.time = 0;
    this.sinceShut = 10;      // seconds since the blades last met
    this.away = 0;            // 0 = in hand, 1 = drawn back out of sight (changing tools)
    this.events = [];
    this.rnd = rngFrom(def.seed || 7);
    this._local = new THREE.Matrix4();
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._hit = {};
    this._n = new THREE.Vector3(); this._f = new THREE.Vector3(); this._u = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._piv = new THREE.Vector3(); this._lastF = new THREE.Vector3(0, 1, 0);
    this._freeP = new THREE.Vector3(); this._freeQ = new THREE.Quaternion();
    this._flatP = new THREE.Vector3(); this._flatQ = new THREE.Quaternion();
    this._tp = new THREE.Vector3(); this._tq = new THREE.Quaternion();
    this.poseP = new THREE.Vector3(); this.poseQ = new THREE.Quaternion();
    this._scale = new THREE.Vector3(); this._one = new THREE.Vector3(1, 1, 1);
    this.flat = 0; this.lying = 0; this.poseReady = false;
    this._g = [0, 0, 0];

    // For the purposes of not passing through things the tool is a set of
    // small spheres along every part of it: [x, y, z, radius], those of a half
    // in that half's own frame, the fixed ones in the tool's.
    this.leverSamples = def.leverSamples;
    this.fixedSamples = def.fixedSamples || [];
    this.samples = new Float32Array((this.leverSamples.length * 2 + this.fixedSamples.length) * 4);
    let extent = 0;
    for (const [x, y, z, r] of [...this.leverSamples, ...this.fixedSamples]) extent = Math.max(extent, Math.hypot(x, y, z) + r);
    this.extent = extent;

    // how far from the eyes the tips are when the tool is held free: pressed
    // nearer the hide than that, it is laid along it instead
    const h = def.hold;
    this._freeQ.setFromAxisAngle(AY, -h.yaw).multiply(_qa.setFromAxisAngle(AX, h.tilt));
    const tips = new THREE.Vector3(0, 0, -1).applyQuaternion(this._freeQ).multiplyScalar(def.tip).add(new THREE.Vector3(...h.pos));
    this.tipReach = tips.length();
    this.flatNear = this.tipReach - 0.02;
    this.flatFar = this.tipReach + 0.05;
    // Put away, the tool is drawn back towards the body and down until all of
    // it is nearer than the eyes can see, leaving by the bottom of the view.
    // (Simply lowering it would stand it on the snow in plain sight: the
    // elf's eyes are only a hand's breadth above the ground.)
    this.awayBack = this.tipReach - 0.03;
    this.awayDown = 0.34 * this.awayBack;

    this.setAngle(this.angle);
  }

  setAngle(angle) {
    this.angle = angle;
    this.upper.rotation.y = angle / 2;      // its tip swings one way...
    this.lower.rotation.y = -angle / 2;     // ...and the other blade's the other
    if (this.def.onAngle) this.def.onAngle(angle, this);
  }

  /** Squeeze the handles together (true) or let them open (false). */
  squeeze(on) { this.squeezing = on; }

  /** Put the tool back as it is when first picked up. */
  reset() {
    this.phase = 'open'; this.timer = 0; this.squeezing = false; this.stall = 0; this.catchAt = -1; this.kick = 0;
    this.poseReady = false; this.flat = 0; this.lying = 0;
    this.setAngle(this.def.open);
  }

  /**
   * Advance the snip. Returns the events of this step, in order: 'start' (a
   * stroke begins), 'catch' (poor blades stick part way), 'shut' (the blades
   * have met), 'opening', 'open'.
   */
  step(dt, drag = 0) {
    const st = this.def.stroke, open = this.def.open;
    const ev = this.events; ev.length = 0;
    this.time += dt;
    this.timer += dt;
    this.sinceShut += dt;
    if (this.phase === 'open') {
      // a sprung tool quivers for a moment after it flies open
      if (st.bounce && this.timer < 0.5) this.setAngle(open * (1 + st.bounce.amount * Math.exp(-st.bounce.decay * this.timer) * Math.sin(st.bounce.rate * this.timer)));
      if (this.squeezing && this.timer > st.delay && this.away < 0.1) {
        this.phase = 'closing'; this.timer = 0; this.speed = st.speed0;
        this.catchAt = st.catch && this.rnd() < st.catch.chance ? open * (0.3 + 0.35 * this.rnd()) : -1;
        ev.push('start');
      }
    } else if (this.phase === 'closing') {
      if (this.stall > 0) {
        this.stall -= dt;       // stuck: the hand has to bear down
      } else {
        // the handles accelerate together; thick hair slows them a little
        this.speed = Math.min(st.max, this.speed + st.accel * dt);
        let a = this.angle - (this.speed * dt) / (1 + drag);
        if (this.catchAt > 0 && a <= this.catchAt) {
          a = this.catchAt; this.catchAt = -1;
          this.stall = st.catch.time * (0.6 + 0.8 * this.rnd());
          this.speed = st.speed0 * 0.5;
          ev.push('catch');
        }
        if (a <= 0) { this.setAngle(0); this.phase = 'shut'; this.timer = 0; this.kick = st.kick; this.sinceShut = 0; ev.push('shut'); } else this.setAngle(a);
      }
    } else if (this.phase === 'shut') {
      if (this.timer > (this.squeezing ? st.shutHeld : st.shut)) { this.phase = 'opening'; this.timer = 0; ev.push('opening'); }
    } else if (this.phase === 'opening') {
      // ease out to the open angle
      const k = Math.min(1, this.timer / st.open);
      this.setAngle(open * (1 - (1 - k) * (1 - k)));
      if (k >= 1) { this.phase = 'open'; this.timer = 0; ev.push('open'); }
    }
    this.kick = Math.max(0, this.kick - dt * 7);
    if (this.def.animate) this.def.animate(this, dt);
    return ev;
  }

  /** Where every collision sphere is, in the frame of the whole tool, at the present blade angle. */
  _poseSamples() {
    const out = this.samples, half = this.angle / 2, c = Math.cos(half), sn = Math.sin(half), ht = this.def.halfThick;
    let k = 0;
    for (const side of [1, -1]) {
      for (const [x, y, z, r] of this.leverSamples) {
        // upper half: lifted by half the steel's thickness and turned by +half; lower: turned over, and turned by -half
        const ly = side * (y + ht), lz = side * z;
        out[k++] = x * c + lz * sn * side; out[k++] = ly; out[k++] = -x * sn * side + lz * c; out[k++] = r;
      }
    }
    for (const [x, y, z, r] of this.fixedSamples) { out[k++] = x; out[k++] = y; out[k++] = z; out[k++] = r; }
    return out;
  }

  /**
   * Move the tool (group.matrix) out of anything solid it has ended up in.
   * `eye` is where the elf's eyes are. Returns how far the tool had to be moved.
   */
  _clear(world, eye) {
    const m = this.group.matrix, e = m.elements, S = this._poseSamples(), g = this._g;
    // the mammoth only needs asking about when it is within reach of the tool
    const bodyNear = world.near(e[12], e[13], e[14]) < this.extent + 0.2;
    // Put away, a long tool has nowhere to go but through the snow at the
    // elf's own feet (looking up, "back" is down). By the time it is that far
    // back it is out of sight, so the snow gives way to it.
    const sink = 0.35 * smoothstep(0.6, 1, this.away);
    let wx = 0, wy = 0, wz = 0, snow = false;
    // the deepest any part of the tool is inside anything (0 if none is)
    const deepest = () => {
      let worst = 1e-5;
      for (let k = 0; k < S.length; k += 4) {
        const x = e[0] * S[k] + e[4] * S[k + 1] + e[8] * S[k + 2] + e[12];
        const y = e[1] * S[k] + e[5] * S[k + 1] + e[9] * S[k + 2] + e[13];
        const z = e[2] * S[k] + e[6] * S[k + 1] + e[10] * S[k + 2] + e[14];
        const r = S[k + 3];
        if (bodyNear) {
          const pb = r + 0.0012 - world.body(x, y, z);
          if (pb > worst) { worst = pb; wx = x; wy = y; wz = z; snow = false; }
        }
        if (y - r < 0.16) {
          const pg = r + 0.001 - sink - (y - world.ground(x, z));
          if (pg > worst) { worst = pg; wx = x; wy = y; wz = z; snow = true; }
        }
      }
      return worst > 1e-5 ? worst : 0;
    };
    let moved = 0, worst = deepest();
    // push the deepest part straight out, and look again
    for (let it = 0; it < 20 && worst > 0; it++) {
      if (snow) { e[13] += worst; } else {
        world.normal(wx, wy, wz, g);
        e[12] += g[0] * worst * 1.02; e[13] += g[1] * worst * 1.02; e[14] += g[2] * worst * 1.02;
      }
      moved += worst;
      worst = deepest();
    }
    // caught in a hollow where that does not settle (the curl of the trunk): draw the hands back towards the eyes
    if (worst > 0.0008 && eye) {
      let dx = eye.x - e[12], dy = eye.y - e[13], dz = eye.z - e[14];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      for (let it = 0; it < 14 && worst > 0; it++) {
        const step = Math.max(worst, 0.006);
        e[12] += dx * step; e[13] += dy * step; e[14] += dz * step;
        moved += step;
        worst = deepest();
      }
    }
    return moved;
  }

  /**
   * Hold the tool in front of the camera. `feel` describes the walk and the
   * turn of the head; `world` gives what the tool may not pass through.
   */
  place(dt, camera, feel, world) {
    const def = this.def, h = def.hold, lie = def.lie;
    const loose = h.sway ?? 1;
    // the hands lag a little behind the eyes when turning, and bob with each step
    const tx = THREE.MathUtils.clamp(-feel.yawRate * 0.0075, -0.03, 0.03) * loose, ty = THREE.MathUtils.clamp(feel.pitchRate * 0.0075, -0.025, 0.025) * loose;
    const k = Math.min(1, dt * 9);
    this.sway.x += (tx - this.sway.x) * k; this.sway.y += (ty - this.sway.y) * k;
    const walk = feel.moving ? 1 : 0;
    this.walk = (this.walk || 0) + (walk - (this.walk || 0)) * Math.min(1, dt * 6);
    const bobX = Math.sin(feel.bob * 0.5) * 0.0045 * this.walk * loose, bobY = -Math.abs(Math.sin(feel.bob * 0.5)) * 0.0035 * this.walk * loose;
    const breath = Math.sin(this.time * 1.15) * 0.0011;

    // ---- held free, in front of the eyes ------------------------------------------
    // the blades point away from the eyes and a little upwards, opening left and right
    this._freeQ.setFromAxisAngle(AY, -(h.yaw - this.sway.x * 1.8))
      .multiply(_qa.setFromAxisAngle(AX, h.tilt - this.sway.y * 1.6 + this.kick * 0.012))
      .multiply(_qa.setFromAxisAngle(AHEAD, h.roll || 0))
      .multiply(BASE);
    this._freeP.set(h.pos[0] + this.sway.x + bobX, h.pos[1] + this.sway.y + bobY + breath, h.pos[2] - this.kick * 0.004);

    // ---- laid flat against the hide --------------------------------------------------
    // Pressed into the coat, the tool is turned to lie along the skin, as a
    // shearer holds it: blades in the plane of the hide, tips a few
    // millimetres off it, pointing up the limb.
    let flat = 0;
    const hit = world && world.hide && this.away < 0.05 ? world.hide(camera, this._hit, this.flatFar + 0.03) : null;
    if (hit) {
      flat = 1 - THREE.MathUtils.smoothstep(hit.t, this.flatNear, this.flatFar);
      const e = camera.matrixWorld.elements, g = this._g;
      const N = this._n.set(hit.nx, hit.ny, hit.nz);
      // which way along the skin: where the eyes are looking, with a strong lean towards "up"
      const f = this._f.set(-e[8] + 1.7 * e[4], -e[9] + 1.7 * e[5], -e[10] + 1.7 * e[6]);
      f.addScaledVector(N, -f.dot(N));
      if (f.lengthSq() < 0.02) f.copy(this._lastF).addScaledVector(N, -this._lastF.dot(N));
      if (f.lengthSq() < 1e-6) f.set(0, 1, 0).addScaledVector(N, -N.y);
      f.normalize();
      this._lastF.copy(f);
      // the tips ride just off the skin where the eyes are looking...
      const tip = this._s.set(hit.x, hit.y, hit.z).addScaledVector(N, lie.tip - hit.off);
      // ...and the pivot a little further off it, the tool's length back down the limb, so the blades follow the curve of the hide
      const piv = this._piv.copy(tip).addScaledVector(f, -(def.tip - 0.004));
      for (let it = 0; it < 2; it++) {
        world.normal(piv.x, piv.y, piv.z, g);
        const d0 = world.body(piv.x, piv.y, piv.z);
        piv.x += g[0] * (lie.pivot - d0); piv.y += g[1] * (lie.pivot - d0); piv.z += g[2] * (lie.pivot - d0);
      }
      f.copy(tip).sub(piv).normalize();
      const n = this._u.set(N.x + g[0], N.y + g[1], N.z + g[2]);
      n.addScaledVector(f, -n.dot(f)).normalize();
      this.group.matrix.makeBasis(f, n, this._p.crossVectors(f, n)).setPosition(piv);
      // into the camera's frame, to blend with the free pose
      this._m.copy(camera.matrixWorld).invert().multiply(this.group.matrix).decompose(this._flatP, this._flatQ, this._scale);
    }
    this.flat += (flat - this.flat) * Math.min(1, dt * 10);
    const wgt = hit ? this.flat : 0;
    if (!hit) this.flat = Math.max(0, this.flat - dt * 10);

    // ---- blend, and let the hands follow a little behind ----------------------------
    const P = this._tp.copy(this._freeP), Q = this._tq.copy(this._freeQ);
    if (hit && wgt > 0) { P.lerp(this._flatP, wgt); Q.slerp(this._flatQ, wgt); }
    const follow = this.poseReady ? Math.min(1, dt * 16) : 1;
    this.poseP.lerp(P, follow); this.poseQ.slerp(Q, follow);
    this.poseReady = true;
    // being put away or brought up: drawn back and down by exactly that much (not left to the lag of the hands)
    const backBy = this.away * this.awayBack, downBy = this.away * this.awayDown;
    this._local.compose(this._tp.set(this.poseP.x, this.poseP.y - downBy, this.poseP.z + backBy), this.poseQ, this._one);
    this.group.matrix.multiplyMatrices(camera.matrixWorld, this._local);
    // Whatever the hands meant to do, steel does not pass through hide, horn
    // or packed snow: every part of the tool is moved clear, and the hands
    // remember where they ended up.
    if (world && this._clear(world, this._p.setFromMatrixPosition(camera.matrixWorld)) > 0) {
      this._m.copy(camera.matrixWorld).invert().multiply(this.group.matrix).decompose(this.poseP, this._tq, this._scale);
      this.poseP.y += downBy; this.poseP.z -= backBy;
    }
    this.group.matrixWorld.copy(this.group.matrix);
    this.group.updateMatrixWorld(true);
    /** 0 = held free, 1 = lying flat on the hide */
    this.lying = wgt;
  }

  /** The flat wedge between the blades, in the world: what a stroke from here would cut. */
  region(out = {}) {
    const def = this.def;
    const e = this.group.matrixWorld.elements;
    out.pivot = (out.pivot || new THREE.Vector3()).set(e[12], e[13], e[14]);
    out.forward = (out.forward || new THREE.Vector3()).set(e[0], e[1], e[2]).normalize();
    out.normal = (out.normal || new THREE.Vector3()).set(e[4], e[5], e[6]).normalize();
    out.side = (out.side || new THREE.Vector3()).set(e[8], e[9], e[10]).normalize();
    out.radius = def.tip - 0.003;
    out.inner = def.cutInner;
    out.halfAngle = this.angle / 2;
    // lying on the hide, the stroke takes everything between the blades and the skin
    out.below = this.lying > 0.5 ? def.cut.below : 0;
    out.minLength = def.cut.min;
    // each blade: along it from the pivot, and across it towards its cutting edge
    const hf = this.angle / 2, c = Math.cos(hf), sn = Math.sin(hf);
    out.blades = out.blades || [{ a: new THREE.Vector3(), c: new THREE.Vector3() }, { a: new THREE.Vector3(), c: new THREE.Vector3() }];
    out.blades[0].a.copy(out.forward).multiplyScalar(c).addScaledVector(out.side, -sn);
    out.blades[0].c.copy(out.forward).multiplyScalar(sn).addScaledVector(out.side, c);
    out.blades[1].a.copy(out.forward).multiplyScalar(c).addScaledVector(out.side, sn);
    out.blades[1].c.copy(out.forward).multiplyScalar(sn).addScaledVector(out.side, -c);
    out.shape = def.blade;
    return out;
  }
}

/** How wide the back of a blade is at u along it (the same sum the fur shader does). */
export function bladeBack(shape, u) {
  const s = Math.min(1, Math.max(0, (u - shape.from) / (shape.to - shape.from)));
  const w = lerp(shape.back0, shape.back1, Math.pow(s, shape.exp));
  return lerp(w, 0.0012, smoothstep(0.86, 1, s));
}
