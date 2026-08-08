// The tile-legality database and validator for /design compositions.
//
// Every rule here is grounded in the source art: each sprite was drawn on a
// specific ground (its background pixels are baked in), so it may only be
// composed onto that ground; multi-tile sprites were drawn as one formation,
// so their parts may only appear inside a complete formation; and autotiled
// grounds (path/road/sand/pond) encode their neighbourhood in the tile index,
// so the index must always agree with the actual neighbours.
//
// `validateDesign` turns those facts into machine checks. The design test
// suite runs it over every generated design and every world merge, which is
// what makes broken transitions structurally unshippable rather than merely
// unlikely. The Rules tab on /design renders this same database, so the docs
// can never drift from the enforcement.

import { autotileIndex, type NeighbourFlags } from "./paint";
import { DESIGN_GRID, type DesignTile } from "./types";

/** Ground families derivable from a ground-layer img. */
export type GroundKind = "grass" | "rocky" | "water" | "sand" | "path" | "road";

export function groundKindOf(img: string | undefined): GroundKind | null {
  if (!img) return null;
  if (img === "grass") return "grass";
  if (img === "rocky-1") return "rocky";
  if (img.startsWith("pond")) return "water";
  if (img.startsWith("sand-")) return "sand";
  if (img.startsWith("path-")) return "path";
  if (img.startsWith("road-")) return "road";
  return null;
}

export interface OverlayRule {
  /** Regexp over img2 names this rule covers. */
  pattern: RegExp;
  /** Human-readable name for the docs UI. */
  label: string;
  /** Grounds the art was drawn on — the only grounds it may stand on. */
  grounds: GroundKind[];
  /** Why the rule exists (rendered in the Rules tab). */
  reason: string;
}

/** Standalone overlay props (multi-tile formations are handled separately). */
export const OVERLAY_RULES: OverlayRule[] = [
  {
    pattern: /^tree-1$/,
    label: "Small tree",
    grounds: ["grass"],
    reason: "The single-cell tree; big trees are 2×3 formations.",
  },
  {
    pattern: /^shrub-1$/,
    label: "Shrubs & hedges",
    grounds: ["grass"],
    reason: "Shrub art is drawn on plain grass.",
  },
  {
    pattern: /^flower-[123]$/,
    label: "Flowers",
    grounds: ["grass"],
    reason: "Flower beds are grass decals.",
  },
  {
    pattern: /^grass-2$/,
    label: "Long grass",
    grounds: ["grass"],
    reason: "Wild-encounter grass grows out of grass.",
  },
  {
    pattern: /^route-sign-1$/,
    label: "Route sign",
    grounds: ["grass"],
    reason: "The route sign's post is planted in grass.",
  },
  {
    pattern: /^boulder-mossy-1$/,
    label: "Mossy boulder",
    grounds: ["rocky"],
    reason: "Harvested from the rocky biome; its fringe is speckle ground.",
  },
  {
    pattern: /^rocky-bumps-1$/,
    label: "Scree bumps",
    grounds: ["rocky"],
    reason: "Walkable scree texture drawn on the rocky ground.",
  },
  {
    pattern: /^sign-rocky-1$/,
    label: "Rocky sign",
    grounds: ["rocky"],
    reason: "The wooden sign variant drawn on rocky ground.",
  },
];

export interface BannedTile {
  pattern: RegExp;
  label: string;
  reason: string;
}

/** Art that can never compose legally in /design. The validator rejects these
 * outright — which is what retired the old fake ledges for good. */
export const BANNED_OVERLAYS: BannedTile[] = [
  {
    pattern: /^big-tree-(7|8|9|10)$/,
    label: "Forest-overlap strip slices",
    reason:
      "big-tree-9/10 are the hanging fronds of the tree above in the sheet's overlap demo and big-tree-7/8 are its near-empty grass fillers. Standalone they render floating fronds or nothing — the exact cut-off-trees bug. Only the complete 2×3 big-tree formation (5/6, 3/4, 1/2) composes legally.",
  },
  {
    pattern: /^ledge-(left|middle|right)-1$/,
    label: "Fake ledges",
    reason:
      "These files are byte-identical crops of mountain-1/2/3 — the dome's top row. A standalone row renders a cliff crest with no body below it (the broken horizontal cliffs). Real ledge art was never harvested.",
  },
  {
    pattern: /^rock-1$/,
    label: "Pink rock",
    reason:
      "rock-1's body is drawn in the pink-cobble mountain ground palette (41% of its pixels), so it can never blend with the beige speckle ground designs use. boulder-mossy-1 is the legal boulder.",
  },
  {
    pattern: /^cave-[1-4]$/,
    label: "Free-standing cave crops",
    reason: "The cave-1..4 crops carry foreign background and a sand sliver; cave entrances compose via the dome's cave-door slot instead.",
  },
  {
    pattern: /^grass-dirt-2$/,
    label: "Grass–dirt blend speck",
    reason: "A transition speck tile the live map uses in context; in dioramas it reads as dirt noise.",
  },
  {
    pattern: /^(mountain-8)$/,
    label: "Unpainted dome slot",
    reason: "mountain-8's sheet slot is an unpainted navy hole; domes must embed cave-door-1 there.",
  },
];

/** Ground-layer tiles that may never appear (art unusable in any context). */
export const BANNED_GROUND = [
  {
    pattern: /^pond-2[23]$/,
    label: "Unusable pond corners",
    reason:
      "The pond-22/23 crops are full-height bank bars (duplicates of the 24/25 channel walls), not inner-corner nubs — in open water they render floating bars. Shorelines smooth the notch away instead.",
  },
];

export interface Formation {
  id: string;
  label: string;
  width: number;
  height: number;
  /** img2 expected at each slot, row-major. null = any of `alternatives`. */
  slots: string[];
  /** Ground every covered cell must have. */
  ground: GroundKind;
  /** Slots that must NOT be solid (doorways). */
  walkableSlots: number[];
  reason: string;
}

const buildingFormation = (
  id: string,
  label: string,
  width: number,
  height: number,
  prefix: string,
  reason: string,
): Formation => ({
  id,
  label,
  width,
  height,
  slots: Array.from({ length: width * height }, (_, index) => `${prefix}-${index + 1}`),
  ground: "grass",
  walkableSlots: [],
  reason,
});

export const FORMATIONS: Formation[] = [
  buildingFormation(
    "house-red",
    "Red-roof house (3×4)",
    3,
    4,
    "house-red",
    "The house was drawn as one 3×4 block on grass; any partial subset shows sheared walls.",
  ),
  buildingFormation(
    "pokecenter",
    "Pokémon Center (4×4)",
    4,
    4,
    "struct-pokecenter",
    "Harvested whole from the sheet's town set; grass-backed.",
  ),
  buildingFormation(
    "pokemart",
    "PokéMart (4×4)",
    4,
    4,
    "struct-pokemart",
    "Harvested whole (one defective sheet roof slot repaired from its neighbour); grass-backed.",
  ),
  buildingFormation(
    "contest-hall",
    "Contest hall (5×4)",
    5,
    4,
    "struct-contest-hall",
    "Harvested whole from the sheet's plaza set; grass-backed.",
  ),
  buildingFormation(
    "tower-white",
    "White tower (2×4)",
    2,
    4,
    "struct-tower-white",
    "Harvested whole; the sheet's city-wall band above it is scrubbed to grass.",
  ),
  buildingFormation(
    "lodge-log",
    "Log lodge pair (5×4)",
    5,
    4,
    "struct-lodge-log",
    "Two green-roof log huts harvested as one compound; grass-backed.",
  ),
  // Larger homes composed from the red house's own cells for the live map's
  // size-graded building ladder (one structure per detected google-maps
  // building). Same completeness rule: partial subsets shear the roof lattice.
  buildingFormation(
    "house-wide",
    "Wide red-roof house (4×4)",
    4,
    4,
    "house-wide",
    "Composed from the red house's own cells as one 4×4 block on grass.",
  ),
  buildingFormation(
    "house-grand",
    "Grand red-roof house (5×4)",
    5,
    4,
    "house-grand",
    "Composed from the red house's own cells as one 5×4 block on grass.",
  ),
  buildingFormation(
    "house-manor",
    "Red-roof manor (6×5)",
    6,
    5,
    "house-manor",
    "Composed from the red house's own cells as one 6×5 block on grass.",
  ),
  // Whole buildings harvested from pret/pokeemerald town renders (real game
  // data: tiles + palettes + metatiles + layouts) by scripts/design/
  // fetch-emerald-towns.mjs. Coordinates verified against gridded renders.
  buildingFormation("house-littleroot", "Littleroot house (5×5)", 5, 5, "struct-house-littleroot",
    "Harvested whole from the Littleroot Town render; grass-backed."),
  buildingFormation("lab-birch", "Birch's lab (7×5)", 7, 5, "struct-lab-birch",
    "Harvested whole from the Littleroot Town render; grass-backed."),
  buildingFormation("gym-petalburg", "Petalburg gym (6×5)", 6, 5, "struct-gym-petalburg",
    "Harvested whole from the Petalburg City render; grass-backed."),
  buildingFormation("house-berry", "Berry-garden house (4×4)", 4, 4, "struct-house-berry",
    "Harvested whole from the Petalburg City render; grass-backed."),
  buildingFormation("gym-mauville", "Mauville gym (7×5)", 7, 5, "struct-gym-mauville",
    "Harvested whole from the Mauville City render; grass-backed."),
  buildingFormation("shop-mauville", "Mauville shop (3×4)", 3, 4, "struct-shop-mauville",
    "Harvested whole from the Mauville City render; grass-backed."),
  buildingFormation("house-mossdeep", "Mossdeep house (4×4)", 4, 4, "struct-house-mossdeep",
    "Harvested whole from the Mossdeep City render; grass-backed."),
  buildingFormation("gym-mossdeep", "Mossdeep gym (4×4)", 4, 4, "struct-gym-mossdeep",
    "Harvested whole from the Mossdeep City render; grass-backed."),
  buildingFormation("spacecenter", "Mossdeep space centre (9×8)", 9, 8, "struct-spacecenter",
    "Harvested whole from the Mossdeep City render; grass-backed."),
  buildingFormation("house-wood", "Wooden route house (4×4)", 4, 4, "struct-house-wood",
    "Harvested whole from the Oldale Town render; grass-backed."),
  {
    ...buildingFormation("hut-pacifidlog", "Pacifidlog stilt hut (5×7)", 5, 7, "struct-hut-pacifidlog",
      "Harvested whole from the Pacifidlog Town render; its platform floats on open water."),
    ground: "water",
  },
  buildingFormation("battle-tent", "Battle Tent (5×5)", 5, 5, "struct-battle-tent",
    "Harvested whole from the Verdanturf Town render; cliff scenery keyed from its dome tip."),
  buildingFormation("house-verdanturf", "Verdanturf house (4×4)", 4, 4, "struct-house-verdanturf",
    "Harvested whole from the Verdanturf Town render; grass-backed."),
  buildingFormation("gym-lavaridge", "Lavaridge gym (6×5)", 6, 5, "struct-gym-lavaridge",
    "Harvested whole from the Lavaridge Town render; grass-backed."),
  buildingFormation("house-lavaridge", "Lavaridge herb house (4×4)", 4, 4, "struct-house-lavaridge",
    "Harvested whole from the Lavaridge Town render; grass-backed."),
  // Browser/design-only families (not in the live map's building ladder).
  {
    ...buildingFormation("gym-rustboro", "Rustboro gym (7×5)", 7, 5, "struct-gym-rustboro",
      "Harvested whole from the Rustboro City render; stands on the city's paving."),
    ground: "road",
  },
  buildingFormation("treehouse", "Fortree treehouse (3×6)", 3, 6, "struct-treehouse",
    "Harvested whole from the Fortree City render; canopy crown to fern-covered stilts."),
  {
    ...buildingFormation("house-lilycove", "Lilycove house (4×4)", 4, 4, "struct-house-lilycove",
      "Harvested whole from the Lilycove City render; stands on the city's paving."),
    ground: "road",
  },
  {
    ...buildingFormation("dept-store", "Lilycove department store (10×7)", 10, 7, "struct-dept-store",
      "Harvested whole from the Lilycove City render; back-fence scenery keyed from its roofline."),
    ground: "road",
  },
  {
    ...buildingFormation("devon-corp", "Devon Corporation (8×8)", 8, 8, "struct-devon-corp",
      "Harvested whole from the Rustboro City render; stands on the city's paving."),
    ground: "road",
  },
  buildingFormation("gym-fortree", "Fortree gym (6×5)", 6, 5, "struct-gym-fortree",
    "Harvested whole from the Fortree City render; grass-backed."),
  buildingFormation("museum-stone", "Stone museum (3×5)", 3, 5, "museum-stone",
    "Harvested whole from the exterior sheet's stone hall; grass-backed."),
  buildingFormation("gallery-stone", "Stone gallery (4×5)", 4, 5, "gallery-stone",
    "Composed from the stone museum's modular bays as one 4×5 block."),
  buildingFormation("grand-stone", "Grand stone hall (5×6)", 5, 6, "grand-stone",
    "Composed from the stone museum's modular bays as one 5×6 block."),
  buildingFormation("brick-flat", "Brick block (4×3)", 4, 3, "brick-flat",
    "Harvested whole from the exterior sheet; background over its parapet is keyed to show the ground."),
  {
    ...buildingFormation("tree-grand", "Big canopy tree (2×2)", 2, 2, "tree-grand",
      "A free-standing 2×2 canopy tree harvested from the Littleroot Town render."),
    ground: "grass",
  },
  {
    id: "big-tree",
    label: "Big tree (2×3)",
    width: 2,
    height: 3,
    slots: ["big-tree-5", "big-tree-6", "big-tree-3", "big-tree-4", "big-tree-1", "big-tree-2"],
    ground: "grass",
    walkableSlots: [],
    reason:
      "The big tree is one 2×3 sprite (crown over trunk). Random single slices were exactly the cut-off trees bug — formation-only now.",
  },
  {
    id: "dome",
    label: "Mountain dome with cave door (3×3)",
    width: 3,
    height: 3,
    slots: [
      "mountain-1", "mountain-2", "mountain-3",
      "mountain-4", "mountain-5", "mountain-6",
      "mountain-7", "cave-door-1", "mountain-9",
    ],
    ground: "rocky",
    walkableSlots: [7],
    reason:
      "The 3×3 dome is one rock mass (re-grounded onto the beige speckle). Its bottom-middle slot is the harvested cave doorway — the only legal cave entrance.",
  },
];

const FORMATION_PART = new Map<string, { formation: Formation; slot: number }>();
for (const formation of FORMATIONS) {
  formation.slots.forEach((img2, slot) => {
    FORMATION_PART.set(img2, { formation, slot });
  });
}

export interface Violation {
  col: number;
  row: number;
  rule: string;
  detail: string;
}

type Grid = DesignTile[][];

const inGrid = (grid: Grid, col: number, row: number) =>
  row >= 0 && col >= 0 && row < grid.length && col < grid[row].length;

/** OOB counts as "same kind", mirroring the generator's continuation rule so
 * blocks stay mergeable with unseen neighbours. */
function flagsFor(same: (col: number, row: number) => boolean, col: number, row: number): NeighbourFlags {
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

/** The exact pond-name decision the baker uses, minus the ripple randomness. */
function expectedPond(flags: NeighbourFlags): { exact?: string; prefix?: string } {
  const { north, east, south, west, northWest, northEast } = flags;
  if (north && south && east && west) {
    if (!northWest) return { exact: "pond-20" };
    if (!northEast) return { exact: "pond-21" };
    return { prefix: "pond-center-" };
  }
  if (north && south && east && !west && !flags.northWest && !flags.southWest) return { exact: "pond-25" };
  if (north && south && !east && west && !flags.northEast && !flags.southEast) return { exact: "pond-24" };
  return { exact: `pond-${autotileIndex(flags)}` };
}

/**
 * Validate a design (or any tile grid, e.g. a merged world slice) against the
 * legality database. Returns every violation found; an empty array means the
 * grid composes entirely from legal art on legal grounds with coherent
 * autotiling and complete structures.
 */
export function validateDesign(grid: Grid): Violation[] {
  const violations: Violation[] = [];
  const rows = grid.length;
  const cols = grid[0]?.length ?? DESIGN_GRID;
  const kindAt = (col: number, row: number): GroundKind | null =>
    inGrid(grid, col, row) ? groundKindOf(grid[row][col].img) : null;

  // --- ground layer ---------------------------------------------------------
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const img = grid[row][col].img;
      if (!img) {
        violations.push({ col, row, rule: "ground-missing", detail: "tile has no ground img" });
        continue;
      }
      for (const banned of BANNED_GROUND) {
        if (banned.pattern.test(img)) {
          violations.push({ col, row, rule: "ground-banned", detail: `${img}: ${banned.label}` });
        }
      }
      const kind = groundKindOf(img);
      if (!kind) {
        violations.push({ col, row, rule: "ground-unknown", detail: `unknown ground tile "${img}"` });
        continue;
      }

      // Autotile audit: the index baked into the name must match neighbours.
      if (kind === "sand" || kind === "path" || kind === "road") {
        const same = (c: number, r: number) => {
          if (!inGrid(grid, c, r)) return true; // OOB continues the kind
          return kindAt(c, r) === kind;
        };
        const flags = flagsFor(same, col, row);
        const expected = `${kind === "sand" ? "sand" : kind}-${autotileIndex(flags)}`;
        if (img !== expected) {
          violations.push({
            col,
            row,
            rule: "autotile-mismatch",
            detail: `"${img}" should be "${expected}" for its neighbourhood`,
          });
        }
        // A fully isolated autotile cell indexes as a centre tile (5), so the
        // index audit alone can't catch floating specks — check connectivity.
        if (!flags.north && !flags.east && !flags.south && !flags.west) {
          violations.push({ col, row, rule: "autotile-isolated", detail: `floating ${kind} speck` });
        }
      }

      if (kind === "water") {
        const water = (c: number, r: number) => !inGrid(grid, c, r) || kindAt(c, r) === "water";
        const flags = flagsFor(water, col, row);
        // Live-map smoothing invariants.
        const inWaterSquare = (
          [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ] as const
        ).some(([dx, dy]) => water(col + dx, row) && water(col, row + dy) && water(col + dx, row + dy));
        if (!inWaterSquare) {
          violations.push({ col, row, rule: "water-square", detail: "water tile outside any 2×2 water square" });
        }
        const kissing =
          (!flags.north && !flags.east && flags.northEast) ||
          (!flags.north && !flags.west && flags.northWest) ||
          (!flags.south && !flags.east && flags.southEast) ||
          (!flags.south && !flags.west && flags.southWest);
        if (kissing) {
          violations.push({ col, row, rule: "water-kissing-corner", detail: "diagonal water with no cardinal bridge" });
        }
        const expected = expectedPond(flags);
        if (expected.exact && img !== expected.exact) {
          violations.push({ col, row, rule: "water-autotile", detail: `"${img}" should be "${expected.exact}"` });
        }
        if (expected.prefix && !img.startsWith(expected.prefix)) {
          violations.push({ col, row, rule: "water-autotile", detail: `"${img}" should be a "${expected.prefix}*" ripple` });
        }
        if (!grid[row][col].solid) {
          violations.push({ col, row, rule: "water-solidity", detail: "water must be solid" });
        }
      }
    }
  }

  // --- formations ------------------------------------------------------------
  const consumed = new Set<string>();
  for (const formation of FORMATIONS) {
    const anchor = formation.slots[0];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (grid[row][col].img2 !== anchor) continue;
        let complete = true;
        for (let slot = 0; slot < formation.slots.length; slot += 1) {
          const c = col + (slot % formation.width);
          const r = row + Math.floor(slot / formation.width);
          if (!inGrid(grid, c, r) || grid[r][c].img2 !== formation.slots[slot]) {
            complete = false;
            break;
          }
        }
        if (!complete) continue; // orphan-part check below reports the pieces
        for (let slot = 0; slot < formation.slots.length; slot += 1) {
          const c = col + (slot % formation.width);
          const r = row + Math.floor(slot / formation.width);
          consumed.add(`${c},${r}`);
          const tile = grid[r][c];
          if (kindAt(c, r) !== formation.ground) {
            violations.push({
              col: c,
              row: r,
              rule: "formation-ground",
              detail: `${formation.id} stands on "${tile.img}" (needs ${formation.ground})`,
            });
          }
          const shouldWalk = formation.walkableSlots.includes(slot);
          if (shouldWalk && tile.solid) {
            violations.push({ col: c, row: r, rule: "formation-door", detail: `${formation.id} doorway must be walkable` });
          }
          if (!shouldWalk && !tile.solid) {
            violations.push({ col: c, row: r, rule: "formation-solidity", detail: `${formation.id} body must be solid` });
          }
        }
      }
    }
  }

  // --- overlays ---------------------------------------------------------------
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const tile = grid[row][col];
      const img2 = tile.img2;
      if (!img2) continue;

      for (const banned of BANNED_OVERLAYS) {
        if (banned.pattern.test(img2)) {
          violations.push({ col, row, rule: "overlay-banned", detail: `${img2}: ${banned.label}` });
        }
      }

      // Hidden items copy their ground tile so nothing shows.
      if (tile.feature === "hidden-item") {
        if (img2 !== tile.img) {
          violations.push({ col, row, rule: "hidden-item", detail: `overlay "${img2}" must copy ground "${tile.img}"` });
        }
        continue;
      }

      const part = FORMATION_PART.get(img2);
      if (part) {
        if (!consumed.has(`${col},${row}`)) {
          violations.push({
            col,
            row,
            rule: "formation-incomplete",
            detail: `${img2} outside a complete ${part.formation.id} formation`,
          });
        }
        continue;
      }

      const rule = OVERLAY_RULES.find((candidate) => candidate.pattern.test(img2));
      if (!rule) {
        violations.push({ col, row, rule: "overlay-unknown", detail: `no legality rule covers overlay "${img2}"` });
        continue;
      }
      const kind = kindAt(col, row);
      if (!kind || !rule.grounds.includes(kind)) {
        violations.push({
          col,
          row,
          rule: "overlay-ground",
          detail: `"${img2}" (${rule.label}) is illegal on "${grid[row][col].img}"`,
        });
      }
    }
  }

  return violations;
}

/** Compact one-line summary used by tests for readable failure output. */
export function formatViolations(id: string, violations: Violation[]): string {
  return violations
    .slice(0, 12)
    .map((entry) => `${id} (${entry.col},${entry.row}) [${entry.rule}] ${entry.detail}`)
    .join("\n");
}
