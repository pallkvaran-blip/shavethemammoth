// The fur. Every hair is a thin camera-facing ribbon grown in the vertex
// shader: a curve leaving the skin, bending under gravity and wind, gathered
// into locks and draped over the body using the baked distance volume.
//
// The groom stores one "guide" strand per lock of hair. From far away one
// strand per lock is all the eye can resolve. As the camera approaches, each
// guide is drawn several times over (GPU instancing with a divisor), and every
// extra copy becomes its own hair: rooted a little to one side, with its own
// length, kink and colour, a share of them short crimped underwool. So up
// close a lock is dozens of separate hairs with real depth between them, and
// the number grows smoothly with how large the lock is on screen.
import * as THREE from 'three';
import { COMMON, SHADOWS, ATMOSPHERE, SKINNING } from '../gfx/glsl.js';
import { U } from '../gfx/globals.js';

// One vertex shader grows every hair. With CLIPPING defined it draws hair that
// has been cut off instead: the very same curves (same strand, same recipe),
// restricted to the part that came away, then carried as a rigid piece to
// wherever that piece has since fallen.
export const FUR_VERT = /* glsl */ `
precision highp sampler3D;
${COMMON}
${SKINNING}
#ifdef CLIPPING
  attribute vec4 cRoot;     // root, in the rest pose; w = the length the lock was cut to
  attribute vec4 cOff;      // root minus the root of its lock; w = the length it had before
  attribute vec4 cDir;      // direction the lock leaves the skin; w = how many of its hairs were showing
  attribute vec4 cNrm;      // skin normal at the root; w = when it was cut
  attribute vec4 cM0;       // the skin's position at that moment (the bone matrix, by rows)
  attribute vec4 cM1;
  attribute vec4 cM2;
  attribute vec4 cWind;     // the wind's push on the lock at that moment; w = its colour (three bytes packed into one number)
  attribute vec4 cPivot;    // the middle of the piece at that moment; w = when it touched the snow
  attribute vec4 cPos;      // where that middle is now; w = height of the snow it rests on (far below while it falls)
  attribute vec4 cQuat;     // how the piece has turned since
  #define iRoot cRoot.xyz
  #define iOff cOff.xyz
  #define iDir cDir.xyz
  #define iNormal cNrm.xyz
#else
  attribute vec3 iRoot;
  attribute vec3 iOff;      // root minus the root of the lock it belongs to
  attribute vec3 iDir;      // direction the lock leaves the skin
  attribute vec3 iNormal;
  attribute vec4 iSkinIdx;
  attribute vec4 iSkinWgt;
  attribute float iCut;     // metres of this lock left after shearing
#endif
attribute vec4 iA;        // length, lock width, strand seed, lock seed
attribute vec4 iB;        // droop, lock tightness, layer height, breathing weight
#ifndef CLIPPING
  attribute vec4 iCol;    // tone, ginger, lock variation, strand variation
#endif

uniform sampler3D uSdf;
uniform vec3 uSdfMin;
uniform vec3 uSdfInvSize;
uniform float uWidthScale;  // widens locks when fewer of them are drawn
uniform float uBreath;
uniform float uLengthScale;
uniform float uPxScale;     // pixels per metre at one metre from the eye
uniform float uHairPx;      // a lock shows one more hair for every this-many pixels of its width
uniform float uChildMax;    // most hairs one lock may show
uniform float uMinPx;       // thinnest a hair is ever drawn, in pixels
uniform vec3 uOrigin;       // where the mammoth stands

uniform vec3 uShP;          // the tool in hand: its pivot,
uniform vec3 uShN;          // the normal of the plane the blades lie in,
uniform vec3 uShA[2];       // along each blade from the pivot,
uniform vec3 uShC[2];       // and across each blade towards its cutting edge
uniform float uShOn;        // 0 when no tool is in hand
uniform vec4 uShB;          // a blade in its own frame: where it starts and ends along its half, how wide its back is at each end
uniform vec4 uShX;          // how the back narrows (an exponent), how far past the cutting edge hair is pushed, the radius kept clear round the pivot, the margin past the back
uniform vec3 uShD;          // how far above and below the blades hair is parted, and how far beneath a blade hair rooted under it is pressed

varying vec2 vUV;
varying vec3 vTan;
varying vec3 vVolN;
varying vec3 vPosW;
varying vec4 vCol;
varying vec4 vHair;     // hair seed, coverage, wool, depth in the coat (0 at the skin)

vec3 rotateQ(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }

// how wide the back of a blade is at u along it
float bladeBack(float u) {
  float s = clamp((u - uShB.x) / (uShB.y - uShB.x), 0.0, 1.0);
  return mix(mix(uShB.z, uShB.w, pow(s, uShX.x)), 0.0012, smoothstep(0.86, 1.0, s));
}

// Hair cannot pass through steel. Each blade parts the hair it lies in: hair
// that would cross a blade is pushed off it to whichever side is nearer, either
// out past its back or in past its cutting edge, into the gap between the
// blades, where it waits to be cut. Hair rooted under a blade that is lying on
// the hide stays pressed beneath it. "along" is the distance from the hair's
// root (a root cannot move); "loose" is 1 for hair that has been cut off.
vec3 shearsPush(vec3 p, vec3 root, float along, float loose) {
  vec3 rel = p - uShP;
  if (uShOn <= 0.0 || dot(rel, rel) > 0.05) return p;
  float ramp = smoothstep(0.004, 0.022, along) * uShOn;
  vec3 rr = root - uShP;
  float dr = dot(rr, uShN);
  float lead = min(0.01, 0.25 * (uShB.y - uShB.x));
  for (int i = 0; i < 2; i++) {
    rel = p - uShP;
    float d = dot(rel, uShN);
    float u = dot(rel, uShA[i]), w = dot(rel, uShC[i]);
    float back = bladeBack(u);
    float inside = smoothstep(uShB.x, uShB.x + lead, u) * (1.0 - smoothstep(uShB.y - 0.002, uShB.y + 0.004, u)) * step(-back - uShX.w, w) * step(w, uShX.y);
    if (inside > 0.0) {
      float ru = dot(rr, uShA[i]), rw = dot(rr, uShC[i]);
      float under = step(uShB.x, ru) * step(ru, uShB.y + 0.004) * step(-bladeBack(ru) - uShX.w, rw) * step(rw, uShX.y + 0.002) * step(-0.04, dr) * step(dr, 0.001) * (1.0 - loose);
      if (under > 0.5) {
        p -= uShN * (max(0.0, d + uShD.z) * inside * uShOn);
      } else {
        float D = d > 0.0 ? uShD.x : uShD.y;
        float to = w > -0.45 * back ? uShX.y : -back - uShX.w;
        p += uShC[i] * ((to - w) * inside * (1.0 - smoothstep(D * 0.35, D, abs(d))) * ramp);
      }
    }
  }
  // nor does anything lie across the pivot
  if (uShX.z > 0.0) {
    rel = p - uShP;
    float dn = dot(rel, uShN);
    vec3 inPlane = rel - uShN * dn;
    float r = length(inPlane);
    if (r < uShX.z && r > 1e-4) {
      float D = dn > 0.0 ? uShD.x : uShD.y;
      p += inPlane * ((uShX.z - r) / r * (1.0 - smoothstep(D * 0.35, D, abs(dn))) * ramp);
    }
  }
  return p;
}

void main() {
  float t = position.y;
  float ss = iA.z, cs = iA.w;
  float lockW = iA.y * uWidthScale;

  // Which hair of the lock this is (0 = the guide itself). Extra hairs are
  // drawn four at a time: each batch is one more draw of the same strands.
  // The batch size and first index ride in the mesh's scale, which the
  // shaders otherwise ignore.
  float k = 0.0;
  float show = 1.0;
  float nShow = 1.0;    // hairs this lock shows at this distance
  #if defined(CLIPPING)
    k = float(gl_InstanceID % CLIP_HAIRS);
    // as many hairs as the lock was showing when it was cut; fewer once it lies on the snow, or far away
    float eyeDist = max(length(cameraPosition - cPos.xyz), 0.03);
    nShow = min(cDir.w, 1.0 + 1.6 * lockW * uPxScale / (eyeDist * uHairPx));
    if (cPos.w > -500.0) nShow = min(nShow, mix(12.0, 7.0, smoothstep(0.1, 0.8, uTime - cPivot.w)));
    show = clamp(nShow - k, 0.0, 1.0);
    if (show <= 0.0 || cOff.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  #elif !defined(DEPTH_PASS)
    int batch = int(modelMatrix[0][0] + 0.5);
    k = floor(modelMatrix[1][1] - 0.5) + float(gl_InstanceID % batch);
    vec3 eyeVec = cameraPosition - (iRoot + uOrigin);
    float eyeDist = max(length(eyeVec), 0.03);
    nShow = clamp(lockW * uPxScale / (eyeDist * uHairPx) - 0.4, 1.0, uChildMax);
    // hair rooted on the far side of a limb is hidden behind it: the guide alone will do
    nShow = mix(1.0, nShow, smoothstep(-0.6, -0.2, dot(iNormal, eyeVec) / eyeDist));
    // hairs join the lock one at a time as it grows on screen
    show = clamp(nShow - k, 0.0, 1.0);
    if (show <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  #endif
  float isChild = step(0.5, k);
  float cseed = fract(ss * 13.37 + k * 0.61803399);
  float h1 = hash11(cseed * 91.3 + 1.7), h2 = hash11(cseed * 47.9 + 5.1), h3 = hash11(cseed * 23.3 + 9.4);
  float h4 = hash11(cseed * 67.7 + 3.3), h5 = hash11(cseed * 11.1 + 7.9);

  // extra hairs root around the guide, inside the lock's footprint on the skin
  vec3 n0 = iNormal;
  vec3 t1 = normalize(cross(n0, abs(n0.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(n0, t1);
  float ang = h1 * 6.2831853;
  vec3 scatter = (t1 * cos(ang) + t2 * sin(ang)) * (sqrt(h2) * lockW * 0.95 * isChild);
  vec3 root = iRoot + scatter;
  vec3 off = iOff + scatter;

  // every other batch of extra hairs is underwool: short, fine, tightly
  // crimped, standing off the skin
  float wool = step(4.5, k) * step(0.5, mod(floor((k - 1.0) / 4.0), 2.0));
  float L = iA.x * uLengthScale * mix(1.0, 0.5 + 0.62 * h4, isChild);
  L = mix(L, clamp(iA.x * 0.3, 0.025, 0.085) * (0.6 + 0.8 * h4), wool);
  // Shears: a lock is cut to a length, and each of its hairs ends within a few
  // percent of that. What is left keeps its shape: the curve is simply
  // followed a shorter way.
  float trim = 0.93 + 0.14 * h1;
  #ifdef CLIPPING
    // the part of this hair that came away: from where it was cut to where it used to end
    float Lnew = min(L, cRoot.w * trim), Lold = min(L, cOff.w * trim);
    if (Lold - Lnew < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    t = mix(Lnew, Lold, t) / L;
  #else
    float Lc = min(L, iCut * trim);
    if (Lc < 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    t *= Lc / L;
  #endif

  #ifdef CLIPPING
    mat4 skin = transpose(mat4(cM0, cM1, cM2, vec4(0.0, 0.0, 0.0, 1.0)));
    mat3 skinR = mat3(skin);
    vec3 rootW = (skin * vec4(root, 1.0)).xyz;
    vec3 windR = cWind.xyz * mix(1.0, 0.2, wool);
  #else
    mat4 skin = boneMatrix(iSkinIdx.x) * iSkinWgt.x;
    if (iSkinWgt.y > 0.004) skin += boneMatrix(iSkinIdx.y) * iSkinWgt.y;   // most hair rides on a single bone
    mat3 skinR = mat3(skin);
    vec3 rootW = (skin * vec4(root, 1.0)).xyz;
    // wind, brought back into the rest pose where the hair is shaped
    vec3 windR = transpose(skinR) * windPush(rootW, cs) * mix(1.0, 0.2, wool);
  #endif

  float stray = isChild * step(0.93, h3);   // a few hairs break rank
  vec3 d0 = normalize(mix(iDir, n0, wool * 0.5) + (t1 * (h4 - 0.5) + t2 * (h5 - 0.5)) * ((0.06 + 0.22 * stray + 1.1 * wool) * isChild));
  float droop = iB.x * mix(1.0, 0.25, wool);
  vec3 dEnd = normalize(mix(d0, vec3(0.0, -1.0, 0.0), droop) + windR * (0.55 + 0.5 * droop));
  vec3 P1 = d0 * (L * 0.36);
  vec3 P2 = P1 + dEnd * (L * 0.64);
  float it = 1.0 - t;
  vec3 p = 2.0 * it * t * P1 + t * t * P2;
  vec3 dp = 2.0 * it * P1 + 2.0 * t * (P2 - P1);

  // gather into the lock
  // added hairs gather less tightly than the guide, so a lock stays full rather than pinched to a point
  float tight = min(iB.y * mix(1.0, 0.25 + 0.5 * h5, isChild), 0.97) * (1.0 - wool);
  p -= off * (tight * t * (2.0 - t));
  dp -= off * (tight * (2.0 - 2.0 * t));

  // the whole lock waves together...
  vec3 e1 = normalize(cross(d0, abs(d0.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 e2 = cross(d0, e1);
  float wAmp = (0.006 + 0.03 * L) * (0.5 + cs) * (1.0 - wool);
  float f1 = 6.2831 * (0.8 + 1.1 * fract(cs * 7.31)), f2 = 6.2831 * (0.6 + 1.2 * fract(cs * 3.77));
  float a1 = f1 * t + cs * 40.0 + h1 * 0.9, a2 = f2 * t + cs * 71.0 + h5 * 0.7;
  p += wAmp * t * (e1 * sin(a1) + e2 * sin(a2));
  dp += wAmp * (e1 * (sin(a1) + t * f1 * cos(a1)) + e2 * (sin(a2) + t * f2 * cos(a2)));
  // ...and every hair has a kink of its own; wool is tightly crimped
  float zAmp = mix(0.0025 + 0.008 * L, 0.0032, wool);
  float g1 = 6.2831 * mix(1.2 + 1.0 * h1, 4.0 + 3.0 * h1, wool), g2 = 6.2831 * mix(1.0 + 1.2 * h5, 3.5 + 3.0 * h5, wool);
  float b1 = g1 * t + h2 * 90.0, b2 = g2 * t + h3 * 37.0;
  p += zAmp * t * (e1 * sin(b1) + e2 * cos(b2));
  dp += zAmp * (e1 * (sin(b1) + t * g1 * cos(b1)) + e2 * (cos(b2) - t * g2 * sin(b2)));

  // each hair also arcs its own way, so a lock is never a sheaf of parallel straws
  vec3 arc = (e1 * (h4 - 0.5) + e2 * (h1 - 0.5)) * (L * (0.11 + 0.22 * stray) * isChild * (1.0 - wool));
  p += arc * t * t;
  dp += arc * (2.0 * t);

  vec3 pos = root + p;
  vec3 tan = normalize(dp);

  // drape over the body: keep every point at least its layer height off the skin
  vec4 sd = texture(uSdf, (pos - uSdfMin) * uSdfInvSize);
  vec3 grad = normalize(sd.xyz);
  float layer = iB.z * mix(1.0, 0.35 + 1.3 * h5, isChild) * (1.0 - 0.7 * wool);
  float h = layer * smoothstep(0.0, 0.3, t) + 0.004;
  float push = max(0.0, h - sd.a);
  pos += grad * push;
  if (push > 0.0005) {
    float into = min(0.0, dot(tan, grad));
    tan = normalize(tan - grad * into);
  }
  float skinDist = max(sd.a, h);
  // breathing moves the skin; the hair rides along
  pos += n0 * (iB.w * uBreath);

  vec3 posW = (skin * vec4(pos, 1.0)).xyz;
  vec3 tanW = normalize(skinR * tan);
  // soft "volume" normal: mostly the body's shape, a little of the strand's own lean
  vec3 volN = normalize(skinR * mix(grad, n0, 0.35));
  float coat = clamp(skinDist / max(0.025, min(iA.x * 0.45, 0.2)), 0.0, 1.0);

  #ifdef CLIPPING
    // it has come away: carry it, as one rigid piece, to where it is now
    float age = uTime - cNrm.w;
    posW = cPos.xyz + rotateQ(cQuat, posW - cPivot.xyz);
    tanW = rotateQ(cQuat, tanW);
    volN = rotateQ(cQuat, volN);
    coat = mix(coat, 1.0, smoothstep(0.0, 0.25, age));     // no longer buried in the coat
    if (cPos.w > -500.0) {
      // come to rest: soft hair settles onto the snow rather than standing on end
      float settled = smoothstep(0.0, 0.18, uTime - cPivot.w);
      float up = max(0.0, posW.y - cPos.w);
      posW.y = mix(posW.y, cPos.w + 0.0015 + 0.004 * h2 + up * 0.3, settled);
      tanW = normalize(vec3(tanW.x, tanW.y * mix(1.0, 0.3, settled), tanW.z));
      volN = normalize(volN + vec3(0.0, 1.5 * settled, 0.0));
    }
    posW = shearsPush(posW, rootW, t * L, smoothstep(0.0, 0.12, age));
  #elif !defined(DEPTH_PASS)
    posW = shearsPush(posW, rootW, t * L, 0.0);
  #endif

  #ifdef DEPTH_PASS
    vec3 toEye = uSunDir;
  #else
    vec3 toEye = normalize(cameraPosition - posW);
  #endif
  vec3 sideDir = cross(tanW, toEye);
  float sl = length(sideDir);
  sideDir = sl > 1e-4 ? sideDir / sl : vec3(1.0, 0.0, 0.0);

  float coverage = 1.0;
  #ifdef DEPTH_PASS
    float width = iA.y * uWidthScale * mix(1.0, 0.4, t);
  #else
    float pxPerM = uPxScale / max(-(viewMatrix * vec4(posW, 1.0)).z, 0.02);
    float taper = 1.0 - 0.6 * t * t;
    // a hair's real thickness, in pixels
    float truePx = mix(0.00062, 0.00026, wool) * (0.7 + 0.6 * h2) * taper * pxPerM;
    // far away, the guide alone stands for the whole lock
    float lonePx = max(1.4, lockW * pxPerM * 0.27) * mix(1.0, 0.4, t);
    float lone = clamp(2.0 - nShow, 0.0, 1.0) * (1.0 - isChild);
    // never thinner than about a pixel: a hair that fine is drawn a pixel wide
    // and solid, which reads as hair; drawn fainter it turns into a haze
    float px = mix(max(truePx, uMinPx * mix(1.0, 0.8, wool)), lonePx, lone);
    coverage = show;
    float width = px / pxPerM;
  #endif
  posW += sideDir * (position.x * width);

  vUV = vec2(position.x + 0.5, t);
  vTan = tanW;
  vVolN = volN;
  vPosW = posW;
  #ifdef CLIPPING
    float packed = cWind.w;
    vCol = vec4(mod(packed, 256.0), mod(floor(packed / 256.0), 256.0), floor(packed / 65536.0), 0.0) / 255.0;
  #else
    vCol = iCol;
  #endif
  vHair = vec4(cseed, coverage, wool, coat);
  gl_Position = projectionMatrix * viewMatrix * vec4(posW, 1.0);
}
`;

export const FUR_FRAG = /* glsl */ `
${COMMON}
${SHADOWS}
${ATMOSPHERE}
varying vec2 vUV;
varying vec3 vTan;
varying vec3 vVolN;
varying vec3 vPosW;
varying vec4 vCol;
varying vec4 vHair;

uniform float uSigma;       // how fast sunlight is absorbed inside the coat
uniform float uFrost;
uniform vec3 uRootColor;
uniform vec3 uMidColor;
uniform vec3 uLightColor;
uniform vec3 uGingerColor;
uniform vec3 uWoolColor;

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
  float across = vUV.x * 2.0 - 1.0;
  float wool = vHair.z, coat = vHair.w;
  float alpha = vHair.y * (1.0 - smoothstep(0.95, 1.0, t));
  float dither = ign(gl_FragCoord.xy);
  #ifdef USE_A2C
    if (alpha < 0.995) alpha = clamp(alpha + (dither - 0.5) * 0.22, 0.0, 1.0);
    if (alpha < 0.05) discard;
  #else
    if (alpha < 0.05 + dither * 0.9) discard;
    alpha = 1.0;
  #endif

  vec3 N = normalize(vVolN);
  vec3 T = normalize(vTan);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = uSunDir;
  float hr = hash11(vHair.x * 53.7 + 0.31);
  float hr2 = hash11(vHair.x * 17.1 + 4.2);
  // each hair is a tiny cylinder: brightest along its middle
  float mid = sqrt(max(0.0, 1.0 - across * across));
  float rounded = 0.6 + 0.4 * mid;

  vec3 albedo = hairColor(vCol.x, vCol.y, t, vCol.z * 0.6 + hr * 0.4);
  albedo *= (0.78 + 0.44 * hr) * (0.72 + 0.56 * vCol.z);
  albedo = mix(albedo, uWoolColor * (0.75 + 0.5 * hr), wool);
  // rime: frost gathers on the tips of hair that faces the sky
  float rime = smoothstep(0.5, 0.92, N.y) * smoothstep(0.45, 1.0, t) * smoothstep(0.55, 0.8, fract(vHair.x * 7.13 + vCol.z * 3.7)) * (1.0 - wool);
  albedo = mix(albedo, vec3(0.60, 0.64, 0.70), rime * uFrost);

  // how deep in the coat this bit of hair lies; some hairs also sit in their neighbours' shade
  float buried = smoothstep(0.0, 1.0, coat);
  float chance = 0.6 + 0.4 * hr2;
  float open = mix(0.4, 1.0, buried) * mix(0.5, 1.0, smoothstep(0.0, 0.35, t)) * chance;

  // sunlight soaking into the coat
  float vis = sunVisibility(vPosW + N * 0.012, uSigma, 0.01, 0.016, dither);

  float NL = dot(N, L);
  float wrap = saturate1((NL + 0.42) / 1.42);
  float TL = dot(T, L);
  float kk = sqrt(max(0.0, 1.0 - TL * TL));
  // a hair seen end-on to the light catches less of it
  float diffuse = wrap * mix(0.5, 1.0, kk);
  vec3 col = albedo * uSunColor * diffuse * vis * rounded * mix(0.62, 1.0, buried) * chance;

  // two highlights, as on real hair: a pale one off the surface and a
  // coloured one that has passed through the fibre
  vec3 H = normalize(L + V);
  float sn = hr - 0.5;
  vec3 T1 = normalize(T + N * (-0.05 + sn * 0.10));
  vec3 T2 = normalize(T + N * (0.11 + sn * 0.14));
  float s1 = strandSpec(T1, H, 95.0);
  float s2 = strandSpec(T2, H, 20.0);
  float specMask = vis * smoothstep(-0.25, 0.35, NL) * mix(0.3, 1.0, smoothstep(0.1, 0.6, t)) * mix(0.4, 1.0, buried) * (1.0 - 0.6 * wool);
  vec3 bright = sqrt(albedo);
  col += (vec3(0.09) * s1 + bright * 0.17 * s2) * uSunColor * specMask * (0.45 + 0.55 * mid);

  // sun behind the coat: the outline lights up as light passes through the
  // loose outer hair. The shadow map cannot see through that fringe, so the
  // outline is let through by how edge-on it is to the eye.
  float back = pow(saturate1(dot(-V, L)), 2.0);
  float edge = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.4);
  float tipward = smoothstep(0.2, 0.95, t);
  float fringe = max(vis, edge * back * mix(0.35, 1.0, buried));
  vec3 through = bright * vec3(1.0, 0.70, 0.40);
  col += through * uSunColor * back * (0.06 + 3.0 * edge) * tipward * fringe * 0.8;

  // sky light, fading into the depth of the coat
  col += albedo * ambientLight(normalize(N + vec3(0.0, 0.25, 0.0))) * open * rounded;

  col = applyAtmosphere(col, vPosW, cameraPosition);
  gl_FragColor = vec4(col, alpha);
}
`;

const FRAG_DEPTH = /* glsl */ `
void main() {
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

/**
 * GPU attributes for a set of strands; shared by every geometry that draws
 * them. With repeat > 1 each strand is used for that many instances in a row.
 */
export function makeStrandAttributes(arrays, repeat = 1) {
  const a = (name, size, normalized = false) => new THREE.InstancedBufferAttribute(arrays[name], size, normalized, repeat);
  return {
    iRoot: a('iRoot', 3), iOff: a('iOff', 3), iDir: a('iDir', 3), iNormal: a('iNormal', 3),
    iA: a('iA', 4), iB: a('iB', 4), iCol: a('iCol', 4, true), iSkinIdx: a('iSkinIdx', 4), iSkinWgt: a('iSkinWgt', 4, true),
    iCut: a('iCut', 1),
  };
}

const ribbons = new Map();
function ribbon(segments) {
  let r = ribbons.get(segments);
  if (!r) {
    const base = makeRibbonGeometry(segments);
    r = { position: new THREE.BufferAttribute(base.position, 3), index: new THREE.BufferAttribute(base.index, 1) };
    ribbons.set(segments, r);
  }
  return r;
}

/** A drawable set of strands: the shared attributes plus a ribbon with the given number of segments. */
export function makeFurGeometry(attributes, count, segments) {
  // count = instances to draw (strands x repeat)
  const base = ribbon(segments);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', base.position);
  geo.setIndex(base.index);
  for (const [name, attr] of Object.entries(attributes)) geo.setAttribute(name, attr);
  geo.instanceCount = count;
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
    uHairPx: { value: 3.5 },
    uChildMax: { value: 24 },
    uMinPx: { value: 1.25 },
    uOrigin: { value: new THREE.Vector3() },
    uShP: { value: new THREE.Vector3() },
    uShN: { value: new THREE.Vector3(0, 1, 0) },
    uShA: { value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)] },
    uShC: { value: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)] },
    uShOn: { value: 0 },
    uShB: { value: new THREE.Vector4(0, 0.135, 0.0195, 0.00975) },
    uShX: { value: new THREE.Vector4(1.5, 0.007, 0.016, 0.004) },
    uShD: { value: new THREE.Vector3(0.05, 0.03, 0.005) },
    uSigma: { value: 15 },
    uFrost: { value: 0.55 },
    uRootColor: { value: new THREE.Color(0.011, 0.008, 0.007) },
    uMidColor: { value: new THREE.Color(0.076, 0.047, 0.029) },
    uLightColor: { value: new THREE.Color(0.185, 0.118, 0.070) },
    uGingerColor: { value: new THREE.Color(0.250, 0.125, 0.058) },
    uWoolColor: { value: new THREE.Color(0.165, 0.125, 0.092) },
  };
  const color = new THREE.ShaderMaterial({
    vertexShader: FUR_VERT,
    fragmentShader: FUR_FRAG,
    uniforms: { ...U, ...own, uWidthScale: { value: 1 } },
    defines: { SHADOW_TAPS: 6, ...(a2c ? { USE_A2C: 1 } : {}) },
    side: THREE.DoubleSide,
    alphaToCoverage: a2c,
  });
  // keep the one per-vertex attribute in slot 0; some drivers are slow when slot 0 is per-instance
  color.index0AttributeName = 'position';
  const depth = new THREE.ShaderMaterial({
    vertexShader: FUR_VERT,
    fragmentShader: FRAG_DEPTH,
    uniforms: { ...U, ...own, uWidthScale: { value: 0.7 } },
    defines: { DEPTH_PASS: 1 },
    side: THREE.DoubleSide,
  });
  depth.index0AttributeName = 'position';
  return { color, depth, uniforms: own };
}

/** Extra hairs come in batches of this many per draw. */
export const BATCH = 4;
/** Whether batch b (1 = hairs 1-4, 2 = hairs 5-8, ...) is underwool; must match the vertex shader. */
export const isWoolBatch = (b) => b >= 2 && b % 2 === 0;
