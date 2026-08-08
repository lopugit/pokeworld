import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { getDesign, remixSeed } from "../../lib/design/catalog";
import { BIOME_LABELS, type DesignSummary, type SavedDesign } from "../../lib/design/types";
import { generateWorld } from "../../lib/design/world";
import { BlockCanvas } from "./BlockCanvas";
import { WorldCanvas } from "./WorldCanvas";

type AnyDesignSummary = DesignSummary | SavedDesign;

export interface DesignDetailModalProps {
  summary: AnyDesignSummary;
  onClose: () => void;
  onSaved?: (design: SavedDesign) => void;
  onDeleted?: (id: string) => void;
}

const isSaved = (summary: AnyDesignSummary): summary is SavedDesign =>
  typeof (summary as SavedDesign).author === "object";

/** Full-size design view with the remix loop: regenerate the same theme with
 * a fresh seed (Minecraft-village style), then save the recipe you like. */
export function DesignDetailModal({ summary, onClose, onSaved, onDeleted }: DesignDetailModalProps) {
  const { session, login, busy } = useAuth();
  const [seed, setSeed] = useState(summary.seed);
  const [showSecrets, setShowSecrets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setSeed(summary.seed);
    setMessage(null);
    setErrorMessage(null);
  }, [summary]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const design = useMemo(() => getDesign(summary.family, seed), [summary.family, seed]);
  const remixed = seed !== summary.seed;
  const [showWorld, setShowWorld] = useState(false);
  const world = useMemo(() => {
    if (!showWorld) return null;
    // The design in the middle, merged with 8 sibling variants of the same
    // layout type — deterministic neighbour seeds derived from this seed.
    const neighbour = (index: number) => ({ family: summary.family, seed: (seed + (index + 1) * 7919) >>> 0 });
    return generateWorld([
      [neighbour(0), neighbour(1), neighbour(2)],
      [neighbour(3), { family: summary.family, seed }, neighbour(4)],
      [neighbour(5), neighbour(6), neighbour(7)],
    ]);
  }, [showWorld, summary.family, seed]);
  const secretCount = useMemo(
    () =>
      design
        ? design.tiles.flat().filter((tile) => tile.feature === "hidden-item").length
        : 0,
    [design],
  );

  const remix = useCallback(() => {
    setSeed(remixSeed());
    setMessage(null);
    setErrorMessage(null);
  }, []);

  const save = useCallback(async () => {
    if (!design) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/designs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          family: design.family,
          seed: design.seed,
          // Non-remixed saves keep the card's display name (which may carry a
          // dedup suffix like "II" that regeneration alone doesn't know).
          name: remixed ? design.name : summary.name,
          remixOf: summary.id,
        }),
      });
      const payload = (await response.json()) as { design?: SavedDesign; error?: string };
      if (!response.ok || !payload.design) {
        throw new Error(payload.error || "The design could not be saved");
      }
      setMessage(`Saved “${payload.design.name}” to your account — it is now searchable by everyone.`);
      onSaved?.(payload.design);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "The design could not be saved");
    } finally {
      setSaving(false);
    }
  }, [design, summary, onSaved]);

  const remove = useCallback(async () => {
    if (!isSaved(summary)) return;
    setDeleting(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/designs/${encodeURIComponent(summary.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !payload.deleted) throw new Error(payload.error || "Delete failed");
      onDeleted?.(summary.id);
      onClose();
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [summary, onDeleted, onClose]);

  if (!design) return null;

  const canDelete =
    isSaved(summary) &&
    session.authenticated &&
    (session.user.id === summary.author.id || session.isAdmin);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={design.name}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-emerald-700 bg-slate-900 p-5 text-slate-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-words text-xl font-bold text-emerald-300">
              {remixed ? design.name : summary.name}
              {remixed && <span className="ml-2 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">REMIX</span>}
            </h3>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {design.familyLabel} · {BIOME_LABELS[design.biome]} · seed {design.seed}
            </p>
            {isSaved(summary) && !remixed && (
              <p className="mt-1 text-xs text-slate-400">
                saved by <span className="font-bold text-slate-300">{summary.author.username}</span>{" "}
                on {new Date(summary.createdAt).toLocaleDateString()}
                {summary.remixOf ? ` · remix of ${summary.remixOf}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-2 py-1 text-sm hover:bg-slate-700"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-4 md:flex-row">
          <div className="flex justify-center">
            <BlockCanvas design={design} size="min(70vw, 384px)" showSecrets={showSecrets} className="rounded-lg border border-slate-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-300">{remixed ? design.description : summary.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {(remixed ? design.tags : summary.tags).map((tag) => (
                <span key={tag} className="rounded bg-slate-700 px-1.5 py-0.5 text-xs">
                  {tag}
                </span>
              ))}
            </div>
            {design.entities.length > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                Featuring: {design.entities.map((entity) => entity.label).join(", ")}
              </p>
            )}
            {secretCount > 0 && (
              <label className="mt-3 flex items-center gap-2 text-sm text-amber-300">
                <input
                  type="checkbox"
                  checked={showSecrets}
                  onChange={(event) => setShowSecrets(event.target.checked)}
                />
                Reveal {secretCount} hidden item{secretCount === 1 ? "" : "s"}
              </label>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={remix}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-400"
              >
                {remixed ? "Remix again" : "Remix this design"}
              </button>
              {isSaved(summary) && !remixed ? (
                <span className="text-xs text-slate-500">
                  Already published — remix it to save your own version.
                </span>
              ) : session.authenticated ? (
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save to my account"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void login()}
                  disabled={busy}
                  className="rounded-md bg-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                >
                  Sign in to save
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={deleting}
                  className="rounded-md border border-rose-500/60 px-3 py-2 text-sm font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
            {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}
            {errorMessage && <p className="mt-3 text-sm text-rose-400">{errorMessage}</p>}
            <p className="mt-4 text-xs text-slate-500">
              Remixing regenerates this {design.familyLabel.toLowerCase()} with a brand-new seed —
              same theme, new layout, like village generation in Minecraft. Saved designs keep only
              the tiny {"{family, seed}"} recipe and rebuild identically anywhere.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={() => setShowWorld((current) => !current)}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-700"
          >
            {showWorld ? "Hide 3×3 world preview" : "Show 3×3 world preview"}
          </button>
          {showWorld && world?.ok && (
            <div className="mt-4">
              <div className="flex justify-center">
                <WorldCanvas
                  world={world}
                  size="min(84vw, 620px)"
                  className="rounded-lg border border-slate-700"
                  label={`${design.name} merged with eight sibling variants`}
                />
              </div>
              <p className="mx-auto mt-2 max-w-xl text-center text-xs text-slate-500">
                This design (centre) merged with eight sibling variants. Blocks bake together on one
                supergrid, so paths, shorelines and dunes continue legally across every seam.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
