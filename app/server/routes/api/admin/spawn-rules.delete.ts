import { defineEventHandler, getQuery } from "nitro/h3";
import { NATIONAL_DEX_COUNT } from "../../../../src/lib/pokedex";
import {
  AuthHttpError,
  privateJson,
  requireAdminSession,
  requireSameOrigin,
} from "../../../services/auth/http";
import { deleteSpawnOverride } from "../../../services/pokemon/spawn-rules-store";

export default defineEventHandler(async (event) => {
  try {
    requireSameOrigin(event);
    requireAdminSession(event);
    const speciesId = Number(getQuery(event).speciesId);
    if (!Number.isInteger(speciesId) || speciesId < 1 || speciesId > NATIONAL_DEX_COUNT) {
      return privateJson(
        event,
        { error: `speciesId must be an integer between 1 and ${NATIONAL_DEX_COUNT}` },
        400,
      );
    }
    return privateJson(event, { deleted: await deleteSpawnOverride(speciesId) });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return privateJson(event, { error: error.message }, error.status);
    }
    return privateJson(event, { error: "Spawn rules could not be deleted" }, 503);
  }
});
