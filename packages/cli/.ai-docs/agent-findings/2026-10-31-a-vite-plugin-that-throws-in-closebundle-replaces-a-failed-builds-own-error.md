---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/scripts/spa-fallback-shell.ts
  - apps/editor/scripts/spa-fallback-shell.test.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-31
reporting_agent: web-developer
category: architecture
domain: infra
root_cause: missing-rule
status: resolved
resolved_by: >-
  spa-fallback-shell copies the shell in `writeBundle`, which runs only after a successful write;
  spa-fallback-shell.test.ts builds a stand-in budget failure and asserts its error survives.
---

## What Was Wrong

`spa-fallback-shell` copied `index.html` in `closeBundle` and threw when it was missing. When
`vite build` failed in `generateBundle` (the first-paint budget), the only error printed was
"spa-fallback-shell: no index.html at …": Vite 8.2 calls `bundle.close()` in a `finally`
(`buildEnvironment` in `vite/dist/node/chunks/node.js`), so the `closeBundle` throw replaced the
error already in flight.

Checking the hook's `error` argument does not fix it. A probe build per failure kind (Vite 8.2.0,
rolldown 1.2.1) recorded which hooks ran:

```
generateBundle: buildEnd(none), closeBundle(none) -> Error: Build failed with 1 error:
transform: buildEnd(error), closeBundle(error), closeBundle(none) -> Error: Build failed with 1 error:
renderChunk: buildEnd(none), renderError(error), closeBundle(none) -> Error: Build failed with 1 error:
none: buildEnd(none), writeBundle, closeBundle(none) -> ok
```

A `generateBundle` failure reaches no hook with its error, and a transform failure calls
`closeBundle` a second time without it. Only `writeBundle` separates success from every failure.

## Fix Applied

The copy moved from `closeBundle` to `writeBundle`, unchanged otherwise, so a successful build with
no `index.html` still fails. `apps/editor/scripts/spa-fallback-shell.test.ts` runs real `vite build`s:
a stand-in `generateBundle` failure keeps its own message and copies nothing (red on the old hook),
and a JS-entry build that writes no `index.html` still fails with the plugin's error. The editor's
vitest config collects only `src/**/*.test.ts`, so the editor test gate does not yet run this file.

## Proposed Standard

In `.ai-docs/standards/editor-and-worker.md`, beside "What a first-time visitor downloads is a claim
the build checks": a build plugin that throws to fail the build does so in a hook that runs only on
the path it judges (`generateBundle` for output, `writeBundle` for written files), never in
`closeBundle`, which also runs after a failed build. No conflict with CLAUDE.md found.
