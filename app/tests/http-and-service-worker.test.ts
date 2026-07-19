import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { errorResponse, jsonResponse } from "../server/utils/http";

describe("API response caching", () => {
  it("marks successful and error responses as non-cacheable", () => {
    expect(jsonResponse({ status: "ok" }).headers.get("cache-control")).toBe("no-store");
    expect(errorResponse(new Error("boom")).headers.get("cache-control")).toBe("no-store");
  });
});

describe("service worker API isolation", () => {
  const workerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  it("invalidates the previous cache and bypasses API routes", () => {
    expect(workerSource).toContain('const CACHE_NAME = "pokeworld-v3"');
    expect(workerSource).toContain('url.pathname.startsWith("/api/")');
    expect(workerSource).toContain('url.pathname.startsWith("/v1/")');
    expect(appSource).toContain('navigator.serviceWorker.register("/sw.js?v=3")');
  });
});
