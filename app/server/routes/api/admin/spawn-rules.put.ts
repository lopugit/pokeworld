import { defineEventHandler, readBody } from "nitro/h3";
import { normalizeSpawnOverride } from "../../../../src/lib/encounters";
import {
  AuthHttpError,
  privateJson,
  requireAdminSession,
  requireSameOrigin,
} from "../../../services/auth/http";
import { putSpawnOverride } from "../../../services/pokemon/spawn-rules-store";

export default defineEventHandler(async (event) => {
  try {
    requireSameOrigin(event);
    requireAdminSession(event);
    const body = await readBody<unknown>(event);
    const override = normalizeSpawnOverride(body);
    if (!override) {
      return privateJson(
        event,
        { error: "A valid spawn override ({ speciesId, rules }) is required" },
        400,
      );
    }
    return privateJson(event, { override: await putSpawnOverride(override) });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return privateJson(event, { error: error.message }, error.status);
    }
    return privateJson(event, { error: "Spawn rules could not be saved" }, 503);
  }
});
