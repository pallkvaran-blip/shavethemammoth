// The part of a sculpted figure that three.js has to know about: its bones,
// and its layers as meshes hung on them. (The sculpting itself is in
// sculpt.js, and may have been done on another thread.)
import * as THREE from 'three';

/**
 * The bones of a figure. `spec` lists them root first: { name, parent, at: [x, y, z] } where `at` is where the
 * joint is when the figure stands at rest. Returns the bones by name and the skeleton they make.
 */
export function makeRig(spec) {
  const bones = {}, list = [], index = new Map(), rest = {};
  for (const b of spec) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bones[b.name] = bone; rest[b.name] = new THREE.Vector3(...b.at);
    index.set(b.name, list.length);
    list.push(bone);
  }
  const root = new THREE.Group();
  root.name = 'bones';
  for (const b of spec) {
    const bone = bones[b.name];
    if (b.parent) { bones[b.parent].add(bone); bone.position.copy(rest[b.name]).sub(rest[b.parent]); } else { root.add(bone); bone.position.copy(rest[b.name]); }
  }
  root.updateMatrixWorld(true);
  return { bones, list, index, rest, root, skeleton: new THREE.Skeleton(list) };
}

const DEPTH_VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
}`;
let skinnedDepth = null;
/** What a skinned mesh casts its shadow with (the shadow has to bend when it does). */
export function skinnedDepthMaterial() {
  if (!skinnedDepth) {
    skinnedDepth = new THREE.ShaderMaterial({
      vertexShader: DEPTH_VERT, fragmentShader: 'void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }', side: THREE.DoubleSide,
    });
  }
  return skinnedDepth;
}

/** A mesh of one layer, hung on the figure's bones. */
export function layerMesh(data, material, rig, name = '') {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
  geo.setAttribute('aShade', new THREE.BufferAttribute(data.shade, 2));
  geo.setAttribute('aTint', new THREE.BufferAttribute(data.tint, 4));
  geo.setIndex(new THREE.BufferAttribute(data.index, 1));
  let mesh;
  if (rig) {
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(data.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(data.skinWeight, 4));
    mesh = new THREE.SkinnedMesh(geo, material);
    mesh.bind(rig.skeleton, new THREE.Matrix4());
  } else {
    mesh = new THREE.Mesh(geo, material);
  }
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.userData.shadowMaterial = skinnedDepthMaterial();
  return mesh;
}

