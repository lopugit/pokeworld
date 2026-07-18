import type { TrainerState } from "../../lib/trainer-state";
import { PanelFrame } from "./PanelFrame";

const BADGE_TONES: Record<string, string> = {
  stone: "#a8a878",
  knuckle: "#c05038",
  dynamo: "#f8d030",
  heat: "#f08030",
  balance: "#8890f0",
  feather: "#78c8e0",
  mind: "#f85888",
  rain: "#6890f0",
};

export function BadgesPanel({ trainer, onClose }: { trainer: TrainerState; onClose: () => void }) {
  const earnedCount = trainer.badges.filter((badge) => badge.earned).length;
  return (
    <PanelFrame
      title="BADGE CASE"
      onClose={onClose}
      footer={<span>{earnedCount} of {trainer.badges.length} badges earned</span>}
    >
      <div className="pkmn-badge-grid">
        {trainer.badges.map((badge) => (
          <div key={badge.id} className={`pkmn-badge-slot${badge.earned ? " earned" : ""}`}>
            <span
              className="pkmn-badge-shape"
              style={{ backgroundColor: badge.earned ? BADGE_TONES[badge.id] ?? "#f8d030" : "#3a3a44" }}
              aria-hidden="true"
            />
            <span className="pkmn-badge-name">{badge.name.replace(" BADGE", "")}</span>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}
