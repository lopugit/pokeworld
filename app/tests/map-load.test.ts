import { describe, expect, it } from "vitest";
import {
  blockCoordinatesForWorldPosition,
  blockKeyForWorldPosition,
  prioritizeMapPreloadOffsets,
} from "../src/lib/map-load";

describe("world position block boundaries", () => {
  it("maps positive and negative boundary positions with floor semantics", () => {
    expect(blockCoordinatesForWorldPosition(511, 511, 512)).toEqual({ x: 0, y: 0 });
    expect(blockCoordinatesForWorldPosition(512, 0, 512)).toEqual({ x: 1, y: 0 });
    expect(blockCoordinatesForWorldPosition(-1, -1, 512)).toEqual({ x: -1, y: -1 });
    expect(blockCoordinatesForWorldPosition(-512, -512, 512)).toEqual({ x: -1, y: -1 });
    expect(blockCoordinatesForWorldPosition(-513, 0, 512)).toEqual({ x: -2, y: 0 });
    expect(blockKeyForWorldPosition(0, -32, 512)).toBe("0,-1");
  });

  it("rejects invalid coordinates and block sizes", () => {
    expect(() => blockCoordinatesForWorldPosition(Number.NaN, 0, 512)).toThrow(/finite/);
    expect(() => blockCoordinatesForWorldPosition(0, 0, 0)).toThrow(/positive/);
  });
});

describe("map preload priority", () => {
  it("keeps every neighbour in the initial request and puts visible blocks first", () => {
    const offsets = [
      [1, 1],
      [0, -1],
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, -1],
    ] as const;

    expect(prioritizeMapPreloadOffsets([...offsets])).toEqual([
      [0, 0],
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, -1],
    ]);
  });

  it("does not mutate the caller's offset order", () => {
    const offsets = [[2, 0], [0, 0], [1, 1]] as const;
    const input = [...offsets];

    expect(prioritizeMapPreloadOffsets(input)).toEqual([[0, 0], [1, 1], [2, 0]]);
    expect(input).toEqual(offsets);
  });
});
