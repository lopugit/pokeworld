export type ConsoleFormControl = "field" | "back" | "confirm";
export type ConsoleDirection = "ArrowUp" | "ArrowRight" | "ArrowDown" | "ArrowLeft";

/**
 * Spatial navigation for the common game-screen form layout: one field above
 * a BACK / confirm button row. It is deliberately bounded at the edges so a
 * repeated D-pad press cannot wrap onto a destructive action unexpectedly.
 */
export function moveConsoleFormControl(
  current: ConsoleFormControl,
  direction: ConsoleDirection,
): ConsoleFormControl {
  if (direction === "ArrowUp") return "field";
  if (direction === "ArrowDown") return current === "field" ? "confirm" : current;
  if (direction === "ArrowLeft") return "back";
  return "confirm";
}
