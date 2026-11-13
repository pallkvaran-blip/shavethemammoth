// How hair grows: beards, eyebrows, what shows under a hat, the bobble on top
// of it, a vulture's ruff, the wigs on Mortimer's table. Every strand is grown
// once, when the game starts, from a point scattered on a sculpted surface: it
// leaves in the direction it is told, droops, curls, gathers into locks with
// its neighbours and keeps out of the body.
//
// (Arithmetic only: this may run on another thread. Drawing it is locks.js.)

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Grow hair from `roots` (see sculpt.scatter): works out where every strand goes, and returns it as ribbons ready to
 * be drawn (see locks.js), in the same space the roots were in.
 * @param opts.shape    (p, n, rnd) => { length, dir: [x, y, z], droop, stiff, bend }: how a strand rooted at p (normal n) is to grow.
 *                      droop: how far it bends to gravity by its end; stiff 0..1: how much of its first direction it keeps;
 *                      bend: [x, y, z], a direction it turns towards more and more along its length (the upturned end of a moustache)
 * @param opts.segments pieces to a strand
 * @param opts.width    of a strand, metres
 * @param opts.clump    0..1: how firmly strands gather into locks; opts.clumps: how many locks
 * @param opts.frizz    metres each strand wanders from its lock by its end
 * @param opts.curl     [radius in metres, turns per metre]
 * @param opts.body     (x, y, z) => distance: what the hair may not pass through
 * @param opts.loft     metres: how far off the body the outermost strands ride (a beard has thickness; without this it lies flat as paint)
 */
export function growStrands(roots, { shape, seed = 1, segments = 6, width = 0.0005, clump = 0.4, clumps = 100, frizz = 0.001, curl = null, body = null, loft = 0 }) {
  const rnd = rng(seed), n = roots.length, S = segments;
  const paths = new Float32Array(n * (S + 1) * 3);
  const meta = new Float32Array(n * 2);
  const g = [0, 0, 0];
  const grow = (i) => {
    const { p, n: nr } = roots[i];
    const sh = shape(p, nr, rnd);
    let dx = sh.dir[0], dy = sh.dir[1], dz = sh.dir[2];
    let l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const d0 = [dx, dy, dz];
    // two directions across the strand, for curl and for wandering
    let ax = d0[1] * 0 - d0[2] * 1, ay = d0[2] * 0 - d0[0] * 0, az = d0[0] * 1 - d0[1] * 0;
    if (Math.hypot(ax, ay, az) < 0.2) { ax = 0; ay = d0[2]; az = -d0[1]; }
    l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
    const bx = d0[1] * az - d0[2] * ay, by = d0[2] * ax - d0[0] * az, bz = d0[0] * ay - d0[1] * ax;
    const phase = rnd() * 6.283, wander = [rnd() - 0.5, rnd() - 0.5, rnd() * 6.283, 1.5 + rnd() * 2.5];
    const step = sh.length / S, stiff = sh.stiff ?? 0.3, bend = sh.bend;
    let x = p[0], y = p[1], z = p[2];
    const o = i * (S + 1) * 3;
    paths[o] = x; paths[o + 1] = y; paths[o + 2] = z;
    for (let k = 1; k <= S; k++) {
      const t = k / S;
      // gravity gets its way more and more towards the end
      const pull = sh.droop * t * t * (1 - stiff * 0.8);
      let ex = d0[0], ey = d0[1] - pull, ez = d0[2];
      if (bend) { ex += bend[0] * t * t; ey += bend[1] * t * t; ez += bend[2] * t * t; }
      l = Math.hypot(ex, ey, ez) || 1;
      x += (ex / l) * step; y += (ey / l) * step; z += (ez / l) * step;
      let px = x, py = y, pz = z;
      if (curl) {
        const a = phase + t * sh.length * curl[1] * 6.283, r = curl[0] * Math.min(1, t * 2.5);
        px += (ax * Math.cos(a) + bx * Math.sin(a)) * r; py += (ay * Math.cos(a) + by * Math.sin(a)) * r; pz += (az * Math.cos(a) + bz * Math.sin(a)) * r;
      }
      const wob = Math.sin(wander[2] + t * wander[3]) * frizz * t;
      px += (ax * wander[0] + bx * wander[1]) * frizz * 2 * t + ax * wob; py += (ay * wander[0] + by * wander[1]) * frizz * 2 * t + ay * wob; pz += (az * wander[0] + bz * wander[1]) * frizz * 2 * t + az * wob;
      paths[o + k * 3] = px; paths[o + k * 3 + 1] = py; paths[o + k * 3 + 2] = pz;
    }
    meta[i * 2] = rnd(); meta[i * 2 + 1] = rnd();
  };
  for (let i = 0; i < n; i++) grow(i);

  // gather into locks: each strand leans in towards the nearest of a few chosen strands, more so further along
  if (clump > 0 && clumps > 0 && n > clumps) {
    const guides = [];
    for (let k = 0; k < clumps; k++) guides.push(Math.floor(rnd() * n));
    const orig = paths.slice();
    for (let i = 0; i < n; i++) {
      const o = i * (S + 1) * 3;
      let best = -1, bd = 1e9;
      for (const gi of guides) {
        const q = gi * (S + 1) * 3;
        const d = (orig[o] - orig[q]) ** 2 + (orig[o + 1] - orig[q + 1]) ** 2 + (orig[o + 2] - orig[q + 2]) ** 2;
        if (d < bd) { bd = d; best = q; }
      }
      const hold = clump * (0.6 + 0.4 * meta[i * 2]);
      for (let k = 1; k <= S; k++) {
        const t = k / S, w = hold * Math.pow(t, 0.8), keep = 1 - 0.75 * t;      // (the roots stay where they grow)
        for (let a = 0; a < 3; a++) {
          const off = (orig[o + a] - orig[best + a]) * keep;
          paths[o + k * 3 + a] += (orig[best + k * 3 + a] + off - orig[o + k * 3 + a]) * w;
        }
      }
    }
  }
  // and out of anything solid
  if (body) {
    const h = 0.0006, least = Math.max(width, 0.0004);
    for (let i = 0; i < n; i++) {
      const o = i * (S + 1) * 3;
      for (let k = 1; k <= S; k++) {
        // (the strands that are to show on top ride highest, and nearer the root there is less under them)
        const skinGap = least + loft * meta[i * 2 + 1] * Math.min(1, (k / S) * 3);
        let x = paths[o + k * 3], y = paths[o + k * 3 + 1], z = paths[o + k * 3 + 2];
        for (let it = 0; it < 2; it++) {
          const d = body(x, y, z);
          if (d >= skinGap) break;
          g[0] = body(x + h, y, z) - body(x - h, y, z); g[1] = body(x, y + h, z) - body(x, y - h, z); g[2] = body(x, y, z + h) - body(x, y, z - h);
          const gl = Math.hypot(g[0], g[1], g[2]) || 1;
          x += (g[0] / gl) * (skinGap - d); y += (g[1] / gl) * (skinGap - d); z += (g[2] / gl) * (skinGap - d);
        }
        paths[o + k * 3] = x; paths[o + k * 3 + 1] = y; paths[o + k * 3 + 2] = z;
      }
    }
  }

  // ribbons
  const V = n * (S + 1) * 2;
  const pos = new Float32Array(V * 3), tan = new Float32Array(V * 3), nrm = new Float32Array(V * 3), uv = new Float32Array(V * 2), sd = new Float32Array(V * 2);
  const index = new Uint32Array(n * S * 6);
  let v = 0, ix = 0;
  for (let i = 0; i < n; i++) {
    const o = i * (S + 1) * 3, nr = roots[i].n, base = v;
    for (let k = 0; k <= S; k++) {
      const a = o + Math.max(0, k - 1) * 3, b = o + Math.min(S, k + 1) * 3;
      let tx = paths[b] - paths[a], ty = paths[b + 1] - paths[a + 1], tz = paths[b + 2] - paths[a + 2];
      const l = Math.hypot(tx, ty, tz) || 1;
      tx /= l; ty /= l; tz /= l;
      for (let s = 0; s < 2; s++) {
        pos[v * 3] = paths[o + k * 3]; pos[v * 3 + 1] = paths[o + k * 3 + 1]; pos[v * 3 + 2] = paths[o + k * 3 + 2];
        tan[v * 3] = tx; tan[v * 3 + 1] = ty; tan[v * 3 + 2] = tz;
        nrm[v * 3] = nr[0]; nrm[v * 3 + 1] = nr[1]; nrm[v * 3 + 2] = nr[2];
        uv[v * 2] = s; uv[v * 2 + 1] = k / S;
        sd[v * 2] = meta[i * 2]; sd[v * 2 + 1] = meta[i * 2 + 1];
        v++;
      }
      if (k < S) { const a0 = base + k * 2; index[ix++] = a0; index[ix++] = a0 + 1; index[ix++] = a0 + 2; index[ix++] = a0 + 1; index[ix++] = a0 + 3; index[ix++] = a0 + 2; }
    }
  }
  return { position: pos, aTan: tan, aNrm: nrm, uv, aSeed: sd, index, count: n, width };
}
