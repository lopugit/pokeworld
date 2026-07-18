import { describe, expect, it } from "vitest";
import {
  cropPngWithRgba,
  decodePng,
  encodePng,
  rgbaToTileColourData,
} from "../server/services/map/legacy/png";

interface RgbaImage {
  width: number;
  height: number;
  data: Buffer;
}

function legacyTileColourData(source: RgbaImage, tileSize: number) {
  const matrix = new Array(source.height);
  for (let y = 0; y < source.height; y++) {
    const row = new Array(source.width);
    for (let x = 0; x < source.width; x++) {
      const index = (y * source.width + x) * 4;
      row[x] = [
        source.data[index],
        source.data[index + 1],
        source.data[index + 2],
        source.data[index + 3],
      ];
    }
    matrix[y] = row;
  }

  const colourData: Record<string, Record<string, number | string | null>> = {};
  for (let pixelY = 0; pixelY < matrix.length; pixelY++) {
    for (let pixelX = 0; pixelX < matrix[pixelY].length; pixelX++) {
      const pixel = matrix[pixelY][pixelX];
      const tileKey = `${Math.floor(pixelX / tileSize)},${Math.floor(pixelY / tileSize)}`;
      const colour = `${pixel[0]},${pixel[1]},${pixel[2]}`;
      colourData[tileKey] ||= {};
      colourData[tileKey][colour] = Number(colourData[tileKey][colour] || 0) + 1;
    }
  }

  for (const colourCounts of Object.values(colourData)) {
    let maxColour: string | null = null;
    let maxCount = 0;
    for (const colour of Object.keys(colourCounts)) {
      const count = Number(colourCounts[colour]);
      if (count > maxCount) {
        maxColour = colour;
        maxCount = count;
      }
    }
    colourCounts.max = maxColour;
  }

  return colourData;
}

function patternedImage(width: number, height: number): RgbaImage {
  const data = Buffer.alloc(width * height * 4);
  const palette = [
    [112, 192, 160],
    [216, 200, 128],
    [159, 208, 191],
    [215, 224, 232],
    [25, 50, 75],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colour = palette[(x * 7 + y * 11 + Math.floor(x / 3)) % palette.length];
      const index = (y * width + x) * 4;
      data[index] = colour[0];
      data[index + 1] = colour[1];
      data[index + 2] = colour[2];
      data[index + 3] = (x + y) % 2 ? 255 : 128;
    }
  }

  return { width, height, data };
}

describe("PNG map conversion", () => {
  it("preserves the legacy per-tile colour counts and tie-breaking", () => {
    const source = patternedImage(64, 64);
    expect(rgbaToTileColourData(source, 16)).toEqual(legacyTileColourData(source, 16));
  });

  it("returns the encoded crop and its decoded pixels from one decode", () => {
    const source = patternedImage(12, 10);
    const encoded = encodePng(source);
    const result = cropPngWithRgba(encoded, { left: 3, top: 2, width: 5, height: 4 });
    const decoded = decodePng(result.image);

    expect(decoded.width).toBe(5);
    expect(decoded.height).toBe(4);
    expect(decoded.data).toEqual(result.rgba.data);

    for (let y = 0; y < result.rgba.height; y++) {
      for (let x = 0; x < result.rgba.width; x++) {
        const sourceStart = ((y + 2) * source.width + x + 3) * 4;
        const cropStart = (y * result.rgba.width + x) * 4;
        expect([...result.rgba.data.subarray(cropStart, cropStart + 4)]).toEqual([
          ...source.data.subarray(sourceStart, sourceStart + 4),
        ]);
      }
    }
  });

  it("rejects image dimensions that cannot form complete tiles", () => {
    expect(() => rgbaToTileColourData(patternedImage(63, 64), 16)).toThrow(
      "cannot be divided",
    );
  });
});
