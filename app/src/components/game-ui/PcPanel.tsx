import type { TrainerState } from "../../lib/trainer-state";
import { PanelFrame } from "./PanelFrame";

export function PcPanel({ trainer, onClose }: { trainer: TrainerState; onClose: () => void }) {
  return (
    <PanelFrame
      title={`${trainer.name}'s PC`}
      onClose={onClose}
      footer={<span>The PC hums softly. Withdraw and deposit arrive in a later update.</span>}
    >
      <div className="pkmn-pc-section">ITEM STORAGE</div>
      {trainer.pcItems.length ? (
        <ul className="pkmn-bag-list">
          {trainer.pcItems.map((entry) => (
            <li key={entry.id} className="pkmn-bag-item">
              <span>{entry.name}</span>
              <span className="pkmn-bag-qty">×{entry.quantity}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="pkmn-panel-empty">There's nothing stored.</div>
      )}
    </PanelFrame>
  );
}
