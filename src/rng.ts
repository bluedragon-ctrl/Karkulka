/** Seeded random numbers, so a forest code always gives the same forest. */
export type Rng = () => number;

/** FNV-1a hash of a string to a 32-bit seed. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngFrom = (label: string): Rng => mulberry32(hashString(label));

export const randInt = (rng: Rng, n: number): number => Math.floor(rng() * n);

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randInt(rng, items.length)];
}

export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A short, easy-to-read forest code. */
export function randomCode(rng: Rng = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randInt(rng, CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}
