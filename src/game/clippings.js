// Hair that has been cut off.
//
// A cut lock does not vanish and get replaced by something else: the part of
// each of its hairs beyond the cut is drawn on, by the same shader that drew
// it on the mammoth, from a copy of the same strand. At the moment of the cut
// it is exactly where it was. Then it is let go: the piece falls as one rigid
// body, turns, flutters in the gusts, slides off the mammoth if it lands on
// it, and settles on the snow, where it stays.
import * as THREE from 'three';
import { U } from '../gfx/globals.js';
import { FUR_VERT, FUR_FRAG } from '../mammoth/furMaterial.js';

const HAIRS = 12;       // most hairs drawn per piece (as many as the lock was showing, up to this)
const SEGMENTS = 6;
const FALLING = -1000;

const _q = new THREE.Quaternion(), _d = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Clippings {
  /**
   * @param terrain   for the height of the snow
   * @param mammoth   for its strands, its distance field and the coat's own uniforms
   */
  constructor({ capacity = 5000, terrain, mammoth, a2c = true }) {
    this.capacity = capacity;
    this.terrain = terrain;
    this.mammoth = mammoth;
    this.sampler = mammoth.sampler;
    this.count = 0;       // slots in use
    this.next = 0;        // next slot to write (wraps round: the oldest pieces make way)
    this.active = [];     // slots still moving

    const rib = [], idx = [];
    for (let i = 0; i <= SEGMENTS; i++) rib.push(-0.5, i / SEGMENTS, 0, 0.5, i / SEGMENTS, 0);
    for (let i = 0; i < SEGMENTS; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(rib, 3));
    geo.setIndex(idx);
    this.attr = {};
    this.data = {};
    const add = (name, dynamic = false) => {
      const array = new Float32Array(capacity * 4);
      const attr = new THREE.InstancedBufferAttribute(array, 4, false, HAIRS);
      attr.setUsage(dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage);
      geo.setAttribute(name, attr);
      this.attr[name] = attr; this.data[name] = array;
    };
    // the strand each piece came from, and the state of things when it was cut
    // (a vertex shader may take sixteen inputs, and this uses fourteen: the colour rides in a spare component)
    for (const name of ['cRoot', 'cOff', 'cDir', 'cNrm', 'cM0', 'cM1', 'cM2', 'cWind', 'cPivot', 'iA', 'iB']) add(name);
    // where each piece is now
    add('cPos', true); add('cQuat', true);
    for (let i = 0; i < capacity; i++) { this.data.cQuat[i * 4 + 3] = 1; this.data.cPos[i * 4 + 3] = FALLING; }
    this.statics = ['cRoot', 'cOff', 'cDir', 'cNrm', 'cM0', 'cM1', 'cM2', 'cWind', 'cPivot', 'iA', 'iB'];
    geo.instanceCount = HAIRS;
    this.geometry = geo;

    const fur = mammoth.furMats;
    const material = new THREE.ShaderMaterial({
      vertexShader: FUR_VERT,
      fragmentShader: FUR_FRAG,
      // the coat's own uniforms, so cut hair is shaped, coloured and parted by the blades exactly as it was
      uniforms: { ...U, ...fur.uniforms, uWidthScale: fur.color.uniforms.uWidthScale },
      defines: { CLIPPING: 1, CLIP_HAIRS: HAIRS, SHADOW_TAPS: 4, ...(a2c ? { USE_A2C: 1 } : {}) },
      side: THREE.DoubleSide,
      alphaToCoverage: a2c,
    });
    material.index0AttributeName = 'position';
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'clippings';

    // motion of each piece
    this.vel = new Float32Array(capacity * 3);
    this.spin = new Float32Array(capacity * 3);
    this.axis = new Float32Array(capacity * 3);    // which way the piece ran when it was cut
    this.goal = new Float32Array(capacity * 4);    // the way it will lie once settled
    this.state = new Uint8Array(capacity);         // 0 falling, 1 settling, 2 at rest
    this.timer = new Float32Array(capacity);
    this.reach = new Float32Array(capacity);       // half the piece's length
    this.sd = new Float32Array(4);
    this.P = [0, 0, 0]; this.Q = [0, 0, 0]; this.C = [0, 0, 0];
    this.rng = (() => { let s = 97531; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
    this.dirtyFrom = -1; this.dirtyTo = -1;
  }

  /**
   * A lock has been cut (`cut` is an entry from Mammoth.findCuts, taken before
   * the cut was applied). `env` says how the coat was being drawn at that
   * moment: eye position, pixels per metre, and the coat's level of detail.
   * (vx, vy, vz) is the shove the blades gave it.
   */
  spawn(cut, env, vx = 0, vy = 0, vz = 0) {
    const a = cut.chunk.arrays, i = cut.i, i3 = i * 3, i4 = i * 4;
    const S = this.sampler, D = this.data, r = this.rng;
    const k = this.next, k3 = k * 3, k4 = k * 4;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);

    // the strand, copied
    D.cRoot[k4] = a.iRoot[i3]; D.cRoot[k4 + 1] = a.iRoot[i3 + 1]; D.cRoot[k4 + 2] = a.iRoot[i3 + 2]; D.cRoot[k4 + 3] = cut.len;
    D.cOff[k4] = a.iOff[i3]; D.cOff[k4 + 1] = a.iOff[i3 + 1]; D.cOff[k4 + 2] = a.iOff[i3 + 2]; D.cOff[k4 + 3] = cut.prev;
    D.cDir[k4] = a.iDir[i3]; D.cDir[k4 + 1] = a.iDir[i3 + 1]; D.cDir[k4 + 2] = a.iDir[i3 + 2];
    D.cNrm[k4] = a.iNormal[i3]; D.cNrm[k4 + 1] = a.iNormal[i3 + 1]; D.cNrm[k4 + 2] = a.iNormal[i3 + 2]; D.cNrm[k4 + 3] = U.uTime.value;
    for (let c = 0; c < 4; c++) { D.iA[k4 + c] = a.iA[i4 + c]; D.iB[k4 + c] = a.iB[i4 + c]; }

    // how many of its hairs the coat was showing (the same sum the shader does)
    const ex = env.eye.x - (a.iRoot[i3] + env.origin.x), ey = env.eye.y - (a.iRoot[i3 + 1] + env.origin.y), ez = env.eye.z - (a.iRoot[i3 + 2] + env.origin.z);
    const ed = Math.max(Math.hypot(ex, ey, ez), 0.03);
    let n = Math.min(env.childMax, Math.max(1, (a.iA[i4 + 1] * env.widthScale * env.pxScale) / (ed * env.hairPx) - 0.4));
    const facing = (a.iNormal[i3] * ex + a.iNormal[i3 + 1] * ey + a.iNormal[i3 + 2] * ez) / ed;
    const ft = Math.min(1, Math.max(0, (facing + 0.6) / 0.4));
    n = 1 + (n - 1) * ft * ft * (3 - 2 * ft);
    D.cDir[k4 + 3] = Math.min(HAIRS, n);

    // the skin and the wind as they were at that moment: from now on this hair goes its own way
    S.setup(a, i);
    const M = S.M;
    D.cM0[k4] = M[0]; D.cM0[k4 + 1] = M[4]; D.cM0[k4 + 2] = M[8]; D.cM0[k4 + 3] = M[12];
    D.cM1[k4] = M[1]; D.cM1[k4 + 1] = M[5]; D.cM1[k4 + 2] = M[9]; D.cM1[k4 + 3] = M[13];
    D.cM2[k4] = M[2]; D.cM2[k4 + 1] = M[6]; D.cM2[k4 + 2] = M[10]; D.cM2[k4 + 3] = M[14];
    D.cWind[k4] = S.windRest[0]; D.cWind[k4 + 1] = S.windRest[1]; D.cWind[k4 + 2] = S.windRest[2];
    D.cWind[k4 + 3] = a.iCol[i4] + 256 * a.iCol[i4 + 1] + 65536 * a.iCol[i4 + 2];   // tone, ginger, lock variation

    // the piece: its middle, and the way it runs
    const P = S.point(cut.from, this.P), Q = S.point(cut.to, this.Q), C = S.point((cut.from + cut.to) / 2, this.C);
    D.cPivot[k4] = C[0]; D.cPivot[k4 + 1] = C[1]; D.cPivot[k4 + 2] = C[2]; D.cPivot[k4 + 3] = 0;
    D.cPos[k4] = C[0]; D.cPos[k4 + 1] = C[1]; D.cPos[k4 + 2] = C[2]; D.cPos[k4 + 3] = FALLING;
    D.cQuat[k4] = 0; D.cQuat[k4 + 1] = 0; D.cQuat[k4 + 2] = 0; D.cQuat[k4 + 3] = 1;
    let ax = Q[0] - P[0], ay = Q[1] - P[1], az = Q[2] - P[2];
    const al = Math.hypot(ax, ay, az) || 1;
    this.axis[k3] = ax / al; this.axis[k3 + 1] = ay / al; this.axis[k3 + 2] = az / al;
    this.reach[k] = al * 0.5;

    // Let go. The closing blades squeeze the hair out of the coat, away from
    // the body, so it falls clear in front of the hair still growing there;
    // each lock a little differently, so the bunch comes apart as it drops.
    S.sampleVolume(C[0], C[1], C[2], this.sd);
    const gl = Math.hypot(this.sd[0], this.sd[1], this.sd[2]) || 1;
    const out = this.sd[3] < 0.3 ? 0.3 + 0.3 * r() : 0;
    this.vel[k3] = vx + (this.sd[0] / gl) * out + (r() - 0.5) * 0.1;
    this.vel[k3 + 1] = vy + (this.sd[1] / gl) * out * 0.5 + (r() - 0.5) * 0.06;
    this.vel[k3 + 2] = vz + (this.sd[2] / gl) * out + (r() - 0.5) * 0.1;
    // barely any turn at first
    this.spin[k3] = (r() - 0.5) * 1.6; this.spin[k3 + 1] = (r() - 0.5) * 1.6; this.spin[k3 + 2] = (r() - 0.5) * 1.6;
    this.state[k] = 0; this.timer[k] = 0;
    if (!this.active.includes(k)) this.active.push(k);
    if (this.dirtyFrom < 0) this.dirtyFrom = k;
    this.dirtyTo = k;
    return k;
  }

  /** Work out how a piece should lie once it has landed: its length along the snow. */
  _land(k, ground) {
    const k3 = k * 3, k4 = k * 4, Q = this.data.cQuat;
    _q.set(Q[k4], Q[k4 + 1], Q[k4 + 2], Q[k4 + 3]);
    _a.set(this.axis[k3], this.axis[k3 + 1], this.axis[k3 + 2]).applyQuaternion(_q);   // the way it runs now
    _b.copy(_a); _b.y = 0;
    if (_b.lengthSq() < 1e-4) _b.set(this.rng() - 0.5, 0, this.rng() - 0.5);
    _b.normalize();
    _d.setFromUnitVectors(_a, _b).multiply(_q);
    this.goal[k4] = _d.x; this.goal[k4 + 1] = _d.y; this.goal[k4 + 2] = _d.z; this.goal[k4 + 3] = _d.w;
    this.data.cPos[k4 + 3] = ground;
    this.data.cPivot[k4 + 3] = U.uTime.value;          // when it touched down
    this.attr.cPivot.addUpdateRange(k4 + 3, 1);
    this.attr.cPivot.needsUpdate = true;
    this.state[k] = 1; this.timer[k] = 0;
  }

  update(dt) {
    const n = this.active.length;
    if (n) {
      const S = this.sampler, T = this.terrain, sd = this.sd, Pos = this.data.cPos, Q = this.data.cQuat;
      const wx = U.uWind.value.x, wz = U.uWind.value.y;
      const t = U.uTime.value;
      const DRAG = 11, SIDE = 6;              // 1/s: a loose lock of hair sinks at under a metre a second, and slows sideways more gently
      let w = 0;
      for (let idx = 0; idx < n; idx++) {
        const k = this.active[idx], k3 = k * 3, k4 = k * 4;
        if (this.state[k] === 1) {
          // settling: turn to lie along the snow
          this.timer[k] += dt;
          const f = Math.min(1, dt / Math.max(0.12 - this.timer[k] + dt, dt));
          _q.set(Q[k4], Q[k4 + 1], Q[k4 + 2], Q[k4 + 3]);
          _d.set(this.goal[k4], this.goal[k4 + 1], this.goal[k4 + 2], this.goal[k4 + 3]);
          _q.slerp(_d, f);
          Q[k4] = _q.x; Q[k4 + 1] = _q.y; Q[k4 + 2] = _q.z; Q[k4 + 3] = _q.w;
          if (this.timer[k] >= 0.12) { this.state[k] = 2; continue; }
          this.active[w++] = k;
          continue;
        }
        let x = Pos[k4], y = Pos[k4 + 1], z = Pos[k4 + 2];
        let vx = this.vel[k3], vy = this.vel[k3 + 1], vz = this.vel[k3 + 2];
        this.timer[k] += dt;
        // air: down here in the lee of the mammoth there is only a breath of the wind, and each piece flutters as it falls
        const air = 0.06 + 0.22 * S.windGust(x, z);
        const flutter = 0.1 * Math.sin(t * 9 + k * 1.7);
        const ax = wx * air - wz * flutter, az = wz * air + wx * flutter;
        const g = Math.min(1, SIDE * dt);
        vx += (ax - vx) * g; vz += (az - vz) * g;
        vy += (-9.81 - vy * DRAG) * dt;
        x += vx * dt; y += vy * dt; z += vz * dt;

        // the mammoth: cut hair slides down it rather than through it
        S.sampleVolume(x, y, z, sd);
        const rad = 0.014;
        let touching = false;
        if (sd[3] < rad) {
          const gl = Math.hypot(sd[0], sd[1], sd[2]) || 1;
          const gx = sd[0] / gl, gy = sd[1] / gl, gz = sd[2] / gl;
          const push = rad - sd[3];
          x += gx * push; y += gy * push; z += gz * push;
          const vn = vx * gx + vy * gy + vz * gz;
          if (vn < 0) { vx -= gx * vn; vy -= gy * vn; vz -= gz * vn; }
          vx *= 0.92; vy *= 0.92; vz *= 0.92;      // it drags on the coat
          touching = true;
        }

        // it turns as it falls, slowly at first and hardly at all while it is still against the coat
        const free = touching ? 0.25 : Math.min(1, this.timer[k] * 4);
        const sx = this.spin[k3] * free, sy = this.spin[k3 + 1] * free, sz = this.spin[k3 + 2] * free;
        const qx = Q[k4], qy = Q[k4 + 1], qz = Q[k4 + 2], qw = Q[k4 + 3];
        const h = 0.5 * dt;
        const nx = qx + h * (sx * qw + sy * qz - sz * qy), ny = qy + h * (sy * qw + sz * qx - sx * qz);
        const nz = qz + h * (sz * qw + sx * qy - sy * qx), nw = qw - h * (sx * qx + sy * qy + sz * qz);
        const nl = Math.hypot(nx, ny, nz, nw) || 1;
        Q[k4] = nx / nl; Q[k4 + 1] = ny / nl; Q[k4 + 2] = nz / nl; Q[k4 + 3] = nw / nl;
        if (!touching) { this.spin[k3] += (this.rng() - 0.5) * 9 * dt; this.spin[k3 + 2] += (this.rng() - 0.5) * 9 * dt; }

        // the snow
        const ground = T.height(x, z);
        if (y <= ground + 0.012) {
          y = ground + 0.012;
          this._land(k, ground);
        } else if (this.timer[k] > 10) {
          this.state[k] = 2;                  // caught somewhere: leave it there
        }
        Pos[k4] = x; Pos[k4 + 1] = y; Pos[k4 + 2] = z;
        this.vel[k3] = vx; this.vel[k3 + 1] = vy; this.vel[k3 + 2] = vz;
        if (this.state[k] !== 2) this.active[w++] = k;
      }
      this.active.length = w;
      this.attr.cPos.needsUpdate = true;
      this.attr.cQuat.needsUpdate = true;
    }
    if (this.dirtyFrom >= 0) {
      // send the new pieces (only those: the buffers are large)
      const send = (from, to) => { for (const name of this.statics) this.attr[name].addUpdateRange(from * 4, (to - from + 1) * 4); };
      if (this.dirtyTo >= this.dirtyFrom) send(this.dirtyFrom, this.dirtyTo);
      else { send(this.dirtyFrom, this.capacity - 1); send(0, this.dirtyTo); }   // the ring came round
      for (const name of this.statics) this.attr[name].needsUpdate = true;
      this.attr.cPos.needsUpdate = true;
      this.attr.cQuat.needsUpdate = true;
      this.dirtyFrom = -1; this.dirtyTo = -1;
    }
    // always draw at least one (empty) slot, so the graphics card readies this shader during loading, not at the first cut
    this.geometry.instanceCount = Math.max(1, this.count) * HAIRS;
  }
}
