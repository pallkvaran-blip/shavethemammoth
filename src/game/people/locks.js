// Hair for the people, drawn: every strand (grown by strands.js) is a ribbon
// that turns to face whoever is looking, lit as the mammoth's hair is.
import * as THREE from 'three';
import { U, LAYER_SHADOW_NEAR } from '../../gfx/globals.js';
import { COMMON, SHADOWS, ATMOSPHERE, LAMP } from '../../gfx/glsl.js';
import { growStrands } from './strands.js';

const VERT = /* glsl */ `
${COMMON}
attribute vec3 aTan;
attribute vec3 aNrm;
attribute vec2 aSeed;        // one number for the strand; how deep among the others it lies
uniform float uWidth;
uniform float uFlex;
uniform float uDense;
uniform float uPxScale;
#ifdef LOCKS_TWIST
  uniform vec4 uTwist;       // an upright line through (x, z) to turn about; all the way above y = .z, least below y = .w
  uniform vec2 uTwistBy;     // the angle, and the share of it the low end gets
  vec3 twisted(vec3 v, float a, vec3 about) {
    float c = cos(a), s = sin(a);
    v -= about;
    return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z) + about;
  }
#endif
varying vec2 vUV;
varying vec3 vTan;
varying vec3 vNrm;
varying vec3 vPosW;
varying vec3 vSeed;          // strand, depth, how much of a pixel it covers
void main() {
  float t = uv.y;
  vec3 p0 = position, t0 = aTan, n0 = aNrm;
  #ifdef LOCKS_TWIST
    // a beard goes with the chin it grows from, but what lies on the belly stays lying there
    float turn = uTwistBy.x * mix(uTwistBy.y, 1.0, smoothstep(uTwist.w, uTwist.z, p0.y));
    p0 = twisted(p0, turn, vec3(uTwist.x, 0.0, uTwist.y));
    t0 = twisted(t0, turn, vec3(0.0));
    n0 = twisted(n0, turn, vec3(0.0));
  #endif
  vec3 pw = (modelMatrix * vec4(p0, 1.0)).xyz;
  vec3 tw = normalize(mat3(modelMatrix) * t0);
  // the loose ends stir when the wind gets up
  pw += windPush(pw, aSeed.x) * uFlex * t * t;
  vec3 toEye = cameraPosition - pw;
  float far = length(toEye);
  vec3 side = normalize(cross(tw, toEye / far));
  float w = uWidth * mix(1.0, 0.3, smoothstep(0.5, 1.0, t)) * (0.7 + 0.6 * aSeed.x);
  #ifdef LOCKS_DEPTH
    w *= 1.6;
    float cover = 1.0;
  #else
    // a hair finer than a pixel is drawn a pixel wide and that much fainter. (Fainter, but not in proportion: where
    // hairs lie several deep, what shows between the near ones is more hair, and a head of it stays a solid thing
    // however far off it is.)
    float least = 1.15 * far / uPxScale;
    float cover = 1.0 - pow(1.0 - clamp(w / least, 0.0, 1.0), uDense);
    w = max(w, least);
  #endif
  pw += side * (uv.x - 0.5) * w;
  vUV = uv; vTan = tw; vNrm = normalize(mat3(modelMatrix) * n0); vPosW = pw; vSeed = vec3(aSeed, cover);
  gl_Position = projectionMatrix * viewMatrix * vec4(pw, 1.0);
}`;

const FRAG = /* glsl */ `
${COMMON}
${SHADOWS}
${ATMOSPHERE}
${LAMP}
uniform vec3 uRoot;
uniform vec3 uTip;
uniform vec3 uShine;
uniform float uSigma;
uniform float uGloss;
varying vec2 vUV;
varying vec3 vTan;
varying vec3 vNrm;
varying vec3 vPosW;
varying vec3 vSeed;

float strandSpec(vec3 T, vec3 H, float e) {
  float th = dot(T, H);
  return smoothstep(-1.0, 0.0, th) * pow(sqrt(max(0.0, 1.0 - th * th)), e);
}

void main() {
  float t = vUV.y, across = vUV.x * 2.0 - 1.0;
  float dither = ign(gl_FragCoord.xy);
  float alpha = vSeed.z * (1.0 - smoothstep(0.9, 1.0, t));
  if (alpha < 0.999) alpha = clamp(alpha + (dither - 0.5) * 0.25, 0.0, 1.0);
  if (alpha < 0.06) discard;

  vec3 N = normalize(vNrm), T = normalize(vTan), V = normalize(cameraPosition - vPosW), L = uSunDir;
  float hr = vSeed.x, deep = vSeed.y;
  float mid = sqrt(max(0.0, 1.0 - across * across));
  // dark where it is buried at the root, paler and sun-bleached towards the end; every strand a shade of its own
  vec3 albedo = mix(uRoot, uTip, smoothstep(0.0, 0.75, t) * (0.55 + 0.45 * deep));
  albedo *= 0.72 + 0.56 * hr;
  float open = mix(0.35, 1.0, deep) * mix(0.45, 1.0, smoothstep(0.0, 0.4, t));

  float vis = sunVisibility(vPosW + N * 0.004, uSigma, 0.004, 0.006, dither);
  float NL = dot(N, L);
  float wrap = saturate1((NL + 0.45) / 1.45);
  float TL = dot(T, L);
  float kk = sqrt(max(0.0, 1.0 - TL * TL));
  vec3 col = albedo * uSunColor * wrap * mix(0.5, 1.0, kk) * vis * (0.6 + 0.4 * mid) * mix(0.6, 1.0, deep);

  // two highlights, as on real hair: a pale one off the surface and a coloured one that has been through the fibre
  vec3 H = normalize(L + V);
  float sn = hr - 0.5;
  float s1 = strandSpec(normalize(T + N * (-0.05 + sn * 0.1)), H, 90.0);
  float s2 = strandSpec(normalize(T + N * (0.11 + sn * 0.14)), H, 18.0);
  float mask = vis * smoothstep(-0.25, 0.35, NL) * mix(0.3, 1.0, smoothstep(0.05, 0.5, t)) * mix(0.45, 1.0, deep);
  col += (uShine * 0.1 * s1 + sqrt(albedo) * 0.2 * s2) * uSunColor * mask * (0.45 + 0.55 * mid) * uGloss;

  // the sun behind it: the outline lights up
  float back = pow(saturate1(dot(-V, L)), 2.0);
  float edge = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.2);
  col += sqrt(albedo) * vec3(1.0, 0.72, 0.45) * uSunColor * back * (0.05 + 2.4 * edge) * smoothstep(0.15, 0.9, t) * max(vis, edge * back * 0.6) * 0.7;

  col += albedo * ambientLight(normalize(N + vec3(0.0, 0.3, 0.0))) * open * (0.65 + 0.35 * mid);
  col += albedo * lampLight(vPosW, N) * mix(0.55, 1.0, deep);
  col = applyAtmosphere(col, vPosW, cameraPosition);
  gl_FragColor = vec4(col, alpha);
}`;

const FRAG_DEPTH = /* glsl */ `
varying vec2 vUV;
void main() { if (vUV.y > 0.97) discard; gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }`;

/**
 * A mesh of hair to hang on a bone.
 * @param strands       from growStrands
 * @param opts.width    of a strand, metres (if it is to differ from what it was grown with)
 * @param opts.colour   { root, tip, shine }
 * @param opts.flex     how far the ends move in the wind (0 for none)
 * @param opts.dense    about how many strands deep it lies (so that it does not thin to nothing with distance)
 * @param opts.twist    { about: [x, z], full: y, least: y, share }: the hair turns about an upright line by material.uniforms.uTwistBy.value.x,
 *                      wholly above `full` and only by `share` of it below `least`
 */
export function locksMesh(strands, { width = strands.width, colour = {}, flex = 0.02, sigma = 70, gloss = 1, dense = 3, twist = null } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(strands.position, 3));
  geo.setAttribute('aTan', new THREE.BufferAttribute(strands.aTan, 3));
  geo.setAttribute('aNrm', new THREE.BufferAttribute(strands.aNrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(strands.uv, 2));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(strands.aSeed, 2));
  geo.setIndex(new THREE.BufferAttribute(strands.index, 1));

  const own = {
    uWidth: { value: width }, uFlex: { value: flex }, uSigma: { value: sigma }, uGloss: { value: gloss }, uDense: { value: dense },
    uRoot: { value: new THREE.Color(colour.root ?? 0x241408) }, uTip: { value: new THREE.Color(colour.tip ?? 0x8a5a2c) }, uShine: { value: new THREE.Color(colour.shine ?? 0xffffff) },
  };
  const defines = {};
  if (twist) {
    own.uTwist = { value: new THREE.Vector4(twist.about[0], twist.about[1], twist.full, twist.least) };
    own.uTwistBy = { value: new THREE.Vector2(0, twist.share ?? 0.2) };
    defines.LOCKS_TWIST = 1;
  }
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...U, ...own }, side: THREE.DoubleSide, alphaToCoverage: true, defines: { ...defines, SHADOW_TAPS: 4 } });
  const depth = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG_DEPTH, uniforms: { ...U, ...own }, side: THREE.DoubleSide, defines: { ...defines, LOCKS_DEPTH: 1 } });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'locks';
  mesh.frustumCulled = false;
  mesh.userData.shadowMaterial = depth;
  mesh.layers.enable(LAYER_SHADOW_NEAR);
  // (for a machine that is struggling: fewer strands, each a little wider, so that the mass of it looks the same)
  const per = strands.index.length / Math.max(1, strands.count);
  let shown = 1;
  const detail = (f) => {
    f = Math.min(1, Math.max(0.05, f));
    if (Math.abs(f - shown) < 0.02) return;
    shown = f;
    geo.setDrawRange(0, Math.max(1, Math.round(strands.count * f)) * per);
    own.uWidth.value = width / Math.sqrt(f);
  };
  /**
   * While the shadow maps are drawn: fewer strands still, and each as much wider, so that together they stop the same
   * light. (A shadow shows no single hair, and at the size of a shadow map's dots most hairs are too fine to draw.)
   */
  const SHADE = 0.3;
  const shade = (on) => {
    if (shown <= SHADE) return;
    const f = on ? SHADE : shown;
    geo.setDrawRange(0, Math.max(1, Math.round(strands.count * f)) * per);
    own.uWidth.value = on ? (width / Math.sqrt(shown)) * (shown / SHADE) : width / Math.sqrt(shown);
  };
  /** Say that the hair stays where it is put (a wig on a stand), so that it need not be drawn when out of the picture. */
  const bound = () => {
    geo.computeBoundingSphere();
    geo.boundingSphere.radius = geo.boundingSphere.radius * 1.2 + 0.01;   // (it stirs a little beyond where it lies)
    mesh.frustumCulled = true;
  };
  return { mesh, material, count: strands.count, detail, shade, bound };
}

/** Grow hair and make a mesh of it, in one go (see growStrands and locksMesh for what may be asked). */
export function growLocks(roots, opts) {
  return locksMesh(growStrands(roots, opts), opts);
}
