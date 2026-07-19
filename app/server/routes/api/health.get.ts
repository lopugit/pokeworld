import { defineEventHandler } from "nitro/h3";
import {
  isMapBlockStorageConfigured,
  mapBlockStorageProvider,
} from "../../services/map/block-store";
import { isMongoConfigured } from "../../services/map/mongo";

export default defineEventHandler(() => ({
  app: "pokeworld",
  mapStorageConfigured: isMapBlockStorageConfigured(),
  mapStorageProvider: mapBlockStorageProvider(),
  mongoConfigured: isMongoConfigured(),
  status: "ok",
  workflowWorld: process.env.WORKFLOW_TARGET_WORLD || "auto",
}));
