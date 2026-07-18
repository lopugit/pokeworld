import { describe, expect, it } from "vitest";
import { prioritizeInitialMapOffsets } from "../src/lib/map-load";

describe("progressive map loading", () => {
  const offsets = [
    [1, 0],
    [0, 0],
    [-1, 0],
  ] as const;

  it("loads the player block first while the game is empty", () => {
    expect(prioritizeInitialMapOffsets([...offsets], false)).toEqual([[0, 0]]);
  });

  it("loads neighboring offsets in small progressive batches", () => {
    expect(prioritizeInitialMapOffsets([...offsets], true, 2)).toEqual([
      [1, 0],
      [0, 0],
    ]);
    expect(
      prioritizeInitialMapOffsets(
        [
          ...offsets.filter(([x, y]) => x !== 0 || y !== 0),
          [0, 1],
        ],
        false,
        2,
      ),
    ).toEqual([
      [1, 0],
      [-1, 0],
    ]);
  });
});
