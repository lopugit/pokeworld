import { BANNED_GROUND, BANNED_OVERLAYS, FORMATIONS, OVERLAY_RULES } from "../../lib/design/legality";

const GROUNDS: Array<{ ground: string; tiles: string; note: string }> = [
  { ground: "grass", tiles: "grass", note: "The universal connector — every autotile family below carries grass in its border art." },
  { ground: "path / dirt", tiles: "path-1…9", note: "Autotiled; “dirt” bakes with the path family." },
  { ground: "road", tiles: "road-1…9", note: "Autotiled." },
  { ground: "sand", tiles: "sand-1…9", note: "Autotiled beach and dune ground." },
  { ground: "water", tiles: "pond-1…9 / 20 / 21 / 24 / 25 / center", note: "Follows the live map's smoothing: full 2×2 squares, no kissing corners, closed shorelines." },
  { ground: "rocky", tiles: "rocky-1", note: "Full-bleed speckle. No transition art to any other ground exists — rocky blocks only neighbour rocky blocks." },
];

/** The tile-legality database, rendered from the same module the validator
 * and CI tests enforce — these docs cannot drift from the rules. */
export function RulesTab() {
  return (
    <div className="mx-auto max-w-4xl text-sm">
      <p className="mb-6 max-w-3xl text-slate-400">
        Every sprite in the Emerald sheet was drawn on a specific ground — its background pixels are
        baked in. A design is legal when every overlay stands on the ground its art carries, every
        multi-tile structure is complete, and every autotile index agrees with its neighbours. The
        validator (<code className="rounded bg-slate-800 px-1">validateDesign</code>) enforces this
        database over all 500 layout types, remix seeds and merged worlds in CI — broken transitions
        are structurally unshippable.
      </p>

      <h3 className="mb-2 text-base font-bold text-emerald-300">Grounds</h3>
      <div className="mb-8 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Ground</th>
              <th className="px-3 py-2">Tiles</th>
              <th className="px-3 py-2">Rule</th>
            </tr>
          </thead>
          <tbody>
            {GROUNDS.map((entry) => (
              <tr key={entry.ground} className="border-t border-slate-800">
                <td className="px-3 py-2 font-bold text-slate-200">{entry.ground}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{entry.tiles}</td>
                <td className="px-3 py-2 text-slate-400">{entry.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-2 text-base font-bold text-emerald-300">Overlay → ground rules</h3>
      <div className="mb-8 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Overlay</th>
              <th className="px-3 py-2">Legal on</th>
              <th className="px-3 py-2">Why</th>
            </tr>
          </thead>
          <tbody>
            {OVERLAY_RULES.map((rule) => (
              <tr key={rule.label} className="border-t border-slate-800">
                <td className="px-3 py-2 font-bold text-slate-200">{rule.label}</td>
                <td className="px-3 py-2">
                  {rule.grounds.map((ground) => (
                    <span key={ground} className="mr-1 rounded bg-emerald-900/60 px-1.5 py-0.5 text-xs text-emerald-300">
                      {ground}
                    </span>
                  ))}
                </td>
                <td className="px-3 py-2 text-slate-400">{rule.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-2 text-base font-bold text-emerald-300">Structures (complete formations only)</h3>
      <div className="mb-8 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Formation</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2">Ground</th>
              <th className="px-3 py-2">Rule</th>
            </tr>
          </thead>
          <tbody>
            {FORMATIONS.map((formation) => (
              <tr key={formation.id} className="border-t border-slate-800">
                <td className="px-3 py-2 font-bold text-slate-200">{formation.label}</td>
                <td className="px-3 py-2 text-slate-400">{formation.width}×{formation.height}</td>
                <td className="px-3 py-2 text-slate-400">{formation.ground}</td>
                <td className="px-3 py-2 text-slate-400">{formation.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-2 text-base font-bold text-rose-300">Banned art (can never compose)</h3>
      <div className="mb-8 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Art</th>
              <th className="px-3 py-2">Why it is banned</th>
            </tr>
          </thead>
          <tbody>
            {[...BANNED_OVERLAYS, ...BANNED_GROUND].map((banned) => (
              <tr key={banned.label} className="border-t border-slate-800">
                <td className="px-3 py-2 font-bold text-rose-200">{banned.label}</td>
                <td className="px-3 py-2 text-slate-400">{banned.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-2 text-base font-bold text-emerald-300">Worlds (multi-block merging)</h3>
      <p className="mb-10 max-w-3xl text-slate-400">
        Neighbouring blocks merge by painting every block's ground into one supergrid and baking
        autotiles and water smoothing globally — paths, shorelines and dunes continue across block
        seams by construction. The ground-compat matrix applies at seams: grass-backed families
        interconnect freely, rocky only meets rocky (there is no rocky↔grass transition art in the
        sheet — harvesting the cliff-edge strips to legalise mixed mountain worlds is on the
        roadmap).
      </p>
    </div>
  );
}
