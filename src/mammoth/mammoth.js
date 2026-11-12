// Puts the mammoth together: skinned hide, fur, tusks, eyes, toenails, and a
// quiet idle animation (breathing, a swaying trunk, flicking ears and tail).
import * as THREE from 'three';
import { buildMammothData, buildBodyGeometry, buildTuskGeometry, buildSkeleton } from './build.js';
import { nailOutline, NAIL_BASE } from './anatomy.js';
import { generateGroom } from './groom.js';
import { makeFurGeometry, makeFurMaterials, makeStrandAttributes, isWoolBatch, BATCH } from './furMaterial.js';
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
    g.strokeStyle = dark ? `rgba(120,92,58,${0.02 + rnd() * 0.05})` : `rgba(255,250,235,${0.03 + rnd() * 0.06})`;
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

  // relief: fine grooves along the tusk, the odd crack and growth ring
  const b = document.createElement('canvas');
  b.width = w; b.height = h;
  const bg = b.getContext('2d');
  bg.fillStyle = '#808080'; bg.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    const x = rnd() * w, y0 = rnd() * h, len = 80 + rnd() * 700;
    const v = rnd() < 0.6 ? 60 + rnd() * 40 : 150 + rnd() * 50;
    bg.strokeStyle = `rgba(${v},${v},${v},${0.10 + rnd() * 0.25})`;
    bg.lineWidth = 0.8 + rnd() * 2.6;
    bg.beginPath(); bg.moveTo(x, y0);
    let xx = x;
    for (let y = y0; y < y0 + len; y += 18) { xx += (rnd() - 0.5) * 1.8; bg.lineTo(xx, y); }
    bg.stroke();
  }
  for (let i = 0; i < 40; i++) {
    bg.fillStyle = `rgba(70,70,70,${0.08 + rnd() * 0.14})`;
    bg.fillRect(0, rnd() * h, w, 1 + rnd() * 2);
  }
  const bump = new THREE.CanvasTexture(b);
  bump.wrapS = THREE.RepeatWrapping; bump.wrapT = THREE.ClampToEdgeWrapping;
  bump.anisotropy = 8;
  return { map: tex, bump };
}

/**
 * Toenails for one foot. Each nail is a domed plate that follows the real
 * surface of the foot (found from the body's distance field), thickest low
 * in the middle and running out flush with the skin at its edges.
 */
function buildNailGeometry(foot, sdf) {
  const NU = 16, NV = 14;
  const positions = [], uvs = [], colors = [], indices = [];
  let seed = Math.round(foot.c[0] * 131 + foot.c[2] * 977) >>> 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (const nail of foot.nails) {
    const base = positions.length / 3;
    // each nail a slightly different shade of horn
    const tint = 0.62 + 0.2 * rnd(), warm = 0.98 + 0.07 * rnd();
    const lean = (rnd() - 0.5) * 0.12;   // nails are never perfectly upright
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      const y = NAIL_BASE + v * nail.h;
      const half = nail.w * nailOutline(v * 0.985);
      for (let i = 0; i <= NU; i++) {
        const u = (i / NU) * 2 - 1;
        const phi = nail.a + (u * half + lean * nail.h * v) / foot.r;
        const cx = Math.cos(phi), cz = Math.sin(phi);
        // walk in from outside until we meet the skin
        let r = foot.r + 0.09;
        for (let k = 0; k < 24; k++) {
          const d = sdf.dist(foot.c[0] + cx * r, y, foot.c[2] + cz * r);
          r -= d;
          if (Math.abs(d) < 0.0003) break;
        }
        // dome: full in the lower middle, nothing at the sides and the cuticle
        const dome = Math.sqrt(Math.max(0, 1 - u * u)) * Math.sqrt(Math.max(0, 1 - Math.pow(v, 2.4)));
        const ridge = 1 + 0.06 * Math.cos(u * 9 + nail.a * 7) * (1 - v);   // faint lengthwise ridging
        r += 0.0012 + 0.017 * dome * ridge * (0.6 + 0.4 * Math.min(1, v * 5 + 0.2));
        positions.push(foot.c[0] + cx * r, y, foot.c[2] + cz * r);
        uvs.push(u * 0.5 + 0.5, v);
        colors.push(tint * warm, tint, tint / warm);
      }
    }
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NU; i++) {
        const a = base + i + j * (NU + 1), b = a + 1, c = a + NU + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // make sure the plates face outwards
  const n = geo.attributes.normal, p = geo.attributes.position;
  const out = (p.getX(8) - foot.c[0]) * n.getX(8) + (p.getZ(8) - foot.c[2]) * n.getZ(8);
  if (out < 0) {
    const ix = geo.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    geo.computeVertexNormals();
  }
  return geo;
}

/** Horn: pale and worn low down, darker and stained towards the cuticle, ridged lengthwise. */
function makeNailTexture() {
  const W = 256, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let s = 4711;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  // canvas y = 0 is the cuticle (v = 1), y = H the sole
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.0, '#5d4c3a');
  grad.addColorStop(0.12, '#8f7b5f');
  grad.addColorStop(0.4, '#b3a182');
  grad.addColorStop(0.8, '#c6b898');
  grad.addColorStop(0.94, '#a79879');
  grad.addColorStop(1.0, '#7c6d55');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // lengthwise striations
  for (let i = 0; i < 150; i++) {
    const x = rnd() * W, dark = rnd() < 0.6;
    g.strokeStyle = dark ? `rgba(70,54,36,${0.05 + rnd() * 0.13})` : `rgba(245,236,214,${0.04 + rnd() * 0.1})`;
    g.lineWidth = 0.6 + rnd() * 2.4;
    g.beginPath(); g.moveTo(x, rnd() * H * 0.3);
    let xx = x;
    for (let y = 0; y <= H; y += 24) { xx += (rnd() - 0.5) * 2.5; g.lineTo(xx, y); }
    g.stroke();
  }
  // growth bands across the nail
  for (let i = 0; i < 9; i++) {
    const y = H * (0.15 + 0.8 * rnd());
    g.strokeStyle = `rgba(80,62,42,${0.05 + rnd() * 0.09})`;
    g.lineWidth = 1 + rnd() * 3;
    g.beginPath(); g.moveTo(0, y + 10); g.quadraticCurveTo(W / 2, y - 14, W, y + 10); g.stroke();
  }
  // cracks working up from the worn lower edge
  for (let i = 0; i < 5; i++) {
    let x = W * (0.12 + 0.76 * rnd()), y = H;
    g.strokeStyle = `rgba(38,28,18,${0.35 + rnd() * 0.3})`;
    g.lineWidth = 0.8 + rnd() * 1.2;
    g.beginPath(); g.moveTo(x, y);
    const top = H * (0.45 + 0.4 * rnd());
    while (y > top) { y -= 8 + rnd() * 10; x += (rnd() - 0.5) * 5; g.lineTo(x, y); }
    g.stroke();
  }
  // grime: darker towards the sides, speckled all over
  const side = g.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(48,36,26,0.55)'); side.addColorStop(0.16, 'rgba(48,36,26,0)');
  side.addColorStop(0.84, 'rgba(48,36,26,0)'); side.addColorStop(1, 'rgba(48,36,26,0.55)');
  g.fillStyle = side; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${40 + rnd() * 30},${30 + rnd() * 24},${20 + rnd() * 16},${rnd() * 0.16})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 3);
  }
  // blotchy staining
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = H * (0.25 + 0.75 * rnd()), r = 10 + rnd() * 34;
    const blot = g.createRadialGradient(x, y, 0, x, y, r);
    blot.addColorStop(0, `rgba(60,44,28,${0.1 + rnd() * 0.16})`); blot.addColorStop(1, 'rgba(60,44,28,0)');
    g.fillStyle = blot; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const b = document.createElement('canvas'); b.width = W; b.height = H;
  const bg = b.getContext('2d');
  bg.fillStyle = '#808080'; bg.fillRect(0, 0, W, H);
  for (let i = 0; i < 110; i++) {
    const x = rnd() * W, v = rnd() < 0.5 ? 70 + rnd() * 30 : 160 + rnd() * 40;
    bg.strokeStyle = `rgba(${v},${v},${v},${0.15 + rnd() * 0.3})`;
    bg.lineWidth = 1 + rnd() * 3;
    bg.beginPath(); bg.moveTo(x, 0);
    let xx = x;
    for (let y = 0; y <= H; y += 24) { xx += (rnd() - 0.5) * 2.5; bg.lineTo(xx, y); }
    bg.stroke();
  }
  const bump = new THREE.CanvasTexture(b);
  bump.anisotropy = 8;
  return { map, bump };
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
    m.chunks = [];
    m._tmp = new THREE.Vector3();
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

    const ivoryTex = makeIvoryTexture();
    const ivory = patchStandardMaterial(new THREE.MeshPhysicalMaterial({
      map: ivoryTex.map, bumpMap: ivoryTex.bump, bumpScale: 0.8, color: 0xf2ead8, roughness: 0.4, metalness: 0,
      clearcoat: 0.3, clearcoatRoughness: 0.3, sheen: 0, envMapIntensity: 1,
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

    // toenails: horn plates set into the front of each foot
    const nailTex = makeNailTexture();
    const nailMat = patchStandardMaterial(new THREE.MeshPhysicalMaterial({
      map: nailTex.map, bumpMap: nailTex.bump, bumpScale: 0.9, vertexColors: true,
      roughness: 0.6, metalness: 0, clearcoat: 0.16, clearcoatRoughness: 0.5, envMapIntensity: 0.6,
    }), { key: 'nail' });
    for (const foot of anat.feet) {
      const nails = new THREE.Mesh(buildNailGeometry(foot, data.sdf), nailMat);
      nails.name = 'nails';
      attach(nails, foot.bone);
    }

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
    for (const c of this.chunks || []) {
      for (const mesh of c.meshes) if (mesh && mesh.parent) mesh.parent.remove(mesh);
      for (const g of c.geos.values()) g.dispose();
    }
    const groom = generateGroom(this.data.body, { count: strands });
    this.groom = groom;
    this.strands = strands;

    // Whole-coat meshes, used only to cast the shadow.
    this.furMeshes = [];
    for (const [name, segs] of [['long', 6], ['short', 3]]) {
      if (!groom[name].count) continue;
      const mesh = new THREE.Mesh(makeFurGeometry(makeStrandAttributes(groom[name]), groom[name].count, segs), this.furMats.depth);
      mesh.frustumCulled = false;
      mesh.userData.shadowMaterial = this.furMats.depth;
      mesh.userData.total = groom[name].count;
      mesh.layers.set(LAYER_SHADOW_NEAR);
      mesh.name = 'fur-shadow-' + name;
      this.furMeshes.push(mesh);
      if (scene) scene.add(mesh);
    }

    // The coat you see is drawn patch by patch (about 40 cm of hide each), so
    // a patch can be skipped when off screen and given many more hairs when
    // the camera is close. Every extra hair of a patch is one more draw of
    // the same strands; meshes for those draws are made on demand.
    this.chunks = [];
    for (const name of ['long', 'short']) {
      for (const c of groom[name].chunks) {
        this.chunks.push({
          ...c, long: name === 'long', attributes: makeStrandAttributes(c.arrays), geos: new Map(), meshes: [],
          centre: new THREE.Vector3(...c.center), sphere: new THREE.Sphere(new THREE.Vector3(...c.center), c.radius),
        });
      }
    }
    if (this.body) this.casters = [this.body, ...this.furMeshes, ...this.rigid];
    if (this._detail) this.setFurDetail(this._detail, this._shadowDetail);
  }

  _chunkGeometry(chunk, segments, repeat = 1) {
    const key = segments * 100 + repeat;
    let geo = chunk.geos.get(key);
    if (!geo) {
      if (repeat > 1 && !chunk.attributesBatch) chunk.attributesBatch = makeStrandAttributes(chunk.arrays, repeat);
      geo = makeFurGeometry(repeat > 1 ? chunk.attributesBatch : chunk.attributes, chunk.count * repeat, segments);
      // centred on the mesh, so three.js orders the draws by the patch's real distance
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), chunk.radius);
      chunk.geos.set(key, geo);
    }
    return geo;
  }

  /** Mesh for one draw of a patch: b = 0 is the guides, b >= 1 the b-th batch of extra hairs. */
  _chunkMesh(chunk, b) {
    let mesh = chunk.meshes[b];
    if (!mesh) {
      mesh = new THREE.Mesh(this._chunkGeometry(chunk, 3), this.furMats.color);
      // The shaders ignore the mesh transform. Its position lets three.js draw
      // near patches first; its scale carries the batch size (x) and the index
      // of the first hair in the batch (y, plus one).
      mesh.position.copy(chunk.centre).add(this.group.position);
      mesh.scale.set(b === 0 ? 1 : BATCH, (b === 0 ? 0 : 1 + (b - 1) * BATCH) + 1, 1);
      mesh.frustumCulled = false;   // culled by hand in updateCoat
      mesh.name = 'fur';
      mesh.updateMatrixWorld(true);
      chunk.meshes[b] = mesh;
      if (this.scene) this.scene.add(mesh);
    }
    return mesh;
  }

  setCoatVisible(on) {
    this._coatVisible = on;
  }

  addTo(scene) {
    this.scene = scene;
    scene.add(this.group);
    scene.add(this.body);
    for (const f of this.furMeshes) scene.add(f);
    for (const c of this.chunks) for (const mesh of c.meshes) if (mesh) scene.add(mesh);
  }

  /** Fraction of strands to draw (level of detail), compensating with width. */
  setFurDetail(fraction, shadowFraction = 0.5) {
    this._detail = fraction;
    this._shadowDetail = shadowFraction;
    this.furMats.color.uniforms.uWidthScale.value = 1 / Math.sqrt(fraction);
    this.furMats.depth.uniforms.uWidthScale.value = 0.7 / Math.sqrt(shadowFraction);
  }
  useMainCounts() {}
  useShadowCounts() {
    for (const f of this.furMeshes) f.geometry.instanceCount = Math.max(1, Math.floor(f.userData.total * this._shadowDetail));
  }

  /**
   * Decide, patch by patch, how many hairs each strand is drawn as. The
   * shader fades hairs in one at a time by distance; this only has to make
   * sure every patch gets as many draws as its nearest strand will need.
   */
  updateCoat(camera, pxScale, childMax) {
    const u = this.furMats.uniforms;
    u.uChildMax.value = childMax;
    u.uOrigin.value.copy(this.group.position);
    const widthScale = this.furMats.color.uniforms.uWidthScale.value;
    const hairPx = u.uHairPx.value;
    const fraction = this._detail || 1;
    const top = Math.max(1, Math.ceil(childMax));
    this._frustum = this._frustum || new THREE.Frustum();
    this._pv = this._pv || new THREE.Matrix4();
    this._frustum.setFromProjectionMatrix(this._pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let hairs = 0, draws = 0;
    for (const c of this.chunks) {
      const visible = this._coatVisible !== false && this._frustum.intersectsSphere(c.sphere);
      let batches = 0;
      if (visible) {
        const d = Math.max(0.03, camera.position.distanceTo(c.centre) - c.rootRadius);
        // most hairs any strand of this patch will show (same formula as the shader)
        const n = Math.min(top, Math.max(1, (c.maxWidth * widthScale * pxScale) / (d * hairPx) - 0.4));
        const extra = Math.ceil(n) - 1;
        batches = 1 + Math.ceil(extra / BATCH);
        // closer patches get smoother curves
        const segs = c.long ? (n > 6 ? 12 : n > 1.5 ? 9 : 7) : (n > 6 ? 8 : n > 1.5 ? 5 : 3);
        const guides = Math.max(1, Math.floor(c.count * fraction));
        for (let b = 0; b < batches; b++) {
          const mesh = this._chunkMesh(c, b);
          const geo = b === 0 ? this._chunkGeometry(c, segs) : this._chunkGeometry(c, isWoolBatch(b) ? 5 : segs, BATCH);
          geo.instanceCount = b === 0 ? guides : guides * BATCH;
          if (mesh.geometry !== geo) mesh.geometry = geo;
          mesh.visible = true;
        }
        hairs += guides * Math.ceil(n); draws += batches;
      }
      for (let b = batches; b < c.meshes.length; b++) if (c.meshes[b]) c.meshes[b].visible = false;
    }
    this.hairsDrawn = hairs;
    this.coatDraws = draws;
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
