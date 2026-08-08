import { useEffect, useRef } from "react";
import type { GeneratedWorld } from "../../lib/design/world";
import { drawScene, TILE } from "./sceneDraw";

export interface WorldCanvasProps {
  world: GeneratedWorld;
  /** CSS width (the canvas keeps the world's native pixel size internally). */
  size?: number | string;
  className?: string;
  label?: string;
}

/** Renders a merged multi-block world (generateWorld output) with the same
 * pixel pipeline as single-block cards. */
export function WorldCanvas({ world, size = 384, className, label }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = (world.tiles[0]?.length ?? 0) * TILE;
  const height = world.tiles.length * TILE;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    void drawScene(canvas, world.tiles, world.entities, { isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [world]);

  const cssSize = typeof size === "number" ? `${size}px` : size;
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ width: cssSize, height: "auto", imageRendering: "pixelated" }}
      aria-label={label ?? "Merged world preview"}
    />
  );
}
