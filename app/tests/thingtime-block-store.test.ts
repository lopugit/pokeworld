import { gunzipSync, gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeThingtimeBlock,
  encodeThingtimeBlock,
  getThingtimeStoredBlocks,
  putThingtimeStoredBlocks,
  thingtimeBlockId,
} from "../server/services/map/thingtime-block-store";
import { MAP_BLOCK_VERSION } from "../server/services/map/version";
import type { MapBlock } from "../server/services/map/types";

const sampleBlock = (x = 1, y = 2): MapBlock => ({
  x,
  y,
  mapSource: "google-static-maps",
  mapGeneratedAt: 123,
  tiles: Array.from({ length: 256 }, (_, index) => ({
    uuid: `tile-${index}`,
    blockX: x,
    blockY: y,
    mapX: x * 512 + (index % 16) * 32,
    mapY: y * 512 + Math.floor(index / 16) * 32,
    x: index % 16,
    y: Math.floor(index / 16),
    img: "grass.png",
    terrain: "grass",
    version: MAP_BLOCK_VERSION,
  })),
});

const env = {
  THINGTIME_API_URL: "https://thingtime.example",
  THINGTIME_SERVICE_TOKEN: "service-test",
} as NodeJS.ProcessEnv;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Thingtime map-block records", () => {
  it("round-trips one complete 16x16 block as a compressed Thing", () => {
    const block = sampleBlock(-12, 34);
    const encoded = encodeThingtimeBlock(block);

    expect(encoded.id).toBe("pwblk-v1-earth-v1-n12-p34");
    expect(encoded.crystal.tileCount).toBe(256);
    expect(encoded.crystal.encodedBytes).toBeLessThan(encoded.crystal.jsonBytes);
    expect(decodeThingtimeBlock(encoded)).toEqual(block);
  });

  it("uses unambiguous deterministic IDs for positive and negative coordinates", () => {
    expect(thingtimeBlockId(0, 0)).toBe("pwblk-v1-earth-v1-p0-p0");
    expect(thingtimeBlockId(-1, 1)).toBe("pwblk-v1-earth-v1-n1-p1");
    expect(() => thingtimeBlockId(Number.NaN, 0)).toThrow(/safe integers/);
  });

  it("rejects a valid compressed payload whose checksum was changed", () => {
    const encoded = encodeThingtimeBlock(sampleBlock());
    const json = gunzipSync(Buffer.from(encoded.extended.payload, "base64"));
    const changed = JSON.parse(json.toString("utf8")) as MapBlock;
    changed.updated = 999;
    encoded.extended.payload = gzipSync(JSON.stringify(changed)).toString("base64");

    expect(() => decodeThingtimeBlock(encoded)).toThrow(/checksum/);
  });

  it("reads deterministic Things directly and treats 404 as an unloaded block", async () => {
    const encoded = encodeThingtimeBlock(sampleBlock(1, 2));
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      const found = url.includes(encodeURIComponent(thingtimeBlockId(1, 2)));
      return new Response(
        JSON.stringify(
          found
            ? { ok: true, thing: encoded }
            : { ok: false, error: "Thing not found" },
        ),
        {
          status: found ? 200 : 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    await expect(
      getThingtimeStoredBlocks(
        [
          { x: 1, y: 2 },
          { x: 9, y: 9 },
        ],
        { env, fetchImpl: fetchImpl as typeof fetch },
      ),
    ).resolves.toEqual([sampleBlock(1, 2)]);
    expect(requested).toHaveLength(2);
    expect(requested.every((url) => url.includes("/api/v1/things?id="))).toBe(true);
  });

  it("treats an older stored block version as a cache miss to be regenerated", async () => {
    const encoded = encodeThingtimeBlock(sampleBlock());
    encoded.crystal.mapBlockVersion = "1.0.0000";
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, thing: encoded }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      getThingtimeStoredBlocks([{ x: 1, y: 2 }], {
        env,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toEqual([]);
  });

  it("retries one first-write race and then completes the idempotent PUT", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: "Already exists" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, created: false, thing: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await putThingtimeStoredBlocks([sampleBlock()], {
      env,
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        id: thingtimeBlockId(1, 2),
        crystal: { tileCount: 256 },
      });
    }
  });
});
