import { defineEventHandler } from "nitro/h3";
import {
  isMapBlockStorageConfigured,
  mapBlockStorageProvider,
} from "../../services/map/block-store";
import { isMongoConfigured } from "../../services/map/mongo";
import { MAP_BLOCK_VERSION } from "../../services/map/version";

export default defineEventHandler(() => ({
  app: "pokeworld",
  mapBlockVersion: MAP_BLOCK_VERSION,
  mapStorageConfigured: isMapBlockStorageConfigured(),
  mapStorageProvider: mapBlockStorageProvider(),
  mongoConfigured: isMongoConfigured(),
  status: "ok",
  workflowWorld: process.env.WORKFLOW_TARGET_WORLD || "auto",
}));
