import { DevKit } from "../components/DevKit";
import { Game } from "../components/Game";
import { Nav } from "../components/Nav";

export function GamePage() {
  return (
    <div className="page-flex w-full bg-green min-h-screen pb-16">
      <Nav />
      <section className="game-stage w-full flex items-center justify-center pt-12 pb-12">
        <Game />
      </section>
      <DevKit />
    </div>
  );
}
