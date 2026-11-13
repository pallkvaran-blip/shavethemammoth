// What the people are made of. Each material is one of three.js's physical
// materials, lit like everything else here, with its surface worked out in
// code from where a point is on the figure at rest: so the stitches of a
// jumper, the pores of a nose and the grain of a boot are as sharp from a
// hand's breadth as from across the snow, and stay put when the figure moves.
//
// A sculpted layer (see sculpt.js) brings with it, for every point: how much
// of the sky it sees, how thin the body is there, a colour or mask painted on
// by rule, and coordinates in metres round and along the limb it is on.
import * as THREE from 'three';
import { patchStandardMaterial } from '../../gfx/patch.js';

const VERT_HEAD = /* glsl */ `
attribute vec2 aShade;
attribute vec4 aTint;
varying vec3 vRest;
varying vec2 vShade;
varying vec4 vTint;
varying vec2 vUVm;
`;
const VERT_BODY = /* glsl */ `
  vRest = position;
  #ifdef FOLK_SCULPTED
    vShade = aShade; vTint = aTint; vUVm = uv;
  #else
    vShade = vec2(1.0, 0.0); vTint = vec4(1.0); vUVm = uv;
  #endif
`;

const LIB = /* glsl */ `
varying vec3 vRest;
varying vec2 vShade;
varying vec4 vTint;
varying vec2 vUVm;
uniform vec4 uFolkA;      // what each kind of material wants to be told (see below)
uniform vec4 uFolkB;
uniform vec3 uFolkC;      // a second colour

// smooth noise in space (two looks at the noise picture, one for each of the layers a point lies between)
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = i.xy + f.xy;
  float a = textureLod(uNoise, (uv + vec2(37.0, 17.0) * i.z + 0.5) / 256.0, 0.0).r;
  float b = textureLod(uNoise, (uv + vec2(37.0, 17.0) * (i.z + 1.0) + 0.5) / 256.0, 0.0).r;
  return mix(a, b, f.z);
}
float fbm3(vec3 p) { return noise3(p) * 0.55 + noise3(p * 2.1 + 7.3) * 0.3 + noise3(p * 4.3 + 19.1) * 0.15; }
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// cells in space: x = distance to the nearest cell's middle, y = to the next nearest, z = a number for the nearest
vec3 cells3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 h = hash33(i + g);
    vec3 o = g + h - f;
    float d = dot(o, o);
    if (d < d1) { d2 = d1; d1 = d; id = h.x; } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
// metres of the surface to one pixel: detail finer than that is let go rather than left to sparkle
float footprint() { return max(length(dFdx(vRest)), length(dFdy(vRest))); }
// tip the normal by the slope of a height (metres) worked out for this pixel
vec3 bumped(vec3 n, float h) {
  vec3 sp = -vViewPosition;
  vec3 dpx = dFdx(sp), dpy = dFdy(sp);
  // (no steeper than a slope of one in one: a height that jumps between two pixels is an edge, not a cliff)
  float hx = clamp(dFdx(h), -length(dpx), length(dpx)), hy = clamp(dFdy(h), -length(dpy), length(dpy));
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  return normalize(abs(det) * n - sign(det) * (hx * r1 + hy * r2));
}

// ---- knitting ----
// One arm of a stitch: yarn lying from a to b. Returns how high the yarn stands at p (0..1) and how far along it p is.
vec2 yarn(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d = length(pa - ba * t) / r;
  return vec2(sqrt(max(0.0, 1.0 - d * d)), t);
}
// Stocking stitch at p (in stitches across, rows up): columns of Vs, each rising out of the one below.
// x = height (0 in the gaps, 1 on the crown of the yarn), y = the row the yarn on top belongs to, z = a twist along the yarn
vec3 stocking(vec2 p) {
  vec2 cell = floor(p), f = fract(p) - 0.5;
  float x = abs(f.x);
  vec3 best = vec3(0.0, cell.y, 0.0);
  for (int r = -1; r <= 1; r++) {
    float y = f.y - float(r);
    // an arm starts close to the middle at the foot of its row and leans out to the top corner; it dives under the stitch above it
    vec2 h = yarn(vec2(x, y), vec2(0.07, -0.64), vec2(0.42, 0.62), 0.25);
    float lift = h.x * (1.0 - 0.38 * h.y);
    if (lift > best.x) best = vec3(lift, cell.y + float(r), h.y);
  }
  return best;
}
// Ribbing: columns of stocking stitch standing proud, with furrows between them. w = stitches to one rib and furrow.
vec3 ribbing(vec2 p, float w) {
  float c = abs(fract(p.x / w) - 0.5) * 2.0;        // 0 on the crown of a rib, 1 at the bottom of a furrow
  float ridge = 1.0 - smoothstep(0.35, 0.95, c);
  vec3 s = stocking(p);
  return vec3(mix(0.12, 0.45 + 0.55 * s.x, ridge), s.y, s.z);
}
`;

// What every sculpted material does once the light is in: creases hold shadow.
const OCCLUDE = /* glsl */ `
  {
    float ao = vShade.x;
    reflectedLight.indirectDiffuse *= ao;
    reflectedLight.indirectSpecular *= ao * ao;
    reflectedLight.directDiffuse *= mix(1.0, ao, 0.3);
    #ifdef USE_SHEEN
      sheenSpecularIndirect *= ao;
    #endif
    #ifdef USE_CLEARCOAT
      clearcoatSpecularIndirect *= ao * ao;
    #endif
  }
`;

const KINDS = {
  // ---- skin: uFolkA = (freckles 0..1, pore depth, redness under the skin, shine) ----
  skin: {
    color: /* glsl */ `
      float px = footprint();
      float fine = 1.0 - smoothstep(0.00012, 0.0006, px);
      vec3 pore = cells3(vRest * 1000.0);
      vec3 base = diffuseColor.rgb * vTint.rgb;
      // blotches of colour under the surface, pores, and freckles where they have been painted
      base *= 0.94 + 0.12 * fbm3(vRest * 90.0);
      base *= mix(1.0, 0.95 + 0.05 * smoothstep(0.1, 0.5, pore.x), fine);
      vec3 fr = cells3(vRest * 420.0 + 3.7);
      float spot = (1.0 - smoothstep(0.1, 0.34, fr.x)) * step(0.45, fr.z) * uFolkA.x * vTint.a;
      base = mix(base, base * vec3(0.66, 0.44, 0.3), spot * (1.0 - smoothstep(0.0008, 0.004, px)));
      diffuseColor.rgb = base;
    `,
    surface: /* glsl */ `roughnessFactor = clamp(roughnessFactor + 0.12 * (fbm3(vRest * 300.0) - 0.5) - uFolkA.w * 0.1 * vTint.a, 0.2, 1.0);`,
    normal: /* glsl */ `
      {
        float px = footprint();
        float fine = 1.0 - smoothstep(0.00012, 0.0006, px);
        vec3 pore = cells3(vRest * 1000.0);
        float h = (smoothstep(0.0, 0.45, pore.x) - 0.5) * 0.00003 * uFolkA.y * fine;
        // the fine lines skin folds along
        h += (fbm3(vRest * vec3(260.0, 700.0, 260.0)) - 0.5) * 0.00005 * uFolkA.y * (1.0 - smoothstep(0.0003, 0.0015, px));
        normal = bumped(normal, h);
      }
    `,
    light: /* glsl */ `
      {
        vec3 nw = normalize(vWNormal);
        float ndl = dot(nw, uSunDir);
        // light goes a little way in and comes out round the corner, redder for the trip
        float wrapped = clamp((ndl + 0.5) / 1.5, 0.0, 1.0);
        float extra = max(0.0, wrapped * wrapped - max(ndl, 0.0)) ;
        vec3 under = vec3(1.0, 0.42, 0.3);
        reflectedLight.directDiffuse += material.diffuseColor * uSunColor * extra * under * uFolkA.z * sv * 0.75;
        // and straight through where there is little to go through: an ear with the sun behind it
        float thin = vShade.y;
        if (thin > 0.02) {
          float back = clamp(-ndl * 0.8 + 0.35, 0.0, 1.0);
          float lit = sunVisibility(vWPos + uSunDir * 0.02, 160.0, 0.02, 0.03, ign(gl_FragCoord.xy));
          reflectedLight.directDiffuse += material.diffuseColor * uSunColor * back * thin * lit * vec3(1.0, 0.27, 0.14) * uFolkA.z * 1.9;
        }
      }
    `,
  },
  // ---- knitting: uFolkA = (stitch width m, row height m, rows to a stripe (0 for none), share of the stripe in the second colour),
  //      uFolkB = (ribs: stitches to a rib, or 0 for plain stocking stitch; row offset; fuzz; unused), uFolkC = the second colour ----
  knit: {
    color: /* glsl */ `
      float px = footprint();
      vec2 kp = vec2(vUVm.x / uFolkA.x, vUVm.y / uFolkA.y + uFolkB.y);
      vec3 st = uFolkB.x > 0.5 ? ribbing(kp, uFolkB.x) : stocking(kp);
      float seen = 1.0 - smoothstep(0.1, 0.42, px / uFolkA.x);         // (once a stitch is only a few pixels across, only its average is left)
      float knitH = mix(0.55, st.x, seen);
      vec3 wool = diffuseColor.rgb;
      if (uFolkA.z > 0.5) {
        // stripes change colour between rows, as knitting does
        float band = fract(st.y / uFolkA.z);
        wool = mix(wool, uFolkC, step(1.0 - uFolkA.w, band));
      }
      wool *= vTint.rgb;
      // every stitch a little its own shade; yarn plied, so it glints in stripes along its length; dark between the stitches
      float each = fract(sin(dot(floor(kp), vec2(12.9898, 78.233))) * 43758.5453);
      wool *= mix(1.0, 0.9 + 0.2 * each, seen);
      wool *= mix(1.0, 0.86 + 0.14 * sin(st.z * 16.0 + kp.x * 3.0), seen * 0.7);
      wool *= mix(0.86, mix(0.55, 1.0, smoothstep(0.0, 0.6, st.x)), seen);
      // fuzz: fibres that stand off the yarn and catch light of their own
      wool *= 0.94 + 0.12 * fbm3(vRest * 1400.0);
      diffuseColor.rgb = wool;
    `,
    surface: /* glsl */ `roughnessFactor = 0.92;`,
    normal: /* glsl */ `normal = bumped(normal, knitH * uFolkA.x * 0.32);`,
  },
  // ---- felt and other pressed wool: uFolkA = (fibre size m, depth, unused, unused) ----
  felt: {
    color: /* glsl */ `
      float px = footprint();
      float fine = 1.0 - smoothstep(0.0003, 0.0015, px);
      float fib = fbm3(vRest * vec3(1.0, 0.35, 1.0) / uFolkA.x) * 0.6 + fbm3(vRest.zxy * vec3(0.35, 1.0, 1.0) / uFolkA.x + 5.0) * 0.4;
      diffuseColor.rgb *= vTint.rgb * mix(1.0, 0.82 + 0.36 * fib, fine) * (0.92 + 0.16 * fbm3(vRest * 60.0));
      float feltH = (fib - 0.5) * uFolkA.x * uFolkA.y * fine;
    `,
    surface: /* glsl */ `roughnessFactor = 0.96;`,
    normal: /* glsl */ `normal = bumped(normal, feltH);`,
  },
  // ---- woven cloth: uFolkA = (thread pitch m, depth, wale (0 = plain weave, else threads to a cord, for corduroy), unused) ----
  cloth: {
    color: /* glsl */ `
      float px = footprint();
      float seen = 1.0 - smoothstep(0.12, 0.45, px / uFolkA.x);
      vec2 wp = vUVm / uFolkA.x;
      // over and under: each thread humps where it crosses the one beneath it
      vec2 wf = fract(wp) - 0.5, wi = floor(wp);
      float over = mod(wi.x + wi.y, 2.0);
      float warp = cos(wf.x * 3.14159) * (0.5 + 0.5 * cos(wf.y * 6.28318 + over * 3.14159));
      float weft = cos(wf.y * 3.14159) * (0.5 + 0.5 * cos(wf.x * 6.28318 + (1.0 - over) * 3.14159));
      float weaveH = max(warp, weft);
      if (uFolkA.z > 0.5) weaveH = weaveH * 0.3 + 0.7 * (0.5 + 0.5 * cos(wp.x / uFolkA.z * 6.28318));       // cords running up it
      weaveH = mix(0.6, weaveH, seen);
      diffuseColor.rgb *= vTint.rgb * mix(1.0, 0.72 + 0.4 * weaveH, seen) * (0.93 + 0.14 * fbm3(vRest * 80.0));
    `,
    surface: /* glsl */ `roughnessFactor = 0.88;`,
    normal: /* glsl */ `normal = bumped(normal, weaveH * uFolkA.x * uFolkA.y);`,
  },
  // ---- leather: uFolkA = (grain size m, depth, wear on the edges 0..1, unused) ----
  leather: {
    color: /* glsl */ `
      float px = footprint();
      float fine = 1.0 - smoothstep(0.0003, 0.0018, px);
      vec3 gr = cells3(vRest / uFolkA.x);
      float crack = smoothstep(0.02, 0.14, gr.y - gr.x);
      float leatherH = mix(0.8, crack * (0.75 + 0.25 * gr.z), fine);
      // creases across it where it bends, and the colour rubbed pale where it sticks out
      float crease = fbm3(vRest * vec3(70.0, 240.0, 70.0));
      leatherH += (crease - 0.5) * 0.9;
      vec3 hide = diffuseColor.rgb * vTint.rgb * (0.82 + 0.3 * fbm3(vRest * 45.0));
      hide = mix(hide, hide * 1.9 + 0.03, uFolkA.z * smoothstep(0.55, 0.95, crease) * 0.5);
      hide *= mix(1.0, 0.7 + 0.3 * crack, fine);
      diffuseColor.rgb = hide;
    `,
    surface: /* glsl */ `roughnessFactor = clamp(roughnessFactor + 0.25 * (fbm3(vRest * 120.0) - 0.5), 0.15, 1.0);`,
    normal: /* glsl */ `normal = bumped(normal, leatherH * uFolkA.x * uFolkA.y);`,
  },
  // ---- anything smooth: painted wood, foam, horn. uFolkA = (mottle size m, mottle depth, unused, unused) ----
  plain: {
    color: /* glsl */ `diffuseColor.rgb *= vTint.rgb * (1.0 - uFolkA.y * 0.5 + uFolkA.y * fbm3(vRest / max(uFolkA.x, 1e-5)));`,
  },
  // ---- an eye, looking along its own +z. uFolkA = (iris radius, pupil radius, both as angles from the middle; unused; unused), uFolkC = the iris ----
  eye: {
    color: /* glsl */ `
      vec3 ed = normalize(vRest);
      float ang = acos(clamp(ed.z, -1.0, 1.0));
      float turn = atan(ed.y, ed.x);
      float inIris = 1.0 - smoothstep(uFolkA.x - 0.03, uFolkA.x + 0.012, ang);
      float inPupil = 1.0 - smoothstep(uFolkA.y - 0.025, uFolkA.y + 0.02, ang);
      // the white: not white, pinker towards the corners, with a thread or two of blood
      vec3 white = diffuseColor.rgb * mix(vec3(1.0), vec3(1.0, 0.82, 0.78), smoothstep(0.7, 1.7, ang));
      float vein = smoothstep(0.62, 0.7, noise3(vec3(turn * 5.0, ang * 3.0, 1.0) + fbm3(ed * 9.0) * 2.0));
      white = mix(white, vec3(0.6, 0.16, 0.12), vein * 0.3 * smoothstep(0.75, 1.5, ang));
      // the iris: fibres running out from the pupil, darker round the rim, a paler ring near the middle
      float r = clamp((ang - uFolkA.y) / max(uFolkA.x - uFolkA.y, 1e-4), 0.0, 1.0);
      float fibre = noise3(vec3(turn * 18.0, r * 2.5, 3.0)) * 0.6 + noise3(vec3(turn * 47.0, r * 5.0, 9.0)) * 0.4;
      vec3 iris = uFolkC * (0.55 + 0.9 * fibre) * mix(1.35, 0.75, r);
      iris = mix(iris, uFolkC * vec3(1.5, 1.25, 0.7), (1.0 - smoothstep(0.0, 0.3, r)) * 0.5);
      iris *= 1.0 - 0.75 * smoothstep(0.78, 1.0, r);
      vec3 eyeCol = mix(white, iris, inIris);
      eyeCol = mix(eyeCol, vec3(0.004), inPupil);
      diffuseColor.rgb = eyeCol;
    `,
    surface: /* glsl */ `roughnessFactor = 0.08;`,
  },
};

/**
 * A material for part of a figure.
 * @param kind   'skin' | 'knit' | 'felt' | 'cloth' | 'leather' | 'plain' | 'eye'
 * @param opts   colour, and what the kind wants: see KINDS; `a`, `b` are its two sets of four numbers, `second` its other colour;
 *               anything else goes to the physical material (roughness, sheen, clearcoat, ...)
 * @param opts.sculpted  false for an ordinary mesh that has not come from sculpt.js (no occlusion, no paint)
 */
export function folkMaterial(kind, { color = 0xffffff, a = [0, 0, 0, 0], b = [0, 0, 0, 0], second = 0xffffff, sculpted = true, ...rest } = {}) {
  const K = KINDS[kind];
  if (!K) throw new Error('no such material: ' + kind);
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.7, metalness: 0, ...rest });
  if (sculpted) m.defines = { ...(m.defines || {}), FOLK_SCULPTED: 1 };
  const uniforms = { uFolkA: { value: new THREE.Vector4(...a) }, uFolkB: { value: new THREE.Vector4(...b) }, uFolkC: { value: new THREE.Color(second) } };
  m.userData.folk = uniforms;
  return patchStandardMaterial(m, {
    key: `folk-${kind}-${sculpted ? 's' : 'p'}`, bias: 0.012, radius: 0.012, taps: 8, extraUniforms: uniforms,
    vertexHead: VERT_HEAD, extraVertex: VERT_BODY, fragmentHead: LIB,
    fragmentColor: K.color || '', fragmentSurface: K.surface || '', fragmentNormal: K.normal || '', fragmentLight: K.light || '',
    fragmentAmbient: OCCLUDE,
  });
}
