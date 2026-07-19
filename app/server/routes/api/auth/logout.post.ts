import { defineEventHandler } from "nitro/h3";
import { AuthHttpError, clearPokeworldSession, privateJson, requireSameOrigin } from "../../../services/auth/http";

export default defineEventHandler((event) => {
  try {
    requireSameOrigin(event);
    clearPokeworldSession(event);
    return privateJson(event, { authenticated: false, isAdmin: false, user: null });
  } catch (error) {
    if (error instanceof AuthHttpError) return privateJson(event, { error: error.message }, error.status);
    return privateJson(event, { error: "Pokeworld could not end this session" }, 503);
  }
});
