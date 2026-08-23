---
type: missing-standard
severity: medium
affected_files:
  - src/cli/components/wizard/stack-selection.test.tsx
  - src/cli/components/wizard/stack-selection.tsx
  - src/cli/stores/wizard-store.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-20
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The instance is closed — the pre-mount control test landed in the same change and is verified by
  mutation. The rule is not written down: CLAUDE.md's existing pair rule is still scoped to
  refusals, so nothing yet generalises it to routing, and the next agent routing a message to a new
  channel has no rule telling them to pin the channel it left.
---

## What Was Wrong

CLAUDE.md's Test Assertions section already carries a pair rule: never pin an operation as REFUSED
without pinning, in the same file, a state where the same operation is ALLOWED. Its reasoning is
that a refusal on its own cannot tell a correctly-scoped guard from one that has swallowed its whole
domain, because both leave the config and the filesystem byte-identical.

Routing a message to a different channel fails in exactly that shape, and the rule does not reach
it. The wizard raises `absentFromSourceWarning` from two kinds of caller. Before the mount, hydration
runs under `enableBuffering()` and the message belongs in the startup band. After the mount, Ink owns
the terminal and stderr is where a message goes to be lost, so the message belongs on the toast.
`startFromScratch` is reached from BOTH — the stack step's scratch row, and `hydrateForInit` when the
loaded source ships no stacks at all.

The obvious implementation is to put the routing inside `startFromScratch`, where both callers get it
for free. That is wrong, and wrong invisibly: `enableBuffering()` RESETS the buffer, so a window
opened inside the action discards everything the load had already buffered and closes again before
hydration has finished speaking into it. The startup band is silently emptied.

**Five mid-session assertions stay green through that mutation.** The toast is set, the store field
is identical, the step advances, stderr stays clean. Nothing in the mid-session direction can see the
band it emptied, because the band is the other channel — and a message has exactly one destination,
so an assertion that a message ARRIVED somewhere says nothing about where it stopped arriving.

## Fix Applied

The routing lives at the call site (`showWarningsAsToast` in `stack-selection.tsx`, wrapping the two
post-mount populations) rather than inside the action, and a control test pins the other direction:
a stackless source hydrated with an unresolvable global preselection must put the warning in the
buffer and leave `toastMessage` null.

Both directions were verified by mutation rather than assumed. Moving the wrapper into
`startFromScratch` reddens the control alone — `expected [] to strictly equal [ Array(1) ]`, the band
empty — with all five mid-session tests still passing. Unwrapping the two call sites reddens the five
and leaves the control green. Neither half is load-bearing without the other.

## The Second Half, Found While Fixing the First

The obvious way to pin "and NOT the other channel" from the mid-session side does not work, and it
fails silently. Opening a logger buffer window around the keypress and asserting the drained buffer
is empty reads like a direct test of the claim. It cannot fail: `showWarningsAsToast` opens its own
window (`enableBuffering()` RESETS the buffer) and closes it in a `finally` (`disableBuffering()`
EMPTIES it), so by the time the outer window is drained there is nothing in it whatever the product
did. Proved by mutation — a version that re-pushed every drained warning back into the buffer left
that assertion green.

The falsifiable form asks the FRAME instead, which is the only surface that can carry the claim
after the mount: the toast's short line must be readable, and the warning's own long text — the
string the band paints — must appear nowhere in it. That version reddens when the toast is changed
to carry the warning text verbatim, which is also the change that would break the frame's width.

**The general rule this instance teaches: when the two channels share a process-wide mechanism, an
assertion about the channel NOT taken is usually vacuous, because the mechanism has been reset by
the time the test reads it.** Assert on the rendered artefact, and prove the assertion can fail
before trusting it.

## Proposed Standard

Add to CLAUDE.md's "Test Assertions" NEVER list, beside the refusal/allowed pair rule it generalises:

> NEVER pin which CHANNEL a message takes without pinning, in the same file, a state where the same
> message takes the OTHER channel. A message has one destination, so an assertion that it arrived
> says nothing about the channel it stopped arriving on, and the two channels usually leave identical
> state behind — the same store field set, the same exit code, the same files on disk. This is the
> refusal/allowed pair rule applied to routing rather than to permission, and it bites hardest where
> one shared action serves both channels: the tempting fix is to push the routing down into the
> action, which is precisely the change only the other direction's test can see. Where the channels
> are a process-wide buffer and a UI surface, note that `enableBuffering()` resets rather than nests,
> so a window opened inside a shared action discards what an outer window had already collected.
> `stack-selection.test.tsx` holds the shape: tests on the mid-session toast, one on the pre-mount
> band, and a mutation that reddens exactly one group at a time. Assert the NOT-taken channel on
> the rendered artefact rather than on the shared mechanism — a buffer both channels reset is
> empty by the time a test reads it, so that form of the assertion cannot fail.

This does not conflict with any existing NEVER/ALWAYS rule — it extends the pair rule in the same
section, and the extension is the direction that rule's own wording does not cover.

The census is one pair, not a survey: `showWarningsAsToast` is the only channel-routing helper in
the store today. The worklist for anyone widening this is every call site of the logger's buffering
window, since each one is a channel boundary of the same kind:

```
grep -rn 'enableBuffering()' src e2e --include='*.ts' --include='*.tsx'
```
