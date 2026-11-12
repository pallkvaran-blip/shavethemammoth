// Deterministic 2D gradient noise for building the landscape on the CPU.

const PERM = new Uint8Array(512);
(() => {
  let s = 1337;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

const GX = [1, -1, 1, -1, 1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071];
const GY = [1, 1, -1, -1, 0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071];

/** Perlin-style gradient noise, roughly -1..1 */
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const X = xi & 255, Y = yi & 255;
  const g00 = PERM[X + PERM[Y]] % 12, g10 = PERM[X + 1 + PERM[Y]] % 12;
  const g01 = PERM[X + PERM[Y + 1]] % 12, g11 = PERM[X + 1 + PERM[Y + 1]] % 12;
  const n00 = GX[g00] * xf + GY[g00] * yf;
  const n10 = GX[g10] * (xf - 1) + GY[g10] * yf;
  const n01 = GX[g01] * xf + GY[g01] * (yf - 1);
  const n11 = GX[g11] * (xf - 1) + GY[g11] * (yf - 1);
  const a = n00 + u * (n10 - n00), b = n01 + u * (n11 - n01);
  return (a + v * (b - a)) * 1.2;
}

export function fbm2(x, y, octaves = 5, lacunarity = 2.03, gain = 0.5) {
  let amp = 0.5, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x, y);
    norm += amp;
    x = x * lacunarity + 19.7; y = y * lacunarity - 7.3;
    amp *= gain;
  }
  return sum / norm;
}

/** Ridged multifractal, 0..1 with sharp crests */
export function ridged2(x, y, octaves = 6, lacunarity = 2.1, gain = 0.5) {
  let amp = 0.5, sum = 0, norm = 0, prev = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise2(x, y));
    n *= n;
    sum += n * amp * prev;
    norm += amp;
    prev = n;
    x = x * lacunarity + 31.1; y = y * lacunarity + 11.9;
    amp *= gain;
  }
  return sum / norm;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
