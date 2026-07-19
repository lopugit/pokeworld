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

export function mapBlockStorageProvider(
  env: NodeJS.ProcessEnv = process.env,
): MapBlockStorageProvider {
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
