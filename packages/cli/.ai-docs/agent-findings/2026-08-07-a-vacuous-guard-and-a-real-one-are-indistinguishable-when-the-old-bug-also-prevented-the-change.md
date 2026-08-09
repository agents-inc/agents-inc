---
type: standard-gap
severity: medium
affected_files:
  - e2e/lifecycle/install-update-source-drift.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-07
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: The one spec in this class was mutation-checked through its FIXTURE and the technique recorded here; the standard that would make the technique the expected move is not written.
---

## What Was Wrong

The E2E standard says "mutation-check every regression guard — revert the fix in `src/`, rebuild,
confirm it is red **and red for the reason the test name claims**". That instruction assumes the
pre-fix binary can express the defect the guard forbids. There is a class where it cannot, and the
`update` rewrite (CLI-428) produced a clean example of it.

The new drift spec asserts that after `update` runs, an ejected skill's `SKILL.md` is **byte-identical**
to what it was before, even though the source it was forked from gained a section in between —
"unaffected" is the guarantee the owner's ruling made. Run that spec against the pre-rewrite binary
and it is **green**, because the old command's own defect (a local skill installed under its own id
shadowed the source entry, so every such skill classified `local-only` and was skipped) meant it
copied nothing either. The old bug and the new guarantee produce identical bytes on disk.

So the prescribed mutation check — revert, rebuild, watch it go red — cannot distinguish this spec
from one that asserts nothing at all. Neither can reading it. A reader who applies the standard
literally, sees green against the unfixed binary, and concludes "already covered" would have
shipped a spec that can never fail.

## Fix Applied

Mutation-checked through the FIXTURE instead of through `src/`: one line appended to the INSTALLED
`SKILL.md` inside `beforeAll`, immediately before the `update` run. The spec went red on exactly the
assertion whose message claims the guarantee ("the ejected SKILL.md is the user's copy — an update
must not carry the source edit into it"), which proves the before/after comparison is live, reads
the file the spec names, and is not comparing a string to itself. The line was then removed and the
spec re-run green.

The spec also carries a proof-of-execution assertion in the same `it()` — the source file, re-read
after the edit, must contain the marker — so a fixture whose edit silently failed to land cannot
make the byte comparison hold for the wrong reason.

## Proposed Standard

Add to `.ai-docs/standards/e2e/README.md`, under "Mutation-check every regression guard":

> **When the pre-fix binary cannot express the defect, mutate the FIXTURE instead of `src/`.** A
> spec asserting that an operation leaves something UNCHANGED cannot be reverted into redness when
> the old behaviour also left it unchanged — a bug that skipped the write and a guarantee not to
> write are the same bytes. Make the subject change by hand at the point the operation would have
> changed it, confirm the spec goes red on the assertion whose message claims the guarantee, then
> remove the mutation. Record in the spec's JSDoc that this is how it was checked, so the next
> reader does not repeat the `src/`-revert and conclude from a green run that the spec is vacuous.

The rule is worth writing because the class is not rare: every "must not touch", "must not
recompile", "must not rewrite the config" assertion is in it, and the suite has several.
