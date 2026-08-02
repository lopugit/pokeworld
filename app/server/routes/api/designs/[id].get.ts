import { defineEventHandler, getRouterParam } from "nitro/h3";
import { DesignStoreError, getSavedDesign } from "../../../services/designs/store";
import { jsonResponse } from "../../../utils/http";

export default defineEventHandler(async (event) => {
  try {
    const id = String(getRouterParam(event, "id") ?? "").slice(0, 128);
    const design = await getSavedDesign(id);
    if (!design) return jsonResponse({ error: "Design not found" }, { status: 404 });
    return jsonResponse({ design });
  } catch (error) {
    if (error instanceof DesignStoreError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    return jsonResponse({ error: "Designs are unavailable right now" }, { status: 500 });
  }
});
