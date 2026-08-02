import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DesignStoreError,
  deleteSavedDesign,
  getSavedDesign,
  listDesigns,
  resetDesignFileStoreForTests,
  saveDesign,
} from "../server/services/designs/store";

// These tests exercise the offline file store; POKEWORLD_OFFLINE_MAP keeps
// mongoUri() undefined regardless of local Mongo env configuration.
let tempDir: string;
const previousEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "pokeworld-designs-"));
  for (const key of ["POKEWORLD_OFFLINE_MAP", "POKEWORLD_DESIGNS_FILE"]) {
    previousEnv[key] = process.env[key];
  }
  process.env.POKEWORLD_OFFLINE_MAP = "true";
  process.env.POKEWORLD_DESIGNS_FILE = path.join(tempDir, "designs.json");
  resetDesignFileStoreForTests();
});

afterAll(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetDesignFileStoreForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

const author = { id: "user-1", username: "lopu" };

describe("designs store (offline file fallback)", () => {
  it("saves a design with server-derived metadata", async () => {
    const design = await saveDesign({ family: "legendary-cave", seed: 424242, author });
    expect(design.id).toBeTruthy();
    expect(design.familyLabel).toBe("Legendary cave");
    expect(design.biome).toBe("mountain");
    expect(design.tags).toContain("legendary");
    expect(design.name.length).toBeGreaterThan(0);
    expect(design.author).toEqual(author);
  });

  it("rejects unknown families and invalid seeds", async () => {
    await expect(saveDesign({ family: "not-a-family", seed: 1, author })).rejects.toThrow(DesignStoreError);
    await expect(saveDesign({ family: "legendary-cave", seed: 1.5, author })).rejects.toThrow(DesignStoreError);
    await expect(saveDesign({ family: "legendary-cave", seed: -1, author })).rejects.toThrow(DesignStoreError);
    await expect(
      saveDesign({ family: "legendary-cave", seed: 1, name: "x".repeat(80), author }),
    ).rejects.toThrow(/limited/);
  });

  it("lists, searches, fetches and deletes", async () => {
    const saved = await saveDesign({
      family: "hoenn-village",
      seed: 777,
      name: "Testville Commons",
      remixOf: "hoenn-village-0",
      author,
    });

    const all = await listDesigns({});
    expect(all.total).toBeGreaterThanOrEqual(2);

    const searched = await listDesigns({ query: "testville" });
    expect(searched.designs.map((design) => design.id)).toContain(saved.id);

    const byBiome = await listDesigns({ biome: "village" });
    expect(byBiome.designs.every((design) => design.biome === "village")).toBe(true);

    const fetched = await getSavedDesign(saved.id);
    expect(fetched?.name).toBe("Testville Commons");
    expect(fetched?.remixOf).toBe("hoenn-village-0");

    await expect(
      deleteSavedDesign(saved.id, { id: "someone-else", isAdmin: false }),
    ).rejects.toThrow(/author/);
    expect(await deleteSavedDesign(saved.id, { id: author.id, isAdmin: false })).toBe(true);
    expect(await getSavedDesign(saved.id)).toBeUndefined();
  });

  it("paginates", async () => {
    for (let index = 0; index < 5; index += 1) {
      await saveDesign({ family: "oasis", seed: 9000 + index, author });
    }
    const pageOne = await listDesigns({ limit: 2, page: 1 });
    const pageTwo = await listDesigns({ limit: 2, page: 2 });
    expect(pageOne.designs).toHaveLength(2);
    expect(pageTwo.designs).toHaveLength(2);
    expect(pageOne.designs[0].id).not.toBe(pageTwo.designs[0].id);
    expect(pageOne.pages).toBeGreaterThanOrEqual(3);
  });
});
