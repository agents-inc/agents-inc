---
type: standard-gap
severity: low
affected_files:
  - src/cli/stores/preselection-rebuild-one-entry-per-slot.test.ts
  - src/cli/lib/__tests__/spec-filenames.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-21
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: "The offender is renamed and src/cli/lib/__tests__/spec-filenames.test.ts now holds every spec basename against the tracker ID shapes. What has not moved is the wording of the rule itself: CLAUDE.md and standards/e2e/README.md both enumerate three locations and neither names the filename, so the gate is currently stricter than the prose it enforces. Both files are owned outside this lane."
---

## What Was Wrong

The rule against task IDs in tests is written as an enumeration. CLAUDE.md § Test Data:

> NEVER put TODO/task IDs in test names (`describe()`, `it()`), assertion messages (2nd arg to
> `expect`), or inline test comments.

`standards/e2e/README.md` § File Naming repeats the same three, and adds that file-level JSDoc is
the only permitted location. Neither names the **filename**, and
`src/cli/stores/d227-same-scope-tombstone-duplicate.test.ts` carried D-227 in its name while every
`describe` and `it` inside it correctly said what it pins.

The reason the gap is in the filename specifically is worth stating, because it is the same reason
in both directions. A `describe` string, an `it` string and an assertion message are all string
LITERALS in a syntax tree, which a `no-restricted-syntax` selector can match — and that is how the
three enumerated locations came to be the three. A filename is not in the file; no ESLint rule sees
the path it is linting as text to match. So the one location the ban could not be mechanically
enforced is the one location the enumeration omitted and the one location it was broken.

## Why Nothing Caught It

Every existing gate over the suite asks a question about a spec's CONTENT or its CONFIG membership
— is it collected by a project, is that project opened by a script, does it turn itself off, does a
journey row name it, does it carry a vacuous verdict shape. None reads a basename. The offender was
therefore collected, run, green and cited by name in a changelog and in a finding's `resolved_by`
for a month.

The cost is the ordinary one for a rotted name: the ID stopped meaning anything when the task
closed, and a reader who wants to know what the file covers has to open it — which is exactly what
the rule says about `describe` and `it` names, applied to the larger label above them.

## What Landed

`src/cli/lib/__tests__/spec-filenames.test.ts` holds every `src/**`, `e2e/**` and `scripts/**` spec
basename against the tracker ID shapes (`d227`, `d-227`, `cli-551`, `p4-17`). Three properties are
worth copying rather than the check itself:

- **The prefix roster is stated, not derived.** `todo/` sits above this package and does not ship
  with it, so a roster read from the trackers would answer clean in a published checkout for the
  reason that it could not see anything.
- **The recogniser is anchored at both ends of a hyphen-delimited run**, so `dual-scope`,
  `default-sandbox` and `cli-runner` are left alone. Every one of them opens with a prefix letter,
  and none is followed by a number; being followed by a number is the whole of what makes a name a
  ticket rather than a description.
- **A roster of names it must LEAVE ALONE sits beside the roster it must condemn.** A recogniser
  answering `false` to everything satisfies the tree-wide assertion without reading a single name,
  and only the discriminating half tells that apart from one that works. Both were mutation-checked
  in each direction, along with a floor under the glob's match count.

## Proposed Standard

Add the filename to the enumeration in both places the rule is written, and say why it is listed
separately: it is the member of the list no lint rule reaches, so it is the one the gate in
`spec-filenames.test.ts` exists for. Suggested wording, replacing the parenthetical:

> NEVER put TODO/task IDs in a test's `describe()` / `it()` names, in assertion messages, in inline
> test comments, or in the spec's FILENAME. The filename is called out separately because no ESLint
> selector can reach it — `src/cli/lib/__tests__/spec-filenames.test.ts` is what holds it instead.
> File-level JSDoc is the only permitted location.
