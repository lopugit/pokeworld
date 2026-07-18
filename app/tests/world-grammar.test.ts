import { describe, expect, it } from "vitest";
import {
  BIOME_PRESETS,
  DETAIL_PALETTES,
  ROUTE_TREATMENTS,
  SECRET_PATH_PATTERNS,
  STRUCTURE_PRESETS,
  WORLD_RECIPE_COUNT,
  selectWorldProfile,
} from "../server/services/map/world-grammar";

describe("procedural Hoenn world grammar", () => {
  it("authors 864 stable biome/structure/detail/route recipes", () => {
    expect(WORLD_RECIPE_COUNT).toBe(864);
    expect(WORLD_RECIPE_COUNT).toBe(
      BIOME_PRESETS.length *
        STRUCTURE_PRESETS.length *
        DETAIL_PALETTES.length *
        ROUTE_TREATMENTS.length,
    );
  });

  it("keeps every structure bounded and gives secrets a traversable floor", () => {
    for (const preset of STRUCTURE_PRESETS) {
      expect(preset.cells.length).toBeGreaterThan(0);
      expect(
        preset.cells.every(
          (cell) =>
            cell.x >= 0 &&
            cell.x < preset.width &&
            cell.y >= 0 &&
            cell.y < preset.height,
        ),
      ).toBe(true);
      expect(preset.cells.some((cell) => cell.role === "clear")).toBe(true);
    }
    expect(
      STRUCTURE_PRESETS.filter((preset) =>
        preset.cells.some((cell) => cell.role === "hidden-item"),
      ).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("uses Google terrain semantics to choose coherent biome families", () => {
    expect(selectWorldProfile(0, 0, { building: 40, grass: 216 }).biome.id).toBe(
      "village-green",
    );
    expect(selectWorldProfile(0, 0, { water: 80, grass: 176 }).biome.id).toBe(
      "tidal-green",
    );
    expect(selectWorldProfile(0, 0, { mountain: 64, natural: 64, grass: 128 }).biome.id).toBe(
      "granite-highland",
    );
    expect(selectWorldProfile(0, 0, { natural: 120, grass: 136 }).biome.id).toBe(
      "petal-woodland",
    );
  });

  it("is deterministic while exercising all authored dimensions across the world", () => {
    const profiles = Array.from({ length: 48 }, (_, y) =>
      Array.from({ length: 48 }, (_, x) => selectWorldProfile(x - 24, y - 24, { grass: 256 })),
    ).flat();

    expect(selectWorldProfile(17, -9, { grass: 256 })).toEqual(
      selectWorldProfile(17, -9, { grass: 256 }),
    );
    expect(new Set(profiles.map((profile) => profile.structure.id))).toHaveLength(
      STRUCTURE_PRESETS.length,
    );
    expect(new Set(profiles.map((profile) => profile.detailPalette.id))).toHaveLength(
      DETAIL_PALETTES.length,
    );
    expect(new Set(profiles.map((profile) => profile.routeTreatment.id))).toHaveLength(
      ROUTE_TREATMENTS.length,
    );
    expect(new Set(profiles.map((profile) => profile.secretPattern))).toHaveLength(
      SECRET_PATH_PATTERNS.length,
    );
  });
});
