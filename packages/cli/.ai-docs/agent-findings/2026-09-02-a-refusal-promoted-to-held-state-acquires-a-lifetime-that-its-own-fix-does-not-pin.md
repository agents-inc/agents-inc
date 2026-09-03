---
type: missing-standard
severity: high
affected_files:
  - apps/editor/src/stores/account-store.ts
  - apps/editor/src/features/configure/components/stack-grid.tsx
  - apps/editor/e2e/specs/accounts.spec.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-09-02
reporting_agent: web-tester
category: testing
domain: web
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  EDITOR-73 (2026-09-03). `save` stopped writing `unadopted` at all — a writer that cannot know what
  it is asserting should not assert it — and `adoptLocalStack`'s account-has-stacks branch now
  recomputes the reason from the write contract locally, without a request. The second axis this
  finding proposed (drive one unrelated successful operation between the refusal and the assertion)
  is now pinned in `accounts.spec.ts` with its permitted twin, and in a new
  `account-store.test.ts` that pins the store's decision table directly.
---

# A refusal promoted to held state acquires a lifetime that its own fix does not pin

## What happened

EDITOR-67 fixed a data-loss path in the editor's stack grid, and the fix was to stop
discarding a refusal. `adoptLocalStack` used to answer `if (!minted.ok) return stacks`;
it now answers `{ stacks, unadopted }`, and the grid keeps drawing the local slot beside
a `role="alert"` notice for as long as `unadopted` is non-null. The predecessor finding
is `2026-09-02-a-replacement-that-fails-leaves-the-user-with-neither`, which is marked
`resolved`.

**The path reopens one Save later, and it was executed rather than argued.** Sign in with
a scope-conflicted local snapshot, see the notice, then save an unrelated stack — a plain
catalogue stack the write contract accepts. `save` in `account-store.ts` sets
`unadopted: null` whenever ANY save lands, so the grid's `keepsLocalSlot` (which is
`!account || unadopted !== null`) goes false and the local slot leaves the screen with
its notice. A reload does not bring it back: `adoptLocalStack` returns early on
`stacks.length > 0`, so adoption is never attempted again and the reason is never
recomputed. The snapshot is still in localStorage and still in neither list — which is
word for word the shape the predecessor named as the defect.

The reproduction is now pinned in `accounts.spec.ts` as a `test.fail()`, per the editor
suite's own rule that a live defect is an expected failure and never a skip.

## Why nothing caught it

**The repository's rule about pinning refusals was followed exactly, and it does not
reach this.** `packages/cli/CLAUDE.md` says never to pin an operation as REFUSED without
pinning, in the same file, a state where the same operation is ALLOWED — because a
refusal on its own cannot tell a correctly-scoped guard from one that has swallowed its
domain. EDITOR-67 has both halves, in one file, each carrying a comment saying neither
means anything without the other. They are a model application of the rule.

Both halves assert at the same instant: the first paint after sign-in. The rule
constrains WHAT a refusal spec must be paired with; it says nothing about WHEN either
half is observed, so a pair that is complete in the permitted/refused dimension can be
complete at exactly one moment in time and blind to every moment after it.

Two further things made the gap read as covered:

- **The store asserts the invariant in prose, emphatically.** `unadopted`'s comment says
  it is non-null "only while the account holds nothing of this browser's work, which is
  an invariant rather than a coincidence", and `save`'s comment says clearing it is "what
  keeps `unadopted`'s invariant true". The premise is that a save is this browser's work
  reaching the account. It is not, when what was saved is a different selection — and a
  comment claiming an invariant is the most effective way to stop the next reader
  checking whether the code beside it holds one.
- **The predecessor's census asked the wrong question of the right code.** It censused
  consumer refusal guards in `apps/editor/src` for other sites that hide B on "A was
  attempted", and correctly found none. Promoting a refusal from a discarded value to
  held state creates a second, unrelated population — every writer of that state — and
  nothing directed the census there.

## The class

**A guard that returns a refusal is a decision; a guard that STORES one is a decision
with a lifetime, and the two need different coverage.** The moment a refusal stops being
a return value and becomes a field, three questions appear that did not exist before, and
the fix that introduces the field is written while none of them are visible:

1. **Who else writes this field?** Not who reads it — readers are found by following the
   type. `unadopted` has one reader (`stack-grid.tsx`) and four writers, three of them in
   `refreshOnce`/`adoptLocalStack` where the author was looking and one in `save`, which
   is a different feature.
2. **On what event does it clear, and is that event the same event that made it true?**
   Here it clears on the success of a neighbouring operation, on a premise about that
   operation ("a save means this browser's work reached the account") that the operation
   does not enforce.
3. **Can the condition that produced it be recomputed later?** Here it cannot:
   `adoptLocalStack` short-circuits on a non-empty list, so once cleared the field can
   never be re-derived and the loss is permanent for as long as the person stays signed
   in.

## Proposed standard

For `.ai-docs/standards/e2e/assertions.md`, beside the permitted-twin rule rather than
replacing it — the twin rule is right and this is its second axis:

> **A refusal held as STATE is pinned at two moments, not one.** The permitted/refused
> pair proves the guard is scoped correctly at the instant the refusal is produced. When
> the refusal is retained — a field, a store slot, anything a later render reads — add a
> third spec that drives one unrelated successful operation between the refusal and the
> assertion. The operations that clear such a field are usually in another feature's
> module, so the writer census is the test: `grep` the field name across the workspace
> and account for every assignment, not every read.

And the census habit that would have found it, which is cheap enough to run at the moment
any refusal becomes a field:

```
grep -rn '<field>' apps/<app>/src --include='*.ts' --include='*.tsx'
```

Read the assignments. Every one that is not in the module that produced the refusal is a
lifetime the specs do not cover until one says so.

## Not fixed here

Deliberately. The verifier is never the fixer, and the resolution is a design question
this lane has no standing to answer: what `unadopted` should hold once an account has
stacks of its own is the fix's subject, and the pinned spec asserts the loss rather than
any particular answer to it. The reload half is named in the spec's comment and
deliberately left unasserted for the same reason.

The predecessor finding's `status: resolved` is now too strong — its production site is
closed and its class is not. Repointing it is an edit to a file this lane does not own
and is reported to the orchestrator as a diff rather than made.
