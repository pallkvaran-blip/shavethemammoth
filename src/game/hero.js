// The elf in the world, and his moment of glory.
//
// Most of the time the player looks out of the elf's eyes and sees nothing of
// him but his shadow. Seen from further off (before the shaving starts) he
// stands by the mammoth's foreleg, waiting. And whenever he gets a new cutting
// tool the game stops to admire it: the camera steps outside him, he thrusts
// the thing over his head, the light bursts out behind it, a fanfare plays,
// the camera goes once round him and back in through the back of his head.
// Each tool gets the scene it deserves.
import * as THREE from 'three';
import { U } from '../gfx/globals.js';
import { buildElf } from './people/elf.js';
import { ITEMS } from './catalog.js';
import { canvasTexture } from './tool.js';

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const span = (t, a, b) => clamp01((t - a) / (b - a));

/** How each tool is received. Times are seconds into the scene. */
const ACTS = {
  // small, bad: the fanfare thinks better of it, and so does he
  scissors: { hands: 'one', sad: [1.25, 2.1], snips: [2.75, 3.1], fanfare: 'droop', glory: 0.45 },
  sheep: { hands: 'one', snips: [2.0, 2.3, 2.6], fanfare: 'grand', glory: 1 },
  // bigger than he is: held like a barbell, for as long as his knees last
  garden: { hands: 'two', strain: [1.3, 3.6], fanfare: 'grand', glory: 1 },
  // it goes off in his hand
  shaver: { hands: 'one', buzz: [1.7, 3.3], shake: 0.45, fanfare: 'grand', glory: 1 },
  electric: { hands: 'one', buzz: [1.7, 3.4], shake: 1, fanfare: 'grand', glory: 1.15 },
};
const T_LIFT = 0.28, T_UP = 0.8, T_ROUND = 4.3, T_END = 5.05;

function raysTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + (rnd() - 0.5) * 0.12, wide = 0.035 + rnd() * 0.07, long = (0.55 + rnd() * 0.45) * (w / 2);
      const grad = g.createLinearGradient(0, 0, Math.cos(a) * long, Math.sin(a) * long);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.4)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a - wide) * long, Math.sin(a - wide) * long); g.lineTo(Math.cos(a + wide) * long, Math.sin(a + wide) * long); g.closePath(); g.fill();
    }
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.28);
    glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.fillRect(-w / 2, -h / 2, w, h);
  }, true);
}

function starTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    g.fillStyle = '#fff';
    for (const [rx, ry] of [[w * 0.48, w * 0.05], [w * 0.05, w * 0.48]]) { g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.2);
    glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.fillRect(-w / 2, -h / 2, w, h);
  }, true);
}

export class Hero {
  constructor({ scene, camera, rig, shaving, terrain, mammoth, sound }) {
    Object.assign(this, { scene, camera, rig, shaving, terrain, mammoth, sound });
    this.elf = buildElf();
    scene.add(this.elf.group);
    this.casters = this.elf.meshes;
    this.time = 0;
    this.seen = true;
    this.playing = null;          // the scene under way, if any
    this.height = 0;              // how far the elf's feet are off the snow (a ladder, a jet pack)

    // the light behind the prize: two wheels of rays turning against each other, and a few stars
    const glow = (map, colour) => new THREE.MeshBasicMaterial({ map, color: colour, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
    const rays = raysTexture();
    this.rays = [glow(rays, 0xffffff), glow(rays, 0xffffff)].map((m) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
      mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 5;
      scene.add(mesh);
      return mesh;
    });
    const star = starTexture();
    this.stars = Array.from({ length: 10 }, () => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glow(star, 0xffffff));
      mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 6;
      mesh.userData = { life: 0, at: new THREE.Vector3(), size: 0.03 };
      scene.add(mesh);
      return mesh;
    });
    this._bounds = {};
    this._c = new THREE.Vector3(); this._f = new THREE.Vector3(); this._s = new THREE.Vector3(); this._x = new THREE.Vector3(); this._z = new THREE.Vector3();
    this._hand = new THREE.Vector3(); this._item = new THREE.Vector3(); this._eye = new THREE.Vector3(); this._look = new THREE.Vector3();
    this._sd = new Float32Array(4);
    this.banner = document.getElementById('got');
  }

  /** Whether the elf's own body is drawn (his shadow always is). */
  _show(on) {
    if (on === this.seen) return;
    this.seen = on;
    for (const m of this.elf.meshes) { if (on) m.layers.enable(0); else m.layers.disable(0); }
  }

  /** The box a tool fills in its own frame (x along the blades). */
  _box(tool) {
    if (this._bounds[tool.id]) return this._bounds[tool.id];
    const g = tool.group, keep = g.matrix.clone(), box = new THREE.Box3(), part = new THREE.Box3();
    g.matrix.identity(); g.updateMatrixWorld(true);
    for (const m of tool.meshes) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(part.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
    }
    g.matrix.copy(keep); g.updateMatrixWorld(true);
    return (this._bounds[tool.id] = box);
  }

  /**
   * Play the scene for a tool just got. `away` is a point (x, z) to turn the
   * elf's back on and keep clear of (a stall); without one it is the mammoth.
   * Returns false if the tool has no scene.
   */
  celebrate(id, { away = null, onDone = null } = {}) {
    const act = ACTS[id], tool = this.shaving.tools[id];
    if (!act || !tool || this.playing) return false;
    const rig = this.rig, p = rig.pos;
    // where to stand: with room for the camera to go right round
    const c = new THREE.Vector3(p.x, 0, p.z), f = new THREE.Vector3();
    if (away) {
      f.set(p.x - away.x, 0, p.z - away.z);
      const d = f.length() || 1;
      f.multiplyScalar(1 / d);
      const clear = (away.r || 0.5) + 0.85;
      if (d < clear) c.set(away.x + f.x * clear, 0, away.z + f.z * clear);
    } else {
      const sd = this._sd;
      this.mammoth.sampler.sampleVolume(p.x, 0.3, p.z, sd);
      f.set(sd[0], 0, sd[2]);
      if (f.lengthSq() < 1e-6) f.set(1, 0, 0.5);
      f.normalize();
      if (sd[3] < 1.0) c.addScaledVector(f, 1.0 - sd[3]);
    }
    c.y = this.terrain.height(c.x, c.z);
    const box = this._box(tool);
    const item = ITEMS[id] || { name: tool.name };
    this.playing = {
      id, act, tool, onDone, t: 0, c, f, facing: Math.atan2(f.x, f.z), box, skipped: false,
      snipped: 0, buzzing: false, burst: false, sung: false,
      // how much room the picture needs: him, and the thing over his head
      top: act.hands === 'two' ? 0.3 : 0.235 + (box.max.x - box.min.x * 0.55), wide: act.hands === 'two' ? (box.max.x - box.min.x) / 2 + 0.03 : 0.16,
      was: { fov: this.camera.fov, yaw: rig.yaw, pitch: rig.pitch },
    };
    // he is put where the scene is, facing out
    rig.pos.x = c.x; rig.pos.z = c.z;
    rig.yaw = this.playing.facing + Math.PI; rig.pitch = 0;
    rig.cine = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40 };
    this.shaving.present(id);
    U.uToolNear.value = 0;
    const e = this.elf;
    Object.assign(e.want, { lift: 0, two: act.hands === 'two' ? 1 : 0, strain: 0, buzz: 0, sad: 0, proud: 1, walk: 0, carry: 1, lookYaw: 0, lookPitch: 0 });
    e.settle();
    this._show(true);
    document.body.classList.add('cine');
    if (this.banner) {
      this.banner.querySelector('.what').textContent = `${item.name}!`;
      this.banner.querySelector('.quip').textContent = item.got || '';
      this.banner.classList.remove('show');
      this.banner.hidden = false;
    }
    this._place(0);
    return true;
  }

  /** Dev: go straight to a moment of the scene, with the elf already in the pose for it. */
  jump(t) {
    const s = this.playing;
    if (!s) return;
    s.t = t; s.sung = true;
    this._place(0);
    Object.assign(this.elf.pose, this.elf.want);
    if (s.act.buzz) s.tool.power = s.buzzing ? 1 : 0;
    this._place(1 / 60);
  }

  /** Any key or click: get on with it. */
  skip() {
    const s = this.playing;
    if (s && s.t > 0.5 && s.t < T_ROUND) { s.t = T_ROUND; s.skipped = true; }
  }

  /** Put the elf, the prize, the light and the camera where the scene has them at its present moment. */
  _place(dt) {
    const s = this.playing, e = this.elf, act = s.act, t = s.t, tool = s.tool, cam = this.rig.cine;
    const up = smooth(span(t, T_LIFT, T_UP)), down = smooth(span(t, T_ROUND, T_ROUND + 0.45));
    const held = up * (1 - down);
    // ---- the elf ----
    e.want.lift = t < T_ROUND ? (t > T_LIFT ? 1 : 0) : 0;
    e.want.carry = 1;
    e.want.proud = act.sad && t > act.sad[0] ? 0.2 : 1;
    e.want.sad = act.sad && t < T_ROUND ? smooth(span(t, act.sad[0], act.sad[1])) : 0;
    e.want.strain = act.strain && t < T_ROUND ? smooth(span(t, act.strain[0], act.strain[1])) : 0;
    let power = 0;
    if (act.buzz) {
      const on = t > act.buzz[0] && t < Math.min(act.buzz[1], T_ROUND);
      if (on !== s.buzzing) { s.buzzing = on; this.sound.switch(tool.def.voice, on); }
      tool.on = on;
      tool.power += ((on ? 1 : 0) - tool.power) * Math.min(1, dt * (on ? 12 : 5));
      if (!on && tool.power < 0.01) tool.power = 0;
      tool.buzz += dt * tool.power;
      if (tool.def.animate) tool.def.animate(tool, dt);
      power = tool.power;
      this.sound.motor(tool.def.voice, power, 0, 0);
    }
    e.want.buzz = power * (act.shake || 0);
    // he looks up at what he is holding when it lets him down, and out at his public otherwise
    e.want.lookPitch = e.want.sad > 0.3 ? 0.5 : 0;
    e.group.position.set(s.c.x, s.c.y, s.c.z);
    e.group.rotation.y = s.facing;
    e.update(dt, this.time);

    // ---- the prize, in his hand (or across both) ----
    const F = s.f, S = this._s.set(F.z, 0, -F.x);                // his own left-to-right... (facing +z, his left is +x)
    const X = this._x, Z = this._z, lift = e.pose.lift;
    let ix, iy, iz;
    if (act.hands === 'two') {
      const mid = e.hand('both', this._hand), tilt = 0.14 * Math.sin(this.time * 2.3) * e.pose.strain + 0.05 * (1 - lift);
      X.copy(S).multiplyScalar(Math.cos(tilt)); X.y = Math.sin(tilt);
      const cx = (s.box.min.x + s.box.max.x) / 2;
      ix = mid.x - X.x * cx + F.x * 0.012; iy = mid.y - X.y * cx + 0.006; iz = mid.z - X.z * cx + F.z * 0.012;
      this._item.copy(mid);
    } else {
      const hand = e.hand('R', this._hand), lean = 0.14;
      // blades to the sky once it is up; on the way there, out in front of him
      const k = smooth(clamp01(lift));
      X.set(F.x * (1 - k) * 0.9 - S.x * lean * k, 0.35 + 0.65 * k, F.z * (1 - k) * 0.9 - S.z * lean * k).normalize();
      const gx = s.box.min.x * 0.55;
      ix = hand.x - X.x * gx + F.x * 0.006; iy = hand.y - X.y * gx; iz = hand.z - X.z * gx + F.z * 0.006;
      this._item.set(ix + X.x * (s.box.max.x * 0.5), iy + X.y * (s.box.max.x * 0.5), iz + X.z * (s.box.max.x * 0.5));
    }
    // the flat of the blades faces the way he does
    const Y = this._f.copy(F).addScaledVector(X, -F.dot(X)).normalize();
    Z.crossVectors(X, Y);
    tool.group.matrix.makeBasis(X, Y, Z).setPosition(ix, iy, iz);
    tool.group.matrixWorld.copy(tool.group.matrix);
    tool.group.updateMatrixWorld(true);
    // (held across both hands, a pair of clippers is shut: a bar with blades on the end)
    if (act.hands === 'two') tool.setAngle(tool.def.open * 0.08);
    // a snip or two in the air
    if (act.snips) {
      let a = tool.def.open;
      for (const at of act.snips) {
        const u = (t - at) / 0.26;
        if (u > 0 && u < 1) a = tool.def.open * (u < 0.35 ? 1 - u / 0.35 : (u - 0.35) / 0.65);
      }
      tool.setAngle(a);
      while (s.snipped < act.snips.length && t >= act.snips[s.snipped] + 0.09) { s.snipped++; this.sound.clack(tool.def.voice, 1); }
    }

    // ---- the light ----
    const glory = act.glory * held * (act.sad ? 1 - 0.75 * smooth(span(t, act.sad[0], act.sad[1])) : 1);
    const pop = t < T_UP ? 0 : 1 + 0.35 * Math.exp(-(t - T_UP) * 7) * Math.cos((t - T_UP) * 16);
    const eye = this._eye.copy(cam.pos), back = this._look.copy(this._item).sub(eye).normalize();
    this.rays.forEach((r, i) => {
      r.visible = glory > 0.01;
      if (!r.visible) return;
      const size = (i ? 0.62 : 0.5) * pop * (0.6 + 0.4 * glory);
      r.position.copy(this._item).addScaledVector(back, 0.05 + i * 0.01);
      r.quaternion.copy(this.camera.quaternion);
      r.rotateZ((i ? -0.35 : 0.5) * this.time + i);
      r.scale.setScalar(size);
      const b = (i ? 2.2 : 3.4) * glory;
      r.material.color.setRGB(b * 1.0, b * 0.78, b * 0.36);
    });
    for (const st of this.stars) {
      const d = st.userData;
      d.life -= dt;
      if (d.life <= 0 && glory > 0.5 && Math.random() < dt * 9) {
        d.life = d.span = 0.35 + Math.random() * 0.3;
        d.size = 0.02 + Math.random() * 0.035;
        d.at.copy(this._item).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.3) * 0.26, (Math.random() - 0.5) * 0.3));
      }
      st.visible = d.life > 0;
      if (!st.visible) continue;
      const u = 1 - d.life / d.span, k = Math.sin(u * Math.PI);
      st.position.copy(d.at);
      st.quaternion.copy(this.camera.quaternion);
      st.rotateZ(u * 1.5);
      st.scale.setScalar(d.size * k);
      st.material.color.setRGB(5 * k, 4.4 * k, 3 * k);
    }

    // ---- the camera: in front of him, once round, and in through the back of his head ----
    // (he and his prize fill the upper part of the picture; the foot of it is left for the words)
    const aspect = this.camera.aspect || 1.6, fov = 40, tan = Math.tan((fov * Math.PI) / 360);
    const frame = Math.max((s.top + 0.05) / 0.56, (2.5 * s.wide) / aspect, 0.5);
    const far = frame / (2 * tan);
    const round = smooth(span(t, T_UP - 0.15, T_ROUND)), home = span(t, T_ROUND, T_END), h = home * home * (3 - 2 * home);
    const angle = s.facing + round * Math.PI * 2 + h * Math.PI;
    const dist = far * (1 - 0.12 * smooth(span(t, 0, T_UP)) + 0.12 * Math.sin(round * Math.PI)) * (1 - h) + 0.0001;
    const eyeY = s.c.y + e.eye;
    const camY = s.c.y + (0.11 + 0.07 * Math.sin(round * Math.PI)) * (1 - h) + e.eye * h;
    cam.pos.set(s.c.x + Math.sin(angle) * dist, camY, s.c.z + Math.cos(angle) * dist);
    // looking at the middle of the picture; at the very end, the way he looks
    const midY = s.c.y + 0.16 * frame;
    cam.target.set(s.c.x + F.x * 2 * h * h, midY * (1 - h) + eyeY * h, s.c.z + F.z * 2 * h * h);
    cam.fov = fov + (s.was.fov - fov) * h;
    // (once the camera is inside his hat there is nothing of him to see)
    this._show(dist > 0.1);
    if (this.banner) this.banner.classList.toggle('show', t > T_UP - 0.05 && t < T_ROUND - 0.1);
  }

  _finish() {
    const s = this.playing;
    this.playing = null;
    const tool = s.tool;
    if (s.act.buzz) { tool.on = false; tool.power = 0; this.sound.motor(tool.def.voice, 0, 0, 0); if (s.buzzing) this.sound.switch(tool.def.voice, false); }
    tool.reset();
    for (const r of this.rays) r.visible = false;
    for (const st of this.stars) { st.visible = false; st.userData.life = 0; }
    U.uToolNear.value = 1;
    this.rig.cine = null;
    this.camera.fov = s.was.fov;
    this.camera.updateProjectionMatrix();
    this.shaving.unpresent();
    document.body.classList.remove('cine');
    if (this.banner) { this.banner.classList.remove('show'); this.banner.hidden = true; }
    Object.assign(this.elf.want, { lift: 0, two: 0, strain: 0, buzz: 0, sad: 0, proud: 0 });
    if (s.onDone) s.onDone(s.id);
  }

  update(dt) {
    this.time += dt;
    const e = this.elf, rig = this.rig;
    if (this.playing && rig.mode !== 'elf') this._finish();        // (the shaving was stopped in the middle of it)
    if (this.playing) {
      const s = this.playing;
      if (!s.sung && s.t >= 0.12) { s.sung = true; this.sound.fanfare(s.act.fanfare); }
      s.t += dt;
      if (s.t >= T_END) { this._finish(); return; }
      this._place(dt);
      return;
    }
    if (rig.mode === 'elf') {
      // looked out of: only his shadow shows. He stands where the eyes are, turned the way they look, hands out in front.
      this._show(false);
      const sy = Math.sin(rig.yaw), cy = Math.cos(rig.yaw);
      e.group.position.set(rig.pos.x + sy * 0.035, rig.pos.y - e.eye, rig.pos.z + cy * 0.035);
      e.group.rotation.y = rig.yaw + Math.PI;
      Object.assign(e.want, { lift: 0, carry: 1, walk: rig.feel.moving ? 1 : 0, proud: 0, sad: 0, strain: 0, buzz: 0, lookYaw: 0, lookPitch: rig.pitch * 0.6 });
    } else {
      // seen from afar: waiting by the foreleg, looking up at the job
      this._show(true);
      const x = 2.3, z = 1.75;
      e.group.position.set(x, this.terrain.height(x, z), z);
      e.group.rotation.y = Math.atan2(1.02 - x, 0.57 - z);
      Object.assign(e.want, { lift: 0, carry: 0, walk: 0, proud: 0, sad: 0, strain: 0, buzz: 0, lookYaw: 0.25 * Math.sin(this.time * 0.4), lookPitch: 0.55 });
    }
    e.update(dt, this.time);
  }
}
