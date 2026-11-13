// Small bad scissors: the pair from the back of a kitchen drawer. Blunt,
// spotted with rust, one point snapped off, faded plastic handles, and a rivet
// so loose that the blades rattle and never quite meet. 7.5 cm over all, with
// blades of 3.4 cm.
//
// They cut like it. Hair folds between the blades as often as it parts, what
// does part is chewed off at uneven lengths, and now and then they stick
// half way through a stroke.
import * as THREE from 'three';
import { Kit, loft, steelTextures, canvasTexture, rngFrom, smoothstep, lerp } from '../tool.js';

const TIPS = [0.034, 0.0322];                // pivot to tip of each blade: the second has lost its point
const HALF_THICK = 0.00065;
const OPEN = (38 * Math.PI) / 180;
const CRANK = (24 * Math.PI) / 180;          // how far each shank is bent outwards behind the pivot
const SHANK = 0.014;
const RINGS = [[0.0105, 0.0082], [0.0128, 0.0088]];   // thumb ring, finger ring: half-length and half-width
const TUBE = 0.0026;

/** Centre line of a half at distance u from the pivot (negative = along the shank). */
function centreline(u) {
  if (u >= 0) return { x: u, z: 0, a: 0 };
  let x = 0, z = 0, a = 0;
  const steps = 16, du = -u / steps;
  for (let i = 0; i < steps; i++) {
    a = CRANK * smoothstep(0, 0.006, (i + 0.5) * du);
    x -= Math.cos(a) * du; z += Math.sin(a) * du;
  }
  return { x, z, a: CRANK * smoothstep(0, 0.006, -u) };
}

/** Cross-section of a half at u; `which` picks the blade (0 whole, 1 with its point snapped off). */
function section(u, which) {
  const tip = TIPS[which];
  const boss = Math.sqrt(Math.max(0, 0.005 * 0.005 - u * u));
  let back, edge;
  if (u >= 0) {
    const s = u / tip;
    back = 0.0058 * (1 - 0.55 * Math.pow(Math.min(s, 0.86), 1.3));
    edge = 0.0016;
    if (s > 0.86) {
      const t = (s - 0.86) / 0.14;
      // a blunt, rounded nose; the broken blade simply stops
      const r = which === 0 ? Math.sqrt(Math.max(0, 1 - t * t)) : 1 - 0.3 * t;
      const mid = (edge - back) / 2, hw = ((edge + back) / 2) * r;
      back = hw - mid; edge = mid + hw;
    }
  } else {
    const k = smoothstep(-0.01, 0, u);
    back = lerp(0.0026, 0.0058, k);
    edge = lerp(0.0026, 0.0016, k);
  }
  back = Math.max(back, boss); edge = Math.max(edge, boss);
  const b = smoothstep(0.0055, 0.011, u);
  const bw = Math.min(0.0016, (back + edge) * 0.3) * b;
  const h = HALF_THICK;
  return {
    bevel: b,
    pts: [
      [-back, h],
      [edge - bw - 0.0001, h],
      [edge, h - (2 * h - 0.0005) * b - 0.0001],   // an edge long since gone dull
      [edge, -h],
      [-back, -h],
    ],
  };
}

const stations = (tip) => [-SHANK, -0.011, -0.008, -0.006, -0.004, -0.002, 0, 0.002, 0.004, 0.0052, 0.007, 0.01, 0.014, 0.018, 0.022, 0.026,
  tip * 0.86, tip * 0.9, tip * 0.94, tip * 0.97, tip * 0.99, tip];

/** Moulded plastic gone chalky in the sun: teal, scuffed pale, with dirt in the scratches. */
function plasticTexture() {
  const rnd = rngFrom(905);
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#2d6f83'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 30;
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      c.addColorStop(0, rnd() < 0.6 ? `rgba(150,196,204,${0.1 + rnd() * 0.2})` : `rgba(16,44,54,${0.12 + rnd() * 0.2})`);
      c.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 120; i++) {
      const x = rnd() * w, y = rnd() * h, l = 3 + rnd() * 22, a = rnd() * Math.PI;
      g.strokeStyle = rnd() < 0.6 ? `rgba(196,222,226,${0.15 + rnd() * 0.3})` : `rgba(30,24,18,${0.15 + rnd() * 0.3})`;
      g.lineWidth = 0.4 + rnd() * 1.1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }, true);
}

class Oval extends THREE.Curve {
  constructor(centre, along, across, a, b) { super(); Object.assign(this, { centre, along, across, a, b }); }
  getPoint(t, target = new THREE.Vector3()) {
    const th = t * Math.PI * 2, ca = Math.cos(th) * this.a, sb = Math.sin(th) * this.b;
    return target.set(this.centre.x + this.along.x * ca + this.across.x * sb, 0, this.centre.z + this.along.z * ca + this.across.z * sb);
  }
}

export function buildSmallScissors() {
  const kit = new Kit('small-scissors', 0.03);
  const tex = steelTextures({ seed: 77, tone: '#84878b', rust: 0.8 });
  const steel = kit.patch(new THREE.MeshPhysicalMaterial({ map: tex.body, metalness: 0.76, roughness: 0.62, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.12, envMapIntensity: 0.7 }));
  const dull = kit.patch(new THREE.MeshPhysicalMaterial({ map: tex.body, color: 0xc6c9cc, metalness: 0.9, roughness: 0.46, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.08, envMapIntensity: 0.9 }));
  const plastic = kit.patch(new THREE.MeshPhysicalMaterial({ map: plasticTexture(), metalness: 0, roughness: 0.56, clearcoat: 0.18, clearcoatRoughness: 0.55 }));

  const end = centreline(-SHANK);
  const back = new THREE.Vector3(-Math.cos(CRANK), 0, Math.sin(CRANK));    // the way a shank points, away from the pivot
  const out = new THREE.Vector3(Math.sin(CRANK), 0, Math.cos(CRANK));      // and square to that, away from the middle
  const shankEnd = new THREE.Vector3(end.x, 0, end.z);
  const ringCentre = (which) => shankEnd.clone().addScaledVector(back, RINGS[which][0] + 0.0035).addScaledVector(out, 0.0022);

  const [upper, lower] = kit.halves((which) => {
    const half = new THREE.Group();
    const st = stations(TIPS[which]), sec = (u) => section(u, which);
    kit.add(half, loft(st, centreline, sec, (A, B, k) => k !== 1 || (A.bevel < 0.5 && B.bevel < 0.5), true, [30, 110]), steel, 'scissors-blade');
    kit.add(half, loft(st, centreline, sec, (A, B, k) => k === 1 && (A.bevel >= 0.5 || B.bevel >= 0.5), false, [30, 110]), dull, 'scissors-edge');
    // the handle: a ring moulded on to the end of the shank
    const [a, b] = RINGS[which];
    const centre = ringCentre(which);
    kit.add(half, new THREE.TubeGeometry(new Oval(centre, back, out, a, b), 48, TUBE, 10, true), plastic, 'scissors-ring');
    const from = centreline(-0.0045), near = centre.clone().addScaledVector(back, -a);
    const p0 = new THREE.Vector3(from.x, 0, from.z);
    const neck = kit.add(half, new THREE.CylinderGeometry(0.0034, 0.0029, p0.distanceTo(near), 12), plastic, 'scissors-neck');
    neck.position.copy(p0).add(near).multiplyScalar(0.5);
    neck.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), near.clone().sub(p0).normalize());
    neck.scale.z = 0.8;
    return half;
  }, HALF_THICK);

  // the rivet: a small domed head above, peened flat below
  const head = kit.add(kit.group, new THREE.SphereGeometry(0.0024, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel, 'scissors-rivet');
  head.scale.y = 0.55; head.position.y = 2 * HALF_THICK + 0.0003;
  kit.add(kit.group, new THREE.CylinderGeometry(0.0021, 0.0021, 0.0007, 12), steel, 'scissors-rivet').position.y = -2 * HALF_THICK - 0.0005;

  // what may not pass through things (the larger ring stands for both)
  const leverSamples = [];
  for (const u of [0.004, 0.011, 0.018, 0.025, 0.031]) {
    const s = section(u, 0);
    leverSamples.push([u, 0, s.pts[3][0] - 0.0006, 0.0013], [u, 0, s.pts[0][0] + 0.0006, 0.0013]);
  }
  leverSamples.push([0.0333, 0, 0.0006, 0.0012]);
  const sh = centreline(-0.008);
  leverSamples.push([sh.x, 0, sh.z, 0.003]);
  const centre = ringCentre(1), [ra, rb] = RINGS[1];
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * Math.PI * 2;
    leverSamples.push([centre.x + back.x * ra * Math.cos(th) + out.x * rb * Math.sin(th), 0, centre.z + back.z * ra * Math.cos(th) + out.z * rb * Math.sin(th), 0.0034]);
  }

  return {
    id: 'scissors',
    name: 'Small bad scissors',
    blurb: 'Blunt and loose. They miss half of what they bite.',
    seed: 5,
    kit,
    halfThick: HALF_THICK,
    open: OPEN,
    tip: TIPS[0],
    blade: { from: 0.002, to: TIPS[0], back0: 0.0058, back1: 0.0026, exp: 1.3, edge: 0.0035 },
    part: { above: 0.02, below: 0.012 },
    pivotClear: 0.006,
    cutInner: 0.006,
    leverSamples,
    fixedSamples: [[0, 0.0018, 0, 0.003], [0, -0.0016, 0, 0.0028]],
    // held in the right hand, thumb uppermost: off to the right, turned in towards the middle
    hold: { pos: [0.034, -0.06, -0.115], tilt: (20 * Math.PI) / 180, yaw: (-14 * Math.PI) / 180, roll: (22 * Math.PI) / 180, sway: 0.6 },
    lie: { tip: 0.004, pivot: 0.007 },
    reach: 0.115,
    // stiff to close, slow to open, and three strokes in ten they stick part way
    stroke: { delay: 0.05, speed0: 1.6, accel: 55, max: 6.5, shut: 0.05, shutHeld: 0.09, open: 0.2, kick: 0.25, catch: { chance: 0.3, time: 0.11 } },
    // little more than half of what lies between the blades is cut; the rest folds over and slips out, and what is cut is cut ragged
    cut: { below: 0.018, min: 0.008, chance: 0.55, ragged: 0.012 },
    voice: 'scissors',
    // the loose rivet: the blades never lie true, and they shiver after every stroke and with every step
    animate: (tool) => {
      const t = tool.sinceShut, rattle = Math.exp(-13 * t), walking = tool.walk || 0;
      upper.rotation.z = 0.022 + 0.03 * rattle * Math.sin(75 * t) + 0.006 * walking * Math.sin(tool.time * 23);
      lower.rotation.x = 0.03 * rattle * Math.sin(58 * t + 1) + 0.008 * walking * Math.sin(tool.time * 19 + 2);
    },
  };
}
