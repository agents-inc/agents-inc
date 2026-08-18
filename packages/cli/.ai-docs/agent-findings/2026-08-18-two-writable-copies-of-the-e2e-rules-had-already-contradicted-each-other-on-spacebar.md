---
type: architectural-drift
severity: high
affected_files:
  - .ai-docs/standards/e2e-testing-bible.md
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/patterns.md
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/reference/testing/infrastructure.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
  - .ai-docs/reference/testing/factories.md
  - .ai-docs/reference/testing/harness-decisions.md
  - scripts/check-enumeration-drift.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The documentation side has landed: the monolith is a pointer, the reference pages are re-derived,
  and seven enumerations are bound to source. What is pending is code-side — the three test-support
  directory tables in reference/testing/factories.md still cannot be registered, because
  check-enumeration-drift.ts's source reader names a module's own declarations and reads no
  `export … from`, so a barrel enumerates nothing. Those counts stay hand-checked until the reader
  can follow a re-export.
---

## What Was Wrong

`.ai-docs/standards/e2e-testing-bible.md` (572 lines) and `.ai-docs/standards/e2e/` were two
writable copies of the same rules. The directory was split out of the monolith —
`anti-patterns.md`'s closing section said so in as many words, and `CLAUDE.md` has pointed authors
at `e2e/README.md` rather than at the bible for as long as the split has existed — but the monolith
kept its full text, so nothing said which copy governed.

**They had already contradicted each other on a rule an author would act on.** Bible § 9.5 stated
that "**Spacebar is inert on any globally-backed row**"; `patterns.md` states that spacebar on a
SKILL row drops the half the project owns and the pair collapses to the inherited `[G]`, and that
only an AGENT row is inert. `src/cli/stores/wizard-store.ts` settles it in `patterns.md`'s favour:
`toggleAgent` returns `TOAST_MESSAGES.GLOBAL_AGENTS_LOCKED` on a dual-scope pair row, while
`toggleTechnology`'s dual-scope arm reconciles the configs and keeps the skill selected because "a
dual-scope deselect collapses to a single active inherited-global entry". A spec written to the
bible would have pressed `s` where a space was correct, or asserted inertness that does not hold.

Two more bible claims were false against source, and one was self-contradictory:

- § 1.4: "The include pattern is `e2e/**/*.e2e.test.ts` — smoke tests are excluded and must be run
  explicitly." `e2e/vitest.config.ts` has no top-level `include` at all; it declares two named
  projects, `e2e` and `smoke`, and `spec-gates.test.ts` enforces that each is opened by a script.
- § 1.1 called `create-e2e-source.ts` a "9-skill source fixture" while § 8.1 of the same file
  tabulated ten.

This is precisely what `documentation-bible.md` § "A Count Lives in Exactly One Document" forbids,
widened the same week from count to MEMBERSHIP: validation is organised per document, so the agent
assigned `patterns.md` re-derives the rule and nothing tells it another file states the opposite.

The reference side had drifted the same way, in both directions at once:

| Claim                                                                           | Source                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `factories.md`: `factories/` 42, `helpers/` 33 symbols                          | 45 and 39. The factories table held 41 rows under a heading claiming 42    |
| `factories.md` named `createImportSource()`                                     | Deleted from `disk-writers.ts` — grep finds it nowhere in the tree         |
| `factories.md`'s content-generator table, "pure content renderers"              | Omitted `renderUnparseableMetadataYaml`                                    |
| `e2e-infrastructure.md` named `readSelectedAgents()`                            | Renamed `readActiveAgentNames` in `dual-scope-helpers.ts`                  |
| `e2e-infrastructure.md`: commands 55 / interactive 63 / lifecycle 90 files      | 56 / 65 / 92; six specs were listed nowhere                                |
| `e2e-infrastructure.md`: the suite is "647 tests"                               | 830, and the 647 was measured at a retry setting the config no longer uses |
| `e2e-infrastructure.md` cross-ref to `harness-decisions.md` § 1.9               | That document ends at § 1.8                                                |
| `infrastructure.md`: `scripts/generate-source-types.test.ts` is the script test | Seven script specs exist, five of them repository checks                   |
| `infrastructure.md`: "~127 test files total"                                    | A count the document does not own; `DOCUMENTATION_MAP.md` § Coverage does  |

And machinery that landed the same day was documented in **no** reference page: the journey-page
reader (`src/cli/lib/__tests__/helpers/journey-page.ts`), the enumeration-drift registry
(`scripts/check-enumeration-drift.ts`), the five gates of `spec-gates.test.ts` and its
`ESCAPE_SHAPES` table, the shared assertion core `e2e/assertions/four-surfaces.ts`, and the whole
hand-run harness (`e2e/handrun-*.ts`, `scripts/handrun.mjs`) — the harness for step 4 of the
repository's own change workflow.

## Fix Applied

**`e2e-testing-bible.md` is now a pointer**, in the shape `reference/test-infrastructure.md`
already established in this tree: a redirect table mapping each of its twelve sections to the file
that now owns it, plus the evidence that it was superseded. Nothing was lost — every rule it carried
was verified present in `e2e/` first, by grepping each rule's distinctive phrase. `§ 11` (the
`test-utils.ts` export inventory) went to `reference/testing/e2e-infrastructure.md` rather than to a
standards file, because an API inventory is reference, not a rule. The two inbound references from
`harness-decisions.md` and the two from `anti-patterns.md` were repointed.

**Reference pages re-derived from source.** Counts corrected or, where they could not be
re-derived, deleted rather than restated (the 647). The E2E spec listing now diffs clean against
disk in both directions. New sections document the journey-page reader's three-kind total
classification, the five spec gates and their lint zones, the seven repository checks, the four
assertion surfaces (including the two facts that read backwards — never `os.homedir()`, and a
`[P][G]` pair being one name at two scopes rather than a leak), and the hand-run.

**Seven enumerations registered** in `scripts/check-enumeration-drift.ts`: the content generators
and the FS utilities against `reference/testing/factories.md`, and `DIRS`, `FILES`, `TIMEOUTS`,
`EXIT_CODES` and `SOURCE_PATHS` against `standards/e2e/README.md`. The registry was mutation-proved
rather than assumed: renaming `renderUnparseableMetadataYaml` and `FILES.MARKETPLACE_JSON` in the
working tree produced a report naming both directions for both rows —

```
"claim": "the content generators of __tests__/content-generators.ts in reference/testing/factories.md",
"namedButAbsent":    ["renderUnparseableMetadataYaml"],
"presentButUnnamed": ["renderUnreadableMetadataYaml"],

"claim": "FILES in standards/e2e/README.md",
"namedButAbsent":    ["MARKETPLACE_JSON"],
"presentButUnnamed": ["MARKETPLACE_MANIFEST_JSON"],
```

— and both renames were reverted, with the suite green afterwards.

**What could not be registered, and why.** `factories.md`'s three directory tables are the counts
that document OWNS, and they are the ones that had drifted furthest — but a registry row names one
source FILE, and `factories/index.ts`, `helpers/index.ts` and `assertions/index.ts` are barrels
whose every export is an `export … from` the reader does not follow. A table whose rows come from
eight sibling modules cannot be bound to any single one of them. The document now says so in place,
so a reader knows those three tables are hand-checked rather than guarded.

## Proposed Standard

`documentation-bible.md` § "A Count Lives in Exactly One Document" already forbids a second writable
copy of a count or a membership list. It does not say what to do with a **document** that is a second
writable copy of another document's rules, which is the same defect at file granularity and how this
one survived a split that had already happened.

Proposed addition to that section, as a paragraph beneath the membership rule:

> **A superseded document becomes a pointer in the same pass that supersedes it.** Splitting a
> document is not finished while the original still holds its text: the two copies are then
> separately editable, validation is organised per document, and the pass that re-derives one is
> told nothing about the other. Leave a redirect table mapping each section of the old document to
> the file that now owns it — the inbound links are why the path is kept — and hold the pointer to
> the same rule as any other pointer: it carries no content of its own. `e2e-testing-bible.md` ran
> for months as a full second copy of `standards/e2e/`, and the two had diverged on what the
> spacebar does to a dual-scope skill row before anybody compared them.

That file is convention-keeper's, so this is **proposed, not applied**. The evidence for it is the
divergence above, which no per-document validation pass could have caught from either end.
