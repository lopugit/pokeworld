import { defineEventHandler, readBody } from "nitro/h3";
import { AuthHttpError, privateJson, requireSameOrigin, setPokeworldSession } from "../../../services/auth/http";
import { exchangeThingtimeToken, ThingtimeAuthenticationError } from "../../../services/auth/thingtime";

interface LoginBody {
  token?: unknown;
}

export default defineEventHandler(async (event) => {
  try {
    const origin = requireSameOrigin(event);
    const body = await readBody<LoginBody>(event);
    if (!body || typeof body.token !== "string") {
      return privateJson(event, { error: "A Thingtime login token is required" }, 400);
    }

    const identity = await exchangeThingtimeToken(body.token, origin);
    const session = setPokeworldSession(event, identity.user);
    return privateJson(event, session);
  } catch (error) {
    if (error instanceof AuthHttpError || error instanceof ThingtimeAuthenticationError) {
      return privateJson(event, { error: error.message }, error.status);
    }
    return privateJson(event, { error: "Pokeworld could not start this session" }, 503);
  }
});
