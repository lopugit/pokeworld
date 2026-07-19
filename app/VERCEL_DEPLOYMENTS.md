# Vercel deployments

- Project: [lopugits-projects/pokeworld](https://vercel.com/lopugits-projects/pokeworld)
- Production: assigned from the `main` branch after this migration is merged
- Branch previews: automatic Vercel Git previews for every branch in
  [`lopugit/pokeworld`](https://github.com/lopugit/pokeworld)
- Root Directory: `app`

## Verified migration preview

- Final dense procedural world PR #7 commit `5188647` (2026-07-19):
  [pokeworld-it1tq88z9-lopugits-projects.vercel.app](https://pokeworld-it1tq88z9-lopugits-projects.vercel.app)
- Stable dense-world branch alias:
  [pokeworld-git-codex-dense-pokemon-worlds-lopugits-projects.vercel.app](https://pokeworld-git-codex-dense-pokemon-worlds-lopugits-projects.vercel.app)
- Earlier dense procedural world PR #7 preview:
  [pokeworld-iewue50xu-lopugits-projects.vercel.app](https://pokeworld-iewue50xu-lopugits-projects.vercel.app)
- Earlier Nitro migration branch alias:
  [pokeworld-git-codex-nitro-react-vercel-f6910e-lopugits-projects.vercel.app](https://pokeworld-git-codex-nitro-react-vercel-f6910e-lopugits-projects.vercel.app)
- Verified `app`-root deployment (2026-07-19):
  [pokeworld-f0vewe7wm-lopugits-projects.vercel.app](https://pokeworld-f0vewe7wm-lopugits-projects.vercel.app)

The project-level SSO deployment gate is disabled so preview aliases are publicly testable. The
verified deployment served `/`, `/index.html`, `/game`, both hashed Vite assets, and `/api/health`.
A current dense-world deployment repeated those shell, SPA-fallback, hashed-asset, and health checks
after the procedural grammar and merged Emerald game systems landed.
The final `5188647` preview returned HTTP 200 for `/`, `/index.html`, `/game`, and
`/assets/index-ttT-5K1O.js`; `/api/health` reported the app healthy with Vercel Workflow auto
selection. The preview intentionally has no MongoDB configuration and therefore does not run the
production persistence path, but its server-side map jobs do call Google Static Maps and return
real source imagery to the public frontend.
A forced one-block map job was also started through `/api/map-jobs` and reached `completed` through
Vercel Workflow's managed queue in 3.35 seconds before returning the generated block and its 256
tile records (`wrun_01KXTW01FE93NY3PYGY9NYT0PZ`). The output-equivalent colour-analysis benchmark
reduced its 512-by-512 image median from 41.73 ms to 4.45 ms (9.37x faster).

Preview and production deployments both have a server-side `GOOGLE_API_KEY` and set
`POKEWORLD_OFFLINE_MAP=false`, so every public frontend can display the real Google Static Maps
source layer. Preview deliberately remains without MongoDB configuration, so preview generation
is non-persistent while production retains Google-backed MongoDB persistence. The Google key is a
sensitive Vercel environment value and is never included in the client bundle.

## Build

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm build:vercel`
- Output from the repository root: `app/.vercel/output` (Build Output API)

The build verification requires a React shell in static output, filesystem routing before the Nitro
fallback, and emitted Node.js functions. Vercel Workflow uses the managed Vercel World automatically
in preview and production deployments. `app/.vercelignore` keeps local secrets, generated
coordinate indexes, Workflow history, and local build artifacts out of source uploads.
