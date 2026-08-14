import { Banner } from "../components/Banner";
import { DevKit } from "../components/DevKit";
import { Game } from "../components/Game";
import { Nav } from "../components/Nav";

export function HomePage() {
  return (
    <div className="w-full bg-green min-h-screen pb-16">
      <Nav />
      <main className="w-full flex items-center justify-center">
        <div className="container px-4">
          {/* The game itself leads the page; new players meet PROF. OAK here. */}
          <div className="w-full flex items-center justify-center pt-12 pb-4">
            <Game />
          </div>
          <Banner
            image="/bannerPic1.png"
            tagline="Introducing the"
            title="Pokémon World"
            description="The first AR Pokémon game based on traditional Pokémon play style"
            keywords="fun, pokémon, augmented reality, AR, game, play, pokémon world"
          />
          <Banner title="Full-page mode" links={[{ text: "Play Now", link: "/game" }]} />
          <Banner
            image="/lopudesigns.jpeg"
            imageCircle
            swap
            tagline="Built by"
            title="Lopu Designs"
            descriptions={[
              "A Full-Stack developer passionate about Pokémon and AR",
              "Nikolaj (lopu) has been developing the Pokémon World since 2020",
              "Starting with a mapping algorithm for converting Google maps data into Pokémon sprite based tile maps, and then working on the fundamental Pokémon game mechanics like battling, leveling, and breeding",
              "To work on the game with us, visit the Github link below",
            ]}
            links={[
              { text: "YouTube", link: "https://youtube.com/lopudesigns" },
              { text: "Website", link: "https://lopudesigns.com" },
              { text: "Twitter", link: "https://twitter.com/lopudev" },
              { text: "Github", link: "https://github.com/lopugit/pokeworld" },
            ]}
          />
        </div>
      </main>
      <DevKit />
    </div>
  );
}
