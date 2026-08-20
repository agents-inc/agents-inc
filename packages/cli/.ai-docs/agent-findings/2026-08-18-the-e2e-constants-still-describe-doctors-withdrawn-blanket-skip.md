---
type: convention-drift
severity: medium
affected_files:
  - e2e/pages/constants.ts
  - e2e/commands/doctor-content.e2e.test.ts
  - src/cli/commands/doctor.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-18
reporting_agent: codex-keeper
category: testing
domain: e2e
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`doctor` used to stand its whole operational layer down whenever any content row failed, and the
justification for that — an operational finding on broken content is a downstream cascade of the
content finding — was true of some rows and applied to all of them. That was withdrawn: each
`GatedContentCheck` in `src/cli/commands/doctor.ts` now declares `blocks`, the rows whose own verdict
would be that pass's finding re-worded, `Agents` declares none, a blocked row prints a sentence
naming the pass that blocked it, and the whole-layer skip survives only for the one finding it was
always right about — a config nobody can read. The product renamed its own constant
`SKIP_AFTER_CONFIG_ERROR` to say exactly that.

Three things in `e2e/` still describe the withdrawn behaviour:

1. **The comment above the doctor block in `e2e/pages/constants.ts`** reads "The command validates
   content first and only reaches the operational layer when content is clean — operational failures
   on broken content are downstream cascades, not findings." Every clause of that is now false, and
   it sits in the file every spec author reads to find out what `doctor` prints. It is the same
   sentence the two specs were asserting when the over-reach was found — the specs were rewritten and
   the comment they came from was not.

2. **`DOCTOR_SKIP_AFTER_CONTENT_ERRORS`** holds the right VALUE (`"Skipped — fix the content errors
above first"`, still byte-identical to the product's string) under a name that says the skip
   follows any content error. The product renamed its half of the pair for that precise reason.
   `doctor-corrupt-config.e2e.test.ts` asserts it positively, and correctly: an unreadable config is
   the surviving case.

3. **The per-row skip sentence has no `STEP_TEXT` member and no E2E assertion at all.**
   `skipRestatingContent(nouns)` emits `Skipped — this row would only restate the <nouns> errors
above`, and `grep` finds it in `src/` only. So the E2E layer can currently assert that the BLANKET
   skip did not happen — three `not.toContain(DOCTOR_SKIP_AFTER_CONTENT_ERRORS)` sites do — and
   cannot assert that the scoped one did. The behaviour that replaced the blanket rule is unpinned
   end to end, and a regression that stood a row down for the wrong pass would satisfy every negative
   in the file, because the negative names a string that regression would not print.

The unit layer is not in this position: `doctor-content.test.ts` covers the blocked and unblocked
rows directly, and its assertion messages name the row's inputs rather than the gating rule.

## Fix Applied

None — discovery only. This was found while writing the M4 assertion rules; the rewritten specs and
the scoped implementation are the worked examples for
[assertions.md § A negative assertion names the input that makes it true](../standards/e2e/assertions.md),
so the rule that would have caught it is now written. The remaining work is in `e2e/`, which this
agent does not edit.

## Proposed Standard

No new rule — an application of one that now exists. Three concrete changes, in one pass:

- Rewrite the comment to the layered behaviour as it is: the operational layer runs, a row stands
  down only when a failed content pass names it in `blocks`, and the whole-layer skip is for an
  unreadable config alone.
- Rename `DOCTOR_SKIP_AFTER_CONTENT_ERRORS` to match the product's `SKIP_AFTER_CONFIG_ERROR`, and
  keep the value duplicated verbatim as its neighbours already are.
- Add the per-row sentence as its own member and give it one positive E2E assertion, seeding an
  input a blocked row genuinely reads (a broken marketplace for `Skills Resolved`, a broken registry
  for `Plugins Installed`). A negative about the blanket sentence is not a claim about the scoped
  one, and until the positive exists nothing at this layer can tell the two skips apart.

The general form is already in `documentation-bible.md`'s old-name rule: a renamed symbol's old
spelling is grepped for before the change is called done. `e2e/pages/constants.ts` duplicates product
strings deliberately and nothing binds the prose around them to the source they were copied from, so
that grep is the only thing that would have reached this file.
