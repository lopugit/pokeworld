import { defineEventHandler } from "nitro/h3";
import {
  AuthHttpError,
  privateJson,
  requireAdminSession,
} from "../../../services/auth/http";
import { listSpawnOverrides } from "../../../services/pokemon/spawn-rules-store";

export default defineEventHandler(async (event) => {
  try {
    requireAdminSession(event);
    return privateJson(event, { overrides: await listSpawnOverrides() });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return privateJson(event, { error: error.message }, error.status);
    }
    return privateJson(event, { error: "Spawn rules are temporarily unavailable" }, 503);
  }
});
