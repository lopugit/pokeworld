import { defineEventHandler, getQuery } from "nitro/h3";
import { blockForCoordinates } from "../../services/map/coordinates";
import { errorResponse, jsonResponse } from "../../utils/http";

export default defineEventHandler((event) => {
  try {
    const query = getQuery(event);
    return jsonResponse({ block: blockForCoordinates(query.lat, query.lng) });
  } catch (error) {
    return errorResponse(error);
  }
});
