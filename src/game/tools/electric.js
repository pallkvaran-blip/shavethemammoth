// Electric shears: a cordless shearing handpiece, the machine that took over
// from blade shears. A comb of thirteen long teeth slides along the skin under
// the fleece; a four-pointed cutter, pressed down on it by a fork, is thrown
// from side to side across it by the motor in the handle. 18 cm over all, with
// a comb 5.5 cm wide.
//
// It has no stroke. Hold the switch and it runs, and whatever the comb is
// pushed into comes off a few millimetres from the skin.
//
// The tool's own frame: +x runs forward to the points of the comb, +y is up
// off the hide, and y = 0 is the sole of the comb, which is what rides on the
// skin. The origin is on the sole under the grip.
import * as THREE from 'three';
import { Kit, loft, skin, join, steelTextures, canvasTexture, rngFrom, smoothstep, lerp } from '../tool.js';

const TIP = 0.100;                              // origin to the points of the comb, metres
const TEETH = 13;
const TOOTH = 0.017;                            // length of a comb tooth
const ROOTS = TIP - TOOTH;                      // where the teeth leave the plate
const HEEL = 0.060;                             // back edge of the comb
const HALF = [0.0235, 0.0268, 0.0276];          // half the comb's width: at its heel, at the roots of the teeth, across their points
const PLATE = 0.0017;                           // thickness of the comb
const RISE = Math.tan((9 * Math.PI) / 180);     // the handle climbs away from the sole towards the hand
const axisY = (x) => 0.0128 + (0.026 - x) * RISE;

const straight = (u) => ({ x: u, z: 0, a: 0 });
const UV = [14, 40];

/** The comb: a plate, and thirteen teeth that taper and turn up a little at the point, like the tip of a ski, to ride over the skin. */
function combGeometry() {
  const pieces = [];
  pieces.push(loft([HEEL, 0.071, ROOTS + 0.0006], straight, (u) => {
    const hw = lerp(HALF[0], HALF[1], (u - HEEL) / (ROOTS - HEEL));
    return { pts: [[-hw, PLATE], [hw, PLATE], [hw, 0], [-hw, 0]] };
  }, () => true, true, UV));
  const atRoot = (2 * HALF[1]) / TEETH, atPoint = (2 * HALF[2]) / TEETH;
  for (let k = 0; k < TEETH; k++) {
    const zr = (k - (TEETH - 1) / 2) * atRoot, zp = (k - (TEETH - 1) / 2) * atPoint;
    pieces.push(loft([0, 0.3, 0.6, 0.8, 0.92, 1], (s) => ({ x: ROOTS + TOOTH * s, z: lerp(zr, zp, s), a: 0 }), (s) => {
      const w = lerp(0.0033, 0.0009, Math.pow(s, 0.8)) / 2, h = lerp(PLATE, 0.00055, s), y0 = 0.0007 * smoothstep(0.7, 1, s);
      return { pts: [[-w, y0 + h], [w, y0 + h], [w, y0], [-w, y0]] };
    }, () => true, true, UV));
  }
  return join(pieces);
}

/** The cutter: a bar with four broad points, lying on the comb. */
function cutterGeometry() {
  const y0 = PLATE + 0.0001, T = 0.0017, pieces = [];
  pieces.push(loft([0.0680, 0.0766], straight, () => ({ pts: [[-0.0168, y0 + T], [0.0168, y0 + T], [0.0168, y0], [-0.0168, y0]] }), () => true, true, UV));
  for (let k = 0; k < 4; k++) {
    const zc = (k - 1.5) * 0.0084;
    pieces.push(loft([0, 0.5, 0.85, 1], (s) => ({ x: 0.0765 + 0.0165 * s, z: zc, a: 0 }), (s) => {
      const w = lerp(0.0039, 0.0006, s), h = lerp(T, 0.0008, s);
      return { pts: [[-w, y0 + h], [w, y0 + h], [w, y0], [-w, y0]] };
    }, () => true, true, UV));
  }
  return join(pieces);
}

/** The fork: two arms out of the head that press the cutter down on the comb and throw it from side to side. */
function forkGeometry() {
  const pieces = [];
  for (const side of [-1, 1]) {
    pieces.push(loft([0.055, 0.063, 0.070, 0.0748], (u) => ({ x: u, z: side * 0.0088, a: 0 }), (u) => {
      const k = (u - 0.055) / (0.0748 - 0.055);
      const top = lerp(0.0140, 0.0062, k), bottom = lerp(0.0090, 0.0036, k), w = lerp(0.0030, 0.0022, k);
      return { pts: [[-w, top], [w, top], [w, bottom], [-w, bottom]] };
    }, () => true, true, UV));
  }
  return join(pieces);
}

// the head: a casting that widens from the neck of the handle to the width of the comb, and comes down on to its heel
const HEAD = [
  { x: 0.024, y: 0.0128, ry: 0.0090, rz: 0.0094, n: 2.3 },
  { x: 0.034, y: 0.0124, ry: 0.0100, rz: 0.0116, n: 2.6 },
  { x: 0.046, y: 0.0114, ry: 0.0098, rz: 0.0150, n: 3 },
  { x: 0.056, y: 0.0096, ry: 0.0080, rz: 0.0178, n: 3.2 },
  { x: 0.064, y: 0.0072, ry: 0.0055, rz: 0.0196, n: 3.6 },
  { x: 0.0692, y: 0.0052, ry: 0.0034, rz: 0.0190, n: 4 },
];
// the handle: motor, then the grip, then the battery behind a cap
const BODY = [
  [0.030, 0.0086], [0.021, 0.0089], [0.012, 0.0098], [0.002, 0.0107], [-0.012, 0.0112], [-0.030, 0.0113], [-0.048, 0.0109], [-0.058, 0.0108],
  [-0.0605, 0.0114], [-0.072, 0.0113], [-0.0765, 0.0098], [-0.0785, 0.0064], [-0.0790, 0.0030],
].map(([x, r]) => ({ x, y: axisY(x), ry: r, rz: r, n: 2 }));

/** The handle's surface: moulded charcoal plastic, a ribbed rubber grip, a band of colour behind the head, the seam of the battery cap. */
function bodyTextures() {
  const rnd = rngFrom(613);
  const colour = canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#2b2d31'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {   // moulding marks and scuffs
      g.fillStyle = rnd() < 0.5 ? `rgba(120,124,130,${rnd() * 0.1})` : `rgba(0,0,0,${rnd() * 0.16})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 9, 1 + rnd() * 2);
    }
    g.fillStyle = 'rgba(8,8,10,0.55)'; g.fillRect(0.22 * w, 0, 0.53 * w, h);
    g.fillStyle = '#b9471a'; g.fillRect(0.1 * w, 0, 0.047 * w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,20,8,${rnd() * 0.3})`; g.fillRect((0.1 + rnd() * 0.047) * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2); }
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0.83 * w, 0, 2, h);
  }, true);
  const relief = canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
    for (let x = 0.235 * w; x < 0.74 * w; x += 7) { g.fillStyle = 'rgb(215,215,215)'; g.fillRect(x, 0, 3.5, h); }
    g.fillStyle = 'rgb(40,40,40)'; g.fillRect(0.83 * w, 0, 2.5, h);
    for (let i = 0; i < 900; i++) { const v = 118 + rnd() * 20; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
  }, false);
  return { colour, relief };
}

/** Hammer-finish enamel over a casting: slate grey, dimpled, worn through at the edges. */
function enamelTexture() {
  const rnd = rngFrom(1187);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#4d5359'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) {   // the dimples of the finish
      const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 5;
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      c.addColorStop(0, rnd() < 0.5 ? `rgba(120,128,136,${0.12 + rnd() * 0.16})` : `rgba(22,26,30,${0.12 + rnd() * 0.18})`);
      c.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 16; i++) {    // chips down to the aluminium
      const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 3;
      g.fillStyle = `rgba(${150 + rnd() * 30},${154 + rnd() * 30},${160 + rnd() * 30},${0.4 + rnd() * 0.35})`;
      g.beginPath(); g.ellipse(x, y, r, r * (0.4 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  }, true);
}

/** Knurling for the tension nut: fine ridges up and down it. */
function knurlTexture() {
  return canvasTexture(128, 16, (g, w, h) => {
    g.fillStyle = 'rgb(110,110,110)'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 4) { g.fillStyle = 'rgb(225,225,225)'; g.fillRect(x, 0, 2, h); }
  }, false);
}

export function buildElectricShears() {
  const kit = new Kit('electric-shears', 0.05);
  const tex = steelTextures({ seed: 409, tone: '#9da1a6', rust: 0.04 });
  const body = bodyTextures();
  const knurl = knurlTexture();
  const steel = kit.patch(new THREE.MeshPhysicalMaterial({ map: tex.body, metalness: 0.86, roughness: 0.36, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.03, envMapIntensity: 1 }));
  const bright = kit.patch(new THREE.MeshPhysicalMaterial({ map: tex.body, color: 0xdfe2e5, metalness: 0.92, roughness: 0.27, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.02, envMapIntensity: 1.1 }));
  // the head is a casting under grey hammer-finish enamel, chipped to bare metal here and there
  const cast = kit.patch(new THREE.MeshPhysicalMaterial({ map: enamelTexture(), metalness: 0.45, roughness: 0.5, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.1, envMapIntensity: 0.7, clearcoat: 0.25, clearcoatRoughness: 0.4 }));
  const moulded = kit.patch(new THREE.MeshPhysicalMaterial({ map: body.colour, metalness: 0, roughness: 0.66, bumpMap: body.relief, bumpScale: 0.35, clearcoat: 0.08, clearcoatRoughness: 0.6 }));
  const nut = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0x3a3c40, metalness: 0.85, roughness: 0.45, bumpMap: knurl, bumpScale: 0.5 }));
  const button = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0xb9471a, metalness: 0, roughness: 0.5 }));
  const lamp = kit.patch(new THREE.MeshStandardMaterial({ color: 0x06140a, emissive: 0x38ff70, emissiveIntensity: 0, roughness: 0.4 }));

  // Everything hangs from one group, which shivers when the motor runs; the
  // cutter and the fork that drives it hang from another inside it.
  const all = kit.upper, moving = new THREE.Group();
  all.add(moving);
  kit.add(all, combGeometry(), steel, 'electric-comb');
  kit.add(moving, cutterGeometry(), bright, 'electric-cutter');
  kit.add(moving, forkGeometry(), cast, 'electric-fork');
  kit.add(all, skin(HEAD, 32, { capStart: true }), cast, 'electric-head');
  kit.add(all, skin(BODY, 28), moulded, 'electric-handle');
  // the tension nut, on top of the head: screwed down, it presses the fork on the cutter
  const top = 0.0213;
  const knob = kit.add(all, new THREE.CylinderGeometry(0.0062, 0.0062, 0.0074, 22), nut, 'electric-tension-nut');
  knob.position.set(0.045, top + 0.0031, 0);
  const stud = kit.add(all, new THREE.CylinderGeometry(0.0034, 0.0034, 0.0018, 14), bright, 'electric-tension-stud');
  stud.position.set(0.045, top + 0.0077, 0);
  // the switch, under the thumb
  const sw = kit.add(all, new THREE.BoxGeometry(0.0085, 0.0022, 0.0052), button, 'electric-switch');
  sw.position.set(0.004, axisY(0.004) + 0.0105 + 0.0006, 0);
  sw.rotation.z = -Math.atan(RISE);
  // a lamp on the battery cap: lit while it runs
  const led = kit.add(all, new THREE.SphereGeometry(0.0011, 10, 8), lamp, 'electric-lamp');
  led.position.set(-0.066, axisY(-0.066) + 0.0114, 0);

  // what may not pass through things: the sole of the comb, the head, and the length of the handle
  const fixedSamples = [];
  for (const x of [0.066, 0.080, 0.092, 0.0985]) {
    const hw = x < ROOTS ? lerp(HALF[0], HALF[1], (x - HEEL) / (ROOTS - HEEL)) : HALF[2];
    for (const k of [-1, -0.5, 0, 0.5, 1]) fixedSamples.push([x, 0.0022, k * (hw - 0.0022), 0.0022]);
  }
  fixedSamples.push([0.050, 0.0112, 0.0075, 0.0098], [0.050, 0.0112, -0.0075, 0.0098], [0.038, 0.0124, 0, 0.0106], [0.045, top + 0.004, 0, 0.0066]);
  for (const x of [0.022, 0.006, -0.012, -0.030, -0.048, -0.064, -0.0745]) {
    const r = BODY.reduce((best, b) => (Math.abs(b.x - x) < Math.abs(best.x - x) ? b : best)).ry;
    fixedSamples.push([x, axisY(x), 0, r + 0.0004]);
  }

  return {
    id: 'electric',
    name: 'Electric shears',
    blurb: 'A comb, a cutter and a motor. Hold it down and push: a wide swath, a few millimetres from the skin.',
    seed: 41,
    kit,
    halfThick: 0,
    open: 0,
    tip: TIP,
    // the head and comb, for the hair to part round: two halves, one either side of the middle
    blade: { from: 0.056, to: TIP, back0: 0, back1: 0, exp: 1, edge: HALF[2], point: 0 },
    part: { above: 0.034, below: 0.012 },
    pivotClear: 0,
    cutInner: 0,
    leverSamples: [],
    fixedSamples,
    // in the right hand, comb leading
    hold: { pos: [0.02, -0.086, -0.128], tilt: 0, yaw: (-5 * Math.PI) / 180, roll: (5 * Math.PI) / 180, sway: 1 },
    lie: { tip: 0.0026, pivot: 0.0026 },         // the sole of the comb rides flat, this far off the skin
    reach: 0.19,
    // up to speed in a tenth of a second; 260 locks of full-length hair a second (at High detail: the comb's width at about half a metre a second) before it bogs down
    motor: { spinUp: 0.09, spinDown: 0.28, rate: 260, long: 0.03, light: 0.12 },
    // hair is taken as its roots pass between the teeth, just short of their points
    mouth: { from: 0.081, to: 0.097, half: HALF[2], above: 0.008, below: 0.008 },
    cut: { below: 0, min: 0.003, chance: 1, ragged: 0 },
    voice: 'electric',
    animate: (tool) => {
      const p = tool.power, w = tool.buzz * Math.PI * 2;
      // The cutter is thrown from side to side far too fast to follow; it is
      // drawn at a rate the eye (and the frame rate) can make something of.
      moving.position.z = p > 0.02 ? Math.sin(w * 21.3) * 0.0034 * Math.min(1, p * 1.5) : 0.0021;
      // the whole handpiece shivers with it, and harder when it labours
      const shake = p * (0.00018 + 0.0004 * tool.load);
      all.position.set(0, Math.sin(w * 37.1) * shake, Math.sin(w * 29.3 + 1) * shake * 0.6);
      lamp.emissiveIntensity = 9 * Math.min(1, p * 2);
    },
  };
}
