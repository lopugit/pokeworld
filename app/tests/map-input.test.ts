import { describe, expect, it } from "vitest";
import { blockForCoordinates } from "../server/services/map/coordinates";
import { coordinatesForInput, parseMapJobInput } from "../server/services/map/input";

describe("map job input", () => {
  it("normalizes strings, removes duplicate offsets, and preserves regeneration", () => {
    const input = parseMapJobInput({
      blockX: "10",
      blockY: 20,
      offsets: [[0, 0], [1, -1], [0, 0]],
      regenerate: "true",
    });

    expect(input).toEqual({
      blockX: 10,
      blockY: 20,
      offsets: [[0, 0], [1, -1]],
      regenerate: true,
    });
    expect(coordinatesForInput(input)).toEqual([
      { x: 10, y: 20 },
      { x: 11, y: 19 },
    ]);
  });

  it("rejects unbounded or malformed work", () => {
    expect(() => parseMapJobInput({ blockX: 0, blockY: 0, offsets: [] })).toThrow(
      "At least one map offset",
    );
    expect(() =>
      parseMapJobInput({ blockX: 0, blockY: 0, offsets: [[9, 0]] }),
    ).toThrow("within 8 blocks");
  });
});

describe("constant-time coordinate lookup", () => {
  it("maps Melbourne coordinates to stable finite block indexes", () => {
    const block = blockForCoordinates(-37.87569351417865, 145.00569971273293);
    expect(block).toEqual({ x: 946647, y: 488524 });
  });

  it("clamps coordinates at the supported world boundary", () => {
    expect(blockForCoordinates(-100, -200)).toEqual({ x: 0, y: 0 });
    const upper = blockForCoordinates(100, 200);
    expect(upper.x).toBeGreaterThan(0);
    expect(upper.y).toBeGreaterThan(0);
  });
});
