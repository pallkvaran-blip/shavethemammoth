// Beard shaver: a small cordless trimmer of the kind kept by a bathroom
// mirror. Two fine-toothed blades, one sliding on the other, behind a head
// 2.4 cm wide; a slim body with one button. 9 cm over all.
//
// It leaves bare skin, which nothing else here does, and it is the only tool
// for the last millimetre. But it was made for a chin. Its motor is small:
// on stubble it glides, in a full-grown coat it labours, and hair it is
// pushed past faster than it can cut is left standing.
//
// The tool's own frame: +x runs forward to the edge of the blades, +y is up
// off the hide, and y = 0 is the underside of the blades, which rides on the
// skin. The origin is on that plane under the grip.
import * as THREE from 'three';
import { Kit, loft, skin, join, steelTextures, canvasTexture, rngFrom, lerp } from '../tool.js';

const TIP = 0.055;                               // origin to the cutting edge, metres
const HALF = 0.0122;                             // half the width of the blades
const TEETH = 21;
const RISE = Math.tan((11 * Math.PI) / 180);     // the body climbs away from the skin towards the hand
const axisY = (x) => 0.0078 + (0.030 - x) * RISE;

const straight = (u) => ({ x: u, z: 0, a: 0 });
const UV = [40, 90];

/** One blade: a plate with a row of fine teeth along its front edge. */
function bladeGeometry({ from, roots, tip, half, y0, thick, wide }) {
  const pieces = [];
  pieces.push(loft([from, roots + 0.0002], straight, () => ({ pts: [[-half, y0 + thick], [half, y0 + thick], [half, y0], [-half, y0]] }), () => true, true, UV));
  const pitch = (2 * half) / TEETH;
  for (let k = 0; k < TEETH; k++) {
    const zc = (k - (TEETH - 1) / 2) * pitch;
    pieces.push(loft([0, 0.6, 1], (s) => ({ x: roots + (tip - roots) * s, z: zc, a: 0 }), (s) => {
      const w = lerp(wide, wide * 0.4, s) / 2, h = lerp(thick, thick * 0.45, s);
      return { pts: [[-w, y0 + h], [w, y0 + h], [w, y0], [-w, y0]] };
    }, () => true, true, UV));
  }
  return join(pieces);
}

// the head: a wedge of plastic that spreads from the body to the width of the blades and thins down on to them
const HEAD = [
  { x: 0.0285, y: axisY(0.0285), ry: 0.0059, rz: 0.0083, n: 2.7 },
  { x: 0.0350, y: 0.0066, ry: 0.0051, rz: 0.0100, n: 3 },
  { x: 0.0410, y: 0.0050, ry: 0.0037, rz: 0.0114, n: 3.4 },
  { x: 0.0455, y: 0.0036, ry: 0.0023, rz: 0.0119, n: 4 },
  { x: 0.0476, y: 0.0028, ry: 0.0015, rz: 0.0119, n: 4 },
];
// a bright collar where the head clips on
const COLLAR = [[0.0266, 0.0056, 0.0079], [0.0272, 0.0064, 0.0088], [0.0292, 0.0064, 0.0088], [0.0298, 0.0056, 0.0079]]
  .map(([x, ry, rz]) => ({ x, y: axisY(x), ry, rz, n: 2.6 }));
// the body: waisted a little for the fingers, rounded off behind
const BODY = [
  [0.0290, 0.0058, 0.0082, 2.6], [0.0150, 0.0060, 0.0080, 2.5], [0.0000, 0.0062, 0.0076, 2.4], [-0.0150, 0.0064, 0.0080, 2.5], [-0.0280, 0.0062, 0.0080, 2.5],
  [-0.0325, 0.0054, 0.0070, 2.4], [-0.0348, 0.0036, 0.0048, 2.2], [-0.0356, 0.0014, 0.0020, 2],
].map(([x, ry, rz, n]) => ({ x, y: axisY(x), ry, rz, n }));

/** The body's surface: soft black plastic gone a little shiny where it is held, with a brushed metal inlay along the top. */
function bodyTextures() {
  const rnd = rngFrom(271);
  // (u runs along the body from the head backwards; v once round it, and the top is a quarter of the way: on the canvas, three quarters of the way down)
  const inlay = (g, w, h, fill) => {
    const x0 = 0.07 * w, x1 = 0.86 * w, y0 = 0.67 * h, y1 = 0.83 * h, r = (y1 - y0) / 2;
    g.fillStyle = fill;
    g.beginPath(); g.moveTo(x0 + r, y0); g.lineTo(x1 - r, y0); g.arc(x1 - r, y0 + r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(x0 + r, y1); g.arc(x0 + r, y0 + r, r, Math.PI / 2, -Math.PI / 2); g.fill();
  };
  const colour = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#1c1d20'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = rnd() < 0.6 ? `rgba(110,112,118,${rnd() * 0.08})` : `rgba(0,0,0,${rnd() * 0.2})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 12, 1 + rnd() * 2);
    }
    inlay(g, w, h, '#62676e');
    g.save(); g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 500; i++) {   // brushed along its length
      g.strokeStyle = rnd() < 0.5 ? `rgba(200,204,210,${0.03 + rnd() * 0.08})` : `rgba(30,32,36,${0.03 + rnd() * 0.08})`;
      const y = (0.67 + rnd() * 0.16) * h;
      g.lineWidth = 0.6; g.beginPath(); g.moveTo(0.07 * w, y); g.lineTo(0.86 * w, y); g.stroke();
    }
    g.restore();
  }, true);
  const rough = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = 'rgb(170,170,170)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {   // worn smoother where fingers go
      const x = (0.2 + rnd() * 0.6) * w, y = rnd() * h, r = 14 + rnd() * 34;
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      c.addColorStop(0, `rgba(95,95,95,${0.2 + rnd() * 0.25})`); c.addColorStop(1, 'rgba(95,95,95,0)');
      g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    inlay(g, w, h, 'rgb(96,96,96)');
  }, false);
  return { colour, rough };
}

export function buildBeardShaver() {
  const kit = new Kit('beard-shaver', 0.03);
  const tex = steelTextures({ seed: 733, tone: '#a4a8ad', rust: 0 });
  const body = bodyTextures();
  const steel = kit.patch(new THREE.MeshPhysicalMaterial({ map: tex.body, metalness: 0.9, roughness: 0.3, roughnessMap: tex.rough, bumpMap: tex.rough, bumpScale: 0.02, envMapIntensity: 1.1 }));
  const dark = kit.patch(new THREE.MeshPhysicalMaterial({ map: tex.body, color: 0x8b8f96, metalness: 0.9, roughness: 0.34, roughnessMap: tex.rough, envMapIntensity: 1 }));
  const gloss = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0x15161a, metalness: 0, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25 }));
  const soft = kit.patch(new THREE.MeshPhysicalMaterial({ map: body.colour, metalness: 0.1, roughness: 0.9, roughnessMap: body.rough, clearcoat: 0.12, clearcoatRoughness: 0.5 }));
  const chrome = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0xc9ccd0, metalness: 1, roughness: 0.16, roughnessMap: tex.rough, envMapIntensity: 1.2 }));
  const rubber = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0x101114, metalness: 0, roughness: 0.75 }));
  const ring = kit.patch(new THREE.MeshStandardMaterial({ color: 0x06181a, emissive: 0x3fe6e0, emissiveIntensity: 0, roughness: 0.4 }));

  // everything hangs from one group, which shivers when the motor runs; the upper blade slides inside it
  const all = kit.upper;
  kit.add(all, bladeGeometry({ from: 0.0440, roots: 0.0528, tip: TIP, half: HALF, y0: 0, thick: 0.0007, wide: 0.00082 }), steel, 'shaver-blade');
  const slider = kit.add(all, bladeGeometry({ from: 0.0462, roots: 0.0522, tip: TIP - 0.0006, half: HALF - 0.0007, y0: 0.00075, thick: 0.0005, wide: 0.0008 }), dark, 'shaver-cutter');
  kit.add(all, skin(HEAD, 32, { capStart: true }), gloss, 'shaver-head');
  kit.add(all, skin(COLLAR, 32, { capStart: true }), chrome, 'shaver-collar');
  kit.add(all, skin(BODY, 32), soft, 'shaver-body');
  // the button, on the inlay, and the ring round it that lights when it runs
  const at = 0.013, top = axisY(at) + 0.006, slope = -Math.atan(RISE);
  const press = kit.add(all, new THREE.CylinderGeometry(0.0028, 0.0028, 0.0007, 20), rubber, 'shaver-button');
  press.position.set(at, top + 0.0002, 0); press.rotation.z = slope;
  const glow = kit.add(all, new THREE.TorusGeometry(0.0033, 0.00028, 8, 28), ring, 'shaver-button-ring');
  glow.position.set(at, top + 0.00015, 0); glow.rotation.set(Math.PI / 2, 0, 0); glow.rotateY(slope);

  // what may not pass through things: the underside of the blades, the head, and the length of the body
  const fixedSamples = [];
  for (const x of [0.0460, 0.0505, 0.0541]) for (const z of [-0.0108, -0.0036, 0.0036, 0.0108]) fixedSamples.push([x, 0.0011, z, 0.0011]);
  fixedSamples.push([0.040, 0.0053, 0.0055, 0.0040], [0.040, 0.0053, -0.0055, 0.0040], [0.0335, 0.0070, 0, 0.0064]);
  for (const [x, r] of [[0.020, 0.0074], [0.006, 0.0074], [-0.008, 0.0076], [-0.022, 0.0076], [-0.0315, 0.0058]]) fixedSamples.push([x, axisY(x), 0, r]);

  return {
    id: 'shaver',
    name: 'Beard shaver',
    blurb: 'For the last millimetre: smooth on stubble, slow going in long hair.',
    seed: 59,
    kit,
    halfThick: 0,
    open: 0,
    tip: TIP,
    // the head and blades, for the hair to part round: two halves, one either side of the middle
    blade: { from: 0.030, to: TIP, back0: 0, back1: 0, exp: 1, edge: HALF, point: 0 },
    part: { above: 0.018, below: 0.008 },
    pivotClear: 0,
    cutInner: 0,
    leverSamples: [],
    fixedSamples,
    // in the right hand, off to the right, turned in
    hold: { pos: [0.032, -0.064, -0.108], tilt: (14 * Math.PI) / 180, yaw: (-12 * Math.PI) / 180, roll: (12 * Math.PI) / 180, sway: 0.7 },
    lie: { tip: 0.0014, pivot: 0.0014 },         // the blades ride flat on the skin
    reach: 0.12,
    // quick to start; eighteen locks of full-length hair a second (at High detail: its own width at about eight centimetres a second) is all it can manage, though stubble costs it a tenth of that
    motor: { spinUp: 0.06, spinDown: 0.18, rate: 18, long: 0.03, light: 0.1 },
    mouth: { from: 0.0465, to: 0.0546, half: HALF + 0.0004, above: 0.008, below: 0.008 },
    cut: { below: 0, min: 0.0004, chance: 1, ragged: 0 },
    voice: 'shaver',
    animate: (tool) => {
      const p = tool.power, w = tool.buzz * Math.PI * 2;
      slider.position.z = p > 0.02 ? Math.sin(w * 23.7) * 0.00045 * Math.min(1, p * 1.5) : 0.0003;
      // it shivers in the hand, and shakes when it labours
      const shake = p * (0.00009 + 0.00028 * tool.load);
      all.position.set(0, Math.sin(w * 41.3) * shake, Math.sin(w * 31.9 + 1) * shake * 0.6);
      ring.emissiveIntensity = 10 * Math.min(1, p * 2);
    },
  };
}
