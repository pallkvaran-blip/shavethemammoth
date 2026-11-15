// What the hair is picked up with: bare hands, two brooms and two vacuum
// cleaners. They are held like the cutting tools, but point down at the snow
// in front of the elf's feet, where the cut hair lies.
//
// The tool's own frame: the grip is at the origin, +x runs along the tool to
// its working end (the bristles, the nozzle), +y is up. The brooms and the big
// vacuum rest on the ground: they are held at a slope that puts the working
// end on the snow a couple of paces ahead, and keep that slope whichever way
// the elf looks (`level`). The hands and the little vacuum point where the
// eyes do.
import * as THREE from 'three';
import { Kit, skin, canvasTexture, rngFrom, woodTexture, steelTextures } from '../tool.js';
import { ITEMS } from '../catalog.js';

const DOWN = (-34 * Math.PI) / 180;
const SLOPE = (-12.6 * Math.PI) / 180;    // the slope of a handle from hands at the hip (8.5 cm up) to a head on the snow 40 cm along it

/** What every sweeper's definition shares. */
function sweeper(id, kit, { tip, samples, hold, voice, motor = null, animate = null, nearer, level = false }) {
  const item = ITEMS[id];
  return {
    id, name: item.name, blurb: item.blurb, seed: 71, kit, sweep: item.sweep, noLie: true, level,
    halfThick: 0, open: 0, tip,
    blade: { from: 0, to: tip, back0: 0, back1: 0, exp: 1, edge: 0.01, point: 0 },
    part: { above: 0.02, below: 0.01 }, pivotClear: 0, cutInner: 0,
    leverSamples: [], fixedSamples: samples,
    hold, lie: { tip: 0.01, pivot: 0.01 }, reach: 0.22,
    cut: { below: 0, min: 0.004, chance: 1, ragged: 0 },
    voice, motor, animate, nearer,
  };
}

/**
 * A handle: a turned stick from the grip towards the working end. It is made
 * in short lengths. A tool is drawn a little nearer the eye than it is (see
 * Kit), which is worked out at each corner; one long piece running from behind
 * the eyes to the snow ahead would have its depth guessed between two corners
 * that far apart, guessed wrong, and vanish behind the ground.
 */
function handle(kit, parent, material, from, to, radius) {
  const mesh = kit.add(parent, new THREE.CylinderGeometry(radius * 0.92, radius, to - from, 12, Math.ceil((to - from) / 0.02)), material, 'handle');
  mesh.rotation.z = -Math.PI / 2;
  mesh.position.x = (from + to) / 2;
  return mesh;
}

function bristleTexture(base, dark, light) {
  const rnd = rngFrom(88);
  return canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = rnd() < 0.5 ? dark : light;
      g.globalAlpha = 0.25 + rnd() * 0.5; g.lineWidth = 0.6 + rnd();
      const x = rnd() * w;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 6, h); g.stroke();
    }
    g.globalAlpha = 1;
  }, true);
}

// ---- bare hands: nothing to draw (the elf's hands are below the frame, as with every tool) ----
function buildHands() {
  const kit = new Kit('bare-hands', 0.02);
  return sweeper('hands', kit, {
    tip: 0.14, samples: [[0.1, 0, 0, 0.01]], voice: 'hands', nearer: 0.02,
    hold: { pos: [0.03, -0.08, -0.06], tilt: DOWN, yaw: 0, roll: 0, sway: 0.5 },
  });
}

// ---- push broom: a long handle into a wide block of bristle ----
/** Red paint on a wooden block that has been knocked about: chipped to the wood along its edges, scuffed, and dirty underneath. */
function paintedWood() {
  const rnd = rngFrom(412);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#8f2d22'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {      // the brush it was painted with, and the grain under it
      g.strokeStyle = rnd() < 0.5 ? 'rgba(60,14,10,0.12)' : 'rgba(190,80,60,0.08)';
      g.lineWidth = 0.5 + rnd() * 1.5;
      const y = rnd() * h;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (rnd() - 0.5) * 5); g.stroke();
    }
    for (let i = 0; i < 20; i++) {       // chips, down to the wood
      const x = rnd() * w, y = rnd() < 0.6 ? (rnd() < 0.5 ? rnd() * 22 : h - rnd() * 22) : rnd() * h, r = 1.5 + rnd() * 6;
      g.fillStyle = `rgb(${150 + rnd() * 40 | 0},${108 + rnd() * 30 | 0},${62 + rnd() * 24 | 0})`;
      g.beginPath(); g.ellipse(x, y, r * (1 + rnd() * 2), r * 0.6, rnd() * 0.5 - 0.25, 0, 7); g.fill();
      g.strokeStyle = 'rgba(40,10,6,0.5)'; g.lineWidth = 0.6; g.stroke();
    }
    for (let i = 0; i < 30; i++) {       // scratches
      g.strokeStyle = 'rgba(225,190,160,0.35)'; g.lineWidth = 0.5;
      const x = rnd() * w, y = rnd() * h;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 50, y + (rnd() - 0.5) * 12); g.stroke();
    }
    const dirt = g.createLinearGradient(0, 0, 0, h);
    dirt.addColorStop(0, 'rgba(20,12,8,0)'); dirt.addColorStop(1, 'rgba(20,12,8,0.35)');
    g.fillStyle = dirt; g.fillRect(0, 0, w, h);
  }, true);
}

/** A thin rod from one point to another. */
function rod(a, b, radius, around = 8) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), geo = new THREE.CylinderGeometry(radius, radius, d.length(), around, 1);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  geo.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return geo;
}

/**
 * The bristles of a push broom, every one of them: five rows of tufts along the block, half a dozen bristles to a
 * tuft, each a tapered three-sided sliver with a bend in it. The outer rows are stiff pale fibre and lean out; the
 * ones between are dark, and softer. They are not the same length, and a few have had enough.
 * @param wide   the length of the block (metres); @param from the underside of the block, where they are set in
 */
function bristleGeometry(wide, from, deep) {
  const rnd = rngFrom(5150), pos = [], nrm = [], col = [], idx = [];
  const ROWS = 5, tufts = Math.round(wide / 0.0072), PER = 8;
  const pale = [0.52, 0.4, 0.2], dark = [0.035, 0.028, 0.022];
  const v = new THREE.Vector3(), axis = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
  for (let r = 0; r < ROWS; r++) {
    const rk = (r / (ROWS - 1)) * 2 - 1, outer = r === 0 || r === ROWS - 1;
    for (let t = 0; t < tufts; t++) {
      const tk = (t / (tufts - 1)) * 2 - 1;
      const tx = rk * deep * 0.42 + (rnd() - 0.5) * 0.0012, tz = tk * (wide / 2 - 0.004) + (rnd() - 0.5) * 0.0015;
      for (let k = 0; k < PER; k++) {
        const stray = rnd() < 0.035;
        const len = (outer ? 0.05 : 0.046) * (0.88 + rnd() * 0.2) * (stray ? 1.12 : 1);
        const rootR = (outer ? 0.0013 : 0.0012) * (0.85 + rnd() * 0.3);
        // where it starts in the tuft, which way it leans (out from the middle of the block, and out past its ends), how it bends
        const rx = tx + (rnd() - 0.5) * 0.0046, rz = tz + (rnd() - 0.5) * 0.0046;
        const leanX = rk * 0.24 + (rnd() - 0.5) * 0.16 + (stray ? (rnd() - 0.5) * 0.6 : 0), leanZ = Math.pow(Math.abs(tk), 6) * Math.sign(tk) * 0.3 + (rnd() - 0.5) * 0.14 + (stray ? (rnd() - 0.5) * 0.6 : 0);
        const bendX = (rnd() - 0.5) * 0.006 + rk * 0.002, bendZ = (rnd() - 0.5) * 0.006;
        const shade = 0.75 + rnd() * 0.5, base = outer ? pale : (rnd() < 0.08 ? [0.2, 0.15, 0.09] : dark);
        const at = (u) => [rx + leanX * len * u + bendX * Math.sin(u * Math.PI) * 0.5 + bendX * u * u, from - len * u * Math.sqrt(Math.max(0.05, 1 - (leanX * leanX + leanZ * leanZ) * 0.5)), rz + leanZ * len * u + bendZ * u * u];
        const first = pos.length / 3, RINGS = 4;
        for (let i = 0; i < RINGS; i++) {
          const u = i / (RINGS - 1), p = at(u), q = at(Math.min(1, u + 0.05)), q0 = at(Math.max(0, u - 0.05));
          axis.set(q[0] - q0[0], q[1] - q0[1], q[2] - q0[2]).normalize();
          side.set(1, 0, 0).addScaledVector(axis, -axis.x).normalize(); up.crossVectors(axis, side);
          const rad = rootR * (1 - 0.55 * u), spin = rnd() * 6.28;
          for (let j = 0; j < 3; j++) {
            const ang = spin + (j / 3) * Math.PI * 2;
            v.copy(side).multiplyScalar(Math.cos(ang)).addScaledVector(up, Math.sin(ang));
            pos.push(p[0] + v.x * rad, p[1] + v.y * rad, p[2] + v.z * rad); nrm.push(v.x, v.y, v.z);
            // darker where it is set in the block, dusty and split at the tip
            const tone = shade * (0.55 + 0.6 * u) + (u > 0.8 ? 0.12 : 0);
            col.push(base[0] * tone + (u > 0.8 ? 0.03 : 0), base[1] * tone + (u > 0.8 ? 0.03 : 0), base[2] * tone + (u > 0.8 ? 0.03 : 0));
          }
        }
        for (let i = 0; i < RINGS - 1; i++) for (let j = 0; j < 3; j++) {
          const a0 = first + i * 3 + j, a1 = first + i * 3 + (j + 1) % 3, b0 = a0 + 3, b1 = a1 + 3;
          idx.push(a0, b0, a1, a1, b0, b1);
        }
        const tip = first + (RINGS - 1) * 3; idx.push(tip, tip + 1, tip + 2);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.setIndex(idx);
  return geo;
}

// ---- push broom: a yard broom. A painted wooden block the length of the elf's arm span and more, set with five rows
//      of bristles; a steel socket and two wire stays hold the handle to it ----
function buildPushBroom() {
  const kit = new Kit('push-broom', 0.03);
  const WIDE = 0.3, DEEP = 0.04, TALL = 0.024;
  const tex = steelTextures({ seed: 77, tone: '#a9adb2', rust: 0.18 });
  const wood = kit.patch(new THREE.MeshPhysicalMaterial({ map: woodTexture(), roughness: 0.6, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.5 }));
  const painted = paintedWood(); painted.repeat.set(3, 9);
  const paint = kit.patch(new THREE.MeshPhysicalMaterial({ map: painted, roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.45, bumpMap: painted, bumpScale: 0.25 }));
  const steel = kit.patch(new THREE.MeshPhysicalMaterial({ map: tex.body, metalness: 0.85, roughness: 0.38, roughnessMap: tex.rough, envMapIntensity: 1 }));
  const fibre = kit.patch(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x6b5a48), side: THREE.DoubleSide }));
  const pitch = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0x0b0806, roughness: 0.95, metalness: 0 }));
  const all = kit.upper;
  handle(kit, all, wood, -0.07, 0.352, 0.0064);
  // the head: level on the snow while the handle slopes down to it
  const head = new THREE.Group();
  head.position.x = 0.37; head.rotation.z = -SLOPE;
  all.add(head);
  // the block: a length of timber with its corners taken off
  const r = 0.0045, outline = new THREE.Shape();
  outline.moveTo(-DEEP / 2 + r, -TALL / 2); outline.lineTo(DEEP / 2 - r, -TALL / 2); outline.quadraticCurveTo(DEEP / 2, -TALL / 2, DEEP / 2, -TALL / 2 + r);
  outline.lineTo(DEEP / 2, TALL / 2 - r * 1.6); outline.quadraticCurveTo(DEEP / 2, TALL / 2, DEEP / 2 - r * 1.6, TALL / 2);
  outline.lineTo(-DEEP / 2 + r * 1.6, TALL / 2); outline.quadraticCurveTo(-DEEP / 2, TALL / 2, -DEEP / 2, TALL / 2 - r * 1.6);
  outline.lineTo(-DEEP / 2, -TALL / 2 + r); outline.quadraticCurveTo(-DEEP / 2, -TALL / 2, -DEEP / 2 + r, -TALL / 2);
  const block = new THREE.ExtrudeGeometry(outline, { depth: WIDE - 0.006, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 3, curveSegments: 6 });
  block.translate(0, 0, -(WIDE - 0.006) / 2);
  kit.add(head, block, paint, 'block');
  // what the bristles are set in, and the bristles
  kit.add(head, new THREE.BoxGeometry(DEEP * 0.88, 0.004, WIDE - 0.012), pitch, 'setting').position.y = -TALL / 2 - 0.001;
  kit.add(head, bristleGeometry(WIDE - 0.012, -TALL / 2, DEEP), fibre, 'bristles');
  // the socket the handle screws into: a steel plate on top of the block, bolted through, with a collar standing up from it
  kit.add(head, new THREE.BoxGeometry(0.03, 0.0016, 0.058), steel, 'plate').position.set(-0.002, TALL / 2 + 0.0008, 0);
  for (const z of [-0.022, 0.022]) {
    const bolt = kit.add(head, new THREE.CylinderGeometry(0.0034, 0.0034, 0.0024, 6), steel, 'bolt');
    bolt.position.set(-0.002, TALL / 2 + 0.0028, z);
  }
  const collar = kit.add(all, new THREE.CylinderGeometry(0.0082, 0.0092, 0.034, 16, 1, true), steel, 'collar');
  collar.rotation.z = -Math.PI / 2; collar.position.x = 0.349;
  const rim = kit.add(all, new THREE.TorusGeometry(0.0084, 0.0011, 6, 18), steel, 'collar-rim');
  rim.rotation.y = Math.PI / 2; rim.position.x = 0.332;
  // two wire stays from the handle out to the ends of the block (the head's own frame, turned into the handle's)
  const cs = Math.cos(-SLOPE), sn = Math.sin(-SLOPE), onHandle = (x, y, z) => [0.37 + x * cs - y * sn, x * sn + y * cs, z];
  for (const side of [-1, 1]) {
    kit.add(all, rod([0.235, side * 0.0052, 0].map((c, i) => (i === 2 ? side * 0.0062 : i === 1 ? 0.002 : c)), onHandle(-0.004, TALL / 2 + 0.001, side * (WIDE / 2 - 0.035)), 0.0013), steel, 'stay');
    const eye = kit.add(head, new THREE.CylinderGeometry(0.003, 0.003, 0.002, 6), steel, 'stay-screw');
    eye.position.set(-0.004, TALL / 2 + 0.001, side * (WIDE / 2 - 0.035));
  }
  const clip = kit.add(all, new THREE.CylinderGeometry(0.0072, 0.0072, 0.006, 14, 1, true), steel, 'stay-clip');
  clip.rotation.z = -Math.PI / 2; clip.position.x = 0.235;
  const samples = [[0.4, -0.02, 0, 0.022], [0.4, -0.02, 0.07, 0.022], [0.4, -0.02, -0.07, 0.022], [0.4, -0.02, 0.13, 0.02], [0.4, -0.02, -0.13, 0.02], [0.26, 0, 0, 0.008], [0.12, 0, 0, 0.008]];
  return sweeper('push', kit, {
    tip: 0.4, samples, voice: 'broom', nearer: 0.03, level: true,
    hold: { pos: [0.065, -0.085, -0.03], tilt: SLOPE, yaw: (-8 * Math.PI) / 180, roll: 0, sway: 0.8 },
    animate: (tool) => {
      // pushed away, drawn back
      const s = tool.swing || 0;
      all.position.x = Math.sin(s * Math.PI) * 0.07 - 0.02;
    },
  });
}

/** Moulded plastic in a colour, scuffed. */
function plastic(kit, colour, gloss = 0.3) {
  return kit.patch(new THREE.MeshPhysicalMaterial({ color: colour, metalness: 0, roughness: 0.5, clearcoat: gloss, clearcoatRoughness: 0.35 }));
}

// ---- shop vacuum: all that is seen of it is the wand, the floor nozzle, and the hose going off behind ----
function buildShopVac() {
  const kit = new Kit('shop-vacuum', 0.03);
  const tex = steelTextures({ seed: 12, tone: '#b4b8bd', rust: 0.02 });
  const tube = kit.patch(new THREE.MeshPhysicalMaterial({ map: tex.body, metalness: 0.8, roughness: 0.3, roughnessMap: tex.rough, envMapIntensity: 1 }));
  const dark = plastic(kit, 0x16171a, 0.2), yellow = plastic(kit, 0xd9a521, 0.35);
  const ribs = canvasTexture(8, 64, (g, w, h) => {
    g.fillStyle = 'rgb(120,120,120)'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgb(225,225,225)'; g.fillRect(0, y, w, 2); }
  }, false);
  ribs.repeat.set(1, 6);
  const hoseMat = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0x232428, metalness: 0, roughness: 0.6, bumpMap: ribs, bumpScale: 1.2 }));
  const all = kit.upper;
  // the wand
  handle(kit, all, tube, 0.0, 0.33, 0.0105);
  // the cuff where the hose joins, and the hose itself, curving away down and back out of sight
  const cuff = kit.add(all, new THREE.CylinderGeometry(0.014, 0.014, 0.05, 16), yellow, 'vac-cuff');
  cuff.rotation.z = -Math.PI / 2; cuff.position.x = -0.005;
  const path = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.03, 0, 0), new THREE.Vector3(-0.09, -0.004, 0.012), new THREE.Vector3(-0.16, -0.04, 0.04), new THREE.Vector3(-0.2, -0.12, 0.07), new THREE.Vector3(-0.2, -0.24, 0.09)]);
  kit.add(all, new THREE.TubeGeometry(path, 30, 0.0125, 12, false), hoseMat, 'vac-hose');
  // the floor nozzle: a wide flat mouth
  const mouth = new THREE.Group();
  mouth.position.x = 0.335; mouth.rotation.z = -SLOPE;
  all.add(mouth);
  kit.add(mouth, skin([
    { x: -0.012, y: 0.002, ry: 0.012, rz: 0.014, n: 2.4 }, { x: 0.012, y: -0.002, ry: 0.012, rz: 0.05, n: 3.4 }, { x: 0.04, y: -0.008, ry: 0.009, rz: 0.085, n: 4 }, { x: 0.052, y: -0.01, ry: 0.006, rz: 0.086, n: 4 },
  ], 28, { capStart: true }), dark, 'vac-nozzle');
  const samples = [[0.38, -0.02, 0, 0.016], [0.38, -0.02, 0.06, 0.014], [0.38, -0.02, -0.06, 0.014], [0.25, 0, 0, 0.012], [0.12, 0, 0, 0.012], [0, 0, 0, 0.016]];
  return sweeper('shopvac', kit, {
    tip: 0.385, samples, voice: 'shopvac', nearer: 0.03, motor: { spinUp: 0.5, spinDown: 1.1 }, level: true,
    hold: { pos: [0.065, -0.085, -0.03], tilt: SLOPE, yaw: (-8 * Math.PI) / 180, roll: 0, sway: 0.9 },
    animate: (tool) => {
      const p = tool.power, w = tool.buzz * Math.PI * 2, shake = p * 0.0007;
      all.position.set(0, Math.sin(w * 31) * shake, Math.sin(w * 27 + 1) * shake);
    },
  });
}

/** All three, weakest first. */
export function buildSweepers() {
  return [buildHands(), buildPushBroom(), buildShopVac()];
}

export const SWEEPER_ORDER = ['hands', 'push', 'shopvac'];
