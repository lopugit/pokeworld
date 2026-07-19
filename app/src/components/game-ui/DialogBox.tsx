import { useEffect, useRef, useState } from "react";

interface DialogBoxProps {
  pages: string[];
  advance: number;
  onRequestAdvance: () => void;
  onDone: () => void;
}

export function DialogBox({ pages, advance, onRequestAdvance, onDone }: DialogBoxProps) {
  const [page, setPage] = useState(0);
  const [chars, setChars] = useState(0);
  const lastAdvance = useRef(advance);
  const fullLength = pages[page]?.length ?? 0;
  const complete = chars >= fullLength;

  useEffect(() => {
    setChars(0);
  }, [page]);

  useEffect(() => {
    if (chars >= fullLength) return;
    const timer = window.setInterval(() => setChars((current) => Math.min(current + 1, fullLength)), 24);
    return () => window.clearInterval(timer);
  }, [chars >= fullLength, page, fullLength]);

  useEffect(() => {
    if (advance === lastAdvance.current) return;
    lastAdvance.current = advance;
    if (!complete) {
      setChars(fullLength);
    } else if (page + 1 < pages.length) {
      setPage((current) => current + 1);
    } else {
      onDone();
    }
  }, [advance, complete, fullLength, page, pages.length, onDone]);

  const text = (pages[page] ?? "").slice(0, chars);

  return (
    <button type="button" className="pkmn-dialog" onClick={onRequestAdvance} aria-label="Advance dialog">
      <span className="pkmn-dialog-text">{text}</span>
      {complete ? <span className="pkmn-dialog-arrow">▼</span> : null}
    </button>
  );
}
