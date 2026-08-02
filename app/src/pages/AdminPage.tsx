import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { Nav } from "../components/Nav";
import {
  defaultRulesFor,
  ENCOUNTER_BIOMES,
  normalizeSpawnOverride,
  normalizeSpawnRule,
  type EncounterBiome,
  type GeoFence,
  type SpawnRule,
  type SpeciesSpawnOverride,
} from "../lib/encounters";
import { allSpecies, getSpecies, type PokedexEntry, type PokemonGender } from "../lib/pokedex";
import { fetchSpawnOverrides, resetSpawnOverride, saveSpawnOverride } from "../lib/spawn-rules-api";

interface GenerationQuotaStatus {
  dailyLimit: number;
  dailyRemaining: number;
  dailyUsed: number;
  dayKey: string;
  rollingLimit: number;
  rollingRemaining: number;
  rollingWindowMs: number;
}

function parseNumber(source: Record<string, unknown>, key: keyof GenerationQuotaStatus) {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid quota response");
  return value;
}

function parseQuota(payload: Record<string, unknown>): GenerationQuotaStatus {
  const candidate =
    payload.quota && typeof payload.quota === "object"
      ? (payload.quota as Record<string, unknown>)
      : payload;
  if (typeof candidate.dayKey !== "string") throw new Error("Invalid quota response");
  return {
    dailyLimit: parseNumber(candidate, "dailyLimit"),
    dailyRemaining: parseNumber(candidate, "dailyRemaining"),
    dailyUsed: parseNumber(candidate, "dailyUsed"),
    dayKey: candidate.dayKey,
    rollingLimit: parseNumber(candidate, "rollingLimit"),
    rollingRemaining: parseNumber(candidate, "rollingRemaining"),
    rollingWindowMs: parseNumber(candidate, "rollingWindowMs"),
  };
}

async function quotaRequest(method = "GET") {
  const response = await fetch("/api/admin/generation-quota", {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // A structured error below is more useful than a JSON parsing exception.
  }
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Generation quota request failed");
  }
  return parseQuota(payload);
}

// --- Pokémon spawn rules section --------------------------------------------

const SPAWN_PAGE_SIZE = 25;

type SpawnFilter = "all" | "customized" | "legendary";

const SPAWN_FILTERS: SpawnFilter[] = ["all", "customized", "legendary"];

/** Editable string-field mirror of a SpawnRule so number inputs type freely. */
interface RuleDraft {
  key: string;
  id: string;
  enabled: boolean;
  weight: string;
  biomes: EncounterBiome[];
  fenceKind: GeoFence["kind"];
  lat: string;
  lng: string;
  radiusKm: string;
  levelMin: string;
  levelMax: string;
  genderOverride: "" | PokemonGender;
  shinyDenominator: string;
}

let ruleDraftCounter = 0;
const nextRuleDraftKey = () => `rule-draft-${++ruleDraftCounter}`;

function ruleToDraft(rule: SpawnRule): RuleDraft {
  return {
    key: nextRuleDraftKey(),
    id: rule.id,
    enabled: rule.enabled,
    weight: String(rule.weight),
    biomes: [...rule.biomes],
    fenceKind: rule.fence.kind,
    lat: rule.fence.kind === "circle" ? String(rule.fence.lat) : "",
    lng: rule.fence.kind === "circle" ? String(rule.fence.lng) : "",
    radiusKm: rule.fence.kind === "circle" ? String(rule.fence.radiusKm) : "100",
    levelMin: String(rule.levelMin),
    levelMax: String(rule.levelMax),
    genderOverride: rule.genderOverride ?? "",
    shinyDenominator: rule.shinyDenominator === undefined ? "" : String(rule.shinyDenominator),
  };
}

/** Strict parse: blanks become NaN so normalizeSpawnOverride rejects them. */
const draftNumber = (value: string): number => (value.trim() === "" ? Number.NaN : Number(value));

function draftToRule(draft: RuleDraft, speciesId: number): Record<string, unknown> {
  return {
    id: draft.id,
    speciesId,
    enabled: draft.enabled,
    weight: draftNumber(draft.weight),
    biomes: draft.biomes,
    fence:
      draft.fenceKind === "global"
        ? { kind: "global" }
        : {
            kind: "circle",
            lat: draftNumber(draft.lat),
            lng: draftNumber(draft.lng),
            radiusKm: draftNumber(draft.radiusKm),
          },
    levelMin: draftNumber(draft.levelMin),
    levelMax: draftNumber(draft.levelMax),
    genderOverride: draft.genderOverride === "" ? undefined : draft.genderOverride,
    shinyDenominator:
      draft.shinyDenominator.trim() === "" ? undefined : draftNumber(draft.shinyDenominator),
  };
}

const dexNo = (id: number): string => `#${String(id).padStart(3, "0")}`;

const fenceLabel = (fence: GeoFence): string =>
  fence.kind === "global"
    ? "GLOBAL"
    : `${fence.lat.toFixed(2)},${fence.lng.toFixed(2)} r=${fence.radiusKm}km`;

function ruleSummary(rule: SpawnRule): string {
  const parts = [
    rule.biomes.map((biome) => biome.toUpperCase()).join("+") || "NO BIOME",
    `LV ${rule.levelMin}-${rule.levelMax}`,
    fenceLabel(rule.fence),
    `W${rule.weight}`,
  ];
  return (rule.enabled ? parts : ["OFF", ...parts]).join(" · ");
}

export function AdminPage() {
  const { session, status } = useAuth();
  const [quota, setQuota] = useState<GenerationQuotaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQuota = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQuota(await quotaRequest());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation quota could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session.isAdmin) void loadQuota();
  }, [loadQuota, session.isAdmin, status]);

  if (status === "loading") {
    return <div className="min-h-screen bg-green" aria-busy="true" />;
  }
  if (!session.authenticated || !session.isAdmin) return <Navigate replace to="/" />;

  const usedPercent = quota?.dailyLimit ? Math.min(100, (quota.dailyUsed / quota.dailyLimit) * 100) : 0;

  const resetQuota = async () => {
    if (!window.confirm("Reset today's global Pokeworld block-generation allowance?")) return;
    setResetting(true);
    setError(null);
    try {
      setQuota(await quotaRequest("POST"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation quota could not be reset");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-green pb-16">
      <Nav />
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
        <section className="overflow-hidden rounded-2xl border-4 border-grass3 bg-gameboy-grey shadow-xl">
          <header className="border-b-4 border-grass3 bg-grass px-5 py-5 text-white sm:px-8">
            <h1 className="text-3xl font-bold sm:text-4xl">Pokeworld Admin</h1>
            <p className="mt-2 text-sm font-semibold">Signed in as @{session.user.username}</p>
          </header>
          <div className="space-y-7 px-5 py-7 sm:px-8">
            <div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-grass3">Daily block generation</h2>
                  <p className="mt-1 text-sm text-black/70">Global allowance for UTC day {quota?.dayKey || "—"}</p>
                </div>
                <strong className="text-2xl text-grass3">
                  {quota ? `${quota.dailyUsed} / ${quota.dailyLimit}` : "—"}
                </strong>
              </div>
              <div
                className="mt-4 h-5 overflow-hidden rounded-full border-2 border-grass3 bg-white"
                role="progressbar"
                aria-label="Daily generation quota used"
                aria-valuemin={0}
                aria-valuemax={quota?.dailyLimit || 500}
                aria-valuenow={quota?.dailyUsed || 0}
              >
                <div className="h-full bg-grass2 transition-[width]" style={{ width: `${usedPercent}%` }} />
              </div>
              <p className="mt-2 text-sm font-semibold text-black/70">
                {quota ? `${quota.dailyRemaining} blocks remain today.` : loading ? "Loading quota…" : "Quota unavailable."}
              </p>
            </div>

            <div className="grid gap-3 rounded-xl border-2 border-grass bg-white/70 p-4 sm:grid-cols-2">
              <div>
                <div className="text-sm font-bold uppercase tracking-wide text-grass3">Burst window</div>
                <div className="mt-1 text-2xl font-bold">
                  {quota ? `${quota.rollingRemaining} / ${quota.rollingLimit} available` : "—"}
                </div>
              </div>
              <div>
                <div className="text-sm font-bold uppercase tracking-wide text-grass3">Window length</div>
                <div className="mt-1 text-2xl font-bold">
                  {quota ? `${quota.rollingWindowMs / 1000} seconds` : "—"}
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-lg border-2 border-red bg-white p-3 text-sm font-bold text-red" role="alert">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-lg bg-grass3 px-5 py-3 font-bold text-white shadow hover:bg-grass2 disabled:cursor-wait disabled:opacity-60"
                disabled={loading || resetting}
                onClick={() => void resetQuota()}
              >
                {resetting ? "Resetting…" : "Reset daily allowance"}
              </button>
              <button
                type="button"
                className="rounded-lg border-2 border-grass3 px-5 py-3 font-bold text-grass3 hover:bg-white disabled:cursor-wait disabled:opacity-60"
                disabled={loading || resetting}
                onClick={() => void loadQuota()}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
        </section>

        <SpawnRulesSection />
      </main>
    </div>
  );
}

function SpawnRulesSection() {
  const species = useMemo(() => allSpecies(), []);
  const [overrides, setOverrides] = useState<Map<number, SpeciesSpawnOverride>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SpawnFilter>("all");
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<RuleDraft[]>([]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loadOverrides = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchSpawnOverrides();
      setOverrides(new Map(list.map((override) => [override.speciesId, override])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Spawn rules could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverrides();
  }, [loadOverrides]);

  const query = search.trim().toUpperCase();
  const filtered = useMemo(
    () =>
      species.filter((entry) => {
        if (filter === "customized" && !overrides.has(entry.id)) return false;
        if (filter === "legendary" && !entry.isLegendary) return false;
        if (!query) return true;
        if (/^\d+$/.test(query)) return entry.id === Number(query);
        return (
          entry.displayName.toUpperCase().includes(query) ||
          entry.name.toUpperCase().includes(query)
        );
      }),
    [species, overrides, filter, query],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / SPAWN_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    currentPage * SPAWN_PAGE_SIZE,
    currentPage * SPAWN_PAGE_SIZE + SPAWN_PAGE_SIZE,
  );

  const effectiveRules = (entry: PokedexEntry): SpawnRule[] =>
    overrides.get(entry.id)?.rules ?? defaultRulesFor(entry);

  const openEditor = (entry: PokedexEntry) => {
    setEditingId(entry.id);
    setDrafts(effectiveRules(entry).map(ruleToDraft));
    setEditorError(null);
  };

  const closeEditor = () => {
    setEditingId(null);
    setDrafts([]);
    setEditorError(null);
  };

  const updateDraft = (key: string, patch: Partial<RuleDraft>) => {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );
  };

  const toggleBiome = (key: string, biome: EncounterBiome) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key
          ? {
              ...draft,
              biomes: draft.biomes.includes(biome)
                ? draft.biomes.filter((candidate) => candidate !== biome)
                : [...draft.biomes, biome],
            }
          : draft,
      ),
    );
  };

  const removeDraft = (key: string) => {
    setDrafts((current) => current.filter((draft) => draft.key !== key));
  };

  const addVariant = () => {
    if (editingId === null) return;
    const entry = getSpecies(editingId);
    if (!entry) return;
    setDrafts((current) => {
      const template = current[0] ?? ruleToDraft(defaultRulesFor(entry)[0]);
      // Blank id: normalizeSpawnOverride assigns a fresh `<species>:custom:<n>`.
      return [...current, { ...template, key: nextRuleDraftKey(), id: "" }];
    });
  };

  const saveEditor = async () => {
    if (editingId === null) return;
    const rawRules = drafts.map((draft) => draftToRule(draft, editingId));
    const firstBad = rawRules.findIndex(
      (rule, index) => normalizeSpawnRule(rule, editingId, index) === null,
    );
    if (firstBad >= 0) {
      setEditorError(
        `VARIANT ${firstBad + 1} IS INVALID — it needs at least one biome, whole-number levels 1-100 with MIN ≤ MAX, weight 0-100000, a circle fence with lat -90..90 / lng -180..180 / radius 1-40075 km, and shiny odds 1-1000000 (or blank for the default).`,
      );
      return;
    }
    const normalized = normalizeSpawnOverride({ speciesId: editingId, rules: rawRules });
    if (!normalized) {
      setEditorError("These rules did not pass validation — check every variant and try again.");
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const saved = await saveSpawnOverride({
        speciesId: normalized.speciesId,
        rules: normalized.rules,
      });
      setOverrides((current) => {
        const next = new Map(current);
        next.set(saved.speciesId, saved);
        return next;
      });
      closeEditor();
    } catch (caught) {
      setEditorError(caught instanceof Error ? caught.message : "Spawn rules could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    if (editingId === null) return;
    const entry = getSpecies(editingId);
    const name = entry ? entry.displayName.toUpperCase() : "this POKéMON";
    if (!window.confirm(`Reset ${name} spawn rules to the built-in defaults?`)) return;
    setResetting(true);
    setEditorError(null);
    try {
      await resetSpawnOverride(editingId);
      setOverrides((current) => {
        const next = new Map(current);
        next.delete(editingId);
        return next;
      });
      closeEditor();
    } catch (caught) {
      setEditorError(caught instanceof Error ? caught.message : "Spawn rules could not be reset");
    } finally {
      setResetting(false);
    }
  };

  const fieldLabelClass = "flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-grass3";
  const fieldInputClass = "rounded border-2 border-grass bg-white px-2 py-1 text-sm font-bold text-black";
  const busy = saving || resetting;

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border-4 border-grass3 bg-gameboy-grey shadow-xl">
      <header className="border-b-4 border-grass3 bg-grass px-5 py-5 text-white sm:px-8">
        <h2 className="text-2xl font-bold sm:text-3xl">Pokémon spawn rules</h2>
        <p className="mt-2 text-sm font-semibold">
          Where, how often and at what level each POKéMON appears in the wild.
        </p>
      </header>
      <div className="space-y-5 px-5 py-7 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="SEARCH NAME OR DEX NO."
            aria-label="Search Pokémon by name or dex number"
            className="w-full max-w-xs rounded-lg border-2 border-grass3 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-grass2"
          />
          <div className="flex flex-wrap gap-2">
            {SPAWN_FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  setPage(0);
                }}
                className={
                  filter === value
                    ? "rounded-full bg-grass3 px-4 py-1.5 text-xs font-bold text-white"
                    : "rounded-full border-2 border-grass3 px-4 py-1.5 text-xs font-bold text-grass3 hover:bg-white"
                }
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border-2 border-red bg-white p-3 text-sm font-bold text-red" role="alert">
            {error}{" "}
            <button type="button" className="underline" onClick={() => void loadOverrides()}>
              RETRY
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm font-semibold text-black/70">LOADING SPAWN DATA…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border-2 border-grass bg-white/70">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-grass bg-white/60 text-xs uppercase tracking-wide text-grass3">
                  <th className="px-3 py-2" aria-label="Sprite" />
                  <th className="px-3 py-2">No.</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Types</th>
                  <th className="px-3 py-2">Spawn rules</th>
                  <th className="px-3 py-2" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center font-bold text-black/60">
                      NO POKéMON MATCH THIS SEARCH.
                    </td>
                  </tr>
                ) : null}
                {pageRows.map((entry) => {
                  const override = overrides.get(entry.id);
                  const rules = override?.rules ?? defaultRulesFor(entry);
                  const isEditing = editingId === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <tr className="border-b border-grass/40 align-top">
                        <td className="px-3 py-2">
                          <img
                            src={`/sprites/pokemon/gen3/${entry.id}.png`}
                            alt=""
                            width={40}
                            height={40}
                            loading="lazy"
                            className="h-10 w-10 [image-rendering:pixelated]"
                          />
                        </td>
                        <td className="px-3 py-3 font-bold">{dexNo(entry.id)}</td>
                        <td className="px-3 py-3 font-bold">
                          {entry.displayName.toUpperCase()}
                          {override ? (
                            <span className="ml-2 rounded bg-blue px-1.5 py-0.5 align-middle text-[10px] font-bold text-white">
                              CUSTOM
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          {entry.types.map((type) => type.toUpperCase()).join(" / ")}
                        </td>
                        <td className="px-3 py-3">
                          <ul className="space-y-1">
                            {rules.map((rule) => (
                              <li
                                key={rule.id}
                                className={rule.enabled ? "font-semibold" : "font-semibold text-black/40"}
                              >
                                {ruleSummary(rule)}
                              </li>
                            ))}
                            {rules.length === 0 ? (
                              <li className="font-semibold text-black/40">NEVER SPAWNS</li>
                            ) : null}
                          </ul>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            disabled={isEditing}
                            onClick={() => openEditor(entry)}
                            className="rounded-lg border-2 border-grass3 px-3 py-1 text-xs font-bold text-grass3 hover:bg-white disabled:opacity-60"
                          >
                            {isEditing ? "EDITING" : "EDIT"}
                          </button>
                        </td>
                      </tr>
                      {isEditing ? (
                        <tr className="border-b border-grass/40">
                          <td colSpan={6} className="bg-white/80 px-3 py-4">
                            <div className="space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-lg font-bold text-grass3">
                                  EDITING {dexNo(entry.id)} {entry.displayName.toUpperCase()}
                                </h3>
                                <p className="text-xs font-semibold text-black/70">
                                  Higher weight = more common. Zigzagoon-common is 255, legendary-rare is 1.
                                </p>
                              </div>

                              {drafts.map((draft, index) => (
                                <div key={draft.key} className="space-y-3 rounded-xl border-2 border-grass bg-white p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-bold text-grass3">VARIANT {index + 1}</span>
                                    <div className="flex items-center gap-4">
                                      <label className="flex items-center gap-1 text-xs font-bold text-black">
                                        <input
                                          type="checkbox"
                                          checked={draft.enabled}
                                          onChange={(event) =>
                                            updateDraft(draft.key, { enabled: event.target.checked })
                                          }
                                        />
                                        ENABLED
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => removeDraft(draft.key)}
                                        className="rounded border-2 border-red px-2 py-0.5 text-xs font-bold text-red hover:bg-white"
                                      >
                                        REMOVE
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                                    <label className={fieldLabelClass}>
                                      Weight
                                      <input
                                        type="number"
                                        min={0}
                                        value={draft.weight}
                                        onChange={(event) => updateDraft(draft.key, { weight: event.target.value })}
                                        className={`${fieldInputClass} w-24`}
                                      />
                                    </label>
                                    <div className={fieldLabelClass}>
                                      <span>Biomes</span>
                                      <div className="flex flex-wrap items-center gap-3 py-1">
                                        {ENCOUNTER_BIOMES.map((biome) => (
                                          <label key={biome} className="flex items-center gap-1 text-xs font-bold normal-case text-black">
                                            <input
                                              type="checkbox"
                                              checked={draft.biomes.includes(biome)}
                                              onChange={() => toggleBiome(draft.key, biome)}
                                            />
                                            {biome.toUpperCase()}
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                    <div className={fieldLabelClass}>
                                      <span>Fence</span>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <select
                                          value={draft.fenceKind}
                                          onChange={(event) =>
                                            updateDraft(draft.key, {
                                              fenceKind: event.target.value as GeoFence["kind"],
                                            })
                                          }
                                          className={fieldInputClass}
                                        >
                                          <option value="global">GLOBAL</option>
                                          <option value="circle">CIRCLE</option>
                                        </select>
                                        {draft.fenceKind === "circle" ? (
                                          <>
                                            <input
                                              type="number"
                                              step="any"
                                              placeholder="LAT"
                                              aria-label="Fence latitude"
                                              value={draft.lat}
                                              onChange={(event) => updateDraft(draft.key, { lat: event.target.value })}
                                              className={`${fieldInputClass} w-24`}
                                            />
                                            <input
                                              type="number"
                                              step="any"
                                              placeholder="LNG"
                                              aria-label="Fence longitude"
                                              value={draft.lng}
                                              onChange={(event) => updateDraft(draft.key, { lng: event.target.value })}
                                              className={`${fieldInputClass} w-24`}
                                            />
                                            <input
                                              type="number"
                                              min={1}
                                              placeholder="RADIUS KM"
                                              aria-label="Fence radius in kilometres"
                                              value={draft.radiusKm}
                                              onChange={(event) =>
                                                updateDraft(draft.key, { radiusKm: event.target.value })
                                              }
                                              className={`${fieldInputClass} w-28`}
                                            />
                                          </>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className={fieldLabelClass}>
                                      <span>Level min / max</span>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min={1}
                                          max={100}
                                          aria-label="Level minimum"
                                          value={draft.levelMin}
                                          onChange={(event) => updateDraft(draft.key, { levelMin: event.target.value })}
                                          className={`${fieldInputClass} w-16`}
                                        />
                                        <span className="text-black">–</span>
                                        <input
                                          type="number"
                                          min={1}
                                          max={100}
                                          aria-label="Level maximum"
                                          value={draft.levelMax}
                                          onChange={(event) => updateDraft(draft.key, { levelMax: event.target.value })}
                                          className={`${fieldInputClass} w-16`}
                                        />
                                      </div>
                                    </div>
                                    <label className={fieldLabelClass}>
                                      Gender override
                                      <select
                                        value={draft.genderOverride}
                                        onChange={(event) =>
                                          updateDraft(draft.key, {
                                            genderOverride: event.target.value as RuleDraft["genderOverride"],
                                          })
                                        }
                                        className={fieldInputClass}
                                      >
                                        <option value="">NONE</option>
                                        <option value="male">MALE</option>
                                        <option value="female">FEMALE</option>
                                        <option value="genderless">GENDERLESS</option>
                                      </select>
                                    </label>
                                    <label className={fieldLabelClass}>
                                      1 in N shiny
                                      <input
                                        type="number"
                                        min={1}
                                        placeholder="8192"
                                        value={draft.shinyDenominator}
                                        onChange={(event) =>
                                          updateDraft(draft.key, { shinyDenominator: event.target.value })
                                        }
                                        className={`${fieldInputClass} w-24`}
                                      />
                                    </label>
                                  </div>
                                </div>
                              ))}

                              {drafts.length === 0 ? (
                                <p className="text-sm font-bold text-black/60">
                                  NO VARIANTS — SAVING NOW MEANS THIS POKéMON NEVER SPAWNS.
                                </p>
                              ) : null}

                              {editorError ? (
                                <div
                                  className="rounded-lg border-2 border-red bg-white p-3 text-sm font-bold text-red"
                                  role="alert"
                                >
                                  {editorError}
                                </div>
                              ) : null}

                              <div className="flex flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={addVariant}
                                  className="rounded-lg border-2 border-grass3 px-4 py-2 text-sm font-bold text-grass3 hover:bg-white disabled:opacity-60"
                                >
                                  + ADD VARIANT
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void saveEditor()}
                                  className="rounded-lg bg-grass3 px-5 py-2 text-sm font-bold text-white shadow hover:bg-grass2 disabled:cursor-wait disabled:opacity-60"
                                >
                                  {saving ? "SAVING…" : "SAVE"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void resetToDefaults()}
                                  className="rounded-lg border-2 border-red px-4 py-2 text-sm font-bold text-red hover:bg-white disabled:cursor-wait disabled:opacity-60"
                                >
                                  {resetting ? "RESETTING…" : "RESET TO DEFAULTS"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={closeEditor}
                                  className="rounded-lg border-2 border-grass3 px-4 py-2 text-sm font-bold text-grass3 hover:bg-white disabled:opacity-60"
                                >
                                  CANCEL
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-black/70">
            {filtered.length} POKéMON · PAGE {currentPage + 1} / {pageCount}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-lg border-2 border-grass3 px-4 py-2 text-sm font-bold text-grass3 hover:bg-white disabled:opacity-50"
            >
              PREV
            </button>
            <button
              type="button"
              disabled={loading || currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-lg border-2 border-grass3 px-4 py-2 text-sm font-bold text-grass3 hover:bg-white disabled:opacity-50"
            >
              NEXT
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
