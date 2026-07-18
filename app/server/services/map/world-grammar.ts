import type { TerrainKind } from "./terrain-classifier";

export type StructureRole =
  | "tree"
  | "shrub"
  | "rock"
  | "flower"
  | "long-grass"
  | "ledge"
  | "sign"
  | "hidden-item"
  | "clear";

export type StructureCell = Readonly<{
  x: number;
  y: number;
  role: StructureRole;
}>;

export type StructurePreset = Readonly<{
  id: string;
  width: number;
  height: number;
  cells: readonly StructureCell[];
}>;

type TerrainCounts = Partial<Record<TerrainKind, number>>;

const recipeHash = (x: number, y: number, salt: string): number => {
  let value = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b);
  value ^= Math.imul((y | 0) ^ 0xc2b2ae35, 0x27d4eb2d);
  for (let index = 0; index < salt.length; index += 1) {
    value = Math.imul(value ^ salt.charCodeAt(index), 0x165667b1);
  }
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
};

const choose = <T>(values: readonly T[], x: number, y: number, salt: string): T =>
  values[Math.min(values.length - 1, Math.floor(recipeHash(x, y, salt) * values.length))];

export const BIOME_PRESETS = [
  { id: "emerald-meadow", forestThreshold: 0.79, detailBias: 0.02 },
  { id: "petal-woodland", forestThreshold: 0.5, detailBias: 0.08 },
  { id: "granite-highland", forestThreshold: 0.65, detailBias: 0.04 },
  { id: "tidal-green", forestThreshold: 0.73, detailBias: 0.05 },
  { id: "village-green", forestThreshold: 0.84, detailBias: -0.03 },
  { id: "wild-route", forestThreshold: 0.68, detailBias: 0.06 },
] as const;

export const DETAIL_PALETTES = [
  { id: "blossom", flowers: 0.24, longGrass: 0.3, rocks: 0.08 },
  { id: "forage", flowers: 0.12, longGrass: 0.42, rocks: 0.1 },
  { id: "thicket", flowers: 0.08, longGrass: 0.48, rocks: 0.07 },
  { id: "stone-and-fern", flowers: 0.1, longGrass: 0.31, rocks: 0.17 },
  { id: "route-garden", flowers: 0.2, longGrass: 0.26, rocks: 0.09 },
  { id: "classic-hoenn", flowers: 0.15, longGrass: 0.35, rocks: 0.11 },
] as const;

export const ROUTE_TREATMENTS = [
  { id: "signed", signs: 2, ledges: 1 },
  { id: "hedged", signs: 1, ledges: 1 },
  { id: "terraced", signs: 1, ledges: 2 },
] as const;

const cells = (rows: readonly string[]): StructureCell[] => {
  const roles: Record<string, StructureRole> = {
    T: "tree",
    S: "shrub",
    R: "rock",
    F: "flower",
    G: "long-grass",
    L: "ledge",
    N: "sign",
    H: "hidden-item",
    ".": "clear",
  };
  return rows.flatMap((row, y) =>
    [...row].flatMap((token, x) => (roles[token] ? [{ x, y, role: roles[token] }] : [])),
  );
};

export const STRUCTURE_PRESETS: readonly StructurePreset[] = [
  {
    id: "stone-circle",
    width: 5,
    height: 5,
    cells: cells([".R.R.", "R...R", "..H..", "R...R", ".R.R."]),
  },
  {
    id: "berry-alcove",
    width: 5,
    height: 5,
    cells: cells(["TTTTT", "T...T", "TFFF.", "T.GG.", "TT.TT"]),
  },
  {
    id: "ranger-clearing",
    width: 5,
    height: 5,
    cells: cells(["S...S", ".F.F.", "..N..", ".G.G.", "S...S"]),
  },
  {
    id: "ledge-garden",
    width: 5,
    height: 4,
    cells: cells(["S...S", "FFFFF", "LLLLL", "..G.."]),
  },
  {
    id: "pocket-orchard",
    width: 7,
    height: 5,
    cells: cells(["TTTTTTT", "T.....T", "T.TTT.T", "T.H...T", "TTT.TTT"]),
  },
  {
    id: "flower-maze",
    width: 7,
    height: 5,
    cells: cells(["FF.F.FF", "...F...", "F.F.F.F", "F...F.F", "FFF.FFF"]),
  },
  {
    id: "cave-approach",
    width: 5,
    height: 5,
    cells: cells(["R...R", ".R.R.", "G...G", "GG.GG", "..N.."]),
  },
  {
    id: "secret-grove",
    width: 7,
    height: 7,
    cells: cells(["TTTTTTT", "T.....T", "T.TTT.T", "T.THT.T", "T.T...T", "T...T.T", "TTT.TTT"]),
  },
] as const;

export const SECRET_PATH_PATTERNS = ["hook", "elbow", "switchback", "notch", "spiral-pocket"] as const;

// The stable, authored grammar deliberately exposes 864 recipe combinations.
// Coordinate noise and the five path shapes add local variation without making
// the acceptance number depend on random samples.
export const WORLD_RECIPE_COUNT =
  BIOME_PRESETS.length *
  STRUCTURE_PRESETS.length *
  DETAIL_PALETTES.length *
  ROUTE_TREATMENTS.length;

export type WorldProfile = Readonly<{
  biome: (typeof BIOME_PRESETS)[number];
  structure: StructurePreset;
  detailPalette: (typeof DETAIL_PALETTES)[number];
  routeTreatment: (typeof ROUTE_TREATMENTS)[number];
  secretPattern: (typeof SECRET_PATH_PATTERNS)[number];
  recipeId: string;
}>;

const selectBiome = (x: number, y: number, counts: TerrainCounts) => {
  const total = Math.max(
    1,
    Object.values(counts).reduce<number>((sum, value) => sum + (value ?? 0), 0),
  );
  if ((counts.building ?? 0) / total >= 0.08) return BIOME_PRESETS[4];
  if ((counts.water ?? 0) / total >= 0.22) return BIOME_PRESETS[3];
  if ((counts.mountain ?? 0) / total >= 0.14) return BIOME_PRESETS[2];
  if ((counts.natural ?? 0) / total >= 0.34) return BIOME_PRESETS[1];
  return choose([BIOME_PRESETS[0], BIOME_PRESETS[5]], x, y, "biome");
};

export function selectWorldProfile(
  blockX: number,
  blockY: number,
  terrainCounts: TerrainCounts,
): WorldProfile {
  const biome = selectBiome(blockX, blockY, terrainCounts);
  const structure = choose(STRUCTURE_PRESETS, blockX, blockY, "structure");
  const detailPalette = choose(DETAIL_PALETTES, blockX, blockY, "details");
  const routeTreatment = choose(ROUTE_TREATMENTS, blockX, blockY, "route-treatment");
  const secretPattern = choose(SECRET_PATH_PATTERNS, blockX, blockY, "secret-path");
  return {
    biome,
    structure,
    detailPalette,
    routeTreatment,
    secretPattern,
    recipeId: [biome.id, structure.id, detailPalette.id, routeTreatment.id].join("/"),
  };
}
