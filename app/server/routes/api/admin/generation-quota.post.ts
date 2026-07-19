import { defineEventHandler } from "nitro/h3";
import {
  AuthHttpError,
  privateJson,
  requireAdminSession,
  requireSameOrigin,
} from "../../../services/auth/http";
import { GenerationControlError } from "../../../services/map/generation-policy";
import { resetDailyGenerationQuota } from "../../../services/map/generation-quota";

export default defineEventHandler(async (event) => {
  try {
    requireSameOrigin(event);
    requireAdminSession(event);
    return privateJson(event, await resetDailyGenerationQuota());
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return privateJson(event, { error: error.message }, error.status);
    }
    if (error instanceof GenerationControlError) {
      return privateJson(event, { error: error.message, code: error.code }, error.statusCode);
    }
    return privateJson(event, { error: "Generation quota could not be reset" }, 503);
  }
});
