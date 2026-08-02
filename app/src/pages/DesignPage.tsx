import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { Nav } from "../components/Nav";
import { AssetBrowser } from "../components/design/AssetBrowser";
import { CommunityBrowser } from "../components/design/CommunityBrowser";
import { DesignBrowser } from "../components/design/DesignBrowser";
import { CATALOG_SIZE } from "../lib/design/catalog";

const TABS = [
  { id: "assets", label: "Asset database" },
  { id: "designs", label: "Design browser" },
  { id: "community", label: "Community" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DesignPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: TabId = TABS.some((entry) => entry.id === rawTab) ? (rawTab as TabId) : "assets";

  useEffect(() => {
    const previous = document.title;
    const prefix = previous.split("Pokémon World")[0];
    document.title = `${prefix}Pokémon World — Design`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-slate-950 pb-20 text-slate-100">
      <Nav />
      <main className="mx-auto w-full max-w-7xl px-4">
        <header className="py-8 text-center">
          <h1 className="text-2xl font-bold text-emerald-300 sm:text-3xl">World builder studio</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">
            Browse every asset in Pokéworld’s Emerald toolkit — thousands of tiles, sprites and
            animations — explore {CATALOG_SIZE} generated example blocks, remix any of them into a
            brand-new layout, and save your favourites for every trainer to find.
          </p>
        </header>

        <nav className="mb-6 flex justify-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1 sm:gap-2" aria-label="Design studio sections">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSearchParams(entry.id === "assets" ? {} : { tab: entry.id })}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition sm:flex-none sm:px-6 ${
                tab === entry.id
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              aria-current={tab === entry.id ? "page" : undefined}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        {tab === "assets" && <AssetBrowser />}
        {tab === "designs" && <DesignBrowser />}
        {tab === "community" && <CommunityBrowser />}
      </main>
    </div>
  );
}
