// Client loader for the generated asset manifest (public/design/
// asset-manifest.json). Normalizes singles, sheet cells and animations into
// one searchable list for the /design asset browser.

export interface ManifestSingle {
  id: string;
  name: string;
  src: string;
  w: number;
  h: number;
  category: string;
  tags: string[];
  usage?: string;
}

export interface ManifestSheet {
  id: string;
  name: string;
  src: string;
  cell: number;
  w: number;
  h: number;
  cols?: number;
  rows?: number;
}

export type ManifestFrame = [number, number, number, number];

export interface ManifestAnimation {
  id: string;
  name: string;
  category: string;
  src?: string;
  fps: number;
  tags: string[];
  frames: ManifestFrame[] | string[];
  /** [w, h] for file-per-frame animations (sheet crops carry per-frame rects). */
  frameSize?: [number, number];
}

export interface AssetManifest {
  version: number;
  cellCategories: string[];
  singles: ManifestSingle[];
  sheets: ManifestSheet[];
  cells: Record<string, Array<[number, number, number]>>;
  animations: ManifestAnimation[];
}

export type AssetItem = { whole?: boolean } & (
  | {
      kind: "single";
      id: string;
      name: string;
      category: string;
      tags: string[];
      search: string;
      src: string;
      w: number;
      h: number;
      usage?: string;
    }
  | {
      kind: "cell";
      id: string;
      name: string;
      category: string;
      tags: string[];
      search: string;
      sheetSrc: string;
      sheetName: string;
      sheetW: number;
      sheetH: number;
      x: number;
      y: number;
      size: number;
    }
  | {
      kind: "animation";
      id: string;
      name: string;
      category: string;
      tags: string[];
      search: string;
      animation: ManifestAnimation;
    }
);

export interface AssetDatabase {
  items: AssetItem[];
  categories: Array<{ id: string; label: string; count: number }>;
  sheets: ManifestSheet[];
}

const CATEGORY_LABELS: Record<string, string> = {
  water: "Water",
  vegetation: "Vegetation",
  ground: "Ground & paths",
  terrain: "Terrain",
  building: "Buildings & structures",
  prop: "Props & signs",
  character: "Characters",
  pokemon: "Pokémon",
  misc: "Misc",
  rock: "Rock & cave",
  town: "Town maps",
  item: "Items",
  interior: "Interiors",
  animation: "Animations",
};

// The exterior sheet's auto-classified "structure" cells and the shipped
// building tiles are one browsing concern — a single merged category.
const mergedCategory = (category: string) => (category === "structure" ? "building" : category);

export const categoryLabel = (id: string) => CATEGORY_LABELS[id] ?? id;

let databasePromise: Promise<AssetDatabase> | null = null;

export function loadAssetDatabase(): Promise<AssetDatabase> {
  databasePromise ||= fetch("/design/asset-manifest.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Asset manifest failed to load (${response.status})`);
      return response.json() as Promise<AssetManifest>;
    })
    .then(buildDatabase)
    .catch((error) => {
      databasePromise = null;
      throw error;
    });
  return databasePromise;
}

function buildDatabase(manifest: AssetManifest): AssetDatabase {
  const items: AssetItem[] = [];

  for (const single of manifest.singles) {
    items.push({
      kind: "single",
      id: single.id,
      name: single.name,
      category: mergedCategory(single.category),
      tags: single.tags,
      // A "whole object" is anything that is a complete visual thing on its
      // own: composed formations, standalone props (even 1-tile flowers),
      // town maps, and every character / Pokémon sprite. Autotile pieces,
      // formation part-tiles and sheet cells are "individual tiles".
      whole:
        single.tags.includes("whole-object") ||
        ["pokemon", "character", "town"].includes(mergedCategory(single.category)),
      search: `${single.name} ${single.category} ${single.tags.join(" ")} ${single.src}`.toLowerCase(),
      src: single.src,
      w: single.w,
      h: single.h,
      usage: single.usage,
    });
  }

  for (const animation of manifest.animations) {
    items.push({
      kind: "animation",
      id: animation.id,
      name: animation.name,
      category: "animation",
      whole: true,
      tags: animation.tags,
      search: `${animation.name} animation ${animation.category} ${animation.tags.join(" ")}`.toLowerCase(),
      animation,
    });
  }

  for (const sheet of manifest.sheets) {
    const cells = manifest.cells[sheet.id];
    if (!cells) continue;
    const isInterior = sheet.id === "in";
    for (const [x, y, categoryIndex] of cells) {
      const heuristic = manifest.cellCategories[categoryIndex] ?? "structure";
      const category = isInterior ? "interior" : mergedCategory(heuristic);
      const name = `${isInterior ? "Interior" : "Exterior"} tile (${x}, ${y})`;
      items.push({
        kind: "cell",
        id: `${sheet.id}:${x},${y}`,
        name,
        category,
        tags: [category, isInterior ? "interior" : "exterior", "emerald", "tileset"],
        search: `${name} ${category} ${isInterior ? "interior room" : "exterior overworld"} emerald tileset`.toLowerCase(),
        sheetSrc: sheet.src,
        sheetName: sheet.name,
        sheetW: sheet.w,
        sheetH: sheet.h,
        x,
        y,
        size: sheet.cell,
      });
    }
  }

  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  const categories = [...counts.entries()]
    .map(([id, count]) => ({ id, label: categoryLabel(id), count }))
    .sort((a, b) => b.count - a.count);

  return { items, categories, sheets: manifest.sheets };
}

export function searchAssets(
  database: AssetDatabase,
  query: string,
  category: string | null,
): AssetItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return database.items.filter((item) => {
    if (category && item.category !== category) return false;
    if (terms.length === 0) return true;
    return terms.every((term) => item.search.includes(term));
  });
}
