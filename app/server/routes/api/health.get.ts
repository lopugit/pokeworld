import { defineEventHandler } from "nitro/h3";
import { isMongoConfigured } from "../../services/map/mongo";

export default defineEventHandler(() => ({
  app: "pokeworld",
  mongoConfigured: isMongoConfigured(),
  status: "ok",
  workflowWorld: process.env.WORKFLOW_TARGET_WORLD || "auto",
}));
