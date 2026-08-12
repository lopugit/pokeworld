// Painting toolkit for Emerald-style design dioramas. Mirrors the live map
// generator's tile conventions (legacy/mods/terrain-life.ts) so designs read
// exactly like real Pokéworld blocks:
//   - autotile index 1–9 (path-/road-/sand-/pond-) with 5 = centre
//   - pond inner corners 20/21, narrow channels 24/25, pond-center ripples
//   - houses 3×4 (house-red-1..12), dome 3×3 with cave-door-1 in slot 8
// Grids here are screen-order (row 0 = top); the server's "north" neighbour is
// therefore row - 1.
//
// Every helper derives dimensions from the arrays it receives, so the same
// toolkit paints a single 16×16 block or a multi-block world supergrid
// (world.ts) — baking a supergrid in one pass is what makes neighbouring
// blocks merge with legal, continuous shorelines and paths.

import type { Rng } from "./rng";
import { DESIGN_GRID, type DesignTile } from "./types";

// Ground kinds and the legality rules that keep dioramas looking like real
// Emerald maps (machine-checked by legality.ts). Every decoration tile was
// drawn on a specific ground and has that ground baked into its background,
// so props may only be placed on the ground family they were drawn for:
//   grass  → trees, shrubs, flowers, long grass, houses, route signs
//   rocky  → domes, cave doors, boulders, scree, rocky signs (full-bleed
//            scenes only; no rocky↔grass transition art exists)
//   sand   → bare dunes (props of other families are illegal here)
// Water shorelines additionally follow the live generator's smoothing rules
// so the pond autotile can always close its circuits.
export type Ground = "grass" | "water" | "path" | "road" | "sand" | "dirt" | "rocky";

export type GroundMap = Ground[][];

export const inBounds = (col: number, row: number) =>
  col >= 0 && row >= 0 && col < DESIGN_GRID && row < DESIGN_GRID;

const inMap = (map: ArrayLike<ArrayLike<unknown>>, col: number, row: number) =>
  row >= 0 && col >= 0 && row < map.length && col < (map[row]?.length ?? 0);

export function newGround(base: Ground = "grass", width = DESIGN_GRID, height = DESIGN_GRID): GroundMap {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => base));
}

export function newGrid(width = DESIGN_GRID, height = DESIGN_GRID): DesignTile[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => ({}) as DesignTile));
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
  for (let row = 0; row < ground.length; row += 1) {
    for (let col = 0; col < ground[row].length; col += 1) {
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
      if (inMap(ground, c, r)) ground[r][c] = kind;
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
        if (inMap(ground, col + dc, row + dr)) ground[row + dr][col + dc] = kind;
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

export interface NeighbourFlags {
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
  const same = (c: number, r: number) => !inMap(ground, c, r) || ground[r][c] === kind;
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

export function autotileIndex({ north, east, south, west }: NeighbourFlags): number {
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

/** Deterministic, position-hashed ripple pick so baking needs no RNG stream —
 * a block bakes identically standalone and inside a world supergrid. */
export function rippleIndex(col: number, row: number): number {
  let h = Math.imul(col + 1, 0x9e3779b1) ^ Math.imul(row + 1, 0x85ebca77);
  h ^= h >>> 13;
  return 1 + ((h >>> 0) % 4);
}

function waterTileName(flags: NeighbourFlags, col: number, row: number): string {
  const { north, east, south, west, northWest, northEast } = flags;
  if (north && south && east && west) {
    if (!northWest) return "pond-20";
    if (!northEast) return "pond-21";
    // The pond-22/23 art is a full-height bank bar (near-duplicate of the
    // 24/25 channel walls), NOT an inner-corner nub — drawing it in open
    // water renders a floating bar. smoothWater fills SW/SE notches instead,
    // and any residual case renders as open water (a subtle missing nub
    // beats a broken bank).
    return `pond-center-${rippleIndex(col, row)}`;
  }
  if (north && south && east && !west && !flags.northWest && !flags.southWest) return "pond-25";
  if (north && south && !east && west && !flags.northEast && !flags.southEast) return "pond-24";
  return `pond-${autotileIndex(flags)}`;
}

// "dirt" bakes with the path autotile family: path-1..9 is the actual
// bare-earth vocabulary the live map uses for dirt clearings and trails.
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
export type GroundFallback = Ground | ((col: number, row: number) => Ground);

const fallbackAt = (fallback: GroundFallback, col: number, row: number): Ground =>
  typeof fallback === "function" ? fallback(col, row) : fallback;

export function smoothWater(ground: GroundMap, fallback: GroundFallback = "grass"): void {
  const water = (col: number, row: number) => !inMap(ground, col, row) || ground[row][col] === "water";
  for (let pass = 0; pass < 40; pass += 1) {
    let changed = false;
    for (let row = 0; row < ground.length; row += 1) {
      for (let col = 0; col < ground[row].length; col += 1) {
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
          ground[row][col] = fallbackAt(fallback, col, row);
          changed = true;
          continue;
        }
        // Design-side extension of the live rules: the SW/SE inner-corner art
        // (pond-22/23) is unusable (see waterTileName), so fill those notches
        // with water — the shoreline smooths instead of needing the nub. Only
        // plain fallback ground may flood; paths/roads stay dry (a residual
        // notch just renders as open water).
        if (
          surrounded && !southWest && inMap(ground, col - 1, row + 1) &&
          ground[row + 1][col - 1] === fallbackAt(fallback, col - 1, row + 1)
        ) {
          ground[row + 1][col - 1] = "water";
          changed = true;
        }
        if (
          surrounded && !southEast && inMap(ground, col + 1, row + 1) &&
          ground[row + 1][col + 1] === fallbackAt(fallback, col + 1, row + 1)
        ) {
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
    for (let row = 0; row < ground.length; row += 1) {
      for (let col = 0; col < ground[row].length; col += 1) {
        const kind = ground[row][col];
        if (!GROUND_PREFIX[kind]) continue;
        const family = familyOf(kind);
        const cardinals: Array<Ground | null> = [
          inMap(ground, col, row - 1) ? ground[row - 1][col] : null,
          inMap(ground, col, row + 1) ? ground[row + 1][col] : null,
          inMap(ground, col - 1, row) ? ground[row][col - 1] : null,
          inMap(ground, col + 1, row) ? ground[row][col + 1] : null,
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

// --- bridges ---------------------------------------------------------------

/** Pacifidlog plank walkways — the vault's only water-spanning foot bridges
 * (harvested by fetch-emerald-towns.mjs with their ocean water keyed to
 * transparent, so the design pond water shows through the plank gaps). */
export const BRIDGE_H = "bridge-h-1";
export const BRIDGE_V = "bridge-v-1";

const BRIDGEABLE = new Set<Ground>(["path", "road", "dirt"]);

interface DeckCell {
  col: number;
  row: number;
  img: string;
}

/** A "ford" — path/road ground painted straight across water — becomes a real
 * bridge: the crossing reverts to continuous water and a plank walkway spans
 * it (bridge-h rails for east-west crossings, bridge-v planks for
 * north-south). Only runs ≤3 long convert; anything wider stays a ford. The
 * detection is RNG-free, and decks apply only where smoothing leaves the cell
 * as water, so the bake stays deterministic. */
function planBridgeDecks(ground: GroundMap): DeckCell[] {
  const water = (c: number, r: number) => inMap(ground, c, r) && ground[r]?.[c] === "water";
  const walkable = (c: number, r: number) => inMap(ground, c, r) && BRIDGEABLE.has(ground[r][c]);
  const plan: DeckCell[] = [];
  const planned = new Set<string>();
  const push = (col: number, row: number, img: string) => {
    const key = `${col},${row}`;
    if (planned.has(key)) return;
    planned.add(key);
    plan.push({ col, row, img });
  };
  // East-west crossings: a short column-run of walkable ground with water
  // directly above and below is a road crossing a north-south river.
  const cols = ground[0]?.length ?? 0;
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < ground.length; row += 1) {
      if (!walkable(col, row) || !water(col, row - 1)) continue;
      let end = row;
      while (walkable(col, end + 1)) end += 1;
      if (end - row + 1 <= 3 && water(col, end + 1)) {
        for (let r = row; r <= end; r += 1) push(col, r, BRIDGE_H);
      }
      row = end;
    }
  }
  // North-south crossings: a short row-run flanked by water west and east.
  for (let row = 0; row < ground.length; row += 1) {
    for (let col = 0; col < (ground[row]?.length ?? 0); col += 1) {
      if (!walkable(col, row) || !water(col - 1, row)) continue;
      let end = col;
      while (walkable(end + 1, row)) end += 1;
      if (end - col + 1 <= 3 && water(end + 1, row)) {
        for (let c = col; c <= end; c += 1) push(c, row, BRIDGE_V);
      }
      col = end;
    }
  }
  for (const cell of plan) ground[cell.row][cell.col] = "water";
  return plan;
}

/** Bake the ground layer into tiles (img + water solidity). Converts fords to
 * plank bridges, then runs the water smoothing rules so shorelines are always
 * legal. Deterministic and RNG-free: the same ground map always bakes to the
 * same tiles, whether it is a standalone block or a slice of a world
 * supergrid. */
export function bakeGround(
  grid: DesignTile[][],
  ground: GroundMap,
  waterFallback: GroundFallback = "grass",
): void {
  const decks = planBridgeDecks(ground);
  // Smoothing and speck absorption can each expose new work for the other
  // (absorbed water reopens shoreline checks; smoothing fallback can strand a
  // speck) — alternate until stable.
  for (let round = 0; round < 4; round += 1) {
    smoothWater(ground, waterFallback);
    absorbIsolatedSpecks(ground);
  }
  smoothWater(ground, waterFallback);
  for (let row = 0; row < ground.length; row += 1) {
    for (let col = 0; col < ground[row].length; col += 1) {
      const kind = ground[row][col];
      const tile = grid[row][col];
      if (kind === "grass") {
        tile.img = "grass";
      } else if (kind === "rocky") {
        tile.img = "rocky-1";
      } else if (kind === "water") {
        tile.img = waterTileName(neighbours(ground, col, row, "water"), col, row);
        tile.solid = true;
      } else {
        const prefix = GROUND_PREFIX[kind];
        tile.img = `${prefix}-${autotileIndex(neighbours(ground, col, row, kind))}`;
      }
    }
  }
  // Lay the decks last so they override water solidity; a deck cell that
  // smoothing reverted to land simply stays land (no bridge to nowhere).
  for (const deck of decks) {
    if (ground[deck.row]?.[deck.col] !== "water") continue;
    const tile = grid[deck.row][deck.col];
    tile.img2 = deck.img;
    tile.solid = false;
    tile.feature = "bridge";
  }
}

// --- structures ------------------------------------------------------------

export function isClear(grid: DesignTile[][], ground: GroundMap, col: number, row: number): boolean {
  return (
    inMap(grid, col, row) &&
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
      if (!inMap(ground, c, r) || ground[r][c] !== kind) return false;
    }
  }
  return true;
}

/** Multi-tile building vocabulary (grass-backed art → grass only). Every
 * entry is a complete harvested formation; legality.ts mirrors this table so
 * partial footprints can never validate. */
export interface StructureKind {
  id: string;
  width: number;
  height: number;
  /** img2 for slot n (row-major). */
  tileAt(slot: number): string;
}

const structure = (id: string, width: number, height: number, prefix: string): StructureKind => ({
  id,
  width,
  height,
  tileAt: (slot) => `${prefix}-${slot + 1}`,
});

export const STRUCTURES: Record<string, StructureKind> = {
  "house-red": structure("house-red", 3, 4, "house-red"),
  pokecenter: structure("pokecenter", 4, 4, "struct-pokecenter"),
  pokemart: structure("pokemart", 4, 4, "struct-pokemart"),
  "contest-hall": structure("contest-hall", 5, 4, "struct-contest-hall"),
  "tower-white": structure("tower-white", 2, 4, "struct-tower-white"),
  "lodge-log": structure("lodge-log", 5, 4, "struct-lodge-log"),
};

/** Place a complete building on clear grass; returns false when it cannot
 * fit. All buildings share the "house" feature (solid, enterable-looking). */
export function placeStructure(
  grid: DesignTile[][],
  ground: GroundMap,
  col: number,
  row: number,
  kindId: string,
): boolean {
  const kind = STRUCTURES[kindId];
  if (!kind) return false;
  if (!areaClear(grid, ground, col, row, kind.width, kind.height)) return false;
  if (!areaOnGround(ground, col, row, kind.width, kind.height, "grass")) return false;
  for (let index = 0; index < kind.width * kind.height; index += 1) {
    const tile = grid[row + Math.floor(index / kind.width)][col + (index % kind.width)];
    tile.img2 = kind.tileAt(index);
    tile.feature = "house";
    tile.solid = true;
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
  return placeStructure(grid, ground, col, row, "house-red");
}

/** 3×3 mossy rock dome with a cave doorway. The mountain-1..9 art ships
 * re-grounded onto the beige speckle (build-design-tiles.mjs), so domes are
 * legal on rocky ground only. mountain-8's slot (an unpainted hole in the
 * source sheet) is filled by the harvested cave-door-1 tile, which doubles as
 * the entrance. */
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
  if (!inMap(grid, col, row)) return;
  const tile = grid[row][col];
  tile.img2 = img2;
  if (options.solid) tile.solid = true;
  if (options.feature) tile.feature = options.feature;
}

/** Route sign (grass-backed art → grass only). */
export function placeSign(grid: DesignTile[][], ground: GroundMap, col: number, row: number): void {
  if (!inMap(grid, col, row) || ground[row][col] !== "grass") return;
  placeDecor(grid, col, row, "route-sign-1", { solid: true, feature: "sign" });
}

/** Wooden sign drawn on rocky ground (rocky biome only). */
export function placeRockySign(
  grid: DesignTile[][],
  ground: GroundMap,
  col: number,
  row: number,
): void {
  if (!inMap(grid, col, row) || ground[row][col] !== "rocky") return;
  placeDecor(grid, col, row, "sign-rocky-1", { solid: true, feature: "sign" });
}

/** Invisible hidden item, exactly like the live generator's secret pockets.
 * The overlay copies the ground tile so nothing shows until discovered.
 * Occupied tiles are left alone — a secret must never overwrite part of a
 * formation (that is how a tree once lost a slice). */
export function placeHiddenItem(grid: DesignTile[][], ground: GroundMap, col: number, row: number): void {
  if (!inMap(grid, col, row)) return;
  if (grid[row][col].img2 || grid[row][col].feature) return;
  const kind = ground[row][col];
  if (kind !== "grass" && kind !== "rocky") return;
  const tile = grid[row][col];
  tile.img2 = kind === "rocky" ? "rocky-1" : "grass";
  tile.feature = "hidden-item";
  tile.solid = false;
}

/** Boulder ridge: a dotted line of mossy boulders with a guaranteed walkable
 * gap — the rocky biome's terrace/barrier vocabulary. (The old ledge rows were
 * built from dome-top crops and rendered as broken cliff crests; the legality
 * rules now ban that art outright, and ridges took their place.) */
export function placeBoulderLine(
  grid: DesignTile[][],
  ground: GroundMap,
  rng: Rng,
  row: number,
  fromCol: number,
  toCol: number,
  options: { gapAt?: number; density?: number } = {},
): void {
  const gapAt = options.gapAt ?? rng.range(fromCol, toCol);
  const density = options.density ?? 0.85;
  for (let col = fromCol; col <= toCol; col += 1) {
    if (col === gapAt) continue;
    if (!isClear(grid, ground, col, row)) continue;
    if (ground[row][col] !== "rocky") continue;
    if (!rng.chance(density)) continue;
    placeDecor(grid, col, row, "boulder-mossy-1", { solid: true, feature: "rock" });
  }
}

/** The big tree is the tree-grand 2×2 formation — a free-standing canopy
 * tree harvested whole from the pret Littleroot render. (The old
 * big-tree-1..10 sheet slices are forest-overlap demo fragments: no
 * arrangement of them composes a whole tree, which is exactly why groves
 * built from them looked broken. All slices are banned now.)
 * tree-1 is banned too: its art is the bottom half of a taller tree —
 * canopy sliced flat at the tile's top edge over a trunk — so standalone
 * it renders a crown-less half tree (the reported broken-tree bug). The
 * only complete single-cell greenery is shrub-1; anything tree-shaped
 * must be the full tree-grand 2×2. */
const BIG_TREE_SLICES = [
  "tree-grand-1", "tree-grand-2",
  "tree-grand-3", "tree-grand-4",
] as const;

export const SMALL_SHRUB = "shrub-1";

/** Place a complete 2×2 big tree anchored at its top-left; grass only. */
export function placeTree(
  grid: DesignTile[][],
  ground: GroundMap,
  col: number,
  row: number,
  feature: string = "tree",
): boolean {
  for (let index = 0; index < 4; index += 1) {
    const c = col + (index % 2);
    const r = row + Math.floor(index / 2);
    if (!isClear(grid, ground, c, r)) return false;
    if (ground[r]?.[c] !== "grass") return false;
  }
  for (let index = 0; index < 4; index += 1) {
    const c = col + (index % 2);
    const r = row + Math.floor(index / 2);
    const tile = grid[r][c];
    tile.img2 = BIG_TREE_SLICES[index];
    tile.feature = feature;
    tile.solid = true;
  }
  return true;
}

/** Scatter complete big trees (attempts at random anchors), then fill the
 * former small-tree density with MORE real 2×2 trees — falling back to a
 * complete shrub only where a whole tree no longer fits. (The old small
 * tree, tree-1, was a banned half-crop; replacing it with shrubs alone
 * collapsed tree density across the catalog, so the density pass must
 * plant real trees first.) */
export function scatterTrees(
  grid: DesignTile[][],
  ground: GroundMap,
  rng: Rng,
  bigAttempts: number,
  smallDensity: number,
): void {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  for (let attempt = 0; attempt < bigAttempts; attempt += 1) {
    const col = rng.range(0, Math.max(0, cols - 2));
    const row = rng.range(0, Math.max(0, rows - 3));
    placeTree(grid, ground, col, row);
  }
  if (smallDensity > 0) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (ground[row]?.[col] !== "grass") continue;
        if (!isClear(grid, ground, col, row)) continue;
        if (!rng.chance(smallDensity)) continue;
        if (!placeTree(grid, ground, col, row)) {
          placeDecor(grid, col, row, SMALL_SHRUB, { solid: true, feature: "shrub" });
        }
      }
    }
  }
}

/** Forest wall around the block edge: courses of complete big trees along
 * every side, with optional skipped anchors as carved gaps. `thickness` ≥ 3
 * additionally sprinkles small trees just inside the wall. */
export function treeBorder(
  grid: DesignTile[][],
  ground: GroundMap,
  rng: Rng,
  options: { thickness?: number; gapChance?: number } = {},
): void {
  const thickness = options.thickness ?? 2;
  const gapChance = options.gapChance ?? 0;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const anchors: Array<[number, number]> = [];
  for (let col = 0; col + 2 <= cols; col += 2) {
    anchors.push([col, 0]);
    anchors.push([col, rows - 3]);
  }
  for (let row = 3; row + 3 <= rows - 3; row += 3) {
    anchors.push([0, row]);
    anchors.push([cols - 2, row]);
  }
  for (const [col, row] of anchors) {
    if (rng.chance(gapChance)) continue;
    placeTree(grid, ground, col, row, "forest-wall");
  }
  if (thickness >= 3) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const edgeDistance = Math.min(row, col, rows - 1 - row, cols - 1 - col);
        if (edgeDistance < 3 || edgeDistance > 3) continue;
        if (!rng.chance(0.22)) continue;
        if (!isClear(grid, ground, col, row) || ground[row][col] !== "grass") continue;
        if (!placeTree(grid, ground, col, row, "forest-wall")) {
          placeDecor(grid, col, row, SMALL_SHRUB, { solid: true, feature: "forest-wall" });
        }
      }
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
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
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
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
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
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const col = rng.range(margin, cols - 1 - margin);
    const row = rng.range(margin, rows - 1 - margin);
    if (!isClear(grid, ground, col, row)) continue;
    if (!allowed.includes(ground[row][col])) continue;
    if (grid[row][col].feature) continue;
    return { col, row };
  }
  return null;
}
