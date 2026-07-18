import { Link } from "react-router";

export function Nav() {
  return (
    <nav className="w-full flex items-center justify-center text-white bg-grass">
      <div className="container flex items-center px-4 py-5">
        <Link to="/" className="font-bold flex items-center text-2xl">
          <img src="/icon.png" className="w-5 h-5 mr-2" alt="" />
          Pokémon World
        </Link>
        <div className="flex ml-auto items-center">
          <Link to="/game" className="font-bold text-lg">
            Game
          </Link>
        </div>
      </div>
    </nav>
  );
}
