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

// Ground kinds and the legality rules that keep dioramas looking like real
// Emerald maps. Every decoration tile was drawn on a specific ground and has
// that ground baked into its background, so props may only be placed on the
// ground family they were drawn for:
//   grass  → trees, shrubs, flowers, long grass, houses, route signs
//   rocky  → mountains/domes, cave doors, ledges, rocks, boulders, scree,
//            rocky signs (the mauve "mountain ground" biome)
//   sand   → bare dunes (props of other families are illegal here)
// Water shorelines additionally follow the live generator's smoothing rules
// so the pond autotile can always close its circuits.
export type Ground = "grass" | "water" | "path" | "road" | "sand" | "dirt" | "rocky";

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
  const { north, east, south, west, northWest, northEast } = flags;
  if (north && south && east && west) {
    if (!northWest) return "pond-20";
    if (!northEast) return "pond-21";
    // The pond-22/23 art is a full-height bank bar (near-duplicate of the
    // 24/25 channel walls), NOT an inner-corner nub — drawing it in open
    // water renders a floating bar. smoothWater fills SW/SE notches instead,
    // and any residual case renders as open water (a subtle missing nub
    // beats a broken bank).
    return `pond-center-${1 + Math.floor(ripple() * 4)}`;
  }
  if (north && south && east && !west && !flags.northWest && !flags.southWest) return "pond-25";
  if (north && south && !east && west && !flags.northEast && !flags.southEast) return "pond-24";
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

/** Mirror of the live generator's smoothWater (terrain-life.ts): every water
 * tile must sit in a full 2×2 water square, surrounded tiles may expose at
 * most one land diagonal, and "kissing corners" are forbidden — otherwise the
 * pond autotile cannot draw a closed shoreline. Offending tiles revert to
 * `fallback` ground. Out-of-bounds counts as water, like the server's
 * missing-neighbour rule. */
export function smoothWater(ground: GroundMap, fallback: Ground = "grass"): void {
  const water = (col: number, row: number) => !inBounds(col, row) || ground[row][col] === "water";
  for (let pass = 0; pass < 40; pass += 1) {
    let changed = false;
    for (let row = 0; row < DESIGN_GRID; row += 1) {
      for (let col = 0; col < DESIGN_GRID; col += 1) {
        if (ground[row][col] !== "water") continue;
        const north = water(col, row - 1);
        const south = water(col, row + 1);
        const east = water(col + 1, row);
        const west = water(col - 1, row);
        const northWest = water(col - 1, row - 1);
        const northEast = water(col + 1, row - 1);
        const southWest = water(col - 1, row + 1);
        const southEast = water(col + 1, row + 1);
        const inWaterSquare = (
          [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ] as const
        ).some(([dx, dy]) => water(col + dx, row) && water(col, row + dy) && water(col + dx, row + dy));
        const landDiagonals = [northWest, northEast, southWest, southEast].filter((value) => !value).length;
        const surrounded = north && east && south && west;
        const kissingCorner =
          (!north && !east && northEast) ||
          (!north && !west && northWest) ||
          (!south && !east && southEast) ||
          (!south && !west && southWest);
        if (!inWaterSquare || (surrounded && landDiagonals >= 2) || kissingCorner) {
          ground[row][col] = fallback;
          changed = true;
          continue;
        }
        // Design-side extension of the live rules: the SW/SE inner-corner art
        // (pond-22/23) is unusable (see waterTileName), so fill those notches
        // with water — the shoreline smooths instead of needing the nub. Only
        // plain fallback ground may flood; paths/roads stay dry (a residual
        // notch just renders as open water).
        if (surrounded && !southWest && inBounds(col - 1, row + 1) && ground[row + 1][col - 1] === fallback) {
          ground[row + 1][col - 1] = "water";
          changed = true;
        }
        if (surrounded && !southEast && inBounds(col + 1, row + 1) && ground[row + 1][col + 1] === fallback) {
          ground[row + 1][col + 1] = "water";
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

/** Isolated autotiled specks (a lone sand/path/road tile with no same-family
 * cardinal neighbour — typically left behind by shoreline smoothing) cannot
 * render legally: absorb them into surrounding water, or plain grass. */
function absorbIsolatedSpecks(ground: GroundMap): void {
  const familyOf = (kind: Ground) => (kind === "dirt" ? "path" : kind);
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (let row = 0; row < DESIGN_GRID; row += 1) {
      for (let col = 0; col < DESIGN_GRID; col += 1) {
        const kind = ground[row][col];
        if (!GROUND_PREFIX[kind]) continue;
        const family = familyOf(kind);
        const cardinals: Array<Ground | null> = [
          inBounds(col, row - 1) ? ground[row - 1][col] : null,
          inBounds(col, row + 1) ? ground[row + 1][col] : null,
          inBounds(col - 1, row) ? ground[row][col - 1] : null,
          inBounds(col + 1, row) ? ground[row][col + 1] : null,
        ];
        if (cardinals.some((value) => value === null || familyOf(value) === family)) continue;
        const waterCount = cardinals.filter((value) => value === "water").length;
        ground[row][col] = waterCount >= 3 ? "water" : "grass";
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/** Bake the ground layer into tiles (img + water solidity). Runs the water
 * smoothing rules first so shorelines are always legal. */
export function bakeGround(
  grid: DesignTile[][],
  ground: GroundMap,
  rng: Rng,
  waterFallback: Ground = "grass",
): void {
  // Smoothing and speck absorption can each expose new work for the other
  // (absorbed water reopens shoreline checks; smoothing fallback can strand a
  // speck) — alternate until stable.
  for (let round = 0; round < 4; round += 1) {
    smoothWater(ground, waterFallback);
    absorbIsolatedSpecks(ground);
  }
  smoothWater(ground, waterFallback);
  for (let row = 0; row < DESIGN_GRID; row += 1) {
    for (let col = 0; col < DESIGN_GRID; col += 1) {
      const kind = ground[row][col];
      const tile = grid[row][col];
      if (kind === "grass") {
        tile.img = "grass";
      } else if (kind === "rocky") {
        tile.img = "rocky-1";
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

function areaOnGround(
  ground: GroundMap,
  col: number,
  row: number,
  width: number,
  height: number,
  kind: Ground,
): boolean {
  for (let r = row; r < row + height; r += 1) {
    for (let c = col; c < col + width; c += 1) {
      if (!inBounds(c, r) || ground[r][c] !== kind) return false;
    }
  }
  return true;
}

/** 3-wide × 4-tall Emerald house (grass-backed art → grass only). */
export function placeHouse(
  grid: DesignTile[][],
  ground: GroundMap,
  col: number,
  row: number,
): boolean {
  if (!areaClear(grid, ground, col, row, 3, 4)) return false;
  if (!areaOnGround(ground, col, row, 3, 4, "grass")) return false;
  for (let index = 0; index < 12; index += 1) {
    const tile = grid[row + Math.floor(index / 3)][col + (index % 3)];
    tile.img2 = `house-red-${index + 1}`;
    tile.feature = "house";
    tile.solid = true;
  }
  return true;
}

/** 3×3 mossy rock dome with a cave doorway. The mountain-1..9 art carries the
 * rocky biome's mauve ground in its background, so domes are legal on rocky
 * ground only. mountain-8's slot (an unpainted hole in the source sheet) is
 * filled by the harvested cave-door-1 tile, which doubles as the entrance. */
export function placeDome(
  grid: DesignTile[][],
  ground: GroundMap,
  col: number,
  row: number,
): boolean {
  if (!areaClear(grid, ground, col, row, 3, 3)) return false;
  if (!areaOnGround(ground, col, row, 3, 3, "rocky")) return false;
  for (let index = 0; index < 9; index += 1) {
    const tile = grid[row + Math.floor(index / 3)][col + (index % 3)];
    if (index === 7) {
      tile.img2 = "cave-door-1";
      tile.feature = "cave-entrance";
      tile.solid = false;
    } else {
      tile.img2 = `mountain-${index + 1}`;
      tile.feature = "mountain";
      tile.solid = true;
    }
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

/** Route sign (grass-backed art → grass only). */
export function placeSign(grid: DesignTile[][], ground: GroundMap, col: number, row: number): void {
  if (!inBounds(col, row) || ground[row][col] !== "grass") return;
  placeDecor(grid, col, row, "route-sign-1", { solid: true, feature: "sign" });
}

/** Wooden sign drawn on rocky ground (rocky biome only). */
export function placeRockySign(
  grid: DesignTile[][],
  ground: GroundMap,
  col: number,
  row: number,
): void {
  if (!inBounds(col, row) || ground[row][col] !== "rocky") return;
  placeDecor(grid, col, row, "sign-rocky-1", { solid: true, feature: "sign" });
}

/** Invisible hidden item, exactly like the live generator's secret pockets.
 * The overlay copies the ground tile so nothing shows until discovered. */
export function placeHiddenItem(grid: DesignTile[][], ground: GroundMap, col: number, row: number): void {
  if (!inBounds(col, row)) return;
  const kind = ground[row][col];
  if (kind !== "grass" && kind !== "rocky") return;
  const tile = grid[row][col];
  tile.img2 = kind === "rocky" ? "rocky-1" : "grass";
  tile.feature = "hidden-item";
  tile.solid = false;
}

/** One-way ledge row with proper left/middle/right caps. The ledge art sits
 * on rocky ground, so rows only stamp onto rocky tiles. */
export function placeLedgeRow(
  grid: DesignTile[][],
  ground: GroundMap,
  row: number,
  fromCol: number,
  toCol: number,
): void {
  for (let col = fromCol; col <= toCol; col += 1) {
    if (!isClear(grid, ground, col, row)) continue;
    if (ground[row][col] !== "rocky") continue;
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
      if (!isClear(grid, ground, col, row) || ground[row][col] !== "grass") continue;
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
    if (!isClear(grid, ground, col, row) || ground[row][col] !== "grass") continue;
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
  const allowed = options.allowGround ?? ["grass", "path", "road", "sand", "dirt", "rocky"];
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
