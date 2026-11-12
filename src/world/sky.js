// Sky and sunlight. A physically based atmosphere (Rayleigh + Mie + ozone,
// single scattering) is baked into a small lookup texture for the chosen sun
// position; clouds and the sun's disc are drawn live on top. The same sky then
// provides the scene's ambient light (spherical harmonics), the reflections
// (prefiltered environment map) and the colour of the distance haze.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { U } from '../gfx/globals.js';

const BETA_R = [5.802e-6, 13.558e-6, 33.1e-6];
const BETA_M_SCA = 3.996e-6, BETA_M_EXT = 4.44e-6;
const BETA_O = [0.65e-6, 1.881e-6, 0.085e-6];
const RE = 6360e3, RA = 6460e3, HR = 8000, HM = 1200;

const ATMOS_GLSL = /* glsl */ `
const float Re = 6360e3, Ra = 6460e3, HR = 8000.0, HM = 1200.0;
const vec3 betaR = vec3(5.802e-6, 13.558e-6, 33.1e-6);
const vec3 betaO = vec3(0.65e-6, 1.881e-6, 0.085e-6);
uniform float uMie;      // haze multiplier
uniform float uSunE;     // sun irradiance above the atmosphere
uniform vec3 uSun;
uniform float uAlt;
vec2 raySphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d), c = dot(o, o) - r * r, h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
vec3 densities(float h) {
  return vec3(exp(-h / HR), exp(-h / HM), max(0.0, 1.0 - abs(h - 25e3) / 15e3));
}
vec3 atmosphere(vec3 d) {
  vec3 o = vec3(0.0, Re + uAlt, 0.0);
  float tmax = raySphere(o, d, Ra).y;
  vec2 tg = raySphere(o, d, Re);
  if (tg.x > 0.0) tmax = min(tmax, tg.x);
  const int N = 40; const int M = 8;
  float bM = 3.996e-6 * uMie, bMe = 4.44e-6 * uMie;
  vec3 od = vec3(0.0), sumR = vec3(0.0), sumM = vec3(0.0);
  float tPrev = 0.0;
  for (int i = 0; i < N; i++) {
    // quadratic stepping: fine near the eye, coarse far away
    float f = (float(i) + 1.0) / float(N);
    float tNext = tmax * f * f;
    float dt = tNext - tPrev;
    vec3 p = o + d * (tPrev + dt * 0.5);
    tPrev = tNext;
    vec3 dens = densities(length(p) - Re);
    od += dens * dt;
    if (raySphere(p, uSun, Re).x > 0.0) continue;   // in the planet's shadow
    float tl = raySphere(p, uSun, Ra).y;
    float dl = tl / float(M);
    vec3 odl = vec3(0.0);
    for (int j = 0; j < M; j++) {
      vec3 pl = p + uSun * ((float(j) + 0.5) * dl);
      odl += densities(length(pl) - Re) * dl;
    }
    vec3 tau = betaR * (od.x + odl.x) + bMe * (od.y + odl.y) + betaO * (od.z + odl.z);
    vec3 att = exp(-tau);
    sumR += dens.x * att * dt;
    sumM += dens.y * att * dt;
  }
  float mu = dot(d, uSun);
  float pR = 3.0 / (16.0 * 3.14159265) * (1.0 + mu * mu);
  float g = 0.78;
  float pM = 3.0 / (8.0 * 3.14159265) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  vec3 L = uSunE * (sumR * betaR * pR + sumM * bM * pM);
  // stand-in for multiple scattering: lifts and blues the shadowed sky
  L += uSunE * sumR * betaR * vec3(0.012, 0.016, 0.024) * 4.0;
  return L;
}
`;

const LUT_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec2 vUv;
void main() {
  float phi = (vUv.x - 0.5) * 6.28318530718;
  float theta = (1.0 - vUv.y) * 3.14159265359;   // v = 1 is straight up
  vec3 d = vec3(cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
  d.y = max(d.y, 0.0015);
  d = normalize(d);
  vec3 L = atmosphere(d);
  // Single scattering leaves the low sky opposite the sun a sour yellow-green.
  // The real one is pale peach near the ground with a rose band above it
  // (the Belt of Venus), so ease it that way.
  float lum = dot(L, vec3(0.2126, 0.7152, 0.0722));
  float away = smoothstep(0.7, -0.5, dot(normalize(d.xz), normalize(uSun.xz)));
  float low = 1.0 - smoothstep(0.0, 0.24, d.y);
  vec3 lowTint = mix(vec3(1.32, 0.93, 0.66), vec3(1.24, 0.95, 0.93), away);   // gold towards the sun, peach away
  L = mix(L, lum * lowTint, low * mix(0.7, 0.9, away));
  float bx = (d.y - 0.11) / 0.075;
  float belt = exp(-bx * bx) * away;
  L += lum * vec3(0.30, 0.07, 0.15) * belt;
  gl_FragColor = vec4(L, 1.0);
}`;

// clouds + sun + lookup, shared by the live sky and the environment bakes
const SKY_GLSL = /* glsl */ `
uniform sampler2D uSkyLut;
uniform sampler2D uNoise;
uniform vec3 uSunDir;
uniform vec3 uSunTint;       // normalised sun colour at ground level
uniform vec3 uCloudSun;      // sunlight colour up at cloud height
uniform float uTime;
uniform float uSunDisc;
uniform vec3 uGroundRadiance;
uniform float uEnvMode;      // 1 = baking light (no sun disc, ground filled in)
uniform vec4 uCloud;         // coverage, density, cirrus amount, drift speed

vec3 lut(vec3 d) {
  vec2 uv = vec2(atan(d.z, d.x) / 6.28318530718 + 0.5, 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359);
  return textureLod(uSkyLut, uv, 0.0).rgb;
}
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (i + f + 0.5) / 256.0, 0.0).r;
}
float fbmC(vec2 p, int oct) {
  float a = 0.5, s = 0.0, w = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * n2(p); w += a;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(3.7, 8.1);
    a *= 0.5;
  }
  return s / w;
}
// distance along the view ray to a spherical shell at height H above us
float shellDist(float dy, float H) {
  float R = 6360e3;
  return sqrt(R * R * dy * dy + 2.0 * R * H + H * H) - R * dy;
}
float cumulus(vec2 p) {
  vec2 w = vec2(fbmC(p * 0.7 + 4.0, 3), fbmC(p * 0.7 + 21.0, 3));
  return fbmC(p + (w - 0.5) * 1.7, 6);
}
vec3 skyRadiance(vec3 d) {
  vec3 dir = normalize(d);
  if (dir.y < 0.0 && uEnvMode > 0.5) {
    // the land below, as far as lighting is concerned
    return mix(lut(vec3(dir.x, 0.0, dir.z)), uGroundRadiance, smoothstep(0.0, -0.08, dir.y));
  }
  vec3 dc = normalize(vec3(dir.x, max(dir.y, 0.0), dir.z));
  vec3 sky = lut(dc);
  float mu = dot(dir, uSunDir);
  float muPos = max(mu, 0.0);

  // tight aureole around the sun that the small lookup cannot hold
  vec3 glow = uSunTint * (pow(muPos, 900.0) * 6.0 + pow(muPos, 90.0) * 0.55 + pow(muPos, 12.0) * 0.08);

  float cloudA = 0.0;
  vec3 cloudC = vec3(0.0);

  // --- high cirrus: thin wind-combed streaks that catch the sun ---
  {
    float dist = shellDist(dc.y, 9000.0);
    vec2 p = dc.xz * dist / 9000.0;
    vec2 q = vec2(p.x * 0.5 + p.y * 0.14, p.y * 1.05 - p.x * 0.1) * 0.5 + vec2(uTime * uCloud.w * 0.6, 3.0);
    float warp = fbmC(q * 0.55 + 9.0, 3);
    vec2 qq = q + vec2(warp * 1.7, warp * 1.0);
    float c = fbmC(qq, 5);
    // mares' tails: combed wisps, gathered into patches with clear sky between
    float wisps = fbmC(vec2(qq.x * 0.85, qq.y * 3.4) + 31.0, 5);
    float patches = smoothstep(0.38, 0.62, fbmC(q * 0.21 + 4.0, 3));
    float thr = 1.0 - uCloud.z * 0.6;
    float a = smoothstep(thr, thr + 0.34, c * 0.55 + wisps * 0.5) * (0.25 + 0.75 * patches);
    a *= exp(-dist / 190000.0) * 0.6;
    vec3 lit = uCloudSun * (0.55 + 2.6 * pow(muPos, 6.0)) + sky * 0.35;
    cloudC = lit; cloudA = a;
  }
  // --- lower broken cloud: lit warm on the sunward side, slate underneath ---
  {
    float H = 3200.0;
    float dist = shellDist(dc.y, H);
    vec2 p = dc.xz * dist / H * 0.42 + vec2(uTime * uCloud.w, 0.0);
    float base = cumulus(p);
    float cov = 1.0 - uCloud.x;
    float dens = smoothstep(cov, cov + 0.26, base);
    if (dens > 0.001) {
      // march a few steps towards the sun through the layer for self-shadowing
      vec2 sdir = normalize(uSunDir.xz + 1e-5);
      float sh = 0.0;
      sh += smoothstep(cov, cov + 0.26, cumulus(p + sdir * 0.09));
      sh += smoothstep(cov, cov + 0.26, cumulus(p + sdir * 0.24));
      sh += smoothstep(cov, cov + 0.26, cumulus(p + sdir * 0.5)) * 0.7;
      float lightT = exp(-sh * 1.15);
      float edge = 1.0 - smoothstep(0.0, 0.55, dens);          // thin edges glow
      float fwd = 1.0 + 3.5 * pow(muPos, 5.0) + 14.0 * pow(muPos, 60.0) * edge;
      vec3 skyAmb = lut(vec3(0.0, 1.0, 0.0)) * 1.4 + lut(normalize(vec3(-uSunDir.x, 0.25, -uSunDir.z))) * 0.5;
      vec3 lit = uCloudSun * lightT * fwd * (0.35 + 0.65 * edge) * 0.95;
      vec3 col = lit + skyAmb * (0.5 + 0.3 * (1.0 - dens));
      float a = 1.0 - exp(-dens * uCloud.y);
      // far clouds sink into the haze
      float haze = 1.0 - exp(-dist / 70000.0);
      col = mix(col, sky, haze * 0.9);
      a *= 1.0 - haze * 0.55;
      cloudC = mix(cloudC, col, a);
      cloudA = cloudA + a * (1.0 - cloudA);
    }
  }
  // nothing floats right on the horizon line
  cloudA *= smoothstep(0.0, 0.035, dc.y);

  vec3 col = mix(sky + glow, cloudC, cloudA);

  if (uEnvMode < 0.5) {
    float r = 0.0062;                                  // a little larger than life
    float ang = acos(clamp(mu, -1.0, 1.0));
    float disc = 1.0 - smoothstep(r * 0.86, r, ang);
    float limb = 1.0 - 0.5 * pow(clamp(ang / r, 0.0, 1.0), 2.0);
    col += uSunTint * uSunDisc * disc * limb * (1.0 - cloudA) * smoothstep(-0.003, 0.004, dir.y);
  }
  return col;
}
`;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const EQUIRECT_FRAG = /* glsl */ `
${SKY_GLSL}
varying vec2 vUv;
void main() {
  float phi = (vUv.x - 0.5) * 6.28318530718;
  float theta = (1.0 - vUv.y) * 3.14159265359;
  vec3 d = vec3(cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
  gl_FragColor = vec4(skyRadiance(d), 1.0);
}`;

const DOME_VERT = /* glsl */ `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
varying vec3 vDir;
void main() {
  vec4 v = uInvProj * vec4(position.xy, 1.0, 1.0);
  vDir = mat3(uCamWorld) * (v.xyz / v.w);
  gl_Position = vec4(position.xy, 1.0, 1.0);   // on the far plane
}`;

const DOME_FRAG = /* glsl */ `
${SKY_GLSL}
varying vec3 vDir;
void main() {
  // alpha 0 marks sky for the light-shaft pass
  gl_FragColor = vec4(skyRadiance(vDir), 0.0);
}`;

function opticalDepthToSun(sunDir, altitude) {
  // march from the ground towards the sun through the atmosphere
  const o = [0, RE + altitude, 0];
  const b = o[1] * sunDir.y;
  const c = o[1] * o[1] - RA * RA;
  const tmax = -b + Math.sqrt(b * b - c);
  const N = 256, dt = tmax / N;
  let dR = 0, dM = 0, dO = 0;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * dt;
    const px = sunDir.x * t, py = o[1] + sunDir.y * t, pz = sunDir.z * t;
    const h = Math.sqrt(px * px + py * py + pz * pz) - RE;
    dR += Math.exp(-h / HR) * dt;
    dM += Math.exp(-h / HM) * dt;
    dO += Math.max(0, 1 - Math.abs(h - 25e3) / 15e3) * dt;
  }
  return [dR, dM, dO];
}

export class Sky {
  constructor(renderer, { azimuth = -35, elevation = 10, sunE = 20, mie = 2.2, altitude = 250, cloud = [0.5, 3.2, 0.75, 0.0016] } = {}) {
    this.renderer = renderer;
    this.sunE = sunE;
    this.mie = mie;
    this.altitude = altitude;
    this.sunDir = new THREE.Vector3();
    this.sunColor = new THREE.Vector3();
    this.quad = new FullScreenQuad();

    this.lutTarget = new THREE.WebGLRenderTarget(256, 128, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    this.lutTarget.texture.wrapS = THREE.RepeatWrapping;
    this.lutTarget.texture.wrapT = THREE.ClampToEdgeWrapping;

    this.lutMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: LUT_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uMie: { value: mie }, uSunE: { value: sunE }, uSun: { value: this.sunDir }, uAlt: { value: altitude } },
    });

    this.uniforms = {
      uSkyLut: { value: this.lutTarget.texture },
      uNoise: U.uNoise,
      uSunDir: { value: this.sunDir },
      uSunTint: { value: new THREE.Vector3(1, 0.6, 0.3) },
      uCloudSun: { value: new THREE.Vector3(1, 0.7, 0.45) },
      uTime: U.uTime,
      uSunDisc: { value: 900 },
      uGroundRadiance: { value: new THREE.Vector3(0.3, 0.3, 0.3) },
      uEnvMode: { value: 0 },
      uCloud: { value: new THREE.Vector4(...cloud) },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
    };

    // live sky: one triangle on the far plane, drawn last
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, uniforms: this.uniforms,
      depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.mesh.onBeforeRender = (r, s, camera) => {
      this.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
      this.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    };

    this.equirectMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: EQUIRECT_FRAG, uniforms: this.uniforms, depthTest: false, depthWrite: false,
    });
    this.probeTarget = new THREE.WebGLRenderTarget(64, 32, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false });
    this.envEquirect = new THREE.WebGLRenderTarget(1024, 512, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    this.envEquirect.texture.mapping = THREE.EquirectangularReflectionMapping;
    this.envEquirect.texture.wrapS = THREE.RepeatWrapping;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = null;

    this.setSun(azimuth, elevation);
  }

  setSun(azimuthDeg, elevationDeg) {
    const az = (azimuthDeg * Math.PI) / 180, el = (elevationDeg * Math.PI) / 180;
    this.elevation = el;
    this.sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();

    const sunAt = (alt, out) => {
      const [dR, dM, dO] = opticalDepthToSun(this.sunDir, alt);
      for (let i = 0; i < 3; i++) {
        out.setComponent(i, Math.exp(-(BETA_R[i] * dR + BETA_M_EXT * this.mie * dM + BETA_O[i] * dO)));
      }
      return out;
    };
    // sunlight reaching the ground, and (less reddened) reaching the clouds
    const T = sunAt(this.altitude, new THREE.Vector3());
    this.sunIrradiance = T.clone().multiplyScalar(this.sunE);
    this.sunColor.copy(this.sunIrradiance).multiplyScalar(1 / Math.PI);
    const m = Math.max(T.x, T.y, T.z) || 1;
    this.uniforms.uSunTint.value.copy(T).multiplyScalar(1 / m);
    const Tc = sunAt(3500, new THREE.Vector3());
    this.uniforms.uCloudSun.value.copy(Tc).multiplyScalar(this.sunE / Math.PI * 0.9);

    U.uSunDir.value.copy(this.sunDir);
    U.uSunColor.value.copy(this.sunColor);
    this.bake();
  }

  _render(material, target) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    this.quad.material = material;
    r.setRenderTarget(target);
    this.quad.render(r);
    r.setRenderTarget(prev);
  }

  _probe() {
    // read the sky back and project it onto spherical harmonics
    this._render(this.equirectMaterial, this.probeTarget);
    const w = 64, h = 32;
    const px = new Float32Array(w * h * 4);
    this.renderer.readRenderTargetPixels(this.probeTarget, 0, 0, w, h, px);
    const c = Array.from({ length: 9 }, () => new THREE.Vector3());
    let wsum = 0;
    const col = new THREE.Vector3();
    for (let y = 0; y < h; y++) {
      const v = (y + 0.5) / h;
      const theta = (1 - v) * Math.PI;
      const st = Math.sin(theta), ct = Math.cos(theta);
      for (let x = 0; x < w; x++) {
        const phi = ((x + 0.5) / w - 0.5) * Math.PI * 2;
        const dx = Math.cos(phi) * st, dy = ct, dz = Math.sin(phi) * st;
        const i = (x + y * w) * 4;
        // clamp so the sun's glow cannot dominate the ambient term
        col.set(Math.min(px[i], 30), Math.min(px[i + 1], 30), Math.min(px[i + 2], 30));
        const b = [0.282095, 0.488603 * dy, 0.488603 * dz, 0.488603 * dx, 1.092548 * dx * dy, 1.092548 * dy * dz,
          0.315392 * (3 * dz * dz - 1), 1.092548 * dx * dz, 0.546274 * (dx * dx - dy * dy)];
        for (let k = 0; k < 9; k++) c[k].addScaledVector(col, b[k] * st);
        wsum += st;
      }
    }
    const norm = (4 * Math.PI) / wsum;
    for (const v of c) v.multiplyScalar(norm);
    return c;
  }

  static irradiance(sh, n) {
    const { x, y, z } = n;
    const r = sh[0].clone().multiplyScalar(0.886227);
    r.addScaledVector(sh[1], 2 * 0.511664 * y).addScaledVector(sh[2], 2 * 0.511664 * z).addScaledVector(sh[3], 2 * 0.511664 * x);
    r.addScaledVector(sh[4], 2 * 0.429043 * x * y).addScaledVector(sh[5], 2 * 0.429043 * y * z);
    r.addScaledVector(sh[6], 0.743125 * z * z - 0.247708).addScaledVector(sh[7], 2 * 0.429043 * x * z);
    r.addScaledVector(sh[8], 0.429043 * (x * x - y * y));
    return r;
  }

  /** Re-render the lookup, then the ambient probe and reflection map. */
  bake(groundAlbedo = new THREE.Vector3(0.62, 0.64, 0.68)) {
    this._render(this.lutMaterial, this.lutTarget);
    U.uSkyLut.value = this.lutTarget.texture;

    // pass 1: sky alone, to find how much light falls on the ground
    this.uniforms.uEnvMode.value = 1;
    this.uniforms.uGroundRadiance.value.set(0, 0, 0);
    let sh = this._probe();
    const up = new THREE.Vector3(0, 1, 0);
    const eSky = Sky.irradiance(sh, up);
    const eSun = this.sunIrradiance.clone().multiplyScalar(Math.max(0, this.sunDir.y));
    const ground = eSky.add(eSun).multiply(groundAlbedo).multiplyScalar(1 / Math.PI);
    // pass 2: with the lit ground bouncing light back up
    this.uniforms.uGroundRadiance.value.copy(ground);
    sh = this._probe();
    sh.forEach((v, i) => U.uSH.value[i].copy(v));
    this.sh = sh;

    this._render(this.equirectMaterial, this.envEquirect);
    if (this.envMap) this.envMap.dispose();
    this.envMap = this.pmrem.fromEquirectangular(this.envEquirect.texture);
    this.uniforms.uEnvMode.value = 0;
    return this.envMap.texture;
  }

  /** A three.js light matching the sun, for the built-in materials. */
  makeLight() {
    const light = new THREE.DirectionalLight(0xffffff, 1);
    this.light = light;
    this.syncLight();
    return light;
  }
  syncLight() {
    if (!this.light) return;
    const e = this.sunIrradiance;
    const m = Math.max(e.x, e.y, e.z) || 1;
    this.light.color.setRGB(e.x / m, e.y / m, e.z / m);
    this.light.intensity = m;
    this.light.position.copy(this.sunDir).multiplyScalar(100);
  }
}
