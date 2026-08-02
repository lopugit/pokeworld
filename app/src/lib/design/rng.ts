// Deterministic seeded RNG for design generation. Same (family, seed) →
// byte-identical design on every platform, which is what makes remixed
// designs shareable as tiny {family, seed} recipes.

export type Rng = {
  next(): number; // [0, 1)
  int(maxExclusive: number): number;
  range(min: number, maxInclusive: number): number;
  chance(probability: number): boolean;
  pick<T>(values: readonly T[]): T;
  weighted<T>(values: readonly T[], weights: readonly number[]): T;
  shuffle<T>(values: readonly T[]): T[];
};

export function hashSeed(family: string, seed: number): number {
  let value = Math.imul(seed | 0, 0x9e3779b9) ^ 0x85ebca6b;
  for (let index = 0; index < family.length; index += 1) {
    value = Math.imul(value ^ family.charCodeAt(index), 0x27d4eb2d);
  }
  value ^= value >>> 15;
  return value >>> 0;
}

export function createRng(family: string, seed: number): Rng {
  let state = hashSeed(family, seed) || 0x1a2b3c4d;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (maxExclusive) => Math.floor(next() * Math.max(1, maxExclusive)),
    range: (min, maxInclusive) => min + Math.floor(next() * (maxInclusive - min + 1)),
    chance: (probability) => next() < probability,
    pick: (values) => values[Math.min(values.length - 1, Math.floor(next() * values.length))],
    weighted: (values, weights) => {
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let remaining = next() * total;
      for (let index = 0; index < values.length; index += 1) {
        remaining -= weights[index] ?? 0;
        if (remaining < 0) return values[index];
      }
      return values[values.length - 1];
    },
    shuffle: (values) => {
      const copy = [...values];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const other = Math.floor(next() * (index + 1));
        [copy[index], copy[other]] = [copy[other], copy[index]];
      }
      return copy;
    },
  };
  return rng;
}
