# The 2026-08-30 documentation recertification

**This file is the progress record, not the specification.** Its job is the one CLAUDE.md names: a
correction read once and discarded measures nothing, so every dispatch gets a line here as it lands.

Running as a 5-iteration loop. Iteration 1 established the census below and dispatched three lanes.

## What prompted it

Sixteen commits landed on 2026-08-30 — the `packages/compile` extraction, `packages/api`, the
one-mock migration, the UI token split, the server's accounts, and the site's rebuild — and
`.ai-docs` was updated in the same round by `371b46d6`. The question is whether that update was
whole or partial, and the answer has to be measured rather than assumed.

## The census — iteration 1, re-derivable

Commands, not results. Re-run these rather than trusting the figures they produced.

```bash
# doc surface, excluding findings
find packages/cli/.ai-docs -name '*.md' -not -path '*/agent-findings/*' | wc -l

# last_validated against last edit, per doc
for f in $(find packages/cli/.ai-docs/reference packages/cli/.ai-docs/standards -name '*.md'); do
  echo "$(git log -1 --format=%ad --date=short -- "$f") $(grep -m1 '^last_validated:' "$f")"
done

# overdue against the bible's threshold table (7 / 14 / 30 days, standards quarterly)
```

### The finding iteration 1 nearly got wrong, recorded because it is the useful half

The first cut of this census read "64 of 69 documents have `last_validated` older than their own
last edit" as a defect. **It is not one.** `standards/documentation-bible.md` rule 2 is explicit:
a pass that checked part of a document does not move the date — "correct what you found, leave the
date. Moving it would report the sections nobody opened as freshly checked." So edit-newer-than-
validated is the standard working exactly as designed, and a census built on that comparison
measures nothing. **The actionable rule is the threshold table, not the comparison.** Checking the
standard before filing against it is what turned a false finding into a real worklist.

### What is genuinely overdue — 34 documents

| Class                                                | Threshold | Overdue |
| ---------------------------------------------------- | --------- | ------- |
| `standards/`                                         | quarterly | 6       |
| Low-churn (architecture, packaging, monorepo, graph) | 30 days   | 5       |
| Reference generally                                  | 14 days   | 21      |
| `store-map.md` (both paths)                          | 7 days    | 2       |

The six `standards/` documents are all stamped `2026-04-21` — 131 days, and
`commit-protocol.md` is among them, which is the one every release round reads.

**The overdue set and the blast radius of the 2026-08-30 commits are nearly the same set**, which is
why the lanes below are cut by subject rather than by date.

## Lanes — file ownership is exclusive

| Lane | Subject                                          | Owns                                                                                                                                                                                                         |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A    | the `packages/compile` extraction's blast radius | `reference/config/config-writer.md`, `features/compilation-pipeline.md`, `features/configuration.md`, `features/code-generation.md`, `features/agent-system.md`, `leaf-exports.md`, `build-and-packaging.md` |
| B    | architecture, layout and the map                 | `reference/architecture-overview.md`, `boundary-map.md`, `dependency-graph.md`, `monorepo-layout.md`, the three `reference/architecture/*` pointers, `DOCUMENTATION_MAP.md`                                  |
| C    | testing and the one-mock migration               | `reference/testing/*.md`, `standards/e2e/*.md`                                                                                                                                                               |

## Dispatch log

One line per lane as it lands, including what its brief got wrong. A silent report is
indistinguishable from a brief that held.

- **Iteration 1** — census taken, three lanes dispatched. Corrections so far: one, and it was the
  orchestrator's own (the `last_validated` misreading above).

### Iteration 1 — the orchestrator's own lane (files no sub-agent owns)

**`CLAUDE.md` (root) — two stale cells, both verified before editing.** `packages/api-mocks` read
"run by both editor suites"; `grep -rl '@workspace/api-mocks' apps packages` returns `apps/editor`,
`apps/server` and `packages/cli`, so it is now every suite that mocks the worker. `packages/ui` read
"shared by the web app"; `apps/www/astro.config.ts` imports `inkRampSyntaxTheme` from
`@workspace/ui/lib/syntax-theme` and the manifest declares the dependency, so the site builds on it
too. The table's other claims were checked and hold — `packages/cli` is still the only workspace with
a non-private manifest, and `prettier.config.mjs` is still 100 columns, `semi: true`,
`singleQuote: false`.

**`standards/commit-protocol.md` — three corrections, one claim upheld.**

- Upheld: the README-vs-`AGENT_NAMES` roster check. Ran the document's own `comm -3` command; empty
  in both directions at eighteen names each. That claim is a year-old-style count and it is correct.
- Upheld and worth recording because another document contradicts it: the generator checks are NOT
  `git diff --exit-code`. Every `git diff` string under `scripts/` is a comment explaining what the
  checks deliberately are not; the `--check` path calls `check()` and compares emitted bytes against
  disk. The doc's prescription is accurate and the contradicting source was wrong.
- Corrected: the doc named three generators of that shape. There are **four** — `generate:compile:check`
  arrived 2026-08-30 with the same runner shape.
- Corrected: the doc implied `prepublishOnly` covers them. It carries **two of four**; neither
  `generate:matrix:check` nor `generate:compile:check` is in it, so a stale vendored matrix or agent
  corpus is caught by CI and the pre-commit hook but not by the publish.
- Corrected: an empty code span — the checklist literally read "every task ID shipped in the release
  (e.g. ``)". And the parity grep was written for `D-` alone, while `CLI-`, `EDITOR-`, `SERVER-`,
  `REPO-`, `WWW-` and `SKILLS-` all exist now, so it reported parity over an empty set.
- **`last_validated` deliberately NOT moved.** This was a partial pass — the Conventional Commits and
  CHANGELOG-format sections were not re-derived — and the bible's rule 2 says a partial pass leaves
  the date. The document is 131 days past its quarterly threshold and still is.

### Iteration 1 — the commit-documentation audit

Every user-facing commit in the four release windows of the last week was checked against its
release's changelog.

**Method correction, recorded because it nearly produced three false findings.** The first pass
grepped each changelog for the orchestrator's own paraphrase of a commit subject and reported three
gaps. Two were the grep: 0.158.0 documents `f221d805` as "### CLI-814 — `doctor` counts one skill as
one skill" and `91686d87` as "### The copier left ejected skills unwritable". **Searching a document
for your own wording of a claim tests the wording, not the document.** Re-checked by reading each
commit's diff and then searching for its substance.

**One real gap survived that re-check.** `17e3f594` — "every compiled agent re-derives its brief and
censuses the defect class" — shipped in **0.160.0 and appears in no changelog at all**. It edits four
`src/agents/_templates/methodologies/*.liquid` partials, which `agent.liquid` renders into every
agent the CLI compiles, so it is shipped user-visible text rather than internal work.

`archive.md` did record it, and **recorded it as two rules when it was three plus a rewrite**. The
missing rule is "The Specification Is a Claim, Not a Fact" in `investigation-requirements.liquid` —
the one that makes corrections a required report field for every compiled agent, which is to say the
record of the discipline that keeps error rates visible was itself under-reported. `context-management.liquid`
also went from 161 lines to 7 and the entry does not mention it. Corrected in `archive.md`.

**Not fixed here, and it needs an owner decision:** 0.160.0 is published, and the protocol forbids
editing an old `CHANGELOG.md` block or an existing `changelogs/*.md`. So the gap can only be closed
forward, in 0.161.0's notes — and 0.161.0 is committed but **not pushed and not published**, so that
is still available. It is the owner's call, not this loop's.

## Iteration 2 — the orchestrator's lane continued

### `packages/cli/package.json` — an orphaned `//` note, deleted rather than rewritten

The manifest carried a top-level `//pretest` note explaining why a `pretest` hook builds before the
unit suite. **Neither `pretest` nor the `pretest:e2e` it claims to mirror exists as a script**, and
the `//test` note inside `scripts` says the opposite in as many words: "No `pretest` hook,
deliberately, and removing it fixed a real defect" — a race in which three tsup builds fired and two
collided on one `dist/`, aborting a push with no legible error.

So two notes in one manifest gave opposite instructions, and the stale one was the reassuring
direction: an agent reading `//pretest` believes `npm test` builds first, when in fact a stale `dist`
makes the run abort collecting **zero tests**, which reads as a pass if only the exit code is checked.

Deleted rather than corrected. Its subject is gone, its cost argument is refuted by `//test`, and its
one durable fact — that the unit suite drives oclif through `./dist/commands`, so a green run is a
statement about the last build — is already carried by the docblocks in
`src/cli/lib/testing/dist-staleness.ts`, which is the file that owns it.

### Rule 17.1 is violated across the repository, including by work committed today

`standards/clean-code-standards.md` states: "**Never commit machine-specific absolute paths in
tracked files.**" Census — re-runnable:

```bash
git grep -lI '/home/vince' -- . ':!*agent-findings/*' ':!bun.lock'
git grep -lI '/home/vince' -- '*agent-findings/*' | wc -l
```

**31 tracked files outside `agent-findings`, plus 7 findings.** The rule's own file appears in that
list only because it quotes the forbidden pattern, which is legitimate.

Fixed here, because they are live guidance rather than record: `standards/prompt-bible.md` (twice)
and `standards/loop-prompts-bible.md` both instructed agents using this machine's paths.

**Not fixed, and needing an owner decision rather than a loop's:**

- `todo/plans/**` (24 files) and `todo/archive.md` (5 hits) are historical records of hand-runs that
  genuinely happened on this machine. Rewriting them would falsify a record to satisfy a rule about
  source.
- `packages/cli/CLAUDE.md`'s "Workspace Directories" table (3 hits) is the sibling-repo map, and it
  is useful precisely because it is concrete.
- `todo/plans/editor-v6/phase-a-spec.md` carries **12** and was committed today, so this is not a
  historical residue — the class is still arriving.

**The honest reading is that a rule violated 31 times and enforced by nothing is not yet a rule.**
Either it needs a stated scope (source and live guidance, not records), or it needs a checker. Both
are owner calls. Filing the observation rather than picking one.

### A contradiction between the two `CLAUDE.md` files, reported rather than resolved

`packages/cli/CLAUDE.md`'s critical-reminder says "You do NOT write code. Delegate to sub-agents."
The root `CLAUDE.md`'s process step 3 says to apply the `meta-design-expressive-typescript` skill
"that skill only, **no sub-agents**". Both are owner-authored standing instructions, so this loop
reports the conflict instead of choosing a winner.

### Method note

Iteration 1's `/home/` check for the commit plan missed all of this because the command was piped
through `head -20`. **A truncated census reads exactly like a clean one.**

## Iteration 3 — verifying the lanes, and a method that failed honestly

### A `last_validated` moved on what looks like a partial pass — Lane C, reported not fixed

Two dates moved to 2026-08-30, both Lane C's. They are not the same case.

`reference/testing/harness-decisions.md` — 228 lines, diff 35 added / 12 removed, with real symbol
corrections (`Init.run` → `Init.showPermissionNotice` reached from `Init.handleInstallation`, the
code block rewritten against source, `getOutput()`/`getScreen()` → the three readers that exist).
That is what a whole-document re-derivation looks like. Not disputed.

`reference/testing/mock-data.md` — **the entire diff was the date.** And the document names
`MatrixConfig`, which exists in no source file:

```bash
git grep -nw 'MatrixConfig' -- . ':!*.md'   # empty
grep -n '^export' packages/cli/src/cli/lib/__tests__/mock-data/mock-matrices.ts
```

What that module exports is a set of `createMockMatrix(...)` results — `EMPTY_MATRIX`,
`SINGLE_REACT_MATRIX`, `WEB_PAIR_MATRIX` and the rest. A whole re-derivation greps its identifiers,
so the date and the diff disagree.

**Reported to Lane C rather than fixed here**, on two of this repository's standing rules: the lane
owns `reference/testing/*`, and the verifier is never the fixer. The message carries the
reproduction and asks it to answer explicitly — either it re-derived the file end to end and one
line slipped (date stands), or it was a partial pass (date returns to 2026-08-23, and the document
is honestly stale rather than falsely fresh).

### The sweep that found nothing, which is itself the finding

The same instrument that caught `MatrixConfig` was run across every reference and standards document
no lane owns: extract each cited `path/to/file.ts` and check it resolves.

**Six documents flagged. Zero real defects.** Every hit was one of four legitimate shapes:

- a deliberate **negative** claim — `reference/utilities.md` says "There is **no** `src/cli/utils/yaml.ts` module"
- a **prose placeholder** — `documentation-bible.md` uses `src/cli/utils/x.ts` to state a naming rule
- a **historical reference**, which is the passage's whole subject — `documentation-bible.md` cites
  `seed-schema.ts` as the deleted module that kept greppable because its test survived;
  `clean-code-standards.md` cites `src/cli/commands/import/skill.ts` as the deletion that left an
  orphan in `dist/`; `typescript-types-bible.md` cites `packages/matrix/src/schema.ts` and states it
  was renamed to `built-in-matrix.ts` on 2026-08-19, which `git log` confirms
- a path **relative to another workspace root** — `standards/editor-and-worker.md`'s `src/index.ts`
  is `apps/server/src/index.ts`, and `clean-code-standards.md`'s `e2e/fixtures.ts` is the editor's

**A path-existence checker is the wrong instrument for a corpus whose documents discuss deletions**,
and that is very likely why no such gate exists here. Recorded so the next pass does not build one.

The useful half is the unowned documents are in better shape than the overdue dates suggested.

### Running tally of the orchestrator's own error rate

Three method errors in three iterations, all caught by re-checking rather than by review:
a `head -20` that hid 31 rule violations; a changelog audit that grepped its own paraphrase and
produced two false gaps; and this sweep, six flags and no defects. **All three read as clean
results at the moment they were produced.**

## Iteration 4 — the lanes verified, and a commit's own claim tested

### Lane C answered correctly, and the fix was checked too

`mock-data.md`'s `last_validated` is back to **2026-08-23** — Lane C took option (b), a partial pass,
which is the honest answer. It also corrected the false line: `MatrixConfig` is now
`MergedSkillsMatrix`, `MockMatrixConfig` and `CompileConfig`. All three, plus
`CATEGORY_EXCLUSIVITY_MATRIX` and `REACT_SCSS_HONO_MATRIX`, were checked against source and exist.
`harness-decisions.md` keeps its 2026-08-30 date and has earned it.

### Lane B's two date moves hold up

`architecture-overview.md` (84+/32− over 584 lines) and `monorepo-layout.md` (102+/54− over 786).
Spot-checked the highest-risk claims: all eight current workspaces are listed; the `.gitignore`
negation section's structural claim is right (the CLI's three were grandfathered, the root and
`packages/ui` were written new into an ignored path — five tracked files, which `git ls-files` confirms);
and the 12 KB figure for `packages/ui/CLAUDE.md` is 12,324 bytes. **The rewrite also replaced a
count with the command that produces one** — "Read the current list rather than trusting one written
here: `grep -n '^!' .gitignore`" — which is the briefing standard applied to documentation.

### `371b46d6` claimed "the reference follows the extraction". It did not, entirely.

The test: which documents name a moved renderer and never mention the package it moved to?

```bash
comm -23 \
  <(grep -rl 'generateConfigSource\|config-generator\|generateAgentMarkdown' reference standards --include='*.md' | sort) \
  <(grep -rl '@workspace/compile\|packages/compile' reference standards --include='*.md' | sort)
```

Six documents. Two are still-pending lane files. **Three unowned ones carried claims that are now
false**, and the shape is the one this corpus already has a finding for — a re-export facade unbinds
every claim keyed on a module's path:

- `src/cli/lib/configuration/config-generator.ts` is **18 lines and declares nothing**; it re-exports
  `splitConfigByScope`, `isScopePairCompatible` and others from `@workspace/compile/seed-to-config`.
- `src/cli/lib/configuration/scope-predicates.ts` is likewise a facade over the package's own
  `scope-predicates.ts`, where `isActiveAt`, `activeAgentScopeMap` and `effectivelyExcludedSkillIds`
  are declared.
- `config-writer.ts` re-exports `generateConfigSource` from `@workspace/compile/config-source`.

Corrected in `reference/concepts/scope-system.md` (a table row and two "Function: … in …" lines),
`reference/features/seed-contract.md` (twice — **the second was line-wrapped, so the first exact-string
pass silently missed it**), and `reference/wizard/state-transitions.md` (a third instance found only
by re-running the search after the first two fixes).

`seed-contract.md` called the CLI path "the single definition", which is the sharpest form of the
error: the module named as the source of truth now declares nothing at all.

Dates left where they were on all three — these were targeted corrections, not re-derivations.

## Iteration 5 — close-out

### Final state

24 files changed, nothing committed. Gates run over every changed path: prettier clean, including
`packages/cli`'s own `format:check` — the one `prepublishOnly` runs. **Six lane-written documents
were left unformatted**; because `.ai-docs` sits inside `packages/cli`, that would have failed a
publish rather than a commit. Formatted here.

Zero machine-specific paths and zero `file:line` source references were introduced by any lane.

**All 188 identifiers the lanes newly named exist in source.** That check is the one that caught
`MatrixConfig`, re-run over every addition; no further misses.

### Four documents recertified end to end

`architecture-overview.md` (84+/32−), `dependency-graph.md` (79+/38−), `monorepo-layout.md`
(102+/54−) and `testing/harness-decisions.md` (33+/11−). Each moved its `last_validated` to
2026-08-30 and each carries a diff consistent with a whole-document pass.

**Overdue count: 34 → 32.** That is the honest number. Roughly a dozen further documents had claims
corrected without their dates moving, which is the bible's rule working rather than a shortfall — a
targeted correction is not a re-derivation, and stamping it as one is the defect this whole file
exists to police.

### What the loop actually changed

- `CLAUDE.md` — two stale workspace descriptions
- `packages/cli/package.json` — deleted the orphaned `//pretest` note that contradicted `//test`
- `standards/commit-protocol.md` — a fourth generator, `prepublishOnly`'s real coverage, an empty
  code span, a parity grep written for one ID family out of six
- `standards/prompt-bible.md`, `standards/loop-prompts-bible.md` — machine paths removed
- `reference/concepts/scope-system.md`, `reference/features/seed-contract.md`,
  `reference/wizard/state-transitions.md` — declaration sites repointed past the new facades
- `todo/archive.md` — the 2026-08-25 entry corrected from two rules to three plus a rewrite
- Lane output across `reference/config/`, `reference/features/`, `reference/testing/`,
  `standards/e2e/`, `reference/architecture*`, `monorepo-layout.md`, `dependency-graph.md`

### Open, and needing an owner decision rather than another iteration

1. **`17e3f594` is undocumented in any changelog.** It shipped in 0.160.0, which is published, and
   the protocol forbids editing an old entry. Closable only forward in 0.161.0's notes — still
   possible, since that release is committed but unpushed and unpublished.
2. **Rule 17.1 is violated by 31 tracked files**, one of them committed today. The rule needs either
   a stated scope (source and live guidance, not historical records) or a checker.
3. **The two `CLAUDE.md` files contradict each other** on whether the orchestrator writes code.
4. **The six `standards/` documents remain 131 days past a quarterly threshold.** Only
   `commit-protocol.md` was touched, and only partially.

### The orchestrator's error rate, which is the point of keeping this file

Five method errors across five iterations, every one caught by re-checking rather than by review:
a `head -20` that hid 31 violations; a changelog audit that grepped its own paraphrase and produced
two false gaps; a path sweep with six flags and no defects; an exact-string replacement that silently
skipped a line-wrapped occurrence; and a third instance of a corrected claim that surfaced only on
re-running the search after fixing the first two. **Every one of them read as a clean result at the
moment it was produced.** That is the argument for re-deriving, and it is the same argument the
`last_validated` rule makes.

## Post-close-out — Lane C's report, and the defect it found in the release

### The release commit `58472b97` is broken, and this loop caused it

`packages/compile/src/generated/corpus.ts` embeds `CORPUS_CLI_VERSION`. The release bumped
`packages/cli/package.json` to 0.161.0 and **did not regenerate the corpus**, so:

```bash
cd packages/cli && bun run generate:compile:check
# packages/compile is out of date:
#   src/generated/corpus.ts
```

Three specs in `scripts/generate-compile-package.test.ts` fail with it. Regenerated here; the gate is
green and `CORPUS_CLI_VERSION` is `0.161.0`. **The fix is uncommitted, and the release commit that
needs it is committed but unpushed.**

**Three things had to line up for this to ship, and all three did.** The pre-commit hook was off by
owner instruction. CI would have caught it — `generate:compile:check` is a step this same session
added — but only after a push. And `prepublishOnly` would **not** have caught it, because it carries
two of the four generator checks. That last gap was documented in `standards/commit-protocol.md`
earlier in this very loop, hours before it bit. **Writing a gap down does not close it.**

### Lane C's corrections to its own brief, which were the useful part

- The brief called the stale quoted-JSON assertion examples "the highest-value thing in this lane".
  **There were none.** The only occurrence is a deliberately-retired specimen that already names the
  new shape. The real finds were the compile-extraction symbol relocations and a `toHaveAgentDynamicSkills`
  contract that documented a `hasActivationProtocol` option the type does not have.
- The brief's `grep -rn 'stubGlobal("fetch")' packages/cli/src` returns 0, but that is the pattern and
  not the tree: `source-fetcher-revalidation.test.ts` holds ten `vi.stubGlobal("fetch", …)` calls.
  They mock giget-side revalidation rather than the worker, so the migration is complete for its own
  subject — but "zero fetch stubs in the CLI" would be false.

### Why Lane C missed `MatrixConfig` — a method fault, not an attention fault

Its identifier census matched **lowercase-initial identifiers only**, so it was structurally blind to
every PascalCase name in the document. It now runs three regexes (camelCase, PascalCase,
CONSTANT_CASE) across seven source roots. **This is the fourth incarnation of the same class in this
file** — a `head -20`, a self-paraphrase grep, an exact-string match that skipped a wrapped line, and
now a character-class that excluded half the namespace. Every one produced a clean-looking result.

A fifth followed immediately: locating `compactAssignment` with an `export`-anchored grep returned
nothing, because both functions are module-private inside the package.

### Cross-lane change applied

`packages/cli/src/cli/lib/__tests__/helpers/compacted-stack.ts` — the docblock placed
`compactAssignment` and `compactCategoryAssignments` in `configuration/config-writer.ts`, now a
33-line shim. Both are declared in `packages/compile/src/config-source.ts`. Reported by Lane C
because it did not own the file; verified and applied here.

### Left standing, deliberately

A duplicate count — "ten skills" in both `standards/e2e/test-data.md` and
`reference/testing/e2e-infrastructure.md`. Both correct today. Which document owns an E2E fixture
count is a ruling rather than a recertification, and the bible's ownership table does not name it.

## Post-close-out — Lane B, and a gate the extraction broke

### `.husky/pre-push` stopped covering the CLI, and yesterday's commits are why

Found by Lane B, verified here. The hook selects the CLI side on `^packages/cli/` or
`^packages/matrix/`. Everything else under `apps/` or `packages/` sets the **web** side, whose line
is `bunx turbo run lint --filter='!agents-inc'` — the CLI is explicitly excluded.

So a push confined to `packages/compile/`, `packages/api/` or `packages/api-mocks/` — all three
bundled into the published CLI by tsup's `noExternal` — **linted and type-checked the CLI with
nothing at all.** The comment above the matrix clause already states the exact reasoning; it simply
named one workspace when the extraction gave the CLI three more.

Fixed to `^packages/(matrix|compile|api|api-mocks)/`, comment rewritten, `bash -n` clean, and the
selection re-tested per path — `packages/ui` correctly still does not select the CLI, because nothing
bundles it there. **This is a behaviour change rather than a documentation one**, made on the
guards-are-not-features rule: the extraction broke an existing invariant and this restores it.

### Two counts dropped rather than restated

`.husky/pre-commit` and the root `package.json`'s `//lint-staged` both said "Twenty-four of the rules
enabled in all **seven** workspaces are type-aware". There are 13 workspaces. Rather than swap in a
new number that will drift the same way, both now read "Some of the rules every workspace enables" —
the load-bearing point was always that a type-aware verdict reads a whole program, never the
cardinality. Lane B made the same call in the document it owns.

`ci.yml`'s timeout comment ("three green runs on 2026-08-04 put check-web at 4-5 minutes") is left
alone and flagged: `check-web` has since gained four steps, so the measurement predates the job. Only
a fresh measurement can fix it, and this loop cannot take one.

### A misattribution in iteration 4 of this file, corrected

Iteration 4 credited Lane B with replacing the `.gitignore` negation count with the command that
produces it. **A previous pass had already done that**, which Lane B reported as a correction to its
own brief — the brief's "three negations" premise was false, and the count that had genuinely
drifted was a different three, in the `.prettierignore` section. What iteration 4 verified was real;
the attribution was not.

### What Lane B found, worth recording

`dependency-graph.md` had drifted in a way no reader could have spotted: **eight utility consumer
tables wrong in both totals and membership**, and two "Key Observations" that contradicted the
sections directly above them (52/55 against 50/51; `utils/messages.ts` described as command-only in
one place and not in the other). `architecture-overview.md`'s directory tree still listed four
retired commands and a module deleted on 2026-08-23.

It also left `boundary-map.md`'s date at 2026-07-30 having corrected nine sections, because it did
not reach §2.6, §3.5–§3.9, §6 or §8 — the rule applied correctly and unprompted.

**Its own hazard note is worth keeping:** it observed the tree grow from 2 dirty files to 33 while it
worked, and re-ran its identifier gate over all five owned documents as a final step for that reason.
Concurrent lanes on one working tree is the condition the 2026-08-29 programme already filed a rule
about.

## Post-close-out — Lane A, and the correction that undercuts this file's framing

### The premise of the whole programme was too narrow

Lane A's third correction is the one that matters most, and it is against the orchestrator's brief:
**for five of its seven documents the largest defects predate 2026-08-30 entirely.**
`output-validator.ts` was reaped on 2026-08-23 and was still named in two documents;
`ValidationPartial` went on 2026-08-09; `wouldLoseRequirement` on 2026-08-23; `METADATA_KEYS` had
gained a key and four importers; every `npm pack` figure in `build-and-packaging.md` had moved
(455 files → 431, 8.9 MB → 9.3 MB, re-derived with a fresh build).

This file cut its lanes by "the blast radius of the 2026-08-30 commits". **That framing found real
defects but was not what most of the rot was.** The overdue threshold table would have been the
better organising principle on its own — it was computed in iteration 1 and then used only to
prioritise rather than to scope.

### Lane A found the corpus staleness independently, and by a different route

It ran `scripts/generate-compile-package.test.ts` to re-derive a suite count, and the spec that
reproduces the package byte-for-byte **rewrote `corpus.ts` as a side effect** — surfacing the same
0.160.0/0.161.0 drift the orchestrator found from Lane C's report. Two independent routes to one
defect, neither of them the gate that was supposed to catch it.

It also reported the file honestly as one it had changed without owning, and correctly declined to
revert it, since hand-editing it back would restore drift the gates catch.

### Cross-lane changes applied

**`packages/compile/src/config-source.ts` — a docblock that was exactly backwards.**
`generateConfigSource`'s docblock said "The export default sits at the top as a table of contents,
with typed named variables declared below it." The emitter pushes `declaration(...)` lines first and
`export default { … } satisfies ProjectConfig` last, and the committed `STACK_ORDERING_CONFIG_TS`
fixture shows `const skills` / `const agents` / `const stack` above the default export.

**A second inverted comment Lane A did not flag**: `EXTRACTED_FIELDS`'s comment said the same thing
backwards. Both corrected. The file stated the _correct_ order twice elsewhere (lines 424 and 503),
so it had been contradicting itself in four places.

### Not applied, deliberately — a class, not a defect

Lane A reported a decorative separator comment in `scripts/generate-matrix-package.ts` as violating
the no-banner-comments rule. Census first:

```bash
git grep -cE '^// -+ .+ -{5,}' -- '*.ts' '*.tsx'
```

**40 occurrences across seven files, all four generator scripts and their tests, and nowhere else in
the repository.** That is a consistent local convention rather than a slip, and deleting one line
would leave that file inconsistent with its six siblings. Whether the convention stands is a ruling.

The irony is worth recording: the rule that says so is "The Class Is the Unit of Repair", which
reached every compiled agent in `17e3f594` — the commit this same audit found undocumented.

### Final gates

`generate:compile:check` green. `packages/cli`'s `prettier --check .` — the `prepublishOnly` gate —
green. Both husky hooks pass `bash -n`. 37 files changed, nothing committed.
