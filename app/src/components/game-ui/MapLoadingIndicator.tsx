interface MapLoadingIndicatorProps {
  active: boolean;
  completed: number;
  error: string;
  onRetry: () => void;
  requested: number;
  waitingForBoundary: boolean;
}

export function MapLoadingIndicator({
  active,
  completed,
  error,
  onRetry,
  requested,
  waitingForBoundary,
}: MapLoadingIndicatorProps) {
  if (!active && !error) return null;

  const percentage = requested > 0 ? Math.round((completed / requested) * 100) : 0;
  const visiblePercentage = active ? Math.max(8, Math.min(100, percentage)) : 100;
  const label = error
    ? "MAP SIGNAL LOST"
    : waitingForBoundary
      ? "LOADING THE NEXT AREA..."
      : "MAPPING NEARBY ROUTES...";

  return (
    <section
      className={`pkmn-map-loader${error ? " is-error" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="pkmn-map-loader__label">
        <span className="pkmn-map-loader__ball" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div
        className="pkmn-map-loader__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={requested || undefined}
        aria-valuenow={requested ? completed : undefined}
        aria-valuetext={active ? `${completed} of ${requested} nearby areas ready` : undefined}
      >
        <span className="pkmn-map-loader__fill" style={{ width: `${visiblePercentage}%` }} />
      </div>
      {error ? (
        <button type="button" className="pkmn-map-loader__retry" onClick={onRetry}>
          RETRY
        </button>
      ) : null}
    </section>
  );
}
