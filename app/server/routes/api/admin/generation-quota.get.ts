import { defineEventHandler } from "nitro/h3";
import {
  AuthHttpError,
  privateJson,
  requireAdminSession,
} from "../../../services/auth/http";
import { GenerationControlError } from "../../../services/map/generation-policy";
import { getGenerationQuotaStatus } from "../../../services/map/generation-quota";

export default defineEventHandler(async (event) => {
  try {
    requireAdminSession(event);
    return privateJson(event, await getGenerationQuotaStatus());
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return privateJson(event, { error: error.message }, error.status);
    }
    if (error instanceof GenerationControlError) {
      return privateJson(event, { error: error.message, code: error.code }, error.statusCode);
    }
    return privateJson(event, { error: "Generation quota is temporarily unavailable" }, 503);
  }
});
