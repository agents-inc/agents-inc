---
type: standard-gap
severity: medium
affected_files:
  - src/cli/utils/__mocks__/fs.ts
  - src/cli/utils/__mocks__/logger.ts
  - src/cli/lib/__tests__/manual-mock-parity.test.ts
standards_docs:
  - .ai-docs/agent-findings/README.md
  - .ai-docs/reference/testing/infrastructure.md
date: 2026-08-19
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The parity spec the predecessor finding parked now exists as
  `src/cli/lib/__tests__/manual-mock-parity.test.ts`. It reads both sides off the modules
  themselves rather than off a restated list, names every manual mock the tree holds so a new one
  is measured from its first day, and carries an empty `DELIBERATELY_ABSENT` map for the omissions
  that are worth their cost. Installing it measured the second mock for the first time and it was
  short two exports; both are now present. The two mock files also carry a header stating why a
  partial mock is not merely a smaller one, which is where the next author looks. The durable half
  landed with it - `.ai-docs/agent-findings/README.md` now carries "Closing a finding sweeps its
  class, or says why it did not" under Resolution Model, so this file's Proposed Standard is a
  record of where that rule came from rather than an outstanding request.
---

<!--
Deliberately NOT linked to `2026-08-18-a-partial-manual-mock-spawns-inline-copies-of-itself.md`
with `supersedes:`. TEMPLATE.md rule 3 makes that key a mirrored pair and obliges the target to
carry `status: superseded`, which would be false — the predecessor's own fix landed and its
surviving inline copy is still real. The relationship is "the sibling it did not open", and the
frontmatter has no key for that, so it is stated in prose below.
-->

## What Was Wrong

The predecessor finding opened `src/cli/utils/__mocks__/logger.ts`, found four spies declared
against eight value exports, fixed it, and wrote up the class: a partial manual mock hands the
module under test `undefined` where it expected a function, so the TypeError is raised inside the
code under test and reads as a product defect.

**The directory it took that instance from held exactly two files.** The second,
`src/cli/utils/__mocks__/fs.ts`, was short by `readFileSafe` and `isDirectoryEmpty` — two of the
fourteen exports its module declares — and nothing in the pass that fixed the first one looked at
it. Opening it cost one `ls`.

The census is one command, and it is the whole population:

```
find src -type d -name '__mocks__'
```

One directory, two files. The measurement that matters is the ratio the fix was scoped at:
**one of two instances corrected, in a class whose entire population fits on one screen.** No
judgement was made about the second file — not "it is fine" and not "it is out of scope"; it was
never a subject.

The mechanism is not carelessness. It is that a finding's `affected_files` reads as the population
when it is only the instance. The predecessor named a file and described a class, and the sentences
that describe the class are the ones a reader remembers, so the file list quietly became the
worklist. Nothing in the finding, the frontmatter or the review asks the one question that separates
the two: **is this every member, and if not, what happened to the rest?**

## Fix Applied

The runnable half the predecessor parked, and the sweep it should have carried:

- `src/cli/lib/__tests__/manual-mock-parity.test.ts` compares each manual mock's runtime export
  keys against its module's, both read by importing the two files rather than by restating either
  list. A second copy of either side would agree with itself whichever way the module moved.
- It also asserts that the roster of manual mocks IS the glob's output, so a mock added tomorrow
  cannot be the one nothing measures — the failure mode this whole class is made of.
- `DELIBERATELY_ABSENT` is the escape hatch and it is empty. An omission is a `undefined` at a call
  site, so an entry there has to be worth that.
- The two missing `fs.ts` spies were added, and both mock files now open with a comment saying why
  the parity is load-bearing rather than tidy.

**Not fixed, and named rather than left implicit:** the parity spec can only measure a file that is
in `__mocks__/`. The inline `vi.mock` factory in
`src/cli/lib/operations/source/ensure-marketplace.test.ts` — the copy the predecessor deliberately
left standing as a specimen — is invisible to it, because a spec that never imports the mock cannot
be compared with it. That half of the predecessor is still open and its own file records it.

## Proposed Standard

For `.ai-docs/agent-findings/README.md` → "Resolution Model", as a step in closing a finding rather
than a new document:

> **When a finding names a file as an instance of a class, the fix sweeps the class — or the
> finding says why it did not.** Write the sweep as a command and its result: "the class is
> `<grep or glob>`, N members, all N corrected", or "N members, M corrected, the rest are `<reason>`".
> A file list is evidence about one instance; a class claim in the prose beside it is what the next
> reader acts on, and nothing currently makes the two agree. Where the class is small enough to
> enumerate — this one was two — enumerating it is cheaper than the sentence explaining why it was
> not.

This is the same demand `README.md` → "Writing a Finding" already makes of counts ("say whether a
count is a census or a sample"), applied to the FIX rather than to the discovery. Cross-checked
against `CLAUDE.md`: it conflicts with nothing there, and it is the natural companion of
"ALWAYS grep for the old value when changing test data or renaming anything" — that rule sweeps a
rename's class and this one sweeps a defect's.

The narrower, mock-specific rule this replaces is already runnable and needs no prose: a manual mock
mirrors its module's export list, and the spec above is the enforcement.
