import { useEffect, useRef } from "react";
import { DESIGN_GRID, type GeneratedDesign } from "../../lib/design/types";
import { drawScene, TILE } from "./sceneDraw";

const CANVAS_SIZE = DESIGN_GRID * TILE;

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
    void drawScene(canvas, design.tiles, design.entities, {
      showSecrets,
      isCancelled: () => cancelled,
    });
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
