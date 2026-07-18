import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as mapSource from "../server/services/map/legacy/map-source";
import {
  buildGoogleStaticMapUrl,
  getMapAtWithSource,
} from "../server/services/map/legacy/functions";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

  it("tags decoded responses from the Google Static Maps request path", async () => {
    const sourcePng = readFileSync(new URL("../map-assets/gmap.png", import.meta.url));
    vi.stubEnv("GOOGLE_API_KEY", "test-key");
    vi.stubEnv("POKEWORLD_OFFLINE_MAP", "false");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://maps.googleapis.com");
      expect(url.pathname).toBe("/maps/api/staticmap");
      return new Response(new Uint8Array(sourcePng), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMapAtWithSource(-37.85921, 144.98228, 20);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.source).toBe(mapSource.MAP_SOURCE_GOOGLE);
    expect(result.rgba).toMatchObject({ width: 512, height: 512 });
    expect(result.image.byteLength).toBeGreaterThan(0);
  });

  it("never tags a failed Google response as real Google terrain", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "test-key");
    vi.stubEnv("POKEWORLD_OFFLINE_MAP", "false");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await getMapAtWithSource(-37.85921, 144.98228, 20);

    expect(result.source).toBe(mapSource.MAP_SOURCE_FALLBACK);
    expect(result.image.byteLength).toBeGreaterThan(0);
  });
});
