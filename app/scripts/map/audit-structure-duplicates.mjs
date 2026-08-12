#!/usr/bin/env node
// Audits a Pokeworld deployment (or a saved block dump) for the
// "multiple map structures on a single google-maps building" defect.
//
// The generator's invariant (server/services/map/legacy/mods/terrain-life.ts):
// a structure SITE is a building-mask cell whose seeded hash is minimal among
// the mask cells reachable inside a SITE_WINDOW box, so on a converged world
// no two structures on the same building can sit within SITE_WINDOW tiles of
// each other, and a building that fits the window carries exactly ONE
// structure no matter how many block seams it crosses. This tool rebuilds the
// building components from real world data, checks those invariants, and
// recomputes the canonical site set from the final mask so stale stitches
// (blocks that planned sites against a truncated mask) are called out even
// when their structures happen to be far apart.
//
// Read-only by default: uses /api/blocks?probe=true, which never reserves
// quota or queues generation. `--mode generate` (optionally with `--poll`)
// asks the server to generate missing blocks in the swept region instead.
//
// Usage:
//   node scripts/map/audit-structure-duplicates.mjs [options]
//     --base <url>        deployment to audit (default https://pokeworld.center)
//     --lat <n> --lng <n> centre of the sweep (default: app default coords)
//     --block <x,y>       centre block (overrides --lat/--lng)
//     --radius <n>        sweep radius in blocks (default 2 => 5x5)
//     --mode probe|generate  probe = strictly read-only (default)
//     --poll <seconds>    with --mode generate: wait for queued generation
//     --json <file>       write the full report as JSON
//     --save-blocks <file>  dump fetched blocks (replayable via --file)
//     --file <file>       audit a saved dump instead of a live deployment
//
// Exit codes: 0 = clean, 1 = violations found, 2 = usage/fetch failure.

import * as fs from "node:fs";

export const TILE_SIZE = 32;
export const BLOCK_TILES = 16;
// Mirrors terrain-life.ts (tests assert parity with the exported constants).
export const SITE_WINDOW = 13;
export const MIN_SITE_CELLS = 3;

// Byte-exact copy of the seeded hash in terrain-life.ts / game-rules.ts;
// tests pin script-vs-server parity so drift cannot go unnoticed.
export const hashUnit = (x, y, salt = "") => {
  let value = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b);
  value ^= Math.imul((y | 0) ^ 0xc2b2ae35, 0x27d4eb2d);
  for (let index = 0; index < salt.length; index++) {
    value = Math.imul(value ^ salt.charCodeAt(index), 0x165667b1);
  }
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
};

const cellKey = (x, y) => `${x},${y}`;
const parseCell = (key) => key.split(",").map(Number);

const siteRankLess = (aX, aY, bX, bY) => {
  const aHash = hashUnit(aX, aY, "structure-site");
  const bHash = hashUnit(bX, bY, "structure-site");
  return aHash - bHash || aX - bX || aY - bY;
};

// Canonical converged site set for a mask: the same windowed-minimum rule the
// server applies, evaluated over the full mask (global scan == the union of
// per-block scans, because each cell's decision only reads its own window).
export function predictStructureSites(mask) {
  const sites = [];
  for (const key of mask) {
    const [gridX, gridY] = parseCell(key);
    const local = [[gridX, gridY]];
    const seen = new Set([key]);
    let minimal = true;
    for (let index = 0; index < local.length && minimal; index++) {
      const [cellX, cellY] = local[index];
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          if (!offsetX && !offsetY) continue;
          const nextX = cellX + offsetX;
          const nextY = cellY + offsetY;
          if (Math.abs(nextX - gridX) > SITE_WINDOW || Math.abs(nextY - gridY) > SITE_WINDOW) continue;
          const nextKey = cellKey(nextX, nextY);
          if (seen.has(nextKey) || !mask.has(nextKey)) continue;
          seen.add(nextKey);
          local.push([nextX, nextY]);
          if ((nextX !== gridX || nextY !== gridY) && siteRankLess(nextX, nextY, gridX, gridY) < 0) {
            minimal = false;
            break;
          }
        }
        if (!minimal) break;
      }
    }
    if (minimal && local.length >= MIN_SITE_CELLS) sites.push(key);
  }
  return new Set(sites);
}

// Footprint sizes per sprite family (terrain-life BUILDING_TIERS) used to
// spot double-painted sites; unknown families only skip that specific check.
const FOOTPRINT_TILES = {
  "house-red": 12,
  "house-wide": 16,
  "struct-pokecenter": 16,
  "struct-pokemart": 16,
  "struct-house-mossdeep": 16,
  "struct-house-wood": 16,
  "struct-house-berry": 16,
  "struct-shop-mauville": 12,
  "struct-house-verdanturf": 16,
  "struct-house-lavaridge": 16,
  "struct-daycare": 16,
  "struct-lanette-house": 16,
  "house-grand": 20,
  "struct-house-littleroot": 25,
  "struct-flower-shop": 25,
  "house-manor": 30,
  "struct-trick-house": 30,
};

const chebyshev = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

// Approximate lat/lng of a world-grid cell for eyeballing reports. Uses the
// owning block's corner->center span; plenty for a Google Maps pin.
function cellLatLng(cell, blocksByCoordinate) {
  const [gridX, gridY] = cell;
  const block = blocksByCoordinate.get(cellKey(Math.floor(gridX / BLOCK_TILES), Math.floor(gridY / BLOCK_TILES)));
  if (!block || !Number.isFinite(block.lat) || !Number.isFinite(block.latCenter)) return null;
  const fractionX = ((gridX % BLOCK_TILES) + BLOCK_TILES) % BLOCK_TILES / BLOCK_TILES;
  const fractionY = ((gridY % BLOCK_TILES) + BLOCK_TILES) % BLOCK_TILES / BLOCK_TILES;
  const lat = block.lat + (block.latCenter - block.lat) * 2 * fractionY;
  const lng = block.lng + (block.lngCenter - block.lng) * 2 * fractionX;
  return { lat, lng };
}

// blocks: MapBlock[] (tiles carry terrain/feature/houseSite/houseKind).
// Returns components, structures, violations and warnings. Components that
// touch the edge of the fetched area are reported but never judged.
export function analyzeStructureWorld(blocks, options = {}) {
  const siteWindow = options.siteWindow ?? SITE_WINDOW;
  const blocksByCoordinate = new Map();
  for (const block of blocks || []) {
    const key = cellKey(block.x, block.y);
    const existing = blocksByCoordinate.get(key);
    if (!existing || (block.updated ?? 0) >= (existing.updated ?? 0)) blocksByCoordinate.set(key, block);
  }

  const tiles = new Map();
  const versions = new Map();
  for (const block of blocksByCoordinate.values()) {
    for (const tile of block.tiles || []) {
      tiles.set(cellKey(tile.mapX / TILE_SIZE, tile.mapY / TILE_SIZE), tile);
      versions.set(tile.version ?? "unknown", (versions.get(tile.version ?? "unknown") || 0) + 1);
    }
  }

  const mask = new Set();
  for (const [key, tile] of tiles) if (tile.terrain === "building") mask.add(key);

  // 8-way components over the full mask = building identity as far as the
  // classifier can know it.
  const componentOf = new Map();
  const components = [];
  for (const start of mask) {
    if (componentOf.has(start)) continue;
    const id = components.length;
    const cells = [start];
    componentOf.set(start, id);
    for (let index = 0; index < cells.length; index++) {
      const [cellX, cellY] = parseCell(cells[index]);
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          if (!offsetX && !offsetY) continue;
          const key = cellKey(cellX + offsetX, cellY + offsetY);
          if (mask.has(key) && !componentOf.has(key)) {
            componentOf.set(key, id);
            cells.push(key);
          }
        }
      }
    }
    const coordinates = cells.map(parseCell);
    const xs = coordinates.map((cell) => cell[0]);
    const ys = coordinates.map((cell) => cell[1]);
    // A component is judged only when every cell's full neighbourhood was
    // fetched — otherwise it may continue into blocks we cannot see.
    const boundary = coordinates.some(([x, y]) => {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const blockKey = cellKey(
            Math.floor((x + offsetX) / BLOCK_TILES),
            Math.floor((y + offsetY) / BLOCK_TILES),
          );
          if (!blocksByCoordinate.has(blockKey)) return true;
        }
      }
      return false;
    });
    components.push({
      id,
      cells,
      size: cells.length,
      boundary,
      bbox: {
        width: Math.max(...xs) - Math.min(...xs) + 1,
        height: Math.max(...ys) - Math.min(...ys) + 1,
        minX: Math.min(...xs),
        minY: Math.min(...ys),
      },
      structures: [],
    });
  }

  // Structures grouped by site (pre-2.8 tiles lack houseSite; fall back to
  // the per-block house id so mixed-version worlds stay auditable).
  const structures = new Map();
  for (const tile of tiles.values()) {
    if (tile.feature !== "house") continue;
    const key = tile.houseSite ?? `legacy:${tile.blockX},${tile.blockY}#${tile.houseId ?? "?"}`;
    let entry = structures.get(key);
    if (!entry) {
      structures.set(key, entry = {
        site: key,
        kind: tile.houseKind ?? "unknown",
        tileCount: 0,
        paintedBy: new Set(),
        cells: [],
      });
    }
    entry.tileCount += 1;
    entry.paintedBy.add(cellKey(tile.blockX, tile.blockY));
    entry.cells.push([tile.mapX / TILE_SIZE, tile.mapY / TILE_SIZE]);
  }

  const violations = [];
  const warnings = [];

  for (const structure of structures.values()) {
    const expected = FOOTPRINT_TILES[structure.kind];
    if (structure.paintedBy.size > 1 || (expected && structure.tileCount > expected)) {
      violations.push({
        type: "double-painted-site",
        site: structure.site,
        kind: structure.kind,
        tiles: structure.tileCount,
        expectedTiles: expected ?? null,
        paintedBy: [...structure.paintedBy],
      });
    }
    // Attach to a component: the site cell itself is mask by construction;
    // legacy structures attach through any mask cell adjacent to the footprint.
    let componentId;
    if (!structure.site.startsWith("legacy:")) componentId = componentOf.get(structure.site);
    if (componentId === undefined) {
      outer: for (const [x, y] of structure.cells) {
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          for (let offsetX = -1; offsetX <= 1; offsetX++) {
            componentId = componentOf.get(cellKey(x + offsetX, y + offsetY));
            if (componentId !== undefined) break outer;
          }
        }
      }
    }
    if (componentId === undefined) {
      warnings.push({ type: "orphan-structure", site: structure.site, kind: structure.kind });
      continue;
    }
    components[componentId].structures.push(structure);
  }

  const predicted = options.predict === false ? null : predictStructureSites(mask);

  let judged = 0;
  let multiStructure = 0;
  for (const component of components) {
    if (component.boundary) continue;
    judged += 1;
    const sites = component.structures
      .filter((structure) => !structure.site.startsWith("legacy:"))
      .map((structure) => parseCell(structure.site));
    if (component.structures.length > 1) multiStructure += 1;
    for (let a = 0; a < sites.length; a++) {
      for (let b = a + 1; b < sites.length; b++) {
        const distance = chebyshev(sites[a], sites[b]);
        if (distance <= siteWindow) {
          violations.push({
            type: "seam-duplicate",
            componentId: component.id,
            componentSize: component.size,
            bbox: `${component.bbox.width}x${component.bbox.height}`,
            siteA: cellKey(...sites[a]),
            siteB: cellKey(...sites[b]),
            distance,
            paintedBy: [...new Set(component.structures.flatMap((s) => [...s.paintedBy]))],
            at: cellLatLng(sites[a], blocksByCoordinate),
          });
        }
      }
    }
    if (predicted) {
      const actual = new Set(component.structures.map((s) => s.site));
      const expectedSites = component.cells.filter((cell) => predicted.has(cell));
      const extra = [...actual].filter((site) => !site.startsWith("legacy:") && !predicted.has(site));
      const missing = expectedSites.filter((site) => !actual.has(site));
      if (extra.length > 0) {
        violations.push({
          type: "stale-stitch",
          componentId: component.id,
          componentSize: component.size,
          extraSites: extra,
          canonicalSites: expectedSites,
          at: cellLatLng(parseCell(extra[0]), blocksByCoordinate),
        });
      } else if (missing.length > 0 && component.structures.length === 0 && component.size >= MIN_SITE_CELLS) {
        warnings.push({
          type: "missing-structure",
          componentId: component.id,
          componentSize: component.size,
          canonicalSites: expectedSites,
          at: cellLatLng(parseCell(component.cells[0]), blocksByCoordinate),
        });
      }
    }
  }

  return {
    blockCount: blocksByCoordinate.size,
    tileCount: tiles.size,
    versions: Object.fromEntries(versions),
    maskCells: mask.size,
    components,
    componentCount: components.length,
    judgedComponents: judged,
    boundaryComponents: components.length - judged,
    multiStructureComponents: multiStructure,
    structureCount: structures.size,
    violations,
    warnings,
  };
}

export function formatReport(report, { verbose = false } = {}) {
  const lines = [];
  lines.push(
    `blocks=${report.blockCount} tiles=${report.tileCount} buildingCells=${report.maskCells} ` +
    `components=${report.componentCount} (judged=${report.judgedComponents}, boundary=${report.boundaryComponents}) ` +
    `structures=${report.structureCount}`,
  );
  lines.push(`versions: ${Object.entries(report.versions).map(([v, n]) => `${v}×${n}`).join(", ")}`);
  if (report.violations.length === 0) {
    lines.push("✔ no structure-duplication violations");
  } else {
    lines.push(`✘ ${report.violations.length} violation(s):`);
    for (const violation of report.violations) {
      const at = violation.at ? ` ~(${violation.at.lat.toFixed(6)},${violation.at.lng.toFixed(6)})` : "";
      if (violation.type === "seam-duplicate") {
        lines.push(
          `  seam-duplicate: component ${violation.componentId} (${violation.componentSize} cells, bbox ${violation.bbox}) ` +
          `sites ${violation.siteA} & ${violation.siteB} only ${violation.distance} tiles apart ` +
          `[painted by ${violation.paintedBy.join(" | ")}]${at}`,
        );
      } else if (violation.type === "stale-stitch") {
        lines.push(
          `  stale-stitch: component ${violation.componentId} (${violation.componentSize} cells) ` +
          `has non-canonical site(s) ${violation.extraSites.join(" ")} (canonical: ${violation.canonicalSites.join(" ") || "none"})${at}`,
        );
      } else if (violation.type === "double-painted-site") {
        lines.push(
          `  double-painted-site: ${violation.site} (${violation.kind}) ${violation.tiles} tiles` +
          `${violation.expectedTiles ? ` (expected ${violation.expectedTiles})` : ""} painted by ${violation.paintedBy.join(" | ")}`,
        );
      } else {
        lines.push(`  ${violation.type}: ${JSON.stringify(violation)}`);
      }
    }
  }
  if (report.warnings.length > 0) {
    lines.push(`⚠ ${report.warnings.length} warning(s)${verbose ? ":" : " (use --verbose for details)"}`);
    if (verbose) for (const warning of report.warnings) lines.push(`  ${warning.type}: ${JSON.stringify(warning)}`);
  }
  if (verbose) {
    for (const component of [...report.components].sort((a, b) => b.structures.length - a.structures.length).slice(0, 10)) {
      lines.push(
        `  component ${component.id}: ${component.size} cells bbox ${component.bbox.width}x${component.bbox.height}` +
        `${component.boundary ? " [boundary]" : ""} -> ${component.structures.length} structure(s) ` +
        component.structures.map((s) => `${s.kind}@${s.site}`).join(" "),
      );
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- CLI ------

function parseArgs(argv) {
  const args = {
    base: "https://pokeworld.center",
    lat: -37.87569351417865,
    lng: 145.00569971273293,
    radius: 2,
    mode: "probe",
    poll: 0,
    verbose: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const next = () => argv[++index];
    if (flag === "--base") args.base = next();
    else if (flag === "--lat") args.lat = Number(next());
    else if (flag === "--lng") args.lng = Number(next());
    else if (flag === "--block") args.block = next().split(",").map(Number);
    else if (flag === "--radius") args.radius = Number(next());
    else if (flag === "--mode") args.mode = next();
    else if (flag === "--poll") args.poll = Number(next() ?? 120);
    else if (flag === "--json") args.json = next();
    else if (flag === "--save-blocks") args.saveBlocks = next();
    else if (flag === "--file") args.file = next();
    else if (flag === "--verbose") args.verbose = true;
    else if (flag === "--help" || flag === "-h") args.help = true;
    else throw new Error(`Unknown flag: ${flag}`);
  }
  return args;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) {
    throw new Error(`${url} -> ${response.status} ${body.error ?? ""}`);
  }
  return body;
}

async function fetchWorld(args) {
  let [blockX, blockY] = args.block ?? [];
  if (!Number.isFinite(blockX)) {
    const resolved = await fetchJson(`${args.base}/api/block-lat-lng?lat=${args.lat}&lng=${args.lng}`);
    if (!resolved.block) throw new Error("Could not resolve a centre block");
    blockX = resolved.block.x;
    blockY = resolved.block.y;
  }
  const offsets = [];
  for (let y = -args.radius; y <= args.radius; y++) {
    for (let x = -args.radius; x <= args.radius; x++) offsets.push([x, y]);
  }
  const query = (extra) =>
    `${args.base}/api/blocks?blockX=${blockX}&blockY=${blockY}` +
    `&offsets=${encodeURIComponent(JSON.stringify(offsets))}&regenerate=false${extra}`;

  if (args.mode === "probe") {
    const probe = await fetchJson(query("&probe=true"));
    if (probe.status !== "probe") {
      console.error(
        "warning: this deployment predates probe support — the request may have queued generation for missing blocks; auditing the returned stored subset.",
      );
    }
    return { blocks: probe.blocks ?? [], center: { x: blockX, y: blockY } };
  }

  const initial = await fetchJson(query(""));
  let blocks = initial.blocks ?? [];
  if (initial.status !== "completed" && initial.runId && args.poll > 0) {
    const pollUrl =
      `${args.base}/api/map-jobs/${encodeURIComponent(initial.runId)}?blockX=${blockX}&blockY=${blockY}` +
      `&offsets=${encodeURIComponent(JSON.stringify(offsets))}`;
    const deadline = Date.now() + args.poll * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const current = await fetchJson(pollUrl);
      if (current.blocks?.length) blocks = current.blocks;
      if (current.status === "completed") break;
      if (current.status === "failed" || current.status === "cancelled") {
        console.error(`generation ${current.status}; auditing what is stored.`);
        break;
      }
    }
  }
  return { blocks, center: { x: blockX, y: blockY } };
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedDirectly) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(fs.readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 30).join("\n"));
      process.exit(0);
    }
    const { blocks } = args.file
      ? { blocks: JSON.parse(fs.readFileSync(args.file, "utf8")) }
      : await fetchWorld(args);
    if (args.saveBlocks) fs.writeFileSync(args.saveBlocks, JSON.stringify(blocks));
    const report = analyzeStructureWorld(blocks);
    console.log(formatReport(report, { verbose: args.verbose }));
    if (args.json) {
      fs.writeFileSync(args.json, JSON.stringify(report, null, 2));
      console.log(`report written to ${args.json}`);
    }
    process.exit(report.violations.length > 0 ? 1 : 0);
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(2);
  }
}
