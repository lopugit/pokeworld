// @ts-nocheck -- pngjs is CommonJS and ships without project-local TypeScript declarations.
import { PNG } from "pngjs";

export type TerrainKind =
  | "grass"
  | "natural"
  | "mountain"
  | "water"
  | "road"
  | "path"
  | "building"
  | "sand";

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface TerrainSample {
  terrain: TerrainKind;
  confidence: number;
  coverage: Record<TerrainKind, number>;
}

type PixelKind = TerrainKind | "ground";
type Rgb = readonly [number, number, number];

export const GOOGLE_STATIC_MAP_STYLES = [
  "feature:all|element:labels|visibility:off",
  "feature:poi|element:labels.icon|visibility:off",
  "feature:water|element:geometry|color:0x5aa9e6",
  "feature:road|element:geometry|color:0xd7e0e8",
  "feature:road.local|element:geometry|color:0xe9dcc0",
  "feature:poi.park|element:geometry|color:0x70c0a0",
  "feature:landscape.natural.landcover|element:geometry|color:0x70c0a0",
  "feature:landscape.natural.terrain|element:geometry|color:0x8aa06f",
  "feature:transit|visibility:off",
] as const;

const PIXEL_PALETTE: ReadonlyArray<{ kind: PixelKind; rgb: Rgb }> = [
  { kind: "water", rgb: [90, 169, 230] },
  { kind: "road", rgb: [215, 224, 232] },
  { kind: "path", rgb: [233, 220, 192] },
  { kind: "natural", rgb: [112, 192, 160] },
  { kind: "mountain", rgb: [138, 160, 111] },
  { kind: "building", rgb: [233, 234, 239] },
  { kind: "sand", rgb: [216, 200, 128] },
  { kind: "ground", rgb: [250, 245, 235] },
] as const;

const TERRAIN_KINDS: TerrainKind[] = [
  "grass",
  "natural",
  "mountain",
  "water",
  "road",
  "path",
  "building",
  "sand",
];

const MINIMUM_COVERAGE: Partial<Record<TerrainKind, number>> = {
  water: 0.18,
  road: 0.15,
  path: 0.15,
  building: 0.22,
  mountain: 0.28,
  natural: 0.3,
  sand: 0.3,
};

const CLASSIFICATION_PRIORITY: TerrainKind[] = [
  "water",
  "road",
  "path",
  "building",
  "mountain",
  "natural",
  "sand",
];

const roundCoverage = (value: number) => Math.round(value * 10_000) / 10_000;

const emptyCoverage = (): Record<TerrainKind, number> => ({
  grass: 0,
  natural: 0,
  mountain: 0,
  water: 0,
  road: 0,
  path: 0,
  building: 0,
  sand: 0,
});

function nearestPixelKind(
  r: number,
  g: number,
  b: number,
  cache?: Map<number, PixelKind>,
): PixelKind {
  const packed = (r << 16) | (g << 8) | b;
  const cached = cache?.get(packed);
  if (cached) return cached;
  let nearest: PixelKind = "ground";
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of PIXEL_PALETTE) {
    const red = r - candidate.rgb[0];
    const green = g - candidate.rgb[1];
    const blue = b - candidate.rgb[2];
    const distance = red * red + green * green + blue * blue;
    if (distance < nearestDistance) {
      nearest = candidate.kind;
      nearestDistance = distance;
    }
  }
  // Styled Google map images repeat a compact palette. Caching those colours
  // avoids re-running eight distance calculations for every one of 262k pixels.
  if (cache && cache.size < 8_192) cache.set(packed, nearest);
  return nearest;
}

function classifyCounts(counts: Record<PixelKind, number>, total: number): TerrainSample {
  const coverage = emptyCoverage();
  for (const kind of TERRAIN_KINDS) coverage[kind] = roundCoverage(counts[kind] / total);
  coverage.grass = roundCoverage((counts.grass + counts.ground) / total);

  const terrain =
    CLASSIFICATION_PRIORITY.find(
      (kind) => coverage[kind] >= (MINIMUM_COVERAGE[kind] ?? Number.POSITIVE_INFINITY),
    ) ?? "grass";

  return {
    terrain,
    confidence: coverage[terrain],
    coverage,
  };
}

export function classifyTerrainTiles(
  source: RgbaImage,
  options: { tileSize?: number; fallback?: boolean } = {},
): TerrainSample[][] {
  const tileSize = options.tileSize ?? 32;
  if (
    !Number.isInteger(tileSize) ||
    tileSize < 1 ||
    source.width % tileSize !== 0 ||
    source.height % tileSize !== 0
  ) {
    throw new RangeError(`${source.width}x${source.height} cannot be divided into ${tileSize}px tiles`);
  }

  const expectedLength = source.width * source.height * 4;
  if (source.data.length < expectedLength) {
    throw new RangeError(`RGBA buffer contains ${source.data.length} bytes; expected ${expectedLength}`);
  }

  const rows = source.height / tileSize;
  const columns = source.width / tileSize;
  if (options.fallback) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => ({
        terrain: "grass" as const,
        confidence: 1,
        coverage: { ...emptyCoverage(), grass: 1 },
      })),
    );
  }

  const pixelKindCache = new Map<number, PixelKind>();

  return Array.from({ length: rows }, (_, tileY) =>
    Array.from({ length: columns }, (_, tileX) => {
      const counts: Record<PixelKind, number> = {
        grass: 0,
        natural: 0,
        mountain: 0,
        water: 0,
        road: 0,
        path: 0,
        building: 0,
        sand: 0,
        ground: 0,
      };

      for (let pixelY = tileY * tileSize; pixelY < (tileY + 1) * tileSize; pixelY += 1) {
        let index = (pixelY * source.width + tileX * tileSize) * 4;
        const rowEnd = index + tileSize * 4;
        for (; index < rowEnd; index += 4) {
          counts[
            nearestPixelKind(
              source.data[index],
              source.data[index + 1],
              source.data[index + 2],
              pixelKindCache,
            )
          ] += 1;
        }
      }

      return classifyCounts(counts, tileSize * tileSize);
    }),
  );
}

export function classifyTerrainPng(
  input: Buffer | Uint8Array,
  options: { tileSize?: number; fallback?: boolean } = {},
) {
  const image = PNG.sync.read(input);
  return classifyTerrainTiles(image, options);
}

export function summarizeTerrain(samples: TerrainSample[][]): Record<TerrainKind, number> {
  const summary = Object.fromEntries(TERRAIN_KINDS.map((kind) => [kind, 0])) as Record<TerrainKind, number>;
  for (const row of samples) {
    for (const sample of row) summary[sample.terrain] += 1;
  }
  return summary;
}

export function centeredCropRect(sourceWidth: number, sourceHeight: number, size = 512) {
  if (sourceWidth < size || sourceHeight < size) {
    throw new RangeError(`Cannot center-crop ${size}x${size} from ${sourceWidth}x${sourceHeight}`);
  }
  return {
    left: Math.floor((sourceWidth - size) / 2),
    top: Math.floor((sourceHeight - size) / 2),
    width: size,
    height: size,
  };
}
