// Shared types for the /design world-builder: generated example blocks,
// remixable design specs, and saved community designs.

export const DESIGN_GRID = 16;

// Screen-order diorama tile: row 0 is the TOP of the block (unlike live map
// tiles, whose world y is flipped). img/img2 reference /tiles/<name>.png —
// the same visual vocabulary the live map generator emits.
export interface DesignTile {
  img?: string;
  img2?: string;
  solid?: boolean;
  feature?: string;
}

export type DesignEntityKind = "npc" | "pokemon";

export interface DesignEntity {
  kind: DesignEntityKind;
  /** Tile coordinates (col/row, screen order) the entity stands on. */
  col: number;
  row: number;
  /** npc: crop rect [x, y, w, h] into the character sheet. */
  rect?: readonly [number, number, number, number];
  /** pokemon: served sprite path. */
  src?: string;
  label: string;
}

export type BiomeId =
  | "meadow"
  | "forest"
  | "mountain"
  | "waterside"
  | "desert"
  | "village";

export const BIOME_LABELS: Record<BiomeId, string> = {
  meadow: "Meadow",
  forest: "Forest",
  mountain: "Mountain",
  waterside: "Waterside",
  desert: "Desert",
  village: "Village",
};

/** The remixable recipe — everything needed to regenerate a design anywhere. */
export interface DesignSpec {
  family: string;
  seed: number;
}

export interface GeneratedDesign extends DesignSpec {
  id: string;
  name: string;
  familyLabel: string;
  biome: BiomeId;
  tags: string[];
  description: string;
  tiles: DesignTile[][];
  entities: DesignEntity[];
}

/** Lightweight card/search data — tiles omitted (regenerated on demand). */
export interface DesignSummary extends DesignSpec {
  id: string;
  name: string;
  familyLabel: string;
  biome: BiomeId;
  tags: string[];
  description: string;
}

/** A design saved to the platform (server document). */
export interface SavedDesign extends DesignSpec {
  id: string;
  name: string;
  familyLabel: string;
  biome: BiomeId;
  tags: string[];
  description: string;
  author: { id: string; username: string };
  createdAt: string;
  /** id of the catalog design (or saved design) this was remixed from. */
  remixOf?: string;
}
