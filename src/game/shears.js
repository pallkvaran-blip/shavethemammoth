// A pair of garden shears, held in both hands and seen in first person.
// They are large for an elf: blades 13.5 cm from pivot to tip.
//
// The two halves are identical forgings, one turned over on the other, as on
// real shears: a blade ground to a bevel on one side and flat on the other, a
// round boss at the pivot, a tang cranked outwards, a brass ferrule and a
// turned wooden handle. A bolt and nut hold them together.
import * as THREE from 'three';
import { patchStandardMaterial } from '../gfx/patch.js';
import { makeDepthMaterial } from '../gfx/shadows.js';
import { LAYER_SHADOW_NEAR } from '../gfx/globals.js';

export const BLADE = 0.135;                         // pivot to tip, metres
const HALF_THICK = 0.0017;                          // half the thickness of the steel
const CRANK = (17 * Math.PI) / 180;                 // how far each tang is bent outwards
const TANG = 0.046;                                 // length of tang behind the pivot
export const OPEN_ANGLE = (40 * Math.PI) / 180;     // angle between the blades at rest

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function rngFrom(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ---- one half of the shears ------------------------------------------------------

/** Centre line of a lever at distance u from the pivot (negative = along the tang). */
function centreline(u) {
  if (u >= 0) return { x: u, z: 0, a: 0 };
  // integrate backwards along the cranked tang
  let x = 0, z = 0, a = 0;
  const steps = 24, du = -u / steps;
  for (let i = 0; i < steps; i++) {
    a = CRANK * smoothstep(0, 0.014, (i + 0.5) * du);
    x -= Math.cos(a) * du; z += Math.sin(a) * du;
  }
  return { x, z, a: CRANK * smoothstep(0, 0.014, -u) };
}

/** Cross-section of the steel at u: five corners, as [across, up] pairs. */
function section(u) {
  const boss = Math.sqrt(Math.max(0, 0.0128 * 0.0128 - u * u));
  let back, edge;
  if (u >= 0) {
    const s = u / BLADE;
    const b88 = 0.0195 * (1 - 0.5 * Math.pow(0.88, 1.5));
    back = s < 0.88 ? 0.0195 * (1 - 0.5 * Math.pow(s, 1.5)) : lerp(b88, 0.0012, Math.pow((s - 0.88) / 0.12, 1.6));
    edge = s < 0.92 ? 0.0045 : lerp(0.0045, -0.0008, Math.pow((s - 0.92) / 0.08, 1.4));
  } else {
    const k = smoothstep(-0.016, 0, u);
    back = lerp(0.0056, 0.0195, k);
    edge = lerp(0.0056, 0.0045, k);
  }
  back = Math.max(back, boss); edge = Math.max(edge, boss);
  // the ground bevel starts a little way out from the pivot
  const b = smoothstep(0.014, 0.03, u);
  const bw = Math.min(0.0058, (back + edge) * 0.42) * b;
  const h = HALF_THICK;
  return {
    bevel: b,
    pts: [
      [-back, h],
      [edge - bw - 0.0002, h],
      [edge, h - (2 * h - 0.0004) * b - 0.0002],
      [edge, -h],
      [-back, -h],
    ],
  };
}

const STATIONS = [-TANG, -0.036, -0.026, -0.018, -0.014, -0.011, -0.008, -0.005, -0.0025, 0, 0.0025, 0.005, 0.008, 0.011, 0.0128,
  0.016, 0.02, 0.025, 0.03, 0.04, 0.055, 0.07, 0.085, 0.1, 0.11, 0.1188, 0.1215, 0.1242, 0.127, 0.1295, 0.1315, 0.1335, BLADE];

/** Skin the stations with flat-shaded faces. `want(i, k)` picks which faces to build. */
function loftLever(want, caps) {
  const rings = STATIONS.map((u) => {
    const c = centreline(u), sec = section(u);
    // across = sideways in the plane of the blades, turning with the centre line
    const wx = Math.sin(c.a), wz = Math.cos(c.a);
    return { u, bevel: sec.bevel, pts: sec.pts.map(([w, y]) => [c.x + wx * w, y, c.z + wz * w]), across: sec.pts.map(([w]) => w) };
  });
  const pos = [], uv = [];
  const tri = (a, b, c, ua, ub, uc, centre) => {
    // wind every face so that it looks outwards from the middle of the steel
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - centre[0], my = (a[1] + b[1] + c[1]) / 3 - centre[1], mz = (a[2] + b[2] + c[2]) / 3 - centre[2];
    if (nx * mx + ny * my + nz * mz >= 0) { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); }
    else { pos.push(...a, ...c, ...b); uv.push(...ua, ...uc, ...ub); }
  };
  const mid = (r) => [(r.pts[0][0] + r.pts[3][0]) / 2, 0, (r.pts[0][2] + r.pts[3][2]) / 2];
  const st = (r, k) => [r.u * 9, r.across[k] * 34 + r.pts[k][1] * 34];   // streaks run the length of the steel
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    const centre = mid(A).map((v, n) => (v + mid(B)[n]) / 2);
    for (let k = 0; k < 5; k++) {
      if (!want(A, B, k)) continue;
      const k2 = (k + 1) % 5;
      tri(A.pts[k], A.pts[k2], B.pts[k], st(A, k), st(A, k2), st(B, k), centre);
      tri(A.pts[k2], B.pts[k2], B.pts[k], st(A, k2), st(B, k2), st(B, k), centre);
    }
  }
  if (caps) {
    for (const r of [rings[0], rings[rings.length - 1]]) {
      // a cap faces away from the rest of the lever
      const inward = r === rings[0] ? mid(rings[1]) : mid(rings[rings.length - 2]);
      for (let k = 1; k < 4; k++) tri(r.pts[0], r.pts[k], r.pts[k + 1], st(r, 0), st(r, k), st(r, k + 1), inward);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();   // not indexed: every face keeps its own normal, so edges stay crisp
  return geo;
}

function lathe(profile, segments = 22) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// ---- surfaces --------------------------------------------------------------------

function canvasTexture(w, h, draw, srgb) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSteelTextures() {
  const rnd = rngFrom(20240);
  // roughness (green channel) and relief: fine grinding lines along the steel, a few scratches and pits
  const rough = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const y = rnd() * h, v = 128 + (rnd() - 0.5) * 90;
      g.strokeStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.12})`;
      g.lineWidth = 0.3 + rnd() * 0.7;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (rnd() - 0.5) * 3); g.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w, y = rnd() * h, l = 20 + rnd() * 90, a = (rnd() - 0.5) * 1.2;
      g.strokeStyle = `rgba(215,215,215,${0.25 + rnd() * 0.35})`;
      g.lineWidth = 0.5 + rnd() * 0.7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(200,200,200,${rnd() * 0.3})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 1.5);
    }
  }, false);
  // colour of the forged, blackened faces: dark scale, worn brighter in places, a little rust
  const body = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#979ca3'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, r = 14 + rnd() * 50;
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      const light = rnd() < 0.55;
      c.addColorStop(0, light ? `rgba(200,204,210,${0.1 + rnd() * 0.18})` : `rgba(60,64,70,${0.12 + rnd() * 0.2})`);
      c.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 500; i++) {
      const y = rnd() * h;
      g.strokeStyle = rnd() < 0.5 ? `rgba(215,218,224,${0.015 + rnd() * 0.035})` : `rgba(60,63,68,${0.015 + rnd() * 0.035})`;
      g.lineWidth = 0.3 + rnd() * 0.6;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (rnd() - 0.5) * 2); g.stroke();
    }
    for (let i = 0; i < 46; i++) {
      const x = rnd() * w, y = rnd() * h, r = 1.5 + rnd() * 6;
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      c.addColorStop(0, `rgba(118,62,28,${0.35 + rnd() * 0.4})`); c.addColorStop(1, 'rgba(118,62,28,0)');
      g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, true);
  return { rough, body };
}

function makeWoodTexture() {
  const rnd = rngFrom(977);
  // grain runs up the canvas, which is along the handle
  return canvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = '#8c5f36'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = rnd() * w, bw = 10 + rnd() * 40;
      const c = g.createLinearGradient(x - bw, 0, x + bw, 0);
      const tone = rnd() < 0.5 ? '70,42,18' : '200,150,92';
      c.addColorStop(0, `rgba(${tone},0)`); c.addColorStop(0.5, `rgba(${tone},${0.12 + rnd() * 0.18})`); c.addColorStop(1, `rgba(${tone},0)`);
      g.fillStyle = c; g.fillRect(x - bw, 0, bw * 2, h);
    }
    for (let i = 0; i < 240; i++) {
      let x = rnd() * w;
      g.strokeStyle = rnd() < 0.7 ? `rgba(58,34,14,${0.1 + rnd() * 0.3})` : `rgba(214,170,112,${0.08 + rnd() * 0.16})`;
      g.lineWidth = 0.5 + rnd() * 1.4;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 32) { x += (rnd() - 0.5) * 3; g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 900; i++) {   // open pores
      g.fillStyle = `rgba(48,28,12,${0.15 + rnd() * 0.3})`;
      g.fillRect(rnd() * w, rnd() * h, 0.8, 3 + rnd() * 9);
    }
  }, true);
}

// ---- the tool --------------------------------------------------------------------

export class Shears {
  constructor() {
    const tex = makeSteelTextures();
    // Steel hides the hair lying against it. The tool is drawn as if it were a
    // little nearer the eye than it is, so that any hair within a few
    // centimetres in front of it is covered by it, and no strand can be seen
    // passing through a blade or a handle. Hair further in front still hangs
    // across it as it should.
    const NEARER = 0.055;
    const inFront = `{
      float zv = mvPosition.z;                                  // depth from the eye (negative)
      float zb = min(zv + ${NEARER.toFixed(3)}, -0.02);          // nearer, but never through the near plane
      gl_Position.z = (projectionMatrix[2][2] * zb + projectionMatrix[3][2]) * (zv / zb);
    }`;
    const patch = (m) => patchStandardMaterial(m, { key: 'shears', bias: 0.03, extraVertex: inFront });
    const forged = patch(new THREE.MeshPhysicalMaterial({ map: tex.body, metalness: 0.95, roughness: 0.52, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.06, envMapIntensity: 0.85 }));
    const ground = patch(new THREE.MeshPhysicalMaterial({ color: 0xeef0f2, metalness: 1, roughness: 0.26, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.03, envMapIntensity: 1.3 }));
    const brass = patch(new THREE.MeshPhysicalMaterial({ color: 0xb48a3c, metalness: 1, roughness: 0.36, roughnessMap: tex.rough }));
    const zinc = patch(new THREE.MeshPhysicalMaterial({ color: 0x9a9da3, metalness: 1, roughness: 0.42, roughnessMap: tex.rough }));
    const wood = patch(new THREE.MeshPhysicalMaterial({ map: makeWoodTexture(), metalness: 0, roughness: 0.62, clearcoat: 0.22, clearcoatRoughness: 0.4 }));

    // steel: the forged faces, and the bright bevel ground along the cutting edge
    const steelGeo = loftLever((A, B, k) => k !== 1 || (A.bevel < 0.5 && B.bevel < 0.5), true);
    const bevelGeo = loftLever((A, B, k) => k === 1 && (A.bevel >= 0.5 || B.bevel >= 0.5), false);
    // ferrule and handle, turned on a lathe along +y and then laid along the tang
    const ferruleGeo = lathe([[0, -0.0006], [0.0096, 0], [0.0103, 0.001], [0.0103, 0.0034], [0.0097, 0.0044], [0.0097, 0.012], [0.0103, 0.013], [0.0103, 0.0152], [0.0094, 0.0164], [0, 0.0166]]);
    const woodGeo = lathe([[0, 0], [0.0086, 0], [0.0092, 0.004], [0.0100, 0.014], [0.0110, 0.03], [0.0112, 0.04], [0.0105, 0.055], [0.0100, 0.064], [0.0106, 0.074], [0.0099, 0.0795], [0.0072, 0.0822], [0, 0.083]], 26);

    const end = centreline(-TANG);
    const back = new THREE.Vector3(-Math.cos(CRANK), 0, Math.sin(CRANK));   // the way the tang points, away from the pivot
    const lay = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), back);
    const tangEnd = new THREE.Vector3(end.x, 0, end.z);

    this.meshes = [];
    const depth = makeDepthMaterial();
    const add = (parent, geo, mat, name) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.frustumCulled = false;
      mesh.userData.shadowMaterial = depth;
      mesh.layers.enable(LAYER_SHADOW_NEAR);
      parent.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };
    const makeLever = () => {
      const lever = new THREE.Group();
      add(lever, steelGeo, forged, 'shears-steel');
      add(lever, bevelGeo, ground, 'shears-edge');
      const ferrule = add(lever, ferruleGeo, brass, 'shears-ferrule');
      ferrule.quaternion.copy(lay);
      ferrule.position.copy(tangEnd).addScaledVector(back, -0.008);
      const handle = add(lever, woodGeo, wood, 'shears-handle');
      handle.quaternion.copy(lay);
      handle.position.copy(tangEnd).addScaledVector(back, 0.0065);
      return lever;
    };

    this.group = new THREE.Group();
    this.group.name = 'shears';
    this.group.matrixAutoUpdate = false;
    // upper half: its flat face lies on the plane of the pivot, bevel upwards
    this.upper = new THREE.Group();
    const a = makeLever(); a.position.y = HALF_THICK; this.upper.add(a);
    // lower half: the same forging turned over
    this.lower = new THREE.Group();
    const b = makeLever(); b.position.y = HALF_THICK; const flip = new THREE.Group(); flip.rotation.x = Math.PI; flip.add(b); this.lower.add(flip);
    this.group.add(this.upper, this.lower);

    // pivot: domed bolt head and washer above, washer, nut and the end of the thread below
    const top = 2 * HALF_THICK;
    const washer = new THREE.CylinderGeometry(0.0084, 0.0084, 0.0008, 24);
    add(this.group, washer, zinc, 'shears-washer').position.y = top + 0.0004;
    const head = add(this.group, new THREE.SphereGeometry(0.0066, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), zinc, 'shears-bolt');
    head.scale.y = 0.5; head.position.y = top + 0.0008;
    add(this.group, washer, zinc, 'shears-washer').position.y = -top - 0.0004;
    const nut = add(this.group, new THREE.CylinderGeometry(0.0073, 0.0073, 0.0048, 6), zinc, 'shears-nut');
    nut.position.y = -top - 0.0008 - 0.0024; nut.rotation.y = 0.3;
    add(this.group, new THREE.CylinderGeometry(0.0031, 0.0031, 0.0022, 12), zinc, 'shears-thread').position.y = -top - 0.0008 - 0.0048 - 0.0011;

    this.angle = OPEN_ANGLE;
    this.phase = 'open';
    this.timer = 0;
    this.squeezing = false;
    this.kick = 0;
    this.sway = new THREE.Vector2();
    this.time = 0;
    this.events = [];
    this._local = new THREE.Matrix4();
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._sd = new Float32Array(4);
    this._hit = {};
    this._n = new THREE.Vector3(); this._f = new THREE.Vector3(); this._u = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._piv = new THREE.Vector3(); this._lastF = new THREE.Vector3(0, 1, 0);
    this._freeP = new THREE.Vector3(); this._freeQ = new THREE.Quaternion();
    this._flatP = new THREE.Vector3(); this._flatQ = new THREE.Quaternion();
    this._tp = new THREE.Vector3(); this._tq = new THREE.Quaternion();
    this.poseP = new THREE.Vector3(); this.poseQ = new THREE.Quaternion();
    this._scale = new THREE.Vector3(); this._one = new THREE.Vector3(1, 1, 1);
    this.flat = 0; this.lying = 0; this.poseReady = false;

    // The tool, for the purposes of not passing through things: small spheres
    // along every part of both halves. [x, y, z, radius] in a lever's own frame.
    const lever = [];
    for (const u of [0.02, 0.045, 0.07, 0.095, 0.115, 0.128, BLADE - 0.001]) {
      const sec = section(u);
      const bk = -sec.pts[0][0], edge = sec.pts[3][0];
      lever.push([u, 0, edge - 0.0012, 0.0026], [u, 0, -bk + 0.0012, 0.0026]);
      if (bk + edge > 0.012) lever.push([u, 0, (edge - bk) / 2, 0.0026]);
    }
    for (const u of [-0.012, -0.026, -0.04]) { const c = centreline(u); lever.push([c.x, 0, c.z, 0.0062]); }
    const at = (d) => [tangEnd.x + back.x * d, 0, tangEnd.z + back.z * d];
    lever.push([...at(0.0003), 0.0112]);                                              // ferrule
    for (const [d, r] of [[0.019, 0.0115], [0.042, 0.0132], [0.065, 0.0122], [0.083, 0.0116]]) lever.push([...at(0.0065 + d), r]);   // handle
    this.leverSamples = lever;
    // the stack at the pivot: bolt head above, nut and thread below
    this.pivotSamples = [[0, 0.0022, 0, 0.0076], [0, -0.0056, 0, 0.0078]];
    this.samples = new Float32Array((lever.length * 2 + this.pivotSamples.length) * 4);
    this._g = [0, 0, 0];

    this.setAngle(this.angle);
  }

  /** Where every collision sphere is, in the frame of the whole tool, at the present blade angle. */
  _poseSamples() {
    const out = this.samples, half = this.angle / 2, c = Math.cos(half), sn = Math.sin(half);
    let k = 0;
    for (const side of [1, -1]) {
      for (const [x, y, z, r] of this.leverSamples) {
        // upper half: lifted by half the steel's thickness and turned by +half; lower: the same forging turned over, turned by -half
        const ly = side * (y + HALF_THICK), lz = side * z;
        out[k++] = x * c + lz * sn * side; out[k++] = ly; out[k++] = -x * sn * side + lz * c; out[k++] = r;
      }
    }
    for (const [x, y, z, r] of this.pivotSamples) { out[k++] = x; out[k++] = y; out[k++] = z; out[k++] = r; }
    return out;
  }

  /**
   * Move the tool (group.matrix) out of anything solid it has ended up in.
   * `eye` is where the elf's eyes are. Returns how far the tool had to be moved.
   */
  _clear(world, eye) {
    const m = this.group.matrix, e = m.elements, S = this._poseSamples(), g = this._g;
    // the mammoth only needs asking about when it is within reach of the tool
    const bodyNear = world.near(e[12], e[13], e[14]) < 0.34;
    let wx = 0, wy = 0, wz = 0, snow = false;
    // the deepest any part of the tool is inside anything (0 if none is)
    const deepest = () => {
      let worst = 1e-5;
      for (let k = 0; k < S.length; k += 4) {
        const x = e[0] * S[k] + e[4] * S[k + 1] + e[8] * S[k + 2] + e[12];
        const y = e[1] * S[k] + e[5] * S[k + 1] + e[9] * S[k + 2] + e[13];
        const z = e[2] * S[k] + e[6] * S[k + 1] + e[10] * S[k + 2] + e[14];
        const r = S[k + 3];
        if (bodyNear) {
          const pb = r + 0.0012 - world.body(x, y, z);
          if (pb > worst) { worst = pb; wx = x; wy = y; wz = z; snow = false; }
        }
        if (y - r < 0.16) {
          const pg = r + 0.001 - (y - world.ground(x, z));
          if (pg > worst) { worst = pg; wx = x; wy = y; wz = z; snow = true; }
        }
      }
      return worst > 1e-5 ? worst : 0;
    };
    let moved = 0, worst = deepest();
    // push the deepest part straight out, and look again
    for (let it = 0; it < 20 && worst > 0; it++) {
      if (snow) { e[13] += worst; } else {
        world.normal(wx, wy, wz, g);
        e[12] += g[0] * worst * 1.02; e[13] += g[1] * worst * 1.02; e[14] += g[2] * worst * 1.02;
      }
      moved += worst;
      worst = deepest();
    }
    // caught in a hollow where that does not settle (the curl of the trunk): draw the hands back towards the eyes
    if (worst > 0.0008 && eye) {
      let dx = eye.x - e[12], dy = eye.y - e[13], dz = eye.z - e[14];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      for (let it = 0; it < 14 && worst > 0; it++) {
        const step = Math.max(worst, 0.006);
        e[12] += dx * step; e[13] += dy * step; e[14] += dz * step;
        moved += step;
        worst = deepest();
      }
    }
    return moved;
  }

  setAngle(angle) {
    this.angle = angle;
    this.upper.rotation.y = angle / 2;      // its tip swings one way...
    this.lower.rotation.y = -angle / 2;     // ...and the other blade's the other
  }

  /** Squeeze the handles together (true) or let them open (false). */
  squeeze(on) { this.squeezing = on; }

  /**
   * Advance the snip. Returns the events of this step, in order:
   * 'start' (a stroke begins), 'shut' (the blades have met), 'opening', 'open'.
   */
  step(dt, drag = 0) {
    const ev = this.events; ev.length = 0;
    this.time += dt;
    this.timer += dt;
    if (this.phase === 'open') {
      if (this.squeezing && this.timer > 0.045) { this.phase = 'closing'; this.timer = 0; this.speed = 2.5; ev.push('start'); }
    } else if (this.phase === 'closing') {
      // the handles accelerate together; thick hair slows them a little
      this.speed = Math.min(11, this.speed + 95 * dt);
      const a = this.angle - (this.speed * dt) / (1 + drag);
      if (a <= 0) { this.setAngle(0); this.phase = 'shut'; this.timer = 0; this.kick = 1; ev.push('shut'); } else this.setAngle(a);
    } else if (this.phase === 'shut') {
      if (this.timer > (this.squeezing ? 0.1 : 0.04)) { this.phase = 'opening'; this.timer = 0; ev.push('opening'); }
    } else if (this.phase === 'opening') {
      // ease out to the open angle
      const k = Math.min(1, this.timer / 0.17);
      this.setAngle(OPEN_ANGLE * (1 - (1 - k) * (1 - k)));
      if (k >= 1) { this.phase = 'open'; this.timer = 0; ev.push('open'); }
    }
    this.kick = Math.max(0, this.kick - dt * 7);
    return ev;
  }

  /**
   * Hold the shears in front of the camera. `feel` describes the walk and the
   * turn of the head; `world` gives what the blades may not pass through.
   */
  place(dt, camera, feel, world) {
    // the hands lag a little behind the eyes when turning, and bob with each step
    const tx = THREE.MathUtils.clamp(-feel.yawRate * 0.0075, -0.03, 0.03), ty = THREE.MathUtils.clamp(feel.pitchRate * 0.0075, -0.025, 0.025);
    const k = Math.min(1, dt * 9);
    this.sway.x += (tx - this.sway.x) * k; this.sway.y += (ty - this.sway.y) * k;
    const walk = feel.moving ? 1 : 0;
    this.walk = (this.walk || 0) + (walk - (this.walk || 0)) * Math.min(1, dt * 6);
    const bobX = Math.sin(feel.bob * 0.5) * 0.0045 * this.walk, bobY = -Math.abs(Math.sin(feel.bob * 0.5)) * 0.0035 * this.walk;
    const breath = Math.sin(this.time * 1.15) * 0.0011;

    // ---- held free, in front of the eyes ------------------------------------------
    {
      const tilt = (19 * Math.PI) / 180 - this.sway.y * 1.6 + this.kick * 0.012;
      const yaw = -this.sway.x * 1.8;
      // the shears point away from the eye and a little upwards, blades opening left and right
      const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
      this._local.set(sy * ct, -sy * st, cy, this.sway.x + bobX,       // columns: forward, up, right
        st, ct, 0, -0.074 + this.sway.y + bobY + breath,
        -cy * ct, cy * st, sy, -0.19 - this.kick * 0.004,
        0, 0, 0, 1);
      this._local.decompose(this._freeP, this._freeQ, this._scale);
    }

    // ---- laid flat against the hide --------------------------------------------------
    // Pressed into the coat, the shears are turned to lie along the skin, as a
    // shearer holds them: blades in the plane of the hide, tips a few
    // millimetres off it, pointing up the limb.
    let flat = 0;
    const hit = world && world.hide ? world.hide(camera, this._hit) : null;
    if (hit) {
      flat = 1 - THREE.MathUtils.smoothstep(hit.t, 0.3, 0.37);
      const e = camera.matrixWorld.elements, g = this._g;
      const N = this._n.set(hit.nx, hit.ny, hit.nz);
      // which way along the skin: where the eyes are looking, with a strong lean towards "up"
      const f = this._f.set(-e[8] + 1.7 * e[4], -e[9] + 1.7 * e[5], -e[10] + 1.7 * e[6]);
      f.addScaledVector(N, -f.dot(N));
      if (f.lengthSq() < 0.02) f.copy(this._lastF).addScaledVector(N, -this._lastF.dot(N));
      if (f.lengthSq() < 1e-6) f.set(0, 1, 0).addScaledVector(N, -N.y);
      f.normalize();
      this._lastF.copy(f);
      // the tips ride 7 mm off the skin where the eyes are looking...
      const tip = this._s.set(hit.x, hit.y, hit.z).addScaledVector(N, 0.007 - hit.off);
      // ...and the pivot 13 mm off it, a blade's length back down the limb, so the blades follow the curve of the hide
      const piv = this._piv.copy(tip).addScaledVector(f, -(BLADE - 0.004));
      for (let it = 0; it < 2; it++) {
        world.normal(piv.x, piv.y, piv.z, g);
        const d0 = world.body(piv.x, piv.y, piv.z);
        piv.x += g[0] * (0.013 - d0); piv.y += g[1] * (0.013 - d0); piv.z += g[2] * (0.013 - d0);
      }
      f.copy(tip).sub(piv).normalize();
      const n = this._u.set(N.x + g[0], N.y + g[1], N.z + g[2]);
      n.addScaledVector(f, -n.dot(f)).normalize();
      this.group.matrix.makeBasis(f, n, this._p.crossVectors(f, n)).setPosition(piv);
      // into the camera's frame, to blend with the free pose
      this._m.copy(camera.matrixWorld).invert().multiply(this.group.matrix).decompose(this._flatP, this._flatQ, this._scale);
    }
    this.flat += (flat - this.flat) * Math.min(1, dt * 10);
    const wgt = hit ? this.flat : 0;
    if (!hit) this.flat = Math.max(0, this.flat - dt * 10);

    // ---- blend, and let the hands follow a little behind ----------------------------
    const P = this._tp.copy(this._freeP), Q = this._tq.copy(this._freeQ);
    if (hit && wgt > 0) { P.lerp(this._flatP, wgt); Q.slerp(this._flatQ, wgt); }
    const follow = this.poseReady ? Math.min(1, dt * 16) : 1;
    this.poseP.lerp(P, follow); this.poseQ.slerp(Q, follow);
    this.poseReady = true;
    this._local.compose(this.poseP, this.poseQ, this._one);
    this.group.matrix.multiplyMatrices(camera.matrixWorld, this._local);
    // Whatever the hands meant to do, steel does not pass through hide, horn
    // or packed snow: every part of the tool is moved clear, and the hands
    // remember where they ended up.
    if (world && this._clear(world, this._p.setFromMatrixPosition(camera.matrixWorld)) > 0) {
      this._m.copy(camera.matrixWorld).invert().multiply(this.group.matrix).decompose(this.poseP, this._tq, this._scale);
    }
    this.group.matrixWorld.copy(this.group.matrix);
    this.group.updateMatrixWorld(true);
    /** 0 = held free, 1 = lying flat on the hide */
    this.lying = wgt;
  }

  /** The flat wedge between the blades, in the world: what a stroke from here would cut. */
  region(out = {}) {
    const e = this.group.matrixWorld.elements;
    out.pivot = (out.pivot || new THREE.Vector3()).set(e[12], e[13], e[14]);
    out.forward = (out.forward || new THREE.Vector3()).set(e[0], e[1], e[2]).normalize();
    out.normal = (out.normal || new THREE.Vector3()).set(e[4], e[5], e[6]).normalize();
    out.side = (out.side || new THREE.Vector3()).set(e[8], e[9], e[10]).normalize();
    out.radius = BLADE - 0.003;
    out.inner = 0.016;
    out.halfAngle = this.angle / 2;
    // lying on the hide, the stroke takes everything between the blades and the skin
    out.below = this.lying > 0.5 ? 0.03 : 0;
    // each blade: along it from the pivot, and across it towards its cutting edge
    const h = this.angle / 2, c = Math.cos(h), sn = Math.sin(h);
    out.blades = out.blades || [{ a: new THREE.Vector3(), c: new THREE.Vector3() }, { a: new THREE.Vector3(), c: new THREE.Vector3() }];
    out.blades[0].a.copy(out.forward).multiplyScalar(c).addScaledVector(out.side, -sn);
    out.blades[0].c.copy(out.forward).multiplyScalar(sn).addScaledVector(out.side, c);
    out.blades[1].a.copy(out.forward).multiplyScalar(c).addScaledVector(out.side, sn);
    out.blades[1].c.copy(out.forward).multiplyScalar(sn).addScaledVector(out.side, -c);
    return out;
  }
}
