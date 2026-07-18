import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as mapSource from "../server/services/map/legacy/map-source";
import { buildGoogleStaticMapUrl } from "../server/services/map/legacy/functions";

describe("fallback map provenance", () => {
  it("recognizes legacy Mongo blocks by their bundled fallback image", () => {
    const legacyFallbackMap = readFileSync(
      new URL("../map-assets/gmap.png", import.meta.url),
    ).toString("base64");

    // This guards the historical-data migration path for blocks saved before
    // mapSource/fallbackGenerated provenance tags existed.
    expect(
      mapSource.isFallbackGeneratedBlock({
        googleMap: legacyFallbackMap,
      }),
    ).toBe(true);
  });

  it("recognizes newly tagged fallback blocks", () => {
    expect(mapSource.isFallbackGeneratedBlock({ fallbackGenerated: true })).toBe(true);
    expect(mapSource.isFallbackGeneratedBlock({ mapSource: "fallback" })).toBe(true);
    expect(
      mapSource.isFallbackGeneratedBlock({
        fallbackGenerated: false,
        mapSource: "google-static-maps",
        googleMap: "real-map-data",
      }),
    ).toBe(false);
  });

  it("only retries fallback blocks when Google Static Maps is usable", () => {
    const fallbackBlock = { fallbackGenerated: true };

    expect(
      mapSource.shouldRegenerateFallbackBlock(fallbackBlock, {
        GOOGLE_API_KEY: "test-key",
      }),
    ).toBe(true);
    expect(mapSource.shouldRegenerateFallbackBlock(fallbackBlock, {})).toBe(false);
    expect(
      mapSource.shouldRegenerateFallbackBlock(fallbackBlock, {
        GOOGLE_API_KEY: "test-key",
        POKEWORLD_OFFLINE_MAP: "true",
      }),
    ).toBe(false);
  });

  it("treats blank API keys as unavailable", () => {
    expect(mapSource.canUseGoogleStaticMaps({ GOOGLE_API_KEY: "   " })).toBe(false);
  });

  it("requests a semantic png32 map without the flattening legacy map id", () => {
    const url = buildGoogleStaticMapUrl(-37.85921, 144.98228, 20, "test-key");
    expect(url.searchParams.get("size")).toBe("640x640");
    expect(url.searchParams.get("scale")).toBe("2");
    expect(url.searchParams.get("format")).toBe("png32");
    expect(url.searchParams.has("map_id")).toBe(false);
    expect(url.searchParams.getAll("style").length).toBeGreaterThanOrEqual(8);
  });
});
