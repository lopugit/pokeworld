# Pokémon World application

This complete web runtime lives in the workspace's `app/` package. React, Nitro, Workflow, the map
engine, application assets, tests, PM2 configuration, and Vercel configuration remain together;
the repository root only forwards commands into this package.

Pokémon World is now one full-stack application:

- **React 19 + React Router** in non-framework mode for the original UI and Game Boy experience.
- **Vite 8** for the browser build and local HMR.
- **Nitro 3** for API routes, static delivery, and the Vercel build output.
- **Vercel Workflow** for durable, retryable map generation.
- **MongoDB** for production block/tile persistence and **Google Static Maps** for real colour data.
- **Thingtime SSO** for general user login and immutable-ID-based administrator access.

There are no separate `frontend/` and `api/` packages or proxy ports anymore. The React app,
Nitro routes, and local Workflow runtime all share port **3847**.

## Install and run

```sh
pnpm install
cp app/.env.example app/.env
pnpm dev
```

- Local: [http://localhost:3847](http://localhost:3847)
- Tailscale Funnel: [https://lopus-macbook-pro-2.tail9606f9.ts.net:3847/](https://lopus-macbook-pro-2.tail9606f9.ts.net:3847/)

The development server binds only to `127.0.0.1`; Tailscale proxies the public listener into that
loopback port. The exact Funnel hostname is allowlisted in `app/vite.config.ts`.

### Thingtime login

Set `VITE_THINGTIME_CLIENT_ID` to the public `ttapp_…` client ID for the Thingtime app whose origin
allowlist contains each exact Pokeworld origin. Set `POKEWORLD_SESSION_SECRET` to a private random
value of at least 32 characters on every public deployment. Local development uses an ephemeral
process secret when this variable is omitted, so restarting the local server signs everybody out.

The browser loads Thingtime's official login SDK only after the user presses **Login with
Thingtime**. It requests `profile.username`, with display name and avatar optional, then sends the
short-lived app token to Pokeworld once. The Nitro server validates that token against Thingtime's
`/api/v1/oauth/userinfo` endpoint with the browser's exact `Origin`, discards it, and issues a
seven-day `HttpOnly`, `Secure`, `SameSite=Lax` Pokeworld cookie. Neither the Thingtime bearer nor
admin status is accepted from browser state. User `@lopu` is mapped to administrator access by its
immutable Thingtime user ID; additional immutable IDs can be supplied through the optional
comma-separated `POKEWORLD_ADMIN_THINGTIME_IDS` variable.

For the persistent local process:

```sh
pnpm pms
pnpm pms-stop
```

PM2 runs one deterministic process named `pokeworld-nitro-react-3847` with auto-restart disabled.
The lifecycle script removes only this checkout's old Pokeworld entries, verifies the port, health,
process count, and stable restart counter, then saves the healthy PM2 state.

## How Workflow works locally

Nitro does **not** launch a map-generator child process. The `workflow/vite` plugin installs the
Local World into the same Nitro/Vite dev server. A request to `/api/map-jobs` creates a durable run;
the Local World queues each `"use step"` map block and invokes it through a separate HTTP request to
the same server. Run state is stored in `.workflow-data/`, so the API follows the same
workflow/step boundary used on Vercel.

The local queue is in-memory, while completed run data is filesystem-backed. Restarting the dev
server clears pending queue work, but completed/local run records remain inspectable. The optional
Workflow dashboard is a separate observer process:

```sh
pnpm workflow:web
pnpm workflow:inspect
```

On Vercel, the Vercel World supplies managed queues, durable state, retries, and step functions.
Each block is a separate private, queue-triggered Node.js function with `maxDuration: "max"`, and
independent blocks are scheduled concurrently. A workflow can therefore outlive the original
browser/API invocation and resume after retries or deployments.

Official references: [Workflow with Nitro](https://useworkflow.dev/docs/getting-started/nitro),
[Local World](https://useworkflow.dev/docs/worlds/local), and
[Vercel World](https://useworkflow.dev/docs/worlds/vercel).

## Map generation

The browser requests nearby blocks through `GET /api/blocks`. Cached MongoDB blocks return
immediately; missing or stale blocks queue `generateMapWorkflow` and the browser polls the run.

You can enqueue the same durable path from the terminal while the app is running:

```sh
pnpm map:generate -- 946647 488524
pnpm map:generate -- 946647 488524 --radius 2 --regenerate
```

`--radius 2` requests the maximum 25 blocks. In offline development,
`POKEWORLD_OFFLINE_MAP=true` avoids MongoDB and Google and uses a deterministic fallback image.
Production blocks record `mapSource`, `fallbackGenerated`, and `mapGeneratedAt`, allowing a later
request to repair fallback-derived MongoDB data when Google Static Maps is available.

All uncached generation is protected by one Mongo-backed global allowance: at most **9 actual
block generations in any rolling 5-second window** and **500 reserved blocks per UTC day**. Cached
blocks cost nothing, and workflows recheck the cache before consuming a permit. Configure
`POKEWORLD_QUOTA_MONGODB_URI` (and optionally `POKEWORLD_QUOTA_MONGODB_DB`) to use a dedicated
shared store; otherwise the map Mongo connection is used. Public deployments fail closed with
`503` when no quota store is reachable. Explicit regeneration is disabled on every Vercel/public
build, while an authenticated Pokeworld administrator can inspect or reset the daily allowance at
`/admin` without clearing the active rolling five-second window or cancelling workflows already in
progress.

### Emerald world grammar

Google's water, road, building, and ground semantics remain the foundation of every generated
block. A deterministic world-grammar pass then turns that geography into an authored Emerald-style
route: squared one-to-three-tile paths, coherent forests, ledges, signs, cave approaches, houses,
flower and long-grass fields, and hidden-item clearings. Six biomes, eight structure templates, six
detail palettes, and three route treatments produce **864 stable recipes**, so the same coordinates
always rebuild the same world while nearby places retain meaningful variation. Biome-specific
weights make woodlands favor forest structures, highlands favor caves and ledges, and village
greens favor built clusters. Shared global-coordinate portals make neighboring blocks agree at
their edges, and every block carves a walkable central landing into an intentional route.

All shipped map and Pokémon art is cropped from the repository's original Game Boy Advance Pokémon
Emerald exterior sheet or the corresponding Emerald-version Pokémon sprites. The generator does not
ship AI-created or stylistically approximate replacement art.

Press `START`, `Enter`, or `M` to open the trainer menu. `A` / `Z` / `Space` confirms or interacts,
while `B` / `X` / `Escape` backs out. The menu includes the six-slot party, item pocket, Hoenn badge
case, and Box 1 PC deposit/withdraw flow, with trainer progress persisted independently of location.

### API routes

- `GET /api/health`
- `GET /api/block-lat-lng?lat=...&lng=...`
- `GET /api/blocks?blockX=...&blockY=...&offsets=...`
- `POST /api/map-jobs`
- `GET /api/map-jobs/:runId`
- `POST /api/auth/thingtime`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/admin/generation-quota` (administrator only)
- `POST /api/admin/generation-quota` (administrator-only daily reset)
- Legacy-compatible aliases: `/v1/blockLatLng` and `/v1/blocks`

## Verification and deployment

```sh
pnpm typecheck
pnpm test
pnpm build:vercel
pnpm check
```

`build:vercel` uses the Nitro Vercel preset and then proves that:

- `.vercel/output/static/index.html` contains the React root and Vite asset;
- filesystem/static routing precedes the Nitro fallback;
- the Node.js server function was emitted;
- the Workflow manifest contains the map workflow and its durable per-block step;
- the step function is private-queue triggered and uses Vercel's maximum function duration.

Vite ignores generated `.vercel`, `.output`, `.swc`, and coverage files while serving development,
so `pnpm check` or `pnpm build:vercel` can run alongside the PM2 dev process without causing the
Workflow hot-update plugin to rebuild generated workflow functions in a loop.

The linked [Vercel project](https://vercel.com/lopugits-projects/pokeworld) builds every Git branch.
Its Vercel Root Directory is `app`, so application builds remain independent of future root-level
packages. See [VERCEL_DEPLOYMENTS.md](./VERCEL_DEPLOYMENTS.md) for deployment and environment
details.
