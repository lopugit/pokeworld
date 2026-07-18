# Pokeworld workspace

Pokeworld is a pnpm workspace with the complete web application isolated in
[`app/`](./app/). The repository root now contains only shared workspace,
repository, and architecture-map files, leaving room for future sibling packages.

```text
pokeworld/
├── app/                 # Nitro, React, Workflow, map engine, tests, and assets
├── graphify-out/        # whole-repository architecture map
├── package.json         # root command forwarding
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

Root commands forward to the application package, so the normal workflow is unchanged:

```sh
pnpm install
cp app/.env.example app/.env
pnpm dev
pnpm check
pnpm pms
```

- Local: [http://localhost:3847](http://localhost:3847)
- Tailscale Funnel: [https://lopus-macbook-pro-2.tail9606f9.ts.net:3847/](https://lopus-macbook-pro-2.tail9606f9.ts.net:3847/)

See the [application README](./app/README.md) for architecture, Workflow, map-generation,
verification, and deployment details.
