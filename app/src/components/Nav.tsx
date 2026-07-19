import { Link } from "react-router";
import { AuthControls } from "./AuthControls";

export function Nav() {
  return (
    <nav className="w-full flex items-center justify-center text-white bg-grass">
      <div className="container flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:py-5">
        <Link to="/" className="flex items-center text-xl font-bold sm:text-2xl">
          <img src="/icon.png" className="w-5 h-5 mr-2" alt="" />
          Pokémon World
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <Link to="/game" className="rounded-md px-2 py-2 text-base font-bold hover:bg-white/10 sm:text-lg">
            Game
          </Link>
        </div>
        <div className="ml-auto flex basis-full justify-end sm:ml-0 sm:basis-auto">
          <AuthControls />
        </div>
      </div>
    </nav>
  );
}
