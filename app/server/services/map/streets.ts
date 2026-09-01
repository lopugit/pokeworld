// Real-world street names and house numbers for generated blocks.
//
// During generation (after mods, before save) each regenerated block gets a
// durable `block.streets` record: every road/path component is sampled once
// through the Google reverse-geocoding API (same GOOGLE_API_KEY as the Static
// Maps imagery) and every stitched house site is geocoded for its street
// number. Tiles are then tagged (`streetName` on road/path tiles,
// `houseNumber`/`streetName` on house + house-sign tiles) so the client can
// pop the street name on entry and read addresses off signs. The record rides
// inside the stored block, so re-stitches re-tag from cache instead of buying
// the same geocode twice; offline or key-less deployments fall back to
// deterministic procedural names flagged `source: "procedural"`.

import { MIN_LATITUDE, X_INCREMENT } from "./legacy/coordinates";
import { hashUnit } from "./legacy/mods/terrain-life";

const TILE_SIZE = 32;
const BLOCK_TILES = 16;
const BLOCK_WORLD = TILE_SIZE * BLOCK_TILES;
export const STREETS_VERSION = 1;
/** At most this many geocode calls per block (roads + houses combined). */
const MAX_LOOKUPS_PER_BLOCK = 6;
const MAX_ROAD_COMPONENTS = 3;
const GEOCODE_TIMEOUT_MS = 8_000;

type LatLng = { lat: number; lng: number };

interface StreetsTile {
  mapX: number;
  mapY: number;
  terrain?: string;
  feature?: string;
  houseSite?: string;
  streetName?: string;
  houseNumber?: string;
  [key: string]: unknown;
}

interface StreetsBlock {
  x: number;
  y: number;
  tiles?: StreetsTile[];
  streets?: BlockStreets;
  [key: string]: unknown;
}

export interface RoadStreet {
  /** World-tile grid sample the name was resolved at. */
  gridX: number;
  gridY: number;
  name: string;
}

export interface HouseAddress {
  number: string;
  street: string;
}

export interface BlockStreets {
  version: number;
  source: "google" | "procedural";
  fetchedAt: number;
  roads: RoadStreet[];
  houses: Record<string, HouseAddress>;
}

// --- world <-> lat/lng ------------------------------------------------------
// Continuous form of the legacy block math, including the half-block offset:
// imagery is fetched CENTERED on the block's SW-corner lat/lng, so the ground
// under world pixel wx/wy sits half a block west/south of the naive cell.
// (Parity with legacy/coordinates is pinned by tests/streets.test.ts.)

const projectLatitude = (latitude: number) =>
  Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 180 / 2));
const unprojectLatitude = (projected: number) =>
  ((2 * Math.atan(Math.exp(projected)) - Math.PI / 2) * 180) / Math.PI;
const Y_INDEX_SCALE = 180 / (Math.PI * X_INCREMENT);
const MIN_LATITUDE_PROJECTED = projectLatitude(MIN_LATITUDE);

/** Real-world coordinates of a world pixel position (tile centres: +16). */
export function worldPixelLatLng(worldX: number, worldY: number): LatLng {
  return {
    lng: -180 + (worldX / BLOCK_WORLD - 0.5) * X_INCREMENT,
    lat: unprojectLatitude(MIN_LATITUDE_PROJECTED + (worldY / BLOCK_WORLD - 0.5) / Y_INDEX_SCALE),
  };
}

/** Centre of a world-tile grid cell (the coordinates terrain-life plans in). */
export const gridCellLatLng = (gridX: number, gridY: number): LatLng =>
  worldPixelLatLng(gridX * TILE_SIZE + TILE_SIZE / 2, gridY * TILE_SIZE + TILE_SIZE / 2);

// --- procedural fallback ----------------------------------------------------

const PROCEDURAL_STREETS = [
  "MAPLE STREET",
  "OAK AVENUE",
  "BIRCH LANE",
  "WILLOW WAY",
  "FERN CRESCENT",
  "BERRY ROAD",
  "COVE STREET",
  "SUMMIT AVENUE",
  "MEADOW LANE",
  "HARBOUR ROAD",
];

export const proceduralStreetName = (gridX: number, gridY: number): string =>
  PROCEDURAL_STREETS[Math.floor(hashUnit(gridX, gridY, "street-name") * PROCEDURAL_STREETS.length)];

export const proceduralHouseNumber = (gridX: number, gridY: number): string =>
  String(1 + Math.floor(hashUnit(gridX, gridY, "house-number") * 98));

// --- geocoding --------------------------------------------------------------

const streetLookupsEnabled = (env = process.env) =>
  Boolean(env.GOOGLE_API_KEY?.trim()) &&
  env.POKEWORLD_OFFLINE_MAP !== "true" &&
  env.POKEWORLD_STREET_NAMES !== "false";

interface GeocodeComponent {
  long_name: string;
  short_name: string;
  types: string[];
}
interface GeocodeResult {
  types: string[];
  address_components: GeocodeComponent[];
}

async function reverseGeocode(point: LatLng, env = process.env): Promise<GeocodeResult[]> {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json" +
    `?latlng=${point.lat.toFixed(7)},${point.lng.toFixed(7)}` +
    `&key=${env.GOOGLE_API_KEY}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`geocode http ${response.status}`);
  const payload = (await response.json()) as { status: string; results?: GeocodeResult[] };
  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
    throw new Error(`geocode status ${payload.status}`);
  }
  return payload.results ?? [];
}

const componentOfType = (result: GeocodeResult, type: string) =>
  result.address_components.find((component) => component.types.includes(type));

export function extractRouteName(results: GeocodeResult[]): string | null {
  for (const result of results) {
    const route = componentOfType(result, "route");
    if (route) return route.long_name;
  }
  return null;
}

export function extractHouseAddress(results: GeocodeResult[]): HouseAddress | null {
  for (const result of results) {
    const number = componentOfType(result, "street_number");
    const route = componentOfType(result, "route");
    if (number && route) return { number: number.long_name, street: route.long_name };
  }
  const street = extractRouteName(results);
  return street ? { number: "", street } : null;
}

// --- block analysis ---------------------------------------------------------

const isRouteTile = (tile: StreetsTile) => tile.terrain === "road" || tile.terrain === "path";
const gridOf = (tile: StreetsTile) => ({
  gridX: Math.floor(tile.mapX / TILE_SIZE),
  gridY: Math.floor(tile.mapY / TILE_SIZE),
});

/** 4-connected road/path components, largest first. */
export function roadComponents(tiles: StreetsTile[]): StreetsTile[][] {
  const routeTiles = tiles.filter(isRouteTile);
  const byGrid = new Map(routeTiles.map((tile) => [`${tile.mapX},${tile.mapY}`, tile]));
  const seen = new Set<string>();
  const components: StreetsTile[][] = [];
  for (const tile of routeTiles) {
    const startKey = `${tile.mapX},${tile.mapY}`;
    if (seen.has(startKey)) continue;
    seen.add(startKey);
    const component = [tile];
    for (let index = 0; index < component.length; index += 1) {
      const current = component[index];
      for (const [dx, dy] of [
        [TILE_SIZE, 0],
        [-TILE_SIZE, 0],
        [0, TILE_SIZE],
        [0, -TILE_SIZE],
      ]) {
        const key = `${current.mapX + dx},${current.mapY + dy}`;
        const neighbour = byGrid.get(key);
        if (!neighbour || seen.has(key)) continue;
        seen.add(key);
        component.push(neighbour);
      }
    }
    components.push(component);
  }
  return components.sort((a, b) => b.length - a.length);
}

/** The component's most central tile — the sample point for its street name. */
export function componentSample(component: StreetsTile[]): StreetsTile {
  const centreX = component.reduce((sum, tile) => sum + tile.mapX, 0) / component.length;
  const centreY = component.reduce((sum, tile) => sum + tile.mapY, 0) / component.length;
  return [...component].sort(
    (a, b) =>
      Math.abs(a.mapX - centreX) + Math.abs(a.mapY - centreY) -
      (Math.abs(b.mapX - centreX) + Math.abs(b.mapY - centreY)),
  )[0];
}

const houseSites = (tiles: StreetsTile[]): string[] => [
  ...new Set(
    tiles
      .filter((tile) => typeof tile.houseSite === "string" && tile.houseSite.length)
      .map((tile) => tile.houseSite as string),
  ),
];

// --- fetch + tag ------------------------------------------------------------

async function buildBlockStreets(block: StreetsBlock, env = process.env): Promise<BlockStreets> {
  const tiles = block.tiles ?? [];
  const components = roadComponents(tiles).slice(0, MAX_ROAD_COMPONENTS);
  const sites = houseSites(tiles);
  const useGoogle = streetLookupsEnabled(env);
  let lookups = 0;
  // "google" is recorded only when a lookup actually SUCCEEDED: a key whose
  // project has the Geocoding API disabled fails every call, and stamping
  // "google" then would stop the stored block from upgrading to real names
  // once the API is switched on.
  let anyGoogleSuccess = false;

  const roads: RoadStreet[] = [];
  for (const component of components) {
    const sample = gridOf(componentSample(component));
    let name: string | null = null;
    if (useGoogle && lookups < MAX_LOOKUPS_PER_BLOCK) {
      lookups += 1;
      try {
        name = extractRouteName(await reverseGeocode(gridCellLatLng(sample.gridX, sample.gridY), env));
        if (name) anyGoogleSuccess = true;
      } catch {
        name = null;
      }
    }
    roads.push({ ...sample, name: name ?? proceduralStreetName(sample.gridX, sample.gridY) });
  }

  const houses: Record<string, HouseAddress> = {};
  for (const site of sites) {
    const [gridX, gridY] = site.split(",").map(Number);
    if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) continue;
    let address: HouseAddress | null = null;
    if (useGoogle && lookups < MAX_LOOKUPS_PER_BLOCK) {
      lookups += 1;
      try {
        address = extractHouseAddress(await reverseGeocode(gridCellLatLng(gridX, gridY), env));
        if (address) anyGoogleSuccess = true;
      } catch {
        address = null;
      }
    }
    houses[site] = address?.number
      ? address
      : {
          number: proceduralHouseNumber(gridX, gridY),
          street:
            address?.street ??
            nearestRoadName(roads, gridX, gridY) ??
            proceduralStreetName(gridX, gridY),
        };
  }

  return {
    version: STREETS_VERSION,
    source: anyGoogleSuccess ? "google" : "procedural",
    fetchedAt: Date.now(),
    roads,
    houses,
  };
}

function nearestRoadName(roads: RoadStreet[], gridX: number, gridY: number): string | null {
  let best: RoadStreet | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const road of roads) {
    const distance = Math.abs(road.gridX - gridX) + Math.abs(road.gridY - gridY);
    if (distance < bestDistance) {
      best = road;
      bestDistance = distance;
    }
  }
  return best?.name ?? null;
}

/** Stamp cached street data onto a block's tiles (idempotent, offline-safe). */
export function tagBlockTiles(block: StreetsBlock): void {
  const streets = block.streets;
  if (!streets) return;
  for (const tile of block.tiles ?? []) {
    if (isRouteTile(tile)) {
      const { gridX, gridY } = gridOf(tile);
      tile.streetName = nearestRoadName(streets.roads, gridX, gridY) ?? undefined;
    }
    const site = typeof tile.houseSite === "string" ? tile.houseSite : undefined;
    const address = site ? streets.houses[site] : undefined;
    if (address) {
      tile.houseNumber = address.number;
      tile.streetName = address.street;
    }
  }
}

/**
 * Attach street data to every regenerated block: reuse the stored record when
 * present, fetch (or procedurally derive) it otherwise, then tag the tiles.
 * Never throws — street names are decoration and must not fail generation.
 */
export async function applyStreetNames(
  blocks: StreetsBlock[],
  env = process.env,
): Promise<void> {
  for (const block of blocks) {
    try {
      if (!block.tiles?.length) continue;
      if (block.streets?.version !== STREETS_VERSION) {
        block.streets = await buildBlockStreets(block, env);
      } else if (streetLookupsEnabled(env) && block.streets.source === "procedural") {
        // A key appeared since the procedural record was stored: upgrade once.
        block.streets = await buildBlockStreets(block, env);
      }
      tagBlockTiles(block);
    } catch {
      // Leave the block untagged rather than failing the generation batch.
    }
  }
}
