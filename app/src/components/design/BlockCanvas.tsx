import { useEffect, useRef } from "react";
import { CHARACTER_SHEET } from "../../lib/design/entities";
import { DESIGN_GRID, type GeneratedDesign } from "../../lib/design/types";

const TILE = 16;
const CANVAS_SIZE = DESIGN_GRID * TILE;

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  let cached = imageCache.get(src);
  if (!cached) {
    cached = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
    imageCache.set(src, cached);
  }
  return cached;
}

async function drawDesign(
  canvas: HTMLCanvasElement,
  design: GeneratedDesign,
  showSecrets: boolean,
  isCancelled: () => boolean,
): Promise<void> {
  const context = canvas.getContext("2d");
  if (!context) return;

  const tileRefs = new Set<string>();
  for (const row of design.tiles) {
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
  // All async work happens before the first paint, so a stale draw can be
  // abandoned without leaving a half-painted frame behind.
  const characterSheetPreload = design.entities.some((entity) => entity.kind === "npc")
    ? await loadImage(CHARACTER_SHEET)
    : null;
  const pokemonSprites = new Map<string, HTMLImageElement | null>();
  for (const entity of design.entities) {
    if (entity.kind === "pokemon" && entity.src) {
      pokemonSprites.set(entity.src, await loadImage(entity.src));
    }
  }
  if (isCancelled()) return;

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  for (let rowIndex = 0; rowIndex < design.tiles.length; rowIndex += 1) {
    const row = design.tiles[rowIndex];
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const tile = row[colIndex];
      for (const ref of [tile.img, tile.img2]) {
        if (!ref) continue;
        const image = loaded.get(ref);
        if (image) context.drawImage(image, colIndex * TILE, rowIndex * TILE, TILE, TILE);
      }
    }
  }

  for (const entity of design.entities) {
    if (entity.kind === "npc" && entity.rect && characterSheetPreload) {
      const [x, y, w, h] = entity.rect;
      context.drawImage(
        characterSheetPreload,
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

  if (showSecrets) {
    context.fillStyle = "rgba(255, 230, 80, 0.85)";
    context.strokeStyle = "rgba(120, 70, 0, 0.9)";
    for (let rowIndex = 0; rowIndex < design.tiles.length; rowIndex += 1) {
      for (let colIndex = 0; colIndex < design.tiles[rowIndex].length; colIndex += 1) {
        if (design.tiles[rowIndex][colIndex].feature !== "hidden-item") continue;
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

export interface BlockCanvasProps {
  design: GeneratedDesign;
  /** Rendered CSS size in pixels (canvas stays 256 and upscales pixelated). */
  size?: number | string;
  showSecrets?: boolean;
  className?: string;
}

export function BlockCanvas({ design, size = 192, showSecrets = false, className }: BlockCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    void drawDesign(canvas, design, showSecrets, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [design, showSecrets]);

  const cssSize = typeof size === "number" ? `${size}px` : size;
  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      className={className}
      style={{ width: cssSize, height: cssSize, imageRendering: "pixelated" }}
      aria-label={`Design preview: ${design.name}`}
    />
  );
}
