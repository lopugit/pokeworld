import type { PokeworldUser } from "./session";

export const THINGTIME_USERINFO_URL = "https://thingtime.com/api/v1/oauth/userinfo";

export interface ThingtimeIdentity {
  scopes: string[];
  user: PokeworldUser;
}

export class ThingtimeAuthenticationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ThingtimeAuthenticationError";
  }
}

interface ThingtimeUserinfoPayload {
  ok?: unknown;
  scopes?: unknown;
  user?: unknown;
}

function optionalString(value: unknown, maximumLength: number) {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength ? value : undefined;
}

function parseIdentity(payload: ThingtimeUserinfoPayload): ThingtimeIdentity | null {
  if (payload.ok !== true || !payload.user || typeof payload.user !== "object") return null;
  const rawUser = payload.user as Record<string, unknown>;
  const id = optionalString(rawUser.id, 128);
  const username = optionalString(rawUser.username, 80);
  if (!id || !username) return null;

  const scopes = Array.isArray(payload.scopes)
    ? payload.scopes.filter((scope): scope is string => typeof scope === "string").slice(0, 64)
    : [];
  if (!scopes.includes("profile.username") && !scopes.includes("profile")) return null;

  return {
    scopes,
    user: {
      id,
      username,
      ...(optionalString(rawUser.displayName, 200)
        ? { displayName: optionalString(rawUser.displayName, 200) }
        : {}),
      ...(optionalString(rawUser.avatarUrl, 2048) ? { avatarUrl: optionalString(rawUser.avatarUrl, 2048) } : {}),
      ...(optionalString(rawUser.profileUrl, 2048) ? { profileUrl: optionalString(rawUser.profileUrl, 2048) } : {}),
    },
  };
}

function normalizeOrigin(origin: string) {
  try {
    const parsed = new URL(origin);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.origin !== origin) return null;
    return origin;
  } catch {
    return null;
  }
}

export async function exchangeThingtimeToken(
  token: string,
  origin: string,
  options: {
    fetchImpl?: typeof fetch;
    userinfoUrl?: string;
  } = {},
) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) throw new ThingtimeAuthenticationError("Invalid login origin", 403);
  if (typeof token !== "string" || token.length < 16 || token.length > 8192) {
    throw new ThingtimeAuthenticationError("Invalid Thingtime login token", 401);
  }

  const fetchImpl = options.fetchImpl || fetch;
  let response: Response;
  try {
    response = await fetchImpl(options.userinfoUrl || THINGTIME_USERINFO_URL, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: normalizedOrigin,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ThingtimeAuthenticationError("Thingtime login is temporarily unavailable", 502);
  }

  let payload: ThingtimeUserinfoPayload | null = null;
  try {
    payload = (await response.json()) as ThingtimeUserinfoPayload;
  } catch {
    // The upstream response is deliberately not reflected into Pokeworld.
  }

  if (!response.ok) {
    const status =
      response.status === 429 ? 429 : response.status === 403 ? 403 : response.status >= 500 ? 502 : 401;
    const message =
      status === 429
        ? "Thingtime is receiving too many login checks; please try again shortly"
        : status === 403
          ? "This Pokeworld origin is not allowed for that Thingtime login"
          : status === 502
            ? "Thingtime login is temporarily unavailable"
          : "Thingtime could not verify this login";
    throw new ThingtimeAuthenticationError(message, status);
  }

  const identity = payload ? parseIdentity(payload) : null;
  if (!identity) throw new ThingtimeAuthenticationError("Thingtime returned an invalid identity", 502);
  return identity;
}
