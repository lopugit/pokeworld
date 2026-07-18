# Vercel deployments

- Project: [lopugits-projects/pokeworld](https://vercel.com/lopugits-projects/pokeworld)
- Production: assigned from the `main` branch after this migration is merged
- Branch previews: automatic Vercel Git previews for every branch in
  [`lopugit/pokeworld`](https://github.com/lopugit/pokeworld)
- Root Directory: `app`

## Verified migration preview

- Dense procedural world PR #7 (2026-07-19):
  [pokeworld-iewue50xu-lopugits-projects.vercel.app](https://pokeworld-iewue50xu-lopugits-projects.vercel.app)
- Stable branch alias:
  [pokeworld-git-codex-nitro-react-vercel-f6910e-lopugits-projects.vercel.app](https://pokeworld-git-codex-nitro-react-vercel-f6910e-lopugits-projects.vercel.app)
- Verified `app`-root deployment (2026-07-19):
  [pokeworld-f0vewe7wm-lopugits-projects.vercel.app](https://pokeworld-f0vewe7wm-lopugits-projects.vercel.app)

The project-level SSO deployment gate is disabled so preview aliases are publicly testable. The
verified deployment served `/`, `/index.html`, `/game`, both hashed Vite assets, and `/api/health`.
A current dense-world deployment repeated those shell, SPA-fallback, hashed-asset, and health checks
after the procedural grammar and merged Emerald game systems landed.
A forced one-block map job was also started through `/api/map-jobs` and reached `completed` through
Vercel Workflow's managed queue in 3.35 seconds before returning the generated block and its 256
tile records (`wrun_01KXTW01FE93NY3PYGY9NYT0PZ`). The output-equivalent colour-analysis benchmark
reduced its 512-by-512 image median from 41.73 ms to 4.45 ms (9.37x faster).

Preview deployments set `POKEWORLD_OFFLINE_MAP=true`, so durable Workflow runs can be exercised
without writing to the production MongoDB or calling Google Static Maps. Production has the
MongoDB and Google variables configured as sensitive Vercel environment values and sets offline
mode to false.

## Build

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm build:vercel`
- Output from the repository root: `app/.vercel/output` (Build Output API)

The build verification requires a React shell in static output, filesystem routing before the Nitro
fallback, and emitted Node.js functions. Vercel Workflow uses the managed Vercel World automatically
in preview and production deployments. `app/.vercelignore` keeps local secrets, generated
coordinate indexes, Workflow history, and local build artifacts out of source uploads.
