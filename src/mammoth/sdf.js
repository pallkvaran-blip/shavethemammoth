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
 *  torus:     { type:'tor', c:[x,y,z], R, r, rot:[degX,degY,degZ], s:[sx,sy,sz] }   (a ring about its own y axis; s squashes it)
 *  box:       { type:'box', c:[x,y,z], h:[hx,hy,hz], rot:[degX,degY,degZ], round }   (half sizes; corners rounded by `round`)
 *  leaf:      { type:'leaf', a:[x,y,z], b:[x,y,z], r1, r2, t, t2, n:[x,y,z], bend, curl }
 *             (a flat blade: the outline of a round cone from a to b, lying across the direction n, half as thick as
 *              `t` (`t2` at the far end) with a rolled edge; `bend` bows its middle sideways, `curl` turns its end out
 *              of the flat, both in metres)
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
    } else if (p.type === 'tor' || p.type === 'box') {
      o.t = p.type === 'tor' ? 3 : 4;
      o.cx = p.c[0]; o.cy = p.c[1]; o.cz = p.c[2];
      const rot = p.rot || [0, 0, 0];
      const m = mat3FromQuat(quatFromEulerZYX(rot[0], rot[1], rot[2]));
      o.m00 = m[0]; o.m01 = m[3]; o.m02 = m[6];
      o.m10 = m[1]; o.m11 = m[4]; o.m12 = m[7];
      o.m20 = m[2]; o.m21 = m[5]; o.m22 = m[8];
      o.bx = o.cx; o.by = o.cy; o.bz = o.cz;
      if (o.t === 3) {
        const sc = p.s || [1, 1, 1];
        o.R = p.R; o.r = p.r; o.sx = sc[0]; o.sy = sc[1]; o.sz = sc[2];
        o.smin = Math.min(sc[0], sc[1], sc[2]);
        o.br = (p.R + p.r) * Math.max(sc[0], sc[1], sc[2]);
      } else {
        o.hx = p.h[0]; o.hy = p.h[1]; o.hz = p.h[2]; o.round = p.round || 0;
        o.br = Math.hypot(p.h[0], p.h[1], p.h[2]);
      }
    } else if (p.type === 'leaf') {
      o.t = 5;
      o.ax = p.a[0]; o.ay = p.a[1]; o.az = p.a[2];
      o.bax = p.b[0] - p.a[0]; o.bay = p.b[1] - p.a[1]; o.baz = p.b[2] - p.a[2];
      o.l2 = o.bax * o.bax + o.bay * o.bay + o.baz * o.baz;
      o.il2 = 1 / o.l2;
      const h = Math.sqrt(o.l2);
      o.h = h; o.r1 = p.r1; o.r2 = p.r2; o.th = p.t; o.th2 = p.t2 ?? p.t;
      // a frame: u along it, w through its thickness, v across its width
      o.ux = o.bax / h; o.uy = o.bay / h; o.uz = o.baz / h;
      const n = p.n || [0, 0, 1], along = n[0] * o.ux + n[1] * o.uy + n[2] * o.uz;
      let wx = n[0] - o.ux * along, wy = n[1] - o.uy * along, wz = n[2] - o.uz * along;
      const wl = Math.hypot(wx, wy, wz) || 1;
      wx /= wl; wy /= wl; wz /= wl;
      o.wx = wx; o.wy = wy; o.wz = wz;
      o.vx = wy * o.uz - wz * o.uy; o.vy = wz * o.ux - wx * o.uz; o.vz = wx * o.uy - wy * o.ux;
      o.cb = (p.r1 - p.r2) / h; o.ca = Math.sqrt(Math.max(0, 1 - o.cb * o.cb));
      o.bend = p.bend || 0; o.curl = p.curl || 0;
      o.bx = (p.a[0] + p.b[0]) * 0.5; o.by = (p.a[1] + p.b[1]) * 0.5; o.bz = (p.a[2] + p.b[2]) * 0.5;
      o.br = h * 0.5 + Math.max(p.r1, p.r2, o.th, o.th2) + Math.abs(o.bend) + Math.abs(o.curl);
    } else {
      throw new Error('unknown primitive ' + p.type);
    }
    // (kept for whoever builds on these: any other field of the description, such as a tag or a pattern)
    o.src = p;
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
  if (o.t === 3 || o.t === 4) {
    const dx = x - o.cx, dy = y - o.cy, dz = z - o.cz;
    const lx = o.m00 * dx + o.m01 * dy + o.m02 * dz, ly = o.m10 * dx + o.m11 * dy + o.m12 * dz, lz = o.m20 * dx + o.m21 * dy + o.m22 * dz;
    if (o.t === 3) {
      const ax = lx / o.sx, ay = ly / o.sy, az = lz / o.sz;
      const q = Math.sqrt(ax * ax + az * az) - o.R;
      return (Math.sqrt(q * q + ay * ay) - o.r) * o.smin;
    }
    const qx = Math.abs(lx) - o.hx + o.round, qy = Math.abs(ly) - o.hy + o.round, qz = Math.abs(lz) - o.hz + o.round;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - o.round;
  }
  if (o.t === 5) {
    const px = x - o.ax, py = y - o.ay, pz = z - o.az;
    const u = px * o.ux + py * o.uy + pz * o.uz;
    let v = px * o.vx + py * o.vy + pz * o.vz, w = px * o.wx + py * o.wy + pz * o.wz;
    const t = u / o.h, tc = t < 0 ? 0 : t > 1 ? 1 : t;
    v -= o.bend * 4 * tc * (1 - tc);
    w -= o.curl * tc * tc;
    // its outline, flat (an uneven capsule, after Inigo Quilez)...
    const av = v < 0 ? -v : v, k = o.ca * u - o.cb * av;
    let d2;
    if (k < 0) d2 = Math.sqrt(av * av + u * u) - o.r1;
    else if (k > o.ca * o.h) d2 = Math.sqrt(av * av + (u - o.h) * (u - o.h)) - o.r2;
    else d2 = o.ca * av + o.cb * u - o.r1;
    // ...and that outline, drawn in by the thickness, swollen out again all round
    const th = o.th + (o.th2 - o.th) * tc, e = d2 + th;
    return e > 0 ? Math.sqrt(e * e + w * w) - th : (w < 0 ? -w : w) - th;
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
  if (o.t !== 2 && o.t !== 5) return 0;
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
