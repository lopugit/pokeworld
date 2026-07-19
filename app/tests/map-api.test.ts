import { afterEach, describe, expect, it } from "vitest";
import type { MapJobInput } from "../server/services/map/types";
import { getMapBlocks, mapJobPollPath } from "../src/lib/map-api";

const input: MapJobInput = { blockX: 5, blockY: -3, offsets: [[0, 0], [1, 0]], regenerate: false };

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("mapJobPollPath", () => {
  it("carries the original request so the server can answer from stored blocks", () => {
    const expected = new URLSearchParams({
      blockX: "5",
      blockY: "-3",
      offsets: JSON.stringify(input.offsets),
    });
    expect(mapJobPollPath("wrun_1", input)).toBe(`/api/map-jobs/wrun_1?${expected}`);
  });

  it("omits stored-block hints for regenerate jobs", () => {
    expect(mapJobPollPath("wrun_1", { ...input, regenerate: true })).toBe("/api/map-jobs/wrun_1");
  });
});

describe("getMapBlocks polling", () => {
  it("returns blocks as soon as a poll reports completed", async () => {
    const block = { x: 5, y: -3, tiles: [] };
    let polls = 0;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.startsWith("/api/blocks")) {
        return jsonResponse({ blocks: [], runId: "wrun_ok", status: "queued" }, 202);
      }
      polls += 1;
      return polls < 3
        ? jsonResponse({ runId: "wrun_ok", status: "running" })
        : jsonResponse({ blocks: [block], runId: "wrun_ok", status: "completed", source: "stored-blocks" });
    }) as typeof fetch;

    const controller = new AbortController();
    const blocks = await getMapBlocks(input, controller.signal, { pollDelayMs: 1 });
    expect(blocks).toEqual([block]);
    expect(polls).toBe(3);
  });

  it("streams newly stored blocks while the neighbour job is still running", async () => {
    const center = { x: 5, y: -3, tiles: [{ updated: 1 }] };
    const updatedCenter = { x: 5, y: -3, tiles: [{ updated: 2 }] };
    const east = { x: 6, y: -3, tiles: [{ updated: 1 }] };
    const streamed: unknown[][] = [];
    let polls = 0;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      if (String(url).startsWith("/api/blocks")) {
        return jsonResponse({ blocks: [], runId: "wrun_stream", status: "queued" }, 202);
      }
      polls += 1;
      if (polls === 1) return jsonResponse({ blocks: [center], status: "running" });
      if (polls === 2) return jsonResponse({ blocks: [updatedCenter, east], status: "running" });
      return jsonResponse({ blocks: [updatedCenter, east], status: "completed" });
    }) as typeof fetch;

    const blocks = await getMapBlocks(input, new AbortController().signal, {
      onBlocks: (ready) => streamed.push(ready),
      pollDelayMs: 1,
    });

    expect(streamed).toEqual([[center], [updatedCenter, east]]);
    expect(blocks).toEqual([updatedCenter, east]);
  });

  it("gives up after the poll limit instead of polling a stalled run forever", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const target = String(url);
      requests.push(target);
      if (target.startsWith("/api/blocks")) {
        return jsonResponse({ blocks: [], runId: "wrun_stuck", status: "queued" }, 202);
      }
      return jsonResponse({ runId: "wrun_stuck", status: "running" });
    }) as typeof fetch;

    const controller = new AbortController();
    await expect(
      getMapBlocks(input, controller.signal, { pollDelayMs: 1, pollLimit: 4 }),
    ).rejects.toThrow(/timed out/);
    expect(requests.filter((target) => target.includes("/api/map-jobs/")).length).toBe(4);
  });

  it("surfaces failed workflow runs", async () => {
    globalThis.fetch = (async (url: RequestInfo | URL) =>
      String(url).startsWith("/api/blocks")
        ? jsonResponse({ blocks: [], runId: "wrun_bad", status: "queued" }, 202)
        : jsonResponse({ runId: "wrun_bad", status: "failed" })) as typeof fetch;

    const controller = new AbortController();
    await expect(getMapBlocks(input, controller.signal, { pollDelayMs: 1 })).rejects.toThrow(
      /Map workflow failed/,
    );
  });
});
