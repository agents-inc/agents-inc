---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/scripts/first-paint-budget.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-08-26
reporting_agent: web-developer
category: performance
domain: web
root_cause: missing-rule
status: resolved
resolved_by: >-
  `FIRST_PAINT_BUDGET_BYTES` in `apps/editor/scripts/first-paint-budget.ts` is 336 KiB,
  4.4 KB over a re-derived 331.6 KB. The docblock now carries all three measurements, the
  runtimes that produced them, and the reason the margin is sized against the change rather
  than as a fraction of the payload.
---

## What Was Wrong

`apps/editor/scripts/first-paint-budget.ts` opens by naming the one defect it exists to catch —
_"something that is not needed for the first paint ends up on the first-paint path"_ — and cites the
case that proved it: a chunking rule that pulled `posthog-js` back onto the static graph, **74 KB**,
with every other check green.

The ceiling was then raised from 330 KiB to 352 KiB for a feature the same docblock measured at
+1.9 KB, on the stated ground of restoring _"~6% over the measurement above"_.

**Six percent of this payload is 19.9 KB, and 19.9 KB is a library.** Measured in the bundle the
budget guards, on 2026-08-26:

| chunk on the first-paint path | gzipped |
| ----------------------------- | ------- |
| `react`                       | 60.2 KB |
| `catalog`                     | 47.9 KB |
| `observability`               | 28.8 KB |

At 20 KB of slack, a dependency a third the size of the one the file's own header names as its
worked example arrives green. That is the gate's binding property spent on headroom.

The general shape is the part worth keeping: **a margin expressed as a fraction of the measurement
grows with the thing it constrains.** Every legitimate addition raises the payload, which raises the
absolute slack, which raises how much can arrive unnoticed next time — the opposite of what a
budget is for. A margin has to be sized against the change it must ADMIT (a component, a copy edit),
not against the total it is measuring.

The previous ceiling was wrong in the other direction and for the same reason: 330 KiB against a
329.5 KB payload left 0.5 KB, so a genuine 2 KB feature broke the build. Both readings came out of
choosing a percentage instead of asking what the gate must let through.

## Fix Applied

All three figures in the docblock were re-derived rather than carried forward, with
`FIRST_PAINT_BUDGET_BYTES` temporarily set to zero so the plugin prints the payload it measured:

| reading                                                                                                                                | gzipped      |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| the bundle as it stands                                                                                                                | **331.6 KB** |
| the same bundle with the preview's three static additions stripped — its dialog, its entry point in the roster footer, its chunk group | **329.5 KB** |
| so the output preview's own static cost                                                                                                | **+2.1 KB**  |

`bun run build` and `npx vite build` returned the same figure for the same bytes, which is the
property the 2026-08-21 reading did not have (304.4 KB under Bun against 311.5 KB under Node), and
329.5 KB reproduces the earlier measurement of the stripped tree exactly. The `+1.9 KB` in the old
docblock is now `+2.1 KB` because this pass added ~0.2 KB to the dialog itself.

The ceiling is **336 KiB** — 4.4 KB over the measurement. The number is chosen against the two
things the margin has to do at once: it is twice the entire preview feature's static cost, so
ordinary component work does not fail a build, and it is smaller than any dependency worth the name,
so nothing can arrive unnoticed.

The 352 KB reading is recorded in
`2026-08-26-a-chunk-group-ranked-above-the-catalogue-swallows-it-and-lands-a-lazy-chunk-on-first-paint.md`,
which is where the measurement was first taken and is a different defect — that finding's subject is
the chunk group, and the budget move is noted there as a consequence.

## Proposed Standard

For `editor-and-worker.md`, beside the budget's own description:

> **A budget's margin is stated in bytes and justified against the change it must admit, never as a
> percentage of the payload.** Write down what the margin is twice the size of. A percentage grows
> with the number it guards, so a payload that doubles doubles what can arrive unnoticed — and it
> reads as principled while doing it.
>
> Raising the ceiling is allowed and expected. What is not allowed is raising it without the
> measurement beside it: run the build with the budget temporarily at zero, paste the figure the
> plugin prints, and name the runtime that produced it.

No checker is proposed and one would be circular — a gate on the gate's own constant can only
compare it to a number someone else chose. The enforcement that exists is the docblock's requirement
to show the measurement, which a reviewer can check by running one build.
