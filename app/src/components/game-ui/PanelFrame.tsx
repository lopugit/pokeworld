import type { ReactNode } from "react";

interface PanelFrameProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function PanelFrame({ title, onClose, children, footer }: PanelFrameProps) {
  return (
    <div className="pkmn-panel" role="dialog" aria-label={title}>
      <div className="pkmn-panel-header">
        <span>{title}</span>
        <button type="button" className="pkmn-panel-close" aria-label={`Close ${title}`} onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="pkmn-panel-body">{children}</div>
      {footer ? <div className="pkmn-panel-footer">{footer}</div> : null}
    </div>
  );
}
