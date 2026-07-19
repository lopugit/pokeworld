import { MongoClient } from "mongodb";
import type { MapBlock } from "./types";

let clientPromise: Promise<MongoClient> | undefined;

export function mongoUri(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.POKEWORLD_OFFLINE_MAP === "true") return undefined;
  if (env.MONGODB_URI) return env.MONGODB_URI;
  if (!env.MONGODB_SCHEME) return undefined;
  return `${env.MONGODB_SCHEME}${env.MONGODB_USER ?? ""}:${env.MONGODB_PWD ?? ""}@${env.MONGODB_URL ?? ""}/${env.MONGODB_DB ?? "pokeworld"}?retryWrites=true&w=majority${env.MONGODB_URL_PARAMS ?? ""}`;
}

export function isMongoConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(mongoUri(env));
}

async function blocksCollection() {
  const uri = mongoUri();
  if (!uri) return undefined;
  clientPromise ||= new MongoClient(uri).connect();
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB || "pokeworld").collection<MapBlock>("blocks");
}

export async function getStoredBlocks(coordinates: Array<{ x: number; y: number }>) {
  const collection = await blocksCollection();
  if (!collection) return undefined;
  if (coordinates.length === 0) return [];
  return collection.find({ $or: coordinates }).toArray();
}
