import { useEffect, useRef } from "react";

export type MenuItemId =
  | "pokedex"
  | "party"
  | "bag"
  | "badges"
  | "pc"
  | "settings"
  | "save"
  | "exit";

export const MENU_ITEMS: Array<{ id: MenuItemId; label: string }> = [
  { id: "pokedex", label: "POKéDEX" },
  { id: "party", label: "POKéMON" },
  { id: "bag", label: "BAG" },
  { id: "badges", label: "BADGES" },
  { id: "pc", label: "PC" },
  { id: "settings", label: "OPTION" },
  { id: "save", label: "SAVE" },
  { id: "exit", label: "EXIT" },
];

interface StartMenuProps {
  selectedIndex: number;
  onSelect: (id: MenuItemId) => void;
  onHighlight: (index: number) => void;
}

export function StartMenu({ selectedIndex, onSelect, onHighlight }: StartMenuProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // The list can be taller than short displays; keep the cursor visible.
  useEffect(() => {
    listRef.current
      ?.querySelectorAll(".pkmn-menu-item")
      [selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div className="pkmn-menu" role="menu" aria-label="Start menu" ref={listRef}>
      {MENU_ITEMS.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={`pkmn-menu-item${index === selectedIndex ? " selected" : ""}`}
          onMouseEnter={() => onHighlight(index)}
          onClick={() => onSelect(item.id)}
        >
          <span className="pkmn-menu-cursor">{index === selectedIndex ? "▶" : ""}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
