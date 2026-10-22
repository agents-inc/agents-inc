---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/lib/__tests__/commands/edit-from-says-what-it-did.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  REPO-44 follow-up F1-stop-hook-fix-2. The file's first spec declares the same Stop hook and its
  full-output `toBe` carries the notice line again, so the printed case sits beside the withheld
  one.
---

## What Was Wrong

Removing compile's default Stop hook took the trust-notice line out of the first spec's full-output
`toBe` in `edit-from-says-what-it-did.test.ts`. That line was the file's only check that a
successful `edit --from` prints the notice. The fix recorded in
`2026-10-20-removing-a-default-hook-left-a-negative-about-its-notice-with-no-subject.md` gave the
failure spec's `not.toContain` a declared hook to speak for, but it stayed the only notice assertion
in the file. A re-check stubbed `reportWhatThisHostCannotCarry` to return first in the built `edit`,
and the file stayed green at 34 of 34. `packages/cli/CLAUDE.md` forbids that shape: "NEVER pin an
operation as REFUSED without pinning, in the same file, a state where the same operation is ALLOWED".

## Fix Applied

`declareAStopHookOnWebDeveloper` moved to the outer describe. The first spec calls it before
`installReact()`, and its full-output `toBe` carries the notice line between the compile summary and
`✓ Done`. `grep -n "completion gate" <spec>` now returns two lines, the positive and the negative.
Both directions were run against the built `edit`. Stubbing the notice out reddens the first spec,
and deleting the `hasIncompleteWork` guard reddens the failure spec.

## Proposed Standard

The CLAUDE.md rule's census is `ls e2e/*/*guard*`, which cannot see a unit spec or a withheld line
of output. Proposed addition to that rule: when a change deletes a line from a full-output assertion,
grep the same file for the line's opening words. Any negative still naming the line either gets a
positive in the file or is deleted with it. This widens the rule's census and does not conflict with
it.
