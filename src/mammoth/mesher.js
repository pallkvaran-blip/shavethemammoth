// Turns the body SDF into a triangle mesh (naive surface nets) and bakes a
// low-resolution distance volume the fur uses to drape itself over the body.

/**
 * Sample the SDF on a lattice, only evaluating exactly near the surface.
 */
export function sampleGrid(sdf, bounds, cell, block = 4) {
  const nx = Math.ceil((bounds.max[0] - bounds.min[0]) / cell) + 1;
  const ny = Math.ceil((bounds.max[1] - bounds.min[1]) / cell) + 1;
  const nz = Math.ceil((bounds.max[2] - bounds.min[2]) / cell) + 1;
  const grid = new Float32Array(nx * ny * nz);
  const ox = bounds.min[0], oy = bounds.min[1], oz = bounds.min[2];
  const halfDiag = block * cell * Math.sqrt(3) * 0.5;
  const threshold = halfDiag * 1.6 + cell * 2;

  for (let bz = 0; bz < nz; bz += block) {
    for (let by = 0; by < ny; by += block) {
      for (let bx = 0; bx < nx; bx += block) {
        const cx = ox + (bx + block * 0.5) * cell;
        const cy = oy + (by + block * 0.5) * cell;
        const cz = oz + (bz + block * 0.5) * cell;
        const dc = sdf.dist(cx, cy, cz);
        const far = Math.abs(dc) > threshold;
        const ex = Math.min(bx + block, nx), ey = Math.min(by + block, ny), ez = Math.min(bz + block, nz);
        for (let z = bz; z < ez; z++) {
          for (let y = by; y < ey; y++) {
            let idx = bx + nx * (y + ny * z);
            for (let x = bx; x < ex; x++, idx++) {
              grid[idx] = far ? dc : sdf.dist(ox + x * cell, oy + y * cell, oz + z * cell);
            }
          }
        }
      }
    }
  }
  return { grid, nx, ny, nz, origin: [ox, oy, oz], cell };
}

const CUBE_EDGES = (() => {
  // pairs of corner indices; corner i has offsets (i&1, (i>>1)&1, (i>>2)&1)
  const e = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 1; j <= 4; j <<= 1) {
      const k = i ^ j;
      if (i < k) e.push(i, k);
    }
  }
  return e;
})();

export function surfaceNets({ grid, nx, ny, nz, origin, cell }) {
  const positions = [];
  const indices = [];
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const v = new Float64Array(8);
  const R = [1, nx, nx * ny];

  for (let z = 0; z < nz - 1; z++) {
    for (let y = 0; y < ny - 1; y++) {
      for (let x = 0; x < nx - 1; x++) {
        const m = x + nx * (y + ny * z);
        let mask = 0;
        for (let i = 0; i < 8; i++) {
          const val = grid[m + (i & 1) + ((i >> 1) & 1) * nx + ((i >> 2) & 1) * nx * ny];
          v[i] = val;
          if (val < 0) mask |= 1 << i;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, count = 0;
        for (let e = 0; e < 24; e += 2) {
          const i0 = CUBE_EDGES[e], i1 = CUBE_EDGES[e + 1];
          const in0 = (mask >> i0) & 1, in1 = (mask >> i1) & 1;
          if (in0 === in1) continue;
          const t = v[i0] / (v[i0] - v[i1]);
          sx += (i0 & 1) + ((i1 & 1) - (i0 & 1)) * t;
          sy += ((i0 >> 1) & 1) + (((i1 >> 1) & 1) - ((i0 >> 1) & 1)) * t;
          sz += ((i0 >> 2) & 1) + (((i1 >> 2) & 1) - ((i0 >> 2) & 1)) * t;
          count++;
        }
        const inv = 1 / count;
        cellVert[m] = positions.length / 3;
        positions.push(origin[0] + (x + sx * inv) * cell, origin[1] + (y + sy * inv) * cell, origin[2] + (z + sz * inv) * cell);

        // connect across the three edges that start at this cell's corner 0
        const xs = [x, y, z];
        for (let a = 0; a < 3; a++) {
          const other = 1 << (1 << a); // mask bit of the corner one step along axis a
          if (((mask & 1) !== 0) === ((mask & other) !== 0)) continue;
          const iu = (a + 1) % 3, iv = (a + 2) % 3;
          if (xs[iu] === 0 || xs[iv] === 0) continue;
          const du = R[iu], dv = R[iv];
          const a0 = cellVert[m], a1 = cellVert[m - du], a2 = cellVert[m - du - dv], a3 = cellVert[m - dv];
          if (a1 < 0 || a2 < 0 || a3 < 0) continue;
          if (mask & 1) indices.push(a0, a1, a2, a0, a2, a3);
          else indices.push(a0, a3, a2, a0, a2, a1);
        }
      }
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Make triangle winding agree with the SDF gradient (outward normals). */
export function orientOutward(mesh, normals) {
  const { positions: p, indices: ix } = mesh;
  let agree = 0;
  const step = Math.max(3, Math.floor(ix.length / 3 / 2000) * 3);
  for (let i = 0; i < ix.length; i += step) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    agree += Math.sign(nx * normals[a] + ny * normals[a + 1] + nz * normals[a + 2]);
  }
  if (agree < 0) {
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t;
    }
  }
}

/** Light Laplacian relaxation in the tangent plane, re-projected onto the SDF. */
export function relax(mesh, sdf, iterations = 2) {
  const { positions: p, indices: ix } = mesh;
  const n = p.length / 3;
  const acc = new Float32Array(n * 3);
  const cnt = new Uint16Array(n);
  const g = [0, 0, 0];
  for (let it = 0; it < iterations; it++) {
    acc.fill(0); cnt.fill(0);
    for (let i = 0; i < ix.length; i += 3) {
      for (let e = 0; e < 3; e++) {
        const a = ix[i + e], b = ix[i + ((e + 1) % 3)];
        acc[a * 3] += p[b * 3]; acc[a * 3 + 1] += p[b * 3 + 1]; acc[a * 3 + 2] += p[b * 3 + 2]; cnt[a]++;
      }
    }
    for (let i = 0; i < n; i++) {
      if (!cnt[i]) continue;
      let x = acc[i * 3] / cnt[i], y = acc[i * 3 + 1] / cnt[i], z = acc[i * 3 + 2] / cnt[i];
      x = p[i * 3] + (x - p[i * 3]) * 0.6; y = p[i * 3 + 1] + (y - p[i * 3 + 1]) * 0.6; z = p[i * 3 + 2] + (z - p[i * 3 + 2]) * 0.6;
      // project back to the surface
      for (let k = 0; k < 2; k++) {
        const d = sdf.dist(x, y, z);
        sdf.grad(x, y, z, g);
        x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
      }
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    }
  }
}

/**
 * Bake distance + gradient into a volume: rgb = unit gradient, a = distance (m).
 * Returned as Float32; the caller converts to half floats for the GPU.
 */
export function bakeVolume(sdf, bounds, res) {
  const [nx, ny, nz] = res;
  const sx = (bounds.max[0] - bounds.min[0]) / (nx - 1);
  const sy = (bounds.max[1] - bounds.min[1]) / (ny - 1);
  const sz = (bounds.max[2] - bounds.min[2]) / (nz - 1);
  const dist = new Float32Array(nx * ny * nz);
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      let idx = nx * (y + ny * z);
      for (let x = 0; x < nx; x++, idx++) {
        dist[idx] = sdf.dist(bounds.min[0] + x * sx, bounds.min[1] + y * sy, bounds.min[2] + z * sz);
      }
    }
  }
  const data = new Float32Array(nx * ny * nz * 4);
  const at = (x, y, z) => dist[Math.min(nx - 1, Math.max(0, x)) + nx * (Math.min(ny - 1, Math.max(0, y)) + ny * Math.min(nz - 1, Math.max(0, z)))];
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = (x + nx * (y + ny * z)) * 4;
        let gx = (at(x + 1, y, z) - at(x - 1, y, z)) / sx;
        let gy = (at(x, y + 1, z) - at(x, y - 1, z)) / sy;
        let gz = (at(x, y, z + 1) - at(x, y, z - 1)) / sz;
        const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
        data[i] = gx / l; data[i + 1] = gy / l; data[i + 2] = gz / l;
        data[i + 3] = dist[x + nx * (y + ny * z)];
      }
    }
  }
  return { data, res: [nx, ny, nz] };
}
