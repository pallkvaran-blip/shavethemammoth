// Hair for the people: beards, eyebrows, what shows under a hat, the bobble
// on top of it, a vulture's ruff, the wigs on Mortimer's table. Every strand
// is grown once, when the game starts, from a point scattered on a sculpted
// surface: it leaves in the direction it is told, droops, curls, gathers into
// locks with its neighbours and keeps out of the body. It is then a ribbon
// that turns to face whoever is looking, lit as the mammoth's hair is.
import * as THREE from 'three';
import { U, LAYER_SHADOW_NEAR } from '../../gfx/globals.js';
import { COMMON, SHADOWS, ATMOSPHERE } from '../../gfx/glsl.js';

const VERT = /* glsl */ `
${COMMON}
attribute vec3 aTan;
attribute vec3 aNrm;
attribute vec2 aSeed;        // one number for the strand; how deep among the others it lies
uniform float uWidth;
uniform float uFlex;
uniform float uDense;
uniform float uPxScale;
varying vec2 vUV;
varying vec3 vTan;
varying vec3 vNrm;
varying vec3 vPosW;
varying vec3 vSeed;          // strand, depth, how much of a pixel it covers
void main() {
  float t = uv.y;
  vec3 pw = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 tw = normalize(mat3(modelMatrix) * aTan);
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
  vUV = uv; vTan = tw; vNrm = normalize(mat3(modelMatrix) * aNrm); vPosW = pw; vSeed = vec3(aSeed, cover);
  gl_Position = projectionMatrix * viewMatrix * vec4(pw, 1.0);
}`;

const FRAG = /* glsl */ `
${COMMON}
${SHADOWS}
${ATMOSPHERE}
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
  col = applyAtmosphere(col, vPosW, cameraPosition);
  gl_FragColor = vec4(col, alpha);
}`;

const FRAG_DEPTH = /* glsl */ `
varying vec2 vUV;
void main() { if (vUV.y > 0.97) discard; gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }`;

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Grow hair from `roots` (see sculpt.scatter). Returns a mesh to hang on a bone, in the same space the roots were in.
 * @param opts.shape    (p, n, rnd) => { length, dir: [x, y, z], droop, stiff }: how a strand rooted at p (normal n) is to grow.
 *                      droop: how far it bends to gravity by its end; stiff 0..1: how much of its first direction it keeps
 * @param opts.segments pieces to a strand
 * @param opts.width    of a strand, metres
 * @param opts.colour   { root, tip, shine }
 * @param opts.clump    0..1: how firmly strands gather into locks; opts.clumps: how many locks
 * @param opts.frizz    metres each strand wanders from its lock by its end
 * @param opts.curl     [radius in metres, turns per metre]
 * @param opts.body     (x, y, z) => distance: what the hair may not pass through
 * @param opts.flex     how far the ends move in the wind (0 for none)
 * @param opts.dense    about how many strands deep it lies (so that it does not thin to nothing with distance)
 */
export function growLocks(roots, { shape, seed = 1, segments = 6, width = 0.0005, colour = {}, clump = 0.4, clumps = 100, frizz = 0.001, curl = null, body = null, flex = 0.02, sigma = 70, gloss = 1, dense = 3 }) {
  const rnd = rng(seed), n = roots.length, S = segments;
  const paths = new Float32Array(n * (S + 1) * 3);
  const meta = new Float32Array(n * 2);
  const g = [0, 0, 0];
  const grow = (i) => {
    const { p, n: nr } = roots[i];
    const sh = shape(p, nr, rnd);
    let dx = sh.dir[0], dy = sh.dir[1], dz = sh.dir[2];
    let l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const d0 = [dx, dy, dz];
    // two directions across the strand, for curl and for wandering
    let ax = d0[1] * 0 - d0[2] * 1, ay = d0[2] * 0 - d0[0] * 0, az = d0[0] * 1 - d0[1] * 0;
    if (Math.hypot(ax, ay, az) < 0.2) { ax = 0; ay = d0[2]; az = -d0[1]; }
    l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
    const bx = d0[1] * az - d0[2] * ay, by = d0[2] * ax - d0[0] * az, bz = d0[0] * ay - d0[1] * ax;
    const phase = rnd() * 6.283, wander = [rnd() - 0.5, rnd() - 0.5, rnd() * 6.283, 1.5 + rnd() * 2.5];
    const step = sh.length / S, stiff = sh.stiff ?? 0.3;
    let x = p[0], y = p[1], z = p[2];
    const o = i * (S + 1) * 3;
    paths[o] = x; paths[o + 1] = y; paths[o + 2] = z;
    for (let k = 1; k <= S; k++) {
      const t = k / S;
      // gravity gets its way more and more towards the end
      const pull = sh.droop * t * t * (1 - stiff * 0.8);
      let ex = d0[0], ey = d0[1] - pull, ez = d0[2];
      l = Math.hypot(ex, ey, ez) || 1;
      x += (ex / l) * step; y += (ey / l) * step; z += (ez / l) * step;
      let px = x, py = y, pz = z;
      if (curl) {
        const a = phase + t * sh.length * curl[1] * 6.283, r = curl[0] * Math.min(1, t * 2.5);
        px += (ax * Math.cos(a) + bx * Math.sin(a)) * r; py += (ay * Math.cos(a) + by * Math.sin(a)) * r; pz += (az * Math.cos(a) + bz * Math.sin(a)) * r;
      }
      const wob = Math.sin(wander[2] + t * wander[3]) * frizz * t;
      px += (ax * wander[0] + bx * wander[1]) * frizz * 2 * t + ax * wob; py += (ay * wander[0] + by * wander[1]) * frizz * 2 * t + ay * wob; pz += (az * wander[0] + bz * wander[1]) * frizz * 2 * t + az * wob;
      paths[o + k * 3] = px; paths[o + k * 3 + 1] = py; paths[o + k * 3 + 2] = pz;
    }
    meta[i * 2] = rnd(); meta[i * 2 + 1] = rnd();
  };
  for (let i = 0; i < n; i++) grow(i);

  // gather into locks: each strand leans in towards the nearest of a few chosen strands, more so further along
  if (clump > 0 && clumps > 0 && n > clumps) {
    const guides = [];
    for (let k = 0; k < clumps; k++) guides.push(Math.floor(rnd() * n));
    const orig = paths.slice();
    for (let i = 0; i < n; i++) {
      const o = i * (S + 1) * 3;
      let best = -1, bd = 1e9;
      for (const gi of guides) {
        const q = gi * (S + 1) * 3;
        const d = (orig[o] - orig[q]) ** 2 + (orig[o + 1] - orig[q + 1]) ** 2 + (orig[o + 2] - orig[q + 2]) ** 2;
        if (d < bd) { bd = d; best = q; }
      }
      const hold = clump * (0.6 + 0.4 * meta[i * 2]);
      for (let k = 1; k <= S; k++) {
        const t = k / S, w = hold * Math.pow(t, 0.8), keep = 1 - 0.75 * t;      // (the roots stay where they grow)
        for (let a = 0; a < 3; a++) {
          const off = (orig[o + a] - orig[best + a]) * keep;
          paths[o + k * 3 + a] += (orig[best + k * 3 + a] + off - orig[o + k * 3 + a]) * w;
        }
      }
    }
  }
  // and out of anything solid
  if (body) {
    const h = 0.0006, skinGap = Math.max(width, 0.0004);
    for (let i = 0; i < n; i++) {
      const o = i * (S + 1) * 3;
      for (let k = 1; k <= S; k++) {
        let x = paths[o + k * 3], y = paths[o + k * 3 + 1], z = paths[o + k * 3 + 2];
        for (let it = 0; it < 2; it++) {
          const d = body(x, y, z);
          if (d >= skinGap) break;
          g[0] = body(x + h, y, z) - body(x - h, y, z); g[1] = body(x, y + h, z) - body(x, y - h, z); g[2] = body(x, y, z + h) - body(x, y, z - h);
          const gl = Math.hypot(g[0], g[1], g[2]) || 1;
          x += (g[0] / gl) * (skinGap - d); y += (g[1] / gl) * (skinGap - d); z += (g[2] / gl) * (skinGap - d);
        }
        paths[o + k * 3] = x; paths[o + k * 3 + 1] = y; paths[o + k * 3 + 2] = z;
      }
    }
  }

  // ribbons
  const V = n * (S + 1) * 2;
  const pos = new Float32Array(V * 3), tan = new Float32Array(V * 3), nrm = new Float32Array(V * 3), uv = new Float32Array(V * 2), sd = new Float32Array(V * 2);
  const index = new Uint32Array(n * S * 6);
  let v = 0, ix = 0;
  for (let i = 0; i < n; i++) {
    const o = i * (S + 1) * 3, nr = roots[i].n, base = v;
    for (let k = 0; k <= S; k++) {
      const a = o + Math.max(0, k - 1) * 3, b = o + Math.min(S, k + 1) * 3;
      let tx = paths[b] - paths[a], ty = paths[b + 1] - paths[a + 1], tz = paths[b + 2] - paths[a + 2];
      const l = Math.hypot(tx, ty, tz) || 1;
      tx /= l; ty /= l; tz /= l;
      for (let s = 0; s < 2; s++) {
        pos[v * 3] = paths[o + k * 3]; pos[v * 3 + 1] = paths[o + k * 3 + 1]; pos[v * 3 + 2] = paths[o + k * 3 + 2];
        tan[v * 3] = tx; tan[v * 3 + 1] = ty; tan[v * 3 + 2] = tz;
        nrm[v * 3] = nr[0]; nrm[v * 3 + 1] = nr[1]; nrm[v * 3 + 2] = nr[2];
        uv[v * 2] = s; uv[v * 2 + 1] = k / S;
        sd[v * 2] = meta[i * 2]; sd[v * 2 + 1] = meta[i * 2 + 1];
        v++;
      }
      if (k < S) { const a0 = base + k * 2; index[ix++] = a0; index[ix++] = a0 + 1; index[ix++] = a0 + 2; index[ix++] = a0 + 1; index[ix++] = a0 + 3; index[ix++] = a0 + 2; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aTan', new THREE.BufferAttribute(tan, 3));
  geo.setAttribute('aNrm', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));

  const own = {
    uWidth: { value: width }, uFlex: { value: flex }, uSigma: { value: sigma }, uGloss: { value: gloss }, uDense: { value: dense },
    uRoot: { value: new THREE.Color(colour.root ?? 0x241408) }, uTip: { value: new THREE.Color(colour.tip ?? 0x8a5a2c) }, uShine: { value: new THREE.Color(colour.shine ?? 0xffffff) },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...U, ...own }, side: THREE.DoubleSide, alphaToCoverage: true, defines: { SHADOW_TAPS: 4 } });
  const depth = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG_DEPTH, uniforms: { ...U, ...own }, side: THREE.DoubleSide, defines: { LOCKS_DEPTH: 1 } });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'locks';
  mesh.frustumCulled = false;
  mesh.userData.shadowMaterial = depth;
  mesh.layers.enable(LAYER_SHADOW_NEAR);
  return { mesh, material, count: n };
}
