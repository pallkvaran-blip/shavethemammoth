// The hired help: lemmings, which Gnorman lets out by the head. They run from
// his stall to the nearest foot, climb, and gnaw the mammoth's hair off lock
// by lock wherever any is left, which is the point of them: the last few
// patches are hard for an elf to find, and a lemming finds them by walking
// downhill on a map of how far away the nearest hair is.
//
// The map: the hide is covered with places to stand a hand's width apart
// ("sites"), each knowing its neighbours along the surface and the locks
// rooted on its bit of hide. Every half second or so the sites with hair
// left are counted again (whoever cut it), and every site is told how many
// steps it is from the nearest of those. A helper with nothing to gnaw
// where it stands steps to whichever neighbour is nearer to some.
//
// What they cut falls as what the elf cuts falls, and lies on the snow for
// him to pick up. They leave stubble, which finishes off what rougher tools
// have left as well.
import * as THREE from 'three';
import { folkMaterial } from './people/materials.js';
import { patchStandardMaterial } from '../gfx/patch.js';
import { LAYER_SHADOW_NEAR, LAYER_SHADOW_ELF } from '../gfx/globals.js';
import { makeInstancedDepthMaterial } from '../gfx/shadows.js';
import { lemmingRecipe, NECK, EYES, EYE_R } from './people/lemming.recipe.js';
import { bakeFigure } from './people/bake.js';
import { coarsen } from './people/sculpt.js';
import { MOST_HELP as MOST } from './catalog.js';

const SPACING = 0.085;        // metres between the places on him where a helper can stand
const DONE = 0.004;           // a lock this short (metres) is finished with
const STUB = 0.0021;          // what they leave of one
const NEAR = 1.6;             // metres from the eye within which a helper is drawn with all its faces
const NEAR_MOST = 28;         // (and no more than this many are)
const MIDDLING = 4;           // metres beyond which it is a few pixels long, and drawn as not much more than a pebble
const GROUND = 0, CLIMBING = 1;

const between = (a, b) => a + Math.random() * (b - a);

/** A geometry from a baked layer, as rig.js makes one, but with no bones in it. */
function layerGeometry(d) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
  geo.setAttribute('aShade', new THREE.BufferAttribute(d.shade, 2));
  geo.setAttribute('aTint', new THREE.BufferAttribute(d.tint, 4));
  geo.setIndex(new THREE.BufferAttribute(d.index, 1));
  return geo;
}

/** Several sets of points and faces run together (positions only: for casting a shadow). */
function runTogether(parts) {
  let nv = 0, ni = 0;
  for (const d of parts) { nv += d.position.length / 3; ni += d.index.length; }
  const position = new Float32Array(nv * 3), index = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const d of parts) {
    position.set(d.position, v * 3);
    for (let k = 0; k < d.index.length; k++) index[i + k] = d.index[k] + v;
    v += d.position.length / 3; i += d.index.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

/** His two eyes: beads. */
function eyesGeometry(detail) {
  const one = new THREE.SphereGeometry(EYE_R, detail, Math.max(4, Math.round(detail * 0.7)));
  const P = one.attributes.position, N = one.attributes.normal, I = one.index;
  const position = new Float32Array(P.count * 6), normal = new Float32Array(P.count * 6), index = new Uint16Array(I.count * 2);
  EYES.forEach((at, e) => {
    for (let i = 0; i < P.count; i++) {
      const o = (e * P.count + i) * 3;
      position[o] = P.getX(i) + at[0]; position[o + 1] = P.getY(i) + at[1]; position[o + 2] = P.getZ(i) + at[2];
      normal[o] = N.getX(i); normal[o + 1] = N.getY(i); normal[o + 2] = N.getZ(i);
    }
    for (let i = 0; i < I.count; i++) index[e * I.count + i] = I.getX(i) + e * P.count;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

export class Helpers {
  /**
   * @param door   { x, z }: where on the snow a newly hired one sets off from (in front of the stall)
   * @param baked  the lemming, baked (see people/bake.js); it is baked here if it has not been
   */
  constructor({ scene, mammoth, terrain, shaving, sound, door, baked = null }) {
    Object.assign(this, { scene, mammoth, terrain, shaving, sound, door });
    this.count = 0;
    this.time = 0;
    this.map = null;               // the places to stand: made the first time anyone is hired
    this.pending = [];             // locks gnawed through since they were last taken off him
    this.flushIn = 0;
    this.pieces = 2; this.shedAt = 0;   // how many pieces of cut hair may be let fall just now
    this.squeakIn = between(3, 8);
    this.working = 0;              // how many are gnawing at this moment
    this.idle = true;              // nothing left for any of them to do

    // ---- one of them, a hundred times over ----
    const N = MOST;
    this.mode = new Uint8Array(N);
    this.a = new Int32Array(N); this.b = new Int32Array(N).fill(-1);       // the site it is at, and the one it is on its way to
    this.t = new Float32Array(N); this.span = new Float32Array(N);         // how far along, and how long the step takes
    this.lock = new Int32Array(N).fill(-1); this.timer = new Float32Array(N);
    this.gx = new Float32Array(N); this.gz = new Float32Array(N);          // where it is on the snow, before it has climbed
    this.wait = new Float32Array(N);                                       // seconds before it sets off
    this.phase = new Float32Array(N); this.size = new Float32Array(N);
    this.side = new Float32Array(N * 2);                                   // where it stands within its site, so that a crowd is not all on one spot
    this.fwd = new Float32Array(N * 3); this.lift = new Float32Array(N);
    this.rise = new Float32Array(N);                                       // 0 on the snow, 1 once it is on him (the hop up, eased)
    this.rest = new Float32Array(N);                                       // seconds it has sat with nothing to do

    const b = baked || bakeFigure(lemmingRecipe());
    const coat = folkMaterial('plain', { a: [0.0013, 0.5, 0, 0], roughness: 0.92, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.42, 0.32, 0.22) });
    const bead = patchStandardMaterial(new THREE.MeshPhysicalMaterial({ color: 0x060403, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05 }), { key: 'folk-bead', bias: 0.012, radius: 0.012, offset: 0.004 });
    const depth = makeInstancedDepthMaterial();
    // Close to, a helper is drawn with all its faces; further off, with a fifth of them; from across the snow, with a
    // hundred or so. Its head shares its eyes' place, and all of it one colour of coat; and one more drawing, of the
    // plainest body and head run together, casts the shadows.
    const pebble = { body: coarsen(b.far.body, 0.0075), head: coarsen(b.far.head, 0.0075) };
    this.group = new THREE.Group();
    this.group.name = 'helpers';
    const set = (body, head, eyes, most) => {
      const heads = new THREE.InstancedMesh(layerGeometry(head), coat, most);
      const bodies = new THREE.InstancedMesh(layerGeometry(body), coat, most);
      const beads = new THREE.InstancedMesh(eyes, bead, most);
      beads.instanceMatrix = heads.instanceMatrix;
      bodies.name = heads.name = beads.name = 'lemming';
      for (const m of [bodies, heads, beads]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
      return { bodies, heads, beads, tint: new Float32Array(most * 3) };
    };
    this.close = set(b.data.body, b.data.head, eyesGeometry(12), NEAR_MOST);
    this.mid = set(b.far.body, b.far.head, eyesGeometry(6), N);
    this.far = set(pebble.body, pebble.head, eyesGeometry(4), N);
    this.sets = [this.close, this.mid, this.far];
    for (const s of this.sets) {
      s.bodies.instanceColor = new THREE.InstancedBufferAttribute(s.tint, 3);
      s.heads.instanceColor = s.bodies.instanceColor;
      s.bodies.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.cast = new THREE.InstancedMesh(runTogether([pebble.body, pebble.head]), depth, N);
    this.cast.name = 'lemming (shadow)';
    this.cast.count = 0; this.cast.frustumCulled = false;
    this.cast.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cast.layers.set(LAYER_SHADOW_NEAR); this.cast.layers.enable(LAYER_SHADOW_ELF);
    this.group.add(this.cast);
    this.group.visible = false;
    scene.add(this.group);
    this.coats = new Float32Array(N * 3);
    this._m = new THREE.Matrix4(); this._h = new THREE.Matrix4(); this._nod = new THREE.Matrix4();
    this._p = [0, 0, 0]; this._q = [0, 0, 0]; this._n = [0, 0, 0]; this._o = [0, 0, 0];
  }

  // ---- the map of him --------------------------------------------------------------------

  /** The places to stand, their neighbours, and which point of the hide belongs to which. Made once. */
  _sites() {
    const body = this.mammoth.data.body, P = body.positions, Nr = body.normals, I = body.indices, n = P.length / 3;
    const cell = SPACING, key = (x, y, z) => (Math.floor(x / cell) + 512) + (Math.floor(y / cell) + 512) * 1024 + (Math.floor(z / cell) + 512) * 1048576;
    const grid = new Map(), seeds = [];
    const nearest = (v, within, strict = true) => {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      let best = -1, bd = within * within;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const list = grid.get(key(x + dx * cell, y + dy * cell, z + dz * cell));
        if (!list) continue;
        for (const s of list) {
          const w = seeds[s], ex = P[w * 3] - x, ey = P[w * 3 + 1] - y, ez = P[w * 3 + 2] - z;
          // (the other side of an ear is further off than it looks)
          const facing = Nr[w * 3] * Nr[v * 3] + Nr[w * 3 + 1] * Nr[v * 3 + 1] + Nr[w * 3 + 2] * Nr[v * 3 + 2];
          const d = (ex * ex + ey * ey + ez * ez) * (strict && facing < 0 ? 9 : 1);
          if (d < bd) { bd = d; best = s; }
        }
      }
      return best;
    };
    // scattered over him: every point of the hide in a jumbled order, each made a site if none is within reach yet
    const stride = 7919 % n === 0 ? 7907 : 7919;
    for (let k = 0, v = 0; k < n; k++, v = (v + stride) % n) {
      if (nearest(v, SPACING) >= 0) continue;
      const kk = key(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      let list = grid.get(kk);
      if (!list) grid.set(kk, (list = []));
      list.push(seeds.length);
      seeds.push(v);
    }
    const S = seeds.length;
    const siteOf = new Int32Array(n);
    for (let v = 0; v < n; v++) { let s = nearest(v, SPACING); if (s < 0) s = nearest(v, SPACING, false); siteOf[v] = s < 0 ? 0 : s; }
    // neighbours: two sites are next to each other where a face of the hide has a corner in each
    const pairs = new Set();
    for (let t = 0; t < I.length; t += 3) {
      const a = siteOf[I[t]], b = siteOf[I[t + 1]], c = siteOf[I[t + 2]];
      if (a !== b) pairs.add(a < b ? a * 65536 + b : b * 65536 + a);
      if (b !== c) pairs.add(b < c ? b * 65536 + c : c * 65536 + b);
      if (a !== c) pairs.add(a < c ? a * 65536 + c : c * 65536 + a);
    }
    const degree = new Int32Array(S + 1);
    for (const p of pairs) { degree[Math.floor(p / 65536)]++; degree[p % 65536]++; }
    const start = new Int32Array(S + 1);
    for (let s = 0; s < S; s++) start[s + 1] = start[s] + degree[s];
    const next = new Int32Array(start[S]), fill = start.slice(0, S);
    for (const p of pairs) { const a = Math.floor(p / 65536), b = p % 65536; next[fill[a]++] = b; next[fill[b]++] = a; }
    // each site: where it is on him at rest, which way is out, which bones carry it, how much it breathes
    const pos = new Float32Array(S * 3), nrm = new Float32Array(S * 3), bone = new Uint16Array(S * 4), weight = new Float32Array(S * 4), breath = new Float32Array(S);
    const feet = [];
    for (let s = 0; s < S; s++) {
      const v = seeds[s];
      for (let k = 0; k < 3; k++) { pos[s * 3 + k] = P[v * 3 + k]; nrm[s * 3 + k] = Nr[v * 3 + k]; }
      for (let k = 0; k < 4; k++) { bone[s * 4 + k] = body.skinIndex[v * 4 + k]; weight[s * 4 + k] = body.skinWeight[v * 4 + k]; }
      breath[s] = body.furB[v * 4 + 1];
      if (pos[s * 3 + 1] < 0.17 && Math.abs(nrm[s * 3 + 1]) < 0.6) feet.push(s);      // low on a leg: a way up
    }
    if (!feet.length) { let low = 0; for (let s = 1; s < S; s++) if (pos[s * 3 + 1] < pos[low * 3 + 1]) low = s; feet.push(low); }
    this.map = {
      S, siteOf, start, next, pos, nrm, bone, weight, breath, feet,
      left: new Uint16Array(S), hair: new Float32Array(S), steps: new Int16Array(S).fill(-1), crowd: new Uint8Array(S), cursor: new Int32Array(S),
      queue: new Int32Array(S), scanAt: 0, stepsIn: 0, chunks: null,
    };
    this._locks();
  }

  /** The places to stand, made if they have not been yet (others have uses for a map of him: see gags.js). */
  sites() {
    if (!this.map) this._sites();
    if (this.map.chunks !== this.mammoth.chunks) this._locks();
    return this.map;
  }

  /**
   * Everything growing within `radius` of a point on him lets go at once, down to stubble (a spray does this; a lemming
   * would want the afternoon). The hair falls as what they gnaw off falls. Returns how many locks went.
   */
  strip(x, y, z, radius, camera) {
    const M = this.sites(), P = this._p, Nn = this._n, body = this.mammoth.data.body, V = body.positions, I = body.indices;
    const wide = (radius + SPACING) * (radius + SPACING);
    let n = 0;
    for (let s = 0; s < M.S; s++) {
      if (M.first[s + 1] === M.first[s]) continue;
      this._where(s, P, Nn);
      const dx = P[0] - x, dy = P[1] - y, dz = P[2] - z;
      if (dx * dx + dy * dy + dz * dz > wide) continue;
      // (each lock by where it is rooted: the edge of what goes is a ragged one, not a row of patches)
      const ox = P[0] - M.pos[s * 3], oy = P[1] - M.pos[s * 3 + 1], oz = P[2] - M.pos[s * 3 + 2];
      for (let k = M.first[s], e = M.first[s + 1]; k < e; k++) {
        const c = M.chunks[M.lockChunk[k]], a = c.arrays, i = M.lockAt[k];
        if (Math.min(a.iA[i * 4], a.iCut[i]) <= DONE) continue;
        const v = I[a.tri[i] * 3] * 3, r = radius * (0.82 + 0.3 * a.iA[i * 4 + 2]);
        if ((V[v] + ox - x) ** 2 + (V[v + 1] + oy - y) ** 2 + (V[v + 2] + oz - z) ** 2 > r * r) continue;
        this.pending.push({ chunk: c, i, len: STUB * (1 + 0.8 * a.iA[i * 4 + 2]) });
        n++;
      }
      M.left[s] = 0;
    }
    if (n) {
      // (more of it is seen to fall than a lemming's leavings: it all comes away together)
      this.pieces = Math.max(this.pieces, Math.min(26, 4 + n * 0.25));
      this.shedAt = this.time;
      const cap = this.pieces;
      this._shed(camera, cap);
    }
    return n;
  }

  /** Which locks are rooted on which site's bit of hide. Made again if the coat is (at another level of detail). */
  _locks() {
    const M = this.map, chunks = this.mammoth.chunks, I = this.mammoth.data.body.indices;
    const count = new Int32Array(M.S + 1);
    let total = 0;
    for (const c of chunks) { total += c.count; for (let i = 0; i < c.count; i++) count[M.siteOf[I[c.arrays.tri[i] * 3]]]++; }
    const first = new Int32Array(M.S + 1);
    for (let s = 0; s < M.S; s++) first[s + 1] = first[s] + count[s];
    const of = new Uint16Array(total), at = new Uint32Array(total), fill = first.slice(0, M.S);
    chunks.forEach((c, ci) => { for (let i = 0; i < c.count; i++) { const k = fill[M.siteOf[I[c.arrays.tri[i] * 3]]]++; of[k] = ci; at[k] = i; } });
    Object.assign(M, { first, lockChunk: of, lockAt: at, chunks });
    M.cursor.fill(0);
    this.lock.fill(-1);
    for (let s = 0; s < M.S; s++) this._count(s);
    this._steps();
  }

  /** How many of a site's locks are still to be gnawed, and how long its hair is on the whole. */
  _count(s) {
    const M = this.map, chunks = M.chunks;
    let left = 0, sum = 0;
    for (let k = M.first[s], e = M.first[s + 1]; k < e; k++) {
      const a = chunks[M.lockChunk[k]].arrays, i = M.lockAt[k], rem = Math.min(a.iA[i * 4], a.iCut[i]);
      if (rem > DONE) left++;
      sum += rem;
    }
    M.left[s] = left;
    const n = M.first[s + 1] - M.first[s];
    M.hair[s] = n ? sum / n : 0;
  }

  /** How many steps each site is from the nearest with anything left on it (-1: there is none anywhere). */
  _steps() {
    const M = this.map, steps = M.steps, q = M.queue;
    let head = 0, tail = 0;
    for (let s = 0; s < M.S; s++) { if (M.left[s] > 0) { steps[s] = 0; q[tail++] = s; } else steps[s] = -1; }
    this.idle = tail === 0;
    while (head < tail) {
      const s = q[head++], d = steps[s] + 1;
      for (let k = M.start[s], e = M.start[s + 1]; k < e; k++) { const o = M.next[k]; if (steps[o] < 0) { steps[o] = d; q[tail++] = o; } }
    }
  }

  /** Where a site is in the world just now (he breathes, and nods), and which way is out from it. */
  _where(s, out, nrm) {
    const M = this.map, B = this.mammoth.rig.skeleton.boneMatrices, br = M.breath[s] * this.mammoth.furMats.uniforms.uBreath.value;
    const nx = M.nrm[s * 3], ny = M.nrm[s * 3 + 1], nz = M.nrm[s * 3 + 2];
    const x = M.pos[s * 3] + nx * br, y = M.pos[s * 3 + 1] + ny * br, z = M.pos[s * 3 + 2] + nz * br;
    let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
    for (let k = 0; k < 4; k++) {
      const w = M.weight[s * 4 + k];
      if (w <= 0) continue;
      const o = M.bone[s * 4 + k] * 16;
      px += w * (B[o] * x + B[o + 4] * y + B[o + 8] * z + B[o + 12]);
      py += w * (B[o + 1] * x + B[o + 5] * y + B[o + 9] * z + B[o + 13]);
      pz += w * (B[o + 2] * x + B[o + 6] * y + B[o + 10] * z + B[o + 14]);
      qx += w * (B[o] * nx + B[o + 4] * ny + B[o + 8] * nz);
      qy += w * (B[o + 1] * nx + B[o + 5] * ny + B[o + 9] * nz);
      qz += w * (B[o + 2] * nx + B[o + 6] * ny + B[o + 10] * nz);
    }
    out[0] = px; out[1] = py; out[2] = pz;
    const l = Math.hypot(qx, qy, qz) || 1;
    nrm[0] = qx / l; nrm[1] = qy / l; nrm[2] = qz / l;
  }

  // ---- hiring and firing -----------------------------------------------------------------

  _new(i) {
    this.phase[i] = Math.random(); this.size[i] = between(0.86, 1.14);
    this.side[i * 2] = between(-1, 1) * 0.028; this.side[i * 2 + 1] = between(-1, 1) * 0.028;
    // most of them tawny, some sandy, the odd one nearly black
    const r = Math.random(), k = r < 0.12 ? 0.42 : r < 0.3 ? 1.22 : between(0.86, 1.08);
    this.coats[i * 3] = k * between(0.94, 1.06); this.coats[i * 3 + 1] = k * between(0.94, 1.06); this.coats[i * 3 + 2] = k * between(0.9, 1.1);
    this.b[i] = -1; this.t[i] = 0; this.lock[i] = -1; this.timer[i] = 0; this.lift[i] = 0; this.rest[i] = 0; this.rise[i] = 0;
    this.fwd[i * 3] = 0; this.fwd[i * 3 + 1] = 0; this.fwd[i * 3 + 2] = 1;
  }

  /** So many more, setting off from the stall one behind another. Returns how many were taken on. */
  hire(n) {
    n = Math.max(0, Math.min(n, MOST - this.count));
    if (!n) return 0;
    if (!this.map) this._sites();
    const M = this.map;
    for (let k = 0; k < n; k++) {
      const i = this.count++;
      this._new(i);
      this.mode[i] = GROUND;
      // (let out in a huddle, a body's length apart, and off one behind another)
      const turn = k * 2.399963, out = 0.062 * Math.sqrt(k);
      this.gx[i] = this.door.x + Math.cos(turn) * out; this.gz[i] = this.door.z + Math.sin(turn) * out;
      this.wait[i] = 0.35 + k * between(0.16, 0.3);
      // up the nearest leg, mostly; some by another, so that they do not all start in one place
      let best = M.feet[0], bd = 1e9;
      const any = Math.random() < 0.3;
      for (const s of M.feet) {
        const d = any ? Math.random() : Math.hypot(M.pos[s * 3] - this.gx[i], M.pos[s * 3 + 2] - this.gz[i]) + Math.random() * 0.25;
        if (d < bd) { bd = d; best = s; }
      }
      this.a[i] = best;
      // (looking the way it is going to go)
      const dx = M.pos[best * 3] - this.gx[i], dz = M.pos[best * 3 + 2] - this.gz[i], dl = Math.hypot(dx, dz) || 1;
      this.fwd[i * 3] = dx / dl; this.fwd[i * 3 + 1] = 0; this.fwd[i * 3 + 2] = dz / dl;
    }
    this.group.visible = true;
    return n;
  }

  /** So many, already on him and at work (a game taken up again). */
  settle(n) {
    n = Math.max(0, Math.min(n, MOST - this.count));
    if (!n) return;
    if (!this.map) this._sites();
    const M = this.map;
    for (let k = 0; k < n; k++) {
      const i = this.count++;
      this._new(i);
      this.mode[i] = CLIMBING;
      this.a[i] = Math.floor(Math.random() * M.S);
      this.rise[i] = 1;
      M.crowd[this.a[i]]++;
    }
    this.group.visible = true;
  }

  /** All of them, gone. */
  dismiss() {
    this.count = 0;
    this.pending.length = 0;
    this.group.visible = false;
    for (const s of this.sets) s.bodies.count = s.heads.count = s.beads.count = 0;
    this.cast.count = 0;
    if (this.map) this.map.crowd.fill(0);
  }

  // ---- every frame -----------------------------------------------------------------------

  /** Take what has been gnawed through off him, and let it fall. */
  _shed(camera, pieces = 0) {
    const cuts = this.pending, m = this.mammoth, clip = this.shaving.clippings, env = this.shaving._env(camera);
    // Only so many pieces of hair can be lying about at once (the oldest make way, and are lost), so the help is
    // allowed a dozen new pieces a second between them: when more locks than that come off, what the others weighed
    // goes to the next piece to fall, as the electric tools do it. (`pieces`: so many are allowed this once.)
    this.pieces = pieces || Math.min(4, this.pieces + 12 * Math.max(0.12, this.time - this.shedAt));
    this.shedAt = this.time;
    for (let k = 0; k < cuts.length; k++) {
      const c = cuts[k], a = c.chunk.arrays, L = a.iA[c.i * 4], rem = Math.min(L, a.iCut[c.i]);
      if (rem <= c.len + 0.0005) continue;                       // (the elf got there first)
      const cut = { chunk: c.chunk, i: c.i, L, len: c.len, prev: a.iCut[c.i], removed: rem - c.len, from: c.len / L, to: rem / L, x: 0, y: 0, z: 0 };
      const grams = this.shaving.grams(rem - c.len);
      if (this.pieces >= 1) { this.pieces--; clip.spawn(cut, env, 0, 0, 0, grams); } else clip.credit(grams);
      m.applyCut(cut);
    }
    cuts.length = 0;
    m.flushCuts();
  }

  update(dt, camera) {
    if (!this.count) return;
    const M = this.map, m = this.mammoth, N = this.count;
    this.time += dt;
    if (M.chunks !== m.chunks) this._locks();

    // ---- the map kept up: a few sites counted again each frame, and the steps to the nearest hair worked out anew ----
    for (let k = 0, n = Math.ceil(M.S / 90); k < n; k++) { this._count(M.scanAt); M.scanAt = (M.scanAt + 1) % M.S; }
    M.stepsIn -= dt;
    if (M.stepsIn <= 0) { M.stepsIn = 0.4; this._steps(); }

    // ---- each of them ----
    const P = this._p, Q = this._q, Nn = this._n, No = this._o;
    const eye = camera.position, close = this.close, mid = this.mid, far = this.far;
    let nc = 0, nm = 0, nf = 0, working = 0;
    for (let i = 0; i < N; i++) {
      let x, y, z, ux = 0, uy = 1, uz = 0, moving = false, gnawing = false;
      if (this.mode[i] === GROUND) {
        // over the snow to the foot of the leg it means to climb
        this._where(this.a[i], P, Nn);
        if (this.wait[i] > 0) this.wait[i] -= dt;
        else {
          const dx = P[0] - this.gx[i], dz = P[2] - this.gz[i], d = Math.hypot(dx, dz);
          const step = 0.42 * this.size[i] * dt;
          if (d <= Math.max(step, 0.05)) { this.mode[i] = CLIMBING; this.lift[i] = 0; M.crowd[this.a[i]]++; }
          else {
            this.gx[i] += (dx / d) * step; this.gz[i] += (dz / d) * step;
            this.fwd[i * 3] = dx / d; this.fwd[i * 3 + 1] = 0; this.fwd[i * 3 + 2] = dz / d;
            moving = true;
          }
        }
        x = this.gx[i]; z = this.gz[i]; y = this.terrain.height(x, z);
      } else {
        const a = this.a[i];
        if (this.b[i] >= 0) {
          // on its way from one site to the next
          this.t[i] += dt / this.span[i];
          if (this.t[i] >= 1) { M.crowd[a] = Math.max(0, M.crowd[a] - 1); this.a[i] = this.b[i]; this.b[i] = -1; this.t[i] = 0; M.crowd[this.a[i]]++; }
          moving = true;
        } else if (M.left[a] > 0) {
          // at work: one lock at a time, the longer the slower
          gnawing = true;
          if (this.lock[i] < 0) {
            const first = M.first[a], n = M.first[a + 1] - first;
            let found = -1;
            for (let tries = 0; tries < n; tries++) {
              const k = first + (M.cursor[a]++ % n), arr = M.chunks[M.lockChunk[k]].arrays, li = M.lockAt[k];
              // (a lock stands for more hair when the coat is drawn with fewer of them, and takes as much longer)
              if (Math.min(arr.iA[li * 4], arr.iCut[li]) > DONE) { found = k; this.timer[i] = (0.06 + 1.1 * Math.min(arr.iA[li * 4], arr.iCut[li])) * (240000 / m.strands); break; }
            }
            if (found < 0) { M.left[a] = 0; gnawing = false; } else this.lock[i] = found;
          } else {
            this.timer[i] -= dt;
            if (this.timer[i] <= 0) {
              const k = this.lock[i], c = M.chunks[M.lockChunk[k]], li = M.lockAt[k];
              this.pending.push({ chunk: c, i: li, len: STUB * (1 + 0.8 * c.arrays.iA[li * 4 + 2]) });
              this.lock[i] = -1;
              if (M.left[a] > 0) M.left[a]--;
            }
          }
        } else if (M.steps[a] > 0) {
          // nothing here: to whichever neighbour is nearer to some (and, of those, the one with fewest on it already)
          let best = -1, bs = M.steps[a], bc = 1e9;
          for (let k = M.start[a], e = M.start[a + 1]; k < e; k++) {
            const o = M.next[k], so = M.steps[o];
            if (so < 0 || so > bs) continue;
            const c = M.crowd[o] + Math.random() * 0.9;
            if (so < bs || c < bc) { bs = so; bc = c; best = o; }
          }
          if (best >= 0 && M.steps[best] < M.steps[a]) this._go(i, best);
        } else if (M.steps[a] === 0) {
          M.left[a] = 0;       // (counted as having hair when it was last looked at, and has none now)
        } else {
          // nothing anywhere: it sits, and now and then tries somewhere else
          this.rest[i] += dt;
          if (this.rest[i] > 4 + this.phase[i] * 7) {
            this.rest[i] = 0;
            const n = M.start[a + 1] - M.start[a];
            if (n) this._go(i, M.next[M.start[a] + Math.floor(Math.random() * n)]);
          }
        }
        if (gnawing) working++;
        // where that is: on the coat, as deep as the hair is long there, and out from the hide
        this._where(this.a[i], P, Nn);
        let hair = M.hair[this.a[i]];
        if (this.b[i] >= 0) {
          this._where(this.b[i], Q, No);
          const t = this.t[i], e = t * t * (3 - 2 * t);
          const dx = Q[0] - P[0], dy = Q[1] - P[1], dz = Q[2] - P[2], dl = Math.hypot(dx, dy, dz) || 1;
          this.fwd[i * 3] = dx / dl; this.fwd[i * 3 + 1] = dy / dl; this.fwd[i * 3 + 2] = dz / dl;
          P[0] += dx * e; P[1] += dy * e; P[2] += dz * e;
          Nn[0] += (No[0] - Nn[0]) * e; Nn[1] += (No[1] - Nn[1]) * e; Nn[2] += (No[2] - Nn[2]) * e;
          hair += (M.hair[this.b[i]] - hair) * e;
        }
        const nl = Math.hypot(Nn[0], Nn[1], Nn[2]) || 1;
        ux = Nn[0] / nl; uy = Nn[1] / nl; uz = Nn[2] / nl;
        const want = 0.006 + 0.2 * Math.min(hair, 0.5);
        this.lift[i] += (want - this.lift[i]) * Math.min(1, dt * 4);
        x = P[0] + ux * this.lift[i]; y = P[1] + uy * this.lift[i]; z = P[2] + uz * this.lift[i];
        if (this.rise[i] < 1) {
          // just arrived: up off the snow and onto him in one hop
          this.rise[i] = Math.min(1, this.rise[i] + dt / 0.45);
          const r = this.rise[i], e = r * r * (3 - 2 * r), gy = this.terrain.height(this.gx[i], this.gz[i]);
          x = this.gx[i] + (x - this.gx[i]) * e; z = this.gz[i] + (z - this.gz[i]) * e;
          y = gy + (y - gy) * e + Math.sin(r * Math.PI) * 0.03;
          ux *= e; uy = 1 + (uy - 1) * e; uz *= e;
          const ul = Math.hypot(ux, uy, uz) || 1;
          ux /= ul; uy /= ul; uz /= ul;
        }
      }

      // ---- how it stands: its back to the hide (or the sky), its nose the way it is going ----
      let fx = this.fwd[i * 3], fy = this.fwd[i * 3 + 1], fz = this.fwd[i * 3 + 2];
      const along = fx * ux + fy * uy + fz * uz;
      fx -= ux * along; fy -= uy * along; fz -= uz * along;
      let fl = Math.hypot(fx, fy, fz);
      if (fl < 1e-3) { fx = uy; fy = -ux; fz = 0; fl = Math.hypot(fx, fy, fz) || 1; if (fl < 1e-3) { fx = 1; fy = 0; fz = 0; fl = 1; } }
      fx /= fl; fy /= fl; fz /= fl;
      const rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
      if (this.mode[i] === CLIMBING) {
        // its own place within the site, so that a crowd is not all on one spot: off to one side across the hide,
        // by axes that do not turn when it does
        let ax = uz, ay = 0, az = -ux, al = Math.hypot(ax, az);
        if (al < 0.2) { ax = 0; ay = -uz; az = uy; al = Math.hypot(ay, az); }
        ax /= al; ay /= al; az /= al;
        const bx = uy * az - uz * ay, by = uz * ax - ux * az, bz = ux * ay - uy * ax, sa = this.side[i * 2], sb = this.side[i * 2 + 1];
        x += ax * sa + bx * sb; y += ay * sa + by * sb; z += az * sa + bz * sb;
      }
      // (it bobs as it runs, sits back when there is nothing to do, and its head goes like a sewing machine when it gnaws)
      const ph = this.time * (moving ? 9 : 2.2) + this.phase[i] * 6.283, s = this.size[i];
      const bob = moving ? Math.abs(Math.sin(ph)) * 0.0022 * s : 0;
      const tip = moving ? Math.sin(ph * 2) * 0.07 : gnawing ? 0.14 : this.mode[i] === CLIMBING && this.rest[i] > 0.6 ? -0.5 : 0;
      const ct = Math.cos(tip), st = Math.sin(tip);
      // the body's own axes, tipped about its right-hand side
      const yx = ux * ct - fx * st, yy = uy * ct - fy * st, yz = uz * ct - fz * st;
      const zx = fx * ct + ux * st, zy = fy * ct + uy * st, zz = fz * ct + uz * st;
      x += ux * bob; y += uy * bob; z += uz * bob;
      const e = this._m.elements;
      e[0] = rx * s; e[1] = ry * s; e[2] = rz * s; e[3] = 0;
      e[4] = yx * s; e[5] = yy * s; e[6] = yz * s; e[7] = 0;
      e[8] = zx * s; e[9] = zy * s; e[10] = zz * s; e[11] = 0;
      e[12] = x; e[13] = y; e[14] = z; e[15] = 1;
      // its head, nodding about the back of its skull
      const nod = gnawing ? 0.2 + 0.2 * Math.sin(this.time * 46 + this.phase[i] * 9) : moving ? -Math.sin(ph * 2) * 0.09 : 0.12 * Math.sin(this.time * 0.9 + this.phase[i] * 20) - (tip < -0.3 ? 0.35 : 0);
      const turn = !moving && !gnawing ? 0.5 * Math.sin(this.time * 0.6 + this.phase[i] * 31) : 0;
      const R = this._nod.makeRotationFromEuler(_euler.set(nod, turn, 0));
      _back.set(NECK[0], NECK[1], NECK[2]).applyMatrix4(R);
      R.setPosition(NECK[0] - _back.x, NECK[1] - _back.y, NECK[2] - _back.z);
      this._h.multiplyMatrices(this._m, R);
      this.cast.instanceMatrix.array.set(e, i * 16);
      const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, d2 = dx * dx + dy * dy + dz * dz;
      const set = d2 < NEAR * NEAR && nc < NEAR_MOST ? close : d2 < MIDDLING * MIDDLING ? mid : far, k = set === close ? nc++ : set === mid ? nm++ : nf++;
      set.bodies.instanceMatrix.array.set(e, k * 16);
      set.heads.instanceMatrix.array.set(this._h.elements, k * 16);
      set.tint[k * 3] = this.coats[i * 3]; set.tint[k * 3 + 1] = this.coats[i * 3 + 1]; set.tint[k * 3 + 2] = this.coats[i * 3 + 2];
    }
    this.working = working;
    for (const [set, n] of [[close, nc], [mid, nm], [far, nf]]) {
      set.bodies.count = set.heads.count = set.beads.count = n;
      if (n) { set.bodies.instanceMatrix.needsUpdate = true; set.heads.instanceMatrix.needsUpdate = true; set.bodies.instanceColor.needsUpdate = true; }
    }
    this.cast.count = N;
    this.cast.instanceMatrix.needsUpdate = true;

    // ---- what they have gnawed through comes off him, a few times a second ----
    this.flushIn -= dt;
    if (this.pending.length && this.flushIn <= 0) { this.flushIn = 0.12; this._shed(camera); }

    // ---- and one of them, now and then, has something to say ----
    this.squeakIn -= dt;
    if (this.squeakIn <= 0) {
      this.squeakIn = between(2.5, 9) / Math.min(3, 1 + N / 30);
      if (this.sound && this.sound.squeak && working && camera.position.distanceTo(_back.set(0.5, 1.6, 0)) < 9) this.sound.squeak();
    }
  }

  /** Set one off from the site it is at to a neighbouring one. */
  _go(i, to) {
    const M = this.map, a = this.a[i];
    const d = Math.hypot(M.pos[to * 3] - M.pos[a * 3], M.pos[to * 3 + 1] - M.pos[a * 3 + 1], M.pos[to * 3 + 2] - M.pos[a * 3 + 2]);
    this.b[i] = to; this.t[i] = 0; this.rest[i] = 0;
    this.span[i] = Math.max(0.12, d / (0.24 * this.size[i]));
  }
}

const _euler = new THREE.Euler(), _back = new THREE.Vector3();
