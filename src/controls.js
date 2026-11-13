// Camera handling: orbiting the mammoth, gliding between saved views, and the
// elf's own view from snow level, where the shaving is done.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const VIEWS = [
  { name: 'The mammoth', pos: [11.1, 1.55, 4.1], target: [0.9, 1.9, 0], fov: 32 },
  { name: 'In profile', pos: [1.6, 1.7, 13.2], target: [0.9, 1.75, 0], fov: 30 },
  { name: 'Into the sun', pos: [-4.5, 1.1, -11.5], target: [0.6, 2.5, 0], fov: 38 },
  { name: 'The coat', pos: [4.6, 2.25, 3.4], target: [0.7, 1.95, 0.5], fov: 30 },
];

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  constructor(camera, canvas, terrain, feet) {
    this.camera = camera;
    this.canvas = canvas;
    this.terrain = terrain;
    this.feet = feet;
    this.mode = 'orbit';
    this.orbit = new OrbitControls(camera, canvas);
    Object.assign(this.orbit, {
      enableDamping: true, dampingFactor: 0.06, minDistance: 1.4, maxDistance: 80,
      maxPolarAngle: Math.PI * 0.535, zoomSpeed: 0.7, rotateSpeed: 0.5, panSpeed: 0.6,
    });
    this.tween = null;
    this.idle = 0;
    this.keys = new Set();
    this.yaw = 0; this.pitch = 0;
    this.pos = new THREE.Vector3();
    this.onChange = () => {};
    this.onSqueeze = () => {};      // the hands close (true) or open (false) on the tool
    this.onStep = () => {};         // a foot comes down
    // how the elf is moving, for whatever it carries
    this.feel = { yawRate: 0, pitchRate: 0, moving: false, running: false, bob: 0 };
    this.body = null;     // set to the mammoth's StrandSampler, for its distance field
    this.reach = 0.25;    // how close the elf's eyes may come to the hide, metres (it depends on the tool: see reachGoal)
    this.reachGoal = 0.25;
    this.onWheel = () => {};        // the wheel is turned while shaving: +1 or -1
    this._tmp = new THREE.Vector3();
    this.busy = false;              // talking to someone: the elf stands still and the pointer is free
    this.obstacles = [];            // things to walk round: { x, z, r }
    this.pace = 1;                  // how fast the elf walks, as a multiple of its usual pace
    this.cine = null;               // a scene is being played: { pos, target, fov } is where the camera is, and the elf does as the scene says

    const wake = () => { this.idle = 0; };
    canvas.addEventListener('pointerdown', wake);
    canvas.addEventListener('wheel', (e) => {
      wake();
      // with a tool in hand the wheel changes it (one step per notch, however fine the wheel)
      if (this.mode !== 'elf') return;
      this._wheel = (this._wheel || 0) + e.deltaY;
      if (Math.abs(this._wheel) >= 60) { this.onWheel(Math.sign(this._wheel)); this._wheel = 0; }
    }, { passive: true });
    window.addEventListener('keydown', (e) => { this.keys.add(e.code); wake(); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      // leaving the lock (Esc) ends the walk, but only if we ever had it
      if (!locked && this.locked && this.mode === 'elf' && !this.busy) this.leaveElf();
      this.locked = locked;
    });
    const look = (dx, dy, k) => {
      if (this.busy || this.cine) return;
      this.yaw -= dx * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.2, 1.45);
    };
    document.addEventListener('mousemove', (e) => {
      if (this.mode === 'elf' && document.pointerLockElement === canvas) look(e.movementX, e.movementY, 0.0022);
    });
    // where the pointer cannot be captured (phones, some app views), drag to look instead
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { if (this.mode === 'elf' && !this.locked) drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointermove', (e) => {
      if (!drag || this.mode !== 'elf') return;
      look(e.clientX - drag.x, e.clientY - drag.y, 0.004);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    window.addEventListener('pointerup', () => { drag = null; });

    // the tool in hand: the left button, or the space bar, squeezes the handles
    let held = false;
    const squeeze = (on) => { if (on !== held) { held = on; this.onSqueeze(on); } };
    canvas.addEventListener('pointerdown', (e) => { if (this.mode === 'elf' && this.locked && !this.busy && !this.cine && e.button === 0) squeeze(true); });
    window.addEventListener('pointerup', (e) => { if (e.button === 0) squeeze(false); });
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && this.mode === 'elf' && !this.busy && !this.cine && !e.repeat) { e.preventDefault(); squeeze(true); } });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') squeeze(false); });
    window.addEventListener('blur', () => squeeze(false));
    this._squeeze = squeeze;
  }

  setView(view, seconds = 2.4) {
    if (this.mode === 'elf') this.leaveElf(false);
    const cam = this.camera;
    this.tween = {
      t: 0, seconds,
      fromPos: cam.position.clone(), fromTarget: this.orbit.target.clone(), fromFov: cam.fov,
      toPos: new THREE.Vector3(...view.pos), toTarget: new THREE.Vector3(...view.target), toFov: view.fov,
    };
    this.orbit.enabled = false;
    this.idle = 0;
  }

  snap(view) {
    this.camera.position.set(...view.pos);
    this.orbit.target.set(...view.target);
    this.camera.fov = view.fov;
    this.camera.updateProjectionMatrix();
    this.orbit.update();
  }

  /**
   * Stand still and let go of the pointer (to talk to someone), or carry on.
   * Carrying on asks for the pointer back; that only works from a click or a
   * key press, which is how a conversation ends.
   */
  hold(on, aim = null) {
    this.busy = on;
    this.aim = on ? aim : null;      // { yaw, pitch }: where to turn the eyes while standing there
    this.keys.clear();
    this._squeeze(false);
    if (this.mode !== 'elf') return;
    if (on) {
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    } else {
      try {
        const req = this.canvas.requestPointerLock?.();
        if (req && req.catch) req.catch(() => {});
      } catch { /* drag-to-look still works */ }
    }
  }

  enterElf() {
    if (this.mode === 'elf') return;
    this.mode = 'elf';
    this.tween = null;
    this.orbit.enabled = false;
    this.saved = { pos: this.camera.position.clone(), target: this.orbit.target.clone(), fov: this.camera.fov };
    // stand a couple of paces from a foreleg, looking at it
    this.pos.set(2.3, 0, 1.75);
    this.yaw = Math.atan2(-(1.02 - this.pos.x), -(0.57 - this.pos.z));
    this.pitch = 0.2;
    this._lastYaw = this.yaw; this._lastPitch = this.pitch;
    this.camera.fov = 62;
    this.camera.near = 0.015;
    this.camera.updateProjectionMatrix();
    this.locked = false;
    try {
      const req = this.canvas.requestPointerLock?.();
      if (req && req.catch) req.catch(() => {});
    } catch { /* drag-to-look still works */ }
    this.onChange(this.mode);
  }

  leaveElf(restore = true) {
    if (this.mode !== 'elf') return;
    this.mode = 'orbit';
    this.cine = null;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this._squeeze(false);
    this.camera.near = 0.08;
    this.camera.updateProjectionMatrix();
    this.orbit.enabled = true;
    this.locked = false;
    if (restore && this.saved) {
      this.setView({ pos: this.saved.pos.toArray(), target: this.saved.target.toArray(), fov: this.saved.fov }, 1.6);
    }
    this.onChange(this.mode);
  }

  update(dt) {
    const cam = this.camera;
    if (this.mode === 'elf' && this.cine) {
      const c = this.cine, fl = this.feel;
      this.pos.y = this.terrain.height(this.pos.x, this.pos.z) + 0.17;
      cam.position.copy(c.pos);
      cam.lookAt(c.target);
      if (cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
      fl.yawRate = 0; fl.pitchRate = 0; fl.moving = false; fl.running = false;
      this._lastYaw = this.yaw; this._lastPitch = this.pitch;
      return;
    }
    if (this.mode === 'elf') {
      const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const speed = (run ? 3.2 : 1.15) * this.pace;
      let f = 0, s = 0;
      if (!this.busy) {
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s += 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s -= 1;
      }
      const l = Math.hypot(f, s) || 1;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      this.pos.x += (-sy * f + cy * s) / l * speed * dt;
      this.pos.z += (-cy * f - sy * s) / l * speed * dt;
      // The mammoth's legs are as wide as tree trunks: walk around them. The
      // elf stops an arm's length from the hide, so that the tips of the
      // tool in hand just reach the skin.
      const eyeY = this.terrain.height(this.pos.x, this.pos.z) + 0.17;
      // a shorter tool lets the elf lean in closer; it steps back smoothly when a longer one is taken up
      this.reach += THREE.MathUtils.clamp(this.reachGoal - this.reach, -dt * 0.6, dt * 0.6);
      if (this.body) {
        const sd = this._sd || (this._sd = new Float32Array(4));
        for (let it = 0; it < 3; it++) {
          this.body.sampleVolume(this.pos.x, eyeY, this.pos.z, sd);
          const short = this.reach - sd[3];
          if (short <= 0) break;
          const gl = Math.hypot(sd[0], sd[2]);
          if (gl < 1e-3) break;
          this.pos.x += (sd[0] / gl) * short; this.pos.z += (sd[2] / gl) * short;
        }
      } else {
        for (const foot of this.feet) {
          const dx = this.pos.x - foot.c[0], dz = this.pos.z - foot.c[2];
          const d = Math.hypot(dx, dz), r = foot.r + this.reach;
          if (d < r && d > 1e-4) { this.pos.x = foot.c[0] + (dx / d) * r; this.pos.z = foot.c[2] + (dz / d) * r; }
        }
      }
      if (this.aim) {
        // turning to face whoever is being spoken to
        const k = Math.min(1, dt * 5), turn = Math.atan2(Math.sin(this.aim.yaw - this.yaw), Math.cos(this.aim.yaw - this.yaw));
        this.yaw += turn * k; this.pitch += (this.aim.pitch - this.pitch) * k;
      }
      // and round the stalls
      for (const o of this.obstacles) {
        const dx = this.pos.x - o.x, dz = this.pos.z - o.z, d = Math.hypot(dx, dz), r = o.r + 0.06;
        if (d < r && d > 1e-4) { this.pos.x = o.x + (dx / d) * r; this.pos.z = o.z + (dz / d) * r; }
      }
      const moving = f !== 0 || s !== 0;
      const before = Math.floor((this.bob || 0) / Math.PI);
      this.bob = (this.bob || 0) + (moving ? dt * (run ? 13 : 8.5) : 0);
      if (moving && Math.floor(this.bob / Math.PI) !== before) this.onStep(run);
      const eye = 0.17 + (moving ? Math.sin(this.bob) * 0.006 : 0);
      this.pos.y = this.terrain.height(this.pos.x, this.pos.z) + eye;
      cam.position.copy(this.pos);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      const fl = this.feel, inv = 1 / Math.max(dt, 1e-3);
      fl.yawRate = (this.yaw - (this._lastYaw ?? this.yaw)) * inv; fl.pitchRate = (this.pitch - (this._lastPitch ?? this.pitch)) * inv;
      this._lastYaw = this.yaw; this._lastPitch = this.pitch;
      fl.moving = moving; fl.running = run; fl.bob = this.bob;
      return;
    }
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.seconds);
      const k = ease(tw.t);
      cam.position.lerpVectors(tw.fromPos, tw.toPos, k);
      // lift the path a little so the move arcs rather than skims the ground
      cam.position.y += Math.sin(k * Math.PI) * 0.6 * Math.min(1, tw.fromPos.distanceTo(tw.toPos) / 12);
      this.orbit.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
      cam.fov = tw.fromFov + (tw.toFov - tw.fromFov) * k;
      cam.updateProjectionMatrix();
      cam.lookAt(this.orbit.target);
      if (tw.t >= 1) { this.tween = null; this.orbit.enabled = true; this.orbit.update(); }
    } else {
      this.idle += dt;
      // left alone, the camera drifts slowly round the mammoth
      this.orbit.autoRotate = this.idle > 12;
      this.orbit.autoRotateSpeed = 0.28;
      this.orbit.update(dt);
    }
    const floor = this.terrain.height(cam.position.x, cam.position.z) + 0.14;
    if (cam.position.y < floor) cam.position.y = floor;
  }
}
