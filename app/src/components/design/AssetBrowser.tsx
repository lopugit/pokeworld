import { useEffect, useMemo, useState } from "react";
import {
  categoryLabel,
  loadAssetDatabase,
  searchAssets,
  type AssetDatabase,
  type AssetItem,
} from "../../lib/design/assets";
import { AnimationSprite } from "./AnimationSprite";
import { SpriteThumb } from "./SpriteThumb";
import { useInfiniteReveal } from "./useInfiniteReveal";

function AssetDetailModal({ item, onClose }: { item: AssetItem; onClose: () => void }) {
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState<number | undefined>(undefined);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-emerald-700 bg-slate-900 p-5 text-slate-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="break-words text-lg font-bold text-emerald-300">{item.name}</h3>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {categoryLabel(item.category)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-2 py-1 text-sm hover:bg-slate-700"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-32 items-center justify-center rounded-lg bg-slate-800/80 p-6">
          {item.kind === "animation" ? (
            <AnimationSprite animation={item.animation} scale={5} playing={playing} fpsOverride={fps} />
          ) : (
            <SpriteThumb item={item} scale={6} />
          )}
        </div>

        {item.kind === "animation" && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPlaying((value) => !value)}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-500"
              >
                {playing ? "Pause" : "Play"}
              </button>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                Speed
                <input
                  type="range"
                  min={1}
                  max={24}
                  value={fps ?? item.animation.fps}
                  onChange={(event) => setFps(Number(event.target.value))}
                />
                <span className="tabular-nums">{fps ?? item.animation.fps} fps</span>
              </label>
              <span className="text-sm text-slate-400">{item.animation.frames.length} frames</span>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                Frame breakdown
              </p>
              <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-800/60 p-3">
                {item.animation.frames.map((_, frameIndex) => (
                  <div key={frameIndex} className="flex flex-col items-center gap-1">
                    <AnimationSprite animation={item.animation} scale={2} frameIndex={frameIndex} />
                    <span className="text-[10px] text-slate-500">{frameIndex + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {item.kind === "single" && (
            <>
              <div>
                <dt className="text-slate-400">File</dt>
                <dd className="break-all font-mono text-xs">{item.src}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Size</dt>
                <dd>
                  {item.w}×{item.h} px
                </dd>
              </div>
              {item.usage && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-400">Usage</dt>
                  <dd>{item.usage}</dd>
                </div>
              )}
            </>
          )}
          {item.kind === "cell" && (
            <>
              <div>
                <dt className="text-slate-400">Sheet</dt>
                <dd>{item.sheetName}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Cell</dt>
                <dd>
                  column {item.x}, row {item.y} ({item.size}×{item.size} px)
                </dd>
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <dt className="text-slate-400">Tags</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <span key={tag} className="rounded bg-slate-700 px-1.5 py-0.5 text-xs">
                  {tag}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function AssetBrowser() {
  const [database, setDatabase] = useState<AssetDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<AssetItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAssetDatabase()
      .then((db) => {
        if (!cancelled) setDatabase(db);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Failed to load assets");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(
    () => (database ? searchAssets(database, query, category) : []),
    [database, query, category],
  );
  const { visible, hasMore, sentinelRef } = useInfiniteReveal(results, 120);

  if (error) {
    return <p className="py-12 text-center text-rose-400">{error}</p>;
  }
  if (!database) {
    return <p className="py-12 text-center text-slate-400">Loading the asset database…</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${database.items.length.toLocaleString()} assets — tiles, sprites, animations…`}
          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          aria-label="Search assets"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${category === null ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
          >
            All ({database.items.length.toLocaleString()})
          </button>
          {database.categories.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setCategory(category === entry.id ? null : entry.id)}
              className={`rounded-full px-3 py-1 text-xs font-bold ${category === entry.id ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
            >
              {entry.label} ({entry.count.toLocaleString()})
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-sm text-slate-400">
        {results.length.toLocaleString()} asset{results.length === 1 ? "" : "s"}
        {category ? ` in ${categoryLabel(category)}` : ""}
        {query ? ` matching “${query}”` : ""}
      </p>

      <div className="flex flex-wrap gap-2">
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(item)}
            title={item.name}
            className="flex min-h-20 min-w-20 flex-col items-center justify-end gap-1 rounded-lg border border-slate-700 bg-slate-800/70 p-2 hover:border-emerald-500 hover:bg-slate-700/80"
          >
            <SpriteThumb item={item} scale={3} />
            {item.kind !== "cell" && (
              <span className="max-w-28 truncate text-[10px] text-slate-400">{item.name}</span>
            )}
          </button>
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="py-6 text-center text-sm text-slate-500">
          Loading more assets…
        </div>
      )}

      {selected && <AssetDetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
