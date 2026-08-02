import fs from "node:fs";
import { PNG } from "pngjs";
const names = process.argv[3].split(",");
const S = 12, T = 16, PAD = 6;
const cols = names.length;
const out = new PNG({ width: cols * (T * S + PAD) + PAD, height: T * S + 2 * PAD });
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 255; out.data[i+1] = 0; out.data[i+2] = 0; out.data[i+3] = 255; }
names.forEach((n, i) => {
  const t = PNG.sync.read(fs.readFileSync(`public/tiles/${n}.png`));
  for (let y = 0; y < T * S; y++) for (let x = 0; x < T * S; x++) {
    const si = ((y / S | 0) * t.width + (x / S | 0)) * 4;
    const di = ((y + PAD) * out.width + PAD + i * (T * S + PAD) + x) * 4;
    for (let k = 0; k < 4; k++) out.data[di + k] = t.data[si + k];
  }
});
fs.writeFileSync(process.argv[2], PNG.sync.write(out));
