import { defineEventHandler, getRouterParam } from "nitro/h3";
import {
  AuthHttpError,
  privateJson,
  readPokeworldSession,
  requireSameOrigin,
} from "../../../services/auth/http";
import { DesignStoreError, deleteSavedDesign } from "../../../services/designs/store";

export default defineEventHandler(async (event) => {
  try {
    requireSameOrigin(event);
    const session = readPokeworldSession(event);
    if (!session) throw new AuthHttpError("Sign in with Thingtime to manage designs", 401);
    const id = String(getRouterParam(event, "id") ?? "").slice(0, 128);
    const deleted = await deleteSavedDesign(id, {
      id: session.user.id,
      isAdmin: session.isAdmin,
    });
    if (!deleted) return privateJson(event, { error: "Design not found" }, 404);
    return privateJson(event, { deleted: true });
  } catch (error) {
    if (error instanceof AuthHttpError || error instanceof DesignStoreError) {
      return privateJson(event, { error: error.message }, error.status);
    }
    return privateJson(event, { error: "The design could not be deleted" }, 500);
  }
});
