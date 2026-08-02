import { describe, expect, it } from "vitest";
import { generateDesign } from "../src/lib/design/catalog";

describe("claim check: lakeside-hamlet houses", () => {
  it("measures house presence across 300 seeds", () => {
    let anyHouse = 0;
    let houseAtFirstSlot = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const design = generateDesign("lakeside-hamlet", seed)!;
      let has = false;
      let first = false;
      for (let r = 0; r < design.tiles.length; r += 1) {
        for (let c = 0; c < design.tiles[r].length; c += 1) {
          if (design.tiles[r][c].feature === "house") {
            has = true;
            if (c >= 1 && c <= 3 && r >= 1 && r <= 4) first = true;
          }
        }
      }
      if (has) anyHouse += 1;
      if (first) houseAtFirstSlot += 1;
      expect(design.tags).toContain("houses");
    }
    console.log("anyHouse:", anyHouse, "/300, firstSlot:", houseAtFirstSlot);
  });
});
