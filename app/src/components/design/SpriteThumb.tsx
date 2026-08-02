import type { AssetItem } from "../../lib/design/assets";
import { AnimationSprite } from "./AnimationSprite";

/** Small pixel-perfect preview for any asset kind. */
export function SpriteThumb({ item, scale = 3 }: { item: AssetItem; scale?: number }) {
  if (item.kind === "single") {
    const oversized = item.w > 64 || item.h > 64;
    return (
      <img
        src={item.src}
        alt=""
        loading="lazy"
        style={
          oversized
            ? { maxWidth: 96, maxHeight: 96, imageRendering: "pixelated" }
            : { width: item.w * scale, height: item.h * scale, imageRendering: "pixelated" }
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
