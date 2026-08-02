import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  NATIONAL_DEX_COUNT,
  allSpecies,
  calcStats,
  expForLevel,
  expGainForDefeat,
  getSpecies,
  levelForExp,
  rollGender,
  rollShiny,
  speciesByName,
  spriteUrl,
  typeEffectiveness,
} from "../src/lib/pokedex";

const spriteRoot = path.resolve(__dirname, "../public/sprites/pokemon/gen3");

describe("pokedex dataset", () => {
  it("ships all 386 Gen I-III species with complete battle data", () => {
    const entries = allSpecies();
    expect(entries).toHaveLength(NATIONAL_DEX_COUNT);
    for (const entry of entries) {
      expect(entry.id).toBeGreaterThanOrEqual(1);
      expect(entry.id).toBeLessThanOrEqual(386);
      expect(entry.types.length).toBeGreaterThanOrEqual(1);
      expect(entry.catchRate).toBeGreaterThanOrEqual(1);
      expect(entry.baseStats.hp).toBeGreaterThan(0);
      expect(entry.baseStats.spe).toBeGreaterThan(0);
      expect(entry.displayName.length).toBeGreaterThan(0);
    }
  });

  it("has every battle sprite variant on disk for every species", () => {
    for (let id = 1; id <= NATIONAL_DEX_COUNT; id += 1) {
      for (const slot of ["", "shiny", "back", "back-shiny"]) {
        const file = path.join(spriteRoot, slot, `${id}.png`);
        expect(existsSync(file), `missing sprite ${slot || "front"}/${id}.png`).toBe(true);
      }
    }
  });

  it("resolves species by dex id and by name", () => {
    expect(getSpecies(383)?.displayName).toBe("GROUDON");
    expect(speciesByName("groudon")?.id).toBe(383);
    expect(speciesByName("TREECKO")?.id).toBe(252);
    expect(getSpecies(999)).toBeUndefined();
  });

  it("builds sprite urls for every variant", () => {
    expect(spriteUrl(25)).toBe("/sprites/pokemon/gen3/25.png");
    expect(spriteUrl(25, { shiny: true })).toBe("/sprites/pokemon/gen3/shiny/25.png");
    expect(spriteUrl(25, { back: true })).toBe("/sprites/pokemon/gen3/back/25.png");
    expect(spriteUrl(25, { back: true, shiny: true })).toBe("/sprites/pokemon/gen3/back-shiny/25.png");
  });
});

describe("gen III math", () => {
  it("computes level-100 stats matching the Gen III formula", () => {
    const mewtwo = getSpecies(150)!;
    const stats = calcStats(mewtwo.baseStats, 100, 0);
    expect(stats.hp).toBe(2 * 106 + 110); // 2*base + level + 10
    expect(stats.atk).toBe(2 * 110 + 5);
  });

  it("exp curves are monotonic and match known anchors", () => {
    expect(expForLevel("medium", 100)).toBe(1_000_000);
    expect(expForLevel("fast", 100)).toBe(800_000);
    expect(expForLevel("slow", 100)).toBe(1_250_000);
    expect(expForLevel("medium-slow", 100)).toBe(1_059_860);
    for (const curve of ["medium", "fast", "slow", "medium-slow", "erratic", "fluctuating"]) {
      let previous = expForLevel(curve, 2);
      for (let level = 3; level <= 100; level += 1) {
        const current = expForLevel(curve, level);
        expect(current, `${curve} L${level}`).toBeGreaterThan(previous);
        previous = current;
      }
    }
  });

  it("levelForExp inverts expForLevel", () => {
    for (const level of [1, 7, 36, 99, 100]) {
      expect(levelForExp("medium-slow", expForLevel("medium-slow", level))).toBe(level);
    }
  });

  it("yields Gen III flat exp for defeated wild Pokémon", () => {
    const zigzagoon = getSpecies(263)!;
    expect(expGainForDefeat(zigzagoon, 7)).toBe(Math.floor((zigzagoon.baseExp * 7) / 7));
  });

  it("rolls gender by species ratio and respects genderless", () => {
    expect(rollGender(-1, () => 0)).toBe("genderless");
    expect(rollGender(0, () => 0.99)).toBe("male");
    expect(rollGender(8, () => 0)).toBe("female");
    expect(rollGender(1, () => 0.01)).toBe("female"); // 1/8 female, roll below threshold
    expect(rollGender(1, () => 0.9)).toBe("male");
  });

  it("rolls shinies at the requested denominator", () => {
    expect(rollShiny(() => 0, 8192)).toBe(true);
    expect(rollShiny(() => 0.99, 8192)).toBe(false);
    expect(rollShiny(() => 0.4, 2)).toBe(true); // floor(0.4*2)=0 → 1-in-2 hit
    expect(rollShiny(() => 0.6, 2)).toBe(false); // floor(0.6*2)=1, only bucket 0 wins
  });

  it("applies the Gen III type chart with dual-type stacking", () => {
    expect(typeEffectiveness("WATER", ["FIRE"])).toBe(2);
    expect(typeEffectiveness("WATER", ["FIRE", "ROCK"])).toBe(4);
    expect(typeEffectiveness("ELECTRIC", ["GROUND"])).toBe(0);
    expect(typeEffectiveness("NORMAL", ["GHOST"])).toBe(0);
    expect(typeEffectiveness("GRASS", ["FIRE", "FLYING"])).toBe(0.25);
    expect(typeEffectiveness("DRAGON", ["DRAGON"])).toBe(2);
  });
});
