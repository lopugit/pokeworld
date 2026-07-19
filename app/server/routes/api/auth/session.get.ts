import { defineEventHandler } from "nitro/h3";
import { privateJson, readPokeworldSession } from "../../../services/auth/http";

export default defineEventHandler((event) => {
  try {
    const session = readPokeworldSession(event);
    if (session) return privateJson(event, session);
    return privateJson(event, { authenticated: false, isAdmin: false, user: null });
  } catch {
    return privateJson(event, { error: "Pokeworld sessions are not configured" }, 503);
  }
});
