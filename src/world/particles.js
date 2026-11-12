// Ice crystals drifting on the wind, and the mammoth's breath in the cold.
import * as THREE from 'three';
import { COMMON, SHADOWS } from '../gfx/glsl.js';
import { U } from '../gfx/globals.js';
import { mulberry32 } from './noise.js';

const additive = {
  transparent: true, depthWrite: false, depthTest: true,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  // leave alpha alone: it marks sky for the light shafts
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
};

export function buildSnowDust({ count = 5000, box = 26, seed = 99 } = {}) {
  const rng = mulberry32(seed);
  const pos = new Float32Array(count * 3), rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rng() * box; pos[i * 3 + 1] = rng() * box; pos[i * 3 + 2] = rng() * box;
    rnd[i * 4] = rng(); rnd[i * 4 + 1] = rng(); rnd[i * 4 + 2] = rng(); rnd[i * 4 + 3] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uBox: { value: box }, uAmount: { value: 1 } },
    defines: { SHADOW_TAPS: 1 },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec4 aRnd;
      uniform float uBox; uniform float uPxScale; uniform float uAmount;
      varying float vFade; varying vec3 vPosW; varying float vTwinkle;
      void main() {
        // drift with the wind, sink slowly, wrap around the camera
        vec3 vel = vec3(uWind.x, 0.0, uWind.y) * (0.9 + 1.2 * uWind.z) + vec3(0.0, -0.22 - 0.25 * aRnd.x, 0.0);
        vec3 p = position + vel * uTime;
        p.x += sin(uTime * (0.4 + aRnd.y) + aRnd.z * 20.0) * 0.35;
        p.z += cos(uTime * (0.3 + aRnd.w) + aRnd.x * 20.0) * 0.35;
        p.y += sin(uTime * 0.7 + aRnd.w * 30.0) * 0.12;
        vec3 c = cameraPosition;
        p = mod(p - c + uBox * 0.5, uBox) - uBox * 0.5 + c;
        // thicker close to the ground, where the wind lifts snow off the drifts
        float low = exp(-max(p.y - 0.2, 0.0) * 0.28);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        float size = (0.004 + 0.007 * aRnd.x) * uPxScale / max(d, 0.1);
        gl_PointSize = clamp(size, 1.2, 28.0);
        // sub-pixel flakes dim instead of shrinking; fade at the edge of the box and near the eye
        float sub = clamp(size / 1.2, 0.0, 1.0);
        vFade = sub * smoothstep(uBox * 0.5, uBox * 0.3, d) * smoothstep(0.25, 1.2, d) * mix(0.25, 1.0, low) * uAmount * step(p.y, 60.0);
        if (aRnd.y > uAmount) vFade = 0.0;
        vTwinkle = 0.55 + 0.45 * sin(uTime * (3.0 + 5.0 * aRnd.z) + aRnd.w * 60.0);
        vPosW = p;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      ${SHADOWS}
      varying float vFade; varying vec3 vPosW; varying float vTwinkle;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(q, q);
        if (r2 > 1.0 || vFade <= 0.001) discard;
        float soft = exp(-r2 * 3.2);
        vec3 V = normalize(cameraPosition - vPosW);
        float mu = dot(-V, uSunDir);
        // ice scatters forwards: crystals blaze when you look towards the sun
        float phase = 0.22 + 1.3 * pow(clamp(mu, 0.0, 1.0), 6.0) + 9.0 * pow(clamp(mu, 0.0, 1.0), 60.0);
        float vis = sunVisibility(vPosW, 200.0, 0.05, 0.02, 0.5);
        vec3 col = uSunColor * phase * vis * vTwinkle + ambientLight(vec3(0.0, 1.0, 0.0)) * 0.3;
        gl_FragColor = vec4(col * soft * vFade * 0.5, 0.0);
      }`,
    ...additive,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'snow-dust';
  points.renderOrder = 2000;
  return points;
}

/** Soft puffs of breath: a small recycled pool of billboards. */
export class Breath {
  constructor(count = 36) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.data = new Float32Array(count * 4);   // age, life, size, seed
    this.vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) this.data[i * 4] = 1e3, this.data[i * 4 + 1] = 1;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aData', new THREE.BufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: /* glsl */ `
        ${COMMON}
        attribute vec4 aData;
        uniform float uPxScale;
        varying float vAlpha; varying vec3 vPosW; varying float vSeed;
        void main() {
          float k = clamp(aData.x / aData.y, 0.0, 1.0);
          vec4 mv = viewMatrix * vec4(position, 1.0);
          float size = aData.z * (0.35 + 1.9 * sqrt(k));
          gl_PointSize = clamp(size * uPxScale / max(-mv.z, 0.1), 1.0, 420.0);
          vAlpha = smoothstep(0.0, 0.12, k) * (1.0 - k) * (1.0 - k) * step(aData.x, aData.y);
          vPosW = position; vSeed = aData.w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying float vAlpha; varying vec3 vPosW; varying float vSeed;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(q, q);
          if (r2 > 1.0 || vAlpha <= 0.002) discard;
          // wispy rather than a clean disc
          float n = vnoise(gl_PointCoord * 3.0 + vSeed * 31.0) * 0.6 + vnoise(gl_PointCoord * 7.0 + vSeed * 11.0) * 0.4;
          float soft = exp(-r2 * 2.6) * (0.55 + 0.75 * n);
          vec3 V = normalize(cameraPosition - vPosW);
          float mu = clamp(dot(-V, uSunDir), 0.0, 1.0);
          vec3 col = uSunColor * (0.16 + 1.6 * pow(mu, 4.0)) + ambientLight(vec3(0.0, 1.0, 0.0)) * 0.55;
          gl_FragColor = vec4(col * soft * vAlpha * 0.085, 0.0);
        }`,
      ...additive,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2001;
    this.points.name = 'breath';
    this.next = 0;
    this.timer = 0;
    this.rng = mulberry32(4242);
  }

  /** origin and direction are world-space vectors; phase 0..1 is the breathing cycle */
  update(dt, origin, dir, exhaling) {
    const d = this.data, p = this.pos, v = this.vel;
    for (let i = 0; i < this.count; i++) {
      d[i * 4] += dt;
      if (d[i * 4] > d[i * 4 + 1]) continue;
      v[i * 3] *= 1 - 1.1 * dt; v[i * 3 + 1] = v[i * 3 + 1] * (1 - 0.9 * dt) + 0.1 * dt; v[i * 3 + 2] *= 1 - 1.1 * dt;
      // the wind carries it off
      p[i * 3] += (v[i * 3] + U.uWind.value.x * 0.5) * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += (v[i * 3 + 2] + U.uWind.value.y * 0.5) * dt;
    }
    if (exhaling) {
      this.timer += dt;
      while (this.timer > 0.07) {
        this.timer -= 0.07;
        const i = this.next; this.next = (this.next + 1) % this.count;
        const r = this.rng;
        p[i * 3] = origin.x + (r() - 0.5) * 0.05; p[i * 3 + 1] = origin.y + (r() - 0.5) * 0.05; p[i * 3 + 2] = origin.z + (r() - 0.5) * 0.05;
        const sp = 0.7 + 0.5 * r();
        v[i * 3] = dir.x * sp + (r() - 0.5) * 0.25; v[i * 3 + 1] = dir.y * sp + (r() - 0.5) * 0.2; v[i * 3 + 2] = dir.z * sp + (r() - 0.5) * 0.25;
        d[i * 4] = 0; d[i * 4 + 1] = 2.2 + 1.6 * r(); d[i * 4 + 2] = 0.22 + 0.16 * r(); d[i * 4 + 3] = r();
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aData.needsUpdate = true;
  }
}
