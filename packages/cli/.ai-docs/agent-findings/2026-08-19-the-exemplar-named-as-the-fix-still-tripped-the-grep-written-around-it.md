---
type: standard-gap
severity: medium
affected_files:
  - src/agents/reviewer/reviewer/playbook.md
  - .ai-docs/standards/prompt-bible.md
standards_docs:
  - .ai-docs/standards/prompt-bible.md
date: 2026-08-19
reporting_agent: agent-summoner
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The parenthetical naming this repository's findings directory and template was dropped from
  `reviewer/playbook.md`, leaving the project-agnostic sentence the exemplar was cited for. The
  verification grep now returns nothing, so `prompt-bible.md` § 8.6 could be written as "it must
  return nothing" rather than as an aspiration.
---

## What Was Wrong

A repo-internal findings instruction was to be removed from six shipped agent partials, and
`reviewer/playbook.md` was cited as the exemplar to match, on the strength of its softened opening:
"record a finding the way this project's conventions direct". The rule was to ship with a one-line
check — `grep -rn "ai-docs\|CLAUDE\.md" src/agents/ --exclude-dir=meta` should return nothing.

Running the check before writing the rule around it returned **seven** hits, not six. The seventh was
the exemplar. Its full sentence read:

> record a finding the way this project's conventions direct (for this repository:
> `.ai-docs/agent-findings/` using its `TEMPLATE.md`)

The softening had reached the clause and stopped at the parenthetical. And the parenthetical is not a
harmless remainder: "for this repository" is read in the installing project as **their** repository,
so it resolves to a path that does not exist there — the exact defect the sentence in front of it was
written to remove, restored by the qualifier meant to scope it.

Had the check not been run first, the rule would have shipped with a verification that fails on the
day it lands, against the file held up as the example of compliance.

## Fix Applied

Dropped the parenthetical. The sentence now ends at "the way this project's conventions direct", and
the grep returns nothing.

## Proposed Standard

Two rules, both about the same habit.

1. **Run a check before writing the sentence that claims it passes.** A rule that ships with "this
   grep must return nothing" and a tree that returns something is worse than no check: the next
   reader treats the failure as the check being wrong.
2. **An exemplar is a file, not a sentence.** Naming one as "the fix to match" asserts the whole file
   complies. Before citing it, run the check against it — it is one of the files under test, and it
   is the one nobody thinks to look at.

The general shape: a softening pass that rewrites a rule's main clause and leaves its scoping
parenthetical has not softened the rule, because the parenthetical is where the concrete path lives.
Grep for the path, never for the phrasing.
