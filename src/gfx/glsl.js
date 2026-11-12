// Shared GLSL used by every hand-written material: noise, sun shadows,
// sky-coloured ambient light, wind and atmospheric perspective.

export const COMMON = /* glsl */ `
#ifndef PI
#define PI 3.14159265359
#endif
uniform float uTime;
uniform vec3 uSunDir;        // unit vector towards the sun
uniform vec3 uSunColor;      // sun radiance arriving on a white surface (irradiance / pi)
uniform vec3 uSH[9];         // sky + ground irradiance, spherical harmonics
uniform sampler2D uNoise;    // 256^2 tiling white noise (rgba)
uniform vec4 uWind;          // xz direction, base strength, gust strength
uniform float uExposureComp; // unused hook

float saturate1(float x) { return clamp(x, 0.0, 1.0); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// smooth value noise from the noise texture (one bilinear fetch)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (i + f + 0.5) / 256.0, 0.0).r;
}
vec4 vnoise4(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (i + f + 0.5) / 256.0, 0.0);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
  return s;
}

// irradiance from the sky probe, divided by pi (multiply by albedo to shade)
vec3 ambientLight(vec3 n) {
  float x = n.x, y = n.y, z = n.z;
  vec3 r = uSH[0] * 0.886227;
  r += uSH[1] * 2.0 * 0.511664 * y;
  r += uSH[2] * 2.0 * 0.511664 * z;
  r += uSH[3] * 2.0 * 0.511664 * x;
  r += uSH[4] * 2.0 * 0.429043 * x * y;
  r += uSH[5] * 2.0 * 0.429043 * y * z;
  r += uSH[6] * (0.743125 * z * z - 0.247708);
  r += uSH[7] * 2.0 * 0.429043 * x * z;
  r += uSH[8] * 0.429043 * (x * x - y * y);
  return max(r, vec3(0.0)) / PI;
}

// gusts roll across the land along the wind direction; returns 0..1
float windGust(vec2 xz) {
  vec2 p = xz * 0.05 - uWind.xy * uTime * 0.42;
  float n = vnoise(p) * 0.65 + vnoise(p * 2.7 + 11.3) * 0.35;
  return smoothstep(0.28, 0.8, n);
}
// horizontal push (metres per unit of "floppiness") at a world position
vec3 windPush(vec3 wp, float phase) {
  float g = windGust(wp.xz);
  float s = uWind.z + uWind.w * g;
  float flutter = sin(uTime * (5.2 + phase * 3.0) + wp.x * 2.1 + wp.z * 1.7 + phase * 40.0);
  float sway = sin(uTime * 1.35 + phase * 6.283 + dot(wp.xz, uWind.xy) * 0.6);
  vec2 d = uWind.xy * s * (0.72 + 0.2 * sway + 0.11 * flutter * (0.4 + g));
  // a little crosswind wobble
  d += vec2(-uWind.y, uWind.x) * s * 0.12 * sin(uTime * 0.9 + phase * 17.0 + wp.z * 0.8);
  return vec3(d.x, 0.0, d.y);
}
`;

export const SHADOWS = /* glsl */ `
uniform sampler2D uShadowNear;
uniform mat4 uShadowNearMat;
uniform vec4 uShadowNearInfo;   // uv per metre (x, y), depth range in metres, enabled
uniform sampler2D uShadowFar;
uniform mat4 uShadowFarMat;
uniform vec4 uShadowFarInfo;

vec2 vogelDisk(int i, int n, float phi) {
  float r = sqrt((float(i) + 0.5) / float(n));
  float a = float(i) * 2.39996323 + phi;
  return r * vec2(cos(a), sin(a));
}
// How depth changes across the receiving surface, per unit of shadow-map uv.
// With a low sun the ground is seen almost edge-on from the light, so every
// filter tap has to be compared against the surface's own slope or the
// ground would shadow itself.
vec2 shadowSlope(vec3 c) {
  #ifdef SHADOW_PLANE_BIAS
    vec3 dx = dFdx(c), dy = dFdy(c);
    float det = dx.x * dy.y - dx.y * dy.x;
    if (abs(det) < 1e-14) return vec2(0.0);
    vec2 g = vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / det;
    return clamp(g, vec2(-8.0), vec2(8.0));
  #else
    return vec2(0.0);
  #endif
}

// Light reaching a point, 0..1. Shadowing is modelled as absorption through
// whatever sits between the point and the sun: sigma (1/m) sets how quickly
// light dies inside the occluder. High sigma gives crisp shadows on solid
// ground; low sigma lets light soak into fur and grass.
float sunVisibility(vec3 wp, float sigma, float bias, float radius, float noise) {
  vec3 c = (uShadowNearMat * vec4(wp, 1.0)).xyz;
  vec3 cf = (uShadowFarMat * vec4(wp, 1.0)).xyz;
  vec2 gN = shadowSlope(c);
  vec2 gF = shadowSlope(cf);
  vec3 e = min(c, 1.0 - c);
  float inside = min(e.x, min(e.y, e.z));
  float visFar = 1.0;
  vec3 ef = min(cf, 1.0 - cf);
  bool inFar = uShadowFarInfo.w > 0.5 && min(ef.x, min(ef.y, ef.z)) > 0.0;
  bool inNear = inside > 0.0 && uShadowNearInfo.w > 0.5;
  if (inFar && (!inNear || inside < 0.04)) {
    float acc = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = vogelDisk(i, 4, noise * 6.2831) * max(radius * 4.0, 0.2) * uShadowFarInfo.xy;
      float d = texture2D(uShadowFar, cf.xy + o).r;
      acc += exp(-sigma * max(0.0, (cf.z + dot(gF, o) - d) * uShadowFarInfo.z - bias * 5.0));
    }
    visFar = acc * 0.25;
  }
  if (!inNear) return visFar;
  float range = uShadowNearInfo.z;
  #ifdef SHADOW_PENUMBRA
    // contact hardening: estimate the blocker distance, widen the kernel
    float blocker = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = vogelDisk(i, 4, noise * 6.2831 + 1.3) * 0.1 * uShadowNearInfo.xy;
      blocker += max(0.0, (c.z + dot(gN, o) - texture2D(uShadowNear, c.xy + o).r) * range);
    }
    radius = clamp(blocker * 0.25 * 0.018 + radius, radius, 0.28);
  #endif
  float acc = 0.0;
  for (int i = 0; i < SHADOW_TAPS; i++) {
    vec2 o = vogelDisk(i, SHADOW_TAPS, noise * 6.2831) * radius * uShadowNearInfo.xy;
    float d = texture2D(uShadowNear, c.xy + o).r;
    acc += exp(-sigma * max(0.0, (c.z + dot(gN, o) - d) * range - bias));
  }
  float vis = acc / float(SHADOW_TAPS);
  return mix(visFar, vis, smoothstep(0.0, 0.04, inside));
}
`;

export const ATMOSPHERE = /* glsl */ `
uniform sampler2D uSkyLut;     // equirectangular sky radiance (no sun disc, no clouds)
uniform vec4 uFogParams;       // density at base height, height falloff, base height, haze density
uniform vec3 uFogTint;

vec2 skyUV(vec3 d) {
  return vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, 1.0 - acos(clamp(d.y, -1.0, 1.0)) / PI);
}
vec3 skyLut(vec3 d) {
  return texture2D(uSkyLut, skyUV(d)).rgb;
}
// Aerial perspective: a thin ground mist plus distance haze, tinted by the
// sky colour in the viewing direction so far hills melt into the horizon.
vec3 applyAtmosphere(vec3 col, vec3 wp, vec3 camPos) {
  vec3 v = wp - camPos;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-4);
  float fh = uFogParams.y;
  float a = uFogParams.x * exp(-fh * (camPos.y - uFogParams.z));
  float dy = dir.y * dist;
  float f = abs(dy) > 1e-3 ? (1.0 - exp(-fh * dy)) / (fh * dy) : 1.0;
  float od = a * dist * f + uFogParams.w * dist;
  float T = exp(-od);
  vec3 fc = skyLut(normalize(vec3(dir.x, max(dir.y, 0.0) * 0.6 + 0.02, dir.z))) * uFogTint;
  return col * T + fc * (1.0 - T);
}
`;

// World-space skinning from the bone texture. Positions are stored in the
// mammoth's rest pose; bone matrices take them straight to world space.
export const SKINNING = /* glsl */ `
uniform highp sampler2D uBoneTex;
mat4 boneMatrix(float i) {
  int size = textureSize(uBoneTex, 0).x;
  int j = int(i + 0.5) * 4;
  int x = j % size, y = j / size;
  return mat4(
    texelFetch(uBoneTex, ivec2(x, y), 0), texelFetch(uBoneTex, ivec2(x + 1, y), 0),
    texelFetch(uBoneTex, ivec2(x + 2, y), 0), texelFetch(uBoneTex, ivec2(x + 3, y), 0));
}
`;
