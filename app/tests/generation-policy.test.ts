import { describe, expect, it } from "vitest";
import {
  GenerationControlError,
  assertPublicGenerationPermit,
  assertPublicWorkflowReservation,
  assertRegenerationAllowed,
  isPublicDeployment,
} from "../server/services/map/generation-policy";

describe("public map-generation policy", () => {
  it("recognises every supported public deployment marker", () => {
    expect(isPublicDeployment({ VERCEL: "1" })).toBe(true);
    expect(isPublicDeployment({ VERCEL_ENV: "preview" })).toBe(true);
    expect(isPublicDeployment({ POKEWORLD_PUBLIC_BUILD: "true" })).toBe(true);
    expect(isPublicDeployment({ NODE_ENV: "production" })).toBe(false);
  });

  it("rejects explicit regeneration publicly but permits automatic repair", () => {
    expect(() => assertRegenerationAllowed(false, { VERCEL_ENV: "production" })).not.toThrow();
    expect(() => assertRegenerationAllowed(true, { VERCEL_ENV: "production" })).toThrow(
      expect.objectContaining<Partial<GenerationControlError>>({
        code: "PUBLIC_REGENERATION_DISABLED",
        statusCode: 403,
      }),
    );
  });

  it("fails closed when a public workflow bypasses reservations or permits", () => {
    expect(() => assertPublicWorkflowReservation(undefined, { VERCEL: "1" })).toThrow(
      /quota reservation/,
    );
    expect(() => assertPublicGenerationPermit(undefined, { VERCEL: "1" })).toThrow(
      /quota permit/,
    );
    expect(() => assertPublicWorkflowReservation("reservation", { VERCEL: "1" })).not.toThrow();
    expect(() => assertPublicGenerationPermit("permit", { VERCEL: "1" })).not.toThrow();
  });
});
