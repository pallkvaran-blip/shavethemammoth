// Getting off the ground: the ladders and the packs, as things in the world.
//
// How the elf moves on them is in CameraRig (controls.js). This file makes
// what is seen and heard of it: the ladder under his feet, the pack on his
// back, what comes out of the pack, the snow it blows about, and the gauge
// that says how much is left in the tank.
//
// A ladder is only ever seen from on top of it, looking down. It stands at
// full length where it was put, but is drawn no higher than the elf's feet:
// it goes up as he does, like the ladder on a fire engine, and nothing of it
// is ever between him and the hair he has come up to cut.
import * as THREE from 'three';
import { U } from '../gfx/globals.js';
import { Model } from './people/model.js';
import { canvasTexture, woodTexture } from './tool.js';
import { ITEMS } from './catalog.js';

const cutY = { value: 1e6 };       // nothing of a ladder is drawn above this height
const ladderDepth = new THREE.ShaderMaterial({
  uniforms: { uCutY: cutY },
  vertexShader: /* glsl */ `varying float vY; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */ `uniform float uCutY; varying float vY; void main() { if (vY > uCutY) discard; gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }`,
  side: THREE.DoubleSide,
});
const LADDER = { patch: { key: 'ladder', bias: 0.03, extraUniforms: { uCutY: cutY }, fragmentHead: 'uniform float uCutY;', extraFragment: 'if (vWPos.y > uCutY) discard;' }, depth: ladderDepth };

function spatter() {
  // a painter's ladder: more paint on it than on anything he painted
  return canvasTexture(64, 256, (g, w, h) => {
    g.fillStyle = '#b08a5a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(60,36,14,${0.1 + Math.random() * 0.2})`; g.lineWidth = 0.6 + Math.random(); const x = Math.random() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 5, h); g.stroke(); }
    for (let i = 0; i < 70; i++) {
      g.fillStyle = ['#e8e2d2', '#7fb0c9', '#c9523f', '#e3c65a', '#e8e2d2'][i % 5];
      g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 1 + Math.random() * 7, Math.random(), 0, 7); g.fill();
    }
  }, true);
}

function crateTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#b3251c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a0806';
    for (let y = 14; y < h - 30; y += 22) for (let x = 10; x < w - 10; x += 20) g.fillRect(x, y, 13, 14);
    g.fillStyle = '#f0e6d0'; g.font = 'bold 15px Georgia, serif'; g.textAlign = 'center';
    g.fillText('PROPERTY OF', w / 2, h - 16); g.fillText('A DAIRY', w / 2, h - 3);
  }, true);
}

/** Rails and rungs up to `top`, leaning `lean` metres towards +z for every metre it rises. */
function runged(M, rail, rung, { top, lean, wide, every, railR, rungR, over = 0.12 }) {
  const all = M.group, len = top + over;
  for (const s of [-1, 1]) M.rod(all, rail, [s * wide / 2, -0.05, -0.05 * lean], [s * wide / 2, len, len * lean], railR);
  for (let y = every * 0.6; y < len - 0.03; y += every) M.rod(all, rung, [-wide / 2, y, y * lean], [wide / 2, y, y * lean], rungR);
}

function buildLadders() {
  const out = {};
  {
    // the milk crate: what it says
    const M = new Model('milk-crate', LADDER), c = ITEMS.crate.climb;
    const plastic = M.mat(0xffffff, { rough: 0.5, coat: 0.3, map: crateTexture() });
    M.box(M.group, plastic, [0.34, c.top - 0.004, 0.34], [0, (c.top - 0.004) / 2, 0]);
    out.crate = M;
  }
  {
    // the step ladder: two rails with treads up the front, two legs behind, a cap on top
    const M = new Model('step-ladder', LADDER), c = ITEMS.step.climb;
    const alu = M.mat(0xb9c0c6, { rough: 0.35, metal: 0.9 }), cap = M.mat(0xd9a521, { rough: 0.5, coat: 0.3 }), foot = M.mat(0x1c1d20, { rough: 0.8 });
    const all = M.group, top = c.top, lean = c.lean;
    for (const s of [-1, 1]) {
      M.rod(all, alu, [s * 0.19, 0, 0], [s * 0.15, top, top * lean], 0.012);
      M.rod(all, alu, [s * 0.19, 0, top * lean + 0.42], [s * 0.15, top, top * lean + 0.03], 0.01);
      M.ball(all, foot, 0.016, [s * 0.19, 0.008, 0], [1, 0.6, 1.4]);
      M.ball(all, foot, 0.016, [s * 0.19, 0.008, top * lean + 0.42], [1, 0.6, 1.4]);
      M.rod(all, alu, [s * 0.175, top * 0.45, top * 0.45 * lean], [s * 0.175, top * 0.45, top * lean + 0.42 - 0.39 * 0.45], 0.004);      // the stay
    }
    for (let y = 0.2; y < top - 0.05; y += 0.2) M.box(all, alu, [0.36 - y * 0.07, 0.012, 0.07], [0, y, y * lean + 0.02]);
    M.box(all, cap, [0.34, 0.03, 0.16], [0, top - 0.015, top * lean + 0.03]);
    out.step = M;
  }
  {
    const M = new Model('painters-ladder', LADDER), c = ITEMS.painter.climb;
    const tex = spatter();
    const wood = M.mat(0xffffff, { rough: 0.8, map: tex }), dowel = M.mat(0xffffff, { rough: 0.75, map: woodTexture() });
    runged(M, wood, dowel, { top: c.top, lean: c.lean, wide: 0.32, every: 0.24, railR: 0.016, rungR: 0.011 });
    out.painter = M;
  }
  {
    const M = new Model('fire-ladder', LADDER), c = ITEMS.fire.climb;
    const red = M.mat(0xb3211a, { rough: 0.45, coat: 0.5 }), steel = M.mat(0xd8dadd, { rough: 0.35, metal: 0.9 });
    runged(M, red, steel, { top: c.top, lean: c.lean, wide: 0.38, every: 0.26, railR: 0.02, rungR: 0.012 });
    // (a brace up each side, as on the real thing)
    for (const s of [-1, 1]) M.rod(M.group, red, [s * 0.19, 0.3, 0.3 * c.lean - 0.05], [s * 0.19, c.top * 0.7, c.top * 0.7 * c.lean - 0.05], 0.008);
    out.fire = M;
  }
  return out;
}

/** The packs, as worn: built about a point between the shoulder blades, +z out of his back... which is -z of the elf. */
function buildPacks() {
  const out = {};
  {
    // two bottles of pop, upside down, on a belt
    const M = new Model('pop-belt');
    const glass = M.mat(0x2f7d3a, { rough: 0.12, coat: 1 }), label = M.mat(0xe9dfc8, { rough: 0.8 }), strap = M.mat(0x3a2414, { rough: 0.8 }), capM = M.mat(0xc9a13f, { rough: 0.3, metal: 1 });
    for (const s of [-1, 1]) {
      M.rod(M.group, glass, [s * 0.021, 0.03, -0.018], [s * 0.021, -0.022, -0.018], 0.016, 0.016);
      M.rod(M.group, glass, [s * 0.021, -0.022, -0.018], [s * 0.021, -0.045, -0.018], 0.016, 0.006);
      M.rod(M.group, label, [s * 0.021, 0.02, -0.018], [s * 0.021, -0.008, -0.018], 0.0168, 0.0168);
      M.rod(M.group, capM, [s * 0.021, -0.045, -0.018], [s * 0.021, -0.05, -0.018], 0.007, 0.007);
    }
    const belt = M.add(M.group, new THREE.TorusGeometry(0.04, 0.004, 6, 22), strap, 'belt');
    belt.rotation.x = Math.PI / 2; belt.position.set(0, 0.002, 0.03); belt.scale.set(1.1, 1.05, 1);
    out.soda = { M, nozzles: [[-0.021, -0.05, -0.018], [0.021, -0.05, -0.018]], look: 'foam' };
  }
  {
    // two leaf blowers and a rucksack
    const M = new Model('blower-pack');
    const orange = M.mat(0xd9661f, { rough: 0.5, coat: 0.3 }), dark = M.mat(0x1c1d20, { rough: 0.6 }), canvas = M.mat(0x6b6f4a, { rough: 0.95 });
    M.box(M.group, canvas, [0.07, 0.07, 0.03], [0, 0, -0.016]);
    for (const s of [-1, 1]) {
      M.ball(M.group, orange, 0.02, [s * 0.036, 0.012, -0.03], [1, 1.1, 1]);
      M.rod(M.group, dark, [s * 0.036, 0, -0.03], [s * 0.04, -0.07, -0.026], 0.011, 0.014);
      M.rod(M.group, dark, [s * 0.036, 0.03, -0.03], [s * 0.036, 0.04, -0.03], 0.004);
    }
    out.blower = { M, nozzles: [[-0.04, -0.07, -0.026], [0.04, -0.07, -0.026]], look: 'air' };
  }
  {
    // the real thing
    const M = new Model('jet-pack');
    const steel = M.mat(0xc7ccd2, { rough: 0.28, metal: 1 }), red = M.mat(0xb3211a, { rough: 0.4, coat: 0.6 }), dark = M.mat(0x14151a, { rough: 0.5, metal: 0.6 });
    const glow = M.mat(0x200806, { rough: 0.4, emissive: 0xff5a2a, glow: 0 });
    M.box(M.group, dark, [0.05, 0.06, 0.02], [0, 0.004, -0.012]);
    for (const s of [-1, 1]) {
      M.rod(M.group, steel, [s * 0.03, 0.04, -0.026], [s * 0.03, -0.035, -0.026], 0.017, 0.017);
      M.ball(M.group, red, 0.017, [s * 0.03, 0.04, -0.026], [1, 0.9, 1]);
      M.rod(M.group, dark, [s * 0.03, -0.035, -0.026], [s * 0.03, -0.055, -0.026], 0.012, 0.018);
      M.box(M.group, red, [0.003, 0.045, 0.03], [s * 0.048, -0.01, -0.03]);
    }
    const lamp = M.ball(M.group, glow, 0.005, [0, 0.03, -0.024]);
    out.jet = { M, nozzles: [[-0.03, -0.055, -0.026], [0.03, -0.055, -0.026]], look: 'fire', lamp: glow };
  }
  return out;
}

const LOOKS = {
  // what leaves the pack: colour (in the scene's light), how it is blended, size, how long it lasts, how fast it goes, how it falls
  foam: { colour: [2.3, 2.2, 2.1], add: false, size: [0.012, 0.03], life: [0.35, 0.7], speed: 2.6, spread: 0.5, gravity: 5, grow: 0.5, alpha: 0.85 },
  air: { colour: [1.7, 1.65, 1.6], add: false, size: [0.02, 0.05], life: [0.25, 0.5], speed: 3.4, spread: 0.35, gravity: 0.5, grow: 2.5, alpha: 0.28 },
  fire: { colour: [9, 4.2, 1.1], add: true, size: [0.014, 0.034], life: [0.12, 0.26], speed: 3.8, spread: 0.2, gravity: -0.5, grow: 1.2, alpha: 0.9 },
  snow: { colour: [1.9, 1.85, 1.8], add: false, size: [0.03, 0.07], life: [0.5, 1.1], speed: 1.2, spread: 1, gravity: 1.2, grow: 2.2, alpha: 0.35 },
  // (not from a pack)
  gas: { colour: [0.95, 1.3, 0.45], add: false, size: [0.08, 0.2], life: [1.4, 2.8], speed: 1, spread: 0.5, gravity: -0.3, grow: 2.6, alpha: 0.26 },
};
const MAX = 160;

/** Puffs: foam, air, flame, and the snow they kick up. One set of points for each way of blending. */
export class Puffs {
  constructor(scene) {
    this.sets = [false, true].map((add) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(MAX * 3), data = new Float32Array(MAX * 4), col = new Float32Array(MAX * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aData', new THREE.BufferAttribute(data, 4));        // size (m), life left (0..1), alpha, -
      geo.setAttribute('aColour', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uPxScale: U.uPxScale },
        transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: /* glsl */ `
          uniform float uPxScale; attribute vec4 aData; attribute vec3 aColour; varying vec4 vColour;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aData.y > 0.0 ? clamp(aData.x * 2.0 * uPxScale / max(0.02, -mv.z), 1.0, 400.0) : 0.0;
            vColour = vec4(aColour, aData.z * smoothstep(0.0, 0.25, aData.y) * smoothstep(1.0, 0.8, aData.y));
          }`,
        fragmentShader: /* glsl */ `
          varying vec4 vColour;
          void main() {
            float r = length(gl_PointCoord - 0.5) * 2.0;
            float a = vColour.a * smoothstep(1.0, 0.25, r);
            if (a < 0.004) discard;
            gl_FragColor = vec4(vColour.rgb, a);
          }`,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false; points.renderOrder = 4;
      scene.add(points);
      return { points, pos, data, col, vel: new Float32Array(MAX * 3), span: new Float32Array(MAX), grow: new Float32Array(MAX), fall: new Float32Array(MAX), size0: new Float32Array(MAX), next: 0, live: 0 };
    });
  }

  emit(look, x, y, z, vx, vy, vz) {
    const L = LOOKS[look], s = this.sets[L.add ? 1 : 0], k = s.next;
    s.next = (k + 1) % MAX;
    const r = Math.random;
    s.pos[k * 3] = x; s.pos[k * 3 + 1] = y; s.pos[k * 3 + 2] = z;
    s.vel[k * 3] = vx + (r() - 0.5) * L.spread; s.vel[k * 3 + 1] = vy + (r() - 0.5) * L.spread * 0.5; s.vel[k * 3 + 2] = vz + (r() - 0.5) * L.spread;
    s.size0[k] = L.size[0] + r() * (L.size[1] - L.size[0]);
    s.span[k] = L.life[0] + r() * (L.life[1] - L.life[0]);
    s.grow[k] = L.grow; s.fall[k] = L.gravity;
    s.data[k * 4] = s.size0[k]; s.data[k * 4 + 1] = 1; s.data[k * 4 + 2] = L.alpha;
    const shade = 0.85 + r() * 0.3;
    s.col[k * 3] = L.colour[0] * shade; s.col[k * 3 + 1] = L.colour[1] * shade; s.col[k * 3 + 2] = L.colour[2] * shade;
    s.live = 2;
  }

  update(dt, ground) {
    for (const s of this.sets) {
      if (!s.live) continue;
      let any = false;
      for (let k = 0; k < MAX; k++) {
        let life = s.data[k * 4 + 1];
        if (life <= 0) continue;
        life -= dt / s.span[k];
        s.data[k * 4 + 1] = Math.max(0, life);
        if (life <= 0) continue;
        any = true;
        s.vel[k * 3 + 1] -= s.fall[k] * dt;
        const drag = Math.exp(-2.2 * dt);
        s.vel[k * 3] *= drag; s.vel[k * 3 + 2] *= drag;
        s.pos[k * 3] += s.vel[k * 3] * dt; s.pos[k * 3 + 1] += s.vel[k * 3 + 1] * dt; s.pos[k * 3 + 2] += s.vel[k * 3 + 2] * dt;
        const floor = ground(s.pos[k * 3], s.pos[k * 3 + 2]) + 0.01;
        if (s.pos[k * 3 + 1] < floor) { s.pos[k * 3 + 1] = floor; s.vel[k * 3 + 1] *= -0.2; }
        s.data[k * 4] = s.size0[k] * (1 + s.grow[k] * (1 - life));
      }
      const g = s.points.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.aData.needsUpdate = true; g.attributes.aColour.needsUpdate = true;
      if (!any) s.live = Math.max(0, s.live - 1);
    }
  }
}

export class Lift {
  constructor({ scene, rig, terrain, sound, hero }) {
    Object.assign(this, { scene, rig, terrain, sound, hero });
    this.ladders = buildLadders();
    this.packs = buildPacks();
    this.casters = [];
    for (const M of Object.values(this.ladders)) { M.group.visible = false; scene.add(M.group); this.casters.push(...M.meshes); }
    for (const p of Object.values(this.packs)) { p.M.group.visible = false; hero.wear(p.M); }
    this.puffs = new Puffs(scene);
    this.worn = null;
    this.power = 0;
    this.voice = null;
    this.gauge = document.getElementById('fuel');
    this._v = new THREE.Vector3(); this._m = new THREE.Matrix4();
    rig.onLift = (what) => this.heard(what);
  }

  /** What the elf has to go up with (see Game.applyUpgrades): null, a ladder, or a pack. */
  use(lift) {
    const pack = lift && lift.kind === 'pack' ? lift.id : null;
    if (this.voice && this.voice !== pack) this.sound.motor(this.voice, 0, 0, 0);
    for (const [id, p] of Object.entries(this.packs)) p.M.group.visible = id === pack;
    this.worn = pack ? this.packs[pack] : null;
    this.voice = pack;
    if (this.gauge) { this.gauge.hidden = !pack; if (pack) this.gauge.title = ITEMS[pack].name; }
    document.body.classList.toggle('lift', !!lift);
  }

  heard(what) {
    const s = this.sound;
    if (what === 'rung') s.rung();
    else if (what === 'up') s.clatter(4);
    else if (what === 'hop') s.clatter(1);
    else if (what === 'away') s.clatter(5);
    else if (what === 'thud') s.thud(true);
    else if (what === 'land') s.thud(false);
    else if (what === 'empty') s.blip('no');
  }

  update(dt) {
    const rig = this.rig, feet = rig.pos.y - 0.17;
    // ---- the ladder ----
    const L = rig.mode === 'elf' ? rig.ladder : null;
    for (const [id, M] of Object.entries(this.ladders)) M.group.visible = !!(L && rig.lift && rig.lift.id === id);
    if (L && rig.lift) {
      const g = this.ladders[rig.lift.id].group;
      // it rocks from foot to foot as it is walked sideways
      const rock = Math.sin((L.hop || 0) * Math.PI) * 0.035 * (this.rig.keys.has('KeyA') || this.rig.keys.has('KeyD') || this.rig.keys.has('ArrowLeft') || this.rig.keys.has('ArrowRight') ? 1 : 0);
      g.position.set(L.x, this.terrain.height(L.x, L.z), L.z);
      g.rotation.set(0, Math.atan2(L.dx, L.dz), rock, 'YXZ');
      g.updateMatrixWorld(true);
      cutY.value = feet + 0.012;
    }

    // ---- the pack ----
    const want = rig.mode === 'elf' && rig.thrusting ? 1 : 0;
    this.power += (want - this.power) * Math.min(1, dt * (want ? 14 : 6));
    if (this.power < 0.004) this.power = 0;
    if (this.voice) this.sound.motor(this.voice, this.power, 0, 0);
    rig.shake = this.power * (this.voice === 'jet' ? 1 : this.voice === 'blower' ? 0.7 : 0.5);
    const p = this.worn;
    if (p) {
      if (p.lamp) p.lamp.emissiveIntensity = 2 + 14 * this.power;
      if (this.power > 0.3) {
        // out of each nozzle, and off the snow underneath when he is near it
        const m = this._m.copy(p.M.group.matrixWorld), v = this._v;
        const n = Math.max(1, Math.round(this.power * dt * 150));
        for (let i = 0; i < n; i++) {
          const nz = p.nozzles[i % 2];
          v.set(nz[0], nz[1], nz[2]).applyMatrix4(m);
          const L2 = LOOKS[p.look];
          this.puffs.emit(p.look, v.x, v.y, v.z, 0, -L2.speed + rig.vy * 0.5, 0);
        }
        if (rig.height < 0.9 && Math.random() < dt * 40) {
          const a = Math.random() * Math.PI * 2, r = 0.05 + Math.random() * 0.12, x = rig.pos.x + Math.cos(a) * r, z = rig.pos.z + Math.sin(a) * r;
          this.puffs.emit('snow', x, this.terrain.height(x, z) + 0.02, z, Math.cos(a) * 1.4, 0.5, Math.sin(a) * 1.4);
        }
      }
    }
    this.puffs.update(dt, (x, z) => this.terrain.height(x, z));

    // ---- the gauge ----
    if (this.gauge && !this.gauge.hidden && rig.lift && rig.lift.kind === 'pack') {
      const full = Math.max(0, Math.min(1, rig.fuel / rig.lift.tank));
      if (Math.abs(full - (this.shown ?? -1)) > 0.004) {
        this.shown = full;
        this.gauge.firstElementChild.style.transform = `scaleX(${full.toFixed(3)})`;
        this.gauge.classList.toggle('low', full < 0.2);
      }
    }
  }
}
