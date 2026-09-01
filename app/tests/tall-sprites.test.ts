import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isTallTileArt, sortTallEntities } from "../src/lib/tall-sprites";

const pngSize = (file: string) => {
  const buffer = readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

describe("isTallTileArt", () => {
  it("accepts 1x2 tile art and rejects square or unloaded art", () => {
    expect(isTallTileArt(16, 32)).toBe(true);
    expect(isTallTileArt(16, 16)).toBe(false);
    expect(isTallTileArt(32, 32)).toBe(false);
    // Unloaded images report 0x0 natural size — never tall.
    expect(isTallTileArt(0, 0)).toBe(false);
  });

  it("matches the shipped tree-tall-1 art", () => {
    const { width, height } = pngSize(resolve(__dirname, "../public/tiles/tree-tall-1.png"));
    expect(width).toBe(16);
    expect(height).toBe(32);
    expect(isTallTileArt(width, height)).toBe(true);
  });

  it("keeps every classic tile square (nothing else goes tall by accident)", () => {
    for (const name of ["tree-1", "grass", "route-sign-1", "struct-pokecenter-1", "house-red-1"]) {
      const { width, height } = pngSize(resolve(__dirname, `../public/tiles/${name}.png`));
      expect(isTallTileArt(width, height), name).toBe(false);
    }
  });
});

describe("sortTallEntities", () => {
  it("paints north (higher mapY) before south so southern canopies overlap", () => {
    const sorted = sortTallEntities([
      { mapY: 0, id: "south" },
      { mapY: 64, id: "north" },
      { mapY: 32, id: "middle" },
    ]);
    expect(sorted.map((entity) => entity.id)).toEqual(["north", "middle", "south"]);
  });

  it("paints the player after tall art on the same row", () => {
    const sorted = sortTallEntities([
      { mapY: 32, isPlayer: true, id: "player" },
      { mapY: 32, id: "tree" },
    ]);
    expect(sorted.map((entity) => entity.id)).toEqual(["tree", "player"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      { mapY: 0, id: "a" },
      { mapY: 32, id: "b" },
    ];
    sortTallEntities(input);
    expect(input.map((entity) => entity.id)).toEqual(["a", "b"]);
  });
});
