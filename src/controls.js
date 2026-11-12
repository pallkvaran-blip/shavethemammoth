// Camera handling: orbiting the mammoth, gliding between saved views, and an
// elf's-eye walk at snow level (the scale the game will be played at).
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
    this._tmp = new THREE.Vector3();

    const wake = () => { this.idle = 0; };
    canvas.addEventListener('pointerdown', wake);
    canvas.addEventListener('wheel', wake, { passive: true });
    window.addEventListener('keydown', (e) => { this.keys.add(e.code); wake(); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      // leaving the lock (Esc) ends the walk, but only if we ever had it
      if (!locked && this.locked && this.mode === 'elf') this.leaveElf();
      this.locked = locked;
    });
    const look = (dx, dy, k) => {
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

  enterElf() {
    if (this.mode === 'elf') return;
    this.mode = 'elf';
    this.tween = null;
    this.orbit.enabled = false;
    this.saved = { pos: this.camera.position.clone(), target: this.orbit.target.clone(), fov: this.camera.fov };
    // stand a few paces in front of the mammoth, looking up at it
    this.pos.set(5.2, 0, 2.6);
    this.yaw = Math.atan2(-(0.9 - this.pos.x), -(0 - this.pos.z));
    this.pitch = 0.42;
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
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
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
    if (this.mode === 'elf') {
      const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const speed = run ? 3.2 : 1.15;
      let f = 0, s = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s -= 1;
      const l = Math.hypot(f, s) || 1;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      this.pos.x += (-sy * f + cy * s) / l * speed * dt;
      this.pos.z += (-cy * f - sy * s) / l * speed * dt;
      // the mammoth's legs are as wide as tree trunks: walk around them
      for (const foot of this.feet) {
        const dx = this.pos.x - foot.c[0], dz = this.pos.z - foot.c[2];
        const d = Math.hypot(dx, dz), r = foot.r + 0.2;
        if (d < r && d > 1e-4) { this.pos.x = foot.c[0] + (dx / d) * r; this.pos.z = foot.c[2] + (dz / d) * r; }
      }
      const moving = f !== 0 || s !== 0;
      this.bob = (this.bob || 0) + (moving ? dt * (run ? 13 : 8.5) : 0);
      const eye = 0.17 + (moving ? Math.sin(this.bob) * 0.006 : 0);
      this.pos.y = this.terrain.height(this.pos.x, this.pos.z) + eye;
      cam.position.copy(this.pos);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
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
