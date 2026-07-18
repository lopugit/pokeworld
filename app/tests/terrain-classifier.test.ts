import { describe, expect, it } from "vitest";
import {
  GOOGLE_STATIC_MAP_STYLES,
  centeredCropRect,
  classifyTerrainTiles,
  summarizeTerrain,
  type RgbaImage,
} from "../server/services/map/terrain-classifier";

const COLOURS = {
  grass: [250, 245, 235],
  natural: [112, 192, 160],
  water: [90, 169, 230],
  road: [215, 224, 232],
  building: [233, 234, 239],
} as const;

function stripedImage(): RgbaImage {
  const tileSize = 32;
  const data = new Uint8Array(tileSize * tileSize * 5 * 4);
  const entries = Object.values(COLOURS);
  const width = tileSize * entries.length;
  for (let tile = 0; tile < entries.length; tile += 1) {
    for (let y = 0; y < tileSize; y += 1) {
      for (let x = tile * tileSize; x < (tile + 1) * tileSize; x += 1) {
        const index = (y * width + x) * 4;
        data[index] = entries[tile][0];
        data[index + 1] = entries[tile][1];
        data[index + 2] = entries[tile][2];
        data[index + 3] = 255;
      }
    }
  }
  return { width, height: tileSize, data };
}

describe("Google map terrain classification", () => {
  it("classifies stable styled-map colours into game terrain", () => {
    const samples = classifyTerrainTiles(stripedImage());
    expect(samples[0].map((sample) => sample.terrain)).toEqual([
      "grass",
      "natural",
      "water",
      "road",
      "building",
    ]);
    expect(summarizeTerrain(samples)).toMatchObject({
      grass: 1,
      natural: 1,
      water: 1,
      road: 1,
      building: 1,
    });
  });

  it("keeps the offline fallback playable grass", () => {
    const samples = classifyTerrainTiles(stripedImage(), { fallback: true });
    expect(samples.flat().every((sample) => sample.terrain === "grass")).toBe(true);
  });

  it("center-crops the 1280px scale=2 response instead of its top-left quadrant", () => {
    expect(centeredCropRect(1280, 1280)).toEqual({
      left: 384,
      top: 384,
      width: 512,
      height: 512,
    });
  });

  it("uses hardcoded semantic styles without the flattening legacy map id", () => {
    expect(GOOGLE_STATIC_MAP_STYLES).toContain(
      "feature:water|element:geometry|color:0x5aa9e6",
    );
    expect(GOOGLE_STATIC_MAP_STYLES).toContain(
      "feature:road|element:geometry|color:0xd7e0e8",
    );
    expect(GOOGLE_STATIC_MAP_STYLES.some((style) => style.includes("labels|visibility:off"))).toBe(
      true,
    );
  });
});
