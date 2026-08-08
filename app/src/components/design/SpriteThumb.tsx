import type { AssetItem } from "../../lib/design/assets";
import { AnimationSprite } from "./AnimationSprite";

/** Small pixel-perfect preview for any asset kind. */
export function SpriteThumb({ item, scale = 3 }: { item: AssetItem; scale?: number }) {
  if (item.kind === "single" && item.src.endsWith(".m4a")) {
    return (
      <span
        aria-hidden
        className="flex items-center justify-center rounded bg-slate-700 text-2xl"
        style={{ width: 48, height: 48 }}
      >
        🔊
      </span>
    );
  }
  if (item.kind === "single") {
    const oversized = item.w > 96 || item.h > 96;
    // Integer-downscale large sprites (e.g. 64×64 battle art) so thumbnails
    // stay compact and pixel-crisp instead of ballooning to scale× size.
    const cap = 96;
    const effectiveScale = Math.max(1, Math.min(scale, Math.floor(cap / Math.max(item.w, item.h))));
    return (
      <img
        src={item.src}
        alt=""
        loading="lazy"
        style={
          oversized
            ? { maxWidth: cap, maxHeight: cap, imageRendering: "pixelated" }
            : {
                width: item.w * effectiveScale,
                height: item.h * effectiveScale,
                imageRendering: "pixelated",
              }
        }
      />
    );
  }
  if (item.kind === "cell") {
    return (
      <span
        aria-hidden
        style={{
          width: item.size * scale,
          height: item.size * scale,
          backgroundImage: `url(${item.sheetSrc})`,
          backgroundSize: `${item.sheetW * scale}px ${item.sheetH * scale}px`,
          backgroundPosition: `${-item.x * item.size * scale}px ${-item.y * item.size * scale}px`,
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
          display: "inline-block",
        }}
      />
    );
  }
  return <AnimationSprite animation={item.animation} scale={Math.max(2, scale - 1)} />;
}
