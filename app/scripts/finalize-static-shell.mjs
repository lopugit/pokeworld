#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const transformedShell = path.join(root, "node_modules/.nitro/vite/index.html");
const targetDirectory =
  process.env.NITRO_PRESET === "vercel"
    ? path.join(root, ".vercel/output/static")
    : path.join(root, ".output/public");
const target = path.join(targetDirectory, "index.html");

if (!existsSync(transformedShell)) {
  throw new Error("Nitro's transformed Vite index.html is missing");
}
mkdirSync(targetDirectory, { recursive: true });
copyFileSync(transformedShell, target);
process.stdout.write(`[finalize-static-shell] restored ${path.relative(root, target)}\n`);
