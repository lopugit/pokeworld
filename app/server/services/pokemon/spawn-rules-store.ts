// Persistence for admin wild-spawn rule overrides (SpeciesSpawnOverride docs).
//
// When Mongo is configured (see services/map/mongo.ts) overrides live in the
// "spawnRules" collection with one document per speciesId
// ({ speciesId, rules, updated }), upserted by speciesId.
//
// When Mongo is not configured (POKEWORLD_OFFLINE_MAP=true or no Mongo env)
// the store falls back to a module-level in-memory Map. That fallback is
// NON-DURABLE: overrides vanish on server restart and are never shared
// between server instances — fine for offline/dev play, where the game
// falls back to the deterministic default rules anyway.

import { MongoClient } from "mongodb";
import {
  normalizeSpawnOverride,
  type SpeciesSpawnOverride,
} from "../../../src/lib/encounters";
import { mongoUri } from "../map/mongo";

let clientPromise: Promise<MongoClient> | undefined;

async function spawnRulesCollection() {
  const uri = mongoUri();
  if (!uri) return undefined;
  clientPromise ||= new MongoClient(uri).connect();
  const client = await clientPromise;
  return client
    .db(process.env.MONGODB_DB || "pokeworld")
    .collection<SpeciesSpawnOverride>("spawnRules");
}

/** Non-durable fallback used when Mongo is not configured. */
const memoryOverrides = new Map<number, SpeciesSpawnOverride>();

export async function listSpawnOverrides(): Promise<SpeciesSpawnOverride[]> {
  const collection = await spawnRulesCollection();
  if (!collection) {
    return [...memoryOverrides.values()].sort((a, b) => a.speciesId - b.speciesId);
  }
  const docs = await collection
    .find({}, { projection: { _id: 0 } })
    .sort({ speciesId: 1 })
    .toArray();
  return docs.map(({ speciesId, rules, updated }) => ({ speciesId, rules, updated }));
}

/**
 * Validates (via normalizeSpawnOverride) and upserts one species' override.
 * Throws on overrides that fail validation; returns the stored document.
 */
export async function putSpawnOverride(
  override: SpeciesSpawnOverride,
): Promise<SpeciesSpawnOverride> {
  const normalized = normalizeSpawnOverride(override);
  if (!normalized) throw new Error("Invalid spawn override");
  const collection = await spawnRulesCollection();
  if (!collection) {
    memoryOverrides.set(normalized.speciesId, normalized);
    return normalized;
  }
  await collection.replaceOne({ speciesId: normalized.speciesId }, normalized, {
    upsert: true,
  });
  return normalized;
}

export async function deleteSpawnOverride(speciesId: number): Promise<boolean> {
  const collection = await spawnRulesCollection();
  if (!collection) return memoryOverrides.delete(speciesId);
  const result = await collection.deleteOne({ speciesId });
  return result.deletedCount > 0;
}
