import { describe, expect, it, vi } from "vitest";
import {
  exchangeThingtimeToken,
  ThingtimeAuthenticationError,
} from "../server/services/auth/thingtime";

const TOKEN = "thingtime-app-token-used-only-for-this-test";
const ORIGIN = "https://pokeworld.example";

function thingtimeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Thingtime identity exchange", () => {
  it("validates the bearer against Thingtime with the exact Pokeworld origin", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      thingtimeResponse({
        ok: true,
        scopes: ["profile.username", "profile.displayName", "profile.avatar"],
        user: {
          id: "thingtime-user-id",
          username: "brock",
          displayName: "Brock",
          avatarUrl: "https://thingtime.com/avatar/brock.png",
          profileUrl: "https://thingtime.com/profile/brock",
          email: "not-requested@example.com",
        },
      }),
    );

    const identity = await exchangeThingtimeToken(TOKEN, ORIGIN, {
      fetchImpl: fetchImpl as typeof fetch,
    });

    const [, init] = fetchImpl.mock.calls[0] || [];
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("origin")).toBe(ORIGIN);
    expect(identity).toEqual({
      scopes: ["profile.username", "profile.displayName", "profile.avatar"],
      user: {
        id: "thingtime-user-id",
        username: "brock",
        displayName: "Brock",
        avatarUrl: "https://thingtime.com/avatar/brock.png",
        profileUrl: "https://thingtime.com/profile/brock",
      },
    });
    expect(identity.user).not.toHaveProperty("email");
  });

  it("rejects invalid origins before sending the bearer anywhere", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      exchangeThingtimeToken(TOKEN, `${ORIGIN}/`, { fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, 401],
    [403, 403],
    [429, 429],
    [503, 502],
  ])("maps Thingtime HTTP %s to a safe Pokeworld status", async (upstreamStatus, expectedStatus) => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      thingtimeResponse({ ok: false, error: "upstream detail" }, upstreamStatus),
    );
    const error = await exchangeThingtimeToken(TOKEN, ORIGIN, {
      fetchImpl: fetchImpl as typeof fetch,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ThingtimeAuthenticationError);
    expect(error).toMatchObject({ status: expectedStatus });
    expect((error as Error).message).not.toContain("upstream detail");
  });

  it("rejects malformed success payloads and unreachable Thingtime safely", async () => {
    const malformed = vi.fn<typeof fetch>(async () =>
      thingtimeResponse({ ok: true, scopes: [], user: {} }),
    );
    await expect(
      exchangeThingtimeToken(TOKEN, ORIGIN, { fetchImpl: malformed as typeof fetch }),
    ).rejects.toMatchObject({ status: 502 });

    const unreachable = vi.fn<typeof fetch>(async () => {
      throw new Error("network detail");
    });
    await expect(
      exchangeThingtimeToken(TOKEN, ORIGIN, { fetchImpl: unreachable as typeof fetch }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
