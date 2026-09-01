import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createInvite,
  getInvite,
  InviteStoreError,
  MAX_INVITEE_NAME_LENGTH,
  normalizeInviteeName,
  resetInviteFileStoreForTests,
  toPublicInvite,
} from "../server/services/invites/store";
import { inviteGreetingPages, inviteIdFromLocation, inviteUrlFor } from "../src/lib/invites";
import { normalizeTrainerName, starterTrainer } from "../src/lib/trainer-state";

const inviter = { id: "user-1", username: "lopu", displayName: "Nikolaj" };

describe("invite store (file fallback)", () => {
  beforeEach(() => {
    process.env.POKEWORLD_OFFLINE_MAP = "true";
    process.env.POKEWORLD_INVITES_FILE = path.join(mkdtempSync(path.join(tmpdir(), "pw-invites-")), "invites.json");
    resetInviteFileStoreForTests();
  });
  afterEach(() => {
    delete process.env.POKEWORLD_OFFLINE_MAP;
    delete process.env.POKEWORLD_INVITES_FILE;
    resetInviteFileStoreForTests();
  });

  it("creates and fetches an invite with a URL-safe id", async () => {
    const invite = await createInvite({ inviteeName: "  Ash   Ketchum  ", inviter });
    expect(invite.id).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    expect(invite.inviteeName).toBe("Ash Ketchum");
    const fetched = await getInvite(invite.id);
    expect(fetched?.inviteeName).toBe("Ash Ketchum");
    expect(toPublicInvite(fetched!)).toEqual({
      id: invite.id,
      inviteeName: "Ash Ketchum",
      inviterName: "Nikolaj",
    });
  });

  it("falls back to the username when no display name exists", async () => {
    const invite = await createInvite({ inviteeName: "May", inviter: { id: "u2", username: "brendan" } });
    expect(toPublicInvite(invite).inviterName).toBe("brendan");
  });

  it("rejects malformed ids without touching the store", async () => {
    expect(await getInvite("../etc/passwd")).toBeUndefined();
    expect(await getInvite("")).toBeUndefined();
  });
});

describe("normalizeInviteeName", () => {
  it("trims, collapses whitespace, and enforces the cap", () => {
    expect(normalizeInviteeName("  Misty  ")).toBe("Misty");
    expect(() => normalizeInviteeName("")).toThrow(InviteStoreError);
    expect(() => normalizeInviteeName("x".repeat(MAX_INVITEE_NAME_LENGTH + 1))).toThrow(InviteStoreError);
    expect(() => normalizeInviteeName("<script>")).toThrow(InviteStoreError);
    expect(normalizeInviteeName("Ann-Marie J.")).toBe("Ann-Marie J.");
  });
});

describe("client invite helpers", () => {
  it("parses the invite id from the location search", () => {
    expect(inviteIdFromLocation("?invite=abc123XYZ")).toBe("abc123XYZ");
    expect(inviteIdFromLocation("?invite=<bad>")).toBeNull();
    expect(inviteIdFromLocation("")).toBeNull();
  });

  it("builds the shareable URL", () => {
    expect(inviteUrlFor("https://pokeworld.center", "abc")).toBe("https://pokeworld.center/?invite=abc");
  });

  it("keeps every greeting page within the two-line GBA window", () => {
    const pages = inviteGreetingPages({
      id: "x",
      inviteeName: "M".repeat(12),
      inviterName: "N".repeat(30),
    });
    expect(pages[0]).toContain("Hi " + "M".repeat(12));
    expect(pages.some((page) => page.includes("legendary TRAINER"))).toBe(true);
    for (const page of pages) {
      const lines = page.split("\n");
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(34);
    }
  });
});

describe("invited trainer name", () => {
  it("starts the invited friend's save under their invite name", () => {
    const trainer = starterTrainer({ speciesId: 1 }, "Ash Ketchum");
    expect(trainer.name).toBe("Ash Ketchum");
  });

  it("defaults to TRAINER without an invite", () => {
    expect(starterTrainer({ speciesId: 1 }).name).toBe("TRAINER");
    expect(normalizeTrainerName("   ")).toBeUndefined();
  });
});
