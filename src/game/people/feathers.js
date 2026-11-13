// How feathers are laid: each is rooted at a point of a sculpted surface (or
// one given outright, for the long feathers of a wing or a tail), lies along
// the surface in the direction it is told, lifted a little off it at the root
// and curving back towards it, so that each overlaps the next like a tile.
// What comes out is a strip of a few faces for every feather; its outline, its
// shaft and its barbs are drawn on that by plumes.js.
//
// (Arithmetic only: this may run on another thread.)

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * @param roots       [{ p: [x, y, z], n: [nx, ny, nz] }]: where each grows from, and which way is out there
 * @param opts.shape  (p, n, rnd, i) => { length, width, dir: [x, y, z], lift, curl, roll, slim }
 *                    dir: the way it lies (what of this is along the surface is used); lift: radians it stands off
 *                    the surface at its root; curl: radians it turns back towards the surface by its tip;
 *                    roll: radians it is turned about its own shaft; slim 0..1: a broad body feather, or a long flight feather
 * @param opts.cup    how far the edges of a feather hang below its shaft, as a share of its width
 */
export function growFeathers(roots, { shape, seed = 1, segments = 4, cup = 0.16 }) {
  const rnd = rng(seed), n = roots.length, K = segments, per = (K + 1) * 3;
  const pos = new Float32Array(n * per * 3), axis = new Float32Array(n * per * 3), face = new Float32Array(n * per * 3), body = new Float32Array(n * per * 3);
  const uv = new Float32Array(n * per * 2), sd = new Float32Array(n * per * 3);
  const index = new Uint32Array(n * K * 12);
  let v = 0, ix = 0;
  for (let i = 0; i < n; i++) {
    const { p, n: nr } = roots[i];
    const sh = shape(p, nr, rnd, i);
    // along the surface, and across the feather
    let dx = sh.dir[0], dy = sh.dir[1], dz = sh.dir[2];
    const dn = dx * nr[0] + dy * nr[1] + dz * nr[2];
    dx -= nr[0] * dn; dy -= nr[1] * dn; dz -= nr[2] * dn;
    let l = Math.hypot(dx, dy, dz);
    if (l < 1e-5) { dx = nr[1]; dy = -nr[0]; dz = 0; l = Math.hypot(dx, dy, dz) || 1; }
    dx /= l; dy /= l; dz /= l;
    const sx = nr[1] * dz - nr[2] * dy, sy = nr[2] * dx - nr[0] * dz, sz = nr[0] * dy - nr[1] * dx;
    const L = sh.length, W = sh.width, lift = sh.lift ?? 0.25, curl = sh.curl ?? 0.2, roll = sh.roll ?? 0, slim = sh.slim ?? 0;
    const cr = Math.cos(roll), sr = Math.sin(roll), r1 = rnd(), r2 = rnd();
    let cx = p[0], cy = p[1], cz = p[2];
    const first = v;
    for (let k = 0; k <= K; k++) {
      const t = k / K, a = lift - curl * t, ca = Math.cos(a), sa = Math.sin(a);
      const Ax = dx * ca + nr[0] * sa, Ay = dy * ca + nr[1] * sa, Az = dz * ca + nr[2] * sa;          // along the shaft here
      const Ux = nr[0] * ca - dx * sa, Uy = nr[1] * ca - dy * sa, Uz = nr[2] * ca - dz * sa;          // out of its upper face
      const Sx = sx * cr + Ux * sr, Sy = sy * cr + Uy * sr, Sz = sz * cr + Uz * sr;                   // across it
      const Nx = Ux * cr - sx * sr, Ny = Uy * cr - sy * sr, Nz = Uz * cr - sz * sr;
      for (let e = -1; e <= 1; e++) {
        const out = e * W * 0.5, down = Math.abs(e) * cup * W * 0.5;
        pos[v * 3] = cx + Sx * out - Nx * down; pos[v * 3 + 1] = cy + Sy * out - Ny * down; pos[v * 3 + 2] = cz + Sz * out - Nz * down;
        let fx = Nx + Sx * e * cup * 1.6, fy = Ny + Sy * e * cup * 1.6, fz = Nz + Sz * e * cup * 1.6;
        const fl = Math.hypot(fx, fy, fz) || 1;
        fx /= fl; fy /= fl; fz /= fl;
        face[v * 3] = fx; face[v * 3 + 1] = fy; face[v * 3 + 2] = fz;
        axis[v * 3] = Ax; axis[v * 3 + 1] = Ay; axis[v * 3 + 2] = Az;
        body[v * 3] = nr[0]; body[v * 3 + 1] = nr[1]; body[v * 3 + 2] = nr[2];
        uv[v * 2] = (e + 1) / 2; uv[v * 2 + 1] = t;
        sd[v * 3] = r1; sd[v * 3 + 1] = r2; sd[v * 3 + 2] = slim;
        v++;
      }
      if (k < K) {
        const a0 = first + k * 3;
        index[ix++] = a0; index[ix++] = a0 + 1; index[ix++] = a0 + 3; index[ix++] = a0 + 1; index[ix++] = a0 + 4; index[ix++] = a0 + 3;
        index[ix++] = a0 + 1; index[ix++] = a0 + 2; index[ix++] = a0 + 4; index[ix++] = a0 + 2; index[ix++] = a0 + 5; index[ix++] = a0 + 4;
        const am = lift - curl * (t + 0.5 / K), step = L / K;
        cx += (dx * Math.cos(am) + nr[0] * Math.sin(am)) * step; cy += (dy * Math.cos(am) + nr[1] * Math.sin(am)) * step; cz += (dz * Math.cos(am) + nr[2] * Math.sin(am)) * step;
      }
    }
  }
  return { position: pos, aAxis: axis, aFace: face, aBody: body, uv, aSeed: sd, index, count: n };
}
