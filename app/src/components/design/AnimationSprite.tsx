import { useEffect, useMemo, useRef, useState } from "react";
import type { ManifestAnimation, ManifestFrame } from "../../lib/design/assets";

const isRectFrames = (frames: ManifestAnimation["frames"]): frames is ManifestFrame[] =>
  frames.length > 0 && Array.isArray(frames[0]);

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

export interface AnimationSpriteProps {
  animation: ManifestAnimation;
  /** Zoom factor applied to source pixels. */
  scale?: number;
  playing?: boolean;
  /** Show a single frame instead of looping. */
  frameIndex?: number;
  fpsOverride?: number;
}

/** Draws one frame of an animation (sheet crops or file-per-frame) on a
 * canvas, advancing frames on a timer while playing. */
export function AnimationSprite({
  animation,
  scale = 3,
  playing = true,
  frameIndex,
  fpsOverride,
}: AnimationSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const frameCount = animation.frames.length;
  const fps = fpsOverride ?? animation.fps ?? 8;

  useEffect(() => {
    if (!playing || frameIndex !== undefined || frameCount <= 1) return;
    const interval = window.setInterval(
      () => setTick((value) => (value + 1) % frameCount),
      Math.max(40, Math.round(1000 / fps)),
    );
    return () => window.clearInterval(interval);
  }, [playing, frameIndex, frameCount, fps]);

  const index = frameIndex !== undefined ? Math.min(frameIndex, frameCount - 1) : tick % frameCount;

  // Fixed box sized to the largest frame so looping never shifts the layout.
  const box = useMemo(() => {
    if (!isRectFrames(animation.frames)) return { width: 16, height: 16 };
    let width = 0;
    let height = 0;
    for (const [, , w, h] of animation.frames) {
      width = Math.max(width, w);
      height = Math.max(height, h);
    }
    return { width, height };
  }, [animation.frames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    void (async () => {
      const rectMode = isRectFrames(animation.frames);
      const src = rectMode ? animation.src : (animation.frames[index] as string);
      if (!src) return;
      const image = await loadImage(src);
      if (cancelled || !image) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (rectMode) {
        const [x, y, w, h] = (animation.frames as ManifestFrame[])[index];
        context.drawImage(image, x, y, w, h, Math.floor((box.width - w) / 2), box.height - h, w, h);
      } else {
        context.drawImage(image, 0, 0, box.width, box.height);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [animation, index, box]);

  return (
    <canvas
      ref={canvasRef}
      width={box.width}
      height={box.height}
      style={{ width: box.width * scale, height: box.height * scale, imageRendering: "pixelated" }}
      aria-label={`${animation.name} frame ${index + 1} of ${frameCount}`}
    />
  );
}
