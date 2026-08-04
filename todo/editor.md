# Editor — build tracker

Outstanding work on `apps/editor`, the configurator. Its sibling trackers: the site is
[`www.md`](./www.md), the API worker is [`server.md`](./server.md), the CLI is [`cli.md`](./cli.md),
and everything about deployment, naming and publishing the repository itself is
[`repo.md`](./repo.md).

**An item is deleted when it lands rather than ticked off**, so everything below is still open.
There is no done column and nothing is struck through. Landed items get one line each in
[`archive.md`](./archive.md).

**Rows are one-liners.** Detail lives below the table under the item's ID. Each ID permanently
carries the identifier the item had before this folder existed, because several of them are cited by
number in prose and in source comments and those citations have to stay traceable.

| ID                                             | Task                                                                                        | Status           | Type     | Complexity |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------- | -------- | ---------- |
| EDITOR-01 (was editor-todo item 1)             | No component tests — unit and E2E both exist, the gap between them is a component alone     | Investigate      | refactor | complex    |
| EDITOR-02 (was editor-todo item 2)             | Bundle is one 1.07 MB chunk plus a 228 KB second; nothing is code-split                     | Ready for Dev    | refactor | complex    |
| EDITOR-03 (was editor-todo item 4)             | Added skills are session-only; persisting them means real catalog entries                   | Investigate      | feature  | complex    |
| EDITOR-04 (was editor-todo item 12)            | Install dialog advertises `npx agents-inc edit --ui`, a flag that does not exist            | Ready for Dev    | bug      | easy       |
| EDITOR-05 (was editor-todo item 6)             | Skill descriptions describe the skill, not the library — fix is upstream in the CLI         | Ready for Dev    | bug      | complex    |
| EDITOR-06 (was editor-todo item 7)             | 123 of 222 skills state no relationships at all — fix is upstream in the CLI                | Investigate      | feature  | complex    |
| EDITOR-07 (was editor-todo "Not designed yet") | Five surfaces have never been designed — confirm dialog, Share, Settings, states, dark mode | Needs Assistance | feature  | complex    |

---

## Active items

#### EDITOR-01: No component tests

Unit and E2E both exist; the gap between them is a single component rendered in isolation.

**Low priority, and the reason is honest:** the primitives are presentational and the browser covers
them in composition. Verified 2026-08-04 — seven test files live under `apps/editor/src`
(`added-skills-store`, `persisted-schema`, `saved-stack-store`, `github-skills`,
`default-assignments`, `derive`, `seed`) and not one of them is a `.test.tsx`. The E2E side is 17
spec files.

What is not settled is which components would be worth rendering alone, which is why this is
`Investigate` rather than ready work.

---

#### EDITOR-02: The bundle is one 1.07 MB chunk

Plus a 228 KB second one, dominated by the catalog. This is first paint on a cold cache.

Nothing is code-split: `apps/editor/vite.config.ts` sets no `manualChunks`. Confirmed 2026-08-04 —
the file has no `manualChunks` and no `base`.

This item used to be listed twice in the old tracker, once here and once under "Phase 7" as
"code-split the bundle". It is one piece of work.

---

#### EDITOR-03: Added skills are session-only

By explicit instruction — this is the current behaviour on purpose, not an oversight.

Persisting them means giving them real catalog entries, which is a marketplace concern rather than
an editor one. That dependency is why the scope is open.

---

#### EDITOR-04: The install dialog advertises a flag that does not exist

`apps/editor/src/features/configure/components/install-dialog.tsx:295` tells users to run
`npx agents-inc edit --ui`. Verified still present at that exact line on 2026-08-04.

**That flag does not exist.** `edit` has only `--refresh`, `--source` and one hidden internal flag.

Worth fixing at the source rather than documenting around it, which is what the site currently does
with a caution box — so the caution box comes out with the fix.

**Two different pieces of work share this line, and only one of them is here.** Taking the line out
is this item. _Building_ the `edit --ui` round trip — seeding the web UI from an existing project —
is a CLI-side item and lives in [`cli.md`](./cli.md).

---

#### EDITOR-05: Skill descriptions describe the skill, not the library

The design wants roughly 25 characters about the library — "JavaScript UI library" — and the data
gives a description of the skill instead.

**The fix is upstream, in the CLI's catalogue.** The editor only consumes this data; it is recorded
here because this is the surface where the gap is visible. The audit runs against
`packages/matrix/src/vendor/generated/matrix.ts`, and authoring the answer is an edit in
`packages/cli` — the same repository, so nothing here waits on anything.

---

#### EDITOR-06: Half the catalogue states no relationships at all

**The invariant worth holding:** a skill either states its own `conflictsWith`, or reaches one that
does by following `requires`. Today, of 222 skills — 80 carry their own conflicts, 19 trace to one,
and **123 do neither**, which makes them invisible to the incompatibility rule.

Most of those 123 are legitimately unconstrained: Zod, Tailwind and GitHub Actions really do work
with anything. The problem is that **the data cannot tell "genuinely universal" from "nobody has
audited this yet"** — both read as two empty arrays. So the ask is not to author 123 conflict lists;
it is to make that distinction explicit, so that an empty pair means _audited and universal_.

Worth starting with `web` (26 of the 123) and `mobile` (22): a framework-bound skill that forgot to
declare `requires` is invisible to `selectReachability` in `derive.ts` — the rule that reads
`requires` to decide what a selection puts out of reach — so it stays clickable beside a framework it
cannot run on and nothing anywhere says so.

Seven of the orphans also sit in **exclusive** categories (PlanetScale, Turso, Gel (EdgeDB),
SurrealDB, Email Setup, pnpm Workspaces, Server-Sent Events). Those are not bugs — the pick-one swap
already covers a category's own members — but they are a useful check that the category, rather than
the conflict list, is what is doing that work.

**The fix is upstream, in the CLI's catalogue.** The audit runs against
`packages/matrix/src/vendor/generated/matrix.ts`; authoring the answer is an edit in `packages/cli`.

**Cited elsewhere by its old number.** The CLI tracker's deeper-incompatibility-rules item points at
this as "`docs/web/editor-todo.md` §7" under its "Coverage (data)" heading. That citation resolves to
EDITOR-06 — which is why the old identifier stays in the row.

---

#### EDITOR-07: Five surfaces have never been designed

Kept as one grouped item because they share a single missing input — a design — rather than a
single piece of work:

- Confirm dialog visuals. Built in the dialog language, never mocked.
- The Share page and the Settings page.
- Empty, loading and error states.
- Responsive below 1324px.
- Dark mode.

**On dark mode specifically:** `packages/ui` declares a dark variant but ships no dark colours for
it. That is the same gap that forced the documentation site to drop its theme toggle
([`www.md`](./www.md) WWW-01), so designing this once settles both.
