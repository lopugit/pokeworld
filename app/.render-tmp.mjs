// Render generated designs to PNG using the real tile art (no img2 sprites for entities).
import fs from "node:fs";
import { PNG } from "pngjs";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { fsCache: false });

const root = new URL("./src/lib/design/", import.meta.url).pathname;
const { FAMILY_BY_ID } = await jiti.import(`${root}families.ts`);
const { bakeGround, newGrid, newGround } = await jiti.import(`${root}paint.ts`);
const { createRng } = await jiti.import(`${root}rng.ts`);

const TILE_DIR = new URL("./public/tiles/", import.meta.url).pathname;
const GRID = 16;
const cache = new Map();
const loadTile = (name) => {
  if (cache.has(name)) return cache.get(name);
  const file = `${TILE_DIR}${name}.png`;
  let png = null;
  if (fs.existsSync(file)) png = PNG.sync.read(fs.readFileSync(file));
  cache.set(name, png);
  return png;
};

const gen = (familyId, seed) => {
  const family = FAMILY_BY_ID.get(familyId);
  const rng = createRng(family.id, seed);
  const ctx = { rng, ground: newGround(), grid: newGrid(), entities: [] };
  family.paintGround(ctx);
  bakeGround(ctx.grid, ctx.ground, rng, family.waterFallback ?? "grass");
  family.decorate(ctx);
  return ctx;
};

const SCALE = 4;
const render = (familyId, seed, out) => {
  const ctx = gen(familyId, seed);
  const sample = loadTile("grass");
  const T = sample.width; // tile px
  const img = new PNG({ width: GRID * T * SCALE, height: GRID * T * SCALE });
  img.data.fill(255);
  const blit = (name, col, row) => {
    const t = loadTile(name);
    if (!t) { console.log("missing tile art:", name); return; }
    for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
      const si = (y * t.width + x) * 4;
      const a = t.data[si + 3] / 255;
      if (a === 0) continue;
      for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) {
        const dx = (col * T + x) * SCALE + sx;
        const dy = (row * T + y) * SCALE + sy;
        const di = (dy * img.width + dx) * 4;
        for (let ch = 0; ch < 3; ch++) img.data[di + ch] = t.data[si + ch] * a + img.data[di + ch] * (1 - a);
        img.data[di + 3] = 255;
      }
    }
  };
  for (let row = 0; row < GRID; row++) for (let col = 0; col < GRID; col++) {
    const tile = ctx.grid[row][col];
    if (tile.img) blit(tile.img, col, row);
    if (tile.img2) blit(tile.img2, col, row);
  }
  // mark entities with a magenta dot
  for (const e of ctx.entities) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const dx = (e.col * T + 4) * SCALE + x, dy = (e.row * T + 4) * SCALE + y;
      const di = (dy * img.width + dx) * 4;
      img.data[di] = 255; img.data[di + 1] = 0; img.data[di + 2] = 255; img.data[di + 3] = 255;
    }
  }
  fs.writeFileSync(out, PNG.sync.write(img));
  console.log("wrote", out);
};

const outDir = process.argv[2];
for (const spec of process.argv.slice(3)) {
  const [familyId, seed] = spec.split(":");
  render(familyId, Number(seed), `${outDir}/${familyId}-${seed}.png`);
}
