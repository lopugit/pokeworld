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

interface SpriteCut {
  image: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dw: number;
  dh: number;
}

// Battle sprites ship as 64×64 canvases with soft padding; drawn raw they
// float off-centre and read blurry next to chunky 16px tiles. Trim to the
// opaque bounding box and downscale by an INTEGER factor to ≤28px so every
// sprite pixel stays uniform (crisp nearest-neighbour, no half-pixels).
const spriteCutCache = new Map<string, Promise<SpriteCut | null>>();

function pokemonCut(src: string): Promise<SpriteCut | null> {
  let cached = spriteCutCache.get(src);
  if (!cached) {
    cached = loadImage(src).then((image) => {
      if (!image) {
        spriteCutCache.delete(src);
        return null;
      }
      let sx = 0;
      let sy = 0;
      let sw = image.width;
      let sh = image.height;
      try {
        const probe = document.createElement("canvas");
        probe.width = image.width;
        probe.height = image.height;
        const context = probe.getContext("2d");
        if (context) {
          context.drawImage(image, 0, 0);
          const data = context.getImageData(0, 0, probe.width, probe.height).data;
          let minX = probe.width;
          let minY = probe.height;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < probe.height; y += 1) {
            for (let x = 0; x < probe.width; x += 1) {
              if (data[(y * probe.width + x) * 4 + 3] > 16) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX >= minX && maxY >= minY) {
            sx = minX;
            sy = minY;
            sw = maxX - minX + 1;
            sh = maxY - minY + 1;
          }
        }
      } catch {
        // tainted canvas etc. — fall back to the full frame
      }
      const factor = Math.max(1, Math.ceil(Math.max(sw, sh) / 28));
      const dw = Math.max(1, Math.floor(sw / factor));
      const dh = Math.max(1, Math.floor(sh / factor));
      // Crop the remainder so each destination pixel maps exactly `factor`
      // source pixels (uniform decimation).
      return { image, sx, sy, sw: dw * factor, sh: dh * factor, dw, dh };
    });
    spriteCutCache.set(src, cached);
  }
  return cached;
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
  const pokemonSprites = new Map<string, SpriteCut | null>();
  for (const entity of entities) {
    if (entity.kind === "pokemon" && entity.src) {
      pokemonSprites.set(entity.src, await pokemonCut(entity.src));
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
      const cut = pokemonSprites.get(entity.src);
      if (cut) {
        context.drawImage(
          cut.image,
          cut.sx,
          cut.sy,
          cut.sw,
          cut.sh,
          entity.col * TILE + Math.round(TILE / 2 - cut.dw / 2),
          entity.row * TILE + TILE - cut.dh,
          cut.dw,
          cut.dh,
        );
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
