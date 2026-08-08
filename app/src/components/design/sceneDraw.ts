// Shared canvas painter for design scenes: a single 16×16 block
// (BlockCanvas) or a merged multi-block world (WorldCanvas). One image cache
// serves every canvas on the page.

import { CHARACTER_SHEET } from "../../lib/design/entities";
import type { DesignEntity, DesignTile } from "../../lib/design/types";

export const TILE = 16;

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  let cached = imageCache.get(src);
  if (!cached) {
    cached = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => {
        // Evict transient failures so the next render retries the load.
        imageCache.delete(src);
        resolve(null);
      };
      image.src = src;
    });
    imageCache.set(src, cached);
  }
  return cached;
}

export interface SceneDrawOptions {
  showSecrets?: boolean;
  isCancelled?: () => boolean;
}

/** Paint tiles + entities onto the canvas (which must be sized to
 * cols*TILE × rows*TILE). All loads happen before the first paint so a
 * cancelled draw never leaves a half-painted frame. */
export async function drawScene(
  canvas: HTMLCanvasElement,
  tiles: DesignTile[][],
  entities: DesignEntity[],
  options: SceneDrawOptions = {},
): Promise<void> {
  const context = canvas.getContext("2d");
  if (!context) return;
  const isCancelled = options.isCancelled ?? (() => false);

  const tileRefs = new Set<string>();
  for (const row of tiles) {
    for (const tile of row) {
      if (tile.img) tileRefs.add(tile.img);
      if (tile.img2) tileRefs.add(tile.img2);
    }
  }
  const loaded = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    [...tileRefs].map(async (ref) => {
      loaded.set(ref, await loadImage(`/tiles/${ref}.png`));
    }),
  );
  const characterSheet = entities.some((entity) => entity.kind === "npc")
    ? await loadImage(CHARACTER_SHEET)
    : null;
  const pokemonSprites = new Map<string, HTMLImageElement | null>();
  for (const entity of entities) {
    if (entity.kind === "pokemon" && entity.src) {
      pokemonSprites.set(entity.src, await loadImage(entity.src));
    }
  }
  if (isCancelled()) return;

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let rowIndex = 0; rowIndex < tiles.length; rowIndex += 1) {
    const row = tiles[rowIndex];
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const tile = row[colIndex];
      for (const ref of [tile.img, tile.img2]) {
        if (!ref) continue;
        const image = loaded.get(ref);
        if (image) context.drawImage(image, colIndex * TILE, rowIndex * TILE, TILE, TILE);
      }
    }
  }

  for (const entity of entities) {
    if (entity.kind === "npc" && entity.rect && characterSheet) {
      const [x, y, w, h] = entity.rect;
      context.drawImage(
        characterSheet,
        x,
        y,
        w,
        h,
        entity.col * TILE + Math.round(TILE / 2 - w / 2),
        entity.row * TILE + TILE - h,
        w,
        h,
      );
    } else if (entity.kind === "pokemon" && entity.src) {
      const sprite = pokemonSprites.get(entity.src);
      if (sprite) {
        context.drawImage(sprite, entity.col * TILE - 8, entity.row * TILE - TILE, 32, 32);
      }
    }
  }

  if (options.showSecrets) {
    context.fillStyle = "rgba(255, 230, 80, 0.85)";
    context.strokeStyle = "rgba(120, 70, 0, 0.9)";
    for (let rowIndex = 0; rowIndex < tiles.length; rowIndex += 1) {
      for (let colIndex = 0; colIndex < tiles[rowIndex].length; colIndex += 1) {
        if (tiles[rowIndex][colIndex].feature !== "hidden-item") continue;
        const cx = colIndex * TILE + TILE / 2;
        const cy = rowIndex * TILE + TILE / 2;
        context.beginPath();
        for (let point = 0; point < 8; point += 1) {
          const angle = (point * Math.PI) / 4;
          const radius = point % 2 === 0 ? 6 : 2.4;
          context.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        }
        context.closePath();
        context.fill();
        context.stroke();
      }
    }
  }
}
