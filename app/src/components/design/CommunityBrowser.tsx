import { useCallback, useEffect, useRef, useState } from "react";
import { BIOME_LABELS, type BiomeId, type SavedDesign } from "../../lib/design/types";
import { DesignCard } from "./DesignBrowser";
import { DesignDetailModal } from "./DesignDetailModal";

const BIOMES = Object.keys(BIOME_LABELS) as BiomeId[];

interface DesignPagePayload {
  designs: SavedDesign[];
  total: number;
  page: number;
  pages: number;
}

/** Community tab: designs saved by trainers, searchable by anyone. */
export function CommunityBrowser() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [biome, setBiome] = useState<BiomeId | null>(null);
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SavedDesign | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const fetchPage = useCallback(
    async (targetPage: number, replace: boolean) => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
        if (biome) params.set("biome", biome);
        params.set("page", String(targetPage));
        params.set("limit", "24");
        const response = await fetch(`/api/designs?${params.toString()}`);
        if (!response.ok) throw new Error(`Community designs failed to load (${response.status})`);
        const payload = (await response.json()) as DesignPagePayload;
        if (requestRef.current !== requestId) return;
        setDesigns((current) => (replace ? payload.designs : [...current, ...payload.designs]));
        setTotal(payload.total);
        setPage(payload.page);
        setPages(payload.pages);
      } catch (cause) {
        if (requestRef.current !== requestId) return;
        setError(cause instanceof Error ? cause.message : "Community designs failed to load");
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    },
    [debouncedQuery, biome],
  );

  useEffect(() => {
    void fetchPage(1, true);
  }, [fetchPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    // After a failed fetch, stop observing until the user retries explicitly —
    // otherwise the still-visible sentinel refires the failed request forever.
    if (!sentinel || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loading && page < pages) {
          void fetchPage(page + 1, false);
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage, loading, page, pages, error]);

  const onDeleted = useCallback((id: string) => {
    setDesigns((current) => current.filter((design) => design.id !== id));
    setTotal((current) => Math.max(0, current - 1));
  }, []);

  const onSaved = useCallback(() => {
    void fetchPage(1, true);
  }, [fetchPage]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search community designs by name, theme, tag or trainer…"
          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          aria-label="Search community designs"
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
        </div>
      </div>

      {error && (
        <p className="mb-3 flex items-center gap-3 text-sm text-rose-400">
          {error}
          <button
            type="button"
            onClick={() => void fetchPage(Math.max(1, page), designs.length === 0)}
            className="rounded-md border border-rose-500/60 px-2 py-1 text-xs font-bold hover:bg-rose-500/10"
          >
            Retry
          </button>
        </p>
      )}
      <p className="mb-3 text-sm text-slate-400">
        {total} saved design{total === 1 ? "" : "s"} from the community
      </p>

      <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
        {designs.map((design) => (
          <DesignCard
            key={design.id}
            summary={design}
            onOpen={() => setSelected(design)}
            footer={`by ${design.author.username}`}
          />
        ))}
      </div>

      {designs.length === 0 && !loading && !error && (
        <p className="py-10 text-center text-slate-500">
          Nothing saved yet — open any example design, hit REMIX, and be the first to publish one!
        </p>
      )}
      {loading && <p className="py-4 text-center text-sm text-slate-500">Loading…</p>}
      {page < pages && <div ref={sentinelRef} className="h-8" />}

      {selected && (
        <DesignDetailModal
          summary={selected}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}
