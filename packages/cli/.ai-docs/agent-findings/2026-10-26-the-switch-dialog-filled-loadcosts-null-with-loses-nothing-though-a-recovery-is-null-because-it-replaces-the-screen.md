---
type: anti-pattern
severity: low
affected_files:
  - apps/editor/src/features/configure/components/marketplace-switch-dialog.tsx
  - apps/editor/src/features/configure/lib/marketplace-switch.ts
standards_docs:
  - packages/cli/.ai-docs/standards/editor-and-worker.md
date: 2026-10-26
reporting_agent: web-developer
category: architecture
domain: web
root_cause: missing-rule
status: partial
partial_note: >-
  Code side landed: the switch dialog words a switch that finishes a parked recovery itself and
  no longer says "loses nothing" there. The standards sentence the Proposed Standard asks for is
  pending.
---

## What Was Wrong

`loadCost` in `marketplace-switch.ts` returns `null` for "nothing to say before this load", and it
does so for three different reasons: another marketplace with nothing selected, a re-read that drops
nothing, and a `recovery` landing. The Marketplace dialog reads that `null` as "load at once". The
switch dialog put a claim in its place instead, `?? losesNothing(marketplace)`. That claim holds for
the first two reasons and is false for the third: what was parked (a link, a saved stack, a restore)
replaces the screen, and a link's picks are saved nowhere. (EDITOR-100)

Census, run 2026-10-26 from the repository root. It lists every caller that fills a `null` with a
computed value, including a fallback Prettier wrapped onto the next line (the switch dialog's own
was wrapped, so a single-line pattern missed it):

```
grep -rnE -A1 '\?\?( [a-z][A-Za-z]+\(|$)' apps/editor/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

It returned 14 matches in 8 files. Only the switch dialog turns a `null` into a sentence that claims
no loss. The rest fall back to a second check (`changeRefusal ?? refusalFor(...)` in the skill cell
and options panel, `problem ?? standingRefusal(...)` in the save-stack dialog), a lookup (output
preview and its dialog), a fresh entry (config store) or a computed flag (`isAgentOn`).

## Fix Applied

`marketplace-switch-dialog.tsx` asks whether the switch reaches the marketplace the recovery waits
on (`recovery?.marketplace === marketplace`, the rule `landingOf` applies first). If it does, the
dialog says the switch finishes what waited, which replaces what is on screen. `loadCost`'s `null`
for `recovery` is unchanged: the Marketplace dialog's one-press finish depends on it. The reds in
`apps/editor/e2e/specs/marketplace-switch.spec.ts` › "switching to the marketplace a parked link
waits on" and "… a parked stack waits on" catch a regression.

## Proposed Standard

`editor-and-worker.md` › "The store holds the refusal; the surface owns the words" gains one
sentence: a surface that words a `null` must first know why it is `null`. Where a `null` has more
than one reason, the surface branches on the reason, or the function returns it, before a fallback
sentence makes a claim. This sits inside that section's rule and does not conflict with CLAUDE.md.
