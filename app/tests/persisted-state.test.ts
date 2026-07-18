import { describe, expect, it } from "vitest";
import {
  locationKey,
  resetLocationBoundThings,
  type ThingsState,
} from "../src/lib/persisted-state";

describe("location-bound persistence", () => {
  it("clears map/player coordinates while retaining game preferences", () => {
    const state: ThingsState = {
      loggedIn: true,
      map: { x: 123, blockX: 9, locationKey: "old" },
      player: { x: 456, blockX: 9, locationKey: "old" },
      game: { debug: true, zoom: 1.5, anyLoaded: true, coords: { latitude: 1, longitude: 2 } },
    };

    expect(resetLocationBoundThings(state)).toEqual({
      loggedIn: true,
      map: {},
      player: {},
      game: {
        debug: true,
        zoom: 1.5,
        anyLoaded: false,
        coords: { latitude: null, longitude: null },
      },
    });
  });

  it("uses a stable metre-scale coordinate key", () => {
    expect(locationKey(-37.859210163, 144.982275571)).toBe("-37.85921,144.98228");
  });
});
