export type MenuItemId = "party" | "bag" | "badges" | "pc" | "save" | "exit";

export const MENU_ITEMS: Array<{ id: MenuItemId; label: string }> = [
  { id: "party", label: "POKéMON" },
  { id: "bag", label: "BAG" },
  { id: "badges", label: "BADGES" },
  { id: "pc", label: "PC" },
  { id: "save", label: "SAVE" },
  { id: "exit", label: "EXIT" },
];

interface StartMenuProps {
  selectedIndex: number;
  onSelect: (id: MenuItemId) => void;
  onHighlight: (index: number) => void;
}

export function StartMenu({ selectedIndex, onSelect, onHighlight }: StartMenuProps) {
  return (
    <div className="pkmn-menu" role="menu" aria-label="Start menu">
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
