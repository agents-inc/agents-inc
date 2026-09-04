---
type: convention-drift
severity: medium
affected_files:
  - src/cli/lib/__tests__/agent-baseline-is-slim-and-positively-framed.test.ts
  - src/cli/lib/__tests__/helpers/text-scans.ts
  - src/cli/lib/__tests__/helpers/text-scans.test.ts
  - src/cli/lib/resolver.test.ts
  - src/cli/lib/loading/loader.test.ts
  - src/cli/lib/__tests__/helpers/element-at.ts
  - src/cli/lib/__tests__/helpers/element-at.test.ts
  - src/cli/lib/agents/agent-provenance.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-09-03
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  Four independent fixes, each mutation-proved. Local scanning helpers `offendingLines` /
  `retiredFormsIn` moved to `__tests__/helpers/text-scans.ts` with a discriminating spec of their
  own. `resolver.test.ts`'s negative assertion re-bound from the literal `"when working with
  web-framework"` (a string no code path emits) to `FALLBACK_USAGE["web-framework"]`, the constant
  that already governs it. Two `?? {}` absence checks (`loader.test.ts`, `resolver.test.ts`)
  replaced with the new `entryAt()` asserting lookup in `element-at.ts`. `agent-provenance.test.ts`
  gained a render-two-versions-and-diff guard confining a version change to the trailing
  `<system-reminder>` block. See the sibling `resolver.test.ts` fix in the same pass, filed
  separately as it is its own class (a roster narrower than its own fixture).
---

## What Was Wrong

A targeted review of four CLI spec files applying `packages/cli/CLAUDE.md`'s "Test Assertions"
section found a live, uncaught violation of four SEPARATE already-documented rules, none of them
newly discovered rules — each is written out in CLAUDE.md today, several with worked examples, and
none had a mechanical check.

**Local parser/extractor helper inside a test file.**
`agent-baseline-is-slim-and-positively-framed.test.ts` defined `offendingLines` (a line-by-line
regex scan) and `retiredFormsIn` (a substring-membership scan) as bare functions in the spec file,
directly against the rule's own wording ("NEVER define local parser/extractor helpers inside a test
file … If a helper is genuinely reusable, live it in `src/cli/lib/__tests__/helpers/` WITH its own
tests"). A sibling in the same directory (`compiled-agent-sections.ts`) already followed the correct
shape; this file did not.

**A negative assertion bound to a string no code path emits.** `resolver.test.ts`'s
`"carries the guidance the skill states for itself rather than the category name"` spec asserted
`.not.toBe("when working with web-framework")` — a truncated, unpunctuated fragment of the real
fallback sentence `statedUsageFor` in `stacks-loader.ts` actually produces,
`"Use when working with web-framework."`. `FALLBACK_USAGE` in `mock-data/mock-skills.ts` exists
specifically to bind assertions like this one, and its own docblock says two OTHER spec files
(`stacks-loader.test.ts`, `agent-protocol-carries-stated-usage-guidance.test.ts`) had this exact
defect, were fixed, and were "re-checked by removing this fixture's guidance and watching them
fail." `resolver.test.ts` was a third site with the identical defect that the earlier sweep's own
docblock did not know about — the docblock's claim of completeness was itself unverified against
the whole tree.

**Absence specs that pass for free.** `loader.test.ts` and `resolver.test.ts` each read their
subject through `Object.keys(record["key"] ?? {})` before checking that certain fields are absent.
An agent that silently stopped compiling (the record losing the key entirely) produces the exact
same `Object.keys({})` — `[]` — that the assertion expects from a compiled agent correctly omitting
those fields. The two states the spec exists to tell apart are indistinguishable to it.

**An invariant stated in a docblock with nothing checking it.** `renderAgent`'s own doc comment in
`packages/compile/src/agent-source.ts` says the CLI version "reaches the template as
`generatorVersion` and renders inside the trailing volatile block rather than into the provenance
marker, so a release bump no longer rewrites the first cacheable byte of every compiled agent." No
spec in `packages/cli/src` or `packages/compile/src` asserted this. `grep -rn "Compiled by"
--include="*.test.ts" packages/cli/src packages/compile/src` returns zero (an e2e spec in
`packages/cli/e2e/`, outside the unit-test project, does check the literal `Compiled by
${CORPUS_CLI_VERSION}.` against a real install, but nothing guards the STRUCTURAL claim — that the
version cannot appear anywhere ABOVE `<system-reminder>`). Editing `agent.liquid` to render
`Compiled by {{ generatorVersion }}.` directly under `# {{ agent.title }}` — reintroducing exactly
the regression the docblock describes moving away from — compiled cleanly, passed every other test
in the suite, and reddened nothing.

## Fix Applied

See `resolved_by` above for the mechanism of each of the four fixes. Each was proved by deliberately
reintroducing the defect the fix closes and watching the new assertion fail for the right reason,
then reverting: the resolver's `experimental` field was force-dropped from its output (roster fix,
filed separately), `resolver.ts`/`loader.ts` results were pointed at a nonexistent key (`entryAt`
fix), `agent.liquid` was edited to render the version above the playbook (provenance fix), and a
temporary assertion against `FALLBACK_USAGE["web-framework"]` confirmed the real product string.

## Proposed Standard

**A prior sweep's own docblock claiming a class is closed is a claim, not a census.**
`FALLBACK_USAGE`'s docblock names two files it fixed and re-verified — correctly, as far as it
went — and a third file with the byte-identical defect sat unfound because nothing re-ran the
pattern's grep across the whole tree after the fix landed. This is the same lesson two earlier
findings in this corpus already generalized from other classes
(`2026-08-19-five-class-fixes-were-scoped-to-the-file-the-defect-was-found-in`,
`2026-08-19-a-second-partial-manual-mock-survived-because-nothing-compared-it`); this is a third,
independent instance of it, over a different pattern (`FALLBACK_USAGE` bindings rather than stub
classes or file-scoped repairs). No new mechanism is proposed for the four classes themselves — each
already has explicit CLAUDE.md language and, for three of the four, a fix in this pass now serves as
the example. What generalizes is procedural: **when a fix's own docblock states which files were
checked, treat that list as a hypothesis and grep the class fresh rather than trusting the count** —
`grep -rn '"when working with ' src/cli --include='*.test.ts'` (or the equivalent literal for
whichever fallback string is in play) is cheap enough to run on every touch of a shared fallback
constant's call sites, not only when the constant itself changes.
