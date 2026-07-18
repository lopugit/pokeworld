import { MongoClient } from "mongodb";
import type { MapBlock } from "./types";

let clientPromise: Promise<MongoClient> | undefined;

export function mongoUri(): string | undefined {
  if (process.env.POKEWORLD_OFFLINE_MAP === "true") return undefined;
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  if (!process.env.MONGODB_SCHEME) return undefined;
  return `${process.env.MONGODB_SCHEME}${process.env.MONGODB_USER ?? ""}:${process.env.MONGODB_PWD ?? ""}@${process.env.MONGODB_URL ?? ""}/${process.env.MONGODB_DB ?? "pokeworld"}?retryWrites=true&w=majority${process.env.MONGODB_URL_PARAMS ?? ""}`;
}

export function isMongoConfigured() {
  return Boolean(mongoUri());
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
