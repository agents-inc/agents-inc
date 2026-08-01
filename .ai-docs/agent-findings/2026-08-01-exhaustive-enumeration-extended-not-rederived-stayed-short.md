---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
  - .ai-docs/standards/documentation-bible.md
  - e2e/pages/constants.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-01
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: rule-not-specific-enough
status: partial
partial_note: >
  Both enumerations are corrected and now match disk member-for-member (74), and each doc carries a
  PARTIAL-VALIDATION annotation naming what was re-derived. `reference/testing/e2e-infrastructure.md`
  gained a "Count ownership" note naming the other surface. Pending: the rule below — that an
  exhaustive enumeration must be re-derived as a SET rather than extended, and that a count must be
  re-derived in the same session that records it — is not written into
  `.ai-docs/standards/documentation-bible.md`, which is convention-keeper's file.
---

## What Was Wrong

`STEP_TEXT` in `e2e/pages/constants.ts` is enumerated **exhaustively, with a count**, in two docs
with different owners:

| Doc                                                | Owner        | Claimed count | Actual |
| -------------------------------------------------- | ------------ | ------------- | ------ |
| `.ai-docs/standards/e2e/README.md`                 | codex-keeper | 72            | 74     |
| `.ai-docs/reference/testing/e2e-infrastructure.md` | codex-keeper | 64            | 74     |

Both were wrong on 2026-08-01. The interesting one is the README: it had been **re-counted the day
before**, on 2026-07-31, and its annotation says so —

> re-counted STEP_TEXT from source (50 -> 64) ... all 72 members (re-counted on disk 2026-07-31; the
> previous "64" predated eight members, seven of which the table below had never listed)

— and it was _still_ short by two. The two it missed, `FOOTER_HOTKEY_ROW` and `LOGO_BANNER`, had
**never appeared in any doc**, at any count, in any revision.

The existing rule ("Exhaustive Enumeration over Glob Shorthand" in `documentation-bible.md`) says to
prefer exhaustive name lists over `etc.` shorthand. It is correct and both docs complied. The rule
that is missing is about **how the list is rebuilt**.

### The mechanism

An enumeration is naturally maintained by **extension**: read the release notes, find the members
that were added, append them, add the delta to the count. That is what "the previous 64 predated
eight members" describes — a delta, not a re-derivation. Extension can only ever find members
somebody wrote down somewhere. It structurally cannot find a member that was added silently, and
`FOOTER_HOTKEY_ROW` and `LOGO_BANNER` are exactly that: both are internal test-harness sentinels
introduced alongside product fixes, neither is user-visible, so neither appears in a changelog.

Re-deriving the **set** — extract every member name from source, diff against the doc's list — finds
them in one command and takes no longer:

```
awk '/^export const STEP_TEXT/,/^} as const/' e2e/pages/constants.ts \
  | grep -oE '^  [A-Z_0-9]+:' | tr -d ' :' | sort
```

The same command run against the doc's own table and `comm`-diffed is the whole check.

### Why this is worse than a stale prose paragraph

An exhaustive list **that is short reads as authoritative**. A doc that says "`STEP_TEXT` contains
step sentinels, footers, and so on" prompts an agent to go look at the source. A doc that says "all
74 members:" followed by a list prompts it not to. A spec author who needs a footer sentinel and
finds no `FOOTER_HOTKEY_ROW` in an "all members" list concludes it does not exist and writes a local
constant — which is the inline-constant violation `standards/e2e/anti-patterns.md` § "Hardcoded
Strings" exists to prevent. The doc's completeness claim actively causes the violation.

This is the same shape as the phantom `PIPELINE_MATRIX` that survived 8 days behind an `etc.`, and
the `# All 39 Zod schemas` annotation that survived a week across two syncs
(`2026-07-30-doc-index-pins-counts-that-only-the-indexed-doc-revalidates.md`, resolved). Both of
those were caught by re-deriving. This one shows that **recording a re-derivation is not evidence
one happened** — the README's annotation asserts a from-source recount that produced a number two
short of the source.

## Fix Applied

- Both enumerations re-derived from `e2e/pages/constants.ts` as a set and diffed with `comm`. Both
  now match disk member-for-member at 74, verified in both directions (nothing on disk missing from
  the doc, nothing in the doc missing from disk).
- `FOOTER_HOTKEY_ROW` added under "UI elements"; `LOGO_BANNER` given its own "Stack-step banner"
  group in the README table. `e2e-infrastructure.md` gained all ten members it was missing.
- `reference/testing/e2e-infrastructure.md` gained a **Count ownership** note naming
  `standards/e2e/README.md` as the only other surface carrying the number, with the instruction to
  grep the other for the old value in the same session. The README carries the mirror note.
- Both docs carry a dated PARTIAL-VALIDATION annotation stating what was re-derived and what was
  not, rather than a re-stamped `last_validated`.

The same pass found the identical shape in the spec-file counts: `e2e/commands` was recorded as 30
against 31 on disk and `e2e/interactive` as 47 against 54, with **no** renames or deletions — pure
extension drift, eight files appended to disk and never to the doc.

## Proposed Standard

For `.ai-docs/standards/documentation-bible.md`, extending "Exhaustive Enumeration over Glob
Shorthand" (which currently establishes only that the list should be exhaustive, not how to rebuild
it):

> **An exhaustive enumeration must be re-derived as a SET, never extended by a delta.** Extract every
> member from source and diff it against the doc's list in both directions; do not read the release
> notes for what was added and append. Extension can only find members somebody wrote down, and the
> members most likely to be missing are the ones nobody did — internal sentinels and test-harness
> constants introduced alongside a product fix appear in no changelog. `STEP_TEXT` was re-counted
> from source on 2026-07-31, recorded as "all 72 members", and was short by two members that no doc
> had ever listed.
>
> **An enumeration you did not re-derive this session must not carry a completeness claim.** Drop
> "all N members" to a scope description rather than leaving a stale total, because an exhaustive
> list that is short is worse than a glob: it reads as authoritative and stops the reader checking
> the source. This is the enumeration-level form of the existing "Re-derive, never carry forward"
> rule in the Map Self-Consistency Audit, which today binds only that audit's own counts.
>
> **A recorded re-derivation is not evidence one happened.** When a validation annotation claims a
> from-source recount, the next pass re-derives anyway. The annotation records intent; only the diff
> records the result.

Second, narrower rule for the same section:

> **A file-count claim about a directory must be produced by listing that directory, never by
> incrementing.** Every per-directory spec total in `reference/testing/e2e-infrastructure.md` drifted
> upward-only across three releases (commands 30/31, interactive 47/54) with zero renames or
> deletions — the signature of counts maintained by addition. The lifecycle directory, which happened
> to be re-listed in full at its last pass, was exact.
