// Where, exactly, is the mammoth's hide? The baked distance volume the fur
// drapes over is too coarse to keep a blade a few millimetres off the skin, so
// anything that must not sink into the body asks here instead: the same
// description of ellipsoids and round cones the mesh was made from, evaluated
// exactly, with each piece carried along by the bone it rides on (so the
// swaying trunk is where it looks) and the toenails added on top.
import { primDist, smin } from './sdf.js';
import { NAIL_BASE, nailOutline } from './anatomy.js';

export class BodyCollider {
  constructor({ sdf, anat, rig }) {
    this.prims = sdf.prims;
    this.skeleton = rig.skeleton;
    this.feet = anat.feet;
    const moving = /^(neck|head|ear|tail|trunk)/;
    // each primitive rides on one bone; -1 for bones that never move
    this.boneOf = this.prims.map((o) => {
      const b = rig.byName.get(o.bone);
      return moving.test(rig.bones[b].name) ? b : -1;
    });
    this.movingBones = [...new Set(this.boneOf.filter((b) => b >= 0))];
    this.slot = new Int16Array(rig.bones.length).fill(-1);
    this.movingBones.forEach((b, i) => { this.slot[b] = i; });
    this.inv = new Float32Array(this.movingBones.length * 12);   // rest <- world, per moving bone
    this.local = new Float32Array(this.movingBones.length * 3);
    this.begin();
  }

  /** Once per frame, after the skeleton has moved. */
  begin() {
    const M = this.skeleton.boneMatrices, inv = this.inv;
    if (!M) return;
    this.movingBones.forEach((b, i) => {
      // skin matrix (rest -> world) is a rotation and a translation: invert it directly
      const o = b * 16, k = i * 12;
      const r00 = M[o], r10 = M[o + 1], r20 = M[o + 2], r01 = M[o + 4], r11 = M[o + 5], r21 = M[o + 6], r02 = M[o + 8], r12 = M[o + 9], r22 = M[o + 10];
      const tx = M[o + 12], ty = M[o + 13], tz = M[o + 14];
      inv[k] = r00; inv[k + 1] = r10; inv[k + 2] = r20; inv[k + 3] = -(r00 * tx + r10 * ty + r20 * tz);
      inv[k + 4] = r01; inv[k + 5] = r11; inv[k + 6] = r21; inv[k + 7] = -(r01 * tx + r11 * ty + r21 * tz);
      inv[k + 8] = r02; inv[k + 9] = r12; inv[k + 10] = r22; inv[k + 11] = -(r02 * tx + r12 * ty + r22 * tz);
    });
  }

  /** How far the toenails stand proud of the skin at a point near a foot. */
  nail(x, y, z) {
    if (y > 0.13 || y < -0.02) return 0;
    let best = 0;
    for (const f of this.feet) {
      const dx = x - f.c[0], dz = z - f.c[2];
      const rr = dx * dx + dz * dz, lim = f.r + 0.06;
      if (rr > lim * lim) continue;
      const ang = Math.atan2(dz, dx);
      for (const n of f.nails) {
        const v = (y - NAIL_BASE) / n.h;
        if (v < -0.05 || v > 1.03) continue;
        const vc = Math.min(1, Math.max(0, v));
        let da = ang - n.a;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const half = n.w * nailOutline(vc * 0.985) * 1.12 + 0.002;   // a little generous: each nail leans its own way
        const u = (da * f.r) / half;
        if (Math.abs(u) >= 1) continue;
        const t = 0.0018 + 0.0185 * Math.sqrt(1 - u * u) * Math.sqrt(Math.max(0, 1 - Math.pow(vc, 2.4))) * (0.6 + 0.4 * Math.min(1, vc * 5 + 0.2));
        if (t > best) best = t;
      }
    }
    return best;
  }

  /** Distance from a point in the world to the hide (negative inside). */
  dist(x, y, z) {
    const prims = this.prims, boneOf = this.boneOf, inv = this.inv, local = this.local;
    // the point as each moving bone sees it, in the rest pose
    for (let i = 0, n = this.movingBones.length; i < n; i++) {
      const k = i * 12;
      local[i * 3] = inv[k] * x + inv[k + 1] * y + inv[k + 2] * z + inv[k + 3];
      local[i * 3 + 1] = inv[k + 4] * x + inv[k + 5] * y + inv[k + 6] * z + inv[k + 7];
      local[i * 3 + 2] = inv[k + 8] * x + inv[k + 9] * y + inv[k + 10] * z + inv[k + 11];
    }
    let d = 1e9;
    for (let i = 0; i < prims.length; i++) {
      const o = prims[i], b = boneOf[i];
      let px = x, py = y, pz = z;
      if (b >= 0) { const s = this.slot[b] * 3; px = local[s]; py = local[s + 1]; pz = local[s + 2]; }
      const dx = px - o.bx, dy = py - o.by, dz = pz - o.bz;
      const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - o.br;
      if (lb >= d + o.k) continue;
      d = smin(d, primDist(o, px, py, pz), o.k);
    }
    if (d < 0.05) d -= this.nail(x, y, z);
    return d;
  }

  /** Unit direction straight away from the hide at a point. */
  normal(x, y, z, out, h = 0.0015) {
    const gx = this.dist(x + h, y, z) - this.dist(x - h, y, z);
    const gy = this.dist(x, y + h, z) - this.dist(x, y - h, z);
    const gz = this.dist(x, y, z + h) - this.dist(x, y, z - h);
    const l = Math.hypot(gx, gy, gz) || 1;
    out[0] = gx / l; out[1] = gy / l; out[2] = gz / l;
    return out;
  }
}
