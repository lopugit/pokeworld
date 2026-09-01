import { defineEventHandler, getRouterParam, setResponseHeader, setResponseStatus } from "nitro/h3";
import { getInvite, toPublicInvite } from "../../../services/invites/store";

// Public: whoever opens an invite link needs its greeting data. Only the
// invitee name and the inviter's display name are exposed.
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "content-type", "application/json; charset=utf-8");
  setResponseHeader(event, "cache-control", "public, max-age=300");
  const id = getRouterParam(event, "id") ?? "";
  const invite = await getInvite(id);
  if (!invite) {
    setResponseStatus(event, 404);
    return { error: "This invite does not exist" };
  }
  return { invite: toPublicInvite(invite) };
});
