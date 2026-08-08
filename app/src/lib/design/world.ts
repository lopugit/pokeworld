// Multi-block world generation: neighbouring design blocks merge seamlessly
// because every block's ground is painted into ONE supergrid and the
// autotile/water baking runs globally — shorelines, paths and sand continue
// across block boundaries by construction, not by luck.
//
// Determinism contract: a block generated inside a world makes exactly the
// same RNG draws as the standalone design with the same {family, seed}
// (baking is RNG-free), so a design is recognisably "itself" in a world; only
// cells near seams may differ where global smoothing legalised the join.
//
// Ground compatibility: rocky has no transition art to any other ground
// (see LEGALITY.md), so rocky blocks may only neighbour rocky blocks. Specs
// that break the matrix are reported as conflicts instead of rendering an
// illegal seam.

import { FAMILY_BY_ID } from "./registry";
import { groundKindOf } from "./legality";
import { bakeGround, newGrid, newGround, type Ground, type GroundMap } from "./paint";
import { createRng } from "./rng";
import { DESIGN_GRID, type DesignEntity, type DesignSpec, type DesignTile } from "./types";

export interface WorldEntity extends DesignEntity {
  /** Which block of the world grid this entity belongs to. */
  blockCol: number;
  blockRow: number;
}

export interface WorldConflict {
  /** Block coordinates of the incompatible pair (a is left/top). */
  a: { col: number; row: number; family: string };
  b: { col: number; row: number; family: string };
  reason: string;
}

export interface GeneratedWorld {
  ok: boolean;
  conflicts: WorldConflict[];
  /** Blocks across / down. */
  blockCols: number;
  blockRows: number;
  /** Full supergrid (blockRows*16 rows × blockCols*16 cols) when ok. */
  tiles: DesignTile[][];
  entities: WorldEntity[];
}

/** "rocky" families paint full-bleed rocky ground; "open" families paint the
 * grass-connected vocabulary. The probe generates one ground map and checks
 * the border cells — cached per family. */
const profileCache = new Map<string, "rocky" | "open">();

export function familyGroundProfile(familyId: string): "rocky" | "open" {
  const cached = profileCache.get(familyId);
  if (cached) return cached;
  const family = FAMILY_BY_ID.get(familyId);
  let profile: "rocky" | "open" = "open";
  if (family) {
    const rng = createRng(family.id, 0);
    const ctx = { rng, ground: newGround(), grid: newGrid(), entities: [] as DesignEntity[] };
    family.paintGround(ctx);
    outer: for (let row = 0; row < DESIGN_GRID; row += 1) {
      for (let col = 0; col < DESIGN_GRID; col += 1) {
        if (row !== 0 && row !== DESIGN_GRID - 1 && col !== 0 && col !== DESIGN_GRID - 1) continue;
        if (ctx.ground[row][col] === "rocky") {
          profile = "rocky";
          break outer;
        }
      }
    }
  }
  profileCache.set(familyId, profile);
  return profile;
}

/** Families whose blocks may legally sit next to the given family's blocks. */
export function compatibleFamilies(familyId: string): string[] {
  const profile = familyGroundProfile(familyId);
  return [...FAMILY_BY_ID.keys()].filter((id) => familyGroundProfile(id) === profile);
}

/**
 * Generate a world from a rectangular grid of design specs (null = plain
 * grass filler). Ground paints per block into a shared supergrid, seams are
 * checked against the ground-compat matrix, water smoothing and autotiling
 * bake globally, then every block decorates itself inside its own window.
 */
export function generateWorld(specs: ReadonlyArray<ReadonlyArray<DesignSpec | null>>): GeneratedWorld {
  const blockRows = specs.length;
  const blockCols = specs[0]?.length ?? 0;
  const width = blockCols * DESIGN_GRID;
  const height = blockRows * DESIGN_GRID;

  interface BlockState {
    spec: DesignSpec | null;
    rng: ReturnType<typeof createRng> | null;
    entities: DesignEntity[];
  }

  const superGround: GroundMap = newGround("grass", width, height);
  const states: BlockState[][] = [];

  for (let br = 0; br < blockRows; br += 1) {
    states.push([]);
    for (let bc = 0; bc < blockCols; bc += 1) {
      const spec = specs[br][bc];
      const family = spec ? FAMILY_BY_ID.get(spec.family) : undefined;
      if (!spec || !family) {
        states[br].push({ spec: null, rng: null, entities: [] });
        continue;
      }
      const rng = createRng(family.id, spec.seed);
      const blockGround = newGround();
      family.paintGround({ rng, ground: blockGround, grid: newGrid(), entities: [] });
      for (let row = 0; row < DESIGN_GRID; row += 1) {
        for (let col = 0; col < DESIGN_GRID; col += 1) {
          superGround[br * DESIGN_GRID + row][bc * DESIGN_GRID + col] = blockGround[row][col];
        }
      }
      states[br].push({ spec, rng, entities: [] });
    }
  }

  // Ground-compat matrix at block seams: rocky may only meet rocky.
  const conflicts: WorldConflict[] = [];
  const seamConflict = (aCol: number, aRow: number, bCol: number, bRow: number) => {
    const a = specs[aRow][aCol];
    const b = specs[bRow][bCol];
    const aProfile = a ? familyGroundProfile(a.family) : "open";
    const bProfile = b ? familyGroundProfile(b.family) : "open";
    if (aProfile === bProfile) return;
    conflicts.push({
      a: { col: aCol, row: aRow, family: a?.family ?? "(grass)" },
      b: { col: bCol, row: bRow, family: b?.family ?? "(grass)" },
      reason: "rocky ground has no transition art to grass-family ground — rocky blocks may only neighbour rocky blocks",
    });
  };
  for (let br = 0; br < blockRows; br += 1) {
    for (let bc = 0; bc < blockCols; bc += 1) {
      if (bc + 1 < blockCols) seamConflict(bc, br, bc + 1, br);
      if (br + 1 < blockRows) seamConflict(bc, br, bc, br + 1);
    }
  }
  if (conflicts.length) {
    return { ok: false, conflicts, blockCols, blockRows, tiles: [], entities: [] };
  }

  // Global bake: per-cell water fallback comes from the owning block's family.
  const superGrid = newGrid(width, height);
  const fallbackFor = (col: number, row: number): Ground => {
    const spec = specs[Math.floor(row / DESIGN_GRID)]?.[Math.floor(col / DESIGN_GRID)];
    const family = spec ? FAMILY_BY_ID.get(spec.family) : undefined;
    return family?.waterFallback ?? "grass";
  };
  bakeGround(superGrid, superGround, fallbackFor);

  // Per-block decoration inside a window of shared tile references.
  const entities: WorldEntity[] = [];
  for (let br = 0; br < blockRows; br += 1) {
    for (let bc = 0; bc < blockCols; bc += 1) {
      const state = states[br][bc];
      if (!state.spec || !state.rng) continue;
      const family = FAMILY_BY_ID.get(state.spec.family)!;
      const gridView: DesignTile[][] = [];
      const groundView: GroundMap = [];
      for (let row = 0; row < DESIGN_GRID; row += 1) {
        gridView.push(superGrid[br * DESIGN_GRID + row].slice(bc * DESIGN_GRID, (bc + 1) * DESIGN_GRID));
        groundView.push(superGround[br * DESIGN_GRID + row].slice(bc * DESIGN_GRID, (bc + 1) * DESIGN_GRID));
      }
      const ctx = { rng: state.rng, ground: groundView, grid: gridView, entities: state.entities };
      family.decorate(ctx);
      for (const entity of state.entities) {
        entities.push({ ...entity, blockCol: bc, blockRow: br, col: entity.col + bc * DESIGN_GRID, row: entity.row + br * DESIGN_GRID });
      }
    }
  }

  return { ok: true, conflicts: [], blockCols, blockRows, tiles: superGrid, entities };
}

/** Convenience: the ground kind actually baked at a world cell (for tests). */
export function bakedGroundKind(world: GeneratedWorld, col: number, row: number) {
  return groundKindOf(world.tiles[row]?.[col]?.img);
}
