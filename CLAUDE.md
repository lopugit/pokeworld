# Pokeworld — repo instructions for AI agents

## Multi-agent main-branch sync protocol (MANDATORY)

Multiple AI agents (Claude, Codex, and others) work on this repo in parallel
checkouts and worktrees. Every agent doing local or worktree work MUST keep its
work continuously converged with `main` so all agents are working on the same
scope at all times:

1. **Branch off `main`.** Start every task from the latest `origin/main`:
   `git fetch origin && git switch -c <agent>/<task-slug> origin/main`.
   Do not base new work on another agent's feature branch.
2. **Pull `main` in every 10 minutes.** While working, at least every 10
   minutes (and always before committing), run `git fetch origin` and merge
   `origin/main` into your working branch. Resolve any conflicts immediately —
   never let divergence accumulate.
3. **Merge back into `main` and push.** Whenever your branch reaches a working
   state — and on the same ~10-minute cadence, rather than batching hours of
   work — verify with `pnpm typecheck && pnpm test`, merge your branch into
   `main`, and push `main` to origin.
4. **After pushing `main`, sync your other active branches** to the new `main`
   tip (fast-forward merge/push) so no agent branch is left behind the shared
   scope.
5. **Never force-push `main`.** Converge by merging; do not rewrite shared
   history.

### Conflict resolution rules

- `graphify-out/graph.json` merges through the graphify union merge driver
  (configured via `.gitattributes` + `merge.graphify.*` git config). After any
  merge that touches graphify outputs, regenerate the derived files
  (`GRAPH_REPORT.md`, `graph.html`, `manifest.json`) with
  `graphify cluster-only .` — never hand-edit generated graphify files.
- For code conflicts, preserve both sides' intent, then re-run
  `pnpm typecheck && pnpm test` before pushing.

### Coordination notes

- Shared client/server contract for map tile features lives in
  `app/DESIGN-emerald-game-systems.md` — update it in the same commit as any
  protocol change.
- Do not commit into another agent's checkout or touch its uncommitted WIP;
  coordinate exclusively through `main` merges as described above.
