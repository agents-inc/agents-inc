---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/DOCUMENTATION_MAP.md
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/reference/commands/index.md
  - .ai-docs/reference/commands.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-07-30
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  Invariant 4 in documentation-bible.md's Map Self-Consistency Audit now requires verifying the
  pointer set BY NAME, not only by count; a "direction is not implied by path depth" rule was added
  to Splits & Pointers; and all four disagreeing surfaces in DOCUMENTATION_MAP.md were corrected so
  commands/index.md is tracked.
---

## What Was Wrong

`DOCUMENTATION_MAP.md` carries a 5-invariant self-consistency audit. **Invariant 4** reads:

> **Disk vs map:** `Glob reference/**/*.md` count equals tracked-row count + pointer-row count.

It is a pure **arithmetic** check: 41 files on disk = 32 tracked rows + 9 pointers. That equation
held. It has held at every audit since 2026-04-21. And for that entire period the **membership** of
the 9-file pointer set was wrong.

Two of the pointer pairs are _flipped_ relative to the others. In most pairs the subdirectory file
is a stub redirecting to a preserved root original. In these two, the root file is the stub:

| Canonical (body, verified by reading)               | Pointer (redirect only)                     |
| --------------------------------------------------- | ------------------------------------------- |
| `reference/commands/index.md` (631 lines)           | `reference/commands.md` (30 lines)          |
| `reference/wizard/state-transitions.md` (547 lines) | `reference/state-transitions.md` (28 lines) |

Both the iter-43 and the iter-50 audits listed `commands/index` and `wizard/state-transitions`
among the "pointer files intentionally not tracked in the staleness dashboard". The directory
diagram agreed, annotating `index.md # -> commands.md (pointer)`. Because swapping a member for its
partner leaves the _cardinality_ unchanged, every subsequent audit that verified only the equation
reproduced the error and recorded a PASS.

The map even contradicted itself in plain sight: its Reference table row already read
`reference/commands/index.md (canonical; reference/commands.md is now a pointer)`. Three surfaces
said pointer, one said canonical, and no invariant compares surfaces to each other by name.

**The consequence was not cosmetic.** Staleness tracking is what schedules re-validation. Because
the canonical commands reference was classified as an untracked pointer, it got no dashboard row,
no threshold, and no `Days Stale` value — so no sweep was ever scheduled against it. It drifted
through **two releases** (0.145.0 and 0.146.0) still documenting `uninstall --all`, a flag removed
as a breaking change in 0.145.0 and which oclif now rejects outright. An agent following the doc
emits an invocation that fails. That is the worst class of doc drift: not incomplete, actively
wrong, and undetectable by reading the doc.

The `wizard/state-transitions.md` half of the same error was masked by luck — a D-277 batch
re-stamped that file directly, so it stayed current despite also being mis-classified.

## Fix Applied

All four disagreeing surfaces in `DOCUMENTATION_MAP.md` reconciled:

- Dashboard row re-labelled `commands.md` → `commands/index.md (CANONICAL)`; the row formerly
  labelled `state-transitions.md` → `wizard/state-transitions.md (CANONICAL)`.
- Directory diagram annotation corrected, plus a new pointer-direction table naming both flipped
  pairs explicitly.
- The two historical audit entries (iter 43, iter 50) annotated in place with a correction block
  rather than rewritten — the events happened, the enumeration was wrong, and the record should
  show both.
- The `Date basis` note now lists all 9 untracked pointers **with their redirect targets and disk
  dates**, verified by reading each file.

In `documentation-bible.md`:

- Invariant 4 now requires name-level verification and cites this incident.
- A "direction is not implied by path depth" rule added to **Splits & Pointers**, requiring both
  files be read to determine direction.
- `commands/index.md` marked CANONICAL in the bible's own structure diagram and
  "What Each Document Covers" table, which carried the same stale annotation.

## Proposed Standard

Already applied (see above), but the generalisable rule is worth stating on its own, because it is
not specific to pointers:

> **A conservation check is not a membership check.** Any invariant of the form
> `total == partA + partB` is blind to an element moving between `partA` and `partB`. When the
> partition itself is the thing that carries meaning — which doc is tracked, which is skipped, which
> is owned by whom — the invariant MUST enumerate members by name and diff the sets, not compare
> cardinalities. Prefer a check that fails loudly on a swap over one that only fails on a
> gain or loss.

Corollary, for any audit that records its own PASS/FAIL:

> An audit's previous output is not evidence for its current run. Re-derive every count and every
> set membership from disk in the session that records the result. This audit passed four
> consecutive times on a set it never re-enumerated.
