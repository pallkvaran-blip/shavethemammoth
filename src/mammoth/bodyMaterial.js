// The hide under the coat: dense dark underwool where hair grows, wrinkled
// grey skin where it does not (soles, eyelids, the tip of the trunk).
import * as THREE from 'three';
import { COMMON, SHADOWS, ATMOSPHERE, SKINNING } from '../gfx/glsl.js';
import { U } from '../gfx/globals.js';

const VERT = /* glsl */ `
${COMMON}
${SKINNING}
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec4 furA;   // hair length, lift, tone, ginger
attribute vec4 furB;   // lock size, breathing weight, bareness, torso
uniform float uBreath;
varying vec3 vN;
varying vec3 vPosW;
varying vec3 vRest;
varying vec4 vFurA;
varying vec4 vFurB;
void main() {
  mat4 skin = boneMatrix(skinIndex.x) * skinWeight.x + boneMatrix(skinIndex.y) * skinWeight.y
            + boneMatrix(skinIndex.z) * skinWeight.z + boneMatrix(skinIndex.w) * skinWeight.w;
  vec3 p = position + normal * (furB.y * uBreath);
  vec4 wp = skin * vec4(p, 1.0);
  vN = normalize(mat3(skin) * normal);
  vPosW = wp.xyz;
  vRest = position;
  vFurA = furA;
  vFurB = furB;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${COMMON}
${SHADOWS}
${ATMOSPHERE}
varying vec3 vN;
varying vec3 vPosW;
varying vec3 vRest;
varying vec4 vFurA;
varying vec4 vFurB;
uniform vec3 uRootColor;
uniform vec3 uMidColor;

// creased, pebbled hide
float hide(vec3 p) {
  vec2 a = p.xy * 22.0 + p.z * 7.0, b = p.zy * 22.0 - p.x * 5.0;
  float n = vnoise(a) * 0.5 + vnoise(b) * 0.5;
  float fine = vnoise(a * 4.3 + 3.1) * 0.5 + vnoise(b * 4.3 + 9.2) * 0.5;
  float creases = abs(vnoise(vec2(p.y * 60.0, p.x * 9.0 + p.z * 9.0)) - 0.5) * 2.0;
  return n * 0.5 + fine * 0.3 + smoothstep(0.0, 0.35, creases) * 0.4;
}

void main() {
  vec3 N = normalize(vN);
  float furAmt = smoothstep(0.0, 0.035, vFurA.x) * (1.0 - vFurB.z);

  // bump the bare skin
  float h0 = hide(vRest);
  vec3 dpx = dFdx(vPosW), dpy = dFdy(vPosW);
  float hx = dFdx(h0), hy = dFdy(h0);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 bump = (abs(det) > 1e-12) ? (r1 * hx + r2 * hy) * (sign(det) / max(abs(det), 1e-9)) : vec3(0.0);
  vec3 Ns = normalize(N - bump * 0.004 * (1.0 - furAmt));

  vec3 skinCol = vec3(0.022, 0.018, 0.016) * (0.55 + 0.75 * h0);
  float tone = clamp(0.5 + 0.5 * vFurA.z, 0.0, 1.0);
  // Under the coat the hide is a dense mat of hair. Shade it as one, combed
  // the way the hair lies, so the gaps between strands read as deeper fur
  // instead of a dark sheet.
  vec3 down = vec3(0.0, -1.0, 0.0) - N * (-N.y);
  float dl = length(down);
  vec3 flow = dl > 0.05 ? down / dl : normalize(cross(N, vec3(0.0, 0.0, 1.0)));
  vec3 across = cross(N, flow);
  vec2 fuv = vec2(dot(vRest, across), dot(vRest, flow));
  float fibres = vnoise(vec2(fuv.x * 950.0, fuv.y * 55.0)) * 0.6 + vnoise(vec2(fuv.x * 2400.0 + 7.0, fuv.y * 130.0 + 3.0)) * 0.4;
  float tufts = vnoise(fuv * vec2(75.0, 20.0) + 11.0);
  vec3 wool = mix(uRootColor, uMidColor, 0.7 + 0.6 * tone) * (0.5 + 1.0 * fibres) * (0.7 + 0.7 * tufts);
  vec3 albedo = mix(skinCol, wool, furAmt);

  float dither = ign(gl_FragCoord.xy);
  float vis = sunVisibility(vPosW + N * 0.02, mix(140.0, 22.0, furAmt), 0.02, 0.03, dither);
  // some sun filters down through the coat to the mat beneath
  vis = mix(vis, max(vis, 0.42), furAmt);
  float NL = dot(Ns, uSunDir);
  float lit = mix(max(NL, 0.0), saturate1((NL + 0.4) / 1.4), furAmt);
  vec3 col = albedo * uSunColor * lit * vis;
  // skin has a faint sheen; the mat of hair has none
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 H = normalize(uSunDir + V);
  col += uSunColor * 0.012 * pow(max(dot(Ns, H), 0.0), 24.0) * vis * (1.0 - furAmt) * step(0.0, NL);
  float ao = mix(0.85, 0.62, furAmt);
  col += albedo * ambientLight(Ns) * ao;

  col = applyAtmosphere(col, vPosW, cameraPosition);
  gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_DEPTH = /* glsl */ `
void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }
`;

export function makeBodyMaterials({ boneTexture, furUniforms }) {
  const own = {
    uBoneTex: { value: boneTexture },
    uBreath: furUniforms.uBreath,
    uRootColor: furUniforms.uRootColor,
    uMidColor: furUniforms.uMidColor,
  };
  const color = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { ...U, ...own },
    defines: { SHADOW_TAPS: 5 },
  });
  const depth = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG_DEPTH,
    uniforms: { ...U, ...own },
  });
  return { color, depth };
}
