// Feathers, drawn. Each (laid by feathers.js) is a strip a few faces long; on
// it are drawn the outline of the vane, split here and there as a real one
// is, the shaft down the middle and the barbs running out from it, which give
// a feather its sheen: a soft light that slides across it as it turns.
import * as THREE from 'three';
import { U, LAYER_SHADOW_NEAR } from '../../gfx/globals.js';
import { COMMON, SHADOWS, ATMOSPHERE } from '../../gfx/glsl.js';

const VERT = /* glsl */ `
${COMMON}
attribute vec3 aAxis;
attribute vec3 aFace;
attribute vec3 aBody;
attribute vec3 aSeed;
uniform float uFlex;
varying vec2 vUV;
varying vec3 vAxis;
varying vec3 vFace;
varying vec3 vBody;
varying vec3 vPosW;
varying vec3 vSeed;
void main() {
  vec3 pw = (modelMatrix * vec4(position, 1.0)).xyz;
  mat3 turn = mat3(modelMatrix);
  vAxis = normalize(turn * aAxis); vFace = normalize(turn * aFace); vBody = normalize(turn * aBody);
  // the wind gets under the free end
  pw += (windPush(pw, aSeed.x) + vBody * 0.3 * length(windPush(pw, aSeed.y))) * uFlex * uv.y * uv.y;
  vUV = uv; vPosW = pw; vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(pw, 1.0);
}`;

// the outline of a feather: x = -1..1 across it, y = 0..1 along it. Returns how far inside the edge (in units of x).
const OUTLINE = /* glsl */ `
float vaneNoise(vec2 p) { return texture2D(uNoise, (p + 0.5) / 256.0).r; }
float featherEdge(float x, float y, vec3 seed, out float halfWidth) {
  float slim = seed.z;
  // a quill, bare at the root; a vane that widens quickly and is rounded off at the end
  float from = mix(0.22, 0.1, slim), round0 = mix(0.5, 0.72, slim);
  float hw = smoothstep(0.02, from, y) * sqrt(max(0.0, 1.0 - pow(max(0.0, (y - round0) / (1.0 - round0)), 2.0)));
  hw *= 0.93 + 0.07 * sin(y * 31.0 + seed.x * 60.0);
  // barbs run out and forward from the shaft; here and there two of them have come unhooked, and the vane is split
  float b = y - abs(x) * 0.42;
  float split = smoothstep(0.7, 0.8, vaneNoise(vec2(b * 15.0 + seed.x * 173.0, (x > 0.0 ? 7.0 : 91.0) + seed.y * 211.0)));
  split *= smoothstep(0.2, 0.55, abs(x) / max(hw, 1e-3)) * smoothstep(0.25, 0.4, y);
  halfWidth = hw;
  // (the quill itself, below where the vane starts)
  float quill = 0.06 * (1.0 - smoothstep(from * 0.5, from, y));
  return max(hw * (1.0 - 0.8 * split), quill) - abs(x);
}`;

const FRAG = /* glsl */ `
${COMMON}
${SHADOWS}
${ATMOSPHERE}
uniform vec3 uBase;
uniform vec3 uEdge;
uniform vec3 uShaft;
uniform vec3 uShine;
uniform float uSigma;
uniform float uGloss;
varying vec2 vUV;
varying vec3 vAxis;
varying vec3 vFace;
varying vec3 vBody;
varying vec3 vPosW;
varying vec3 vSeed;
${OUTLINE}
void main() {
  float x = vUV.x * 2.0 - 1.0, y = vUV.y;
  float hw;
  float inside = featherEdge(x, y, vSeed, hw);
  float wide = max(fwidth(x), 1e-4);
  float alpha = clamp(inside / wide + 0.5, 0.0, 1.0);
  if (alpha < 0.04) discard;

  float dither = ign(gl_FragCoord.xy);
  vec3 V = normalize(cameraPosition - vPosW), L = uSunDir;
  vec3 A = normalize(vAxis);
  // which way the feather faces: its own way close to, the body's from further off (plumage is a smooth thing at a distance)
  vec3 N = normalize(mix(normalize(vFace), normalize(vBody), 0.4));
  if (dot(N, V) < 0.0) N = normalize(N + V * (0.05 - dot(N, V)));
  vec3 across = normalize(cross(A, N));
  float side = x >= 0.0 ? 1.0 : -1.0;
  vec3 T = normalize(A * 0.5 + across * side);                    // the way the barbs run on this side of the shaft

  float rim = clamp(abs(x) / max(hw, 1e-3), 0.0, 1.0);
  float b = y - abs(x) * 0.42;
  float fine = 1.0 - smoothstep(0.2, 0.8, wide * 60.0);           // (the barbs are let go once they are finer than the picture)
  float barb = 0.5 + 0.5 * sin(b * 520.0 + vSeed.x * 40.0);
  vec3 albedo = mix(uBase, uEdge, smoothstep(0.55, 1.0, rim) * 0.5 + smoothstep(0.78, 1.0, y) * 0.45);
  albedo *= 0.7 + 0.6 * vSeed.x;
  albedo *= mix(1.0, 0.8 + 0.32 * barb, fine);
  float shaft = (1.0 - smoothstep(0.0, 0.06 * (1.0 - 0.7 * y) + wide, abs(x))) * (1.0 - smoothstep(0.85, 1.0, y));
  albedo = mix(albedo, uShaft, shaft * 0.75);
  // what lies under the feather above it sees little of the sky
  float open = mix(0.3, 1.0, smoothstep(0.0, 0.55, y));

  float vis = sunVisibility(vPosW + N * 0.006, uSigma, 0.006, 0.008, dither);
  float NL = dot(N, L);
  float wrap = saturate1((NL + 0.3) / 1.3);
  vec3 col = albedo * uSunColor * wrap * vis * mix(0.7, 1.0, open);

  // the sheen: light strung out along the barbs, a cold one off the surface and a warm one from within
  vec3 H = normalize(L + V);
  float th = dot(T, H);
  float sinTH = sqrt(max(0.0, 1.0 - th * th));
  float s1 = pow(sinTH, 70.0), s2 = pow(sinTH, 14.0);
  float lit = vis * smoothstep(-0.1, 0.4, NL) * open * (1.0 - shaft) * pow(saturate1(dot(N, H)), 3.0);
  col += (uShine * 0.11 * s1 + sqrt(albedo) * 0.035 * s2) * uSunColor * lit * uGloss;
  // against the light a vane is not quite solid
  float back = pow(saturate1(dot(-V, L)), 3.0) * (1.0 - saturate1(abs(dot(N, V)) * 1.4));
  col += sqrt(albedo) * vec3(1.0, 0.7, 0.42) * uSunColor * back * 0.5 * smoothstep(0.3, 0.9, y);

  col += albedo * ambientLight(normalize(N + vec3(0.0, 0.25, 0.0))) * open;
  col = applyAtmosphere(col, vPosW, cameraPosition);
  gl_FragColor = vec4(col, alpha);
}`;

const FRAG_DEPTH = /* glsl */ `
${COMMON}
varying vec2 vUV;
varying vec3 vSeed;
${OUTLINE}
void main() {
  float hw;
  if (featherEdge(vUV.x * 2.0 - 1.0, vUV.y, vSeed, hw) < 0.0) discard;
  gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0);
}`;

/**
 * A mesh of feathers to hang on a bone.
 * @param feathers     from growFeathers
 * @param opts.colour  { base, edge, shaft, shine }: the vane, its paler edge and tip, the shaft, and the sheen
 * @param opts.flex    how far the tips lift in the wind
 */
export function plumesMesh(feathers, { colour = {}, flex = 0.006, sigma = 110, gloss = 1 } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(feathers.position, 3));
  geo.setAttribute('aAxis', new THREE.BufferAttribute(feathers.aAxis, 3));
  geo.setAttribute('aFace', new THREE.BufferAttribute(feathers.aFace, 3));
  geo.setAttribute('aBody', new THREE.BufferAttribute(feathers.aBody, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(feathers.uv, 2));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(feathers.aSeed, 3));
  geo.setIndex(new THREE.BufferAttribute(feathers.index, 1));
  const own = {
    uFlex: { value: flex }, uSigma: { value: sigma }, uGloss: { value: gloss },
    uBase: { value: new THREE.Color(colour.base ?? 0x17130f) }, uEdge: { value: new THREE.Color(colour.edge ?? 0x5a4836) },
    uShaft: { value: new THREE.Color(colour.shaft ?? 0x6b5a48) }, uShine: { value: new THREE.Color(colour.shine ?? 0x8fa0c8) },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...U, ...own }, side: THREE.DoubleSide, alphaToCoverage: true, defines: { SHADOW_TAPS: 4 } });
  const depth = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG_DEPTH, uniforms: { ...U, ...own }, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'plumes';
  mesh.frustumCulled = false;
  mesh.userData.shadowMaterial = depth;
  mesh.layers.enable(LAYER_SHADOW_NEAR);
  return { mesh, material, count: feathers.count };
}
