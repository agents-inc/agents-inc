# Repository — build tracker

Outstanding work on the repository itself: getting CI green again, deploying, tool versions,
external service names, and what this repository publishes. Its sibling trackers: the
configurator is [`editor.md`](./editor.md), the site is [`www.md`](./www.md), the API worker is
[`server.md`](./server.md), the CLI is [`cli.md`](./cli.md), and the skills marketplace is
[`skills.md`](./skills.md).

**An item is deleted when it lands rather than ticked off**, so everything below is still open.
There is no done column and nothing is struck through. Landed items get one line each in
[`archive.md`](./archive.md).

**Rows are one-liners.** Detail lives below the table under the item's ID. Each ID permanently
carries the identifier the item had before this folder existed.

**Roughly ordered by what to do first.** CI has been green on all three jobs since 2026-08-04, so
nothing here is on fire. The version unification and its whole tail — the syncpack groups, the CI
workarounds Ink used to force, the safety-net gaps, the shipped test files and the stray npm calls —
all landed 2026-08-05; see `archive.md`. What remains is the apex path split (WWW-03 in `www.md`) and items
awaiting a decision. Nothing here depends on order.

| ID                                                                  | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Status           | Type     | Complexity |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- | ---------- |
| REPO-37 (new, 2026-08-09)                                           | DEFERRED (owner: a refactor investigation that would throw the roadmap out for no obvious benefit now) — wire dependency-cruiser: `deps:graph` script emitting Mermaid + JSON of real module edges, rules encoding the documented boundaries, drift-check against dependency-graph.md/boundary-map.md, then ONE assessment round producing a findings-only architecture report (cycles, layering violations, fan-in hotspots) for owner rulings. Pairs with CLI-464 (knip). | Deferred         | feature  | medium     |
| REPO-07 (was monorepo-merge "Delete ~/dev/agents-inc-web-monorepo") | Delete the old web monorepo once this repository is trusted                                                                                                                                                                                                                                                                                                                                                                                                                 | Needs Assistance | refactor | easy       |

**Build-order constraint, found 2026-08-16.** `apps/editor`'s typecheck reads the worker's route
types from `apps/server/dist/index.d.ts`, and that directory is gitignored. So **`apps/server` must be
built before `apps/editor` typechecks**, or the editor fails with a type error naming whatever the
worker's contract last emitted (it surfaced as `Type '4' is not assignable to type '3'` during the
seed v4 bump). Nothing in the repository states this today; a clean checkout typechecking the editor
first will fail for a reason that looks like the editor's fault.

---

## Active items

#### REPO-07: Delete `~/dev/agents-inc-web-monorepo`

The old web repository is left on disk untouched. Nothing was moved out of it — everything was
copied, so it is still a complete working copy of the web half.

**That is the safety net, but it is also a second place the same code lives, and an easy one to edit
by mistake.** This item used to say "delete it after the merge is committed and CI has run once".

**Both of those have now happened, so here is what they said.** The merge is committed as six commits
and pushed — `main` and `origin/main` are both `d5fa4027`. CI ran on that push and **failed**, but it
failed twice on CI gaps rather than on the merge, both since fixed. It has since gone green on all
three jobs. **The job that covers the copied web code, `check-web`, passed in full from the start** — vendored-catalog check, typechecks, lint, unit suites and the
Playwright run.

So the question this item was waiting on is answered for the web half: it survived the move. Deleting
the old repository is now a judgement about how long you want the safety net, not a condition anyone
is still waiting on.

---
