#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, ".vercel/output");
const indexPath = path.join(output, "static/index.html");
const configPath = path.join(output, "config.json");
const workflowManifestPath = path.join(output, "diagnostics/workflows-manifest.json");
const workflowStepConfigPath = path.join(
  output,
  "functions/.well-known/workflow/v1/step.func/.vc-config.json",
);

function invariant(condition, message) {
  if (!condition) throw new Error(`[verify:vercel-output] ${message}`);
}

function filesBelow(directory, filename) {
  if (!existsSync(directory)) return [];
  const outputFiles = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) outputFiles.push(...filesBelow(candidate, filename));
    else if (entry.name === filename) outputFiles.push(candidate);
  }
  return outputFiles;
}

invariant(existsSync(indexPath), ".vercel/output/static/index.html is missing");
const index = readFileSync(indexPath, "utf8");
invariant(index.includes('<div id="root"></div>'), "the React root shell is missing");
invariant(/\/assets\/[^"']+\.js/.test(index), "the Vite client asset is missing");

invariant(existsSync(configPath), ".vercel/output/config.json is missing");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const routes = Array.isArray(config.routes) ? config.routes : [];
const filesystemIndex = routes.findIndex((route) => route.handle === "filesystem");
const fallbackIndex = routes.findIndex(
  (route, indexValue) =>
    indexValue > filesystemIndex &&
    route.src === "/(.*)" &&
    ["/__server", "/__nitro"].includes(route.dest || ""),
);
invariant(filesystemIndex >= 0, "filesystem routing is missing");
invariant(fallbackIndex > filesystemIndex, "Nitro fallback must come after filesystem routing");

const functionConfigs = filesBelow(path.join(output, "functions"), ".vc-config.json");
invariant(functionConfigs.length > 0, "no Vercel functions were emitted");
const functionValues = functionConfigs.map((file) => ({
  file,
  value: JSON.parse(readFileSync(file, "utf8")),
}));
invariant(
  functionValues.some(({ value }) => String(value.runtime || "").startsWith("nodejs")),
  "no Node.js function runtime was emitted",
);

invariant(existsSync(workflowStepConfigPath), "the Vercel Workflow step function is missing");
const workflowStepConfig = JSON.parse(readFileSync(workflowStepConfigPath, "utf8"));
invariant(
  workflowStepConfig.maxDuration === "max",
  'the durable Workflow step function must use maxDuration: "max"',
);
invariant(
  Array.isArray(workflowStepConfig.experimentalTriggers) &&
    workflowStepConfig.experimentalTriggers.some(
      (trigger) => trigger.type === "queue/v2beta" && trigger.topic === "__wkf_step_*",
    ),
  "the durable Workflow step function is missing its private queue trigger",
);
invariant(
  String(workflowStepConfig.runtime || "").startsWith("nodejs"),
  "the durable Workflow step function is not using Node.js",
);

invariant(existsSync(workflowManifestPath), "the Workflow manifest is missing");
const workflowManifest = JSON.parse(readFileSync(workflowManifestPath, "utf8"));
invariant(
  Object.values(workflowManifest.workflows || {}).some((file) =>
    Object.hasOwn(file, "generateMapWorkflow"),
  ),
  "generateMapWorkflow is missing from the Workflow manifest",
);
invariant(
  Object.values(workflowManifest.steps || {}).some((file) =>
    Object.hasOwn(file, "generateMapBlockStep"),
  ),
  "generateMapBlockStep is missing from the Workflow manifest",
);

process.stdout.write(
  `[verify:vercel-output] React shell, routing order, Node server, workflow manifest, and max-duration queue step verified\n`,
);
