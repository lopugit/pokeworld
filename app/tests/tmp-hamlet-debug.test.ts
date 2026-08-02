import { it } from "vitest";
import { generateDesign } from "../src/lib/design/catalog";

it("dump seed 1", () => {
  const d = generateDesign("lakeside-hamlet", 1)!;
  for (let r = 0; r <= 5; r++) {
    console.log(r, d.tiles[r].slice(0, 9).map(t => `${(t.img ?? "?").slice(0,7)}${t.feature ? "/" + t.feature : ""}`).join(" | "));
  }
});
