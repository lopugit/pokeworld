import { existsSync, readFileSync } from "node:fs";
import { PNG } from "pngjs";
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

function makeUniformState(
  terrain: MapTile["terrain"] = "grass",
  blockX = 0,
  blockY = 0,
) {
  const cache: Record<string, Record<string, unknown>> = {};
  const tiles: MapTile[] = [];
  for (let x = 0; x < 16; x += 1) {
    for (let sourceY = 0; sourceY < 16; sourceY += 1) {
      const tile = {
        uuid: `${blockX}-${blockY}-${x}-${sourceY}`,
        blockX,
        blockY,
        mapX: blockX * 512 + x * 32,
        mapY: blockY * 512 + (15 - sourceY) * 32,
        x,
        y: 15 - sourceY,
        terrain,
      };
      cache[`${tile.mapX},${tile.mapY}`] = tile;
      tiles.push(tile);
    }
  }
  return {
    block: { x: blockX, y: blockY, tiles },
    state: { version: "test", tiles: { cache } },
  };
}

function readEmeraldSheet() {
  return PNG.sync.read(
    readFileSync(
      new URL(
        "../map-assets/tilesets/Game Boy Advance - Pokemon Emerald - Exterior Tileset.png",
        import.meta.url,
      ),
    ),
  );
}

function readTile(name: string) {
  const tile = PNG.sync.read(
    readFileSync(new URL(`../public/tiles/${name}.png`, import.meta.url)),
  );
  expect(tile.width).toBe(16);
  expect(tile.height).toBe(16);
  return tile;
}

// keyable: filler colours the extractor may have turned transparent — those
// pixels must be fully transparent and match a listed source colour exactly.
function expectEmeraldCrop(
  name: string,
  sourceX: number,
  sourceY: number,
  keyable: Array<readonly [number, number, number]> = [],
) {
  const source = readEmeraldSheet();
  const tile = readTile(name);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const sourceOffset = ((sourceY + y) * source.width + sourceX + x) * 4;
      const tileOffset = (y * tile.width + x) * 4;
      const sourcePixel = source.data.subarray(sourceOffset, sourceOffset + 4);
      const tilePixel = tile.data.subarray(tileOffset, tileOffset + 4);
      const keyed =
        tilePixel[3] === 0 &&
        keyable.some(
          ([r, g, b]) => sourcePixel[0] === r && sourcePixel[1] === g && sourcePixel[2] === b,
        );
      if (keyed) continue;
      expect(tilePixel, `${name} pixel ${x},${y}`).toEqual(sourcePixel);
    }
  }
}

const expectExactEmeraldCrop = (name: string, sourceX: number, sourceY: number) =>
  expectEmeraldCrop(name, sourceX, sourceY);

// Composed families reuse another family's tiles per a column/row plan.
function expectComposedFamily(
  prefix: string,
  sourcePrefix: string,
  sourceColumns: number,
  columnPlan: number[],
  rowPlan: number[],
) {
  rowPlan.forEach((sourceRow, row) => {
    columnPlan.forEach((sourceColumn, column) => {
      const tile = readTile(`${prefix}-${row * columnPlan.length + column + 1}`);
      const sourceTile = readTile(`${sourcePrefix}-${sourceRow * sourceColumns + sourceColumn + 1}`);
      expect(tile.data.equals(sourceTile.data), `${prefix} cell ${column},${row}`).toBe(true);
    });
  });
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

  it("never emits the unusable SW/SE corner art (pond-22/23 are bank bars)", () => {
    const surroundedWithNotch = (southWest: boolean, southEast: boolean) => ({
      north: true,
      east: true,
      south: true,
      west: true,
      northWest: true,
      northEast: true,
      southWest,
      southEast,
    });
    expect(getWaterTileName(surroundedWithNotch(false, true), 5, 7)).toMatch(/^pond-center-/);
    expect(getWaterTileName(surroundedWithNotch(true, false), 5, 7)).toMatch(/^pond-center-/);
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

  it("erodes water into shapes whose shoreline circuits always close", () => {
    const { state, block } = makeUniformState("grass", 3, 5);
    const paint = (x: number, sourceY: number) => {
      const tile = block.tiles.find((candidate) => candidate.x === x && candidate.y === 15 - sourceY);
      if (tile) tile.terrain = "water";
    };
    // A healthy pond, a 1-wide channel, a plus shape, a lone tile, and two
    // ponds kissing corner-to-corner — only representable water may survive.
    for (let x = 1; x <= 4; x += 1) for (let y = 10; y <= 13; y += 1) paint(x, y);
    for (let y = 2; y <= 8; y += 1) paint(7, y);
    paint(11, 3); paint(10, 4); paint(11, 4); paint(12, 4); paint(11, 5);
    paint(14, 8);
    for (let x = 9; x <= 10; x += 1) for (let y = 10; y <= 11; y += 1) paint(x, y);
    for (let x = 11; x <= 12; x += 1) for (let y = 12; y <= 13; y += 1) paint(x, y);
    terrainLife.run(state, block);

    const waterAt = new Map(
      block.tiles.map((tile) => [`${tile.x},${15 - tile.y}`, tile.terrain === "water"]),
    );
    const isWater = (x: number, y: number) => waterAt.get(`${x},${y}`) ?? true;
    const survivors = block.tiles.filter((tile) => tile.terrain === "water");
    expect(survivors.length).toBeGreaterThan(0);
    for (const tile of survivors) {
      const x = tile.x;
      const y = 15 - tile.y;
      const north = isWater(x, y - 1);
      const south = isWater(x, y + 1);
      const east = isWater(x + 1, y);
      const west = isWater(x - 1, y);
      const corners = [
        [1, 1], [1, -1], [-1, 1], [-1, -1],
      ].some(([dx, dy]) => isWater(x + dx, y) && isWater(x, y + dy) && isWater(x + dx, y + dy));
      expect(corners).toBe(true);
      if (north && south && east && west) {
        const landDiagonals = [
          isWater(x - 1, y - 1), isWater(x + 1, y - 1), isWater(x - 1, y + 1), isWater(x + 1, y + 1),
        ].filter((value) => !value).length;
        expect(landDiagonals).toBeLessThanOrEqual(1);
      }
      const kissing =
        (!north && !east && isWater(x + 1, y - 1)) ||
        (!north && !west && isWater(x - 1, y - 1)) ||
        (!south && !east && isWater(x + 1, y + 1)) ||
        (!south && !west && isWater(x - 1, y + 1));
      expect(kissing).toBe(false);
    }
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

  it("places exactly one structure per detected building, scaled to its footprint", () => {
    const paintBuilding = (
      block: ReturnType<typeof makeUniformState>["block"],
      fromX: number,
      toX: number,
      fromSourceY: number,
      toSourceY: number,
    ) => {
      for (const tile of block.tiles) {
        const sourceY = 15 - tile.y;
        if (tile.x >= fromX && tile.x <= toX && sourceY >= fromSourceY && sourceY <= toSourceY) {
          tile.terrain = "building";
        }
      }
    };
    const structuresOf = (block: ReturnType<typeof makeUniformState>["block"]) => {
      const byId = new Map<number, { kinds: Set<string>; tiles: number }>();
      for (const tile of block.tiles as Array<MapTile & { houseId?: number; houseKind?: string }>) {
        if (tile.feature !== "house") continue;
        const entry = byId.get(tile.houseId!) ?? { kinds: new Set(), tiles: 0 };
        entry.kinds.add(String(tile.houseKind ?? String(tile.img2).replace(/-\d+$/, "")));
        entry.tiles += 1;
        byId.set(tile.houseId!, entry);
      }
      return [...byId.values()].map((entry) => {
        expect(entry.kinds.size).toBe(1);
        return { kind: [...entry.kinds][0], tiles: entry.tiles };
      });
    };

    // A former 2-house footprint (25 tiles) now yields ONE mid-tier shop.
    const medium = makeUniformState("grass", 4, 9);
    paintBuilding(medium.block, 1, 5, 1, 5);
    terrainLife.run(medium.state, medium.block);
    const mediumStructures = structuresOf(medium.block);
    expect(mediumStructures).toHaveLength(1);
    expect(["mart-blue", "center-red"]).toContain(mediumStructures[0].kind);
    expect(mediumStructures[0].tiles).toBe(12);

    // A wide 36-tile footprint prefers the wide brick block (4×3).
    const wide = makeUniformState("grass", 5, 9);
    paintBuilding(wide.block, 3, 11, 11, 14);
    terrainLife.run(wide.state, wide.block);
    const wideStructures = structuresOf(wide.block);
    expect(wideStructures).toHaveLength(1);
    expect(wideStructures[0]).toEqual({ kind: "brick-flat", tiles: 12 });

    // A tall 36-tile footprint prefers the tall stone museum (3×5).
    const tall = makeUniformState("grass", 6, 9);
    paintBuilding(tall.block, 12, 15, 1, 9);
    terrainLife.run(tall.state, tall.block);
    const tallStructures = structuresOf(tall.block);
    expect(tallStructures).toHaveLength(1);
    expect(tallStructures[0]).toEqual({ kind: "museum-stone", tiles: 15 });

    // A former 3-house mega-footprint (96 tiles) now yields ONE grand hall.
    const grand = makeUniformState("grass", 7, 9);
    paintBuilding(grand.block, 0, 15, 0, 5);
    terrainLife.run(grand.state, grand.block);
    const grandStructures = structuresOf(grand.block);
    expect(grandStructures).toHaveLength(1);
    expect(grandStructures[0]).toEqual({ kind: "grand-stone", tiles: 30 });
  });

  it("fills open ground with deterministic structures while protecting the spawn landing", () => {
    const first = makeUniformState("grass", 11, -7);
    const second = makeUniformState("grass", 11, -7);
    terrainLife.run(first.state, first.block);
    terrainLife.run(second.state, second.block);

    const firstBlock = first.block as typeof first.block & {
      worldProfile: { recipeCount: number };
      featureSummary: Record<string, number>;
    };
    const secondBlock = second.block as typeof second.block & {
      worldProfile: { recipeCount: number };
      featureSummary: Record<string, number>;
    };

    expect(firstBlock.worldProfile.recipeCount).toBe(864);
    expect(firstBlock.worldProfile).toEqual(secondBlock.worldProfile);
    expect(firstBlock.featureSummary).toEqual(secondBlock.featureSummary);
    expect(
      first.block.tiles.map((tile) => [tile.feature, tile.img, tile.img2, tile.solid]),
    ).toEqual(
      second.block.tiles.map((tile) => [tile.feature, tile.img, tile.img2, tile.solid]),
    );

    const decorated = first.block.tiles.filter(
      (tile) => !["short-grass-pocket", "grass"].includes(String(tile.feature)),
    );
    expect(decorated.length).toBeGreaterThanOrEqual(160);
    expect(
      first.block.tiles
        .filter((tile) => tile.x >= 6 && tile.x <= 9 && tile.y >= 6 && tile.y <= 9)
        .every((tile) => tile.solid !== true),
    ).toBe(true);
  });

  it("creates invisible hidden items inside authored clearings and tree paths", () => {
    let generated:
      | ReturnType<typeof makeUniformState>
      | undefined;
    for (let blockX = -32; blockX <= 32 && !generated; blockX += 1) {
      const candidate = makeUniformState("grass", blockX, 19);
      terrainLife.run(candidate.state, candidate.block);
      if (candidate.block.tiles.some((tile) => tile.feature === "hidden-item")) {
        generated = candidate;
      }
    }
    expect(generated).toBeDefined();
    const hidden = generated!.block.tiles.find((tile) => tile.feature === "hidden-item");
    expect(hidden?.hiddenItem).toBe("pokeball");
    expect(hidden?.img2).toBe("grass");
    expect(hidden?.solid).toBe(false);
    expect(
      generated!.block.tiles.some((tile) =>
        String(tile.feature).match(/(?:secret-trail|secret-clearing|grove-path|orchard-path)/),
      ),
    ).toBe(true);
  });

  it("ships only exact crops from the local Emerald exterior tileset", () => {
    expectExactEmeraldCrop("route-sign-1", 48, 0);
    expectExactEmeraldCrop("cave-1", 96, 304);
    expectExactEmeraldCrop("cave-2", 112, 304);
    expectExactEmeraldCrop("cave-3", 96, 320);
    expectExactEmeraldCrop("cave-4", 112, 320);
    expectExactEmeraldCrop("ledge-left-1", 768, 64);
    expectExactEmeraldCrop("ledge-middle-1", 784, 64);
    expectExactEmeraldCrop("ledge-right-1", 800, 64);
    // rocky-biome vocabulary harvested for the tile-legality port
    expectExactEmeraldCrop("rocky-1", 768, 48);
    expectExactEmeraldCrop("rocky-bumps-1", 848, 64);
    expectExactEmeraldCrop("cave-door-1", 768, 16);
    expectExactEmeraldCrop("boulder-mossy-1", 784, 48);
    expectExactEmeraldCrop("sign-rocky-1", 864, 32);
  });

  it("ships exact (or background-keyed) crops for every building family", () => {
    const MART_FILLER = [[24, 40, 80]] as const;
    const PARAPET_FILLER = [[64, 72, 104]] as const;
    for (let index = 0; index < 12; index += 1) {
      const column = index % 3;
      const row = Math.floor(index / 3);
      expectEmeraldCrop(`mart-blue-${index + 1}`, column * 16, 80 + row * 16, [...MART_FILLER]);
      expectExactEmeraldCrop(`center-red-${index + 1}`, column * 16, 144 + row * 16);
    }
    for (let index = 0; index < 15; index += 1) {
      expectExactEmeraldCrop(`museum-stone-${index + 1}`, 640 + (index % 3) * 16, 272 + Math.floor(index / 3) * 16);
    }
    for (let index = 0; index < 12; index += 1) {
      expectEmeraldCrop(
        `brick-flat-${index + 1}`,
        1152 + (index % 4) * 16,
        Math.floor(index / 4) * 16,
        [...PARAPET_FILLER],
      );
    }
    // the shallow parapet keying must never strip the facade's navy outline
    const brickWall = readTile("brick-flat-5");
    expect(brickWall.data[3], "wall outline pixel must stay opaque").toBe(255);
    expectComposedFamily("gallery-stone", "museum-stone", 3, [0, 1, 1, 2], [0, 1, 2, 3, 4]);
    expectComposedFamily("grand-stone", "museum-stone", 3, [0, 1, 1, 1, 2], [0, 1, 2, 2, 3, 4]);
  });

  it("stitches mountains and caves on rocky ground with a walkable doorway", () => {
    let found: ReturnType<typeof makeUniformState> | undefined;
    for (let blockX = -48; blockX <= 48 && !found; blockX += 1) {
      const candidate = makeUniformState("natural", blockX, 23);
      terrainLife.run(candidate.state, candidate.block);
      if (candidate.block.tiles.some((tile) => String(tile.img2).startsWith("mountain-"))) {
        found = candidate;
      }
    }
    expect(found).toBeDefined();
    const tiles = found!.block.tiles;
    for (const tile of tiles) {
      const overlay = String(tile.img2 ?? "");
      if (overlay.startsWith("mountain-") || /^cave-[1-4]$/.test(overlay)) {
        expect(tile.img, `${overlay} must sit on rocky ground`).toBe("rocky-1");
      }
      expect(overlay, "mountain-8's unpainted hole must never render").not.toBe("mountain-8");
      expect(String(tile.img), "pond-22/23 are banned").not.toMatch(/^pond-2[23]$/);
    }
    const door = tiles.find((tile) => tile.img2 === "cave-door-1");
    expect(door).toBeDefined();
    expect(door?.feature).toBe("cave-entrance");
    expect(door?.solid).toBe(false);
    // the apron ring is reserved rocky ground, never grass-backed decoration
    expect(tiles.some((tile) => tile.feature === "rocky-ground" && tile.img === "rocky-1")).toBe(true);
  });
});
