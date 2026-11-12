// The fur. Every strand is a camera-facing ribbon grown in the vertex shader:
// a curve leaving the skin, bending under gravity and wind, gathered into locks
// and draped over the body using the baked distance volume. Each ribbon then
// carries several individual hairs, drawn procedurally so that more of them
// resolve the closer you get.
import * as THREE from 'three';
import { COMMON, SHADOWS, ATMOSPHERE, SKINNING } from '../gfx/glsl.js';
import { U } from '../gfx/globals.js';

const VERT = /* glsl */ `
precision highp sampler3D;
${COMMON}
${SKINNING}
attribute vec3 iRoot;
attribute vec3 iOff;      // root minus the root of the lock it belongs to
attribute vec3 iDir;      // direction the lock leaves the skin
attribute vec3 iNormal;
attribute vec4 iA;        // length, width, strand seed, lock seed
attribute vec4 iB;        // droop, lock tightness, layer height, breathing weight
attribute vec4 iCol;      // tone, ginger, lock variation, strand variation
attribute vec4 iSkinIdx;
attribute vec4 iSkinWgt;

uniform sampler3D uSdf;
uniform vec3 uSdfMin;
uniform vec3 uSdfInvSize;
uniform float uWidthScale;
uniform float uBreath;
uniform float uLengthScale;
uniform float uPxScale;     // pixels per metre at one metre from the eye

varying vec2 vUV;
varying vec3 vTan;
varying vec3 vVolN;
varying vec3 vPosW;
varying vec4 vCol;
varying vec3 vInfo;   // strand seed, length, lock seed
varying float vLayer;  // 0 = lying deep in the coat, 1 = riding on top
varying float vSingle; // 1 = far away: the ribbon is drawn as one fine strand

void main() {
  float t = position.y;
  float L = iA.x * uLengthScale;
  float ss = iA.z, cs = iA.w;

  mat4 skin = boneMatrix(iSkinIdx.x) * iSkinWgt.x + boneMatrix(iSkinIdx.y) * iSkinWgt.y;
  mat3 skinR = mat3(skin);
  vec3 rootW = (skin * vec4(iRoot, 1.0)).xyz;

  // wind, brought back into the rest pose where the strand is shaped
  vec3 windR = transpose(skinR) * windPush(rootW, cs);

  vec3 d0 = iDir;
  float droop = iB.x;
  vec3 dEnd = normalize(mix(d0, vec3(0.0, -1.0, 0.0), droop) + windR * (0.55 + 0.5 * droop));
  vec3 P1 = d0 * (L * 0.36);
  vec3 P2 = P1 + dEnd * (L * 0.64);
  float it = 1.0 - t;
  vec3 p = 2.0 * it * t * P1 + t * t * P2;
  vec3 dp = 2.0 * it * P1 + 2.0 * t * (P2 - P1);

  // gather into the lock
  float pull = iB.y * t * (2.0 - t);
  float dpull = iB.y * (2.0 - 2.0 * t);
  p -= iOff * pull;
  dp -= iOff * dpull;

  // the whole lock waves together; each strand adds a little frizz of its own
  vec3 e1 = normalize(cross(d0, abs(d0.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 e2 = cross(d0, e1);
  float wAmp = (0.006 + 0.03 * L) * (0.5 + cs);
  float f1 = 6.2831 * (0.8 + 1.1 * fract(cs * 7.31)), f2 = 6.2831 * (0.6 + 1.2 * fract(cs * 3.77));
  float a1 = f1 * t + cs * 40.0 + ss * 0.9, a2 = f2 * t + cs * 71.0 + ss * 0.7;
  p += wAmp * t * (e1 * sin(a1) + e2 * sin(a2));
  dp += wAmp * (e1 * (sin(a1) + t * f1 * cos(a1)) + e2 * (sin(a2) + t * f2 * cos(a2)));
  float zAmp = 0.005 + 0.016 * L;
  float g1 = 6.2831 * (1.2 + 1.0 * fract(ss * 13.7)), g2 = 6.2831 * (1.0 + 1.2 * fract(ss * 5.3));
  float b1 = g1 * t + ss * 90.0, b2 = g2 * t + ss * 37.0;
  p += zAmp * t * (e1 * sin(b1) + e2 * cos(b2));
  dp += zAmp * (e1 * (sin(b1) + t * g1 * cos(b1)) + e2 * (cos(b2) - t * g2 * sin(b2)));

  vec3 pos = iRoot + p;
  vec3 tan = normalize(dp);

  // drape over the body: keep every point at least its layer height off the skin
  vec4 sd = texture(uSdf, (pos - uSdfMin) * uSdfInvSize);
  vec3 grad = normalize(sd.xyz);
  float h = iB.z * smoothstep(0.0, 0.3, t) + 0.004;
  float push = max(0.0, h - sd.a);
  pos += grad * push;
  if (push > 0.0005) {
    float into = min(0.0, dot(tan, grad));
    tan = normalize(tan - grad * into);
  }
  // breathing moves the skin; the strand rides along
  pos += iNormal * (iB.w * uBreath);

  vec3 posW = (skin * vec4(pos, 1.0)).xyz;
  vec3 tanW = normalize(skinR * tan);

  #ifdef DEPTH_PASS
    vec3 toEye = uSunDir;
  #else
    vec3 toEye = normalize(cameraPosition - posW);
  #endif
  vec3 sideDir = cross(tanW, toEye);
  float sl = length(sideDir);
  sideDir = sl > 1e-4 ? sideDir / sl : vec3(1.0, 0.0, 0.0);
  float width = iA.y * uWidthScale;
  #ifdef DEPTH_PASS
    vSingle = 0.0;
  #else
    // Up close a ribbon is a lock carrying many hairs. Further off, where it
    // would only be a few pixels wide, it is drawn as a single fine strand
    // instead (never thinner than about a pixel) so the coat stays crisp and
    // hair-like rather than turning into flat blades.
    float pxPerM = uPxScale / max(-(viewMatrix * vec4(posW, 1.0)).z, 0.05);
    float lockPx = width * pxPerM;
    vSingle = 1.0 - smoothstep(6.0, 14.0, lockPx);
    float strandPx = max(1.4, lockPx * 0.27);
    width = mix(lockPx, strandPx, vSingle) / pxPerM;
  #endif
  width *= mix(1.0, 0.4, t);
  posW += sideDir * (position.x * width);

  vUV = vec2(position.x + 0.5, t);
  vTan = tanW;
  // soft "volume" normal: mostly the body's shape, a little of the strand's own lean
  vVolN = normalize(skinR * mix(grad, iNormal, 0.35));
  vPosW = posW;
  vCol = iCol;
  vInfo = vec3(ss, L, cs);
  vLayer = clamp(iB.z / (0.015 + 0.13 * iA.x), 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(posW, 1.0);
}
`;

const HAIRS = /* glsl */ `
// Several hairs live on one ribbon. n = how many; returns coverage.
float hairLayer(vec2 uv, float seed, float n, out float across, out float hid) {
  float x = uv.x * n;
  float id = floor(x);
  float fx = fract(x);
  float h1 = hash11(id * 1.37 + seed * 91.7 + n * 0.31);
  float h2 = hash11(id * 2.11 + seed * 37.3 + 4.7);
  float hl = 0.55 + 0.45 * h1;                                    // each hair ends at its own length
  float cx = 0.5 + 0.09 * sin(uv.y * (2.0 + 4.0 * h2) + h1 * 6.2831); // and wanders a little
  float hw = mix(0.30, 0.21, smoothstep(0.0, 0.25, uv.y));         // a little thicker at the root
  hw *= 0.45 + 0.55 * smoothstep(hl, hl - 0.3, uv.y);              // tapering to a point
  float d = abs(fx - cx);
  float fw = max(fwidth(x), 1e-4);
  hw = max(hw, fw * 0.6);                                          // at least ~1.2 px wide
  float aa = fw * 0.6;
  float a = 1.0 - smoothstep(hw - aa, hw + aa, d);
  a *= 1.0 - smoothstep(hl - 0.03, hl, uv.y);
  across = clamp((fx - cx) / max(hw, 1e-3), -1.0, 1.0);
  hid = id + n * 17.0;
  return a;
}
float hairCoverage(vec2 uv, float seed, out float across, out float hid, out float resolved) {
  float px = 1.0 / max(fwidth(uv.x), 1e-5);       // ribbon width in pixels
  float lvl = clamp(log2(max(px, 1.0) / 3.6), 1.0, 5.0);
  float l0 = floor(lvl), f = lvl - l0;
  float ac0, id0, ac1, id1;
  float a0 = hairLayer(uv, seed, exp2(l0), ac0, id0);
  float a1 = hairLayer(uv, seed, exp2(l0 + 1.0), ac1, id1);
  bool second = f > 0.5;
  across = second ? ac1 : ac0;
  hid = second ? id1 : id0;
  resolved = smoothstep(2.0, 5.0, px / exp2(lvl));  // 1 when single hairs are a few pixels wide
  return mix(a0, a1, f);
}
`;

const FRAG = /* glsl */ `
${COMMON}
${SHADOWS}
${ATMOSPHERE}
${HAIRS}
varying vec2 vUV;
varying vec3 vTan;
varying vec3 vVolN;
varying vec3 vPosW;
varying vec4 vCol;
varying vec3 vInfo;
varying float vLayer;
varying float vSingle;

uniform float uSigma;       // how fast sunlight is absorbed inside the coat
uniform float uFrost;
uniform vec3 uRootColor;
uniform vec3 uMidColor;
uniform vec3 uLightColor;
uniform vec3 uGingerColor;

float strandSpec(vec3 T, vec3 H, float e) {
  float th = dot(T, H);
  float sinTH = sqrt(max(0.0, 1.0 - th * th));
  return smoothstep(-1.0, 0.0, th) * pow(sinTH, e);
}

vec3 hairColor(float tone, float red, float t, float var) {
  float k = clamp(tone + (var - 0.5) * 0.4, 0.0, 1.0);
  vec3 base = k < 0.5 ? mix(uRootColor, uMidColor, k * 2.0) : mix(uMidColor, uLightColor, k * 2.0 - 1.0);
  base = mix(base, uGingerColor * (0.4 + 0.9 * k), red * 0.6);
  // dark at the buried root, sun-bleached towards the tip
  base *= mix(0.5, 1.0, smoothstep(0.0, 0.45, t));
  base = mix(base, base * 1.7 + vec3(0.012, 0.007, 0.003), smoothstep(0.35, 1.0, t) * 0.5);
  return base;
}

void main() {
  float t = vUV.y;
  float across, hid, resolved;
  float alpha = 1.0;
  if (vSingle < 0.995) {
    alpha = hairCoverage(vUV, vInfo.x, across, hid, resolved);
    // far strands are solid geometry; multisampling does their anti-aliasing
    alpha = mix(alpha, 1.0, vSingle);
    across = mix(across, vUV.x * 2.0 - 1.0, vSingle);
    hid = mix(hid, 0.0, step(0.5, vSingle));
  } else {
    across = vUV.x * 2.0 - 1.0; hid = 0.0; resolved = 0.0;
  }
  float dither = ign(gl_FragCoord.xy);
  #ifdef USE_A2C
    if (alpha < 0.03) discard;
  #else
    if (alpha < 0.08 + dither * 0.84) discard;
    alpha = 1.0;
  #endif

  vec3 N = normalize(vVolN);
  vec3 T = normalize(vTan);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = uSunDir;
  float hr = hash11(hid * 0.731 + vInfo.x * 53.0);

  vec3 albedo = hairColor(vCol.x, vCol.y, t, vCol.z * 0.75 + vCol.w * 0.25);
  albedo *= (0.8 + 0.4 * hr) * (0.72 + 0.56 * vCol.z);
  // rime: frost gathers on the tips of hair that faces the sky
  float rime = smoothstep(0.5, 0.92, N.y) * smoothstep(0.45, 1.0, t) * smoothstep(0.55, 0.8, fract(vInfo.x * 7.13 + vInfo.z * 3.7));
  albedo = mix(albedo, vec3(0.60, 0.64, 0.70), rime * uFrost);

  // how buried this bit of hair is: roots and under-layers sit in the dark
  float buried = mix(0.35, 1.0, vLayer);
  float open = mix(0.14, 1.0, smoothstep(0.0, 0.8, t)) * mix(0.42, 1.0, vLayer);

  // sunlight soaking into the coat
  float vis = sunVisibility(vPosW + N * 0.012, uSigma, 0.01, 0.016, dither);

  float NL = dot(N, L);
  float wrap = saturate1((NL + 0.42) / 1.42);
  float TL = dot(T, L);
  float kk = sqrt(max(0.0, 1.0 - TL * TL));
  // a strand seen end-on to the light catches less of it
  float diffuse = wrap * mix(0.5, 1.0, kk);
  // individual hairs are round: darken their edges once they resolve
  float roundness = mix(1.0, 0.5 + 0.5 * sqrt(max(0.0, 1.0 - across * across)), resolved);

  vec3 col = albedo * uSunColor * diffuse * vis * roundness * mix(0.5, 1.0, buried) * mix(0.55, 1.0, smoothstep(0.0, 0.5, t));

  // two highlights, as on real hair: a pale one off the surface and a
  // coloured one that has passed through the fibre
  vec3 H = normalize(L + V);
  float sn = hr - 0.5;
  vec3 T1 = normalize(T + N * (-0.05 + sn * 0.10));
  vec3 T2 = normalize(T + N * (0.11 + sn * 0.14));
  float s1 = strandSpec(T1, H, 95.0);
  float s2 = strandSpec(T2, H, 20.0);
  float specMask = vis * smoothstep(-0.25, 0.35, NL) * mix(0.3, 1.0, smoothstep(0.1, 0.6, t)) * buried;
  vec3 bright = sqrt(albedo);
  col += (vec3(0.055) * s1 + bright * 0.13 * s2) * uSunColor * specMask;

  // sun behind the coat: the outline lights up as light passes through the
  // loose outer hair. The shadow map cannot see through that fringe, so the
  // outline is let through by how edge-on it is to the eye.
  float back = pow(saturate1(dot(-V, L)), 2.0);
  float edge = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.4);
  float tipward = smoothstep(0.2, 0.95, t);
  float fringe = max(vis, edge * back * mix(0.35, 1.0, vLayer));
  vec3 through = bright * vec3(1.0, 0.70, 0.40);
  col += through * uSunColor * back * (0.06 + 3.0 * edge) * tipward * fringe * 0.8;

  // sky light, fading into the depth of the coat
  col += albedo * ambientLight(normalize(N + vec3(0.0, 0.25, 0.0))) * open * roundness;

  col = applyAtmosphere(col, vPosW, cameraPosition);
  gl_FragColor = vec4(col, alpha);
}
`;

const FRAG_DEPTH = /* glsl */ `
${COMMON}
${HAIRS}
varying vec2 vUV;
varying vec3 vInfo;
void main() {
  float ac, id;
  float a = hairLayer(vUV, vInfo.x, 3.0, ac, id);
  if (a < 0.5) discard;
  gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0);
}
`;

export function makeRibbonGeometry(segments) {
  const pos = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pos.push(-0.5, t, 0, 0.5, t, 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { position: new Float32Array(pos), index: new Uint16Array(idx) };
}

export function makeFurGeometry(group, segments) {
  const base = makeRibbonGeometry(segments);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base.position, 3));
  geo.setIndex(new THREE.BufferAttribute(base.index, 1));
  const inst = (name, arr, size, normalized = false) => {
    geo.setAttribute(name, new THREE.InstancedBufferAttribute(arr, size, normalized));
  };
  inst('iRoot', group.iRoot, 3);
  inst('iOff', group.iOff, 3);
  inst('iDir', group.iDir, 3);
  inst('iNormal', group.iNormal, 3);
  inst('iA', group.iA, 4);
  inst('iB', group.iB, 4);
  inst('iCol', group.iCol, 4, true);
  inst('iSkinIdx', group.iSkinIdx, 4, false);
  inst('iSkinWgt', group.iSkinWgt, 4, true);
  geo.instanceCount = group.count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.7, 0), 6);
  return geo;
}

export function makeFurMaterials({ sdfTexture, sdfMin, sdfInvSize, boneTexture, a2c = true }) {
  const own = {
    uSdf: { value: sdfTexture },
    uSdfMin: { value: sdfMin },
    uSdfInvSize: { value: sdfInvSize },
    uBoneTex: { value: boneTexture },
    uBreath: { value: 0 },
    uLengthScale: { value: 1 },
    uSigma: { value: 15 },
    uFrost: { value: 0.55 },
    uRootColor: { value: new THREE.Color(0.011, 0.008, 0.007) },
    uMidColor: { value: new THREE.Color(0.076, 0.047, 0.029) },
    uLightColor: { value: new THREE.Color(0.185, 0.118, 0.070) },
    uGingerColor: { value: new THREE.Color(0.250, 0.125, 0.058) },
  };
  const color = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { ...U, ...own, uWidthScale: { value: 1 } },
    defines: { SHADOW_TAPS: 6, ...(a2c ? { USE_A2C: 1 } : {}) },
    side: THREE.DoubleSide,
    alphaToCoverage: a2c,
  });
  const depth = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG_DEPTH,
    uniforms: { ...U, ...own, uWidthScale: { value: 1.35 } },
    defines: { DEPTH_PASS: 1 },
    side: THREE.DoubleSide,
  });
  return { color, depth, uniforms: own };
}
