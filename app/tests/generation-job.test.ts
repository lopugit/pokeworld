import { describe, expect, it } from "vitest";
import {
  generationOffsetsMissingFromBlocks,
  generationPermitId,
} from "../server/services/map/generation-job";
import type { MapJobInput } from "../server/services/map/types";

const input: MapJobInput = {
  blockX: 10,
  blockY: -4,
  offsets: [[0, 0], [1, 0], [0, 1]],
  regenerate: false,
};

describe("map generation job preparation", () => {
  it("charges only offsets whose current blocks are missing", () => {
    expect(
      generationOffsetsMissingFromBlocks(input, [
        { x: 10, y: -4 },
        { x: 10, y: -3 },
      ]),
    ).toEqual([[1, 0]]);
    expect(generationOffsetsMissingFromBlocks(input, [
      { x: 10, y: -4 },
      { x: 11, y: -4 },
      { x: 10, y: -3 },
    ])).toEqual([]);
  });

  it("treats every explicit local regeneration target as generation work", () => {
    expect(
      generationOffsetsMissingFromBlocks(
        { ...input, regenerate: true },
        [{ x: 10, y: -4 }, { x: 11, y: -4 }, { x: 10, y: -3 }],
      ),
    ).toEqual(input.offsets);
  });

  it("derives retry-stable permit IDs from reservation and coordinates", () => {
    expect(generationPermitId("reservation", 10, -4)).toBe("reservation:10,-4");
  });
});
