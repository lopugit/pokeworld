import type { TerrainKind } from "./terrain-classifier";

export type MapOffset = readonly [number, number];
export type MapSource = "fallback" | "google-static-maps";

export interface MapJobInput {
  blockX: number;
  blockY: number;
  offsets: MapOffset[];
  regenerate: boolean;
}

export interface MapTile {
  uuid: string;
  blockX: number;
  blockY: number;
  mapX: number;
  mapY: number;
  x: number;
  y: number;
  img?: string;
  img2?: string;
  image?: string;
  terrain?: TerrainKind;
  terrainConfidence?: number;
  terrainCoverage?: Partial<Record<TerrainKind, number>>;
  feature?: string;
  solid?: boolean;
  updated?: number;
  version?: string;
  [key: string]: unknown;
}

export interface MapBlock {
  uuid?: string;
  x: number;
  y: number;
  lat?: number;
  lng?: number;
  mapX?: number;
  mapY?: number;
  googleMap?: string;
  mapSource?: MapSource;
  fallbackGenerated?: boolean;
  mapGeneratedAt?: number;
  terrainSummary?: Partial<Record<TerrainKind, number>>;
  tiles: MapTile[];
  updated?: number;
  [key: string]: unknown;
}

export interface MapGenerationStepResult {
  requested: { x: number; y: number };
  inlineBlock?: MapBlock;
}

export interface MapGenerationResult {
  requested: Array<{ x: number; y: number }>;
  inlineBlocks?: MapBlock[];
}
