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
function buildPushBroom() {
  const kit = new Kit('push-broom', 0.03);
  const wood = kit.patch(new THREE.MeshPhysicalMaterial({ map: woodTexture(), roughness: 0.6, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.5 }));
  const paint = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0x8c2f24, roughness: 0.55, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
  const hair = kit.patch(new THREE.MeshPhysicalMaterial({ map: bristleTexture('#2a2420', '#0f0c0a', '#6b5a48'), roughness: 0.95, metalness: 0 }));
  const all = kit.upper;
  handle(kit, all, wood, -0.07, 0.36, 0.0062);
  const head = new THREE.Group();
  head.position.x = 0.37; head.rotation.z = -SLOPE;   // the block lies level when the handle slopes
  all.add(head);
  kit.add(head, new THREE.BoxGeometry(0.03, 0.02, 0.2), paint, 'block');
  const bristles = kit.add(head, new THREE.BoxGeometry(0.026, 0.045, 0.196), hair, 'bristles');
  bristles.position.y = -0.032;
  const samples = [[0.4, -0.02, 0, 0.02], [0.4, -0.02, 0.075, 0.02], [0.4, -0.02, -0.075, 0.02], [0.26, 0, 0, 0.008], [0.12, 0, 0, 0.008]];
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
