import { describe, expect, it } from "vitest";
import {
  moveConsoleFormControl,
  type ConsoleDirection,
  type ConsoleFormControl,
} from "../src/components/game-ui/console-form-navigation";

describe("console form navigation", () => {
  const expected: Record<ConsoleDirection, Record<ConsoleFormControl, ConsoleFormControl>> = {
    ArrowUp: { field: "field", back: "field", confirm: "field" },
    ArrowRight: { field: "confirm", back: "confirm", confirm: "confirm" },
    ArrowDown: { field: "confirm", back: "back", confirm: "confirm" },
    ArrowLeft: { field: "back", back: "back", confirm: "back" },
  };

  for (const [direction, controls] of Object.entries(expected) as Array<
    [ConsoleDirection, Record<ConsoleFormControl, ConsoleFormControl>]
  >) {
    it(`moves ${direction} according to the visible form geometry`, () => {
      for (const [current, next] of Object.entries(controls) as Array<
        [ConsoleFormControl, ConsoleFormControl]
      >) {
        expect(moveConsoleFormControl(current, direction)).toBe(next);
      }
    });
  }
});
