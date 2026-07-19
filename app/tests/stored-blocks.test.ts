import { afterEach, describe, expect, it } from "vitest";
import {
  completedBlockSet,
  currentBlockSubset,
  hasEveryRequestedBlock,
} from "../server/services/map/stored-blocks";
import { MAP_BLOCK_VERSION } from "../server/services/map/generate";

const currentBlock = (overrides: Record<string, unknown> = {}) => ({
  x: 1,
  y: 2,
  mapSource: "google-static-maps",
  fallbackGenerated: false,
  tiles: Array.from({ length: 256 }, () => ({ version: MAP_BLOCK_VERSION })),
  ...overrides,
});

const originalGoogleKey = process.env.GOOGLE_API_KEY;
const originalOffline = process.env.POKEWORLD_OFFLINE_MAP;

afterEach(() => {
  if (originalGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = originalGoogleKey;
  if (originalOffline === undefined) delete process.env.POKEWORLD_OFFLINE_MAP;
  else process.env.POKEWORLD_OFFLINE_MAP = originalOffline;
});

describe("completedBlockSet", () => {
  it("returns the cached set when every requested block is current", () => {
    const cached = [currentBlock(), currentBlock({ x: 2 })];
    expect(completedBlockSet(cached, 2)).toEqual(cached);
  });

  it("returns null for missing sets or count mismatches", () => {
    expect(completedBlockSet(undefined, 1)).toBeNull();
    expect(completedBlockSet(null, 1)).toBeNull();
    expect(completedBlockSet([currentBlock()], 2)).toBeNull();
  });

  it("returns null when any block has stale tile versions", () => {
    const stale = currentBlock({
      tiles: Array.from({ length: 256 }, () => ({ version: "0.0.0001" })),
    });
    expect(completedBlockSet([currentBlock(), stale], 2)).toBeNull();
  });

  it("returns null for fallback blocks once Google imagery is available", () => {
    process.env.GOOGLE_API_KEY = "test-key";
    delete process.env.POKEWORLD_OFFLINE_MAP;
    const fallback = currentBlock({ fallbackGenerated: true, mapSource: "fallback" });
    expect(completedBlockSet([fallback], 1)).toBeNull();

    // Without a Google key the same fallback block is acceptable.
    delete process.env.GOOGLE_API_KEY;
    expect(completedBlockSet([fallback], 1)).toEqual([fallback]);
  });
});

describe("currentBlockSubset", () => {
  it("returns ready blocks without waiting for the full requested set", () => {
    const ready = currentBlock();
    const stale = currentBlock({
      x: 2,
      tiles: Array.from({ length: 256 }, () => ({ version: "0.0.0001" })),
    });

    expect(currentBlockSubset([ready, stale])).toEqual([ready]);
    expect(currentBlockSubset(undefined)).toEqual([]);
  });

  it("deduplicates coordinates and keeps the newest stored revision", () => {
    const old = currentBlock({ mapGeneratedAt: 1 });
    const newest = currentBlock({ mapGeneratedAt: 2 });
    const east = currentBlock({ x: 2, mapGeneratedAt: 1 });

    const current = currentBlockSubset([old, newest, east]);
    expect(current).toEqual([newest, east]);
    expect(hasEveryRequestedBlock(current, [{ x: 1, y: 2 }, { x: 2, y: 2 }])).toBe(true);
    expect(hasEveryRequestedBlock([old, newest], [{ x: 1, y: 2 }, { x: 2, y: 2 }])).toBe(false);
    expect(completedBlockSet([old, newest], 2)).toBeNull();
  });
});
