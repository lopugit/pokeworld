// Painting toolkit for 16×16 design dioramas. Mirrors the live map
// generator's tile conventions (legacy/mods/terrain-life.ts) so designs read
// exactly like real Pokéworld blocks:
//   - autotile index 1–9 (path-/road-/sand-/pond-) with 5 = centre
//   - pond inner corners 20–23, narrow channels 24/25, pond-center ripples
//   - houses 3×4 (house-red-1..12), mountains 3×3, caves 2×2 (cave-4 = mouth)
// Grids here are screen-order (row 0 = top); the server's "north" neighbour is
// therefore row - 1.

import type { Rng } from "./rng";
import { DESIGN_GRID, type DesignTile } from "./types";

export type Ground = "grass" | "water" | "path" | "road" | "sand" | "dirt";

export type GroundMap = Ground[][];

export const inBounds = (col: number, row: number) =>
  col >= 0 && row >= 0 && col < DESIGN_GRID && row < DESIGN_GRID;

export function newGround(base: Ground = "grass"): GroundMap {
  return Array.from({ length: DESIGN_GRID }, () => Array.from({ length: DESIGN_GRID }, () => base));
}

export function newGrid(): DesignTile[][] {
  return Array.from({ length: DESIGN_GRID }, () =>
    Array.from({ length: DESIGN_GRID }, () => ({}) as DesignTile),
  );
}

// --- ground painting -------------------------------------------------------

export function paintBlob(
  ground: GroundMap,
  kind: Ground,
  centerCol: number,
  centerRow: number,
  radius: number,
  rng: Rng,
): void {
  const wobble = Array.from({ length: 16 }, () => 0.72 + rng.next() * 0.55);
  for (let row = 0; row < DESIGN_GRID; row += 1) {
    for (let col = 0; col < DESIGN_GRID; col += 1) {
      const dx = col - centerCol;
      const dy = row - centerRow;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const sector = ((Math.round((angle / (Math.PI * 2)) * 16) % 16) + 16) % 16;
      if (distance <= radius * wobble[sector]) ground[row][col] = kind;
    }
  }
}

export function paintRect(
  ground: GroundMap,
  kind: Ground,
  col: number,
  row: number,
  width: number,
  height: number,
): void {
  for (let r = row; r < row + height; r += 1) {
    for (let c = col; c < col + width; c += 1) {
      if (inBounds(c, r)) ground[r][c] = kind;
    }
  }
}

/** L-shaped connector between two points, `width` tiles wide (≤3 by design). */
export function paintPath(
  ground: GroundMap,
  kind: Ground,
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  width: number,
  rng: Rng,
): void {
  const horizontalFirst = rng.chance(0.5);
  const stamp = (col: number, row: number) => {
    for (let dr = 0; dr < width; dr += 1) {
      for (let dc = 0; dc < width; dc += 1) {
        if (inBounds(col + dc, row + dr)) ground[row + dr][col + dc] = kind;
      }
    }
  };
  let col = fromCol;
  let row = fromRow;
  stamp(col, row);
  const walkCol = () => {
    while (col !== toCol) {
      col += Math.sign(toCol - col);
      stamp(col, row);
    }
  };
  const walkRow = () => {
    while (row !== toRow) {
      row += Math.sign(toRow - row);
      stamp(col, row);
    }
  };
  if (horizontalFirst) {
    walkCol();
    walkRow();
  } else {
    walkRow();
    walkCol();
  }
}

// --- autotiling (mirror of terrain-life.ts, screen coords) -----------------

interface NeighbourFlags {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
  northWest: boolean;
  northEast: boolean;
  southWest: boolean;
  southEast: boolean;
}

function neighbours(ground: GroundMap, col: number, row: number, kind: Ground): NeighbourFlags {
  const same = (c: number, r: number) => !inBounds(c, r) || ground[r][c] === kind;
  return {
    north: same(col, row - 1),
    east: same(col + 1, row),
    south: same(col, row + 1),
    west: same(col - 1, row),
    northWest: same(col - 1, row - 1),
    northEast: same(col + 1, row - 1),
    southWest: same(col - 1, row + 1),
    southEast: same(col + 1, row + 1),
  };
}

function autotileIndex({ north, east, south, west }: NeighbourFlags): number {
  if (!north && east && south && !west) return 1;
  if (!north && east && south && west) return 2;
  if (!north && !east && south && west) return 3;
  if (north && east && south && !west) return 4;
  if (north && !east && south && west) return 6;
  if (north && east && !south && !west) return 7;
  if (north && east && !south && west) return 8;
  if (north && !east && !south && west) return 9;
  return 5;
}

function waterTileName(flags: NeighbourFlags, ripple: () => number): string {
  const { north, east, south, west, northWest, northEast, southWest, southEast } = flags;
  if (north && south && east && west) {
    if (!northWest) return "pond-20";
    if (!northEast) return "pond-21";
    if (!southWest) return "pond-22";
    if (!southEast) return "pond-23";
    return `pond-center-${1 + Math.floor(ripple() * 4)}`;
  }
  if (north && south && east && !west && !northWest && !southWest) return "pond-25";
  if (north && south && !east && west && !northEast && !southEast) return "pond-24";
  return `pond-${autotileIndex(flags)}`;
}

// "dirt" bakes with the path autotile family: grass-dirt-2 is a speckled
// transition tile, while path-1..9 is the actual bare-earth vocabulary the
// live map uses for dirt clearings and trails.
const GROUND_PREFIX: Partial<Record<Ground, string>> = {
  path: "path",
  road: "road",
  sand: "sand",
  dirt: "path",
};

/** Bake the ground layer into tiles (img + water solidity). */
export function bakeGround(grid: DesignTile[][], ground: GroundMap, rng: Rng): void {
  for (let row = 0; row < DESIGN_GRID; row += 1) {
    for (let col = 0; col < DESIGN_GRID; col += 1) {
      const kind = ground[row][col];
      const tile = grid[row][col];
      if (kind === "grass") {
        tile.img = "grass";
      } else if (kind === "water") {
        tile.img = waterTileName(neighbours(ground, col, row, "water"), () => rng.next());
        tile.solid = true;
      } else {
        const prefix = GROUND_PREFIX[kind];
        tile.img = `${prefix}-${autotileIndex(neighbours(ground, col, row, kind))}`;
      }
    }
  }
}

// --- structures ------------------------------------------------------------

export function isClear(grid: DesignTile[][], ground: GroundMap, col: number, row: number): boolean {
  return (
    inBounds(col, row) &&
    !grid[row][col].img2 &&
    !grid[row][col].feature &&
    ground[row][col] !== "water"
  );
}

function areaClear(
  grid: DesignTile[][],
  ground: GroundMap,
  col: number,
  row: number,
  width: number,
  height: number,
): boolean {
  for (let r = row; r < row + height; r += 1) {
    for (let c = col; c < col + width; c += 1) {
      if (!isClear(grid, ground, c, r)) return false;
    }
  }
  return true;
}

/** 3-wide × 4-tall Emerald house; returns false if the footprint is blocked. */
export function placeHouse(
  grid: DesignTile[][],
  ground: GroundMap,
  col: number,
  row: number,
): boolean {
  if (!areaClear(grid, ground, col, row, 3, 4)) return false;
  for (let index = 0; index < 12; index += 1) {
    const tile = grid[row + Math.floor(index / 3)][col + (index % 3)];
    tile.img2 = `house-red-${index + 1}`;
    tile.feature = "house";
    tile.solid = true;
  }
  return true;
}

export function placeMountain(
  grid: DesignTile[][],
  ground: GroundMap,
  col: number,
  row: number,
): boolean {
  if (!areaClear(grid, ground, col, row, 3, 3)) return false;
  for (let index = 0; index < 9; index += 1) {
    const tile = grid[row + Math.floor(index / 3)][col + (index % 3)];
    tile.img2 = `mountain-${index + 1}`;
    tile.feature = "mountain";
    tile.solid = true;
  }
  return true;
}

/** 2×2 cave; cave-4 (bottom-right) is the walkable entrance. */
export function placeCave(
  grid: DesignTile[][],
  ground: GroundMap,
  col: number,
  row: number,
): boolean {
  if (!areaClear(grid, ground, col, row, 2, 2)) return false;
  for (let index = 0; index < 4; index += 1) {
    const tile = grid[row + Math.floor(index / 2)][col + (index % 2)];
    tile.img2 = `cave-${index + 1}`;
    tile.feature = index === 3 ? "cave-entrance" : "cave";
    tile.solid = index !== 3;
  }
  return true;
}

export function placeDecor(
  grid: DesignTile[][],
  col: number,
  row: number,
  img2: string,
  options: { solid?: boolean; feature?: string } = {},
): void {
  if (!inBounds(col, row)) return;
  const tile = grid[row][col];
  tile.img2 = img2;
  if (options.solid) tile.solid = true;
  if (options.feature) tile.feature = options.feature;
}

export function placeSign(grid: DesignTile[][], col: number, row: number): void {
  placeDecor(grid, col, row, "route-sign-1", { solid: true, feature: "sign" });
}

/** Invisible hidden item, exactly like the live generator's secret pockets. */
export function placeHiddenItem(grid: DesignTile[][], col: number, row: number): void {
  if (!inBounds(col, row)) return;
  const tile = grid[row][col];
  tile.img2 = "grass";
  tile.feature = "hidden-item";
  tile.solid = false;
}

/** One-way ledge row with proper left/middle/right caps. */
export function placeLedgeRow(
  grid: DesignTile[][],
  ground: GroundMap,
  row: number,
  fromCol: number,
  toCol: number,
): void {
  for (let col = fromCol; col <= toCol; col += 1) {
    if (!isClear(grid, ground, col, row)) continue;
    const img2 =
      col === fromCol ? "ledge-left-1" : col === toCol ? "ledge-right-1" : "ledge-middle-1";
    const tile = grid[row][col];
    tile.img2 = img2;
    tile.feature = "ledge";
  }
}

const TREES = ["big-tree-1", "big-tree-2", "big-tree-3", "big-tree-4", "big-tree-5", "big-tree-6", "big-tree-7", "big-tree-8", "big-tree-9", "big-tree-10"] as const;

export function treePick(rng: Rng): string {
  return rng.pick(TREES);
}

/** Forest wall around the block edge, with optional carved gaps. */
export function treeBorder(
  grid: DesignTile[][],
  ground: GroundMap,
  rng: Rng,
  options: { thickness?: number; gapChance?: number } = {},
): void {
  const thickness = options.thickness ?? 1;
  const gapChance = options.gapChance ?? 0;
  for (let row = 0; row < DESIGN_GRID; row += 1) {
    for (let col = 0; col < DESIGN_GRID; col += 1) {
      const edgeDistance = Math.min(row, col, DESIGN_GRID - 1 - row, DESIGN_GRID - 1 - col);
      if (edgeDistance >= thickness) continue;
      if (!isClear(grid, ground, col, row)) continue;
      if (rng.chance(gapChance)) continue;
      placeDecor(grid, col, row, treePick(rng), { solid: true, feature: "forest-wall" });
    }
  }
}

/** Scatter decorations over matching ground. */
export function scatter(
  grid: DesignTile[][],
  ground: GroundMap,
  rng: Rng,
  imgs: readonly string[],
  density: number,
  options: { on?: Ground[]; solid?: boolean; feature?: string } = {},
): void {
  const allowed = options.on ?? ["grass"];
  for (let row = 0; row < DESIGN_GRID; row += 1) {
    for (let col = 0; col < DESIGN_GRID; col += 1) {
      if (!allowed.includes(ground[row][col])) continue;
      if (!isClear(grid, ground, col, row)) continue;
      if (!rng.chance(density)) continue;
      placeDecor(grid, col, row, rng.pick(imgs), {
        solid: options.solid,
        feature: options.feature,
      });
    }
  }
}

/** Long-grass meadow patch (wild encounter grass). */
export function longGrassPatch(
  grid: DesignTile[][],
  ground: GroundMap,
  rng: Rng,
  centerCol: number,
  centerRow: number,
  radius: number,
): void {
  for (let row = 0; row < DESIGN_GRID; row += 1) {
    for (let col = 0; col < DESIGN_GRID; col += 1) {
      const dx = col - centerCol;
      const dy = row - centerRow;
      if (Math.sqrt(dx * dx + dy * dy) > radius * (0.75 + rng.next() * 0.4)) continue;
      if (!isClear(grid, ground, col, row) || ground[row][col] !== "grass") continue;
      const tile = grid[row][col];
      tile.img2 = "grass-2";
      tile.feature = "long-grass";
    }
  }
}

/** Hedge fence line built from shrubs — the village fencing vocabulary. */
export function hedgeLine(
  grid: DesignTile[][],
  ground: GroundMap,
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  options: { gapAt?: number } = {},
): void {
  const steps = Math.max(Math.abs(toCol - fromCol), Math.abs(toRow - fromRow));
  for (let step = 0; step <= steps; step += 1) {
    if (step === options.gapAt) continue;
    const col = fromCol + Math.round((toCol - fromCol) * (step / Math.max(1, steps)));
    const row = fromRow + Math.round((toRow - fromRow) * (step / Math.max(1, steps)));
    if (!isClear(grid, ground, col, row)) continue;
    placeDecor(grid, col, row, "shrub-1", { solid: true, feature: "hedge" });
  }
}

/** Find a clear spot for an entity or small prop, biased toward the centre. */
export function findClearSpot(
  grid: DesignTile[][],
  ground: GroundMap,
  rng: Rng,
  options: { allowGround?: Ground[]; margin?: number } = {},
): { col: number; row: number } | null {
  const margin = options.margin ?? 1;
  const allowed = options.allowGround ?? ["grass", "path", "road", "sand", "dirt"];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const col = rng.range(margin, DESIGN_GRID - 1 - margin);
    const row = rng.range(margin, DESIGN_GRID - 1 - margin);
    if (!isClear(grid, ground, col, row)) continue;
    if (!allowed.includes(ground[row][col])) continue;
    if (grid[row][col].feature) continue;
    return { col, row };
  }
  return null;
}
