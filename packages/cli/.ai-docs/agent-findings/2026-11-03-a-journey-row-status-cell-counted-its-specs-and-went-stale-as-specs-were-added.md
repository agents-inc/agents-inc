---
type: standard-gap
severity: low
affected_files:
  - .ai-docs/standards/e2e/user-journeys.md
  - src/cli/lib/__tests__/spec-gates.test.ts
  - src/cli/lib/__tests__/helpers/journey-page.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-11-03
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  Landed: row 10's Status cell names what each spec covers and counts nothing. Pending: no rule or
  check keeps a Status cell's prose true; `spec-gates.test.ts` reads only its bold marker.
---

## What Was Wrong

At 2c171d00, journey row 10 (`update`) named five specs in its From-scratch column. Its Status cell
read "**COVERED** for the eject branch, and by ONE of the two named specs", said the claim rested
entirely on `lifecycle/install-update-source-drift`, and called the row "one spec short of being a
real hole". The three other `lifecycle/` specs it named each install through a real `init --from`
and then run `update`, so the row had four from-scratch specs while its prose said it had one.

Nothing noticed. `spec-gates.test.ts` reads a row's `marker` (the bold COVERED or TO TEST) and checks
it against whether every named spec begins from a fixture. The prose after the marker is unread, so
a count in it goes stale the day a spec is added.

## Fix Applied

The cell was rewritten in the REPO-55 follow-ups: COVERED, then which branch each `lifecycle/` spec
covers, with no count. This finding is discovery for the rest; nothing else changed.

## Proposed Standard

`user-journeys.md`, beside the coverage vocabulary: a Status cell's prose says what each named spec
covers and never counts the specs, since the From-scratch column is the list. A count can only be
held by a check, and deleting it is cheaper than writing one. No check or grep would catch a new
count; a reviewer reading the cell against its From-scratch column is the only one.
