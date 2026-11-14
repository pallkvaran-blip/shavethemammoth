// What the figures have in common once they are baked (see bake.js): their
// layers are hung on their bones; and there are eyes to put in, hair to hang
// on, and odd rigid things (a tooth, a buckle, a monocle) to pin to a bone.
import * as THREE from 'three';
import { makeRig, layerMesh, skinnedDepthMaterial } from './rig.js';
import { makeDepthMaterial } from '../../gfx/shadows.js';
import { LAYER_SHADOW_NEAR, LAYER_SHADOW_ELF } from '../../gfx/globals.js';

/** All of a figure's layers run together into one mesh on its bones, which is drawn only into the shadow maps. */
function shadowBody(layers, rig, name) {
  let nv = 0, ni = 0;
  for (const d of layers) { nv += d.position.length / 3; ni += d.index.length; }
  const position = new Float32Array(nv * 3), skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4), index = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const d of layers) {
    position.set(d.position, v * 3); skinIndex.set(d.skinIndex, v * 4); skinWeight.set(d.skinWeight, v * 4);
    for (let k = 0; k < d.index.length; k++) index[i + k] = d.index[k] + v;
    v += d.position.length / 3; i += d.index.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  const mesh = new THREE.SkinnedMesh(geo, skinnedDepthMaterial());
  mesh.bind(rig.skeleton, new THREE.Matrix4());
  mesh.name = name + ' (shadow)';
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_SHADOW_NEAR);
  mesh.layers.enable(LAYER_SHADOW_ELF);
  return mesh;
}

/**
 * @param bones      as for makeRig
 * @param data       { name: a layer's mesh, from baking }
 * @param materials  { name: material }
 */
export function buildFigure(name, bones, data, materials, far = null) {
  const rig = makeRig(bones);
  const group = new THREE.Group();
  group.name = name;
  group.add(rig.root);
  const meshes = [], pairs = [], fine = [];
  for (const [n, d] of Object.entries(data)) {
    const mesh = layerMesh(d, materials[n], rig, n);
    group.add(mesh);
    meshes.push(mesh);
    fine.push(mesh);
    if (far && far[n]) {
      // the same layer with fewer faces, drawn instead when the figure is a long way off
      const coarse = layerMesh(far[n], materials[n], rig, n + ' (far)');
      coarse.userData.shadowMaterial = null;
      coarse.visible = false;
      group.add(coarse);
      meshes.push(coarse);
      pairs.push([mesh, coarse]);
    }
  }
  // Its shadow is cast by one mesh of all its layers (those with fewer faces, where there are some): one drawing for
  // each shadow map, not one for every layer. Only when the figure is looked at from close to do its layers cast
  // their own shadows, so that what is seen and what shades it are exactly the same shape.
  const cast = shadowBody(Object.entries(data).map(([n, d]) => (far && far[n]) || d), rig, name);
  group.add(cast);
  let exact = false;
  const castExactly = (on) => {
    if (on === exact) return;
    exact = on;
    cast.visible = !on;
    for (const m of fine) { if (on) m.layers.enable(LAYER_SHADOW_NEAR); else { m.layers.disable(LAYER_SHADOW_NEAR); m.layers.disable(LAYER_SHADOW_ELF); } }
  };

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
    // (set in the head as they are, they throw no shadow that the head does not)
    for (const m of [ball, lid, low]) { m.userData.shadowMaterial = null; m.layers.disable(LAYER_SHADOW_NEAR); }
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
    for (const m of [...meshes, cast]) {
      m.frustumCulled = true;
      if (m.isSkinnedMesh) { m.boundingSphere = ball.clone(); continue; }
      // (anything hung on a bone goes where the bone goes, and knows its own size; hair and feathers stir a little beyond theirs)
      if (m.geometry.boundingSphere === null) {
        m.geometry.computeBoundingSphere();
        if (m.name === 'locks' || m.name === 'plumes') m.geometry.boundingSphere.radius = m.geometry.boundingSphere.radius * 1.2 + 0.01;
      }
    }
  };
  /**
   * Told each frame how far off the eye is: beyond a few metres the meshes with fewer faces are drawn, and the hair
   * with fewer strands (each wider), since neither can be told from the real thing at that size. `quality` scales the
   * hair further, for a machine that is struggling.
   */
  let distant = false;
  const see = (dist, quality = 1, inView = true) => {
    const now = pairs.length > 0 && dist > (distant ? 3.0 : 3.6);
    if (now !== distant) { distant = now; for (const [fine, coarse] of pairs) { fine.visible = !now; coarse.visible = now; } }
    castExactly(pairs.length > 0 && !distant && inView);
    detail(Math.min(1, 2.2 / Math.max(dist, 0.01)) * (dist > 6 ? 0.6 : 1) * quality);
  };
  /**
   * Called round the drawing of the shadow maps (on before, off after): a share of the hair casts its shadow, however
   * close the eye is. Nobody can tell, and up close every hair would otherwise be drawn three times over.
   */
  let shading = false;
  const shade = (on) => {
    if (on === shading) return;
    shading = on;
    for (const h of hairs) if (h.shade) h.shade(on);
  };
  return { group, rig, B, meshes, data, materials, hang, grow, pivot, eye, bound, detail, see, shade, cast };
}
