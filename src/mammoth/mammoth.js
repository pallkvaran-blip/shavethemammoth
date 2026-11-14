// Puts the mammoth together: skinned hide, fur, tusks, eyes, toenails, and a
// quiet idle animation (breathing, a swaying trunk, flicking ears and tail).
import * as THREE from 'three';
import { buildMammothData, buildBodyGeometry, buildTuskGeometry, buildSkeleton } from './build.js';
import { nailOutline, NAIL_BASE } from './anatomy.js';
import { generateGroom, UNCUT } from './groom.js';
import { StrandSampler } from './strand.js';
import { BodyCollider } from './collider.js';
import { makeFurGeometry, makeFurMaterials, makeStrandAttributes, isWoolBatch, BATCH } from './furMaterial.js';
import { makeBodyMaterials } from './bodyMaterial.js';
import { makeTattooSheet, placeTattoos, tattooUniforms } from './tattoos.js';
import { patchStandardMaterial } from '../gfx/patch.js';
import { makeDepthMaterial } from '../gfx/shadows.js';
import { LAYER_SHADOW_NEAR, LAYER_SHADOW_ELF } from '../gfx/globals.js';

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
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W, dark = rnd() < 0.6;
    g.strokeStyle = dark ? `rgba(70,54,36,${0.04 + rnd() * 0.09})` : `rgba(245,236,214,${0.03 + rnd() * 0.07})`;
    g.lineWidth = 1.5 + rnd() * 5;
    g.beginPath(); g.moveTo(x, rnd() * H * 0.3);
    let xx = x;
    for (let y = 0; y <= H; y += 24) { xx += (rnd() - 0.5) * 2.5; g.lineTo(xx, y); }
    g.stroke();
  }
  // growth bands across the nail
  for (let i = 0; i < 5; i++) {
    const y = H * (0.15 + 0.8 * rnd());
    g.strokeStyle = `rgba(80,62,42,${0.04 + rnd() * 0.06})`;
    g.lineWidth = 3 + rnd() * 6;
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
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W, v = rnd() < 0.5 ? 70 + rnd() * 30 : 160 + rnd() * 40;
    bg.strokeStyle = `rgba(${v},${v},${v},${0.12 + rnd() * 0.2})`;
    bg.lineWidth = 3 + rnd() * 7;
    bg.beginPath(); bg.moveTo(x, 0);
    let xx = x;
    for (let y = 0; y <= H; y += 24) { xx += (rnd() - 0.5) * 2.5; bg.lineTo(xx, y); }
    bg.stroke();
  }
  const bump = new THREE.CanvasTexture(b);
  bump.anisotropy = 8;
  return { map, bump };
}

const SHOWN_MAX = 0.12;

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
    // how short the coat has been cut over each point of the hide (metres left)
    m.bodyCut = new Float32Array(data.body.positions.length / 3).fill(UNCUT);
    // the copy the hide is shaded from stops at 12 cm, so that the edge of a shorn patch falls between vertices, not on them
    m.bodyCutShown = new Float32Array(m.bodyCut.length).fill(SHOWN_MAX);
    m.body.geometry.setAttribute('aCut', new THREE.BufferAttribute(m.bodyCutShown, 1));
    m.sampler = new StrandSampler({ volume: data.volume, skeleton: rig.skeleton });
    m.collider = new BodyCollider({ sdf: data.sdf, anat, rig });
    // what is under the coat: found on the hide as he stands at rest, and given to the skin to show where it is shorn
    m.collider.begin();
    m.tattoos = placeTattoos(m.collider);
    Object.assign(bodyMats.color.uniforms, tattooUniforms(makeTattooSheet(), m.tattoos));

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
      map: nailTex.map, bumpMap: nailTex.bump, bumpScale: 0.3, vertexColors: true,
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
      for (const mesh of [...c.meshes, c.cast]) if (mesh && mesh.parent) mesh.parent.remove(mesh);
      for (const g of c.geos.values()) g.dispose();
      c.cast.geometry.dispose();
    }
    const groom = generateGroom(this.data.body, { count: strands });
    this.groom = groom;
    this.strands = strands;
    if (!this.movingBones) {
      this.movingBones = new Set();
      this.rig.bones.forEach((b, i) => { if (/^(neck|head|ear|tail|trunk)/.test(b.name)) this.movingBones.add(i); });
    }

    // Whole-coat meshes, used only to cast the shadow: into the map that holds
    // all of him. (The elf's own small map takes the coat patch by patch, see
    // below, since most of the coat is nowhere near it.)
    this.furMeshes = [];
    const SHADOW_SEGMENTS = { long: 6, short: 3 };
    for (const [name, segs] of Object.entries(SHADOW_SEGMENTS)) {
      if (!groom[name].count) continue;
      const mesh = new THREE.Mesh(makeFurGeometry(makeStrandAttributes(groom[name]), groom[name].count, segs), this.furMats.depth);
      mesh.frustumCulled = false;
      mesh.userData.shadowMaterial = this.furMats.depth;
      mesh.userData.total = groom[name].count;
      mesh.userData.group = name;
      mesh.userData.nearOnly = true;
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
        // does any of this patch ride on a bone that moves (head, trunk, ears, tail)?
        let mobile = false;
        for (let i = 0; i < c.count && !mobile; i++) mobile = this.movingBones.has(c.arrays.iSkinIdx[i * 4]) || this.movingBones.has(c.arrays.iSkinIdx[i * 4 + 1]);
        const chunk = {
          ...c, long: name === 'long', mobile, attributes: makeStrandAttributes(c.arrays), geos: new Map(), meshes: [],
          centre: new THREE.Vector3(...c.center), sphere: new THREE.Sphere(new THREE.Vector3(...c.center), c.radius),
        };
        // The patch as the elf's shadow map draws it. Only the patches that can throw a shadow near the elf go into
        // that map: three.js leaves out those whose ball (measured from where the mesh is put) misses it.
        const cast = new THREE.Mesh(makeFurGeometry(chunk.attributes, c.count, SHADOW_SEGMENTS[name]), this.furMats.depth);
        cast.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), c.radius);
        cast.position.copy(chunk.centre).add(this.group.position);
        cast.updateMatrix();
        cast.matrixAutoUpdate = false;
        cast.layers.set(LAYER_SHADOW_ELF);
        cast.name = 'fur-shadow-patch';
        chunk.cast = cast;
        if (scene) scene.add(cast);
        this.chunks.push(chunk);
      }
    }
    this._shadowApplied = -1;
    this.dirtyChunks = new Set();
    this.totalLength = 0;
    this.cutLength = 0;
    const I = this.data.body.indices, bc = this.bodyCut;
    for (const c of this.chunks) {
      const a = c.arrays;
      const g = groom[c.long ? 'long' : 'short'];
      for (let i = 0; i < c.count; i++) {
        const L = a.iA[i * 4];
        this.totalLength += L;
        // a coat regrown at another detail level keeps the haircut: each lock takes the shortest cut of its patch of hide
        if (bc) {
          const t = a.tri[i] * 3;
          const cut = Math.min(bc[I[t]], bc[I[t + 1]], bc[I[t + 2]]);
          if (cut < L) { a.iCut[i] = cut; g.iCut[a.orig[i]] = cut; this.cutLength += L - cut; }
        }
      }
    }
    if (this.body) this.casters = [this.body, ...this.furMeshes, ...this.rigid];
    if (this._detail) this.setFurDetail(this._detail, this._shadowDetail);
  }

  // ---- shearing ---------------------------------------------------------------

  /**
   * Which locks a stroke of the blades would cut, and where. The blades sweep
   * a flat sector of a disc: `pivot`, unit `forward` (its centre line) and
   * `normal` (of its plane), `radius`, optional `inner` radius and
   * `halfAngle`. A lock is cut where it crosses that sector. With `below` > 0
   * the blades are lying on the hide, and everything between them and the
   * skin (to that depth) goes too: hair rooted under the blades is cut to
   * stubble. `blades`, `shape` and `backAt` describe the blades themselves:
   * hair that would pass through one has been swept into the gap, and is cut
   * too. Returns one entry per lock that would be cut.
   */
  findCuts({ pivot, forward, normal, radius, inner = 0, halfAngle = Math.PI, minLength = 0.006, below = 0, blades = null, shape = null, backAt = null }) {
    const S = this.sampler;
    S.begin(this.furMats.uniforms.uBreath.value);
    const fx = forward.x, fy = forward.y, fz = forward.z, nx = normal.x, ny = normal.y, nz = normal.z;
    const sx = ny * fz - nz * fy, sy = nz * fx - nx * fz, sz = nx * fy - ny * fx;   // normal x forward
    const px = pivot.x, py = pivot.y, pz = pivot.z;
    const full = halfAngle >= Math.PI - 1e-3;
    const cr = (full ? radius : radius * 0.62) + (blades ? 0.02 : 0);
    const cx = full ? px : px + fx * radius * 0.5, cy = full ? py : py + fy * radius * 0.5, cz = full ? pz : pz + fz * radius * 0.5;
    const NS = 12, above = 0.003;
    const P = [0, 0, 0], Q = [0, 0, 0];
    const out = [];
    // is a point (given relative to the pivot) over the sector? leaves its polar coordinates in ru, rphi
    let ru = 0, rphi = 0;
    const over = (x, y, z, gathered = false) => {
      const u = x * fx + y * fy + z * fz, v = x * sx + y * sy + z * sz;
      ru = Math.hypot(u, v); rphi = Math.atan2(v, u);
      if (ru <= radius && ru >= inner && (full || Math.abs(rphi) <= halfAngle)) return true;
      // Hair that would pass through a blade has been parted by it instead. The
      // half nearer the cutting edge was swept into the gap, and is cut with the rest.
      if (gathered && blades && shape && backAt) {
        for (const b of blades) {
          const bu = x * b.a.x + y * b.a.y + z * b.a.z, bw = x * b.c.x + y * b.c.y + z * b.c.z;
          if (bu < shape.from + 0.004 || bu > shape.to + 0.002) continue;
          if (bw <= shape.edge && bw >= -0.45 * backAt(bu)) return true;
        }
      }
      return false;
    };
    for (const c of this.chunks) {
      // slack for how far a root may be from where it sits in the rest pose
      const slack = c.mobile ? 0.3 : 0.035;
      const reach = c.rootRadius + c.maxLength + slack + cr;
      const ddx = c.centre.x - cx, ddy = c.centre.y - cy, ddz = c.centre.z - cz;
      if (ddx * ddx + ddy * ddy + ddz * ddz > reach * reach) continue;
      const a = c.arrays;
      for (let i = 0; i < c.count; i++) {
        const L = a.iA[i * 4];
        const rem = Math.min(L, a.iCut[i]);
        if (rem <= minLength) continue;
        // cheap test on the root first
        const rx = a.iRoot[i * 3] - cx, ry = a.iRoot[i * 3 + 1] - cy, rz = a.iRoot[i * 3 + 2] - cz;
        const lim = rem + cr + slack;
        if (rx * rx + ry * ry + rz * rz > lim * lim) continue;
        S.setup(a, i);
        const keep = rem / L;
        S.point(0, P);
        let dPrev = (P[0] - px) * nx + (P[1] - py) * ny + (P[2] - pz) * nz;
        let len = -1, hx = 0, hy = 0, hz = 0, tx = 0, ty = 0, tz = 0;
        if (below > 0 && dPrev <= above && dPrev >= -below && over(P[0] - px, P[1] - py, P[2] - pz)) {
          // rooted under the blades: down to stubble, each lock a slightly different length
          len = minLength * (1 + 0.8 * a.iA[i * 4 + 2]);
          hx = P[0]; hy = P[1]; hz = P[2];
          S.point(Math.min(1, 0.02 / L), Q);
          tx = Q[0] - P[0]; ty = Q[1] - P[1]; tz = Q[2] - P[2];
        } else {
          for (let j = 1; j <= NS; j++) {
            S.point((keep * j) / NS, Q);
            const d = (Q[0] - px) * nx + (Q[1] - py) * ny + (Q[2] - pz) * nz;
            let at = -1;
            if ((dPrev <= 0) !== (d <= 0)) {
              // crosses the plane of the blades: is that crossing between them?
              const f = dPrev / (dPrev - d);
              hx = P[0] + (Q[0] - P[0]) * f; hy = P[1] + (Q[1] - P[1]) * f; hz = P[2] + (Q[2] - P[2]) * f;
              if (over(hx - px, hy - py, hz - pz, true)) at = j - 1 + f;
            }
            if (at < 0 && below > 0 && d <= above && d >= -below && over(Q[0] - px, Q[1] - py, Q[2] - pz)) {
              // passes under the blades, between them and the skin
              at = j; hx = Q[0]; hy = Q[1]; hz = Q[2];
            }
            if (at >= 0) {
              len = Math.max(minLength, ((keep * at) / NS) * L);
              tx = Q[0] - P[0]; ty = Q[1] - P[1]; tz = Q[2] - P[2];
              break;
            }
            P[0] = Q[0]; P[1] = Q[1]; P[2] = Q[2];
            dPrev = d;
          }
        }
        if (len >= 0 && len < rem - 0.002) {
          const tl = Math.hypot(tx, ty, tz) || 1;
          out.push({ chunk: c, i, L, len, prev: a.iCut[i], removed: rem - len, from: len / L, to: rem / L, r: ru, phi: rphi, x: hx, y: hy, z: hz, tx: tx / tl, ty: ty / tl, tz: tz / tl });
        }
      }
    }
    out.sort((p, q) => p.r - q.r);
    return out;
  }

  /**
   * Which locks the mouth of a running electric tool takes this instant. The
   * mouth is a flat box: `from` to `to` along `forward` from `pivot`, `half`
   * to either side, `above` and `below` the plane whose normal is `normal`.
   * A lock rooted in it is cut to stubble. With `cross`, a lock that passes
   * through it on the way from a root somewhere else is cut where it passes;
   * following a lock along its length is slow and this is asked every frame,
   * so each call only follows one lock in `stride` (those whose index leaves
   * the remainder `phase`). Entries are as from findCuts, written into `out`.
   */
  findMouth({ pivot, forward, normal, from, to, half, above = 0.008, below = 0.008, minLength = 0.003, cross = false, stride = 6, phase = 0 }, out = []) {
    const S = this.sampler;
    S.begin(this.furMats.uniforms.uBreath.value);
    const fx = forward.x, fy = forward.y, fz = forward.z, nx = normal.x, ny = normal.y, nz = normal.z;
    const sx = ny * fz - nz * fy, sy = nz * fx - nx * fz, sz = nx * fy - ny * fx;
    const px = pivot.x, py = pivot.y, pz = pivot.z;
    const mid = (from + to) / 2;
    const cx = px + fx * mid, cy = py + fy * mid, cz = pz + fz * mid;
    const cr = Math.hypot((to - from) / 2, half) + Math.max(above, below);
    const NS = 12;
    const P = this._mouthP || (this._mouthP = [0, 0, 0]), Q = this._mouthQ || (this._mouthQ = [0, 0, 0]);
    out.length = 0;
    const inBox = (x, y, z) => {
      const u = x * fx + y * fy + z * fz;
      if (u < from || u > to) return false;
      const v = x * sx + y * sy + z * sz;
      return v >= -half && v <= half;
    };
    for (const c of this.chunks) {
      // slack for how far a root may be from where it sits in the rest pose
      const slack = c.mobile ? 0.3 : 0.035;
      const reach = c.rootRadius + slack + cr + (cross ? c.maxLength : 0);
      const ddx = c.centre.x - cx, ddy = c.centre.y - cy, ddz = c.centre.z - cz;
      if (ddx * ddx + ddy * ddy + ddz * ddz > reach * reach) continue;
      const a = c.arrays, near2 = (cr + slack) * (cr + slack);
      for (let i = 0; i < c.count; i++) {
        const L = a.iA[i * 4];
        const rem = Math.min(L, a.iCut[i]);
        if (rem <= minLength + 0.0005) continue;
        const rx = a.iRoot[i * 3] - cx, ry = a.iRoot[i * 3 + 1] - cy, rz = a.iRoot[i * 3 + 2] - cz;
        const d2 = rx * rx + ry * ry + rz * rz;
        const follow = cross && i % stride === phase;
        if (d2 > near2) {
          // too far to be rooted in the mouth: only worth following along its length
          if (!follow) continue;
          const lim = rem + cr + slack;
          if (d2 > lim * lim) continue;
        }
        S.setup(a, i);
        S.point(0, P);
        let dPrev = (P[0] - px) * nx + (P[1] - py) * ny + (P[2] - pz) * nz;
        let len = -1, hx = P[0], hy = P[1], hz = P[2];
        if (dPrev <= above && dPrev >= -below && inBox(P[0] - px, P[1] - py, P[2] - pz)) {
          // rooted in the mouth: down to stubble, each lock a slightly different length
          len = minLength * (1 + 0.8 * a.iA[i * 4 + 2]);
        } else if (follow) {
          const keep = rem / L;
          for (let j = 1; j <= NS; j++) {
            S.point((keep * j) / NS, Q);
            const d = (Q[0] - px) * nx + (Q[1] - py) * ny + (Q[2] - pz) * nz;
            let at = -1;
            if ((dPrev <= 0) !== (d <= 0)) {
              const f = dPrev / (dPrev - d);
              hx = P[0] + (Q[0] - P[0]) * f; hy = P[1] + (Q[1] - P[1]) * f; hz = P[2] + (Q[2] - P[2]) * f;
              if (inBox(hx - px, hy - py, hz - pz)) at = j - 1 + f;
            }
            if (at < 0 && d <= above && d >= -below && inBox(Q[0] - px, Q[1] - py, Q[2] - pz)) { at = j; hx = Q[0]; hy = Q[1]; hz = Q[2]; }
            if (at >= 0) { len = Math.max(minLength, ((keep * at) / NS) * L); break; }
            P[0] = Q[0]; P[1] = Q[1]; P[2] = Q[2];
            dPrev = d;
          }
        }
        if (len >= 0 && len < rem - 0.0005) {
          out.push({ chunk: c, i, L, len, prev: a.iCut[i], removed: rem - len, from: len / L, to: rem / L, x: hx, y: hy, z: hz });
        }
      }
    }
    return out;
  }

  /** Cut one lock (an entry from findCuts). Returns the metres of guide hair removed. */
  applyCut(cut) {
    const { chunk, i, len } = cut;
    const a = chunk.arrays;
    const before = Math.min(a.iA[i * 4], a.iCut[i]);
    if (len >= before) return 0;
    a.iCut[i] = len;
    if (chunk.batch) chunk.batch.arrays.iCut[chunk.batch.slot[i]] = len;
    this.dirtyChunks.add(chunk);
    const g = this.groom[chunk.long ? 'long' : 'short'];
    g.iCut[a.orig[i]] = len;
    g.cutDirty = true;
    const I = this.data.body.indices, bc = this.bodyCut, t = a.tri[i] * 3;
    for (let k = 0; k < 3; k++) {
      const v = I[t + k];
      if (len < bc[v]) { bc[v] = len; this.bodyCutShown[v] = Math.min(SHOWN_MAX, len); }
    }
    this.bodyCutDirty = true;
    this.cutLength += before - len;
    return before - len;
  }

  /** Send any new cuts to the GPU. Call once a frame. */
  flushCuts() {
    if (this.dirtyChunks.size) {
      for (const c of this.dirtyChunks) {
        c.attributes.iCut.needsUpdate = true;
        if (c.batch) c.batch.attributes.iCut.needsUpdate = true;
      }
      this.dirtyChunks.clear();
    }
    this.furMeshes.forEach((f) => {
      const g = this.groom[f.userData.group];
      if (g.cutDirty) { f.geometry.attributes.iCut.needsUpdate = true; g.cutDirty = false; }
    });
    if (this.bodyCutDirty) { this.body.geometry.attributes.aCut.needsUpdate = true; this.bodyCutDirty = false; }
  }

  /**
   * Give the mammoth a haircut all at once: metres of coat left at each point
   * of the hide (as this.bodyCut holds them), or null to grow it all back.
   * Each lock takes the shortest cut of its patch of hide; or, if `locks` is
   * given ({ long, short }: what this.groom[...].iCut held, for a coat of this
   * same detail), exactly the length it had.
   */
  setHaircut(cut, locks = null) {
    const bc = this.bodyCut, shown = this.bodyCutShown;
    for (let v = 0; v < bc.length; v++) { bc[v] = cut ? cut[v] : UNCUT; shown[v] = Math.min(SHOWN_MAX, bc[v]); }
    const I = this.data.body.indices;
    this.cutLength = 0;
    for (const c of this.chunks) {
      const a = c.arrays, name = c.long ? 'long' : 'short', g = this.groom[name], own = cut && locks ? locks[name] : null;
      for (let i = 0; i < c.count; i++) {
        const L = a.iA[i * 4], t = a.tri[i] * 3;
        const left = own ? own[a.orig[i]] : Math.min(bc[I[t]], bc[I[t + 1]], bc[I[t + 2]]);
        const to = left < L ? left : UNCUT;
        a.iCut[i] = to; g.iCut[a.orig[i]] = to;
        if (c.batch) c.batch.arrays.iCut[c.batch.slot[i]] = to;
        if (left < L) this.cutLength += L - left;
      }
      this.dirtyChunks.add(c);
    }
    for (const name of ['long', 'short']) this.groom[name].cutDirty = true;
    this.bodyCutDirty = true;
    this.flushCuts();
  }

  /** Share of the coat (by length of hair) that has been cut away, 0..1. */
  get shorn() {
    return this.totalLength > 0 ? this.cutLength / this.totalLength : 0;
  }

  /**
   * The patch's locks a second time, widest first: what its extra hairs are drawn from. A wide lock shows its extra
   * hairs from further off than a narrow one, so at any distance the locks that have a given hair to show are the
   * first so-many of these, and only those are drawn (see updateCoat). `rank` is each lock's place among the guides,
   * so that an extra hair is left out along with its guide when the coat is thinned.
   */
  _batchStrands(chunk) {
    if (chunk.batch) return chunk.batch;
    const a = chunk.arrays, n = chunk.count;
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => a.iA[q * 4 + 1] - a.iA[p * 4 + 1] || p - q);
    const arrays = {}, slot = new Uint32Array(n), rank = new Float32Array(n), widths = new Float32Array(n);
    for (const name of ['iRoot', 'iOff', 'iDir', 'iNormal', 'iA', 'iB', 'iCol', 'iSkinIdx', 'iSkinWgt', 'iCut']) {
      const src = a[name], size = src.length / n, dst = new src.constructor(src.length);
      for (let j = 0; j < n; j++) for (let k = 0; k < size; k++) dst[j * size + k] = src[order[j] * size + k];
      arrays[name] = dst;
    }
    order.forEach((i, j) => { slot[i] = j; rank[j] = i; widths[j] = a.iA[i * 4 + 1]; });
    const attributes = makeStrandAttributes(arrays, BATCH);
    attributes.iRank = new THREE.InstancedBufferAttribute(rank, 1, false, BATCH);
    return (chunk.batch = { arrays, attributes, slot, widths });
  }

  /** How many of the patch's locks are wider than `width`. */
  _wider(chunk, width) {
    const w = this._batchStrands(chunk).widths;
    let lo = 0, hi = w.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (w[mid] > width) lo = mid + 1; else hi = mid; }
    return lo;
  }

  /** The geometry for one draw of a patch: its guides (b = 0), or its b-th batch of extra hairs. */
  _chunkGeometry(chunk, segments, repeat = 1, b = 0) {
    const key = segments * 100 + repeat + b * 10000;
    let geo = chunk.geos.get(key);
    if (!geo) {
      geo = makeFurGeometry(repeat > 1 ? this._batchStrands(chunk).attributes : chunk.attributes, chunk.count * repeat, segments);
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
      // near patches first; its scale carries the batch size (x), the index
      // of the first hair in the batch (y, plus one), and how many of the
      // patch's guides are being drawn (z; see updateCoat).
      mesh.position.copy(chunk.centre).add(this.group.position);
      mesh.scale.set(b === 0 ? 1 : BATCH, (b === 0 ? 0 : 1 + (b - 1) * BATCH) + 1, b === 0 ? 1 : chunk.count);
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
    for (const c of this.chunks) { for (const mesh of c.meshes) if (mesh) scene.add(mesh); scene.add(c.cast); }
  }

  /** Fraction of strands to draw (level of detail), compensating with width; and the fraction that casts the shadow. */
  setFurDetail(fraction, shadowFraction = 0.5) {
    this._detail = fraction;
    this._shadowDetail = shadowFraction;
    this.furMats.color.uniforms.uWidthScale.value = 1 / Math.sqrt(fraction);
    if (shadowFraction === this._shadowApplied) return;
    this._shadowApplied = shadowFraction;
    this.furMats.depth.uniforms.uWidthScale.value = 0.7 / Math.sqrt(shadowFraction);
    // (the meshes that cast the shadow are drawn for nothing else, so their counts stay as they are set here)
    for (const f of this.furMeshes) f.geometry.instanceCount = Math.max(1, Math.floor(f.userData.total * shadowFraction));
    for (const c of this.chunks) c.cast.geometry.instanceCount = Math.max(1, Math.floor(c.count * shadowFraction));
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
        let drawn = 0;
        for (let b = 0; b < batches; b++) {
          // An extra hair shows only on a lock wide enough for it at this distance, so a batch is drawn for just
          // those locks: the first so-many of the patch's locks taken widest first (the same sum as the shader's,
          // for the nearest any lock of the patch could be).
          const wide = b === 0 ? guides : this.allHairs ? c.count : this._wider(c, (((b - 1) * BATCH + 1.4) * d * hairPx) / (widthScale * pxScale));   // (dev: allHairs draws every lock's, to check that this leaves none out)
          if (wide === 0) break;
          const mesh = this._chunkMesh(c, b);
          const geo = b === 0 ? this._chunkGeometry(c, segs) : this._chunkGeometry(c, isWoolBatch(b) ? 5 : segs, BATCH, b);
          geo.instanceCount = b === 0 ? guides : wide * BATCH;
          if (mesh.geometry !== geo) mesh.geometry = geo;
          // (the extra hairs of a guide that is not drawn are not drawn either)
          if (b > 0 && mesh.scale.z !== guides) { mesh.scale.z = guides; mesh.updateMatrix(); mesh.updateMatrixWorld(true); }
          mesh.visible = true;
          hairs += b === 0 ? guides : wide * BATCH;
          drawn++;
        }
        batches = drawn;
        draws += drawn;
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

    // How fast his quickest parts are moving (metres a second, about: the edge of an ear in a flick, the end of the
    // tail). A shadow map drawn only every other frame must not be a frame late for something moving quickly.
    const earR = b('ear_R').rotation.y, earL = b('ear_L').rotation.y, tail = b('tail0').rotation.x + b('tail1').rotation.x;
    if (dt > 0 && this._earR !== undefined) this.stir = Math.max(Math.abs(earR - this._earR) * 0.45, Math.abs(earL - this._earL) * 0.45, Math.abs(tail - this._tail) * 0.6) / dt;
    this._earR = earR; this._earL = earL; this._tail = tail;

    this.group.updateMatrixWorld(true);
    this.rig.skeleton.update();
    this.collider.begin();
  }
}
