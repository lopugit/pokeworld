# Vercel deployments

- Project: [lopugits-projects/pokeworld](https://vercel.com/lopugits-projects/pokeworld)
- Production: assigned from the `main` branch after this migration is merged
- Branch previews: automatic Vercel Git previews for every branch in
  [`lopugit/pokeworld`](https://github.com/lopugit/pokeworld)

Preview deployments set `POKEWORLD_OFFLINE_MAP=true`, so durable Workflow runs can be exercised
without writing to the production MongoDB or calling Google Static Maps. Production has the
MongoDB and Google variables configured as sensitive Vercel environment values and sets offline
mode to false.

## Build

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm build:vercel`
- Output: `.vercel/output` (Build Output API)

The build verification requires a React shell in static output, filesystem routing before the Nitro
fallback, and emitted Node.js functions. Vercel Workflow uses the managed Vercel World automatically
in preview and production deployments. `.vercelignore` keeps local secrets, generated coordinate
indexes, Workflow history, Graphify output, and local build artifacts out of source uploads.
