import { useMemo, useState } from "react";
import { CATALOG_SIZE, catalogTags, getDesign, searchCatalog } from "../../lib/design/catalog";
import { BIOME_LABELS, type BiomeId, type DesignSummary } from "../../lib/design/types";
import { BlockCanvas } from "./BlockCanvas";
import { DesignDetailModal } from "./DesignDetailModal";
import { useInfiniteReveal } from "./useInfiniteReveal";

const BIOMES = Object.keys(BIOME_LABELS) as BiomeId[];
const TOP_TAGS = 18;

export function DesignCard({
  summary,
  onOpen,
  footer,
}: {
  summary: DesignSummary;
  onOpen: () => void;
  footer?: string;
}) {
  const design = useMemo(() => getDesign(summary.family, summary.seed), [summary]);
  if (!design) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-44 flex-col items-stretch gap-2 rounded-xl border border-slate-700 bg-slate-800/70 p-3 text-left hover:border-emerald-500 hover:bg-slate-700/70 sm:w-52"
    >
      <BlockCanvas design={design} size="100%" className="w-full rounded-lg border border-slate-700" />
      <span className="truncate text-sm font-bold text-slate-100">{summary.name}</span>
      <span className="truncate text-xs text-slate-400">
        {summary.familyLabel} · {BIOME_LABELS[summary.biome]}
      </span>
      {footer && <span className="truncate text-[11px] text-slate-500">{footer}</span>}
    </button>
  );
}

/** The 500 curated, infinitely-scrolling, searchable example designs. */
export function DesignBrowser() {
  const [query, setQuery] = useState("");
  const [biome, setBiome] = useState<BiomeId | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<DesignSummary | null>(null);

  const results = useMemo(
    () => searchCatalog({ query, biome: biome ?? undefined, tag: tag ?? undefined }),
    [query, biome, tag],
  );
  const tags = useMemo(() => catalogTags().slice(0, TOP_TAGS), []);
  const { visible, hasMore, sentinelRef } = useInfiniteReveal(results, 24);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${CATALOG_SIZE} example designs — “legendary cave”, “village”, “hidden”…`}
          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          aria-label="Search designs"
        />
        <div className="flex flex-wrap gap-1.5">
          {BIOMES.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setBiome(biome === entry ? null : entry)}
              className={`rounded-full px-3 py-1 text-xs font-bold ${biome === entry ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
            >
              {BIOME_LABELS[entry]}
            </button>
          ))}
          <span className="mx-1 hidden text-slate-600 sm:inline">·</span>
          {tags.map((entry) => (
            <button
              key={entry.tag}
              type="button"
              onClick={() => setTag(tag === entry.tag ? null : entry.tag)}
              className={`rounded-full px-3 py-1 text-xs ${tag === entry.tag ? "bg-amber-500 font-bold text-slate-900" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}
            >
              {entry.tag}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-sm text-slate-400">
        {results.length} of {CATALOG_SIZE} designs
        {biome ? ` · ${BIOME_LABELS[biome]}` : ""}
        {tag ? ` · #${tag}` : ""}
        {query ? ` · “${query}”` : ""}
        {" — every one remixable"}
      </p>

      <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
        {visible.map((summary) => (
          <DesignCard key={summary.id} summary={summary} onOpen={() => setSelected(summary)} />
        ))}
      </div>
      {results.length === 0 && (
        <p className="py-10 text-center text-slate-500">
          No designs match — try “garden”, “cave”, “hideout”, “island”…
        </p>
      )}
      {hasMore && (
        <div ref={sentinelRef} className="py-6 text-center text-sm text-slate-500">
          Generating more designs…
        </div>
      )}

      {selected && <DesignDetailModal summary={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
