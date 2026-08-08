import { useMemo, useState } from "react";
import { getDesign } from "../../lib/design/catalog";
import { FAMILY_BY_ID } from "../../lib/design/registry";
import { BIOME_LABELS, type DesignSummary } from "../../lib/design/types";
import { DesignCard } from "./DesignBrowser";
import { DesignDetailModal } from "./DesignDetailModal";

const PAGE = 12;

/** Drill-in view for one fixed layout type: every card below is the same
 * family rolled with a different seed. */
export function FamilyVariantsView({
  familyId,
  onBack,
}: {
  familyId: string;
  onBack: () => void;
}) {
  const [count, setCount] = useState(PAGE);
  const [selected, setSelected] = useState<DesignSummary | null>(null);
  const family = FAMILY_BY_ID.get(familyId);

  const variants = useMemo(() => {
    // Collect seeds until `count` VISUALLY DISTINCT variants are found —
    // seeds that reroll an identical tile grid (possible in the most
    // constrained hand-built layouts) are skipped rather than shown twice.
    const summaries: DesignSummary[] = [];
    const seenGrids = new Set<string>();
    for (let seed = 0; seed < count * 8 && summaries.length < count; seed += 1) {
      const design = getDesign(familyId, seed);
      if (!design) continue;
      const gridKey = design.tiles
        .map((row) => row.map((tile) => `${tile.img}|${tile.img2 ?? ""}`).join(","))
        .join(";");
      if (seenGrids.has(gridKey)) continue;
      seenGrids.add(gridKey);
      const { tiles: _tiles, entities: _entities, ...summary } = design;
      summaries.push(summary);
    }
    return summaries;
  }, [familyId, count]);

  if (!family) return null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-slate-600 px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-700"
        >
          ← All layouts
        </button>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-emerald-300">{family.label}</h3>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {BIOME_LABELS[family.biome]} · fixed layout type · endless seed variants
          </p>
        </div>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-slate-400">
        Every card below is the same kind of place — one fixed layout skeleton — rolled with a
        different seed: mirrored, rotated, re-jittered and re-cast. Open a variant to remix it with
        a fresh seed or save its tiny {"{family, seed}"} recipe.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {family.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
        {variants.map((summary) => (
          <DesignCard
            key={summary.id}
            summary={summary}
            footer={`seed ${summary.seed}`}
            onOpen={() => setSelected(summary)}
          />
        ))}
      </div>

      <div className="py-6 text-center">
        <button
          type="button"
          onClick={() => setCount((current) => current + PAGE)}
          className="rounded-md bg-slate-800 px-5 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700"
        >
          Generate {PAGE} more variants
        </button>
      </div>

      {selected && <DesignDetailModal summary={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
