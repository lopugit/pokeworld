import { describe, expect, it } from "vitest";
import {
  GENERATION_DAILY_LIMIT,
  GENERATION_ROLLING_LIMIT,
  GENERATION_ROLLING_WINDOW_MS,
  InMemoryGenerationQuotaStore,
  utcGenerationDayKey,
} from "../server/services/map/generation-quota";

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
