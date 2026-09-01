// Trainer invites: a signed-in user mints a shareable link for a friend by
// name; opening it gives the friend a personalized PROF. OAK welcome. Backed
// by MongoDB when configured, with the same JSON-file fallback the designs
// store uses for offline development.

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MongoClient, type Collection } from "mongodb";
import { mongoUri } from "../map/mongo";

export const MAX_INVITEE_NAME_LENGTH = 12;
export const MAX_INVITES_PER_USER = 100;

export interface Invite {
  id: string;
  inviteeName: string;
  inviter: { id: string; username: string; displayName?: string };
  createdAt: string;
}

/** The fields safe to show whoever opens the invite link. */
export interface PublicInvite {
  id: string;
  inviteeName: string;
  inviterName: string;
}

export class InviteStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "InviteStoreError";
  }
}

// URL-safe, unguessable, and short enough to read out loud.
const mintInviteId = () => randomBytes(9).toString("base64url");

// --- backing stores --------------------------------------------------------

let clientPromise: Promise<MongoClient> | undefined;

async function invitesCollection(): Promise<Collection<Invite> | undefined> {
  const uri = mongoUri();
  if (!uri) return undefined;
  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect();
    // Never cache a failed connection — the next request should retry.
    clientPromise.catch(() => {
      clientPromise = undefined;
    });
  }
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB || "pokeworld").collection<Invite>("invites");
}

const fileStorePath = () =>
  process.env.POKEWORLD_INVITES_FILE || path.resolve(process.cwd(), ".data", "invites.json");
let fileInvites: Invite[] | undefined;

/** Test hook: drop the in-memory cache so a fresh file path takes effect. */
export function resetInviteFileStoreForTests(): void {
  fileInvites = undefined;
}

function loadFileInvites(): Invite[] {
  if (!fileInvites) {
    try {
      fileInvites = JSON.parse(readFileSync(fileStorePath(), "utf8")) as Invite[];
    } catch {
      fileInvites = [];
    }
  }
  return fileInvites;
}

function persistFileInvites(): void {
  try {
    const file = fileStorePath();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(fileInvites ?? [], null, 2));
  } catch {
    // best effort — the in-memory copy still serves this process
  }
}

// --- validation ------------------------------------------------------------

/** Trainer-name shape: letters, digits, spaces and a few friendly marks. */
export function normalizeInviteeName(raw: unknown): string {
  if (typeof raw !== "string") throw new InviteStoreError("A friend's name is required", 400);
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw new InviteStoreError("A friend's name is required", 400);
  if (name.length > MAX_INVITEE_NAME_LENGTH) {
    throw new InviteStoreError(`Names are limited to ${MAX_INVITEE_NAME_LENGTH} characters`, 400);
  }
  if (!/^[\p{L}\p{N} .'-]+$/u.test(name)) {
    throw new InviteStoreError("Names can use letters, numbers, spaces, and . ' -", 400);
  }
  return name;
}

export function toPublicInvite(invite: Invite): PublicInvite {
  return {
    id: invite.id,
    inviteeName: invite.inviteeName,
    inviterName: invite.inviter.displayName || invite.inviter.username,
  };
}

// --- public API ------------------------------------------------------------

export async function createInvite(input: {
  inviteeName: unknown;
  inviter: { id: string; username: string; displayName?: string };
}): Promise<Invite> {
  const invite: Invite = {
    id: mintInviteId(),
    inviteeName: normalizeInviteeName(input.inviteeName),
    inviter: {
      id: input.inviter.id,
      username: input.inviter.username,
      ...(input.inviter.displayName ? { displayName: input.inviter.displayName } : {}),
    },
    createdAt: new Date().toISOString(),
  };

  const collection = await invitesCollection();
  if (collection) {
    const existing = await collection.countDocuments({ "inviter.id": input.inviter.id });
    if (existing >= MAX_INVITES_PER_USER) {
      throw new InviteStoreError(`Each trainer can mint up to ${MAX_INVITES_PER_USER} invites`, 429);
    }
    await collection.insertOne({ ...invite });
    return invite;
  }

  const invites = loadFileInvites();
  if (invites.filter((entry) => entry.inviter.id === input.inviter.id).length >= MAX_INVITES_PER_USER) {
    throw new InviteStoreError(`Each trainer can mint up to ${MAX_INVITES_PER_USER} invites`, 429);
  }
  invites.unshift(invite);
  persistFileInvites();
  return invite;
}

export async function getInvite(id: string): Promise<Invite | undefined> {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) return undefined;
  const collection = await invitesCollection();
  if (collection) {
    const document = await collection.findOne({ id }, { projection: { _id: 0 } });
    return document ?? undefined;
  }
  return loadFileInvites().find((invite) => invite.id === id);
}
