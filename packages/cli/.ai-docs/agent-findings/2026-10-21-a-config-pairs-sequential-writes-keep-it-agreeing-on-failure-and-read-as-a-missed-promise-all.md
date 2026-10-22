---
type: standard-gap
severity: low
affected_files:
  - src/cli/lib/config-gate/pair-writer.ts
  - src/cli/lib/config-gate/propagate.ts
  - src/cli/lib/config-gate/__tests__/the-pair-writer-writes-only-what-changed.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Each config pair is written as two sequential awaits: the `config.ts` half, then the
`config-types.ts` half (`writeGlobalPair` and `ensureBlankPair` in `pair-writer.ts`,
`writeProjectConfigPair` in `propagate.ts`). The two writes do not depend on each other's results,
so the expressive-ts skill's Pattern 7 rule, "sequential `await` on independent operations is a
hidden performance bug — use `Promise.all`", reads as if it applies to them.

It does not. The order is what keeps the pair agreeing when a write fails. Sequentially, a rejected
config write means the types half is never attempted, so both halves stay as they were.
`Promise.all` does not cancel the other member, so the types half would be rewritten for a config
that never landed. Nothing says this: no comment at the three sites, and no test. The
`the-pair-writer-writes-only-what-changed.test.ts` specs all succeed or are refused by the gate
token before either write, so a `Promise.all` rewrite stays green.

Found during the X3 expressive-ts round 1 (Patterns 1 and 7), which left all three sequential.

## Fix Applied

None — discovery only. The sites were left sequential and uncommented: test files are outside this
lane, and a comment with no test behind it is the weaker half.

## Proposed Standard

Hardening, which is cheap: a spec in `the-pair-writer-writes-only-what-changed.test.ts` that makes
`config.ts` unwritable, calls `writeGlobalPair` with a config whose types also change, expects the
rejection, and asserts that `config-types.ts` is byte-identical. It reddens under `Promise.all`.

Standard: `clean-code-standards.md` should say that two writes describing one artefact (a config
pair, a manifest and its index) are sequenced on purpose. Where the order is load-bearing, a test
of the failure path holds it, and that test is what tells an expressive-ts pass to leave it alone.
This does not conflict with CLAUDE.md, which says nothing on write ordering.
