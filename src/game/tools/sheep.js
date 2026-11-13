// Shears: blade shears, the tool sheep were shorn with for centuries, and the
// right one for this job. A single strip of spring steel: two broad
// triangular blades, a grip behind each, and a bow at the back that throws
// them open again the moment the hand lets go. 17 cm from bow to tips.
//
// There is no pivot pin. The halves turn about the bow, and the blades slide
// over each other as the grips are squeezed together.
import * as THREE from 'three';
import { Kit, loft, steelTextures, canvasTexture, rngFrom, smoothstep, lerp } from '../tool.js';

const TIP = 0.17;                            // bow to tip, metres
const HEEL = 0.075;                          // where the blade proper begins
const SHOULDER = 0.061;                      // where the steel leaves the grip
const HALF_THICK = 0.0011;
const OPEN = (24 * Math.PI) / 180;
const GRIP = -0.0186;                        // the grips run down the outer side, in line with the backs of the blades
const GRIP_END = [0.024, -0.0180];           // rear end of a grip, in its half's frame: [along, across]
const BOW_DEPTH = 0.026;

/**
 * Cross-section of a blade at u: five corners, as [across, up] pairs (across > 0
 * is towards the cutting edge). The cutting edge runs straight out from the
 * bow; the back starts in line with the grip and slants in to meet it at the
 * point, so that with the shears open the two backs lie parallel and the two
 * edges make the V.
 */
function section(u) {
  const s = Math.min(1, Math.max(0, (u - HEEL) / (TIP - HEEL)));
  const k = smoothstep(SHOULDER, HEEL, u);                 // 0 at the grip, 1 where the blade proper begins
  const edge = lerp(GRIP + 0.0034, 0.002, k);              // the inner edge steps in from the grip to the cutting line
  const back = lerp(-GRIP + 0.0032, 0.0215 * Math.pow(1 - s, 0.95) - 0.0012 * s, k);
  const h = lerp(HALF_THICK, 0.0006, s);                   // thinner towards the point
  const b = smoothstep(HEEL, HEEL + 0.006, u);             // the bevel is ground from the heel forwards
  const bw = Math.min(0.0045, (back + edge) * 0.4) * b;
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

const STATIONS = [SHOULDER, 0.064, 0.067, 0.07, 0.073, HEEL, 0.078, 0.081, 0.088, 0.098, 0.108, 0.118, 0.128, 0.138, 0.148, 0.156, 0.162, 0.166, 0.1692, TIP];
const straight = (u) => ({ x: u, z: 0, a: 0 });

/** Old paint: oxblood red, chipped back to the steel along the edges and wherever a hand has worn it. */
function paintTexture() {
  const rnd = rngFrom(4401);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#6e1d18'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = rnd() * w, y = rnd() * h, r = 12 + rnd() * 46;
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      c.addColorStop(0, rnd() < 0.5 ? `rgba(150,48,36,${0.12 + rnd() * 0.2})` : `rgba(34,9,8,${0.15 + rnd() * 0.25})`);
      c.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // chips and scratches down to grey steel
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w, y = rnd() * h, l = 3 + rnd() * 26, a = rnd() * Math.PI;
      g.strokeStyle = `rgba(${120 + rnd() * 40},${122 + rnd() * 40},${128 + rnd() * 40},${0.35 + rnd() * 0.5})`;
      g.lineWidth = 0.6 + rnd() * 2.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.3); g.stroke();
    }
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 5;
      g.fillStyle = `rgba(${110 + rnd() * 50},${112 + rnd() * 50},${118 + rnd() * 50},${0.4 + rnd() * 0.5})`;
      g.beginPath(); g.ellipse(x, y, r, r * (0.4 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    // grime in the hollows
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = `rgba(20,10,8,${rnd() * 0.18})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 3);
    }
  }, true);
}

export function buildSheepShears() {
  const kit = new Kit('shears', 0.05);
  const tex = steelTextures({ seed: 31, tone: '#6c7177', rust: 0.2 });   // old carbon steel, gone dark; only the ground edges are bright
  const steel = kit.patch(new THREE.MeshPhysicalMaterial({ map: tex.body, metalness: 0.7, roughness: 0.5, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.06, envMapIntensity: 0.85 }));
  const ground = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0xf0f2f4, metalness: 1, roughness: 0.2, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.03, envMapIntensity: 1.4 }));
  const paint = kit.patch(new THREE.MeshPhysicalMaterial({ map: paintTexture(), metalness: 0.15, roughness: 0.5, roughnessMap: tex.rough, clearcoat: 0.25, clearcoatRoughness: 0.45 }));

  // blades: the plain faces, and the bright bevel ground along each cutting edge
  const bladeGeo = loft(STATIONS, straight, section, (A, B, k) => k !== 1 || (A.bevel < 0.5 && B.bevel < 0.5), true, [7, 30]);
  const bevelGeo = loft(STATIONS, straight, section, (A, B, k) => k === 1 && (A.bevel >= 0.5 || B.bevel >= 0.5), false, [7, 30]);
  // grips: the strip formed into a bar that fills the palm, set out to the side of its blade
  const gripPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0695, 0, GRIP + 0.0002), new THREE.Vector3(0.06, 0, GRIP - 0.0002), new THREE.Vector3(0.046, 0, GRIP - 0.0003),
    new THREE.Vector3(0.034, 0, GRIP), new THREE.Vector3(GRIP_END[0], 0, GRIP_END[1]),
  ]);
  const gripGeo = new THREE.TubeGeometry(gripPath, 18, 0.0033, 12, false);
  const capGeo = new THREE.SphereGeometry(0.0033, 12, 8);

  kit.halves(() => {
    const half = new THREE.Group();
    kit.add(half, bladeGeo, steel, 'shears-blade');
    kit.add(half, bevelGeo, ground, 'shears-edge');
    const grip = kit.add(half, gripGeo, paint, 'shears-grip');
    grip.scale.y = 1.9;                       // taller than it is wide: a strap on edge
    const cap = kit.add(half, capGeo, paint, 'shears-grip-end');
    cap.position.set(0.0695, 0, GRIP + 0.0002); cap.scale.set(1.3, 1.9, 1);
    return half;
  }, HALF_THICK);

  // the bow: a U of the same strap, joining the two grips behind the hand
  const h0 = OPEN / 2;
  const endX = (h) => GRIP_END[0] * Math.cos(h) + GRIP_END[1] * Math.sin(h);     // where a grip ends, in the tool's frame
  const endZ = (h) => GRIP_END[0] * Math.sin(h) - GRIP_END[1] * Math.cos(h);
  const z0 = endZ(h0);
  const bowPts = [];
  for (let i = 0; i <= 24; i++) {
    const phi = (i / 24) * Math.PI;
    bowPts.push(new THREE.Vector3(-BOW_DEPTH * Math.sin(phi), 0, -z0 * Math.cos(phi)));
  }
  const bow = kit.add(kit.group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bowPts), 40, 0.0017, 10, false), paint, 'shears-bow');
  const setBow = (angle) => {
    const h = angle / 2;
    bow.position.x = endX(h);
    bow.scale.set(1, 4.1, endZ(h) / z0);      // a strap on edge; squeezed narrower as the grips come together
  };
  setBow(OPEN);

  // what may not pass through things
  const leverSamples = [];
  for (const u of [0.08, 0.094, 0.108, 0.122, 0.136, 0.15, 0.162, 0.1692]) {
    const sec = section(u);
    const bk = -sec.pts[0][0], edge = sec.pts[3][0];
    leverSamples.push([u, 0, edge - 0.001, 0.0022], [u, 0, -bk + 0.001, 0.0022]);
    if (bk + edge > 0.012) leverSamples.push([u, 0, (edge - bk) / 2, 0.0022]);
  }
  for (const [u, z] of [[0.066, GRIP], [0.052, GRIP - 0.0003], [0.038, GRIP - 0.0002], [0.026, GRIP_END[1]]]) leverSamples.push([u, 0, z, 0.0068]);
  const fixedSamples = [];
  for (const deg of [25, 55, 90, 125, 155]) {
    const phi = (deg * Math.PI) / 180;
    fixedSamples.push([endX(h0) - BOW_DEPTH * Math.sin(phi), 0, -z0 * Math.cos(phi), 0.0074]);
  }

  return {
    id: 'sheep',
    name: 'Shears',
    blurb: 'Sprung steel made for the job: quick, and close to the skin.',
    seed: 23,
    kit,
    halfThick: HALF_THICK,
    open: OPEN,
    tip: TIP,
    blade: { from: HEEL - 0.002, to: TIP, back0: 0.0215, back1: 0, exp: 1, edge: 0.006 },
    part: { above: 0.045, below: 0.03 },
    pivotClear: 0,
    cutInner: HEEL + 0.004,
    leverSamples,
    fixedSamples,
    // held in the right hand: a little to the right, turned in and rolled as a hand turns it
    hold: { pos: [0.016, -0.088, -0.074], tilt: (16 * Math.PI) / 180, yaw: (-4 * Math.PI) / 180, roll: (10 * Math.PI) / 180, sway: 1 },
    lie: { tip: 0.005, pivot: 0.016 },
    reach: 0.19,
    // the squeeze is quick, and the bow flings the blades open again, quivering for a moment
    stroke: { delay: 0.03, speed0: 3.5, accel: 130, max: 12, shut: 0.03, shutHeld: 0.06, open: 0.085, kick: 0.5, bounce: { amount: 0.07, decay: 16, rate: 52 } },
    cut: { below: 0.03, min: 0.004, chance: 1, ragged: 0 },
    voice: 'sheep',
    onAngle: setBow,
  };
}
