import { MongoClient, type Collection } from "mongodb";
import { randomUUID } from "node:crypto";
import {
  GenerationControlError,
  assertPublicWorkflowReservation,
  isPublicDeployment,
} from "./generation-policy";
import { mongoUri } from "./mongo";
import type { MapGenerationQuotaReservation } from "./types";

export const GENERATION_DAILY_LIMIT = 500;
export const GENERATION_ROLLING_LIMIT = 9;
export const GENERATION_ROLLING_WINDOW_MS = 5_000;

const QUOTA_DOCUMENT_ID = "global-block-generation";
const QUOTA_COLLECTION = "generation-quotas";

interface QuotaReservationRecord {
  count: number;
  id: string;
}

interface RollingPermitRecord {
  at: number;
  id: string;
}

interface GenerationQuotaDocument {
  _id: string;
  dayKey: string;
  dailyUsed: number;
  permitIds: string[];
  releasedIds: string[];
  reservations: QuotaReservationRecord[];
  rollingPermits: RollingPermitRecord[];
  updatedAt: number;
}

export type GenerationPermitResult =
  | { granted: true; permitId: string }
  | { granted: false; permitId: string; retryAt: number };

export interface GenerationQuotaStatus {
  dailyLimit: number;
  dailyRemaining: number;
  dailyUsed: number;
  dayKey: string;
  rollingLimit: number;
  rollingRemaining: number;
  rollingWindowMs: number;
}

export interface GenerationQuotaStore {
  acquirePermit(input: {
    now: number;
    permitId: string;
    reservationId: string;
  }): Promise<GenerationPermitResult>;
  releaseReservationSlot(input: {
    now: number;
    releaseId: string;
    reservationId: string;
  }): Promise<void>;
  reserve(input: {
    count: number;
    now: number;
    reservationId: string;
  }): Promise<MapGenerationQuotaReservation>;
  reset(now: number): Promise<GenerationQuotaStatus>;
  status(now: number): Promise<GenerationQuotaStatus>;
}

// A deterministic implementation used by focused unit tests and local tooling.
// Production uses the atomic Mongo implementation below.
export class InMemoryGenerationQuotaStore implements GenerationQuotaStore {
  private dailyUsed = 0;
  private dayKey = "";
  private readonly permitIds = new Set<string>();
  private readonly releasedIds = new Set<string>();
  private readonly reservations = new Map<string, number>();
  private rollingPermits: RollingPermitRecord[] = [];

  private normalize(now: number): void {
    const dayKey = utcGenerationDayKey(now);
    // Never let a delayed request move the global UTC quota back to an older
    // day and erase reservations already made after midnight.
    if (!this.dayKey || dayKey > this.dayKey) {
      this.dayKey = dayKey;
      this.dailyUsed = 0;
      this.permitIds.clear();
      this.releasedIds.clear();
      this.reservations.clear();
    }
    const cutoff = now - GENERATION_ROLLING_WINDOW_MS;
    this.rollingPermits = this.rollingPermits.filter(({ at }) => at > cutoff);
  }

  async reserve(input: {
    count: number;
    now: number;
    reservationId: string;
  }): Promise<MapGenerationQuotaReservation> {
    this.normalize(input.now);
    const existing = this.reservations.get(input.reservationId);
    if (existing !== undefined) {
      if (existing !== input.count) {
        throw new GenerationControlError(
          "Generation quota reservation ID was reused with a different block count",
          409,
          "GENERATION_RESERVATION_CONFLICT",
        );
      }
      return { dayKey: this.dayKey, reservationId: input.reservationId };
    }
    if (this.dailyUsed + input.count > GENERATION_DAILY_LIMIT) {
      throw new GenerationControlError(
        `Pokeworld has reached its ${GENERATION_DAILY_LIMIT}-block UTC daily generation limit`,
        429,
        "GENERATION_DAILY_LIMIT",
      );
    }
    this.reservations.set(input.reservationId, input.count);
    this.dailyUsed += input.count;
    return { dayKey: this.dayKey, reservationId: input.reservationId };
  }

  async releaseReservationSlot(input: {
    now: number;
    releaseId: string;
    reservationId: string;
  }): Promise<void> {
    this.normalize(input.now);
    if (
      (this.reservations.get(input.reservationId) ?? 0) > 0 &&
      !this.permitIds.has(input.releaseId) &&
      !this.releasedIds.has(input.releaseId) &&
      this.dailyUsed > 0
    ) {
      this.releasedIds.add(input.releaseId);
      this.dailyUsed -= 1;
    }
  }

  async acquirePermit(input: {
    now: number;
    permitId: string;
    reservationId: string;
  }): Promise<GenerationPermitResult> {
    this.normalize(input.now);
    if (!input.permitId.startsWith(`${input.reservationId}:`)) {
      throw new GenerationControlError(
        "Generation permit does not belong to its quota reservation",
        409,
        "GENERATION_PERMIT_CONFLICT",
      );
    }
    if (!this.reservations.has(input.reservationId)) {
      throw new GenerationControlError(
        "Generation quota reservation is no longer active",
        429,
        "GENERATION_RESERVATION_EXPIRED",
      );
    }
    if (this.releasedIds.has(input.permitId)) {
      throw new GenerationControlError(
        "A released generation reservation cannot acquire a permit",
        409,
        "GENERATION_PERMIT_CONFLICT",
      );
    }
    if (this.permitIds.has(input.permitId)) {
      return { granted: true, permitId: input.permitId };
    }
    if (this.rollingPermits.length >= GENERATION_ROLLING_LIMIT) {
      const oldestPermit = Math.min(...this.rollingPermits.map(({ at }) => at));
      return {
        granted: false,
        permitId: input.permitId,
        retryAt: oldestPermit + GENERATION_ROLLING_WINDOW_MS + 10,
      };
    }
    this.permitIds.add(input.permitId);
    this.rollingPermits.push({ at: input.now, id: input.permitId });
    return { granted: true, permitId: input.permitId };
  }

  async status(now: number): Promise<GenerationQuotaStatus> {
    this.normalize(now);
    return {
      dailyLimit: GENERATION_DAILY_LIMIT,
      dailyRemaining: GENERATION_DAILY_LIMIT - this.dailyUsed,
      dailyUsed: this.dailyUsed,
      dayKey: this.dayKey,
      rollingLimit: GENERATION_ROLLING_LIMIT,
      rollingRemaining: GENERATION_ROLLING_LIMIT - this.rollingPermits.length,
      rollingWindowMs: GENERATION_ROLLING_WINDOW_MS,
    };
  }

  async reset(now: number): Promise<GenerationQuotaStatus> {
    this.normalize(now);
    this.dailyUsed = 0;
    // Keep reservations and permit identity alive so an admin reset does not
    // cancel workflows already generating nearby terrain. Mark their reserved
    // counts as no longer part of the freshly reset daily total, preventing a
    // later cache-hit release from decrementing new post-reset usage.
    for (const reservationId of this.reservations.keys()) {
      this.reservations.set(reservationId, 0);
    }
    return this.status(now);
  }
}

let quotaClientPromise: Promise<MongoClient> | undefined;
let quotaClientUri: string | undefined;

export function generationQuotaMongoUri(): string | undefined {
  return process.env.POKEWORLD_QUOTA_MONGODB_URI || mongoUri();
}

export function utcGenerationDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function reservationIdsExpression() {
  return {
    $map: {
      input: { $ifNull: ["$reservations", []] },
      as: "reservation",
      in: "$$reservation.id",
    },
  };
}

function quotaStatusFromDocument(
  document: GenerationQuotaDocument,
): GenerationQuotaStatus {
  return {
    dailyLimit: GENERATION_DAILY_LIMIT,
    dailyRemaining: Math.max(0, GENERATION_DAILY_LIMIT - document.dailyUsed),
    dailyUsed: document.dailyUsed,
    dayKey: document.dayKey,
    rollingLimit: GENERATION_ROLLING_LIMIT,
    rollingRemaining: Math.max(
      0,
      GENERATION_ROLLING_LIMIT - document.rollingPermits.length,
    ),
    rollingWindowMs: GENERATION_ROLLING_WINDOW_MS,
  };
}

class MongoGenerationQuotaStore implements GenerationQuotaStore {
  constructor(private readonly collection: Collection<GenerationQuotaDocument>) {}

  private async normalize(now: number): Promise<GenerationQuotaDocument> {
    const dayKey = utcGenerationDayKey(now);
    const cutoff = now - GENERATION_ROLLING_WINDOW_MS;
    const storedDayKey = { $ifNull: ["$dayKey", ""] };
    // ISO UTC day keys sort chronologically. Preserve a newer stored day when
    // a delayed invocation carrying yesterday's timestamp arrives after the
    // singleton has already rolled over.
    const storedDayIsCurrentOrNewer = { $gte: [storedDayKey, dayKey] };

    const update = [
      {
        $set: {
          dailyUsed: {
            $cond: [storedDayIsCurrentOrNewer, { $ifNull: ["$dailyUsed", 0] }, 0],
          },
          dayKey: {
            $cond: [storedDayIsCurrentOrNewer, storedDayKey, dayKey],
          },
          permitIds: {
            $cond: [storedDayIsCurrentOrNewer, { $ifNull: ["$permitIds", []] }, []],
          },
          releasedIds: {
            $cond: [storedDayIsCurrentOrNewer, { $ifNull: ["$releasedIds", []] }, []],
          },
          reservations: {
            $cond: [storedDayIsCurrentOrNewer, { $ifNull: ["$reservations", []] }, []],
          },
          rollingPermits: {
            $filter: {
              input: { $ifNull: ["$rollingPermits", []] },
              as: "permit",
              cond: { $gt: ["$$permit.at", cutoff] },
            },
          },
          updatedAt: now,
        },
      },
    ];
    try {
      await this.collection.updateOne(
        { _id: QUOTA_DOCUMENT_ID },
        update,
        { upsert: true },
      );
    } catch (error) {
      // Two cold-start functions may race to create the singleton document.
      // The losing exact-_id upsert can receive E11000; the winner is already
      // durable, so retry the same normalization as a plain update.
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== 11000
      ) {
        throw error;
      }
      await this.collection.updateOne(
        { _id: QUOTA_DOCUMENT_ID },
        update,
      );
    }

    const document = await this.collection.findOne({ _id: QUOTA_DOCUMENT_ID });
    if (!document) {
      throw new Error("Generation quota document could not be initialized");
    }
    return document;
  }

  async reserve(input: {
    count: number;
    now: number;
    reservationId: string;
  }): Promise<MapGenerationQuotaReservation> {
    if (!Number.isInteger(input.count) || input.count <= 0) {
      throw new Error("Generation quota reservations require a positive block count");
    }
    if (input.count > GENERATION_DAILY_LIMIT) {
      throw new GenerationControlError(
        "The requested map job exceeds the daily generation limit",
        429,
        "GENERATION_DAILY_LIMIT",
      );
    }

    const normalized = await this.normalize(input.now);
    const maximumExistingUse = GENERATION_DAILY_LIMIT - input.count;
    const document = await this.collection.findOneAndUpdate(
      {
        _id: QUOTA_DOCUMENT_ID,
        dayKey: normalized.dayKey,
        $or: [
          { "reservations.id": input.reservationId },
          { dailyUsed: { $lte: maximumExistingUse } },
        ],
      },
      [
        {
          $set: {
            dailyUsed: {
              $cond: [
                { $in: [input.reservationId, reservationIdsExpression()] },
                "$dailyUsed",
                { $add: ["$dailyUsed", input.count] },
              ],
            },
            reservations: {
              $cond: [
                { $in: [input.reservationId, reservationIdsExpression()] },
                "$reservations",
                {
                  $concatArrays: [
                    "$reservations",
                    [{ id: input.reservationId, count: input.count }],
                  ],
                },
              ],
            },
            updatedAt: input.now,
          },
        },
      ],
      { returnDocument: "after" },
    );

    if (!document) {
      throw new GenerationControlError(
        `Pokeworld has reached its ${GENERATION_DAILY_LIMIT}-block UTC daily generation limit`,
        429,
        "GENERATION_DAILY_LIMIT",
      );
    }

    const reservation = document.reservations.find(
      ({ id }) => id === input.reservationId,
    );
    if (!reservation || reservation.count !== input.count) {
      throw new GenerationControlError(
        "Generation quota reservation ID was reused with a different block count",
        409,
        "GENERATION_RESERVATION_CONFLICT",
      );
    }

    return {
      dayKey: document.dayKey,
      reservationId: input.reservationId,
    };
  }

  async releaseReservationSlot(input: {
    now: number;
    releaseId: string;
    reservationId: string;
  }): Promise<void> {
    const normalized = await this.normalize(input.now);
    await this.collection.updateOne(
      {
        _id: QUOTA_DOCUMENT_ID,
        dayKey: normalized.dayKey,
        dailyUsed: { $gt: 0 },
        permitIds: { $ne: input.releaseId },
        releasedIds: { $ne: input.releaseId },
        reservations: {
          $elemMatch: { id: input.reservationId, count: { $gt: 0 } },
        },
      },
      {
        $inc: { dailyUsed: -1 },
        $addToSet: { releasedIds: input.releaseId },
        $set: { updatedAt: input.now },
      },
    );
  }

  async acquirePermit(input: {
    now: number;
    permitId: string;
    reservationId: string;
  }): Promise<GenerationPermitResult> {
    if (!input.permitId.startsWith(`${input.reservationId}:`)) {
      throw new GenerationControlError(
        "Generation permit does not belong to its quota reservation",
        409,
        "GENERATION_PERMIT_CONFLICT",
      );
    }

    const normalized = await this.normalize(input.now);
    const document = await this.collection.findOneAndUpdate(
      {
        _id: QUOTA_DOCUMENT_ID,
        dayKey: normalized.dayKey,
        "reservations.id": input.reservationId,
        releasedIds: { $ne: input.permitId },
        $or: [
          { permitIds: input.permitId },
          {
            $expr: {
              $lt: [
                { $size: { $ifNull: ["$rollingPermits", []] } },
                GENERATION_ROLLING_LIMIT,
              ],
            },
          },
        ],
      },
      [
        {
          $set: {
            permitIds: {
              $cond: [
                { $in: [input.permitId, { $ifNull: ["$permitIds", []] }] },
                "$permitIds",
                { $concatArrays: ["$permitIds", [input.permitId]] },
              ],
            },
            rollingPermits: {
              $cond: [
                { $in: [input.permitId, { $ifNull: ["$permitIds", []] }] },
                "$rollingPermits",
                {
                  $concatArrays: [
                    "$rollingPermits",
                    [{ id: input.permitId, at: input.now }],
                  ],
                },
              ],
            },
            updatedAt: input.now,
          },
        },
      ],
      { returnDocument: "after" },
    );

    if (document?.permitIds.includes(input.permitId)) {
      return { granted: true, permitId: input.permitId };
    }

    const latest = await this.collection.findOne({ _id: QUOTA_DOCUMENT_ID });
    if (!latest?.reservations.some(({ id }) => id === input.reservationId)) {
      throw new GenerationControlError(
        "Generation quota reservation is no longer active",
        429,
        "GENERATION_RESERVATION_EXPIRED",
      );
    }

    const retryAt = latest.rollingPermits.length
      ? Math.min(...latest.rollingPermits.map(({ at }) => at)) +
        GENERATION_ROLLING_WINDOW_MS +
        10
      : input.now + 10;
    return {
      granted: false,
      permitId: input.permitId,
      retryAt: Math.max(input.now + 10, retryAt),
    };
  }

  async status(now: number): Promise<GenerationQuotaStatus> {
    return quotaStatusFromDocument(await this.normalize(now));
  }

  async reset(now: number): Promise<GenerationQuotaStatus> {
    const normalized = await this.normalize(now);
    const document = await this.collection.findOneAndUpdate(
      { _id: QUOTA_DOCUMENT_ID, dayKey: normalized.dayKey },
      [
        {
          $set: {
            dailyUsed: 0,
            reservations: {
              $map: {
                input: { $ifNull: ["$reservations", []] },
                as: "reservation",
                in: { count: 0, id: "$$reservation.id" },
              },
            },
            updatedAt: now,
          },
        },
      ],
      { returnDocument: "after" },
    );
    if (!document) throw new Error("Generation quota could not be reset");
    return quotaStatusFromDocument(document);
  }
}

async function quotaCollection(): Promise<Collection<GenerationQuotaDocument> | undefined> {
  const uri = generationQuotaMongoUri();
  if (!uri) return undefined;
  if (!quotaClientPromise || quotaClientUri !== uri) {
    quotaClientUri = uri;
    const connection = new MongoClient(uri).connect();
    quotaClientPromise = connection;
    void connection.catch(() => {
      if (quotaClientPromise === connection) {
        quotaClientPromise = undefined;
        quotaClientUri = undefined;
      }
    });
  }
  const client = await quotaClientPromise;
  const database =
    process.env.POKEWORLD_QUOTA_MONGODB_DB ||
    process.env.MONGODB_DB ||
    "pokeworld";
  return client.db(database).collection<GenerationQuotaDocument>(QUOTA_COLLECTION);
}

async function configuredStore(): Promise<GenerationQuotaStore | undefined> {
  const collection = await quotaCollection();
  return collection ? new MongoGenerationQuotaStore(collection) : undefined;
}

function quotaUnavailable(cause?: unknown): GenerationControlError {
  const error = new GenerationControlError(
    "The global map-generation quota store is unavailable",
    503,
    "GENERATION_QUOTA_UNAVAILABLE",
  );
  if (cause !== undefined) error.cause = cause;
  return error;
}

async function withOptionalStore<T>(
  operation: (store: GenerationQuotaStore) => Promise<T>,
  localFallback: T,
): Promise<T> {
  try {
    const store = await configuredStore();
    if (!store) {
      if (isPublicDeployment()) throw quotaUnavailable();
      return localFallback;
    }
    return await operation(store);
  } catch (error) {
    if (error instanceof GenerationControlError) throw error;
    if (isPublicDeployment()) throw quotaUnavailable(error);
    console.warn("Pokeworld generation quota unavailable in local mode; continuing without it");
    return localFallback;
  }
}

export async function reserveGenerationQuota(
  count: number,
  now = Date.now(),
  reservationId = randomUUID(),
): Promise<MapGenerationQuotaReservation | undefined> {
  return withOptionalStore(
    (store) => store.reserve({ count, now, reservationId }),
    undefined,
  );
}

export async function releaseGenerationReservationSlot(
  reservation: MapGenerationQuotaReservation | undefined,
  releaseId: string,
  now = Date.now(),
): Promise<void> {
  if (!reservation) {
    assertPublicWorkflowReservation(undefined);
    return;
  }
  await withOptionalStore(
    (store) =>
      store.releaseReservationSlot({
        now,
        releaseId,
        reservationId: reservation.reservationId,
      }),
    undefined,
  );
}

export async function acquireGenerationPermit(
  reservation: MapGenerationQuotaReservation | undefined,
  permitId: string,
  now = Date.now(),
): Promise<GenerationPermitResult> {
  if (!reservation) {
    assertPublicWorkflowReservation(undefined);
    return { granted: true, permitId };
  }
  return withOptionalStore(
    (store) =>
      store.acquirePermit({
        now,
        permitId,
        reservationId: reservation.reservationId,
      }),
    { granted: true, permitId },
  );
}

export async function getGenerationQuotaStatus(
  now = Date.now(),
): Promise<GenerationQuotaStatus> {
  const store = await configuredStore().catch((error) => {
    throw quotaUnavailable(error);
  });
  if (!store) throw quotaUnavailable();
  return store.status(now).catch((error) => {
    if (error instanceof GenerationControlError) throw error;
    throw quotaUnavailable(error);
  });
}

export async function resetDailyGenerationQuota(
  now = Date.now(),
): Promise<GenerationQuotaStatus> {
  const store = await configuredStore().catch((error) => {
    throw quotaUnavailable(error);
  });
  if (!store) throw quotaUnavailable();
  return store.reset(now).catch((error) => {
    if (error instanceof GenerationControlError) throw error;
    throw quotaUnavailable(error);
  });
}
