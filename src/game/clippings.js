// Hair that has been cut off. Each severed lock becomes a loose tuft that
// tumbles down, drifts on the wind, slides off the mammoth if it lands on it,
// and comes to rest on the snow, where it stays.
//
// A tuft is drawn as a handful of separate hairs with the same shading as the
// coat they came from, so the pile at the mammoth's feet is made of the very
// hair that was on it.
import * as THREE from 'three';
import { COMMON, SHADOWS, ATMOSPHERE } from '../gfx/glsl.js';
import { U } from '../gfx/globals.js';
import { FUR_FRAG } from '../mammoth/furMaterial.js';

const HAIRS = 8;        // hairs drawn per tuft
const SEGMENTS = 4;

const VERT = /* glsl */ `
${COMMON}
attribute vec3 cPos;      // centre of the tuft
attribute vec4 cQuat;     // its orientation: local x runs from the cut end to the tips
attribute vec4 cA;        // length, radius, seed, lock variation
attribute vec4 cB;        // tone, ginger, and where along the original hair this piece began and ended
uniform float uMinPx;
uniform float uPxScale;
varying vec2 vUV;
varying vec3 vTan;
varying vec3 vVolN;
varying vec3 vPosW;
varying vec4 vCol;
varying vec4 vHair;

vec3 rotate(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }

void main() {
  float s = position.y;
  float len = cA.x;
  if (len <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float j = float(gl_InstanceID % ${HAIRS});
  float seed = fract(cA.z * 7.13 + j * 0.61803399);
  float h1 = hash11(seed * 91.3 + 1.7), h2 = hash11(seed * 47.9 + 5.1), h3 = hash11(seed * 23.3 + 9.4), h4 = hash11(seed * 67.7 + 3.3);

  // each hair: its own length, a place in the bundle, a slight bow, fanning out towards the tips
  float l = len * (0.62 + 0.38 * h1);
  float ang = h2 * 6.2831853;
  vec2 o = vec2(cos(ang), sin(ang)) * (cA.y * sqrt(h3));
  float bowA = h4 * 6.2831853;
  float bow = l * (0.05 + 0.16 * h1);
  float arch = 4.0 * s * (1.0 - s);
  vec3 p = vec3((s - 0.5) * l, o * (0.45 + 0.9 * s) + vec2(cos(bowA), sin(bowA)) * bow * arch);
  vec3 dp = vec3(l, o * 0.9 + vec2(cos(bowA), sin(bowA)) * bow * (4.0 - 8.0 * s));

  vec3 posW = cPos + rotate(cQuat, p);
  vec3 tanW = normalize(rotate(cQuat, dp));
  vec3 toEye = normalize(cameraPosition - posW);
  vec3 side = cross(tanW, toEye);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  float pxPerM = uPxScale / max(-(viewMatrix * vec4(posW, 1.0)).z, 0.02);
  float tt = mix(cB.z, cB.w, s);                    // where this point sat on the hair it came from
  float taper = 1.0 - 0.6 * tt * tt;
  float px = max(0.00062 * (0.7 + 0.6 * h2) * taper * pxPerM, uMinPx);
  posW += side * (position.x * px / pxPerM);

  vUV = vec2(position.x + 0.5, tt);
  vTan = tanW;
  vVolN = normalize(vec3(0.0, 1.0, 0.0) + rotate(cQuat, vec3(0.0, o)) * 12.0);
  vPosW = posW;
  vCol = vec4(cB.x, cB.y, cA.w, h1);
  vHair = vec4(seed, 1.0, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(posW, 1.0);
}
`;

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0);

export class Clippings {
  /**
   * @param terrain   for the height of the snow
   * @param sampler   the mammoth's StrandSampler: body distance field and wind
   * @param uniforms  the coat's own uniforms (colours, frost), so clippings match it
   */
  constructor({ capacity = 12000, terrain, sampler, uniforms, a2c = true }) {
    this.capacity = capacity;
    this.terrain = terrain;
    this.sampler = sampler;
    this.count = 0;       // slots in use
    this.next = 0;        // next slot to write (wraps round: the oldest clippings make way)
    this.active = [];     // slots still in the air

    this.pos = new Float32Array(capacity * 3);
    this.quat = new Float32Array(capacity * 4);
    this.a = new Float32Array(capacity * 4);
    this.b = new Float32Array(capacity * 4);
    this.vel = new Float32Array(capacity * 3);
    this.spin = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.quat[i * 4 + 3] = 1;

    const rib = [], idx = [];
    for (let i = 0; i <= SEGMENTS; i++) rib.push(-0.5, i / SEGMENTS, 0, 0.5, i / SEGMENTS, 0);
    for (let i = 0; i < SEGMENTS; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(rib, 3));
    geo.setIndex(idx);
    const inst = (name, array, size) => {
      const attr = new THREE.InstancedBufferAttribute(array, size, false, HAIRS);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, attr);
      return attr;
    };
    this.attrPos = inst('cPos', this.pos, 3);
    this.attrQuat = inst('cQuat', this.quat, 4);
    this.attrA = inst('cA', this.a, 4);
    this.attrB = inst('cB', this.b, 4);
    geo.instanceCount = HAIRS;
    this.geometry = geo;

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FUR_FRAG,
      uniforms: { ...U, ...uniforms },
      defines: { SHADOW_TAPS: 4, ...(a2c ? { USE_A2C: 1 } : {}) },
      side: THREE.DoubleSide,
      alphaToCoverage: a2c,
    });
    material.index0AttributeName = 'position';
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'clippings';
    this.sd = new Float32Array(4);
    this.rng = (() => { let s = 97531; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
  }

  /**
   * A lock has been cut. `cut` is an entry from Mammoth.findCuts; (vx, vy, vz)
   * is the shove the blades gave it.
   */
  spawn(cut, vx = 0, vy = 0, vz = 0, scale = 1) {
    const a = cut.chunk.arrays, i = cut.i;
    const r = this.rng;
    const k = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    // the piece that came off: most hairs of a lock are a little shorter than its guide
    const len = Math.max(0.01, cut.removed * 0.9);
    const k3 = k * 3, k4 = k * 4;
    // it hangs from the cut, so its middle is half its length further along the hair
    this.pos[k3] = cut.x + cut.tx * len * 0.45; this.pos[k3 + 1] = cut.y + cut.ty * len * 0.45; this.pos[k3 + 2] = cut.z + cut.tz * len * 0.45;
    _q.setFromUnitVectors(X, _v.set(cut.tx, cut.ty, cut.tz));
    _q.multiply(_q2.setFromAxisAngle(X, r() * Math.PI * 2));   // any roll about the hair's own axis
    this.quat[k4] = _q.x; this.quat[k4 + 1] = _q.y; this.quat[k4 + 2] = _q.z; this.quat[k4 + 3] = _q.w;
    this.a[k4] = len; this.a[k4 + 1] = a.iA[i * 4 + 1] * 0.9 * scale; this.a[k4 + 2] = r(); this.a[k4 + 3] = a.iCol[i * 4 + 2] / 255;
    this.b[k4] = a.iCol[i * 4] / 255; this.b[k4 + 1] = a.iCol[i * 4 + 1] / 255; this.b[k4 + 2] = cut.from; this.b[k4 + 3] = cut.to;
    this.vel[k3] = vx + (r() - 0.5) * 0.22; this.vel[k3 + 1] = vy + (r() - 0.5) * 0.16; this.vel[k3 + 2] = vz + (r() - 0.5) * 0.22;
    this.spin[k3] = (r() - 0.5) * 7; this.spin[k3 + 1] = (r() - 0.5) * 7; this.spin[k3 + 2] = (r() - 0.5) * 7;
    this.age[k] = 0;
    // a slot being reused may still be in the air
    if (!this.active.includes(k)) this.active.push(k);
    this.dirtyStatic = true;
    return k;
  }

  /** Lay a tuft down on whatever it has landed on. */
  _settle(k) {
    const k4 = k * 4;
    _q.set(this.quat[k4], this.quat[k4 + 1], this.quat[k4 + 2], this.quat[k4 + 3]);
    _v.set(1, 0, 0).applyQuaternion(_q);     // which way the hair runs
    _v.y = 0;
    if (_v.lengthSq() < 1e-4) _v.set(this.rng() - 0.5, 0, this.rng() - 0.5);
    _v.normalize();
    _a.set(0, 1, 0);
    _b.crossVectors(_v, _a).normalize();
    _m.makeBasis(_v, _a, _b);                // long axis flat on the ground
    _q.setFromRotationMatrix(_m);
    this.quat[k4] = _q.x; this.quat[k4 + 1] = _q.y; this.quat[k4 + 2] = _q.z; this.quat[k4 + 3] = _q.w;
  }

  update(dt) {
    const n = this.active.length;
    if (n) {
      const S = this.sampler, T = this.terrain, sd = this.sd;
      const wx = U.uWind.value.x, wz = U.uWind.value.y;
      const t = U.uTime.value;
      const DRAG = 8.5;                       // 1/s: a loose tuft of hair sinks at little more than a metre a second
      let w = 0;
      for (let idx = 0; idx < n; idx++) {
        const k = this.active[idx], k3 = k * 3, k4 = k * 4;
        let x = this.pos[k3], y = this.pos[k3 + 1], z = this.pos[k3 + 2];
        let vx = this.vel[k3], vy = this.vel[k3 + 1], vz = this.vel[k3 + 2];
        this.age[k] += dt;
        // air: steady wind plus gusts, and each tuft flutters as it falls
        const air = 0.25 + 0.95 * S.windGust(x, z);
        const flutter = 0.35 * Math.sin(t * 9 + this.a[k4 + 2] * 60);
        const ax = wx * air - wz * flutter, az = wz * air + wx * flutter;
        vx += (ax - vx) * Math.min(1, DRAG * dt);
        vz += (az - vz) * Math.min(1, DRAG * dt);
        vy += (-9.81 - vy * DRAG) * dt;
        x += vx * dt; y += vy * dt; z += vz * dt;

        // the mammoth: clippings slide off it rather than fall through
        S.sampleVolume(x, y, z, sd);
        const rad = 0.012;
        if (sd[3] < rad) {
          const gl = Math.hypot(sd[0], sd[1], sd[2]) || 1;
          const gx = sd[0] / gl, gy = sd[1] / gl, gz = sd[2] / gl;
          const push = rad - sd[3];
          x += gx * push; y += gy * push; z += gz * push;
          const vn = vx * gx + vy * gy + vz * gz;
          if (vn < 0) { vx -= gx * vn; vy -= gy * vn; vz -= gz * vn; }
          vx *= 0.9; vy *= 0.9; vz *= 0.9;      // it drags on the coat
        }

        // tumble
        const sx = this.spin[k3], sy = this.spin[k3 + 1], sz = this.spin[k3 + 2];
        const qx = this.quat[k4], qy = this.quat[k4 + 1], qz = this.quat[k4 + 2], qw = this.quat[k4 + 3];
        const h = 0.5 * dt;
        let nx = qx + h * (sx * qw + sy * qz - sz * qy), ny = qy + h * (sy * qw + sz * qx - sx * qz);
        let nz = qz + h * (sz * qw + sx * qy - sy * qx), nw = qw - h * (sx * qx + sy * qy + sz * qz);
        const nl = Math.hypot(nx, ny, nz, nw) || 1;
        this.quat[k4] = nx / nl; this.quat[k4 + 1] = ny / nl; this.quat[k4 + 2] = nz / nl; this.quat[k4 + 3] = nw / nl;

        // the snow
        const ground = T.height(x, z) + 0.004 + this.a[k4 + 1] * 0.35;
        let resting = false;
        if (y <= ground) {
          y = ground;
          resting = true;
          this._settle(k);
        } else if (this.age[k] > 8) {
          resting = true;                     // caught somewhere: leave it there
        }
        this.pos[k3] = x; this.pos[k3 + 1] = y; this.pos[k3 + 2] = z;
        this.vel[k3] = vx; this.vel[k3 + 1] = vy; this.vel[k3 + 2] = vz;
        if (!resting) this.active[w++] = k;
      }
      this.active.length = w;
      this.attrPos.needsUpdate = true;
      this.attrQuat.needsUpdate = true;
    }
    if (this.dirtyStatic) {
      this.attrA.needsUpdate = true;
      this.attrB.needsUpdate = true;
      this.attrPos.needsUpdate = true;
      this.attrQuat.needsUpdate = true;
      this.dirtyStatic = false;
    }
    // always draw at least one (empty) slot, so the graphics card readies this shader during loading, not at the first cut
    this.geometry.instanceCount = Math.max(1, this.count) * HAIRS;
  }
}
