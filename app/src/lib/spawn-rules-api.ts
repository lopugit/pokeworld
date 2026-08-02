// Typed browser client for the admin spawn-rule override API. The server
// routes live under /api/admin/spawn-rules and speak the SpawnRule /
// SpeciesSpawnOverride shapes from ./encounters:
//   GET    -> { overrides: SpeciesSpawnOverride[] }
//   PUT    -> body { speciesId, rules } -> { override: SpeciesSpawnOverride }
//   DELETE -> ?speciesId=N -> { deleted: boolean }

import type { SpawnRule, SpeciesSpawnOverride } from "./encounters";

const SPAWN_RULES_ENDPOINT = "/api/admin/spawn-rules";

async function spawnRulesRequest(
  url: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...(init.headers ?? {}) },
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // A structured error below is more useful than a JSON parsing exception.
  }
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Spawn rule request failed");
  }
  return payload;
}

export async function fetchSpawnOverrides(): Promise<SpeciesSpawnOverride[]> {
  const payload = await spawnRulesRequest(SPAWN_RULES_ENDPOINT);
  return Array.isArray(payload.overrides)
    ? (payload.overrides as SpeciesSpawnOverride[])
    : [];
}

export async function saveSpawnOverride(override: {
  speciesId: number;
  rules: SpawnRule[];
}): Promise<SpeciesSpawnOverride> {
  const payload = await spawnRulesRequest(SPAWN_RULES_ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(override),
  });
  return payload.override as SpeciesSpawnOverride;
}

export async function resetSpawnOverride(speciesId: number): Promise<boolean> {
  const payload = await spawnRulesRequest(
    `${SPAWN_RULES_ENDPOINT}?speciesId=${encodeURIComponent(speciesId)}`,
    { method: "DELETE" },
  );
  return payload.deleted === true;
}
