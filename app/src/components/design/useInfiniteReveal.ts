import { useCallback, useEffect, useRef, useState } from "react";

/** Incremental reveal for filtered lists: shows `pageSize` items and grows
 * whenever the sentinel scrolls into view. Reset when the source changes.
 * The sentinel uses a callback ref so a remounted sentinel node (e.g. after a
 * filter change to an equally-sized result set) is always re-observed. */
export function useInfiniteReveal<T>(items: T[], pageSize = 60) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);

  const mounted = useRef(false);
  useEffect(() => {
    setVisibleCount(pageSize);
    // A new result set may be far shorter than the revealed old one; without
    // this, switching filters while deep-scrolled strands the user below the
    // new content.
    if (mounted.current) window.scrollTo({ top: 0 });
    mounted.current = true;
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
    // visibleCount is a deliberate dep: IntersectionObserver only reports
    // CHANGES, so if one growth leaves the sentinel still inside the margin
    // no further event ever fires and the list stalls. Recreating the
    // observer after each growth re-emits the initial intersection state,
    // cascading growth until the sentinel is genuinely out of range.
  }, [sentinel, grow, visibleCount]);

  return {
    visible: items.slice(0, visibleCount),
    hasMore: visibleCount < items.length,
    sentinelRef: setSentinel,
    /** Manual escape hatch: lets the sentinel double as a load-more button so
     * reveal never depends solely on IntersectionObserver delivery. */
    grow,
  };
}
