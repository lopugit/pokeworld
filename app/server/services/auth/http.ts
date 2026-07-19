import {
  deleteCookie,
  getCookie,
  getHeader,
  getRequestURL,
  setCookie,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from "nitro/h3";
import {
  createSessionToken,
  getSessionSecret,
  POKEWORLD_SESSION_COOKIE,
  POKEWORLD_SESSION_TTL_SECONDS,
  toSessionView,
  verifySessionToken,
  type PokeworldSessionView,
  type PokeworldUser,
} from "./session";

export class AuthHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthHttpError";
  }
}

export function privateJson<T>(event: H3Event, value: T, status = 200) {
  setResponseStatus(event, status);
  setResponseHeader(event, "cache-control", "private, no-store, max-age=0");
  setResponseHeader(event, "content-type", "application/json; charset=utf-8");
  setResponseHeader(event, "vary", "cookie");
  return value;
}

export function requireSameOrigin(event: H3Event) {
  const origin = getHeader(event, "origin");
  if (!origin || origin === "null") throw new AuthHttpError("A same-origin request is required", 403);

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new AuthHttpError("A valid request origin is required", 403);
  }

  const requestOrigin = getRequestURL(event).origin;
  if (parsed.origin !== origin || parsed.origin !== requestOrigin) {
    throw new AuthHttpError("The request origin does not match Pokeworld", 403);
  }
  return origin;
}

function cookieOptions(maxAge = POKEWORLD_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: true,
  };
}

export function setPokeworldSession(event: H3Event, user: PokeworldUser) {
  const secret = getSessionSecret();
  const token = createSessionToken(user, secret);
  setCookie(event, POKEWORLD_SESSION_COOKIE, token, cookieOptions());
  const claims = verifySessionToken(token, secret);
  if (!claims) throw new Error("Failed to create Pokeworld session");
  return toSessionView(claims);
}

export function clearPokeworldSession(event: H3Event) {
  deleteCookie(event, POKEWORLD_SESSION_COOKIE, cookieOptions(0));
}

export function readPokeworldSession(event: H3Event): PokeworldSessionView | null {
  const raw = getCookie(event, POKEWORLD_SESSION_COOKIE);
  if (!raw) return null;
  const claims = verifySessionToken(raw, getSessionSecret());
  if (!claims) {
    clearPokeworldSession(event);
    return null;
  }
  return toSessionView(claims);
}

export function requireAdminSession(event: H3Event) {
  const session = readPokeworldSession(event);
  if (!session) throw new AuthHttpError("Sign in with Thingtime to continue", 401);
  if (!session.isAdmin) throw new AuthHttpError("Pokeworld administrator access is required", 403);
  return session;
}
