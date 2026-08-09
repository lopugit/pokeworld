// QA harness, skipped by default: RENDER_SAMPLES=1 pnpm vitest run
// tests/render-samples.test.ts renders one design per family (seed via
// RENDER_SEED, default 0) into a labelled contact grid PNG for visual review.
// RENDER_OUT overrides the output path.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { DESIGN_FAMILIES, generateDesign } from "../src/lib/design";

const enabled = process.env.RENDER_SAMPLES === "1";

describe.runIf(enabled)("render design samples", () => {
  it("writes a contact grid of one design per family", () => {
    const seed = Number(process.env.RENDER_SEED ?? 0);
    const out =
      process.env.RENDER_OUT ?? "/tmp/design-samples.png";
    const tileCache = new Map<string, PNG | null>();
    const tilePng = (name: string) => {
      if (!tileCache.has(name)) {
        const path = new URL(`../public/tiles/${name}.png`, import.meta.url).pathname;
        tileCache.set(name, existsSync(path) ? PNG.sync.read(readFileSync(path)) : null);
      }
      return tileCache.get(name) ?? null;
    };

    const familyFilter = process.env.RENDER_FAMILY;
    const range = process.env.RENDER_RANGE; // "start:count" over the family list
    let families = DESIGN_FAMILIES;
    if (familyFilter) families = families.filter((f) => f.id.includes(familyFilter));
    if (range) {
      const [start, count] = range.split(":").map(Number);
      families = families.slice(start, start + count);
    }
    const designs = families.map((family) => ({
      family: family.id,
      design: generateDesign(family.id, seed)!,
    }));
    const grid = designs[0].design.tiles;
    const cells = grid.length;
    const scalePx = Number(process.env.RENDER_PX ?? 8); // px per tile
    const columns = 6;
    const rows = Math.ceil(designs.length / columns);
    const pad = 4;
    const cellW = cells * scalePx + pad;
    const sheet = new PNG({
      width: columns * cellW + pad,
      height: rows * (cells * scalePx + pad) + pad,
    });
    sheet.data.fill(24);

    const blitTile = (png: PNG, outX: number, outY: number) => {
      for (let y = 0; y < scalePx; y += 1) {
        for (let x = 0; x < scalePx; x += 1) {
          const sx = Math.floor((x / scalePx) * png.width);
          const sy = Math.floor((y / scalePx) * png.height);
          const si = (sy * png.width + sx) * 4;
          if (png.data[si + 3] === 0) continue;
          sheet.data.set(png.data.subarray(si, si + 4), ((outY + y) * sheet.width + outX + x) * 4);
        }
      }
    };

    designs.forEach(({ design }, index) => {
      const baseX = pad + (index % columns) * cellW;
      const baseY = pad + Math.floor(index / columns) * (cells * scalePx + pad);
      design.tiles.forEach((row, r) => {
        row.forEach((tile, c) => {
          for (const layer of [tile.img, tile.img2]) {
            if (!layer) continue;
            const png = tilePng(layer);
            if (png) blitTile(png, baseX + c * scalePx, baseY + r * scalePx);
            else if (layer !== tile.img) {
              // missing overlay art: paint magenta so it screams on review
              for (let y = 0; y < scalePx; y += 1)
                for (let x = 0; x < scalePx; x += 1)
                  sheet.data.set(
                    [255, 0, 255, 255],
                    ((baseY + r * scalePx + y) * sheet.width + baseX + c * scalePx + x) * 4,
                  );
            }
          }
        });
      });
    });

    writeFileSync(out, PNG.sync.write(sheet));
    console.log(`wrote ${out}: ${designs.length} families, seed ${seed}`);
    expect(designs.length).toBeGreaterThan(0);
  });
});
