import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSpawnOverrides,
  resetSpawnOverride,
  saveSpawnOverride,
} from "../src/lib/spawn-rules-api";

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
});

describe("spawn-rules admin API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches overrides from GET /api/admin/spawn-rules", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ overrides: [{ speciesId: 25, rules: [] }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSpawnOverrides()).resolves.toEqual([{ speciesId: 25, rules: [] }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/spawn-rules",
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.objectContaining({ accept: "application/json" }),
      }),
    );
  });

  it("returns an empty list when the payload has no overrides array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    await expect(fetchSpawnOverrides()).resolves.toEqual([]);
  });

  it("PUTs an override and returns the saved document", async () => {
    const override = { speciesId: 25, rules: [] };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ override: { ...override, updated: 123 } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(saveSpawnOverride(override)).resolves.toEqual({ ...override, updated: 123 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/spawn-rules");
    expect(init.method).toBe("PUT");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(override);
  });

  it("DELETEs by speciesId and reports deletion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ deleted: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(resetSpawnOverride(25)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/spawn-rules?speciesId=25");
    expect(init.method).toBe("DELETE");
  });

  it("throws the server {error} message on !ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "ADMIN ONLY" }, false, 403)),
    );
    await expect(fetchSpawnOverrides()).rejects.toThrow("ADMIN ONLY");
  });

  it("falls back to a generic error when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      }),
    );
    await expect(resetSpawnOverride(1)).rejects.toThrow("Spawn rule request failed");
  });
});
