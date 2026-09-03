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
reporting_agent: web-developer
category: architecture
domain: web
root_cause: missing-rule
status: partial
partial_note: >-
  The production site this finding names is closed — a refused adoption keeps the local slot and
  names the conflict. **Its CLASS is not.** Executing the path on 2026-09-02 showed the kept slot
  disappears on the next unrelated Save, because `save` clears `unadopted` and `adoptLocalStack`
  never recomputes it once the account holds stacks. Filed as EDITOR-73 and pinned with
  `test.fail()`. The rule this finding states — the condition hiding B must be "A arrived", never
  "A was attempted" — is correct and was obeyed; what it does not say is how long "A arrived" has to
  keep being true.
resolved_by: "`adoptLocalStack` returns the refusal instead of swallowing it, and the grid keeps drawing the local slot with a sentence naming the scope conflict. EDITOR-67."
---

# A replacement that fails leaves the user with neither

## What happened

The editor's stack grid draws an account's saved stacks **in place of** the one local
snapshot a signed-out visitor can keep. One list, not two that disagree — a deliberate
and well-documented decision. The substitution is made safe by `adoptLocalStack`, which
on a first sign-in mints the local snapshot to the account so the thing being hidden has
already become the thing being shown. Its own docblock opened with
`WITHOUT THIS, SIGNING IN LOOKS LIKE LOSING YOUR WORK`.

CLI-851 then taught the editor to refuse an unwritable payload before the POST — a
project-scoped skill assigned to a sub-agent resting at global scope. That refusal is
correct and it is load-bearing: the local slot is deliberately allowed to hold such a
configuration, because opening one and repairing it in a click is the whole of EDITOR-08.

But the mint is now reachable-and-refusable, and the guard that received the refusal was
`if (!minted.ok) return stacks` — returning the account's list, which is empty, because
adoption only runs against an empty list. So the grid drew neither the account's stacks
nor the local slot. Park a scope-conflicted configuration, sign in, and it is gone from
the screen with nothing said. The function's own docblock had become a description of
what it did.

## The mechanism, which is the part that generalises

**The code that hides B and the code that produces A are in different files, and only
one of them can see a refusal.** The store knew the mint failed. The grid knew only
`account !== null`, which is not "the account has your work" but "somebody is signed in
— stop drawing the local copy". Those two propositions were identical for as long as
adoption could not fail, and nothing anywhere asserted they were the same proposition.

Three properties made it invisible:

- **A refusal returning the prior value type-checks perfectly.** `return stacks` is a
  `RemoteStack[]` and so is the success path. There is no signature to get wrong.
- **The failure is consistent**, so it does not read as a flake. Every load of that
  browser loses the same snapshot the same way.
- **The reporting seam fired correctly and told nobody who mattered.** The console
  carried `[issue] Share POST refused a configuration nobody could install` with the
  offending pair named in full. The person at the keyboard saw an empty grid.

## The standard this is missing

> **Where a surface shows A in place of B, the condition that hides B must be
> "A arrived", never "A was attempted".**

A substitution is a promise that nothing was lost. The moment the production of A gains
a failure mode, that promise needs a value carried from wherever the failure is known to
wherever the hiding is decided — and the two are almost never the same module. The
questions to ask of any such pair:

1. Can the thing that replaces B be refused? If not today, can it be tomorrow?
2. Does the condition that hides B distinguish "replaced" from "tried to replace"?
3. When the replacement is refused, which of A and B is on screen? "Neither" is data loss.

**A refusal that leaves the user's work unreachable is data loss whether or not the bytes
survive.** The snapshot was in localStorage the whole time; it would have come back on
sign-out. That is no comfort in the moment it vanishes, and no user knows to try it.

## Where else this shape can occur

Census run over `apps/editor/src` for consumer-level refusal guards
(`grep -rn 'if (!\w*\.ok)' --include='*.ts' --include='*.tsx'`): every other one narrates
its refusal onto a surface — `setRefusal` on the roster's Save button, `onAttempt` in the
nav rail, `sayCatalogue` on the import notice, `setProposal` in the composer. One
instance, no siblings.

The one adjacent case is `use-apply-stack-request.ts`, where a failed fetch of an
account stack's payload changes nothing on screen. It is documented as deliberate and it
loses nothing — the selection the person is looking at is untouched — so it is a
different class (an unresponsive control) and was left alone.

A second-order note, not fixed here because it is a different owner's file:
`listStacks` in `lib/api/stacks.ts` answers `[]` for a 401 **and** for a 500. Adoption
keys on `stacks.length === 0`, so a failed list read against an account that does have
stacks is indistinguishable from a first sign-in — which would re-upload the local slot
as a duplicate, and now also produces a notice saying the account holds nothing when it
may not. Pre-existing and unchanged by this work.

## How it is now caught

`accounts.spec.ts` pins the refusal and the permitted case **in the same file**, which
is the repository's rule and is doing real work here: both cells are named
`Saved stack`, so a spec asserting only that one is visible cannot tell an adopted
account row from the local slot. The members line separates them — an account row says
`saved to your account` because the payload is behind a pointer, and the local slot lists
what it holds. The permitted spec also asserts the notice is **absent**, so the channel
the refusal spec reads a sentence on is exercised in both directions.
