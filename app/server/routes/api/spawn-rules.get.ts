import { defineEventHandler } from "nitro/h3";
import { listSpawnOverrides } from "../../services/pokemon/spawn-rules-store";
import { jsonResponse } from "../../utils/http";

// PUBLIC: the game merges these admin overrides over the deterministic
// default spawn rules. On storage failure an empty list is returned with
// 200 so the client falls back to defaults gracefully.
export default defineEventHandler(async () => {
  try {
    return jsonResponse({ overrides: await listSpawnOverrides() });
  } catch {
    return jsonResponse({ overrides: [] });
  }
});
