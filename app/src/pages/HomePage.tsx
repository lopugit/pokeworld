import { DevKit } from "../components/DevKit";
import { Game } from "../components/Game";
import { Nav } from "../components/Nav";

/** Console-only home: on mobile the handheld IS the whole page (no nav, no
 *  scroll), so the browser chrome settles and the shell always fits. The
 *  marketing content lives on /about. */
export function HomePage() {
  return (
    <div className="page-flex game-only-page w-full bg-green min-h-screen">
      <Nav />
      <section className="game-stage w-full flex items-center justify-center pt-12 pb-4">
        <Game />
      </section>
      <DevKit />
    </div>
  );
}
