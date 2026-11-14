// The novelties: things Gnorman sells that are no use for shaving. Each is
// held like a tool and works once, on one part of the mammoth (what comes of
// it is in src/game/gags.js; this file is what they look like in the hand).
//
// A novelty's own frame is a tool's: the grip at the origin, +x away from the
// eyes towards its working end, +y up, +z to the right. Two of them are on
// poles that draw out to reach what they are aimed at (`pole`): a pole's foot
// stays in the hand, and tool.length is how far its head is from there.
import * as THREE from 'three';
import { Kit, canvasTexture, rngFrom, woodTexture, steelTextures, lathe, skin } from '../tool.js';
import { ITEMS } from '../catalog.js';

const DEG = Math.PI / 180;
const LETTERS = '"Grenze Gotisch", "Palatino Linotype", Georgia, serif';

/** What every novelty's definition shares. */
function novelty(id, kit, { tip, samples, hold, reach = 0.22, animate = null, pole = null, nozzle = null, stow = null, gag = {} }) {
  const item = ITEMS[id];
  return {
    id, name: item.name, blurb: item.use || item.blurb, seed: 91, kit, gag: { ...gag }, noLie: true, pole, nozzle, stow,
    halfThick: 0, open: 0, tip,
    blade: { from: 0, to: tip, back0: 0, back1: 0, exp: 1, edge: 0.01, point: 0 },
    part: { above: 0.02, below: 0.01 }, pivotClear: 0, cutInner: 0,
    leverSamples: [], fixedSamples: samples,
    hold, lie: { tip: 0.01, pivot: 0.01 }, reach,
    cut: { below: 0, min: 0.004, chance: 1, ragged: 0 },
    voice: 'hands', motor: null, animate,
  };
}

/** A round bar along x from `from` to `to`, in short lengths (see sweepers.js for why). */
function bar(kit, parent, material, from, to, r0, r1 = r0, name = 'bar', around = 12) {
  const mesh = kit.add(parent, new THREE.CylinderGeometry(r1, r0, to - from, around, Math.max(1, Math.ceil((to - from) / 0.02))), material, name);
  mesh.rotation.z = -Math.PI / 2;
  mesh.position.x = (from + to) / 2;
  return mesh;
}

const plastic = (kit, colour, gloss = 0.4, rough = 0.45) => kit.patch(new THREE.MeshPhysicalMaterial({ color: colour, metalness: 0, roughness: rough, clearcoat: gloss, clearcoatRoughness: 0.3 }));
const metal = (kit, colour, rough = 0.3) => kit.patch(new THREE.MeshPhysicalMaterial({ color: colour, metalness: 1, roughness: rough, envMapIntensity: 1.2 }));

// ---- the two on poles ---------------------------------------------------------------------

const GRIP = 0.05, POLE_REST = 0.21, TUBES = 5;

/**
 * A telescopic pole with something on the end of it. `head(kit, group, materials)` builds the something, in a frame
 * whose origin is the end of the pole and whose +x carries on along it; `rub(group, phase, hard)` is what it does there.
 */
function buildPole(id, name, { head, headLength, rub, most = 1.8, hold, brassTone = 0xc9a24a }) {
  const kit = new Kit(name, 0);
  const brass = metal(kit, brassTone, 0.34), rubber = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0x1b1c1f, roughness: 0.9, metalness: 0 }));
  const all = kit.upper;
  // the grip: ribbed rubber, with a stop at each end of it
  bar(kit, all, rubber, -0.022, GRIP - 0.012, 0.0062, 0.006, 'grip', 16);
  for (let i = 0; i < 6; i++) { const ring = kit.add(all, new THREE.TorusGeometry(0.0062, 0.0011, 6, 18), rubber, 'grip-rib'); ring.rotation.y = Math.PI / 2; ring.position.x = -0.016 + i * 0.0085; }
  bar(kit, all, brass, -0.026, -0.022, 0.0068, 0.0068, 'butt', 16);
  // the tubes: each a length of one, to be drawn out as far as it has to go
  const tubes = [], collars = [];
  for (let i = 0; i < TUBES; i++) {
    const r = 0.0052 - i * 0.00062;
    const geo = new THREE.CylinderGeometry(r * 0.985, r, 1, 14, 40);
    geo.rotateZ(-Math.PI / 2); geo.translate(0.5, 0, 0);
    tubes.push(kit.add(all, geo, brass, 'tube'));
    const collar = kit.add(all, new THREE.CylinderGeometry(r + 0.0011, r + 0.0011, 0.0055, 14), brass, 'collar');
    collar.rotation.z = -Math.PI / 2;
    collars.push(collar);
  }
  const end = new THREE.Group();
  all.add(end);
  head(kit, end, { brass, rubber });
  return novelty(id, kit, {
    tip: POLE_REST, pole: { rest: POLE_REST, most }, hold, reach: 0.26,
    samples: [[0, 0, 0, 0.008], [0.04, 0, 0, 0.007], [0.09, 0, 0, 0.006]],
    animate: (tool) => {
      const L = Math.max(POLE_REST, tool.length || POLE_REST), hard = tool.rubbing || 0, ph = tool.time * 2 * Math.PI * 5.2;
      const each = (L - GRIP - headLength) / TUBES;
      // (worked back and forth: the whole pole goes with the hand)
      let x = GRIP - 0.012 + Math.sin(ph) * 0.009 * hard;
      for (let i = 0; i < TUBES; i++) {
        tubes[i].position.x = x; tubes[i].scale.x = each + 0.002;
        collars[i].position.x = x + 0.002;
        x += each;
      }
      end.position.x = x;
      rub(end, ph, hard);
    },
  });
}

/** A little carved hand, fingers crooked: the business end of a back scratcher. */
function scratcherHead(kit, end) {
  const wood = kit.patch(new THREE.MeshPhysicalMaterial({ map: woodTexture(), color: 0xd9b98a, roughness: 0.55, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.4 }));
  bar(kit, end, wood, 0, 0.012, 0.0032, 0.0042, 'wrist', 12);
  const palm = kit.add(end, new THREE.SphereGeometry(1, 18, 12), wood, 'palm');
  palm.scale.set(0.0085, 0.0038, 0.0088); palm.position.set(0.019, 0, 0);
  // four fingers and a thumb, each of two joints, bent over like a rake
  const finger = (z, long, splay) => {
    const g = new THREE.Group();
    g.position.set(0.024, 0, z); g.rotation.y = -splay;
    end.add(g);
    bar(kit, g, wood, 0, long * 0.55, 0.0019, 0.0017, 'finger', 8);
    const tip = new THREE.Group();
    tip.position.x = long * 0.55; tip.rotation.z = -1.05;
    g.add(tip);
    bar(kit, tip, wood, 0, long * 0.5, 0.0017, 0.0012, 'finger', 8);
    const nail = kit.add(tip, new THREE.SphereGeometry(0.0014, 8, 6), wood, 'fingertip');
    nail.position.x = long * 0.5;
  };
  finger(-0.0063, 0.014, -0.16); finger(-0.0021, 0.0165, -0.05); finger(0.0021, 0.0165, 0.05); finger(0.0063, 0.014, 0.16);
  const thumb = new THREE.Group();
  thumb.position.set(0.014, 0, 0.008); thumb.rotation.y = -0.9;
  end.add(thumb);
  bar(kit, thumb, wood, 0, 0.009, 0.002, 0.0015, 'thumb', 8);
}

/** A ball of lambswool on a brass cup: what a tusk is buffed with. */
function bufferHead(kit, end, { brass }) {
  const fleece = canvasTexture(128, 128, (g, w, h) => {
    const rnd = rngFrom(404);
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 5, v = 60 + rnd() * 180;
      g.strokeStyle = `rgba(${v},${v},${v},0.5)`; g.lineWidth = 1.2;
      g.beginPath(); g.arc(x, y, r, rnd() * 6, rnd() * 6 + 3.5); g.stroke();
    }
  }, false);
  fleece.repeat.set(3, 2);
  const wool = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0xf4efe2, roughness: 1, metalness: 0, bumpMap: fleece, bumpScale: 2.2, sheen: 1, sheenRoughness: 0.7, sheenColor: 0xffffff }));
  const cup = kit.add(end, lathe([[0.0028, 0], [0.006, 0.004], [0.0105, 0.012], [0.0112, 0.016]], 18), brass, 'cup');
  cup.rotation.z = -Math.PI / 2;
  const ball = kit.add(end, new THREE.SphereGeometry(0.0165, 26, 18), wool, 'fleece');
  ball.position.x = 0.026; ball.scale.set(1.05, 1, 1);
  end.userData.ball = ball;
}

function buildScratcher() {
  return buildPole('scratcher', 'belly-scratcher', {
    head: scratcherHead, headLength: 0.04,
    hold: { pos: [0.05, -0.07, -0.07], tilt: 34 * DEG, yaw: -10 * DEG, roll: 0, sway: 0.7 },
    rub: (end, ph, hard) => { end.rotation.x = Math.sin(ph * 0.5) * 0.35 * hard; end.rotation.z = (0.5 + 0.5 * Math.sin(ph)) * 0.3 * hard; },
  });
}

function buildPolish() {
  return buildPole('polish', 'tusk-buffer', {
    head: bufferHead, headLength: 0.043, brassTone: 0xb9bcc2,
    hold: { pos: [0.05, -0.07, -0.07], tilt: 34 * DEG, yaw: -10 * DEG, roll: 0, sway: 0.7 },
    rub: (end, ph, hard) => { end.rotation.x = ph * 0.7 * (hard > 0.05 ? 1 : 0); end.userData.ball.scale.set(1.05 - 0.12 * hard, 1 + 0.06 * hard, 1 + 0.06 * hard); },
  });
}

// ---- needles: a tomato pincushion, with what is left of five in it ---------------------------

export const NEEDLE = { shaft: 0.05, handle: 0.017 };

/** One needle, its point at the origin and the rest of it back along -x. (Thrown ones are made of this too.) */
export function needleGeometry() {
  const shaft = new THREE.CylinderGeometry(0.00075, 0.00012, NEEDLE.shaft, 6, 3);
  shaft.rotateZ(Math.PI / 2); shaft.translate(-NEEDLE.shaft / 2, 0, 0);
  const handle = new THREE.CylinderGeometry(0.0017, 0.0017, NEEDLE.handle, 8, 8);
  handle.rotateZ(Math.PI / 2); handle.translate(-NEEDLE.shaft - NEEDLE.handle / 2, 0, 0);
  // (the handle is wound wire: ridged)
  const p = handle.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + 0.14 * Math.sin(p.getX(i) * 2600); p.setY(i, p.getY(i) * k); p.setZ(i, p.getZ(i) * k); }
  handle.computeVertexNormals();
  return { shaft, handle };
}

function buildNeedles() {
  const kit = new Kit('needles', 0.02);
  const felt = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0xb3261c, roughness: 0.95, metalness: 0, sheen: 0.8, sheenRoughness: 0.6, sheenColor: 0xff9a8a }));
  const leaf = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0x2f6a2c, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  const steel = metal(kit, 0xd9dde2, 0.22), copper = metal(kit, 0xd08a4e, 0.35);
  const all = kit.upper;
  // the tomato: fat, with six seams pulled into it by a thread
  const body = new THREE.SphereGeometry(0.019, 36, 24);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), up = y / 0.019;
    const k = 1 - 0.07 * Math.pow(Math.abs(Math.cos(a * 3)), 0.6) * (1 - up * up) - 0.0 * up;
    p.setXYZ(i, x * k, y * 0.74 - 0.0016 * Math.pow(Math.max(0, up), 6), z * k);
  }
  body.computeVertexNormals();
  const tomato = kit.add(all, body, felt, 'pincushion');
  tomato.position.set(0.012, 0, 0);
  // its felt leaves
  for (let i = 0; i < 5; i++) {
    const l = kit.add(all, new THREE.CircleGeometry(0.0062, 3), leaf, 'leaf');
    const a = (i / 5) * Math.PI * 2;
    l.scale.set(1.5, 0.62, 1);
    l.position.set(0.012 + Math.cos(a) * 0.0058, 0.0138, Math.sin(a) * 0.0058);
    l.rotation.set(-Math.PI / 2 + 0.25, 0, -a, 'YXZ'); l.rotation.y = -a;
  }
  // five needles stood in it, points down
  const { shaft, handle } = needleGeometry();
  const stuck = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const a = (i / 5) * Math.PI * 2 + 0.4, lean = 0.34;
    g.position.set(0.012 + Math.cos(a) * 0.006, 0.004, Math.sin(a) * 0.006);
    // (a needle's point is at its origin and it runs back along -x: stood on its point, leaning outwards)
    g.rotation.set(0, -a, -Math.PI / 2 - lean, 'YXZ');
    all.add(g);
    kit.add(g, shaft, steel, 'needle');
    kit.add(g, handle, copper, 'needle-handle');
    stuck.push(g);
  }
  return novelty('needles', kit, {
    tip: 0.05, reach: 0.24,
    samples: [[0.012, 0, 0, 0.02]],
    hold: { pos: [0.04, -0.05, -0.115], tilt: 14 * DEG, yaw: -8 * DEG, roll: 0, sway: 0.8 },
    animate: (tool) => {
      const left = tool.count ?? 5;
      stuck.forEach((g, i) => { g.visible = i < left; });
      // (the arm goes back, and forward, with each one thrown)
      const k = tool.fling || 0;
      all.position.set(-0.03 * Math.sin(k * Math.PI), 0.012 * Math.sin(k * Math.PI), 0);
      all.rotation.z = 0.5 * Math.sin(k * Math.PI);
    },
  });
}

// ---- tarot: a hand of cards, backs to the world -----------------------------------------------

function cardBack() {
  return canvasTexture(128, 208, (g, w, h) => {
    g.fillStyle = '#2b2a78'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f0e2bd'; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5); g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
    g.strokeStyle = '#e9c35a'; g.lineWidth = 4; g.strokeRect(11, 11, w - 22, h - 22);
    g.lineWidth = 1.5; g.strokeRect(17, 17, w - 34, h - 34);
    // an eye in the middle, and stars round it
    g.translate(w / 2, h / 2);
    g.fillStyle = '#e9c35a';
    g.beginPath(); g.moveTo(-30, 0); g.quadraticCurveTo(0, -26, 30, 0); g.quadraticCurveTo(0, 26, -30, 0); g.fill();
    g.fillStyle = '#2b2a78'; g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e9c35a'; g.beginPath(); g.arc(0, 0, 4.5, 0, Math.PI * 2); g.fill();
    const rnd = rngFrom(1701);
    for (let i = 0; i < 26; i++) {
      const x = (rnd() - 0.5) * (w - 34), y = (rnd() - 0.5) * (h - 34);
      if (Math.abs(x) < 36 && Math.abs(y) < 24) continue;
      const r = 1.5 + rnd() * 3.5;
      g.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr = k % 2 ? r * 0.35 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
  }, true);
}

function buildTarot() {
  const kit = new Kit('tarot', 0.02);
  const back = kit.patch(new THREE.MeshPhysicalMaterial({ map: cardBack(), roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35, side: THREE.DoubleSide }));
  const all = kit.upper;
  const W = 0.042, H = 0.07;
  // (a card stands in the plane across the way the eyes look, its foot at the origin)
  const geo = new THREE.BoxGeometry(0.0005, H, W, 1, 6, 1);
  geo.translate(0, H / 2, 0);
  const cards = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    g.position.set(i * 0.0009, 0, 0);
    all.add(g);
    kit.add(g, geo, back, 'card');
    cards.push(g);
  }
  return novelty('tarot', kit, {
    tip: 0.03, reach: 0.25,
    samples: [[0, 0.012, 0, 0.014], [0, 0.04, 0, 0.018]],
    hold: { pos: [0.03, -0.086, -0.115], tilt: 10 * DEG, yaw: -10 * DEG, roll: -6 * DEG, sway: 0.8 },
    animate: (tool) => {
      // fanned; while they are being read the fan closes and opens, and each card turned is one fewer in the hand
      const dealt = tool.dealt || 0, busy = tool.reading || 0;
      cards.forEach((g, i) => {
        const open = 0.2 + 0.04 * Math.sin(tool.time * 1.3) - 0.07 * busy * Math.sin(tool.time * 9 + i);
        g.rotation.x = (i - 2) * open;
        g.visible = i < 5 - dealt;
      });
    },
  });
}

// ---- two things that spray --------------------------------------------------------------------

function label(lines, { ground, ink, accent, w = 512, h = 256 }) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = ground; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, 0, w, h * 0.12); g.fillRect(0, h * 0.88, w, h * 0.12);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // (it goes right round: said twice, so that it can be read from wherever the can is looked at)
    for (const cx of [w * 0.25, w * 0.75]) {
      lines.forEach(([text, size, colour, y]) => {
        g.font = `700 ${size}px ${LETTERS}`; g.fillStyle = colour || ink;
        g.fillText(text, cx, h * y);
      });
    }
  }, true);
}

function buildDepil() {
  const kit = new Kit('coat-off', 0.02);
  const wrap = label([['COAT-OFF', 62, '#fff6e0', 0.36], ['hair remover', 30, '#3a0d2a', 0.6], ['MAMMOTH STRENGTH', 22, '#fff6e0', 0.76]], { ground: '#d2337f', ink: '#fff6e0', accent: '#f6d34a' });
  const tin = kit.patch(new THREE.MeshPhysicalMaterial({ map: wrap, metalness: 0.55, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.25 }));
  const bare = metal(kit, 0xc9ccd2, 0.28), white = plastic(kit, 0xf2f0ea, 0.5);
  const all = kit.upper;
  const R = 0.02, H = 0.086;
  const can = kit.add(all, new THREE.CylinderGeometry(R, R, H, 48, 4, true), tin, 'can');
  can.position.y = 0; can.rotation.y = 1.9;
  // (its shoulder: a dome up to the cup the valve sits in, round enough to be looked at from a hand's breadth away)
  const dome = [[R, 0]];
  for (let i = 1; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; dome.push([R * (0.56 + 0.44 * Math.cos(a)), 0.001 + 0.0125 * Math.sin(a)]); }
  const top = kit.add(all, lathe([...dome, [R * 0.56, 0.0165], [0.0001, 0.0165]], 48), bare, 'can-top');
  top.position.y = H / 2;
  const foot = kit.add(all, lathe([[0.0001, 0.003], [R * 0.9, 0.003], [R, 0.0005], [R, 0]], 48), bare, 'can-foot');
  foot.position.y = -H / 2 - 0.0005;
  // the button on top, with the hole the spray comes out of facing forward
  const button = new THREE.Group();
  button.position.y = H / 2 + 0.0165;
  all.add(button);
  kit.add(button, new THREE.CylinderGeometry(0.0072, 0.0078, 0.0105, 18), white, 'button').position.y = 0.0052;
  const spout = kit.add(button, new THREE.CylinderGeometry(0.0016, 0.0022, 0.004, 10), white, 'spout');
  spout.rotation.z = -Math.PI / 2; spout.position.set(0.008, 0.006, 0);
  return novelty('depil', kit, {
    tip: 0.03, reach: 0.3, nozzle: [0.011, H / 2 + 0.0225, 0],
    samples: [[0, -0.02, 0, 0.022], [0, 0.025, 0, 0.022]],
    hold: { pos: [0.05, -0.05, -0.125], tilt: 4 * DEG, yaw: -6 * DEG, roll: 0, sway: 0.8 },
    animate: (tool) => {
      const on = tool.spraying || 0;
      button.position.y = H / 2 + 0.0165 - 0.0032 * on;
      all.position.set((Math.random() - 0.5) * 0.0007 * on, (Math.random() - 0.5) * 0.0007 * on, 0);
    },
  });
}

function buildNoseSpray() {
  const kit = new Kit('nose-spray', 0.02);
  const wrap = label([['TRUNK-EZE', 54, '#103a6a', 0.4], ['one squirt per mammoth', 22, '#103a6a', 0.66]], { ground: '#f4f6f8', ink: '#103a6a', accent: '#2f86c9' });
  const body = kit.patch(new THREE.MeshPhysicalMaterial({ map: wrap, metalness: 0, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
  const white = plastic(kit, 0xf4f6f8, 0.5), blue = plastic(kit, 0x2f86c9, 0.5);
  const all = kit.upper;
  // a squeezy bottle lying along the way it points, a collar, and a long snout
  const bottle = new THREE.Group();
  all.add(bottle);
  const shell = kit.add(bottle, new THREE.CylinderGeometry(0.0125, 0.0125, 0.04, 26, 4, true), body, 'bottle');
  shell.rotation.z = -Math.PI / 2; shell.rotation.x = 1.2; shell.position.x = 0.004;
  const base = kit.add(bottle, new THREE.SphereGeometry(0.0125, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), white, 'bottle-base');
  base.rotation.z = Math.PI / 2; base.scale.y = 0.45; base.position.x = -0.016;
  const shoulder = kit.add(bottle, lathe([[0.0125, 0], [0.0112, 0.004], [0.0072, 0.0075], [0.0072, 0.011]], 22), white, 'shoulder');
  shoulder.rotation.z = -Math.PI / 2; shoulder.position.x = 0.024;
  const collar = kit.add(all, new THREE.CylinderGeometry(0.0082, 0.0082, 0.005, 20), blue, 'collar');
  collar.rotation.z = -Math.PI / 2; collar.position.x = 0.0375;
  bar(kit, all, white, 0.04, 0.072, 0.0056, 0.0026, 'snout', 16);
  const tipBall = kit.add(all, new THREE.SphereGeometry(0.0027, 12, 8), white, 'snout-tip');
  tipBall.position.x = 0.072;
  return novelty('nosespray', kit, {
    tip: 0.074, reach: 0.2, nozzle: [0.075, 0, 0],
    samples: [[0.0, 0, 0, 0.014], [0.03, 0, 0, 0.011], [0.066, 0, 0, 0.005]],
    hold: { pos: [0.036, -0.046, -0.1], tilt: 18 * DEG, yaw: -12 * DEG, roll: 0, sway: 0.8 },
    animate: (tool) => {
      // squeezed: it goes thin in the hand
      const on = tool.spraying || 0;
      bottle.scale.set(1, 1 - 0.3 * on, 1 + 0.1 * on);
    },
  });
}

// ---- a plunger ---------------------------------------------------------------------------------

function buildPlunger() {
  const kit = new Kit('plunger', 0.02);
  const wood = kit.patch(new THREE.MeshPhysicalMaterial({ map: woodTexture(), roughness: 0.65, metalness: 0 }));
  const rubber = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0xa3261c, roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5, side: THREE.DoubleSide }));
  const all = kit.upper;
  bar(kit, all, wood, -0.035, 0.066, 0.0038, 0.0036, 'stick', 12);
  const knob = kit.add(all, new THREE.SphereGeometry(0.0046, 12, 8), wood, 'stick-end');
  knob.position.x = -0.035;
  // the cup: a bell of rubber, open towards whatever is to be unblocked
  const cup = kit.add(all, lathe([[0.0046, 0], [0.0062, 0.0028], [0.0105, 0.006], [0.018, 0.012], [0.0235, 0.021], [0.0262, 0.031], [0.0272, 0.0345], [0.0256, 0.0345], [0.0242, 0.0312], [0.0212, 0.0222], [0.0162, 0.0138], [0.0092, 0.0082], [0.0001, 0.0064]], 30), rubber, 'cup');
  cup.rotation.z = -Math.PI / 2; cup.position.x = 0.062;
  return novelty('plunger', kit, {
    tip: 0.097, reach: 0.22,
    samples: [[0, 0, 0, 0.007], [0.045, 0, 0, 0.007], [0.082, 0, 0, 0.022]],
    hold: { pos: [0.046, -0.06, -0.112], tilt: 15 * DEG, yaw: -12 * DEG, roll: 0, sway: 0.8 },
    animate: (tool) => {
      // pumped: pushed home (the cup flattens), and pulled back
      const k = tool.pump || 0, push = Math.max(0, Math.sin(k * Math.PI * 2));
      all.position.x = 0.014 * push - 0.03 * (tool.popped || 0);
      cup.scale.set(1 + 0.16 * push, 1 - 0.42 * push, 1 + 0.16 * push);
    },
  });
}

// ---- nail varnish: the brush out of a very large bottle of it -----------------------------------

function buildVarnish() {
  const kit = new Kit('varnish', 0.02);
  const cap = plastic(kit, 0x15141a, 0.9, 0.2), stem = plastic(kit, 0xe9e6e0, 0.3);
  const red = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0xc4112b, roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06 }));
  const gold = metal(kit, 0xd9b451, 0.3);
  const all = new THREE.Group();
  all.scale.setScalar(1.6);
  kit.upper.add(all);
  // the cap is the handle: tall, black, faceted, with a gold band where it screws on
  const handle = kit.add(all, new THREE.CylinderGeometry(0.0072, 0.0088, 0.04, 8, 1), cap, 'cap');
  handle.rotation.z = -Math.PI / 2; handle.position.x = -0.002;
  bar(kit, all, gold, 0.018, 0.022, 0.0074, 0.0074, 'band', 20);
  bar(kit, all, stem, 0.022, 0.052, 0.0017, 0.0015, 'stem', 10);
  // the brush: a flat tongue of bristle, loaded
  const brush = kit.add(all, skin([{ x: 0.05, y: 0, ry: 0.0016, rz: 0.0018, n: 2 }, { x: 0.056, y: 0, ry: 0.0022, rz: 0.0052, n: 2.6 }, { x: 0.068, y: 0, ry: 0.0019, rz: 0.006, n: 3 }, { x: 0.0725, y: 0, ry: 0.0008, rz: 0.0052, n: 3 }], 18, { capStart: true }), red, 'brush');
  const drop = kit.add(all, new THREE.SphereGeometry(0.0021, 12, 8), red, 'drop');
  drop.position.set(0.071, -0.0022, 0.001); drop.scale.set(1, 1.5, 1);
  return novelty('varnish', kit, {
    tip: 0.116, reach: 0.2,
    samples: [[0, 0, 0, 0.014], [0.056, 0, 0, 0.006], [0.105, 0, 0, 0.009]],
    hold: { pos: [0.04, -0.05, -0.105], tilt: 6 * DEG, yaw: -15 * DEG, roll: 20 * DEG, sway: 0.7 },
    animate: (tool) => {
      // a stroke across, lifted, and another
      const on = tool.painting || 0, ph = tool.time * 5.5;
      all.position.set(0.006 * on * Math.sin(ph), 0, 0.016 * on * Math.sin(ph));
      all.rotation.y = -0.3 * on * Math.sin(ph);
      brush.visible = true; drop.visible = on < 0.5;
    },
  });
}

// ---- a watch on a chain --------------------------------------------------------------------------

function dial() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#f6efdc'; g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    g.fillStyle = '#2a1a10'; g.strokeStyle = '#2a1a10';
    g.font = `700 30px ${LETTERS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((n, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      g.save(); g.translate(Math.cos(a) * 92, Math.sin(a) * 92); g.rotate(a + Math.PI / 2); g.fillText(n, 0, 0); g.restore();
    });
    // a spiral, for anyone who looks too long
    g.lineWidth = 3; g.beginPath();
    for (let t = 0; t < 26; t += 0.1) { const r = 2 + t * 2.3, x = Math.cos(t) * r, y = Math.sin(t) * r; if (t === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -58); g.moveTo(0, 0); g.lineTo(38, 20); g.stroke();
    g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
  }, true);
}

function buildWatch() {
  const kit = new Kit('watch', 0.02);
  const brass = metal(kit, 0xd9b451, 0.26);
  const face = kit.patch(new THREE.MeshPhysicalMaterial({ map: dial(), roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const all = kit.upper;
  // it hangs from the hand: everything swings about the origin
  const swing = new THREE.Group();
  all.add(swing);
  const DROP = 0.062, CASE = 0.0185;
  // the chain: links, alternately across and along
  for (let i = 0; i < 15; i++) {
    const link = kit.add(swing, new THREE.TorusGeometry(0.0021, 0.00058, 6, 12), brass, 'link');
    link.position.y = -0.002 - i * (DROP - 0.006) / 15;
    link.rotation.y = i % 2 ? Math.PI / 2 : 0;
    link.scale.y = 1.35;
  }
  const watch = new THREE.Group();
  watch.position.y = -DROP - CASE;
  swing.add(watch);
  // (its face is towards the eyes: back along -x)
  const body = kit.add(watch, new THREE.CylinderGeometry(CASE, CASE, 0.0074, 36), brass, 'case');
  body.rotation.z = Math.PI / 2;
  const rim = kit.add(watch, new THREE.TorusGeometry(CASE - 0.0008, 0.0014, 8, 36), brass, 'bezel');
  rim.rotation.y = Math.PI / 2; rim.position.x = -0.0037;
  const front = kit.add(watch, new THREE.CircleGeometry(CASE - 0.0016, 36), face, 'dial');
  front.rotation.y = -Math.PI / 2; front.position.x = -0.0039;
  bar(kit, watch, brass, -0.0018, 0.0018, 0.0026, 0.0026, 'crown', 10).position.set(0, CASE + 0.002, 0);
  const bow = kit.add(watch, new THREE.TorusGeometry(0.0036, 0.0008, 6, 16), brass, 'bow');
  bow.rotation.y = Math.PI / 2; bow.position.y = CASE + 0.0062;
  return novelty('watch', kit, {
    tip: 0.02, reach: 0.25,
    samples: [[0, -0.02, 0, 0.012], [0, -0.075, 0, 0.02]],
    hold: { pos: [0.012, 0.03, -0.14], tilt: 0, yaw: 0, roll: 0, sway: 1 },
    stow: { back: 0.06, down: 0.3 },
    animate: (tool) => {
      // to and fro across the eyes: slowly when nobody is being worked on, and to the beat when somebody is
      const on = tool.swinging || 0;
      swing.rotation.x = (0.16 + 0.5 * on) * Math.sin(tool.time * (2.2 + 2.4 * on));
      watch.rotation.x = -swing.rotation.x * 0.35;
    },
  });
}

// ---- a feather --------------------------------------------------------------------------------------

function vane() {
  return canvasTexture(256, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const rnd = rngFrom(606);
    // the blade of it: barbs running out and forward from the shaft, a few of them parted
    for (let i = 0; i < 520; i++) {
      const x = 14 + rnd() * (w - 26), t = (x - 14) / (w - 26);
      const half = (h / 2 - 5) * Math.pow(Math.sin(Math.min(1, t * 1.06) * Math.PI), 0.55) * (0.9 + 0.1 * rnd());
      const up = rnd() < 0.5 ? -1 : 1;
      if (Math.sin(x * 0.19) > 0.96 && rnd() < 0.8) continue;        // (a parting)
      const tone = t > 0.74 ? `rgba(${88 + rnd() * 30},${60 + rnd() * 24},${40 + rnd() * 16},0.95)` : `rgba(${236 + rnd() * 19},${228 + rnd() * 20},${206 + rnd() * 24},0.95)`;
      g.strokeStyle = tone; g.lineWidth = 1.1 + rnd() * 0.9;
      g.beginPath(); g.moveTo(x, h / 2); g.quadraticCurveTo(x + 9, h / 2 + up * half * 0.55, x + 20 + rnd() * 6, h / 2 + up * half); g.stroke();
    }
    g.strokeStyle = 'rgba(250,244,226,1)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w - 8, h / 2); g.stroke();
  }, true);
}

function buildFeather() {
  const kit = new Kit('feather', 0.02);
  const tex = vane();
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const plume = kit.patch(new THREE.MeshPhysicalMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, metalness: 0, sheen: 0.6, sheenRoughness: 0.5 }));
  const quill = kit.patch(new THREE.MeshPhysicalMaterial({ color: 0xf2ead6, roughness: 0.4, metalness: 0, clearcoat: 0.4 }));
  const all = kit.upper;
  const LEN = 0.16;
  bar(kit, all, quill, -0.028, LEN * 0.2, 0.0016, 0.0012, 'quill', 8);
  // the vane: a strip bowed along its length and dished across it, in a few pieces so that it can bend
  const geo = new THREE.PlaneGeometry(LEN, 0.056, 24, 6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + LEN / 2, y = p.getY(i), t = x / LEN;
    p.setXYZ(i, x - 0.004, 0.014 * t * t + 3.2 * y * y, y);
  }
  geo.computeVertexNormals();
  const blade = kit.add(all, geo, plume, 'vane');
  blade.userData.rest = Float32Array.from(p.array);
  return novelty('feather', kit, {
    tip: LEN - 0.006, reach: 0.21,
    samples: [[0, 0, 0, 0.006], [0.06, 0.003, 0, 0.014], [0.125, 0.01, 0, 0.014]],
    hold: { pos: [0.042, -0.092, -0.115], tilt: 56 * DEG, yaw: -9 * DEG, roll: 10 * DEG, sway: 1 },
    animate: (tool) => {
      // it wavers by itself; and tickling is a quick small circling of the end of it
      const on = tool.tickling || 0, t = tool.time;
      all.rotation.y = 0.05 * Math.sin(t * 1.7) + 0.22 * on * Math.sin(t * 23);
      all.rotation.z = 0.04 * Math.sin(t * 1.3 + 1) + 0.16 * on * Math.cos(t * 23);
      all.rotation.x = 0.1 * Math.sin(t * 0.9) + 0.3 * on * Math.sin(t * 11);
    },
  });
}

/** All ten, in the order the stall lists them. */
export function buildNovelties() {
  return [buildFeather(), buildNoseSpray(), buildScratcher(), buildVarnish(), buildTarot(), buildPlunger(), buildNeedles(), buildPolish(), buildWatch(), buildDepil()];
}

export const NOVELTY_ORDER = ['feather', 'nosespray', 'scratcher', 'varnish', 'tarot', 'plunger', 'needles', 'polish', 'watch', 'depil'];
