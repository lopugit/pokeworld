import { defineEventHandler, readBody } from "nitro/h3";
import {
  AuthHttpError,
  privateJson,
  readPokeworldSession,
  requireSameOrigin,
} from "../../services/auth/http";
import { createInvite, InviteStoreError, toPublicInvite } from "../../services/invites/store";

interface InviteBody {
  name?: unknown;
}

// Mint an invite link for a friend, signed by the logged-in trainer.
export default defineEventHandler(async (event) => {
  try {
    requireSameOrigin(event);
    const session = readPokeworldSession(event);
    if (!session) throw new AuthHttpError("Sign in with Thingtime to invite friends", 401);

    const body = await readBody<InviteBody>(event);
    const invite = await createInvite({
      inviteeName: body?.name,
      inviter: {
        id: session.user.id,
        username: session.user.username,
        ...(session.user.displayName ? { displayName: session.user.displayName } : {}),
      },
    });
    return privateJson(event, { invite: toPublicInvite(invite) }, 201);
  } catch (error) {
    if (error instanceof AuthHttpError || error instanceof InviteStoreError) {
      return privateJson(event, { error: error.message }, error.status);
    }
    return privateJson(event, { error: "The invite could not be created" }, 500);
  }
});
