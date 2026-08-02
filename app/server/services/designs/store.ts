// Saved community designs: tiny {family, seed} recipes plus server-derived
// searchable metadata. Backed by MongoDB when configured; falls back to a
// JSON file store for offline development (POKEWORLD_OFFLINE_MAP / no Mongo).

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MongoClient, type Collection } from "mongodb";
import { generateDesign } from "../../../src/lib/design/catalog";
import type { SavedDesign } from "../../../src/lib/design/types";
import { mongoUri } from "../map/mongo";

export const MAX_DESIGN_NAME_LENGTH = 64;
export const MAX_DESIGNS_PER_USER = 500;
export const MAX_PAGE_SIZE = 48;

export interface SaveDesignInput {
  family: string;
  seed: number;
  name?: string;
  remixOf?: string;
  author: { id: string; username: string };
}

export interface DesignQuery {
  query?: string;
  biome?: string;
  tag?: string;
  author?: string;
  page?: number;
  limit?: number;
}

export interface DesignPage {
  designs: SavedDesign[];
  total: number;
  page: number;
  pages: number;
}

export class DesignStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DesignStoreError";
  }
}

// --- backing stores --------------------------------------------------------

let clientPromise: Promise<MongoClient> | undefined;

async function designsCollection(): Promise<Collection<SavedDesign> | undefined> {
  const uri = mongoUri();
  if (!uri) return undefined;
  clientPromise ||= new MongoClient(uri).connect();
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB || "pokeworld").collection<SavedDesign>("designs");
}

// File-backed fallback for offline dev. Vercel/production always has Mongo;
// writes are best-effort so a read-only filesystem cannot break requests.
const fileStorePath = () =>
  process.env.POKEWORLD_DESIGNS_FILE || path.resolve(process.cwd(), ".data", "designs.json");
let fileDesigns: SavedDesign[] | undefined;

/** Test hook: drop the in-memory cache so a fresh file path takes effect. */
export function resetDesignFileStoreForTests(): void {
  fileDesigns = undefined;
}

function loadFileDesigns(): SavedDesign[] {
  if (!fileDesigns) {
    try {
      fileDesigns = JSON.parse(readFileSync(fileStorePath(), "utf8")) as SavedDesign[];
    } catch {
      fileDesigns = [];
    }
  }
  return fileDesigns;
}

function persistFileDesigns(): void {
  try {
    const file = fileStorePath();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(fileDesigns ?? [], null, 2));
  } catch {
    // best effort — the in-memory copy still serves this process
  }
}

// --- validation ------------------------------------------------------------

function normalizeName(raw: string | undefined, fallback: string): string {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return fallback;
  if (name.length > MAX_DESIGN_NAME_LENGTH) {
    throw new DesignStoreError(`Design names are limited to ${MAX_DESIGN_NAME_LENGTH} characters`, 400);
  }
  return name;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- public API ------------------------------------------------------------

export async function saveDesign(input: SaveDesignInput): Promise<SavedDesign> {
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) {
    throw new DesignStoreError("Design seeds must be integers in the unsigned 32-bit range", 400);
  }
  const generated = generateDesign(input.family, input.seed);
  if (!generated) throw new DesignStoreError(`Unknown design family "${input.family}"`, 400);
  const remixOf = (input.remixOf ?? "").trim();
  if (remixOf.length > 128) throw new DesignStoreError("remixOf reference is too long", 400);

  const design: SavedDesign = {
    id: randomUUID(),
    family: generated.family,
    seed: input.seed,
    name: normalizeName(input.name, generated.name),
    familyLabel: generated.familyLabel,
    biome: generated.biome,
    tags: generated.tags,
    description: generated.description,
    author: { id: input.author.id, username: input.author.username },
    createdAt: new Date().toISOString(),
    ...(remixOf ? { remixOf } : {}),
  };

  const collection = await designsCollection();
  if (collection) {
    const existing = await collection.countDocuments({ "author.id": input.author.id });
    if (existing >= MAX_DESIGNS_PER_USER) {
      throw new DesignStoreError(`Each trainer can save up to ${MAX_DESIGNS_PER_USER} designs`, 429);
    }
    await collection.insertOne({ ...design });
    return design;
  }

  const designs = loadFileDesigns();
  if (designs.filter((entry) => entry.author.id === input.author.id).length >= MAX_DESIGNS_PER_USER) {
    throw new DesignStoreError(`Each trainer can save up to ${MAX_DESIGNS_PER_USER} designs`, 429);
  }
  designs.unshift(design);
  persistFileDesigns();
  return design;
}

export async function listDesigns(query: DesignQuery): Promise<DesignPage> {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(query.limit ?? 24)));
  const text = query.query?.trim().toLowerCase() ?? "";

  const collection = await designsCollection();
  if (collection) {
    const filter: Record<string, unknown> = {};
    if (query.biome) filter.biome = query.biome;
    if (query.tag) filter.tags = query.tag;
    if (query.author) filter["author.username"] = query.author;
    if (text) {
      const pattern = new RegExp(text.split(/\s+/).map(escapeRegex).join(".*"), "i");
      filter.$or = [
        { name: pattern },
        { description: pattern },
        { familyLabel: pattern },
        { tags: pattern },
        { "author.username": pattern },
      ];
    }
    const total = await collection.countDocuments(filter);
    const documents = await collection
      .find(filter, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();
    return { designs: documents, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  let designs = [...loadFileDesigns()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (query.biome) designs = designs.filter((design) => design.biome === query.biome);
  if (query.tag) designs = designs.filter((design) => design.tags.includes(query.tag!));
  if (query.author) designs = designs.filter((design) => design.author.username === query.author);
  if (text) {
    const terms = text.split(/\s+/);
    designs = designs.filter((design) => {
      const haystack =
        `${design.name} ${design.description} ${design.familyLabel} ${design.tags.join(" ")} ${design.author.username}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }
  const total = designs.length;
  return {
    designs: designs.slice((page - 1) * limit, page * limit),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getSavedDesign(id: string): Promise<SavedDesign | undefined> {
  const collection = await designsCollection();
  if (collection) {
    const document = await collection.findOne({ id }, { projection: { _id: 0 } });
    return document ?? undefined;
  }
  return loadFileDesigns().find((design) => design.id === id);
}

export async function deleteSavedDesign(
  id: string,
  user: { id: string; isAdmin: boolean },
): Promise<boolean> {
  const existing = await getSavedDesign(id);
  if (!existing) return false;
  if (existing.author.id !== user.id && !user.isAdmin) {
    throw new DesignStoreError("Only the design's author can delete it", 403);
  }
  const collection = await designsCollection();
  if (collection) {
    const result = await collection.deleteOne({ id });
    return result.deletedCount > 0;
  }
  const designs = loadFileDesigns();
  const index = designs.findIndex((design) => design.id === id);
  if (index < 0) return false;
  designs.splice(index, 1);
  persistFileDesigns();
  return true;
}
