---
last_validated: 2026-08-24
---

# CLI-822 / CLI-823 — required categories removed, Mixed-mode skill count fixed

Programme progress file. Its job is the half of the briefing contract the orchestrator owns:
**one line per dispatch recording what the brief got wrong**, because a correction read once and
discarded measures nothing — the error rate is a fact about a programme, and nothing turns a
per-dispatch answer into one unless it is written down as each lane lands.

## Origin

Both items came from one owner report on 2026-08-24, made against the published `0.159.0` binary
rather than a working tree.

- **CLI-822** — `No skills selected in Styling (required category)` on pressing enter through the
  web domain, after editing an existing install and toggling off an already-selected skill.
  Owner: _"it's very strange to force someone to add certain skills. Maybe we just shouldn't have
  required categories."_ **Ruling: remove the concept entirely.** This reverses the deliberate
  "warn and allow" decision recorded at `todo/archive.md` under `2026-08-21 — CLI-367`, which
  chose advisory-not-blocking on the reasoning that blocking would make the mildest constraint the
  only fatal one. The reversal goes further than that decision's own framing: the objection is to
  the concept, not to its severity.
- **CLI-823** — `list` printing `Mode: Mixed` directly above `Skills: 2` on an installation whose
  config declares 11. **Ruling: the number counts only what the CLI manages** — the config's
  `skills` array minus `excluded: true` tombstones. `context7-mcp`, present in `~/.claude/skills/`
  but absent from the config, is not counted.

## What the orchestrator verified before dispatching

Stated as commands rather than results, because every figure below was measured against a tree that
has since moved:

```
grep -rn '\.required\b' packages/cli/src --include='*.ts' --include='*.tsx' | grep -v 'requiredBy\|unmetRequired'
grep -rn '\.required\b' apps/editor/src --include='*.ts' --include='*.tsx' | grep -v 'requiredBy\|unmetRequired'
grep -rn 'required' packages/matrix/src/matrix-schema.ts packages/matrix/src/read-model/catalog.ts
grep -n -A4 'vendored catalog' .github/workflows/ci.yml
```

Two findings shaped the briefs:

1. **The advisory does not block.** `handleContinue` in `components/wizard/step-build.tsx` calls
   `onContinue()` unconditionally, and a test pins _"names the empty required category and
   continues anyway"_. The owner's report reads as a refusal because the message reads as one — the
   wizard did advance. The genuine refusal (`ONLY_SKILL_IN_CATEGORY`, in `toggleTechnology`) is
   gated on `exclusive && required` and `web-styling` is `exclusive: false`, so it was not what
   fired.
2. **`required` is a cross-workspace data-format field, not CLI-local** — non-optional in
   `packages/cli/src/cli/lib/schemas.ts` and in four `packages/matrix` modules plus the generated
   vendored catalog that CI gates through `generate:matrix:check`. **The editor reads none of it**,
   so removal changes no editor behaviour. The orchestrator's first scope estimate to the owner
   named five files and was wrong; it was corrected before any agent was dispatched.

## Lane ownership

| Lane | Subject                  | Owns                                                                                                                                                       |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | CLI-822 required removal | wizard test files, `schemas.test.ts`, `default-categories*`, `painted-toasts.test.ts`, `scope-change-deselect-integrity.e2e.test.ts`, `packages/matrix/**` |
| B    | CLI-823 skill count      | `plugin-info.*`, `init.test.tsx`, `lib/__tests__/commands/init.test.ts`, `list.e2e.test.ts`                                                                |

Disjoint by construction. Sub-agents do not edit `todo/`; the orchestrator does, as each lane lands.

## Dispatch log

One line per dispatch. **Corrections is a required field of every report** — "nothing" written out
when nothing in the brief proved false, because a silent report is indistinguishable from a brief
that held.

| #   | Lane | Agent                                            | Corrections reported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ---- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A    | cli-tester (failing tests)                       | **Five.** (1) `painted-toasts.test.ts` does NOT redden on a toast removal — every input it scans is a synthetic source string declared inside itself; the file that scans the real tree is `lib/__tests__/toast-assertion-surface.test.ts`, which the plan assigned to neither lane, and it reddens on the `validateBuildStep` deletion rather than on the toast. (2) The brief's `required` census was short by two live sites: `packages/matrix/src/read-model/catalog.ts` (declared and written, **read nowhere in the monorepo** — a delete, not a widen) and `types/matrix.ts` plus its byte-for-byte vendored copy. (3) `packages/matrix/src/built-in-matrix.ts` is a Zod schema module, not the catalogue; the DATA is two GENERATED files. (4) The refusal-pairing hazard resolved opposite to the brief's guess — the refusal test was CONVERTED to a permission rather than deleted, because emptying an exclusive category is the harder of the two deselect shapes and deleting it would leave the file's invariant pinned only over the easy one. (5) Self-reported: ran one read-only git command (`git log -1 --format=%cd`) before internalising that this brief bans read-only git too; no writing git command was run. |
| 2   | B    | cli-tester (failing tests)                       | **Six.** (1) "Both surfaces" is THREE, and one is already right — `List.run`'s interactive branch in `commands/list.tsx` already filters `config.skills` on `!excluded`, eleven lines above the piped branch that contradicts it, so the command shipped the ruling and its negation with nothing comparing them (finding filed). (2) The ruling under-specifies dual-scope: one skill at two scopes is two config entries; pinned as DISTINCT non-excluded ids, matching the existing `countDistinctSkillIds` docblock and two live specs — owner confirmation recorded below. (3) Scope becomes inert for skills under this ruling but stays load-bearing for agents; agent-side pins left untouched. (4) Two files the brief named as owned needed no change (`init.test.tsx`, `branding-name-reaches-dashboard.e2e.test.ts`). (5) A NEW e2e spec is blocked by `spec-gates.test.ts`, which requires a row in `standards/e2e/user-journeys.md` — folded the tests into the already-rostered `e2e/commands/list.e2e.test.ts` instead. (6) One existing assertion was mechanism-bound (`discoverAllPluginSkills.mock.calls`) and would have broken on the fix rather than on a regression; replaced with the behavioural claim.         |
| 3   | B    | cli-developer (implementation)                   | **Nothing.** Every claim in the brief described the tree. Notably `commands/init.tsx` and `commands/list.tsx` both turned out to need NO change — `getDashboardData` already reads `info.skillCount`, and `list.tsx`'s interactive branch was already correct — so the whole fix is one function in `plugin-info.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | A    | cli-developer (implementation)                   | **Two.** (1) The owned-file list was short by two PRODUCT files — `lib/loading/source-loader.ts` and `lib/matrix/skill-resolution.ts` both WRITE `required: false` into a `CategoryDefinition`, which a `\.required\b` grep cannot see because they write the key rather than read it; leaving them breaks `tsc`. (2) The hand-run instruction named the wrong header: `web-styling` is required AND non-exclusive, so it painted `Styling *` with no counter — a star with no counter is the shape the removal actually deletes, where `Framework` carried both. Also flagged a genuine conflict in its own brief: it forbade editing `.ai-docs/` while separately requiring a finding be written there, and `check-findings-frontmatter.test.ts` fails a finding with no INDEX row, so writing one without the row is not a reachable state. It appended the row and surfaced it rather than deciding it.                                                                                                                                                                                                                                                                                                                              |
| 5   | —    | cli-tester (citation population ruling)          | **Nothing.** The premise held on the broadest reading — `grep -rn 'agent-findings' packages/cli/e2e` returns nothing at all, not merely nothing under the extension filter. It also checked an unbriefed hazard before editing: `scripts/check-symbol-citations.ts` walks `JSDocLink` nodes, so it wrote the deleted symbol in backticks rather than as `{@link}`, per the house style that prose explains what was removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 6   | —    | codex-keeper (documentation debt)                | **Four.** (1) **The brief gave the drift gate's path as `src/cli/lib/__tests__/check-enumeration-drift.test.ts`; it is `scripts/check-enumeration-drift.test.ts`** — and this is the dangerous grade of wrong, because `npx vitest run <missing-path> <real-path>` exits 0 on the real path and says NOTHING about the missing one, so the brief's own verification command reports the gate green while never running it. (2) Item 4 instructed a body edit that `TEMPLATE.md` forbids — a finding's body is dated evidence and stays as written; frontmatter only. (3) The document list was short by seven sites across six documents, including a `CategoryRow` CODE BLOCK still declaring `required: boolean`. (4) The brief's `grep -rnc 'required'` over two named documents returns `0:0` — both were already clean, so that command could never have found the sites the brief correctly named elsewhere.                                                                                                                                                                                                                                                                                                                       |
| 7   | —    | cli-developer (paired ordinal in the drift gate) | **Nothing.** Derived the ordinal from source rather than decrementing (`TOAST_MESSAGES` has three members, so "fifth guard" became "fourth"), and proved the anchor still resolves by running the REAL registry through `check()` rather than trusting the suite's synthetic ones. Surfaced three further copies of the same stale claim in files outside its lane and reported rather than edited them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 8   | —    | codex-keeper (stale pointer sentences)           | **Two.** (1) "Three more copies" understated it — **five** remain, in two files the brief called handled or did not name. (2) `features/skills-and-matrix.md` was named as the corrected authority; its COUNTS are right but two other claims in it are stale, so it is the right authority and not clean. Also declined to normalise a pointer disagreement, correctly: the row redirects three topics and only one belongs to the document the brief would have repointed it at — and the real defect is upstream, a second writable copy of a registry-owned count in `features/configuration.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 9   | —    | cli-developer (marketplace scaffold)             | **Two, both about the brief's VERIFY block rather than its claims.** (1) `npx vitest run` cannot be run as written — it aborts before collecting anything on the dist-staleness guard, so a reader following the block literally gets a zero-test abort, which is precisely the failure the "report the test count" instruction exists to catch. `bun run build` must come first, as `CLAUDE.md` says. (2) `dist/` was ALREADY stale before this dispatch, so the rebuild it was forced into picked up other lanes' unbuilt work — `tsc` was clean, but a lane relying on a particular `dist/` state should know it moved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 10  | —    | codex-keeper (remaining doc claims)              | **Two.** (1) The site list was incomplete — two further LIVE claims of the same class sat outside it, in `concepts/guard-pattern.md` (a store-guard flow diagram carrying an arm `Only skill in required exclusive category? -> toast, return early`, for a guard and a toast that both no longer exist) and `standards/e2e/page-objects.md`. The brief's own success criterion could not have been met while they stood. (2) Fixing the arity in `clean-code-standards.md` created a cross-document contradiction the brief did not anticipate: `typescript-types-bible.md` states the same event as **three** defaults kept behind disables. It deleted the number rather than rewriting it, and flagged the edit as driven by neither the brief nor the census — offered for reversion rather than taken silently.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 11  | —    | cli-tester (test-layer residue)                  | **Five.** The load-bearing one: **the brief's "these two sites are deliberate, do not touch" was PARTLY FALSE.** `schemas.test.ts`'s deliberate contribution is a DIFFERENT spec — one declaring no `required` key and asserting its absence after parsing; the two keys the brief protected sit in key-namespace specs that end at `expect(result.success).toBe(true)` and never read the flag. It left them because it was told to, and reported the contradiction with evidence rather than acting. Also: `mock-source-files.ts` IS genuinely deliberate (verified against both consumers) but the coupling is undocumented at the fixture; `marketplace-scaffold.ts` moved under it mid-run; one product site (`config-gate/propagate.ts`) still named the flag; and it widened the census past both given commands, surfacing five sites neither would have shown.                                                                                                                                                                                                                                                                                                                                                                  |
| 12  | —    | cli-developer (product docblock)                 | **Nothing.** Census of all product code read in full (50 lines): no other product-code site names the retired flag. Confirmed the class distinction `dropOrphanedDerivedMasks` actually uses is exclusive-vs-non-exclusive via `isExclusiveCategory` — a different axis from the retired flag — so one clause was the whole repair.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 13  | —    | cli-tester (stale E2E assertions)                | **Six, one of them its own.** The sharpest: **the brief's census command could not find the brief's own headline hit** — `grep -rn 'Framework \*'` is BRE, where `\*` is a LITERAL asterisk, so it matched `Framework *` but not the failing source text `/Framework \*/`; `grep -F` was needed. Also: the "two files failed, one test failed" discrepancy does NOT reproduce (diagnosed instead — a 4-test suite whose `beforeAll` threw, verified by probing Vitest directly with a throwing hook and reproducing the exact `Failed Suites` signature); the brief's steer toward DELETING the triage file does not hold; the starting-point list was three sites short; one census hit was a false positive naming the live `requiredBy` feature. **Its own correction:** it first REWROTE two docblock justifications with an inferred mechanism, then verified the inference and found it false, and reverted to deleting the claim — the inference-wearing-an-observation's-clothes failure the contract warns about, caught only by checking.                                                                                                                                                                                      |
| 14  | —    | cli-tester (final test residue + finding)        | **Three.** The brief undercounted the sibling specs — three, not two — which moved the coverage answer in the brief's favour rather than against it. It also declined to claim what it could not see: the historical artefact the finding describes was gone before it arrived and git is forbidden to it, so the finding rests on its own re-derivation of the mechanism rather than on an artefact it never observed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Rulings taken during the programme

- **2026-08-24 — dual-scope skills count once.** Lane B's tests surfaced that "the config's `skills`
  array excluding tombstones" is ambiguous where one skill is installed at both global and project
  scope: that is two entries and one skill. **Counted as distinct non-excluded ids.** This preserves
  a documented invariant rather than introducing one — `countDistinctSkillIds` in `plugin-info.ts`
  carries the docblock _"A skill enabled under both roots is one skill"_, and two shipped specs pin
  it. It does not change the number in the originating report, where every entry is a distinct id at
  one scope.

## Cross-lane obligations outstanding

- **Lane A owes a journey row.** Its new spec `interactive/init-wizard-category-header` reddens
  `src/cli/lib/__tests__/spec-gates.test.ts` until it has a row in
  `packages/cli/.ai-docs/standards/e2e/user-journeys.md`. It must NOT be added to
  `SPECS_BELONGING_TO_NO_JOURNEY` — that list may only shrink. Raised by Lane B, which hit the same
  gate and folded its own spec into an already-rostered file.
- **Lane A owes nothing further on the journey row** — it is the SAME row Lane B hit. Journey **41**
  in `standards/e2e/user-journeys.md` has the required-category advisory as its subject and is a
  `TO TEST` row for a behaviour now being deleted, so one edit both retires the stale claim and
  gives `interactive/init-wizard-category-header` its From-scratch cell. Routed to `codex-keeper`
  rather than to an implementer, per CLAUDE.md.

## Regeneration is a CI gate, not a nicety

`required` on a category is GENERATED data. `packages/cli/scripts/generate-source-types.ts` builds
the matrix from `defaultCategories`, so removing the field means running `bun run generate` in
`packages/cli`, which rewrites `src/cli/types/generated/matrix.ts` and vendors it to
`packages/matrix/src/vendor/{matrix.ts,generated/matrix.ts}`. **`generate:matrix:check` is a CI gate**
(`ci.yml`, `check-web`, "The vendored catalog must match what is committed"), so skipping it fails CI
with every test green. `generate:types:check` is deliberately NOT in `ci.yml` — it needs the
marketplace checkout — so it will not catch a missed regeneration. `bun run generate` reads the
skills marketplace, so the marketplace repository has to be checked out locally.

## Documentation debt this programme creates

To be handed to `codex-keeper` once both lanes land, not before:

- `standards/e2e/user-journeys.md` — journey 41 rewritten (above).
- `standards/e2e/README.md` — the `Selection validation` group row becomes `VALIDATION_REQUIRES`
  alone once `ONLY_SKILL_IN_CATEGORY` leaves `STEP_TEXT`.
- `reference/testing/e2e-infrastructure.md` — the `**187 members, exhaustive as listed:**` line: the
  member AND the count. `check-enumeration-drift` reds on both documents until they are updated.

## Landed

- **CLI-823 — green 2026-08-24.** `countInstalledSkills`, `countPluginSkills`, `countDistinctSkillIds`
  and `sumOverScopes` are replaced by one private `countManagedSkills(loaded)`: non-excluded
  `config.skills` deduplicated by id, with install mode no longer consulted. Only
  `lib/plugins/plugin-info.ts` changed. Suites: `plugin-info.test.ts` 26 passed,
  `lib/__tests__/commands/init.test.ts` 15 passed, `e2e/commands/list.e2e.test.ts` 14 passed +2
  expected-fail. Hand-run on a temp fixture (3 marketplace + 1 eject + 1 tombstone declared, plus an
  undeclared `context7-mcp/` on disk): both `list` and the `init` dashboard report **4**, and a
  dual-scope fixture reports **3**, proving the dedup ruling. The real `~/.claude-src` and
  `~/.claude` were not touched.

## Watch items before this programme is finished

- **`e2e/interactive/real-marketplace.e2e.test.ts` fails in `beforeAll`** at
  `assertWizardScreenIsWhollyVisible` during the init wizard's domain walk, skipping all 9 tests.
  Observed while Lane A was mid-flight and attributed to the category-grid change it is making. **It
  must be re-run and green before CLI-822 is called landed** — it is the one `list`-invoking e2e spec
  Lane B could not clear, and a header-width regression is exactly what it would catch.
- **The Lane B finding is now stale on its own face.**
  `.ai-docs/agent-findings/2026-08-24-one-command-answered-the-same-count-two-ways-and-only-the-piped-half-was-wrong.md`
  carries `status: open` and "Fix Applied: None — failing tests only. A later agent implements." The
  fix has since landed. Hand to `codex-keeper` with the rest of the documentation debt.

- **CLI-822 — green 2026-08-24.** `validateBuildStep`, `BuildStepValidation`,
  `TOAST_MESSAGES.ONLY_SKILL_IN_CATEGORY`, `STEP_TEXT.ONLY_SKILL_IN_CATEGORY`, `SYMBOL_REQUIRED` and
  the `required` field on `CategoryDefinition` / `CategoryRow` / `CatalogCategory` and its three Zod
  schemas are gone; `bun run generate` rewrote both generated catalogues and
  `generate:matrix:check` is green. Orchestrator verified independently: `tsc --noEmit` exit 0 in
  both packages, `grep -c -w required` is 0 in both generated catalogues, and all four deleted
  symbols return no hits across `src` and `e2e`. Hand-run in a PTY under a temp HOME: `Framework
(0 of 1)` and a bare `Styling` with no star anywhere in the frame, and ENTER on a wholly empty Web
  domain emitted no toast and advanced to API — the toast check searched the raw PTY stream as well
  as the screen buffer, so an in-place-rewritten row could not hide.

## Owner decisions taken

- **2026-08-24 — `SCOPE_POPULATIONS[SPECS]` moves to `"cites none today"`.** Removing
  `STEP_TEXT.ONLY_SKILL_IN_CATEGORY` took the comment above it, which was the last finding citation
  anywhere in `packages/cli/e2e`. The value follows the citation: the citation was attached to a
  product behaviour that no longer exists, so its removal is correct. **Manufacturing a replacement
  citation to preserve the old value was considered and rejected** — it would leave that assertion
  pinning prose written to satisfy it. The constant's docblock, which had gone stale in two places
  (it claimed the value was "now spent" and closed on a conditional that has since come true), was
  updated to record the move and to generalise the standing rule: moving it EITHER way is worth a
  second look rather than a silent edit. Applied; gate green at 25 passed.

## The lesson this programme actually bought

**A verification command in a brief is a claim like any other, and a wrong path is the one kind that
fails silently.** Dispatch 6 was handed
`npx vitest run src/cli/lib/__tests__/check-enumeration-drift.test.ts` for a file that lives under
`scripts/`. Vitest exits 0 when a named path matches nothing as long as another named path runs, so
the command printed a pass for a gate it never executed — and anyone re-running that line to CHECK
the work would have been confirming nothing, twice over.

Rule 2 of the briefing contract already says a brief carries the command rather than its result. This
is the case it does not cover: **the command itself must be shown to run.** Where a brief names a test
path, the report says how many tests that file executed, because a non-zero count is the only thing
separating "green" from "never ran". Both later dispatches in this programme were briefed with the
correct path and with that instruction.

## A second lesson, same shape as the first

Dispatch 9 could not run its own verification block: a bare `npx vitest run` aborts on the
dist-staleness guard rather than running zero tests quietly. That is the _benign_ version of dispatch
6's failure — it fails loudly instead of reporting green. Both point the same way: **a brief's verify
block is a claim that must itself be executable**, and the report proves it ran by carrying a test
count. Every brief in this programme after dispatch 6 carried that instruction, and it has now caught
two distinct defects in my own briefs.

## Product residue found late, and why it matters

`skillCategoriesModule()` in `lib/marketplace-scaffold.ts` was still emitting `required: false` into
the `skill-categories.ts` scaffolded for a **new marketplace author** — type-checking and parsing
cleanly, because Zod strips unknown keys, so no gate anywhere could see it. Found not by a test but
by a documentation agent re-deriving a count. **The removal was reported complete twice before this
surfaced**, which is the argument for the census being a required report field rather than a
courtesy. Fixed and hand-run end to end: `new marketplace` → `build plugins` → `build marketplace`,
the last of which attributes the scaffolded category correctly with the field gone.

## Documentation: closed, with a counted census

Four independent census passes over `.ai-docs/**/*.md` after the final pass, union **22 distinct hits
outside `agent-findings/`**, every one classified: 7 deliberate history-of-removal passages, 1
explicitly-retired claim record, 14 unrelated senses of the word (oclif args, agent-YAML JSON-schema
`required` lists, skill-metadata required fields, plain English). **Live claims that a category
`required` flag exists: zero.**

**Accepted on the orchestrator's authority:** deleting the arity from `typescript-types-bible.md`
rather than changing three to two. It follows the 2026-08-19 ruling that deleting a claim beats
rewriting it, and the sentence's subject is the mechanism rather than the number — which is exactly
the kind of count that goes stale unnoticed.

**Left alone deliberately, pre-existing and out of a fixes-only scope:** two finer-grained
duplications of the registry-owned category count inside `features/configuration.md` — the per-domain
table's `Categories` column, and the "38 added definitions … 11 of them are exclusive" sentence. Both
are accurate today and neither was caused by this programme. They are a worklist, not a verdict.

## The correction pattern this programme actually measured

Twelve dispatches in, the shape is consistent enough to be worth stating: **my briefs have been
reliable about facts and unreliable about two things — verification commands, and protective
instructions.**

- Verify blocks: three defects (a path that reported a gate green without running it; a bare
  `vitest run` that aborts on the dist guard; both now carry a test-count requirement).
- **"Leave this alone, it is deliberate" was wrong twice** — dispatch 11's `schemas.test.ts` pair,
  and dispatch 8's "already corrected" authority document. A protective instruction is a claim like
  any other and must be re-derived, but it is the one kind an obedient agent will not test unless
  told to. Every brief here asked for corrections as a required field, and that is the only reason
  both surfaced.

Nothing in this programme was caught by review. Everything was caught by an agent re-deriving its
own brief.

## The defect the E2E lane found that no gate could

The red assertion (`toMatch(/Framework \*/)`) was the cheap half. The expensive half was in the
page-object layer: `getExclusiveCategorySelectedCount` in `e2e/pages/steps/build-step.ts` carried
`\s*\*?\s*` in its own regex — **an optional match for the deleted marker.** An optional match for
something that can never appear is green forever, invisible to `tsc` and to every test run. The
docblock two lines above it was the same defect in prose, and only the prose one had been flagged.

**The general class, now filed as a finding:** when a product removal deletes a rendered token, census
the page-object layer for `?`-quantified and `not.toContain` accommodations of that token, not only
for hard matches. Recorded, not implemented — "guards are not features".

## Suite state at the end of the programme

Re-run by the orchestrator on 2026-08-25 after the last dispatch landed, rather than assembled from
agent reports:

| Gate                                                 | Result                                          |
| ---------------------------------------------------- | ----------------------------------------------- |
| `tsc --noEmit`, `packages/cli` and `packages/matrix` | exit 0                                          |
| `eslint .`                                           | exit 0                                          |
| `bun run generate:matrix:check`                      | ✓ matches what the generator emits              |
| Unit, `packages/cli`                                 | 214 files / 7248 tests passed                   |
| Unit, `packages/matrix`                              | 11 files / 330 tests passed                     |
| E2E                                                  | 255 files / 953 passed, 9 expected-fail, 3 todo |

**`todo/ROADMAP.md` was deliberately NOT updated.** The rule is that it changes when a phase moves;
no phase moved. CLI-822 and CLI-823 were filed and landed inside one day and never appeared there, so
adding them now would be recording completed work in a file that orders outstanding work. Stating the
reason because a silently-unchanged roadmap is indistinguishable from a forgotten one, and this
repository has been bitten by exactly that.

## Deferred, with reasons — not silently dropped

- **`e2e/interactive/edit-wizard-unique-skill-guard.e2e.test.ts` still names a guard that no longer
  exists.** Triaged rather than deleted, and the evidence changed the verdict: its two surviving
  tests are the only PROJECT-scope coverage of "one of two selected skills removed, the other
  survives" and "an exclusive category emptied to zero" — the nearest siblings cover the same
  operations at GLOBAL scope, and the project-scope sibling seeds one skill only, so it covers
  neither. **Recommendation: keep the file, rename it** (`edit-wizard-skill-deselection`). Not done:
  a rename must move with its row on `standards/e2e/user-journeys.md`, which `spec-gates` enforces.
- **`e2e/interactive/init-wizard-scratch.e2e.test.ts` carries a comment claiming a Framework skill
  must be selected before advancing.** False — `init-wizard-stack.e2e.test.ts` advances to the API
  domain asserting `(0 of 1)`. **But it was equally false BEFORE CLI-822**, so it is pre-existing
  inaccuracy rather than disagreement with this change, and fixing it here would be inventing work to
  justify a row. Worth its own tracker row.
- **A proposed CLAUDE.md rule** — a spec whose name claims validation must exercise the validator —
  filed as a finding, not promoted. Owner's call.
