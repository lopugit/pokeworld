#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ecosystem = path.join(root, "ecosystem.config.cjs");
const port = 3847;
const name = `pokeworld-nitro-react-${port}`;
const pm2Binary = process.platform === "win32" ? "pm2.cmd" : "pm2";
const legacyNames = /^pokeworld-(?:api|frontend)(?:-\d{3,4}(?:am|pm))?$/;
const ownedDirectories = new Set([root, path.join(root, "api"), path.join(root, "frontend")]);

function pm2(args, options = {}) {
  return execFileSync(pm2Binary, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function apps() {
  return JSON.parse(pm2(["jlist"]));
}

function isOwned(app) {
  const cwd = app.pm2_env?.pm_cwd;
  return app.name === name || (ownedDirectories.has(cwd) && legacyNames.test(app.name));
}

function listeners() {
  const result = spawnSync("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });
  return result.stdout
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForPortClear() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (listeners().length === 0) return;
    await delay(250);
  }
  throw new Error(`Port ${port} is still owned by PID(s) ${listeners().join(", ")}`);
}

async function waitForHealth() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        const value = await response.json();
        if (value.app === "pokeworld" && value.status === "ok") return value;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Health check failed${lastError ? `: ${lastError.message}` : ""}`);
}

function removeOwned(currentApps) {
  for (const app of currentApps.filter(isOwned)) {
    process.stdout.write(`[pms] removing ${app.name} (PM2 id ${app.pm_id})\n`);
    pm2(["delete", String(app.pm_id)], { stdio: "inherit" });
  }
}

async function start() {
  const before = apps();
  removeOwned(before);
  await waitForPortClear();

  const unexpected = listeners();
  if (unexpected.length > 0) {
    throw new Error(`Refusing to start: port ${port} is owned by PID(s) ${unexpected.join(", ")}`);
  }

  process.stdout.write(`[pms] starting ${name} at http://127.0.0.1:${port}\n`);
  pm2(["start", ecosystem, "--only", name], { stdio: "inherit" });

  try {
    const health = await waitForHealth();
    const first = apps().filter((app) => app.name === name);
    if (first.length !== 1 || first[0].pm2_env?.status !== "online") {
      throw new Error(`Expected exactly one online ${name} process`);
    }
    const restartCount = first[0].pm2_env?.restart_time ?? 0;
    await delay(1000);
    const second = apps().filter((app) => app.name === name);
    if (
      second.length !== 1 ||
      second[0].pm2_env?.status !== "online" ||
      (second[0].pm2_env?.restart_time ?? 0) !== restartCount
    ) {
      throw new Error(`${name} did not remain stable after startup`);
    }
    if (listeners().length !== 1) {
      throw new Error(`Expected one listener on ${port}, found ${listeners().length}`);
    }
    pm2(["save"], { stdio: "inherit" });
    process.stdout.write(
      `[pms] healthy: ${health.workflowWorld} Workflow world, one stable listener on ${port}\n`,
    );
  } catch (error) {
    try {
      pm2(["logs", name, "--lines", "30", "--nostream"], { stdio: "inherit" });
      pm2(["stop", name], { stdio: "inherit" });
    } catch {
      // Preserve the original startup failure.
    }
    throw error;
  }
}

async function stop() {
  const current = apps();
  const owned = current.filter(isOwned);
  if (owned.length === 0) {
    process.stdout.write("[pms] no Pokeworld dev process is registered\n");
    return;
  }
  removeOwned(current);
  await waitForPortClear();
  pm2(["save"], { stdio: "inherit" });
  process.stdout.write(`[pms] stopped Pokeworld and released port ${port}\n`);
}

function status() {
  const current = apps().filter(isOwned);
  if (current.length === 0) {
    process.stdout.write("[pms] stopped\n");
    return;
  }
  for (const app of current) {
    process.stdout.write(
      `[pms] ${app.name}: ${app.pm2_env?.status ?? "unknown"}, cwd ${app.pm2_env?.pm_cwd}\n`,
    );
  }
}

const command = process.argv[2] || "start";
try {
  if (command === "start") await start();
  else if (command === "stop") await stop();
  else if (command === "status") status();
  else throw new Error(`Unknown command ${JSON.stringify(command)} (use start, stop, or status)`);
} catch (error) {
  process.stderr.write(`[pms] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
