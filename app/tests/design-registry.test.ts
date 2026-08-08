// Registry stability: saved community designs reference {family, seed}
// recipes, so family ids must never change once shipped. The manifest pins
// the generated set; this test pins the manifest (and the hand-built ids).
// If it fails, someone edited the registry in a recipe-breaking way — add
// new families instead, never rename or remove existing ones.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DESIGN_FAMILIES, GENERATED_FAMILIES, HAND_FAMILIES, generateDesign } from "../src/lib/design";

describe("design family registry", () => {
  it("contains exactly 500 families (34 hand-built + 466 generated)", () => {
    expect(HAND_FAMILIES).toHaveLength(34);
    expect(GENERATED_FAMILIES).toHaveLength(466);
    expect(DESIGN_FAMILIES).toHaveLength(500);
    expect(new Set(DESIGN_FAMILIES.map((family) => family.id)).size).toBe(500);
  });

  it("family ids are pinned (recipe stability)", () => {
    const digest = createHash("sha256")
      .update(DESIGN_FAMILIES.map((family) => family.id).join("\n"))
      .digest("hex");
    // Update this hash ONLY when appending new families — never on renames.
    expect(digest).toBe("f631fb25def94337e05b254ad34b157e1806d388715e032736d2684fbc5df1c3");
  });

  it("generated families expose real per-seed variety", () => {
    // Spot-check a spread of generated families: two seeds of one family
    // must not produce near-identical tile grids (the old daycare failure).
    const sample = GENERATED_FAMILIES.filter((_, index) => index % 37 === 0);
    for (const family of sample) {
      const a = generateDesign(family.id, 0)!;
      const b = generateDesign(family.id, 1)!;
      let same = 0;
      for (let row = 0; row < 16; row += 1) {
        for (let col = 0; col < 16; col += 1) {
          const ta = a.tiles[row][col];
          const tb = b.tiles[row][col];
          if (`${ta.img}|${ta.img2 ?? ""}|${ta.feature ?? ""}` === `${tb.img}|${tb.img2 ?? ""}|${tb.feature ?? ""}`) {
            same += 1;
          }
        }
      }
      expect(same / 256, `${family.id} seeds 0/1 are ${Math.round((same / 256) * 100)}% identical`).toBeLessThanOrEqual(0.85);
    }
  });
});
