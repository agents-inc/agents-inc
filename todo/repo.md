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

| ID                                                                   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Status           | Type     | Complexity |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- | ---------- |
| REPO-24 (new, 2026-08-04)                                            | Drop the `@agents-inc/cli/config` jiti alias once nobody is on the old package                                                                                                                                                                                                                                                                                                                                                                                              | Investigate      | refactor | easy       |
| REPO-37 (new, 2026-08-09)                                            | DEFERRED (owner: a refactor investigation that would throw the roadmap out for no obvious benefit now) — wire dependency-cruiser: `deps:graph` script emitting Mermaid + JSON of real module edges, rules encoding the documented boundaries, drift-check against dependency-graph.md/boundary-map.md, then ONE assessment round producing a findings-only architecture report (cycles, layering violations, fan-in hotspots) for owner rulings. Pairs with CLI-464 (knip). | Deferred         | feature  | medium     |
| REPO-07 (was monorepo-merge "Delete ~/dev/agents-inc-web-monorepo")  | Delete the old web monorepo once this repository is trusted                                                                                                                                                                                                                                                                                                                                                                                                                 | Needs Assistance | refactor | easy       |
| REPO-09 (was monorepo-merge "Decide what a local `.env` should say") | A local `.env` can ship a live site whose every request goes to your own machine                                                                                                                                                                                                                                                                                                                                                                                            | Parked           | bug      | easy       |

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

#### REPO-09: Decide what a local `.env` should say

The README tells you to copy `apps/editor/.env.example`, which points the app at
`http://localhost:8787`. That is right for development.

**But `bun run deploy` uploads whatever was built last without rebuilding**, so if you build locally
and then deploy by hand, you ship a live site whose every request goes to your own machine. This has
happened once already — a local `.env` made during the merge was deleted for exactly this reason, and
the setup step was written down instead.

CI is safe: it sets the real address explicitly.

**Options:** leave it and remember, or make the deploy script rebuild with the production value.

---

#### REPO-24: Drop the old config import alias

`config-loader.ts` tells jiti how to resolve imports **inside a user's config file**. It carries two
spellings: `agents-inc/config`, which is current, and `@agents-inc/cli/config`, which is
compatibility.

**Why the old one has to exist at all.** Anyone who hand-wrote a config following the documentation
imports from `@agents-inc/cli/config`. After the collapse they have `agents-inc` installed and
nothing under the old name in `node_modules`, so without the alias their config stops loading on
upgrade. Note this only affects hand-authored configs importing real data — `defaultStacks`,
`defaultCategories`, `defaultRules`. Everything `init` generates uses a relative type-only import and
never touches either spelling.

**Why it should not stay.** It is a live reference to a package name that will exist nowhere else in
the repository. Left indefinitely it reads as current rather than as a bridge, and the next person to
find it has to work out which.

**When to remove it.** When downloads of `@agents-inc/cli` are indistinguishable from bot traffic —
check `npm view @agents-inc/cli` against the deprecation date, or the npm downloads API. Given the
audience is a few dozen real users, that should be a short wait rather than a long one. Removing it
is deleting one key from a map; the risk is only that someone still on an old hand-written config
finds it stops loading, with an error naming the import, which is a recoverable failure rather than a
silent one.

---
