---
type: standard-gap
severity: medium
affected_files:
  - .github/workflows/regenerate-catalog.yml
  - packages/cli/package.json
  - packages/cli/.ai-docs/reference/features/code-generation.md
  - packages/cli/.ai-docs/DOCUMENTATION_MAP.md
standards_docs:
  - .ai-docs/reference/features/code-generation.md
date: 2026-08-07
reporting_agent: cli-developer
category: dry
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

REPO-30 asks for a workflow that regenerates the catalog when the skills marketplace changes. The
task named two outputs — `packages/matrix/src/vendor/generated/matrix.ts` and
`src/cli/types/generated` — which is the obvious reading, and it is one generator short.

Three generators sit downstream of the marketplace, not two:

| Generator          | Writes                           | Reads the marketplace?     |
| ------------------ | -------------------------------- | -------------------------- |
| `generate:types`   | `src/cli/types/generated/`       | yes, directly              |
| `generate:schemas` | `src/schemas/`                   | no — via `source-types.ts` |
| `generate:matrix`  | `packages/matrix/src/` (8 files) | no — via `src/cli/types/`  |

`generate:schemas` is the one that hides. `generate-json-schemas.ts` imports `src/cli/lib/schemas.ts`,
which imports `SKILL_SLUGS` and `CATEGORIES` from `src/cli/types/generated/source-types.ts`, and those
two arrays are `z.enum()` inputs copied **verbatim** into the emitted `metadata.schema.json` as the
`slug` and `category` enums. So adding one skill to the marketplace drifts `src/schemas/` just as
surely as it drifts the matrix package — but nothing in the names `generate:types` or
`generate:matrix` suggests it, and the marketplace change is not obviously "about" JSON schemas.

**The failure mode is delayed and misattributed.** A regeneration pull request that ran only the two
named generators looks complete, reviews clean, and merges. `generate:schemas:check` then runs in
`check-cli` on the _next_ push and turns `main` red — one commit after the change that caused it, in
a job whose name mentions neither schemas nor the marketplace. This is not hypothetical: the same
vocabulary-lag defect is already on record in
`2026-04-21-r73-atomicity-bible-drift.md`, where the shipped `metadata.schema.json` enums lagged
`source-types.ts` badly enough to reject legitimate slugs and categories.

**Aside, found in the same read and deliberately contradicting the table above.**
`code-generation.md` declares that it owns three counts, one of them "the number of files
`generate:matrix` emits (**9**)". It emits **8**. `emittedFiles()` is `vendoredTypeFiles()` +
`agentDefinitionsFile()`, and `VENDORED_TYPE_FILES` has seven entries — `matrix.ts`, `skills.ts`,
`agents.ts`, `config.ts`, `stacks.ts`, `generated/matrix.ts`, `generated/source-types.ts` — plus the
one `src/generated/agents.ts`. Disk agrees: five files in `packages/matrix/src/vendor/`, two in
`vendor/generated/`, one in `src/generated/`. The likely cause is named in the generator's own header
comment: it "used to emit a third file, `src/generated/stack-preloads.ts`", and the count was not
decremented when that file went. Left for the doc's owner — it needs a `last-validated` pass, not a
one-character edit, and this author was scoped to `.github/` only.

The ordering rule itself is documented well — `reference/features/code-generation.md` has a whole
"Ordering: `generate:types` must run first" section, and it is correct. **The gap is that the rule
lives only in prose.** There is no single command that encodes it, so the three-step sequence is
re-derived by hand at every call site: once in `prepublishOnly`, once across two CI jobs, once in the
doc's own reproduction instructions, and now once more in the new workflow. Each of those is a place
to get the order wrong or to leave a generator out, and only the last of the three steps has anything
checking it.

**A second, smaller thing this work invalidated.** Both `DOCUMENTATION_MAP.md` and
`code-generation.md` justify `generate:types:check`'s absence from CI with the claim that
`generate:types` "reads the sibling `skills` checkout, which the runner does not have", and
`code-generation.md` adds "do not 'complete the pair' there". As of `regenerate-catalog.yml` one
runner _does_ have that checkout — it checks the marketplace out explicitly. The guidance is still
right for `ci.yml` (whose jobs have no such checkout, and where completing the pair would still break
every run), but the reason as written is now a statement about the repository that stopped being
true, and the next reader will hit a workflow that contradicts it.

## Fix Applied

None to the underlying gap — discovery only. This finding's author owned `.github/` alone and
`packages/cli/` was being edited concurrently, so nothing under `packages/cli/` was touched.

What did land is a correct _caller_: `.github/workflows/regenerate-catalog.yml` runs all three
generators in dependency order (`types` -> `schemas` -> `matrix`), commits all three outputs
together via an explicit `add-paths` list, and carries a comment explaining why the schemas step is
present and what breaks if it is removed. That makes this one call site right; it does not stop the
next one from being wrong.

## Proposed Standard

**1. Give the pipeline one entry point.** Add a composite script to `packages/cli/package.json` beside
the three it composes:

```json
"generate": "bun run generate:types && bun run generate:schemas && bun run generate:matrix"
```

Then the order is encoded once, in the only place that can be authoritative, and every caller — the
regeneration workflow, `prepublishOnly`, the reproduction instructions in `code-generation.md`, and a
human with a stale checkout — calls the same thing. A fourth generator added later is then one edit,
not a search for every site that spelled the sequence out. Note the composite cannot replace the
`:check` variants in CI, which deliberately run different subsets for different reasons; it replaces
the _write_ path only.

**2. Say in `code-generation.md` that the marketplace has three downstream artefacts, not one.** The
"Two of the three chain" section explains `types` -> `matrix` and mentions in a following paragraph
that `generate:schemas` "also depends on `generate:types` ... but has no relationship to
`generate:matrix`". That is accurate and still reads as an aside about an unrelated generator. It
should state the consequence directly: _any_ change to the marketplace requires all three to be
regenerated and committed together, and omitting schemas is a red `main` one commit later.

**3. Reword the two `generate:types:check` justifications** in `DOCUMENTATION_MAP.md` and
`code-generation.md` so they turn on the right fact. The reason to keep it out of `ci.yml` is that
`ci.yml`'s jobs check out only this repository — not that no runner anywhere can have the
marketplace, which `regenerate-catalog.yml` now disproves. Both should name that workflow as the one
place `generate:types` can run in CI, so a reader who finds it does not conclude the docs are stale
in some way they cannot see the edge of.
