// Puts the mammoth together: skinned hide, fur, tusks, eyes, toenails, and a
// quiet idle animation (breathing, a swaying trunk, flicking ears and tail).
import * as THREE from 'three';
import { buildMammothData, buildBodyGeometry, buildTuskGeometry, buildSkeleton } from './build.js';
import { generateGroom } from './groom.js';
import { makeFurGeometry, makeFurMaterials } from './furMaterial.js';
import { makeBodyMaterials } from './bodyMaterial.js';
import { patchStandardMaterial } from '../gfx/patch.js';
import { makeDepthMaterial } from '../gfx/shadows.js';
import { LAYER_SHADOW_NEAR } from '../gfx/globals.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

function makeIvoryTexture() {
  const w = 256, h = 1024;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  // v runs from the tip (top of the canvas) to the base (bottom)
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, '#e9dcc0');
  grad.addColorStop(0.15, '#efe4cc');
  grad.addColorStop(0.6, '#e6d6b4');
  grad.addColorStop(0.85, '#c9ae82');
  grad.addColorStop(1.0, '#8e6f4a');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  // growth lines running the length of the tusk
  for (let i = 0; i < 520; i++) {
    const x = rnd() * w, y0 = rnd() * h, len = 60 + rnd() * 500;
    const dark = rnd() < 0.7;
    g.strokeStyle = dark ? `rgba(110,82,48,${0.03 + rnd() * 0.09})` : `rgba(255,250,235,${0.03 + rnd() * 0.08})`;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath(); g.moveTo(x, y0);
    let xx = x;
    for (let y = y0; y < y0 + len; y += 16) { xx += (rnd() - 0.5) * 2.2; g.lineTo(xx, y); }
    g.stroke();
  }
  // faint rings and scuffs
  for (let i = 0; i < 90; i++) {
    const y = rnd() * h;
    g.fillStyle = `rgba(95,70,40,${0.02 + rnd() * 0.05})`;
    g.fillRect(0, y, w, 1 + rnd() * 3);
  }
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(80,58,34,${rnd() * 0.08})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

export class Mammoth {
  static async create({ strands = 240000, cell = 0.025, a2c = true } = {}, progress = () => {}) {
    const m = new Mammoth();
    const data = await buildMammothData({ cell }, (p, label) => progress(p * 0.6, label));
    m.data = data;
    const { anat } = data;

    m.group = new THREE.Group();
    const rig = buildSkeleton(anat);
    m.rig = rig;
    m.group.add(rig.rootBone);
    m.group.updateMatrixWorld(true);
    rig.skeleton.computeBoneTexture();
    rig.skeleton.update();
    m.bone = (name) => rig.bones[rig.byName.get(name)];
    m.restPos = (name) => anat.bones[rig.byName.get(name)].pos;

    // distance volume as a half-float 3D texture
    const { data: vol, res, bounds } = data.volume;
    const half = new Uint16Array(vol.length);
    for (let i = 0; i < vol.length; i++) half[i] = THREE.DataUtils.toHalfFloat(vol[i]);
    const sdfTex = new THREE.Data3DTexture(half, res[0], res[1], res[2]);
    sdfTex.format = THREE.RGBAFormat; sdfTex.type = THREE.HalfFloatType;
    sdfTex.minFilter = sdfTex.magFilter = THREE.LinearFilter;
    sdfTex.wrapS = sdfTex.wrapT = sdfTex.wrapR = THREE.ClampToEdgeWrapping;
    sdfTex.unpackAlignment = 1;
    sdfTex.needsUpdate = true;
    const sdfMin = new THREE.Vector3(...bounds.min);
    const sdfInv = new THREE.Vector3(1 / (bounds.max[0] - bounds.min[0]), 1 / (bounds.max[1] - bounds.min[1]), 1 / (bounds.max[2] - bounds.min[2]));

    const furMats = makeFurMaterials({ sdfTexture: sdfTex, sdfMin, sdfInvSize: sdfInv, boneTexture: rig.skeleton.boneTexture, a2c });
    m.furMats = furMats;
    m.furMeshes = [];
    progress(0.62, 'Growing the coat');
    await tick();
    m.growCoat(strands);
    progress(0.85, 'Growing the coat');
    await tick();

    const bodyMats = makeBodyMaterials({ boneTexture: rig.skeleton.boneTexture, furUniforms: furMats.uniforms });
    m.body = new THREE.Mesh(buildBodyGeometry(data.body), bodyMats.color);
    m.body.frustumCulled = false;
    m.body.userData.shadowMaterial = bodyMats.depth;
    m.body.layers.enable(LAYER_SHADOW_NEAR);
    m.body.name = 'hide';

    // ---- rigid parts ride on bones ----------------------------------------
    const rigidDepth = makeDepthMaterial();
    m.rigid = [];
    const attach = (mesh, boneName) => {
      const r = m.restPos(boneName);
      mesh.position.sub(new THREE.Vector3(r[0], r[1], r[2]));
      m.bone(boneName).add(mesh);
      mesh.userData.shadowMaterial = rigidDepth;
      mesh.layers.enable(LAYER_SHADOW_NEAR);
      m.rigid.push(mesh);
    };

    const ivory = patchStandardMaterial(new THREE.MeshPhysicalMaterial({
      map: makeIvoryTexture(), color: 0xffffff, roughness: 0.36, metalness: 0,
      clearcoat: 0.35, clearcoatRoughness: 0.28, sheen: 0, envMapIntensity: 1,
    }), { key: 'ivory' });
    m.ivory = ivory;
    for (const side of [1, -1]) {
      const geo = buildTuskGeometry(anat.tusk, side);
      // normalise v to 0..1 along the tusk, 0 at the tip
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) / geo.userData.length);
      const tusk = new THREE.Mesh(geo, ivory);
      tusk.name = 'tusk';
      attach(tusk, 'head');
    }

    const eyeMat = patchStandardMaterial(new THREE.MeshPhysicalMaterial({
      color: 0x0c0603, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
    }), { key: 'eye' });
    for (const side of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(anat.eye.radius, 24, 16), eyeMat);
      // seat the eyeball in the skull: only a third of it shows
      const ep = [anat.eye.pos[0], anat.eye.pos[1], anat.eye.pos[2] * side], eg = [0, 0, 0];
      const ed = data.sdf.dist(ep[0], ep[1], ep[2]);
      data.sdf.grad(ep[0], ep[1], ep[2], eg);
      const sink = ed + anat.eye.radius * 0.62;
      eye.position.set(ep[0] - eg[0] * sink, ep[1] - eg[1] * sink, ep[2] - eg[2] * sink);
      eye.name = 'eye';
      attach(eye, 'head');
    }

    const nailMat = patchStandardMaterial(new THREE.MeshPhysicalMaterial({
      color: 0x5d5346, roughness: 0.72, metalness: 0,
    }), { key: 'nail' });
    const nailGeo = new THREE.SphereGeometry(1, 16, 12);
    const footBones = ['foreFoot_R', 'foreFoot_L', 'hindFoot_R', 'hindFoot_L'];
    anat.feet.forEach((foot, i) => {
      for (const th of [-1.05, -0.36, 0.36, 1.05]) {
        const nail = new THREE.Mesh(nailGeo, nailMat);
        const rr = foot.r - 0.024;
        nail.position.set(foot.c[0] + Math.cos(th) * rr, 0.062, foot.c[2] + Math.sin(th) * rr);
        nail.position.y = 0.052;
        nail.scale.set(0.028, 0.05, 0.046);
        nail.rotation.y = -th;
        nail.name = 'nail';
        attach(nail, footBones[i]);
      }
    });

    m.casters = [m.body, ...m.furMeshes, ...m.rigid];
    m.time = 0;
    progress(1, 'Growing the coat');
    return m;
  }

  /** (Re)generate the strands. Safe to call again later for a denser or thinner coat. */
  growCoat(strands) {
    const scene = this.scene;
    for (const f of this.furMeshes) {
      if (f.parent) f.parent.remove(f);
      f.geometry.dispose();
    }
    const groom = generateGroom(this.data.body, { count: strands });
    this.groom = groom;
    this.strands = strands;
    this.furMeshes = [];
    for (const [name, segs] of [['long', 9], ['short', 3]]) {
      if (!groom[name].count) continue;
      const mesh = new THREE.Mesh(makeFurGeometry(groom[name], segs), this.furMats.color);
      mesh.frustumCulled = false;
      mesh.userData.shadowMaterial = this.furMats.depth;
      mesh.userData.total = groom[name].count;
      mesh.layers.enable(LAYER_SHADOW_NEAR);
      mesh.name = 'fur-' + name;
      this.furMeshes.push(mesh);
      if (scene) scene.add(mesh);
    }
    if (this.body) this.casters = [this.body, ...this.furMeshes, ...this.rigid];
    if (this._detail) this.setFurDetail(this._detail, this._shadowDetail);
  }

  addTo(scene) {
    this.scene = scene;
    scene.add(this.group);
    scene.add(this.body);
    for (const f of this.furMeshes) scene.add(f);
  }

  /** Fraction of strands to draw (level of detail), compensating with width. */
  setFurDetail(fraction, shadowFraction = 0.5) {
    this._detail = fraction;
    this._shadowDetail = shadowFraction;
    this.furMats.color.uniforms.uWidthScale.value = 1 / Math.sqrt(fraction);
    this.furMats.depth.uniforms.uWidthScale.value = 1.25 / Math.sqrt(shadowFraction);
    this.useMainCounts();
  }
  useMainCounts() {
    for (const f of this.furMeshes) f.geometry.instanceCount = Math.max(1, Math.floor(f.userData.total * this._detail));
  }
  useShadowCounts() {
    for (const f of this.furMeshes) f.geometry.instanceCount = Math.max(1, Math.floor(f.userData.total * this._shadowDetail));
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    const b = (n) => this.bone(n);

    // slow breathing: quick in, slow out
    const ph = (t / 5.2) % 1;
    const breath = ph < 0.4 ? Math.sin((ph / 0.4) * Math.PI * 0.5) : Math.cos(((ph - 0.4) / 0.6) * Math.PI * 0.5);
    this.furMats.uniforms.uBreath.value = (breath * breath) * 0.022;
    this.exhaling = ph > 0.42 && ph < 0.78;

    // head: slow nods and looks
    const head = b('head'), neck = b('neck');
    neck.rotation.z = 0.012 * Math.sin(t * 0.31) + 0.008 * breath;
    neck.rotation.y = 0.03 * Math.sin(t * 0.17 + 0.5);
    head.rotation.z = 0.025 * Math.sin(t * 0.43 + 1.3) + 0.012 * Math.sin(t * 0.97);
    head.rotation.y = 0.045 * Math.sin(t * 0.21 + 2.1);
    head.rotation.x = 0.02 * Math.sin(t * 0.27);

    // trunk: a lazy travelling wave, more at the tip
    for (let i = 0; i < 8; i++) {
      const bone = b('trunk' + i);
      const k = i / 7;
      bone.rotation.z = (0.018 + 0.045 * k) * Math.sin(t * 0.62 - i * 0.55) + 0.03 * k * Math.sin(t * 0.23 + 1.0);
      bone.rotation.x = (0.02 + 0.04 * k) * Math.sin(t * 0.41 - i * 0.45 + 0.8);
    }

    // ears: mostly still, with the odd flick
    const flick = (phase) => Math.pow(Math.max(0, Math.sin(t * 0.55 + phase)), 14);
    b('ear_R').rotation.y = -0.06 * Math.sin(t * 0.7) - 0.45 * flick(0.0);
    b('ear_L').rotation.y = 0.06 * Math.sin(t * 0.7 + 0.6) + 0.45 * flick(2.4);

    // tail
    b('tail0').rotation.x = 0.22 * Math.sin(t * 0.9) + 0.1 * Math.sin(t * 2.3);
    b('tail1').rotation.x = 0.3 * Math.sin(t * 0.9 - 0.7);
    b('tail0').rotation.z = 0.05 * Math.sin(t * 0.5);

    this.group.updateMatrixWorld(true);
    this.rig.skeleton.update();
  }
}
