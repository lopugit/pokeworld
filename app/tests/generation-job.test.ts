import { describe, expect, it } from "vitest";
import {
  generationOffsetsMissingFromBlocks,
  generationPermitId,
} from "../server/services/map/generation-job";
import { currentBlockSubset } from "../server/services/map/stored-blocks";
import { MAP_BLOCK_VERSION } from "../server/services/map/version";
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

  // The map-generation versioning contract: fetching a block that was stored
  // under an OLDER algorithm version treats it as missing, so the workflow
  // regenerates it in place with the current algorithm.
  it("force-regenerates blocks stored under an older algorithm version on fetch", () => {
    const storedBlock = (x: number, y: number, version: string) => ({
      x,
      y,
      updated: 1,
      tiles: Array.from({ length: 256 }, () => ({ version })),
    });
    const cached = [
      storedBlock(10, -4, MAP_BLOCK_VERSION),
      storedBlock(11, -4, "2.7.0000-z19s2w512"),
      storedBlock(10, -3, MAP_BLOCK_VERSION),
    ];

    const current = currentBlockSubset(cached);
    expect(current.map(({ x, y }) => `${x},${y}`).sort()).toEqual(["10,-3", "10,-4"]);
    expect(generationOffsetsMissingFromBlocks(input, current)).toEqual([[1, 0]]);
  });
});
