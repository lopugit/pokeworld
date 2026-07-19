import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  getSessionSecret,
  isPokeworldAdmin,
  toSessionView,
  verifySessionToken,
} from "../server/services/auth/session";

const SECRET = "pokeworld-test-session-secret-that-is-long-enough";
const NOW = Date.UTC(2026, 6, 19, 12, 0, 0);
const LOPU_THINGTIME_ID = "6a3a04f02fb36af29e4f1517";

describe("Pokeworld sessions", () => {
  it("signs and verifies a bounded session without storing a Thingtime bearer", () => {
    const token = createSessionToken(
      {
        id: LOPU_THINGTIME_ID,
        username: "lopu",
        displayName: "Lopu",
      },
      SECRET,
      NOW,
      60,
    );

    expect(token).not.toContain("Bearer");
    const claims = verifySessionToken(token, SECRET, NOW + 10_000);
    expect(claims?.user).toEqual({
      id: LOPU_THINGTIME_ID,
      username: "lopu",
      displayName: "Lopu",
    });
    expect(claims && toSessionView(claims)).toMatchObject({
      authenticated: true,
      isAdmin: true,
      user: { username: "lopu" },
    });
  });

  it("rejects tampered, expired, and unreasonably future-dated sessions", () => {
    const token = createSessionToken({ id: "user-1", username: "misty" }, SECRET, NOW, 10);
    const [payload, signature] = token.split(".");

    expect(verifySessionToken(`${payload}x.${signature}`, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(token, SECRET, NOW + 10_000)).toBeNull();

    const future = createSessionToken({ id: "user-1", username: "misty" }, SECRET, NOW + 600_000, 60);
    expect(verifySessionToken(future, SECRET, NOW)).toBeNull();
  });

  it("always recognizes @lopu by immutable ID and supports extra ID allowlisting", () => {
    expect(isPokeworldAdmin(LOPU_THINGTIME_ID, "")).toBe(true);
    expect(isPokeworldAdmin("another-id", "someone-else, another-id ")).toBe(true);
    expect(isPokeworldAdmin("not-listed", "someone-else,another-id")).toBe(false);
  });

  it("requires a strong explicit secret on public deployments", () => {
    expect(() => getSessionSecret({ VERCEL: "1" })).toThrow(/required/);
    expect(() => getSessionSecret({ VERCEL: "1", POKEWORLD_SESSION_SECRET: "short" })).toThrow(
      /at least 32/,
    );
    expect(
      getSessionSecret({ VERCEL: "1", POKEWORLD_SESSION_SECRET: SECRET }),
    ).toBe(SECRET);
  });
});
