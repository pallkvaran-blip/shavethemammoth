// A figure made elsewhere. The other people here are sculpted by the page as
// it loads (bake.js), which keeps what they can be to what a page can work out
// in a few seconds. A cast is the same kind of thing as comes out of that
// baking (points hung on bones, and what each part of him is made of), made
// beforehand from a sculpt far too fine to make here: a million faces thinned
// to tens of thousands, with what was lost kept as pictures of its colour, its
// roughness and the shape of its creases. It comes as one file of numbers and
// those pictures, and is dressed and brought to life like the rest
// (figure.js).
//
// The file: 'FIG2', the length of a description (JSON, padded to a multiple of
// eight), the description, then the lists of numbers it describes, each where
// it says. The lists are kept in as few bits as they can stand (a place on him
// to a sixteenth of a millimetre is plenty), and the whole file is squeezed
// (gzip) and then spelt out as text (base64), because a page's host will
// serve text where it may refuse bytes of a kind it does not know. The
// description says what each list's numbers stand for, and they are turned
// back into the numbers the game draws with as they are read.
import * as THREE from 'three';
import figUrl from './casts/gnorman/gnorman.fig.txt?url';
import baseUrl from './casts/gnorman/base.jpg?url';
import normalUrl from './casts/gnorman/normal.jpg?url';
import ormUrl from './casts/gnorman/orm.jpg?url';

const CASTS = { gnorman: { fig: figUrl, base: baseUrl, normal: normalUrl, orm: ormUrl } };
const KINDS = { float32: Float32Array, uint16: Uint16Array, uint32: Uint32Array, int8: Int8Array, uint8: Uint8Array, int16: Int16Array };

/** The figure in a file's worth of bytes (unsqueezed): its description, with `A`, the lists it describes, by name. */
export function readCast(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, false) !== 0x46494732) throw new Error('not a figure file');
  const n = view.getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, n)));
  const A = {};
  for (const [name, a] of Object.entries(head.arrays)) {
    const kept = new KINDS[a.type](buffer, 8 + n + a.offset, a.length);
    if (!a.as) { A[name] = kept; continue; }
    // (kept small: each number is so many of a step, from a starting place; one step and place for all, or one for each of x, y, z)
    const out = new KINDS[a.as](a.length), per = a.itemSize;
    const scale = a.scale ?? 1;
    for (let i = 0; i < a.length; i++) {
      const k = i % per;
      out[i] = kept[i] * (Array.isArray(scale) ? scale[k] : scale) + (Array.isArray(a.from) ? a.from[k] : (a.from ?? 0));
    }
    A[name] = out;
  }
  return { ...head, A };
}

/** A figure file as it was fetched, back to the bytes readCast wants: out of its letters if it is spelt out, and unsqueezed. */
async function unpacked(buffer) {
  let bytes = new Uint8Array(buffer);
  const starts = (a, b) => bytes[0] === a && bytes[1] === b;
  if (!starts(0x1f, 0x8b) && !starts(0x46, 0x49)) {
    // (letters: four of them to every three bytes)
    const text = atob(new TextDecoder().decode(bytes).trim());
    bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  }
  if (!starts(0x1f, 0x8b)) return bytes.buffer;
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

/**
 * How far a point is from him (metres; less than nothing inside him), from the map of it that comes with him: for
 * growing hair that keeps out of him. The map covers his head and chest; beyond it, he is taken to be a long way off.
 */
export function distanceTo(cast) {
  const { cell, lo, dims, unit } = cast.sdf, D = cast.A.sdf, nx = dims[0], ny = dims[1], nz = dims[2];
  return (x, y, z) => {
    const fx = (x - lo[0]) / cell - 0.5, fy = (y - lo[1]) / cell - 0.5, fz = (z - lo[2]) / cell - 0.5;
    if (fx < 0 || fy < 0 || fz < 0 || fx > nx - 1.001 || fy > ny - 1.001 || fz > nz - 1.001) return 0.05;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz), tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const at = (i, j, k) => D[(k * ny + j) * nx + i];
    const a = at(ix, iy, iz) * (1 - tx) + at(ix + 1, iy, iz) * tx, b = at(ix, iy + 1, iz) * (1 - tx) + at(ix + 1, iy + 1, iz) * tx;
    const c = at(ix, iy, iz + 1) * (1 - tx) + at(ix + 1, iy, iz + 1) * tx, d = at(ix, iy + 1, iz + 1) * (1 - tx) + at(ix + 1, iy + 1, iz + 1) * tx;
    return ((a * (1 - ty) + b * ty) * (1 - tz) + (c * (1 - ty) + d * ty) * tz) * unit;
  };
}

/** Fetch a cast and its pictures. Resolves to the figure (see readCast) with `pictures: { base, normal, orm }`. */
export async function loadCast(name) {
  const urls = CASTS[name];
  if (!urls) throw new Error('no such cast: ' + name);
  const loader = new THREE.TextureLoader();
  const picture = async (url, colour) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const [buffer, base, normal, orm] = await Promise.all([
    fetch(urls.fig).then((r) => { if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.arrayBuffer(); }).then(unpacked),
    picture(urls.base, true), picture(urls.normal, false), picture(urls.orm, false),
  ]);
  return { ...readCast(buffer), pictures: { base, normal, orm } };
}
