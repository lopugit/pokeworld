import { describe, expect, it } from "vitest";
import {
  GENERATION_DAILY_LIMIT,
  GENERATION_ROLLING_LIMIT,
  GENERATION_ROLLING_WINDOW_MS,
  InMemoryGenerationQuotaStore,
  ThingtimeGenerationQuotaStore,
  utcGenerationDayKey,
} from "../server/services/map/generation-quota";
import { ThingtimeApiError } from "../server/services/thingtime/client";

const start = Date.UTC(2026, 6, 19, 12, 0, 0);

describe("global generation quota semantics", () => {
  it("grants only nine unique permits in a rolling five-second window", async () => {
    const store = new InMemoryGenerationQuotaStore();
    await store.reserve({ count: 10, now: start, reservationId: "job" });

    for (let index = 0; index < GENERATION_ROLLING_LIMIT; index += 1) {
      await expect(
        store.acquirePermit({
          now: start,
          permitId: `job:${index},0`,
          reservationId: "job",
        }),
      ).resolves.toMatchObject({ granted: true });
    }

    const denied = await store.acquirePermit({
      now: start,
      permitId: "job:9,0",
      reservationId: "job",
    });
    expect(denied).toEqual({
      granted: false,
      permitId: "job:9,0",
      retryAt: start + GENERATION_ROLLING_WINDOW_MS + 10,
    });
    await expect(
      store.acquirePermit({
        now: start + GENERATION_ROLLING_WINDOW_MS + 1,
        permitId: "job:9,0",
        reservationId: "job",
      }),
    ).resolves.toMatchObject({ granted: true });
  });

  it("makes reservations, permits, and cached-slot releases idempotent", async () => {
    const store = new InMemoryGenerationQuotaStore();
    await store.reserve({ count: 2, now: start, reservationId: "job" });
    await store.reserve({ count: 2, now: start, reservationId: "job" });
    await store.releaseReservationSlot({
      now: start,
      releaseId: "job:cached",
      reservationId: "job",
    });
    await store.releaseReservationSlot({
      now: start,
      releaseId: "job:cached",
      reservationId: "job",
    });
    await store.acquirePermit({
      now: start,
      permitId: "job:generated",
      reservationId: "job",
    });
    await store.acquirePermit({
      now: start + 100,
      permitId: "job:generated",
      reservationId: "job",
    });

    expect(await store.status(start + 100)).toMatchObject({
      dailyUsed: 1,
      rollingRemaining: GENERATION_ROLLING_LIMIT - 1,
    });
  });

  it("enforces 500 per UTC day and lets an admin reset daily use only", async () => {
    const store = new InMemoryGenerationQuotaStore();
    await store.reserve({
      count: GENERATION_DAILY_LIMIT,
      now: start,
      reservationId: "full-day",
    });
    await expect(
      store.reserve({ count: 1, now: start, reservationId: "overflow" }),
    ).rejects.toMatchObject({ code: "GENERATION_DAILY_LIMIT", statusCode: 429 });

    await store.acquirePermit({
      now: start,
      permitId: "full-day:0,0",
      reservationId: "full-day",
    });
    const reset = await store.reset(start + 1);
    expect(reset.dailyUsed).toBe(0);
    expect(reset.rollingRemaining).toBe(GENERATION_ROLLING_LIMIT - 1);

    await expect(
      store.acquirePermit({
        now: start + 2,
        permitId: "full-day:1,0",
        reservationId: "full-day",
      }),
    ).resolves.toMatchObject({ granted: true });
    await store.reserve({ count: 1, now: start + 2, reservationId: "after-reset" });
    await store.releaseReservationSlot({
      now: start + 3,
      releaseId: "full-day:cached-after-reset",
      reservationId: "full-day",
    });
    expect(await store.status(start + 3)).toMatchObject({ dailyUsed: 1 });
    expect(utcGenerationDayKey(start)).toBe("2026-07-19");
  });

  it("never rolls the daily quota backwards for a delayed pre-midnight request", async () => {
    const store = new InMemoryGenerationQuotaStore();
    const nextDay = Date.UTC(2026, 6, 20, 0, 0, 1);
    const delayedPreviousDay = Date.UTC(2026, 6, 19, 23, 59, 59);

    await store.reserve({ count: 400, now: nextDay, reservationId: "new-day" });
    await expect(
      store.reserve({ count: 101, now: delayedPreviousDay, reservationId: "delayed" }),
    ).rejects.toMatchObject({ code: "GENERATION_DAILY_LIMIT" });
    expect(await store.status(nextDay + 1)).toMatchObject({
      dailyUsed: 400,
      dayKey: "2026-07-20",
    });
  });
});

const thingtimeStatus = (overrides: Record<string, unknown> = {}) => ({
  key: "pokeworld-global-block-generation",
  policy: {
    dailyLimit: GENERATION_DAILY_LIMIT,
    rollingLimit: GENERATION_ROLLING_LIMIT,
    rollingWindowMs: GENERATION_ROLLING_WINDOW_MS,
  },
  dayKey: "2026-07-19",
  dailyUsed: 4,
  dailyRemaining: GENERATION_DAILY_LIMIT - 4,
  rollingUsed: 2,
  rollingRemaining: GENERATION_ROLLING_LIMIT - 2,
  rollingResetAt: start + GENERATION_ROLLING_WINDOW_MS,
  ...overrides,
});

describe("Thingtime generation quota adapter", () => {
  it("reserves, permits, releases, reports, and resets through the atomic API", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
      calls.push([path, init]);
      const operation = init?.body
        ? (JSON.parse(String(init.body)) as { operation?: string }).operation
        : undefined;
      const common = { ok: true as const, status: thingtimeStatus() };
      if (operation === "reserve") {
        return {
          ...common,
          reservation: { dayKey: "2026-07-19", reservationId: "job" },
        } as unknown as T;
      }
      if (operation === "permit") {
        return {
          ...common,
          permit: { granted: true, permitId: "job:1,2" },
        } as unknown as T;
      }
      return common as unknown as T;
    };
    const store = new ThingtimeGenerationQuotaStore(request);

    await expect(
      store.reserve({ count: 9, now: 1, reservationId: "job" }),
    ).resolves.toEqual({ dayKey: "2026-07-19", reservationId: "job" });
    await expect(
      store.acquirePermit({ now: 2, permitId: "job:1,2", reservationId: "job" }),
    ).resolves.toEqual({ granted: true, permitId: "job:1,2" });
    await store.releaseReservationSlot({
      now: 3,
      releaseId: "job:cached",
      reservationId: "job",
    });
    await expect(store.status(4)).resolves.toMatchObject({
      dailyLimit: GENERATION_DAILY_LIMIT,
      dailyUsed: 4,
      rollingRemaining: GENERATION_ROLLING_LIMIT - 2,
    });
    await expect(store.reset(5)).resolves.toMatchObject({ dailyUsed: 4 });

    const posted = calls
      .filter(([, init]) => init?.body)
      .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(posted[0]).toMatchObject({
      key: "pokeworld-global-block-generation",
      operation: "reserve",
      count: 9,
      policy: {
        dailyLimit: 500,
        rollingLimit: 9,
        rollingWindowMs: 5_000,
      },
    });
    expect(posted.map(({ operation }) => operation)).toEqual([
      "reserve",
      "permit",
      "release",
      "reset",
    ]);
    expect(calls.some(([path]) => path.includes("?key="))).toBe(true);
  });

  it("returns an unused quota before Thingtime has created its private record", async () => {
    const request = async <T>(): Promise<T> => {
      throw new ThingtimeApiError("not found", 404);
    };
    const store = new ThingtimeGenerationQuotaStore(request);

    await expect(store.status(start)).resolves.toMatchObject({
      dailyUsed: 0,
      dailyRemaining: GENERATION_DAILY_LIMIT,
      rollingRemaining: GENERATION_ROLLING_LIMIT,
      dayKey: "2026-07-19",
    });
    await expect(store.reset(start)).resolves.toMatchObject({ dailyUsed: 0 });
  });

  it("maps atomic Thingtime conflicts and limits to Pokeworld control errors", async () => {
    const dailyStore = new ThingtimeGenerationQuotaStore(async <T>() => {
      throw new ThingtimeApiError("daily limit", 429, {
        code: "QUOTA_DAILY_LIMIT",
      });
    });
    await expect(
      dailyStore.reserve({ count: 1, now: start, reservationId: "job" }),
    ).rejects.toMatchObject({
      code: "GENERATION_DAILY_LIMIT",
      statusCode: 429,
    });

    const conflictStore = new ThingtimeGenerationQuotaStore(async <T>() => {
      throw new ThingtimeApiError("permit conflict", 409, {
        code: "QUOTA_PERMIT_CONFLICT",
      });
    });
    await expect(
      conflictStore.acquirePermit({
        now: start,
        permitId: "job:1,2",
        reservationId: "job",
      }),
    ).rejects.toMatchObject({
      code: "GENERATION_PERMIT_CONFLICT",
      statusCode: 409,
    });
  });
});
