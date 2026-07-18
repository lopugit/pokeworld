import { beforeAll, describe, expect, it } from "vitest";
import {
  isCurrentMapBlock,
  MAP_BLOCK_VERSION,
} from "../server/services/map/generate";
import type { MapGenerationStepResult } from "../server/services/map/types";

let result: MapGenerationStepResult;

beforeAll(async () => {
  process.env.POKEWORLD_OFFLINE_MAP = "true";
  const { generateMapBlock } = await import("../server/services/map/generate");
  result = await generateMapBlock({ x: 10, y: 10, regenerate: true });
});

describe("offline map generation", () => {
  it("rejects incomplete and older cached blocks", () => {
    expect(isCurrentMapBlock({ tiles: [] })).toBe(false);
    expect(
      isCurrentMapBlock({
        tiles: Array.from({ length: 256 }, () => ({ version: "old" })),
      }),
    ).toBe(false);
    expect(
      isCurrentMapBlock({
        tiles: Array.from({ length: 256 }, () => ({ version: MAP_BLOCK_VERSION })),
      }),
    ).toBe(true);
  });

  it("runs the production sprite pipeline without MongoDB or Google Maps", () => {
    expect(result.requested).toEqual({ x: 10, y: 10 });
    expect(result.inlineBlock?.tiles).toHaveLength(256);
    expect(result.inlineBlock?.mapSource).toBe("fallback");
    expect(result.inlineBlock?.fallbackGenerated).toBe(true);
    expect(result.inlineBlock?.tiles.every((tile) => Boolean(tile.img))).toBe(true);
    expect(result.inlineBlock?.terrainSummary).toMatchObject({ grass: 256 });
    expect(new Set(result.inlineBlock?.tiles.map((tile) => tile.feature)).size).toBeGreaterThan(1);
  });
});
