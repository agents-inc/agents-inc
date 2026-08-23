---
type: missing-standard
severity: medium
affected_files:
  - apps/editor/vite.config.ts
  - apps/editor/scripts/first-paint-budget.ts
  - apps/editor/src/main.tsx
  - apps/editor/src/lib/observability/report.ts
  - packages/cli/.ai-docs/standards/editor-and-worker.md
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-08-21
reporting_agent: web-developer
category: performance
domain: infra
root_cause: missing-rule
status: resolved
resolved_by: >-
  EDITOR-02. `apps/editor/vite.config.ts` now splits the bundle by rate of change and installs
  `scripts/first-paint-budget.ts`, a build plugin that fails `vite build` on two claims — the
  gzipped first-paint payload against a 330 KB budget, and no chunk mixing this repository's own source
  with a third-party dependency. Both were driven red before the fix and mutated red afterwards; the
  budget catches the un-lazying trap described below (377 KB against the budget's 330 KB). The
  standard is `.ai-docs/standards/editor-and-worker.md` -> "What a first-time visitor downloads is a
  claim the build checks". Two byte-reducing follow-ups named at the end of this file are deliberately
  NOT part of this resolution — they need files outside the lane that fixed this.
---

## What Was Wrong

Two things, and the second is the one worth keeping.

**Nothing in this repository could see what a visitor downloads.** The editor is a single HTML page,
so every byte of JavaScript it references is spent before anything is on screen. `tsc`, ESLint, both
Vitest suites and the Playwright run are equally green whether that is 90 KB or 1 MB — and the
Playwright suite is the one that looks like it would notice, except it drives a **dev server**, where
no chunking happens at all. The bundle had grown to a single 1.03 MB file (302 KB gzipped), plus one
227 KB lazily-loaded chunk, with no rule, check or measurement anywhere against it.

**And the obvious fix makes it worse in a way that reads as an improvement.** The first attempt at
manual chunking used the shape every bundler's documentation opens with:

```js
groups: [{ name: "vendor", test: /node_modules/ }];
```

A group like that captures a dependency reached **only** through `import()` and pulls it into the
static graph. Here that was `posthog-js`, which `src/lib/analytics/posthog.ts` loads dynamically
precisely so it cannot delay the first paint. The measured result: first paint went from 310.9 KB
gzipped to 377.1 KB — 21% worse — while the build log read as a tidier list of chunks, the app
behaved identically, every existing gate stayed green, and the change would have been reviewed as
"code-split the bundle, as EDITOR-02 asked".

The mechanism is not specific to this bundler. **A manual chunking rule is a claim about where
modules go, and it silently overrides the developer's claim about WHEN they load.** Rolldown's
`entriesAware: true` is what restores the boundary — it groups modules by which entry actually
reaches them — and rollup's `manualChunks` has the same trap with no equivalent switch.

The related trap in the same family, found in the same pass: a group also captures its matches'
**dependencies** (`includeDependenciesRecursively`, on by default), so the group order decides who
owns a shared library. The catalogue group outranked the vendor group at first and swallowed zod —
18 KB of a library that never changes, filed inside the chunk that is regenerated every time the
skills marketplace is.

## Fix Applied

`apps/editor/scripts/first-paint-budget.ts`, installed by `vite.config.ts`, fails the build on two
claims about the emitted bundle:

1. the gzipped first-paint payload — entry chunk, its transitive static imports, every stylesheet —
   against a budget recorded from a measurement;
2. no emitted chunk containing both a first-party file and a `node_modules` module, which is the
   caching property stated against the artefact rather than against the config meant to produce it.

Claim 2 was written first and watched fail against the unsplit bundle. Claim 1 was mutated red twice
afterwards: once by lowering the budget, and once by removing `entriesAware`, which reproduced the
un-lazying above and printed 377.1 KB against the 330 KB budget. The chunk groups then landed, and
the built bundle was served with `vite preview` and driven in a real browser — the grid renders, a
stack selection and the install dialog work, the console is silent, and the network log shows the
seven first-paint chunks fetched and the posthog chunk not fetched.

Measured before and after, both gzipped, on 2026-08-21:

|                                        |                      before |                          after |
| -------------------------------------- | --------------------------: | -----------------------------: |
| first paint                            | 310.9 KB (one 1.03 MB file) | 311.5 KB across 7 chunks + CSS |
| re-downloaded after an app-source edit |                    302.1 KB |                        29.8 KB |
| lazily loaded (posthog)                |                     74.5 KB |                        74.5 KB |

Cold first paint pays 0.6 KB for the arrangement — the cost of compressing seven streams instead of
one — and a returning visitor after an ordinary deploy pays 10% of what they did.

## Proposed Standard

Written, as `.ai-docs/standards/editor-and-worker.md` -> "What a first-time visitor downloads is a
claim the build checks, not a number someone remembers". The generalisable half of it:

**A property that only exists in a build artefact has to be asserted inside the build.** No test
suite in this repository runs against `dist/`; the one suite that drives a browser drives a dev
server. `apps/editor/scripts/check-deployable-bundle.ts` already established the pattern for the
deploy step, and this is the same idea moved one step earlier, to where a regression is introduced
rather than to where it ships.

**Prefer one number over the whole payload to a list of per-dependency assertions.** The defect has
one shape — weight that is not needed for the first paint ends up on the first-paint path — and many
spellings. A budget catches the spellings nobody predicted, including the one in this finding.

### Two follow-ups this finding does not resolve

Both would cut real bytes and both need files the lane that wrote this could not touch:

1. **Sentry is 28.5 KB gzipped of the first-paint payload, and it is only there because
   `src/main.tsx` imports it statically.** A dynamic import would move it off the path entirely.
   What blocks it is `src/lib/observability/report.ts`: its sink is a mutable variable with no
   queue, so every `reportIssue`/`reportError` raised before Sentry's chunk resolves — the
   `ErrorBoundary`'s `componentDidCatch` above all, which is exactly the case the eager import
   exists for — would be dropped in silence. **The change needed is a buffering default sink in
   `report.ts` that queues and replays into whatever `setReportingSink` installs next.** With that,
   deferring the import loses nothing.
2. **The dialogs are behind a click and their Base UI dependency is not.** `@base-ui/react` is
   ~120 KB raw in the first-paint graph because `features/configure/components/configure-screen.tsx`
   imports the dialog components statically. `lazy()` on the dialogs would move it and a slice of
   the app chunk with it. No chunking rule can do this — a static import is a static import.
