// noise.js — Seedable RNG, Perlin/Simplex noise (2D/3D), and fBm helpers.

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convert a string into a 32-bit seed (FNV-1a). */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Seeded Perlin noise. 2D and 3D variants, with values approximately in [-1, 1].
 */
export class PerlinNoise {
  constructor(seed = 0) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.permMod12[i] = this.perm[i] % 12;
  }

  _grad2(hash, x, y) {
    const g = GRAD3[hash % 12];
    return g[0] * x + g[1] * y;
  }

  _grad3(hash, x, y, z) {
    const g = GRAD3[hash % 12];
    return g[0] * x + g[1] * y + g[2] * z;
  }

  /** 2D Perlin, range ~[-1,1]. */
  noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const p = this.perm;
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const x1 = lerp(this._grad2(aa, xf, yf), this._grad2(ba, xf - 1, yf), u);
    const x2 = lerp(this._grad2(ab, xf, yf - 1), this._grad2(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }

  /** 3D Perlin, range ~[-1,1]. */
  noise3D(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    const p = this.perm;
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    return lerp(
      lerp(
        lerp(this._grad3(p[AA], xf, yf, zf), this._grad3(p[BA], xf - 1, yf, zf), u),
        lerp(this._grad3(p[AB], xf, yf - 1, zf), this._grad3(p[BB], xf - 1, yf - 1, zf), u),
        v
      ),
      lerp(
        lerp(this._grad3(p[AA + 1], xf, yf, zf - 1), this._grad3(p[BA + 1], xf - 1, yf, zf - 1), u),
        lerp(this._grad3(p[AB + 1], xf, yf - 1, zf - 1), this._grad3(p[BB + 1], xf - 1, yf - 1, zf - 1), u),
        v
      ),
      w
    );
  }

  /** Fractal Brownian Motion 2D. */
  fbm2D(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Fractal Brownian Motion 3D. */
  fbm3D(x, y, z, octaves = 3, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise3D(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Billowy noise (absolute value)—useful for mountains/hills. */
  billow2D(x, y, octaves = 4) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * (Math.abs(this.noise2D(x * freq, y * freq)) * 2 - 1);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}

/** Helper: smoothly interpolate into a range. */
export function mapRange(value, inMin, inMax, outMin, outMax) {
  const t = (value - inMin) / (inMax - inMin);
  return outMin + Math.max(0, Math.min(1, t)) * (outMax - outMin);
}

/** Deterministic hash for chunk/world coordinates → [0,1). */
export function coordHash(x, y, z, seed) {
  let h = (seed | 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
