import { defineEventHandler, getQuery } from "nitro/h3";
import { listDesigns } from "../../services/designs/store";
import { jsonResponse, errorResponse } from "../../utils/http";

// Public, searchable index of community-saved designs.
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
    const text = String(first(query.q) ?? "").slice(0, 200);
    const page = await listDesigns({
      query: text || undefined,
      biome: String(first(query.biome) ?? "") || undefined,
      tag: String(first(query.tag) ?? "") || undefined,
      author: String(first(query.author) ?? "") || undefined,
      page: Number(first(query.page) ?? 1) || 1,
      limit: Number(first(query.limit) ?? 24) || 24,
    });
    return jsonResponse(page);
  } catch (error) {
    return errorResponse(error, 500);
  }
});
