---
type: standard-gap
severity: medium
affected_files:
  - .github/workflows/ci.yml
  - .husky/pre-commit
  - .husky/pre-push
  - turbo.json
  - apps/editor/scripts/first-paint-budget.ts
  - apps/editor/vite.config.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-08-21
reporting_agent: web-developer
category: performance
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`apps/editor/scripts/first-paint-budget.ts` fails `vite build` on two claims about the emitted
bundle — a gzipped first-paint budget, and no chunk mixing this repository's own source with a
`node_modules` module. It is the only thing in the tree that can see what a visitor downloads, and
it is correct. **Nothing that runs before a merge builds the editor, so neither claim is ever
asked.**

`editor#build` is in exactly one task graph, and it is the deploy's:

```
bunx turbo run typecheck lint test test:e2e --filter='!agents-inc' --dry=json   # what CI's check-web runs
bunx turbo run deploy --dry=json                                                # what the deploy job runs
```

The first returns `editor#lint`, `editor#test`, `editor#test:e2e` and `editor#typecheck`, and no
`editor#build`. The second returns `editor#build  command="tsc -b && vite build"`. Both hook tiers
agree with CI: `.husky/pre-commit` runs `lint typecheck test`, `.husky/pre-push` runs
`lint test test:e2e`, and neither names `build` at all. The `build` nodes that _do_ appear in the
check-web graph are `^build` on the other tasks — the dependencies' builds, not this workspace's —
which is why the graph looks like it covers the build and does not: seven of them report
`command="<NONEXISTENT>"`, and the two real ones are `server#build` and `www#build`.

So a first-paint regression is green through every pre-merge gate, green on the merge, and then
**fails the deploy job** — the shared one, gated on `check-web` and running on every push to `main`.
The failure therefore lands after the change is unrevertible-by-review, on whoever pushes next, and
it blocks the site shipping _any_ web change until the bundle is fixed. That is the most expensive
place this particular check could fire and the only place it currently can.

**Why nobody saw it.** Both sibling workspaces already solved this, each with a workspace-local
`turbo.json` adding its OWN `build` — not `^build` — to a task CI runs:
`packages/cli/turbo.json` does it for `test` and `test:e2e` because oclif resolves commands out of
`dist/`, and `apps/www/turbo.json` does it for `test` because `check-type-scale.ts` opens a browser
against that workspace's `dist/`. Both carry a comment explaining the missing caret, and the CLI's
comment names the editor as the case that does not need it: _"which is right for the editor: its
Playwright config boots a dev server and never reads its own dist."_ That reasoning is correct.
The question it answers is **does this suite need the build**, and the question nobody asked
afterwards is **does anything run this build at all**. `apps/editor` has no `turbo.json`.

The finding that installed the gate,
`2026-08-21-manual-chunking-can-un-lazy-a-dynamic-import-and-no-gate-would-see-it`, states the
opposite in prose — _"It runs inside `vite build`, so `bun run build` is the gate — there is no
separate command to remember and no way to land a regression through a green build"_ — and it is
true of a build, which is the half that was checked. `.ai-docs/standards/editor-and-worker.md` ->
"What a first-time visitor downloads is a claim the build checks" makes the narrower and accurate
claim that the only place the question **can** be asked is inside `vite build`; it says nothing
about what runs one, and the omission reads as covered.

The gate is live and its headroom is real rather than generous. Measured against the tree on
2026-08-21, gzip level 9 over the entry, its transitive static imports and the stylesheet:

|                                        |     no chunk groups |            as shipped |
| -------------------------------------- | ------------------: | --------------------: |
| first paint                            |    303.8 KB gzipped |      304.4 KB gzipped |
| largest first-paint file (raw)         | 1056.8 KB, one file |     246.2 KB, 7 files |
| re-downloaded after an app-source edit |    295.3 KB gzipped |       28.9 KB gzipped |
| budget / headroom                      |                   — | 330 KB, 25.6 KB spare |

25.6 KB is under a tenth of the payload — one statically-imported library away.

## Fix Applied

None. Every file that can close this belongs to another lane; the change is named below rather than
made.

## Proposed Standard

**A check that lives inside a build is only as good as the run that invokes that build, and the
second half is a separate claim that has to be made separately.** The first half is about the
artefact and is what an author naturally verifies; the second is about the task graph and is
invisible from the file the check lives in. Where a workspace has a build nothing else depends on,
that graph question has no default answer — `^build` on a sibling task looks like coverage and is
about somebody else's package.

**Check the graph, not the script.** `package.json` naming a `build` is not evidence that anything
runs it. `turbo run <the tasks CI actually runs> --dry=json` is, and it costs a second.

### The change this needs

One line in `.github/workflows/ci.yml`, in the `check-web` job, beside the existing
`typecheck`/`lint` steps:

```yaml
- run: bun run build --filter='!agents-inc'
```

It is a step rather than a `dependsOn` because the build is a gate here in its own right, and the
honest alternative — an `apps/editor/turbo.json` hanging `build` off `test:e2e` the way the two
siblings do — would be asserting a dependency the editor's Playwright suite does not have, against
the comment in `packages/cli/turbo.json` that says so. The cost is small and already partly paid:
`server#build` and `www#build` are in that job's graph today, turbo caches all three, and the
editor's own `vite build` measured 314 ms on this tree.
