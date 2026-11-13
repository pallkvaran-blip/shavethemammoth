// A small kit for building the people and furniture of the place out of
// simple solids: materials that take the scene's sun and shadows, and a list
// of every mesh so that it can cast a shadow of its own.
import * as THREE from 'three';
import { patchStandardMaterial } from '../../gfx/patch.js';
import { makeDepthMaterial } from '../../gfx/shadows.js';
import { LAYER_SHADOW_NEAR } from '../../gfx/globals.js';
import { canvasTexture } from '../tool.js';

const depth = makeDepthMaterial();

export class Model {
  /** @param opts.patch  how its materials differ from the usual (see patchStandardMaterial); opts.depth: what it casts its shadow with */
  constructor(name, { patch = null, depth: own = null } = {}) {
    this.group = new THREE.Group();
    this.group.name = name;
    this.meshes = [];
    this.patch = patch || { key: 'folk', bias: 0.03 };
    this.depth = own || depth;
  }

  /** A material in a colour (or with a map), lit like everything else here. */
  mat(colour, { rough = 0.7, metal = 0, map = null, coat = 0, sheen = 0, emissive = 0, glow = 0, side = THREE.FrontSide, bump = null, bumpScale = 1 } = {}) {
    const m = new THREE.MeshPhysicalMaterial({ color: colour, roughness: rough, metalness: metal, map, clearcoat: coat, clearcoatRoughness: 0.4, sheen, side, bumpMap: bump, bumpScale, emissive, emissiveIntensity: glow });
    return patchStandardMaterial(m, this.patch);
  }

  add(parent, geo, material, name = '') {
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.userData.shadowMaterial = this.depth;
    mesh.layers.enable(LAYER_SHADOW_NEAR);
    parent.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  /** A ball, squashed or stretched. */
  ball(parent, material, r, [x, y, z], [sx, sy, sz] = [1, 1, 1], name = '') {
    const m = this.add(parent, new THREE.SphereGeometry(r, 22, 16), material, name);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    return m;
  }

  /** A rod from one point to another, thicker at the first end if r2 is given. */
  rod(parent, material, a, b, r1, r2 = r1, name = '') {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
    const m = this.add(parent, new THREE.CylinderGeometry(r2, r1, len, 12), material, name);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
    return m;
  }

  box(parent, material, [w, h, d], [x, y, z], name = '') {
    const m = this.add(parent, new THREE.BoxGeometry(w, h, d), material, name);
    m.position.set(x, y, z);
    return m;
  }
}

/** A painted sign: lines of lettering on a board. Returns a texture. */
export function signTexture(lines, { w = 512, h = 160, ground = '#3b2a1c', ink = '#f1e2c2', font = 'Georgia, serif', border = true } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = ground; g.fillRect(0, 0, w, h);
    // the grain of the board
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2); }
    if (border) { g.strokeStyle = ink; g.globalAlpha = 0.6; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16); g.globalAlpha = 1; }
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    const total = lines.reduce((s, l) => s + l.size * 1.15, 0);
    let y = (h - total) / 2;
    for (const l of lines) {
      g.font = `${l.style || ''} ${l.size}px ${font}`;
      g.fillText(l.text, w / 2, y + l.size * 0.575, w - 28);
      y += l.size * 1.15;
    }
  }, true);
}

/** Planks, for anything knocked together out of wood. */
export function plankTexture(base = '#7a5536') {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      g.strokeStyle = Math.random() < 0.6 ? `rgba(40,24,10,${0.08 + Math.random() * 0.2})` : `rgba(220,180,130,${0.05 + Math.random() * 0.12})`;
      g.lineWidth = 0.5 + Math.random() * 1.5;
      const y = Math.random() * h;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 6); g.stroke();
    }
    for (let x = 0; x <= w; x += 64) { g.fillStyle = 'rgba(20,12,6,0.55)'; g.fillRect(x - 1, 0, 2.5, h); }
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(30,18,8,0.5)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 4, 2 + Math.random() * 2, 0, 0, 7); g.fill(); }
  }, true);
}
