// HDR image pipeline: the scene renders into a multisampled half-float target,
// then gets bloom, light shafts, filmic tone mapping, a little grading, vignette
// and grain on the way to the screen.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOWN = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst; uniform float uClamp;
varying vec2 vUv;
vec3 s(vec2 o) {
  vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);   // one bad pixel must not bloom across the frame
  return clamp(c, vec3(0.0), vec3(uClamp));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0));
  vec3 d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0)), f = s(vec2(2.0, 0.0));
  vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0));
  vec3 j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));
  vec3 col;
  if (uFirst > 0.5) {
    // Karis average on the first step tames fireflies (snow sparkle, sun glints)
    vec3 g0 = (j + k + l + m) * 0.25, g1 = (a + b + d + e) * 0.25, g2 = (b + c + e + f) * 0.25;
    vec3 g3 = (d + e + g + h) * 0.25, g4 = (e + f + h + i) * 0.25;
    float w0 = 0.5 / (1.0 + luma(g0)), w1 = 0.125 / (1.0 + luma(g1)), w2 = 0.125 / (1.0 + luma(g2));
    float w3 = 0.125 / (1.0 + luma(g3)), w4 = 0.125 / (1.0 + luma(g4));
    col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const UP = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uRadius;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += (texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(o.x, 0.0)).rgb
      + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, o.y)).rgb) * 2.0;
  c += texture2D(tSrc, vUv + o).rgb + texture2D(tSrc, vUv - o).rgb
     + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb;
  gl_FragColor = vec4(c / 16.0, 1.0);
}`;

// light shafts: radial smear of the sky brightness away from the sun
const RAYS = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uSunUV; uniform float uAspect; uniform float uStrength;
varying vec2 vUv;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  const int N = 40;
  vec2 delta = (uSunUV - vUv);
  float dist = length(delta * vec2(uAspect, 1.0));
  delta *= 0.92 / float(N);
  float jitter = ign(gl_FragCoord.xy);
  vec2 uv = vUv + delta * jitter;
  vec3 acc = vec3(0.0);
  float w = 1.0, wsum = 0.0;
  for (int i = 0; i < N; i++) {
    vec4 s = texture2D(tSrc, uv);
    // alpha marks sky pixels (0) versus solid things (1)
    acc += min(s.rgb, vec3(30.0)) * (1.0 - smoothstep(0.0, 0.08, s.a)) * w;
    wsum += w;
    w *= 0.972;
    uv += delta;
  }
  float falloff = exp(-dist * 1.6);
  gl_FragColor = vec4(acc / wsum * falloff * uStrength, 1.0);
}`;

const FINAL = /* glsl */ `
#include <tonemapping_pars_fragment>
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tRays;
uniform float uBloom; uniform float uBloomLevels; uniform float uRays;
uniform float uVignette; uniform float uGrain; uniform float uTime;
uniform float uContrast; uniform float uSaturation; uniform vec3 uLift; uniform vec3 uGain;
uniform int uToneMap; uniform float uHueKeep;
varying vec2 vUv;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// Filmic curve that keeps colour in the highlights: the shoulder is applied
// partly per channel (film-like roll-off to white) and partly to brightness
// alone (hue and saturation survive), then anything out of range is eased
// back in by desaturating rather than clipping.
vec3 filmCurve(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 filmTone(vec3 c) {
  c = max(c, vec3(0.0));
  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 perChannel = filmCurve(c);
  vec3 byLuma = c * (filmCurve(vec3(L)).x / max(L, 1e-5));
  vec3 m = mix(perChannel, byLuma, uHueKeep);
  float Lm = dot(m, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(m.r, max(m.g, m.b));
  if (mx > 1.0) m = mix(vec3(min(Lm, 1.0)), m, clamp((1.0 - min(Lm, 1.0)) / max(mx - Lm, 1e-5), 0.0, 1.0));
  return clamp(m, 0.0, 1.0);
}
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  vec3 b = texture2D(tBloom, vUv).rgb / uBloomLevels;
  c = mix(c, b, uBloom);
  c += texture2D(tRays, vUv).rgb * uRays;
  // lens vignette
  vec2 q = vUv - 0.5;
  float v = 1.0 - dot(q, q) * uVignette;
  c *= v * v;
  if (uToneMap == 0) c = AgXToneMapping(c);
  else if (uToneMap == 1) c = ACESFilmicToneMapping(c);
  else if (uToneMap == 2) c = NeutralToneMapping(c);
  else c = filmTone(c * toneMappingExposure);
  // grade (display-referred)
  c = c * uGain + uLift * (1.0 - c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
  // sRGB encode
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // film grain doubles as dithering
  float n = hash(gl_FragCoord.xy + fract(uTime) * 311.7) - 0.5;
  c += n * uGrain * (0.6 + 0.4 * (1.0 - l));
  gl_FragColor = vec4(c, 1.0);
}`;

export class Post {
  constructor(renderer, { samples = 4, bloomLevels = 6 } = {}) {
    this.renderer = renderer;
    this.samples = samples;
    this.levels = bloomLevels;
    this.mips = [];
    this.quad = new FullScreenQuad();
    const mk = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra,
    });
    this.matDown = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 }, uClamp: { value: 40 } });
    this.matUp = mk(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } },
      { blending: THREE.AdditiveBlending, transparent: true });
    this.matRays = mk(RAYS, { tSrc: { value: null }, uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 }, uStrength: { value: 1 } });
    this.matFinal = mk(FINAL, {
      tScene: { value: null }, tBloom: { value: null }, tRays: { value: null },
      uBloom: { value: 0.05 }, uBloomLevels: { value: bloomLevels }, uRays: { value: 0.0 },
      uVignette: { value: 0.55 }, uGrain: { value: 0.022 }, uTime: { value: 0 },
      uContrast: { value: 0.25 }, uSaturation: { value: 1.12 },
      uLift: { value: new THREE.Vector3(0, 0, 0) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uToneMap: { value: 3 }, uHueKeep: { value: 0.5 },
    });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.sunUV = new THREE.Vector2(0.5, 0.5);
    this.sunVisible = 0;
    this.setSize(1, 1);
  }

  setSamples(n) {
    if (n === this.samples) return;
    this.samples = n;
    const { w, h } = this;
    this.w = 0;
    this.setSize(w, h);
  }

  setSize(w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    this.dispose();
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
    this.hdr = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true, samples: this.samples });
    this.mips = [];
    let mw = w, mh = h;
    for (let i = 0; i < this.levels; i++) {
      mw = Math.max(2, Math.floor(mw / 2)); mh = Math.max(2, Math.floor(mh / 2));
      this.mips.push(new THREE.WebGLRenderTarget(mw, mh, opts));
    }
    this.rays = new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), opts);
  }

  dispose() {
    if (this.hdr) this.hdr.dispose();
    for (const m of this.mips) m.dispose();
    if (this.rays) this.rays.dispose();
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  /** Call after the scene has been rendered into this.hdr. */
  finish(time) {
    const r = this.renderer;
    const autoClear = r.autoClear;
    r.autoClear = false;

    // bloom: downsample chain, then additive tent upsampling back up
    let src = this.hdr;
    for (let i = 0; i < this.levels; i++) {
      const dst = this.mips[i];
      this.matDown.uniforms.tSrc.value = src.texture;
      this.matDown.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.matDown.uniforms.uFirst.value = i === 0 ? 1 : 0;
      this._pass(this.matDown, dst);
      src = dst;
    }
    for (let i = this.levels - 1; i > 0; i--) {
      const from = this.mips[i], to = this.mips[i - 1];
      this.matUp.uniforms.tSrc.value = from.texture;
      this.matUp.uniforms.uTexel.value.set(1 / from.width, 1 / from.height);
      this._pass(this.matUp, to);
    }

    // light shafts
    const raysOn = this.matFinal.uniforms.uRays.value > 0 && this.sunVisible > 0.001;
    if (raysOn) {
      this.matRays.uniforms.tSrc.value = this.hdr.texture;
      this.matRays.uniforms.uSunUV.value.copy(this.sunUV);
      this.matRays.uniforms.uAspect.value = this.w / this.h;
      this.matRays.uniforms.uStrength.value = this.sunVisible;
      this._passRays();
    }

    const f = this.matFinal.uniforms;
    f.tScene.value = this.hdr.texture;
    f.tBloom.value = this.mips[0].texture;
    f.tRays.value = raysOn ? this.rays.texture : this.black;
    f.uTime.value = time;
    this.quad.material = this.matFinal;
    r.setRenderTarget(null);
    this.quad.render(r);
    r.autoClear = autoClear;
  }

  _passRays() {
    this.quad.material = this.matRays;
    this.renderer.setRenderTarget(this.rays);
    this.renderer.clear(true, false, false);
    this.quad.render(this.renderer);
  }
}
