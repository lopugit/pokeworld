import { describe, expect, it } from "vitest";
import { mapBlockStorageProvider } from "../server/services/map/block-store";

describe("map block storage provider", () => {
  it("prefers Thingtime whenever its service account is configured", () => {
    expect(
      mapBlockStorageProvider({
        THINGTIME_SERVICE_TOKEN: "service-test",
        MONGODB_URI: "mongodb://localhost:27017/pokeworld",
        VERCEL: "1",
      } as NodeJS.ProcessEnv),
    ).toBe("thingtime");
  });

  it("keeps Mongo only as a non-public local migration fallback", () => {
    expect(
      mapBlockStorageProvider({
        MONGODB_URI: "mongodb://localhost:27017/pokeworld",
      } as NodeJS.ProcessEnv),
    ).toBe("mongo");
    expect(
      mapBlockStorageProvider({
        MONGODB_URI: "mongodb://localhost:27017/pokeworld",
        VERCEL: "1",
      } as NodeJS.ProcessEnv),
    ).toBe("inline");
  });
});
