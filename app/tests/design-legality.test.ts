// Tile-legality verification for every generated design: decorations may only
// stand on the ground family their art was drawn for, water shorelines must
// satisfy the live generator's smoothing invariants (closed pond circuits),
// and structures may never be half-embedded. This is what keeps the design
// browser looking like real Emerald maps.

import { describe, expect, it } from "vitest";
import { DESIGN_GRID, designCatalog, generateDesign } from "../src/lib/design";
import type { DesignTile } from "../src/lib/design/types";

type Grid = DesignTile[][];

const baseOf = (tile: DesignTile) => tile.img ?? "";
const isWater = (grid: Grid, col: number, row: number) => {
  if (col < 0 || row < 0 || col >= DESIGN_GRID || row >= DESIGN_GRID) return true; // OOB = water, like the live map
  return baseOf(grid[row][col]).startsWith("pond");
};

// img2 prefix → ground bases its art is legal on.
const DECOR_LEGALITY: Array<[RegExp, (base: string) => boolean]> = [
  [/^(big-tree-|tree-|shrub-|flower-|grass-2$|house-red-|mart-blue-|center-red-|brick-flat-|museum-stone-|gallery-stone-|grand-stone-|route-sign-1$)/, (base) => base === "grass"],
  [/^(mountain-|cave-door-|ledge-|rock-1$|boulder-mossy-|rocky-bumps-|sign-rocky-)/, (base) => base === "rocky-1"],
  // hidden items copy their ground tile
  [/^grass$/, (base) => base === "grass"],
  [/^rocky-1$/, (base) => base === "rocky-1"],
];

const FORBIDDEN_IMG2 = /^(cave-[1-4]$|grass-dirt-)/;

describe("design tile legality (all 500 designs)", () => {
  const catalog = designCatalog();

  it("every decoration stands on the ground family its art was drawn for", () => {
    for (const summary of catalog) {
      const design = generateDesign(summary.family, summary.seed)!;
      for (let row = 0; row < DESIGN_GRID; row += 1) {
        for (let col = 0; col < DESIGN_GRID; col += 1) {
          const tile = design.tiles[row][col];
          if (!tile.img2) continue;
          expect(tile.img2, `${design.id} (${col},${row}) uses forbidden overlay`).not.toMatch(FORBIDDEN_IMG2);
          const rule = DECOR_LEGALITY.find(([pattern]) => pattern.test(tile.img2!));
          if (!rule) continue;
          expect(
            rule[1](baseOf(tile)),
            `${design.id} (${col},${row}): "${tile.img2}" is illegal on "${tile.img}"`,
          ).toBe(true);
        }
      }
    }
  });

  it("water obeys the live generator's shoreline smoothing invariants", () => {
    for (const summary of catalog) {
      const design = generateDesign(summary.family, summary.seed)!;
      const grid = design.tiles;
      for (let row = 0; row < DESIGN_GRID; row += 1) {
        for (let col = 0; col < DESIGN_GRID; col += 1) {
          if (!isWater(grid, col, row) || col < 0) continue;
          if (!baseOf(grid[row][col]).startsWith("pond")) continue;
          const at = (dx: number, dy: number) => isWater(grid, col + dx, row + dy);
          const inWaterSquare = (
            [
              [1, 1],
              [1, -1],
              [-1, 1],
              [-1, -1],
            ] as const
          ).some(([dx, dy]) => at(dx, 0) && at(0, dy) && at(dx, dy));
          expect(inWaterSquare, `${design.id} (${col},${row}): water tile outside any 2×2 square`).toBe(true);
          const kissingCorner =
            (!at(0, -1) && !at(1, 0) && at(1, -1)) ||
            (!at(0, -1) && !at(-1, 0) && at(-1, -1)) ||
            (!at(0, 1) && !at(1, 0) && at(1, 1)) ||
            (!at(0, 1) && !at(-1, 0) && at(-1, 1));
          expect(kissingCorner, `${design.id} (${col},${row}): kissing-corner shoreline`).toBe(false);
          // pond-22/23 art is a bank bar, not a corner nub — never legal
          expect(baseOf(grid[row][col]), `${design.id} (${col},${row}): unusable pond corner art`).not.toMatch(/^pond-2[23]$/);
        }
      }
    }
  });

  it("autotiled ground tiles are never isolated (no floating path/road/sand squares)", () => {
    for (const summary of catalog) {
      const design = generateDesign(summary.family, summary.seed)!;
      for (let row = 0; row < DESIGN_GRID; row += 1) {
        for (let col = 0; col < DESIGN_GRID; col += 1) {
          const match = /^(path|road|sand)-\d+$/.exec(baseOf(design.tiles[row][col]));
          if (!match) continue;
          const prefix = match[1];
          const sameKind = (c: number, r: number) => {
            if (c < 0 || r < 0 || c >= DESIGN_GRID || r >= DESIGN_GRID) return true;
            return baseOf(design.tiles[r][c]).startsWith(`${prefix}-`);
          };
          const connected = sameKind(col, row - 1) || sameKind(col, row + 1) || sameKind(col - 1, row) || sameKind(col + 1, row);
          expect(connected, `${design.id} (${col},${row}): isolated ${prefix} tile`).toBe(true);
        }
      }
    }
  });

  it("multi-tile structures are always complete (no half-embedded houses/domes)", () => {
    for (const summary of catalog) {
      const design = generateDesign(summary.family, summary.seed)!;
      const positions = new Map<string, Array<[number, number]>>();
      for (let row = 0; row < DESIGN_GRID; row += 1) {
        for (let col = 0; col < DESIGN_GRID; col += 1) {
          const img2 = design.tiles[row][col].img2 ?? "";
          const match = /^(house-red|mountain)-(\d+)$/.exec(img2);
          if (match) {
            const key = `${design.id}:${match[1]}`;
            positions.set(key, [...(positions.get(key) ?? []), [Number(match[2]), row * DESIGN_GRID + col]]);
          }
        }
      }
      for (const [key, tiles] of positions) {
        const width = key.includes("house-red") ? 3 : 3;
        const expectedPerStructure = key.includes("house-red") ? 12 : 8; // domes swap slot 8 for the cave door
        expect(
          tiles.length % expectedPerStructure,
          `${key}: incomplete structure footprint (${tiles.length} tiles)`,
        ).toBe(0);
        // every structure's tile indexes form full consecutive footprints
        const counts = new Map<number, number>();
        for (const [index] of tiles) counts.set(index, (counts.get(index) ?? 0) + 1);
        const perIndex = [...counts.values()];
        expect(new Set(perIndex).size, `${key}: ragged structure tile indexes`).toBe(1);
        expect(width).toBeGreaterThan(0);
      }
    }
  });

  it("entities never stand inside solid tiles or water", () => {
    for (const summary of catalog) {
      const design = generateDesign(summary.family, summary.seed)!;
      for (const entity of design.entities) {
        const tile = design.tiles[entity.row][entity.col];
        expect(tile.solid ?? false, `${design.id}: ${entity.label} stands in a solid tile`).toBe(false);
        expect(baseOf(tile).startsWith("pond"), `${design.id}: ${entity.label} stands in water`).toBe(false);
      }
    }
  });

  it("entities never share a tile", () => {
    for (const summary of catalog) {
      const design = generateDesign(summary.family, summary.seed)!;
      const seen = new Set<string>();
      for (const entity of design.entities) {
        const key = `${entity.col},${entity.row}`;
        expect(seen.has(key), `${design.id}: two entities share (${key})`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("village-family scenes reliably include their houses", () => {
    for (const familyId of ["hoenn-village", "lakeside-hamlet", "quiet-retreat", "daycare-garden", "woodcutter-camp"]) {
      let withHouse = 0;
      const total = 100;
      for (let seed = 0; seed < total; seed += 1) {
        const design = generateDesign(familyId, seed)!;
        if (design.tiles.some((row) => row.some((tile) => tile.feature === "house"))) withHouse += 1;
      }
      expect(withHouse / total, `${familyId}: only ${withHouse}/${total} scenes have a house`).toBeGreaterThanOrEqual(0.95);
    }
  });

  it("catalog card names always extend the regenerated design name (dedup suffixes only)", () => {
    for (const summary of catalog) {
      const design = generateDesign(summary.family, summary.seed)!;
      expect(
        summary.name === design.name || summary.name.startsWith(`${design.name} `),
        `${summary.id}: card "${summary.name}" vs regenerated "${design.name}"`,
      ).toBe(true);
    }
  });
});
