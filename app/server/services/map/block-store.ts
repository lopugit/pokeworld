import {
  GenerationControlError,
  isPublicDeployment,
} from "./generation-policy";
import { getStoredBlocks as getMongoStoredBlocks, isMongoConfigured } from "./mongo";
import {
  getThingtimeStoredBlocks,
  putThingtimeStoredBlocks,
} from "./thingtime-block-store";
import type { MapBlock } from "./types";
import { isThingtimeServiceConfigured } from "../thingtime/client";

export type MapBlockStorageProvider = "inline" | "mongo" | "thingtime";

// Tests exercise the production store-backed generation path (Thingtime, no
// Mongo) against an in-memory stand-in. Never set outside test code.
export interface MapBlockStoreOverride {
  get(coordinates: Array<{ x: number; y: number }>): Promise<MapBlock[]>;
  put(blocks: MapBlock[]): Promise<void>;
}

let storeOverrideForTests: MapBlockStoreOverride | null = null;

export function setMapBlockStoreOverrideForTests(
  store: MapBlockStoreOverride | null,
): void {
  storeOverrideForTests = store;
}

export function mapBlockStorageProvider(
  env: NodeJS.ProcessEnv = process.env,
): MapBlockStorageProvider {
  if (storeOverrideForTests) return "thingtime";
  if (isThingtimeServiceConfigured(env)) return "thingtime";
  if (!isPublicDeployment(env) && isMongoConfigured(env)) return "mongo";
  return "inline";
}

export function isMapBlockStorageConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return mapBlockStorageProvider(env) !== "inline";
}

function mapStorageUnavailable(cause: unknown): GenerationControlError {
  const error = new GenerationControlError(
    "Thingtime map-block storage is temporarily unavailable",
    503,
    "MAP_STORAGE_UNAVAILABLE",
  );
  error.cause = cause;
  return error;
}

export async function getStoredBlocks(
  coordinates: Array<{ x: number; y: number }>,
): Promise<MapBlock[] | undefined> {
  if (storeOverrideForTests) return storeOverrideForTests.get(coordinates);
  const provider = mapBlockStorageProvider();
  if (provider === "thingtime") {
    return getThingtimeStoredBlocks(coordinates).catch((error) => {
      throw mapStorageUnavailable(error);
    });
  }
  if (provider === "mongo") return getMongoStoredBlocks(coordinates);
  return undefined;
}

export async function putStoredBlocks(blocks: MapBlock[]): Promise<boolean> {
  if (storeOverrideForTests) {
    await storeOverrideForTests.put(blocks);
    return true;
  }
  const provider = mapBlockStorageProvider();
  if (provider === "thingtime") {
    await putThingtimeStoredBlocks(blocks).catch((error) => {
      throw mapStorageUnavailable(error);
    });
    return true;
  }
  // The faithful legacy generator still owns Mongo writes in local migration
  // mode. Inline mode has no durable provider.
  return provider === "mongo";
}
