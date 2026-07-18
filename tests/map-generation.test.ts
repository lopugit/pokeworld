import { beforeAll, describe, expect, it } from "vitest";
import type { MapGenerationStepResult } from "../server/services/map/types";

let result: MapGenerationStepResult;

beforeAll(async () => {
  process.env.POKEWORLD_OFFLINE_MAP = "true";
  const { generateMapBlock } = await import("../server/services/map/generate");
  result = await generateMapBlock({ x: 10, y: 10, regenerate: true });
});

describe("offline map generation", () => {
  it("runs the production sprite pipeline without MongoDB or Google Maps", () => {
    expect(result.requested).toEqual({ x: 10, y: 10 });
    expect(result.inlineBlock?.tiles).toHaveLength(256);
    expect(result.inlineBlock?.mapSource).toBe("fallback");
    expect(result.inlineBlock?.fallbackGenerated).toBe(true);
    expect(result.inlineBlock?.tiles.every((tile) => Boolean(tile.img))).toBe(true);
  });
});
