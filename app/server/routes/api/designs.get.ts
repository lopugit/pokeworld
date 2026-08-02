import { defineEventHandler, getQuery } from "nitro/h3";
import { DesignStoreError, listDesigns } from "../../services/designs/store";
import { jsonResponse } from "../../utils/http";

// Public, searchable index of community-saved designs.
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
    const text = String(first(query.q) ?? "").slice(0, 200);
    const page = await listDesigns({
      query: text || undefined,
      biome: String(first(query.biome) ?? "").slice(0, 32) || undefined,
      tag: String(first(query.tag) ?? "").slice(0, 64) || undefined,
      author: String(first(query.author) ?? "").slice(0, 64) || undefined,
      page: Number(first(query.page) ?? 1),
      limit: Number(first(query.limit) ?? 24),
    });
    return jsonResponse(page);
  } catch (error) {
    // Never echo raw internal errors (driver messages can embed infra details).
    if (error instanceof DesignStoreError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }
    return jsonResponse({ error: "Designs are unavailable right now" }, { status: 500 });
  }
});
