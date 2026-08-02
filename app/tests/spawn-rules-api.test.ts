import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizeSpawnOverride,
  type SpawnRule,
  type SpeciesSpawnOverride,
} from "../src/lib/encounters";
import {
  deleteSpawnOverride,
  listSpawnOverrides,
  putSpawnOverride,
} from "../server/services/pokemon/spawn-rules-store";

const PIKACHU = 25;
const GROUDON = 383;

const customRule = (speciesId: number, overrides: Partial<SpawnRule> = {}): SpawnRule => ({
  id: `${speciesId}:custom:0`,
  speciesId,
  enabled: true,
  weight: 40,
  biomes: ["long-grass"],
  fence: { kind: "circle", lat: -25.3444, lng: 131.0369, radiusKm: 120 },
  levelMin: 10,
  levelMax: 20,
  shinyDenominator: 512,
  source: "custom",
  ...overrides,
});

const overrideFor = (speciesId: number, rules: SpawnRule[]): SpeciesSpawnOverride => ({
  speciesId,
  rules,
});

const originalOffline = process.env.POKEWORLD_OFFLINE_MAP;
const originalMongoUri = process.env.MONGODB_URI;
const originalMongoScheme = process.env.MONGODB_SCHEME;

beforeEach(() => {
  // Force the non-durable in-memory path: no test may touch a real Mongo.
  process.env.POKEWORLD_OFFLINE_MAP = "true";
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_SCHEME;
});

afterEach(async () => {
  // The in-memory Map is module-level, so clean up while still offline.
  await deleteSpawnOverride(PIKACHU);
  await deleteSpawnOverride(GROUDON);
  if (originalOffline === undefined) delete process.env.POKEWORLD_OFFLINE_MAP;
  else process.env.POKEWORLD_OFFLINE_MAP = originalOffline;
  if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = originalMongoUri;
  if (originalMongoScheme === undefined) delete process.env.MONGODB_SCHEME;
  else process.env.MONGODB_SCHEME = originalMongoScheme;
});

describe("spawn-rules store (in-memory fallback)", () => {
  it("round-trips put, list, and delete without Mongo", async () => {
    const stored = await putSpawnOverride(overrideFor(PIKACHU, [customRule(PIKACHU)]));
    expect(stored.speciesId).toBe(PIKACHU);
    expect(stored.updated).toBeTypeOf("number");
    expect(stored.rules).toHaveLength(1);
    expect(stored.rules[0]).toMatchObject({
      id: `${PIKACHU}:custom:0`,
      speciesId: PIKACHU,
      weight: 40,
      biomes: ["long-grass"],
      levelMin: 10,
      levelMax: 20,
      shinyDenominator: 512,
      source: "custom",
    });

    await putSpawnOverride(overrideFor(GROUDON, [customRule(GROUDON, { levelMin: 50, levelMax: 70 })]));
    const listed = await listSpawnOverrides();
    expect(listed.map((entry) => entry.speciesId)).toEqual([PIKACHU, GROUDON]);

    expect(await deleteSpawnOverride(PIKACHU)).toBe(true);
    expect(await deleteSpawnOverride(PIKACHU)).toBe(false);
    expect((await listSpawnOverrides()).map((entry) => entry.speciesId)).toEqual([GROUDON]);
  });

  it("upserts by speciesId instead of appending duplicate docs", async () => {
    await putSpawnOverride(overrideFor(PIKACHU, [customRule(PIKACHU)]));
    await putSpawnOverride(overrideFor(PIKACHU, [customRule(PIKACHU, { weight: 99 })]));

    const listed = await listSpawnOverrides();
    expect(listed).toHaveLength(1);
    expect(listed[0].rules[0].weight).toBe(99);
  });

  it("rejects overrides that fail validation", async () => {
    // Species outside the National Dex.
    await expect(
      putSpawnOverride(overrideFor(999, [customRule(999)])),
    ).rejects.toThrow(/invalid spawn override/i);
    // Inverted level range.
    await expect(
      putSpawnOverride(
        overrideFor(PIKACHU, [customRule(PIKACHU, { levelMin: 30, levelMax: 20 })]),
      ),
    ).rejects.toThrow(/invalid spawn override/i);
    // Unknown biome.
    await expect(
      putSpawnOverride(
        overrideFor(PIKACHU, [customRule(PIKACHU, { biomes: ["lava"] as unknown as SpawnRule["biomes"] })]),
      ),
    ).rejects.toThrow(/invalid spawn override/i);
    expect(await listSpawnOverrides()).toEqual([]);
  });
});

describe("admin PUT body validation contract", () => {
  it("normalizes valid bodies and rejects malformed ones (route returns 400)", () => {
    expect(normalizeSpawnOverride(null)).toBeNull();
    expect(normalizeSpawnOverride("groudon")).toBeNull();
    expect(normalizeSpawnOverride({ speciesId: PIKACHU })).toBeNull();
    expect(normalizeSpawnOverride({ speciesId: PIKACHU, rules: [{}] })).toBeNull();

    const normalized = normalizeSpawnOverride(overrideFor(PIKACHU, [customRule(PIKACHU)]));
    expect(normalized).not.toBeNull();
    expect(normalized?.rules[0]).toMatchObject({ speciesId: PIKACHU, source: "custom" });
  });
});
