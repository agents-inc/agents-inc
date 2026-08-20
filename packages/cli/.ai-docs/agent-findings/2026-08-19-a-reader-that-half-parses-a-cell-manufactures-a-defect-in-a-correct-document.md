---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/scripts/check-enumeration-drift.ts
  - packages/cli/scripts/check-enumeration-drift.test.ts
  - packages/cli/.ai-docs/reference/testing/e2e-infrastructure.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-19
reporting_agent: codex-keeper
category: testing
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  `memberNameIn` in `check-enumeration-drift.ts` counts the code spans in a row's first cell and
  throws `AMBIGUOUS_MEMBER_CELL` when there is more than one, naming the cell so the failure
  carries the address of the row to repair. Two specs pin it — that the refusal fires where the old
  reader answered `charlie`, and that the message quotes the offending cell. The document that made
  the case, the E2E Helpers table in `reference/testing/e2e-infrastructure.md`, was rebuilt one
  export per row against `e2e/helpers/test-utils.ts`: 72 single-name cells across four tables, two
  of which the checker's own readers now judge `agrees`. The registry rows for those two tables are
  not in this change — `scripts/` is code and this pass could not edit it — and were handed to the
  orchestrator to route.
---

## What Was Wrong

`table-rows` in `scripts/check-enumeration-drift.ts` maps one document row to one source member.
`memberNameIn` took the row's first cell, stripped its backticks, trimmed it, and removed a trailing
call signature — and a cell naming several exports went through that pipeline and came out as one
plausible name rather than as an error.

The strip is what made it plausible. `CALL_SIGNATURE` is `/\(.*\)$/`, greedy and anchored at the
end, so `` `agentsPath(dir)` / `skillsPath(dir)` `` loses everything from the first `(` to the last
`)` and survives as the single valid name `agentsPath`. `skillsPath` is then absent from the names
the document supplied, and the checker reports it as `presentButUnnamed` — a source export the
document does not name. The document names it, on that very line.

**The failure is not that the check missed something. It is that the check produced a defect report
against a correct document.** The repair such a report invites is to add a row for `skillsPath`,
duplicating a row that is already there, or to decide the document is wrong and start editing it. A
checker that reads half a cell and reports the other half as missing is worse than one that refuses,
because a refusal costs a reader one confused minute and a manufactured drift report costs a correct
document an edit. A gate whose false positives are shaped exactly like its true positives spends its
credibility on the first one a reader chases.

The same defect had a quieter second form in the same table. A leading annotation word — `type
IsolatedClaudeHome`, `types ClaudeConfigOptions / MarketplaceInfo` — survives backtick-stripping as
a whitespace-separated string matching no exported symbol, so its row drifts in both directions at
once: a name the source does not hold, plus the real export left unnamed. That one is at least
loud. The two-name cell is the one that reads as a considered answer.

## Fix Applied

The reader now refuses. `memberNameIn` counts the code spans in the first cell and throws
`AMBIGUOUS_MEMBER_CELL` when there is more than one, quoting the cell so the failure names the row
to repair rather than reporting a fault with no address. Two specs hold it: one asserts the refusal
where the old reader answered `charlie` and dropped `delta`, carrying that mechanism in its
assertion message; the other asserts the message contains the offending cell verbatim.

**Splitting the cell on a separator was the alternative and was rejected.** No separator convention
is stated anywhere, `/` is an ordinary character in the path-valued tables this same reader serves,
and inferring one would make the answer depend on punctuation. One name per cell is the contract,
and the refusal is where the contract is enforced rather than assumed.

**This is the posture `UNNAMEABLE_REEXPORT` already set one function away.** `reexportedNames`
refuses a module whose `export *` names nothing rather than contributing an empty list to the
directory's membership, for the same reason: a source list silently short by a module's whole export
surface reports every one of those names as undocumented. Two readers, two shapes outside contract,
one answer. That consistency is the point — a registry read as "things nothing else guards" cannot
afford one reader that guesses and one that refuses.

**The document that produced it has been rebuilt.** `reference/testing/e2e-infrastructure.md`'s
E2E Helpers section was 47 rows carrying 71 names, with 11 multi-name cells and 5 of those opening
with an annotation word. It is now 72 rows, one export per row, split into four tables by what the
checker can read: declared constants and declared functions (both bound and both judged `agrees`, at
5 and 34 members), declared types, and re-exports. Re-deriving it against source turned up a
seventy-second export the repaired membership had missed — `normalizeConfigPreservingOrder`, live in
`e2e/lifecycle/scope-toggle-roundtrip.e2e.test.ts` and named nowhere in the table.

**A census of the shape, not of defects.** Across `.ai-docs/`, 261 of 4295 table rows have a first
cell naming more than one code span. Most are not enumerations and never will be — a
`Layer | Scope | What it does` row legitimately names two things in its first cell. The number
measures how ordinary the shape is, which is the argument for stating the rule where documents are
written rather than discovering it one registry row at a time. `reference/features/plugin-system.md`
(14), `reference/features/source-fetch-and-cache.md` (12) and `reference/features/configuration.md`
(11) are the heaviest, and each carries tables introduced with exhaustiveness language.

## Proposed Standard

For `standards/documentation-bible.md`, beside "A Count Lives in Exactly One Document" and the
table-keyed-by-member rule that has since landed there under **"A list that wants binding is written
as a table keyed by the member."** That rule says a list worth introducing as exhaustive is written
as a table keyed by the member, because a comma-separated prose bullet satisfies neither reader the
checker has; this is the half it does not cover — what a keyed cell may contain.

**One member per first cell, and the kind goes in another column.** A cell naming two exports cannot
be bound, and a cell opening with `type` or `types` binds to nothing even when it names one. Where a
row has to say it names a type rather than a value, the Purpose column says it; the member cell
holds the identifier and the call signature, and nothing else. Both halves are decidable while
writing, and the second is the one nobody would guess: an annotation word looks like documentation
and behaves like a typo.

**And, for whoever writes the next reader in `scripts/`: refuse rather than guess whenever the input
is outside the contract, and let the spec that proves it assert the refusal at the exact input where
the old code returned a confident wrong answer.** Every check in this file that has failed us failed
by declining to judge — that is already its header's own rule, and this is the sharper case of it,
because a reader can also fail by judging an input it was never able to read. The test worth writing
is not "the good input passes"; it is "the input that used to produce a wrong answer now produces
none".
