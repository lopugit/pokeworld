import { describe, expect, it } from "vitest";
import { prioritizeMapPreloadOffsets } from "../src/lib/map-load";

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
