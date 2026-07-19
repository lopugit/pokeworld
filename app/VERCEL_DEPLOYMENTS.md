# Vercel deployments

- Project: [lopugits-projects/pokeworld](https://vercel.com/lopugits-projects/pokeworld)
- Production: [pokeworld.center](https://pokeworld.center) and
  [www.pokeworld.center](https://www.pokeworld.center), deployed from `main`
- Branch previews: automatic Vercel Git previews for every branch in
  [`lopugit/pokeworld`](https://github.com/lopugit/pokeworld)
- Root Directory: `app`

## Verified guarded-streaming preview

- PR [#12](https://github.com/lopugit/pokeworld/pull/12), commit `362b22b` (2026-07-19):
  [immutable deployment](https://pokeworld-gqockavu5-lopugits-projects.vercel.app)
- Stable branch alias:
  [pokeworld-git-codex-thingtime-auth-gen-50694a-lopugits-projects.vercel.app](https://pokeworld-git-codex-thingtime-auth-gen-50694a-lopugits-projects.vercel.app)

The preview returned HTTP 200 for `/`, `/game`, `/api/health`, and `/api/auth/session`;
anonymous `/api/admin/generation-quota` access returned 401, a hostile-origin login returned 403,
and `regenerate=true` on the public block API returned 403. The exact preview origin is registered
with Thingtime, and the live login popup identifies Pokeworld and offers the general account flow.

This release stops player and repeated auto-movement at unloaded block boundaries while neighbouring
blocks load, with a themed progress, error, and retry overlay. Generation is globally limited to nine
blocks per rolling five seconds and 500 reserved blocks per UTC day. Immutable-ID admins can inspect
and reset the daily quota at `/admin`; `@lopu` is configured as the initial admin, and the app is owned
by the Thingtime service identity `@pokeworld-service`.

Vercel stores `POKEWORLD_SESSION_SECRET` and `THINGTIME_SERVICE_TOKEN` as encrypted server values.
The service identity owns complete compressed map-block Things and calls Thingtime's atomic quota
endpoint; the public `VITE_THINGTIME_CLIENT_ID` identifies the Thingtime app without exposing a
credential.

## Verified migration preview

- Production Mongo repair deployment (2026-07-19):
  [pokeworld-bsiwtaftd-lopugits-projects.vercel.app](https://pokeworld-bsiwtaftd-lopugits-projects.vercel.app)

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
The final `5188647` historical preview returned HTTP 200 for `/`, `/index.html`, `/game`, and
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
source layer. Production's former `MONGODB_*` variables were local-development values that resolved
to `127.0.0.1:27017` inside Vercel; they were removed on 2026-07-19. The current storage release
routes both durable map blocks and quota state through Thingtime's authenticated API boundary
instead. The Google key and Thingtime service token are sensitive Vercel environment values and are
never included in the client bundle.

## Build

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm build:vercel`
- Output from the repository root: `app/.vercel/output` (Build Output API)

The build verification requires a React shell in static output, filesystem routing before the Nitro
fallback, and emitted Node.js functions. Vercel Workflow uses the managed Vercel World automatically
in preview and production deployments. `app/.vercelignore` keeps local secrets, generated
coordinate indexes, Workflow history, and local build artifacts out of source uploads.
