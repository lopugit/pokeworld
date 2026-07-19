import { describe, expect, it, vi } from "vitest";
import {
  ThingtimeApiError,
  isThingtimeServiceConfigured,
  thingtimeServiceRequest,
} from "../server/services/thingtime/client";

describe("Thingtime service client", () => {
  it("requires the private service credential", async () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(isThingtimeServiceConfigured(env)).toBe(false);
    await expect(
      thingtimeServiceRequest("/api/v1/things", {}, { env }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("sends authenticated JSON requests to the configured Thingtime API", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://thingtime.example/api/v1/things?id=one");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer service-test");
      expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
      return new Response(JSON.stringify({ ok: true, thing: { id: "one" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(
      thingtimeServiceRequest<{ ok: true; thing: { id: string } }>(
        "/api/v1/things?id=one",
        {},
        {
          env: {
            THINGTIME_API_URL: "https://thingtime.example/",
            THINGTIME_SERVICE_TOKEN: "service-test",
          } as NodeJS.ProcessEnv,
          fetchImpl: fetchImpl as typeof fetch,
        },
      ),
    ).resolves.toMatchObject({ thing: { id: "one" } });
  });

  it("preserves Thingtime status and machine-readable error codes", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: "Daily limit reached",
          code: "QUOTA_DAILY_LIMIT",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = thingtimeServiceRequest(
      "/api/v1/things/quota",
      {},
      {
        env: { THINGTIME_SERVICE_TOKEN: "service-test" } as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as typeof fetch,
      },
    );
    await expect(request).rejects.toBeInstanceOf(ThingtimeApiError);
    await expect(request).rejects.toMatchObject({
      code: "QUOTA_DAILY_LIMIT",
      statusCode: 429,
    });
  });
});
