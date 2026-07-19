import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const POKEWORLD_SESSION_COOKIE = "__Host-pokeworld_session";
export const POKEWORLD_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const IMMUTABLE_ADMIN_THINGTIME_ID = "6a3a04f02fb36af29e4f1517";
const LOCAL_DEVELOPMENT_SECRET = randomBytes(32).toString("base64url");

export interface PokeworldUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
}

export interface PokeworldSessionClaims {
  v: 1;
  iat: number;
  exp: number;
  user: PokeworldUser;
}

export interface PokeworldSessionView {
  authenticated: true;
  expiresAt: string;
  isAdmin: boolean;
  user: PokeworldUser;
}

function isPublicDeployment(env: NodeJS.ProcessEnv) {
  return env.VERCEL === "1" || Boolean(env.VERCEL_ENV) || env.POKEWORLD_PUBLIC_BUILD === "true";
}

export function getSessionSecret(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.POKEWORLD_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;

  if (configured) {
    throw new Error("POKEWORLD_SESSION_SECRET must contain at least 32 characters");
  }

  if (isPublicDeployment(env)) {
    throw new Error("POKEWORLD_SESSION_SECRET is required for public deployments");
  }

  return LOCAL_DEVELOPMENT_SECRET;
}

function signatureFor(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function isValidUser(value: unknown): value is PokeworldUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  if (typeof user.id !== "string" || user.id.length < 1 || user.id.length > 128) return false;
  if (typeof user.username !== "string" || user.username.length < 1 || user.username.length > 80) return false;
  for (const key of ["displayName", "avatarUrl", "profileUrl"] as const) {
    if (user[key] !== undefined && typeof user[key] !== "string") return false;
  }
  return true;
}

function isValidClaims(value: unknown): value is PokeworldSessionClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;
  return (
    claims.v === 1 &&
    typeof claims.iat === "number" &&
    Number.isInteger(claims.iat) &&
    typeof claims.exp === "number" &&
    Number.isInteger(claims.exp) &&
    isValidUser(claims.user)
  );
}

export function createSessionToken(
  user: PokeworldUser,
  secret: string,
  nowMs = Date.now(),
  ttlSeconds = POKEWORLD_SESSION_TTL_SECONDS,
) {
  if (!isValidUser(user)) throw new Error("Cannot create a session for an invalid user");
  if (secret.length < 32) throw new Error("Session secret must contain at least 32 characters");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) throw new Error("Session TTL must be positive");

  const issuedAt = Math.floor(nowMs / 1000);
  const claims: PokeworldSessionClaims = {
    v: 1,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    user,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${signatureFor(payload, secret)}`;
}

export function verifySessionToken(token: string, secret: string, nowMs = Date.now()) {
  if (!token || token.length > 8192) return null;
  const segments = token.split(".");
  if (segments.length !== 2) return null;
  const [payload, providedSignature] = segments;
  if (!payload || !providedSignature) return null;

  const expected = Buffer.from(signatureFor(payload, secret), "base64url");
  const provided = Buffer.from(providedSignature, "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!isValidClaims(claims)) return null;
    const now = Math.floor(nowMs / 1000);
    if (claims.iat > now + 300 || claims.exp <= now || claims.exp <= claims.iat) return null;
    return claims;
  } catch {
    return null;
  }
}

export function isPokeworldAdmin(
  thingtimeUserId: string,
  configuredIds = process.env.POKEWORLD_ADMIN_THINGTIME_IDS,
) {
  if (thingtimeUserId === IMMUTABLE_ADMIN_THINGTIME_ID) return true;
  if (!configuredIds) return false;
  return configuredIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(thingtimeUserId);
}

export function toSessionView(claims: PokeworldSessionClaims): PokeworldSessionView {
  return {
    authenticated: true,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    isAdmin: isPokeworldAdmin(claims.user.id),
    user: claims.user,
  };
}
