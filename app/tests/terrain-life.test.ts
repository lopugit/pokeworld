import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MapTile } from "../server/services/map/types";
import terrainLife, {
  getAutotileIndex,
  getWaterTileName,
  hashUnit,
} from "../server/services/map/legacy/mods/terrain-life";

const CARDINAL_CASES = [
  [{ north: false, east: true, south: true, west: false }, 1],
  [{ north: false, east: true, south: true, west: true }, 2],
  [{ north: false, east: false, south: true, west: true }, 3],
  [{ north: true, east: true, south: true, west: false }, 4],
  [{ north: true, east: true, south: true, west: true }, 5],
  [{ north: true, east: false, south: true, west: true }, 6],
  [{ north: true, east: true, south: false, west: false }, 7],
  [{ north: true, east: true, south: false, west: true }, 8],
  [{ north: true, east: false, south: false, west: true }, 9],
] as const;

function makeState() {
  const cache: Record<string, Record<string, unknown>> = {};
  const tiles: MapTile[] = [];
  for (let x = 0; x < 16; x += 1) {
    for (let sourceY = 0; sourceY < 16; sourceY += 1) {
      let terrain: MapTile["terrain"] = "grass";
      if (x >= 1 && x <= 4 && sourceY >= 1 && sourceY <= 4) terrain = "water";
      else if (x === 6) terrain = "road";
      else if (x >= 9 && x <= 12 && sourceY >= 1 && sourceY <= 4) terrain = "building";
      else if (x >= 8 && sourceY >= 7) terrain = "natural";
      const tile = {
        uuid: `${x}-${sourceY}`,
        blockX: 0,
        blockY: 0,
        mapX: x * 32,
        mapY: (15 - sourceY) * 32,
        x,
        y: 15 - sourceY,
        terrain,
      };
      cache[`${tile.mapX},${tile.mapY}`] = tile;
      tiles.push(tile);
    }
  }
  return {
    block: { x: 0, y: 0, tiles },
    state: { version: "test", tiles: { cache } },
  };
}

describe("terrain sprite stitching", () => {
  it.each(CARDINAL_CASES)("maps cardinal shore %# to tile %i", (neighbours, expected) => {
    expect(getAutotileIndex(neighbours)).toBe(expected);
  });

  it("uses existing inner-corner water variants", () => {
    expect(
      getWaterTileName({
        north: true,
        east: true,
        south: true,
        west: true,
        northWest: false,
        northEast: true,
        southWest: true,
        southEast: true,
      }),
    ).toBe("pond-20");
  });

  it("uses deterministic ripple tiles for open water", () => {
    const surrounded = {
      north: true,
      east: true,
      south: true,
      west: true,
      northWest: true,
      northEast: true,
      southWest: true,
      southEast: true,
    };
    expect(getWaterTileName(surrounded, 32, 64)).toMatch(/^pond-center-[1-4]$/);
    expect(getWaterTileName(surrounded, 32, 64)).toBe(
      getWaterTileName(surrounded, 32, 64),
    );
  });

  it("is deterministic across regenerations", () => {
    expect(hashUnit(144, -288, "life")).toBe(hashUnit(144, -288, "life"));
    expect(hashUnit(144, -288, "life")).not.toBe(hashUnit(145, -288, "life"));
  });

  it("stitches water, roads, a complete house, and only real assets", () => {
    const { state, block } = makeState();
    terrainLife.run(state, block);

    const water = block.tiles.filter((tile) => tile.terrain === "water");
    expect(new Set(water.map((tile) => tile.img)).size).toBeGreaterThanOrEqual(9);
    expect(
      water.every((tile) =>
        /^pond-(?:[1-9]|2[0-5]|center-[1-4])$/.test(String(tile.img)),
      ),
    ).toBe(true);

    const houses = block.tiles.filter((tile) => tile.feature === "house");
    expect(houses).toHaveLength(12);
    expect(new Set(houses.map((tile) => tile.img2))).toEqual(
      new Set(Array.from({ length: 12 }, (_, index) => `house-red-${index + 1}`)),
    );

    for (const tile of block.tiles) {
      for (const sprite of [tile.img, tile.img2]) {
        expect(existsSync(new URL(`../public/tiles/${sprite}.png`, import.meta.url))).toBe(true);
      }
    }
  });
});
