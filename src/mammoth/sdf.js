// Signed-distance-field toolkit used to sculpt the mammoth body.
// The body is a smooth union of ellipsoids and round cones; each primitive is
// tied to a bone and carries grooming data, so the same description gives us
// the surface, the skin weights and the fur parameters.

const EPS = 1e-9;

function quatFromEulerZYX(rx, ry, rz) {
  // intrinsic rotations: Z, then Y, then X (degrees)
  const d = Math.PI / 180;
  const cx = Math.cos(rx * d * 0.5), sx = Math.sin(rx * d * 0.5);
  const cy = Math.cos(ry * d * 0.5), sy = Math.sin(ry * d * 0.5);
  const cz = Math.cos(rz * d * 0.5), sz = Math.sin(rz * d * 0.5);
  // q = qz * qy * qx
  return [
    cz * cy * sx - sz * sy * cx,
    cz * sy * cx + sz * cy * sx,
    sz * cy * cx - cz * sy * sx,
    cz * cy * cx + sz * sy * sx,
  ];
}

function mat3FromQuat(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * h * k * (1 / 6);
}

export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

/**
 * Compile a list of primitive descriptions.
 *  sphere:    { type:'sph', c:[x,y,z], r }
 *  ellipsoid: { type:'ell', c:[x,y,z], r:[rx,ry,rz], rot:[degX,degY,degZ] }
 *  roundcone: { type:'rc',  a:[x,y,z], b:[x,y,z], r1, r2 }
 * common:     { k: blend radius, bone: 'name', fur: {...}, name }
 */
export function compilePrims(list) {
  return list.map((p, index) => {
    const o = { index, type: p.type, k: p.k ?? 0.2, bone: p.bone, fur: p.fur || {}, name: p.name || '' };
    if (p.type === 'sph') {
      o.t = 0;
      o.cx = p.c[0]; o.cy = p.c[1]; o.cz = p.c[2];
      o.r = p.r;
      o.bx = o.cx; o.by = o.cy; o.bz = o.cz; o.br = p.r;
    } else if (p.type === 'ell') {
      o.t = 1;
      o.cx = p.c[0]; o.cy = p.c[1]; o.cz = p.c[2];
      o.rx = p.r[0]; o.ry = p.r[1]; o.rz = p.r[2];
      const rot = p.rot || [0, 0, 0];
      const m = mat3FromQuat(quatFromEulerZYX(rot[0], rot[1], rot[2]));
      // world->local is the transpose
      o.m00 = m[0]; o.m01 = m[3]; o.m02 = m[6];
      o.m10 = m[1]; o.m11 = m[4]; o.m12 = m[7];
      o.m20 = m[2]; o.m21 = m[5]; o.m22 = m[8];
      o.bx = o.cx; o.by = o.cy; o.bz = o.cz; o.br = Math.max(o.rx, o.ry, o.rz);
    } else if (p.type === 'rc') {
      o.t = 2;
      o.ax = p.a[0]; o.ay = p.a[1]; o.az = p.a[2];
      o.bax = p.b[0] - p.a[0]; o.bay = p.b[1] - p.a[1]; o.baz = p.b[2] - p.a[2];
      o.r1 = p.r1; o.r2 = p.r2;
      o.l2 = o.bax * o.bax + o.bay * o.bay + o.baz * o.baz;
      o.rr = p.r1 - p.r2;
      o.a2 = o.l2 - o.rr * o.rr;
      o.il2 = 1 / o.l2;
      o.bx = (p.a[0] + p.b[0]) * 0.5; o.by = (p.a[1] + p.b[1]) * 0.5; o.bz = (p.a[2] + p.b[2]) * 0.5;
      o.br = Math.sqrt(o.l2) * 0.5 + Math.max(p.r1, p.r2);
    } else {
      throw new Error('unknown primitive ' + p.type);
    }
    return o;
  });
}

// distance to one primitive
export function primDist(o, x, y, z) {
  if (o.t === 0) {
    const dx = x - o.cx, dy = y - o.cy, dz = z - o.cz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - o.r;
  }
  if (o.t === 1) {
    const dx = x - o.cx, dy = y - o.cy, dz = z - o.cz;
    const lx = (o.m00 * dx + o.m01 * dy + o.m02 * dz) / o.rx;
    const ly = (o.m10 * dx + o.m11 * dy + o.m12 * dz) / o.ry;
    const lz = (o.m20 * dx + o.m21 * dy + o.m22 * dz) / o.rz;
    const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const gx = lx / o.rx, gy = ly / o.ry, gz = lz / o.rz;
    const k1 = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (k1 < EPS) return -Math.min(o.rx, o.ry, o.rz);
    return (k0 * (k0 - 1)) / k1;
  }
  // round cone (after Inigo Quilez)
  const pax = x - o.ax, pay = y - o.ay, paz = z - o.az;
  const yy = pax * o.bax + pay * o.bay + paz * o.baz;
  const zz = yy - o.l2;
  const qx = pax * o.l2 - o.bax * yy, qy = pay * o.l2 - o.bay * yy, qz = paz * o.l2 - o.baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * o.l2;
  const z2 = zz * zz * o.l2;
  const k = Math.sign(o.rr) * o.rr * o.rr * x2;
  if (Math.sign(zz) * o.a2 * z2 > k) return Math.sqrt(x2 + z2) * o.il2 - o.r2;
  if (Math.sign(yy) * o.a2 * y2 < k) return Math.sqrt(x2 + y2) * o.il2 - o.r1;
  return (Math.sqrt(x2 * o.a2 * o.il2) + yy * o.rr) * o.il2 - o.r1;
}

// parameter 0..1 along a round cone's axis (0 for other primitives)
export function primParam(o, x, y, z) {
  if (o.t !== 2) return 0;
  const t = ((x - o.ax) * o.bax + (y - o.ay) * o.bay + (z - o.az) * o.baz) * o.il2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export class BodySDF {
  constructor(primList, { groundY = 0, groundK = 0.05 } = {}) {
    this.prims = compilePrims(primList);
    this.groundY = groundY;
    this.groundK = groundK;
  }

  dist(x, y, z) {
    const prims = this.prims;
    let d = 1e9;
    for (let i = 0; i < prims.length; i++) {
      const o = prims[i];
      const dx = x - o.bx, dy = y - o.by, dz = z - o.bz;
      const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - o.br;
      if (lb >= d + o.k) continue;
      d = smin(d, primDist(o, x, y, z), o.k);
    }
    // flat soles: clip against the ground plane
    const g = this.groundY - y;
    if (g > d - this.groundK) d = smax(d, g, this.groundK);
    return d;
  }

  grad(x, y, z, out, h = 0.004) {
    const gx = this.dist(x + h, y, z) - this.dist(x - h, y, z);
    const gy = this.dist(x, y + h, z) - this.dist(x, y - h, z);
    const gz = this.dist(x, y, z + h) - this.dist(x, y, z - h);
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    out[0] = gx / l; out[1] = gy / l; out[2] = gz / l;
    return out;
  }

  /**
   * Per-primitive influence at a point: used for skin weights and for blending
   * grooming parameters. Returns the number of primitives written.
   */
  influences(x, y, z, radius, outIndex, outWeight, outParam) {
    const prims = this.prims;
    let n = 0;
    for (let i = 0; i < prims.length; i++) {
      const o = prims[i];
      const dx = x - o.bx, dy = y - o.by, dz = z - o.bz;
      const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - o.br;
      if (lb >= radius) continue;
      const d = primDist(o, x, y, z);
      if (d >= radius) continue;
      const u = 1 - Math.max(d, 0) / radius;
      outIndex[n] = i;
      outWeight[n] = u * u * u;
      if (outParam) outParam[n] = primParam(o, x, y, z);
      n++;
    }
    return n;
  }
}
