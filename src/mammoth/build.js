// Builds the mammoth's geometry: skinned body mesh with grooming attributes,
// tusks, eyes and toenails. Pure data generation, done once at load.
import * as THREE from 'three';
import { BodySDF } from './sdf.js';
import { sampleGrid, surfaceNets, orientOutward, relax, bakeVolume } from './mesher.js';
import { buildAnatomy, nailOutline, NAIL_BASE } from './anatomy.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export async function buildMammothData({ cell = 0.025, volumeRes = [144, 88, 64] } = {}, progress = () => {}) {
  const anat = buildAnatomy();
  const sdf = new BodySDF(anat.prims);

  progress(0.05, 'Shaping the body');
  await tick();
  const grid = sampleGrid(sdf, anat.bounds, cell);
  await tick();
  const mesh = surfaceNets(grid);
  progress(0.3, 'Shaping the body');
  await tick();

  const p = mesh.positions;
  const n = p.length / 3;
  const normals = new Float32Array(n * 3);
  const g = [0, 0, 0];
  const computeNormals = () => {
    for (let i = 0; i < n; i++) {
      sdf.grad(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], g, 0.006);
      normals[i * 3] = g[0]; normals[i * 3 + 1] = g[1]; normals[i * 3 + 2] = g[2];
    }
  };
  computeNormals();
  orientOutward(mesh, normals);
  relax(mesh, sdf, 2);
  computeNormals();
  progress(0.45, 'Shaping the body');
  await tick();

  // ---- skin weights + grooming attributes --------------------------------
  const boneIndex = new Map(anat.bones.map((b, i) => [b.name, i]));
  const primBone = sdf.prims.map((o) => {
    const bi = boneIndex.get(o.bone);
    if (bi === undefined) throw new Error('no bone ' + o.bone + ' for ' + o.name);
    return bi;
  });
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const furA = new Float32Array(n * 4); // length, lift, tone, red
  const furB = new Float32Array(n * 4); // clump, breath, bareness, unused
  const flow = new Float32Array(n * 3); // direction the hair is combed along the limb, where one is given
  const idx = new Int32Array(64), w = new Float32Array(64), prm = new Float32Array(64);
  const boneAcc = new Float32Array(anat.bones.length);
  const spineBone = boneIndex.get('spine'), neckBone = boneIndex.get('neck');
  const eye = anat.eye;
  const trunkTipBone = boneIndex.get('trunk7');

  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    const ny = normals[i * 3 + 1];

    // skin weights: tight falloff so limbs stay rigid away from joints
    boneAcc.fill(0);
    let cnt = sdf.influences(x, y, z, 0.2, idx, w, null);
    for (let j = 0; j < cnt; j++) boneAcc[primBone[idx[j]]] += w[j];
    let total = 0;
    for (let s = 0; s < 4; s++) {
      let best = -1, bw = 0;
      for (let b = 0; b < boneAcc.length; b++) if (boneAcc[b] > bw) { bw = boneAcc[b]; best = b; }
      if (best < 0) break;
      skinIndex[i * 4 + s] = best; skinWeight[i * 4 + s] = bw; total += bw; boneAcc[best] = 0;
    }
    if (total <= 0) { skinIndex[i * 4] = spineBone; skinWeight[i * 4] = 1; total = 1; }
    for (let s = 0; s < 4; s++) skinWeight[i * 4 + s] /= total;

    // grooming: wider, softer blend
    cnt = sdf.influences(x, y, z, 0.32, idx, w, prm);
    let len = 0, lift = 0, tone = 0, red = 0, clump = 0, torso = 0, wsum = 0, flx = 0, fly = 0, flz = 0;
    for (let j = 0; j < cnt; j++) {
      const o = sdf.prims[idx[j]], f = o.fur, wj = w[j];
      const l = f.lenB !== undefined ? f.len + (f.lenB - f.len) * prm[j] : f.len;
      len += l * wj; lift += (f.lift ?? 0.3) * wj; tone += (f.tone ?? 0) * wj; red += (f.red ?? 0) * wj; clump += (f.clump ?? 1) * wj;
      if (primBone[idx[j]] === spineBone || primBone[idx[j]] === neckBone) torso += wj;
      if (f.comb && o.t === 2) {
        const il = f.comb * wj / Math.sqrt(o.l2);
        flx += o.bax * il; fly += o.bay * il; flz += o.baz * il;
      }
      wsum += wj;
    }
    if (wsum > 0) { len /= wsum; lift /= wsum; tone /= wsum; red /= wsum; clump /= wsum; torso /= wsum; flx /= wsum; fly /= wsum; flz /= wsum; } else { len = 0.3; lift = 0.3; clump = 1; }
    flow[i * 3] = flx; flow[i * 3 + 1] = fly; flow[i * 3 + 2] = flz;

    // the top line carries shorter, lighter hair; flanks and underside a long skirt
    const top = smooth(-0.2, 0.85, ny);
    len *= 1 + torso * (0.18 - 0.5 * top);
    tone += torso * top * 0.25;
    red += torso * top * 0.3;
    // feathering over the feet, bare soles
    len *= 0.35 + 0.65 * smooth(0.02, 0.3, y);
    let bare = 0;
    if (y < 0.06 && ny < -0.3) bare = 1;
    // bare skin around the eyes
    const ex = x - eye.pos[0], ey = y - eye.pos[1], ez = Math.abs(z) - eye.pos[2];
    const de = Math.sqrt(ex * ex + ey * ey + ez * ez);
    const eyeMask = 1 - smooth(0.045, 0.14, de);
    len *= 1 - 0.9 * eyeMask;
    bare = Math.max(bare, 1 - smooth(0.026, 0.042, de));
    // the very tip of the trunk is naked
    if (skinIndex[i * 4] === trunkTipBone) {
      const tx = x - 2.37, ty = y - 0.31;
      const dt = Math.sqrt(tx * tx + ty * ty + z * z);
      const tip = 1 - smooth(0.05, 0.16, dt);
      len *= 1 - 0.8 * tip;
      bare = Math.max(bare, 1 - smooth(0.03, 0.09, dt));
    }
    // nothing grows on the toenails, and a rim of bare skin frames each one
    if (y < 0.16) {
      for (const f of anat.feet) {
        const dx = x - f.c[0], dz = z - f.c[2];
        if (dx * dx + dz * dz > (f.r + 0.12) * (f.r + 0.12)) continue;
        const ang = Math.atan2(dz, dx);
        for (const nail of f.nails) {
          let da = ang - nail.a;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          const v = (y - NAIL_BASE) / nail.h;
          if (v > 1.2) continue;
          const half = nail.w * nailOutline(v) + 0.01;
          const m = (1 - smooth(half - 0.004, half + 0.006, Math.abs(da) * f.r)) * (1 - smooth(1.04, 1.18, v));
          if (m > 0) { len *= 1 - m; bare = Math.max(bare, m); }
        }
      }
      // the bottom of the foot is under the snow
      len *= smooth(0.02, 0.06, y);
    }
    if (y < 0.24) {
      // short hair low on the foot, so the nails show beneath its fringe
      len *= 0.42 + 0.58 * smooth(0.1, 0.24, y);
    }
    if (bare > 0.5) len = 0;

    // breathing: the ribcage and belly swell
    const bx = (x - 0.1) / 1.5, by = (y - 1.85) / 0.75;
    const breath = Math.exp(-(bx * bx + by * by)) * torso * (0.4 + 0.6 * Math.abs(normals[i * 3 + 2]));

    furA[i * 4] = len; furA[i * 4 + 1] = lift; furA[i * 4 + 2] = tone; furA[i * 4 + 3] = red;
    furB[i * 4] = clump; furB[i * 4 + 1] = breath; furB[i * 4 + 2] = bare; furB[i * 4 + 3] = torso;
  }
  progress(0.6, 'Shaping the body');
  await tick();

  // ---- distance volume for fur draping -----------------------------------
  const volBounds = { min: [-2.9, -0.2, -1.5], max: [3.3, 3.6, 1.5] };
  const volume = bakeVolume(sdf, volBounds, volumeRes);
  volume.bounds = volBounds;
  progress(0.75, 'Shaping the body');
  await tick();

  return {
    anat, sdf,
    body: { positions: p, normals, indices: mesh.indices, skinIndex, skinWeight, furA, furB, flow },
    volume,
  };
}

// ---- tusks -----------------------------------------------------------------

export function buildTuskGeometry(tusk, side = 1, segments = 96, radial = 20) {
  const pts = tusk.points.map((q) => new THREE.Vector3(q[0], q[1], q[2] * side));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [], normals = [], uvs = [], indices = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  const lengths = curve.getLengths(segments);
  const total = lengths[segments];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, P);
    // gentle taper that speeds up towards a blunt point
    const r = tusk.baseRadius * (0.035 + 0.965 * Math.pow(1 - t, 0.62)) * (1 - 0.1 * t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      N.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      positions.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r);
      normals.push(N.x, N.y, N.z);
      uvs.push(j / radial, (t * total));
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  // close the tip
  const tipIndex = positions.length / 3;
  curve.getPointAt(1, P);
  const T = frames.tangents[segments];
  positions.push(P.x + T.x * 0.004, P.y + T.y * 0.004, P.z + T.z * 0.004);
  normals.push(T.x, T.y, T.z); uvs.push(0.5, total);
  const last = segments * (radial + 1);
  for (let j = 0; j < radial; j++) indices.push(last + j, last + j + 1, tipIndex);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.userData.length = total;
  return geo;
}

// ---- body geometry ---------------------------------------------------------

export function buildBodyGeometry(body) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(body.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(body.normals, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(body.skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(body.skinWeight, 4));
  geo.setAttribute('furA', new THREE.BufferAttribute(body.furA, 4));
  geo.setAttribute('furB', new THREE.BufferAttribute(body.furB, 4));
  geo.setIndex(new THREE.BufferAttribute(body.indices, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

export function buildSkeleton(anat) {
  const bones = anat.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    return bone;
  });
  const byName = new Map(anat.bones.map((b, i) => [b.name, i]));
  anat.bones.forEach((b, i) => {
    const bone = bones[i];
    if (b.parent) {
      const pi = byName.get(b.parent);
      const pp = anat.bones[pi].pos;
      bone.position.set(b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]);
      bones[pi].add(bone);
    } else {
      bone.position.set(b.pos[0], b.pos[1], b.pos[2]);
    }
  });
  // world matrices must reflect the rest pose before the skeleton records its inverses
  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  return { skeleton, bones, byName, rootBone: bones[0] };
}
