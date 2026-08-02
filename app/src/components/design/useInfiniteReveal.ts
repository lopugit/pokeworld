import { useCallback, useEffect, useState } from "react";

/** Incremental reveal for filtered lists: shows `pageSize` items and grows
 * whenever the sentinel scrolls into view. Reset when the source changes.
 * The sentinel uses a callback ref so a remounted sentinel node (e.g. after a
 * filter change to an equally-sized result set) is always re-observed. */
export function useInfiniteReveal<T>(items: T[], pageSize = 60) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  const grow = useCallback(() => {
    setVisibleCount((count) => (count >= items.length ? count : Math.min(items.length, count + pageSize)));
  }, [items.length, pageSize]);

  useEffect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) grow();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, grow]);

  return {
    visible: items.slice(0, visibleCount),
    hasMore: visibleCount < items.length,
    sentinelRef: setSentinel,
  };
}
