---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/standards/typescript-types-bible.md
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-19
reporting_agent: codex-keeper
category: typescript
domain: shared
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The corrected rule is `typescript-types-bible.md` § 6a, written with the measured table rather
  than with the blanket claim. The finding it replaces
  (`2026-08-17-find-on-a-discriminated-result-array-cannot-narrow-and-needs-a-second-guard`) was
  deleted once its rule landed; its INDEX row carries the correction so the false sentence does not
  survive as the only trace.
---

## What Was Wrong

A finding in this corpus asserted, as the premise of its Proposed Standard, that `.find` over an
array of `{ ok: true } | { ok: false }` "returns `T | undefined`, and the predicate's narrowing is
not carried out of the callback", so every use "needs a second guard that is dead at runtime". The
proposed rule was written as a blanket ban.

The premise is false for the most common shape under this repository's compiler (TypeScript 6.0.3),
which infers a type predicate for a plain callback. Probed directly rather than reasoned about:

| Callback shape              | Narrows? |
| --------------------------- | -------- |
| `(f) => !f.ok`              | yes      |
| `(f) => { … return bad; }`  | yes      |
| `({ ok }) => !ok`           | **no**   |
| `(f, i) => !f.ok && i >= 0` | **no**   |

Destructuring the discriminant away, or reading the index parameter, is what drops the inference.

Two consequences the original framing got backwards, and the second is the one worth keeping:

1. **`src/cli/lib/installation/local-installer.ts` would have been reported as a defect by a rule
   written from the blanket claim.** `outcomes.find((outcome) => !outcome.ok)` followed by
   `if (failure) throw failure.error` compiles with no second guard, because `AgentWriteOutcome`'s
   `error` sits only on the `ok: false` arm and the inference reaches it. It is correct code.

2. **The lint signal points the opposite way to what the finding said.** The finding observed that
   `@typescript-eslint/no-unnecessary-condition` "caught one of them and did not catch the other",
   and read that as half the class escaping the gate. It is the reverse: the rule fires on the
   second guard precisely when the inference DID land and the guard is therefore redundant — the
   good shape. Where the inference did not land the guard is load-bearing, so lint stays quiet. A
   green lint on `x && !x.ok` is evidence of the bad shape rather than of its absence.

The finding also named `.ai-docs/standards/typescript.md` as the home for its rule. No such file
exists in this package.

## Fix Applied

`typescript-types-bible.md` § 6a states the measured boundary, the inverted lint signal, and the
walk as the preferred form in either case — with the original finding's two correct sub-points kept
(a single result needs nothing; an explicit type predicate is worse, because it restates the
discriminant in a second place and a third variant then type-checks and is silently skipped).

The section carries the grep that finds both non-narrowing shapes, and says what it cannot find:

```
grep -rnE '\.(find|filter)\((\(\{ *(ok|success|valid)\b|\([a-zA-Z]+, *[a-zA-Z]+\) *=> *!?[a-zA-Z]+\.(ok|success|valid)\b)' src/ e2e/ scripts/ --include='*.ts' --include='*.tsx'
```

Clean across `src/`, `e2e/` and `scripts/`.

## Proposed Standard

Already written as § 6a. The general lesson belongs beside README.md's "A Proposed Standard is a
proposal": **a proposal whose premise is a compiler behaviour is a claim that can be measured, so
measure it.** This one cost four probe lines and a `tsc` run. A rule stated from the general
behaviour of `Array.prototype.find` rather than from this compiler's would have flagged correct code
in one workspace as a defect, and — worse — would have taught readers to trust a green
`no-unnecessary-condition` as evidence the shape was absent, when it means the opposite.
