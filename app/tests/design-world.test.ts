// Multi-block world generation: blocks must merge with legal, continuous
// transitions (validated by the same legality engine as single designs),
// stay deterministic, keep their standalone identity away from seams, and
// refuse ground-incompatible neighbours instead of rendering illegal seams.

import { describe, expect, it } from "vitest";
import { DESIGN_GRID, generateDesign } from "../src/lib/design";
import { formatViolations, validateDesign } from "../src/lib/design/legality";
import { compatibleFamilies, familyGroundProfile, generateWorld } from "../src/lib/design/world";

const spec = (family: string, seed: number) => ({ family, seed });

describe("design world merging", () => {
  it("classifies family ground profiles", () => {
    expect(familyGroundProfile("legendary-cave")).toBe("rocky");
    expect(familyGroundProfile("miners-quarry")).toBe("rocky");
    expect(familyGroundProfile("desert-ruin")).toBe("rocky");
    expect(familyGroundProfile("hoenn-village")).toBe("open");
    expect(familyGroundProfile("tiny-island")).toBe("open");
    expect(compatibleFamilies("legendary-cave")).not.toContain("hoenn-village");
    expect(compatibleFamilies("hoenn-village")).toContain("lakeside-hamlet");
  });

  it("a 3×3 same-family world merges with zero legality violations", () => {
    const world = generateWorld([
      [spec("lakeside-hamlet", 0), spec("lakeside-hamlet", 1), spec("lakeside-hamlet", 2)],
      [spec("lakeside-hamlet", 3), spec("lakeside-hamlet", 4), spec("lakeside-hamlet", 5)],
      [spec("lakeside-hamlet", 6), spec("lakeside-hamlet", 7), spec("lakeside-hamlet", 8)],
    ]);
    expect(world.ok).toBe(true);
    expect(world.tiles.length).toBe(3 * DESIGN_GRID);
    const violations = validateDesign(world.tiles);
    expect(violations, formatViolations("lakeside-3x3", violations)).toEqual([]);
  });

  it("a mixed-biome 3×3 world (village/meadow/forest/waterside/desert) merges legally", () => {
    const world = generateWorld([
      [spec("hoenn-village", 2), spec("butterfly-fields", 1), spec("fishing-hole", 3)],
      [spec("forest-crossing", 4), spec("flower-festival", 0), spec("tiny-island", 5)],
      [spec("scorched-trail", 6), spec("oasis", 2), spec("river-crossing", 7)],
    ]);
    expect(world.ok).toBe(true);
    const violations = validateDesign(world.tiles);
    expect(violations, formatViolations("mixed-3x3", violations)).toEqual([]);
    expect(world.entities.length).toBeGreaterThan(0);
    for (const entity of world.entities) {
      const tile = world.tiles[entity.row][entity.col];
      expect(tile.solid ?? false, `${entity.label} stands in a solid world tile`).toBe(false);
    }
  });

  it("an all-rocky 3×3 world merges legally", () => {
    const world = generateWorld([
      [spec("legendary-cave", 0), spec("mountain-pass", 1), spec("miners-quarry", 2)],
      [spec("team-hideout", 3), spec("summit-lookout", 4), spec("desert-ruin", 5)],
      [spec("mountain-pass", 6), spec("legendary-cave", 7), spec("miners-quarry", 8)],
    ]);
    expect(world.ok).toBe(true);
    const violations = validateDesign(world.tiles);
    expect(violations, formatViolations("rocky-3x3", violations)).toEqual([]);
  });

  it("refuses rocky|grass seams instead of rendering them", () => {
    const world = generateWorld([
      [spec("hoenn-village", 0), spec("legendary-cave", 0)],
    ]);
    expect(world.ok).toBe(false);
    expect(world.conflicts.length).toBeGreaterThan(0);
    expect(world.conflicts[0].reason).toContain("rocky");
    expect(world.tiles).toEqual([]);
  });

  it("null slots become plain grass filler and merge with anything open", () => {
    const world = generateWorld([
      [spec("hoenn-village", 1), null],
      [null, spec("fishing-hole", 2)],
    ]);
    expect(world.ok).toBe(true);
    const violations = validateDesign(world.tiles);
    expect(violations, formatViolations("null-fill", violations)).toEqual([]);
  });

  it("world generation is deterministic", () => {
    const specs = [
      [spec("hoenn-village", 2), spec("butterfly-fields", 1)],
      [spec("forest-crossing", 4), spec("quiet-retreat", 0)],
    ];
    const a = generateWorld(specs);
    const b = generateWorld(specs);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("a block keeps its standalone identity away from seams", () => {
    const standalone = generateDesign("hoenn-village", 4)!;
    const world = generateWorld([
      [spec("hoenn-village", 3), spec("hoenn-village", 4), spec("hoenn-village", 5)],
    ]);
    expect(world.ok).toBe(true);
    // Centre block occupies cols 16..31. The overlay layer (structures,
    // decorations, features) must match the standalone design everywhere;
    // the ground autotile indexes may differ only in the seam-adjacent ring.
    for (let row = 0; row < DESIGN_GRID; row += 1) {
      for (let col = 0; col < DESIGN_GRID; col += 1) {
        const worldTile = world.tiles[row][col + DESIGN_GRID];
        const blockTile = standalone.tiles[row][col];
        expect(worldTile.img2 ?? "", `img2 (${col},${row})`).toBe(blockTile.img2 ?? "");
        expect(worldTile.feature ?? "", `feature (${col},${row})`).toBe(blockTile.feature ?? "");
        if (col >= 1 && col <= DESIGN_GRID - 2) {
          expect(worldTile.img, `img (${col},${row})`).toBe(blockTile.img);
        }
      }
    }
  });
});
