---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/scripts/spa-fallback-shell.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: missing-rule
status: open
---

## What Was Wrong

`spaFallbackShell()` in `apps/editor/scripts/spa-fallback-shell.ts` treats the parent of whatever
`build.outDir` resolves to as the upload root. Its `buildStart` removes every other entry there:
`staleSiblingsOf(outDir).forEach(remove)`, where `remove` is
`rmSync(path, { recursive: true, force: true })`. That is right for `dist/editor`, the configured
`outDir`, whose parent `dist` is uploaded whole. A caller-supplied `--outDir` gets the same
treatment, and nothing warns.

Measured on 2026-10-22, run from `apps/editor`:

```
npx vite build --outDir <scratchpad>/a1/build --emptyOutDir
```

It exited 0, and `<scratchpad>/a1/` then held only `build/` and the copied `index.html`. Every log,
screenshot and backup the lane had written beside it was gone. The same command with a relative
`--outDir build` resolves to `apps/editor/build`, whose siblings are `src/`, `e2e/`, `scripts/` and
`package.json`. A build to check the first-paint budget is the ordinary reason to pass `--outDir`.

## Fix Applied

None in that file, which is outside the reporting lane. The budget check was rerun with an out
directory whose parent holds nothing else (`<scratchpad>/a1-build/upload/editor`), and it exited 0.

## Proposed Standard

The plugin should refuse to remove anything outside the configured `dist`. Either sweep only when
`outputDirectory(config)` is the default `dist/editor`, or require the parent to be named `dist`,
and say so in the thrown message. Until then, `apps/editor/e2e/README.md` (or a `//build` note in
`apps/editor/package.json`) should state that `vite build --outDir X` deletes every sibling of `X`.
No CLAUDE.md rule conflicts.
