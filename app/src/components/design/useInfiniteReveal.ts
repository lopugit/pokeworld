import { useCallback, useEffect, useRef, useState } from "react";

/** Incremental reveal for filtered lists: shows `pageSize` items and grows
 * whenever the sentinel scrolls into view. Reset when the source changes. */
export function useInfiniteReveal<T>(items: T[], pageSize = 60) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  const grow = useCallback(() => {
    setVisibleCount((count) => (count >= items.length ? count : Math.min(items.length, count + pageSize)));
  }, [items.length, pageSize]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) grow();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [grow]);

  return {
    visible: items.slice(0, visibleCount),
    hasMore: visibleCount < items.length,
    sentinelRef,
  };
}
