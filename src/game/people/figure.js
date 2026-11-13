// What the figures have in common once they are baked (see bake.js): their
// layers are hung on their bones; and there are eyes to put in, hair to hang
// on, and odd rigid things (a tooth, a buckle, a monocle) to pin to a bone.
import * as THREE from 'three';
import { makeRig, layerMesh } from './rig.js';
import { makeDepthMaterial } from '../../gfx/shadows.js';
import { LAYER_SHADOW_NEAR } from '../../gfx/globals.js';

/**
 * @param bones      as for makeRig
 * @param data       { name: a layer's mesh, from baking }
 * @param materials  { name: material }
 */
export function buildFigure(name, bones, data, materials) {
  const rig = makeRig(bones);
  const group = new THREE.Group();
  group.name = name;
  group.add(rig.root);
  const meshes = [];
  for (const [n, d] of Object.entries(data)) {
    const mesh = layerMesh(d, materials[n], rig, n);
    mesh.layers.enable(LAYER_SHADOW_NEAR);
    group.add(mesh);
    meshes.push(mesh);
  }

  const depth = makeDepthMaterial();
  const B = rig.bones;
  /** Pin a mesh (or a group of them) to a bone; `at` is where it is when the figure stands at rest. */
  const hang = (bone, object, at = [0, 0, 0]) => {
    const r = rig.rest[bone];
    object.position.set(at[0] - r.x, at[1] - r.y, at[2] - r.z);
    object.traverse((m) => {
      if (!m.isMesh) return;
      if (!m.userData.shadowMaterial) m.userData.shadowMaterial = depth;
      m.layers.enable(LAYER_SHADOW_NEAR);
      m.frustumCulled = false;
      meshes.push(m);
    });
    B[bone].add(object);
    return object;
  };
  const hairs = [];
  /** Hang hair or feathers (grown where the figure stands at rest) on a bone. */
  const grow = (bone, locks) => {
    locks.mesh.position.sub(rig.rest[bone]);
    B[bone].add(locks.mesh);
    meshes.push(locks.mesh);
    if (locks.detail) hairs.push(locks);
    return locks;
  };
  /** Draw this share of every strand of its hair (1 = all of it). */
  const detail = (f) => { for (const h of hairs) h.detail(f); };
  /** Hair that has to turn about a point of its own (an eyebrow): returns the pivot, a group on the bone. */
  const pivot = (bone, locks, at) => {
    const p = new THREE.Group(), r = rig.rest[bone];
    p.position.set(at[0] - r.x, at[1] - r.y, at[2] - r.z);
    locks.mesh.position.set(-at[0], -at[1], -at[2]);
    p.add(locks.mesh);
    B[bone].add(p);
    meshes.push(locks.mesh);
    if (locks.detail) hairs.push(locks);
    return p;
  };
  /**
   * An eye: the ball, a lid that comes down over it and one that stays under it. `shut` is set with lids(0..1).
   * @param r  the ball's radius;  look: how far the lower lid comes up (radians)
   */
  const eye = (bone, at, r, eyeMat, lidMat, { under = 0.62, open = -0.92 } = {}) => {
    const ball = hang(bone, new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28).rotateX(Math.PI / 2), eyeMat), at);   // (a sphere's poles are up and down; an eye's are front and back)
    const lid = hang(bone, new THREE.Mesh(new THREE.SphereGeometry(r + 0.0007, 32, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), lidMat), at);
    const low = hang(bone, new THREE.Mesh(new THREE.SphereGeometry(r + 0.0006, 32, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), lidMat), at);
    low.rotation.x = -(Math.PI - under);
    lid.rotation.x = open;
    return { ball, lid, low, r, shut(v) { lid.rotation.x = open + 1.1 * v; } };
  };
  /**
   * Say how much room the figure takes up (a ball round `centre`, where it stands at rest), so that it is not drawn,
   * nor its shadow worked out, when it is nowhere in the picture. For a figure that stays where it is put.
   */
  const bound = (centre, radius) => {
    const ball = new THREE.Sphere(new THREE.Vector3(...centre), radius);
    for (const m of meshes) {
      m.frustumCulled = true;
      if (m.isSkinnedMesh) { m.boundingSphere = ball.clone(); continue; }
      // (anything hung on a bone goes where the bone goes, and knows its own size; hair and feathers stir a little beyond theirs)
      if (m.geometry.boundingSphere === null) {
        m.geometry.computeBoundingSphere();
        if (m.name === 'locks' || m.name === 'plumes') m.geometry.boundingSphere.radius = m.geometry.boundingSphere.radius * 1.2 + 0.01;
      }
    }
  };
  return { group, rig, B, meshes, data, materials, hang, grow, pivot, eye, bound, detail };
}
