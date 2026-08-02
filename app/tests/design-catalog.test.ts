import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CATALOG_SIZE,
  DESIGN_FAMILIES,
  DESIGN_GRID,
  catalogTags,
  designCatalog,
  generateDesign,
  searchCatalog,
} from "../src/lib/design";

const tilesDir = fileURLToPath(new URL("../public/tiles", import.meta.url));
const knownTiles = new Set(
  readdirSync(tilesDir)
    .filter((file) => file.endsWith(".png"))
    .map((file) => file.replace(/\.png$/, "")),
);

const CHAR_SHEET_SIZE = { width: 840, height: 254 };

describe("design catalog", () => {
  it("produces exactly 500 designs with unique ids and names", () => {
    const catalog = designCatalog();
    expect(catalog).toHaveLength(CATALOG_SIZE);
    expect(new Set(catalog.map((design) => design.id)).size).toBe(CATALOG_SIZE);
    expect(new Set(catalog.map((design) => design.name)).size).toBe(CATALOG_SIZE);
  });

  it("uses every family", () => {
    const families = new Set(designCatalog().map((design) => design.family));
    expect(families.size).toBe(DESIGN_FAMILIES.length);
  });

  it("is deterministic — same family+seed regenerates the identical design", () => {
    for (const family of DESIGN_FAMILIES) {
      const first = generateDesign(family.id, 3);
      const second = generateDesign(family.id, 3);
      expect(second).toEqual(first);
    }
  });

  it("every design references only shipped tile images and in-bounds entities", () => {
    for (const summary of designCatalog()) {
      const design = generateDesign(summary.family, summary.seed);
      expect(design).not.toBeNull();
      if (!design) continue;
      expect(design.tiles).toHaveLength(DESIGN_GRID);
      for (const row of design.tiles) {
        expect(row).toHaveLength(DESIGN_GRID);
        for (const tile of row) {
          for (const ref of [tile.img, tile.img2]) {
            if (ref) expect(knownTiles, `unknown tile "${ref}" in ${design.id}`).toContain(ref);
          }
        }
      }
      for (const entity of design.entities) {
        expect(entity.col).toBeGreaterThanOrEqual(0);
        expect(entity.col).toBeLessThan(DESIGN_GRID);
        expect(entity.row).toBeGreaterThanOrEqual(0);
        expect(entity.row).toBeLessThan(DESIGN_GRID);
        if (entity.kind === "npc") {
          const [x, y, w, h] = entity.rect ?? [0, 0, 0, 0];
          expect(w).toBeGreaterThan(0);
          expect(x + w).toBeLessThanOrEqual(CHAR_SHEET_SIZE.width);
          expect(y + h).toBeLessThanOrEqual(CHAR_SHEET_SIZE.height);
        } else {
          expect(entity.src).toMatch(/^\/sprites\/pokemon\//);
        }
      }
    }
  });

  it("search and filters narrow the catalog", () => {
    expect(searchCatalog({}).length).toBe(CATALOG_SIZE);
    const villages = searchCatalog({ biome: "village" });
    expect(villages.length).toBeGreaterThan(0);
    expect(villages.every((design) => design.biome === "village")).toBe(true);
    const hidden = searchCatalog({ tag: "hidden-items" });
    expect(hidden.length).toBeGreaterThan(0);
    const named = searchCatalog({ query: villages[0].name.toLowerCase() });
    expect(named.some((design) => design.id === villages[0].id)).toBe(true);
    expect(searchCatalog({ query: "zzzz-no-such-design" })).toHaveLength(0);
  });

  it("exposes filter tags with counts", () => {
    const tags = catalogTags();
    expect(tags.length).toBeGreaterThan(10);
    expect(tags[0].count).toBeGreaterThan(0);
  });
});
