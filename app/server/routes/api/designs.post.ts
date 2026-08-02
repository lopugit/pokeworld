import { defineEventHandler, readBody } from "nitro/h3";
import {
  AuthHttpError,
  privateJson,
  readPokeworldSession,
  requireSameOrigin,
} from "../../services/auth/http";
import { DesignStoreError, saveDesign } from "../../services/designs/store";

interface SaveBody {
  family?: unknown;
  seed?: unknown;
  name?: unknown;
  remixOf?: unknown;
}

// Save a remixed design to the signed-in trainer's account.
export default defineEventHandler(async (event) => {
  try {
    requireSameOrigin(event);
    const session = readPokeworldSession(event);
    if (!session) throw new AuthHttpError("Sign in with Thingtime to save designs", 401);

    const body = await readBody<SaveBody>(event);
    if (typeof body?.family !== "string" || typeof body?.seed !== "number") {
      throw new DesignStoreError("A design {family, seed} recipe is required", 400);
    }
    const design = await saveDesign({
      family: body.family,
      seed: body.seed,
      name: typeof body.name === "string" ? body.name : undefined,
      remixOf: typeof body.remixOf === "string" ? body.remixOf : undefined,
      author: { id: session.user.id, username: session.user.username },
    });
    return privateJson(event, { design }, 201);
  } catch (error) {
    if (error instanceof AuthHttpError || error instanceof DesignStoreError) {
      return privateJson(event, { error: error.message }, error.status);
    }
    return privateJson(event, { error: "The design could not be saved" }, 500);
  }
});
