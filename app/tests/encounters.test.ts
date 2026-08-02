import { describe, expect, it } from "vitest";
import type { MapTile } from "../server/services/map/types";
import {
  defaultRulesFor,
  defaultSpawnRules,
  encounterBiomeFor,
  encounterTriggered,
  fenceContains,
  haversineKm,
  matchingRules,
  mergeSpawnRules,
  normalizeSpawnOverride,
  rollEncounter,
  type SpawnRule,
} from "../src/lib/encounters";
import { getSpecies } from "../src/lib/pokedex";

const tile = (overrides: Partial<MapTile>): MapTile => ({
  uuid: "t",
  blockX: 0,
  blockY: 0,
  mapX: 0,
  mapY: 0,
  x: 0,
  y: 0,
  ...overrides,
});

// Deterministic RNG from a fixed sequence (repeats the last value).
const seq = (...values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};

const ULURU = { lat: -25.3444, lng: 131.0369 };

describe("biome detection", () => {
  it("detects long grass by feature and by img2 fallback", () => {
    expect(encounterBiomeFor(tile({ feature: "long-grass" }))).toBe("long-grass");
    expect(encounterBiomeFor(tile({ img2: "grass-2" }))).toBe("long-grass");
    expect(encounterBiomeFor(tile({ feature: "sign" }))).toBeNull();
  });

  it("only treats water as encounterable while surfing", () => {
    const water = tile({ terrain: "water", img: "pond-center-1", solid: true });
    expect(encounterBiomeFor(water)).toBeNull();
    expect(encounterBiomeFor(water, { surfing: true })).toBe("water");
  });

  it("uses the cave biome near cave entrances", () => {
    expect(encounterBiomeFor(tile({}), { nearCave: true })).toBe("cave");
    // Long grass wins over cave proximity (standing in grass near a cave).
    expect(encounterBiomeFor(tile({ feature: "long-grass" }), { nearCave: true })).toBe("long-grass");
  });

  it("triggers encounters at the configured per-step rate", () => {
    expect(encounterTriggered("long-grass", () => 0.11)).toBe(true);
    expect(encounterTriggered("long-grass", () => 0.13)).toBe(false);
  });
});

describe("geofencing", () => {
  it("computes real-world distances", () => {
    // Melbourne to Sydney is ~713 km.
    const distance = haversineKm(-37.8136, 144.9631, -33.8688, 151.2093);
    expect(distance).toBeGreaterThan(680);
    expect(distance).toBeLessThan(740);
  });

  it("contains points inside circles and everywhere for global", () => {
    expect(fenceContains({ kind: "global" }, 0, 0)).toBe(true);
    const uluru = { kind: "circle" as const, ...ULURU, radiusKm: 100 };
    expect(fenceContains(uluru, -25.35, 131.04)).toBe(true); // at the rock
    expect(fenceContains(uluru, -37.81, 144.96)).toBe(false); // Melbourne
    expect(fenceContains(uluru, Number.NaN, 131)).toBe(false);
  });
});

describe("default rules", () => {
  it("gives every species at least one rule and biomes match types", () => {
    const rules = defaultSpawnRules();
    const bySpecies = new Map<number, SpawnRule[]>();
    for (const rule of rules) {
      bySpecies.set(rule.speciesId, [...(bySpecies.get(rule.speciesId) ?? []), rule]);
    }
    expect(bySpecies.size).toBe(386);

    // Grass types only in long grass; water types on water.
    const treecko = bySpecies.get(252)![0];
    expect(treecko.biomes).toEqual(["long-grass"]);
    const magikarp = bySpecies.get(129)![0];
    expect(magikarp.biomes).toContain("water");
    const zubat = bySpecies.get(41)![0];
    expect(zubat.biomes).toContain("cave");
    // World defaults: levels 2-7, global fence, weight from catch rate.
    expect(treecko.levelMin).toBe(2);
    expect(treecko.levelMax).toBe(7);
    expect(treecko.fence.kind).toBe("global");
    expect(bySpecies.get(263)![0].weight).toBe(255); // Zigzagoon everywhere
  });

  it("geofences Groudon to a 100km circle around Uluru at level 50-70", () => {
    const [groudon] = defaultRulesFor(getSpecies(383)!);
    expect(groudon.fence).toEqual({ kind: "circle", ...ULURU, radiusKm: 100 });
    expect(groudon.levelMin).toBe(50);
    expect(groudon.levelMax).toBe(70);
    expect(groudon.weight).toBe(1);
  });

  it("replaces a species' rules entirely when an override exists", () => {
    const override = {
      speciesId: 252,
      rules: [
        {
          id: "252:custom:0",
          speciesId: 252,
          enabled: true,
          weight: 10,
          biomes: ["cave" as const],
          fence: { kind: "global" as const },
          levelMin: 40,
          levelMax: 45,
          source: "custom" as const,
        },
      ],
    };
    const merged = mergeSpawnRules([override]);
    const treeckoRules = merged.filter((rule) => rule.speciesId === 252);
    expect(treeckoRules).toHaveLength(1);
    expect(treeckoRules[0].biomes).toEqual(["cave"]);
    expect(treeckoRules[0].levelMin).toBe(40);
    // Other species keep their defaults.
    expect(merged.filter((rule) => rule.speciesId === 263)).toHaveLength(1);
  });
});

describe("override validation", () => {
  it("accepts a valid multi-variant override", () => {
    const normalized = normalizeSpawnOverride({
      speciesId: 25,
      rules: [
        { enabled: true, weight: 50, biomes: ["long-grass"], fence: { kind: "global" }, levelMin: 2, levelMax: 7 },
        {
          enabled: true,
          weight: 5,
          biomes: ["long-grass"],
          fence: { kind: "circle", lat: 35.0, lng: 135.0, radiusKm: 50 },
          levelMin: 50,
          levelMax: 50,
          shinyDenominator: 512,
          genderOverride: "female",
        },
      ],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.rules).toHaveLength(2);
    expect(normalized!.rules[1].shinyDenominator).toBe(512);
    expect(normalized!.rules[1].genderOverride).toBe("female");
    expect(normalized!.rules[1].source).toBe("custom");
  });

  it("rejects invalid species, fences, level ranges, and shiny odds", () => {
    const base = { enabled: true, weight: 1, biomes: ["long-grass"], fence: { kind: "global" }, levelMin: 1, levelMax: 5 };
    expect(normalizeSpawnOverride({ speciesId: 999, rules: [base] })).toBeNull();
    expect(normalizeSpawnOverride({ speciesId: 25, rules: [{ ...base, fence: { kind: "circle", lat: 200, lng: 0, radiusKm: 10 } }] })).toBeNull();
    expect(normalizeSpawnOverride({ speciesId: 25, rules: [{ ...base, levelMin: 8, levelMax: 3 }] })).toBeNull();
    expect(normalizeSpawnOverride({ speciesId: 25, rules: [{ ...base, levelMax: 101 }] })).toBeNull();
    expect(normalizeSpawnOverride({ speciesId: 25, rules: [{ ...base, shinyDenominator: 0 }] })).toBeNull();
    expect(normalizeSpawnOverride({ speciesId: 25, rules: [{ ...base, biomes: ["lava"] }] })).toBeNull();
    expect(normalizeSpawnOverride({ speciesId: 25, rules: [] })).not.toBeNull(); // empty = never spawns
  });
});

describe("encounter rolls", () => {
  const rules = defaultSpawnRules();

  it("only rolls species whose fence contains the player", () => {
    // In Melbourne long grass, Groudon (Uluru-fenced) must never appear.
    const melbourneMatches = matchingRules(rules, "long-grass", -37.81, 144.96);
    expect(melbourneMatches.some((rule) => rule.speciesId === 383)).toBe(false);
    // At Uluru it can.
    const uluruMatches = matchingRules(rules, "long-grass", -25.35, 131.04);
    expect(uluruMatches.some((rule) => rule.speciesId === 383)).toBe(true);
  });

  it("respects biome fencing (grass types never on water)", () => {
    const waterMatches = matchingRules(rules, "water", -37.81, 144.96);
    expect(waterMatches.some((rule) => rule.speciesId === 252)).toBe(false);
    expect(waterMatches.some((rule) => rule.speciesId === 129)).toBe(true);
  });

  it("rolls a level inside the rule's range and applies overrides", () => {
    const custom: SpawnRule[] = [
      {
        id: "x",
        speciesId: 25,
        enabled: true,
        weight: 1,
        biomes: ["long-grass"],
        fence: { kind: "global" },
        levelMin: 50,
        levelMax: 55,
        genderOverride: "female",
        shinyDenominator: 1,
        source: "custom",
      },
    ];
    const result = rollEncounter(custom, "long-grass", 0, 0, seq(0.1, 0.99, 0.5, 0));
    expect(result).not.toBeNull();
    expect(result!.speciesId).toBe(25);
    expect(result!.level).toBeGreaterThanOrEqual(50);
    expect(result!.level).toBeLessThanOrEqual(55);
    expect(result!.gender).toBe("female");
    expect(result!.shiny).toBe(true); // 1-in-1 fence odds
  });

  it("weighted selection is deterministic under a seeded rng", () => {
    const custom: SpawnRule[] = [
      { id: "a", speciesId: 1, enabled: true, weight: 90, biomes: ["long-grass"], fence: { kind: "global" }, levelMin: 5, levelMax: 5, source: "custom" },
      { id: "b", speciesId: 4, enabled: true, weight: 10, biomes: ["long-grass"], fence: { kind: "global" }, levelMin: 5, levelMax: 5, source: "custom" },
    ];
    expect(rollEncounter(custom, "long-grass", 0, 0, seq(0.5, 0.5, 0.5, 0.9))!.speciesId).toBe(1);
    expect(rollEncounter(custom, "long-grass", 0, 0, seq(0.95, 0.5, 0.5, 0.9))!.speciesId).toBe(4);
    // Disabled and zero-weight rules never fire.
    const disabled = custom.map((rule) => ({ ...rule, enabled: false }));
    expect(rollEncounter(disabled, "long-grass", 0, 0, seq(0.5))).toBeNull();
  });

  it("genderless species stay genderless even with a gender override", () => {
    const custom: SpawnRule[] = [
      { id: "g", speciesId: 81, enabled: true, weight: 1, biomes: ["cave"], fence: { kind: "global" }, levelMin: 10, levelMax: 10, genderOverride: "female", source: "custom" },
    ];
    const result = rollEncounter(custom, "cave", 0, 0, seq(0.2, 0.2, 0.2, 0.9));
    expect(result!.gender).toBe("genderless"); // Magnemite has no gender
  });
});
