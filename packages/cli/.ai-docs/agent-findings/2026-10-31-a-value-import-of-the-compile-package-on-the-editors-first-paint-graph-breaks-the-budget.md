---
type: standard-gap
severity: low
affected_files:
  - apps/editor/src/features/configure/lib/agent-switches.ts
  - apps/editor/src/features/configure/lib/provider.ts
  - apps/editor/vite.config.ts
  - apps/editor/scripts/first-paint-budget.ts
  - apps/editor/scripts/spa-fallback-shell.ts
standards_docs:
  - packages/cli/.ai-docs/agent-findings/2026-10-31-a-helper-the-compile-barrel-did-not-export-was-copied-into-the-cli-instead.md
date: 2026-10-31
reporting_agent: web-developer
category: architecture
domain: web
root_cause: rule-not-visible
status: open
---

## What Was Wrong

A tracker row told the editor to replace `agent-switches.ts`'s private `inAnEnglishList` with the
one `@workspace/compile` exports, following the proposed standard of
`2026-10-31-a-helper-the-compile-barrel-did-not-export-was-copied-into-the-cli-instead` ("reached by
exporting it, never by copying it"). That standard does not hold on the editor's first-paint graph.
`agent-switches.ts` is statically imported by `src/stores/config-store.ts`, and `vite.config.ts`
puts every module under `packages/compile/` in one `compile` chunk, so any value import from it
puts that chunk on first paint:

```
# agent-switches.ts: import { inAnEnglishList, type Provider } from "@workspace/compile"
bunx vite build    # in apps/editor, 2026-10-31
Error: First paint is 513.0 KB gzipped, 161.0 KB over the 352.0 KB budget.
  assets/compile-Mu4A4Uj5.js — 126.9 KB
```

A chunk group for `packages/compile/src/string.ts` alone did not help (still 513.2 KB, because the
barrel brings the rest). Only a subpath import (`@workspace/compile/string`, which
`packages/compile/package.json` does not export) plus that group kept first paint as it was. The
rule is stated only in a comment at the top of `provider.ts` and in the `compile` group's comment in
`vite.config.ts`, and neither is visible from a sibling module that is also on first paint.

How it shows up: a plain `vite build` does not print the budget error. `spa-fallback-shell`'s
`closeBundle` runs after the failed `generateBundle` and throws `no index.html at …`, which is the
only error shown. The budget message appeared only once that plugin was filtered out.

## Fix Applied

None for the shared helper: `agent-switches.ts` keeps its copy. `provider.ts`'s "or" join is
renamed `inAnEnglishAlternative`, so the two editor helpers no longer share a name.

## Proposed Standard

The earlier finding's standard gets one exception: an editor module on first paint reaches a
`@workspace/compile` value only through a subpath export that has its own chunk group in
`vite.config.ts`, and otherwise keeps a local copy. Census of first-paint value imports, which
should list only lazily loaded modules (on 2026-10-31 it listed only `output-preview.ts`):
`grep -rn 'from "@workspace/compile' apps/editor/src --include='*.ts' --include='*.tsx' | grep -v 'import type' | grep -v '\.test\.'`
(a multi-line import shows only its closing `} from` line, type-only or not, so read each hit's
opening line). The budget itself is the
gate. It reports the problem only if `spa-fallback-shell` stops masking it.
