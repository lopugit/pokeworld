import fs from "node:fs";
import { PNG } from "pngjs";
const names = ["pond-1","pond-2","pond-3","pond-4","pond-5","pond-6","pond-7","pond-8","pond-9","pond-20","pond-21","pond-22","pond-23","pond-24","pond-25","sand-1","sand-2","sand-5","sand-8","path-5","road-5","grass"];
const S = 8, T = 16, PAD = 4;
const out = new PNG({ width: names.length * (T * S + PAD) + PAD, height: T * S + 2 * PAD });
out.data.fill(40);
names.forEach((n, i) => {
  const f = `public/tiles/${n}.png`;
  if (!fs.existsSync(f)) return;
  const t = PNG.sync.read(fs.readFileSync(f));
  for (let y = 0; y < T * S; y++) for (let x = 0; x < T * S; x++) {
    const si = ((y >> 3) * t.width + (x >> 3)) * 4;
    const di = ((y + PAD) * out.width + PAD + i * (T * S + PAD) + x) * 4;
    for (let k = 0; k < 4; k++) out.data[di + k] = t.data[si + k];
  }
});
fs.writeFileSync(process.argv[2], PNG.sync.write(out));
console.log(names.join(" "));
