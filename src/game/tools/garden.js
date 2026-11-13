// Garden clippers: hedge shears, held in both hands. Large for an elf: blades
// 13.5 cm from pivot to tip, 27 cm over all.
//
// The two halves are identical forgings, one turned over on the other, as on
// the real thing: a blade ground to a bevel on one side and flat on the other,
// a round boss at the pivot, a tang cranked outwards, a brass ferrule and a
// turned wooden handle. A bolt and nut hold them together.
import * as THREE from 'three';
import { Kit, loft, lathe, steelTextures, woodTexture, smoothstep, lerp } from '../tool.js';

const BLADE = 0.135;                         // pivot to tip, metres
const HALF_THICK = 0.0017;                   // half the thickness of the steel
const CRANK = (17 * Math.PI) / 180;          // how far each tang is bent outwards
const TANG = 0.046;                          // length of tang behind the pivot
const OPEN = (40 * Math.PI) / 180;           // angle between the blades at rest

/** Centre line of a half at distance u from the pivot (negative = along the tang). */
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

export function buildGardenClippers() {
  const kit = new Kit('garden-clippers', 0.055);
  const tex = steelTextures({ seed: 20240, tone: '#82878e', rust: 0.3 });
  const forged = kit.patch(new THREE.MeshPhysicalMaterial({ map: tex.body, metalness: 0.72, roughness: 0.52, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.06, envMapIntensity: 0.85 }));
  const ground = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0xeef0f2, metalness: 1, roughness: 0.26, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.03, envMapIntensity: 1.3 }));
  const brass = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0xb48a3c, metalness: 1, roughness: 0.36, roughnessMap: tex.rough }));
  const zinc = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0x9a9da3, metalness: 1, roughness: 0.42, roughnessMap: tex.rough }));
  const wood = kit.patch(new THREE.MeshPhysicalMaterial({ map: woodTexture(), metalness: 0, roughness: 0.62, clearcoat: 0.22, clearcoatRoughness: 0.4 }));

  // steel: the forged faces, and the bright bevel ground along the cutting edge
  const steelGeo = loft(STATIONS, centreline, section, (A, B, k) => k !== 1 || (A.bevel < 0.5 && B.bevel < 0.5), true);
  const bevelGeo = loft(STATIONS, centreline, section, (A, B, k) => k === 1 && (A.bevel >= 0.5 || B.bevel >= 0.5), false);
  // ferrule and handle, turned on a lathe along +y and then laid along the tang
  const ferruleGeo = lathe([[0, -0.0006], [0.0096, 0], [0.0103, 0.001], [0.0103, 0.0034], [0.0097, 0.0044], [0.0097, 0.012], [0.0103, 0.013], [0.0103, 0.0152], [0.0094, 0.0164], [0, 0.0166]]);
  const woodGeo = lathe([[0, 0], [0.0086, 0], [0.0092, 0.004], [0.0100, 0.014], [0.0110, 0.03], [0.0112, 0.04], [0.0105, 0.055], [0.0100, 0.064], [0.0106, 0.074], [0.0099, 0.0795], [0.0072, 0.0822], [0, 0.083]], 26);

  const end = centreline(-TANG);
  const back = new THREE.Vector3(-Math.cos(CRANK), 0, Math.sin(CRANK));   // the way the tang points, away from the pivot
  const lay = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), back);
  const tangEnd = new THREE.Vector3(end.x, 0, end.z);

  kit.halves(() => {
    const half = new THREE.Group();
    kit.add(half, steelGeo, forged, 'clippers-steel');
    kit.add(half, bevelGeo, ground, 'clippers-edge');
    const ferrule = kit.add(half, ferruleGeo, brass, 'clippers-ferrule');
    ferrule.quaternion.copy(lay);
    ferrule.position.copy(tangEnd).addScaledVector(back, -0.008);
    const handle = kit.add(half, woodGeo, wood, 'clippers-handle');
    handle.quaternion.copy(lay);
    handle.position.copy(tangEnd).addScaledVector(back, 0.0065);
    return half;
  }, HALF_THICK);

  // pivot: domed bolt head and washer above, washer, nut and the end of the thread below
  const top = 2 * HALF_THICK;
  const washer = new THREE.CylinderGeometry(0.0084, 0.0084, 0.0008, 24);
  kit.add(kit.group, washer, zinc, 'clippers-washer').position.y = top + 0.0004;
  const head = kit.add(kit.group, new THREE.SphereGeometry(0.0066, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), zinc, 'clippers-bolt');
  head.scale.y = 0.5; head.position.y = top + 0.0008;
  kit.add(kit.group, washer, zinc, 'clippers-washer').position.y = -top - 0.0004;
  const nut = kit.add(kit.group, new THREE.CylinderGeometry(0.0073, 0.0073, 0.0048, 6), zinc, 'clippers-nut');
  nut.position.y = -top - 0.0008 - 0.0024; nut.rotation.y = 0.3;
  kit.add(kit.group, new THREE.CylinderGeometry(0.0031, 0.0031, 0.0022, 12), zinc, 'clippers-thread').position.y = -top - 0.0008 - 0.0048 - 0.0011;

  // what may not pass through things: small spheres along every part of a half
  const leverSamples = [];
  for (const u of [0.02, 0.045, 0.07, 0.095, 0.115, 0.128, BLADE - 0.001]) {
    const sec = section(u);
    const bk = -sec.pts[0][0], edge = sec.pts[3][0];
    leverSamples.push([u, 0, edge - 0.0012, 0.0026], [u, 0, -bk + 0.0012, 0.0026]);
    if (bk + edge > 0.012) leverSamples.push([u, 0, (edge - bk) / 2, 0.0026]);
  }
  for (const u of [-0.012, -0.026, -0.04]) { const c = centreline(u); leverSamples.push([c.x, 0, c.z, 0.0062]); }
  const at = (d) => [tangEnd.x + back.x * d, 0, tangEnd.z + back.z * d];
  leverSamples.push([...at(0.0003), 0.0112]);                                              // ferrule
  for (const [d, r] of [[0.019, 0.0115], [0.042, 0.0132], [0.065, 0.0122], [0.083, 0.0116]]) leverSamples.push([...at(0.0065 + d), r]);   // handle

  return {
    id: 'garden',
    name: 'Garden clippers',
    blurb: 'Two hands and the biggest bite.',
    seed: 11,
    kit,
    halfThick: HALF_THICK,
    open: OPEN,
    tip: BLADE,
    // each blade as the hair meets it: where it runs along the half, how wide its back is at each end
    // and how that narrows, and how far past the cutting edge hair is pushed
    blade: { from: 0, to: BLADE, back0: 0.0195, back1: 0.00975, exp: 1.5, edge: 0.007 },
    part: { above: 0.05, below: 0.03 },      // how far above and below the blades hair is parted
    pivotClear: 0.016,                       // nothing lies across the pivot
    cutInner: 0.016,                         // nearest the pivot that the blades cut
    leverSamples,
    fixedSamples: [[0, 0.0022, 0, 0.0076], [0, -0.0056, 0, 0.0078]],   // bolt head above, nut and thread below
    // held free, in the eyes' frame: where the pivot is, and how the blades point
    hold: { pos: [0, -0.074, -0.19], tilt: (19 * Math.PI) / 180, yaw: 0, roll: 0, sway: 1 },
    lie: { tip: 0.007, pivot: 0.013 },       // lying on the hide: how far off it the tips and the pivot ride
    reach: 0.25,                             // how near the eyes may come to the hide
    stroke: { delay: 0.045, speed0: 2.5, accel: 95, max: 11, shut: 0.04, shutHeld: 0.1, open: 0.17, kick: 1 },
    // what a stroke does: how deep under blades lying on the hide it reaches, the stubble it leaves,
    // the share of the locks between the blades that it really cuts, and how unevenly
    cut: { below: 0.03, min: 0.006, chance: 1, ragged: 0 },
    voice: 'garden',
  };
}
