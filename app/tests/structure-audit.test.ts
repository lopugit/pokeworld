import { describe, expect, it } from "vitest";
import terrainLife, {
  hashUnit as serverHashUnit,
  MIN_SITE_CELLS as SERVER_MIN_SITE_CELLS,
  SITE_WINDOW as SERVER_SITE_WINDOW,
} from "../server/services/map/legacy/mods/terrain-life";
import {
  analyzeStructureWorld,
  hashUnit as scriptHashUnit,
  MIN_SITE_CELLS as SCRIPT_MIN_SITE_CELLS,
  predictStructureSites,
  SITE_WINDOW as SCRIPT_SITE_WINDOW,
} from "../scripts/map/audit-structure-duplicates.mjs";
import type { MapTile } from "../server/services/map/types";

// The audit script re-implements the structure-site rule so it can run
// dependency-free against any deployment. These tests pin the script to the
// server implementation: if terrain-life's rule drifts, they fail.

function makeWorldState(blockCoordinates: Array<{ x: number; y: number }>) {
  const cache: Record<string, Record<string, unknown>> = {};
  const blocks = blockCoordinates.map(({ x: blockX, y: blockY }) => {
    const tiles: Array<MapTile & { houseSite?: string; houseKind?: string }> = [];
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
          terrain: "grass" as MapTile["terrain"],
        };
        cache[`${tile.mapX},${tile.mapY}`] = tile;
        tiles.push(tile);
      }
    }
    return { x: blockX, y: blockY, updated: 1, tiles };
  });
  return { blocks, state: { version: "audit-test", tiles: { cache } } };
}

function paintBuilding(
  state: { tiles: { cache: Record<string, Record<string, unknown>> } },
  fromGridX: number,
  toGridX: number,
  fromGridY: number,
  toGridY: number,
) {
  for (const tile of Object.values(state.tiles.cache) as MapTile[]) {
    const gridX = tile.mapX / 32;
    const gridY = tile.mapY / 32;
    if (gridX >= fromGridX && gridX <= toGridX && gridY >= fromGridY && gridY <= toGridY) {
      tile.terrain = "building";
    }
  }
}

describe("audit script parity with terrain-life", () => {
  it("shares the seeded hash byte-for-byte", () => {
    for (let x = -40; x <= 40; x += 7) {
      for (let y = -40; y <= 40; y += 9) {
        expect(scriptHashUnit(x, y, "structure-site")).toBe(serverHashUnit(x, y, "structure-site"));
        expect(scriptHashUnit(x, y)).toBe(serverHashUnit(x, y));
      }
    }
  });

  it("shares the site rule constants", () => {
    expect(SCRIPT_SITE_WINDOW).toBe(SERVER_SITE_WINDOW);
    expect(SCRIPT_MIN_SITE_CELLS).toBe(SERVER_MIN_SITE_CELLS);
  });

  it("predicts exactly the sites a converged generation paints", () => {
    const { blocks, state } = makeWorldState([
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 6 },
      { x: 4, y: 6 },
    ]);
    // Seam-spanning buildings clear of every 4x4 central landing:
    paintBuilding(state, 3 * 16 + 12, 4 * 16 + 3, 5 * 16 + 1, 5 * 16 + 5); // across x seam
    paintBuilding(state, 3 * 16 + 1, 3 * 16 + 4, 5 * 16 + 12, 6 * 16 + 2); // across y seam
    paintBuilding(state, 4 * 16 + 11, 4 * 16 + 14, 6 * 16 + 10, 6 * 16 + 13); // interior
    const mask = new Set<string>();
    for (const tile of Object.values(state.tiles.cache) as MapTile[]) {
      if (tile.terrain === "building") mask.add(`${tile.mapX / 32},${tile.mapY / 32}`);
    }

    for (const block of blocks) terrainLife.run(state, block);

    const painted = new Set<string>();
    for (const block of blocks) {
      for (const tile of block.tiles) {
        if (tile.feature === "house" && tile.houseSite) painted.add(String(tile.houseSite));
      }
    }
    expect(painted).toEqual(predictStructureSites(mask));
    expect(painted.size).toBe(3);

    // And the analyzer agrees the converged world is clean.
    const report = analyzeStructureWorld(blocks);
    expect(report.violations).toEqual([]);
    expect(report.judgedComponents).toBe(3);
  });
});

// ---------------------------------------------------------------------------

interface FakeTile {
  blockX: number;
  blockY: number;
  mapX: number;
  mapY: number;
  terrain?: string;
  feature?: string;
  houseSite?: string;
  houseKind?: string;
  version?: string;
}

function fakeBlock(x: number, y: number): { x: number; y: number; updated: number; tiles: FakeTile[] } {
  const tiles: FakeTile[] = [];
  for (let tx = 0; tx < 16; tx += 1) {
    for (let ty = 0; ty < 16; ty += 1) {
      tiles.push({
        blockX: x,
        blockY: y,
        mapX: x * 512 + tx * 32,
        mapY: y * 512 + ty * 32,
        terrain: "grass",
        feature: "short-grass-pocket",
        version: "test",
      });
    }
  }
  return { x, y, updated: 1, tiles };
}

function tileAt(blocks: Array<ReturnType<typeof fakeBlock>>, gridX: number, gridY: number): FakeTile {
  const block = blocks.find(
    (candidate) => candidate.x === Math.floor(gridX / 16) && candidate.y === Math.floor(gridY / 16),
  );
  if (!block) throw new Error(`no block for ${gridX},${gridY}`);
  const tile = block.tiles.find((candidate) => candidate.mapX === gridX * 32 && candidate.mapY === gridY * 32);
  if (!tile) throw new Error(`no tile for ${gridX},${gridY}`);
  return tile;
}

function paintFakeHouse(
  blocks: Array<ReturnType<typeof fakeBlock>>,
  leftGridX: number,
  topGridY: number,
  site: string,
  kind = "house-red",
) {
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      const tile = tileAt(blocks, leftGridX + column, topGridY - row);
      tile.feature = "house";
      tile.houseSite = site;
      tile.houseKind = kind;
    }
  }
}

describe("analyzeStructureWorld violation classes", () => {
  it("flags two structures on one building inside the site window as seam duplicates", () => {
    // 3x3 fetched area so the centre component is fully judged.
    const blocks = [];
    for (let x = 9; x <= 11; x += 1) for (let y = 9; y <= 11; y += 1) blocks.push(fakeBlock(x, y));
    // One building straddling the vertical seam between blocks (10,10)/(11,10).
    for (let gridX = 10 * 16 + 11; gridX <= 11 * 16 + 4; gridX += 1) {
      for (let gridY = 10 * 16 + 1; gridY <= 10 * 16 + 4; gridY += 1) {
        tileAt(blocks, gridX, gridY).terrain = "building";
      }
    }
    // Each side painted its own structure (the production 2.8 defect).
    paintFakeHouse(blocks, 10 * 16 + 11, 10 * 16 + 4, `${10 * 16 + 12},${10 * 16 + 2}`);
    paintFakeHouse(blocks, 11 * 16 + 1, 10 * 16 + 4, `${11 * 16 + 2},${10 * 16 + 3}`);

    const report = analyzeStructureWorld(blocks);
    const seamDuplicates = report.violations.filter((violation) => violation.type === "seam-duplicate");
    expect(seamDuplicates).toHaveLength(1);
    expect(seamDuplicates[0].distance).toBeLessThanOrEqual(SCRIPT_SITE_WINDOW);
    expect(report.violations.some((violation) => violation.type === "stale-stitch")).toBe(true);
  });

  it("flags a site painted by more than one block", () => {
    const blocks = [];
    for (let x = 9; x <= 11; x += 1) for (let y = 9; y <= 11; y += 1) blocks.push(fakeBlock(x, y));
    for (let gridX = 10 * 16 + 2; gridX <= 10 * 16 + 6; gridX += 1) {
      for (let gridY = 10 * 16 + 1; gridY <= 10 * 16 + 4; gridY += 1) {
        tileAt(blocks, gridX, gridY).terrain = "building";
      }
    }
    const site = `${10 * 16 + 3},${10 * 16 + 2}`;
    paintFakeHouse(blocks, 10 * 16 + 2, 10 * 16 + 4, site);
    // A second copy of the same site painted into the neighbouring block.
    const clone = tileAt(blocks, 11 * 16 + 1, 10 * 16 + 2);
    clone.feature = "house";
    clone.houseSite = site;
    clone.houseKind = "house-red";

    const report = analyzeStructureWorld(blocks);
    expect(report.violations.some((violation) => violation.type === "double-painted-site")).toBe(true);
  });

  it("flags a cut-off building (fewer tiles than its family footprint)", () => {
    const blocks = [];
    for (let x = 9; x <= 11; x += 1) for (let y = 9; y <= 11; y += 1) blocks.push(fakeBlock(x, y));
    for (let gridX = 10 * 16 + 2; gridX <= 10 * 16 + 6; gridX += 1) {
      for (let gridY = 10 * 16 + 1; gridY <= 10 * 16 + 4; gridY += 1) {
        tileAt(blocks, gridX, gridY).terrain = "building";
      }
    }
    const site = `${10 * 16 + 3},${10 * 16 + 2}`;
    paintFakeHouse(blocks, 10 * 16 + 2, 10 * 16 + 4, site);
    // Overwrite two of the house's tiles, as a stale mixed-version world does.
    for (const gridX of [10 * 16 + 2, 10 * 16 + 3]) {
      const tile = tileAt(blocks, gridX, 10 * 16 + 4);
      tile.feature = "short-grass-pocket";
      delete tile.houseSite;
      delete tile.houseKind;
    }

    const report = analyzeStructureWorld(blocks);
    const partial = report.violations.filter((violation) => violation.type === "partial-structure");
    expect(partial).toHaveLength(1);
    expect(partial[0].tiles).toBe(10);
    expect(partial[0].expectedTiles).toBe(12);
  });

  it("never judges components that touch unfetched blocks", () => {
    const blocks = [fakeBlock(20, 20)];
    // Building hugging the west edge — it may continue into block (19,20).
    for (let gridX = 20 * 16; gridX <= 20 * 16 + 3; gridX += 1) {
      for (let gridY = 20 * 16 + 1; gridY <= 20 * 16 + 4; gridY += 1) {
        tileAt(blocks, gridX, gridY).terrain = "building";
      }
    }
    paintFakeHouse(blocks, 20 * 16, 20 * 16 + 4, `${20 * 16 + 1},${20 * 16 + 2}`);
    paintFakeHouse(blocks, 20 * 16 + 1, 20 * 16 + 4, `${20 * 16 + 2},${20 * 16 + 3}`);

    const report = analyzeStructureWorld(blocks);
    expect(report.boundaryComponents).toBe(1);
    expect(report.judgedComponents).toBe(0);
    // Component-level judgments (seam duplicates, stale stitches) are
    // suppressed for boundary components. Structure-level checks still run:
    // the two overlapping fakes leave the first house short of tiles, which
    // the partial-structure (cut-off building) check correctly reports.
    const componentJudged = report.violations.filter(
      (violation) => violation.type === "seam-duplicate" || violation.type === "stale-stitch",
    );
    expect(componentJudged).toEqual([]);
    expect(report.violations.every((violation) => violation.type === "partial-structure")).toBe(true);
  });
});
