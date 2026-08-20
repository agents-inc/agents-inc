---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/testing/e2e-infrastructure.md
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/page-objects.md
  - .ai-docs/standards/e2e/test-data.md
  - .ai-docs/standards/e2e-testing-bible.md
  - e2e/pages/wizards/edit-wizard.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-07-30
reporting_agent: codex-keeper
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  Re-derived on 2026-08-19 against source and against scripts/check-enumeration-drift.ts. The
  previous note's "nothing checks that a name or count in prose still resolves" is now too wide, and
  is narrowed rather than kept. MECHANISM - largely built. The drift checker binds a document
  section to a source symbol and reddens the suite when the two disagree. Six of its rows bind
  standards/e2e/README.md - `STEP_TEXT`, `DIRS`, `FILES`, `TIMEOUTS`, `EXIT_CODES` and
  `SOURCE_PATHS` - and two bind reference/testing/e2e-infrastructure.md, `STEP_TEXT` again and
  `E2E_SKILL_TITLES`. The per-directory spec totals this finding opened with are no longer that
  document's to state: the E2E file totals are owned by DOCUMENTATION_MAP.md under the
  one-document-owns-a-count rule, so that class went away rather than being guarded. STILL
  UNGUARDED, and this is the whole of what survives - the page-object method inventories
  (`BuildStep`, `AgentsStep`, `ConfirmStep`, `BaseStep`, `TerminalScreen`, `InitWizard`,
  `EditWizard`) and the test-utils.ts export inventory in reference/testing/e2e-infrastructure.md.
  The second is this finding's own class recurring in the exact document it named: re-derived on
  2026-08-19 it was five exports short and carried one phantom name, a module-private constant sat
  under an "(internal)" annotation inside a table headed Export. Repaired, and still bound to
  nothing. Binding it needs one change beyond membership, which the repair deliberately did not
  make: the checker reads a whole first cell as ONE member name, and 11 of the 47 cells name more
  than one export. Two of those 11 are the sharp shape - the call-signature strip is greedy and
  end-anchored, so a cell pairing two call signatures reduces to the first name and silently loses
  the second, which surfaces as the checker calling a name the document plainly carries unnamed.
---

## What Was Wrong

The E2E documentation set pins two kinds of claim that no tool verifies: **counts** and **symbol
names**. Between the last full sweep (product v0.144.1) and v0.146.0 both classes drifted, silently
and simultaneously, across five docs.

**Counts.** Every per-directory spec total in `reference/testing/e2e-infrastructure.md` was wrong at
once — `commands/` 24 vs 30 on disk, `interactive/` 37 vs 47, `lifecycle/` 70 vs 75 (and the
lifecycle list's own entries summed to 71, disagreeing with its own header). `STEP_TEXT` was
described as "All 50 members" against 64 in source. `e2e-testing-bible.md` opened by describing
itself as consolidated from "74 E2E test files" against 156. None of these is individually
important; collectively they mean an agent that trusts an inventory to be exhaustive will conclude a
file or constant does not exist.

**Symbol names.** Three page-object tables listed methods that had been superseded and omitted
methods that had shipped: the `BuildStep` table was missing 11 of its 22 public methods, and
`focusSkill` was still described as "DOWN to its row, RIGHT to its column" — the exact dead-reckoning
model whose removal was the point of the 0.145.0 rewrite. Worse, the same doc's "not applicable"
list named `findSkillGridPosition`, a method that no longer exists anywhere in `e2e/`.

**The same dangling name survives in source.** `e2e/pages/wizards/edit-wizard.ts` documents the
`launchInProjectShort` carve-out as "never for callers that read the grid to locate a skill by name
(`findSkillGridPosition` needs the clean category layout this variant deliberately does not wait
for)". `findSkillGridPosition` was deleted with the `focusSkill` rewrite. The _rule_ the comment
states is still exactly right — that launcher genuinely must not be used with grid-reading callers —
but it justifies itself by naming a function a reader cannot find, which invites the reader to
conclude the constraint is obsolete and use the launcher anyway.

Two further claims were not merely stale but **inverted**, which is the dangerous shape: both
`standards/e2e/test-data.md` and `e2e-testing-bible.md` §3.2/§3.6 stated that `runCLI` and
`TerminalSession` set `HOME=cwd`. D-226 removed that collapse precisely because `os.homedir() ===
cwd` erases every project-versus-global distinction. An agent following the doc would have
reintroduced the bug the release was named for.

## Fix Applied

Corrected in this pass, across the twelve owned docs: all per-directory spec counts re-derived from
disk and the 21 missing spec files listed; the three D-260 renames recorded; `STEP_TEXT` re-counted
and its 14 omitted members enumerated; the `BuildStep`, `AgentsStep`, `ConfirmStep`, `BaseStep`,
`TerminalScreen`, `InitWizard` and `EditWizard` inventories rebuilt from source; the dangling
`findSkillGridPosition` reference removed from the docs; `TIMEOUTS.WIZARD_LOAD` corrected 15s → 45s
at all six sites; the two inverted `HOME=cwd` claims replaced with the sibling-HOME model and its
rationale.

Not fixed: the absence of any mechanism that would have caught any of the above.

## Proposed Standard

For `.ai-docs/standards/documentation-bible.md`:

1. **Prefer a derivable claim over a pinned count.** A count is only worth writing when it is itself
   the contract (e.g. "the E2E source contains exactly 9 skills" — a fixture invariant a test
   depends on). A per-directory file total is not a contract; it is a snapshot that is wrong by the
   next commit. Write "one spec per shipped fix" or list the files without a total, rather than
   pinning a number nothing re-derives.

2. **When a count IS pinned, the doc must state how to re-derive it** in the same sentence, so a
   validating agent can check it in one command rather than eyeballing a list. The existing
   "Exhaustive Enumeration over Glob Shorthand" rule already forbids `etc.`; this is its converse —
   an exhaustive list whose header count disagrees with its own body is worse than either.

3. **Every symbol name in prose must resolve.** During a sweep, grep each backticked identifier in
   an inventory against source and delete or correct the ones that do not resolve. A dangling
   function name is not a cosmetic error: it is the load-bearing justification for a rule, and a
   reader who cannot find it reasonably concludes the rule expired. This applies to source comments
   too — a JSDoc rationale that names a deleted function should be rewritten to name the surviving
   one (`focusSkill`) or to state the constraint structurally.

4. **Flag inverted claims as a distinct severity.** A stale count under-informs; an inverted claim
   actively instructs an agent to reintroduce a fixed bug. When a sweep finds one, it belongs in the
   finding regardless of how small the edit was — the `HOME=cwd` pair above survived a full release
   cycle in two separate docs.
