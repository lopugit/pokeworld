import fs from "node:fs";
import { PNG } from "pngjs";
const [src, out, c0, r0, c1, r1] = process.argv.slice(2);
const png = PNG.sync.read(fs.readFileSync(src));
const T = 64; // 16px * scale 4
const x0 = c0 * T, y0 = r0 * T, w = (c1 - c0 + 1) * T, h = (r1 - r0 + 1) * T;
const outP = new PNG({ width: w * 2, height: h * 2 });
for (let y = 0; y < h * 2; y++) for (let x = 0; x < w * 2; x++) {
  const si = ((y0 + (y >> 1)) * png.width + x0 + (x >> 1)) * 4;
  const di = (y * outP.width + x) * 4;
  for (let k = 0; k < 4; k++) outP.data[di + k] = png.data[si + k];
}
fs.writeFileSync(out, PNG.sync.write(outP));
