---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/vite.config.ts
  - apps/editor/scripts/first-paint-budget.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-08-26
reporting_agent: web-developer
category: performance
domain: web
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The new `compile` group in `apps/editor/vite.config.ts` was moved BELOW `catalog`
  (priority 5 against 10) so the catalogue is claimed first and the group is left holding
  `packages/compile` alone. Measured either way with `FIRST_PAINT_BUDGET_BYTES` temporarily
  at zero: 533.8 KB gzipped with the group at priority 20, 331.4 KB with it at 5. The
  comment above the group now states the ordering as the reason it exists rather than as a
  detail of where it sits.
---

## What Was Wrong

`apps/editor/vite.config.ts` splits the bundle with `CHUNK_GROUPS`, and its own docblock already
records the rule that matters — **"a group captures its matches' dependencies as well as its
matches"** — with the case that produced it: `vendor` outranks `catalog` so that the catalogue's
chunk does not swallow zod.

Adding a group for `packages/compile` at priority 20 — above `catalog` at 10, and read at the time
as "after the vendor groups, before the leftovers" — reproduced that failure in the opposite
direction and with a much larger blast radius. `packages/compile` depends on `@workspace/matrix`,
which the app loads eagerly, so the group claimed the catalogue too. One chunk then held both, the
eager half made the whole chunk statically reachable from the entry, and the 226 KB gzipped
vendored agent corpus — reached in source through nothing but `import()` — arrived on the
first-paint path with it:

```
Error: First paint is 533.8 KB gzipped, 203.8 KB over the 330.0 KB budget.
  assets/compile-D-g9yp1s.js — 225.9 KB
  ...
  assets/vendor~preview-Dq_xCOFe.js — 22.0 KB
```

**Every source-level check was green while this was true.** `output-preview-dialog.test.ts` traps a
static import of the corpus and passed; a grep of the app for `@workspace/compile` finds it in one
lazily-imported module and nowhere else; the corpus is behind a second `import()` inside even that.
Nothing about the SOURCE was wrong — the laziness was undone downstream, by a number in a config
file, and the only thing that reported it is the budget plugin, which does not name a cause.

The existing docblock is what makes this worth a row rather than a mistake: the rule was written
down, in the file being edited, and it still did not transfer. It is stated as a fact about
`vendor` and `catalog` — a pair whose relative order the reader is asked to preserve — rather than
as a constraint every new group has to be placed against.

## Fix Applied

The group moved below `catalog`, and its comment was rewritten to lead with the ordering and the
two measurements rather than with what the group holds. Both readings are recorded there, because
the second number is meaningless without the first.

A second consequence surfaced while measuring and was fixed in the same pass: with the corpus off
the path the build read 331.4 KB against a 330 KB budget, and stripping the phase's three static
additions read **329.5 KB** — so the feature is +1.9 KB and the previous ceiling had 0.5 KB of room
rather than the ~6% its own comment claimed. The budget moved to 352 KB with all three figures and
the split between them written into the docblock.

## Proposed Standard

**For `apps/editor/vite.config.ts`'s own `CHUNK_GROUPS` docblock** — state the placement rule as a
question every new group must answer, rather than as a fact about the two groups that first needed
it:

> A group claims its matches' DEPENDENCIES as well as its matches. Before adding one, name what its
> matches depend on and check that a group above it already claims anything on the first-paint path
> — otherwise the new chunk inherits that reachability and everything in it becomes eager, however
> lazy the source is.

**No checker is proposed, and the reason is that one already exists and worked.**
`scripts/first-paint-budget.ts` caught this on the first build, refused it, and printed the
offending chunk at the top of its own itemised list. What it cannot do is say why, which is a
property of a budget rather than a gap in it. A second check that reasoned about group priorities
would be a second model of rolldown's chunking, and the cheaper answer is the sentence above plus
the plugin's existing instruction to read the itemised list.

**This does not conflict with any NEVER/ALWAYS rule in `packages/cli/CLAUDE.md`** — that file's
scope is the CLI package and this is `apps/editor` — nor with `.ai-docs/standards/editor-and-worker.md`,
which describes the editor's deployment shape and says nothing about chunking.

**The counts above are measurements, not samples**: each is one full `vite build` of the same tree
with one line changed, taken with the budget temporarily at zero so the plugin always prints. Both
runtimes agreed on every figure this session, which is itself a change from the ~2% Bun/Node
disagreement the budget's docblock recorded on 2026-08-21.
