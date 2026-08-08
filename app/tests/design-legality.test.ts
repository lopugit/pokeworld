// Tile-legality verification for every generated design, enforced through the
// legality database in src/lib/design/legality.ts: decorations may only stand
// on the ground family their art was drawn for, autotile indexes must agree
// with their neighbourhoods, water must satisfy the live generator's
// smoothing invariants, structures may never be half-embedded, and banned art
// (fake ledges, pink rock-1, pond-22/23 corners, raw cave crops) may never
// appear at all. This is what keeps the design browser looking like real
// Emerald maps — and what makes the old transition bugs unshippable.

import { describe, expect, it } from "vitest";
import { DESIGN_FAMILIES, designCatalog, generateDesign } from "../src/lib/design";
import { formatViolations, validateDesign } from "../src/lib/design/legality";

describe("design tile legality", () => {
  const catalog = designCatalog();

  it("every catalog design passes the legality validator", () => {
    for (const summary of catalog) {
      const design = generateDesign(summary.family, summary.seed)!;
      const violations = validateDesign(design.tiles);
      expect(violations, formatViolations(design.id, violations)).toEqual([]);
    }
  });

  it("remix seeds far outside the curated range also pass", () => {
    for (const family of DESIGN_FAMILIES) {
      for (const seed of [1000, 31337, 987654321]) {
        const design = generateDesign(family.id, seed)!;
        const violations = validateDesign(design.tiles);
        expect(violations, formatViolations(design.id, violations)).toEqual([]);
      }
    }
  });

  it("entities never stand inside solid tiles or water, and never overlap", () => {
    for (const summary of catalog) {
      const design = generateDesign(summary.family, summary.seed)!;
      const seen = new Set<string>();
      for (const entity of design.entities) {
        const tile = design.tiles[entity.row][entity.col];
        expect(tile.solid ?? false, `${design.id}: ${entity.label} stands in a solid tile`).toBe(false);
        expect((tile.img ?? "").startsWith("pond"), `${design.id}: ${entity.label} stands in water`).toBe(false);
        const key = `${entity.col},${entity.row}`;
        expect(seen.has(key), `${design.id}: two entities share (${key})`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("village-family scenes reliably include their houses", () => {
    for (const familyId of ["hoenn-village", "lakeside-hamlet", "quiet-retreat", "daycare-garden", "woodcutter-camp"]) {
      let withHouse = 0;
      const total = 100;
      for (let seed = 0; seed < total; seed += 1) {
        const design = generateDesign(familyId, seed)!;
        if (design.tiles.some((row) => row.some((tile) => tile.feature === "house"))) withHouse += 1;
      }
      expect(withHouse / total, `${familyId}: only ${withHouse}/${total} scenes have a house`).toBeGreaterThanOrEqual(0.95);
    }
  });

  it("catalog card names always extend the regenerated design name (dedup suffixes only)", () => {
    for (const summary of catalog) {
      const design = generateDesign(summary.family, summary.seed)!;
      expect(
        summary.name === design.name || summary.name.startsWith(`${design.name} `),
        `${summary.id}: card "${summary.name}" vs regenerated "${design.name}"`,
      ).toBe(true);
    }
  });
});
