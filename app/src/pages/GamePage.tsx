import { DevKit } from "../components/DevKit";
import { Game } from "../components/Game";
import { Nav } from "../components/Nav";

export function GamePage() {
  return (
    <div className="w-full bg-green min-h-screen pb-16">
      <Nav />
      <main className="w-full flex items-center justify-center">
        <div className="container px-2">
          <div className="w-full flex items-center justify-center pt-12 pb-12">
            <Game />
          </div>
        </div>
      </main>
      <DevKit />
    </div>
  );
}
